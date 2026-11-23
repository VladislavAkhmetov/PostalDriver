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
  /** Recover if the hand cannot reach the requested contact. */
  onTimeout?: () => void;
  /** A label for the owner of a chain of tasks (the smoking sequence), so it can tell whether the hand is still its own. */
  tag?: string;
  /** Overrides how far past the wrist the contact point lies. */
  extent?: number;
  /** Keep the fingers attached to a moving control after taking hold. */
  follow?: boolean;
  /** A held object's contact point to place on the target, accounting for the solved wrist rotation. */
  contact?: THREE.Object3D;
}

/** Wrist-to-contact distance per pose: how far the hand reaches past the wrist (fingers included). */
const EXTENT: Record<PoseName, number> = {
  relaxed: 0.07, grip: 0.07, knob: 0.07, point: 0.19, pinch: 0.15, lighter: 0.07, vcig: 0.12, drag: 0.12, open: 0.1,
};
/** Hips above the seated figure's group origin. */
const SEAT_HIPS_Y = 0.465;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3();
/** How far the wrist will bend the hand off the line of the forearm, radians. */
const WRIST_BEND = 0.95;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qg = new THREE.Quaternion();
const D2R = Math.PI / 180;
const BEND_AXIS = new THREE.Vector3(1, 0, 0);
const MITTEN_BONES = ['MiddleHand', 'Fingers', 'Thumb1', 'Thumb2'] as const;
/** Centre of the rim relative to the wrist, along the palm and under its skin. */
const RIM_CONTACT = new THREE.Vector3(0, 0.076, -0.032);
/** Shoulder to wrist of a grown man, metres: the figure's arms are stretched to it. */
const ARM_LEN = 0.6;
/** Forward lean of the trunk over the wheel, radians (the trunk itself is never seen). */
const LEAN = 0.26;
/** Wrist to fingertip of the articulated rig (palm + middle finger), metres. */
const RIG_HAND = 0.193;
/**
 * The four fingers curl together, with two joints for the thumb.
 * [knuckle, finger bend, thumb fold, thumb tip], degrees.
 */
const MITTEN: Record<PoseName, [number, number, number, number]> = {
  relaxed: [18, 18, 10, 8],
  grip: [24, 27, 11, 10],
  knob: [25, 27, 14, 10],
  point: [14, 12, 12, 8],
  pinch: [20, 18, 16, 10],
  lighter: [34, 32, 6, 4],
  vcig: [17, 13, 18, 12],
  drag: [17, 13, 18, 12],
  open: [5, 3, 8, 4],
};
// elbows down and a little out, as at ten to two (group space: +X is the driver's left)
const POLE = { L: new THREE.Vector3(0.35, -1, -0.35), R: new THREE.Vector3(-0.35, -1, -0.35) };
const DOWN = new THREE.Vector3(0, -1, 0);

class Arm {
  /** Smoothed contact point, cabin space. */
  readonly pos = new THREE.Vector3();
  readonly target = new THREE.Vector3();
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
  private returning = true;
  extent = 0.07;
  readonly wrist = new THREE.Vector3();
  /** The palm normal the hand wants this frame (cabin space). */
  readonly palmDir = new THREE.Vector3(0, -1, 0);
  pose: PoseName = 'grip';

  /** `size`: the figure's hand against the rig's, so contact points sit at its own fingertips. */
  constructor(readonly shoulder: THREE.Vector3, private holder: THREE.Object3D, private size = 1) {
    this.pos.copy(shoulder).add(new THREE.Vector3(0, -0.3, -0.4));
  }

  assign(task: ReachTask): void {
    this.task?.carry?.removeFromParent();
    this.task = task;
    this.t = 0;
    this.arrived = false;
    if (task.carry) this.holder.add(task.carry);
  }

  private finish(timedOut = false): void {
    const task = this.task;
    this.task = null;
    this.returning = true;
    task?.carry?.removeFromParent();
    (timedOut ? task?.onTimeout ?? task?.then : task?.then)?.();
  }

  update(dt: number): void {
    const task = this.task;
    const target = this.target.copy(task ? task.target() : this.home());
    if (task && this.arrived && task.push) target.addScaledVector(task.push, clamp((this.t - 0.1) / Math.max(task.hold * 0.5, 0.05), 0, 1));
    this.pose = task ? task.pose : this.homePose();
    const ext = (task ? task.extent ?? EXTENT[task.pose] : EXTENT[this.pose]) * this.size;
    this.extent += (ext - this.extent) * Math.min(1, dt * 14);
    const seated = !task && !this.returning;
    this.palmDir.lerp(task?.palm ?? (task ? DOWN : this.homePalm()), seated ? 1 : Math.min(1, dt * 12)).normalize();
    const fingers = task ? task.fingers : this.homeFingers?.();
    this.fingerW += ((fingers ? 1 : 0) - this.fingerW) * (seated ? 1 : Math.min(1, dt * 10));
    if (fingers) this.fingerDir.lerp(fingers, seated ? 1 : Math.min(1, dt * 12)).normalize();
    // Once back on the wheel, track its moving contact without a smoothing delay.
    const k = task && !this.arrived ? 14 : 22;
    if (seated || (task?.follow && this.arrived)) this.pos.copy(target);
    else this.pos.lerp(target, 1 - Math.exp(-k * dt));
    if (!task && this.pos.distanceToSquared(target) < 0.0001) this.returning = false;
    // the wrist stops short of the contact point by the length of the hand, back along the fingers
    const dir = _a.copy(this.pos).sub(this.shoulder).normalize();
    if (this.fingerW > 0.001) dir.lerp(this.fingerDir, this.fingerW).normalize();
    this.wrist.copy(this.pos).addScaledVector(dir, -this.extent);
  }

