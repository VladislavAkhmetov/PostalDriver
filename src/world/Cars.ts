import * as THREE from 'three';
import { drawPlate, plateFor } from './Plates';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeCanvas, toTex } from '../core/textures';
import type { VehicleModel } from './Vehicles';
import { headlights } from './Headlights';
import sedanUrl from '../assets/cars/sedan.glb?url';
import compactUrl from '../assets/cars/compact.glb?url';
import suvUrl from '../assets/cars/suv.glb?url';
import taxiUrl from '../assets/cars/taxi.glb?url';
import { buildPatrol, loadPatrol } from './Patrol';

/**
 * Passenger traffic built on Quaternius' CC0 car pack (src/assets/cars/CREDITS.md):
 * the bodies are foreign-looking, so they carry their 90s identity in paint and
 * decals instead — recoloured per car, Russian 1993-pattern plates, the taxi's
 * chequers and roof sign, the militia's blue stripe and blue plates (Plates.ts). Decals are
 * flat quads fitted to the body by raycasting, so any model can wear any
 * livery. Local forward is +Z, wheels on y = 0, metres.
 */
export type CarKind = 'sedan' | 'compact' | 'suv' | 'taxi' | 'militia' | 'militiaSuv';
const KINDS: CarKind[] = ['sedan', 'compact', 'suv', 'taxi', 'militia', 'militiaSuv'];
export const isCarKind = (k: string): k is CarKind => (KINDS as string[]).includes(k);
/** Police cars: the patrol VAZ-2106 (asphalt only) and the patrol Niva, which also takes dirt roads. */
export type PoliceKind = 'militia' | 'militiaSuv';
export const isPolice = (k: string): k is PoliceKind => k === 'militia' || k === 'militiaSuv';

const FILES: Record<CarKind, string> = { sedan: sedanUrl, compact: compactUrl, suv: suvUrl, taxi: taxiUrl, militia: '', militiaSuv: '' };
/** Model materials that take the car's paint. */
const PAINT: Record<CarKind, string[]> = { sedan: ['Blue'], compact: ['LightBlue'], suv: ['White'], taxi: ['Yellow'], militia: ['White', 'Black'], militiaSuv: ['White'] };

const templates: Partial<Record<CarKind, THREE.Object3D>> = {};
let loading: Promise<void> | null = null;

/** Fetch the car models; must resolve before traffic builds any of these kinds. */
export function loadCars(): Promise<void> {
  return (loading ??= (async () => {
    const loader = new GLTFLoader();
    const byFile = new Map<string, Promise<THREE.Object3D>>();
    // the patrol cars, a VAZ-2106 and a Niva, come prepared on their own (Patrol.ts)
    await Promise.all([loadPatrol(), ...KINDS.filter((k) => !isPolice(k)).map(async (k) => {
      if (!byFile.has(FILES[k])) byFile.set(FILES[k], loader.loadAsync(FILES[k]).then((g) => g.scene));
      templates[k] = await byFile.get(FILES[k])!;
    })]);
  })());
}

/** Headlamp glass shared by all these cars; Vehicles drives its night glow. */
export const CAR_HEAD = new THREE.MeshLambertMaterial({ color: '#efe8d2', emissive: '#ffe6b0', emissiveIntensity: 0 });

const MATS = new Map<string, THREE.MeshLambertMaterial>();
const lam = (c: string): THREE.MeshLambertMaterial => {
  let m = MATS.get(c);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); MATS.set(c, m); }
  return m;
};
export const decalMat = (tex: THREE.Texture) => new THREE.MeshLambertMaterial({
  map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});

export const font = (px: number, w = 'bold') => `${w} ${px}px "PT Sans Narrow", "Arial Narrow", sans-serif`;
export const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d')!);
  return toTex(c);
};

// ---------------- liveries ----------------

/** A Bashkir plate of 1997 (see Plates.ts): the new 1993 kind, blue for the militia. */
function plateTex(seed: number, militia: boolean): THREE.Texture {
  const p = plateFor(seed, militia ? 'militia' : 'new');
  return tex(128, 28, (g) => drawPlate(g, p, 128, 28));
}

