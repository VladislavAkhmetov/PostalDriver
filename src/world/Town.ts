import * as THREE from 'three';
import { Bucket, boxGeo, gableRoof, planeGeo } from '../core/geom';
import { pick, rand, RNG } from '../core/math';
import { boxCollider, Collider, Place, T } from './Props';

/**
 * Klyuchevsk and the villages in 1997, the small things of a district town and its courtyards:
 * balconies with washing out, benches by the entrances, a playground of painted pipe, a carpet
 * rack, the domino table, bins, a commercial kiosk, the payphone, a notice board, the dovecote on
 * the garages, a silver-painted Lenin, the war memorial, the House of Culture, the kvass barrel;
 * in the villages the milk-can stand by the road, hens, a stool with potatoes for sale.
 * Everything here is static and goes into the merged world geometry.
 */

/** A point in a Place's own frame (local +z as it faces), on the ground. */
export function localAt(p: Place, lx: number, lz: number, ground: (x: number, z: number) => number, turn = 0): Place {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
  return { x, y: ground(x, z), z, rot: p.rot + turn };
}

const PASTEL = ['#9fb6c8', '#a8c094', '#d6c48e', '#c8a090', '#b8b4ac', '#86a0b8'];
const WASH = ['#f0ece4', '#e8d8a8', '#9ab8d8', '#d88a7a', '#8ab08a', '#e8e4f0', '#c84a3a', '#4a6a9a'];

/** Things hung out to dry along a line from x0 to x1 (local x) at height y, local z = z. */
function washing(b: Bucket, p: Place, x0: number, x1: number, y: number, z: number, r: RNG): void {
  b.add('flat', boxGeo(x1 - x0, 0.015, 0.015), T(p, (x0 + x1) / 2, y, z), '#3a3a38');
  for (let x = x0 + 0.3; x < x1 - 0.3; x += rand(r, 0.45, 0.8)) {
    const w = rand(r, 0.28, 0.6), h = rand(r, 0.35, 0.8);
    b.add('flat', boxGeo(w, h, 0.02), T(p, x + w / 2, y - h / 2, z + rand(r, -0.02, 0.02)), pick(r, WASH));
  }
}

/**
 * 3D balconies over the painted ones on a five-storey panel block's street face (khrushchyovka:
 * 60 × 15 m, the face at local z = 6): some glazed in by their owners, some open with the washing
 * out, some with skis and boxes; and the aerials on the roof.
 */
export function panelLife(b: Bucket, p: Place, r: RNG): void {
  for (const c of [1, 5, 9, 13]) for (const f of [1, 2, 3]) {
    const x = ((c * 16 + 8) / 256) * 60 - 30;
    const y = 14.8 - (17 + 24 * f) * (15 / 128);
    const k = r();
    b.add('concrete', boxGeo(3.1, 0.16, 1.15), T(p, x, y - 0.08, 6.58), '#b8b4aa');
    if (k < 0.4) {
      // glazed in: a painted sheet below, white frames and glass above, a little roof
      const tint = pick(r, ['#e4e0d4', '#c8d0d8', '#d8ccb0']);
      b.add('boards', boxGeo(3.1, 0.9, 0.05), T(p, x, y + 0.45, 7.13), tint);
      b.add('flat', boxGeo(3.0, 1.15, 0.04), T(p, x, y + 1.5, 7.12), '#3a4652');
      for (const bx of [-1.5, -0.75, 0, 0.75, 1.5]) b.add('flat', boxGeo(0.06, 1.2, 0.06), T(p, x + bx, y + 1.5, 7.15), '#efece4');
      b.add('flat', boxGeo(3.1, 0.06, 0.06), T(p, x, y + 0.92, 7.15), '#efece4');
      for (const sx of [-1, 1]) b.add('boards', boxGeo(0.05, 2.1, 1.1), T(p, x + sx * 1.53, y + 1.0, 6.58), tint);
      b.add('metalRoof', boxGeo(3.3, 0.04, 1.3), T(p, x, y + 2.25, 6.62, 0.12, 0, 0), '#8a8a86');
    } else {
      // open: a painted sheet-iron front
      const tint = pick(r, PASTEL);
      b.add('boards', boxGeo(3.1, 0.95, 0.04), T(p, x, y + 0.5, 7.13), tint);
      for (const sx of [-1, 1]) b.add('boards', boxGeo(0.04, 0.95, 1.1), T(p, x + sx * 1.53, y + 0.5, 6.58), tint);
      if (k < 0.75) washing(b, p, x - 1.4, x + 1.4, y + 1.75, 6.9, r);
      else {
        b.add('flat', boxGeo(0.06, 1.8, 0.04), T(p, x - 1.2, y + 0.9, 6.3, 0, 0, 0.12), '#c8452e');
        b.add('flat', boxGeo(0.06, 1.8, 0.04), T(p, x - 1.05, y + 0.9, 6.3, 0, 0, 0.12), '#2a4a8a');
        b.add('boards', boxGeo(0.6, 0.45, 0.45), T(p, x + 0.8, y + 1.15, 6.6), '#a08a68');
      }
    }
  }
  // the aerials, every flat its own
  for (let i = 0; i < 9; i++) {
    const ax = rand(r, -28, 28), az = rand(r, -4, 4);
    b.add('flat', boxGeo(0.05, rand(r, 1.8, 3.2), 0.05), T(p, ax, 16.2, az), '#4a4a4a');
    for (let k = 0; k < 3; k++) b.add('flat', boxGeo(1.2 - k * 0.25, 0.03, 0.03), T(p, ax, 16.6 + k * 0.35, az, 0, rand(r, 0, 3), 0), '#4a4a4a');
  }
}

