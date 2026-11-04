import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { frontOf, Human, headOf, lam, mesh, Side } from './People';

/**
 * A GAI traffic inspector, late 1990s: grey-blue uniform, white belt and
 * cross-strap, white gauntlets, peaked cap with a red band, striped baton.
 * A skinned BaseHuman figure (see People.ts) recoloured and dressed with props
 * bound to its bones; the clips give breathing, walking and sitting, and a
 * procedural layer on top turns his head toward the van and drives the arms:
 * the "pull over" baton gesture, the salute, talking at the window with a
 * folder, hands on the wheel of the patrol car. Local forward is +Z.
 */
export type OfficerMode = 'idle' | 'signal' | 'walk' | 'salute' | 'talk' | 'sit';

const UNIFORM = '#6c7686', UNIFORM_D = '#505a68', TROUSER = '#3e4652', RED = '#b02a22', WHITE = '#ecebe4', SKIN = '#d6a688', BOOT = '#151515';

let batonMat: THREE.MeshLambertMaterial | null = null;
/** Seated hip point the patrol car seats were laid out for. */
const SEAT_HIPS_Y = 0.465;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _tR = new THREE.Vector3(), _tL = new THREE.Vector3(), _o = new THREE.Vector3();
const POLE: Record<string, THREE.Vector3> = {};
const pole = (k: string, x: number, y: number, z: number) => (POLE[k] ??= new THREE.Vector3(x, y, z).normalize());

export class Officer {
  readonly group: THREE.Group;
  mode: OfficerMode = 'idle';
  /** Terrain height for standing and walking; ignored while seated. */
  ground: ((x: number, z: number) => number) | null = null;
  speed = 1.45;
  private readonly h: Human;
  private readonly folder: THREE.Object3D;
  private t = Math.random() * 10;
  private modeT = 0;
  private look: THREE.Vector3 | null = null;
  private faceYaw: number | null = null;
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  // smoothed procedural layer
  private yaw = 0;
  private pitch = 0;
  private readonly arm: Record<Side, { w: number; t: THREE.Vector3; pole: THREE.Vector3 }> = {
    R: { w: 0, t: new THREE.Vector3(), pole: new THREE.Vector3(-1, -1, 0) },
    L: { w: 0, t: new THREE.Vector3(), pole: new THREE.Vector3(1, -1, 0) },
  };

