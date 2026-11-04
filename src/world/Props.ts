import * as THREE from 'three';
import { Bucket, boxGeo, gableRoof, mat, planeGeo } from '../core/geom';
import { pick, rand, RNG } from '../core/math';

export interface Place { x: number; y: number; z: number; rot: number }

export interface Collider {
  x: number; z: number; r: number; hw: number; hd: number; rot: number; box: boolean;
  /** Yielding things (bushes, haystacks, people): little bounce, little damage. */
  soft?: boolean;
  /** Mass of a movable obstacle in kg; the van shoves it instead of being stopped dead. */
  mass?: number;
  /** A movable obstacle is told it was hit: unit normal pointing away from the van, impulse (N·s), closing speed (m/s). */
  hit?: (nx: number, nz: number, impulse: number, speed: number) => void;
}

export function T(p: Place, lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return mat(p.x, p.y, p.z, 0, p.rot, 0).multiply(mat(lx, ly, lz, rx, ry, rz, sx, sy, sz));
}

/** Oriented box collider in world space for a local box centred at (lx, lz). */
export function boxCollider(p: Place, lx: number, lz: number, w: number, d: number): Collider {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c, r: Math.hypot(w, d) / 2, hw: w / 2, hd: d / 2, rot: p.rot, box: true };
}

const LOG_TINTS = ['#c4b49c', '#a89a86', '#d6c6aa', '#9a8a76', '#b8a48a'];
const PAINT_TINTS = ['#7d9cc0', '#86a878', '#d0bc8e', '#c9c3b2', '#9fb6c8'];
const GABLE_TINTS = ['#c8b07a', '#6d8db0', '#9a4a32', '#e0dccf', '#6f9a6a', '#d8c070'];
const ROOF_TINTS = ['#b8b8b0', '#a9aaa2', '#c8c8c0'];
const METAL_TINTS = ['#6f8a5a', '#9a4a36', '#7a8a96', '#5c7a6a'];
const TRIM_TINTS = ['#f2efe6', '#e8e4d8', '#7aa0c8', '#e0d48a', '#9cc0a0'];
const SHUTTER_TINTS = ['#4f7fae', '#5f8f62', '#c9b25a', '#7a4a3a', '#e6e2d6'];

