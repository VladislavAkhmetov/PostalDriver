import * as THREE from 'three';
import { Bucket, boxGeo, cellKey, crossQuads, planeGeo } from '../core/geom';
import { clamp, fbm, lerp, mulberry32, noise2, rand, RNG, smoothstep } from '../core/math';
import { BLUE, blueSign, directionSign, kmPost, paint, settlementSign, Textures, warningSign } from '../core/textures';
import { Ground, Poi, Road, Surface } from './Ground';
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
import { Muha } from './Muha';
import { SawmillBlock } from './Sawmill';
import { snowCover, snowy } from './Snow';
import { makeMan, makePerson, Person } from './People';
import { Villagers } from './Villagers';
import { Animal, AnimalKind } from './Animals';

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
  /** For an addressee off the main road: the name on the board at the turn-off, and where it is. */
  turn?: { name: string; s: number };
  /** Out along the branch road straight on from the fork (Kainly, the pioneer camp). */
  branch?: boolean;
}

type TreeKind = 'birch' | 'spruce' | 'pine' | 'bush' | 'reeds';

const L = (map?: THREE.Texture | null, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ map: map ?? null, vertexColors: true, ...extra });

export class World {
  readonly group = new THREE.Group();
  readonly colliders = new ColliderIndex();
  readonly stops: Stop[] = [];
  readonly people: Person[] = [];
  /** Timur's friend Muha, hanging about by the shop with his tinted saloon. */
  muha: Muha | null = null;
  /** Muha's saloon by the shop (it can be taken away), and where he stands by it. */
  muhaCar!: { group: THREE.Group; col: Collider };
  private muhaAt!: Place & { col: Collider };
  /** The district hospital across from the post office, and әсәй at its door. */
  hospital!: { pos: THREE.Vector3; nurse: Person };
  /** Timur's family home on the edge of Klyuchevsk: where the prologue's drive ends, өләсәй at the gate. */
  home!: { pos: THREE.Vector3; person: Person; s: number; grandpa?: Person };
  /** The cars and men across the forest road by the sawmill, out on the day of Muha's second chapter. */
  readonly sawmill: SawmillBlock;
  /** Strolling roadside villagers (they react to the van). */
  villagers!: Villagers;
  /** The player's horn is sounding (set by the game loop). */
  honk = false;
  private honkWas = false;
  private rainNow = 0;
  private darkNow = 0;
  /** Where a siren is, for villagers to turn and look (set by the game loop). */
  watch: { x: number; z: number } | null = null;
  /** Rain intensity for the villagers (set by the game loop). */
  setWeather(rain: number): void { this.rainNow = rain; }
  readonly cowSpots: THREE.Vector3[] = [];
  /** The summer fisherman on the jetty (off it while the lake is frozen: Countryside). */
  lakeFisher: Person | null = null;
  /** The benches by the gates in the villages (Countryside seats the old women on some). */
  readonly benches: Place[] = [];
  /** The filling station's origin: a van parked in its pump bays is refuelled. */
  fuelBay: { x: number; z: number; rot: number } | null = null;
  readonly startPose: { x: number; z: number; yaw: number };
  /** The van's place in the family's yard, where the mornings start. */
  homePose!: { x: number; z: number; yaw: number };
  /** Where Zinaida Pavlovna stands at the post office door: the morning's route sheet is had here. */
  postDoor!: THREE.Vector3;
  /** The grandfather on the post office porch, seen off to the Ufa bus the first morning (away the rest of the time). */
  postGrandpa!: Person;
  private mats: Record<string, THREE.Material> = {};
  private wetMats: THREE.MeshLambertMaterial[] = [];
  private litMats: { m: THREE.MeshLambertMaterial; k: number }[] = [];
  private puddleMat: THREE.MeshBasicMaterial;
  private puddles!: THREE.Mesh;
  private waterMat: THREE.MeshLambertMaterial;
  private waterTex: THREE.Texture;
  /** Tree instances by kind and ground cell (one instanced mesh each, so far cells are culled). */
  private trees = new Map<string, { kind: TreeKind; m: THREE.Matrix4[]; c: THREE.Color[] }>();
  private exclusions: { x: number; z: number; r: number }[] = [];
  /** Stretches of road lined with private houses (villages, hamlets, town outskirts). */
  readonly hamlets: [number, number][] = [];
  /** Cows, horses, sheep, pigs and dogs. */
  readonly fauna: Animal[] = [];
  /** Set by the game: animal hit / dog barking / road events worth a line on screen. */
  onAnimalHit?: (kind: AnimalKind, speed: number) => void;
  onBark?: () => void;
  onEvent?: (text: string) => void;
  private events: RoadEvent[] = [];
  private signCount = 0;
  readonly farRing: THREE.Mesh;
  readonly rail: Railway;
  readonly traffic: Traffic;
  private smoke: { sprite: THREE.Sprite; age: number; life: number }[] = [];
  private smokeSrc = new THREE.Vector3();
  /** Family and the postmistress: they wave the van by, once each time it comes near. */
  private readonly greeters: Person[] = [];
  private readonly greeted = new Set<Person>();
  /** Figures a scene has taken out of the world for now (the grandfather in the cab in the prologue). */
  private readonly away = new Set<Person>();
  /** Take a figure out of the world for a while, or put it back. */
  setAway(p: Person, on: boolean): void {
    if (on) { this.away.add(p); p.group.visible = false; this.culled.delete(p); } else if (this.away.delete(p)) p.group.visible = true;
  }
  /** Figures hidden for being too far away (see update). */
  private readonly culled = new Set<Person>();
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
    snowy(this.waterMat, 'ice');

    const sf = ground.main.frame(22);
    this.startPose = { x: sf.x + sf.rx * 1.7, z: sf.z + sf.rz * 1.7, yaw: Math.atan2(-sf.tx, -sf.tz) };

    const r = mulberry32(1997);
    const b = new Bucket(PROP_CELL);
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
    this.planStation();
    this.planHome();
    this.buildTerrain();
    this.buildRiver(b);
    this.buildTown(b, r);
    for (const [from, to, stop, sides] of villages) this.buildVillage(b, r, from, to, stop, sides);
    this.buildStops(b);
    this.buildHome(b, r);
    const railCols: Collider[] = [];
    this.rail.buildStatic(b, railCols, (t) => this.signMat(t));
    railCols.forEach((c) => this.colliders.add(c));
    this.group.add(this.rail.group);
    this.buildRoadside(b, r);
    this.buildLandmarks(b, r);
    this.buildPOIs(b, r);
    this.buildSawmill(b, r);
    this.buildBranch(b, r);
    this.buildEvents(r);
    this.buildVillagers(r);
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
    this.sawmill = new SawmillBlock(ground, m.sawmill, this.people, this.colliders.dynamic, this.traffic);
    this.group.add(this.sawmill.group);
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
    // winter: whatever faces the sky can take the snow; the roads take it packed and grey
    const roads = new Set(['asphalt', 'gravel', 'dirt', 'mud', 'wood']);
    for (const [k, m] of Object.entries(this.mats)) snowy(m, roads.has(k) ? 'road' : 'ground');
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
      const off = road !== g.main ? -0.015 : 0;
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
        // split by area so the stretches behind the van and past the fog are culled
        const mid = A.pts[LAT.length >> 1];
        const cell = cellKey(mid[0], mid[2], CELL);
        const dst = get(`${surf}@${cell}`);
        for (let j = 0; j < LAT.length - 1; j++) {
          const a = A.pts[j], bb = A.pts[j + 1], c = B.pts[j + 1], d = B.pts[j];
          const u0 = (LAT[j] + 1) / 2, u1 = (LAT[j + 1] + 1) / 2;
          dst.p.push(...a, ...bb, ...d, ...bb, ...c, ...d);
          dst.u.push(u0, A.s / tl, u1, A.s / tl, u0, B.s / tl, u1, A.s / tl, u1, B.s / tl, u0, B.s / tl);
          for (const v of [A.cols[j], A.cols[j + 1], B.cols[j], A.cols[j + 1], B.cols[j + 1], B.cols[j]]) dst.c.push(v, v, v);
        }
        if (zone.surface === 'wood') continue;
        const sh = get(`shoulder@${cell}`);
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
      const mesh = new THREE.Mesh(geo, this.mats[k.split('@')[0]]);
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
    const tag = f.road.zoneAt(f.s).tag;
    const d = f.d;
    let dens = smoothstep(0.5, 0.64, fbm(x * 0.0032, z * 0.0032, 3, 5));
    if (tag === 'forest' || tag === 'bor') dens = Math.max(dens, 1 - smoothstep(170, 300, d));
    if (main && tag === 'mud') dens = Math.max(dens * 0.7, d > 30 && d < 220 ? 0.45 : 0);
    let belt = false;
    if (tag === 'rural' || tag === 'gravel' || tag === 'fields' || tag === 'bridge' || tag === 'steppe' || tag === 'meadow') {
      dens *= smoothstep(45, 130, d);
      // shelter belts along the fields; the open steppe under the shikhan has none
      if (tag !== 'steppe' && d > 52 && d < 64 && noise2(f.s * 0.012, x > 0 ? 1 : 2, 33) > 0.38) { dens = 0.95; belt = true; }
    }
    if (main && this.inVillage(f.s) && d < 95) dens = 0;
    if (main && tag === 'town' && d < 170) dens = 0;
    if (main && Math.abs(f.s - g.marks.junction) < 40 && d < 40) dens = 0;
    // the branch road: Kainly's yards, the open steppe under the shikhan (bare above, birches at its foot), the lake shore
    if (f.road === g.stub && f.s > g.branch.kaiStart - 40 && d < 95) dens = 0;
    // the steppe stays open: a lone birch here and there
    if (tag === 'steppe') dens *= 0.12;
    const sh = g.shikhan, dsh = Math.hypot(x - sh.x, z - sh.z);
    if (dsh < sh.r * 1.15) dens *= smoothstep(sh.r * 0.65, sh.r * 1.15, dsh);
    const lk = g.lake, dl = Math.hypot(x - lk.x, z - lk.z) - lk.r;
    if (dl < 40) dens *= smoothstep(10, 40, dl);
    return { dens, belt, tag, d, s: f.s, main: main || tag === 'forest' };
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
    const cLime = new THREE.Color('#a8a596'), cSand = new THREE.Color('#e6cf94');
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
        // the lake's shore; the shikhan's dry grass and bare limestone crown; the quarry's sand
        const dl = Math.hypot(x - g.lake.x, z - g.lake.z) - g.lake.r;
        if (dl < 25) c.lerp(cBank, 1 - smoothstep(0, 25, dl));
        const dsh = Math.hypot(x - g.shikhan.x, z - g.shikhan.z);
        if (dsh < g.shikhan.r * 1.3) {
          c.lerp(cStubble, (1 - smoothstep(g.shikhan.r * 0.6, g.shikhan.r * 1.3, dsh)) * 0.55);
          if (dsh < 80) c.lerp(cLime, (1 - smoothstep(25, 80, dsh)) * (0.45 + noise2(x * 0.08, z * 0.08, 41) * 0.5));
        }
        const dq = Math.hypot(x - g.quarryPit.x, z - g.quarryPit.z);
        if (dq < g.quarryPit.r + 14) c.lerp(cSand, 1 - smoothstep(g.quarryPit.r - 6, g.quarryPit.r + 14, dq));
        if (h < g.waterAt(x, z)) c.copy(cBed);
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

