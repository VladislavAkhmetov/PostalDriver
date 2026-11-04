import * as THREE from 'three';
import { damp, mulberry32 } from '../core/math';
import type { Animal } from './Animals';
import type { Effects } from './Effects';
import type { Ground, Road } from './Ground';
import { makeMan, makePerson, type Person } from './People';
import { buildVehicle, rollWheels, type VehicleModel } from './Vehicles';
import type { World } from './World';

/**
 * The life of the district around the road, by the calendar and the weather (docs/design.md,
 * «Деревня живёт»): old women on the benches by the gates, a boy driving the cows across the village
 * street, a tractor ploughing, combines far off on the stubble with a lorry waiting at the edge,
 * fishermen on the ice of the lake, Sabantuy on its Saturday in June. Nothing here asks anything of
 * the driver; it is there, or it isn't, as the season has it.
 */

/** The pelvis over a bench's feet, as for the driver (Passenger.ts). */
const SEAT_HIPS_Y = 0.465;
function sit(p: Person): Person {
  p.human.seat(SEAT_HIPS_Y);
  return p;
}

/** (month 0…11, day) within [from, to], inclusive, the year round. */
const within = (m: number, d: number, from: [number, number], to: [number, number]) => {
  const k = m * 32 + d, a = from[0] * 32 + from[1], b = to[0] * 32 + to[1];
  return a <= b ? k >= a && k <= b : k >= a || k <= b;
};

export interface CountryEnv { rain: number; dark: number; snow: number }

/** A machine working a field: up one furrow, over, and back down the next. */
interface Machine {
  group: THREE.Group;
  model?: VehicleModel;
  /** The field's first furrow, end to end, and the step across to the next. */
  a: THREE.Vector3; b: THREE.Vector3; step: THREE.Vector3;
  passes: number;
  pass: number;
  t: number;
  speed: number;
  yaw: number;
  dust: string;
  puffT: number;
  /** Seconds left of the turn at a headland. */
  turn: number;
}

export class Countryside {
  private sitters: { p: Person; waved: boolean }[] = [];
  private sittersOut = true;
  /** Where the fields were found (for tests). */
  readonly found: string[] = [];
  private fishers: THREE.Object3D[] = [];
  private tractor: Machine | null = null;
  private combines: Machine[] = [];
  private lorry: THREE.Group | null = null;
  private maidan: THREE.Group | null = null;
  private crowd: Person[] = [];
  private herd: { cows: Animal[]; boy: Person; from: THREE.Vector3[]; to: THREE.Vector3[]; boyFrom: THREE.Vector3; boyTo: THREE.Vector3; state: 'wait' | 'cross' | 'done'; t: number } | null = null;
  private benchSeason = false;
  private grazing = false;
  private plough = false;
  private harvest = false;
  private ice = false;
  private sabantuy = false;
  /** The herd is starting across the street ahead: a word to the driver. */
  onEvent: ((text: string) => void) | null = null;

  constructor(private world: World, private ground: Ground, private fx: Effects) {
    const r = mulberry32(4242);
    this.buildSitters(r);
    this.buildMachines();
    this.buildHerd();
    this.buildIce(r);
    this.buildSabantuy(r);
  }

  // ------------------------------------------------------------ the calendar