export function izba(b: Bucket, p: Place, r: RNG, lit: boolean, cols: Collider[]): void {
  const w = rand(r, 5.6, 7), d = rand(r, 6.6, 8.6), hw = rand(r, 2.6, 3.0);
  const kind = r();
  const painted = kind < 0.3, brick = kind > 0.86;
  const wallKey = brick ? 'brickWhite' : painted ? 'boards' : 'logs';
  const wallTint = brick ? '#e4ded0' : painted ? pick(r, PAINT_TINTS) : pick(r, LOG_TINTS);
  const base = 0.55;
  b.add('concrete', boxGeo(w + 0.25, 0.9, d + 0.25), T(p, 0, base - 0.45, 0), '#a8a49a');
  b.add(wallKey, boxGeo(w, hw, d, 2), T(p, 0, base + hw / 2, 0), wallTint);
  // log-cabin corners: the crossed log ends stick out past the walls
  if (!painted && !brick) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('woodEnds', boxGeo(0.32, hw, 0.32, 0.6), T(p, sx * (w / 2 + 0.06), base + hw / 2, sz * (d / 2 + 0.06)), '#b8a688');
  }
  const rise = w * rand(r, 0.38, 0.5);
  const { roof, gables } = gableRoof(w, d, rise, 0.5);
  const metal = r() < 0.4;
  b.add(metal ? 'metalRoof' : 'slate', roof, T(p, 0, base + hw, 0), metal ? pick(r, METAL_TINTS) : pick(r, ROOF_TINTS));
  b.add('boards', gables, T(p, 0, base + hw, 0), pick(r, GABLE_TINTS));
  const win = pick(r, ['winBlue', 'winWhite', 'winGreen']) + (lit ? 'Lit' : '');
  const wy = base + hw * 0.55;
  const trim = pick(r, TRIM_TINTS), shutter = pick(r, SHUTTER_TINTS);
  const shutters = !brick && r() < 0.65;
  // street facade: three windows in carved surrounds (nalichniki) with a peaked crown
  for (const x of [-w * 0.3, 0, w * 0.3]) {
    b.add('flat', planeGeo(1.25, 1.72), T(p, x, wy, d / 2 + 0.02), trim);
    b.add('flat', boxGeo(1.5, 0.12, 0.08), T(p, x, wy + 0.92, d / 2 + 0.05), trim);
    b.add('flat', boxGeo(0.95, 0.07, 0.07), T(p, x - 0.36, wy + 1.06, d / 2 + 0.05, 0, 0, 0.42), trim);
    b.add('flat', boxGeo(0.95, 0.07, 0.07), T(p, x + 0.36, wy + 1.06, d / 2 + 0.05, 0, 0, -0.42), trim);
    b.add('flat', boxGeo(1.4, 0.1, 0.16), T(p, x, wy - 0.84, d / 2 + 0.08), trim);
    b.add(win, planeGeo(0.95, 1.42), T(p, x, wy, d / 2 + 0.03));
    if (shutters) for (const sx of [-1, 1]) b.add('flat', boxGeo(0.46, 1.4, 0.04), T(p, x + sx * 0.74, wy, d / 2 + 0.04), shutter);
  }
  for (const side of [-1, 1]) for (const z of [-d * 0.22, d * 0.22]) {
    b.add('flat', planeGeo(1.2, 1.66), T(p, side * (w / 2 + 0.02), wy, z, 0, side * Math.PI / 2), trim);
    b.add(win, planeGeo(0.95, 1.42), T(p, side * (w / 2 + 0.03), wy, z, 0, side * Math.PI / 2));
  }
  b.add('winWhite', planeGeo(0.55, 0.8), T(p, 0, base + hw + rise * 0.33, d / 2 + 0.03));
  b.add('brickRed', boxGeo(0.55, 1.6, 0.55), T(p, w * 0.17, base + hw + rise * 0.55, -d * 0.12));
  if (r() < 0.6) {
    const ax = -w * 0.18, top = base + hw + rise;
    b.add('flat', boxGeo(0.05, 2.6, 0.05), T(p, ax, top + 0.6, d * 0.2), '#4a4a4a');
    for (let i = 0; i < 4; i++) b.add('flat', boxGeo(1.1 - i * 0.18, 0.03, 0.03), T(p, ax, top + 1.1 + i * 0.35, d * 0.2), '#4a4a4a');
  }
  // porch
  b.add('boards', boxGeo(1.5, 0.6, 1.8), T(p, w / 2 + 0.75, base - 0.05, -d * 0.18), '#9a8a70');
  b.add('slate', boxGeo(1.8, 0.06, 2.1), T(p, w / 2 + 0.8, base + 2.2, -d * 0.18, 0, 0, -0.25), '#a9aaa2');
  cols.push(boxCollider(p, 0, 0, w + 0.4, d + 0.4));
}

/** Solid board fence (glukhoy zabor) — the usual street side of a Russian yard. */
export function boardFence(b: Bucket, p: Place, len: number, r: RNG): void {
  const tint = pick(r, ['#8a7a62', '#9a8a6c', '#6f8a5a', '#7d9cc0', '#a89070']);
  b.add('boards', boxGeo(len, 1.75, 0.06, 1), T(p, 0, 0.88, 0), tint);
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 2.5) b.add('flat', boxGeo(0.12, 1.95, 0.12), T(p, x, 0.95, 0.06), '#4c4236');
}

