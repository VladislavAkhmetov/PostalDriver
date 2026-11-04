import * as THREE from 'three';
import { Bucket, boxGeo, gableRoof, planeGeo } from '../core/geom';
import { pick, rand, RNG } from '../core/math';
import { boxCollider, Collider, fence, Place, T } from './Props';

/**
 * Urmanly («лесная»), the family's village: a Bashkir aul at the end of a forest road, in a valley
 * under the wooded foothills. The pieces of it: log houses gable-end to the street with carved,
 * painted window surrounds and a sun on the gable, broad painted gates, bathhouses (мунча) at the
 * bottom of the gardens, hives, a shadoof well, the spring (шишма) with its little roof, the wooden
 * mosque with its minaret rising from the roof, the cemetery (зират) under the birches, geese.
 */

/** Material keys of one paint scheme (World makes one set per FOLK_SCHEMES entry). */
export interface FolkMats { gate: string; win: string; winLit: string; gable: string; base: string; trim: string }

const LOGS = ['#a89a86', '#9a8a76', '#b8a48a', '#8e7e6a', '#a3917a'];
const PAINTED = ['#86a8c8', '#9cb88a', '#d6c48e', '#c8d0c0'];
const IRON = ['#4f7a4a', '#9a3a2c', '#45688c', '#3e6a5a', '#7a2e26'];
const SLATE = ['#a9aaa2', '#b8b8b0', '#9a9a92'];

/** A triangle facing +z, base on y = 0 from -w/2 to w/2, apex at `rise`; uv (0,0) (1,0) (0.5,1). */
function triangle(w: number, rise: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, rise, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  g.computeVertexNormals();
  return g;
}

export interface HouseOpts {
  /** Which way (local ±x) the yard and the gate are: the glazed veranda and the porch go there. */
  yard: 1 | -1;
  lit: boolean;
  /** Nobody lives here any more: the windows boarded up, the paint long gone. */
  abandoned?: boolean;
  w?: number;
  d?: number;
  /** Force the TV aerial on the roof (most houses have one anyway). */
  aerial?: boolean;
}

/**
 * A Bashkir log house (бура өй), gable-end to the street (local +z): on a stone plinth, three
 * windows in carved surrounds with open painted shutters, the boarded gable with a sun on it, an
 * iron or slate roof, a glazed veranda (сени) on the yard side with its porch. Returns its footprint.
 */
