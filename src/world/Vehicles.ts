import * as THREE from 'three';
import { Bucket, boxGeo, mat } from '../core/geom';
import { makeCanvas, toTex } from '../core/textures';
import { buildCar, CAR_HEAD, CarKind, isCarKind } from './Cars';
import { headlights, setHeadlightGlow } from './Headlights';
import { buildUaz } from './Uaz';

/**
 * Procedural Soviet traffic: ZIL-130, GAZ-53 (and its milk tanker), KamAZ-5320,
 * Moskvich-412, VAZ-2106 in GAI livery, PAZ-672, UAZ-452 and MTZ-80.
 * Local forward is +Z; wheels sit on y = 0.
 */
export type VehicleKind = 'zil' | 'gaz53' | 'milk' | 'kamaz' | 'moskvich' | 'gai' | 'paz' | 'tractor' | 'uaz' | CarKind;

export interface VehicleModel {
  group: THREE.Group;
  length: number;
  width: number;
  kind: VehicleKind;
  /** Axle pivots, rotated about X to spin the wheels. */
  axles: { pivot: THREE.Object3D; r: number }[];
  /** Per-vehicle tail-lamp material so each car shows its own brake lights. */
  tail: THREE.MeshLambertMaterial;
  /** Police beacon lamps (left/right), if any. */
  beacons: THREE.MeshLambertMaterial[];
  /** Wheel ground contacts for spray, local space. */
  rear: THREE.Vector3;
  /** Night glow of its lamps (Headlights.ts); hide it to keep a parked car dark. */
  lights?: THREE.Group;
  /** Rotating roof beacon: spinning reflector, its beams and the glowing dome. */
  beacon?: { spin: THREE.Object3D; beams: THREE.Object3D; beam: THREE.MeshBasicMaterial; dome: THREE.MeshLambertMaterial };
}

let shared: Record<string, THREE.Material> | null = null;
const headMats: THREE.MeshLambertMaterial[] = [CAR_HEAD];
const tails = new Set<THREE.MeshLambertMaterial>();

function textTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.Texture {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  draw(g);
  return toTex(c, { repeat, mip: repeat });
}

function materials(): Record<string, THREE.Material> {
  if (shared) return shared;
  const V = (extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
  const head = V({ emissive: '#ffe6b0', emissiveIntensity: 0 });
  headMats.push(head);
  const font = (px: number) => `bold ${px}px "PT Sans Narrow", "Arial Narrow", sans-serif`;
  shared = {
    body: V(),
    glass: V(),
    // tinted see-through glass (patrol car: the crew shows inside)
    glassT: V({ transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
    head,
    chrome: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#3a3a3a' }),
    // tank wrap: u runs round the barrel (right side at u = 0.25, left at 0.75), v along it
    milk: V({ map: textTex(64, 256, (g) => {
      g.fillStyle = '#e8e6de'; g.fillRect(0, 0, 64, 256);
      // texels around the barrel are ~7× sparser than along it: squash glyphs to compensate
      g.font = font(44); g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [cx, rot] of [[16, Math.PI / 2], [48, -Math.PI / 2]] as const) {
        g.fillStyle = '#2a5aa8'; g.fillRect(cx - 10, 20, 2, 216); g.fillRect(cx + 8, 20, 2, 216);
        g.save(); g.translate(cx, 128); g.rotate(rot); g.scale(1, 0.15); g.fillText('МОЛОКО', 0, 2); g.restore();
      }
    }) }),
    gai: V({ map: textTex(128, 16, (g) => {
      g.fillStyle = '#ecece6'; g.fillRect(0, 0, 128, 16);
      g.fillStyle = '#1d4ea6'; g.fillRect(0, 4, 128, 9);
      g.fillStyle = '#ffffff'; g.font = font(10); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('ГАИ', 40, 9); g.fillText('ГАИ', 96, 9);
    }) }),
    gaiBox: V({ map: textTex(32, 8, (g) => {
      g.fillStyle = '#ecece6'; g.fillRect(0, 0, 32, 8);
      g.fillStyle = '#1d4ea6'; g.font = font(8); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ГАИ', 16, 4.5);
    }) }),
    plate: V({ map: textTex(64, 16, (g) => {
      g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, 64, 16);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.5; g.strokeRect(1, 1, 62, 14);
      g.fillStyle = '#1a1a1a'; g.font = font(12); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('А 417 ВН 62', 32, 8.5);
    }) }),
    tarp: V({ map: textTex(64, 32, (g) => {
      g.fillStyle = '#6a6e52'; g.fillRect(0, 0, 64, 32);
      g.fillStyle = 'rgba(0,0,0,0.2)'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 1, 32);
      g.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 3; y < 32; y += 7) g.fillRect(0, y, 64, 1);
      g.fillStyle = 'rgba(60,50,30,0.35)'; g.fillRect(0, 26, 64, 6);
    }, true) }),
    planks: V({ map: textTex(32, 32, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 32);
      g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < 32; y += 6) g.fillRect(0, y, 32, 1);
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 18; i++) g.fillRect((i * 13) % 32, (i * 7) % 32, 3, 1);
    }, true) }),
  };
  return shared;
}

