import * as THREE from 'three';
import { drawPlate, plateFor, plateKindFor } from './Plates';
import { headlights } from './Headlights';
import type { VehicleModel } from './Vehicles';
import vazObj from '../assets/soviet/vaz.obj?raw';
import bobikObj from '../assets/soviet/bobik.obj?raw';
import busObj from '../assets/soviet/bus.obj?raw';
import ambObj from '../assets/soviet/ambulance.obj?raw';
import t2101g from '../assets/soviet/vaz2101_albedo_grey.png?url';
import t2101y from '../assets/soviet/vaz2101_albedo_yellow.png?url';
import t2105g from '../assets/soviet/vaz2105_albedo_green.png?url';
import t2105b from '../assets/soviet/vaz2105_albedo_baklaj.png?url';
import t2106b from '../assets/soviet/vaz2106_albedo_blue.png?url';
import t2106r from '../assets/soviet/vaz2106_albedo_red.png?url';
import tBobik from '../assets/soviet/bobik_albedo.png?url';
import tBobikY from '../assets/soviet/bobik_yellow_albedo.png?url';
import tBusY from '../assets/soviet/bus_yellow_albedo.png?url';
import tBusR from '../assets/soviet/bus_red_albedo.png?url';
import tAmb from '../assets/soviet/buhanka_skoraya_albedo.png?url';

/**
 * Pixel-art Soviet traffic on MadMedicSoft's CC0 models (src/assets/soviet/CREDITS.md):
 * VAZ "Zhiguli" 2101/2105/2106, the UAZ-469 "Bobik", the LiAZ-677 bus and an
 * ambulance "bukhanka". Each model is one mesh with a 128×64 (bus 256²) atlas,
 * so the paint variant is just a texture. Local forward is +Z, wheels on y = 0.
 */
export type SovietKind = 'vaz2101' | 'vaz2105' | 'vaz2106' | 'bobik' | 'liaz' | 'ambulance';
type SpecKey = SovietKind;
export const isSovietKind = (k: string): k is SovietKind => k in SPEC;

interface Spec {
  obj: string;
  /** Target length in metres; the rest follows the model's proportions. */
  length: number;
  /** +1 when the model's nose points to +Z, -1 when to -Z. */
  front: 1 | -1;
  textures: Record<string, string>;
  /** Lamp heights as a fraction of the body height. */
  lampY: number;
}
const SPEC: Record<SpecKey, Spec> = {
  vaz2101: { obj: vazObj, length: 4.07, front: 1, textures: { yellow: t2101y, grey: t2101g }, lampY: 0.4 },
  vaz2105: { obj: vazObj, length: 4.13, front: 1, textures: { green: t2105g, baklaj: t2105b }, lampY: 0.4 },
  vaz2106: { obj: vazObj, length: 4.17, front: 1, textures: { blue: t2106b, red: t2106r }, lampY: 0.4 },
  bobik: { obj: bobikObj, length: 4.03, front: 1, textures: { khaki: tBobik, yellow: tBobikY }, lampY: 0.38 },
  liaz: { obj: busObj, length: 10.6, front: 1, textures: { yellow: tBusY, red: tBusR }, lampY: 0.2 },
  ambulance: { obj: ambObj, length: 4.4, front: 1, textures: { skoraya: tAmb }, lampY: 0.3 },
};

// ---------------- OBJ parsing and wheel splitting ----------------

interface Wheel { cx: number; cy: number; cz: number; radius: number; width: number }
interface Template { body: THREE.BufferGeometry; wheels: Wheel[]; box: THREE.Box3 }

/**
 * Minimal OBJ reader (triangles/quads, v + vt). The models are one welded mesh whose
 * wheels are separate little half-buried prisms: find them as small, low, off-centre
 * islands of faces, group them per axle and side, drop them from the body and
 * remember where each wheel sits, so full round tyres can be put there and spin.
 */