export function folkHouse(b: Bucket, p: Place, r: RNG, m: FolkMats, cols: Collider[], o: HouseOpts): { w: number; d: number } {
  const w = o.w ?? rand(r, 6.4, 7.2), d = o.d ?? rand(r, 7.6, 9), hw = rand(r, 2.7, 3.0), base = 0.6;
  const painted = !o.abandoned && r() < 0.22;
  b.add('concrete', boxGeo(w + 0.3, 1.0, d + 0.3), T(p, 0, base - 0.5, 0), o.abandoned ? '#8a867c' : '#a49e90');
  b.add(painted ? 'boards' : 'logs', boxGeo(w, hw, d, 2), T(p, 0, base + hw / 2, 0), painted ? pick(r, PAINTED) : o.abandoned ? '#8a7e6e' : pick(r, LOGS));
  if (!painted) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('woodEnds', boxGeo(0.34, hw, 0.34, 0.6), T(p, sx * (w / 2 + 0.07), base + hw / 2, sz * (d / 2 + 0.07)), '#b0a084');
  // the frieze under the eaves in the carving's white; a board-clad house has white corner boards too
  if (!o.abandoned) {
    b.add('flat', boxGeo(w + 0.5, 0.22, 0.06), T(p, 0, base + hw - 0.08, d / 2 + 0.12), m.trim);
    if (painted) for (const sx of [-1, 1]) b.add('flat', boxGeo(0.16, hw, 0.16), T(p, sx * (w / 2 + 0.03), base + hw / 2, d / 2 + 0.03), m.trim);
  }
  const rise = w * rand(r, 0.42, 0.52);
  const { roof, gables } = gableRoof(w, d, rise, 0.55);
  const iron = !o.abandoned && r() < 0.6;
  b.add(iron ? 'metalRoof' : 'slate', roof, T(p, 0, base + hw, 0), iron ? pick(r, IRON) : o.abandoned ? '#8e8e86' : pick(r, SLATE));
  b.add('boards', gables, T(p, 0, base + hw, 0), o.abandoned ? '#8a7e6e' : '#b8a888');
  if (!o.abandoned) b.add(m.gable, triangle(w, rise), T(p, 0, base + hw, d / 2 + 0.04));
  // the street windows
  const wy = base + hw * 0.52;
  const win = o.lit ? m.winLit : m.win;
  for (const x of [-w * 0.31, 0, w * 0.31]) {
    if (o.abandoned) {
      b.add('boards', planeGeo(1.1, 1.4), T(p, x, wy, d / 2 + 0.03), '#6e6354');
      for (const a of [0.7, -0.7]) b.add('boards', boxGeo(1.5, 0.14, 0.04), T(p, x, wy, d / 2 + 0.07, 0, 0, a), '#7a6e5c');
    } else b.add(win, planeGeo(1.95, 1.95), T(p, x, wy, d / 2 + 0.05));
  }
  // side windows, away from the veranda
  for (const z of [-d * 0.05, d * 0.28]) {
    if (o.abandoned) b.add('boards', planeGeo(1.0, 1.3), T(p, -o.yard * (w / 2 + 0.03), wy, z, 0, -o.yard * Math.PI / 2), '#6e6354');
    else b.add(win, planeGeo(1.75, 1.75), T(p, -o.yard * (w / 2 + 0.05), wy, z, 0, -o.yard * Math.PI / 2));
  }
  // the chimney, and on most roofs the aerial
  b.add('brickRed', boxGeo(0.55, 1.5, 0.55), T(p, -o.yard * w * 0.16, base + hw + rise * 0.6, -d * 0.1), o.abandoned ? '#8a6a5a' : undefined);
  if (!o.abandoned && (o.aerial ?? r() < 0.7)) {
    const top = base + hw + rise;
    b.add('flat', boxGeo(0.05, 2.8, 0.05), T(p, o.yard * w * 0.12, top + 0.7, d * 0.18), '#4a4a4a');
    for (let i = 0; i < 4; i++) b.add('flat', boxGeo(1.1 - i * 0.18, 0.03, 0.03), T(p, o.yard * w * 0.12, top + 1.2 + i * 0.35, d * 0.18), '#4a4a4a');
  }
  // the veranda on the yard side: boarded below, a band of small panes, a lean-to roof; the porch at its front
  const vw = 2.5, vd = d * 0.55, vz = -d * 0.12, vx = o.yard * (w / 2 + vw / 2);
  b.add('boards', boxGeo(vw, 2.5, vd, 1), T(p, vx, base + 1.05, vz), o.abandoned ? '#7e7464' : '#d8d0b8');
  if (!o.abandoned) {
    for (let k = 0; k < 4; k++) b.add('winWhite', planeGeo(vd / 4 - 0.12, 0.8), T(p, vx + o.yard * (vw / 2 + 0.02), base + 1.6, vz - vd / 2 + (k + 0.5) * (vd / 4), 0, o.yard * Math.PI / 2));
    b.add('flat', boxGeo(0.06, 0.1, vd + 0.1), T(p, vx + o.yard * (vw / 2 + 0.03), base + 2.05, vz), m.base);
  }
  b.add('slate', boxGeo(vw + 0.6, 0.06, vd + 0.6), T(p, vx + o.yard * 0.15, base + 2.45, vz, 0, 0, -o.yard * 0.22), '#a0a098');
  b.add('boards', boxGeo(1.3, 0.55, 1.2), T(p, vx, base - 0.3, vz + vd / 2 + 0.6), '#9a8a70');
  b.add('flat', boxGeo(1.6, 0.06, 1.5), T(p, vx, base + 2.1, vz + vd / 2 + 0.7, 0.2, 0, 0), m.base);
  for (const sx of [-0.7, 0.7]) b.add('flat', boxGeo(0.08, 2.2, 0.08), T(p, vx + sx, base + 1.0, vz + vd / 2 + 1.3), m.trim);
  cols.push(boxCollider(p, 0, 0, w + 0.4, d + 0.4), boxCollider(p, vx, vz + 0.6, vw, vd + 1.4));
  return { w, d };
}

