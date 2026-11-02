import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { drawPlate, plateFor } from './Plates';
import { headlights } from './Headlights';
import type { VehicleModel } from './Vehicles';
import vazUrl from '../assets/cars/vaz2106-gai.glb?url';
import nivaUrl from '../assets/cars/niva-gai.glb?url';

/**
 * The GAI's own cars, 1997: a VAZ-2106 patrol saloon (`militia`) and a VAZ-2121 Niva (`militiaSuv`)
 * in white with the blue stripe and a roof bar, modelled (src/assets/cars/CREDITS.md) and prepared by
 * scripts/models/prep-car.mjs: metres, +Z forward, wheels on y = 0, the wheels as nodes on their
 * axles, the roof lenses and the glass as their own materials. Here the lenses get a glow to flash,
 * the glass a tint the crew shows through, the illegible modelled plates are covered by blue militia
 * plates, and brake lamps and the night glow of the lamps are added.
 */
export type PatrolKind = 'militia' | 'militiaSuv';

interface Spec {
  url: string;
  /** Head and tail lamp centres (x either side, y), front and rear plate heights, metres. */
  head: [number, number]; tail: [number, number]; plate: [number, number];
}
const SPEC: Record<PatrolKind, Spec> = {
  militia: { url: vazUrl, head: [0.5, 0.6], tail: [0.58, 0.66], plate: [0.3, 0.64] },
  militiaSuv: { url: nivaUrl, head: [0.55, 0.66], tail: [0.66, 0.74], plate: [0.38, 0.7] },
};

interface Template { scene: THREE.Object3D; paint: THREE.MeshLambertMaterial; glass: THREE.MeshLambertMaterial; map: THREE.Texture | null }
const templates: Partial<Record<PatrolKind, Template>> = {};
let loading: Promise<void> | null = null;

export function loadPatrol(): Promise<void> {
  return (loading ??= (async () => {
    const loader = new GLTFLoader();
    await Promise.all((Object.keys(SPEC) as PatrolKind[]).map(async (k) => {
      const g = await loader.loadAsync(SPEC[k].url);
      let map: THREE.Texture | null = null;
      g.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.map) map = m.map; });
      templates[k] = {
        scene: g.scene, map,
        paint: new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }),
        // tinted glass: the crew and the seats read through it, the sky does not wash it out
        glass: new THREE.MeshLambertMaterial({ map, color: '#7a8690', transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
      };
    }));
  })());
}

let plateMat: THREE.MeshLambertMaterial | null = null;
function militiaPlate(): THREE.MeshLambertMaterial {
  if (plateMat) return plateMat;
  const c = document.createElement('canvas'); c.width = 128; c.height = 28;
  drawPlate(c.getContext('2d')!, plateFor(7, 'militia'), 128, 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (plateMat = new THREE.MeshLambertMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
}

const rc = new THREE.Raycaster();
/** The body's surface along Z at a height (front +1, back -1), or the bounding box's end. */
function endAt(body: THREE.Object3D[], y: number, sign: 1 | -1, fallback: number): number {
  rc.set(new THREE.Vector3(0, y, sign * 8), new THREE.Vector3(0, 0, -sign));
  const hit = rc.intersectObjects(body, false)[0];
  return hit ? hit.point.z : fallback;
}

export function buildPatrol(kind: PatrolKind): VehicleModel {
  const tpl = templates[kind];
  if (!tpl) throw new Error('loadPatrol() must finish before building patrol cars');
  const spec = SPEC[kind];
  const root = tpl.scene.clone(true);
  const group = new THREE.Group();
  group.add(root);
  const beacons: THREE.MeshLambertMaterial[] = [];
  const body: THREE.Mesh[] = [];
  const axles: VehicleModel['axles'] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = (m.material as THREE.Material).name;
    if (name === 'BeaconBlue' || name === 'BeaconRed') {
      // each car flashes on its own: its lenses get their own glowing materials, blue first
      const mat = new THREE.MeshLambertMaterial({ map: tpl.map, emissive: name === 'BeaconBlue' ? '#4a7aff' : '#ff3a2a', emissiveIntensity: 0.05 });
      m.material = mat;
      if (name === 'BeaconBlue') beacons.unshift(mat); else beacons.push(mat);
    } else if (name === 'Glass') m.material = tpl.glass;
    else { m.material = tpl.paint; if (!/Wheel/.test(m.name)) body.push(m); }
  });
  for (const w of root.children) if (/^Wheel/.test(w.name)) axles.push({ pivot: w, r: (w.userData.radius as number) ?? 0.3 });
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const L = box.max.z - box.min.z;
  // blue militia plates over the modelled ones, brake lamps over the painted tail lamps
  const front = endAt(body, spec.plate[0], 1, box.max.z), back = endAt(body, spec.plate[1], -1, box.min.z);
  const plate = militiaPlate();
  for (const [z, y, s] of [[front, spec.plate[0], 1], [back, spec.plate[1], -1]] as const) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.112), plate);
    p.position.set(0, y, z + s * 0.012);
    if (s < 0) p.rotation.y = Math.PI;
    group.add(p);
  }
  const tail = new THREE.MeshLambertMaterial({ color: '#a01810', emissive: '#ff2a18', emissiveIntensity: 0, transparent: true, opacity: 0.85 });
  const tz = endAt(body, spec.tail[1], -1, box.min.z);
  for (const s of [1, -1]) {
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), tail);
    lens.position.set(s * spec.tail[0], spec.tail[1], tz - 0.01);
    lens.rotation.y = Math.PI;
    group.add(lens);
  }
  const hz = endAt(body, spec.head[1], 1, box.max.z);
  const lights = headlights(group,
    [new THREE.Vector3(spec.head[0], spec.head[1], hz - 0.03), new THREE.Vector3(-spec.head[0], spec.head[1], hz - 0.03)],
    [new THREE.Vector3(spec.tail[0], spec.tail[1], tz + 0.03), new THREE.Vector3(-spec.tail[0], spec.tail[1], tz + 0.03)]);
  const rearZ = Math.min(...axles.map((a) => a.pivot.position.z), 0);
  group.userData.color = 'police';
  // the mirrors widen the box: the body is a little narrower
  return { group, kind, axles, tail, beacons, lights, length: L, width: (box.max.x - box.min.x) * 0.88, rear: new THREE.Vector3(0, 0, rearZ) };
}
