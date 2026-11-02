import * as THREE from 'three';
import { clamp } from '../core/math';
import { Human } from '../world/People';
import { HandRig, PoseName } from './HandRig';

/** What a hand is asked to do: go to a point, take a pose, stay a moment, let go. */
export interface ReachTask {
  hand: 'L' | 'R';
  /** Cabin-space point to touch (re-read every frame, so it can follow a moving lever). */
  target: () => THREE.Vector3;
  pose: PoseName;
  /** Seconds to stay on the control once there. */
  hold: number;
  /** Stay while this is true (horn button), in addition to `hold`. */
  until?: () => boolean;
  /** Something carried in the fingers (a cassette), shown until the hold ends; positioned in the palm's frame. */
  carry?: THREE.Object3D;
  /** Cabin-space push applied across the hold (inserting a cassette, pressing a key). */
  push?: THREE.Vector3;
  /** Which way the palm faces (cabin space); defaults to downward. */
  palm?: THREE.Vector3;
  /** Which way the straightened fingers point (cabin space); by default they carry on along the forearm. */
  fingers?: THREE.Vector3;
  /** Called when the fingers arrive. */
  onArrive?: () => void;
  /** Called when the task is over (completed or timed out). */
  then?: () => void;
  /** A label for the owner of a chain of tasks (the smoking sequence), so it can tell whether the hand is still its own. */
  tag?: string;
  /** Overrides how far past the wrist the contact point lies. */
  extent?: number;
}

/** Wrist-to-contact distance per pose: how far the hand reaches past the wrist (fingers included). */
const EXTENT: Record<PoseName, number> = {
  relaxed: 0.07, grip: 0.07, knob: 0.07, point: 0.19, pinch: 0.15, lighter: 0.07, vcig: 0.12, drag: 0.12, open: 0.1,
};
/** Seated figure constants, as in Officer: hips sit this high above the group origin. */
const SEAT_HIPS_Y = 0.465, SIT_RAW_Y = 1.1, SIT_RAW_Z = -0.6;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3();
/** How far the wrist will bend the hand off the line of the forearm, radians. */
const WRIST_BEND = 0.95;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qg = new THREE.Quaternion();
const D2R = Math.PI / 180;
/** Shoulder to wrist of a grown man, metres: the figure's arms are stretched to it. */
const ARM_LEN = 0.6;
/** Forward lean of the trunk over the wheel, radians (the trunk itself is never seen). */
const LEAN = 0.26;
/** Wrist to fingertip of the articulated rig (palm + middle finger), metres. */
const RIG_HAND = 0.193;
/**
 * What the modelled hand shows per pose, PS2-style: a mitten — the four fingers stuck together and
 * only gently bowed, the thumb laid alongside — rather than a fist wrapped round the rim or a V round
 * the cigarette, which the single finger bone of the model can only make by crumpling the skin.
 * [knuckle, finger bend, thumb fold, thumb tip], degrees.
 */
const MITTEN: Record<PoseName, [number, number, number, number]> = {
  relaxed: [18, 18, 10, 8],
  grip: [30, 34, 14, 10],
  knob: [28, 32, 14, 10],
  point: [14, 12, 12, 8],
  pinch: [20, 18, 16, 10],
  lighter: [30, 34, 8, 4],
  vcig: [12, 8, 12, 8],
  drag: [18, 10, 12, 8],
  open: [5, 3, 8, 4],
};
// elbows down and a little out, as at ten to two (group space: +X is the driver's left)
const POLE = { L: new THREE.Vector3(0.35, -1, -0.35), R: new THREE.Vector3(-0.35, -1, -0.35) };
const DOWN = new THREE.Vector3(0, -1, 0);