/**
 * Broad Bashkir yard gates (капка) facing local +z: a wicket and two leaves in one painted face,
 * thick posts, and a little iron roof over them all.
 */
export function folkGate(b: Bucket, p: Place, m: FolkMats, cols: Collider[]): void {
  b.add(m.gate, planeGeo(4.6, 2.1), T(p, 0, 1.15, 0.05));
  b.add('boards', boxGeo(4.6, 2.1, 0.08, 1), T(p, 0, 1.15, 0), '#8a7a62');
  for (const x of [-2.42, -1.3, 2.42]) {
    b.add('flat', boxGeo(0.24, 2.9, 0.24), T(p, x, 1.45, 0), m.base);
    b.add('flat', boxGeo(0.3, 0.12, 0.3), T(p, x, 2.92, 0), m.trim);
  }
  b.add('flat', boxGeo(5.2, 0.16, 0.3), T(p, 0, 2.62, 0), m.trim);
  for (const s of [-1, 1]) b.add('metalRoof', boxGeo(5.6, 0.05, 0.62), T(p, 0, 3.08, s * 0.26, s * 0.6, 0, 0), '#4f7a4a');
  b.add('flat', boxGeo(5.6, 0.08, 0.08), T(p, 0, 3.25, 0), m.trim);
  cols.push(boxCollider(p, 0, 0, 5.1, 0.4));
}

/** The bathhouse at the bottom of the garden: a squat log box, a tiny window, a stovepipe. */
export function munca(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  const w = rand(r, 2.8, 3.4), d = rand(r, 3.2, 4), h = 2.1;
  b.add('logs', boxGeo(w, h, d, 1.6), T(p, 0, h / 2 - 0.05, 0), pick(r, ['#8e7e6a', '#7e705e', '#9a8a76']));
  const { roof, gables } = gableRoof(w, d, 0.9, 0.3);
  b.add(r() < 0.5 ? 'slate' : 'boards', roof, T(p, 0, h - 0.05, 0), '#8a8a82');
  b.add('boards', gables, T(p, 0, h - 0.05, 0), '#7a6a56');
  b.add('winWhite', planeGeo(0.45, 0.4), T(p, w / 2 + 0.02, 1.3, -d * 0.2, 0, Math.PI / 2));
  b.add('door', planeGeo(0.8, 1.6), T(p, 0, 0.8, d / 2 + 0.02));
  b.add('rust', new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6), T(p, -w * 0.2, h + 0.9, -d * 0.2));
  b.add('flat', new THREE.ConeGeometry(0.2, 0.18, 6), T(p, -w * 0.2, h + 1.68, -d * 0.2), '#3a3a38');
  b.add('woodEnds', boxGeo(1.6, 0.9, 0.6, 1.3), T(p, -w / 2 - 0.45, 0.45, 0, 0, Math.PI / 2, 0));
  cols.push(boxCollider(p, 0, 0, w, d));
}

/** A row of hives along local x: framed boxes on legs in bright paint, and an old log hive (колода) at the end. */
export function hives(b: Bucket, p: Place, n: number, r: RNG, cols: Collider[]): void {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.2;
    const tint = pick(r, ['#e6c84a', '#6a9ac8', '#f0ece0', '#86b07a', '#d87a4a']);
    for (const lx of [-0.2, 0.2]) b.add('flat', boxGeo(0.06, 0.35, 0.06), T(p, x + lx, 0.17, 0), '#5c5040');
    b.add('boards', boxGeo(0.5, 0.55, 0.46), T(p, x, 0.62, 0), tint);
    b.add('flat', boxGeo(0.62, 0.07, 0.58), T(p, x, 0.93, 0, 0.06, 0, 0), '#8a8a82');
    b.add('flat', boxGeo(0.28, 0.04, 0.02), T(p, x, 0.42, 0.24), '#1a1a18');
  }
  const lx = ((n + 1) / 2) * 1.2;
  b.add('logs', new THREE.CylinderGeometry(0.28, 0.3, 1.2, 8), T(p, lx, 0.6, 0), '#8a7a62');
  b.add('boards', new THREE.ConeGeometry(0.42, 0.3, 4), T(p, lx, 1.35, 0, 0, Math.PI / 4, 0), '#7a6a56');
  cols.push(boxCollider(p, 0.6, 0, n * 1.2 + 1.4, 0.7));
}