  constructor(withBaton = true) {
    // the modelled officer (cap, moustache, belt and holster in the mesh and its texture)
    const h = this.h = new Human('gai', {
      colors: { Shirt: UNIFORM, Pants: TROUSER, Socks: BOOT, Hair: '#3a3028', Skin: SKIN },
      // the base figure wears shorts: trousers down to the shoes, then black shoes
      // white gloves are painted on the hands themselves
      paint: [
        { mat: 'Skin', below: 0.66, color: TROUSER }, { mat: 'Skin', below: 0.1, color: BOOT },
        { mat: 'Skin', below: 9, color: WHITE, joints: /Palm|Finger|Thumb|Hand/ },
      ],
    });
    this.group = h.group;
    const M = {
      uni: lam(UNIFORM), uniD: lam(UNIFORM_D), red: lam(RED), white: lam(WHITE), black: lam('#161616'),
      gold: lam('#c8a040'), brow: lam('#3a3028'), tie: lam('#c8ccd2'), leather: lam('#5a3a2a'),
    };

    // the old low-poly figure was dressed here piece by piece; the modelled one is already dressed
    if (h.body !== 'gai') {
      // peaked cap: red band round the whole skull at the forehead (hair included,
      // so nothing pokes through), grey crown raised at the front, red piping,
      // black visor hinged at the band, chin strap and cockade
      const hb = h.bindAt('Head').y;
      const { top } = headOf(h);
      const brow = hb + (top - hb) * 0.5;
      const skull = h.extent(['Head'], brow, top + 0.01);
      const capZ = (skull.max.z + skull.min.z) / 2;
      const rx = Math.max(-skull.min.x, skull.max.x) * 1.05 + 0.01, rz = ((skull.max.z - skull.min.z) / 2) * 1.05 + 0.01;
      const bandH = 0.04, bandTop = brow + bandH;
      h.attach('Head', mesh(new THREE.CylinderGeometry(1, 1, bandH, 20).scale(rx, 1, rz), M.red, 0, brow + bandH / 2, capZ));
      // the wide, fairly flat crown of the 90s, its front lifted
      const crownH = top + 0.018 - bandTop;
      const crown = new THREE.Group();
      crown.position.set(0, bandTop - 0.012 + crownH / 2, capZ + 0.008);
      crown.rotation.x = -0.14;
      crown.add(mesh(new THREE.CylinderGeometry(1.36, 0.97, crownH, 20).scale(rx, 1, rz), M.uni));
      crown.add(mesh(new THREE.CylinderGeometry(1.37, 1.37, 0.008, 20).scale(rx, 1, rz), M.red, 0, crownH / 2 - 0.002, 0));
      // cockade on the front of the crown, just above the band
      const ck = 0.97 + 0.39 * (0.026 / crownH);
      crown.add(mesh(new THREE.SphereGeometry(0.016, 8, 5).scale(0.85, 1.15, 0.35), M.gold, 0, -crownH / 2 + 0.026, rz * ck + 0.003));
      crown.add(mesh(new THREE.SphereGeometry(0.0075, 6, 4).scale(1, 1, 0.4), M.red, 0, -crownH / 2 + 0.026, rz * ck + 0.008));
      h.attach('Head', crown);
      // chin strap across the front of the band, with its two side buttons
      h.attach('Head', mesh(new THREE.CylinderGeometry(1.012, 1.012, 0.009, 16, 1, true, -Math.PI * 0.42, Math.PI * 0.84).scale(rx, 1, rz), M.black, 0, brow + 0.012, capZ));
      for (const s of [-1, 1]) h.attach('Head', mesh(new THREE.SphereGeometry(0.007, 5, 4), M.gold, s * rx * 0.97 * Math.sin(Math.PI * 0.42), brow + 0.012, capZ + rz * Math.cos(Math.PI * 0.42)));
      // visor: hinged at the lower edge of the band, angled down over the eyes
      const visor = new THREE.Group();
      // pivoted on the band's centre line, so its ends stay inside the band at the temples
      visor.position.set(0, brow + 0.022, capZ);
      visor.rotation.x = 0.22;
      visor.add(mesh(new THREE.CylinderGeometry(1, 1, 0.012, 18, 1, false, -Math.PI / 2, Math.PI).scale(rx * 0.99, 1, rz + 0.052), M.black));
      h.attach('Head', visor);
      // a moustache, of course: two drooping halves just above the mouth
      const headY = h.bindAt('Head').y;
      const mY = headY + 0.033;
      const mZ = h.extent(['Head'], mY - 0.012, mY + 0.012, -0.03, 0.03).max.z;
      if (Number.isFinite(mZ)) {
        for (const s of [-1, 1]) {
          const half = mesh(new THREE.BoxGeometry(0.044, 0.011, 0.012), M.brow, s * 0.021, mY - 0.004, mZ - 0.004);
          half.rotation.z = s * -0.38;
          half.rotation.y = s * 0.35;
          h.attach('Head', half);
        }
      }

      // white belt with brass buckle, holster on the right hip, map case on the left
      const hipY = h.bindAt('Hips').y, torsoY = h.bindAt('Torso').y;
      const beltY = hipY + (torsoY - hipY) * 0.55;
      const waist = h.extent([], beltY - 0.025, beltY + 0.025, -0.3, 0.3);
      const ax = (waist.max.x - waist.min.x) / 2 + 0.012, az = (waist.max.z - waist.min.z) / 2 + 0.012, cz = (waist.max.z + waist.min.z) / 2;
      h.attach('Hips', mesh(new THREE.CylinderGeometry(1, 1, 0.05, 16).scale(ax, 1, az), M.white, 0, beltY, cz));
      h.attach('Hips', mesh(new THREE.BoxGeometry(0.06, 0.045, 0.012), M.gold, 0, beltY, cz + az + 0.004));
      h.attach('Hips', mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), M.white, -(ax + 0.02), beltY - 0.06, cz + 0.02));
      h.attach('Hips', mesh(new THREE.BoxGeometry(0.045, 0.2, 0.17), M.leather, ax + 0.025, beltY - 0.11, cz - 0.01));