let checkerTex: THREE.Texture | null = null;
const militiaTex = new Map<string, THREE.Texture>();
let taxiSignTex: THREE.Texture | null = null;
let barSignTex: THREE.Texture | null = null;
const livery = {
  /** Two rows of black chequers on the doors; the body paint shows through. */
  checkers: () => (checkerTex ??= tex(256, 16, (g) => {
    g.fillStyle = '#141414';
    for (let i = 0; i < 32; i++) g.fillRect(i * 8, (i % 2) * 8, 8, 8);
  })),
  /** Blue band with the service name (МИЛИЦИЯ, ГАИ) in white, thin white pinstripes. */
  militia: (label: string) => {
    let t = militiaTex.get(label);
    if (!t) {
      t = tex(256, 24, (g) => {
        g.fillStyle = '#1d4ea6'; g.fillRect(0, 2, 256, 20);
        g.fillStyle = '#ffffff'; g.fillRect(0, 4, 256, 1); g.fillRect(0, 19, 256, 1);
        g.font = font(15); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label.split('').join(' '), 128, 12.5);
      });
      militiaTex.set(label, t);
    }
    return t;
  },
  /** Front and back of the roof bar. */
  barSign: () => (barSignTex ??= tex(64, 12, (g) => {
    g.fillStyle = '#e8e8e2'; g.fillRect(0, 0, 64, 12);
    g.fillStyle = '#1d4ea6'; g.font = font(11); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ГАИ', 32, 6.5);
  })),
  taxiSign: () => (taxiSignTex ??= tex(96, 16, (g) => {
    g.fillStyle = '#e8c430'; g.fillRect(0, 0, 96, 16);
    g.fillStyle = '#141414';
    // chequered ends, the word between them
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) { g.fillRect(i * 4, j * 4, 4, 4); g.fillRect(84 + i * 4, j * 4, 4, 4); }
    g.font = font(13); g.textAlign = 'center'; g.textBaseline = 'middle';
    const k = Math.min(1, 64 / g.measureText('ТАКСИ').width);
    g.save(); g.translate(48, 8.5); g.scale(k, 1); g.fillText('ТАКСИ', 0, 0); g.restore();
  })),
};

const _o = new THREE.Vector3(), _dir = new THREE.Vector3();
const rc = new THREE.Raycaster();

/**
 * A flat decal fitted to the body. `axis` 'x' puts it on a side (sign +1 the
 * left, +X), 'z' on the front (+1) or back (-1). `along` is the centre on the
 * other horizontal axis; long decals are split so each piece hugs the panel.
 */
export function decal(group: THREE.Object3D, targets: THREE.Object3D[], mat: THREE.Material, w: number, h: number, cy: number, along: number, axis: 'x' | 'z', sign: 1 | -1, segs = 1): void {
  // decal u runs to the viewer's right: on the left side that is rearward
  const uDir = axis === 'x' ? -sign : sign;
  for (let i = 0; i < segs; i++) {
    const a = -w / 2 + (w * i) / segs, b = a + w / segs;
    let out = -Infinity;
    for (const u of [a + 0.01, (a + b) / 2, b - 0.01]) {
      for (const v of [cy - h / 2, cy, cy + h / 2]) {
        const p = along + uDir * u;
        if (axis === 'x') { _o.set(sign * 4, v, p); _dir.set(-sign, 0, 0); } else { _o.set(p, v, sign * 6); _dir.set(0, 0, -sign); }
        rc.set(_o, _dir);
        const hit = rc.intersectObjects(targets, false)[0];
        if (hit) out = Math.max(out, sign * (axis === 'x' ? hit.point.x : hit.point.z));
      }
    }
    if (!Number.isFinite(out)) continue;
    const geo = new THREE.PlaneGeometry(b - a, h);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / segs);
    const m = new THREE.Mesh(geo, mat);
    const p = along + uDir * (a + b) / 2, q = sign * (out + 0.006);
    if (axis === 'x') { m.position.set(q, cy, p); m.rotation.y = sign * Math.PI / 2; } else { m.position.set(p, cy, q); m.rotation.y = sign > 0 ? 0 : Math.PI; }
    group.add(m);
  }
}

// ---------------- militia patrol car ----------------

/** Crew places in a police car, car-local: the driver on the left (+X), his partner on the right. */
export interface CrewSpec {
  /** Figures sit a little scaled down so their caps clear these low CC0 roofs. */
  scale: number;
  driver: { seat: THREE.Vector3; door: THREE.Vector3 };
  partner: { seat: THREE.Vector3; door: THREE.Vector3 };
}
const crewSpec = (scale: number, x: number, y: number, z: number, door: number): CrewSpec => ({
  scale,
  driver: { seat: new THREE.Vector3(x, y, z), door: new THREE.Vector3(door, 0, -0.1) },
  partner: { seat: new THREE.Vector3(-x, y, z), door: new THREE.Vector3(-door, 0, -0.1) },
});
// front seats of a VAZ-2106 and a Niva: hips about 0.5 m and 0.7 m above the ground
const CREWS: Record<PoliceKind, CrewSpec> = {
  militia: crewSpec(0.9, 0.36, 0.08, -0.05, 1.15),
  militiaSuv: crewSpec(0.9, 0.38, 0.28, -0.1, 1.2),
};
export const crewFor = (k: PoliceKind): CrewSpec => CREWS[k];

