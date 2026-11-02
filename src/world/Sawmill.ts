import * as THREE from 'three';
import { damp } from '../core/math';
import { buildCar } from './Cars';
import type { Ground } from './Ground';
import { makeMan, type Person } from './People';
import type { Collider } from './Props';
import type { Actor, Traffic } from './Traffic';

/**
 * The sawmill in the forest past Sosnovka on the day the district's "serious people" settle whose it
 * is (docs/design.md, «Муха», chapter two): two cars across the track by the yard gate, a log rolled
 * onto the far verge, men in leather jackets standing about and watching the road. No weapons, no
 * fight — the danger is in the look of it and in the cassette thumping through the trees (the sound
 * is the game's). Hidden, with its colliders out of the world, on every other day; the yard itself is
 * built with the static world.
 */
export class SawmillBlock {
  readonly group = new THREE.Group();
  /** Middle of the block on the road. */
  readonly pos = new THREE.Vector3();
  private readonly cols: Collider[] = [];
  private readonly actors: Actor[] = [];
  /** The men; the ones by the cars turn to watch the van. */
  private readonly men: { p: Person; watch: boolean; yaw0: number }[] = [];
  on = false;

  constructor(ground: Ground, readonly s: number, private people: Person[], private dynamic: Collider[], private traffic: Traffic) {
    const f = ground.main.frame(s);
    const ry = Math.atan2(f.tx, f.tz);
    const at = (along: number, lat: number) => {
      const x = f.x + f.tx * along + f.rx * lat, z = f.z + f.tz * along + f.rz * lat;
      return new THREE.Vector3(x, ground.height(x, z), z);
    };
    this.pos.copy(at(1.5, 0.5));
    // a black jeep square across the lane, a cherry saloon nosed into the yard gate behind it
    const car = (kind: 'suv' | 'sedan', color: string, seed: number, along: number, lat: number, yaw: number) => {
      const m = buildCar(kind, color, seed);
      if (m.lights) m.lights.visible = false;
      const p = at(along, lat);
      m.group.position.set(p.x, p.y + 0.02, p.z);
      m.group.rotation.y = yaw;
      this.group.add(m.group);
      this.cols.push({ x: p.x, z: p.z, r: Math.hypot(m.width, m.length) / 2, hw: m.width / 2, hd: m.length / 2, rot: yaw, box: true });
      this.actors.push({ x: p.x, z: p.z, vx: 0, vz: 0, yaw, hw: m.width / 2, hl: m.length / 2 });
    };
    car('suv', '#1a1c20', 7, 0, -0.6, ry + Math.PI / 2 + 0.12);
    car('sedan', '#5a1a20', 9, 5.5, 2.4, ry + Math.PI / 2 - 0.5);
    // a sawlog rolled onto the other verge, so the ditch is no way round either
    {
      const p = at(-1, -5.6);
      const yaw = ry + 1.2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6.4, 8), new THREE.MeshLambertMaterial({ color: '#7a5e44' }));
      log.rotation.set(Math.PI / 2, 0, 0);
      const holder = new THREE.Group();
      holder.position.set(p.x, p.y + 0.3, p.z);
      holder.rotation.y = yaw;
      holder.add(log);
      this.group.add(holder);
      this.cols.push({ x: p.x, z: p.z, r: 3.3, hw: 0.36, hd: 3.2, rot: yaw, box: true });
    }
    // two by the cars facing whoever comes up the track, two in the yard talking it over
    const man = (shirt: string, trousers: string, along: number, lat: number, yaw: number, watch: boolean) => {
      const p = makeMan(shirt, trousers, '#2a2420');
      const q = at(along, lat);
      p.group.position.copy(q);
      p.group.rotation.y = yaw;
      this.group.add(p.group);
      this.men.push({ p, watch, yaw0: yaw });
      this.cols.push({ x: q.x, z: q.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false });
    };
    const back = ry + Math.PI;
    man('#1e1c1c', '#1c1e24', -3.8, 0.8, back, true);
    man('#2a2422', '#2e3440', -2.6, -2.8, back - 0.3, true);
    man('#2a3a5a', '#1c1e24', 14, 9.5, ry + Math.PI / 2 + 0.4, false);
    man('#1e1c1c', '#22252c', 15.4, 11.2, ry - Math.PI / 2 + 0.4, false);
    this.group.visible = false;
  }

  /** Put the block on the road for the day, or take it away. */
  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.group.visible = on;
    const swap = <T>(list: T[], items: T[]) => {
      for (const it of items) {
        const i = list.indexOf(it);
        if (on && i < 0) list.push(it);
        if (!on && i >= 0) list.splice(i, 1);
      }
    };
    swap(this.dynamic, this.cols);
    swap(this.traffic.actors, this.actors);
    swap(this.people, this.men.map((m) => m.p));
    this.traffic.closedAt = on ? this.s : null;
  }

  /** The two by the cars keep their eyes on the van while it is near. */
  update(dt: number, van: THREE.Vector3): void {
    if (!this.on) return;
    for (const m of this.men) {
      if (!m.watch) continue;
      const g = m.p.group;
      const dx = van.x - g.position.x, dz = van.z - g.position.z;
      const want = Math.hypot(dx, dz) < 70 ? Math.atan2(dx, dz) : m.yaw0;
      let d = want - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y = damp(g.rotation.y, g.rotation.y + d, 2.5, dt);
    }
  }
}
