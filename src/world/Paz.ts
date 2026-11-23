import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { headlights } from './Headlights';
import { addPlate, plateFor } from './Plates';
import type { VehicleModel } from './Vehicles';
import modelUrl from '../assets/cars/paz.glb?url';

export const PAZ_HEAD = new THREE.MeshLambertMaterial({ color: '#f2f2e8', emissive: '#ffe6b0', emissiveIntensity: 0 });
let template: THREE.Group | null = null;

export async function loadPaz(): Promise<void> {
  template = (await new GLTFLoader().loadAsync(modelUrl)).scene;
  const materials = new Map<THREE.Material, THREE.Material>();
  template.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    if (mesh.name.startsWith('Headlight_')) {
      PAZ_HEAD.map = source.map; PAZ_HEAD.needsUpdate = true; mesh.material = PAZ_HEAD;
    } else {
      if (!materials.has(source)) materials.set(source, new THREE.MeshLambertMaterial({ map: source.map, side: THREE.DoubleSide }));
      mesh.material = materials.get(source)!;
    }
  });
}

export function buildPaz(seed = 0): VehicleModel {
  if (!template) throw new Error('loadPaz() must finish before building the PAZ');
  const body = template.clone(true), group = new THREE.Group();
  group.name = 'veh:paz'; group.userData.color = 'white-blue'; group.add(body);
  group.updateMatrixWorld(true);
  const shell = body.getObjectByName('Body')!;
  const ray = new THREE.Raycaster();
  const endAt = (x: number, y: number, side: number): number => {
    ray.set(new THREE.Vector3(x, y, side * 8), new THREE.Vector3(0, 0, -side));
    return ray.intersectObject(shell, false)[0]?.point.z ?? side * 3.5;
  };

  const tail = new THREE.MeshLambertMaterial({ color: '#8e211d', emissive: '#ff2a18', emissiveIntensity: 0 });
  const heads: THREE.Vector3[] = [], rearLamps: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.8;
    const frontLens=body.getObjectByName(`Headlight_${side<0?'L':'R'}`) as THREE.Mesh;
    const front = new THREE.Vector3(x, 0.94, new THREE.Box3().setFromObject(frontLens).max.z+.005);
    const rearPanel=body.getObjectByName(`Rear_lamp_panel_${side<0?'L':'R'}`) as THREE.Mesh;
    const rearBounds=new THREE.Box3().setFromObject(rearPanel);
    const rear = new THREE.Vector3(side*.87, .90, rearBounds.min.z-.004);
    const stop = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.105), tail); stop.position.copy(rear); stop.rotation.y = Math.PI; group.add(stop);
    heads.push(front); rearLamps.push(rear);
  }
  const plate = plateFor(seed + 3205, 'fleet');
  addPlate(group, plate, new THREE.Vector3(0, 0.6, endAt(0, 0.6, 1) + 0.016));
  const rearPlate=body.getObjectByName('Rear_plate_base')!;
  addPlate(group, plate, new THREE.Vector3(0, 1.18, new THREE.Box3().setFromObject(rearPlate).min.z-.004), true);
  const axles = body.children.filter(o => o.name.startsWith('Wheel_')).map(pivot => ({ pivot, r: pivot.userData.radius as number }));
  return { group, kind: 'paz', length: 7, width: 2.5, axles, tail, beacons: [],
    rear: new THREE.Vector3(0, 0, Math.min(...axles.map(a => a.pivot.position.z))),
    lights: headlights(group, heads, rearLamps) };
}
