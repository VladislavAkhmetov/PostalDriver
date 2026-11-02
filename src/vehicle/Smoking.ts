import * as THREE from 'three';
import { clamp } from '../core/math';
import { paint } from '../core/textures';
import type { Hands } from './Hands';

/**
 * Smoking, as a driver of 1997 would: take the pack off the dash, bring it up to the face, pull a
 * cigarette out with the lips, put the pack back, take the lighter, bring the flame to the tip
 * and draw three short puffs to get it going, then carry on driving with it in the mouth, now and
 * then taking it out between two fingers for a long drag and a slow breath out. When it burns
 * down it is stubbed out in the tin on the dash.
 *
 * Packs are styled after the period's brands by colour and layout only — no names or logos.
 */
export type BrandId = 'prima' | 'belomor' | 'petr' | 'magna' | 'opal' | 'nord';

interface Brand {
  /** Hard pack size (m): width, height, depth. */
  size: [number, number, number];
  filter: boolean;
  /** A folded cardboard mouthpiece instead of a filter. */
  papirosa: boolean;
  /** Seconds a cigarette lasts. */
  burn: number;
  front: (g: CanvasRenderingContext2D, w: number, h: number) => void;
}

const BRANDS: Record<BrandId, Brand> = {
  // wide soft red pack with a broad white band across
  prima: { size: [0.064, 0.092, 0.024], filter: false, papirosa: false, burn: 110, front: (g, w, h) => {
    g.fillStyle = '#c42a24'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2efe4'; g.fillRect(0, h * 0.36, w, h * 0.28);
    g.fillStyle = '#c42a24'; g.fillRect(w * 0.36, h * 0.42, w * 0.28, h * 0.16);
    g.fillStyle = '#7a1612'; g.fillRect(0, h * 0.9, w, h * 0.1);
  } },
  // slim pale-blue pack for papirosas, white label and a wavy canal underneath
  belomor: { size: [0.052, 0.104, 0.022], filter: false, papirosa: true, burn: 130, front: (g, w, h) => {
    g.fillStyle = '#84bde4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f4ee'; g.fillRect(w * 0.1, h * 0.12, w * 0.8, h * 0.34);
    g.fillStyle = '#2d5f93'; g.fillRect(w * 0.18, h * 0.2, w * 0.64, h * 0.05); g.fillRect(w * 0.18, h * 0.32, w * 0.64, h * 0.03);
    g.strokeStyle = '#f4f4ee'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, h * (0.62 + i * 0.07) + Math.sin(x * 0.4 + i) * 2); g.stroke(); }
  } },
  // black pack with gold crest and border — a filter cigarette
  petr: { size: [0.056, 0.088, 0.022], filter: true, papirosa: false, burn: 150, front: (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a24a'; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#c9a24a'; g.beginPath(); g.moveTo(w / 2, h * 0.22); g.lineTo(w * 0.72, h * 0.42); g.lineTo(w / 2, h * 0.62); g.lineTo(w * 0.28, h * 0.42); g.closePath(); g.fill();
    g.fillStyle = '#141414'; g.beginPath(); g.moveTo(w / 2, h * 0.3); g.lineTo(w * 0.6, h * 0.42); g.lineTo(w / 2, h * 0.54); g.lineTo(w * 0.4, h * 0.42); g.closePath(); g.fill();
    g.fillStyle = '#c9a24a'; g.fillRect(w * 0.2, h * 0.76, w * 0.6, 3);
  } },
  // red pack with a silver band — filter
  magna: { size: [0.056, 0.088, 0.022], filter: true, papirosa: false, burn: 150, front: (g, w, h) => {
    g.fillStyle = '#b01c24'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d6d8da'; g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.34); g.lineTo(w, h * 0.5); g.lineTo(0, h * 0.66); g.closePath(); g.fill();
    g.fillStyle = '#f2f0e8'; g.fillRect(0, h * 0.84, w, h * 0.16);
  } },
  // pale grey pack with an orange stripe
  opal: { size: [0.056, 0.088, 0.022], filter: true, papirosa: false, burn: 150, front: (g, w, h) => {
    g.fillStyle = '#d9dde0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3a66'; g.fillRect(0, 0, w, h * 0.2);
    g.fillStyle = '#e07a1c'; g.fillRect(0, h * 0.68, w, h * 0.14);
  } },
  // deep blue pack with a white wave — filter
  nord: { size: [0.056, 0.088, 0.022], filter: true, papirosa: false, burn: 150, front: (g, w, h) => {
    g.fillStyle = '#1e3a78'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2ec'; g.lineWidth = 3;
    g.beginPath(); for (let x = 0; x <= w; x += 3) g.lineTo(x, h * 0.45 + Math.sin(x * 0.28) * 4); g.stroke();
    g.fillStyle = '#c42a24'; g.fillRect(w * 0.1, h * 0.8, w * 0.8, 3);
  } },
};
export const BRAND_IDS = Object.keys(BRANDS) as BrandId[];