/** A bench by an entrance: concrete feet, a slatted seat and back, facing local +z. Seat at 0.45 m. */
export function porchBench(b: Bucket, p: Place, cols: Collider[]): void {
  for (const x of [-0.75, 0.75]) b.add('concrete', boxGeo(0.14, 0.45, 0.5), T(p, x, 0.22, 0), '#a8a49c');
  for (const z of [-0.12, 0.04, 0.2]) b.add('planks', boxGeo(1.9, 0.05, 0.12, 1), T(p, 0, 0.46, z), '#7a8a5a');
  for (const y of [0.68, 0.86]) b.add('planks', boxGeo(1.9, 0.11, 0.04, 1), T(p, 0, y, -0.27, -0.18, 0, 0), '#7a8a5a');
  cols.push(boxCollider(p, 0, 0, 1.9, 0.6));
}

/** The carpet rack: two posts and a bar, a carpet hung over it to be beaten. */
export function carpetRack(b: Bucket, p: Place, carpet: string, cols: Collider[]): void {
  for (const x of [-1.6, 1.6]) b.add('flat', new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), T(p, x, 1.1, 0), '#5a6a5a');
  b.add('flat', new THREE.CylinderGeometry(0.035, 0.035, 3.3, 5), T(p, 0, 2.15, 0, 0, 0, Math.PI / 2), '#5a6a5a');
  for (const s of [-1, 1]) b.add(carpet, planeGeo(2.4, 1.5), T(p, 0, 1.4, s * 0.03, 0, s > 0 ? 0 : Math.PI, 0));
  cols.push(boxCollider(p, 0, 0, 3.4, 0.2));
}

/** T-posts and lines across the yard, sheets out. */
export function clothesLines(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  for (const x of [-3.5, 3.5]) {
    b.add('flat', new THREE.CylinderGeometry(0.05, 0.05, 2.1, 5), T(p, x, 1.05, 0), '#6a6a62');
    b.add('flat', boxGeo(0.06, 0.06, 1.4), T(p, x, 2.05, 0), '#6a6a62');
    cols.push({ ...boxCollider(p, x, 0, 0.2, 0.2), box: false, r: 0.15 });
  }
  for (const z of [-0.6, 0, 0.6]) {
    b.add('flat', boxGeo(7, 0.015, 0.015), T(p, 0, 2.02, z), '#3a3a38');
    for (let x = -3.1; x < 2.8; x += rand(r, 0.9, 1.6)) {
      const w = rand(r, 0.7, 1.4), h = rand(r, 0.6, 1.1);
      if (x + w > 3.2) break;
      b.add('flat', boxGeo(w, h, 0.02), T(p, x + w / 2, 2.0 - h / 2, z), r() < 0.6 ? '#f2efe8' : pick(r, WASH));
    }
  }
}

