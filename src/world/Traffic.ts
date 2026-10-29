import * as THREE from 'three';
import { clamp } from '../core/math';
import type { Ground } from './Ground';
import { Collider } from './Props';
import type { Railway } from './Railway';
import { Officer } from './Officer';
import { crewFor, isPolice } from './Cars';
import { buildVehicle, rollWheels, setBeacons, setBrake, VehicleKind, VehicleModel } from './Vehicles';

/** A drivable polyline: the asphalt run (main road up to the fork, then the stub) or the dirt run beyond. */
export class Path {
  xs: number[] = []; zs: number[] = []; cum: number[] = [];
  length = 0;
  constructor(readonly name: 'asphalt' | 'dirt') {}
  push(x: number, z: number): void {
    const n = this.xs.length;
    if (n) { const d = Math.hypot(x - this.xs[n - 1], z - this.zs[n - 1]); if (d < 0.5) return; this.length += d; }
    this.xs.push(x); this.zs.push(z); this.cum.push(this.length);
  }
  frame(d: number, out: { x: number; z: number; tx: number; tz: number }): typeof out {
    d = clamp(d, 0, this.length);
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= d) lo = m; else hi = m; }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (d - this.cum[lo]) / seg;
    const dx = this.xs[hi] - this.xs[lo], dz = this.zs[hi] - this.zs[lo];
    const l = Math.hypot(dx, dz) || 1;
    out.x = this.xs[lo] + dx * t; out.z = this.zs[lo] + dz * t; out.tx = dx / l; out.tz = dz / l;
    return out;
  }
}

interface Car {
  model: VehicleModel;
  path: Path;
  d: number;
  dir: 1 | -1;
  v: number;
  vmax: number;
  col: Collider;
  held: number;
  honked: boolean;
  live: boolean;
  x: number; z: number; vx: number; vz: number;
  spray: THREE.Sprite[];
}

const KINDS_ASPHALT: [VehicleKind, string, number][] = [
  ['zil', '#5a7aa0', 14], ['zil', '#6a8a5a', 14], ['gaz53', '#4a6a4a', 13], ['milk', '#3e6a9a', 13], ['kamaz', '#d8822a', 16],
  // passenger cars: modelled foreign bodies in 90s paint and liveries
  ['sedan', '#7a1e24', 20], ['sedan', '#d8cfae', 19], ['sedan', '#2e4a6a', 20], ['compact', '#c8c0a4', 18], ['compact', '#3e5a3a', 18],
  ['compact', '#a83a28', 18], ['suv', '#18191b', 23], ['taxi', '#e0b42a', 19], ['militia', '#ecece6', 18], ['militiaSuv', '#ecece6', 17],
  ['moskvich', '#b8322c', 19], ['paz', '#d8a83a', 13], ['tractor', '#3a6aa8', 7],
  ['uaz', '#4e5e3e', 15], ['zil', '#c8a040', 14],
];
const KINDS_DIRT: [VehicleKind, string, number][] = [
  ['tractor', '#3a6aa8', 6], ['gaz53', '#4a6a4a', 8], ['milk', '#3e6a9a', 7], ['zil', '#6a8a5a', 8], ['uaz', '#4e5e3e', 9],
  // the GAI's 4×4 patrols the forest track too; its saloons stay on the asphalt
  ['militiaSuv', '#ecece6', 9],
];

export interface TrafficSound { gain: number; pitch: number; heavy: number; honk: number }

/** The player's van footprint (half width, half length) for traffic to keep clear of. */
const VAN_HW = 1.0, VAN_HL = 2.25;
/** Comfortable braking (m/s²) traffic plans with, and what it can do in an emergency. */
const DECEL = 3.2, DECEL_MAX = 8;
/** Speed that still lets a car stop within `gap` metres (plus whatever the leader is doing). */
const stopSpeed = (gap: number, lead = 0) => Math.sqrt(2 * DECEL * Math.max(0, gap) + lead * lead);

export class Traffic {
  readonly group = new THREE.Group();
  readonly paths: Path[];
  private cars: Car[] = [];
  private pool = new Map<string, VehicleModel[]>();
  private spawnT = 3;
  private readonly f = { x: 0, z: 0, tx: 0, tz: 0 };
  private readonly junction: number;
  private honkQ = 0;

  private sprayMat: THREE.SpriteMaterial;

