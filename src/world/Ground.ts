import * as THREE from 'three';
import { clamp, fbm, lerp, mulberry32, noise2, smoothstep } from '../core/math';

export type Surface = 'asphalt' | 'gravel' | 'dirt' | 'mud' | 'wood' | 'grass' | 'water';

export const SURF: Record<Surface, { mu: number; crr: number; rough: number }> = {
  asphalt: { mu: 0.92, crr: 0.014, rough: 0.12 },
  gravel: { mu: 0.7, crr: 0.03, rough: 0.55 },
  dirt: { mu: 0.62, crr: 0.042, rough: 0.5 },
  // lugs bite into clay (decent grip) but the wheels plough: high rolling drag
  mud: { mu: 0.54, crr: 0.14, rough: 0.4 },
  wood: { mu: 0.72, crr: 0.02, rough: 0.35 },
  grass: { mu: 0.56, crr: 0.06, rough: 0.7 },
  water: { mu: 0.34, crr: 0.22, rough: 0.3 },
};

export interface Zone { from: number; to: number; surface: Surface; width: number; tag: string }
/** Round depression on the road; `len` stretches it along the road (rut puddles). */
export interface Spot { s: number; lat: number; r: number; depth: number; len?: number }
/** Waterlogged stretch of a dirt road that behaves (and looks) like mud. */
export interface Bog { from: number; to: number; deep: number }
export interface Sample { x: number; y: number; z: number; tx: number; tz: number; s: number; road: Road; i: number }

export interface GroundInfo {
  height: number;
  surface: Surface;
  onRoad: boolean;
  road: Road | null;
  s: number;
  lat: number;
  half: number;
  mu: number;
  crr: number;
  rough: number;
  puddle: boolean;
  /** approximate standing water depth under this point (m) */
  water: number;
  tag: string;
}

export const newGround = (): GroundInfo => ({ height: 0, surface: 'grass', onRoad: false, road: null, s: 0, lat: 0, half: 0, mu: 0.6, crr: 0.05, rough: 0.6, puddle: false, water: 0, tag: '' });

export class PointIndex<T extends { x: number; z: number }> {
  private cells = new Map<number, T[]>();
  constructor(private cell: number) {}
  private key(ix: number, iz: number): number { return (ix + 20000) * 40000 + (iz + 20000); }
  insert(p: T): void {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
    let l = this.cells.get(k);
    if (!l) { l = []; this.cells.set(k, l); }
    l.push(p);
  }
  nearest(x: number, z: number, maxR: number): { item: T; d2: number } | null {
    const r = Math.ceil(maxR / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best: T | null = null;
    let bd = maxR * maxR;
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        const l = this.cells.get(this.key(ix, iz));
        if (!l) continue;
        for (const p of l) {
          const dx = p.x - x, dz = p.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; best = p; }
        }
      }
    }
    return best ? { item: best, d2: bd } : null;
  }
}

export class Road {
  samples: Sample[] = [];
  length: number;
  spacing: number;
  holes: Spot[] = [];
  puddles: Spot[] = [];
  zones: Zone[] = [];
  bogs: Bog[] = [];