/** k: 0 by day … 1 at night (head and tail lamps). Beacons are animated per car by the caller. */
export function setVehicleLamps(k: number): void {
  for (const m of headMats) m.emissiveIntensity = k * 1.6;
  setHeadlightGlow(k);
  for (const m of tails) m.userData.night = k;
}

/** Brake 0/1 on top of the night glow. */
export function setBrake(m: VehicleModel, brake: boolean): void {
  m.tail.emissiveIntensity = (m.tail.userData.night ?? 0) * 0.9 + (brake ? 1.6 : 0);
}

export function setBeacons(m: VehicleModel, t: number, on: boolean): void {
  const b = m.beacon;
  if (b) {
    // ~110 rpm reflector; the dome flares each time the beam sweeps past
    const a = t * 11.5;
    if (on) b.spin.rotation.y = a % (Math.PI * 2);
    const flare = Math.max(0, Math.cos(a)) ** 4;
    b.dome.emissiveIntensity = on ? 0.8 + flare * 2.4 : 0.05;
    // beams only read in the dusk and dark; by day the dome flare carries it
    const night = m.tail.userData.night ?? 0;
    b.beam.opacity = on ? (0.02 + night * 0.2) * (0.6 + flare * 0.6) : 0;
    b.beams.visible = on;
    return;
  }
  m.beacons.forEach((b, i) => { b.emissiveIntensity = on && (Math.floor(t * 5) + i) % 2 === 0 ? 2.2 : 0.05; });
}

const axleCache = new Map<string, THREE.Group>();

function axleGroup(r: number, w: number, track: number, hub: string, dual = false): THREE.Group {
  const key = `${r}|${w}|${track}|${hub}|${dual}`;
  let g = axleCache.get(key);
  if (!g) {
    const b = new Bucket();
    for (const s of [-1, 1]) {
      const x = s * track / 2;
      const tyre = (dx: number) => {
        b.add('body', new THREE.CylinderGeometry(r, r, w, 14), mat(x + dx, 0, 0, 0, 0, Math.PI / 2), '#1a1a1a');
        // tread blocks make the spin readable
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          b.add('body', boxGeo(w * 1.02, 0.05, r * 0.32), mat(x + dx, Math.cos(a) * (r - 0.015), Math.sin(a) * (r - 0.015), a, 0, 0), '#2a2a28');
        }
      };
      tyre(0);
      if (dual) tyre(-s * (w + 0.04));
      b.add('body', new THREE.CylinderGeometry(r * 0.56, r * 0.56, w + 0.02, 10), mat(x + s * 0.005, 0, 0, 0, 0, Math.PI / 2), hub);
      b.add('body', new THREE.CylinderGeometry(r * 0.18, r * 0.18, w + 0.05, 8), mat(x + s * 0.01, 0, 0, 0, 0, Math.PI / 2), '#2a2a28');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add('body', boxGeo(w + 0.04, 0.05, 0.05), mat(x + s * 0.01, Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36), '#3a3a36');
      }
    }
    g = b.build(materials(), 'axle');
    axleCache.set(key, g);
  }
  return g.clone();
}

type Add = (key: string, g: THREE.BufferGeometry, x: number, y: number, z: number, c: string, rx?: number, ry?: number, rz?: number) => void;