  constructor(private ground: Ground, private rail: Railway | null, dynamic: Collider[], sprayTex: THREE.Texture) {
    this.sprayMat = new THREE.SpriteMaterial({ map: sprayTex, transparent: true, depthWrite: false, opacity: 0, color: '#c8ccce' });
    const main = ground.main, stub = ground.stub;
    this.junction = ground.marks.junction;
    const a = new Path('asphalt');
    for (let s = 0; s <= this.junction; s += 2) { const f = main.frame(s); a.push(f.x, f.z); }
    const s0 = stub.nearestS(main.frame(this.junction).x, main.frame(this.junction).z);
    for (let s = s0 + 4; s <= stub.length; s += 2) { const f = stub.frame(s); a.push(f.x, f.z); }
    const b = new Path('dirt');
    for (let s = this.junction; s <= main.length; s += 2) { const f = main.frame(s); b.push(f.x, f.z); }
    this.paths = [a, b];
    for (let i = 0; i < 6; i++) {
      const col: Collider = { x: 1e9, z: 1e9, r: 4, hw: 1, hd: 3, rot: 0, box: true };
      dynamic.push(col);
      const spray = [0, 1, 2].map(() => { const sp = new THREE.Sprite(this.sprayMat.clone()); sp.visible = false; this.group.add(sp); return sp; });
      this.cars.push({ model: null as unknown as VehicleModel, path: a, d: 0, dir: 1, v: 0, vmax: 10, col, held: 0, honked: false, live: false, x: 0, z: 0, vx: 0, vz: 0, spray });
    }
  }

  private model(kind: VehicleKind, color: string): VehicleModel {
    const key = kind + color;
    const free = this.pool.get(key);
    if (free && free.length) return free.pop()!;
    const m = buildVehicle(kind, color, Math.floor(Math.random() * 8));
    if (isPolice(kind)) {
      // a crew behind the tinted glass, posed once
      const crew = crewFor(kind);
      for (const place of [crew.driver, crew.partner]) {
        const o = new Officer(false);
        o.setMode('sit');
        o.group.position.copy(place.seat);
        o.group.scale.setScalar(crew.scale);
        o.update(3);
        m.group.add(o.group);
      }
    }
    this.group.add(m.group);
    return m;
  }

  private release(c: Car): void {
    c.live = false;
    c.col.x = 1e9; c.col.z = 1e9;
    for (const sp of c.spray) sp.visible = false;
    if (!c.model) return;
    c.model.group.visible = false;
    const key = c.model.kind + c.model.group.userData.color;
    const list = this.pool.get(key) ?? [];
    list.push(c.model);
    this.pool.set(key, list);
  }

  /** Where the player is on the traffic network: path, distance along it, lateral offset. */
  locate(px: number, pz: number): { path: Path; d: number; lat: number } | null {
    const hit = this.ground.nearestRoad(px, pz, 14);
    if (!hit) return null;
    const road = hit.sample.road;
    if (road === this.ground.main) {
      if (hit.s < this.junction) return { path: this.paths[0], d: hit.s, lat: hit.lat };
      return { path: this.paths[1], d: hit.s - this.junction, lat: hit.lat };
    }
    // on the stub: find the path distance by matching the nearest polyline vertex
    const p = this.paths[0];
    let best = 0, bd = Infinity;
    for (let i = Math.floor(this.junction / 2); i < p.xs.length; i++) {
      const dd = (p.xs[i] - px) ** 2 + (p.zs[i] - pz) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    }
    return { path: p, d: p.cum[best], lat: hit.lat };
  }

  private zoneSpeed(c: Car): number {
    if (c.path.name === 'asphalt') return c.vmax;
    const z = this.ground.main.zoneAt(this.junction + c.d);
    return Math.min(c.vmax, z.surface === 'mud' ? 3.5 : z.surface === 'wood' ? 3 : z.tag === 'forest' ? 6 : 8);
  }

  private laneOf(c: Car): number { return this.laneAt(c.path, c.d, c.dir); }

  /** Lateral offset of the right-hand lane for a car heading dir along path at d. */
  laneAt(path: Path, d: number, dir: number): number {
    const s = path.name === 'dirt' ? this.junction + d : d;
    const w = path.name === 'dirt' || s < this.junction ? this.ground.main.zoneAt(s).width : 6;
    return dir * Math.min(1.7, w / 4 + 0.15);
  }