function parseTemplate(text: string): Template {
  const v: number[][] = [], vt: number[][] = [];
  const faces: { v: number[]; t: number[] }[] = [];
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
    else if (p[0] === 'f') {
      const ids = p.slice(1).map((q) => q.split('/').map((n) => (n ? parseInt(n, 10) - 1 : -1)));
      for (let i = 1; i + 1 < ids.length; i++) faces.push({ v: [ids[0][0], ids[i][0], ids[i + 1][0]], t: [ids[0][1], ids[i][1], ids[i + 1][1]] });
    }
  }
  const box = new THREE.Box3();
  for (const q of v) box.expandByPoint(new THREE.Vector3(q[0], q[1], q[2]));
  // islands of faces joined by shared vertices
  const par = v.map((_, i) => i);
  const find = (a: number): number => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (const f of faces) { par[find(f.v[1])] = find(f.v[0]); par[find(f.v[2])] = find(f.v[0]); }
  const islands = new Map<number, number[]>();
  faces.forEach((f, i) => { const k = find(f.v[0]); (islands.get(k) ?? islands.set(k, []).get(k)!).push(i); });
  const H = box.max.y - box.min.y, L = box.max.z - box.min.z, hw = (box.max.x - box.min.x) / 2;
  const parts: { faces: number[]; cx: number; cy: number; cz: number }[] = [];
  const wheelFaces = new Set<number>();
  for (const idx of islands.values()) {
    if (idx.length > 8) continue;
    const b = new THREE.Box3();
    for (const i of idx) for (const j of faces[i].v) b.expandByPoint(new THREE.Vector3(v[j][0], v[j][1], v[j][2]));
    const c = b.getCenter(new THREE.Vector3());
    if (b.max.y - box.min.y > 0.55 * H || b.max.z - b.min.z > 0.25 * L || Math.abs(c.x) < 0.35 * hw) continue;
    parts.push({ faces: idx, cx: c.x, cy: c.y, cz: c.z });
  }
  // group the islands into wheels: same side of the car, same axle position
  const groups: { side: number; z: number; faces: number[]; bb: THREE.Box3 }[] = [];
  for (const p of parts) {
    const side = Math.sign(p.cx);
    let g = groups.find((q) => q.side === side && Math.abs(q.z - p.cz) < 0.07 * L);
    if (!g) { g = { side, z: p.cz, faces: [], bb: new THREE.Box3() }; groups.push(g); }
    g.faces.push(...p.faces);
  }
  const make = (idx: number[]): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [];
    for (const i of idx) {
      faces[i].v.forEach((j, k) => {
        pos.push(v[j][0], v[j][1], v[j][2]);
        const t = faces[i].t[k];
        uv.push(t >= 0 ? vt[t][0] : 0, t >= 0 ? vt[t][1] : 0);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const wheels: Wheel[] = [];
  for (const g of groups) {
    const b = new THREE.Box3();
    for (const i of g.faces) { wheelFaces.add(i); for (const j of faces[i].v) b.expandByPoint(new THREE.Vector3(v[j][0], v[j][1], v[j][2])); }
    // only the lower part of each tyre is modelled: the axle is one radius above its lowest point
    const radius = (b.max.z - b.min.z) / 2;
    wheels.push({ cx: (b.min.x + b.max.x) / 2, cy: b.min.y + radius, cz: (b.min.z + b.max.z) / 2, radius, width: b.max.x - b.min.x });
  }
  const bodyIdx = faces.map((_, i) => i).filter((i) => !wheelFaces.has(i));
  return { body: make(bodyIdx), wheels, box };
}

const TYRE = new THREE.MeshLambertMaterial({ color: '#1b1b1a' });
const HUB = new THREE.MeshLambertMaterial({ color: '#58585a' });
const wheelGeos = new Map<string, THREE.BufferGeometry>();
const wheelGeo = (r: number, w: number) => {
  const key = `${r.toFixed(2)}:${w.toFixed(2)}`;
  let g = wheelGeos.get(key);
  if (!g) { g = new THREE.CylinderGeometry(r, r, w, 10, 1).rotateZ(Math.PI / 2); wheelGeos.set(key, g); }
  return g;
};

const templates = new Map<string, Template>();
const maps = new Map<string, THREE.Texture>();
const MATS = new Map<string, THREE.MeshLambertMaterial>();
let loading: Promise<void> | null = null;

export function loadSoviet(): Promise<void> {
  return (loading ??= (async () => {
    const tl = new THREE.TextureLoader();
    const urls = new Set<string>();
    for (const s of Object.values(SPEC)) for (const u of Object.values(s.textures)) urls.add(u);
    await Promise.all([...urls].map(async (u) => {
      const t = await tl.loadAsync(u);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      maps.set(u, t);
    }));
    for (const s of Object.values(SPEC)) if (!templates.has(s.obj)) templates.set(s.obj, parseTemplate(s.obj));
  })());
}

const mat = (url: string) => {
  let m = MATS.get(url);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: maps.get(url) }); MATS.set(url, m); }
  return m;
};

