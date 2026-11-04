import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math';
import type { Ground } from '../world/Ground';
import { Human } from '../world/People';
import { Officer } from '../world/Officer';
import type { Collider } from '../world/Props';
import { buildUaz } from '../world/Uaz';
import type { VehicleModel } from '../world/Vehicles';

/**
 * Short cutscenes outside the cab (a few seconds, the camera's angle picked at random: from above
 * or from the side): Timur at the van's front wheel with a spanner, or bent over the open hatch at
 * its front topping the radiator up from the canister; Timur and the inspector by the patrol car
 * settling a fine. The van seen is a stand-in exterior at our van's own pose (the cab is hidden),
 * the people are stand-ins too: Timur (the `hero` model) and sergeant Kuzmin on Mixamo's skeleton
 * and clips — talking, the handshake, Kuzmin writing the receipt — and the work posed by hand on the
 * idle and sitting clips (two-bone IK for the arms, the spine bent forward). The caller lends the camera and gets it back when it is over.
 */
export type CutKind = 'wheel' | 'hood' | 'fine';

/** Our van as the cab stands in the world (Vehicle's frame: the cab faces −Z, the body H0 over the ground). */
export interface VanPose { x: number; y: number; z: number; yaw: number; pitch?: number; roll?: number }
/** The patrol car as its model stands (+Z forward). */
export interface CarPose { x: number; z: number; yaw: number; width: number; length: number }

export interface CutPlay {
  kind: CutKind;
  van: VanPose;
  car?: CarPose;
  seconds: number;
  /** For a fine: money slipped «без квитанции» (a banknote in hand) rather than the papers. */
  bribe?: boolean;
  /** Runs halfway through (the repair done, the time spent), and at the end. */
  mid?: () => void;
  done?: () => void;
}

type Shot = 'top' | 'side';