class Arm {
  /** Smoothed contact point, cabin space. */
  readonly pos = new THREE.Vector3();
  task: ReachTask | null = null;
  home: () => THREE.Vector3 = () => _a.set(0, 0, 0);
  homePalm: () => THREE.Vector3 = () => DOWN;
  homePose: () => PoseName = () => 'grip';
  /** Finger direction at rest (cabin space), or null to follow the forearm. */
  homeFingers: (() => THREE.Vector3) | null = null;
  /** The finger direction wanted this frame (cabin space) and how far it overrides the forearm's, 0…1. */
  readonly fingerDir = new THREE.Vector3(0, 0, -1);
  fingerW = 0;
  private t = 0;
  private arrived = false;
  private extent = 0.07;
  readonly wrist = new THREE.Vector3();
  /** The palm normal the hand wants this frame (cabin space). */
  readonly palmDir = new THREE.Vector3(0, -1, 0);
  pose: PoseName = 'grip';

  /** `size`: the figure's hand against the rig's, so contact points sit at its own fingertips. */
  constructor(private shoulder: THREE.Vector3, private holder: THREE.Object3D, private size = 1) {
    this.pos.copy(shoulder).add(new THREE.Vector3(0, -0.3, -0.4));
  }

  assign(task: ReachTask): void {
    this.task = task;
    this.task?.carry?.removeFromParent();
    this.t = 0;
    this.arrived = false;
    if (task.carry) this.holder.add(task.carry);
  }

  private finish(): void {
    const task = this.task;
    this.task = null;
    task?.carry?.removeFromParent();
    task?.then?.();
  }

  update(dt: number): void {
    const task = this.task;
    const target = _b.copy(task ? task.target() : this.home());
    if (task && this.arrived && task.push) target.addScaledVector(task.push, clamp((this.t - 0.1) / Math.max(task.hold * 0.5, 0.05), 0, 1));
    this.pose = task ? task.pose : this.homePose();
    const ext = (task ? task.extent ?? EXTENT[task.pose] : EXTENT[this.pose]) * this.size;
    this.extent += (ext - this.extent) * Math.min(1, dt * 14);
    this.palmDir.lerp(task?.palm ?? (task ? DOWN : this.homePalm()), Math.min(1, dt * 12)).normalize();
    const fingers = task ? task.fingers : this.homeFingers?.();
    this.fingerW += ((fingers ? 1 : 0) - this.fingerW) * Math.min(1, dt * 10);
    if (fingers) this.fingerDir.lerp(fingers, Math.min(1, dt * 12)).normalize();
    // ease toward the goal; fast enough to hold a moving wheel rim
    const k = task && !this.arrived ? 14 : 22;
    this.pos.lerp(target, 1 - Math.exp(-k * dt));
    if (task) {
      this.t += dt;
      if (!this.arrived && this.pos.distanceTo(target) < 0.03) { this.arrived = true; this.t = 0; task.onArrive?.(); }
      if (this.task === task) {
        if (this.arrived && this.t > task.hold && !(task.until?.())) this.finish();
        else if (!this.arrived && this.t > 2.5) this.finish();
      }
    }
    // the wrist stops short of the contact point by the length of the hand, back along the fingers
    const dir = _a.copy(this.pos).sub(this.shoulder).normalize();
    if (this.fingerW > 0.001) dir.lerp(this.fingerDir, this.fingerW).normalize();
    this.wrist.copy(this.pos).addScaledVector(dir, -this.extent);
  }
}

/**
 * The driver: Timur himself, seated — the modelled hero on the people's skeleton, in his tracksuit,
 * with the head, neck and torso cut away because the camera sits inside them (first person, as in a
 * shooter: arms and legs only). His arms are driven by IK to wherever the cab asks them to go. The
 * skeleton's hand is a palm, one bone for the four fingers and a two-part thumb, so it is posed from
 * an invisible articulated hand (HandRig): the model's palm takes the rig's frame and its fingers and
 * thumb close by the rig's joint angles, while the rig's palm, V and thumb pad stay the anchors for
 * whatever is held (a pack, a lighter, the cigarette between two fingers).
 */