/** The courtyard playground: swings on an A-frame of pipe, a sandpit with its toadstool, a slide, a climbing bar. Faded paint. */
export function playground(b: Bucket, p: Place, ground: (x: number, z: number) => number, cols: Collider[]): void {
  const at = (lx: number, lz: number) => localAt(p, lx, lz, ground);
  // swings
  const sw = at(-6, 0);
  for (const x of [-1.3, 1.3]) for (const z of [-0.5, 0.5]) b.add('flat', new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), T(sw, x, 1.25, z * 0.8, z * 0.38, 0, 0), '#b8443a');
  b.add('flat', new THREE.CylinderGeometry(0.045, 0.045, 2.7, 5), T(sw, 0, 2.45, 0, 0, 0, Math.PI / 2), '#b8443a');
  for (const x of [-0.25, 0.25]) b.add('flat', boxGeo(0.02, 1.9, 0.02), T(sw, x, 1.45, 0), '#5a5a58');
  b.add('planks', boxGeo(0.6, 0.05, 0.25), T(sw, 0, 0.5, 0), '#c8a040');
  cols.push(boxCollider(sw, 0, 0, 2.8, 1.2));
  // sandpit and the toadstool over it
  const sp = at(0, 0.5);
  for (const [x, z, w, d] of [[0, -1.5, 3.2, 0.12], [0, 1.5, 3.2, 0.12], [-1.5, 0, 0.12, 3.2], [1.5, 0, 0.12, 3.2]] as number[][]) b.add('planks', boxGeo(w, 0.3, d), T(sp, x, 0.15, z), '#8aa0b8');
  b.add('flat', boxGeo(2.9, 0.06, 2.9), T(sp, 0, 0.18, 0), '#cbb88c');
  b.add('flat', new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), T(sp, 0.9, 1.1, 0.9), '#e8e4d8');
  b.add('flat', new THREE.ConeGeometry(1.2, 0.7, 10), T(sp, 0.9, 2.45, 0.9), '#c83a2e');
  cols.push({ ...boxCollider(sp, 0.9, 0.9, 0.3, 0.3), box: false, r: 0.15 });
  // slide
  const sl = at(6, 0);
  b.add('flat', boxGeo(0.7, 0.06, 3.4), T(sl, 0, 0.8, 0.6, -0.5, 0, 0), '#c8c4b8');
  for (const x of [-0.37, 0.37]) b.add('flat', boxGeo(0.04, 0.12, 3.4), T(sl, x, 0.9, 0.6, -0.5, 0, 0), '#3a7aa8');
  for (const x of [-0.37, 0.37]) b.add('flat', new THREE.CylinderGeometry(0.035, 0.035, 1.6, 5), T(sl, x, 0.8, -1.0), '#3a7aa8');
  for (let y = 0.3; y < 1.6; y += 0.3) b.add('flat', boxGeo(0.74, 0.03, 0.03), T(sl, 0, y, -1.05), '#3a7aa8');
  b.add('flat', boxGeo(0.8, 0.05, 0.6), T(sl, 0, 1.55, -0.8), '#c8c4b8');
  cols.push(boxCollider(sl, 0, 0, 0.9, 3.6));
  // climbing bar
  const cb = at(11, 0.5);
  for (const x of [-1, 1]) b.add('flat', new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), T(cb, x, 1.15, 0), '#d8b040');
  b.add('flat', new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5), T(cb, 0, 2.2, 0, 0, 0, Math.PI / 2), '#8a8a86');
  cols.push(boxCollider(cb, 0, 0, 2.2, 0.2));
}

/** The domino table under the trees, with a bench along each side (seats at local z = ±0.75, facing the table). */
export function dominoTable(b: Bucket, p: Place, cols: Collider[]): void {
  for (const x of [-0.6, 0.6]) b.add('flat', boxGeo(0.1, 0.75, 0.1), T(p, x, 0.37, 0), '#5a4a38');
  b.add('planks', boxGeo(1.6, 0.05, 0.85, 1), T(p, 0, 0.77, 0), '#8a7a5e');
  for (const z of [-0.85, 0.85]) {
    for (const x of [-0.7, 0.7]) b.add('flat', boxGeo(0.08, 0.44, 0.08), T(p, x, 0.22, z), '#5a4a38');
    b.add('planks', boxGeo(1.8, 0.05, 0.3, 1), T(p, 0, 0.46, z), '#8a7a5e');
  }
  for (let i = 0; i < 9; i++) b.add('flat', boxGeo(0.05, 0.015, 0.1), T(p, -0.4 + (i % 5) * 0.12, 0.8, -0.15 + Math.floor(i / 5) * 0.28, 0, (i % 3) * 0.6, 0), '#f2f0e8');
  cols.push(boxCollider(p, 0, 0, 1.9, 2.0));
}