  /** A new day: what the season has out today. */
  setDay(m: number, d: number): void {
    this.benchSeason = within(m, d, [3, 20], [9, 31]);
    this.grazing = within(m, d, [3, 25], [9, 31]);
    this.plough = within(m, d, [8, 10], [10, 8]) || within(m, d, [3, 15], [4, 31]);
    this.harvest = within(m, d, [7, 1], [9, 12]);
    this.ice = within(m, d, [11, 1], [2, 10]);
    // the second Saturday of June (13 June 1998): the maidan in Sosnovka for the day
    this.sabantuy = m === 5 && d >= 12 && d <= 14;
    this.world.setGrazing(this.grazing);
    if (this.tractor) this.tractor.group.visible = this.plough;
    for (const c of this.combines) c.group.visible = this.harvest;
    if (this.lorry) this.lorry.visible = this.harvest;
    for (const f of this.fishers) f.visible = this.ice;
    if (this.world.lakeFisher) this.world.setAway(this.world.lakeFisher, this.ice);
    if (this.maidan) this.maidan.visible = this.sabantuy;
    for (const p of this.crowd) this.world.setAway(p, !this.sabantuy);
    // the herd starts the day on the far side of the street
    const h = this.herd;
    if (h) {
      h.state = this.grazing ? 'wait' : 'done';
      h.t = 0;
      h.cows.forEach((c, i) => c.setPosition(h.from[i].x, h.from[i].z));
      h.boy.group.position.copy(h.boyFrom);
      this.world.setAway(h.boy, !this.grazing);
    }
  }

  // ------------------------------------------------------------ building

  private person(p: Person): Person {
    this.world.group.add(p.group);
    this.world.people.push(p);
    return p;
  }

  /** Two or so old women on a bench by a gate in each village; a few benches stay empty. */
  private buildSitters(r: () => number): void {
    const coats = ['#6a4a5a', '#4a5a6a', '#5a5a3a', '#7a5a4a', '#4a4a5a', '#6a3a3a'];
    const scarves = ['#c8452e', '#e0c050', '#3a6a8a', '#e8e0d0', '#8a3a6a', '#4a8a5a'];
    const stops = this.world.stops.map((s) => s.pos);
    const benches = this.world.benches.filter((b) => stops.every((p) => Math.hypot(p.x - b.x, p.z - b.z) > 30));
    let n = 0;
    for (const b of benches) {
      if (n >= 9 || r() > 0.55) continue;
      n++;
      const two = r() < 0.55;
      for (const lx of two ? [-0.42, 0.42] : [0]) {
        const p = sit(makePerson(coats[Math.floor(r() * coats.length)], scarves[Math.floor(r() * scarves.length)], r() < 0.5, 'dress'));
        const c = Math.cos(b.rot), s = Math.sin(b.rot);
        // the bench's seat runs along its local x; she sits on it facing the street
        const x = b.x + lx * c, z = b.z - lx * s;
        p.group.position.set(x, this.ground.terrainAt(x, z), z);
        p.group.rotation.y = b.rot;
        this.person(p);
        this.world.nearOnly(p, 200);
        this.sitters.push({ p, waved: false });
      }
    }
    // the fixed seats (World.townSeats): the old women at the panel blocks' entrances and the seed
    // seller, the domino players in the yard, the roadside sellers in the villages
    const shirts = ['#5a5a4a', '#4a5a6a', '#6a5a4a', '#3a4a3a', '#7a7a6a'];
    for (const t of this.world.townSeats) {
      const p = sit(t.who === 'man'
        ? makeMan(shirts[Math.floor(r() * shirts.length)], r() < 0.5 ? '#2e2a30' : '#3a3a32', r() < 0.6 ? '#8e8880' : '#3a2e26')
        : makePerson(coats[Math.floor(r() * coats.length)], scarves[Math.floor(r() * scarves.length)], r() < 0.4, 'dress'));
      p.group.position.set(t.at.x, t.at.y, t.at.z);
      p.group.rotation.y = t.at.rot;
      this.person(p);
      this.world.nearOnly(p);
      this.sitters.push({ p, waved: false });
    }
  }