/** Tall plank yard gates with a wicket and a little gable over the posts. */
export function yardGate(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  const tint = pick(r, ['#8a7a62', '#5f7f9e', '#6f8a5a', '#9a5a42']);
  b.add('boards', boxGeo(3.2, 1.95, 0.08, 1), T(p, 0, 1.05, 0), tint);
  b.add('boards', boxGeo(1.0, 1.85, 0.08, 1), T(p, 2.25, 1.0, 0), tint);
  for (const x of [-1.7, 1.65, 2.85]) b.add('flat', boxGeo(0.2, 2.6, 0.2), T(p, x, 1.3, 0), '#4c4236');
  b.add('boards', boxGeo(4.9, 0.12, 0.6), T(p, 0.55, 2.66, 0), '#6a5a48');
  cols.push(boxCollider(p, 0.55, 0, 4.9, 0.4));
}

export function shed(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  const w = rand(r, 2.6, 4), d = rand(r, 2.8, 4.5), h = rand(r, 2, 2.6);
  b.add('boards', boxGeo(w, h, d, 2), T(p, 0, h / 2 - 0.1, 0), pick(r, ['#9a8e7a', '#7f7464', '#a89880']));
  b.add('slate', boxGeo(w + 0.5, 0.06, d + 0.5), T(p, 0, h + 0.1, 0, 0.18, 0, 0), '#a0a098');
  cols.push(boxCollider(p, 0, 0, w, d));
}

export function woodpile(b: Bucket, p: Place): void {
  b.add('woodEnds', boxGeo(2.6, 1.3, 0.8, 1.3), T(p, 0, 0.6, 0));
  b.add('slate', boxGeo(2.9, 0.05, 1.1), T(p, 0, 1.35, 0, 0.12, 0, 0), '#9a9a92');
}

export function fence(b: Bucket, p: Place, len: number, r: RNG): void {
  const tint = pick(r, ['#c8c2b2', '#a8a090', '#86a878', '#7d9cc0', '#d8d0bc']);
  b.add('picket', planeGeo(len, 1.3, 0, 0, len / 1.6, 1), T(p, 0, 0.6, 0), tint);
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 2.4) b.add('flat', boxGeo(0.1, 1.5, 0.1), T(p, x, 0.65, 0.05), '#5c5040');
}

export function well(b: Bucket, p: Place, cols: Collider[]): void {
  b.add('logs', boxGeo(1.1, 0.9, 1.1, 1), T(p, 0, 0.45, 0), '#9a8a76');
  for (const x of [-0.5, 0.5]) b.add('flat', boxGeo(0.08, 1.8, 0.08), T(p, x, 1.3, 0), '#5c5040');
  const { roof } = gableRoof(1.2, 1.2, 0.5, 0.15, 1);
  b.add('boards', roof, T(p, 0, 2.1, 0, 0, Math.PI / 2, 0), '#8a7a62');
  cols.push({ x: p.x, z: p.z, r: 0.8, hw: 0, hd: 0, rot: 0, box: false });
}

export function bench(b: Bucket, p: Place): void {
  b.add('planks', boxGeo(1.8, 0.06, 0.4, 1), T(p, 0, 0.45, 0), '#a89878');
  for (const x of [-0.7, 0.7]) b.add('flat', boxGeo(0.08, 0.45, 0.35), T(p, x, 0.22, 0), '#5c5040');
}

export function haystack(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  const h = rand(r, 3.4, 4.6), rad = rand(r, 1.8, 2.4);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(rad * Math.sin((1 - t) * Math.PI * 0.55 + 0.25) * (1 - t * 0.15), t * h)); }
  pts.push(new THREE.Vector2(0.01, h));
  const g = new THREE.LatheGeometry(pts, 8);
  b.add('hay', g, T(p, 0, -0.1, 0), pick(r, ['#ffffff', '#e8e0d0', '#d8ccb8']));
  b.add('flat', boxGeo(0.06, 1.4, 0.06), T(p, 0, h + 0.4, 0, 0.1, 0, 0.05), '#4a3a2a');
  cols.push({ x: p.x, z: p.z, r: rad * 0.9, hw: 0, hd: 0, rot: 0, box: false });
}

