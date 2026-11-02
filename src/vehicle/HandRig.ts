import * as THREE from 'three';

/**
 * An articulated right (or, mirrored, left) hand with real proportions: a tapered palm,
 * four fingers of three phalanges each, a thumb of metacarpal + two phalanges. Every joint
 * bends the way a joint does — fingers flex about the knuckle axis toward the palm, with a
 * little splay; the thumb swings out from the wrist before it flexes — so grips, pinches
 * and the V of a held cigarette are made from joint angles, not from bent boxes.
 *
 * Local frame: wrist at the origin, fingers along +Y, the back of the hand toward +Z, the
 * palm toward -Z. For a right hand the thumb is on -X (mirror the hand for a left one).
 */

/** Joint angles in degrees: per finger [knuckle, middle joint, tip joint, splay]; thumb [abduct, flex, knuckle, tip]. */
export interface HandPose { f: [number, number, number, number][]; t: [number, number, number, number] }

const P = (idx: [number, number, number, number], mid: [number, number, number, number], ring: [number, number, number, number], pinky: [number, number, number, number], t: [number, number, number, number]): HandPose => ({ f: [idx, mid, ring, pinky], t });

export const POSES = {
  // arm hanging, fingers loosely curled
  relaxed: P([22, 28, 14, -2], [28, 34, 16, 0], [34, 38, 18, 2], [40, 42, 22, 5], [10, 14, 10, 12]),
  // around a wheel rim or a lever shaft: a closed fist with the thumb across
  grip: P([68, 88, 52, -2], [72, 92, 56, 0], [76, 94, 56, 2], [78, 92, 52, 4], [12, 44, 26, 38]),
  // a bunched fist on a knob
  knob: P([62, 82, 48, -3], [66, 86, 52, 0], [70, 88, 52, 3], [72, 86, 48, 6], [10, 40, 24, 34]),
  // index out, the rest curled, thumb over them: pressing a toggle or a button
  point: P([8, 6, 4, -2], [84, 100, 60, 0], [88, 100, 58, 2], [88, 96, 54, 4], [8, 48, 30, 32]),
  // thumb and index tips meeting, the others loose behind: a pack, a cassette, a lighter, a sheet
  pinch: P([38, 44, 22, -4], [48, 52, 28, 0], [56, 60, 32, 3], [62, 66, 36, 6], [16, 40, 26, 26]),
  // holding a lighter in the fist with the thumb on its wheel
  lighter: P([58, 76, 40, -2], [62, 80, 44, 0], [68, 84, 46, 2], [72, 84, 46, 4], [6, 18, 6, 4]),
  // a cigarette between index and middle: the two straighten and part a little, the others curl, thumb supports
  vcig: P([26, 22, 8, 9], [28, 24, 10, -6], [82, 98, 58, 2], [86, 100, 60, 4], [10, 42, 28, 26]),
  // the same, drawn up to the lips: knuckles higher, fingers bowed
  drag: P([44, 30, 12, 8], [46, 32, 12, -6], [84, 100, 60, 2], [88, 102, 62, 4], [10, 42, 28, 26]),
  open: P([8, 6, 4, -4], [8, 6, 4, -1], [8, 6, 4, 2], [8, 6, 4, 6], [28, 8, 5, 5]),
} satisfies Record<string, HandPose>;
export type PoseName = keyof typeof POSES;

const D2R = Math.PI / 180;
const SKIN = '#c4977a';

/** Real-world lengths (m): [proximal, middle, distal] and knuckle x, for index…little finger. */
const FINGERS = [
  { x: -0.0295, len: [0.042, 0.024, 0.02], r: 0.0092 },
  { x: -0.0098, len: [0.046, 0.028, 0.021], r: 0.0096 },
  { x: 0.0098, len: [0.043, 0.026, 0.02], r: 0.0088 },
  { x: 0.0285, len: [0.034, 0.019, 0.018], r: 0.0078 },
];
const PALM_W = 0.08, PALM_L = 0.098, PALM_T = 0.027;

