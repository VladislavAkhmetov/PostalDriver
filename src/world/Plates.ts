import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import { makeCanvas, toTex } from '../core/textures';

/** Registration profiles for the 1998 Bashkortostan setting. */
export type PlateUse = 'car' | 'olderCar' | 'fleet' | 'heavy' | 'patrol' | 'tractor';
export type Plate =
  | { kind: 'russian'; main: string; region: string }
  | { kind: 'sovietPrivate'; main: string }
  | { kind: 'sovietFleet' | 'sovietHeavy' | 'sovietSpecial'; digits: string; series: string }
  | { kind: 'tractor'; digits: string; series: string; region: string };

const LAT = 'АВЕКМНОРСТУХ';
const SOVIET = 'АБВГДЕЖКЛМНОПРСТУФХЦЧШ';
const REGION = '02';
const LOCAL_SERIES = 'БА';

export const POST_PLATE = { kind: 'russian', main: 'М 417 ВН', region: REGION } satisfies Plate;
export const KOSMICH_PLATE = { kind: 'russian', main: 'К 109 УМ', region: REGION } satisfies Plate;
export const MUHA_PLATE = { kind: 'russian', main: 'Е 247 КХ', region: REGION } satisfies Plate;

export function plateFor(seed: number, use: PlateUse): Plate {
  const r = mulberry32(seed);
  const letter = (alphabet: string) => alphabet[Math.floor(r() * alphabet.length)];
  const number = (max: number, places: number) => String(1 + Math.floor(r() * max)).padStart(places, '0');
  const old = r();
  if (use === 'tractor') {
    return { kind: 'tractor', digits: number(9999, 4), series: letter(LAT) + letter(LAT), region: REGION };
  }
  if (use === 'patrol') return { kind: 'sovietSpecial', digits: number(9999, 4), series: 'БАМ' };
  if (use === 'olderCar' && old < 0.45) {
    return { kind: 'sovietPrivate', main: `${letter(SOVIET).toLowerCase()} ${number(9999, 4)} ${LOCAL_SERIES}` };
  }
  if ((use === 'heavy' || use === 'fleet') && old < 0.65) {
    return { kind: use === 'heavy' ? 'sovietHeavy' : 'sovietFleet', digits: number(9999, 4), series: LOCAL_SERIES + letter(SOVIET) };
  }
  const main = `${letter(LAT)} ${number(999, 3)} ${letter(LAT)}${letter(LAT)}`;
  // Story vehicles keep their assigned numbers.
  return main === POST_PLATE.main || main === KOSMICH_PLATE.main || main === MUHA_PLATE.main ? plateFor(seed + 1, use) : { kind: 'russian', main, region: REGION };
}

/** Physical size in metres. The rear of a Soviet heavy vehicle uses the same digits and series. */
export function plateSize(p: Plate, rear = false): [number, number] {
  if (p.kind === 'tractor') return [0.288, 0.206];
  if (p.kind === 'sovietHeavy' && rear) return [0.288, 0.226];
  return [0.52, 0.112];
}

function drawPlate(g: CanvasRenderingContext2D, p: Plate, w: number, h: number, rear: boolean): void {
  const ink = '#171715';
  g.fillStyle = p.kind === 'russian' || p.kind === 'tractor' ? '#f2f0e8' : '#e5e1d6';
  g.fillRect(0, 0, w, h);
  const stroke = Math.max(1, h * 0.045);
  g.strokeStyle = ink;
  g.lineWidth = stroke;
  g.beginPath();
  g.roundRect(stroke, stroke, w - 2 * stroke, h - 2 * stroke, h * 0.08);
  g.stroke();
  g.fillStyle = ink;
  g.textBaseline = 'middle';
  g.textAlign = 'center';

  const fit = (text: string, x: number, y: number, maxW: number, size: number) => {
    g.font = `bold ${size}px Arial, sans-serif`;
    g.fillText(text, x, y, maxW);
  };
  if (p.kind === 'tractor') {
    fit(p.digits, w / 2, h * 0.29, w * 0.85, h * 0.38);
    fit(p.series, w * 0.33, h * 0.73, w * 0.45, h * 0.33);
    fit(p.region, w * 0.75, h * 0.73, w * 0.28, h * 0.29);
    return;
  }
  if (p.kind === 'sovietHeavy' && rear) {
    fit(p.digits, w / 2, h * 0.29, w * 0.85, h * 0.38);
    fit(p.series, w / 2, h * 0.73, w * 0.85, h * 0.38);
    return;
  }
  if (p.kind !== 'russian') {
    const text = p.kind === 'sovietPrivate' ? p.main : p.kind === 'sovietSpecial'
      ? `${p.series} ${p.digits}` : `${p.digits} ${p.series}`;
    fit(text, w / 2, h * 0.55, w - h * 0.42, h * 0.85);
    return;
  }

  const split = w * 0.77;
  fit(p.main, split / 2, h * 0.55, split - h * 0.32, h * 0.84);
  g.fillRect(split, h * 0.06, stroke, h * 0.88);
  const field = w - split;
  const cx = split + field / 2;
  fit(p.region, cx, h * 0.34, field * 0.8, h * 0.53);
  fit('RUS', split + field * 0.34, h * 0.77, field * 0.49, h * 0.24);
  for (const [i, color] of ['#fff', '#2048a8', '#c82820'].entries()) {
    g.fillStyle = color;
    g.fillRect(split + field * 0.61, h * (0.65 + i * 0.075), field * 0.26, h * 0.075);
  }
}

const materials = new Map<string, THREE.MeshLambertMaterial>();

/** Shared paint and typography for all vehicle meshes and fitted plates. */
export function plateMaterial(p: Plate, rear = false): THREE.MeshLambertMaterial {
  const twoRows = p.kind === 'sovietHeavy' && rear;
  const key = JSON.stringify([p, twoRows]);
  let material = materials.get(key);
  if (!material) {
    const [width, height] = plateSize(p, rear);
    const w = Math.round(width * 400), h = Math.round(height * 400);
    const canvas = makeCanvas(w, h);
    drawPlate(canvas.getContext('2d')!, p, w, h, rear);
    material = new THREE.MeshLambertMaterial({
      map: toTex(canvas, { repeat: false }),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    material.name = 'RegistrationPlate';
    materials.set(key, material);
  }
  return material;
}

export function addPlate(group: THREE.Object3D, p: Plate, position: THREE.Vector3, rear = false): void {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...plateSize(p, rear)), plateMaterial(p, rear));
  mesh.name = rear ? 'PlateRear' : 'PlateFront';
  mesh.position.copy(position);
  if (rear) mesh.rotation.y = Math.PI;
  group.add(mesh);
}
