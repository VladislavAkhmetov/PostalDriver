import * as THREE from 'three';
import { Bucket, boxGeo, mat } from '../core/geom';
import { clamp, lerp, smoothstep } from '../core/math';
import { paint } from '../core/textures';
import { RAIL_HALF, type Ground, type Road } from './Ground';
import { Collider } from './Props';

const U = RAIL_HALF;    // half-length of the modelled line
const STEP = 5;         // profile spacing
/** Metres along the line over which the rails climb from a side road's level crossing back onto the embankment. */
const CROSS_RAMP = 45;
const TRAIN_V = 16;     // ~58 km/h freight
/** Average approach speed that just beats the booms, m/s (65 km/h). */
const RACE_V = 18;

interface Car { group: THREE.Group; len: number; off: number }

export interface RailSound { bell: number; train: number; clack: number; horn: number }

/**
 * Single-track railway crossing the asphalt road: embankment, sleepers, rails,
 * barrier booms, alternating red lamps and a freight train that times its run
 * to the player's approach.
 */
export class Railway {
  readonly group = new THREE.Group();
  readonly sCross: number;
  readonly cx: number; readonly cz: number;
  readonly dx: number; readonly dz: number;
  private h: Float32Array;
  private cars: Car[] = [];
  private trainLen = 0;
  private head = 0;
  private dir = 1;
  private active = false;
  private cooldown = 6;
  private hornDone = false;
  /** 0 open … 1 closed. */
  private boomK = 0;
  private warn = false;
  private booms: { pivot: THREE.Object3D; col: Collider; lat: number }[] = [];
  private redMats: THREE.MeshBasicMaterial[] = [];
  private moonMats: THREE.MeshBasicMaterial[] = [];
  private trainCols: Collider[] = [];
  private hornQ = 0;
  private lampMat: THREE.MeshLambertMaterial;
  private raw: Float32Array;
  /**
   * Unguarded level crossings where the side roads (the forest road home) cross the line: where
   * along it (u), half the length of the deck along the rails, and the road and point it crosses at.
   */
  private crossings: { u: number; hz: number; road: Road; s: number; y: number }[] = [];