export function khrushchyovka(b: Bucket, p: Place, cols: Collider[]): void {
  const L = 60, H = 15, D = 12;
  b.add('concrete', boxGeo(L, H, D, 4), T(p, 0, H / 2 - 0.2, 0), '#d8d4ca');
  b.add('facadeLit', planeGeo(L, H), T(p, 0, H / 2 - 0.2, D / 2 + 0.02));
  b.add('facadeLit', planeGeo(L, H), T(p, 0, H / 2 - 0.2, -D / 2 - 0.02, 0, Math.PI, 0));
  b.add('flat', boxGeo(L + 0.4, 0.4, D + 0.4), T(p, 0, H, 0), '#5a5a58');
  for (const x of [-22, -7, 8, 23]) {
    b.add('door', planeGeo(1.4, 2.2), T(p, x, 1.0, D / 2 + 0.05));
    b.add('concrete', boxGeo(2.4, 0.15, 1.4), T(p, x, 2.5, D / 2 + 0.7), '#bcb8ae');
  }
  cols.push(boxCollider(p, 0, 0, L, D));
}

export function postOffice(b: Bucket, p: Place, cols: Collider[]): void {
  const W = 16, H = 7.4, D = 10;
  b.add('brickWhite', boxGeo(W, H, D, 2), T(p, 0, H / 2 - 0.2, 0));
  b.add('flat', boxGeo(W + 0.5, 0.35, D + 0.5), T(p, 0, H - 0.05, 0), '#6a6a66');
  b.add('pochta', planeGeo(8, 1), T(p, 0, 3.15, D / 2 + 0.04));
  b.add('door', planeGeo(1.6, 2.3), T(p, 0, 1.25, D / 2 + 0.04));
  b.add('concrete', boxGeo(3.4, 0.35, 1.6), T(p, 0, 0.0, D / 2 + 0.8), '#a8a49c');
  b.add('concrete', boxGeo(3.6, 0.12, 1.8), T(p, 0, 2.7, D / 2 + 0.9), '#bcb8ae');
  for (const x of [-6, -3.4, 3.4, 6]) {
    b.add('bigWinLit', planeGeo(1.7, 1.7), T(p, x, 1.9, D / 2 + 0.04));
  }
  for (const x of [-6, -3.4, 0, 3.4, 6]) b.add('bigWin', planeGeo(1.7, 1.7), T(p, x, 5.2, D / 2 + 0.04));
  cols.push(boxCollider(p, 0, 0, W, D));
}

export function shop(b: Bucket, p: Place, cols: Collider[]): void {
  const W = 10, H = 3.6, D = 8;
  b.add('plaster', boxGeo(W, H, D, 2), T(p, 0, H / 2 - 0.2, 0), '#e8e0cc');
  const { roof, gables } = gableRoof(D, W, 1.4, 0.4);
  b.add('metalRoof', roof, T(p, 0, H - 0.2, 0, 0, Math.PI / 2, 0), '#8a3a2c');
  b.add('plaster', gables, T(p, 0, H - 0.2, 0, 0, Math.PI / 2, 0), '#e8e0cc');
  b.add('shop', planeGeo(4.6, 1.1), T(p, 0, 2.8, D / 2 + 0.04));
  b.add('door', planeGeo(1.3, 2.2), T(p, -2.6, 1.0, D / 2 + 0.04));
  b.add('bigWinLit', planeGeo(1.8, 1.4), T(p, 0.6, 1.4, D / 2 + 0.04));
  b.add('bigWinLit', planeGeo(1.8, 1.4), T(p, 3.2, 1.4, D / 2 + 0.04));
  b.add('concrete', boxGeo(3, 0.3, 1.4), T(p, -2.6, -0.05, D / 2 + 0.7), '#a8a49c');
  cols.push(boxCollider(p, 0, 0, W, D));
}