/** Green iron bins by the yard's driveway, lids askew, a bag or two beside. */
export function bins(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  for (const x of [-1.15, 0, 1.15]) {
    b.add('rust', boxGeo(1.0, 0.95, 0.9), T(p, x, 0.48, 0), pick(r, ['#5a7a5a', '#4a6a52', '#6a7a62']));
    b.add('flat', boxGeo(1.05, 0.05, 0.95), T(p, x, 1.0, 0, rand(r, -0.3, 0), 0, rand(r, -0.1, 0.1)), '#3a4a3a');
  }
  for (let i = 0; i < 3; i++) b.add('flat', new THREE.DodecahedronGeometry(0.25, 0), T(p, rand(r, -1.6, 1.6), 0.18, rand(r, 0.6, 0.9)), pick(r, ['#2a2a2a', '#e8e4d8', '#3a4a6a']));
  cols.push(boxCollider(p, 0, 0, 3.4, 1.0));
}

/** A commercial kiosk (комок): a sheet-iron box, a painted sign, a grated window crammed with goods. */
export function kiosk(b: Bucket, p: Place, sign: string, goods: string, tint: string, cols: Collider[]): void {
  b.add('rust', boxGeo(2.8, 2.4, 2.2), T(p, 0, 1.2, 0), tint);
  b.add('flat', boxGeo(3.0, 0.08, 2.4), T(p, 0, 2.44, 0), '#5a5a58');
  b.add(sign, planeGeo(2.8, 0.5), T(p, 0, 2.15, 1.11));
  b.add(goods, planeGeo(2.2, 1.0), T(p, 0, 1.35, 1.11));
  for (let x = -1.05; x <= 1.06; x += 0.21) b.add('flat', boxGeo(0.02, 1.0, 0.02), T(p, x, 1.35, 1.13), '#2a2a2a');
  b.add('flat', boxGeo(0.35, 0.25, 0.04), T(p, 0, 0.95, 1.13), '#1a1a18');
  b.add('flat', boxGeo(2.6, 0.05, 0.35), T(p, 0, 0.82, 1.25), '#6a6a66');
  cols.push(boxCollider(p, 0, 0, 2.8, 2.2));
}

/** The payphone: a hood on a post, the grey box inside. */
export function payphone(b: Bucket, p: Place, cols: Collider[]): void {
  b.add('flat', boxGeo(0.12, 1.8, 0.12), T(p, 0, 0.9, -0.25), '#6a6a66');
  b.add('rust', boxGeo(0.8, 0.9, 0.55), T(p, 0, 1.75, 0), '#3a6a9a');
  b.add('flat', boxGeo(0.7, 0.8, 0.02), T(p, 0, 1.72, 0.27), '#1e2a36');
  b.add('flat', boxGeo(0.28, 0.4, 0.12), T(p, 0, 1.7, 0.1), '#8a8a86');
  b.add('flat', boxGeo(0.06, 0.2, 0.06), T(p, -0.08, 1.65, 0.18), '#1a1a18');
  cols.push({ x: p.x, z: p.z, r: 0.35, hw: 0, hd: 0, rot: 0, box: false });
}

/** A notice board on two posts, papered over. */
export function noticeBoard(b: Bucket, p: Place, key: string, cols: Collider[]): void {
  for (const x of [-0.85, 0.85]) b.add('flat', boxGeo(0.08, 2.0, 0.08), T(p, x, 1.0, 0), '#5a4a38');
  b.add('boards', boxGeo(1.8, 1.1, 0.05), T(p, 0, 1.45, 0), '#6a5a48');
  b.add(key, planeGeo(1.7, 1.0), T(p, 0, 1.45, 0.03));
  cols.push(boxCollider(p, 0, 0, 1.8, 0.2));
}