  private spawn(c: Car, pl: { path: Path; d: number }, pdir: number): void {
    const kinds = pl.path.name === 'asphalt' ? KINDS_ASPHALT : KINDS_DIRT;
    const [kind, color, vmax] = kinds[Math.floor(Math.random() * kinds.length)];
    const r = Math.random();
    // mostly oncoming; sometimes a slow one ahead to catch up with, or a faster one from behind
    let dir: 1 | -1, d: number;
    if (r < 0.62) { dir = (pdir > 0 ? -1 : 1); d = pl.d + pdir * (300 + Math.random() * 80); }
    else if (r < 0.85 || vmax < 10) { dir = (pdir > 0 ? 1 : -1); d = pl.d + pdir * (260 + Math.random() * 60); }
    else { dir = (pdir > 0 ? 1 : -1); d = pl.d - pdir * (220 + Math.random() * 40); }
    if (d < 10 || d > pl.path.length - 10) return;
    // keep spacing to other cars on the same path
    if (this.cars.some((o) => o.live && o.path === pl.path && Math.abs(o.d - d) < 40)) return;
    c.model = this.model(kind, color);
    c.model.group.userData.color = color;
    c.model.group.userData.flash = Math.random() < 0.4;
    c.model.group.visible = true;
    c.path = pl.path; c.d = d; c.dir = dir; c.vmax = vmax * (0.85 + Math.random() * 0.25);
    c.v = this.zoneSpeed(c) * 0.9; c.held = 0; c.honked = false; c.live = true;
    c.col.hw = c.model.width / 2; c.col.hd = c.model.length / 2; c.col.r = Math.hypot(c.col.hw, c.col.hd);
  }