/**
 * A shadoof well (журавль), the beam along local z: the log crib at z = 0, the post behind it, the
 * long arm up over the crib with the pole hanging from it, a log counterweight on the short arm.
 */
export function shadoof(b: Bucket, p: Place, cols: Collider[]): void {
  b.add('logs', boxGeo(1.1, 0.85, 1.1, 1), T(p, 0, 0.42, 0), '#8e7e6a');
  b.add('boards', boxGeo(1.2, 0.06, 0.6), T(p, 0, 0.9, -0.25), '#7a6a56');
  const post = -4.0, H = 4.2, th = 0.77, La = 5.6, Ls = 2.6;
  b.add('flat', new THREE.CylinderGeometry(0.13, 0.17, H, 6), T(p, 0, H / 2, post), '#5a4834');
  b.add('flat', boxGeo(0.06, 0.4, 0.06), T(p, 0.1, H + 0.1, post, 0, 0, 0.3), '#5a4834');
  b.add('flat', boxGeo(0.06, 0.4, 0.06), T(p, -0.1, H + 0.1, post, 0, 0, -0.3), '#5a4834');
  const ay = Math.sin(th), az = Math.cos(th), mid = (La - Ls) / 2;
  b.add('flat', new THREE.CylinderGeometry(0.06, 0.09, La + Ls, 5), T(p, 0, H + ay * mid, post + az * mid, Math.PI / 2 - th, 0, 0), '#6a5640');
  const tipY = H + ay * La, tipZ = post + az * La;
  b.add('flat', new THREE.CylinderGeometry(0.025, 0.025, tipY - 1.2, 4), T(p, 0, (tipY + 1.2) / 2, tipZ), '#5a4834');
  b.add('rust', new THREE.CylinderGeometry(0.14, 0.11, 0.3, 7), T(p, 0, 1.05, tipZ), '#7a7a72');
  b.add('logs', boxGeo(0.4, 0.4, 0.9), T(p, 0, H - ay * Ls - 0.1, post - az * Ls), '#7a6a56');
  cols.push({ x: p.x, z: p.z, r: 0.75, hw: 0, hd: 0, rot: 0, box: false });
  const pc = boxCollider(p, 0, post, 0.4, 0.4);
  cols.push({ ...pc, box: false, r: 0.25 });
}

/**
 * The village spring (шишма), facing local +z: a log crib in the bank with a pipe running into a
 * wooden trough, a little gabled roof on four posts over it, wet stones, a bench.
 */
export function spring(b: Bucket, p: Place, m: FolkMats, cols: Collider[]): void {
  b.add('logs', boxGeo(2.4, 1.1, 0.5, 1), T(p, 0, 0.55, -1.0), '#7e705e');
  b.add('rust', new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), T(p, 0, 0.8, -0.55, Math.PI / 2, 0, 0), '#6a6a66');
  b.add('flat', boxGeo(0.06, 0.45, 0.06), T(p, 0, 0.55, -0.24), '#9ab4c0');
  b.add('boards', boxGeo(1.8, 0.4, 0.55), T(p, 0, 0.3, 0.05), '#6a5a46');
  b.add('flat', boxGeo(1.6, 0.04, 0.4), T(p, 0, 0.47, 0.05), '#6a8a98');
  for (const [x, z] of [[-1.2, -1.1], [1.2, -1.1], [-1.2, 1.0], [1.2, 1.0]]) b.add('flat', boxGeo(0.14, 2.4, 0.14), T(p, x, 1.2, z), m.base);
  const { roof, gables } = gableRoof(3.0, 2.6, 0.9, 0.25);
  b.add('metalRoof', roof, T(p, 0, 2.4, 0, 0, Math.PI / 2, 0), '#4f7a4a');
  b.add('boards', gables, T(p, 0, 2.4, 0, 0, Math.PI / 2, 0), m.trim);
  b.add('flat', boxGeo(2.8, 0.2, 0.05), T(p, 0, 2.3, 1.08), m.trim);
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7, d = 0.9 + (i % 3) * 0.35;
    b.add('flat', new THREE.DodecahedronGeometry(0.16 + (i % 2) * 0.08, 0), T(p, Math.cos(a) * d * 1.3, 0.04, 0.6 + Math.sin(a) * d * 0.5), '#6e6e66');
  }
  b.add('planks', boxGeo(1.5, 0.06, 0.36, 1), T(p, 1.9, 0.44, 0.6, 0, 0.2, 0), '#8a7a5e');
  for (const x of [1.35, 2.45]) b.add('flat', boxGeo(0.08, 0.44, 0.3), T(p, x, 0.22, 0.6 + (x - 1.9) * 0.2), '#5c5040');
  cols.push(boxCollider(p, 0, -0.1, 2.6, 2.4));
}