  constructor(public id: string, pts: THREE.Vector3[], spacing = 2) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.length = curve.getLength();
    const n = Math.ceil(this.length / spacing);
    this.spacing = this.length / n;
    const p = curve.getSpacedPoints(n);
    for (let i = 0; i <= n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      this.samples.push({ x: p[i].x, y: 0, z: p[i].z, tx, tz, s: i * this.spacing, road: this, i });
    }
  }

  zoneAt(s: number): Zone {
    for (const z of this.zones) if (s < z.to) return z;
    return this.zones[this.zones.length - 1];
  }

  sampleAt(s: number): Sample {
    return this.samples[clamp(Math.round(s / this.spacing), 0, this.samples.length - 1)];
  }

  /** Interpolated centre point, tangent and right vector at arc length s. */
  frame(s: number): { x: number; y: number; z: number; tx: number; tz: number; rx: number; rz: number } {
    const f = clamp(s / this.spacing, 0, this.samples.length - 1);
    const i = Math.min(this.samples.length - 2, Math.floor(f));
    const t = f - i;
    const a = this.samples[i], b = this.samples[i + 1];
    const tx = lerp(a.tx, b.tx, t), tz = lerp(a.tz, b.tz, t);
    const l = Math.hypot(tx, tz) || 1;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), tx: tx / l, tz: tz / l, rx: -tz / l, rz: tx / l };
  }

  nearestS(x: number, z: number): number {
    let best = 0, bd = Infinity;
    for (const p of this.samples) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p.s; }
    }
    return best;
  }

  private spotDepth(list: Spot[], s: number, lat: number): number {
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].s < s - 7) lo = m + 1; else hi = m; }
    let h = 0;
    for (let i = lo; i < list.length && list[i].s < s + 7; i++) {
      const p = list[i];
      const d = Math.hypot((s - p.s) / (p.len ?? 1), lat - p.lat);
      if (d < p.r) h -= p.depth * (1 - (d / p.r) ** 2);
    }
    return h;
  }

  /** Depth carved by puddles alone (<= 0); lets the water sheet follow the undisturbed road. */
  puddleCut(s: number, lat: number): number {
    return this.spotDepth(this.puddles, s, lat);
  }

  inPuddle(s: number, lat: number): boolean {
    return this.spotDepth(this.puddles, s, lat) < -0.01;
  }

  deepMud(s: number): number {
    return smoothstep(0.45, 0.75, noise2(s * 0.03, 3.3, 77));
  }

  /** 0..1 how much of a bog the dirt road is at s (soft 8 m transitions). */
  bogAt(s: number): number {
    for (const b of this.bogs) {
      if (s > b.from - 8 && s < b.to + 8) return smoothstep(b.from - 8, b.from + 4, s) * (1 - smoothstep(b.to - 4, b.to + 8, s)) * b.deep;
    }
    return 0;
  }

  /** Surface the wheels actually feel: bogs turn a dirt road into mud. */
  surfaceAt(s: number, z = this.zoneAt(s)): Surface {
    return z.surface === 'dirt' && this.bogAt(s) > 0.45 ? 'mud' : z.surface;
  }

  /** Long rolling whoops of an unmade road; wavelengths stay above the mesh row spacing. */
  private whoops(s: number, amp: number): number {
    const env = 0.45 + 0.55 * noise2(s * 0.013, 7.7, 41);
    return amp * env * (Math.sin(s * 0.57 + noise2(s * 0.02, 2.1, 42) * 5) * 0.6 + Math.sin(s * 0.27 + 1.3) * 0.4);
  }

  /** Two wheel ruts with a crown between them and spoil berms outside (lat in metres). */
  private ruts(a: number, depth: number, width: number): number {
    return -depth * Math.exp(-(((a - 0.72) / width) ** 2)) + depth * 0.3 * Math.exp(-((a / 0.3) ** 2)) + depth * 0.35 * Math.exp(-(((a - 1.3) / 0.22) ** 2));
  }

  /** `wash` 0..1: a forest track worn into deep ruts and lumpy washouts by rain. */
  private dirtRelief(s: number, lat: number, u: number, a: number, wash = 0): number {
    let h = this.ruts(a, 0.08 + 0.06 * noise2(s * 0.05, 1.7, 7) + wash * (0.06 + 0.08 * noise2(s * 0.03, 4.1, 17)), 0.2 + wash * 0.03);
    h += (noise2(s * 0.33, lat * 0.4, 7) - 0.5) * (0.1 + wash * 0.06);
    h -= 0.05 * u * u;
    h += this.whoops(s, 0.13 + wash * 0.07);
    return h;
  }

  private mudRelief(s: number, lat: number, a: number, deep: number): number {
    let h = this.ruts(a, 0.16 + 0.12 * deep, 0.22);
    h += (noise2(s * 0.25, lat * 0.5, 9) - 0.5) * 0.12;
    h += this.whoops(s, 0.08);
    return h;
  }

  /** Surface relief relative to the centreline height. Shared by physics and the road mesh. */
  detail(s: number, lat: number, z: Zone): number {
    const half = z.width / 2;
    const u = lat / half;
    const a = Math.abs(lat);
    let h = 0;
    switch (z.surface) {
      case 'asphalt':
        h -= 0.035 * u * u;
        h += (noise2(s * 0.4, lat * 0.6, 3) - 0.5) * 0.012;
        break;
      case 'gravel':
        h -= 0.07 * u * u;
        h += (noise2(s * 0.5, lat * 0.5, 5) - 0.5) * 0.03;
        // packed wheel tracks, washboard corrugations and gentle swells
        h -= 0.025 * Math.exp(-(((a - 0.72) / 0.3) ** 2));
        h += Math.sin(s * 8.6 + noise2(s * 0.04, 1, 6) * 6) * 0.011 * smoothstep(0.35, 0.6, noise2(s * 0.01, 4.4, 61));
        h += this.whoops(s, 0.05);
        break;
      case 'dirt': {
        h = this.dirtRelief(s, lat, u, a, z.tag === 'forest' ? 1 : 0);
        const bog = this.bogAt(s);
        if (bog > 0) h = lerp(h, this.mudRelief(s, lat, a, bog), smoothstep(0, 0.6, bog));
        break;
      }
      case 'mud':
        h = this.mudRelief(s, lat, a, this.deepMud(s));
        break;
      default:
        break;
    }
    // cross-fall that wanders from side to side on unmade roads
    if (z.surface === 'dirt' || z.surface === 'mud' || z.surface === 'gravel') h += (noise2(s * 0.018, 5.5, 91) - 0.5) * (z.surface === 'gravel' ? 0.05 : 0.09) * lat;
    // overlapping holes add up, but never into a bottomless crater
    h += Math.max(-0.6, this.spotDepth(this.holes, s, lat) + this.spotDepth(this.puddles, s, lat));
    // keep the deepest point above the sunk 10 m terrain grid so no grass pokes through
    return Math.max(h, -0.85);
  }
}