export function buildSoviet(kind: SovietKind, variant: string): VehicleModel {
  return assemble(kind, kind, variant);
}

let plateSeq = 0;
const plateMats = new Map<number, THREE.MeshLambertMaterial>();
/** A plate material from a small pool. */
function plateMat(n: number): THREE.MeshLambertMaterial {
  const k = n < 0 ? -1 : n % 10;
  let m = plateMats.get(k);
  if (!m) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 28;
    const seed = k * 53 + 17;
    drawPlate(c.getContext('2d')!, plateFor(seed, k < 0 ? 'militia' : plateKindFor(seed, true)), 128, 28);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    m = new THREE.MeshLambertMaterial({ map: t });
    plateMats.set(k, m);
  }
  return m;
}

function assemble(key: SpecKey, kind: VehicleModel['kind'], variant: string): VehicleModel & { height: number } {
  const spec = SPEC[key];
  const tpl = templates.get(spec.obj);
  if (!tpl) throw new Error('loadSoviet() must finish before building these cars');
  const url = spec.textures[variant] ?? Object.values(spec.textures)[0];
  const material = mat(url);
  const size = tpl.box.getSize(new THREE.Vector3()), c = tpl.box.getCenter(new THREE.Vector3());
  const k = spec.length / size.z;
  // normalise: wheels on y = 0, centred, scaled to the real length
  const root = new THREE.Group();
  root.position.set(-c.x, -tpl.box.min.y, -c.z);
  root.add(new THREE.Mesh(tpl.body, material));
  const axles: VehicleModel['axles'] = [];
  for (const w of tpl.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(w.cx, w.cy, w.cz);
    pivot.add(new THREE.Mesh(wheelGeo(w.radius, Math.max(w.width, 2)), [TYRE, HUB, HUB]));
    root.add(pivot);
    axles.push({ pivot, r: w.radius * k });
  }
  const inner = new THREE.Group();
  inner.add(root);
  inner.scale.setScalar(k);
  if (spec.front < 0) inner.rotation.y = Math.PI;
  const group = new THREE.Group();
  group.add(inner);
  const w = size.x * k, h = size.y * k, L = spec.length;
  const tail = new THREE.MeshLambertMaterial({ color: '#a01810', emissive: '#ff2a18', emissiveIntensity: 0 });
  // brake lights: two small glowing lenses over the painted tail lamps
  for (const s of [1, -1]) {
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.1, h * 0.06), tail);
    lens.position.set(s * w * 0.4, h * spec.lampY, -L / 2 - 0.012);
    lens.rotation.y = Math.PI;
    group.add(lens);
  }
  // number plates front and back, under the lamps: a 1997 mix of Soviet and new plates
  const pm = plateMat(plateSeq++);
  for (const back of [false, true]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.11), pm);
    p.position.set(0, Math.max(0.28, h * spec.lampY - 0.1), back ? -L / 2 - 0.016 : L / 2 + 0.016);
    if (back) p.rotation.y = Math.PI;
    group.add(p);
  }
  const lights = headlights(group,
    [new THREE.Vector3(w * 0.36, h * spec.lampY, L / 2 - 0.05), new THREE.Vector3(-w * 0.36, h * spec.lampY, L / 2 - 0.05)],
    [new THREE.Vector3(w * 0.4, h * spec.lampY, -L / 2 + 0.05), new THREE.Vector3(-w * 0.4, h * spec.lampY, -L / 2 + 0.05)]);
  group.userData.color = variant;
  return { group, kind, axles, tail, beacons: [], length: L, width: w, rear: new THREE.Vector3(0, 0, -L * 0.32), lights, height: h };
}
