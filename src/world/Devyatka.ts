import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { headlights } from './Headlights';
import { addPlate, MUHA_PLATE } from './Plates';
import type { VehicleModel } from './Vehicles';
import modelUrl from '../assets/cars/devyatka.glb?url';

/**
 * Muha's car: a green VAZ-2109, prepared by scripts/models/prep-car.mjs
 * (metres, +Z forward, wheels on y = 0, wheel nodes on their axles, glass split off).
 * The windows stay the painted black tint — the shell has no cabin to see into.
 */
let template: THREE.Object3D | null = null;
let paint: THREE.MeshLambertMaterial | null = null;

export async function loadDevyatka(): Promise<void> {
  const g = await new GLTFLoader().loadAsync(modelUrl);
  let map: THREE.Texture | null = null;
  g.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.map) map = m.map;
  });
  template = g.scene;
  paint = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
}

const rc = new THREE.Raycaster();
/** The body's surface along Z at a height (front +1, back -1), or the bounding box's end. */
function endAt(body: THREE.Object3D[], y: number, sign: 1 | -1, fallback: number): number {
  rc.set(new THREE.Vector3(0, y, sign * 8), new THREE.Vector3(0, 0, -sign));
  const hit = rc.intersectObjects(body, false)[0];
  return hit ? hit.point.z : fallback;
}

export function buildDevyatka(): VehicleModel {
  if (!template || !paint) throw new Error('loadCars() must finish before building Muha\'s car');
  const root = template.clone(true);
  const group = new THREE.Group();
  group.add(root);
  const body: THREE.Mesh[] = [];
  const axles: VehicleModel['axles'] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = paint!;
    if (!/^Wheel/.test(m.name)) body.push(m);
  });
  for (const w of root.children) if (/^Wheel/.test(w.name)) axles.push({ pivot: w, r: (w.userData.radius as number) ?? 0.28 });
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  // Bumper plate, and the hatch plate above the rear bumper.
  const front = endAt(body, 0.46, 1, box.max.z);
  const back = endAt(body, 0.8, -1, box.min.z);
  addPlate(group, MUHA_PLATE, new THREE.Vector3(0, 0.46, front + 0.012));
  addPlate(group, MUHA_PLATE, new THREE.Vector3(0, 0.8, back - 0.012), true);
  const tail = new THREE.MeshLambertMaterial({ color: '#8b221a', emissive: '#ff2a18', emissiveIntensity: 0 });
  const hz = endAt(body, 0.62, 1, box.max.z);
  const tz = endAt(body, 0.72, -1, box.min.z);
  const lights = headlights(group,
    [new THREE.Vector3(0.52, 0.62, hz - 0.02), new THREE.Vector3(-0.52, 0.62, hz - 0.02)],
    [new THREE.Vector3(0.58, 0.72, tz + 0.02), new THREE.Vector3(-0.58, 0.72, tz + 0.02)]);
  const rearZ = Math.min(...axles.map((a) => a.pivot.position.z), 0);
  group.userData.color = '#1d4a38';
  return {
    group, kind: 'sedan', axles, tail, beacons: [], lights,
    length: box.max.z - box.min.z, width: box.max.x - box.min.x,
    rear: new THREE.Vector3(0, 0, rearZ),
  };
}