interface Joint { g: THREE.Group; splay?: THREE.Group }

export class HandRig {
  readonly group = new THREE.Group();
  /** Palm centre, where a held pack or lighter sits (local frame). */
  readonly palm = new THREE.Group();
  /** The V between the index and middle fingers, where a cigarette is held: rotates with the index finger. */
  readonly vee = new THREE.Group();
  /** The thumb's pad, where a lighter's wheel is worked. */
  readonly thumbTip = new THREE.Group();
  private fingers: { k: Joint; p: Joint; d: Joint }[] = [];
  private thumb: { c: THREE.Group; cz: THREE.Group; m: THREE.Group; i: THREE.Group };
  private cur: HandPose;
  private goal: HandPose;
  /** Flick of the thumb on a lighter wheel, 0…1 (adds to the thumb's tip bend). */
  flick = 0;

  /** The rig's own skin: hidden when a modelled hand is posed from it and only its anchors are wanted. */
  private readonly skin: THREE.Object3D[] = [];

  /** `size` scales the hand to fit a figure's own; the anchors stay at true scale for what they hold. */
  constructor(readonly side: 1 | -1, size = 1) {
    const skin = new THREE.MeshLambertMaterial({ color: SKIN });
    const nail = new THREE.MeshLambertMaterial({ color: '#d9bba6' });
    // palm: a slab tapered toward the wrist
    const palmGeo = new THREE.BoxGeometry(PALM_W, PALM_L, PALM_T);
    const pos = palmGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + PALM_L / 2;
      const k = 0.72 + 0.28 * Math.min(1, y / (PALM_L * 0.55));
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * (0.85 + 0.15 * Math.min(1, y / (PALM_L * 0.5))));
    }
    palmGeo.computeVertexNormals();
    const palm = new THREE.Mesh(palmGeo, skin);
    palm.position.y = PALM_L / 2;
    this.group.add(palm);
    this.palm.position.set(0, PALM_L * 0.5, -PALM_T / 2);
    this.group.add(this.palm);
    // the jacket cuff and a pale shirt cuff under it, where the sleeve ends
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.02, 10), new THREE.MeshLambertMaterial({ color: '#34435a' }));
    cuff.position.y = -0.002;
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.014, 10), new THREE.MeshLambertMaterial({ color: '#d8d4c6' }));
    shirt.position.y = 0.012;
    this.group.add(cuff, shirt);
    // heel of the thumb
    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), skin);
    heel.scale.set(1, 1.5, 0.9);
    heel.position.set(-0.026, 0.03, -0.004);
    this.group.add(heel);

    const seg = (len: number, r: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, len, 8, 1), skin);
      m.position.y = len / 2;
      return m;
    };
    const ball = (r: number): THREE.Mesh => new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), skin);
    for (const F of FINGERS) {
      const k = new THREE.Group(); k.position.set(F.x, PALM_L, 0);
      const splay = new THREE.Group(); k.add(splay);
      const prox = seg(F.len[0], F.r); splay.add(prox, ball(F.r));
      const p = new THREE.Group(); p.position.y = F.len[0]; splay.add(p);
      p.add(seg(F.len[1], F.r * 0.93), ball(F.r * 0.93));
      const d = new THREE.Group(); d.position.y = F.len[1]; p.add(d);
      d.add(seg(F.len[2], F.r * 0.86), ball(F.r * 0.86));
      // fingernail on the back of the tip, and a rounded pad
      const tipB = ball(F.r * 0.86); tipB.position.y = F.len[2]; d.add(tipB);
      const n = new THREE.Mesh(new THREE.BoxGeometry(F.r * 1.3, F.len[2] * 0.55, 0.0015), nail);
      n.position.set(0, F.len[2] * 0.62, F.r * 0.84);
      d.add(n);
      this.group.add(k);
      this.fingers.push({ k: { g: splay, splay }, p: { g: p }, d: { g: d } });
      if (F === FINGERS[0]) this.fingerIndex = { k, splay };
    }
    // the V: at the base of the index and middle fingers, between their first phalanges
    this.vee.position.set(0.0, 0.021, -0.006);
    this.fingers[0].k.g.add(this.vee);
    this.vee.position.x = (FINGERS[1].x - FINGERS[0].x) / 2;

    // thumb: metacarpal swings out of the wrist (abduction about Z, flexion about X), then two phalanges
    const c = new THREE.Group(); c.position.set(-0.03, 0.012, -0.004);
    const cz = new THREE.Group(); c.add(cz);
    const mc = seg(0.046, 0.0105); cz.add(mc, ball(0.0105));
    const m = new THREE.Group(); m.position.y = 0.046; cz.add(m);
    m.add(seg(0.034, 0.0098), ball(0.0098));
    const i = new THREE.Group(); i.position.y = 0.034; m.add(i);
    i.add(seg(0.028, 0.0088), ball(0.0088));
    const tb = ball(0.0088); tb.position.y = 0.028; i.add(tb);
    const tn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.0015), nail); tn.position.set(0, 0.021, 0.0085); i.add(tn);
    this.thumbTip.position.set(0, 0.028, -0.006);
    i.add(this.thumbTip);
    this.group.add(c);
    this.thumb = { c, cz, m, i };
    this.cur = JSON.parse(JSON.stringify(POSES.relaxed));
    this.goal = JSON.parse(JSON.stringify(POSES.relaxed));
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.skin.push(o); });
    if (size !== 1) {
      const inner = new THREE.Group();
      inner.scale.setScalar(size);
      for (const c of [...this.group.children]) inner.add(c);
      this.group.add(inner);
      for (const a of [this.palm, this.vee, this.thumbTip]) a.scale.setScalar(1 / size);
    }
    // a left hand is the mirror image
    this.group.scale.x = side;
    this.apply();
  }

  /** Show or hide the rig's own palm, fingers and cuff (not what it carries). */
  setSkinVisible(on: boolean): void { for (const m of this.skin) m.visible = on; }

  /** The current joint angles, eased toward the goal pose (degrees, as in `POSES`). */
  get current(): HandPose { return this.cur; }

  private fingerIndex!: { k: THREE.Group; splay: THREE.Group };

  setPose(name: PoseName): void { this.goal = POSES[name]; }

  /** Ease the joints toward the goal pose. */
  update(dt: number): void {
    const k = 1 - Math.exp(-14 * dt);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) this.cur.f[i][j] += (this.goal.f[i][j] - this.cur.f[i][j]) * k;
    for (let j = 0; j < 4; j++) this.cur.t[j] += (this.goal.t[j] - this.cur.t[j]) * k;
    this.apply();
  }

  /** Jump straight to the goal (a hand that has just appeared). */
  snap(): void {
    this.cur = JSON.parse(JSON.stringify(this.goal));
    this.apply();
  }

  private apply(): void {
    this.fingers.forEach((f, i) => {
      const a = this.cur.f[i];
      f.k.g.rotation.set(-a[0] * D2R, 0, a[3] * D2R * 0.5);
      f.p.g.rotation.x = -a[1] * D2R;
      f.d.g.rotation.x = -a[2] * D2R;
    });
    const t = this.cur.t;
    // abduction about Z swings the thumb out of the palm plane, flexion about X folds it across
    this.thumb.cz.rotation.set(-t[1] * D2R * 0.9, 0, t[0] * D2R * 0.9 + 0.2);
    this.thumb.m.rotation.set(-t[2] * D2R, 0, 0);
    this.thumb.i.rotation.set(-(t[3] + this.flick * 40) * D2R, 0, 0);
  }
}