/** An upturned bucket by the wheel: the hips this high. */
const BUCKET_HIPS = 0.42;

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Cutscene {
  private cur: CutPlay | null = null;
  private t = 0;
  private midDone = false;
  private shot: Shot = 'side';
  private readonly root = new THREE.Group();
  /** The stand-in van: cab frame outside, the exterior model inside (as the door mirrors see it). */
  private readonly vanFrame = new THREE.Group();
  private readonly van: VehicleModel;
  private readonly timur: Human;
  private readonly officer: Officer;
  private readonly props: Record<'spanner' | 'canister' | 'bucket' | 'hatch' | 'note', THREE.Object3D>;
  /** Where the scene happens, world space: the point the camera frames, the line of the action, the side to film from. */
  private focus = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private side = new THREE.Vector3();
  private spin0 = 0;
  private phase = -1;
  /** Points the hands work at (world). */
  private work = new THREE.Vector3();
  private workN = new THREE.Vector3();
  private hidden: [THREE.Object3D, boolean][] = [];
  /** Called when a scene starts (camera handed over) and ends (camera back in the cab). */
  onStart: (() => void) | null = null;
  onEnd: (() => void) | null = null;

  constructor(scene: THREE.Scene, private ground: Ground, private camera: THREE.PerspectiveCamera, private colliders: { query(x: number, z: number, r: number): Collider[] }, private giveBack: () => void) {
    this.root.visible = false;
    scene.add(this.root);
    this.van = buildUaz('post');
    if (this.van.lights) this.van.lights.visible = false;
    this.van.group.rotation.y = Math.PI;
    this.van.group.position.set(0, -0.75, 0.25);
    this.vanFrame.rotation.order = 'YXZ';
    this.vanFrame.add(this.van.group);
    this.timur = new Human('hero', {});
    this.timur.play('Idle', { fade: 0 });
    this.officer = new Officer(false);
    this.officer.ground = (x, z) => ground.height(x, z);
    const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    const spanner = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.28), lam('#9a9ea4'));
    const canister = new THREE.Group();
    canister.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.36, 0.3), lam('#3a5a3a')));
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6), lam('#2a3a2a'));
    spout.position.set(0, 0.2, 0.1);
    canister.add(spout);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, BUCKET_HIPS - 0.06, 9), lam('#7a8a96'));
    // the radiator hatch in the van's front, swung up open: a dark square with the panel above it
    const hatch = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), lam('#121212'));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.02, 0.38), lam('#3f5f8e'));
    lid.position.set(0, 0.2, 0.17);
    lid.rotation.x = -0.35;
    hatch.add(hole, lid);
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.07), lam('#9a7ac0'));
    this.props = { spanner, canister, bucket, hatch, note };
    this.root.add(this.vanFrame, this.timur.group, this.officer.group, spanner, canister, bucket, hatch, note);
  }

  get active(): boolean { return this.cur !== null; }

  /**
   * Start a scene. `hide`: what must not be seen meanwhile (the cab, the real inspector at the
   * window). Ignored (returns false) while another is playing.
   */
  play(p: CutPlay, hide: THREE.Object3D[] = []): boolean {
    if (this.cur) return false;
    this.cur = p;
    this.t = 0;
    this.midDone = false;
    this.phase = -1;
    this.hidden = hide.map((o) => [o, o.visible]);
    for (const o of hide) o.visible = false;
    // the van where ours stands
    const v = p.van, vf = this.vanFrame;
    vf.position.set(v.x, v.y, v.z);
    vf.rotation.set(v.pitch ?? 0, v.yaw, -(v.roll ?? 0));
    vf.updateMatrixWorld(true);
    const fwd = _a.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)).clone();
    const left = new THREE.Vector3(-Math.cos(v.yaw), 0, Math.sin(v.yaw));
    for (const k of Object.keys(this.props) as (keyof Cutscene['props'])[]) this.props[k].visible = false;
    this.officer.group.visible = p.kind === 'fine';
    const h = this.timur;
    h.model.position.set(0, 0, 0);
    h.play('Idle', { fade: 0 });
    if (p.kind === 'wheel') {
      // the front left wheel (the driver's side): Timur on a bucket beside it, facing it
      const wheel = this.frontLeftWheel(left);
      this.work.copy(wheel);
      this.workN.copy(left);
      const seat = wheel.clone().addScaledVector(left, 1.0);
      seat.y = this.ground.height(seat.x, seat.z);
      h.group.position.copy(seat);
      h.group.rotation.y = Math.atan2(-left.x, -left.z);
      h.seat(BUCKET_HIPS);
      const bk = this.props.bucket;
      bk.position.set(seat.x, seat.y + (BUCKET_HIPS - 0.06) / 2, seat.z);
      bk.visible = true;
      this.props.spanner.visible = true;
      this.focus.copy(wheel).addScaledVector(left, 0.5);
      this.axis.copy(left);
      // film from ahead of the van and out to the side: Timur in profile, the wheel by him
      this.side.copy(fwd).addScaledVector(left, 0.7).normalize();
    } else if (p.kind === 'hood') {
      // the front: the hatch open, Timur facing the van, the canister at his feet
      const front = this.vanFrame.localToWorld(new THREE.Vector3(0, 0.25, -2.2));
      this.work.copy(front);
      this.workN.copy(fwd);
      const stand = front.clone().addScaledVector(fwd, 0.62);
      stand.y = this.ground.height(stand.x, stand.z);
      h.group.position.copy(stand);
      h.group.rotation.y = Math.atan2(-fwd.x, -fwd.z);
      const hatch = this.props.hatch;
      hatch.position.copy(front).addScaledVector(fwd, 0.02);
      hatch.rotation.set(0, Math.atan2(fwd.x, fwd.z), 0);
      hatch.visible = true;
      this.props.canister.visible = true;
      this.focus.copy(front).addScaledVector(fwd, 0.4);
      this.axis.copy(fwd);
      this.side.copy(left);
    } else {
      // by the patrol car's left side: the inspector at the front door, Timur by the back one, face to face
      const c = p.car ?? { x: v.x, z: v.z, yaw: v.yaw, width: 1.8, length: 4.4 };
      const cf = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      const cl = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      const mid = new THREE.Vector3(c.x, 0, c.z).addScaledVector(cl, c.width / 2 + 0.75);
      const oPos = mid.clone().addScaledVector(cf, 0.55), tPos = mid.clone().addScaledVector(cf, -0.55);
      oPos.y = this.ground.height(oPos.x, oPos.z);
      tPos.y = this.ground.height(tPos.x, tPos.z);
      this.officer.group.position.copy(oPos);
      this.officer.group.rotation.y = Math.atan2(-cf.x, -cf.z);
      this.officer.setMode('talk');
      this.officer.lookAt(tPos.clone().add(new THREE.Vector3(0, 1.6, 0)));
      h.group.position.copy(tPos);
      h.group.rotation.y = Math.atan2(cf.x, cf.z);
      h.play('Talking', { fade: 0 });
      this.work.copy(oPos).add(_b.set(0, 1.05, 0)).addScaledVector(cf, 0.25);
      this.props.note.visible = true;
      (this.props.note as THREE.Mesh).material = new THREE.MeshLambertMaterial({ color: p.bribe ? '#9a7ac0' : '#e8e4d8' });
      this.focus.copy(mid).setY((oPos.y + tPos.y) / 2);
      this.axis.copy(cf);
      this.side.copy(cl);
    }
    this.focus.y = Math.max(this.focus.y, this.ground.height(this.focus.x, this.focus.z));
    // the angle: from above, or from the side if nothing stands between the camera and the scene
    this.shot = Math.random() < 0.5 ? 'top' : 'side';
    if (this.shot === 'side' && !this.clear(this.sidePos(0, _c))) this.shot = 'top';
    this.spin0 = Math.random() * Math.PI * 2;
    this.root.visible = true;
    this.root.parent?.add(this.camera);
    this.onStart?.();
    this.update(0);
    return true;
  }

  /** Advance the scene and frame the camera; false when nothing is playing. */
  update(dt: number): boolean {
    const p = this.cur;
    if (!p) return false;
    this.t += dt;
    const k = clamp(this.t / p.seconds, 0, 1);
    if (!this.midDone && k >= 0.5) { this.midDone = true; p.mid?.(); }
    this.animate(dt, k);
    this.frame(k);
    if (this.t >= p.seconds) this.finish();
    return true;
  }

  /** End now (a new day, a reload): the camera goes back, the hidden things come back, `done` runs. */
  finish(): void {
    const p = this.cur;
    if (!p) return;
    this.cur = null;
    if (!this.midDone) { this.midDone = true; p.mid?.(); }
    this.root.visible = false;
    for (const [o, vis] of this.hidden) o.visible = vis;
    this.hidden = [];
    this.giveBack();
    this.onEnd?.();
    p.done?.();
  }

  private frontLeftWheel(left: THREE.Vector3): THREE.Vector3 {
    const c = new THREE.Vector3().setFromMatrixPosition(this.vanFrame.matrixWorld);
    const fwd = _b.set(-Math.sin(this.vanFrame.rotation.y), 0, -Math.cos(this.vanFrame.rotation.y));
    let best: THREE.Vector3 | null = null, score = -Infinity;
    for (const a of this.van.axles) {
      const w = a.pivot.getWorldPosition(new THREE.Vector3());
      const s = (w.x - c.x) * fwd.x + (w.z - c.z) * fwd.z + ((w.x - c.x) * left.x + (w.z - c.z) * left.z) * 0.5;
      if (s > score) { score = s; best = w; }
    }
    // the wheel's outer face, not its centre
    return (best ?? c).clone().addScaledVector(left, 0.12);
  }

  private animate(dt: number, k: number): void {
    const p = this.cur!, h = this.timur;
    h.tick(dt);
    const toLocal = (w: THREE.Vector3) => h.group.worldToLocal(_c.copy(w));
    const t = this.t;
    if (p.kind === 'wheel') {
      h.look(0, 0.45);
      // the spanner turning the track-rod nut by the hub: a short arc, again and again
      const a = Math.sin(t * 5.5) * 0.6;
      const nut = this.work.clone().addScaledVector(this.workN, 0.05);
      const across = _a.crossVectors(this.workN, UP).normalize();
      const hand = nut.clone().addScaledVector(UP, Math.cos(a) * 0.22 - 0.1).addScaledVector(across, Math.sin(a) * 0.22);
      h.reach('R', toLocal(hand).clone(), new THREE.Vector3(-1, -1, 0), 1);
      h.reach('L', toLocal(nut.clone().addScaledVector(UP, 0.12).addScaledVector(across, -0.15)).clone(), new THREE.Vector3(1, -1, 0), 1);
      this.toPalm('R', this.props.spanner, nut);
    } else if (p.kind === 'hood') {
      // bent over the hatch: hands at the cap, then the canister up and pouring
      h.spin('Torso', new THREE.Vector3(1, 0, 0), 0.42);
      h.look(0, 0.35);
      const pour = smoothstep(0.42, 0.55, k) * (1 - smoothstep(0.88, 0.97, k));
      const cap = this.work.clone().addScaledVector(UP, 0.12).addScaledVector(this.workN, 0.08);
      const across = _a.crossVectors(this.workN, UP).normalize();
      const wob = Math.sin(t * 7) * 0.04 * (1 - pour);
      const r = cap.clone().addScaledVector(across, -0.12 + wob).addScaledVector(UP, pour * 0.22).addScaledVector(this.workN, pour * 0.08);
      const l = cap.clone().addScaledVector(across, 0.12 - wob).addScaledVector(UP, pour * 0.12).addScaledVector(this.workN, pour * 0.12);
      h.reach('R', toLocal(r).clone(), new THREE.Vector3(-1, -1, 0), 1);
      h.reach('L', toLocal(l).clone(), new THREE.Vector3(1, -1, 0), 1);
      const can = this.props.canister;
      if (pour > 0.05) {
        // between the hands, tipped toward the hatch
        const pr = h.bone('PalmR').getWorldPosition(new THREE.Vector3()), pl = h.bone('PalmL').getWorldPosition(new THREE.Vector3());
        can.position.copy(pr).add(pl).multiplyScalar(0.5).addScaledVector(UP, -0.05);
        can.rotation.set(0, Math.atan2(-this.workN.x, -this.workN.z), 0);
        can.rotateX(0.9 * pour);
      } else {
        const g = h.group.position.clone().addScaledVector(across, 0.45);
        can.position.set(g.x, this.ground.height(g.x, g.z) + 0.18, g.z);
        can.rotation.set(0, h.group.rotation.y, 0);
      }
    } else {
      // Kuzmin writes the receipt, Timur talks; then the money slipped over in a handshake, or the receipt taken
      this.officer.update(dt);
      const phase = k < 0.3 ? 0 : k < 0.75 ? 1 : 2;
      if (phase !== this.phase) {
        this.phase = phase;
        if (phase === 1) {
          if (p.bribe) h.play('Handshake', { fade: 0.3 });
          else h.play('Idle', { fade: 0.3 });
          this.officer.say(p.seconds * 0.3);
        } else if (phase === 2) h.play('Idle', { fade: 0.4 });
      }
      h.look(0, -0.05);
      const take = p.bribe ? 0 : smoothstep(0.32, 0.45, k) * (1 - smoothstep(0.7, 0.82, k));
      if (take > 0.01) h.reach('R', toLocal(this.work).clone(), new THREE.Vector3(-1, -1, 0), take);
      this.props.note.visible = phase === 1;
      this.toPalm('R', this.props.note, this.work);
    }
  }

  /** A prop held in a hand, pointing at `aim`. */
  private toPalm(side: 'L' | 'R', prop: THREE.Object3D, aim: THREE.Vector3): void {
    const palm = this.timur.bone(`Palm${side}`).getWorldPosition(new THREE.Vector3());
    prop.position.copy(palm);
    prop.lookAt(aim);
  }

  private sidePos(k: number, out: THREE.Vector3): THREE.Vector3 {
    const d = 6.2 - k * 1.1;
    out.copy(this.focus).addScaledVector(this.side, d).addScaledVector(this.axis, 0.9);
    out.y = Math.max(this.focus.y, this.ground.height(out.x, out.z)) + 1.5;
    return out;
  }

  /** Nothing solid between a camera spot and the scene. */
  private clear(pos: THREE.Vector3): boolean {
    const dx = this.focus.x - pos.x, dz = this.focus.z - pos.z, len = Math.hypot(dx, dz);
    for (let s = 0; s < len - 1.6; s += 0.8) {
      const x = pos.x + (dx / len) * s, z = pos.z + (dz / len) * s;
      for (const c of this.colliders.query(x, z, 1)) {
        const r = c.box ? Math.max(c.hw, c.hd) : c.r;
        if (Math.hypot(c.x - x, c.z - z) < r + 0.5) return false;
      }
    }
    return true;
  }

  private frame(k: number): void {
    const cam = this.camera;
    const look = _b.copy(this.focus).addScaledVector(UP, this.cur!.kind === 'fine' ? 1.1 : 0.6);
    if (this.shot === 'top') {
      // high over the scene, turning slowly round it
      const a = this.spin0 + k * 0.35, r = 2.6;
      cam.position.set(this.focus.x + Math.cos(a) * r, this.focus.y + 9.5 - k * 1.2, this.focus.z + Math.sin(a) * r);
    } else this.sidePos(k, cam.position);
    cam.position.y = Math.max(cam.position.y, this.ground.height(cam.position.x, cam.position.z) + 0.6);
    cam.quaternion.copy(_q.identity());
    cam.lookAt(look);
  }
}