export class Hands {
  readonly human: Human;
  private readonly left: Arm;
  private readonly right: Arm;
  readonly rigL: HandRig;
  readonly rigR: HandRig;
  private readonly scale: number;
  /** Per side: the palm bone's rotation relative to the hand frame (fingers +Y, back of the hand +Z). */
  private readonly off: Record<'L' | 'R', THREE.Quaternion>;
  /** Hand bones the clips leave alone, with their rest rotations (the bends are re-applied each frame). */
  private readonly rest: [THREE.Bone, THREE.Quaternion][] = [];
  /** The trunk as the Sitting clip leaves it, before the lean over the wheel. */
  private abdomen: THREE.Quaternion | null = null;
  /** The mitten's eased angles per side (see MITTEN). */
  private readonly mitten: Record<'L' | 'R', [number, number, number, number]> = { L: [...MITTEN.grip], R: [...MITTEN.grip] };

  /** `hips` is where the driver's pelvis sits in the seat; `eye` the camera, so the figure is fitted to it. */
  constructor(private parent: THREE.Object3D, hips: THREE.Vector3, eye: THREE.Vector3) {
    this.human = new Human('timur', {
      // first person: arms and legs only — no shoulders, chest or head to be seen
      // (forearms, not the upper arms, whose sleeves would loom at the edges of the view)
      keep: /LowerArm|Palm|Hand|Finger|Thumb|UpperLeg|LowerLeg|Foot/,
    });
    const h = this.human;
    // the forearm sleeve stops short of the elbow, so its cut edge never shows at the side of the view
    const elbowX = Math.abs(h.bindAt('LowerArmL').x);
    h.trim((j, p) => !j.startsWith('LowerArm') || Math.abs(p.x) > elbowX + 0.05);
    // his own hands, measured on the model: wrist to the tip of the fingers
    const handLen = h.span('PalmR', ['PalmR', 'MiddleHandR', 'FingersR']);
    const size = clamp(handLen / RIG_HAND, 0.6, 1.2);
    this.rigL = new HandRig(-1, size);
    this.rigR = new HandRig(1, size);
    this.off = { L: this.palmOffset('L'), R: this.palmOffset('R') };
    for (const S of ['L', 'R']) for (const n of ['MiddleHand', 'Fingers', 'Thumb1', 'Thumb2']) {
      const b = h.bone(`${n}${S}`);
      if (b) this.rest.push([b, b.quaternion.clone()]);
    }
    // the modelled figure has a long body and short arms for a man of 1.8 m: arms to true length,
    // all of it in the upper arm (the baggy sleeve stretches out of sight, the cuff in view stays true),
    // the spine fitted to the seat below
    for (const S of ['L', 'R']) {
      const l1 = h.bindAt(`LowerArm${S}`).distanceTo(h.bindAt(`UpperArm${S}`)), l2 = h.bindAt(`Palm${S}`).distanceTo(h.bindAt(`LowerArm${S}`));
      h.bone(`LowerArm${S}`)?.position.multiplyScalar(clamp((ARM_LEN - l2) / l1, 1, 1.8));
    }
    h.play('Sitting', { fade: 0, once: true, at: 1 });
    h.model.position.set(0, SEAT_HIPS_Y - SIT_RAW_Y * h.s, -SIT_RAW_Z * h.s);
    h.tick(0.01);
    // fit: head centre a little below the camera, hips on the seat; past a sensible build the spine
    // gives way instead (the torso is cut away, only where the shoulders end up matters)
    const rise = h.at('Head').y - SEAT_HIPS_Y;
    this.scale = clamp((eye.y - 0.07 - hips.y) / Math.max(0.3, rise), 0.92, 1.05);
    const want = (eye.y - 0.07 - hips.y) / this.scale;
    if (rise > want) {
      const f = clamp(1 - (rise - want) / Math.max(0.2, h.at('Neck').y - h.at('Hips').y), 0.5, 1);
      for (const n of ['Abdomen', 'Torso']) h.bone(n)?.position.multiplyScalar(f);
      h.tick(0.01);
    }
    const head = h.at('Head');
    h.group.scale.setScalar(this.scale);
    h.group.rotation.y = Math.PI;
    // the figure faces -Z in the cab; put its head under the camera in x/z
    h.group.position.set(eye.x + head.x * this.scale, hips.y - SEAT_HIPS_Y * this.scale, eye.z + head.z * this.scale);
    h.hideBones(['Head', 'Neck']);
    const ab = h.bone('Abdomen');
    if (ab) { this.abdomen = ab.quaternion.clone(); this.lean(); }
    // the rigs only steer the modelled hands and carry things; their own skin stays hidden
    h.group.add(this.rigL.group, this.rigR.group);
    this.rigL.setSkinVisible(false); this.rigR.setSkinVisible(false);
    this.rigL.setPose('grip'); this.rigR.setPose('grip');
    this.rigL.snap(); this.rigR.snap();
    // the driver is seen by his own eyes only: the mirrors would show a headless man
    h.group.traverse((o) => o.layers.set(2));
    parent.add(h.group);
    h.tick(0.01);
    // shoulder positions in cabin space
    const sh = (n: string) => this.toCabin(h.at(n), new THREE.Vector3());
    this.left = new Arm(sh('UpperArmL'), this.rigL.palm, size);
    this.right = new Arm(sh('UpperArmR'), this.rigR.palm, size);
  }

