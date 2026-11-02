import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { Human } from '../world/People';

/** The Sitting clip's pelvis against the figure's feet (file units), as for the driver and the patrol crews. */
const SEAT_HIPS_Y = 0.465, SIT_RAW_Y = 1.1, SIT_RAW_Z = -0.6;
/** Stooping forward onto the stick, radians (~26°): an old man on the front of the seat, his cap clear of the low cab roof, his face where the driver's glance to the right finds it. */
const LEAN = 0.45;
const X = new THREE.Vector3(1, 0, 0);
/** The cab's roof lining, cabin space (Cabin: the roof panel's underside), and the room to leave under it for the cap. */
const ROOF_Y = 1.22, HEADROOM = 0.03;
/** How far he sinks into the seat cushion below the nominal hip point. */
const SINK = 0.035;

/**
 * Someone in the cab's right-hand seat — the grandfather (People: the `kartatay` model, his stick
 * between his knees). Seated by the Sitting clip like the driver, he faces the road, and when he
 * speaks he turns his head to the driver and back. The figure is fitted to the cab: measured in the
 * seated pose, it is scaled down if the top of his cap would reach the roof lining.
 */
export class Passenger {
  readonly human: Human;
  /** Room left between the top of his cap and the roof lining, metres (for tests). */
  readonly clearance: number;
  private yaw = 0;
  private talkT = 0;
  private t = Math.random() * 10;

  /** `hips`: where his pelvis sits in the seat, cabin space. */
  constructor(parent: THREE.Object3D, hips: THREE.Vector3) {
    const h = this.human = new Human('kartatay');
    h.play('Sitting', { fade: 0, once: true, at: 1 });
    h.model.position.set(0, SEAT_HIPS_Y - SIT_RAW_Y * h.s, -SIT_RAW_Z * h.s);
    h.tick(0.01);
    // the top of his cap in the seated, leaning pose, against his pelvis
    h.spin('Torso', X, LEAN);
    h.group.updateMatrixWorld(true);
    const hp = h.at('Hips');
    const top = Passenger.top(h);
    // (the cab is low — 0.88 m from the cushion to the lining — and he is a tall old man: he stoops, sits
    // into the soft cushion a little, and what is left is taken off his size)
    const seat = hips.y - SINK;
    const k = clamp((ROOF_Y - HEADROOM - seat) / Math.max(0.3, top - hp.y), 0.86, 1);
    this.clearance = ROOF_Y - (seat + (top - hp.y) * k);
    // the figure faces -Z in the cab (the road), its pelvis on the cushion
    h.group.scale.setScalar(k);
    h.group.rotation.y = Math.PI;
    h.group.position.set(hips.x + hp.x * k, seat - hp.y * k, hips.z + hp.z * k);
    // the stick, leaning between his knees against the dashboard
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.92, 6), new THREE.MeshLambertMaterial({ color: '#5a4632' }));
    stick.position.set(0, 0.42, 0.42);
    stick.rotation.x = -0.32;
    h.group.add(stick);
    h.group.visible = false;
    parent.add(h.group);
  }

  /** The highest point of the skinned figure as posed now, group space (the group at the origin, unscaled). */
  private static top(h: Human): number {
    let top = -Infinity;
    const v = new THREE.Vector3();
    h.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.skeleton.update();
      const n = m.geometry.attributes.position.count;
      for (let i = 0; i < n; i += 2) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); top = Math.max(top, v.y); }
    });
    return top;
  }

  get visible(): boolean { return this.human.group.visible; }
  set visible(on: boolean) { this.human.group.visible = on; }

  /** He is saying something: a look at the driver for a few seconds. */
  speak(seconds = 3.5): void { this.talkT = seconds; }

  update(dt: number): void {
    if (!this.visible) return;
    this.t += dt;
    this.talkT = Math.max(0, this.talkT - dt);
    // to the driver (on his left, +X of the figure) while talking; otherwise the road, glancing about
    const want = this.talkT > 0 ? 0.75 + Math.sin(this.t * 1.7) * 0.05 : Math.sin(this.t * 0.23) * 0.18;
    this.yaw = damp(this.yaw, want, 4, dt);
    const h = this.human;
    h.tick(dt);
    h.spin('Torso', X, LEAN);
    h.look(this.yaw, this.talkT > 0 ? -0.04 + Math.sin(this.t * 3.1) * 0.03 : 0.02);
  }
}