const skinLeaf = new THREE.MeshLambertMaterial({ color: '#f0ece0' });
const FILTER = new THREE.MeshLambertMaterial({ color: '#c9a05e' });
const CARD = new THREE.MeshLambertMaterial({ color: '#e9e5d6' });
const ASH = new THREE.MeshLambertMaterial({ color: '#9a9690' });

/** A cigarette along +Y: the mouth end at the origin, the lit end at the far end. */
class Cigarette {
  readonly group = new THREE.Group();
  private paper: THREE.Mesh;
  private ash: THREE.Mesh;
  readonly ember: THREE.Mesh;
  private readonly tail: number;
  private readonly full: number;
  /** Where the lit tip is, along +Y (shrinks as it burns). */
  length = 0;

  constructor(brand: Brand) {
    const r = 0.0039;
    this.tail = brand.filter ? 0.026 : brand.papirosa ? 0.05 : 0;
    const body = brand.papirosa ? 0.05 : brand.filter ? 0.058 : 0.074;
    this.full = this.tail + body;
    if (this.tail > 0) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, this.tail, 8), brand.filter ? FILTER : CARD);
      t.position.y = this.tail / 2;
      // a papirosa's cardboard tube is pinched flat
      if (brand.papirosa) t.scale.set(1.25, 1, 0.55);
      this.group.add(t);
    }
    this.paper = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), skinLeaf);
    this.paper.geometry.translate(0, 0.5, 0);
    this.paper.position.y = this.tail;
    this.paper.scale.y = body;
    this.group.add(this.paper);
    this.ash = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.007, 8), ASH);
    this.ash.visible = false;
    this.group.add(this.ash);
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff7a2a' }));
    this.ember.visible = false;
    this.group.add(this.ember);
    this.setBurn(0);
  }

  /** 0 = fresh … 1 = down to the stub. */
  setBurn(f: number): void {
    const body = (this.full - this.tail) * (1 - 0.8 * clamp(f, 0, 1));
    this.paper.scale.y = Math.max(0.004, body);
    this.length = this.tail + body;
    this.ash.position.y = this.length + 0.003;
    this.ember.position.y = this.length + 0.0025;
  }

  light(on: boolean): void { this.ember.visible = on; this.ash.visible = on; }

  get fullLength(): number { return this.full; }
}

/**
 * Smoke in the cab's own frame, so it hangs in the cab and rides with it. Wisps rather than balls:
 * each sprite is a ragged cloud turned at random and slowly spinning, thin where it leaves the tip
 * and opening out as it cools. A draft from the cracked driver's window pulls it across and out,
 * harder at speed; it thins to nothing before the windscreen, and right in front of the eyes, so it
 * never lies over the glass like mist.
 */
class CabSmoke {
  private pool: { s: THREE.Sprite; v: THREE.Vector3; age: number; life: number; s0: number; s1: number; op: number; spin: number; glass: boolean }[] = [];
  private next = 0;
  /** Cabin-space push toward the open window, m/s. */
  readonly draft = new THREE.Vector3(-0.05, 0, 0.02);
  /** The eyes, cabin space: smoke fades out as it gets close to them. */
  readonly eye = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    const texs = [0, 1, 2].map((k) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      // a handful of soft lobes off-centre: a ragged wisp, different in each of the three
      let seed = 7 + k * 31;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 9; i++) {
        const x = 32 + (rnd() - 0.5) * 26, y = 32 + (rnd() - 0.5) * 26, r = 9 + rnd() * 14;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.32)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
    for (let i = 0; i < 72; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false, opacity: 0, color: '#d8d8d4', fog: false }));
      s.visible = false;
      s.renderOrder = 6;
      parent.add(s);
      this.pool.push({ s, v: new THREE.Vector3(), age: 9, life: 1, s0: 0.02, s1: 0.1, op: 0.3, spin: 0, glass: true });
    }
  }

  /** `color`: bluish for the side stream off the tip, whiter for breath; `glass: false` lets it reach the dash (the ashtray). */
  puff(p: THREE.Vector3, v: THREE.Vector3, s0: number, s1: number, life: number, op: number, color = '#d8d8d4', glass = true): void {
    const q = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    q.s.position.copy(p);
    q.v.copy(v);
    q.age = 0; q.life = life; q.s0 = s0; q.s1 = s1; q.op = op; q.glass = glass;
    q.spin = (Math.random() - 0.5) * 0.9;
    const m = q.s.material as THREE.SpriteMaterial;
    m.color.set(color);
    m.rotation = Math.random() * Math.PI * 2;
    m.opacity = 0;
    q.s.visible = true;
  }

  update(dt: number): void {
    for (const q of this.pool) {
      if (!q.s.visible) continue;
      q.age += dt;
      if (q.age >= q.life) { q.s.visible = false; continue; }
      const k = q.age / q.life;
      const p = q.s.position;
      // warm smoke climbs, curls and slows as it spreads; the draft takes over as it cools
      p.addScaledVector(q.v, dt).addScaledVector(this.draft, dt * Math.min(1, k * 2.5));
      q.v.x += Math.sin(q.age * 4.3 + q.spin * 20) * 0.03 * dt;
      q.v.z += Math.cos(q.age * 3.7 + q.spin * 13) * 0.02 * dt;
      q.v.multiplyScalar(Math.exp(-1.1 * dt));
      q.v.y += 0.02 * dt;
      const m = q.s.material as THREE.SpriteMaterial;
      m.rotation += q.spin * dt;
      q.s.scale.setScalar(q.s0 + (q.s1 - q.s0) * Math.sqrt(k));
      // gone before the windscreen and out at the window; never a haze over the eyes
      const glass = q.glass ? 1 - smooth(-1.44, -1.58, p.z) : 1;
      const out = 1 - smooth(-0.74, -0.86, p.x);
      const near = smooth(0.05, 0.14, p.distanceTo(this.eye));
      m.opacity = q.op * Math.min(1, k * 7) * (1 - k) * (1 - k * 0.4) * glass * out * near;
    }
  }
}