/**
 * The dovecote (голубятня) on a garage roof, local +z to the street: a boarded loft with its
 * front of wire mesh, a landing board, a pitched roof, and the keeper's pole with a rag on it.
 * `roof` is the garage roof's height. Returns the loft's centre (the flock circles over it).
 */
export function dovecote(b: Bucket, p: Place, roof: number, cols: Collider[]): THREE.Vector3 {
  const y = roof + 0.05;
  b.add('boards', boxGeo(2.4, 1.9, 2.0, 1), T(p, 0, y + 0.95, 0), '#8aa0a8');
  b.add('flat', boxGeo(1.8, 1.2, 0.03), T(p, 0, y + 1.05, 1.01), '#1e2226');
  for (let x = -0.85; x <= 0.86; x += 0.17) b.add('flat', boxGeo(0.015, 1.2, 0.015), T(p, x, y + 1.05, 1.03), '#9a9a96');
  for (let k = 0; k < 6; k++) b.add('flat', boxGeo(1.8, 0.015, 0.015), T(p, 0, y + 0.5 + k * 0.22, 1.03), '#9a9a96');
  b.add('planks', boxGeo(2.0, 0.05, 0.6), T(p, 0, y + 0.42, 1.3), '#8a7a5e');
  const { roof: rf, gables } = gableRoof(2.4, 2.0, 0.8, 0.25);
  b.add('metalRoof', rf, T(p, 0, y + 1.9, 0, 0, Math.PI / 2, 0), '#5a7a6a');
  b.add('boards', gables, T(p, 0, y + 1.9, 0, 0, Math.PI / 2, 0), '#8aa0a8');
  b.add('flat', new THREE.CylinderGeometry(0.025, 0.035, 5, 4), T(p, 1.6, y + 2.5, 0.4, 0, 0, -0.12), '#6a5a48');
  b.add('flat', boxGeo(0.5, 0.35, 0.02), T(p, 1.95, y + 4.8, 0.4, 0, 0, -0.12), '#c8452e');
  // a ladder up the garage's side
  for (const z of [-0.25, 0.25]) b.add('flat', boxGeo(0.05, roof + 0.4, 0.05), T(p, 1.45, (roof + 0.4) / 2, 1.6 + z), '#6a5a48');
  for (let k = 0.4; k < roof; k += 0.4) b.add('flat', boxGeo(0.04, 0.04, 0.5), T(p, 1.45, k, 1.6), '#6a5a48');
  cols.push({ ...boxCollider(p, 1.45, 1.6, 0.3, 0.6), box: false, r: 0.3 });
  return new THREE.Vector3(p.x, p.y + y + 1, p.z);
}

/** Pigeons sitting about on a roof edge, local x from x0 to x1 at height y. */
export function perchedPigeons(b: Bucket, p: Place, x0: number, x1: number, y: number, z: number, r: RNG): void {
  for (let x = x0; x < x1; x += rand(r, 0.35, 1.2)) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    const pp: Place = { x: p.x + x * c + z * s, y: p.y, z: p.z - x * s + z * c, rot: p.rot + rand(r, -1.5, 1.5) };
    const tint = r() < 0.75 ? '#7a7e86' : r() < 0.5 ? '#e8e6e0' : '#5a4a42';
    b.add('flat', new THREE.SphereGeometry(0.09, 5, 3), T(pp, 0, y + 0.1, 0, 0, 0, 0, 1, 0.9, 1.6), tint);
    b.add('flat', new THREE.SphereGeometry(0.055, 5, 3), T(pp, 0, y + 0.2, 0.11), tint);
  }
}