      // cross-strap over the right shoulder to the left hip, front and back,
      // in two runs each so it lies on the chest and the shoulder blades
      const shR = h.bindAt('UpperArmR');
      const shX = shR.x * 0.6;
      // torso and shoulder only: the jaw is at the same height and x
      const TRUNK = ['Torso', 'Abdomen', 'ShoulderR', 'ShoulderL', 'UpperArmR', 'UpperArmL'];
      const shTop = h.extent(TRUNK, shR.y - 0.1, shR.y + 0.2, shX - 0.02, shX + 0.02).max.y;
      const surf = (x: number, y: number, back: boolean) => {
        // the widest of three probes across the strap, so its edges don't sink in
        const zs = [-0.02, 0, 0.02].map((dx) => h.probe(x + dx, y, back)).filter(Number.isFinite);
        const z = zs.length ? (back ? Math.min(...zs) : Math.max(...zs)) : back ? -0.12 : 0.12;
        return z + (back ? -0.008 : 0.008);
      };
      const strip = (p: THREE.Vector3, q: THREE.Vector3, bone: string) => {
        const o = mesh(new THREE.BoxGeometry(0.044, p.distanceTo(q) + 0.012, 0.008), M.white);
        o.position.lerpVectors(p, q, 0.5);
        o.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _w.subVectors(q, p).normalize());
        h.attach(bone, o);
      };
      for (const back of [false, true]) {
        const at = (t: number) => {
          const p = new THREE.Vector3(ax * 0.75 + (shX - ax * 0.75) * t, beltY + 0.03 + (shTop - beltY - 0.03) * t, 0);
          p.z = surf(p.x, p.y, back);
          return p;
        };
        const pts = [at(0), at(0.45), at(0.8), at(0.93)];
        // over the top of the shoulder, where the front and back runs meet
        const top = new THREE.Vector3(shX, shTop + 0.006, (surf(shX, shTop - 0.03, false) + surf(shX, shTop - 0.03, true)) / 2);
        pts.push(top);
        for (let i = 0; i + 1 < pts.length; i++) strip(pts[i], pts[i + 1], i === 0 ? 'Abdomen' : 'Torso');
      }
      // shoulder boards with red piping
      for (const side of ['R', 'L'] as const) {
        const sh = h.bindAt(`UpperArm${side}`), sx = sh.x * 0.7;
        const y = h.extent(TRUNK, sh.y - 0.1, sh.y + 0.2, sx - 0.015, sx + 0.015).max.y;
        h.attach(`Shoulder${side}`, mesh(new THREE.BoxGeometry(0.065, 0.012, 0.14), M.uniD, sx, y + 0.004, sh.z - 0.01));
        h.attach(`Shoulder${side}`, mesh(new THREE.BoxGeometry(0.068, 0.006, 0.143), M.red, sx, y - 0.002, sh.z - 0.01));
      }
      // tie and brass buttons down the front
      const neckY = h.bindAt('Neck').y;
      for (let i = 0; i < 4; i++) {
        const y = neckY - 0.1 - i * 0.11;
        const z = frontOf(h, y - 0.06, y + 0.06);
        if (!Number.isFinite(z) || z < 0.03) continue;
        if (i === 0) h.attach('Torso', mesh(new THREE.BoxGeometry(0.034, 0.14, 0.01), M.uniD, 0, y + 0.02, z + 0.004));
        else h.attach(y > beltY + 0.15 ? 'Torso' : 'Abdomen', mesh(new THREE.SphereGeometry(0.011, 5, 4), M.gold, 0.012, y, z + 0.004));
      }
      const ty = neckY - 0.04, tz = frontOf(h, ty - 0.04, ty + 0.04, false, 0.05);
      if (Number.isFinite(tz)) h.attach('Torso', mesh(new THREE.BoxGeometry(0.05, 0.07, 0.008), M.tie, 0, ty, tz + 0.003));

    }

    // white gauntlet cuffs over the forearms (the gloves are painted on)
    const along = (geo: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3, t: number, m: THREE.Material) => {
      const o = mesh(geo, m);
      o.position.lerpVectors(from, to, t);
      o.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _w.subVectors(to, from).normalize());
      return o;
    };
    const ends: Record<string, { palm: THREE.Vector3; dir: THREE.Vector3 }> = {};
    for (const side of ['R', 'L'] as const) {
      const lo = h.bindAt(`LowerArm${side}`), palm = h.bindAt(`Palm${side}`);
      if (h.body !== 'gai') h.attach(`LowerArm${side}`, along(new THREE.CylinderGeometry(0.05, 0.043, 0.09, 8), lo, palm, 0.85, M.white));
      ends[side] = { palm, dir: new THREE.Vector3().subVectors(palm, lo).normalize() };
    }

    if (withBaton) {
      if (!batonMat) {
        const cv = document.createElement('canvas'); cv.width = 4; cv.height = 32;
        const g = cv.getContext('2d')!;
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#111111' : '#f4f4ee'; g.fillRect(0, i * 4, 4, 4); }
        const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
        batonMat = new THREE.MeshLambertMaterial({ map: tex });
      }
      // gripped in the fist, carrying on the line of the forearm
      const { palm, dir } = ends.R;
      const a = palm.clone().addScaledVector(dir, 0.03).add(_v.set(0, 0, 0.025));
      const b = a.clone().addScaledVector(dir, 0.5);
      h.attach('PalmR', along(new THREE.CylinderGeometry(0.019, 0.016, 0.5, 8), a, b, 0.5, batonMat));
    }
    const { palm, dir } = ends.L;
    this.folder = mesh(new THREE.BoxGeometry(0.015, 0.23, 0.17), M.leather);
    this.folder.position.copy(palm).addScaledVector(dir, 0.13).add(_v.set(0.02, 0, 0.04));
    h.attach('PalmL', this.folder);
    this.folder.visible = false;
    h.play('Idle', { fade: 0, at: Math.random() });
  }

  private sayT = 0;
  /** Say a line: the talking clip for a while (an officer on Mixamo's skeleton), the folder kept in hand. */
  say(seconds: number): void { if (this.h.has('Talking2') && this.mode !== 'sit' && this.mode !== 'walk') this.sayT = Math.max(this.sayT, seconds); }

  setMode(m: OfficerMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.modeT = 0;
    this.folder.visible = m === 'talk';
    if (m !== 'walk') { this.path.length = 0; this.onArrive = null; }
  }

  /** Watch a world point (head first, then shoulders, then feet), or stop watching. */
  lookAt(p: THREE.Vector3 | null): void {
    if (!p) { this.look = null; return; }
    (this.look ??= new THREE.Vector3()).copy(p);
  }
  /** Turn the whole body to a heading when not watching anything. */
  faceTo(yaw: number | null): void { this.faceYaw = yaw; }

  /** Walk through world waypoints, then call back. */
  walk(points: THREE.Vector3[], done?: () => void): void {
    this.setMode('walk');
    this.path = points.map((p) => p.clone());
    this.onArrive = done ?? null;
  }
  get walking(): boolean { return this.mode === 'walk' && this.path.length > 0; }

  update(dt: number): void {
    this.t += dt;
    this.modeT += dt;
    const g = this.group, h = this.h, t = this.t;
    const R = this.arm.R, L = this.arm.L;
    // desired arm targets this frame (group space); weight 0 leaves the clip alone
    let wR = 0, wL = 0, pitch = 0, k = 9;
    const tR = _tR.set(0, 0, 0), tL = _tL.set(0, 0, 0);
    let walking = false;
    const seated = this.mode === 'sit';
    const fade = seated || h.clip === 'Sitting' || h.clip === 'Driving' ? 0 : 0.3;
    if (!seated) h.model.position.set(0, 0, 0);
    // a word said (Kuzmin's Talking clip) for a while, standing
    this.sayT = Math.max(0, this.sayT - dt);

    if (this.mode === 'walk' && this.path.length) {
      walking = true;
      const target = this.path[0];
      const dx = target.x - g.position.x, dz = target.z - g.position.z;
      const d = Math.hypot(dx, dz);
      let dy = Math.atan2(dx, dz) - g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.rotation.y += dy * Math.min(1, dt * 7);
      const slow = Math.abs(dy) > 1.2 ? 0.25 : 1;
      const step = Math.min(d, this.speed * dt * slow);
      if (d > 1e-4) { g.position.x += (dx / d) * step; g.position.z += (dz / d) * step; }
      h.play('Walk', { fade, speed: (this.speed / 1.3) * Math.max(0.5, slow) });
      if (d < 0.06) {
        this.path.shift();
        if (!this.path.length) {
          const cb = this.onArrive;
          this.onArrive = null;
          this.setMode('idle');
          cb?.();
        }
      }
    } else if (seated) {
      // at the wheel of the patrol car: Mixamo's Driving clip, or BaseHuman sat down
      h.seat(SEAT_HIPS_Y, h.has('Driving') ? 'Driving' : 'Sitting');
      // hands on the wheel, a little play
      const play = Math.sin(t * 0.9) * 0.02;
      wR = wL = 1;
      tR.set(-0.19, 0.86 + play, 0.47);
      tL.set(0.19, 0.86 - play, 0.47);
      R.pole.copy(pole('wR', -1, -1, -0.2)); L.pole.copy(pole('wL', 1, -1, -0.2));
      pitch = 0.05;
    } else {
      // writing out the receipt at the window (Kuzmin's own Texting clip: the folder in his hands), or talking
      const writing = this.mode === 'talk' && h.has('Texting');
      h.play(this.sayT > 0 && h.has('Talking') ? 'Talking2' : writing ? 'Texting' : 'Idle', { fade });
      if (writing || this.sayT > 0) { /* the clip has the arms */ } else if (this.mode === 'signal') {
        // point the baton at the driver, hold, then sweep it down to the kerb
        const cyc = (this.modeT % 1.9) / 1.9;
        const s = cyc < 0.45 ? 0 : cyc < 0.75 ? (cyc - 0.45) / 0.3 : 1 - (cyc - 0.75) / 0.25;
        const e = s * s * (3 - 2 * s);
        h.at('UpperArmR', tR).add(_o.set(-0.1 - e * 0.75, 0.22 - e * 0.95, 1 - e * 0.45).normalize().multiplyScalar(0.56));
        wR = 1; k = 12;
        R.pole.copy(pole('sR', -0.6, -1, -0.2));
      } else if (this.mode === 'salute') {
        // right hand to the cap visor
        const s = clamp(this.modeT / 0.35, 0, 1) * (this.modeT > 1.3 ? clamp((1.8 - this.modeT) / 0.4, 0, 1) : 1);
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        const ox = -0.08, oz = 0.07;
        h.at('Head', tR).add(_o.set(ox * cy + oz * sy, 0.11, -ox * sy + oz * cy));
        wR = s; k = 14;
        R.pole.copy(pole('saR', -1, -0.1, 0.25));
        pitch = -0.05 * s;
      } else if (this.mode === 'talk') {
        // folder in the left hand, the right hand gestures now and then
        tL.set(0.1, 1.06, 0.3); wL = 1;
        L.pole.copy(pole('tL', 1, -1, -0.1));
        const ges = Math.max(0, Math.sin(t * 1.3)) * Math.max(0, Math.sin(t * 0.37));
        tR.set(-0.2, 1.0 + ges * 0.2, 0.3 + ges * 0.12); wR = ges;
        R.pole.copy(pole('tR', -1, -1, 0));
        pitch = 0.12 + Math.sin(t * 2.1) * 0.04;
      } else if (Math.sin(t * 0.5) > 0.82) {
        // idle: now and then taps the baton on his palm
        const tap = Math.max(0, Math.sin(t * 9)) * 0.05;
        tR.set(-0.05, 1.0 + tap, 0.3); tL.set(0.06, 0.96, 0.28);
        wR = wL = 1;
        R.pole.copy(pole('iR', -1, -1, 0)); L.pole.copy(pole('iL', 1, -1, 0));
      }
    }

    // head turns to whatever he watches; past ~50° the shoulders, then the feet follow
    let yaw = 0;
    if (this.look && !walking) {
      let rel = Math.atan2(this.look.x - g.position.x, this.look.z - g.position.z) - g.rotation.y;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (this.mode === 'signal' || this.mode === 'talk') {
        // squares up to the driver he is addressing
        const turn = rel * Math.min(1, dt * 4);
        g.rotation.y += turn;
        rel -= turn;
      } else if (!seated && Math.abs(rel) > 0.85) {
        g.rotation.y += Math.sign(rel) * Math.min(Math.abs(rel) - 0.8, dt * 2.6);
      }
      const lim = seated ? 1.4 : 1.15;
      yaw = clamp(rel, -lim, lim);
    } else if (this.faceYaw !== null && !walking && !seated) {
      let rel = this.faceYaw - g.rotation.y;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      g.rotation.y += rel * Math.min(1, dt * 3);
    }
    if (this.mode === 'idle' && !this.look) yaw = Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.57) * 0.18;
    this.yaw = damp(this.yaw, yaw, 6, dt);
    this.pitch = damp(this.pitch, pitch, 6, dt);
    if (this.mode !== 'sit' && this.ground) g.position.y = damp(g.position.y, this.ground(g.position.x, g.position.z), 14, dt);

    h.tick(dt);
    h.look(this.yaw, this.pitch);
    for (const [a, w, tg] of [[R, wR, tR], [L, wL, tL]] as const) {
      // a fresh target snaps in while the arm is still on the clip
      if (a.w < 0.02) a.t.copy(tg); else a.t.lerp(tg, 1 - Math.exp(-k * dt));
      a.w = damp(a.w, w, k, dt);
    }
    h.reach('R', R.t, R.pole, R.w);
    h.reach('L', L.t, L.pole, L.w);
  }
}