  /** A strip of ploughland or stubble parallel to the road, clear of roads, for a machine to work. */
  private findField(kind: 'plough' | 'stubble', lat: [number, number], s: [number, number], len: number, open = true): { a: THREE.Vector3; b: THREE.Vector3; step: THREE.Vector3 } | null {
    const g = this.ground;
    // along the main road first (within `s`), then the farm roads and the branch, end to end
    const runs: [Road, number, number][] = [[g.main, s[0], s[1]], ...g.roads.filter((rd) => rd !== g.main && rd !== g.homeRoad).map((rd): [Road, number, number] => [rd, 40, rd.length - 40])];
    for (const [main, s0, s1] of runs) for (let sAt = s0; sAt < s1; sAt += 40) {
      // seen from the road outside a village: the houses do not stand between (the terrain is checked below)
      if (open && main === g.main && this.world.hamlets.some(([h0, h1]) => sAt > h0 - 25 && sAt < h1 + 25)) continue;
      const f = main.frame(sAt);
      for (const side of [1, -1]) {
        for (let l = lat[0]; l <= lat[1]; l += 20) {
          const cx = f.x + f.rx * l * side, cz = f.z + f.rz * l * side;
          // most of the strip must be that field (a corner of meadow is fine), none of it on a road
          let hits = 0, road = false;
          for (let k = -2; k <= 2; k++) for (const w of [0, 18 * side]) {
            const x = cx + f.tx * (k * len / 4) + f.rx * w, z = cz + f.tz * (k * len / 4) + f.rz * w;
            if (this.world.fieldKind(x, z) === kind) hits++;
            if (g.nearestRoad(x, z, 25)) road = true;
          }
          if (road || hits < 7) continue;
          // and in sight from the cab: no rise between the road and the machine
          const h0 = g.terrainAt(f.x, f.z) + 2, h1 = g.terrainAt(cx, cz) + 3;
          let seen = true;
          for (let t = 0.1; t < 0.95 && seen; t += 0.1) {
            const x = f.x + (cx - f.x) * t, z = f.z + (cz - f.z) * t;
            if (g.terrainAt(x, z) > h0 + (h1 - h0) * t) seen = false;
          }
          if (!seen) continue;
          if (!open) this.found.push('(near a village)');
          const a = new THREE.Vector3(cx - f.tx * len / 2, 0, cz - f.tz * len / 2);
          const b = new THREE.Vector3(cx + f.tx * len / 2, 0, cz + f.tz * len / 2);
          // each next furrow a little further from the road
          const step = new THREE.Vector3(f.rx * side, 0, f.rz * side).multiplyScalar(kind === 'plough' ? 3.2 : 6);
          this.found.push(`${kind}@${main.id}:${Math.round(sAt)}:${l * side}`);
          return { a, b, step };
        }
      }
    }
    return null;
  }

  private machine(group: THREE.Group, at: { a: THREE.Vector3; b: THREE.Vector3; step: THREE.Vector3 }, speed: number, dust: string, passes: number, phase = 0, model?: VehicleModel): Machine {
    this.world.group.add(group);
    group.visible = false;
    return { group, model, ...at, passes, pass: 0, t: phase, speed, yaw: 0, dust, puffT: 0, turn: 0 };
  }

  private buildMachines(): void {
    const m = this.ground.marks;
    // the tractor on the ploughland between the town and the forest
    const pl = this.findField('plough', [60, 150], [m.town + 300, m.sosStart - 100], 110)
      ?? this.findField('plough', [60, 180], [m.sosEnd + 100, m.zarStart - 100], 110)
      ?? this.findField('plough', [60, 200], [m.town + 200, m.zarEnd - 100], 110, false);
    if (pl) {
      const t = buildVehicle('tractor', '#3a6aa8', 5);
      if (t.lights) t.lights.visible = false;
      this.tractor = this.machine(t.group, pl, 2.2, '#6e5642', 7, 0, t);
    }
    // two combines on the stubble, well off the road, and the lorry for the grain at the field's edge
    const st = this.findField('stubble', [120, 340], [m.town + 200, m.zarEnd - 100], 150)
      ?? this.findField('stubble', [120, 340], [m.town + 200, m.zarEnd - 100], 150, false);
    if (st) {
      this.combines.push(this.machine(combine(), st, 1.6, '#c8b88a', 6, 0));
      const st2 = { a: st.a.clone().addScaledVector(st.step, 4), b: st.b.clone().addScaledVector(st.step, 4), step: st.step };
      this.combines.push(this.machine(combine(), st2, 1.6, '#c8b88a', 6, 0.45));
      const lorry = buildVehicle('gaz53', '#4a6a4a', 2);
      if (lorry.lights) lorry.lights.visible = false;
      const e = st.a.clone().addScaledVector(st.step, -1.4);
      lorry.group.position.set(e.x, this.ground.terrainAt(e.x, e.z), e.z);
      lorry.group.rotation.y = Math.atan2(st.b.x - st.a.x, st.b.z - st.a.z);
      lorry.group.visible = false;
      this.world.group.add(lorry.group);
      this.lorry = lorry.group;
    }
  }