export function buildVehicle(kind: VehicleKind, color: string, seed = 0): VehicleModel {
  if (isCarKind(kind)) {
    // modelled passenger cars (Cars.ts); their tail lamps join the night/brake glow
    const m = buildCar(kind, color, seed);
    tails.add(m.tail);
    return m;
  }
  if (kind === 'uaz') {
    // the modelled UAZ-452 (Uaz.ts): the gas service's orange or plain grey
    const m = buildUaz(seed % 2 ? 'gas' : 'grey');
    tails.add(m.tail);
    return m;
  }
  const M = materials();
  const b = new Bucket();
  // white headlamps and the tail lamps are remembered for their night glow
  const heads: THREE.Vector3[] = [], tailPts: THREE.Vector3[] = [];
  const add: Add = (key, g, x, y, z, c, rx = 0, ry = 0, rz = 0) => {
    if (key === 'head' && c === '#f4f0dc') heads.push(new THREE.Vector3(x, y, z));
    if (key === 'tail') tailPts.push(new THREE.Vector3(x, y, z));
    b.add(key, g, mat(x, y, z, rx, ry, rz), c);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string, key = 'body', rx = 0) => add(key, boxGeo(w, h, d), x, y, z, c, rx);
  const GLASS = '#33404a', DARK = '#242422', CHROME = '#b8b8b0', GRIME = '#4a4234';
  const axleDefs: { z: number; r: number; w: number; track: number; hub: string; dual?: boolean }[] = [];
  const beaconDefs: { x: number; y: number; z: number }[] = [];
  let length = 4, width = 1.8, rearZ = -1.5;
  let spinAt: THREE.Vector3 | null = null;

  /** Rounded arch over a wheel: a half tube on its side. */
  const arch = (x: number, z: number, r: number, w: number, c: string) => {
    const g = new THREE.CylinderGeometry(r + 0.08, r + 0.08, w, 10, 1, true, 0, Math.PI);
    add('body', g, x, r, z, c, 0, 0, Math.PI / 2);
  };
  const mirror = (x: number, y: number, z: number, side: number) => {
    box(0.04, 0.04, 0.3, x + side * 0.12, y, z, DARK);
    box(0.04, 0.24, 0.16, x + side * 0.25, y + 0.05, z - 0.05, DARK);
  };
  const plate = (y: number, z: number, back = false) => add('plate', new THREE.PlaneGeometry(0.52, 0.12), 0, y, z, '#ffffff', 0, back ? Math.PI : 0);
  const roundLamp = (x: number, y: number, z: number, r = 0.11) => {
    add('chrome', new THREE.CylinderGeometry(r + 0.025, r + 0.025, 0.06, 10), x, y, z - 0.01, CHROME, Math.PI / 2);
    add('head', new THREE.CylinderGeometry(r, r, 0.07, 10), x, y, z, '#f4f0dc', Math.PI / 2);
  };
  const tail = (x: number, y: number, z: number, w = 0.14, h = 0.09) => add('tail', boxGeo(w, h, 0.04), x, y, z, '#ffffff');

  if (kind === 'zil' || kind === 'gaz53' || kind === 'milk') {
    // bonneted trucks: long nose, separate rounded fenders, cab with a split windscreen
    const zil = kind === 'zil';
    const W = zil ? 2.45 : 2.3, R = zil ? 0.5 : 0.47;
    length = zil ? 6.7 : 6.4; width = W;
    const fz = length / 2;
    const hoodW = zil ? 1.5 : 1.25, hoodH = zil ? 0.62 : 0.6;
    box(1.0, 0.25, length - 0.3, 0, 0.8, 0, DARK);
    box(hoodW, hoodH, 1.5, 0, 1.38, fz - 0.85, color);
    box(hoodW - 0.1, 0.08, 1.45, 0, 1.72, fz - 0.87, color);
    // grille: ZIL wide horizontal bars on a pale panel, GAZ narrow vertical slats
    if (zil) {
      box(1.9, 0.62, 0.06, 0, 1.25, fz - 0.06, '#d8d4c8');
      for (let i = 0; i < 6; i++) box(1.5, 0.035, 0.05, 0, 1.03 + i * 0.08, fz - 0.03, '#3a3a36');
    } else {
      box(1.05, 0.62, 0.06, 0, 1.3, fz - 0.06, DARK);
      for (let i = 0; i < 9; i++) box(0.04, 0.56, 0.05, -0.44 + i * 0.11, 1.3, fz - 0.03, '#6a6a64');
    }
    box(W, 0.18, 0.18, 0, 0.74, fz + 0.02, zil ? CHROME : '#3a3a38', zil ? 'chrome' : 'body');
    plate(0.74, fz + 0.12);
    for (const s of [-1, 1]) {
      // fender with a rounded crown over the front wheel, round headlamp on its nose
      const fx = s * (W / 2 - 0.26);
      const fender = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10, 1, false, 0, Math.PI);
      add('body', fender, fx, 0.95, fz - 0.85, color, 0, 0, Math.PI / 2);
      box(0.5, 0.42, 0.5, fx, 1.05, fz - 0.3, color);
      roundLamp(fx, 1.22, fz - 0.04);
      add('head', boxGeo(0.08, 0.06, 0.03), s * (hoodW / 2 + 0.05), 1.0, fz - 0.03, '#e8a040');
    }
    // cab
    const cz = fz - 2.3;
    box(W - 0.15, 0.85, 1.55, 0, 1.55, cz, color);
    box(W - 0.25, 0.7, 1.4, 0, 2.3, cz - 0.05, color);
    box(W - 0.35, 0.1, 1.3, 0, 2.68, cz - 0.08, color);
    for (const s of [-1, 1]) add('glass', boxGeo((W - 0.6) / 2, 0.52, 0.04), s * (W - 0.6) / 4, 2.32, cz + 0.66, GLASS, -0.16);
    box(0.06, 0.55, 0.06, 0, 2.32, cz + 0.68, color, 'body', -0.16);
    for (const s of [-1, 1]) {
      add('glass', boxGeo(0.04, 0.48, 0.7), s * (W / 2 - 0.12), 2.32, cz + 0.05, GLASS);
      box(0.02, 0.6, 0.02, s * (W / 2 - 0.07), 1.6, cz + 0.1, '#1a1a18');
      box(0.06, 0.03, 0.14, s * (W / 2 - 0.09), 1.75, cz - 0.2, CHROME, 'chrome');
      mirror(s * (W / 2 - 0.1), 2.25, cz + 0.6, s);
      box(0.3, 0.12, 0.6, s * (W / 2 - 0.2), 0.98, cz - 0.1, DARK);
    }
    for (const s of [-1, 1]) add('head', boxGeo(0.06, 0.05, 0.05), s * 0.6, 2.75, cz + 0.55, '#e8a040');
    const bedL = length - 2.85;
    const bz = -fz + bedL / 2 + 0.05;
    if (kind === 'milk') {
      add('milk', new THREE.CylinderGeometry(0.95, 0.95, bedL - 0.25, 16), 0, 1.98, bz, '#ffffff', Math.PI / 2);
      for (const e of [-1, 1]) add('body', new THREE.SphereGeometry(0.95, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.98, bz + e * (bedL - 0.25) / 2, '#e2e0d8', e * Math.PI / 2);
      add('body', new THREE.CylinderGeometry(0.22, 0.22, 0.15, 10), 0, 3.0, bz + 0.6, '#c8c8c0');
      box(0.06, 0.06, bedL - 0.6, 0.4, 2.98, bz, '#9a9a94');
      box(2.0, 0.14, bedL, 0, 1.0, bz, DARK);
      for (const s of [-1, 1]) box(0.25, 0.4, 0.8, s * 0.8, 0.9, bz, '#5a5a56');
    } else {
      const wood = zil ? '#6a7a5a' : '#7a6a4a';
      box(W, 0.12, bedL, 0, 1.22, bz, '#6a5a44');
      for (const s of [-1, 1]) {
        add('planks', boxGeo(0.06, 0.6, bedL), s * (W / 2 - 0.03), 1.58, bz, wood);
        for (let z = -bedL / 2 + 0.3; z < bedL / 2; z += 1.0) box(0.08, 0.64, 0.07, s * (W / 2 - 0.01), 1.58, bz + z, '#3a3a30');
      }
      add('planks', boxGeo(W, 0.6, 0.06), 0, 1.58, -fz + 0.08, wood);
      add('planks', boxGeo(W, 0.6, 0.06), 0, 1.58, bz + bedL / 2, wood);
      if (seed % 3 === 0) box(W - 0.3, 0.55, bedL - 0.4, 0, 2.1, bz, '#c8b070');
      else if (seed % 3 === 1) for (let i = 0; i < 8; i++) add('body', new THREE.SphereGeometry(0.32, 7, 5), -0.6 + (i % 3) * 0.6, 1.95 + (i > 5 ? 0.35 : 0), bz - 1.2 + Math.floor(i / 3) * 1.1, '#a8987a');
    }
    for (const s of [-1, 1]) { tail(s * (W / 2 - 0.2), 1.0, -fz - 0.02); box(0.5, 0.45, 0.02, s * (W / 2 - 0.35), 0.55, -fz + 1.0, DARK); }
    plate(0.85, -fz - 0.03, true);
    box(W - 0.1, 0.25, 0.03, 0, 0.95, -fz + 0.6, GRIME);
    axleDefs.push({ z: fz - 0.85, r: R, w: 0.3, track: W - 0.55, hub: zil ? '#4a5a6a' : '#5a6a4a' });
    axleDefs.push({ z: -fz + 1.45, r: R, w: 0.26, track: W - 0.65, hub: '#4a4a46', dual: true });
    rearZ = -fz + 1.45;
  } else if (kind === 'kamaz') {
    // KamAZ-5320: cab-over, black grille band, tarpaulin body, two driven rear axles
    length = 7.6; width = 2.5;
    const fz = length / 2;
    box(1.0, 0.3, length - 0.3, 0, 0.85, 0, DARK);
    box(2.5, 1.0, 1.9, 0, 1.55, fz - 0.95, color);
    box(2.48, 1.0, 1.85, 0, 2.55, fz - 0.98, color);
    box(2.36, 0.2, 1.7, 0, 3.12, fz - 1.05, color);
    box(2.1, 0.32, 0.06, 0, 1.65, fz + 0.01, DARK);
    for (let i = 0; i < 4; i++) box(2.0, 0.03, 0.04, 0, 1.53 + i * 0.08, fz + 0.04, '#5a5a56');
    box(0.9, 0.1, 0.04, 0, 1.95, fz + 0.03, '#e8e4da');
    add('glass', boxGeo(2.2, 0.82, 0.04), 0, 2.6, fz + 0.01, GLASS, -0.06);
    box(0.06, 0.85, 0.06, 0, 2.6, fz + 0.03, color, 'body', -0.06);
    box(2.5, 0.28, 0.24, 0, 0.95, fz + 0.04, '#d8d4cc');
    plate(0.95, fz + 0.17);
    for (const s of [-1, 1]) {
      add('head', boxGeo(0.3, 0.16, 0.05), s * 0.92, 0.98, fz + 0.17, '#f4f0dc');
      add('glass', boxGeo(0.04, 0.6, 1.1), s * 1.25, 2.62, fz - 0.8, GLASS);
      box(0.04, 0.6, 0.05, s * 1.25, 1.7, fz - 0.3, '#1a1a18');
      mirror(s * 1.25, 2.55, fz - 0.1, s);
      box(0.6, 0.2, 0.9, s * 0.95, 1.05, fz - 0.95, DARK);
      tail(s * 1.05, 1.0, -fz - 0.02, 0.18, 0.1);
    }
    for (const s of [-1, 1]) add('head', boxGeo(0.08, 0.06, 0.05), s * 0.5, 3.25, fz - 0.2, '#e8a040');
    add('tarp', boxGeo(2.5, 2.2, 5.1), 0, 2.45, -fz + 2.6, '#ffffff');
    box(2.54, 0.14, 5.12, 0, 1.3, -fz + 2.6, '#4a4a3c');
    for (let z = -fz + 0.4; z < -fz + 5; z += 1.2) for (const s of [-1, 1]) box(0.03, 2.1, 0.03, s * 1.26, 2.45, z, '#3a3a30');
    plate(0.9, -fz - 0.03, true);
    axleDefs.push({ z: fz - 1.0, r: 0.55, w: 0.36, track: 2.0, hub: '#3a3a36' });
    axleDefs.push({ z: -fz + 1.95, r: 0.55, w: 0.3, track: 1.85, hub: '#3a3a36', dual: true });
    axleDefs.push({ z: -fz + 0.75, r: 0.55, w: 0.3, track: 1.85, hub: '#3a3a36', dual: true });
    for (const z of [fz - 1.0, -fz + 1.35]) for (const s of [-1, 1]) arch(s * 1.0, z, 0.55, 0.45, DARK);
    rearZ = -fz + 0.75;
  } else if (kind === 'gai') {
    // VAZ-2106 "shestyorka" in 1990s GAI livery: square three-box body with a
    // hollow glasshouse (so the crew shows through tinted glass), quad round
    // headlamps in a chrome-trimmed black grille, chrome bumpers with rubber
    // overriders, the long horizontal tail clusters and one rotating blue beacon.
    length = 4.17; width = 1.61;
    const fz = length / 2, W = 1.61, paint = color;
    const SEAT = '#2a2826', TRIM = '#1c1c1a';
    // lower body, shoulder, hood and boot lid
    box(W, 0.52, length - 0.1, 0, 0.63, 0, paint);
    box(W - 0.04, 0.04, length - 0.16, 0, 0.9, 0, paint);
    box(1.46, 0.035, 1.25, 0, 0.93, fz - 0.7, paint);
    box(1.46, 0.035, 0.82, 0, 0.93, -fz + 0.48, paint);
    box(1.42, 0.05, 2.2, 0, 0.93, -0.3, paint);
    // dark cabin floor/door cards seen through the glass
    box(1.34, 0.02, 2.1, 0, 0.958, -0.3, TRIM);
    // glasshouse: roof with drip rails, A/B/C pillars
    box(1.36, 0.05, 1.16, 0, 1.405, -0.39, paint);
    box(1.28, 0.03, 1.06, 0, 1.44, -0.39, paint);
    for (const s of [-1, 1]) {
      box(0.025, 0.025, 1.18, s * 0.69, 1.39, -0.39, CHROME, 'chrome');
      add('body', boxGeo(0.06, 0.8, 0.06), s * 0.675, 1.14, 0.49, paint, -0.912);
      box(0.06, 0.46, 0.09, s * 0.68, 1.16, -0.3, TRIM);
      add('body', boxGeo(0.2, 0.64, 0.06), s * 0.6, 1.175, -1.165, paint, 0.763);
      // side glass with chrome beltline
      const pts = [[0.74, 0.95], [0.2, 1.37], [-0.99, 1.37], [-1.36, 0.97], [-1.36, 0.95]];
      const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(s < 0 ? z : -z, y)));
      add('glassT', new THREE.ShapeGeometry(shape), s * 0.69, 0, 0, '#5a6e7a', 0, s * Math.PI / 2);
      box(0.02, 0.025, 2.1, s * 0.7, 0.948, -0.31, CHROME, 'chrome');
      // door shut lines, handles, the blue GAI stripe
      for (const z of [0.74, -0.31, -1.3]) box(0.012, 0.46, 0.012, s * 0.807, 0.65, z, '#2a2a28');
      box(0.012, 0.012, 2.04, s * 0.807, 0.405, -0.28, '#2a2a28');
      for (const z of [0.12, -0.88]) box(0.03, 0.03, 0.15, s * 0.81, 0.83, z, CHROME, 'chrome');
      box(0.02, 0.16, length - 0.4, s * 0.808, 0.45, 0, GRIME);
      // round chrome door mirror on a stalk
      box(0.12, 0.025, 0.025, s * 0.78, 0.98, 0.66, CHROME, 'chrome');
      add('chrome', new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12), s * 0.86, 1.02, 0.64, CHROME, Math.PI / 2);
      add('glass', new THREE.CircleGeometry(0.055, 12), s * 0.86, 1.02, 0.618, '#8a98a0', 0, Math.PI);
      // front seats, steering wheel on the left (+X)
      box(0.46, 0.5, 0.1, s * 0.36, 1.06, -0.36, SEAT, 'body', -0.15);
      box(0.24, 0.12, 0.08, s * 0.36, 1.37, -0.41, SEAT, 'body', -0.15);
      // tail clusters: amber, red, white reverse in one wide bezel
      box(0.5, 0.16, 0.03, s * 0.52, 0.74, -fz + 0.035, TRIM);
      tail(s * 0.44, 0.74, -fz + 0.015, 0.22, 0.12);
      box(0.13, 0.12, 0.03, s * 0.67, 0.74, -fz + 0.015, '#d88a20');
      box(0.08, 0.12, 0.03, s * 0.29, 0.74, -fz + 0.015, '#e8e6dc');
      // front: indicators under the bumper, rubber overriders
      add('head', boxGeo(0.14, 0.06, 0.03), s * 0.55, 0.36, fz - 0.03, '#e89030');
      box(0.07, 0.15, 0.12, s * 0.42, 0.46, fz + 0.06, TRIM);
      box(0.07, 0.15, 0.12, s * 0.42, 0.46, -fz - 0.06, TRIM);
    }
    add('glassT', boxGeo(1.3, 0.78, 0.012), 0, 1.16, 0.51, '#5a6e7a', -0.912);
    add('glassT', boxGeo(1.0, 0.6, 0.012), 0, 1.19, -1.19, '#5a6e7a', 0.763);
    box(1.3, 0.025, 0.025, 0, 0.92, 0.79, CHROME, 'chrome');
    box(1.36, 0.16, 0.24, 0, 0.98, 0.62, TRIM);
    add('body', new THREE.TorusGeometry(0.17, 0.016, 5, 16), 0.36, 1.05, 0.4, '#141414', -0.9);
    box(1.3, 0.4, 0.1, 0, 1.0, -1.08, SEAT, 'body', -0.2);
    // windscreen wipers parked at the base
    for (const x of [-0.32, 0.22]) box(0.5, 0.012, 0.015, x, 0.95, 0.82, TRIM);
    // grille: black panel with chrome surround, quad lamps, three chrome bars
    box(1.42, 0.25, 0.04, 0, 0.72, fz - 0.035, TRIM);
    box(1.44, 0.02, 0.03, 0, 0.855, fz - 0.02, CHROME, 'chrome');
    box(1.44, 0.02, 0.03, 0, 0.585, fz - 0.02, CHROME, 'chrome');
    for (let i = 0; i < 3; i++) box(0.5, 0.018, 0.03, 0, 0.66 + i * 0.06, fz - 0.01, CHROME, 'chrome');
    box(0.08, 0.06, 0.02, 0, 0.72, fz, '#c8c8c0', 'chrome');
    for (const s of [-1, 1]) for (const dx of [0.4, 0.6]) roundLamp(s * dx, 0.72, fz - 0.005, 0.078);
    // chrome bumpers, plates, the GAI livery
    box(1.66, 0.11, 0.1, 0, 0.46, fz + 0.03, CHROME, 'chrome');
    box(1.66, 0.11, 0.1, 0, 0.46, -fz - 0.03, CHROME, 'chrome');
    plate(0.33, fz + 0.01);
    plate(0.62, -fz - 0.01, true);
    for (const s of [-1, 1]) add('gai', new THREE.PlaneGeometry(3.3, 0.2), s * 0.81, 0.62, -0.05, '#ffffff', 0, s * Math.PI / 2);
    add('gai', new THREE.PlaneGeometry(1.1, 0.14), 0, 0.88, -fz - 0.002, '#ffffff', 0, Math.PI);
    add('gaiBox', new THREE.PlaneGeometry(0.42, 0.11), 0, 0.948, fz - 0.4, '#ffffff', -Math.PI / 2);
    // roof: beacon on a chrome foot, SGU loudspeaker, whip aerial
    box(0.2, 0.025, 0.24, 0, 1.465, -0.25, CHROME, 'chrome');
    box(0.18, 0.1, 0.12, -0.32, 1.51, 0.02, '#3a3a38');
    box(0.15, 0.08, 0.01, -0.32, 1.51, 0.085, '#121212');
    box(0.015, 0.9, 0.015, 0.6, 1.9, -0.95, DARK);
    for (const z of [fz - 0.8, -fz + 0.85]) for (const s of [-1, 1]) arch(s * 0.66, z, 0.31, 0.24, DARK);
    axleDefs.push({ z: fz - 0.8, r: 0.31, w: 0.19, track: 1.32, hub: '#c8c8c0' });
    axleDefs.push({ z: -fz + 0.85, r: 0.31, w: 0.19, track: 1.32, hub: '#c8c8c0' });
    rearZ = -fz + 0.85;
    spinAt = new THREE.Vector3(0, 1.48, -0.25);
  } else if (kind === 'moskvich') {
    // Moskvich-412: square three-box saloon with chrome bumpers
    length = 4.25; width = 1.62;
    const fz = length / 2;
    const paint = color;
    box(1.62, 0.5, length - 0.1, 0, 0.62, 0, paint);
    box(1.6, 0.1, length - 0.3, 0, 0.92, 0, paint);
    box(1.42, 0.46, 1.9, 0, 1.2, -0.18, paint);
    box(1.36, 0.06, 1.75, 0, 1.45, -0.2, paint);
    add('glass', boxGeo(1.3, 0.44, 0.04), 0, 1.18, 0.86, GLASS, -0.55);
    add('glass', boxGeo(1.3, 0.4, 0.04), 0, 1.18, -1.2, GLASS, 0.6);
    for (const s of [-1, 1]) {
      add('glass', boxGeo(0.03, 0.34, 1.62), s * 0.715, 1.2, -0.18, GLASS);
      box(0.04, 0.38, 0.06, s * 0.715, 1.2, -0.2, paint);
      box(0.02, 0.44, 0.02, s * 0.815, 0.65, 0.05, '#1a1a18');
      box(0.02, 0.44, 0.02, s * 0.815, 0.65, -0.95, '#1a1a18');
      box(0.03, 0.03, 0.14, s * 0.82, 0.8, -0.15, CHROME, 'chrome');
      box(0.03, 0.04, length - 0.4, s * 0.815, 0.95, 0, CHROME, 'chrome');
      mirror(s * 0.72, 1.0, 0.75, s);
      box(0.02, 0.18, length - 0.3, s * 0.815, 0.44, 0, GRIME);
      tail(s * 0.6, 0.72, -fz - 0.02, 0.32, 0.13);
      add('head', boxGeo(0.3, 0.15, 0.04), s * 0.56, 0.72, fz + 0.02, '#f4f0dc');
    }
    box(1.66, 0.13, 0.12, 0, 0.45, fz + 0.03, CHROME, 'chrome');
    box(1.66, 0.13, 0.12, 0, 0.45, -fz - 0.03, CHROME, 'chrome');
    box(1.1, 0.2, 0.04, 0, 0.72, fz + 0.01, DARK);
    plate(0.45, fz + 0.1);
    plate(0.66, -fz - 0.03, true);
    for (const z of [fz - 0.8, -fz + 0.85]) for (const s of [-1, 1]) arch(s * 0.66, z, 0.31, 0.24, DARK);
    axleDefs.push({ z: fz - 0.8, r: 0.31, w: 0.19, track: 1.32, hub: '#9a9a94' });
    axleDefs.push({ z: -fz + 0.85, r: 0.31, w: 0.19, track: 1.32, hub: '#9a9a94' });
    rearZ = -fz + 0.85;
  } else if (kind === 'paz') {
    // PAZ-672 country bus: rounded nose, split screen, cream and red
    length = 7.2; width = 2.42;
    const fz = length / 2;
    box(2.42, 1.1, length, 0, 1.05, 0, color);
    box(2.42, 0.95, length - 0.5, 0, 2.08, -0.2, '#e8e0c8');
    add('body', new THREE.CylinderGeometry(1.21, 1.21, length - 0.7, 14, 1, false, Math.PI / 2, Math.PI).scale(1, 1, 0.28), 0, 2.55, -0.25, '#e8e0c8', Math.PI / 2, 0, 0);
    box(2.44, 0.12, length + 0.02, 0, 1.57, 0, '#b02a20');
    for (const s of [-1, 1]) {
      add('glass', boxGeo(0.04, 0.62, length - 1.4), s * 1.215, 2.12, -0.4, GLASS);
      for (let z = -fz + 0.9; z < fz - 1.2; z += 1.05) box(0.05, 0.66, 0.06, s * 1.22, 2.12, z, '#e8e0c8');
      add('glass', boxGeo(1.0, 0.78, 0.04), s * 0.56, 2.15, fz - 0.28, GLASS, -0.3);
      roundLamp(s * 0.85, 0.98, fz + 0.01, 0.12);
      tail(s * 1.0, 0.95, -fz - 0.01);
    }
    add('glass', boxGeo(0.04, 1.75, 0.95), 1.215, 1.5, fz - 1.4, '#4a5660');
    box(2.42, 0.22, 0.16, 0, 0.55, fz + 0.03, '#3a3a38');
    box(1.0, 0.3, 0.05, 0, 1.2, fz + 0.01, '#d8d0b8');
    box(1.2, 0.16, 0.05, 0, 2.62, fz - 0.4, '#1a1a18');
    plate(0.55, fz + 0.12);
    plate(0.9, -fz - 0.02, true);
    axleDefs.push({ z: fz - 1.3, r: 0.47, w: 0.3, track: 1.9, hub: '#5a5a56' });
    axleDefs.push({ z: -fz + 1.65, r: 0.47, w: 0.26, track: 1.8, hub: '#5a5a56', dual: true });
    for (const z of [fz - 1.3, -fz + 1.65]) for (const s of [-1, 1]) arch(s * 0.98, z, 0.47, 0.5, DARK);
    rearZ = -fz + 1.65;
  } else {
    // MTZ-80 "Belarus" with a 2PTS-4 trailer
    length = 9.2; width = 2.2;
    const fz = length / 2;
    box(0.78, 0.7, 1.8, 0, 1.22, fz - 1.0, color);
    box(0.82, 0.06, 1.85, 0, 1.6, fz - 1.0, color);
    for (let i = 0; i < 5; i++) box(0.8, 0.03, 0.04, 0, 0.98 + i * 0.1, fz - 0.07, '#2a2a28');
    add('body', new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), 0.25, 2.05, fz - 0.6, DARK);
    box(1.35, 0.12, 1.35, 0, 2.78, fz - 2.55, '#e0dcd0');
    for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) box(0.06, 1.25, 0.06, x, 2.12, fz - 2.55 + z, DARK);
    add('glass', boxGeo(1.2, 1.0, 1.2), 0, 2.17, fz - 2.55, GLASS);
    box(1.0, 0.5, 1.2, 0, 1.25, fz - 2.55, color);
    for (const s of [-1, 1]) {
      add('head', boxGeo(0.18, 0.12, 0.04), s * 0.3, 1.35, fz - 0.07, '#f4f0dc');
      add('head', boxGeo(0.14, 0.1, 0.05), s * 0.55, 2.7, fz - 1.9, '#f4f0dc');
      const fender = new THREE.CylinderGeometry(0.88, 0.88, 0.5, 10, 1, true, 0, Math.PI);
      add('body', fender, s * 0.85, 0.78, fz - 2.6, color, 0, 0, Math.PI / 2);
    }
    box(0.12, 0.12, 1.2, 0, 0.7, fz - 3.6, DARK);
    const tz = -fz + 2.1;
    box(2.2, 0.75, 4.0, 0, 1.45, tz, '#5a6a8a');
    box(2.1, 0.08, 3.9, 0, 1.85, tz, '#8a7a5a');
    if (seed % 2) for (let i = 0; i < 6; i++) add('body', new THREE.SphereGeometry(0.45, 7, 5), -0.5 + (i % 2), 2.0, tz - 1.4 + Math.floor(i / 2) * 1.2, '#c8b070');
    for (const s of [-1, 1]) tail(s * 0.95, 1.1, -fz - 0.02);
    plate(1.1, -fz - 0.03, true);
    axleDefs.push({ z: fz - 0.6, r: 0.42, w: 0.26, track: 1.24, hub: '#c84a2a' });
    axleDefs.push({ z: fz - 2.6, r: 0.78, w: 0.42, track: 1.7, hub: '#c84a2a' });
    axleDefs.push({ z: tz + 1.1, r: 0.48, w: 0.3, track: 1.7, hub: '#5a5a56' });
    axleDefs.push({ z: tz - 1.1, r: 0.48, w: 0.3, track: 1.7, hub: '#5a5a56' });
    rearZ = fz - 2.6;
  }

  const tailMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: '#a01810', emissive: '#ff2a18', emissiveIntensity: 0 });
  tails.add(tailMat);
  const beacons = beaconDefs.map(() => new THREE.MeshLambertMaterial({ color: '#2a4aa8', emissive: '#4a7aff', emissiveIntensity: 0.05 }));
  const group = b.build({ ...M, tail: tailMat }, `veh:${kind}`);
  beaconDefs.forEach((d, i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 8), beacons[i]);
    m.position.set(d.x, d.y, d.z);
    group.add(m);
  });
  let beacon: VehicleModel['beacon'];
  if (spinAt) {
    // single rotating "migalka": chrome foot, translucent blue dome, a mirror
    // reflector spinning round the lamp, and two faint additive beams
    const dome = new THREE.MeshLambertMaterial({ color: '#3a62d8', emissive: '#3c6cff', emissiveIntensity: 0.05, transparent: true, opacity: 0.72, depthWrite: false });
    beacons.push(dome);
    const root = new THREE.Group();
    root.position.copy(spinAt);
    const chrome = new THREE.MeshLambertMaterial({ color: '#c8c8c0', emissive: '#3a3a3a' });
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.045, 16), chrome);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.012, 16), chrome);
    cap.position.y = 0.025;
    const spin = new THREE.Group();
    spin.position.y = 0.075;
    const refl = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.085, 12, 1, true, Math.PI / 2, Math.PI), new THREE.MeshLambertMaterial({ color: '#d8dce8', emissive: '#4a5a8a', side: THREE.DoubleSide }));
    refl.position.z = -0.012;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#dfe8ff' }));
    const beam = new THREE.MeshBasicMaterial({ color: '#3a6aff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beams = new THREE.Group();
    for (const r of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(1.2, 0.16).translate(0.62, 0, 0).rotateY(-Math.PI / 2);
      const q = new THREE.Mesh(g, beam);
      q.rotation.z = r;
      beams.add(q);
    }
    beams.visible = false;
    spin.add(refl, bulb, beams);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.11, 16, 1, true), dome);
    shell.position.y = 0.075;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), dome);
    top.position.y = 0.13;
    shell.renderOrder = top.renderOrder = 2;
    root.add(foot, cap, spin, shell, top);
    group.add(root);
    beacon = { spin, beams, beam, dome };
  }
  const axles = axleDefs.map((a) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, a.r, a.z);
    pivot.add(axleGroup(a.r, a.w, a.track, a.hub, a.dual));
    group.add(pivot);
    return { pivot, r: a.r };
  });
  const lights = headlights(group, heads, tailPts);
  return { group, length, width, kind, axles, tail: tailMat, beacons, rear: new THREE.Vector3(0, 0, rearZ), beacon, lights };
}

/** Spin the wheels by distance travelled. */
export function rollWheels(m: VehicleModel, ds: number): void {
  for (const a of m.axles) a.pivot.rotation.x += ds / a.r;
}
