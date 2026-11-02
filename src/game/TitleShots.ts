import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';
import type { Ground } from '../world/Ground';
import { rollWheels, VehicleModel } from '../world/Vehicles';
import { buildUaz } from '../world/Uaz';

/**
 * The title sequence: the post van driving the route in the day's own weather, filmed in
 * five long, slow, wide shots — the fields past the town, into the forest, the bridge over
 * the Serebryanka, Zarechye from above, the edge of Sosnovka. Each shot dissolves through
 * the haze; the caller lays the fade over the picture in the fog's colour.
 */
interface Shot {
  /** Place caption for the lower third. */
  caption: string;
  /** Where the van starts (main-road metres), how fast it drives, how long the shot runs. */
  s0: number; v: number; dur: number;
  /** Camera position and target for a van frame and the shot's progress k (0…1). */
  cam(van: Frame, k: number): { pos: THREE.Vector3; look: THREE.Vector3 };
}
interface Frame { x: number; y: number; z: number; tx: number; tz: number; rx: number; rz: number }

/** Seconds of the dip through the haze at each cut. */
const FADE = 2.4;
const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class TitleShots {
  readonly van: VehicleModel;
  private shots: Shot[];
  private i = 0;
  private t = 0;
  /** Black over the picture, 0…1. */
  fade = 1;
  get caption(): string { return this.shots[this.i].caption; }

  constructor(private ground: Ground, scene: THREE.Object3D) {
    this.van = buildUaz('post');
    scene.add(this.van.group);
    const m = ground.marks;
    // offsets in the van's frame: f along the road, r to its right, h up
    const at = (v: Frame, f: number, r: number, h: number, out: THREE.Vector3) => {
      out.set(v.x + v.tx * f + v.rx * r, 0, v.z + v.tz * f + v.rz * r);
      out.y = Math.max(v.y, ground.height(out.x, out.z)) + h;
      return out;
    };
    // long, slow, wide: the van small in the land, the camera barely moving
    this.shots = [
      // fields past the town: a camera post far off the road, the van crossing the frame
      { caption: '', s0: m.town + 360, v: 6.5, dur: 24, cam: (v, k) => ({ pos: this.fixed(m.town + 470, 58, 7 + k * 1.5, _p), look: at(v, 4, 0, 1.4, _l) }) },
      // into the forest: low behind, falling back slowly as the trees close in
      { caption: '', s0: m.junction + 40, v: 5, dur: 22, cam: (v, k) => ({ pos: at(v, -11 - k * 5, -2.2, 2.6 + k * 0.8, _p), look: at(v, 22, 0, 1.6, _l) }) },
      // the bridge over the Serebryanka from the far bank, locked off
      { caption: '', s0: m.bridge - 70, v: 4, dur: 26, cam: (v, k) => ({ pos: this.fixed(m.bridge + 10, 46, 5.5, _p), look: at(v, 0, 0, 1.2, _l) }) },
      // high behind the van as Zarechye and its church open up ahead
      { caption: '', s0: m.zarStart - 170, v: 5.5, dur: 24, cam: (v, k) => ({ pos: at(v, -30 - k * 8, 6, 15 + k * 3, _p), look: at(v, 45, 0, 2, _l) }) },
      // the edge of Sosnovka, from across a garden
      { caption: '', s0: m.sosStart - 130, v: 5.5, dur: 22, cam: (v, k) => ({ pos: this.fixed(m.sosStart - 30, 36, 5 + k, _p), look: at(v, 2, 0, 1.3, _l) }) },
    ];
  }

  /** A camera post beside the road at main-road distance s. */
  private fixed(s: number, side: number, h: number, out: THREE.Vector3): THREE.Vector3 {
    const f = this.ground.main.frame(s);
    out.set(f.x + f.rx * side - f.tx * 10, 0, f.z + f.rz * side - f.tz * 10);
    out.y = this.ground.height(out.x, out.z) + h;
    return out;
  }

  /** Advance the sequence and frame the camera. Returns the main-road distance the shot is at. */
  update(dt: number, camera: THREE.PerspectiveCamera): number {
    this.t += dt;
    let shot = this.shots[this.i];
    if (this.t > shot.dur) { this.t = 0; this.i = (this.i + 1) % this.shots.length; shot = this.shots[this.i]; }
    const k = this.t / shot.dur;
    this.fade = 1 - clamp(Math.min(this.t, shot.dur - this.t) / FADE, 0, 1);
    // the van on the right-hand side of the road
    const s = shot.s0 + shot.v * this.t;
    const g = this.ground, f = g.main.frame(s);
    const lane = g.main.zoneAt(s).width / 4 + 0.1;
    const x = f.x + f.rx * lane, z = f.z + f.rz * lane;
    const yaw = Math.atan2(f.tx, f.tz), hx = Math.sin(yaw), hz = Math.cos(yaw), L = 1.3;
    const yf = g.height(x + hx * L, z + hz * L), yb = g.height(x - hx * L, z - hz * L);
    const vg = this.van.group;
    vg.position.set(x, (yf + yb) / 2, z);
    vg.rotation.set(-Math.atan2(yf - yb, 2 * L), yaw, Math.sin(this.t * 2.3) * 0.012, 'YXZ');
    rollWheels(this.van, shot.v * dt);
    const v: Frame = { x, y: vg.position.y, z, tx: f.tx, tz: f.tz, rx: f.rx, rz: f.rz };
    const c = shot.cam(v, k);
    // compose with the van in the right third: the title sits on the left
    const d = _d.subVectors(c.look, c.pos);
    const right = _r.crossVectors(d, UP).normalize();
    c.look.addScaledVector(right, -d.length() * 0.3);
    camera.position.copy(c.pos);
    camera.lookAt(c.look);
    return s;
  }

  dispose(): void { this.van.group.removeFromParent(); }
}
