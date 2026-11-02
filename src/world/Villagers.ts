import * as THREE from 'three';
import { clamp } from '../core/math';
import type { Ground } from './Ground';
import type { Person } from './People';
import type { Collider } from './Props';

/** The van as the villagers see it. */
export interface VanView { x: number; z: number; vx: number; vz: number; honk: boolean }
/** What else is going on: the weather and the hour, and something loud worth turning to look at (a siren). */
export interface Env { rain: number; dark: number; watch?: { x: number; z: number } | null }

type State = 'idle' | 'walk' | 'evade' | 'down' | 'enter' | 'inside';

interface Villager {
  person: Person;
  col: Collider;
  range: [number, number];
  side: 1 | -1;
  x: number; z: number; yaw: number;
  /** Where it is heading, world coordinates. */
  tx: number; tz: number;
  speed: number;
  state: State;
  timer: number;
  /** Slide after being knocked down. */
  kx: number; kz: number;
  clip: string;
  waved: number;
  /** The gate of the house they live in: where they go to get out of the rain. */
  door: { x: number; z: number };
  thinkT: number;
}

const HIT_SPEED = 2.2;

/**
 * Villagers who live on the roadside: they idle, stroll along the verge, look at
 * the van as it comes, wave at a horn, step (or run) off the road when it bears
 * down on them, and — if it hits one — go down and get up later.
 */
export class Villagers {
  readonly group = new THREE.Group();
  /** Called with the closing speed when the van knocks somebody over. */
  onHit?: (speed: number) => void;
  private list: Villager[] = [];

  constructor(private ground: Ground, private colliders: Collider[]) {}

  add(person: Person, s: number, lat: number, range: [number, number]): void {
    const f = this.ground.main.frame(s);
    const col: Collider = { x: f.x + f.rx * lat, z: f.z + f.rz * lat, r: 0.4, hw: 0, hd: 0, rot: 0, box: false, soft: true, mass: 80 };
    const v: Villager = {
      person, col, range, side: lat < 0 ? -1 : 1, x: col.x, z: col.z, yaw: Math.random() * 6.28, tx: col.x, tz: col.z,
      speed: 1.1, state: 'idle', timer: 1 + Math.random() * 6, kx: 0, kz: 0, clip: 'Idle', waved: 0,
      door: { x: f.x + f.rx * (lat + (lat < 0 ? -1 : 1) * 9), z: f.z + f.rz * (lat + (lat < 0 ? -1 : 1) * 9) }, thinkT: Math.random() * 3,
    };
    col.hit = (nx, nz, _j, sp) => this.knock(v, nx, nz, sp);
    this.colliders.push(col);
    this.group.add(person.group);
    this.list.push(v);
    this.sync(v);
  }

  private knock(v: Villager, nx: number, nz: number, sp: number): void {
    if (v.state === 'down' || sp < HIT_SPEED) return;
    v.state = 'down';
    v.timer = 15;
    v.kx = nx * sp * 0.5; v.kz = nz * sp * 0.5;
    v.person.wave = 0;
    v.person.human.play('Death', { once: true, fade: 0.05 });
    v.clip = 'Death';
    v.col.x = 1e9; v.col.z = 1e9;
    this.onHit?.(sp);
  }

  private sync(v: Villager): void {
    const g = v.person.group;
    g.position.set(v.x, this.ground.height(v.x, v.z), v.z);
    g.rotation.y = v.yaw;
    v.col.x = v.x; v.col.z = v.z;
  }

  private play(v: Villager, clip: string, speed = 1): void {
    v.person.human.play(clip, { fade: 0.25, speed });
    v.clip = clip;
  }

  private pickRoute(v: Villager): void {
    const main = this.ground.main;
    const s = main.nearestS(v.x, v.z);
    const half = main.zoneAt(s).width / 2;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const ts = clamp(s + dir * (12 + Math.random() * 40), v.range[0] + 4, v.range[1] - 4);
    const tl = v.side * (half + 3.4 + Math.random() * 3.6);
    const tf = main.frame(ts);
    v.tx = tf.x + tf.rx * tl; v.tz = tf.z + tf.rz * tl;
    v.speed = 0.95 + Math.random() * 0.45;
    v.state = 'walk';
  }