  /** Sosnovka's cows on the far side of the street in the morning, and the boy who drives them over. */
  private buildHerd(): void {
    const g = this.ground, m = g.marks, main = g.main;
    const s = m.sosStart + 70;
    const half = main.zoneAt(s).width / 2;
    const f = main.frame(s);
    const at = (lat: number, along: number) => new THREE.Vector3(f.x + f.rx * lat + f.tx * along, 0, f.z + f.rz * lat + f.tz * along);
    const from: THREE.Vector3[] = [], to: THREE.Vector3[] = [];
    const cows: Animal[] = [];
    for (let i = 0; i < 4; i++) {
      const a = at(-(half + 9 + (i % 2) * 3), -6 + i * 4);
      const b = at(half + 14 + (i % 2) * 4, -8 + i * 5);
      from.push(a); to.push(b);
      cows.push(this.world.spawnAnimal('cow', a.x, a.z, Math.atan2(f.rx, f.rz), 4));
    }
    const boy = this.person(makeMan('#c8452e', '#2e3a5a', '#3a2e26'));
    boy.group.scale.setScalar(0.7);
    const boyFrom = at(-(half + 14), 2), boyTo = at(half + 10, 2);
    boyFrom.y = g.terrainAt(boyFrom.x, boyFrom.z);
    boyTo.y = g.terrainAt(boyTo.x, boyTo.z);
    boy.group.position.copy(boyFrom);
    boy.group.rotation.y = Math.atan2(f.rx, f.rz);
    this.herd = { cows, boy, from, to, boyFrom, boyTo, state: 'done', t: 0 };
  }