/** Authored route of the demo: Klyuchevsk → Sosnovka → Zarechye. */
const ROUTE: [number, number][] = [
  [0, 40], [0, -150], [10, -300], [60, -520], [40, -760], [-30, -980], [-20, -1180], [0, -1300],
  [120, -1360], [300, -1400], [480, -1480], [620, -1600], [700, -1780],
  [760, -1980], [720, -2200], [800, -2400], [950, -2550],
  [1050, -2750], [1080, -2950], [1060, -3150], [1120, -3350], [1200, -3550], [1230, -3800], [1260, -3900],
];

export interface Marks {
  junction: number; sosStart: number; sosEnd: number; sosStop: number; forest: number; mud: number; bridge: number;
  zarStart: number; zarEnd: number; zarStop: number; town: number; potholesFrom: number; potholesTo: number;
  church: number; farm: number; tower: number;
}

export class Ground {
  main: Road;
  stub: Road;
  roads: Road[];
  marks: Marks;
  private index = new PointIndex<Sample>(8);
  riverPts: { x: number; z: number }[] = [];
  private riverIndex = new PointIndex<{ x: number; z: number }>(40);
  waterY = 0;
  bedY = 0;
  /** 0..1 how soaked the roads are (rain now or recently); set by the game loop. */
  wet = 0;
  churchPos = new THREE.Vector2();
  private bumps: { x: number; z: number; r: number; h: number }[] = [];
  // terrain grid
  minX = 0; minZ = 0; step = 10; nx = 0; nz = 0;
  heights = new Float32Array(0);
  // coarse nearest-road field
  private fCell = 16; private fNx = 0; private fNz = 0;
  private fDist = new Float32Array(0);
  private fS = new Float32Array(0);
  private fRoad = new Uint8Array(0);