export function busStop(b: Bucket, p: Place, cols: Collider[]): void {
  b.add('concrete', boxGeo(4.2, 2.5, 0.22), T(p, 0, 1.25, -0.9), '#c8c4b8');
  b.add('mosaic', planeGeo(3.8, 1.7), T(p, 0, 1.45, -0.78));
  for (const x of [-2.0, 2.0]) b.add('concrete', boxGeo(0.2, 2.5, 1.8), T(p, x, 1.25, 0), '#c8c4b8');
  b.add('concrete', boxGeo(4.8, 0.22, 2.3), T(p, 0, 2.6, 0.05), '#b8b4aa');
  b.add('planks', boxGeo(3.2, 0.06, 0.4, 1), T(p, 0, 0.45, -0.55), '#8a7a5e');
  cols.push(boxCollider(p, 0, -0.5, 4.4, 1.2));
}

/** A row of n brick garages along local x, doors to +z; returns each one's wall height (its roof sits on it). */
export function garages(b: Bucket, p: Place, n: number, r: RNG, cols: Collider[]): number[] {
  const hs: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 3.4;
    const h = 2.5 + r() * 0.3;
    hs.push(h);
    b.add(r() < 0.5 ? 'brickRed' : 'brickWhite', boxGeo(3.3, h, 6, 2), T(p, x, h / 2 - 0.1, 0));
    b.add('garage', planeGeo(2.6, 2.1), T(p, x, 1.0, 3.02), pick(r, ['#ffffff', '#c8d0e0', '#e0c8b8', '#b8d0b0']));
    b.add('rust', boxGeo(3.4, 0.1, 6.4), T(p, x, h - 0.05, 0, 0.05, 0, 0));
  }
  cols.push(boxCollider(p, 0, 0, n * 3.4, 6));
  return hs;
}

export function waterTower(b: Bucket, p: Place, cols: Collider[]): void {
  b.add('rust', new THREE.CylinderGeometry(0.9, 1.1, 16, 8, 1, true), T(p, 0, 8, 0));
  b.add('rust', new THREE.CylinderGeometry(2.3, 2.3, 4, 10), T(p, 0, 18, 0));
  b.add('rust', new THREE.ConeGeometry(2.5, 1.3, 10), T(p, 0, 20.6, 0), '#b0a090');
  for (let y = 1; y < 16; y += 0.5) b.add('flat', boxGeo(0.5, 0.03, 0.03), T(p, 0, y, 1.15), '#3a3a3a');
  cols.push({ x: p.x, z: p.z, r: 1.3, hw: 0, hd: 0, rot: 0, box: false });
}

export function church(b: Bucket, p: Place, cols: Collider[]): void {
  b.add('plaster', boxGeo(9, 8, 13, 2), T(p, 0, 3.8, 0), '#ece6d8');
  b.add('flat', boxGeo(2.2, 3, 0.1), T(p, 0, 1.4, 6.52), '#2a2622');
  for (const z of [-3.5, 0.5, 4]) for (const s of [-1, 1]) b.add('flat', boxGeo(0.1, 2, 1.1), T(p, s * 4.52, 4.6, z), '#2a2622');
  b.add('plaster', boxGeo(4.4, 7, 4.4, 2), T(p, 0, 10.8, 4.2), '#ece6d8');
  b.add('plaster', new THREE.CylinderGeometry(1.8, 1.8, 3, 8), T(p, 0, 15.5, 4.2), '#e6e0d2');
  b.add('metalRoof', new THREE.SphereGeometry(1.95, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), T(p, 0, 17, 4.2, 0, 0, 0, 1, 1.4, 1), '#4f7a5a');
  b.add('flat', boxGeo(0.12, 2.4, 0.12), T(p, 0, 20.8, 4.2), '#b89a4a');
  b.add('flat', boxGeo(1.1, 0.12, 0.12), T(p, 0, 21.3, 4.2), '#b89a4a');
  b.add('plaster', new THREE.CylinderGeometry(3.2, 3.2, 3, 8), T(p, 0, 9.2, -2), '#e0dacb');
  b.add('metalRoof', new THREE.SphereGeometry(3.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), T(p, 0, 10.6, -2, 0, 0, 0, 1, 0.9, 1), '#5a6a5a');
  cols.push(boxCollider(p, 0, 0, 9, 13));
}