  /** Three fishermen on the lake ice, each on his box over a hole. */
  private buildIce(r: () => number): void {
    const L = this.ground.lake;
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 0.7 + r() * 0.3, rad = L.r * (0.45 + r() * 0.3);
      const x = L.x + Math.cos(a) * rad, z = L.z + Math.sin(a) * rad;
      const g = new THREE.Group();
      g.position.set(x, L.y + 0.02, z);
      g.rotation.y = r() * 6.28;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 0.32), new THREE.MeshLambertMaterial({ color: '#6a5a3a' }));
      box.position.y = 0.21;
      g.add(box);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), new THREE.MeshBasicMaterial({ color: '#1a2228' }));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(0, 0.01, 0.6);
      g.add(hole);
      const man = sit(makeMan(['#3a3a40', '#4a3a2a', '#2a3a2a'][i], '#2a2a2a', '#5a4a3a'));
      g.add(man.group);
      this.world.people.push(man);
      g.visible = false;
      this.world.group.add(g);
      this.fishers.push(g);
    }
  }

  /** Sabantuy in Sosnovka: the greased pole with the prize at the top, flags on strings, people round it. */
  private buildSabantuy(r: () => number): void {
    const g = this.ground, m = g.marks, main = g.main;
    const s = m.sosStop + 95;
    const half = main.zoneAt(s).width / 2;
    const f = main.frame(s);
    const c = new THREE.Vector3(f.x - f.rx * (half + 22), 0, f.z - f.rz * (half + 22));
    c.y = g.terrainAt(c.x, c.z);
    const grp = new THREE.Group();
    grp.position.copy(c);
    const lam = (col: string) => new THREE.MeshLambertMaterial({ color: col });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 9, 6), lam('#c8b890'));
    pole.position.y = 4.5;
    grp.add(pole);
    const prize = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), lam('#8a6a3a'));
    prize.position.y = 9.1;
    grp.add(prize);
    // strings of little flags from the top down to four stakes
    const colors = ['#c8302a', '#2a6ab0', '#e8c020', '#3a9a4a', '#f0f0e8'];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4, R = 9;
      const end = new THREE.Vector3(Math.cos(a) * R, 1.2, Math.sin(a) * R), top = new THREE.Vector3(0, 8.6, 0);
      for (let i = 1; i < 9; i++) {
        const p = top.clone().lerp(end, i / 9);
        p.y -= Math.sin((i / 9) * Math.PI) * 0.6;
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.36), new THREE.MeshLambertMaterial({ color: colors[(i + k) % colors.length], side: THREE.DoubleSide }));
        flag.position.copy(p);
        flag.rotation.y = a;
        grp.add(flag);
      }
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 4), lam('#5a4632'));
      stake.position.set(end.x, 0.65, end.z);
      grp.add(stake);
    }
    grp.visible = false;
    this.world.group.add(grp);
    this.maidan = grp;
    // people round the pole, faces to it
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3, R = 4.2 + r() * 2;
      const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
      const p = i % 3 === 0 ? makeMan(['#3a5a8a', '#8a3a2a', '#4a6a3a'][i % 3], '#2e2a30') : makePerson(['#c8452e', '#3a6a9a', '#8a3a6a'][i % 3], ['#e0c050', '#e8e0d0', '#4a8a5a'][i % 3], false, i % 2 ? 'dress' : 'woman');
      p.group.position.set(x, g.terrainAt(x, z), z);
      p.group.rotation.y = Math.atan2(c.x - x, c.z - z);
      this.person(p);
      this.world.setAway(p, true);
      this.crowd.push(p);
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt: number, van: { x: number; z: number; speed: number }, env: CountryEnv): void {
    // the benches empty in the rain, at dusk and in the cold; whoever is out waves to the post van
    const out = this.benchSeason && env.rain < 0.12 && env.dark < 0.5 && env.snow < 0.2;
    if (out !== this.sittersOut) { this.sittersOut = out; for (const s of this.sitters) this.world.setAway(s.p, !out); }
    if (out) for (const s of this.sitters) {
      const d = Math.hypot(s.p.group.position.x - van.x, s.p.group.position.z - van.z);
      if (d < 20 && !s.waved) { s.waved = true; s.p.wave = 2.2; }
      else if (d > 60) s.waved = false;
    }
    if (this.tractor && this.plough) this.work(this.tractor, dt, van, env.rain < 0.2);
    if (this.harvest) for (const c of this.combines) this.work(c, dt, van, env.rain < 0.2);
    this.herdUpdate(dt, van);
  }

  private work(mc: Machine, dt: number, van: { x: number; z: number }, dusty: boolean): void {
    const len = mc.a.distanceTo(mc.b);
    if (mc.turn > 0) mc.turn -= dt;
    else {
      mc.t += (dt * mc.speed) / len;
      if (mc.t >= 1) { mc.t = 0; mc.pass = (mc.pass + 1) % mc.passes; mc.turn = 4; }
    }
    // odd passes come back the other way, one furrow over
    const back = mc.pass % 2 === 1;
    const k = back ? 1 - mc.t : mc.t;
    const x = mc.a.x + (mc.b.x - mc.a.x) * k + mc.step.x * mc.pass, z = mc.a.z + (mc.b.z - mc.a.z) * k + mc.step.z * mc.pass;
    const dirX = (mc.b.x - mc.a.x) * (back ? -1 : 1), dirZ = (mc.b.z - mc.a.z) * (back ? -1 : 1);
    const want = mc.turn > 0 ? Math.atan2(dirX, dirZ) + Math.PI * (mc.turn / 4) : Math.atan2(dirX, dirZ);
    mc.yaw += Math.atan2(Math.sin(want - mc.yaw), Math.cos(want - mc.yaw)) * Math.min(1, dt * 2);
    mc.group.position.set(x, this.ground.terrainAt(x, z), z);
    mc.group.rotation.y = mc.yaw;
    if (mc.model && mc.turn <= 0) rollWheels(mc.model, mc.speed * dt);
    // a trail of dust (or of soil) behind, when the van is near enough to see it
    mc.puffT -= dt;
    if (dusty && mc.turn <= 0 && mc.puffT < 0 && Math.hypot(x - van.x, z - van.z) < 650) {
      mc.puffT = 0.28;
      const hx = Math.sin(mc.yaw), hz = Math.cos(mc.yaw);
      this.fx.puff(x - hx * 3, mc.group.position.y + 1, z - hz * 3, -hx * 0.4, 0.5, -hz * 0.4, 1.6, 6, 3.5, 0.32, mc.dust);
    }
  }

  private herdUpdate(dt: number, van: { x: number; z: number; speed: number }): void {
    const h = this.herd;
    if (!h || h.state === 'done') return;
    const b = h.boy.group.position;
    const d = Math.hypot(b.x - van.x, b.z - van.z);
    if (h.state === 'wait') {
      // they start across as the van comes into the village, as if they had been waiting for it
      if (d < 150 && d > 60) {
        h.state = 'cross';
        h.t = 0;
        h.boy.human.play('Walk', { speed: 0.8 });
        this.onEvent?.('Стадо переходит улицу, пацан с хворостиной сзади. Подожди — или посигналь, только не гони.');
      }
      return;
    }
    h.t += dt;
    h.cows.forEach((c, i) => { if (h.t > i * 1.2 && h.t - dt <= i * 1.2) c.lead(h.to[i].x, h.to[i].z); });
    // the boy behind them, at a boy's pace
    const tx = h.boyTo.x - b.x, tz = h.boyTo.z - b.z, dd = Math.hypot(tx, tz);
    if (h.t > 3 && dd > 0.3) {
      const st = Math.min(dd, 0.9 * dt);
      b.x += (tx / dd) * st; b.z += (tz / dd) * st;
      b.y = this.ground.terrainAt(b.x, b.z);
      h.boy.group.rotation.y = damp(h.boy.group.rotation.y, Math.atan2(tx, tz), 6, dt);
    } else if (dd <= 0.3) {
      h.state = 'done';
      h.boy.human.play('Idle', { fade: 0.3 });
      h.boy.wave = 2.5;
    }
  }
}