/** Lenin on his plinth before the House of Culture, painted silver as they were, an arm out toward the bright future (and the road). */
export function lenin(b: Bucket, p: Place, cols: Collider[]): void {
  const SILVER = '#b4b6b2';
  b.add('concrete', boxGeo(2.6, 0.3, 2.6), T(p, 0, 0.15, 0), '#9a968c');
  b.add('concrete', boxGeo(1.5, 2.2, 1.5), T(p, 0, 1.4, 0), '#8a8680');
  b.add('flat', boxGeo(0.9, 0.4, 0.03), T(p, 0, 1.8, 0.76), '#c8a850');
  const y = 2.5;
  // the coat flaring to the hem, the legs mid-stride beneath it
  b.add('flat', new THREE.CylinderGeometry(0.36, 0.55, 1.5, 7), T(p, 0, y + 1.1, 0), SILVER);
  b.add('flat', boxGeo(0.22, 0.7, 0.26), T(p, -0.16, y + 0.35, 0.12), SILVER);
  b.add('flat', boxGeo(0.22, 0.7, 0.26), T(p, 0.16, y + 0.35, -0.12), SILVER);
  b.add('flat', boxGeo(0.86, 0.55, 0.46), T(p, 0, y + 2.05, 0), SILVER);
  b.add('flat', new THREE.SphereGeometry(0.2, 7, 5), T(p, 0, y + 2.55, 0.02), SILVER);
  b.add('flat', new THREE.CylinderGeometry(0.17, 0.2, 0.12, 7), T(p, 0, y + 2.72, 0.02), SILVER);
  // the right arm out and up, the left in the coat
  b.add('flat', boxGeo(0.16, 0.16, 0.85), T(p, 0.4, y + 2.25, 0.42, -0.35, 0, 0), SILVER);
  b.add('flat', boxGeo(0.16, 0.6, 0.18), T(p, -0.45, y + 1.85, 0.05, 0, 0, 0.08), SILVER);
  cols.push(boxCollider(p, 0, 0, 2.6, 2.6));
}

/**
 * The war memorial: a stepped base, a tapering obelisk with the red star on top, a plaque with the
 * names, a low railing round it and the paint on the kerbs fresh from the 9th of May.
 */
export function obelisk(b: Bucket, p: Place, cols: Collider[]): void {
  b.add('concrete', boxGeo(4.4, 0.25, 4.4), T(p, 0, 0.12, 0), '#a8a49a');
  b.add('concrete', boxGeo(2.6, 0.5, 2.6), T(p, 0, 0.5, 0), '#b8b4aa');
  b.add('concrete', new THREE.CylinderGeometry(0.35, 0.75, 6.5, 4), T(p, 0, 4.0, 0, 0, Math.PI / 4, 0), '#d8d4c8');
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? 0.2 : 0.5;
    if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.12, bevelEnabled: false });
  sg.translate(0, 0, -0.06);
  b.add('flat', sg, T(p, 0, 7.75, 0), '#c42a20');
  b.add('flat', sg, T(p, 0, 7.75, 0, 0, Math.PI / 2, 0), '#c42a20');
  b.add('flat', boxGeo(1.1, 0.7, 0.04), T(p, 0, 1.4, 0.52, -0.08, 0, 0), '#3a3a36');
  for (let k = 0; k < 6; k++) b.add('flat', boxGeo(0.8, 0.025, 0.01), T(p, 0, 1.6 - k * 0.09, 0.56, -0.08, 0, 0), '#c8b060');
  for (const [x, z, w, d] of [[0, 2.6, 5.2, 0.05], [0, -2.6, 5.2, 0.05], [2.6, 0, 0.05, 5.2], [-2.6, 0, 0.05, 5.2]] as number[][]) {
    b.add('flat', boxGeo(w, 0.05, d), T(p, x, 0.75, z), '#2a2a2a');
    if (z !== 2.6) for (let t = -2.6; t <= 2.6; t += 1.3) b.add('flat', boxGeo(0.06, 0.75, 0.06), T(p, w > 1 ? t : x, 0.37, w > 1 ? z : t), '#2a2a2a');
  }
  // flowers at the foot: the wreath, carnations
  b.add('flat', new THREE.TorusGeometry(0.4, 0.1, 5, 10), T(p, 0, 0.82, 1.4, -1.2, 0, 0), '#3a6a3a');
  for (let k = 0; k < 5; k++) b.add('flat', boxGeo(0.07, 0.07, 0.07), T(p, -0.3 + k * 0.15, 0.95, 1.35), '#d8242a');
  cols.push(boxCollider(p, 0, 0, 2.8, 2.8));
}

/**
 * The House of Culture (ДК), local +z to the square: two storeys of yellow plaster, a portico of
 * four columns under a pediment, broad steps, the name over the door and the posters beside it.
 */