  /** Where the filling station stands, with its ground levelled before the terrain mesh is built. */
  station!: { ap: Place; edge: number };

  private planStation(): void {
    const g = this.ground, m = g.marks;
    // the quiet stretch of rural asphalt between the town's yards and the railway crossing
    const sA = m.town + 395;
    const half = g.main.zoneAt(sA).width / 2;
    const ap = this.place(sA, -(half + 13));
    // the road's edge, on the station's local z
    const edge = 13;
    // the mouths meet the road at the height of its edge
    const c = Math.cos(ap.rot), s = Math.sin(ap.rot);
    const ex = ap.x + (edge + 0.4) * s, ez = ap.z + (edge + 0.4) * c;
    const roadY = g.height(ex, ez);
    ap.y = roadY - 0.13;
    const top = ap.y + 0.15;
    const at = (lx: number, lz: number) => [ap.x + lx * c + lz * s, ap.z - lx * s + lz * c] as const;
    // forecourt, the two mouths, and the ground under the operator's booth
    const [fx, fz] = at(0, 0);
    g.addPad(fx, fz, ap.rot, 15, 6.5, top, 14, edge - 1);
    for (const sx of [-1, 1]) {
      const [dx, dz] = at(sx * 12, (6.5 + edge + 0.4) / 2);
      g.addPad(dx, dz, ap.rot, 3, (edge + 0.4 - 6.5) / 2, top, 14, edge - 1);
    }
    const [bx, bz] = at(-6, -8.7);
    g.addPad(bx, bz, ap.rot, 3.4, 2.2, top, 10, edge - 1);
    this.station = { ap, edge };
  }

  /** True when (x, z) is in one of the two lanes beside the pump island. */
  inFuelBay(x: number, z: number): boolean {
    const f = this.fuelBay;
    if (!f) return false;
    const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    // a lane on either side of the island, the van nose to tail along it by the pump
    return Math.abs(lx) < 3.4 && Math.abs(lz) > 1.3 && Math.abs(lz) < 4.6;
  }

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

  private fenceAlong(b: Bucket, s0: number, s1: number, lat: number, r: RNG, solid = false, road: Road = this.ground.main): void {
    if (s1 - s0 < 0.8) return;
    const sm = (s0 + s1) / 2;
    const f = road.frame(sm);
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
    const fp = { x, y: this.ground.terrainAt(x, z), z, rot: Math.atan2(-f.tz, f.tx) };
    if (solid) boardFence(b, fp, s1 - s0, r); else fence(b, fp, s1 - s0, r);
    this.colliders.add({ x, z, r: (s1 - s0) / 2 + 0.3, hw: (s1 - s0) / 2, hd: 0.15, rot: Math.atan2(-f.tz, f.tx), box: true });
  }