/** Cabin lining per body: shell (centre y/z, height, bottom half-width, depth scale), seat rows, dash and wheel. */
const CABINS: Record<PoliceKind, { y: number; z: number; h: number; hw: number; dz: number; seatX: number; seatY: number; restY: number; benchY: number; benchZ: number; dashY: number; dashZ: number; wheel: [number, number, number] }> = {
  militia: { y: 0.64, z: -0.3, h: 0.68, hw: 0.707, dz: 0.85, seatX: 0.34, seatY: 0.56, restY: 0.86, benchY: 0.52, benchZ: -0.84, dashY: 0.6, dashZ: 0.18, wheel: [0.34, 0.62, 0.08] },
  militiaSuv: { y: 0.98, z: -0.45, h: 0.86, hw: 0.8, dz: 1.06, seatX: 0.4, seatY: 0.86, restY: 1.2, benchY: 0.82, benchZ: -1.1, dashY: 0.94, dashZ: 0.38, wheel: [0.4, 0.8, 0.12] },
};

const GLASS = new THREE.MeshLambertMaterial({ color: '#18222a', transparent: true, opacity: 0.6, depthWrite: false });
const CABIN = new THREE.MeshLambertMaterial({ color: '#26282a', side: THREE.BackSide });

/**
 * The model's glasshouse is an empty shell: line it with a dark cabin seen
 * from inside, seats and a wheel, so the crew reads through the tinted glass.
 * Kept inside the sloping screens so no corner shows outside the body.
 */
function cabin(group: THREE.Group, kind: PoliceKind): void {
  const c = CABINS[kind];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = lam('#1c1c1e')) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    group.add(o);
    return o;
  };
  // a frustum: the glasshouse narrows toward the roof
  const k = c.hw / 0.707;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1, c.h, 4, 1).rotateY(Math.PI / 4).scale(k, 1, c.dz), CABIN);
  shell.position.set(0, c.y, c.z);
  group.add(shell);
  for (const x of [c.seatX, -c.seatX]) { box(0.44, 0.46, 0.09, x, c.seatY, c.z - 0.2); box(0.22, 0.11, 0.08, x, c.restY, c.z - 0.22); }
  box(c.seatX * 3.4, 0.36, 0.1, 0, c.benchY, c.benchZ);
  box(c.seatX * 3.4, 0.1, 0.24, 0, c.dashY, c.dashZ);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.016, 5, 14), lam('#121212'));
  wheel.position.set(...c.wheel);
  wheel.rotation.x = -0.45;
  group.add(wheel);
}

/** Roof bar of the 90s: a blue and a red lamp either side of a ГАИ box, hiding the model's own lamps. */
export function lightBar(group: THREE.Group, roof: number, z: number): THREE.MeshLambertMaterial[] {
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.13, 0.34), lam('#c4c8cc'));
  base.position.set(0, roof + 0.045, z);
  group.add(base);
  const sign = decalMat(livery.barSign());
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.07), sign);
    p.position.set(0, roof + 0.05, z + s * 0.172);
    p.rotation.y = s > 0 ? 0 : Math.PI;
    group.add(p);
  }
  // driver's side blue, passenger's side red; the caller flashes them alternately
  return [[0.3, '#2a4aa8', '#4a7aff'], [-0.3, '#a82a26', '#ff3a2a']].map(([x, color, glow]) => {
    const m = new THREE.MeshLambertMaterial({ color: color as string, emissive: glow as string, emissiveIntensity: 0.05, transparent: true, opacity: 0.92 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.26), m);
    lamp.position.set(x as number, roof + 0.16, z);
    group.add(lamp);
    return m;
  });
}

// ---------------- build ----------------