  constructor() {
    this.main = new Road('main', ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z)), 2);
    const L = this.main.length;
    const k = L / 4400;
    const junction = this.main.nearestS(0, -1300);
    const bridge = 3440 * k;
    this.marks = {
      town: 260 * k, junction, sosStart: 1990 * k, sosEnd: 2330 * k, sosStop: 2210 * k,
      forest: 2360 * k, mud: 3060 * k, bridge, zarStart: 3880 * k, zarEnd: L - 25, zarStop: 4190 * k,
      potholesFrom: 430 * k, potholesTo: 1250 * k, church: 4080 * k, farm: 3600 * k, tower: 3790 * k,
    };
    const m = this.marks;
    // ~30 % asphalt to the junction, then ~70 % unmade: washed-out forest track,
    // Sosnovka's dirt street, the river-lowland mud, and the meadow track to Zarechye
    this.main.zones = [
      { from: 0, to: m.town, surface: 'asphalt', width: 7, tag: 'town' },
      { from: m.town, to: junction, surface: 'asphalt', width: 6, tag: 'rural' },
      { from: junction, to: m.sosStart - 60, surface: 'dirt', width: 4.4, tag: 'forest' },
      { from: m.sosStart - 60, to: m.sosEnd + 25, surface: 'dirt', width: 5, tag: 'fields' },
      { from: m.sosEnd + 25, to: m.mud, surface: 'dirt', width: 4.4, tag: 'forest' },
      { from: m.mud, to: bridge - 17, surface: 'mud', width: 4.8, tag: 'mud' },
      { from: bridge - 17, to: bridge + 17, surface: 'wood', width: 4.8, tag: 'bridge' },
      { from: bridge + 17, to: bridge + 190, surface: 'dirt', width: 4.4, tag: 'forest' },
      { from: bridge + 190, to: L + 1, surface: 'dirt', width: 5, tag: 'fields' },
    ];

    // asphalt road continuing straight past the junction
    const jf = this.main.frame(junction);
    const pf = this.main.frame(junction - 40);
    const dx = pf.tx, dz = pf.tz, px = -dz, pz = dx;
    this.stub = new Road('stub', [
      new THREE.Vector3(jf.x - dx * 6, 0, jf.z - dz * 6),
      new THREE.Vector3(jf.x + dx * 130 + px * 8, 0, jf.z + dz * 130 + pz * 8),
      new THREE.Vector3(jf.x + dx * 280 - px * 6, 0, jf.z + dz * 280 - pz * 6),
      new THREE.Vector3(jf.x + dx * 460, 0, jf.z + dz * 460),
    ], 2);
    this.stub.zones = [{ from: 0, to: 1e9, surface: 'asphalt', width: 6, tag: 'rural' }];
    this.roads = [this.main, this.stub];

    this.scatterSpots();
    for (const r of this.roads) for (const s of r.samples) this.index.insert(s);

    // river crossing under the bridge, roughly perpendicular to the road
    const bf = this.main.frame(bridge);
    for (let t = -1700; t <= 1700; t += 20) {
      const mnd = Math.sin(t * 0.0045 + 1) * 70 * smoothstep(60, 420, Math.abs(t));
      const p = { x: bf.x + bf.rx * t + bf.tx * mnd, z: bf.z + bf.rz * t + bf.tz * mnd };
      this.riverPts.push(p);
      this.riverIndex.insert(p);
    }
    const cf = this.main.frame(m.church);
    this.churchPos.set(cf.x + cf.rx * 165, cf.z + cf.rz * 165);
    this.bumps.push({ x: this.churchPos.x, z: this.churchPos.y, r: 75, h: 9 });
    this.bedY = this.hills(bf.x, bf.z) - 4.5;
    this.waterY = this.bedY + 0.55;

    this.assignHeights();
    this.buildGrid();
    this.buildField();
  }

  private scatterSpots(): void {
    const r = mulberry32(4242);
    const m = this.marks;
    const main = this.main;
    // potholes on the rural asphalt, clustered
    let s = m.potholesFrom;
    while (s < m.potholesTo) {
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) main.holes.push({ s: s + (r() - 0.5) * 6, lat: (r() - 0.5) * 4.6, r: 0.45 + r() * 0.7, depth: 0.06 + r() * 0.08 });
      s += 14 + r() * 36;
    }
    // unmade roads: frequent potholes and wheel-swallowing holes, mostly in the ruts
    const rutLat = () => (r() < 0.7 ? (r() < 0.5 ? -0.72 : 0.72) + (r() - 0.5) * 0.4 : (r() - 0.5) * 3.2);
    const forest = (s2: number) => main.zoneAt(s2).tag === 'forest';
    const dirt = (s2: number) => main.zoneAt(s2).surface === 'dirt';
    for (let s2 = m.junction + 15; s2 < main.length - 20; s2 += forest(s2) ? 5 + r() * 11 : 10 + r() * 20) {
      if (!dirt(s2)) continue;
      main.holes.push({ s: s2, lat: rutLat(), r: 0.5 + r() * 0.6, depth: 0.08 + r() * 0.12 });
    }
    // the washed-out forest track: huge pits (most of them full of water) and
    // erosion gullies cut straight across the road by spring meltwater
    for (let s2 = m.junction + 30; s2 < main.length - 30; s2 += forest(s2) ? 18 + r() * 30 : 55 + r() * 60) {
      if (!dirt(s2)) continue;
      const big = forest(s2) ? 1 : 0.6;
      const pit = { s: s2, lat: (r() - 0.5) * 2.4, r: (1.1 + r() * 1.0) * (0.75 + big * 0.25), depth: (0.24 + r() * 0.18) * big };
      if (r() < 0.65) main.puddles.push(pit); else main.holes.push(pit);
    }
    for (let s2 = m.junction + 80; s2 < main.length - 30; s2 += 70 + r() * 90) {
      if (!forest(s2)) continue;
      main.holes.push({ s: s2, lat: (r() - 0.5) * 0.8, r: 2.4 + r() * 0.8, depth: 0.16 + r() * 0.12, len: 0.22 + r() * 0.1 });
    }
    main.holes.sort((a, b) => a.s - b.s);
    // bogs: waterlogged hollows on the forest track and in the river meadows
    main.bogs = [
      { from: m.junction + 240, to: m.junction + 275, deep: 0.8 },
      { from: m.junction + 520, to: m.junction + 560, deep: 0.9 },
      { from: m.forest + 170, to: m.forest + 205, deep: 0.85 },
      { from: m.forest + 430, to: m.forest + 478, deep: 1 },
      { from: m.bridge + 55, to: m.bridge + 92, deep: 0.9 },
      { from: m.zarStart - 95, to: m.zarStart - 66, deep: 0.7 },
    ];
    // puddles: round ones in hollows, long ones lying in the ruts
    const addP = (from: number, to: number, gap: number, deep = 0.13) => {
      for (let s2 = from; s2 < to; s2 += gap * (0.6 + r())) {
        if (r() < 0.45) main.puddles.push({ s: s2, lat: (r() < 0.5 ? -0.72 : 0.72) + (r() - 0.5) * 0.2, r: 0.5 + r() * 0.25, depth: deep * 0.9, len: 4 + r() * 6 });
        else main.puddles.push({ s: s2, lat: (r() - 0.5) * 2.2, r: 1.0 + r() * 1.5, depth: deep + r() * 0.07 });
      }
    };
    addP(m.junction + 40, m.sosStart - 60, 22, 0.15);
    addP(m.sosStart - 60, m.sosEnd + 25, 30, 0.12);
    addP(m.sosEnd + 25, m.mud, 20, 0.15);
    addP(m.mud + 10, m.bridge - 20, 14, 0.16);
    addP(m.bridge + 25, m.bridge + 190, 20, 0.15);
    addP(m.bridge + 190, m.zarStart, 30);
    addP(m.zarStart, m.zarEnd, 34, 0.11);
    // every bog is a chain of flooded ruts
    for (const bg of main.bogs) for (let s2 = bg.from; s2 < bg.to; s2 += 3.5 + r() * 3) {
      main.puddles.push({ s: s2, lat: (r() < 0.5 ? -0.72 : 0.72) + (r() - 0.5) * 0.16, r: 0.45 + r() * 0.2, depth: 0.14, len: 3 + r() * 4 });
    }
    main.puddles.sort((a, b) => a.s - b.s);
  }

  hills(x: number, z: number): number {
    let h = (fbm(x * 0.0016, z * 0.0016, 4, 1) - 0.5) * 36 + (fbm(x * 0.009, z * 0.009, 3, 2) - 0.5) * 4;
    for (const b of this.bumps) {
      const d2 = (x - b.x) ** 2 + (z - b.z) ** 2;
      h += b.h * Math.exp(-d2 / (b.r * b.r));
    }
    return h;
  }

  riverDist(x: number, z: number): number {
    const n = this.riverIndex.nearest(x, z, 260);
    return n ? Math.sqrt(n.d2) : 260;
  }

  /** Natural terrain incl. the river valley, without the channel. */
  base(x: number, z: number, dr = this.riverDist(x, z)): number {
    const h = this.hills(x, z);
    const f = 1 - smoothstep(14, 200, dr);
    return lerp(h, this.bedY + 1.5, f * 0.92);
  }

  private assignHeights(): void {
    for (const road of this.roads) {
      const raw = road.samples.map((p) => this.base(p.x, p.z));
      let ys = raw;
      const R = 20;
      for (let pass = 0; pass < 2; pass++) {
        const out = new Array<number>(ys.length);
        for (let i = 0; i < ys.length; i++) {
          let sum = 0, n = 0;
          for (let j = Math.max(0, i - R); j <= Math.min(ys.length - 1, i + R); j++) { sum += ys[j]; n++; }
          out[i] = sum / n;
        }
        ys = out;
      }
      road.samples.forEach((p, i) => { p.y = ys[i]; });
    }
    const deck = this.waterY + 2.4;
    for (const p of this.main.samples) {
      const d = Math.abs(p.s - this.marks.bridge);
      if (d < 17) p.y = deck;
      else if (d < 64) p.y = lerp(deck, p.y, smoothstep(17, 64, d));
    }
    const jy = this.main.frame(this.marks.junction).y;
    for (const p of this.stub.samples) p.y = lerp(jy, p.y, smoothstep(0, 50, p.s));
  }

  nearestRoad(x: number, z: number, maxR: number): { sample: Sample; s: number; lat: number; along: number; d: number } | null {
    const n = this.index.nearest(x, z, maxR);
    if (!n) return null;
    const p = n.item;
    const vx = x - p.x, vz = z - p.z;
    const along = vx * p.tx + vz * p.tz;
    const last = p.road.samples.length - 1;
    if ((p.i === 0 && along < -1) || (p.i === last && along > 1)) return null;
    const lat = vx * -p.tz + vz * p.tx;
    return { sample: p, s: p.s + along, lat, along, d: Math.sqrt(n.d2) };
  }

  private centerY(p: Sample, along: number): number {
    const road = p.road;
    const j = clamp(along >= 0 ? p.i + 1 : p.i - 1, 0, road.samples.length - 1);
    return lerp(p.y, road.samples[j].y, clamp(Math.abs(along) / road.spacing, 0, 1));
  }

  private buildGrid(): void {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of this.roads) for (const p of r.samples) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const M = 460;
    this.minX = Math.floor((minX - M) / this.step) * this.step;
    this.minZ = Math.floor((minZ - M) / this.step) * this.step;
    this.nx = Math.ceil((maxX + M - this.minX) / this.step) + 1;
    this.nz = Math.ceil((maxZ + M - this.minZ) / this.step) + 1;
    this.heights = new Float32Array(this.nx * this.nz);
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.minX + ix * this.step, z = this.minZ + iz * this.step;
        const dr = this.riverDist(x, z);
        let h = this.base(x, z, dr);
        if (dr < 18) h = Math.min(h, lerp(this.waterY - 1.3, this.waterY + 0.9, smoothstep(4, 18, dr)));
        const hit = this.nearestRoad(x, z, 30);
        if (hit) {
          const zone = hit.sample.road.zoneAt(hit.s);
          if (zone.surface !== 'wood') {
            const half = zone.width / 2;
            // unmade roads carve deep relief, so sink the coarse terrain grid further below them
            const target = this.centerY(hit.sample, hit.along) - (zone.surface === 'asphalt' ? 0.5 : 1.15);
            const d = Math.abs(hit.lat);
            h = d < half + 2.6 ? target : lerp(target, h, smoothstep(half + 2.6, half + 18, d));
          }
        }
        this.heights[iz * this.nx + ix] = h;
      }
    }
  }

  terrainAt(x: number, z: number): number {
    const fx = clamp((x - this.minX) / this.step, 0, this.nx - 1.001);
    const fz = clamp((z - this.minZ) / this.step, 0, this.nz - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const i = iz * this.nx + ix;
    const h = this.heights;
    // match the triangle split used by the rendered grid
    if (tx + tz <= 1) return h[i] + (h[i + 1] - h[i]) * tx + (h[i + this.nx] - h[i]) * tz;
    return h[i + this.nx + 1] + (h[i + this.nx] - h[i + this.nx + 1]) * (1 - tx) + (h[i + 1] - h[i + this.nx + 1]) * (1 - tz);
  }

  private buildField(): void {
    const c = this.fCell;
    this.fNx = Math.ceil((this.nx * this.step) / c) + 1;
    this.fNz = Math.ceil((this.nz * this.step) / c) + 1;
    const n = this.fNx * this.fNz;
    this.fDist = new Float32Array(n).fill(1e9);
    this.fS = new Float32Array(n);
    this.fRoad = new Uint8Array(n);
    const R = 300, rc = Math.ceil(R / c);
    this.roads.forEach((road, ri) => {
      for (let i = 0; i < road.samples.length; i += 3) {
        const p = road.samples[i];
        const cx = Math.floor((p.x - this.minX) / c), cz = Math.floor((p.z - this.minZ) / c);
        for (let iz = Math.max(0, cz - rc); iz <= Math.min(this.fNz - 1, cz + rc); iz++) {
          for (let ix = Math.max(0, cx - rc); ix <= Math.min(this.fNx - 1, cx + rc); ix++) {
            const x = this.minX + (ix + 0.5) * c, z = this.minZ + (iz + 0.5) * c;
            const d = Math.hypot(x - p.x, z - p.z);
            const k = iz * this.fNx + ix;
            if (d < this.fDist[k]) { this.fDist[k] = d; this.fS[k] = p.s; this.fRoad[k] = ri; }
          }
        }
      }
    });
  }

  /** Coarse distance to the nearest road (16 m cells) for layout decisions. */
  field(x: number, z: number): { d: number; s: number; road: Road } {
    const ix = clamp(Math.floor((x - this.minX) / this.fCell), 0, this.fNx - 1);
    const iz = clamp(Math.floor((z - this.minZ) / this.fCell), 0, this.fNz - 1);
    const k = iz * this.fNx + ix;
    return { d: this.fDist[k], s: this.fS[k], road: this.roads[this.fRoad[k]] };
  }

  query(x: number, z: number, out: GroundInfo): GroundInfo {
    const tH = this.terrainAt(x, z);
    out.road = null;
    out.onRoad = false;
    out.puddle = false;
    out.water = 0;
    out.tag = '';
    out.height = tH;
    out.s = 0;
    out.lat = 0;
    out.half = 0;
    let surf: Surface = tH < this.waterY - 0.05 ? 'water' : 'grass';
    const hit = this.nearestRoad(x, z, 12);
    if (hit) {
      const road = hit.sample.road;
      const zone = road.zoneAt(hit.s);
      const half = zone.width / 2;
      const a = Math.abs(hit.lat);
      out.road = road; out.s = hit.s; out.lat = hit.lat; out.half = half; out.tag = zone.tag;
      const cy = this.centerY(hit.sample, hit.along);
      if (a <= half) {
        out.height = cy + road.detail(hit.s, hit.lat, zone) + (road === this.stub ? -0.015 : 0);
        surf = road.surfaceAt(hit.s, zone);
        out.onRoad = true;
        const cut = road.puddleCut(hit.s, hit.lat);
        out.puddle = cut < -0.01;
        out.water = Math.max(0, -cut * 0.75 - 0.03);
      } else if (a <= half + 2.6 && zone.surface !== 'wood') {
        const t = smoothstep(0, 1, (a - half) / 2.6);
        const edge = cy + road.detail(hit.s, Math.sign(hit.lat) * half, zone);
        out.height = lerp(edge, tH, t);
        surf = 'grass';
      }
    }
    const p = SURF[surf];
    out.surface = surf;
    out.mu = p.mu;
    out.crr = p.crr;
    out.rough = p.rough;
    if (surf === 'mud' && out.road) {
      const zone = out.road.zoneAt(out.s);
      // the deep holes of the mud section suck harder than 1st gear in high range can
      // pull (~7 kN): rush them or engage the low range. Roadside bogs stay milder.
      const core = zone.surface === 'mud';
      const deep = core ? out.road.deepMud(out.s) : out.road.bogAt(out.s) * 0.7;
      out.crr += deep * (core ? 0.25 : 0.12);
      out.mu -= deep * 0.03;
    }
    // soaked ground: slicker clay, softer ruts; asphalt only loses a little
    if (this.wet > 0) {
      const w = this.wet;
      if (surf === 'dirt' || surf === 'mud' || surf === 'grass') { out.mu *= 1 - 0.14 * w; out.crr += (surf === 'dirt' ? 0.012 : 0.02) * w; }
      else if (surf === 'gravel') out.mu *= 1 - 0.06 * w;
      else if (surf === 'asphalt') out.mu *= 1 - 0.08 * w;
    }
    if (out.puddle) out.crr += 0.03;
    return out;
  }

  height(x: number, z: number): number {
    return this.query(x, z, scratch).height;
  }
}

const scratch = newGround();