/** 0 at `a`, 1 at `b` (either way round), smooth in between. */
function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** How a cigarette hangs from the corner of the mouth, in the head's frame: forward, a little down and to the right. */
const CIG_IN_MOUTH = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.4, -0.13, -0.9).normalize());
/** The lips, in the head's frame (eyes at the origin, looking down -Z). */
const MOUTH = new THREE.Vector3(0.026, -0.058, -0.056);
const SIDE_SMOKE = '#c4cad0', BREATH = '#dedcd8';

type SmokeState = 'idle' | 'taking' | 'lighting' | 'smoking' | 'stubbing';
export type SmokeSfx = 'pack' | 'flick' | 'flame' | 'puff' | 'exhale' | 'stub';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _hq = new THREE.Quaternion(), _he = new THREE.Euler(0, 0, 0, 'YXZ'), _q0 = new THREE.Quaternion();

export class Smoker {
  state: SmokeState = 'idle';
  onSfx?: (s: SmokeSfx) => void;
  onToast?: (text: string) => void;
  private brand: BrandId;
  private left = 20;
  readonly pack = new THREE.Mesh();
  readonly lighter = new THREE.Group();
  readonly ashtray = new THREE.Group();
  private flame = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.022, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
  private flameLight = new THREE.PointLight('#ff9a4a', 0, 0.9, 2);
  private emberLight = new THREE.PointLight('#ff6a24', 0, 0.45, 2);
  private cig: Cigarette;
  private cigAnchor = new THREE.Group();
  private smoke: CabSmoke;
  /** The lips, in cabin space, as the head is turned now (see `follow`). */
  private readonly mouth = new THREE.Vector3();
  /** The player's head (the camera's parent); without it the mouth stays where the eyes rest. */
  private head: THREE.Object3D | null = null;
  private readonly eye: THREE.Vector3;
  /** Speed of the van, km/h: the draft from the cracked window pulls harder. */
  speed = 0;
  private burnT = 0;
  private burnTotal = 120;
  private glow = 0;
  private glowGoal = 0.35;
  private nextDrag = 14;
  private idleT = 0;
  private seq = 0;
  private packOnDash = new THREE.Vector3();
  private packRot = new THREE.Euler(-Math.PI / 2, 0, 0.35);
  private lighterOnDash = new THREE.Vector3();
  private ashPos = new THREE.Vector3();
  private cigTravel: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; done: () => void } | null = null;
  private dragging = false;

  constructor(private parent: THREE.Object3D, private hands: Hands, eye: THREE.Vector3, dashY: number) {
    this.brand = BRAND_IDS[Math.floor(Math.random() * BRAND_IDS.length)];
    this.eye = eye.clone();
    this.packOnDash.set(-0.01, dashY + 0.012, -1.705);
    this.lighterOnDash.set(0.085, dashY + 0.006, -1.7);
    this.ashPos.set(-0.13, dashY + 0.01, -1.715);
    this.buildPack();
    this.buildLighter();
    this.buildAshtray();
    this.cig = new Cigarette(BRANDS[this.brand]);
    this.cig.group.visible = false;
    parent.add(this.cigAnchor);
    this.smoke = new CabSmoke(parent);
    this.placeMouth();
    this.flame.visible = false;
    this.lighter.add(this.flame);
    this.flame.position.set(0, 0.05, 0);
    parent.add(this.flameLight, this.emberLight);
    this.setCigarette(BRANDS[this.brand]);
  }

  /**
   * Hang the cigarette from the head rather than the cab: it turns with the look, as it would in
   * the lips, and its lit end stays in sight at the bottom of the view.
   */
  follow(head: THREE.Object3D): void { this.head = head; this.placeMouth(); }

  private placeMouth(): void {
    const h = this.head;
    // the head turns further than the neck would carry the lips; reaching hands follow the lips
    if (h) _he.set(clamp(h.rotation.x, -0.9, 0.45), clamp(h.rotation.y, -1.4, 1.4), h.rotation.z * 0.5, 'YXZ');
    else _he.set(-0.25, 0, 0, 'YXZ');
    _hq.setFromEuler(_he);
    this.mouth.copy(MOUTH).applyQuaternion(_hq).add(h ? h.position : this.eye);
    this.smoke.eye.copy(h ? h.position : this.eye);
    this.cigAnchor.position.copy(this.mouth);
    this.cigAnchor.quaternion.copy(_hq).multiply(CIG_IN_MOUTH);
  }

  /** A point near the lips, offset in cabin space; for hand targets, so they follow the head. */
  private nearMouth(out: THREE.Vector3, x: number, y: number, z: number): () => THREE.Vector3 {
    return () => out.copy(this.mouth).add(_c.set(x, y, z));
  }

  // ---------------------------------------------------------------- props

  private buildPack(): void {
    const b = BRANDS[this.brand];
    const tex = paint(64, 96, (g, w, h) => b.front(g, w, h), { repeat: false });
    const side = new THREE.MeshLambertMaterial({ color: '#d8d4c4' });
    const foil = new THREE.MeshLambertMaterial({ color: '#c4c6c0' });
    const front = new THREE.MeshLambertMaterial({ map: tex });
    this.pack.geometry = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
    this.pack.material = [side, side, foil, side, front, front];
    this.pack.rotation.copy(this.packRot);
    this.pack.position.copy(this.packOnDash);
    this.parent.add(this.pack);
  }

  private buildLighter(): void {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.066, 0.011), new THREE.MeshLambertMaterial({ color: '#e0762a' }));
    body.position.y = 0.0;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.014, 0.011), new THREE.MeshLambertMaterial({ color: '#b8b8b2' }));
    top.position.y = 0.04;
    this.lighter.add(body, top);
    this.lighter.rotation.set(-Math.PI / 2, 0, -0.6);
    this.lighter.position.copy(this.lighterOnDash);
    this.parent.add(this.lighter);
  }

  private buildAshtray(): void {
    // a sprat tin cut open and nailed to the dash
    const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.02, 14), new THREE.MeshLambertMaterial({ color: '#8c8a84' }));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 14), new THREE.MeshLambertMaterial({ color: '#2a2724' }));
    inner.position.y = 0.01;
    this.ashtray.add(tin, inner);
    // a couple of old butts
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0033, 0.0033, 0.014, 6), i % 2 ? CARD : FILTER);
      b.position.set((i - 1) * 0.011, 0.016, (i % 2 ? 0.008 : -0.006));
      b.rotation.set(Math.PI / 2, 0, i * 1.1);
      this.ashtray.add(b);
    }
    this.ashtray.position.copy(this.ashPos);
    this.parent.add(this.ashtray);
  }

  private setCigarette(b: Brand): void {
    this.cigAnchor.remove(this.cig.group);
    this.cig = new Cigarette(b);
    this.cig.group.visible = false;
    this.cigAnchor.add(this.cig.group);
    this.burnTotal = b.burn;
  }

  get hotspotObject(): THREE.Object3D { return this.pack; }

  /** The brand of the pack on the dash now, for the hint. */
  get brandId(): BrandId { return this.brand; }
  get cigarettesLeft(): number { return this.left; }

  // ---------------------------------------------------------------- the routine

  /** The player pressed the smoke key. */
  press(): void {
    if (this.state === 'idle') { this.onToast?.(this.left > 0 ? 'Достаю сигарету…' : 'Пачка пуста — достаю новую'); this.start(); }
    else if (this.state === 'smoking' && !this.hands.busy('R') && !this.dragging) { this.onToast?.('Затяжка'); this.drag(); }
    else if (this.state === 'smoking') this.onToast?.('Сигарета уже в деле');
    // a new one is wanted while the old one is going out: take it as soon as the hand is free
    else if (this.state === 'stubbing') { this.again = true; this.onToast?.('Сейчас потушу и достану новую'); }
  }

  /** The stub key: put the cigarette out in the ashtray now, whatever the hand is doing. */
  extinguish(): void {
    if (this.state === 'smoking') {
      this.onToast?.('Туши окурок');
      this.seq++;
      this.dragging = false;
      if (this.cig.group.parent !== this.cigAnchor) this.cigToMouth();
      this.stubOut();
    } else if (this.state === 'stubbing') this.onToast?.('Уже тушу');
    else this.onToast?.('Нечего тушить');
  }

  /** Canceled mid-way (a gear change took the hand): put things back and carry on or give up. */
  private recover(): void {
    const id = ++this.seq;
    this.dragging = false;
    this.cigTravel = null;
    this.flameOff();
    if (this.pack.parent !== this.parent) this.dropPack();
    if (this.lighter.parent !== this.parent) this.dropLighter();
    this.showStub(false, BRANDS[this.brand]);
    if (this.state === 'stubbing') {
      this.cig.light(false); this.glow = 0;
      this.cig.group.visible = false; this.cig.group.removeFromParent(); this.cigAnchor.add(this.cig.group);
      this.finishStub();
    } else if (this.cig.group.visible) {
      // the cigarette is already in the lips: on to the lighter, or smoke on if it is lit
      this.cigToMouth();
      if (this.cig.ember.visible) { this.state = 'smoking'; this.nextDrag = 6; } else this.takeLighter(id);
    } else {
      this.state = 'idle';
    }
  }

  private again = false;
  private lost = 0;

  private finishStub(): void {
    this.state = 'idle';
    if (this.again) { this.again = false; this.start(); return; }
    if (this.left <= 0) this.onToast?.('Пачка пуста'); else this.onToast?.(`В пачке осталось ${this.left}`);
  }

  /** One short line for the controls column. */
  get status(): string {
    switch (this.state) {
      case 'idle': return this.left > 0 ? `достать сигарету · ${this.left}` : 'пачка пуста';
      case 'taking': return 'достаю…';
      case 'lighting': return 'прикуриваю…';
      case 'smoking': return 'курю · J затяжка';
      default: return 'тушу окурок';
    }
  }

  private tag = 'smoke';
  private go(pose: Parameters<Hands['reach']>[0]['pose'], target: () => THREE.Vector3, hold: number, palm: THREE.Vector3, extra: Partial<Parameters<Hands['reach']>[0]> = {}, id = this.seq): void {
    this.hands.reach({
      hand: 'R', pose, hold, target, palm: palm.clone().normalize(), tag: this.tag,
      ...extra,
      // a step only counts while its own chain is the current one
      onArrive: extra.onArrive ? () => { if (this.seq === id) extra.onArrive!(); } : undefined,
      then: extra.then ? () => { if (this.seq === id) extra.then!(); } : undefined,
    });
  }

  private start(): void {
    if (this.left <= 0) {
      // the pack is empty: a fresh one of another brand
      this.cycleBrand();
    }
    this.state = 'taking';
    const id = ++this.seq;
    const DOWN = new THREE.Vector3(0, -1, -0.2);
    const pk = new THREE.Vector3();
    const front = this.nearMouth(new THREE.Vector3(), 0.07, -0.13, -0.24);
    const b = BRANDS[this.brand];
    // 1. the pack off the dash
    this.go('pinch', () => pk.copy(this.packOnDash).add(_a.set(0, 0.035, 0)), 0.3, DOWN, {
      onArrive: () => { this.onSfx?.('pack'); this.carryPack(); },
      then: () => {
        // 2. up in front of the face; a cigarette shows at the top
        this.go('pinch', front, 0.65, new THREE.Vector3(0, 0.3, 1), {
          onArrive: () => { this.showStub(true, b); },
          then: () => {
            // 3. the lips take it while the pack is already on its way back to the dash
            this.showStub(false, b);
            this.left--;
            this.takeToMouth(() => {}, id);
            this.go('pinch', () => pk.copy(this.packOnDash).add(_a.set(0, 0.03, 0)), 0.25, DOWN, {
              onArrive: () => { this.dropPack(); this.onSfx?.('pack'); },
              then: () => this.takeLighter(id),
            }, id);
          },
        }, id);
      },
    }, id);
  }

  private takeLighter(id: number): void {
    const DOWN = new THREE.Vector3(0, -1, -0.2);
    const lp = new THREE.Vector3();
    this.go('lighter', () => lp.copy(this.lighterOnDash).add(_a.set(0, 0.03, 0)), 0.25, DOWN, {
      onArrive: () => this.carryLighter(),
      then: () => {
        // flame to the tip, a little under it
        const tip = new THREE.Vector3(), flameAt = new THREE.Vector3();
        this.state = 'lighting';
        this.lightStart = performance.now() / 1000;
        this.go('lighter', () => {
          this.cigTip(tip);
          // the flame sits 7 cm out along the hand: aim the palm that far behind the tip
          return flameAt.copy(tip).add(_b.set(0.05, -0.045, 0.06));
        }, 2.6, new THREE.Vector3(-0.2, 0.2, 1), {
          onArrive: () => { this.lightT = 0; this.onSfx?.('flick'); },
          then: () => {
            this.flameOff();
            // lighter back on the dash
            const lp2 = new THREE.Vector3();
            this.go('lighter', () => lp2.copy(this.lighterOnDash).add(_a.set(0, 0.03, 0)), 0.25, DOWN, {
              onArrive: () => this.dropLighter(),
              then: () => { this.state = 'smoking'; this.burnT = 0; this.nextDrag = 9 + Math.random() * 6; },
            }, id);
          },
        }, id);
      },
    }, id);
  }

  private lightStart = 0;
  private lightT = -1;

  private cigTip(out: THREE.Vector3): THREE.Vector3 {
    this.cig.group.updateWorldMatrix(true, false);
    return out.set(0, this.cig.length, 0).applyMatrix4(this.cig.group.matrixWorld).applyMatrix4(_m.copy(this.parent.matrixWorld).invert());
  }

  private cycleBrand(): void {
    const i = (BRAND_IDS.indexOf(this.brand) + 1 + Math.floor(Math.random() * 3)) % BRAND_IDS.length;
    this.brand = BRAND_IDS[i];
    this.left = 20;
    this.parent.remove(this.pack);
    this.buildPack();
    this.setCigarette(BRANDS[this.brand]);
    this.onToast?.('Достал новую пачку');
  }

  // ---- carrying things

  private stub: THREE.Mesh | null = null;

  private carryPack(): void {
    // the pack rides in the hand, upright along the fingers
    this.pack.removeFromParent();
    this.pack.rotation.set(0, 0, 0);
    this.pack.position.set(0, 0.06, -0.022);
    this.hands.rigOf('R').palm.add(this.pack);
  }

  private dropPack(): void {
    this.pack.removeFromParent();
    this.pack.rotation.copy(this.packRot);
    this.pack.position.copy(this.packOnDash);
    this.parent.add(this.pack);
  }

  private carryLighter(): void {
    this.lighter.removeFromParent();
    this.lighter.rotation.set(0, 0, 0);
    this.lighter.position.set(0, 0.04, -0.018);
    this.hands.rigOf('R').palm.add(this.lighter);
  }

  private dropLighter(): void {
    this.lighter.removeFromParent();
    this.lighter.rotation.set(-Math.PI / 2, 0, -0.6);
    this.lighter.position.copy(this.lighterOnDash);
    this.parent.add(this.lighter);
  }

  /** A cigarette sticks out of the pack's top while it is held up. */
  private showStub(on: boolean, b: Brand): void {
    if (on) {
      if (!this.stub) {
        this.stub = new THREE.Mesh(new THREE.CylinderGeometry(0.0039, 0.0039, 0.026, 8), b.filter ? FILTER : CARD);
      }
      this.stub.position.set(0.004, BRANDS[this.brand].size[1] / 2 + 0.011, 0);
      this.pack.add(this.stub);
    } else if (this.stub) this.stub.removeFromParent();
  }

  /** The cigarette travels from the pack to the lips and stays there. */
  private takeToMouth(done: () => void, id: number): void {
    this.stub?.removeFromParent();
    this.cig.setBurn(0);
    this.cig.group.visible = true;
    // start at the pack's top
    this.pack.updateWorldMatrix(true, false);
    const from = new THREE.Vector3(0, BRANDS[this.brand].size[1] / 2 + 0.02, 0).applyMatrix4(this.pack.matrixWorld).applyMatrix4(_m.copy(this.parent.matrixWorld).invert());
    this.cigAnchor.remove(this.cig.group);
    this.parent.add(this.cig.group);
    this.cig.group.position.copy(from);
    this.cig.group.rotation.set(0, 0, 0);
    this.cigTravel = { t: 0, dur: 0.38, from, to: this.mouth, done: () => { if (this.seq === id) { this.cigToMouth(); done(); } } };
  }

  private cigToMouth(): void {
    this.cig.group.removeFromParent();
    this.cig.group.position.set(0, 0, 0);
    this.cig.group.rotation.set(0, 0, 0);
    this.cigAnchor.add(this.cig.group);
    this.cig.group.visible = true;
  }

  private cigToHand(): void {
    this.cig.group.removeFromParent();
    // held across the two fingers, as it really is: the filter on the palm side (toward the lips on a
    // draw), the lit end out past the back of the hand and a little along the fingers
    this.cig.group.position.set(0, 0.004, -0.016);
    this.cig.group.quaternion.setFromUnitVectors(_a.set(0, 1, 0), _b.set(0, 0.45, 1).normalize());
    this.hands.rigOf('R').vee.add(this.cig.group);
  }

  private flameOff(): void {
    this.flame.visible = false;
    this.flameLight.intensity = 0;
    this.lightT = -1;
  }

  // ---- a drag

  private drag(): void {
    this.dragging = true;
    const id = ++this.seq;
    const DOWN = new THREE.Vector3(0, -1, -0.2);
    const at = new THREE.Vector3();
    const near = this.nearMouth(at, 0.05, -0.045, -0.065);
    // between draws the wrist rests on the top of the wheel, the cigarette up between two fingers in sight
    const away = this.nearMouth(at, 0.13, -0.19, -0.34);
    // the hand comes up, takes the cigarette out of the lips between two fingers…
    this.go('vcig', near, 0.28, new THREE.Vector3(-0.1, 0.4, 0.9), {
      onArrive: () => this.cigToHand(),
      then: () => {
        // …back to the lips for the long draw…
        this.go('drag', near, 1.0, new THREE.Vector3(-0.1, 0.4, 0.9), {
          onArrive: () => { this.glowGoal = 1; this.onSfx?.('puff'); },
          then: () => {
            // …and away, a slow breath out, ash flicked
            this.glowGoal = 0.35;
            this.exhale();
            this.go('vcig', away, 2.6, new THREE.Vector3(-0.3, -0.3, 0.9), {
              then: () => {
                this.go('vcig', near, 0.3, new THREE.Vector3(-0.1, 0.4, 0.9), {
                  onArrive: () => this.cigToMouth(),
                  then: () => { this.dragging = false; this.nextDrag = 11 + Math.random() * 9; },
                }, id);
              },
            }, id);
          },
        }, id);
      },
    }, id);
  }

  /** A slow breath out, turned aside toward the cracked window rather than at the glass. */
  private exhale(): void {
    this.onSfx?.('exhale');
    const fwd = _c.set(0, -0.25, -1).applyQuaternion(this.cigAnchor.quaternion.clone().multiply(_q0.copy(CIG_IN_MOUTH).invert())).normalize();
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3().copy(fwd).multiplyScalar(0.12 + Math.random() * 0.06).add(_b.set(-0.08 - Math.random() * 0.05, 0.01 + Math.random() * 0.02, 0.01));
      this.smoke.puff(_a.copy(this.mouth).addScaledVector(fwd, 0.02 + i * 0.01), v, 0.02, 0.08 + Math.random() * 0.05, 2.2 + Math.random() * 0.9, 0.17, BREATH);
    }
  }

  private stubOut(): void {
    this.state = 'stubbing';
    const id = ++this.seq;
    const at = new THREE.Vector3(), near = this.nearMouth(at, 0.05, -0.045, -0.065);
    this.go('vcig', near, 0.28, new THREE.Vector3(-0.1, 0.4, 0.9), {
      onArrive: () => this.cigToHand(),
      then: () => {
        const ash = new THREE.Vector3().copy(this.ashPos).add(new THREE.Vector3(0, 0.05, 0.03));
        this.go('vcig', () => at.copy(ash), 0.7, new THREE.Vector3(0, -1, 0.1), {
          onArrive: () => {
            this.cig.light(false); this.glow = 0; this.onSfx?.('stub');
            // a last thread off the crushed stub, drifting back into the cab
            for (let i = 0; i < 3; i++) this.smoke.puff(this.ashPos.clone().add(_a.set(0, 0.02 + i * 0.01, 0)), _b.set(0, 0.04, 0.03), 0.012, 0.05, 1.4, 0.16, SIDE_SMOKE, false);
          },
          then: () => { this.cig.group.visible = false; this.cig.group.removeFromParent(); this.cigAnchor.add(this.cig.group); this.finishStub(); },
        }, id);
      },
    }, id);
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number): void {
    this.placeMouth();
    // the cracked driver's window: a slow pull when standing, a steady stream out of it on the move
    const pull = 0.05 + Math.min(1, Math.abs(this.speed) / 60) * 0.22;
    this.smoke.draft.set(-pull, 0.005, 0.03 + pull * 0.15);
    this.smoke.update(dt);
    if (this.cigTravel) {
      const tr = this.cigTravel;
      tr.t += dt;
      const k = clamp(tr.t / tr.dur, 0, 1);
      const e = k * k * (3 - 2 * k);
      this.cig.group.position.lerpVectors(tr.from, tr.to, e);
      // swing round to the way it hangs from the lips
      this.cig.group.quaternion.slerpQuaternions(_q0.identity(), this.cigAnchor.quaternion, e);
      if (k >= 1) { this.cigTravel = null; tr.done(); }
    }
    // the chain is the hand's own; if something else took the hand while the cigarette was in it, put it back in the lips
    if (this.state === 'smoking' && this.dragging && this.hands.taskOf('R')?.tag !== this.tag && this.cig.group.parent !== this.cigAnchor) {
      this.cigToMouth();
      this.dragging = false;
      this.seq++;
    }

    // a step chain whose hand was taken by something else (a gear change, the horn) would hang forever
    if ((this.state === 'taking' || this.state === 'lighting' || this.state === 'stubbing') && !this.cigTravel && this.hands.taskOf('R')?.tag !== this.tag) {
      this.lost += dt;
      if (this.lost > 0.5) { this.lost = 0; this.recover(); }
    } else this.lost = 0;

    // the flame while it is lit, and the three quick draws that get the cigarette going
    if (this.state === 'lighting' && this.lightT >= 0) {
      this.lightT += dt;
      const t = this.lightT;
      const on = t > 0.25 && t < 2.15;
      if (on && !this.flame.visible) { this.onSfx?.('flame'); }
      this.flame.visible = on;
      this.rigFlick(t);
      if (on) {
        this.flame.scale.set(1 + Math.sin(t * 40) * 0.12, 1 + Math.sin(t * 31) * 0.18, 1);
        this.lighter.updateWorldMatrix(true, false);
        this.flameLight.position.set(0, 0.055, 0).applyMatrix4(this.lighter.matrixWorld).applyMatrix4(_m.copy(this.parent.matrixWorld).invert());
        this.flameLight.intensity = 0.035 + Math.sin(t * 37) * 0.006;
      } else this.flameLight.intensity = 0;
      // puffs at 0.7, 1.15, 1.6 s: the ember catches on the first
      for (const pt of [0.7, 1.15, 1.6]) {
        if (t >= pt && t - dt < pt) {
          this.onSfx?.('puff');
          this.cig.light(true);
          this.glowGoal = 1;
          for (let i = 0; i < 2; i++) this.smoke.puff(this.cigTip(_a), _b.set(-0.02, 0.05, 0.01), 0.01, 0.055, 1.5, 0.16, SIDE_SMOKE);
        }
        if (t >= pt + 0.22 && t - dt < pt + 0.22) this.glowGoal = 0.45;
      }
    }
    if (this.state !== 'lighting' && this.state !== 'idle' && this.state !== 'taking') this.rigFlick(-1);

    if (this.state === 'smoking') {
      this.burnT += dt;
      const f = clamp(this.burnT / this.burnTotal, 0, 1);
      this.cig.setBurn(f);
      this.nextDrag -= dt;
      if (this.nextDrag <= 0 && !this.hands.busy('R') && !this.dragging) this.drag();
      if (f >= 1 && !this.dragging && !this.hands.busy('R')) this.stubOut();
      // a thin ribbon of smoke from the tip
      this.idleT -= dt;
      if (this.idleT <= 0 && this.cig.ember.visible) {
        // a thin thread rising off the tip, more of it while the ember is drawn on
        this.idleT = 0.07;
        this.smoke.puff(this.cigTip(_a), _b.set((Math.random() - 0.5) * 0.008, 0.05 + Math.random() * 0.015, (Math.random() - 0.5) * 0.006), 0.005, 0.038 + Math.random() * 0.012, 1.7 + Math.random() * 0.5, 0.13 + this.glow * 0.04, SIDE_SMOKE);
      }
    }
    // the ember breathes and follows its goal
    this.glow += (this.glowGoal - this.glow) * Math.min(1, dt * 7);
    if (this.cig.ember.visible) {
      const m = this.cig.ember.material as THREE.MeshBasicMaterial;
      m.color.setRGB(1, 0.3 + 0.35 * this.glow, 0.1 + 0.1 * this.glow);
      this.cig.ember.scale.setScalar(0.8 + this.glow * 0.7);
      this.cigTip(_a);
      this.emberLight.position.copy(_a);
      this.emberLight.intensity = this.glow * 0.012;
    } else this.emberLight.intensity = 0;
  }

  /** The thumb flicks the lighter's wheel as the flame comes up (t < 0: not at all). */
  private rigFlick(t: number): void {
    const rig = this.hands.rigOf('R');
    rig.flick = t > 0.1 && t < 0.35 ? Math.sin(((t - 0.1) / 0.25) * Math.PI) : 0;
  }
}

const _m = new THREE.Matrix4();
