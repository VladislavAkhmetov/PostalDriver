import * as THREE from 'three';
import { Bucket, boxGeo, crossQuads } from '../core/geom';
import { clamp, fbm, lerp, mulberry32, noise2, rand, RNG, smoothstep } from '../core/math';
import { BLUE, blueSign, directionSign, kmPost, paint, settlementSign, Textures, warningSign } from '../core/textures';
import { Ground, Road, Surface } from './Ground';
import {
  boardFence, busStop, church, Collider, farm, fence, garages, yardGate, haystack, izba, khrushchyovka, makeCow, Place,
  pole, postOffice, shed, shop, signPost, streetLamp, waterTower, well, woodpile, bench, T, boxCollider,
} from './Props';
import { Railway, RailSound } from './Railway';
import { barrierArm, BILLBOARDS, billboard, billboardTex, cafe, chimney, crossingBooth, gaiPost, gasStation, grainElevator, pylon, stela, vendorStall } from './Roadside';
import { Traffic, TrafficSound } from './Traffic';
import { buildVehicle, setVehicleLamps } from './Vehicles';
import { buildCar } from './Cars';
import type { GaiPatrol } from './Police';
import { Officer } from './Officer';
import { makePerson, Person } from './People';

export class ColliderIndex {
  private cells = new Map<number, Collider[]>();
  private readonly cell = 20;
  /** Moving colliders (traffic, train, barrier booms), checked every query. */
  readonly dynamic: Collider[] = [];
  private key(ix: number, iz: number): number { return (ix + 5000) * 10000 + (iz + 5000); }
  add(c: Collider): void {
    const r = c.r, k = this.cell;
    for (let ix = Math.floor((c.x - r) / k); ix <= Math.floor((c.x + r) / k); ix++) {
      for (let iz = Math.floor((c.z - r) / k); iz <= Math.floor((c.z + r) / k); iz++) {
        const key = this.key(ix, iz);
        let l = this.cells.get(key);
        if (!l) { l = []; this.cells.set(key, l); }
        l.push(c);
      }
    }
  }
  query(x: number, z: number, r: number): Collider[] {
    const out = new Set<Collider>();
    const k = this.cell;
    for (let ix = Math.floor((x - r) / k); ix <= Math.floor((x + r) / k); ix++) {
      for (let iz = Math.floor((z - r) / k); iz <= Math.floor((z + r) / k); iz++) {
        const l = this.cells.get(this.key(ix, iz));
        if (l) for (const c of l) out.add(c);
      }
    }
    for (const c of this.dynamic) if (Math.abs(c.x - x) < r + c.r && Math.abs(c.z - z) < r + c.r) out.add(c);
    return [...out];
  }
}

export interface Stop {
  id: string;
  name: string;
  s: number;
  pos: THREE.Vector3;
  person: Person;
  speaker: string;
  line: string;
  cargo: string;
  done: boolean;
}

type TreeKind = 'birch' | 'spruce' | 'pine' | 'bush' | 'reeds';

const L = (map?: THREE.Texture | null, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ map: map ?? null, vertexColors: true, ...extra });

export class World {
  readonly group = new THREE.Group();
  readonly colliders = new ColliderIndex();
  readonly stops: Stop[] = [];
  readonly people: Person[] = [];
  readonly cowSpots: THREE.Vector3[] = [];
  readonly startPose: { x: number; z: number; yaw: number };
  private mats: Record<string, THREE.Material> = {};
  private wetMats: THREE.MeshLambertMaterial[] = [];
  private litMats: { m: THREE.MeshLambertMaterial; k: number }[] = [];
  private puddleMat: THREE.MeshBasicMaterial;
  private puddles!: THREE.Mesh;
  private waterMat: THREE.MeshLambertMaterial;
  private waterTex: THREE.Texture;
  private trees: Record<TreeKind, { m: THREE.Matrix4[]; c: THREE.Color[] }> = {
    birch: { m: [], c: [] }, spruce: { m: [], c: [] }, pine: { m: [], c: [] }, bush: { m: [], c: [] }, reeds: { m: [], c: [] },
  };
  private exclusions: { x: number; z: number; r: number }[] = [];
  /** Stretches of road lined with private houses (villages, hamlets, town outskirts). */
  readonly hamlets: [number, number][] = [];
  private cows: THREE.Group[] = [];
  private signCount = 0;
  readonly farRing: THREE.Mesh;
  readonly rail: Railway;
  readonly traffic: Traffic;
  private smoke: { sprite: THREE.Sprite; age: number; life: number }[] = [];
  private smokeSrc = new THREE.Vector3();
  /** Patrol car and inspector at the GAI post, driven by Police. */
  gai!: GaiPatrol;

