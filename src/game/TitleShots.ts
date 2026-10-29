import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';
import type { Ground } from '../world/Ground';
import { rollWheels, VehicleModel } from '../world/Vehicles';
import { buildUaz } from '../world/Uaz';

/**
 * The title sequence: a post-office UAZ driving the route at dawn, filmed in
 * four slow shots — a tracking shot down the Klyuchevsk street, a crane over
 * the forest track, a wide of the bridge over the Serebryanka, and a high
 * shot as it rolls into Zarechye under the church. Each shot fades in and out
 * through black; the caller lays the fade over the picture.
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

const FADE = 1.3;
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
    this.shots = [
      // low tracking shot alongside, sliding from the rear wheel to the cab
      { caption: 'Ключевск · отделение связи', s0: m.town - 150, v: 7, dur: 11, cam: (v, k) => ({ pos: at(v, lerp(-7, 0, k), 7.5, 1.5, _p), look: at(v, 2, 0, 1.2, _l) }) },
      // crane: high ahead over the forest track, coming down to meet the van
      { caption: 'Лесная дорога на Сосновку', s0: m.junction + 120, v: 6.5, dur: 12, cam: (v, k) => ({ pos: at(v, lerp(26, 13, k), -3, lerp(15, 4, smoothstep(0, 1, k)), _p), look: at(v, 0, 0, 1, _l) }) },
      // wide: locked off across the river, panning as it crosses the bridge
      { caption: 'Мост через Серебрянку', s0: m.bridge - 55, v: 4.5, dur: 13, cam: (v, k) => ({ pos: this.fixed(m.bridge, 26, 5, _p), look: at(v, 0, 0, 1.2, _l) }) },
      // high behind, rising, the village and church opening up ahead
      { caption: 'Заречье', s0: m.zarStart - 140, v: 6, dur: 12, cam: (v, k) => ({ pos: at(v, -16 - k * 6, 2, 6 + k * 7, _p), look: at(v, 30, 0, 2, _l) }) },
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