export function farm(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  const L = 44, D = 11, H = 3.6;
  b.add('brickWhite', boxGeo(L, H, D, 2), T(p, 0, H / 2 - 0.2, 0), '#c8c2b4');
  for (let x = -L / 2 + 3; x < L / 2 - 2; x += 4) b.add('flat', boxGeo(1.4, 0.8, 0.1), T(p, x, 2.4, D / 2 + 0.03), '#262422');
  for (let x = -L / 2; x < L / 2; x += 4) {
    if (r() < 0.3) continue;
    for (const s of [-1, 1]) b.add('slate', boxGeo(4, 0.05, D / 2 + 0.7), T(p, x + 2, H + 0.8, s * (D / 4 + 0.2), s * -0.3, 0, 0), '#9a9a90');
  }
  cols.push(boxCollider(p, 0, 0, L, D));
}

export function pole(b: Bucket, p: Place, r: RNG, concrete: boolean): { top: THREE.Vector3[] } {
  const lean = (r() - 0.5) * 0.06;
  const H = concrete ? 8.4 : 8;
  if (concrete) b.add('concrete', boxGeo(0.22, H, 0.22, 2), T(p, 0, H / 2, 0, lean, 0, 0), '#bdbab0');
  else b.add('flat', new THREE.CylinderGeometry(0.1, 0.14, H, 6), T(p, 0, H / 2, 0, lean, 0, 0), '#5a4834');
  b.add('flat', boxGeo(1.7, 0.1, 0.1), T(p, 0, H - 0.4, lean * H * 0.95, 0, 0, 0), concrete ? '#7a7a76' : '#5a4834');
  const tops: THREE.Vector3[] = [];
  for (const x of [-0.7, 0.7]) {
    b.add('flat', boxGeo(0.08, 0.16, 0.08), T(p, x, H - 0.25, lean * H * 0.95), '#e8e8e0');
    tops.push(new THREE.Vector3().setFromMatrixPosition(T(p, x, H - 0.17, lean * H * 0.95)));
  }
  return { top: tops };
}

export function streetLamp(b: Bucket, p: Place): void {
  b.add('concrete', boxGeo(0.22, 8, 0.22, 2), T(p, 0, 4, 0), '#bdbab0');
  b.add('flat', boxGeo(0.08, 0.08, 1.8), T(p, 0, 7.8, 0.9, -0.15, 0, 0), '#6a6a66');
  b.add('lamp', boxGeo(0.3, 0.14, 0.6), T(p, 0, 7.7, 1.75));
}

export function signPost(b: Bucket, p: Place, key: string, w: number, h: number, height: number, posts: number): void {
  const xs = posts === 2 ? [-w * 0.35, w * 0.35] : [0];
  for (const x of xs) b.add('flat', boxGeo(0.07, height + h / 2, 0.07), T(p, x, (height + h / 2) / 2, -0.04), '#8a8a86');
  b.add(key, planeGeo(w, h), T(p, 0, height, 0));
  b.add('flat', planeGeo(w, h), T(p, 0, height, -0.02, 0, Math.PI, 0), '#8f8f8a');
}

// ---------------- dynamic characters ----------------

function lambert(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export function makeCow(r: RNG): THREE.Group {
  const g = new THREE.Group();
  const base = pick(r, ['#6a4a32', '#8a6040', '#2e2a28', '#c8b8a0']);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1.7), lambert(base));
  body.position.y = 1.05;
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.4, 0.6), lambert('#ece6da'));
  patch.position.set(0, 1.12, rand(r, -0.4, 0.4));
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.55), lambert(base));
  head.position.set(0, 1.25, 1.05);
  head.rotation.x = 0.5;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.14), lambert('#c89a8a'));
  muzzle.position.set(0, 1.07, 1.3);
  g.add(body, patch, head, muzzle);
  for (const [x, z] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), lambert(base));
    l.position.set(x, 0.35, z);
    g.add(l);
  }
  const horn = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), lambert('#e0d8c0'));
  horn.position.set(0, 1.45, 0.95);
  g.add(horn);
  return g;
}