export function buildCar(kind: CarKind, color: string, seed = 0, opts: { label?: string } = {}): VehicleModel {
  if (isPolice(kind)) return buildPatrol(kind);
  const tpl = templates[kind];
  if (!tpl) throw new Error('loadCars() must finish before building cars');
  const root = tpl.clone(true);
  const group = new THREE.Group();
  group.add(root);
  group.updateMatrixWorld(true);

  const tail = new THREE.MeshLambertMaterial({ color: '#a01810', emissive: '#ff2a18', emissiveIntensity: 0 });
  const beacons: THREE.MeshLambertMaterial[] = [];
  const body: THREE.Mesh[] = [];
  const windows = new THREE.Box3(), heads = new THREE.Box3(), roofLamps = new THREE.Box3(), tails = new THREE.Box3();
  let trim = null as THREE.Mesh | null;
  const wheels = root.children.filter((c) => /Wheel/i.test(c.name));

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const n = (m.material as THREE.Material).name;
    let inWheel = false;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (wheels.includes(p)) inWheel = true;
    if (inWheel) { m.material = lam(n === 'Grey' ? '#9a9a94' : '#1a1a1a'); return; }
    if (PAINT[kind].includes(n)) m.material = lam(color);
    else if (n === 'Windows') { m.material = isPolice(kind) ? GLASS : lam(kind === 'suv' ? '#14181b' : '#2a353d'); windows.expandByObject(m); return; }
    else if (n === 'Headlights') { m.material = CAR_HEAD; heads.expandByObject(m); }
    else if (n === 'TailLights') { m.material = tail; tails.expandByObject(m); }
    else if (n === 'BlueLights' || n === 'WhiteLights') {
      // the model's own roof lamps: replaced by a period bar below
      m.visible = false;
      roofLamps.expandByObject(m);
      return;
    } else if (n === 'Grey') m.material = lam('#a4a49c');
    else { m.material = lam('#1e1e1e'); if (n === 'Black') trim = m; }
    body.push(m);
  });

  // wheels: re-pivot each wheel node on its own axle so it can spin
  const axles: VehicleModel['axles'] = [];
  let rearZ = 0;
  for (const w of wheels) {
    const box = new THREE.Box3().setFromObject(w);
    const c = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.set(0, c.y, c.z);
    root.remove(w);
    pivot.add(w);
    w.position.set(0, -c.y, -c.z);
    group.add(pivot);
    axles.push({ pivot, r: (box.max.y - box.min.y) / 2 });
    rearZ = Math.min(rearZ, c.z);
  }

  const size = new THREE.Box3().setFromObject(root);
  group.updateMatrixWorld(true);
  // plates under the headlamps, front and back
  const plateY = Number.isFinite(heads.min.y) ? heads.min.y - 0.07 : 0.36;
  const plate = decalMat(plateTex(seed * 131 + kind.length * 17 + color.charCodeAt(2), isPolice(kind)));
  decal(group, body, plate, 0.44, 0.1, plateY, 0, 'z', 1);
  decal(group, body, plate, 0.44, 0.1, plateY + 0.12, 0, 'z', -1);

  // door liveries along the waist below the windows
  if (Number.isFinite(windows.min.z)) {
    const z0 = windows.min.z - 0.15, z1 = windows.max.z + 0.15, zc = (z0 + z1) / 2, len = z1 - z0;
    const y = windows.min.y - 0.2;
    if (kind === 'taxi') {
      const m = decalMat(livery.checkers());
      for (const s of [1, -1] as const) decal(group, body, m, len, 0.12, y, zc, 'x', s, 6);
    } else if (isPolice(kind)) {
      const m = decalMat(livery.militia(opts.label ?? (kind === 'militiaSuv' ? 'ГАИ' : 'МИЛИЦИЯ')));
      for (const s of [1, -1] as const) decal(group, body, m, len, 0.17, y - 0.02, zc, 'x', s, 6);
    }
  }
  // the taxi's roof sign is part of the black trim: dress its two faces
  if (kind === 'taxi' && trim) {
    const t = trim;
    const pos = t.geometry.attributes.position, sign = new THREE.Box3(), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(t.matrixWorld);
      if (v.y > windows.max.y + 0.06) sign.expandByPoint(v);
    }
    if (!sign.isEmpty()) {
      const m = decalMat(livery.taxiSign());
      const c = sign.getCenter(new THREE.Vector3()), sz = sign.getSize(new THREE.Vector3());
      for (const s of [1, -1] as const) decal(group, [t], m, sz.x * 0.92, sz.y * 0.8, c.y, c.x, 'z', s);
    }
  }

  if (isPolice(kind)) {
    cabin(group, kind);
    const z = roofLamps.isEmpty() ? -0.45 : (roofLamps.min.z + roofLamps.max.z) / 2;
    const roof = roofLamps.isEmpty() ? size.max.y - 0.03 : roofLamps.min.y;
    beacons.push(...lightBar(group, roof, z));
  }

  // night glow: a lamp near each end of the headlamp strip, two at the back
  // (tail lamps low on the body, not the police bar's red lens on the roof)
  const lampPts = (b: THREE.Box3, z: number, maxY: number) => {
    if (b.isEmpty()) return [];
    const y = Math.min((b.min.y + b.max.y) / 2, maxY), x = Math.max(0.2, b.max.x - 0.14);
    return [new THREE.Vector3(x, y, z), new THREE.Vector3(-x, y, z)];
  };
  const lights = headlights(group, lampPts(heads, heads.max.z, 9), lampPts(tails, tails.min.z, (heads.max.y || 0.7) + 0.35));

  group.userData.color = color;
  return {
    group, kind, axles, tail, beacons, lights,
    length: size.max.z - size.min.z, width: size.max.x - size.min.x,
    rear: new THREE.Vector3(0, 0, rearZ),
  };
}