export function houseOfCulture(b: Bucket, p: Place, name: string, poster: string, cols: Collider[]): void {
  const W = 24, D = 14, H = 8.4, Y = '#e0cc90';
  b.add('plaster', boxGeo(W, H, D, 2), T(p, 0, H / 2 - 0.2, 0), Y);
  b.add('flat', boxGeo(W + 0.6, 0.45, D + 0.6), T(p, 0, H, 0), '#e8e2d2');
  for (const fy of [1.9, 5.4]) for (const fx of [-10, -7.4, -4.8, 4.8, 7.4, 10]) {
    b.add('bigWin', planeGeo(1.6, 2.1), T(p, fx, fy, D / 2 + 0.03));
    b.add('flat', boxGeo(1.9, 0.12, 0.1), T(p, fx, fy + 1.2, D / 2 + 0.06), '#f0ece0');
  }
  // the portico
  const pz = D / 2 + 2.3;
  b.add('concrete', boxGeo(9.6, 0.45, 4.6), T(p, 0, 0.0, pz - 0.2), '#b8b4aa');
  for (let k = 0; k < 3; k++) b.add('concrete', boxGeo(9.6, 0.18, 0.5), T(p, 0, -0.1 - k * 0.15, pz + 2.3 + k * 0.45), '#aaa69c');
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    b.add('plaster', new THREE.CylinderGeometry(0.32, 0.36, 6.0, 10), T(p, x, 3.2, pz + 1.6), '#f2eee2');
    b.add('plaster', boxGeo(0.85, 0.25, 0.85), T(p, x, 6.3, pz + 1.6), '#f2eee2');
  }
  b.add('plaster', boxGeo(9.8, 0.7, 4.8), T(p, 0, 6.7, pz - 0.1), '#f2eee2');
  const { roof, gables } = gableRoof(4.8, 9.8, 1.6, 0.15);
  b.add('metalRoof', roof, T(p, 0, 7.05, pz - 0.1, 0, Math.PI / 2, 0), '#6a7a72');
  b.add('plaster', gables, T(p, 0, 7.05, pz - 0.1, 0, Math.PI / 2, 0), '#f2eee2');
  b.add(name, planeGeo(6.4, 0.8), T(p, 0, 6.7, pz + 2.32));
  b.add('door', planeGeo(2.2, 2.6), T(p, 0, 1.5, D / 2 + 0.04));
  // the posters on a stand by the steps
  for (const x of [-5.6, 5.6]) {
    b.add('flat', boxGeo(1.6, 2.2, 0.08), T(p, x, 1.3, pz + 2.0), '#5a5a58');
    b.add(poster, planeGeo(1.4, 2.0), T(p, x, 1.3, pz + 2.05));
    cols.push(boxCollider(p, x, pz + 2.0, 1.6, 0.2));
  }
  cols.push(boxCollider(p, 0, 0, W, D), boxCollider(p, 0, pz, 9.6, 4.6));
}

/** The village milk-can stand by the road: a plank platform at lorry-bed height, the cans waiting for the tanker. */
export function milkStand(b: Bucket, p: Place, r: RNG, cols: Collider[]): void {
  for (const [x, z] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) b.add('flat', boxGeo(0.12, 1.0, 0.12), T(p, x, 0.5, z), '#5a4a38');
  b.add('planks', boxGeo(2.1, 0.08, 1.5, 1), T(p, 0, 1.02, 0), '#8a7a5e');
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = -0.65 + i * 0.45;
    b.add('flat', new THREE.CylinderGeometry(0.17, 0.2, 0.55, 8), T(p, x, 1.34, rand(r, -0.2, 0.2)), '#b8bcc0');
    b.add('flat', new THREE.CylinderGeometry(0.1, 0.16, 0.14, 8), T(p, x, 1.68, 0), '#a8acb0');
  }
  cols.push(boxCollider(p, 0, 0, 2.1, 1.5));
}