/** A combine harvester of the time: red body and bunker, glazed cab up front, the wide header and its reel. */
function combine(): THREE.Group {
  const g = new THREE.Group();
  const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const red = lam('#a8322a'), dark = lam('#2a2a2a'), header = lam('#c8a83a'), glass = lam('#3a4a52');
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  box(2.8, 2.2, 6.0, 0, 2.0, -0.4, red);
  box(2.4, 1.1, 2.4, 0, 3.6, -0.9, lam('#b84a3a'));
  box(1.7, 1.4, 1.5, -0.3, 3.5, 2.0, glass);
  box(1.8, 0.15, 1.7, -0.3, 4.25, 2.0, red);
  box(5.6, 0.6, 1.6, 0, 0.75, 3.8, header);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 5.4, 8), header);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0, 1.5, 4.2);
  g.add(reel);
  const auger = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.2, 6), red);
  auger.rotation.z = Math.PI / 2 - 0.25;
  auger.position.set(-2.6, 3.4, -0.8);
  g.add(auger);
  for (const [x, z, rr, w] of [[-1.5, 1.6, 0.85, 0.6], [1.5, 1.6, 0.85, 0.6], [-1.3, -2.8, 0.55, 0.4], [1.3, -2.8, 0.55, 0.4]] as [number, number, number, number][]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, w, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, rr, z);
    g.add(wheel);
  }
  box(0.12, 1.0, 0.12, 0.9, 3.6, -2.6, dark);
  return g;
}