  constructor(readonly ground: Ground, private T: Textures) {
    this.makeMaterials();
    // translucent: the dark mud floor shows through a dull sky reflection
    this.puddleMat = new THREE.MeshBasicMaterial({ color: 0x8a949a, side: THREE.DoubleSide, transparent: true, opacity: 0.62, depthWrite: false });
    this.waterTex = T.water.clone();
    this.waterTex.needsUpdate = true;
    this.waterTex.repeat.set(2, 1);
    this.waterMat = new THREE.MeshLambertMaterial({ map: this.waterTex, color: 0x8fa0a8, emissive: 0x1a2428 });

    const sf = ground.main.frame(22);
    this.startPose = { x: sf.x + sf.rx * 1.7, z: sf.z + sf.rz * 1.7, yaw: Math.atan2(-sf.tx, -sf.tz) };

    const r = mulberry32(1997);
    const b = new Bucket();
    const m = ground.marks;
    // known up front: terrain colouring and tree layout keep these yards clear
    const villages: [number, number, number | null, number[]][] = [
      [m.sosStart, m.sosEnd, m.sosStop, [-1, 1]],
      [m.zarStart, m.zarEnd, m.zarStop, [-1, 1]],
      // private houses behind the town limit, a hamlet before the fork,
      // a farmstead on the gravel and a few yards in the river meadows
      [m.town + 28, m.town + 300, null, [-1, 1]],
      [m.junction - 300, m.junction - 95, null, [-1]],
      [m.junction + 330, m.junction + 420, null, [1]],
      [m.bridge + 205, m.bridge + 330, null, [1]],
    ];
    for (const v of villages) this.hamlets.push([v[0], v[1]]);
    // single-track railway crossing the asphalt a little past the GAI post
    this.rail = new Railway(ground, m.town + 520);
    this.buildRoads();
    this.buildTerrain();
    this.buildRiver(b);
    this.buildTown(b, r);
    for (const [from, to, stop, sides] of villages) this.buildVillage(b, r, from, to, stop, sides);
    this.buildStops(b);
    const railCols: Collider[] = [];
    this.rail.buildStatic(b, railCols, (t) => this.signMat(t));
    railCols.forEach((c) => this.colliders.add(c));
    this.group.add(this.rail.group);
    this.buildRoadside(b, r);
    this.buildLandmarks(b, r);
    this.buildPoles(b, r);
    this.buildSigns(b);
    this.buildVegetation(r);
    this.buildFauna(r);
    this.group.add(b.build(this.mats, 'static'));

    const ringGeo = new THREE.CylinderGeometry(560, 560, 70, 48, 1, true);
    const ringTex = T.farForest;
    ringTex.wrapS = THREE.RepeatWrapping;
    ringTex.repeat.set(9, 1);
    this.farRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, alphaTest: 0.5, side: THREE.BackSide, fog: false, color: 0x55604a }));
    this.farRing.renderOrder = -5;
    this.group.add(this.farRing);

    for (const c of this.rail.dynamicColliders()) this.colliders.dynamic.push(c);
    const spray = paint(16, 16, (c) => {
      const gr = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 16, 16);
    }, { repeat: false });
    this.traffic = new Traffic(ground, this.rail, this.colliders.dynamic, spray);
    this.group.add(this.traffic.group);
  }

  private makeMaterials(): void {
    const T = this.T;
    const lit = (map: THREE.Texture, glow: THREE.Texture | null, k: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
      const m = L(map, { emissive: 0xffc27a, emissiveMap: glow, emissiveIntensity: 0, ...extra });
      this.litMats.push({ m, k });
      return m;
    };
    const wet = (m: THREE.MeshLambertMaterial) => { this.wetMats.push(m); return m; };
    const DS = THREE.DoubleSide;
    this.mats = {
      flat: L(), logs: L(T.logs), boards: L(T.boards), brickRed: L(T.brickRed), brickWhite: L(T.brickWhite),
      slate: L(T.slate, { side: DS }), metalRoof: L(T.metalRoof, { side: DS }), plaster: L(T.plaster), concrete: L(T.concrete),
      rust: L(T.rust, { side: DS }), hay: L(T.hay), planks: L(T.planks), woodEnds: L(T.woodEnds),
      picket: L(T.picket, { alphaTest: 0.5, side: DS }),
      winBlue: L(T.winBlue, { alphaTest: 0.5 }), winWhite: L(T.winWhite, { alphaTest: 0.5 }), winGreen: L(T.winGreen, { alphaTest: 0.5 }),
      winBlueLit: lit(T.winBlue, T.winGlow, 1.2, { alphaTest: 0.5 }), winWhiteLit: lit(T.winWhite, T.winGlow, 1.2, { alphaTest: 0.5 }),
      winGreenLit: lit(T.winGreen, T.winGlow, 1.2, { alphaTest: 0.5 }),
      facadeLit: lit(T.facade, T.facadeGlow, 1.1), pochta: lit(T.pochtaSign, T.pochtaSign, 0.5), shop: L(T.shopSign), door: L(T.door),
      mosaic: L(T.mosaic), garage: L(T.garageDoor), bigWin: L(T.bigWindow), bigWinLit: lit(T.bigWindow, T.bigWindow, 0.6),
      lamp: lit(T.plaster, null, 2.2),
      asphalt: wet(L(T.asphalt)), gravel: wet(L(T.gravel)), dirt: wet(L(T.dirt)), mud: wet(L(T.mud)), wood: wet(L(T.planks)),
      shoulder: wet(L(T.grass)), terrain: wet(L(T.grass)),
    };
  }

  private signMat(tex: THREE.Texture): string {
    const key = `sign${this.signCount++}`;
    this.mats[key] = L(tex, { alphaTest: 0.5 });
    return key;
  }

  // ------------------------------------------------------------ roads

  private buildRoads(): void {
    const tile: Record<Surface, number> = { asphalt: 8, gravel: 4, dirt: 4, mud: 4, wood: 2, grass: 4, water: 4 };
    // one fixed column layout for the whole road (no T-junction cracks between zones),
    // fine enough to carve readable wheel ruts
    const LAT = Array.from({ length: 21 }, (_, i) => -1 + i * 0.1);
    const buf: Record<string, { p: number[]; u: number[]; c: number[] }> = {};
    const get = (k: string) => (buf[k] ??= { p: [], u: [], c: [] });
    const g = this.ground;
    for (const road of g.roads) {
      const off = road === g.stub ? -0.015 : 0;
      // rows every 2 m, every metre where the relief is rough enough to need it
      const ss: number[] = [];
      for (let s = 0; s < road.length; ) {
        ss.push(s);
        const surf = road.zoneAt(s).surface;
        s += surf === 'dirt' || surf === 'mud' ? 1 : 2;
      }
      ss.push(road.length);
      const rows = ss.map((s) => {
        const p = road.frame(s);
        const zone = road.zoneAt(s);
        const half = zone.width / 2;
        const rx = p.rx, rz = p.rz;
        const offroad = zone.surface === 'dirt' || zone.surface === 'mud';
        const pts = LAT.map((u) => {
          const lat = u * half;
          return [p.x + rx * lat, p.y + road.detail(s, lat, zone) + 0.03 + off, p.z + rz * lat];
        });
        // darker, wetter wheel ruts
        const shade = 0.9 + noise2(s * 0.04, 1, 12) * 0.16;
        const cols = LAT.map((u) => {
          const a = Math.abs(u * half);
          const rut = offroad ? Math.exp(-(((a - 0.72) / 0.26) ** 2)) * 0.28 : zone.surface === 'gravel' ? Math.exp(-(((a - 0.72) / 0.3) ** 2)) * 0.1 : 0;
          return shade * (1 - rut);
        });
        const outer = [-1, 1].map((side) => {
          const lat = side * (half + 2.6);
          const x = p.x + rx * lat, z = p.z + rz * lat;
          return [x, g.terrainAt(x, z) - 0.04, z];
        });
        return { pts, cols, outer, s };
      });
      for (let i = 0; i < rows.length - 1; i++) {
        const A = rows[i], B = rows[i + 1];
        const zone = road.zoneAt((A.s + B.s) / 2);
        const surf = road.surfaceAt((A.s + B.s) / 2, zone);
        const tl = tile[surf];
        const dst = get(surf);
        for (let j = 0; j < LAT.length - 1; j++) {
          const a = A.pts[j], bb = A.pts[j + 1], c = B.pts[j + 1], d = B.pts[j];
          const u0 = (LAT[j] + 1) / 2, u1 = (LAT[j + 1] + 1) / 2;
          dst.p.push(...a, ...bb, ...d, ...bb, ...c, ...d);
          dst.u.push(u0, A.s / tl, u1, A.s / tl, u0, B.s / tl, u1, A.s / tl, u1, B.s / tl, u0, B.s / tl);
          for (const v of [A.cols[j], A.cols[j + 1], B.cols[j], A.cols[j + 1], B.cols[j + 1], B.cols[j]]) dst.c.push(v, v, v);
        }
        if (zone.surface === 'wood') continue;
        const sh = get('shoulder');
        const strips: [number[], number[], number[], number[]][] = [
          [A.outer[0], A.pts[0], B.pts[0], B.outer[0]],
          [A.pts[LAT.length - 1], A.outer[1], B.outer[1], B.pts[LAT.length - 1]],
        ];
        for (const [a, bb, c, d] of strips) {
          sh.p.push(...a, ...bb, ...d, ...bb, ...c, ...d);
          sh.u.push(0, A.s / 4, 0.6, A.s / 4, 0, B.s / 4, 0.6, A.s / 4, 0.6, B.s / 4, 0, B.s / 4);
          for (let k = 0; k < 6; k++) sh.c.push(0.78, 0.72, 0.5);
        }
      }
    }
    for (const [k, v] of Object.entries(buf)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v.p, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(v.u, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(v.c, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.mats[k]);
      mesh.name = `road:${k}`;
      this.group.add(mesh);
    }
    this.buildDecals();
  }

  private buildDecals(): void {
    const main = this.ground.main;
    const holes: number[] = [], hu: number[] = [];
    for (const h of main.holes) {
      const zone = main.zoneAt(h.s);
      // broken-tarmac decals only make sense on sealed and gravel roads
      if (zone.surface !== 'asphalt' && zone.surface !== 'gravel') continue;
      const R = h.r * 1.25, N = 3;
      const grid: number[][][] = [];
      for (let iy = 0; iy <= N; iy++) {
        const row: number[][] = [];
        for (let ix = 0; ix <= N; ix++) {
          const ds = (iy / N - 0.5) * 2 * R, dl = (ix / N - 0.5) * 2 * R;
          const f = main.frame(h.s + ds);
          const lat = h.lat + dl;
          row.push([f.x + f.rx * lat, f.y + main.detail(h.s + ds, lat, zone) + 0.05, f.z + f.rz * lat]);
        }
        grid.push(row);
      }
      for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
        const a = grid[iy][ix], b = grid[iy][ix + 1], c = grid[iy + 1][ix + 1], d = grid[iy + 1][ix];
        holes.push(...a, ...b, ...d, ...b, ...c, ...d);
        const u0 = ix / N, u1 = (ix + 1) / N, v0 = iy / N, v1 = (iy + 1) / N;
        hu.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
      }
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(holes, 3));
    hg.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2));
    hg.computeVertexNormals();
    const hm = new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ map: this.T.pothole, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.wetMats.push(hm.material as THREE.MeshLambertMaterial);
    this.group.add(hm);

    // Puddles: a water sheet draped over the *undisturbed* road relief (ruts included)
    // and sunk by ~30 % of the hole depth, so the road surface clips it exactly where
    // the carved depression is deep. Works on grades where a flat sheet would spill.
    const pp: number[] = [], pu: number[] = [];
    const N = 12, RINGS = [0, 0.35, 0.65, 0.88, 1.02];
    for (const p of main.puddles) {
      const zone = main.zoneAt(p.s);
      if (zone.surface === 'wood') continue;
      const len = p.len ?? 1;
      const at = (t: number, a: number) => {
        const ds = Math.cos(a) * p.r * len * t, dl = Math.sin(a) * p.r * t;
        const s2 = p.s + ds, l2 = p.lat + dl;
        const f = main.frame(s2);
        const y = f.y + main.detail(s2, l2, main.zoneAt(s2)) - main.puddleCut(s2, l2) - p.depth * 0.3 + 0.03;
        return [f.x + f.rx * l2, y, f.z + f.rz * l2];
      };
      const grid = RINGS.map((t) => Array.from({ length: N }, (_, k) => at(t, (k / N) * Math.PI * 2)));
      const uvAt = (t: number, k: number) => [0.5 + Math.cos((k / N) * Math.PI * 2) * 0.5 * t, 0.5 + Math.sin((k / N) * Math.PI * 2) * 0.5 * t];
      for (let ri = 0; ri < RINGS.length - 1; ri++) for (let k = 0; k < N; k++) {
        const k1 = (k + 1) % N;
        const a0 = grid[ri][k], a1 = grid[ri][k1], b0 = grid[ri + 1][k], b1 = grid[ri + 1][k1];
        if (ri === 0) { pp.push(...a0, ...b1, ...b0); pu.push(...uvAt(0, k), ...uvAt(RINGS[1], k1), ...uvAt(RINGS[1], k)); continue; }
        pp.push(...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
        pu.push(...uvAt(RINGS[ri], k), ...uvAt(RINGS[ri + 1], k1), ...uvAt(RINGS[ri + 1], k), ...uvAt(RINGS[ri], k), ...uvAt(RINGS[ri], k1), ...uvAt(RINGS[ri + 1], k1));
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
    pg.computeVertexNormals();
    this.puddles = new THREE.Mesh(pg, this.puddleMat);
    this.puddles.name = 'puddles';
    this.group.add(this.puddles);
  }

  // ------------------------------------------------------------ terrain & vegetation layout

  private inVillage(s: number): boolean {
    return this.hamlets.some(([a, b]) => s > a - 40 && s < b + 40);
  }

  private layout(x: number, z: number): { dens: number; belt: boolean; tag: string; d: number; s: number; main: boolean } {
    const g = this.ground;
    const f = g.field(x, z);
    const main = f.road === g.main;
    const tag = main ? g.main.zoneAt(f.s).tag : 'rural';
    const d = f.d;
    let dens = smoothstep(0.5, 0.64, fbm(x * 0.0032, z * 0.0032, 3, 5));
    if (main && tag === 'forest') dens = Math.max(dens, 1 - smoothstep(170, 300, d));
    if (main && tag === 'mud') dens = Math.max(dens * 0.7, d > 30 && d < 220 ? 0.45 : 0);
    let belt = false;
    if (tag === 'rural' || tag === 'gravel' || tag === 'fields' || tag === 'bridge') {
      dens *= smoothstep(45, 130, d);
      if (d > 52 && d < 64 && noise2(f.s * 0.012, x > 0 ? 1 : 2, 33) > 0.38) { dens = 0.95; belt = true; }
    }
    if (main && this.inVillage(f.s) && d < 95) dens = 0;
    if (main && tag === 'town' && d < 170) dens = 0;
    if (main && Math.abs(f.s - g.marks.junction) < 40 && d < 40) dens = 0;
    return { dens, belt, tag, d, s: f.s, main };
  }

  private buildTerrain(): void {
    const g = this.ground;
    const nx = g.nx, nz = g.nz;
    const pos = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const col = new Float32Array(nx * nz * 3);
    const c = new THREE.Color();
    const cA = new THREE.Color('#7f8c3e'), cB = new THREE.Color('#a8a058'), cDark = new THREE.Color('#56632c');
    const cField = new THREE.Color('#6e5642'), cStubble = new THREE.Color('#b8a868'), cForest = new THREE.Color('#4a562a');
    const cBank = new THREE.Color('#5f6440'), cBed = new THREE.Color('#4a4636'), cDust = new THREE.Color('#9a9068');
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const x = g.minX + ix * g.step, z = g.minZ + iz * g.step;
        const h = g.heights[i];
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        uv[i * 2] = x / 6; uv[i * 2 + 1] = z / 6;
        const lay = this.layout(x, z);
        c.copy(cA).lerp(cB, fbm(x * 0.004, z * 0.004, 3, 21)).lerp(cDark, noise2(x * 0.03, z * 0.03, 22) * 0.45);
        const fieldN = fbm(x * 0.0022, z * 0.0022, 2, 23);
        if (lay.dens < 0.3 && lay.d > 38 && fieldN > 0.56) c.lerp(fieldN > 0.63 ? cField : cStubble, 0.85);
        c.lerp(cForest, smoothstep(0.3, 0.9, lay.dens) * 0.8);
        const dr = g.riverDist(x, z);
        if (dr < 30) c.lerp(cBank, 1 - smoothstep(10, 30, dr));
        if (h < g.waterY) c.copy(cBed);
        if (lay.d < 10) c.lerp(cDust, 0.5);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
    }
    const idx: number[] = [];
    for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, cc = a + nx, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    // normals over the whole grid so chunk borders stay seamless
    const full = new THREE.BufferGeometry();
    full.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    full.setIndex(idx);
    full.computeVertexNormals();
    const nrm = full.attributes.normal.array as Float32Array;
    full.dispose();

    // split into ~240 m chunks so the frustum can cull what's behind the van
    const C = 24;
    for (let cz = 0; cz < nz - 1; cz += C) for (let cx = 0; cx < nx - 1; cx += C) {
      const w = Math.min(C, nx - 1 - cx) + 1, hgt = Math.min(C, nz - 1 - cz) + 1;
      const P = new Float32Array(w * hgt * 3), N = new Float32Array(w * hgt * 3), U = new Float32Array(w * hgt * 2), K = new Float32Array(w * hgt * 3);
      for (let j = 0; j < hgt; j++) for (let i = 0; i < w; i++) {
        const src = (cz + j) * nx + cx + i, dst = j * w + i;
        P.set(pos.subarray(src * 3, src * 3 + 3), dst * 3);
        N.set(nrm.subarray(src * 3, src * 3 + 3), dst * 3);
        K.set(col.subarray(src * 3, src * 3 + 3), dst * 3);
        U.set(uv.subarray(src * 2, src * 2 + 2), dst * 2);
      }
      const ci: number[] = [];
      for (let j = 0; j < hgt - 1; j++) for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, cc = a + w, d = cc + 1;
        ci.push(a, cc, b, b, cc, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(K, 3));
      geo.setIndex(ci);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.mats.terrain);
      mesh.name = 'terrain';
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  private buildRiver(b: Bucket): void {
    const g = this.ground;
    const pts = g.riverPts;
    const pos: number[] = [], uv: number[] = [];
    let v = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz);
      const nx = -dz / l * 15, nz = dx / l * 15;
      const y = g.waterY;
      pos.push(a.x - nx, y, a.z - nz, a.x + nx, y, a.z + nz, c.x - nx, y, c.z - nz, a.x + nx, y, a.z + nz, c.x + nx, y, c.z + nz, c.x - nx, y, c.z - nz);
      const v1 = v + l / 12;
      uv.push(0, v, 1, v, 0, v1, 1, v, 1, v1, 0, v1);
      v = v1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    this.group.add(new THREE.Mesh(geo, this.waterMat));

    // bridge
    const f = g.main.frame(g.marks.bridge);
    const deck = g.waterY + 2.4;
    const p: Place = { x: f.x, y: deck, z: f.z, rot: Math.atan2(f.tx, f.tz) };
    b.add('planks', boxGeo(5.4, 0.35, 34, 2), T(p, 0, -0.22, 0), '#8a7a62');
    for (const s of [-1, 1]) {
      b.add('planks', boxGeo(0.28, 0.25, 34, 1), T(p, s * 2.45, 0.14, 0), '#7a6a52');
      b.add('planks', boxGeo(0.12, 0.12, 34, 1), T(p, s * 2.7, 1.05, 0), '#8a7a62');
      for (let z = -17; z <= 17; z += 2.1) b.add('flat', boxGeo(0.12, 1.1, 0.12), T(p, s * 2.7, 0.5, z), '#5a4a38');
      this.colliders.add({ x: f.x + f.rx * s * 2.75, z: f.z + f.rz * s * 2.75, r: 17.5, hw: 0.25, hd: 17, rot: p.rot, box: true });
    }
    for (let z = -14; z <= 14; z += 7) for (const s of [-1, 1]) {
      b.add('flat', new THREE.CylinderGeometry(0.18, 0.2, 4.4, 6), T(p, s * 1.8, -2.4, z), '#4a3c2c');
    }
  }

  // ------------------------------------------------------------ settlements

  private place(s: number, lat: number, faceRoad = true, extraRot = 0): Place {
    const f = this.ground.main.frame(s);
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
    const side = Math.sign(lat) || 1;
    const rot = faceRoad ? Math.atan2(-side * f.rx, -side * f.rz) : Math.atan2(f.tx, f.tz);
    return { x, y: this.ground.terrainAt(x, z), z, rot: rot + extraRot };
  }

  private groundMin(p: Place, w: number, d: number): number {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    let m = Infinity;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) {
      m = Math.min(m, this.ground.terrainAt(p.x + lx * c + lz * s, p.z - lx * s + lz * c));
    }
    return m;
  }

  private fenceAlong(b: Bucket, s0: number, s1: number, lat: number, r: RNG, solid = false): void {
    if (s1 - s0 < 0.8) return;
    const sm = (s0 + s1) / 2;
    const f = this.ground.main.frame(sm);
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
    const fp = { x, y: this.ground.terrainAt(x, z), z, rot: Math.atan2(-f.tz, f.tx) };
    if (solid) boardFence(b, fp, s1 - s0, r); else fence(b, fp, s1 - s0, r);
    this.colliders.add({ x, z, r: (s1 - s0) / 2 + 0.3, hw: (s1 - s0) / 2, hd: 0.15, rot: Math.atan2(-f.tz, f.tx), box: true });
  }

  private buildTown(b: Bucket, r: RNG): void {
    const cols: Collider[] = [];
    const m = this.ground.marks;
    const half = 3.5;
    const po = this.place(40, half + 14);
    po.y = this.groundMin(po, 16, 10);
    postOffice(b, po, cols);
    this.exclusions.push({ x: po.x, z: po.z, r: 16 });
    for (const [s, lat] of [[100, -(half + 32)], [205, -(half + 34)], [175, half + 40]] as [number, number][]) {
      const p = this.place(s, lat);
      p.y = this.groundMin(p, 60, 12) + 0.1;
      khrushchyovka(b, p, cols);
    }
    const gp = this.place(238, half + 22);
    gp.y = this.groundMin(gp, 24, 6);
    garages(b, gp, 7, r, cols);
    const sp = this.place(70, -(half + 13));
    sp.y = this.groundMin(sp, 10, 8);
    shop(b, sp, cols);
    const bs = this.place(125, half + 3.6);
    busStop(b, bs, cols);
    const bsSign = this.signMat(busSignTex());
    signPost(b, this.place(131, half + 1.4, false, Math.PI), bsSign, 0.6, 0.6, 2.4, 1);
    for (let s = 6; s < m.town; s += 38) {
      for (const side of [-1, 1]) {
        const p = this.place(s + (side > 0 ? 19 : 0), side * (half + 2.2), false, side > 0 ? -Math.PI / 2 : Math.PI / 2);
        streetLamp(b, p);
        cols.push({ x: p.x, z: p.z, r: 0.25, hw: 0, hd: 0, rot: 0, box: false });
      }
    }
    for (let s = 10; s < m.town - 10; s += 13 + r() * 6) {
      for (const side of [-1, 1]) {
        if (r() < 0.3) continue;
        const p = this.place(s, side * (half + 5 + r() * 1.5));
        if (this.exclusions.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < e.r)) continue;
        this.addTree('birch', p.x, p.z, rand(r, 10, 14), r);
      }
    }
    cols.forEach((c) => this.colliders.add(c));
  }

  private buildVillage(b: Bucket, r: RNG, from: number, to: number, stopS: number | null, sides = [-1, 1]): void {
    const main = this.ground.main;
    const cols: Collider[] = [];
    for (const side of sides) {
      let s = from + rand(r, 4, 14);
      let wellDone = false;
      while (s < to - 10) {
        const plotW = rand(r, 22, 30);
        const c = s + plotW / 2;
        if (stopS !== null && side > 0 && Math.abs(c - stopS) < 28) { s += plotW; continue; }
        const half = main.zoneAt(c).width / 2;
        if (r() < 0.84) {
          const hp = this.place(c, side * (half + rand(r, 13, 16.5)));
          hp.y = this.groundMin(hp, 7, 8.6);
          izba(b, hp, r, r() < 0.62, cols);
          this.exclusions.push({ x: hp.x, z: hp.z, r: 20 });
          const back = (d: number, lat: number): Place => {
            const cs = Math.cos(hp.rot), sn = Math.sin(hp.rot);
            const x = hp.x + lat * cs - d * sn, z = hp.z - lat * sn - d * cs;
            return { x, y: this.ground.terrainAt(x, z), z, rot: hp.rot + (r() - 0.5) * 0.2 };
          };
          shed(b, back(rand(r, 9, 12), rand(r, -5, 5)), r, cols);
          if (r() < 0.55) woodpile(b, back(rand(r, 5, 6.5), side * 4.6));
          for (let k = 0; k < 2; k++) {
            const t = back(rand(r, 12, 22), rand(r, -9, 9));
            this.addTree(r() < 0.6 ? 'bush' : 'birch', t.x, t.z, r() < 0.6 ? rand(r, 3.5, 5) : rand(r, 9, 13), r, true);
          }
          const fl = side * (half + 6.6);
          if (r() < 0.45) {
            // solid board fence with tall gates beside the house
            const gs = c + 5.2;
            this.fenceAlong(b, s + 1, c - 1.6, fl, r, true);
            this.fenceAlong(b, c + 1.6, gs - 3.0, fl, r, true);
            const gp = this.place(gs, fl);
            yardGate(b, gp, r, cols);
            this.fenceAlong(b, gs + 3.0, s + plotW - 1, fl, r, true);
          } else {
            this.fenceAlong(b, s + 1, c - 1.6, fl, r);
            this.fenceAlong(b, c + 1.6, s + plotW - 1, fl, r);
          }
          if (r() < 0.5) bench(b, this.place(c + 2.6, side * (half + 5.9)));
          if (!wellDone && r() < 0.3) { well(b, this.place(c + plotW / 2, side * (half + 4)), cols); wellDone = true; }
        }
        s += plotW;
      }
    }
    cols.forEach((c) => this.colliders.add(c));
  }

  private buildStops(b: Bucket): void {
    const m = this.ground.marks;
    const main = this.ground.main;
    const cols: Collider[] = [];
    const halfS = main.zoneAt(m.sosStop).width / 2;
    busStop(b, this.place(m.sosStop - 2, halfS + 3.8), cols);
    signPost(b, this.place(m.sosStop + 4, halfS + 1.5, false, Math.PI), this.signMat(busSignTex()), 0.6, 0.6, 2.4, 1);
    const halfZ = main.zoneAt(m.zarStop).width / 2;
    const sp = this.place(m.zarStop - 2, halfZ + 12);
    sp.y = this.groundMin(sp, 10, 8);
    shop(b, sp, cols);
    bench(b, this.place(m.zarStop + 5, halfZ + 6.5));
    cols.forEach((c) => this.colliders.add(c));

    const mk = (id: string, name: string, s: number, lat: number, coat: string, scarf: string, apron: boolean, body: 'dress' | 'woman', speaker: string, line: string, cargo: string) => {
      const p = this.place(s, lat);
      const person = makePerson(coat, scarf, apron, body);
      person.group.position.set(p.x, p.y, p.z);
      person.group.rotation.y = p.rot;
      this.group.add(person.group);
      this.people.push(person);
      this.stops.push({ id, name, s, pos: new THREE.Vector3(p.x, p.y, p.z), person, speaker, line, cargo, done: false });
    };
    mk('sosnovka', 'Сосновка', m.sosStop + 1, halfS + 2.0, '#5a4a6a', '#c8452e', false, 'dress', 'Нина Петровна',
      'Ой, сынок, приехал! А я уж думала — по такой дороге и не доберёшься. Пенсия да «Сельская новь» — вот и вся радость. Возьми яблок, своих, антоновка.',
      'пенсия, газеты');
    mk('zarechye', 'Заречье', m.zarStop + 1, halfZ + 2.3, '#3a4a5a', '#e8e0d0', true, 'woman', 'Валентина, продавщица сельпо',
      'Через Серебрянку перебрался? Молодец. Посылки сюда, накладные — мне. Чай будешь? Ливень-то какой, переждёшь хоть.',
      'посылки, накладные');
  }

  private buildLandmarks(b: Bucket, r: RNG): void {
    const g = this.ground;
    const m = g.marks;
    const cols: Collider[] = [];
    waterTower(b, this.place(m.tower, -62), cols);
    const cp: Place = { x: g.churchPos.x, y: g.terrainAt(g.churchPos.x, g.churchPos.y) - 0.3, z: g.churchPos.y, rot: 0.6 };
    church(b, cp, cols);
    this.exclusions.push({ x: cp.x, z: cp.z, r: 30 });
    const fp = this.place(m.farm, 78);
    fp.y = this.groundMin(fp, 44, 11);
    farm(b, fp, r, cols);
    this.exclusions.push({ x: fp.x, z: fp.z, r: 32 });
    // timber stack by the forest road
    const lp = this.place(m.forest + 280, main(g).zoneAt(m.forest + 280).width / 2 + 4.5, false);
    for (let i = 0; i < 9; i++) {
      const row = i < 4 ? 0 : i < 7 ? 1 : 2;
      const k = i < 4 ? i : i < 7 ? i - 4 : i - 7;
      b.add('boards', new THREE.CylinderGeometry(0.26, 0.26, 6, 7), T(lp, -0.8 + k * 0.52 + row * 0.26, 0.26 + row * 0.45, 0, Math.PI / 2, 0, 0), '#8a6a4a');
    }
    cols.push({ x: lp.x, z: lp.z, r: 3, hw: 1.2, hd: 3, rot: lp.rot, box: true });
    // haystacks
    let n = 0, guard = 0;
    while (n < 46 && guard++ < 2000) {
      const s = rand(r, m.town + 100, g.main.length - 50);
      const tag = g.main.zoneAt(s).tag;
      if (tag === 'forest' || tag === 'mud' || this.inVillage(s)) continue;
      const lat = (r() < 0.5 ? -1 : 1) * rand(r, 30, 170);
      const p = this.place(s, lat, false, r() * 6);
      if (this.layout(p.x, p.z).dens > 0.15 || this.rail.dist(p.x, p.z) < 15 || this.exclusions.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < e.r + 3)) continue;
      haystack(b, p, r, cols);
      this.exclusions.push({ x: p.x, z: p.z, r: 4 });
      n++;
    }
    cols.forEach((c) => this.colliders.add(c));
  }

  private buildPoles(b: Bucket, r: RNG): void {
    const g = this.ground;
    const m = g.marks;
    const wires: number[] = [];
    const run = (road: Road, from: number, to: number, sideFn: (s: number) => number, step: number) => {
      let prev: THREE.Vector3[] | null = null;
      let prevSide = 0;
      for (let s = from; s < to; s += step) {
        const zone = road.zoneAt(s);
        if (road === g.main && Math.abs(s - m.bridge) < 30) { prev = null; continue; }
        const side = sideFn(s);
        if (side !== prevSide) prev = null;
        prevSide = side;
        const f = road.frame(s);
        const lat = side * (zone.width / 2 + 5.5);
        const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
        if (this.rail.dist(x, z) < 6) { prev = null; continue; }
        const p: Place = { x, y: g.terrainAt(x, z) - 0.2, z, rot: Math.atan2(f.tx, f.tz) + Math.PI / 2 };
        const { top } = pole(b, p, r, false);
        this.colliders.add({ x, z, r: 0.3, hw: 0, hd: 0, rot: 0, box: false });
        this.exclusions.push({ x, z, r: 3 });
        if (prev) {
          for (let k = 0; k < top.length; k++) {
            const a = prev[k], c = top[k];
            const N = 8;
            for (let i = 0; i < N; i++) {
              const t0 = i / N, t1 = (i + 1) / N;
              const sag = (t: number) => 0.7 * (1 - (2 * t - 1) ** 2);
              wires.push(lerp(a.x, c.x, t0), lerp(a.y, c.y, t0) - sag(t0), lerp(a.z, c.z, t0), lerp(a.x, c.x, t1), lerp(a.y, c.y, t1) - sag(t1), lerp(a.z, c.z, t1));
            }
          }
        }
        prev = top;
      }
    };
    run(g.main, m.town + 20, g.main.length - 8, (s) => (s < m.junction ? -1 : 1), 46);
    run(g.stub, 20, g.stub.length - 5, () => -1, 46);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x262626 })));
  }

  private buildSigns(b: Bucket): void {
    const m = this.ground.marks;
    const main = this.ground.main;
    const put = (s: number, tex: THREE.Texture, w: number, h: number, height = 2.2, posts = 1, side = 1) => {
      const half = main.zoneAt(s).width / 2;
      const f = main.frame(s);
      const lat = side * (half + 1.9);
      const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
      const rot = side > 0 ? Math.atan2(-f.tx, -f.tz) : Math.atan2(f.tx, f.tz);
      signPost(b, { x, y: this.ground.terrainAt(x, z), z, rot }, this.signMat(tex), w, h, height, posts);
      this.colliders.add({ x, z, r: 0.2, hw: 0, hd: 0, rot: 0, box: false });
    };
    put(m.town, settlementSign('Ключевск', true), 2.2, 0.82, 2.1, 2);
    put(m.potholesFrom - 40, warningSign('uneven'), 1.0, 1.0, 2.2);
    // 60 zone around the GAI post, both directions
    put(m.town + 170, limitSign(60), 0.9, 0.9, 2.2);
    put(m.town + 490, limitSign(60), 0.9, 0.9, 2.2, 1, -1);
    put(m.town + 470, limitSign(60, true), 0.9, 0.9, 2.2);
    put(m.junction - 150, directionSign([['Сосновка', '1'], ['Заречье', '3']], 'right'), 2.4, 1.2, 2.3, 2);
    put(m.junction + 60, directionSign([['Сосновка', '1'], ['Заречье', '3']], 'up'), 2.0, 1.0, 2.2, 2);
    put(m.sosStart, settlementSign('Сосновка', false), 2.2, 0.82, 2.1, 2);
    put(m.sosEnd, settlementSign('Сосновка', true), 2.2, 0.82, 2.1, 2);
    put(m.mud - 50, warningSign('slippery'), 1.0, 1.0, 2.2);
    put(m.bridge - 34, blueSign(['р. Серебрянка']), 2.2, 0.55, 2.0);
    put(m.zarStart, settlementSign('Заречье', false), 2.2, 0.82, 2.1, 2);
    put(m.zarStart + 40, warningSign('kids'), 1.0, 1.0, 2.2);
    for (let k = 1; k * 1000 < main.length - 100; k++) put(k * 1000, kmPost(k + 41), 0.4, 0.4, 0.9, 1, -1);
  }

  // ------------------------------------------------------------ vegetation

  private addTree(kind: TreeKind, x: number, z: number, h: number, r: RNG, force = false): void {
    if (this.rail && this.rail.dist(x, z) < (kind === 'reeds' || kind === 'bush' ? 5 : 9)) return;
    if (!force && this.exclusions.some((e) => Math.abs(e.x - x) < e.r && Math.abs(e.z - z) < e.r && Math.hypot(e.x - x, e.z - z) < e.r)) return;
    const aspect = kind === 'spruce' ? 0.46 : kind === 'bush' ? 1.1 : kind === 'reeds' ? 0.9 : 0.52;
    const y = this.ground.terrainAt(x, z) - 0.25;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI),
      new THREE.Vector3(h * aspect, h, h * aspect),
    );
    const t = this.trees[kind];
    t.m.push(m);
    const v = 0.82 + r() * 0.22;
    t.c.push(kind === 'birch' ? new THREE.Color(v, v * (0.92 + r() * 0.1), v * (0.8 + r() * 0.2)) : new THREE.Color(v, v, v));
    const f = this.ground.field(x, z);
    if (f.d < 45 && kind !== 'reeds') this.colliders.add({ x, z, r: kind === 'bush' ? 0.6 : 0.35, hw: 0, hd: 0, rot: 0, box: false });
  }

  private buildVegetation(r: RNG): void {
    const g = this.ground;
    const step = 6.5;
    const x1 = g.minX + g.nx * g.step, z1 = g.minZ + g.nz * g.step;
    for (let x = g.minX; x < x1; x += step) {
      for (let z = g.minZ; z < z1; z += step) {
        const px = x + r() * step, pz = z + r() * step;
        const lay = this.layout(px, pz);
        if (lay.d > 620) continue;
        const nr = g.nearestRoad(px, pz, 12);
        if (nr && Math.abs(nr.lat) < nr.sample.road.zoneAt(nr.s).width / 2 + 3.2) continue;
        const dr = g.riverDist(px, pz);
        if (dr < 17) {
          if (dr > 9 && r() < 0.35 && lay.d > 6) this.addTree('reeds', px, pz, rand(r, 1.5, 2.2), r);
          continue;
        }
        const far = lay.d > 330 ? 0.4 : 1;
        if (lay.d < 16 && lay.tag !== 'town' && !this.inVillage(lay.s) && r() < 0.05) { this.addTree('bush', px, pz, rand(r, 2.2, 3.6), r); continue; }
        if (r() > lay.dens * 0.5 * far) continue;
        let kind: TreeKind;
        const k = r();
        if (lay.belt) kind = k < 0.85 ? 'birch' : 'bush';
        else if (lay.tag === 'forest' && lay.main) kind = k < 0.45 ? 'spruce' : k < 0.8 ? 'birch' : 'pine';
        else if (lay.tag === 'mud') kind = k < 0.5 ? 'bush' : k < 0.85 ? 'birch' : 'spruce';
        else kind = k < 0.6 ? 'birch' : k < 0.72 ? 'pine' : k < 0.86 ? 'spruce' : 'bush';
        const h = kind === 'birch' ? rand(r, 10, 17) : kind === 'spruce' ? rand(r, 12, 21) : kind === 'pine' ? rand(r, 14, 21) : rand(r, 2.6, 4.2);
        this.addTree(kind, px, pz, h * (lay.d > 330 ? 1.15 : 1), r);
      }
    }
    const geo = crossQuads(3);
    const texFor: Record<TreeKind, THREE.Texture> = { birch: this.T.birch, spruce: this.T.spruce, pine: this.T.pine, bush: this.T.bush, reeds: this.T.reeds };
    for (const kind of Object.keys(this.trees) as TreeKind[]) {
      const t = this.trees[kind];
      if (!t.m.length) continue;
      const mtl = new THREE.MeshLambertMaterial({ map: texFor[kind], alphaTest: 0.5, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mtl, t.m.length);
      t.m.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, t.c[i]); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = `trees:${kind}`;
      this.group.add(mesh);
    }
  }

  private buildFauna(r: RNG): void {
    const m = this.ground.marks;
    const herd = (s: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const p = this.place(s + rand(r, -40, 40), -rand(r, 38, 85), false, r() * 6);
        const cow = makeCow(r);
        cow.position.set(p.x, p.y, p.z);
        cow.rotation.y = p.rot;
        this.group.add(cow);
        this.cows.push(cow);
        this.colliders.add({ x: p.x, z: p.z, r: 1.0, hw: 0, hd: 0, rot: 0, box: false });
      }
      const c = this.place(s, -60, false);
      this.cowSpots.push(new THREE.Vector3(c.x, c.y, c.z));
    };
    herd(m.sosStart - 170, 5);
    herd(m.bridge + 140, 3);
  }

  // ------------------------------------------------------------ per-frame

  /**
   * Roadside life along the asphalt: the Klyuchevsk stela, GAI post, filling
   * station, babushka selling potatoes, a truck-stop café, billboards, and
   * the industrial skyline and power line on the horizon.
   */
  private buildRoadside(b: Bucket, r: RNG): void {
    const g = this.ground;
    const m = g.marks;
    const main = g.main;
    const cols: Collider[] = [];
    const sign = (t: THREE.Texture) => this.signMat(t);
    const half = (s: number) => main.zoneAt(s).width / 2;
    const park = (kind: Parameters<typeof buildVehicle>[0], color: string, p: Place, lx: number, lz: number, rot: number) => {
      const v = buildVehicle(kind, color, Math.floor(r() * 8));
      // parked: lamps off
      if (v.lights) v.lights.visible = false;
      const c = Math.cos(p.rot), sn = Math.sin(p.rot);
      const x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c;
      v.group.position.set(x, g.terrainAt(x, z) + 0.02, z);
      v.group.rotation.y = p.rot + rot;
      this.group.add(v.group);
      this.colliders.add(boxCollider({ x, y: 0, z, rot: p.rot + rot }, 0, 0, v.width, v.length));
    };

    // stela at the town limit; the departing driver reads the farewell side
    const sp = this.place(m.town - 22, -(half(m.town - 22) + 9), false, -0.45);
    sp.y = this.groundMin(sp, 9, 2) - 0.1;
    stela(b, sp, sign, cols);
    this.exclusions.push({ x: sp.x, z: sp.z, r: 10 });

    // GAI post with a lay-by, a raised barrier, a patrol car and an inspector
    const sG = m.town + 330;
    const gp = this.place(sG, half(sG) + 9);
    gp.y = this.groundMin(gp, 4, 4);
    gaiPost(b, gp, sign, cols);
    this.exclusions.push({ x: gp.x, z: gp.z, r: 16 });
    barrierArm(b, this.place(sG - 14, half(sG) + 0.8, false), half(sG) + 0.2, 1.25, sign);
    {
      // today's patrol car at the post: the saloon or the 4×4 (Police picks one per run);
      // a single moving collider, sized for whichever is on duty
      const models = [buildCar('militia', '#ecece6', 3, { label: 'ГАИ' }), buildCar('militiaSuv', '#e8e8e2', 5, { label: 'ГАИ' })];
      const c = Math.cos(gp.rot), sn = Math.sin(gp.rot);
      const x = gp.x - 4.5 * c + 3.5 * sn, z = gp.z + 4.5 * sn + 3.5 * c;
      const park = { x, y: g.terrainAt(x, z) + 0.02, z, yaw: gp.rot + Math.PI / 2 + 0.1 };
      for (const v of models) this.group.add(v.group);
      const v = models[0];
      const col: Collider = { x, z, r: Math.hypot(v.width, v.length) / 2, hw: v.width / 2, hd: v.length / 2, rot: park.yaw, box: true };
      this.colliders.dynamic.push(col);
      // the inspector walks up to stopped vans, so his collider moves with him
      const insp = new Officer();
      const ip = this.place(sG + 6, half(sG) + 1.6);
      insp.group.position.set(ip.x, ip.y, ip.z);
      insp.group.rotation.y = ip.rot;
      this.group.add(insp.group);
      const insCol: Collider = { x: ip.x, z: ip.z, r: 0.4, hw: 0, hd: 0, rot: 0, box: false };
      this.colliders.dynamic.push(insCol);
      this.gai = { models, col, park, inspector: insp, insCol, post: { x: ip.x, z: ip.z, yaw: ip.rot }, sPost: sG + 6 };
    }

    // crossing keeper's booth
    const bp = this.place(this.rail.sCross + 16, -(half(this.rail.sCross) + 8));
    crossingBooth(b, bp, sign, cols);
    this.exclusions.push({ x: bp.x, z: bp.z, r: 6 });

    // filling station on the left, a sedan at the pump
    const sA = m.town + 700;
    const ap = this.place(sA, -(half(sA) + 13));
    ap.y = this.groundMin(ap, 18, 12);
    gasStation(b, ap, sign, cols);
    park('sedan', '#c8b890', ap, -1.2, 0.9, Math.PI / 2);
    this.exclusions.push({ x: ap.x, z: ap.z, r: 20 });

    // babushka with buckets of potatoes opposite the hamlet before the fork
    const sB = m.junction - 190;
    const vp = this.place(sB, half(sB) + 2.3);
    vendorStall(b, vp, sign);
    const baba = makePerson('#6a4a3a', '#d8c8a0', true);
    const bpos = this.place(sB - 0.8, half(sB) + 2.9);
    baba.group.position.set(bpos.x, bpos.y, bpos.z);
    baba.group.rotation.y = bpos.rot;
    this.group.add(baba.group);
    this.people.push(baba);
    this.colliders.add({ x: vp.x, z: vp.z, r: 1.2, hw: 0, hd: 0, rot: 0, box: false });

    // truck-stop café with a KamAZ and a ZIL in the lot, smoke over the mangal
    const sC = m.junction - 115;
    const cp = this.place(sC, half(sC) + 24);
    cp.y = this.groundMin(cp, 12, 8);
    this.smokeSrc.copy(cafe(b, cp, sign, cols));
    park('kamaz', '#d8822a', cp, -2, 12, Math.PI / 2 + 0.05);
    park('zil', '#5a7aa0', cp, 10, 11, Math.PI / 2 - 0.1);
    b.add('gravel', boxGeo(30, 0.1, 14, 4), T(cp, 2, 0.02, 11), '#a89e8a');
    this.exclusions.push({ x: cp.x, z: cp.z, r: 26 });
    const smokeTex = paint(16, 16, (c) => {
      const gr = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      gr.addColorStop(0, 'rgba(220,220,214,0.8)'); gr.addColorStop(1, 'rgba(220,220,214,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 16, 16);
    }, { repeat: false });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      this.group.add(s);
      this.smoke.push({ sprite: s, age: i * 0.4, life: 6.4 });
    }

    // hand-painted billboards
    const boards: [number, number, number][] = [[m.town + 410, -1, 0], [m.town + 640, 1, 1], [m.junction - 330, 1, 2], [m.junction + 140, -1, 3], [m.forest + 60, 1, 4]];
    for (const [s, side, k] of boards) {
      const p = this.place(s, side * (half(s) + 6), true, side * 0.5);
      cols.push(...billboard(b, p, sign(billboardTex(BILLBOARDS[k]))));
      this.exclusions.push({ x: p.x, z: p.z, r: 5 });
    }

    // skyline: boiler-house chimney behind the town, grain elevator past the fork
    const chp = this.place(150, 95, false);
    chimney(b, chp);
    const sf = g.stub.frame(Math.min(g.stub.length - 20, 380));
    const ep = { x: sf.x - sf.rx * 75, y: 0, z: sf.z - sf.rz * 75, rot: Math.atan2(sf.tx, sf.tz) };
    ep.y = g.terrainAt(ep.x, ep.z) - 0.5;
    grainElevator(b, ep, cols);
    this.exclusions.push({ x: ep.x, z: ep.z, r: 30 }, { x: chp.x, z: chp.z, r: 14 });

    // a high-voltage line striding across the Sosnovka fields
    const hf = main.frame(m.sosStart - 260);
    const ang = 0.5;
    const ldx = hf.rx * Math.cos(ang) + hf.tx * Math.sin(ang), ldz = hf.rz * Math.cos(ang) + hf.tz * Math.sin(ang);
    const wires: number[] = [];
    let prev: THREE.Vector3[] | null = null;
    for (let u = -900; u <= 900; u += 240) {
      const x = hf.x + ldx * u, z = hf.z + ldz * u;
      const nr = g.nearestRoad(x, z, 30);
      if (nr || g.riverDist(x, z) < 25 || this.rail.dist(x, z) < 20) { continue; }
      const pp: Place = { x, y: g.terrainAt(x, z) - 0.2, z, rot: Math.atan2(ldx, ldz) };
      const pts = pylon(b, pp);
      this.exclusions.push({ x, z, r: 9 });
      cols.push({ x, z, r: 3.5, hw: 3.2, hd: 3.2, rot: pp.rot, box: true });
      if (prev) {
        for (let k = 0; k < 3; k++) {
          const a = prev[k], c = pts[k];
          const span = a.distanceTo(c);
          const N = 14;
          for (let i = 0; i < N; i++) {
            const t0 = i / N, t1 = (i + 1) / N;
            const sag = (t: number) => span * 0.012 * 4 * t * (1 - t) * 2;
            wires.push(lerp(a.x, c.x, t0), lerp(a.y, c.y, t0) - sag(t0), lerp(a.z, c.z, t0), lerp(a.x, c.x, t1), lerp(a.y, c.y, t1) - sag(t1), lerp(a.z, c.z, t1));
          }
        }
      }
      prev = pts;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3a3a })));
    cols.forEach((c) => this.colliders.add(c));
  }

  private wetNow = 0;

  /** Traffic, train, crossing and mangal smoke; returns what the audio needs. */
  updateLife(dt: number, t: number, px: number, pz: number, pvx: number, pvz: number, dark: number, pyaw = 0): { rail: RailSound; traffic: TrafficSound } {
    const rail = this.rail.update(dt, t, px, pz, pvx, pvz, dark);
    const traffic = this.traffic.update(dt, t, px, pz, pvx, pvz, this.wetNow, pyaw);
    setVehicleLamps(smoothstep(0.3, 0.7, dark));
    for (const s of this.smoke) {
      s.age += dt;
      if (s.age > s.life) s.age -= s.life;
      const k = s.age / s.life;
      s.sprite.position.set(this.smokeSrc.x + Math.sin(s.age * 1.3 + k * 3) * 0.3 + k * 2.2, this.smokeSrc.y + k * 5, this.smokeSrc.z + k * 1.2);
      s.sprite.scale.setScalar(0.5 + k * 2.6);
      (s.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * 0.45;
    }
    return { rail, traffic };
  }

  setAtmosphere(darkness: number, wet: number, sky: THREE.Color, fog: THREE.Color): void {
    const glow = smoothstep(0.3, 0.8, darkness);
    this.wetNow = wet;
    for (const { m, k } of this.litMats) m.emissiveIntensity = glow * k;
    const w = lerp(1, 0.62, clamp(wet, 0, 1));
    for (const m of this.wetMats) m.color.setScalar(w);
    // muddy water mirroring a grey sky; sheets rise in the rain and sink as roads dry
    // unlit, so scale the mirrored sky down to the brightness of the lit road around it
    this.puddleMat.color.copy(sky).lerp(fog, 0.25).lerp(MUD_WATER, 0.5).multiplyScalar(0.24 + wet * 0.06);
    this.puddleMat.opacity = 0.62 + clamp(wet, 0, 1) * 0.2;
    this.puddles.position.y = (clamp(wet, 0, 1) - 0.62) * 0.12;
    this.waterMat.color.copy(sky).lerp(new THREE.Color(0x56686a), 0.55);
    (this.farRing.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color(0x3c4a34)).lerp(fog, 0.62);
  }

  update(dt: number, t: number, cam: THREE.Vector3): void {
    this.waterTex.offset.y -= dt * 0.04;
    this.farRing.position.set(cam.x, cam.y - 12, cam.z);
    for (const p of this.people) p.update(dt, t);
    this.cows.forEach((c, i) => { c.children[2].rotation.x = 0.5 + Math.sin(t * 0.6 + i * 2) * 0.15; });
  }
}