  update(dt: number, t: number, van: VanView, env: Env = { rain: 0, dark: 0 }): void {
    const main = this.ground.main;
    const vspeed = Math.hypot(van.vx, van.vz);
    for (const v of this.list) {
      const g = v.person.group;
      const dx = van.x - v.x, dz = van.z - v.z;
      const d = Math.hypot(dx, dz);
      // far away: nothing to see, nothing to animate
      g.visible = d < 150;
      if (!g.visible) continue;
      if (d > 110 && v.state !== 'down') continue;

      if (v.state === 'inside') {
        // indoors: out of sight until the weather clears (or the errand is done)
        g.visible = false;
        v.col.x = 1e9; v.col.z = 1e9;
        v.timer -= dt;
        if (v.timer <= 0 && env.rain < 0.3 && env.dark < 0.8) {
          v.state = 'idle'; v.timer = 2 + Math.random() * 4;
          v.x = v.door.x; v.z = v.door.z;
          this.sync(v);
          g.visible = true;
        }
        continue;
      }

      if (v.state === 'down') {
        v.timer -= dt;
        v.x += v.kx * dt; v.z += v.kz * dt;
        const k = Math.exp(-3 * dt);
        v.kx *= k; v.kz *= k;
        if (v.timer <= 0) {
          v.state = 'idle'; v.timer = 3;
          this.play(v, 'Idle');
          v.col.x = v.x; v.col.z = v.z;
        }
        v.person.update(dt, t);
        this.sync(v);
        if (v.state === 'down') { v.col.x = 1e9; v.col.z = 1e9; }
        continue;
      }

      const s = main.nearestS(v.x, v.z);
      const half = main.zoneAt(s).width / 2;
      const f = main.frame(s);
      const lat = (v.x - f.x) * f.rx + (v.z - f.z) * f.rz;
      const edge = Math.abs(lat) - half;
      // is the van coming at us?
      const closing = d > 0.1 ? -(van.vx * dx + van.vz * dz) / d : 0;
      // the van's line passes close to us: on the road, or straight across the verge
      const cross = vspeed > 0.5 ? (dx * van.vz - dz * van.vx) / vspeed : 99;
      const threat = closing > 3 && d < 26 && (edge < 2.6 || Math.abs(cross) < 2.8);
      if (threat && v.state !== 'evade') {
        v.state = 'evade';
        // get out of its way: sideways to its line, away from the road if we are on it
        const px = -van.vz / vspeed, pz = van.vx / vspeed;
        const sgn = (v.x - van.x) * px + (v.z - van.z) * pz >= 0 ? 1 : -1;
        v.tx = v.x + px * sgn * 6.5; v.tz = v.z + pz * sgn * 6.5;
        v.speed = d < 12 || closing > 9 ? 3.4 : 1.9;
      } else if (v.state === 'evade' && (!threat && (d > 20 || vspeed < 2)) && edge > 4.5) {
        v.state = 'idle'; v.timer = 1.5 + Math.random() * 3;
      }
      if (van.honk && d < 40 && v.waved <= 0) { v.person.wave = 2.4; v.waved = 6; }
      v.waved = Math.max(0, v.waved - dt);
      // a rain shower or nightfall sends people indoors; now and then there is an errand next door
      v.thinkT -= dt;
      if (v.thinkT <= 0 && (v.state === 'idle' || v.state === 'walk')) {
        v.thinkT = 2 + Math.random() * 3;
        const weather = (env.rain > 0.4 && Math.random() < 0.55) || (env.dark > 0.8 && Math.random() < 0.4);
        if (weather || Math.random() < 0.04) { v.state = 'enter'; v.tx = v.door.x; v.tz = v.door.z; v.speed = weather ? 1.9 : 1.2; v.timer = weather ? 25 + Math.random() * 50 : 12 + Math.random() * 20; }
      }
      // a slow van passing close by gets a nod: they raise a hand
      if (!van.honk && d < 9 && vspeed > 0.5 && vspeed < 7 && v.waved <= 0 && v.state === 'idle') { v.person.wave = 1.8; v.waved = 8; }

      let moving = false;
      if (v.state === 'idle') {
        v.timer -= dt;
        if (v.timer <= 0) this.pickRoute(v);
        // turn toward whatever is worth a look: a siren first, a neighbour to chat to, then the van
        let lookAt: { x: number; z: number } | null = null;
        if (env.watch && Math.hypot(env.watch.x - v.x, env.watch.z - v.z) < 90) { lookAt = env.watch; v.timer = Math.max(v.timer, 1.5); }
        else {
          for (const o of this.list) {
            if (o === v || o.state !== 'idle' || !o.person.group.visible) continue;
            if (Math.hypot(o.x - v.x, o.z - v.z) < 5.5) { lookAt = o; v.timer = Math.max(v.timer, 2.5); break; }
          }
        }
        if (!lookAt && d < 32) lookAt = { x: van.x, z: van.z };
        if (lookAt) {
          const want = Math.atan2(lookAt.x - v.x, lookAt.z - v.z);
          v.yaw += Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw)) * Math.min(1, dt * 2.2);
        }
      } else {
        // walk or evade: head for the target point beside the road
        const ex = v.tx - v.x, ez = v.tz - v.z;
        const e = Math.hypot(ex, ez);
        if (e < 0.35) {
          if (v.state === 'evade') { v.state = 'idle'; v.timer = 4; }
          else if (v.state === 'enter') { v.state = 'inside'; g.visible = false; v.col.x = 1e9; v.col.z = 1e9; this.play(v, 'Idle'); continue; }
          else { v.state = 'idle'; v.timer = 3 + Math.random() * 7; }
        } else {
          const step = Math.min(e, v.speed * dt);
          v.x += (ex / e) * step; v.z += (ez / e) * step;
          const want = Math.atan2(ex, ez);
          v.yaw += Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw)) * Math.min(1, dt * 7);
          moving = true;
        }
      }
      const run = v.state === 'evade' && v.speed > 3;
      const clip = moving ? (run ? 'Run' : 'Walk') : 'Idle';
      if (clip !== v.clip) this.play(v, clip, clip === 'Walk' ? v.speed / 1.25 : 1);
      else if (clip === 'Walk') v.person.human.play('Walk', { speed: v.speed / 1.25 });
      v.person.update(dt, t);
      this.sync(v);
      // heads follow the van while it is close and in front of them
      if (d < 30) {
        let ry = Math.atan2(dx, dz) - v.yaw;
        ry = Math.atan2(Math.sin(ry), Math.cos(ry));
        if (Math.abs(ry) < 1.9) v.person.human.look(clamp(ry, -1.1, 1.1), 0);
      }
    }
  }
}