  /**
   * The branch road straight on from the fork (Ground.buildBranch): the shikhan with a geodetic
   * tripod on its crown, the sand quarry with a rusted excavator, the lake with a jetty, a boat and a
   * fisherman, the closed pioneer camp «Звёздочка» with its caretaker, and the Tatar village of Kainly
   * with its wooden mosque. Two addressees: Farida-apa at Kainly's medical post, Mikhalych at the camp.
   */
  private buildBranch(b: Bucket, r: RNG): void {
    const g = this.ground, st = g.stub, B = g.branch;
    const cols: Collider[] = [];
    const clear = (x: number, z: number, rad: number) => this.exclusions.push({ x, z, r: rad });
    const on = (road: Road, s: number, lat: number, face = true, rot = 0) => this.placeOn(road, s, lat, face, rot);
    /** A point in a place's own frame (local +Z as the Place faces). */
    const local = (p: Place, lx: number, lz: number, rot = 0): Place => {
      const c = Math.cos(p.rot), sn = Math.sin(p.rot);
      const x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c;
      return { x, y: g.terrainAt(x, z), z, rot: p.rot + rot };
    };
    const post = (x: number, z: number, rad = 0.2) => cols.push({ x, z, r: rad, hw: 0, hd: 0, rot: 0, box: false });
    const board = (text: string, bg = '#1f4e8a', fg = '#f2f2ea', w = 192, h = 40) => this.signMat(paint(w, h, (c, cw, ch) => {
      c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
      c.fillStyle = fg; c.fillRect(3, 3, cw - 6, ch - 6);
      c.fillStyle = bg; c.fillRect(5, 5, cw - 10, ch - 10);
      c.fillStyle = fg; c.font = `bold ${Math.round(ch * 0.42)}px "PT Sans Narrow", "Arial Narrow", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, cw / 2, ch / 2 + 1, cw - 16);
    }, { repeat: false }));
    /** Which side of the branch road a spur leaves on (1 = the road's right). */
    const sideOf = (spur: Road, s0: number) => {
      const f = st.frame(s0), q = spur.samples[Math.min(spur.samples.length - 1, 15)];
      return (q.x - f.x) * f.rx + (q.z - f.z) * f.rz > 0 ? 1 : -1;
    };
    /** A sign by the branch road, on its right (side 1) or left, facing the traffic that reads it. */
    const sign = (road: Road, s: number, key: string, w: number, h: number, height = 2.2, posts = 1, side = 1) => {
      const half = road.zoneAt(s).width / 2;
      const f = road.frame(s);
      const lat = side * (half + 1.9);
      const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
      const rot = side > 0 ? Math.atan2(-f.tx, -f.tz) : Math.atan2(f.tx, f.tz);
      signPost(b, { x, y: g.terrainAt(x, z), z, rot }, key, w, h, height, posts);
      post(x, z);
    };

    // ---- the shikhan: grass and bare limestone, boulders on the crown, a geodetic tripod on top
    {
      const sh = g.shikhan;
      for (let i = 0; i < 34; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 85;
        const x = sh.x + Math.cos(a) * d, z = sh.z + Math.sin(a) * d;
        const s = rand(r, 0.8, 3.2);
        b.add('flat', new THREE.DodecahedronGeometry(1, 0), T({ x, y: g.terrainAt(x, z) - s * 0.35, z, rot: r() * 6 }, 0, 0, 0, r(), r(), r(), s * rand(r, 1, 1.6), s, s * rand(r, 0.8, 1.3)), '#a6a497');
      }
      let top = { x: sh.x, z: sh.z, y: -1e9 };
      for (let i = 0; i < 60; i++) {
        const x = sh.x + (r() - 0.5) * 60, z = sh.z + (r() - 0.5) * 60, y = g.terrainAt(x, z);
        if (y > top.y) top = { x, z, y };
      }
      const tp: Place = { ...top, rot: 0.4 };
      for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) {
        b.add('boards', boxGeo(0.14, 6.6, 0.14), T(tp, lx * 0.55, 3.1, lz * 0.55, lz * 0.09, 0, -lx * 0.09), '#7a6a58');
      }
      b.add('boards', boxGeo(1.1, 0.6, 1.1), T(tp, 0, 6.2, 0), '#8a7a66');
      b.add('flat', boxGeo(0.1, 1.6, 0.1), T(tp, 0, 7.2, 0), '#5a4a3a');
      clear(sh.x, sh.z, 20);
    }
    sign(st, B.gravel - 30, this.signMat(blueSign(['Кайынлы 2', 'п/л «Звёздочка» 1'], 128, 48)), 1.9, 0.72, 2.1, 2);

    // ---- the sand quarry at the end of its track: a pit, heaps of sand, an excavator left to rust
    {
      const q = g.branchSpurs.find((x) => x.id === 'quarry')!;
      sign(st, B.quarry - 12, board('КАРЬЕР', '#6a5030', '#f0e4c8', 128, 32), 1.2, 0.3, 1.9, 1, sideOf(q, B.quarry));
      const pit = g.quarryPit;
      clear(pit.x, pit.z, pit.r + 20);
      // the sand itself: a skin laid over the pit's floor and walls (the terrain's grass texture would turn any tint olive)
      {
        const R = pit.r + 6;
        const geo = new THREE.RingGeometry(0.5, R, 36, 12);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pit.x + pos.getX(i), z = pit.z + pos.getZ(i);
          pos.setXYZ(i, x, g.terrainAt(x, z) + 0.06, z);
        }
        geo.computeVertexNormals();
        b.add('flat', geo, undefined, '#d9be84');
      }
      for (let i = 0; i < 4; i++) {
        const a = 0.6 + i * 1.3, d = pit.r * 0.55;
        const x = pit.x + Math.cos(a) * d, z = pit.z + Math.sin(a) * d;
        const rad = rand(r, 3, 5.5);
        b.add('flat', new THREE.ConeGeometry(rad, rad * 0.55, 10), T({ x, y: g.terrainAt(x, z) - 0.2, z, rot: 0 }, 0, rad * 0.27, 0), '#cfb47c');
        cols.push({ x, z, r: rad * 0.8, hw: 0, hd: 0, rot: 0, box: false, soft: true });
      }
      const ex = on(q, q.length - 6, 9, false, 1.1);
      ex.y -= 0.1;
      b.add('rust', boxGeo(2.6, 0.9, 4.2), T(ex, 0, 0.45, 0), '#7a5a40');
      b.add('rust', boxGeo(2.4, 1.0, 3.2), T(ex, 0, 1.4, -0.3), '#8a6040');
      b.add('rust', boxGeo(1.4, 1.5, 1.5), T(ex, -0.4, 2.6, 0.5), '#8e6a48');
      b.add('rust', boxGeo(0.45, 0.45, 6.5), T(ex, 0.6, 2.9, 3.6, -0.55, 0, 0), '#6e4e36');
      b.add('rust', boxGeo(0.4, 0.4, 3.4), T(ex, 0.6, 2.4, 7.4, 0.9, 0, 0), '#6e4e36');
      b.add('rust', boxGeo(1.2, 0.9, 1.0), T(ex, 0.6, 0.8, 8.4, 0.3, 0, 0), '#5e4430');
      cols.push(boxCollider(ex, 0, 0, 2.8, 4.4));
    }

    // ---- the lake: water, a jetty from the shore by the track, a boat turned over, a fisherman
    {
      const L = g.lake;
      const water = new THREE.Mesh(new THREE.CircleGeometry(L.r + 4, 48), this.waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(L.x, L.y, L.z);
      this.group.add(water);
      const lf = st.frame(B.lake);
      const dx = lf.x - L.x, dz = lf.z - L.z, dl = Math.hypot(dx, dz);
      const ux = dx / dl, uz = dz / dl;
      // the jetty: planks on posts from the shore out over the water, toward the lake's middle
      const jp: Place = { x: L.x + ux * (L.r - 3), y: L.y + 0.45, z: L.z + uz * (L.r - 3), rot: Math.atan2(ux, uz) };
      b.add('planks', boxGeo(1.4, 0.08, 11), T(jp, 0, 0, 0), '#8a7a62');
      for (const lz of [-5, -1.5, 2, 5]) for (const lx of [-0.6, 0.6]) b.add('boards', boxGeo(0.1, 1.6, 0.1), T(jp, lx, -0.7, lz), '#4a3e30');
      const fisher = makeMan('#5a6a50', '#2e2a30', '#6a5a4a');
      const fp = local(jp, 0.2, -4.4);
      fisher.group.position.set(fp.x, L.y + 0.49, fp.z);
      fisher.group.rotation.y = jp.rot + Math.PI;
      this.group.add(fisher.group);
      this.people.push(fisher);
      this.lakeFisher = fisher;
      // his rod, out over the water
      const rod = local(jp, 0.5, -5.2);
      b.add('flat', new THREE.CylinderGeometry(0.012, 0.02, 3.4, 4), T({ ...rod, y: L.y + 1.3 }, 0, 0, -1.2, -0.95, 0, 0), '#3a2e22');
      // a boat bottom-up on the grass, a bench, an old fire ring
      const shore = (lat: number, out: number): Place => {
        const px = -uz, pz = ux;
        const x = L.x + ux * (L.r + out) + px * lat, z = L.z + uz * (L.r + out) + pz * lat;
        return { x, y: g.terrainAt(x, z), z, rot: Math.atan2(ux, uz) };
      };
      const boat = shore(9, 3);
      // the upper half of a cylinder laid along the shore: a hull, keel up
      b.add('boards', new THREE.CylinderGeometry(0.62, 0.62, 3.8, 8, 1, false, -Math.PI / 2, Math.PI), T(boat, 0, 0.05, 0, -Math.PI / 2, 0, 0), '#4a6a7a');
      cols.push(boxCollider(boat, 0, 0, 1.3, 3.9));
      bench(b, shore(-7, 6));
      const fire = shore(-4, 9);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add('flat', new THREE.DodecahedronGeometry(0.18, 0), T(fire, Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55), '#7a7a72');
      }
      b.add('flat', boxGeo(0.7, 0.06, 0.7), T(fire, 0, 0.03, 0), '#2a2620');
      sign(st, B.lake - 60, this.signMat(blueSign(['оз. Кайынкуль'])), 2.0, 0.5, 2.0);
    }

    // ---- the pioneer camp «Звёздочка», closed since '92: gate and fence, the dormitories, the flagpole, a caretaker
    {
      const cr = g.branchSpurs.find((x) => x.id === 'camp-road')!;
      const end = cr.length;
      sign(st, B.camp - 14, board('П/Л «ЗВЁЗДОЧКА»', '#9a2a22', '#f2e8d8', 192, 40), 1.6, 0.36, 2.0, 2, sideOf(cr, B.camp));
      // the gate across the end of the track, facing up it
      const gp = on(cr, end - 1, 0, false, Math.PI);
      signPost(b, gp, board('ЗВЁЗДОЧКА', '#b0302a', '#f4ecd8', 256, 48), 6.2, 1.0, 3.6, 2);
      // the camp's own frame: local +Z away from the gate, into the camp
      const cp: Place = { ...gp, rot: gp.rot + Math.PI };
      const inner = (lx: number, lz: number, rot = 0) => local(cp, lx, lz, rot);
      clear(inner(0, 22).x, inner(0, 22).z, 42);
      for (const side of [-1, 1]) {
        const fp = inner(side * 13, 0.2);
        fence(b, fp, 18, r);
        this.colliders.add({ x: fp.x, z: fp.z, r: 9.3, hw: 9, hd: 0.15, rot: fp.rot, box: true });
        post(inner(side * 2.2, 0).x, inner(side * 2.2, 0).z);
      }
      // the dormitories: long timber blocks with faded paint, roofs of grey slate
      const tints = ['#8fa8c0', '#a8c094', '#c8b888', '#a8b4c0'];
      [[-11, 16], [11, 16], [-11, 32], [11, 32]].forEach(([lx, lz], i) => {
        const hp = { ...inner(lx, lz, Math.PI / 2), y: inner(lx, lz).y };
        b.add('boards', boxGeo(11, 2.8, 5), T(hp, 0, 1.3, 0), tints[i]);
        b.add('slate', boxGeo(11.6, 0.07, 3.2), T(hp, 0, 3.15, 1.3, 0.5, 0, 0), '#9a9a92');
        b.add('slate', boxGeo(11.6, 0.07, 3.2), T(hp, 0, 3.15, -1.3, -0.5, 0, 0), '#9a9a92');
        for (const wx of [-3.6, -1.2, 1.2, 3.6]) b.add('flat', boxGeo(0.9, 0.8, 0.04), T(hp, wx, 1.6, 2.52), '#2e3a44');
        cols.push(boxCollider(hp, 0, 0, 11, 5));
      });
      // the parade ground: the flagpole and its stand for the morning line-up, a sun shelter, the slogan
      const flag = inner(0, 24);
      b.add('flat', new THREE.CylinderGeometry(0.05, 0.07, 9, 6), T(flag, 0, 4.5, 0), '#c8c8c0');
      b.add('flat', boxGeo(2.4, 0.4, 1.4), T(flag, 0, 0.2, 0), '#b8b4a8');
      post(flag.x, flag.z, 0.6);
      const mush = inner(6, 9);
      b.add('flat', new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6), T(mush, 0, 1.1, 0), '#c8c0b0');
      b.add('flat', new THREE.ConeGeometry(1.5, 0.9, 10), T(mush, 0, 2.5, 0), '#b8443a');
      post(mush.x, mush.z);
      signPost(b, inner(-6, 9, Math.PI), board('БУДЬ ГОТОВ!', '#b0302a', '#f4ecd8', 160, 40), 2.4, 0.6, 1.6, 2);
      // the caretaker's hut by the gate, and the caretaker
      shed(b, inner(-6, 3.5), r, cols);
      const mp = inner(1.6, 1.8);
      const keeper = makeMan('#4a5240', '#2e2a30', '#9a9488');
      keeper.group.position.set(mp.x, mp.y, mp.z);
      keeper.group.rotation.y = cp.rot + Math.PI;
      this.group.add(keeper.group);
      this.people.push(keeper);
      this.stops.push({ id: 'camp', name: 'Пионерлагерь «Звёздочка»', s: g.marks.junction - 1 + B.camp * 1e-4, pos: new THREE.Vector3(mp.x, mp.y, mp.z), person: keeper,
        speaker: 'Михалыч, сторож лагеря', line: 'О, почта! Сюда уж лет пять никто не заезжал, кроме меня и ворон. Давай газеты — почитаю горнисту. Он у нас один остался, гипсовый.',
        cargo: '', done: false, branch: true });
    }

    // ---- Kainly: houses along the end of the road, the mosque, the medical post's Farida-apa by the bus stop
    {
      this.buildVillage(b, r, B.kaiStart, B.end - 15, B.kaiStop, [-1, 1], st);
      const half = st.zoneAt(B.kaiStop).width / 2;
      sign(st, B.kaiStart - 10, this.signMat(settlementSign('Кайынлы', false)), 2.2, 0.82, 2.1, 2);
      busStop(b, on(st, B.kaiStop - 14, half + 3.8), cols);
      // the wooden mosque behind the stop: a white prayer house, green iron roof, an octagonal minaret with a crescent
      const mq = on(st, B.kaiStop + 4, half + 22);
      mq.y = this.groundMin(mq, 10, 12);
      clear(mq.x, mq.z, 16);
      b.add('boards', boxGeo(9, 3.6, 11), T(mq, 0, 1.7, 0), '#e6e0d0');
      // two roof slopes meeting in a ridge along the hall
      for (const sx of [-1, 1]) b.add('metalRoof', boxGeo(5.6, 0.08, 11.8), T(mq, sx * 2.35, 4.85, 0, 0, 0, -sx * 0.55), '#4a7a5a');
      for (const wz of [-3.5, 0, 3.5]) for (const sx of [-1, 1]) b.add('flat', boxGeo(0.04, 1.3, 0.9), T(mq, sx * 4.52, 2.0, wz), '#3a5a6a');
      const mn = local(mq, 0, 4.2);
      mn.y = mq.y;
      b.add('boards', new THREE.CylinderGeometry(1.05, 1.2, 3.2, 8), T(mn, 0, 5.4, 0), '#e6e0d0');
      b.add('flat', new THREE.CylinderGeometry(1.5, 1.5, 0.18, 8), T(mn, 0, 7.1, 0), '#4a7a5a');
      b.add('boards', new THREE.CylinderGeometry(0.75, 0.85, 2.4, 8), T(mn, 0, 8.4, 0), '#e6e0d0');
      b.add('metalRoof', new THREE.ConeGeometry(0.95, 3.2, 8), T(mn, 0, 11.2, 0), '#4a7a5a');
      b.add('flat', new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4), T(mn, 0, 13.2, 0), '#d8b850');
      b.add('flat', new THREE.TorusGeometry(0.28, 0.045, 4, 10, Math.PI * 1.5), T(mn, 0, 13.85, 0, 0, 0, Math.PI * 0.5), '#d8b850');
      cols.push(boxCollider(mq, 0, 0, 9, 11));
      const fp = on(st, B.kaiStop, half + 2.3);
      const farida = makePerson('#3a5a6a', '#e0c050', true, 'dress');
      farida.group.position.set(fp.x, fp.y, fp.z);
      farida.group.rotation.y = fp.rot;
      this.group.add(farida.group);
      this.people.push(farida);
      this.stops.push({ id: 'kainly', name: 'Кайынлы', s: g.marks.junction - 1 + B.kaiStop * 1e-4, pos: new THREE.Vector3(fp.x, fp.y, fp.z), person: farida,
        speaker: 'Фарида-апа, медпункт', line: 'Әйдә, улым, почта килде! Рәхмәт. Чай эчеп китәсеңме? Чак-чак свежий, сама пекла — бери, бери, не стесняйся.',
        cargo: '', done: false, branch: true });
    }
    cols.forEach((c) => this.colliders.add(c));
  }

  /**
   * The sawmill in the forest past Sosnovka: a board-fenced yard beside the track with an
   * open saw shed, a stack of sawlogs, boards drying, a heap of sawdust and the workers' hut. The
   * gate stands open onto the road — where, one day, the cars stand across it (SawmillBlock).
   */
  private buildSawmill(b: Bucket, r: RNG): void {
    const g = this.ground, s = g.marks.sawmill;
    const half = g.main.zoneAt(s).width / 2;
    const cols: Collider[] = [];
    const yard = this.place(s + 18, half + 17);
    yard.y = this.groundMin(yard, 22, 16);
    this.exclusions.push({ x: yard.x, z: yard.z, r: 22 });
    // yard frame: local +Z toward the road, X along it
    const c = Math.cos(yard.rot), sn = Math.sin(yard.rot);
    const at = (lx: number, lz: number, rot = 0): Place => {
      const x = yard.x + lx * c + lz * sn, z = yard.z - lx * sn + lz * c;
      return { x, y: g.terrainAt(x, z), z, rot: yard.rot + rot };
    };
    // the saw shed: four posts, a slate roof, the bench with its round blade
    const shedP = { ...at(0, -1), y: yard.y };
    for (const [px, pz] of [[-4.5, -2.8], [4.5, -2.8], [-4.5, 2.8], [4.5, 2.8]]) {
      b.add('boards', boxGeo(0.2, 3.3, 0.2), T(shedP, px, 1.6, pz), '#6a5440');
      const q = at(px, pz - 1);
      cols.push({ x: q.x, z: q.z, r: 0.2, hw: 0, hd: 0, rot: 0, box: false });
    }
    b.add('slate', boxGeo(10.4, 0.07, 6.8), T(shedP, 0, 3.3, 0, 0.12, 0, 0), '#8e8e86');
    b.add('boards', boxGeo(7, 0.85, 1.1), T(shedP, 0, 0.42, 0), '#5a4a3a');
    b.add('flat', new THREE.CylinderGeometry(0.55, 0.55, 0.03, 18), T(shedP, 0.6, 1.0, 0, Math.PI / 2, 0, 0), '#a8aeb2');
    cols.push(boxCollider(shedP, 0, 0, 7, 1.1));
    // sawlogs waiting, stacked in rows
    const logs = { ...at(-9.5, -1), y: yard.y };
    for (let i = 0; i < 12; i++) {
      const row = i < 5 ? 0 : i < 9 ? 1 : 2;
      const k = i < 5 ? i : i < 9 ? i - 5 : i - 9;
      b.add('boards', new THREE.CylinderGeometry(0.3, 0.3, 7, 7), T(logs, -1.2 + k * 0.6 + row * 0.3, 0.3 + row * 0.52, 0, Math.PI / 2, 0, 0), '#8a6a4a');
    }
    cols.push(boxCollider(logs, 0, 0, 3.2, 7));
    // fresh boards on spacers, and the sawdust heap
    const boardsP = { ...at(7.5, 3.5), y: yard.y };
    b.add('planks', boxGeo(1.4, 0.9, 5.5), T(boardsP, 0, 0.45, 0), '#c0a078');
    cols.push(boxCollider(boardsP, 0, 0, 1.4, 5.5));
    const heap = at(7.5, -3);
    b.add('flat', new THREE.ConeGeometry(2.4, 1.5, 10), T(heap, 0, 0.7, 0), '#c8a46a');
    cols.push({ x: heap.x, z: heap.z, r: 2, hw: 0, hd: 0, rot: 0, box: false, soft: true });
    shed(b, at(-3, -10), r, cols);
    // board fence along the road with the gate open, and the board over it
    this.fenceAlong(b, s - 14, s + 2, half + 3, r, true);
    this.fenceAlong(b, s + 9, s + 40, half + 3, r, true);
    const tex = paint(160, 40, (cx, w, h) => {
      cx.fillStyle = '#5a4630'; cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#e8dcc0'; cx.font = 'bold 22px "PT Sans Narrow", "Arial Narrow", sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText('ПИЛОРАМА', w / 2, h / 2 + 1, w - 12);
    }, { repeat: false });
    signPost(b, this.place(s - 2, half + 2.2, false, Math.PI / 2), this.signMat(tex), 1.4, 0.35, 1.9, 2);
    cols.forEach((col) => this.colliders.add(col));
  }

  /**
   * The yard's frame (local +Z back down the lane to the road, the gate at z = +11, the lane's end at
   * +14), and the yard levelled to the lane's end before the terrain is built: the house stands on a
   * slope, and an unmade road's dead end would otherwise leave a step the van can't climb out of.
   */
  private yard!: { cx: number; cz: number; rot: number };
  private planHome(): void {
    const g = this.ground;
    const lane = g.homeRoad.samples, end = lane[lane.length - 1];
    const rot = Math.atan2(-end.tx, -end.tz);
    const cx = end.x + end.tx * 14, cz = end.z + end.tz * 14;
    this.yard = { cx, cz, rot };
    // level with the lane's end (a hair under, so the terrain never shows through its ruts)
    const y = end.y - 0.05;
    const c = Math.cos(rot), s = Math.sin(rot);
    g.addPad(cx + 0.5 * s, cz + 0.5 * c, rot, 13.6, 13.6, y, 12, Infinity, 'dirt');
  }

  /**
   * The family's yard at the far end of the forest road, in Urmanly (Ground.buildHomeRoad): a picket
   * fence round it with the gate standing open, the blue mailbox and the house plate by the gate,
   * the house with a TV aerial, the grandfather's garage where the van is mended in the evenings, a
   * woodpile and a bench, and өләсәй and the grandfather by the porch; the village's yards along the
   * street before it, a neighbour at her gate. In the mornings the van stands in the yard (homePose);
   * the day's route sheet is at the post office in Klyuchevsk, a kilometre away through the wood.
   */
  private buildHome(b: Bucket, r: RNG): void {
    const g = this.ground, road = g.homeRoad;
    const cols: Collider[] = [];
    const lane = road.samples, end = lane[lane.length - 1];
    const { cx, cz, rot } = this.yard;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const at = (lx: number, lz: number, turn = 0): Place => {
      const x = cx + lx * c + lz * sn, z = cz - lx * sn + lz * c;
      return { x, y: g.terrainAt(x, z), z, rot: rot + turn };
    };
    const yard = at(0, 0);
    this.exclusions.push({ x: yard.x, z: yard.z, r: 21 });
    for (let i = 0; i < lane.length; i += 4) this.exclusions.push({ x: lane[i].x, z: lane[i].z, r: 6 });
    const fenceAt = (lx: number, lz: number, len: number, turn: number) => {
      const p = at(lx, lz, turn);
      fence(b, p, len, r);
      cols.push({ x: p.x, z: p.z, r: len / 2 + 0.3, hw: len / 2, hd: 0.15, rot: p.rot, box: true });
    };
    // the fence: the front either side of the gate, the sides and the back
    fenceAt(-7.7, 11, 10.6, 0);
    fenceAt(7.7, 11, 10.6, 0);
    fenceAt(-13, -1, 24, Math.PI / 2);
    fenceAt(13, -1, 24, Math.PI / 2);
    fenceAt(0, -13, 26, 0);
    // the gate: posts, a beam high enough for the van, both leaves swung open into the yard
    for (const x of [-2.5, 2.5]) {
      const gp = at(x, 11);
      b.add('flat', boxGeo(0.22, 2.9, 0.22), T(gp, 0, 1.45, 0), '#4c4236');
      cols.push({ x: gp.x, z: gp.z, r: 0.2, hw: 0, hd: 0, rot: 0, box: false });
      const leaf = at(x * 0.96, 9.8, Math.PI / 2);
      b.add('boards', boxGeo(2.3, 1.7, 0.06, 1), T(leaf, 0, 1.0, 0), '#5f7f9e');
      cols.push(boxCollider(leaf, 0, 0, 2.3, 0.2));
    }
    b.add('boards', boxGeo(5.4, 0.14, 0.5), T(at(0, 11), 0, 2.85, 0), '#6a5a48');
    // the house, the aerial on its roof, a bench by the porch
    const hp = at(-5, -6.5);
    hp.y = this.groundMin(hp, 7, 8.6);
    izba(b, hp, r, true, cols);
    b.add('flat', new THREE.CylinderGeometry(0.03, 0.04, 3.4, 5), T(hp, 1.2, 6.8, -1.5), '#8a8a86');
    for (const [y, w] of [[7.9, 1.6], [8.2, 1.1], [8.45, 0.7]] as [number, number][]) b.add('flat', boxGeo(w, 0.03, 0.03), T(hp, 1.2, y, -1.5), '#8a8a86');
    bench(b, at(-8.5, -1.3));
    // the garage: a corrugated-iron box with a pitched roof, its doors to the yard
    const gp = at(7.5, -5.5);
    gp.y = this.groundMin(gp, 4, 6.5);
    b.add('metalRoof', boxGeo(4, 2.5, 6.2), T(gp, 0, 1.2, 0), '#7a8a96');
    b.add('slate', boxGeo(4.6, 0.07, 7), T(gp, 0, 2.6, 0, 0.12, 0, 0), '#9a9a92');
    b.add('flat', boxGeo(3.2, 2.1, 0.06), T(gp, 0, 1.05, 3.12), '#5a6a74');
    cols.push(boxCollider(gp, 0, 0, 4, 6.2));
    // the woodpile along the back fence
    const wp = at(-9, -11.6);
    for (let i = 0; i < 3; i++) b.add('boards', new THREE.CylinderGeometry(0.16, 0.16, 5, 6), T(wp, 0, 0.2 + i * 0.3, -i * 0.05, 0, 0, Math.PI / 2), '#8a6a4a');
    b.add('slate', boxGeo(5.4, 0.05, 1.2), T(wp, 0, 1.1, 0, 0.15, 0, 0), '#8a8a82');
    cols.push(boxCollider(wp, 0, 0, 5.2, 0.9));
    // birches either side of the gate, outside
    this.addTree('birch', at(-5.5, 14).x, at(-5.5, 14).z, rand(r, 11, 14), r, true);
    this.addTree('birch', at(6.5, 15).x, at(6.5, 15).z, rand(r, 10, 13), r, true);
    // the van's place in the mornings: inside the gate, nose to it and square on it (the opening between
    // the open leaves is ~4.6 m), clear of the two at the porch
    const vp = at(0.3, 4);
    this.homePose = { x: vp.x, z: vp.z, yaw: Math.atan2(end.tx, end.tz) };
    // by the gate: the blue mailbox on its post and the house plate on the fence
    {
      const mp = at(3.4, 11.6);
      b.add('flat', boxGeo(0.08, 1.1, 0.08), T(mp, 0, 0.55, 0), '#5c5040');
      b.add('flat', boxGeo(0.42, 0.5, 0.24), T(mp, 0, 1.3, 0), '#2a5aa8');
      b.add('flat', boxGeo(0.3, 0.03, 0.02), T(mp, 0, 1.42, 0.125), '#1a2a48');
      cols.push({ x: mp.x, z: mp.z, r: 0.2, hw: 0, hd: 0, rot: 0, box: false });
      const tex = paint(160, 48, (cx2, w, h) => {
        cx2.fillStyle = '#2a4a8a'; cx2.fillRect(0, 0, w, h);
        cx2.strokeStyle = '#e8ecf0'; cx2.lineWidth = 3; cx2.strokeRect(4, 4, w - 8, h - 8);
        cx2.fillStyle = '#e8ecf0'; cx2.font = 'bold 20px "PT Sans Narrow", "Arial Narrow", sans-serif'; cx2.textAlign = 'center'; cx2.textBaseline = 'middle';
        cx2.fillText('ЛЕСНАЯ · 14', w / 2, h / 2 + 1, w - 14);
      }, { repeat: false });
      signPost(b, at(-4.2, 11.3), this.signMat(tex), 0.9, 0.27, 1.5, 1);
    }
    // Urmanly: a dozen yards along the last stretch of the road, the signs at either end of the street
    {
      const hm = g.homeMarks, L = road.length;
      this.buildVillage(b, r, hm.village + 6, L - 36, null, [-1, 1], road);
      const half = road.zoneAt(hm.village).width / 2;
      const sign = (s: number, side: number, exit: boolean) => {
        const f = road.frame(s), lat = side * (half + 1.8);
        const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
        const rot = side > 0 ? Math.atan2(-f.tx, -f.tz) : Math.atan2(f.tx, f.tz);
        signPost(b, { x, y: g.terrainAt(x, z), z, rot }, this.signMat(settlementSign('Урманлы', exit)), 2.2, 0.82, 2.1, 2);
        cols.push({ x, z, r: 0.2, hw: 0, hd: 0, rot: 0, box: false });
      };
      sign(hm.village - 6, 1, false);
      sign(hm.village - 2, -1, true);
      // the neighbour at her gate, who sees the post van off every morning (the first morning's horn lesson)
      const np = this.placeOn(road, L - 120, half + 3.4);
      const apai = makePerson('#4a5a3a', '#d8c8a0', false, 'dress');
      apai.group.position.set(np.x, np.y, np.z);
      apai.group.rotation.y = np.rot;
      this.group.add(apai.group);
      this.people.push(apai);
      this.greeters.push(apai);
      cols.push({ x: np.x, z: np.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false });
    }
    // өләсәй by the porch, and the grandfather by her, leaning on his stick
    const pp = at(-3.4, -0.6);
    const ebi = makePerson('#6a4a5a', '#c84a3a', true, 'dress');
    ebi.group.position.set(pp.x, pp.y, pp.z);
    ebi.group.rotation.y = pp.rot;
    this.group.add(ebi.group);
    this.people.push(ebi);
    cols.push({ x: pp.x, z: pp.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false });
    this.home = { pos: new THREE.Vector3(pp.x, pp.y, pp.z), person: ebi, s: road.length };
    const kp = at(-1.8, -0.2);
    const kartatay = new Person('kartatay', {});
    kartatay.group.position.set(kp.x, kp.y, kp.z);
    kartatay.group.rotation.y = kp.rot;
    this.group.add(kartatay.group);
    this.people.push(kartatay);
    b.add('flat', new THREE.CylinderGeometry(0.018, 0.022, 0.95, 5), T(kp, -0.32, 0.47, 0.18, 0.12, 0, 0.1), '#5a4632');
    cols.push({ x: kp.x, z: kp.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false });
    this.greeters.push(ebi, kartatay);
    this.home.grandpa = kartatay;
    cols.forEach((col) => this.colliders.add(col));
  }

  private buildTown(b: Bucket, r: RNG): void {
    const cols: Collider[] = [];
    const m = this.ground.marks;
    const half = 3.5;
    const po = this.place(40, half + 14);
    po.y = this.groundMin(po, 16, 10);
    postOffice(b, po, cols);
    {
      // Zinaida Pavlovna at the post office door in the mornings, seeing the van off (a stand-in in the post's blue)
      const zp = this.place(40, half + 3.4);
      const zinaida = makePerson('#2a4a8a', '#4a3a32', false, 'woman');
      zinaida.group.position.set(zp.x, zp.y, zp.z);
      zinaida.group.rotation.y = zp.rot;
      this.group.add(zinaida.group);
      this.people.push(zinaida);
      cols.push({ x: zp.x, z: zp.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false });
      this.greeters.push(zinaida);
      this.postDoor = new THREE.Vector3(zp.x, zp.y, zp.z);
      // the grandfather by her the first morning, waiting on the porch for the Ufa bus (the story shows him: main.ts)
      const kp = this.place(38.6, half + 3.9);
      const kartatay = new Person('kartatay', {});
      kartatay.group.position.set(kp.x, kp.y, kp.z);
      kartatay.group.rotation.y = kp.rot;
      this.group.add(kartatay.group);
      this.people.push(kartatay);
      this.postGrandpa = kartatay;
      this.setAway(kartatay, true);
    }
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
    {
      // Muha by the shop: a dark saloon with no badges pulled up on the verge, him beside it smoking
      const cp = this.place(80, -(half + 2.6), false);
      const car = buildCar('sedan', '#1c1e22', 4);
      if (car.lights) car.lights.visible = false;
      car.group.position.set(cp.x, cp.y + 0.02, cp.z);
      car.group.rotation.y = cp.rot;
      this.group.add(car.group);
      // the saloon can go (Lysyi takes it back): its collider is one that can be lifted out
      const carCol = boxCollider({ x: cp.x, y: 0, z: cp.z, rot: cp.rot }, 0, 0, car.width, car.length);
      this.colliders.dynamic.push(carCol);
      this.muhaCar = { group: car.group, col: carCol };
      const muha = new Muha();
      const mp = this.place(76.5, -(half + 4.4));
      muha.group.position.set(mp.x, mp.y, mp.z);
      muha.group.rotation.y = mp.rot;
      this.group.add(muha.group);
      this.people.push(muha);
      this.muha = muha;
      const muhaCol: Collider = { x: mp.x, z: mp.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false };
      this.colliders.dynamic.push(muhaCol);
      this.muhaAt = { x: mp.x, y: mp.y, z: mp.z, rot: mp.rot, col: muhaCol };
    }
    {
      // the district hospital across from the post office: two white storeys, a red cross, әсәй on her shift at the door
      const hp = this.place(26, -(half + 19));
      hp.y = this.groundMin(hp, 18, 11);
      b.add('plaster', boxGeo(18, 7.4, 11, 2), T(hp, 0, 3.5, 0), '#ebe7de');
      b.add('flat', boxGeo(18.6, 0.35, 11.6), T(hp, 0, 7.3, 0), '#6a6a66');
      for (const fy of [1.6, 4.9]) for (const fx of [-7, -4.2, -1.4, 4.2, 7]) b.add('flat', boxGeo(1.3, 1.4, 0.06), T(hp, fx, fy, 5.53), '#3a4a5a');
      b.add('flat', boxGeo(2.2, 2.4, 0.08), T(hp, 1.4, 1.2, 5.54), '#5a6a74');
      b.add('flat', boxGeo(3.2, 0.12, 1.6), T(hp, 1.4, 2.6, 6.2), '#b8b4aa');
      const sign = paint(192, 48, (c, w, h2) => {
        c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, w, h2);
        c.fillStyle = '#c4281e'; c.fillRect(14, 12, 24, 8); c.fillRect(22, 4, 8, 24);
        c.fillStyle = '#1f2a3a'; c.font = 'bold 20px "PT Sans Narrow", "Arial Narrow", sans-serif'; c.textBaseline = 'middle';
        c.fillText('РАЙБОЛЬНИЦА', 50, h2 / 2 + 1, w - 58);
      }, { repeat: false });
      b.add(this.signMat(sign), planeGeo(4.6, 1.15), T(hp, 1.4, 3.4, 5.6));
      cols.push(boxCollider(hp, 0, 0, 18, 11));
      this.exclusions.push({ x: hp.x, z: hp.z, r: 15 });
      const np = this.place(26, -(half + 3.2));
      const nurse = makePerson('#e8e6e0', '#e8e6e0', false, 'woman');
      nurse.group.position.set(np.x, np.y, np.z);
      nurse.group.rotation.y = np.rot;
      this.group.add(nurse.group);
      this.people.push(nurse);
      cols.push({ x: np.x, z: np.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false });
      this.hospital = { pos: new THREE.Vector3(np.x, np.y, np.z), nurse };
    }
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

  private buildVillage(b: Bucket, r: RNG, from: number, to: number, stopS: number | null, sides = [-1, 1], road: Road = this.ground.main): void {
    const main = road;
    const at = (s: number, lat: number) => this.placeOn(road, s, lat);
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
          const hp = at(c, side * (half + rand(r, 13, 16.5)));
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
            this.fenceAlong(b, s + 1, c - 1.6, fl, r, true, road);
            this.fenceAlong(b, c + 1.6, gs - 3.0, fl, r, true, road);
            const gp = at(gs, fl);
            yardGate(b, gp, r, cols);
            this.fenceAlong(b, gs + 3.0, s + plotW - 1, fl, r, true, road);
          } else {
            this.fenceAlong(b, s + 1, c - 1.6, fl, r, false, road);
            this.fenceAlong(b, c + 1.6, s + plotW - 1, fl, r, false, road);
          }
          if (r() < 0.5) { const bp = at(c + 2.6, side * (half + 5.9)); bench(b, bp); this.benches.push(bp); }
          if (!wellDone && r() < 0.3) { well(b, at(c + plotW / 2, side * (half + 4)), cols); wellDone = true; }
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
      'Ой, сынок, приехал! А я уж думала — по такой дороге и не доберёшься. Пенсия да районка — вот и вся радость. Возьми яблок, своих, антоновка.',
      'пенсия, газеты');
    mk('zarechye', 'Заречье', m.zarStop + 1, halfZ + 2.3, '#3a4a5a', '#e8e0d0', true, 'woman', 'Валентина, продавщица сельпо',
      'Через Серебрянку перебрался? Молодец. Посылки сюда, накладные — мне. Чай будешь? Ливень-то какой, переждёшь хоть.',
      'посылки, накладные');
  }

  /** A Place beside any road (not only the main one), `lat` metres to its right. */
  private placeOn(road: Road, s: number, lat: number, faceRoad = true, extraRot = 0): Place {
    const f = road.frame(clamp(s, 0, road.length));
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
    const side = Math.sign(lat) || 1;
    const rot = faceRoad ? Math.atan2(-side * f.rx, -side * f.rz) : Math.atan2(f.tx, f.tz);
    return { x, y: this.ground.terrainAt(x, z), z, rot: rot + extraRot };
  }

  /**
   * The places off the route, at the ends and bends of the new back roads: a farmstead,
   * the forestry, an apiary, the old kolkhoz farm and the cemetery, each with a name board
   * where its road leaves the main one.
   */
  private buildPOIs(b: Bucket, r: RNG): void {
    const g = this.ground;
    const cols: Collider[] = [];
    const nameTex = (text: string) => paint(192, 40, (c, w, h) => {
      c.fillStyle = '#1f4e8a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8e8e0'; c.fillRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#1f4e8a'; c.fillRect(5, 5, w - 10, h - 10);
      c.fillStyle = '#f2f2ea'; c.font = 'bold 17px "PT Sans Narrow", "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text.toUpperCase(), w / 2, h / 2 + 1, w - 16);
    }, { repeat: false });
    const clear = (p: Place, rad: number) => this.exclusions.push({ x: p.x, z: p.z, r: rad });
    for (const poi of g.pois) {
      const road = poi.road;
      const half = road.zoneAt(poi.s).width / 2;
      // the board on the main road at the turn-off, facing traffic from both ways
      const mh = g.main.zoneAt(poi.mainS).width / 2;
      const f0 = road.frame(8);
      const mf = g.main.frame(poi.mainS);
      const sideSign = Math.sign((f0.x - mf.x) * mf.rx + (f0.z - mf.z) * mf.rz) || 1;
      const sp = this.place(poi.mainS - 14, sideSign * (mh + 2.2), false, Math.PI / 2);
      signPost(b, sp, this.signMat(nameTex(poi.name)), 1.6, 0.4, 2.2, 2);
      const at = (s: number, lat: number, face = true, rot = 0) => this.placeOn(road, s, lat, face, rot);
      const S = poi.s;
      // the one who comes out to the post van
      const addressee = (p: Place, person: Person, speaker: string, line: string) => {
        p.y = this.ground.terrainAt(p.x, p.z);
        person.group.position.set(p.x, p.y, p.z);
        person.group.rotation.y = p.rot;
        this.group.add(person.group);
        this.people.push(person);
        this.stops.push({ id: poi.kind, name: poi.name[0].toUpperCase() + poi.name.slice(1), s: poi.mainS, pos: new THREE.Vector3(p.x, p.y, p.z), person, speaker, line, cargo: '', done: false, turn: { name: poi.name, s: poi.mainS } });
      };
      const ADDRESSEE: Partial<Record<Poi['kind'], () => void>> = {
        khutor: () => addressee(at(S - 30, half + 2), makeMan('#5a6a4a', '#2e2a30', '#b8b4ac'), 'Василий Степанович, хутор Берёзки',
          'О, почта! Я уж думал, про хутор забыли. Давай сюда, давай. Молоко будешь? Своё, утреннее.'),
        kolkhoz: () => addressee(at(S - 14, -(half + 2)), makePerson('#7a5a3a', '#d8c8a0', false, 'woman'), 'Галина Ивановна, зоотехник',
          'Наконец-то! Без бумаг у нас ни одна корова не доится, — шучу. Давай, распишусь. Ты на ферме-то не застрял?'),
        forestry: () => addressee(at(S - 6, half + 2), makeMan('#4a5a3a', '#3a3a30', '#5a4232'), 'Фёдор, лесник',
          'Здорово. Ты через лес — и ни одного дерева не задел? Уважаю. Давай газеты, а то я тут совсем одичал.'),
        apiary: () => addressee(at(S - 20, half + 2), makeMan('#c8b890', '#4a4038', '#9a9488'), 'Рашит-агай, пасечник',
          'Тихо, тихо, не гуди — пчёлы гудок не любят. Давай, улым, что привёз. Мёду баночку возьмёшь? Или кумыса?'),
      };
      switch (poi.kind) {
        case 'khutor': {
          for (const [ds, lat] of [[-75, 14], [-42, -15], [-12, 14]] as [number, number][]) {
            const p = at(S + ds, lat * (1 + (half > 2 ? 0.1 : 0)));
            p.y = this.groundMin(p, 8, 8);
            izba(b, p, r, r() < 0.4, cols);
            clear(p, 10);
          }
          well(b, at(S - 58, 7), cols);
          woodpile(b, at(S - 26, -9));
          for (let i = 0; i < 3; i++) { const hp = at(S - 110 + i * 22, -26 - i * 4); haystack(b, hp, r, cols); clear(hp, 4); }
          break;
        }
        case 'forestry': {
          const house = at(S, 12);
          house.y = this.groundMin(house, 8, 8);
          izba(b, house, r, true, cols);
          clear(house, 12);
          for (const ds of [-22, 24]) { const sh = at(S + ds, -11); shed(b, sh, r, cols); clear(sh, 6); }
          for (let i = 0; i < 4; i++) woodpile(b, at(S - 14 + i * 3.2, -15, true, 0.05 * i));
          for (let i = 0; i < 7; i++) b.add('boards', new THREE.CylinderGeometry(0.26, 0.26, 5.5, 7), T(at(S + 30, -10 - i * 0.2), -0.8 + (i % 4) * 0.52, 0.26 + Math.floor(i / 4) * 0.45, 0, Math.PI / 2, 0, 0), '#8a6a4a');
          break;
        }
        case 'apiary': {
          const hut = at(S - 34, 9);
          shed(b, hut, r, cols);
          clear(hut, 8);
          const tints = ['#e0c860', '#6a8aa8', '#d4ccba', '#b0704c', '#7a9a5a'];
          for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
            const hp = at(S - 40 + i * 2.2, -8 - row * 3.4, true, (r() - 0.5) * 0.3);
            b.add('flat', boxGeo(0.5, 0.42, 0.62), T(hp, 0, 0.5, 0), tints[(i + row * 2) % tints.length]);
            b.add('flat', boxGeo(0.56, 0.05, 0.7), T(hp, 0, 0.74, 0), '#9a9a90');
            for (const x of [-0.2, 0.2]) b.add('flat', boxGeo(0.06, 0.28, 0.06), T(hp, x, 0.14, 0), '#5c5040');
          }
          well(b, at(S - 70, 7), cols);
          break;
        }
        case 'kolkhoz': {
          const fp = at(S - 50, 20);
          fp.y = this.groundMin(fp, 44, 11);
          farm(b, fp, r, cols);
          clear(fp, 30);
          const gp = at(S - 8, 15);
          garages(b, gp, 3, r, cols);
          // a silo and a pile of straw
          const sl = at(S - 20, -13);
          b.add('concrete', new THREE.CylinderGeometry(2.2, 2.2, 9, 12), T(sl, 0, 4.5, 0), '#b8b4a6');
          b.add('metalRoof', new THREE.ConeGeometry(2.4, 1.4, 12), T(sl, 0, 9.7, 0), '#8a8a82');
          cols.push({ x: sl.x, z: sl.z, r: 2.4, hw: 0, hd: 0, rot: 0, box: false });
          for (let i = 0; i < 3; i++) { const hp = at(S - 90 + i * 16, -24 - i * 3); haystack(b, hp, r, cols); clear(hp, 4); }
          break;
        }
        case 'cemetery': {
          const c0 = at(S, 16 + 9);
          clear(c0, 20);
          const fy = c0.rot;
          const P = (lx: number, lz: number): Place => ({ x: c0.x + lx * Math.cos(fy) + lz * Math.sin(fy), y: c0.y, z: c0.z - lx * Math.sin(fy) + lz * Math.cos(fy), rot: fy });
          for (const [lx, lz, len, rot] of [[0, -9, 20, 0], [0, 9, 20, 0], [-10, 0, 18, Math.PI / 2], [10, 0, 18, Math.PI / 2]] as [number, number, number, number][]) {
            const q = P(lx, lz); q.rot = fy + rot; q.y = this.groundMin(q, len, 1);
            fence(b, q, len, r);
          }
          for (let ix = -3; ix <= 3; ix++) for (let iz = -2; iz <= 2; iz++) {
            if (r() < 0.25) continue;
            const q = P(ix * 2.6 + (r() - 0.5) * 0.5, iz * 3 + 1);
            q.y = this.ground.terrainAt(q.x, q.z);
            const tint = r() < 0.5 ? '#6a5a44' : '#d8d4c6';
            b.add('flat', boxGeo(0.07, 1.25, 0.07), T(q, 0, 0.62, 0), tint);
            b.add('flat', boxGeo(0.5, 0.07, 0.07), T(q, 0, 0.98, 0), tint);
            b.add('flat', boxGeo(0.9, 0.12, 1.6), T(q, 0, 0.06, 0.7), '#9a9488');
          }
          break;
        }
      }
      ADDRESSEE[poi.kind]?.();
    }
    cols.forEach((c) => this.colliders.add(c));
  }

  /** Strollers along the verges of every village and hamlet. */
  private buildVillagers(r: RNG): void {
    const g = this.ground;
    this.villagers = new Villagers(g, this.colliders.dynamic);
    this.group.add(this.villagers.group);
    const COATS = ['#5a4a6a', '#6a4a3a', '#3a4a5a', '#7a5a3a', '#4a5a3a', '#8a3a3a', '#5a5a62'];
    const SCARVES = ['#c8452e', '#d8c8a0', '#e8e0d0', '#2e5a8a', '#8a6a2e', '#c8a0a0'];
    const SHIRTS = ['#6a6a5a', '#4a5a7a', '#7a4a3a', '#8a8a78', '#3a4a3a', '#a89a78'];
    const pickOf = <T>(l: T[]) => l[Math.floor(r() * l.length)];
    for (const [a, b] of this.hamlets) {
      const n = clamp(Math.round((b - a) / 80), 1, 4);
      for (let i = 0; i < n; i++) {
        const s = a + 8 + r() * Math.max(1, b - a - 16);
        const half = g.main.zoneAt(s).width / 2;
        const side = r() < 0.5 ? -1 : 1;
        const lat = side * (half + 3.6 + r() * 3.4);
        const p = this.place(s, lat);
        if (this.exclusions.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < e.r)) continue;
        const k = r();
        const person = k < 0.4 ? makePerson(pickOf(COATS), pickOf(SCARVES), r() < 0.4, r() < 0.6 ? 'dress' : 'woman')
          : makeMan(pickOf(SHIRTS), r() < 0.5 ? '#2e2a30' : '#3a3a32', r() < 0.4 ? '#8e8880' : '#3a2e26');
        this.villagers.add(person, s, lat, [a, b]);
      }
    }
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
      if (g.nearestRoad(p.x, p.z, 16) || this.layout(p.x, p.z).dens > 0.15 || this.rail.dist(p.x, p.z) < 15 || this.exclusions.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < e.r + 3)) continue;
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
    // the turn into the wood for Urmanly, for those coming up the highway from the fork
    put(m.home + 25, directionSign([['Урманлы', '1']], 'right'), 2.0, 1.0, 2.2, 2, -1);
    // …and for those coming out of town past the GAI post
    put(m.home - 30, directionSign([['Урманлы', '1']], 'left'), 2.0, 1.0, 2.2, 2);
    put(m.potholesFrom - 40, warningSign('uneven'), 1.0, 1.0, 2.2);
    // 60 zone around the GAI post, both directions
    put(m.town + 170, limitSign(60), 0.9, 0.9, 2.2);
    put(m.town + 490, limitSign(60), 0.9, 0.9, 2.2, 1, -1);
    put(m.town + 470, limitSign(60, true), 0.9, 0.9, 2.2);
    put(m.junction - 150, directionSign([['Сосновка', '1'], ['Заречье', '3']], 'right'), 2.4, 1.2, 2.3, 2);
    put(m.junction + 60, directionSign([['Сосновка', '1'], ['Заречье', '3']], 'up'), 2.0, 1.0, 2.2, 2);
    // straight on at the fork, along the branch road
    put(m.junction - 125, directionSign([['Кайынлы', '2'], ['оз. Кайынкуль', '1']], 'up'), 2.2, 1.1, 2.3, 2);
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
    const key = `${kind}@${cellKey(x, z, PROP_CELL)}`;
    let t = this.trees.get(key);
    if (!t) { t = { kind, m: [], c: [] }; this.trees.set(key, t); }
    t.m.push(m);
    const v = 0.82 + r() * 0.22;
    t.c.push(kind === 'birch' ? new THREE.Color(v, v * (0.92 + r() * 0.1), v * (0.8 + r() * 0.2)) : new THREE.Color(v, v, v));
    const f = this.ground.field(x, z);
    if (f.d < 45 && kind !== 'reeds') this.colliders.add({ x, z, r: kind === 'bush' ? 0.6 : 0.35, hw: 0, hd: 0, rot: 0, box: false, soft: kind === 'bush' });
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
        // reeds round the lake, thickest at the water's edge; nothing else on the shore
        const dl = Math.hypot(px - g.lake.x, pz - g.lake.z) - g.lake.r;
        if (dl < 12) {
          if (dl > -9 && r() < 0.55 - Math.abs(dl + 2) * 0.03 && lay.d > 6) this.addTree('reeds', px, pz, rand(r, 1.6, 2.4), r);
          continue;
        }
        if (Math.hypot(px - g.quarryPit.x, pz - g.quarryPit.z) < g.quarryPit.r + 14) continue;
        const far = lay.d > 330 ? 0.4 : 1;
        if (lay.d < 16 && lay.tag !== 'town' && !this.inVillage(lay.s) && r() < 0.05) { this.addTree('bush', px, pz, rand(r, 2.2, 3.6), r); continue; }
        if (r() > lay.dens * 0.5 * far) continue;
        let kind: TreeKind;
        const k = r();
        if (lay.belt) kind = k < 0.85 ? 'birch' : 'bush';
        else if (lay.tag === 'bor') kind = k < 0.78 ? 'pine' : k < 0.95 ? 'birch' : 'spruce';
        else if (lay.tag === 'forest' && lay.main) kind = k < 0.45 ? 'spruce' : k < 0.8 ? 'birch' : 'pine';
        else if (lay.tag === 'mud') kind = k < 0.5 ? 'bush' : k < 0.85 ? 'birch' : 'spruce';
        else kind = k < 0.6 ? 'birch' : k < 0.72 ? 'pine' : k < 0.86 ? 'spruce' : 'bush';
        const h = kind === 'birch' ? rand(r, 10, 17) : kind === 'spruce' ? rand(r, 12, 21) : kind === 'pine' ? rand(r, 14, 21) : rand(r, 2.6, 4.2);
        this.addTree(kind, px, pz, h * (lay.d > 330 ? 1.15 : 1), r);
      }
    }
    const geo = crossQuads(3);
    const texFor: Record<TreeKind, THREE.Texture> = { birch: this.T.birch, spruce: this.T.spruce, pine: this.T.pine, bush: this.T.bush, reeds: this.T.reeds };
    const mats = new Map<TreeKind, THREE.MeshLambertMaterial>();
    for (const [key, t] of this.trees) {
      if (!t.m.length) continue;
      let mtl = mats.get(t.kind);
      if (!mtl) {
        mtl = new THREE.MeshLambertMaterial({ map: texFor[t.kind], alphaTest: 0.5, side: THREE.DoubleSide });
        snowy(mtl, 'dust');
        mats.set(t.kind, mtl);
        if (t.kind === 'birch' || t.kind === 'bush') this.leafy.push(mtl);
      }
      const mesh = new THREE.InstancedMesh(geo, mtl, t.m.length);
      t.m.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, t.c[i]); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // the bounds of this cell's trees, for culling
      mesh.computeBoundingSphere();
      mesh.name = `trees:${key}`;
      this.group.add(mesh);
    }
    this.trees.clear();
  }

  /** Farm animals out (grazing season) or in the byres (late autumn to spring). Dogs stay out. */
  setGrazing(on: boolean): void {
    for (const a of this.fauna) if (a.kind !== 'dog') a.stabled = !on;
  }

  /** A farm animal put into the world later (the herd that crosses the village street). */
  spawnAnimal(kind: AnimalKind, x: number, z: number, yaw: number, leash = 10): Animal {
    const a = new Animal(kind, x, z, yaw, this.ground, leash);
    a.onHit = (an, sp) => { this.onAnimalHit?.(an.kind, sp); };
    this.group.add(a.group);
    this.fauna.push(a);
    this.colliders.dynamic.push(a.col);
    return a;
  }

  /** What the land is at a point: a ploughed field, stubble, or neither (as the terrain is painted). */
  fieldKind(x: number, z: number): 'plough' | 'stubble' | null {
    const lay = this.layout(x, z);
    if (!(lay.dens < 0.22 && lay.d > 45)) return null;
    // not in a village: houses, yards and the rest keep their ground
    if (this.exclusions.some((e) => Math.hypot(e.x - x, e.z - z) < e.r + 25)) return null;
    const n = fbm(x * 0.0022, z * 0.0022, 2, 23);
    return n > 0.63 ? 'plough' : n > 0.56 ? 'stubble' : null;
  }

  private buildFauna(r: RNG): void {
    const g = this.ground, m = g.marks;
    const add = (kind: AnimalKind, p: Place, leash = 14, block = false, dir?: { x: number; z: number }) => {
      const a = new Animal(kind, p.x, p.z, p.rot + r() * 6, g, leash);
      a.onHit = (an, sp) => { this.onAnimalHit?.(an.kind, sp); };
      a.onBark = () => this.onBark?.();
      if (block) { a.roadDir = dir; a.block(); }
      this.group.add(a.group);
      this.fauna.push(a);
      this.colliders.dynamic.push(a.col);
      return a;
    };
    const herd = (kind: AnimalKind, s: number, lat: number, n: number, spread = 40, leash = 18, road?: Road) => {
      for (let i = 0; i < n; i++) {
        const p = road ? this.placeOn(road, s + rand(r, -spread, spread), lat * rand(r, 0.8, 1.3), false) : this.place(s + rand(r, -spread, spread), lat * rand(r, 0.8, 1.3), false);
        add(kind, p, leash);
      }
    };
    // pastures along the route
    herd('cow', m.sosStart - 170, -60, 5);
    herd('cow', m.bridge + 140, -60, 3);
    herd('sheep', m.sosStart - 60, 55, 6, 25, 10);
    herd('horse', m.zarStart - 80, 70, 2, 20, 20);
    herd('horse', m.town + 1000, -75, 2, 20, 20);
    herd('sheep', m.zarStart + 140, -50, 4, 20, 8);
    // out along the branch: cows on the lake meadow, sheep and a dog at Kainly
    const br = g.branch;
    const lf = g.stub.frame(br.lake);
    const lakeSide = (g.lake.x - lf.x) * lf.rx + (g.lake.z - lf.z) * lf.rz > 0 ? 1 : -1;
    herd('cow', (br.borEnd + br.lake) / 2, -lakeSide * 55, 4, 40, 18, g.stub);
    herd('sheep', br.kaiStart + 40, -60, 5, 25, 10, g.stub);
    add('dog', this.placeOn(g.stub, br.kaiStop + 30, -16, false), 8);
    // yards: pigs and a watch-dog in every hamlet
    for (const [a, b] of this.hamlets) {
      const s = (a + b) / 2;
      const side = r() < 0.5 ? -1 : 1;
      const half = g.main.zoneAt(s).width / 2;
      add('dog', this.place(s + rand(r, -20, 20), side * (half + 7), false), 9);
      if (r() < 0.7) add('pig', this.place(s + rand(r, -30, 30), side * (half + 18), false), 5);
    }
    // the back roads have their own herds
    for (const poi of g.pois) {
      if (poi.kind === 'kolkhoz') { herd('cow', poi.s, 38, 5, 30, 16, poi.road); herd('horse', poi.s, -45, 2, 20, 18, poi.road); }
      if (poi.kind === 'khutor') { herd('pig', poi.s, 20, 3, 15, 5, poi.road); add('dog', this.placeOn(poi.road, poi.s, 11, false), 8); herd('sheep', poi.s, -30, 4, 20, 8, poi.road); }
      if (poi.kind === 'apiary') add('dog', this.placeOn(poi.road, poi.s, 12, false), 8);
    }
    // a cow that has wandered onto a track and will not budge until hooted off
    for (const s of [m.forest + 380, m.forest + 900, m.bridge + 100]) {
      const f = g.main.frame(s);
      add('cow', { x: f.x + f.rx * 0.5, y: 0, z: f.z + f.rz * 0.5, rot: Math.atan2(f.rx, f.rz) }, 6, true, { x: f.tx, z: f.tz });
    }
    for (const poi of g.pois) if (poi.kind === 'forestry') {
      const f = poi.road.frame(poi.s * 0.5);
      add('cow', { x: f.x, y: 0, z: f.z, rot: Math.atan2(f.rx, f.rz) }, 5, true, { x: f.tx, z: f.tz });
    }
  }

  /**
   * Things that happen on the road: a tractor parked across the track at the river meadow,
   * a broken-down lorry on the forest bypass with its driver waving a spanner.
   */
  private buildEvents(r: RNG): void {
    const g = this.ground, m = g.marks;
    // ---- tractor across the track after the bridge
    {
      const s = m.bridge + 125;
      const f = g.main.frame(s);
      const x = f.x + f.rx * 1.0, z = f.z + f.rz * 1.0;
      const yaw = Math.atan2(f.tx, f.tz) + Math.PI / 2;
      const model = buildVehicle('tractor', '#3a6aa8', 2);
      model.lights && (model.lights.visible = false);
      model.group.position.set(x, g.height(x, z), z);
      model.group.rotation.y = yaw;
      this.group.add(model.group);
      const col: Collider = { x, z, r: model.length / 2, hw: model.width / 2, hd: model.length / 2, rot: yaw, box: true, mass: 4500 };
      this.colliders.dynamic.push(col);
      const farmer = makeMan('#5a5a48', '#2e2a30', '#8e8880');
      const fp = { x: x + Math.sin(yaw + 1.6) * 2.4 + f.tx * 1.5, z: z + Math.cos(yaw + 1.6) * 2.4 + f.tz * 1.5 };
      this.group.add(farmer.group);
      farmer.group.position.set(fp.x, g.height(fp.x, fp.z), fp.z);
      farmer.group.rotation.y = yaw + 0.8;
      this.people.push(farmer);
      this.events.push({ id: 'tractor', s, state: 'wait', t: 0, honks: 0, model, col, yaw, dir: { x: Math.sin(yaw), z: Math.cos(yaw) }, farmer, told: false, x, z, x0: x, z0: z, away: 0 });
    }
    // ---- broken lorry on the forest bypass, half in the lane, its driver beside it
    {
      const road = g.sideRoads.find((q) => q.id === 'forest-bypass');
      if (road) {
        const s = road.length * 0.45;
        const f = road.frame(s);
        const x = f.x + f.rx * 0.9, z = f.z + f.rz * 0.9;
        const yaw = Math.atan2(f.tx, f.tz) + 0.06;
        const model = buildVehicle('zil', '#6a8a5a', 1);
        if (model.lights) model.lights.visible = false;
        model.group.position.set(x, g.height(x, z), z);
        model.group.rotation.y = yaw;
        this.group.add(model.group);
        const col: Collider = { x, z, r: 4, hw: model.width / 2, hd: model.length / 2, rot: yaw, box: true, mass: 5000 };
        this.colliders.dynamic.push(col);
        const driver = makeMan('#6a4a3a', '#2e2a30');
        const dp = { x: x - f.rx * 2.5 - f.tx * 1.0, z: z - f.rz * 2.5 - f.tz * 1.0 };
        driver.group.position.set(dp.x, g.height(dp.x, dp.z), dp.z);
        driver.group.rotation.y = Math.atan2(f.rx, f.rz) + Math.PI;
        this.group.add(driver.group);
        this.people.push(driver);
        // a warning triangle on the road behind it
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 3), new THREE.MeshLambertMaterial({ color: '#c8281e', emissive: '#601008' }));
        tri.position.set(x - f.tx * 22 + f.rx * 0.3, g.height(x - f.tx * 22, z - f.tz * 22) + 0.3, z - f.tz * 22 + f.rz * 0.3);
        this.group.add(tri);
        this.events.push({ id: 'lorry', s, state: 'wait', t: 0, honks: 0, model, col, yaw, dir: { x: 0, z: 0 }, farmer: driver, told: false, x, z, x0: x, z0: z, away: 0 });
      }
    }
  }

  /** A new run: the tractor is back across the track, the lorry still broken. */
  resetEvents(): void {
    for (const e of this.events) {
      e.state = 'wait'; e.t = 0; e.honks = 0; e.away = 0; e.told = false;
      e.x = e.x0; e.z = e.z0;
      e.model.group.position.set(e.x, this.ground.height(e.x, e.z), e.z);
      e.col.x = e.x; e.col.z = e.z;
      e.farmer.group.visible = true;
    }
  }

  /** Per frame: animals, and the events waiting for the van. */
  private updateEvents(dt: number, van: { x: number; z: number; vx: number; vz: number; honk: boolean }, honkEdge: boolean): void {
    for (const e of this.events) {
      const d = Math.hypot(van.x - e.x, van.z - e.z);
      const vsp = Math.hypot(van.vx, van.vz);
      if (!e.told && d < 70) {
        e.told = true;
        this.onEvent?.(e.id === 'tractor' ? 'Трактор перегородил дорогу. Посигналь или подожди — трактористу ехать надо.' : 'Впереди сломался грузовик: водитель машет — объезжай по краю, осторожно.');
      }
      if (e.id === 'lorry') {
        // the driver waves a spanner as the van comes by or hoots
        if (honkEdge && d < 45) e.farmer.wave = 2.5;
        continue;
      }
      if (e.state === 'wait') {
        if (honkEdge && d < 50) e.honks++;
        if (d < 14 && vsp < 1.5) e.t += dt; else e.t = Math.max(0, e.t - dt * 0.5);
        if (e.honks >= 2 || e.t > 18) { e.state = 'go'; e.farmer.wave = 2; }
      } else if (e.state === 'go') {
        // he climbs aboard and clears the track, straight off the road
        e.away += dt;
        if (e.away > 2.2 && e.away < 11) {
          const sp = 1.6;
          e.x += e.dir.x * sp * dt; e.z += e.dir.z * sp * dt;
          e.model.group.position.set(e.x, this.ground.height(e.x, e.z), e.z);
          e.col.x = e.x; e.col.z = e.z;
          rollWheelsBy(e.model, sp * dt);
          e.farmer.group.visible = false;
        } else if (e.away >= 11) { e.state = 'done'; e.col.x += 0; }
      }
    }
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
      // the roadblock car: parked out of sight until a chase calls for it
      const bm = buildCar('militia', '#ecece6', 9, { label: 'ГАИ' });
      bm.group.visible = false;
      this.group.add(bm.group);
      const bcol: Collider = { x: 1e9, z: 1e9, r: 3, hw: bm.width / 2, hd: bm.length / 2, rot: 0, box: true };
      this.colliders.dynamic.push(bcol);
      this.gai = { block: { model: bm, col: bcol }, models, col, park, inspector: insp, insCol, post: { x: ip.x, z: ip.z, yaw: ip.rot }, sPost: sG + 6 };
    }
    {
      // a clear verge in the village before the fork: some days the post's radar goes out there (Police.setPost)
      const sa = m.junction - 180;
      for (const ds of [-10, 0]) { const ap = this.place(sa + ds, half(sa) + 3); this.exclusions.push({ x: ap.x, z: ap.z, r: 7 }); }
    }

    // crossing keeper's booth
    const bp = this.place(this.rail.sCross + 16, -(half(this.rail.sCross) + 8));
    crossingBooth(b, bp, sign, cols);
    this.exclusions.push({ x: bp.x, z: bp.z, r: 6 });

    // filling station on the left, a sedan at the pump
    const ap = this.station.ap;
    gasStation(b, ap, sign, cols, this.station.edge);
    // a car already filling on the far side of the pump, along the island
    park('vaz2105', 'baklaj', ap, -0.4, -2.9, Math.PI / 2);
    this.fuelBay = { x: ap.x, z: ap.z, rot: ap.rot };
    this.exclusions.push({ x: ap.x, z: ap.z, r: 26 });

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
    park('bobik', 'khaki', cp, -13, 9, Math.PI / 2 + 0.3);
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
    const van = { x: px, z: pz, vx: pvx, vz: pvz, honk: this.honk };
    this.villagers.update(dt, t, van, { rain: this.rainNow, dark: this.darkNow, watch: this.watch });
    for (const a of this.fauna) a.update(dt, van);
    this.updateEvents(dt, van, this.honk && !this.honkWas);
    this.honkWas = this.honk;
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
    this.darkNow = darkness;
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

  /** How much snow lies, 0 (none) … 1 (deep winter): ground, roofs and roads white, water frozen, puddles iced over. */
  setSnow(k: number): void {
    snowCover.value = k;
    this.snowNow = k;
    // the leaves fall: only the densest of the foliage texture (trunk, branches) stays standing
    for (const m of this.leafy) m.alphaTest = 0.5 + 0.43 * clamp(k, 0, 1);
    if (k > 0.05) {
      this.puddleMat.color.lerp(ICE, clamp(k, 0, 1));
      this.puddleMat.opacity = lerp(this.puddleMat.opacity, 0.85, k);
    }
  }
  private snowNow = 0;
  /** Birch and bush foliage: thinned to bare twigs as the winter comes. */
  private readonly leafy: THREE.MeshLambertMaterial[] = [];

  /** Muha's saloon at the shop or gone. */
  setMuhaCar(on: boolean): void {
    this.muhaCar.group.visible = on;
    const d = this.colliders.dynamic, i = d.indexOf(this.muhaCar.col);
    if (on && i < 0) d.push(this.muhaCar.col);
    if (!on && i >= 0) d.splice(i, 1);
  }

  /** Muha by the shop (`null`), somewhere else for the day, or nowhere to be seen (`'away'`). */
  placeMuha(at: Place | 'away' | null): void {
    const m = this.muha;
    if (!m) return;
    const p = at && at !== 'away' ? at : this.muhaAt;
    m.group.position.set(p.x, p.y, p.z);
    m.group.rotation.y = p.rot;
    m.group.visible = at !== 'away';
    // the distance culling must not bring him back where he no longer is
    this.culled.delete(m);
    const c = this.muhaAt.col;
    c.x = at === 'away' ? 1e9 : p.x; c.z = at === 'away' ? 1e9 : p.z;
  }

  /** A place on the main road, `lat` metres to its right (for set pieces placed by the story). */
  roadside(s: number, lat: number, faceRoad = true): Place { return this.place(s, lat, faceRoad); }

  update(dt: number, t: number, cam: THREE.Vector3): void {
    this.waterTex.offset.y -= dt * 0.04;
    this.farRing.position.set(cam.x, cam.y - 12, cam.z);
    this.muha?.van.copy(cam);
    this.sawmill.update(dt, cam);
    for (const p of this.greeters) {
      const d = Math.hypot(p.group.position.x - cam.x, p.group.position.z - cam.z);
      if (d < 22 && !this.greeted.has(p)) { this.greeted.add(p); p.wave = 2.6; }
      if (d > 60) this.greeted.delete(p);
    }
    for (const p of this.people) {
      // past the fog a figure is not drawn and not animated (skinned meshes are never frustum-culled);
      // only figures hidden here are shown again, so a scene that hides someone keeps them hidden
      const g = p.group;
      if (this.away.has(p)) continue;
      if (Math.hypot(g.position.x - cam.x, g.position.z - cam.z) > PEOPLE_FAR) {
        if (g.visible) { g.visible = false; this.culled.add(p); }
        continue;
      }
      if (this.culled.delete(p)) g.visible = true;
      p.update(dt, t);
    }
  }
}

function main(g: Ground): Road { return g.main; }

/** Where the family's yard is, metres past the town limit along the main road. */
/** Size of the ground cells the roads are split into for culling, metres (as the terrain chunks). */
const CELL = 240;
/**
 * Cells for buildings, props and trees: coarser, since they come in many materials and every
 * material in a cell is a draw call of its own.
 */
const PROP_CELL = 480;
/** Beyond this, metres, people are not drawn or animated: past the thickest fog's far end, a few pixels at most. */
const PEOPLE_FAR = 420;

const MUD_WATER = new THREE.Color(0x4a4232);
/** A puddle frozen over. */
const ICE = new THREE.Color(0x9aa8b0);

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

interface RoadEvent {
  id: 'tractor' | 'lorry';
  s: number;
  state: 'wait' | 'go' | 'done';
  t: number; honks: number; away: number;
  model: import('./Vehicles').VehicleModel;
  col: Collider;
  yaw: number;
  dir: { x: number; z: number };
  farmer: Person;
  told: boolean;
  x: number; z: number;
  x0: number; z0: number;
}

function rollWheelsBy(m: import('./Vehicles').VehicleModel, ds: number): void {
  for (const a of m.axles) a.pivot.rotation.x += ds / a.r;
}