  /** The line where Ground laid it (its valley is kept through the foothills). */
  constructor(private ground: Ground) {
    const line = ground.railLine;
    this.sCross = line.s;
    this.cx = line.cx; this.cz = line.cz;
    this.dx = line.dx; this.dz = line.dz;
    // embankment profile: rolling max of the terrain, smoothed, meeting the road at the crossing
    const n = Math.round((2 * U) / STEP) + 1;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) { const [x, z] = this.at(-U + i * STEP); raw[i] = ground.terrainAt(x, z); }
    const m1 = new Float32Array(n), m2 = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = -1e9; for (let k = -4; k <= 4; k++) m = Math.max(m, raw[clamp(i + k, 0, n - 1)]); m1[i] = m; }
    for (let i = 0; i < n; i++) { let s = 0; for (let k = -8; k <= 8; k++) s += m1[clamp(i + k, 0, n - 1)]; m2[i] = s / 17; }
    const yc = ground.height(this.cx, this.cz) + 0.04;
    this.h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = -U + i * STEP;
      this.h[i] = lerp(yc, m2[i] + 0.7, smoothstep(10, 75, Math.abs(u)));
      // never bury the rails under a rise away from the road deck
      if (Math.abs(u) > 8) this.h[i] = Math.max(this.h[i], raw[i] + 0.45);
    }
    const sm = Float32Array.from(this.h);
    for (let i = 2; i < n - 2; i++) if (Math.abs(-U + i * STEP) > 12) sm[i] = (this.h[i - 2] + this.h[i - 1] + this.h[i] * 2 + this.h[i + 1] + this.h[i + 2]) / 6;
    this.h = sm;
    this.raw = raw;
    this.levelCrossings();
    this.lampMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#fff0c0', emissiveIntensity: 0 });
  }

  /**
   * Find where the side roads cross the line and bring the rails down to them: flush with the road
   * across it, climbing back onto the embankment over CROSS_RAMP metres either side — the
   * embankment would otherwise stand across the track like a wall.
   */
  private levelCrossings(): void {
    const g = this.ground;
    for (const road of g.roads) {
      if (road === g.main) continue;
      let prev: { d: number; along: number; y: number; s: number; cos: number } | null = null;
      for (const p of road.samples) {
        const ox = p.x - this.cx, oz = p.z - this.cz;
        const along = ox * this.dx + oz * this.dz, d = -ox * this.dz + oz * this.dx;
        const cos = p.tx * this.dx + p.tz * this.dz;
        if (prev && Math.sign(d) !== Math.sign(prev.d) && Math.abs(along) < U - 60) {
          const t = prev.d / (prev.d - d);
          const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
          const half = road.zoneAt(p.s).width / 2;
          this.crossings.push({
            u: lerp(prev.along, along, t), s: lerp(prev.s, p.s, t), y: lerp(prev.y, p.y, t), road,
            // the road and its shoulders, measured along the rails (a shallow crossing is a long one)
            hz: (half + 2.6) / Math.max(0.3, sin),
          });
        }
        prev = { d, along, y: p.y, s: p.s, cos };
      }
    }
    for (const c of this.crossings) {
      for (let i = 0; i < this.h.length; i++) {
        const u = -U + i * STEP, du = Math.abs(u - c.u);
        if (du > c.hz + CROSS_RAMP) continue;
        // on the road the rails sit at its centreline height where they cross it; past it, the crossing's own
        const [x, z] = this.at(u);
        const q = g.nearestRoad(x, z, 12);
        const onIt = q && q.sample.road === c.road && Math.abs(q.lat) < c.road.zoneAt(q.s).width / 2 + 2.6;
        const flush = (onIt && q ? c.road.frame(q.s).y : c.y) + 0.06;
        this.h[i] = lerp(flush, this.h[i], smoothstep(c.hz, c.hz + CROSS_RAMP, du));
      }
    }
  }

  /** On a crossing's deck (the main road's or a side road's), metres along the line. */
  private onDeck(u: number, mainHalfU: number): 'main' | 'side' | null {
    if (Math.abs(u) < mainHalfU) return 'main';
    return this.crossings.some((c) => Math.abs(u - c.u) < c.hz) ? 'side' : null;
  }

  at(u: number): [number, number] { return [this.cx + this.dx * u, this.cz + this.dz * u]; }

  heightAt(u: number): number {
    const f = clamp((u + U) / STEP, 0, this.h.length - 1.001);
    const i = Math.floor(f);
    return lerp(this.h[i], this.h[i + 1], f - i);
  }

  /** Distance from the track centreline (for keeping trees and props off it). */
  dist(x: number, z: number): number {
    const ox = x - this.cx, oz = z - this.cz;
    const u = ox * this.dx + oz * this.dz;
    if (Math.abs(u) > U) return 1e9;
    return Math.abs(-ox * this.dz + oz * this.dx);
  }

  /** True while the booms are down or coming down. */
  get blocked(): boolean { return this.warn || this.boomK > 0.05; }

  buildStatic(b: Bucket, cols: Collider[], sign: (t: THREE.Texture) => string): void {
    const yaw = Math.atan2(this.dx, this.dz);
    const half = this.ground.main.zoneAt(this.sCross).width / 2;
    const roadHalfU = (half + 2) / Math.max(0.3, Math.abs(Math.cos(0.32)));
    for (let u = -U; u < U; u += STEP) {
      const i = Math.round((u + U) / STEP);
      const h0 = this.h[i], h1 = this.h[i + 1];
      const um = u + STEP / 2;
      const [x, z] = this.at(um);
      const hm = (h0 + h1) / 2;
      const pitch = -Math.atan2(h1 - h0, STEP);
      const deck = this.onDeck(um, roadHalfU);
      const onRoad = deck !== null;
      if (!onRoad) {
        const bottom = Math.min(this.raw[i], this.raw[i + 1]) - 0.8;
        const top = hm - 0.3;
        // the embankment with sloping sides, its crest following the rails from one end of the step to the other
        if (top - bottom > 0.1) b.add('gravel', embankment(STEP, h0 - 0.3, h1 - 0.3, bottom), mat(x, 0, z, 0, yaw, 0), '#9a8e7e');
        b.add('gravel', boxGeo(3.4, 0.22, STEP + 0.1, 1), mat(x, hm - 0.24, z, pitch, yaw, 0), '#8a8274');
      } else if (deck === 'main') {
        // rubber crossing deck between and beside the rails
        b.add('flat', boxGeo(2.6, 0.06, STEP + 0.05), mat(x, hm - 0.03, z, pitch, yaw, 0), '#3a3a38');
      } else {
        // a forest road's crossing: old sleepers laid as planking between and beside the rails, down in the ruts
        b.add('planks', boxGeo(3.0, 0.1, STEP + 0.05, 1), mat(x, hm - 0.07, z, pitch, yaw, 0), '#7a6a52');
      }
      for (const s of [-1, 1]) {
        const ox = this.dz * s * 0.76, oz = -this.dx * s * 0.76;
        b.add('flat', boxGeo(0.08, 0.14, STEP + 0.02), mat(x + ox, hm - 0.02, z + oz, pitch, yaw, 0), '#5a5450');
        b.add('flat', boxGeo(0.07, 0.02, STEP + 0.02), mat(x + ox, hm + 0.055, z + oz, pitch, yaw, 0), '#b4b0a8');
      }
      if (!onRoad && Math.abs(u) < 720) {
        for (let k = 0; k < STEP; k += 0.9) {
          const uu = u + k;
          const [sx, sz] = this.at(uu);
          b.add('flat', boxGeo(2.6, 0.12, 0.24), mat(sx, this.heightAt(uu) - 0.12, sz, 0, yaw, 0), '#4a3c30');
        }
      }
    }
    // telegraph poles along the line
    for (let u = -U + 20; u < U; u += 50) {
      if (Math.abs(u) < 30) continue;
      const ox = this.dz * 4.2, oz = -this.dx * 4.2;
      const [x, z] = this.at(u);
      const y = this.ground.terrainAt(x + ox, z + oz);
      b.add('flat', new THREE.CylinderGeometry(0.1, 0.13, 7.5, 6), mat(x + ox, y + 3.6, z + oz), '#5a4834');
      b.add('flat', boxGeo(1.4, 0.08, 0.08), mat(x + ox, y + 7, z + oz, 0, yaw + Math.PI / 2, 0), '#5a4834');
    }
    this.buildCrossingGear(b, cols, sign);
    this.buildCrossSigns(b, cols);
    this.buildTrain();
  }

  /**
   * The St Andrew's cross on either approach to each unguarded crossing: two crossed boards, white
   * with a red edge, on a post at the right-hand verge, facing the traffic.
   */
  private buildCrossSigns(b: Bucket, cols: Collider[]): void {
    for (const c of this.crossings) {
      const road = c.road;
      for (const side of [-1, 1]) {
        // a few metres short of the deck, along the road
        const s = clamp(c.s - side * (c.hz + 8), 0, road.length);
        const f = road.frame(s);
        const lat = side * (road.zoneAt(s).width / 2 + 1.5);
        const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
        const y = this.ground.terrainAt(x, z);
        const rot = Math.atan2(-f.tx * side, -f.tz * side);
        b.add('flat', boxGeo(0.1, 2.5, 0.1), mat(x, y + 1.25, z, 0, rot, 0), '#e8e4da');
        for (const a of [0.62, -0.62]) {
          const m = mat(x, y + 2.15, z, 0, rot, 0);
          b.add('flat', boxGeo(1.35, 0.24, 0.03), m.clone().multiply(mat(0, 0, 0.07, 0, 0, a)), '#c82a20');
          b.add('flat', boxGeo(1.25, 0.14, 0.03), m.clone().multiply(mat(0, 0, 0.085 + (a > 0 ? 0.004 : 0), 0, 0, a)), '#f0ece4');
        }
        cols.push({ x, z, r: 0.2, hw: 0, hd: 0, rot: 0, box: false });
      }
    }
  }

  private buildCrossingGear(b: Bucket, cols: Collider[], sign: (t: THREE.Texture) => string): void {
    const road = this.ground.main;
    const half = road.zoneAt(this.sCross).width / 2;
    const striped = new THREE.MeshLambertMaterial({ map: paint(64, 8, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f0ece4' : '#c82a20'; g.fillRect(i * 8, 0, 8, h); } }, { repeat: true }) });
    const post = new THREE.MeshLambertMaterial({ color: '#e8e4da' });
    const dark = new THREE.MeshLambertMaterial({ color: '#1e1e1e', side: THREE.DoubleSide });
    const warnTex = paint(64, 64, (g, w) => {
      g.clearRect(0, 0, w, w);
      g.fillStyle = '#c62a22'; g.beginPath(); g.moveTo(w / 2, 3); g.lineTo(w - 2, w - 6); g.lineTo(2, w - 6); g.closePath(); g.fill();
      g.fillStyle = '#f4f2ea'; g.beginPath(); g.moveTo(w / 2, 13); g.lineTo(w - 11, w - 11); g.lineTo(11, w - 11); g.closePath(); g.fill();
      // fence pictogram: crossing with a barrier
      g.fillStyle = '#111'; g.fillRect(20, 30, 24, 3); g.fillRect(20, 38, 24, 3);
      for (let x = 21; x < 44; x += 6) g.fillRect(x, 28, 2, 18);
    }, { repeat: false });
    const warnKey = sign(warnTex);
    // approaching from each side: boom on the driver's right, lamp post before it
    for (const side of [-1, 1]) {
      const s = this.sCross - side * 9.5;
      const f = road.frame(s);
      const lat = side * (half + 0.9);
      const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
      const y = this.ground.terrainAt(x, z);
      const base = new THREE.Group();
      base.position.set(x, y, z);
      // local +x points across the road toward the centreline
      base.rotation.y = Math.atan2(f.rz * side, -f.rx * side);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), post);
      pole.position.y = 0.55;
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), dark);
      hub.position.y = 1.05;
      const pivot = new THREE.Group();
      pivot.position.y = 1.05;
      const len = half + 0.6;
      const armGeo = new THREE.BoxGeometry(len, 0.13, 0.09);
      armGeo.translate(len / 2, 0, 0);
      const uv = armGeo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 3));
      const arm = new THREE.Mesh(armGeo, striped);
      const weight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.2), dark);
      weight.position.x = -0.45;
      pivot.add(arm, weight);
      base.add(pole, hub, pivot);
      this.group.add(base);
      const col: Collider = { x: 1e9, z: 1e9, r: len / 2 + 0.5, hw: len / 2, hd: 0.25, rot: base.rotation.y, box: true };
      this.booms.push({ pivot, col, lat });
      cols.push({ x, z, r: 0.4, hw: 0, hd: 0, rot: 0, box: false });

      // signal post with two red lamps and the white lunar lamp, striped mast
      const sf = road.frame(this.sCross - side * 12.5);
      const sl = side * (half + 1.6);
      const sx = sf.x + sf.rx * sl, sz = sf.z + sf.rz * sl;
      const sy = this.ground.terrainAt(sx, sz);
      const sig = new THREE.Group();
      sig.position.set(sx, sy, sz);
      sig.rotation.y = Math.atan2(-sf.tx * side, -sf.tz * side);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), striped);
      mast.position.y = 1.6;
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.36, 0.14), dark);
      head.position.set(0, 2.7, 0.08);
      sig.add(mast, head);
      for (const lx of [-0.3, 0.3]) {
        const m = new THREE.MeshBasicMaterial({ color: '#3a1010' });
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), m);
        l.position.set(lx, 2.7, 0.16);
        const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 10, 1, true, Math.PI / 2, Math.PI), dark);
        visor.rotation.x = Math.PI / 2;
        visor.position.set(lx, 2.72, 0.24);
        sig.add(l, visor);
        this.redMats.push(m);
      }
      const mm = new THREE.MeshBasicMaterial({ color: '#40403a' });
      const moon = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), mm);
      moon.position.set(0, 2.98, 0.16);
      this.moonMats.push(mm);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshLambertMaterial({ map: warnTex, alphaTest: 0.5 }));
      plate.position.set(0, 2.1, 0.08);
      sig.add(moon, plate);
      this.group.add(sig);
      cols.push({ x: sx, z: sz, r: 0.25, hw: 0, hd: 0, rot: 0, box: false });

      // advance warning sign 150 m out
      const wf = road.frame(this.sCross - side * 150);
      const wl = side * (half + 1.9);
      const wx = wf.x + wf.rx * wl, wz = wf.z + wf.rz * wl;
      const wy = this.ground.terrainAt(wx, wz);
      const rot = Math.atan2(-wf.tx * side, -wf.tz * side);
      b.add('flat', boxGeo(0.07, 2.6, 0.07), mat(wx, wy + 1.3, wz, 0, rot, 0), '#8a8a86');
      b.add(warnKey, new THREE.PlaneGeometry(1.0, 1.0), mat(wx, wy + 2.2, wz, 0, rot, 0).multiply(mat(0, 0, 0.05)));
    }
  }

  private buildTrain(): void {
    const mats = { body: new THREE.MeshLambertMaterial({ vertexColors: true }), lamp: this.lampMat };
    const make = (fn: (add: (key: string, g: THREE.BufferGeometry, x: number, y: number, z: number, c: string, rx?: number) => void) => number): Car => {
      const b = new Bucket();
      const len = fn((key, g, x, y, z, c, rx = 0) => b.add(key, g, mat(x, y, z, rx), c));
      const group = b.build(mats, 'train');
      group.visible = false;
      this.group.add(group);
      return { group, len, off: 0 };
    };
    const bogies = (add: (key: string, g: THREE.BufferGeometry, x: number, y: number, z: number, c: string) => void, L: number) => {
      for (const z of [-L / 2 + 2, L / 2 - 2]) {
        add('body', boxGeo(2.4, 0.6, 2.6), 0, 0.55, z, '#222220');
        for (const s of [-1, 1]) for (const dz of [-0.8, 0.8]) add('body', new THREE.CylinderGeometry(0.45, 0.45, 0.12, 10).rotateZ(Math.PI / 2), s * 0.76, 0.45, z + dz, '#2a2826');
      }
      add('body', boxGeo(2.8, 0.25, L - 0.4), 0, 1.05, 0, '#2a2826');
    };
    // 2TE10-style diesel: green with a yellow stripe and a red nose
    const loco = () => make((add) => {
      const L = 17;
      bogies(add, L);
      add('body', boxGeo(3.1, 2.9, L - 3), 0, 2.65, -1.2, '#3e5c3a');
      add('body', boxGeo(3.1, 2.6, 3.2), 0, 2.5, L / 2 - 2.0, '#3e5c3a');
      add('body', boxGeo(3.12, 0.35, L - 0.5), 0, 2.05, 0, '#d8b23a');
      add('body', boxGeo(3.1, 1.2, 0.6), 0, 1.8, L / 2 - 0.3, '#b8322c');
      add('body', boxGeo(2.6, 0.9, 0.08), 0, 3.3, L / 2 - 0.42, '#2a3640');
      add('body', boxGeo(3.0, 0.3, L - 2), 0, 4.2, -0.6, '#5a5e5a');
      add('lamp', new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10).rotateX(Math.PI / 2), 0, 3.95, L / 2 - 0.5, '#fff6d8');
      for (const s of [-1, 1]) add('lamp', boxGeo(0.2, 0.2, 0.06), s * 1.0, 1.6, L / 2 + 0.01, '#fff6d8');
      return L;
    });
    const boxcar = (c: string) => make((add) => {
      const L = 14;
      bogies(add, L);
      add('body', boxGeo(3.0, 3.0, L - 0.6), 0, 2.7, 0, c);
      add('body', new THREE.CylinderGeometry(1.6, 1.6, L - 0.6, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(0.95, 0.18, 1), 0, 4.2, 0, '#6a6a64');
      for (const s of [-1, 1]) add('body', boxGeo(0.04, 2.4, 2.4), s * 1.51, 2.55, 0, '#4a3a2c');
      for (let z = -L / 2 + 1; z < L / 2 - 0.5; z += 1.5) for (const s of [-1, 1]) add('body', boxGeo(0.05, 3.0, 0.08), s * 1.52, 2.7, z, '#5a4232');
      return L;
    });
    const tank = () => make((add) => {
      const L = 12;
      bogies(add, L);
      add('body', new THREE.CylinderGeometry(1.45, 1.45, L - 1.4, 12).rotateX(Math.PI / 2), 0, 2.75, 0, '#1e1e1e');
      add('body', new THREE.CylinderGeometry(0.5, 0.5, 0.5, 8), 0, 4.3, 0, '#2a2a28');
      add('body', boxGeo(2.98, 0.3, 1.2), 0, 2.75, 0, '#d8b23a');
      return L;
    });
    const gondola = (load: string) => make((add) => {
      const L = 13;
      bogies(add, L);
      add('body', boxGeo(3.1, 2.0, L - 0.4), 0, 2.2, 0, '#5a4a3a');
      add('body', boxGeo(2.9, 0.4, L - 0.8), 0, 3.15, 0, load);
      for (let z = -L / 2 + 1; z < L / 2 - 0.5; z += 1.6) for (const s of [-1, 1]) add('body', boxGeo(0.06, 2.0, 0.1), s * 1.56, 2.2, z, '#3e3226');
      return L;
    });
    const timber = () => make((add) => {
      const L = 13;
      bogies(add, L);
      add('body', boxGeo(2.9, 0.2, L - 0.4), 0, 1.3, 0, '#3a3430');
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6 - r; i++) add('body', new THREE.CylinderGeometry(0.22, 0.22, L - 1.5, 7).rotateX(Math.PI / 2), -1.1 + i * 0.44 + r * 0.22, 1.62 + r * 0.38, 0, '#8a6a4a');
      for (const z of [-4, 0, 4]) for (const s of [-1, 1]) add('body', boxGeo(0.12, 1.8, 0.12), s * 1.4, 2.1, z, '#2a2826');
      return L;
    });
    const consist: Car[] = [loco(), loco()];
    const order = ['box', 'box', 'tank', 'tank', 'tank', 'coal', 'box', 'timber', 'timber', 'box', 'tank', 'coal', 'coal', 'box', 'timber', 'box'];
    const boxColors = ['#7a4a32', '#6a3e2c', '#8a5a3a', '#5a4a3e'];
    order.forEach((k, i) => consist.push(
      k === 'box' ? boxcar(boxColors[i % boxColors.length]) : k === 'tank' ? tank() : k === 'coal' ? gondola('#1e1c1a') : timber(),
    ));
    let off = 0;
    for (const c of consist) { c.off = off + c.len / 2; off += c.len + 0.8; }
    // the second section runs reversed, cab to the rear
    consist[1].group.userData.flip = true;
    this.cars = consist;
    this.trainLen = off;
    for (let i = 0; i < consist.length; i++) this.trainCols.push({ x: 1e9, z: 1e9, r: 9, hw: 1.6, hd: consist[i].len / 2, rot: 0, box: true });
  }

  /** Booms and train cars that can block the player; registered once as dynamic colliders. */
  dynamicColliders(): Collider[] { return [...this.booms.map((b) => b.col), ...this.trainCols]; }

  update(dt: number, t: number, px: number, pz: number, pvx: number, pvz: number, dark: number): RailSound {
    const ox = px - this.cx, oz = pz - this.cz;
    const pd = Math.hypot(ox, oz);
    // schedule a train for a race: the lamps start flashing (≈20.6 s before the
    // head) just as a van averaging 65 km/h from here would reach the crossing.
    // Brisker drivers are across before the warning; slower ones wait for the
    // freight to pass. (Hurrying means passing the GAI radar, though.)
    this.cooldown -= dt;
    // measured along the road from the town side: the road winds, a straight
    // line would start the race while the van is still at the post office
    const dRoad = this.cooldown <= 0 && !this.active ? this.sCross - this.ground.main.nearestS(px, pz) : -1;
    if (!this.active && this.cooldown <= 0 && dRoad > 40 && dRoad < 400) {
      const lead = clamp((dRoad / RACE_V + 330 / TRAIN_V) * TRAIN_V, 380, U - 20);
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.head = -this.dir * lead;
      this.active = true;
      this.hornDone = false;
    }
    let tail = 0;
    if (this.active) {
      this.head += this.dir * TRAIN_V * dt;
      tail = this.head - this.dir * this.trainLen;
      if (this.dir * tail > U + 20) { this.active = false; this.cooldown = 80 + Math.random() * 60; }
    }
    // crossing logic: warn when the head is within ~20 s, open once the tail is clear
    const headTo = this.active ? -this.dir * this.head : -1e9;   // >0 while approaching
    const tailTo = this.active ? -this.dir * tail : -1e9;
    this.warn = this.active && headTo < 330 && tailTo > -25;
    if (this.active && !this.hornDone && headTo < 420) { this.hornDone = true; this.hornQ = 1; }
    const lamps = this.warn && Math.floor(t * 1.6) % 2 === 0;
    this.redMats.forEach((m, i) => m.color.set(this.warn && (lamps ? i % 2 === 0 : i % 2 === 1) ? '#ff3a22' : '#3a1010'));
    const moon = !this.warn && Math.floor(t * 1.0) % 2 === 0;
    this.moonMats.forEach((m) => m.color.set(moon ? '#f2f0e0' : '#40403a'));
    const delay = this.warn && headTo < 300 ? 1 : 0;
    this.boomK = clamp(this.boomK + (delay ? dt / 5 : -dt / 4), 0, 1);
    const road = this.ground.main;
    for (const bm of this.booms) {
      bm.pivot.rotation.z = lerp(1.35, 0, smoothstep(0, 1, this.boomK));
      if (this.boomK > 0.7) {
        const side = Math.sign(bm.lat);
        const s = this.sCross - side * 9.5;
        const f = road.frame(s);
        const lat = side * (road.zoneAt(s).width / 4);
        const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
        // arm the boom's collider only once the van is clear of it, so a boom coming down
        // on a van stopped under it never shoves it aside
        const armed = bm.col.x < 1e8;
        if (armed || Math.hypot(px - x, pz - z) > bm.col.hw + 3) { bm.col.x = x; bm.col.z = z; }
      } else { bm.col.x = 1e9; bm.col.z = 1e9; }
    }
    // place the cars
    const yaw = Math.atan2(this.dx * this.dir, this.dz * this.dir);
    let near = 1e9;
    this.cars.forEach((c, i) => {
      const u = this.head - this.dir * c.off;
      const col = this.trainCols[i];
      if (!this.active || Math.abs(u) > U) { c.group.visible = false; col.x = 1e9; col.z = 1e9; return; }
      const [x, z] = this.at(u);
      const y = this.heightAt(u);
      const pitch = -Math.atan2(this.heightAt(u + this.dir * 4) - this.heightAt(u - this.dir * 4), 8);
      c.group.visible = true;
      c.group.position.set(x, y, z);
      const flip = c.group.userData.flip === true;
      c.group.rotation.set(flip ? -pitch : pitch, yaw + (flip ? Math.PI : 0), 0, 'YXZ');
      const d = Math.hypot(px - x, pz - z);
      near = Math.min(near, d);
      if (Math.abs(u) < 40) { col.x = x; col.z = z; col.rot = yaw; } else { col.x = 1e9; col.z = 1e9; }
    });
    this.lampMat.emissiveIntensity = 0.6 + dark * 1.2;
    const horn = this.hornQ;
    this.hornQ = 0;
    return {
      bell: this.boomK > 0 || this.warn ? clamp(1 - Math.hypot(ox, oz) / 260, 0, 1) : 0,
      train: this.active ? clamp(1 - near / 420, 0, 1) : 0,
      clack: TRAIN_V / 14,
      horn: horn ? clamp(1 - Math.abs(headTo) / 1200, 0.2, 1) : 0,
    };
  }
}