/**
 * The village mosque (мәсжет), its front to local +z: a log prayer hall on a plinth with tall
 * windows, a gabled iron roof, and over the entrance end the minaret rising from the roof itself —
 * a square base on the ridge, an octagonal drum with a gallery, a tented top and the crescent.
 */
export function mosque(b: Bucket, p: Place, m: FolkMats, cols: Collider[]): void {
  const W = 8, D = 11.5, H = 3.6, base = 0.7, roofC = '#3f7a4a';
  b.add('concrete', boxGeo(W + 0.4, 1.1, D + 0.4), T(p, 0, base - 0.55, 0), '#a49e90');
  b.add('logs', boxGeo(W, H, D, 2), T(p, 0, base + H / 2, 0), '#b8a48a');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('woodEnds', boxGeo(0.34, H, 0.34, 0.6), T(p, sx * (W / 2 + 0.07), base + H / 2, sz * (D / 2 + 0.07)), '#b0a084');
  const rise = 2.6;
  const { roof, gables } = gableRoof(W, D, rise, 0.5);
  b.add('metalRoof', roof, T(p, 0, base + H, 0), roofC);
  b.add('boards', gables, T(p, 0, base + H, 0), '#e8e2d2');
  b.add(m.gable, triangle(W, rise), T(p, 0, base + H, D / 2 + 0.04));
  // tall windows down the sides, crowned in white
  for (const z of [-3.6, -1.2, 1.2, 3.6]) for (const sx of [-1, 1]) {
    b.add('winGreen', planeGeo(1.0, 1.9), T(p, sx * (W / 2 + 0.03), base + 1.9, z, 0, sx * Math.PI / 2));
    b.add('flat', boxGeo(0.06, 0.12, 1.3), T(p, sx * (W / 2 + 0.06), base + 2.95, z), m.trim);
  }
  // the entrance: double door, a porch under a little roof
  b.add('flat', boxGeo(1.7, 2.3, 0.06), T(p, 0, base + 1.15, D / 2 + 0.03), '#3f7a4a');
  b.add('flat', boxGeo(0.06, 2.3, 0.08), T(p, 0, base + 1.15, D / 2 + 0.07), m.trim);
  b.add('boards', boxGeo(3.2, 0.5, 1.8), T(p, 0, base - 0.3, D / 2 + 0.9), '#9a8a70');
  b.add('metalRoof', boxGeo(3.4, 0.06, 2.0), T(p, 0, base + 2.7, D / 2 + 1.0, 0.22, 0, 0), roofC);
  for (const x of [-1.4, 1.4]) b.add('flat', boxGeo(0.12, 2.6, 0.12), T(p, x, base + 1.2, D / 2 + 1.85), m.trim);
  // the minaret on the ridge over the entrance end
  const mz = D / 2 - 1.6, ridge = base + H + rise;
  b.add('boards', boxGeo(2.2, 1.9, 2.2), T(p, 0, ridge - 0.4, mz), '#e8e2d2');
  b.add('flat', boxGeo(2.5, 0.14, 2.5), T(p, 0, ridge + 0.55, mz), roofC);
  b.add('boards', new THREE.CylinderGeometry(0.85, 0.95, 2.4, 8), T(p, 0, ridge + 1.8, mz), '#e8e2d2');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.add('flat', planeGeo(0.32, 0.9), T(p, Math.sin(a) * 0.92, ridge + 1.95, mz + Math.cos(a) * 0.92, 0, a, 0), '#2e3a44');
  }
  b.add('flat', new THREE.CylinderGeometry(1.25, 1.25, 0.14, 8), T(p, 0, ridge + 3.05, mz), roofC);
  b.add('flat', new THREE.CylinderGeometry(1.2, 1.2, 0.45, 8, 1, true), T(p, 0, ridge + 3.35, mz), m.trim);
  b.add('boards', new THREE.CylinderGeometry(0.6, 0.68, 1.3, 8), T(p, 0, ridge + 3.8, mz), '#e8e2d2');
  b.add('metalRoof', new THREE.ConeGeometry(0.78, 2.6, 8), T(p, 0, ridge + 5.75, mz), roofC);
  b.add('flat', new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), T(p, 0, ridge + 7.4, mz), '#d8b850');
  b.add('flat', new THREE.SphereGeometry(0.09, 6, 4), T(p, 0, ridge + 7.5, mz), '#d8b850');
  b.add('flat', new THREE.TorusGeometry(0.26, 0.045, 4, 10, Math.PI * 1.5), T(p, 0, ridge + 8.1, mz, 0, 0, Math.PI * 0.5), '#d8b850');
  cols.push(boxCollider(p, 0, 0.6, W + 0.4, D + 1.6));
}