  update(dt: number, t: number, px: number, pz: number, pvx: number, pvz: number, wet: number, pyaw = 0): TrafficSound {
    const vfx = -Math.sin(pyaw), vfz = -Math.cos(pyaw);
    const pl = this.locate(px, pz);
    let pdir = 1;
    if (pl) {
      const f = pl.path.frame(pl.d, this.f);
      const along = pvx * f.tx + pvz * f.tz;
      pdir = along < -1 ? -1 : 1;
    }
    // spawning
    this.spawnT -= dt;
    if (pl && this.spawnT <= 0) {
      this.spawnT = pl.path.name === 'asphalt' ? 7 + Math.random() * 12 : 25 + Math.random() * 30;
      const limit = pl.path.name === 'asphalt' ? 5 : 2;
      const live = this.cars.filter((c) => c.live && c.path === pl.path).length;
      const free = this.cars.find((c) => !c.live);
      if (free && live < limit) this.spawn(free, pl, pdir);
    }
    let best = { gain: 0, pitch: 1, heavy: 0, honk: 0 };
    for (const c of this.cars) {
      if (!c.live) continue;
      // despawn when far away, off the path ends, or the player is on another path
      const gapP = pl && pl.path === c.path ? c.d - pl.d : 1e9;
      if (Math.abs(gapP) > 460 || c.d < 2 || c.d > c.path.length - 2) { this.release(c); continue; }
      const lane = this.laneOf(c);
      // target speed: road, the van in our way, other traffic, crossing booms
      let target = this.zoneSpeed(c);
      const ahead = c.dir * gapP;
      // the van, in world space wherever it is (on the road, on the verge, across the crossing):
      // its rotated footprint against the corridor this car is about to drive through
      const hf = c.path.frame(c.d, this.f);
      const hx0 = c.dir * hf.tx, hz0 = c.dir * hf.tz;
      const cx = hf.x - hf.tz * lane, cz = hf.z + hf.tx * lane;
      const rx = px - cx, rz = pz - cz;
      const fwd = rx * hx0 + rz * hz0, lat = Math.abs(rz * hx0 - rx * hz0);
      const ca = Math.abs(vfx * hx0 + vfz * hz0), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      const pLat = VAN_HW * ca + VAN_HL * sa, pLong = VAN_HL * ca + VAN_HW * sa;
      const hd = c.model.length / 2, hw = c.model.width / 2;
      let contact = false;
      if (fwd > 0 && fwd < 80 && lat < hw + pLat + 0.6) {
        const gap = fwd - hd - pLong;
        const lead = Math.max(0, pvx * hx0 + pvz * hz0);
        target = Math.min(target, stopSpeed(gap - 3.5, lead));
        contact = gap < 1.2 && lead < 0.5;
      }
      for (const o of this.cars) {
        if (o === c || !o.live || o.path !== c.path || o.dir !== c.dir) continue;
        const g = c.dir * (o.d - c.d);
        if (g > 0 && g < 60) target = Math.min(target, stopSpeed(g - (o.model.length + c.model.length) / 2 - 4, o.v));
      }
      if (this.rail && this.rail.blocked && c.path.name === 'asphalt') {
        const toX = c.dir * (this.rail.sCross - c.d);
        if (toX > 0 && toX < 80) target = Math.min(target, stopSpeed(toX - 12 - hd));
      }
      // brake as hard as the plan needs (up to an emergency stop), accelerate gently;
      // touching the van means standing still, never shoving it
      const braking = target < c.v - 0.4;
      if (contact) c.v = 0;
      else if (c.v > target) c.v = Math.max(target, c.v - clamp((c.v - target) * 2, DECEL * 0.6, DECEL_MAX) * dt);
      else c.v = Math.min(target, c.v + dt * (c.vmax > 12 ? 1.6 : 0.9));
      setBrake(c.model, braking || c.v < 0.3);
      rollWheels(c.model, c.v * dt);
      if (c.model.beacons.length) setBeacons(c.model, t, c.model.group.userData.flash);
      c.held = c.v < 0.5 && target < 0.5 && pl && ahead > 0 && ahead < 30 ? c.held + dt : 0;
      if (c.held > 2.5 && !c.honked) { c.honked = true; this.honkQ = Math.max(this.honkQ, clamp(1 - Math.abs(gapP) / 80, 0.2, 1)); }
      if (c.held === 0 && c.v > 2) c.honked = false;
      c.d += c.dir * c.v * dt;

      const f = c.path.frame(c.d, this.f);
      const x = f.x - f.tz * lane, z = f.z + f.tx * lane;
      const hx = c.dir * f.tx, hz = c.dir * f.tz;
      const L2 = c.model.length * 0.35;
      const yf = this.ground.height(x + hx * L2, z + hz * L2), yb = this.ground.height(x - hx * L2, z - hz * L2);
      const g = c.model.group;
      const yaw = Math.atan2(hx, hz);
      g.position.set(x, (yf + yb) / 2 + 0.02, z);
      g.rotation.set(-Math.atan2(yf - yb, L2 * 2), yaw, 0, 'YXZ');
      c.vx = hx * c.v; c.vz = hz * c.v; c.x = x; c.z = z;
      c.col.x = x; c.col.z = z; c.col.rot = yaw;

      // road spray kicked up behind the wheels on a wet road
      const sprayK = clamp(wet - 0.35, 0, 1) * clamp((c.v - 4) / 12, 0, 1);
      c.spray.forEach((sp, i) => {
        sp.visible = sprayK > 0.02;
        if (!sp.visible) return;
        const back = -c.model.rear.z + 0.6 + i * 1.3;
        const side = (i - 1) * c.model.width * 0.35;
        sp.position.set(x - hx * back + hz * side, g.position.y + 0.5 + i * 0.25, z - hz * back - hx * side);
        sp.scale.setScalar(1.6 + i * 1.1 + Math.sin(t * 7 + i) * 0.2);
        (sp.material as THREE.SpriteMaterial).opacity = sprayK * (0.42 - i * 0.1);
      });

      // loudest car for the pass-by sound, with a little Doppler
      const ox = x - px, oz = z - pz;
      const dist = Math.hypot(ox, oz);
      const k = c.model.kind;
      const heavy = k === 'moskvich' || k === 'gai' || k === 'sedan' || k === 'compact' || k === 'taxi' || k === 'militia' || k === 'militiaSuv' ? 0.3
        : k === 'uaz' || k === 'suv' ? 0.5 : k === 'tractor' ? 0.8 : 1;
      const gain = clamp(1 - dist / 140, 0, 1) ** 2 * (0.5 + heavy * 0.5) * clamp(c.v / 6, 0.3, 1);
      if (gain > best.gain) {
        const closing = -((c.vx - pvx) * ox + (c.vz - pvz) * oz) / Math.max(dist, 1);
        best = { gain, pitch: clamp(343 / (343 - closing), 0.85, 1.15) * (0.7 + c.v / 40), heavy, honk: 0 };
      }
    }
    best.honk = this.honkQ;
    this.honkQ = 0;
    return best;
  }
}