  complete(dt: number, contactDistance: number): void {
    const task = this.task;
    if (!task) return;
    this.t += dt;
    const reached = task.contact ? contactDistance < 0.004 : this.pos.distanceToSquared(this.target) < 0.0009;
    if (!this.arrived && reached) { this.arrived = true; this.t = 0; task.onArrive?.(); }
    if (this.task !== task) return;
    if (this.arrived && this.t > task.hold && !(task.until?.())) this.finish();
    else if (!this.arrived && this.t > 2.5) this.finish(true);
  }
}

/**
 * The driver: Timur himself, seated — the modelled hero on the people's skeleton, in his tracksuit,
 * with the head, neck and torso cut away because the camera sits inside them (first person, as in a
 * shooter: arms and legs only). His arms are driven by IK to wherever the cab asks them to go. The
 * wrist frame drives the visible Mixamo hand. The invisible rig still carries the pack, lighter
 * and cassette. The cigarette follows the visible knuckle as it closes against the thumb.
 */
export class Hands {
  /** Additional lean toward the driver's window, 0…1. */
  windowLean = 0;
  readonly human: Human;
  private readonly left: Arm;
  private readonly right: Arm;
  readonly rigL: HandRig;
  readonly rigR: HandRig;
  readonly cigaretteGrip = new THREE.Object3D();
  private readonly scale: number;
  /** Per side: the palm bone's rotation relative to the hand frame (fingers +Y, back of the hand +Z). */
  private readonly off: Record<'L' | 'R', THREE.Quaternion>;
  /** Hand bones the clips leave alone, with their rest rotations (the bends are re-applied each frame). */
  private readonly rest: Record<'L' | 'R', [THREE.Bone, THREE.Quaternion][]> = { L: [], R: [] };
  /** The trunk as the Sitting clip leaves it, before the lean over the wheel. */
  private abdomen: THREE.Quaternion | null = null;
  /** The mitten's eased angles per side (see MITTEN). */
  private readonly mitten: Record<'L' | 'R', [number, number, number, number]> = { L: [...MITTEN.grip], R: [...MITTEN.grip] };

