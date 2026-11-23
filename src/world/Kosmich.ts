import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { headlights } from './Headlights';
import { addPlate, KOSMICH_PLATE } from './Plates';
import type { VehicleModel } from './Vehicles';
import modelUrl from '../assets/cars/kosmich404.glb?url';

let template: THREE.Object3D | null = null;

export async function loadKosmich(): Promise<void> {
  template = (await new GLTFLoader().loadAsync(modelUrl)).scene;
}

export function buildKosmich(): VehicleModel {
  if (!template) throw new Error('loadCars() must finish before building the Kosmich 404');
  const body = template.clone(true);
  const group = new THREE.Group();
  group.add(body);
  group.userData.color = 'stock';

  const axles = body.children.filter((o) => o.name.startsWith('Wheel_'))
    .map((pivot) => ({ pivot, r: pivot.userData.radius as number }));

  // The front mount is on the bumper and the rear mount is recessed into the boot.
  addPlate(group, KOSMICH_PLATE, new THREE.Vector3(0, 0.41, 2.10));
  addPlate(group, KOSMICH_PLATE, new THREE.Vector3(0, 0.67, -2.04), true);

  const tail = new THREE.MeshLambertMaterial({ color: '#8b221a', emissive: '#ff2a18', emissiveIntensity: 0 });
  const rearLamps = [-1, 1].map((side) => new THREE.Vector3(side * 0.59, 0.75, -2.058));
  for (const position of rearLamps) {
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.075), tail);
    lens.position.copy(position);
    lens.rotation.y = Math.PI;
    group.add(lens);
  }
  const lights = headlights(group, [-1, 1].map((side) => new THREE.Vector3(side * 0.59, 0.68, 2.06)), rearLamps);
  return {
    group, kind: 'kosmich404', length: 4.25, width: 1.65, axles, tail, beacons: [], lights,
    rear: new THREE.Vector3(0, 0, Math.min(...axles.map(({ pivot }) => pivot.position.z))),
  };
}