/** A hen about the gate, brown or white or speckled, pecking now and then. */
export function hen(b: Bucket, p: Place, r: RNG): void {
  const c = pick(r, ['#8a5a32', '#f0ece2', '#6a4a32', '#b8885a', '#3a3230']);
  const peck = r() < 0.4;
  b.add('flat', new THREE.SphereGeometry(0.15, 5, 4), T(p, 0, 0.22, 0, 0, 0, 0, 0.85, 0.9, 1.25), c);
  b.add('flat', new THREE.SphereGeometry(0.07, 5, 3), T(p, 0, peck ? 0.14 : 0.36, peck ? 0.24 : 0.15), c);
  b.add('flat', boxGeo(0.03, 0.05, 0.04), T(p, 0, peck ? 0.18 : 0.42, peck ? 0.26 : 0.17), '#c8241c');
  b.add('flat', boxGeo(0.05, 0.1, 0.12), T(p, 0, 0.3, -0.18, -0.6, 0, 0), c);
}

/** A stool and a box by the road: a bucket of radishes, jars, a cardboard sign — what the garden gave, for sale to whoever passes. */
export function roadsideSale(b: Bucket, p: Place, sign: string, r: RNG, cols: Collider[]): void {
  b.add('boards', boxGeo(0.9, 0.6, 0.55), T(p, 0, 0.3, 0.6), '#9a7a52');
  b.add('rust', new THREE.CylinderGeometry(0.17, 0.14, 0.3, 8), T(p, -0.2, 0.75, 0.6), '#7a8a96');
  for (let k = 0; k < 6; k++) b.add('flat', new THREE.SphereGeometry(0.05, 4, 3), T(p, -0.2 + rand(r, -0.1, 0.1), 0.92, 0.6 + rand(r, -0.1, 0.1)), '#c43a48');
  for (const x of [0.12, 0.3]) {
    b.add('flat', new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), T(p, x, 0.69, 0.6), x < 0.2 ? '#8a3a2a' : '#6a7a2a');
    b.add('flat', new THREE.CylinderGeometry(0.065, 0.065, 0.03, 6), T(p, x, 0.79, 0.6), '#c8b048');
  }
  b.add(sign, planeGeo(0.8, 0.4), T(p, 0, 0.32, 0.88, -0.25, 0, 0));
  // the seller's stool, behind the box (seat at 0.45, facing the road)
  b.add('planks', boxGeo(0.4, 0.05, 0.4), T(p, 0, 0.44, 0), '#7a6a52');
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) b.add('flat', boxGeo(0.04, 0.42, 0.04), T(p, x, 0.21, z), '#5a4a38');
  cols.push(boxCollider(p, 0, 0.35, 1.0, 1.2));
}

/**
 * The yellow kvass barrel on its two wheels with the seller's table and mugs, summer only (its own
 * group, World shows it by the season): merged into one mesh and the painted name, two draw calls.
 */
export function kvassBarrel(sign: THREE.Texture): THREE.Group {
  const kb = new Bucket();
  const P: Place = { x: 0, y: 0, z: 0, rot: 0 };
  kb.add('flat', new THREE.CylinderGeometry(0.62, 0.62, 2.6, 12), T(P, 0, 1.15, 0, 0, 0, Math.PI / 2), '#e0b830');
  kb.add('flat', boxGeo(2.4, 0.1, 0.9), T(P, 0, 0.5, 0), '#3a3a38');
  kb.add('flat', boxGeo(1.6, 0.08, 0.08), T(P, -1.9, 0.45, 0), '#3a3a38');
  for (const z of [-0.55, 0.55]) kb.add('flat', new THREE.CylinderGeometry(0.35, 0.35, 0.18, 10), T(P, 0, 0.35, z, Math.PI / 2, 0, 0), '#1e1e1e');
  kb.add('flat', boxGeo(0.1, 0.5, 0.1), T(P, -2.6, 0.25, 0), '#3a3a38');
  kb.add('flat', boxGeo(0.8, 0.05, 0.5), T(P, 0.4, 0.8, 1.15), '#d8d4c8');
  kb.add('flat', boxGeo(0.06, 0.8, 0.06), T(P, 0.4, 0.4, 1.15), '#6a6a66');
  for (let k = 0; k < 3; k++) kb.add('flat', new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6), T(P, 0.2 + k * 0.15, 0.89, 1.15), '#d8c890');
  kb.add('sign', planeGeo(1.4, 0.45), T(P, 0, 1.2, 0.63));
  return kb.build({ flat: new THREE.MeshLambertMaterial({ vertexColors: true }), sign: new THREE.MeshLambertMaterial({ map: sign }) }, 'kvass');
}