/**
 * The cemetery (зират), centred on p, gate to local +z: a picket fence round it, a gate with an
 * arch and a crescent over it, the graves inside in their own little painted railings, with
 * board markers and posts topped by crescents. Returns spots inside for birches.
 */
export function zirat(b: Bucket, p: Place, r: RNG, cols: Collider[], ground: (x: number, z: number) => number): { x: number; z: number }[] {
  const W = 22, D = 18;
  const at = (lx: number, lz: number, turn = 0): Place => {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
    return { x, y: ground(x, z), z, rot: p.rot + turn };
  };
  const side = (lx: number, lz: number, len: number, turn: number) => {
    const fp = at(lx, lz, turn);
    fence(b, fp, len, r);
    cols.push({ x: fp.x, z: fp.z, r: len / 2 + 0.3, hw: len / 2, hd: 0.15, rot: fp.rot, box: true });
  };
  side(-6.5, D / 2, 9, 0);
  side(6.5, D / 2, 9, 0);
  side(0, -D / 2, W, 0);
  side(-W / 2, 0, D, Math.PI / 2);
  side(W / 2, 0, D, Math.PI / 2);
  // the gate arch
  const g = at(0, D / 2);
  for (const x of [-2, 2]) b.add('flat', boxGeo(0.16, 2.8, 0.16), T(g, x, 1.4, 0), '#5f8fc4');
  b.add('flat', boxGeo(4.4, 0.4, 0.08), T(g, 0, 2.7, 0), '#5f8fc4');
  b.add('flat', new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), T(g, 0, 3.2, 0), '#c8c8c0');
  b.add('flat', new THREE.TorusGeometry(0.22, 0.04, 4, 10, Math.PI * 1.5), T(g, 0, 3.6, 0, 0, 0, Math.PI * 0.5), '#d8d8d0');
  // graves in rows, each in its railing, the markers at the head (west end)
  const free: { x: number; z: number }[] = [];
  for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
    const lx = -8 + k * 3.2 + (r() - 0.5) * 0.6, lz = -5.5 + row * 4.6;
    if (r() < 0.25) { free.push(at(lx, lz)); continue; }
    const gp = at(lx, lz, Math.PI / 2);
    const tint = pick(r, ['#5f8fc4', '#86b07a', '#c8c8c0', '#3a6a5a']);
    for (const s of [-1, 1]) {
      b.add('flat', boxGeo(2.2, 0.06, 0.04), T(gp, 0, 0.6, s * 0.6), tint);
      b.add('flat', boxGeo(0.04, 0.06, 1.2), T(gp, s * 1.1, 0.6, 0), tint);
      for (const x of [-1.1, 0, 1.1]) b.add('flat', boxGeo(0.04, 0.62, 0.04), T(gp, x, 0.31, s * 0.6), tint);
    }
    b.add('flat', boxGeo(1.9, 0.18, 0.9), T(gp, 0, 0.06, 0), '#6a6a4a');
    if (r() < 0.55) {
      b.add('boards', boxGeo(0.22, 1.5, 0.12), T(gp, -0.85, 0.75, 0), '#8a7a62');
      b.add('flat', new THREE.TorusGeometry(0.12, 0.025, 4, 8, Math.PI * 1.5), T(gp, -0.85, 1.65, 0, 0, Math.PI / 2, Math.PI * 0.5), '#c8c8c0');
    } else {
      b.add('boards', boxGeo(0.12, 1.1, 0.5), T(gp, -0.85, 0.55, 0), '#8a7a62');
      b.add('boards', new THREE.ConeGeometry(0.3, 0.3, 4), T(gp, -0.85, 1.22, 0, 0, Math.PI / 4, 0), '#7a6a56');
    }
  }
  cols.push(boxCollider(p, 0, 0, W, D));
  return free;
}