  /** `hips` is where the driver's pelvis sits in the seat; `eye` the camera, so the figure is fitted to it. */
  constructor(parent: THREE.Object3D, hips: THREE.Vector3, eye: THREE.Vector3) {
    this.human = new Human('timur', {
      // first person: arms and legs only — no shoulders, chest or head to be seen
      // (forearms, not the upper arms, whose sleeves would loom at the edges of the view)
      keep: /LowerArm|Palm|Hand|Finger|Thumb|UpperLeg|LowerLeg|Foot|Toe/,
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
    for (const S of ['L', 'R'] as const) for (const n of MITTEN_BONES) {
      const b = h.bone(`${n}${S}`);
      this.rest[S].push([b, b.quaternion.clone()]);
    }
    // Seat the shaft in the groove between the index and middle fingers on the mitten mesh.
    this.cigaretteGrip.name = 'CigaretteGrip';
    const groove = new THREE.Object3D();
    const shaft = new THREE.Vector3(-0.12, 1, 0.02).normalize();
    groove.position.copy(h.bindAt('PalmR')).addScaledVector(new THREE.Vector3(-0.087, 0.003, 0.011), h.s);
    groove.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shaft);
    h.attach('FingersR', groove).add(this.cigaretteGrip);
    // the modelled figure has a long body and short arms for a man of 1.8 m: arms to true length,
    // all of it in the upper arm (the baggy sleeve stretches out of sight, the cuff in view stays true),
    // the spine fitted to the seat below
    for (const S of ['L', 'R']) {
      const l1 = h.bindAt(`LowerArm${S}`).distanceTo(h.bindAt(`UpperArm${S}`)), l2 = h.bindAt(`Palm${S}`).distanceTo(h.bindAt(`LowerArm${S}`));
      h.bone(`LowerArm${S}`)?.position.multiplyScalar(clamp((ARM_LEN - l2) / l1, 1, 1.8));
    }
    h.seat(SEAT_HIPS_Y);
    h.play('Sitting', { speed: 0 });
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
    this.human.spin('Abdomen', _d.set(1, 0, 0), LEAN + this.windowLean * 0.14);
    this.human.spin('Abdomen', _d.set(0, 0, -1), this.windowLean * 0.18);
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

  setCigaretteLength(length: number): void {
    this.cigaretteGrip.position.y = -Math.min(0.027, length * 0.55) / this.scale;
  }

  /** The task a hand is on, if any (to see whether a chain is still its own). */
  taskOf(hand: 'L' | 'R'): ReachTask | null { return (hand === 'L' ? this.left : this.right).task; }

  update(dt: number): void {
    const h = this.human;
    h.tick(dt);
    this.lean();
    this.toCabin(h.at('UpperArmL', _a), this.left.shoulder);
    this.toCabin(h.at('UpperArmR', _a), this.right.shoulder);
    this.left.update(dt);
    this.right.update(dt);
    this.arm(this.left, this.rigL, 'L', dt);
    this.arm(this.right, this.rigR, 'R', dt);
  }

  /** IK the arm to the wrist, then seat the articulated hand on it, palm turned as asked. */
  private arm(a: Arm, rig: HandRig, side: 'L' | 'R', dt: number): void {
    const h = this.human;
    h.reach(side, this.toGroup(a.wrist, _a), POLE[side], 1);
    if (a.task?.follow && !a.task.contact) {
      // Refine the wrist against the solved forearm, so the grip stays on the knob
      // throughout the circle instead of drifting by the length of the fingers.
      for (let i = 0; i < 3; i++) {
        const forward = h.at(`Palm${side}`, _c).sub(h.at(`LowerArm${side}`, _d)).normalize();
        const target = this.toGroup(a.pos, _e).addScaledVector(forward, -a.extent / this.scale);
        h.reach(side, target, POLE[side], 1);
      }
    }
    this.seatRig(a, rig, side);
    const m = this.mitten[side], goal = MITTEN[a.pose], k = 1 - Math.exp(-18 * dt);
    for (let i = 0; i < 4; i++) m[i] += (goal[i] - m[i]) * k;
    this.poseHand(side, rig);
    const contact = a.task?.contact;
    let contactDistance = Infinity;
    if (contact || !a.task) {
      const target = this.toGroup(a.pos, new THREE.Vector3());
      const point = new THREE.Vector3(), wrist = new THREE.Vector3();
      // Match the moving rim or the actual prop contact after orienting the wrist and fingers.
      for (let i = 0; i <= (contact ? 6 : 2); i++) {
        if (contact) h.group.worldToLocal(contact.getWorldPosition(point));
        else point.copy(RIM_CONTACT).applyQuaternion(rig.group.quaternion).add(rig.group.position);
        contactDistance = point.distanceTo(target) * this.scale;
        if (contactDistance < 0.0005 || i === (contact ? 6 : 2)) break;
        h.at(`Palm${side}`, wrist).add(target).sub(point);
        h.reach(side, wrist, POLE[side], 1);
        this.seatRig(a, rig, side);
        this.poseHand(side, rig);
      }
    }
    rig.setPose(a.pose);
    rig.update(dt);
    a.complete(dt, contactDistance + a.pos.distanceTo(a.target));
  }

  /** Seat the hand on the current IK wrist and apply its requested orientation. */
  private seatRig(a: Arm, rig: HandRig, side: 'L' | 'R'): void {
    const h = this.human;
    const wrist = h.at(`Palm${side}`, _c);
    const elbow = h.at(`LowerArm${side}`, _d);
    const f = _a.copy(wrist).sub(elbow).normalize();
    if (a.fingerW > 0.001) {
      // the wrist bends the hand toward the finger direction asked for, as far as a wrist goes
      const fd = this.dirToGroup(a.fingerDir, _e).normalize();
      const ang = f.angleTo(fd);
      if (a.task && !a.task.contact && ang > WRIST_BEND) fd.copy(_f.copy(f).lerp(fd, WRIST_BEND / ang)).normalize();
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
  }

  /** Lay the model's hand into the rig's frame and bow its fingers and thumb as a mitten. */
  private poseHand(side: 'L' | 'R', rig: HandRig): void {
    const h = this.human;
    const palm = h.bone(`Palm${side}`);
    // the palm bone's rotation in group space is the hand frame times the bind offset
    const want = _q.copy(rig.group.quaternion).multiply(this.off[side]);
    palm.parent!.getWorldQuaternion(_qp);
    h.group.getWorldQuaternion(_qg);
    _qp.premultiply(_qg.invert());
    palm.quaternion.copy(_qp.invert().multiply(want));
    const angles = this.mitten[side];
    for (const [i, [bone, rest]] of this.rest[side].entries()) {
      const bend = angles[i] + (i === 3 ? rig.flick * 18 : 0);
      bone.quaternion.copy(rest).multiply(_q.setFromAxisAngle(BEND_AXIS, -bend * D2R));
    }
    palm.updateMatrixWorld(true);
  }
}