function main(g: Ground): Road { return g.main; }

const MUD_WATER = new THREE.Color(0x4a4232);

function busSignTex(): THREE.Texture {
  return paint(32, 32, (g, w, h) => {
    g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    g.fillStyle = '#fff'; g.fillRect(6, 9, 20, 12);
    g.fillStyle = BLUE; g.fillRect(8, 11, 4, 4); g.fillRect(14, 11, 4, 4); g.fillRect(20, 11, 4, 4);
    g.fillStyle = '#fff'; g.fillRect(8, 21, 4, 3); g.fillRect(20, 21, 4, 3);
  }, { repeat: false });
}

/** Round speed-limit sign, or the grey "end of limit" one with a diagonal. */
function limitSign(n: number, end = false): THREE.Texture {
  return paint(64, 64, (c) => {
    c.clearRect(0, 0, 64, 64);
    c.fillStyle = end ? '#e8e8e2' : '#c8241c';
    c.beginPath(); c.arc(32, 32, 31, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2f0e8';
    c.beginPath(); c.arc(32, 32, end ? 29 : 24, 0, Math.PI * 2); c.fill();
    c.fillStyle = end ? '#7a7a76' : '#141414';
    c.font = 'bold 30px "PT Sans Narrow", "Arial Narrow", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(n), 32, 34);
    if (end) {
      c.strokeStyle = '#2a2a28'; c.lineWidth = 3;
      for (const o of [-6, 0, 6]) { c.beginPath(); c.moveTo(14 + o, 50 + o); c.lineTo(50 + o, 14 + o); c.stroke(); }
    }
  }, { repeat: false });
}