/** A goose on the grass, white or grey, its neck up, facing local +z. */
export function goose(b: Bucket, p: Place, grey: boolean, peck = false): void {
  const c = grey ? '#8a8a84' : '#f2f0e6';
  b.add('flat', new THREE.SphereGeometry(0.2, 6, 4), T(p, 0, 0.3, 0, 0, 0, 0, 0.95, 0.8, 1.5), c);
  b.add('flat', new THREE.CylinderGeometry(0.035, 0.05, 0.32, 5), T(p, 0, peck ? 0.3 : 0.5, peck ? 0.32 : 0.2, peck ? 1.3 : 0.25, 0, 0), c);
  b.add('flat', new THREE.SphereGeometry(0.06, 5, 4), T(p, 0, peck ? 0.18 : 0.66, peck ? 0.45 : 0.25), c);
  b.add('flat', boxGeo(0.04, 0.035, 0.09), T(p, 0, peck ? 0.13 : 0.65, peck ? 0.51 : 0.33), '#e08a2a');
  for (const x of [-0.06, 0.06]) b.add('flat', boxGeo(0.025, 0.16, 0.025), T(p, x, 0.08, 0), '#e08a2a');
}

/** A starling house on a tall pole. */
export function birdhouse(b: Bucket, p: Place): void {
  b.add('flat', new THREE.CylinderGeometry(0.04, 0.07, 6.5, 5), T(p, 0, 3.25, 0, 0.03, 0, 0), '#6a5a48');
  b.add('boards', boxGeo(0.26, 0.38, 0.26), T(p, 0, 6.6, 0.1), '#8a7a62');
  b.add('slate', boxGeo(0.36, 0.04, 0.36), T(p, 0, 6.82, 0.1, 0.2, 0, 0), '#7a7a72');
  b.add('flat', new THREE.CircleGeometry(0.05, 6), T(p, 0, 6.65, 0.235), '#1a1a18');
}

/** A livestock barn with a hay loft: plank walls, a pitched slate roof, hay showing in the open gable. */
export function barn(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  const w = rand(r, 4.4, 5.6), d = rand(r, 5.5, 7), h = 2.4;
  b.add('boards', boxGeo(w, h, d, 2), T(p, 0, h / 2 - 0.05, 0), pick(r, ['#8a7e6a', '#7a6e5c', '#968a74']));
  const { roof, gables } = gableRoof(w, d, 1.5, 0.35);
  b.add('slate', roof, T(p, 0, h - 0.05, 0), '#9a9a92');
  b.add('boards', gables, T(p, 0, h - 0.05, 0), '#7a6e5c');
  b.add('hay', triangle(w * 0.6, 0.9), T(p, 0, h + 0.05, d / 2 + 0.03), '#e8dcc0');
  b.add('door', planeGeo(1.4, 1.9), T(p, w * 0.15, 0.95, d / 2 + 0.02));
  cols.push(boxCollider(p, 0, 0, w, d));
}