/**
 * One step of the railway embankment, local z along the line (-len/2 … len/2) and y absolute: a crest
 * 4.2 m wide from height t0 to t1, sides falling at 1 : 1.6 (steeper on a tall bank, so it never
 * spreads past 6 m either side) down to `bottom`, below the ground.
 */
function embankment(len: number, t0: number, t1: number, bottom: number): THREE.BufferGeometry {
  const crest = 2.1;
  const foot = (t: number) => Math.min(crest + (t - bottom) * 1.6, 6);
  const z0 = -len / 2, z1 = len / 2;
  const pos: number[] = [], uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  for (const side of [-1, 1]) {
    const f0 = foot(t0), f1 = foot(t1);
    const sl0 = Math.hypot(f0 - crest, t0 - bottom) / 2, sl1 = Math.hypot(f1 - crest, t1 - bottom) / 2;
    const a = [side * crest, t0, z0], b = [side * crest, t1, z1], c = [side * f1, bottom, z1], d = [side * f0, bottom, z0];
    // wound so the face looks outward on either side
    if (side > 0) quad(a, b, c, d, [0, z0 / 2], [0, z1 / 2], [sl1, z1 / 2], [sl0, z0 / 2]);
    else quad(a, d, c, b, [0, z0 / 2], [sl0, z0 / 2], [sl1, z1 / 2], [0, z1 / 2]);
  }
  quad([-crest, t0, z0], [-crest, t1, z1], [crest, t1, z1], [crest, t0, z0], [0, z0 / 2], [0, z1 / 2], [crest, z1 / 2], [crest, z0 / 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