  /**
   * The palm bone against the hand frame, from the bind pose: the model was made in a T-pose with
   * the palms down, so the fingers run out along the arm and the backs of the hands face up.
   */
  private palmOffset(S: 'L' | 'R'): THREE.Quaternion {
    const h = this.human;
    const bind = h.bindFrame(`Palm${S}`);
    const q = new THREE.Quaternion();
    if (!bind) return q;
    bind.decompose(_a, q, _b);
    const f = h.bindAt(`Fingers${S}`).sub(h.bindAt(`Palm${S}`)).normalize();
    const z = new THREE.Vector3(0, 1, 0).addScaledVector(f, -f.y).normalize();
    const x = new THREE.Vector3().crossVectors(f, z);
    const frame = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, f, z));
    return frame.invert().multiply(q);
  }

  /** Lean the trunk forward over the wheel (re-applied on top of the clip every frame). */
  private lean(): void {
    const ab = this.human.bone('Abdomen');
    if (!ab || !this.abdomen) return;
    ab.quaternion.copy(this.abdomen);
    this.human.spin('Abdomen', _d.set(1, 0, 0), LEAN);
  }

  /** Group space → cabin space (the group is turned round and scaled). */
  private toCabin(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const g = this.human.group;
    return out.set(g.position.x - p.x * this.scale, g.position.y + p.y * this.scale, g.position.z - p.z * this.scale);
  }

  private toGroup(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const g = this.human.group;
    return out.set(-(p.x - g.position.x) / this.scale, (p.y - g.position.y) / this.scale, -(p.z - g.position.z) / this.scale);
  }

  /** A direction, cabin → group space (rotation by half a turn about Y). */
  private dirToGroup(d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 { return out.set(-d.x, d.y, -d.z); }

  setHome(hand: 'L' | 'R', fn: () => THREE.Vector3, palm?: () => THREE.Vector3, pose?: () => PoseName, fingers?: () => THREE.Vector3): void {
    const a = hand === 'L' ? this.left : this.right;
    a.home = fn;
    if (palm) a.homePalm = palm;
    if (pose) a.homePose = pose;
    if (fingers) a.homeFingers = fingers;
  }

  reach(task: ReachTask): void { (task.hand === 'L' ? this.left : this.right).assign(task); }

  busy(hand: 'L' | 'R'): boolean { return (hand === 'L' ? this.left : this.right).task !== null; }

  /** The articulated hand itself (its palm, V and thumb are anchors for held things). */
  rigOf(hand: 'L' | 'R'): HandRig { return hand === 'L' ? this.rigL : this.rigR; }

  /** The task a hand is on, if any (to see whether a chain is still its own). */
  taskOf(hand: 'L' | 'R'): ReachTask | null { return (hand === 'L' ? this.left : this.right).task; }

  update(dt: number): void {
    this.left.update(dt);
    this.right.update(dt);
    const h = this.human;
    h.tick(dt);
    this.lean();
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.arm(this.left, this.rigL, 'L', dt);
    this.arm(this.right, this.rigR, 'R', dt);
  }

  /** IK the arm to the wrist, then seat the articulated hand on it, palm turned as asked. */
  private arm(a: Arm, rig: HandRig, side: 'L' | 'R', dt: number): void {
    const h = this.human;
    h.reach(side, this.toGroup(a.wrist, _a), POLE[side], 1);
    const wrist = h.at(`Palm${side}`, _c);
    const elbow = h.at(`LowerArm${side}`, _d);
    const f = _a.copy(wrist).sub(elbow).normalize();
    if (a.fingerW > 0.001) {
      // the wrist bends the hand toward the finger direction asked for, as far as a wrist goes
      const fd = this.dirToGroup(a.fingerDir, _e).normalize();
      const ang = f.angleTo(fd);
      if (ang > WRIST_BEND) fd.copy(_f.copy(f).lerp(fd, WRIST_BEND / ang)).normalize();
      f.lerp(fd, a.fingerW).normalize();
    }
    // the palm normal wanted, turned into the plane square to the fingers
    const want = this.dirToGroup(a.palmDir, _b);
    const n = want.addScaledVector(f, -want.dot(f));
    if (n.lengthSq() < 1e-6) n.set(0, -1, 0).addScaledVector(f, f.y);
    n.normalize();
    // back of the hand = -palm normal; X completes a right-handed frame (Y fingers, Z back of hand)
    const z = n.clone().negate();
    const x = new THREE.Vector3().crossVectors(f, z).normalize();
    _m.makeBasis(x, f.clone(), z);
    rig.group.quaternion.setFromRotationMatrix(_m);
    rig.group.position.copy(wrist);
    rig.setPose(a.pose);
    rig.update(dt);
    const m = this.mitten[side], goal = MITTEN[a.pose], k = 1 - Math.exp(-14 * dt);
    for (let i = 0; i < 4; i++) m[i] += (goal[i] - m[i]) * k;
    this.poseHand(side, rig, x, f);
  }

  /** Lay the model's hand into the rig's frame and bow its fingers and thumb as a mitten. */
  private poseHand(side: 'L' | 'R', rig: HandRig, x: THREE.Vector3, f: THREE.Vector3): void {
    const h = this.human;
    const palm = h.bone(`Palm${side}`);
    if (!palm) return;
    // the palm bone's rotation in group space is the hand frame times the bind offset
    const want = _q.copy(rig.group.quaternion).multiply(this.off[side]);
    palm.parent!.getWorldQuaternion(_qp);
    h.group.getWorldQuaternion(_qg);
    _qp.premultiply(_qg.invert());
    palm.quaternion.copy(_qp.invert().multiply(want));
    palm.updateMatrixWorld(true);
    // one bone carries all four fingers, kept together as one gently bowed block
    const [knuckle, middle, fold, tip] = this.mitten[side];
    // fingers close toward the palm: about the knuckle axis, away from the back of the hand
    h.spin(`MiddleHand${side}`, x, -knuckle * D2R);
    h.spin(`Fingers${side}`, x, -middle * D2R);
    // the thumb lies along the side of the hand (its side is mirrored between the hands)
    const s = side === 'R' ? -1 : 1;
    h.spin(`Thumb1${side}`, f, s * fold * D2R);
    h.spin(`Thumb2${side}`, f, s * (tip + rig.flick * 18) * D2R);
  }
}
