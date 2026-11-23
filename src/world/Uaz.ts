import * as THREE from 'three';
import { plateFor, plateMaterial, plateSize, POST_PLATE } from './Plates';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { decal, decalMat, font, tex } from './Cars';
import { headlights } from './Headlights';
import type { VehicleModel } from './Vehicles';
import uazUrl from '../assets/uaz/uaz-452.glb?url';
import wheelUrl from '../assets/uaz/urman-wheel.glb?url';
import postUrl from '../assets/uaz/UazPost.png?url';
import postAlphaUrl from '../assets/uaz/UazPostAlpha.png?url';
import gasUrl from '../assets/uaz/UazGas.png?url';
import greyUrl from '../assets/uaz/UazTex.png?url';
import paletteUrl from '../assets/uaz/palette.png?url';

/**
 * The Urman-452 ("Урман-452") postal all-terrain van on Mehozavr's CC0 low-poly model (src/assets/uaz/CREDITS.md):
 * hand-painted textures in three liveries — the 1990s post van (repainted:
 * off-white over post blue, with ПОЧТА lettering, and the post-horn emblem as decals,
 * so the mirrored side UVs don't mirror the words), the emergency gas service in orange, and plain grey.
 * Local forward is +Z, left +X, wheels on y = 0, metres (as the other cars).
 */
export type UrmanLivery = 'post' | 'gas' | 'grey';
export type UazLivery = UrmanLivery;

let tpl: THREE.Object3D | null = null;
let wheelTpl: THREE.Object3D | null = null;
let loading: Promise<void> | null = null;
const maps: Record<string, THREE.Texture> = {};

export function loadUrman(): Promise<void> {
  return (loading ??= (async () => {
    const loader = new GLTFLoader();
    const [classicGltf, wheelGltf] = await Promise.all([
      loader.loadAsync(uazUrl),
      loader.loadAsync(wheelUrl),
    ]);
    tpl = classicGltf.scene;
    wheelTpl = wheelGltf.scene;
    const tl = new THREE.TextureLoader();
    await Promise.all(Object.entries({
      post: postUrl,
      postAlpha: postAlphaUrl,
      gas: gasUrl,
      grey: greyUrl,
      palette: paletteUrl
    }).map(async ([k, url]) => {
      const t = await tl.loadAsync(url);
      // the model keeps the FBX's uv convention
      t.flipY = true;
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      maps[k] = t;
    }));
  })());
}
export const loadUaz = loadUrman;

const MATS = new Map<string, THREE.Material>();
const mat = (key: string, map: THREE.Texture | null, color = '#ffffff') => {
  let m = MATS.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ map, color }); MATS.set(key, m); }
  return m;
};

// ---------------- post livery decals ----------------

let letters: THREE.Material | null = null, emblem: THREE.Material | null = null, rearLetters: THREE.Material | null = null;

/** White condensed capitals, a touch worn. */
const wordTex = (word: string, w: number, h: number, px: number, spacing: number) => tex(w, h, (g) => {
  g.fillStyle = '#f2f0e8';
  g.font = font(px);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = word.split('').join(String.fromCharCode(0x200a).repeat(spacing));
  const k = Math.min(1, (w * 0.96) / g.measureText(text).width);
  g.save(); g.translate(w / 2, h / 2 + 1); g.scale(k, 1); g.fillText(text, 0, 0); g.restore();
  // chips in the paint
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) { g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); }
});

/** The post-horn emblem: a white ring on blue, the horn coiled once with its bell to the right. */
const emblemTex = () => tex(64, 64, (g) => {
  g.fillStyle = '#244896'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f2f0e8'; g.lineWidth = 2.5; g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f2f0e8'; g.strokeStyle = '#f2f0e8'; g.lineCap = 'round';
  // the coil: an open loop of tube
  g.lineWidth = 3; g.beginPath(); g.ellipse(24, 30, 8, 7, 0, Math.PI * 0.15, Math.PI * 1.9); g.stroke();
  // the straight tube from the coil to the bell
  g.beginPath(); g.moveTo(31, 33); g.lineTo(41, 33); g.stroke();
  // a flared bell (curved sides) opening to the right
  g.beginPath(); g.moveTo(40, 31.5); g.quadraticCurveTo(46, 31, 50, 23); g.lineTo(50, 43); g.quadraticCurveTo(46, 35, 40, 34.5); g.closePath(); g.fill();
  // mouthpiece on the coil's top
  g.lineWidth = 2; g.beginPath(); g.moveTo(27, 23); g.lineTo(33, 20); g.stroke();
  // the cord with a tassel
  g.lineWidth = 1.2; g.beginPath(); g.moveTo(20, 37); g.quadraticCurveTo(30, 50, 42, 38); g.stroke();
  g.beginPath(); g.moveTo(31, 44); g.lineTo(29, 50); g.lineTo(33, 50); g.closePath(); g.fill();
});

function postDecals(group: THREE.Group, body: THREE.Mesh[]): void {
  letters ??= decalMat(wordTex('ПОЧТА', 256, 48, 46, 3));
  rearLetters ??= letters;
  emblem ??= decalMat(emblemTex());
  for (const s of [1, -1] as const) {
    // Only the word ПОЧТА on the blue below the side windows (subtitle removed per user request)
    decal(group, body, letters, 1.75, 0.33, 0.86, -0.55, 'x', s, 5);
    // the emblem on the cab doors
    decal(group, body, emblem, 0.36, 0.36, 0.92, 1.36, 'x', s, 1);
  }
  decal(group, body, emblem, 0.3, 0.3, 1.08, 0, 'z', 1);
  decal(group, body, rearLetters, 0.95, 0.18, 0.86, 0, 'z', -1, 2);
}

// ---------------- build interior ----------------

/**
 * Authentic 1990s rural post UAZ-452 cabin & cargo interior.
 * Attached to root at body offset (0, 1.3788836, 0) before root.rotation.y = Math.PI.
 * Local space: driver side is -X, passenger +X, front is -Z.
 */
function buildClassicInterior(): THREE.Group {
  const intGroup = new THREE.Group();
  intGroup.name = 'ClassicInterior';
  intGroup.position.set(0, 1.3788836, 0);

  // Natural daylight fill lights inside cabin & cargo bay
  const cabLight = new THREE.PointLight('#eef6ff', 2.2, 4.0);
  cabLight.position.set(0, 0.12, -1.50);
  intGroup.add(cabLight);

  const cargoLight = new THREE.PointLight('#eef4fa', 1.4, 3.5);
  cargoLight.position.set(0, 0.10, 0.80);
  intGroup.add(cargoLight);

  // Authentic 90s grandfather rural post UAZ materials:
  const matFloor = new THREE.MeshLambertMaterial({ color: '#2a2b2e' });
  const matCeil = new THREE.MeshLambertMaterial({ color: '#bcb9af' });    // light Soviet fabric headliner
  const matBulkhead = new THREE.MeshLambertMaterial({ color: '#4a5660' });
  const matDash = new THREE.MeshLambertMaterial({ color: '#444e56' });
  const matCluster = new THREE.MeshLambertMaterial({ color: '#1a1b1d' });
  const matDial = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#eae6dd', emissiveIntensity: 0.35 });
  const matEngine = new THREE.MeshLambertMaterial({ color: '#544234' });   // quilted padded cover
  const matSeat = new THREE.MeshLambertMaterial({ color: '#94603a', emissive: '#28170c', emissiveIntensity: 0.15 }); // grandfather cognac/saddle vinyl
  const matWheel = new THREE.MeshLambertMaterial({ color: '#222222' });   // thin bakelite rim
  const matEmblem = new THREE.MeshLambertMaterial({ color: '#d4b260' });  // steering hub brass horn button
  const matLever = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
  const matMirror = new THREE.MeshLambertMaterial({ color: '#828e9a' });
  const matSack = new THREE.MeshLambertMaterial({ color: '#c2b294' });    // burlap postal sacks
  const matBox = new THREE.MeshLambertMaterial({ color: '#9e734c' });     // wooden crate

  // 1. Floor
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.04, 3.85), matFloor);
  floor.position.set(0, -0.72, -0.20);
  intGroup.add(floor);

  // 2. Keep the headliner below the rounded roof edges.
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.04, 3.20), matCeil);
  ceil.position.set(0, 0.46, -0.08);
  intGroup.add(ceil);

  // 3. Cabin partition bulkhead behind front seats (Z = -1.05)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.76, 0.04), matBulkhead);
  wall.position.set(0, -0.34, -1.05);
  intGroup.add(wall);

  // 4. Engine doghouse hump between front seats (iconic Bukhanka layout)
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.76), matEngine);
  eng.position.set(0, -0.48, -1.58);
  intGroup.add(eng);

  // 5. Dashboard under front windshield (Z = -1.92)
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.18, 0.22), matDash);
  dash.position.set(0, -0.16, -1.92);
  intGroup.add(dash);

  // Speedometer gauge binnacle in front of driver (X = -0.45)
  const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.10), matCluster);
  cluster.position.set(-0.45, -0.04, -1.86);
  intGroup.add(cluster);

  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16), matDial);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(-0.45, -0.03, -1.80);
  intGroup.add(dial);

  // 6. Driver & Passenger Seats (Driver X = -0.45, Passenger X = +0.45, aligned with front doors)
  for (const sx of [-0.45, 0.45]) {
    // Cushion
    const cush = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), matSeat);
    cush.position.set(sx, -0.44, -1.52);
    intGroup.add(cush);

    // Backrest (slanted back 12 degrees)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.50, 0.10), matSeat);
    back.position.set(sx, -0.12, -1.32);
    back.rotation.x = 0.21;
    intGroup.add(back);

    // Headrest
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.08), matSeat);
    head.position.set(sx, 0.18, -1.26);
    intGroup.add(head);
  }

  // 7. Steering Wheel on Driver side (X = -0.45)
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.44, 12), matWheel);
  col.position.set(-0.45, -0.20, -1.78);
  col.rotation.x = Math.PI / 4;
  intGroup.add(col);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.018, 12, 24), matWheel);
  rim.position.set(-0.45, -0.06, -1.68);
  rim.rotation.x = Math.PI / 4;
  intGroup.add(rim);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.025, 12), matEmblem);
  cap.position.set(-0.45, -0.06, -1.68);
  cap.rotation.x = Math.PI / 4;
  intGroup.add(cap);

  // 8. Floor gear shift & 4WD transfer levers
  const lev1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), matLever);
  lev1.position.set(-0.24, -0.32, -1.62);
  lev1.rotation.x = -0.17;
  intGroup.add(lev1);

  const lev2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), matLever);
  lev2.position.set(-0.24, -0.36, -1.50);
  lev2.rotation.x = -0.26;
  intGroup.add(lev2);

  // 9. Rearview mirror
  const mir = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.02), matMirror);
  mir.position.set(0, 0.36, -1.86);
  intGroup.add(mir);

  // 10. Cargo compartment parcels & mail sacks (visible through rear windows)
  const sack1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.60, 8), matSack);
  sack1.position.set(-0.35, -0.42, 0.50);
  sack1.rotation.z = 0.2;
  intGroup.add(sack1);

  const sack2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.55, 8), matSack);
  sack2.position.set(0.30, -0.45, 0.90);
  sack2.rotation.z = -0.15;
  intGroup.add(sack2);

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.38, 0.46), matBox);
  crate.position.set(-0.20, -0.50, 1.25);
  crate.rotation.y = 0.18;
  intGroup.add(crate);

  // Ensure all interior parts render into depth and color buffers before transparent glass
  intGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.renderOrder = 0;
    }
  });

  return intGroup;
}

// ---------------- build vehicle models ----------------

/**
 * The canonical Urman-452 postal van:
 * - Handcrafted classic body with light reflective float glass
 * - Authentic 1990s rural post cabin & cargo interior
 * - Simplified 3D wheels with textured steel rims
 * - Clean "ПОЧТА" decals without lower subtitle
 */
export function buildUrman(livery: UrmanLivery = 'post', seed = 0): VehicleModel {
  if (!tpl || !wheelTpl) throw new Error('loadUrman() must finish before building the Urman-452');
  const root = tpl.clone(true);
  root.rotation.y = Math.PI;
  const group = new THREE.Group();
  group.add(root);

  // Add the 1990s rural post cabin interior
  const interior = buildClassicInterior();
  root.add(interior);

  const registration = livery === 'post' ? POST_PLATE : plateFor(seed * 2 + (livery === 'gas' ? 161 : 162), 'fleet');
  const registrationMaterial = plateMaterial(registration);
  const [plateWidth, plateHeight] = plateSize(registration);
  const body: THREE.Mesh[] = [];
  const axles: VehicleModel['axles'] = [];

  // Authentic 90s automotive float glass shader (light, subtle sky specular sheen, not dark tint)
  const bodyMat = new THREE.MeshStandardMaterial({
    map: maps.postAlpha ?? maps.post,
    roughness: 0.24,
    metalness: 0.16,
    transparent: true,
    opacity: 1.0,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;

    // Do not touch interior meshes
    let isInt = false;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) {
      if (p === interior) { isInt = true; break; }
    }
    if (isInt) return;

    // Wheels have their own material and are replaced below.
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) {
      if (/^Wheel/.test(p.name)) return;
    }

    m.renderOrder = 1;

    const pick = (src: THREE.Material) => {
      switch (src.name) {
        case 'UazMat': return livery === 'post' ? bodyMat : mat(`body-${livery}`, maps[livery]);
        case 'Pixelly': return mat('palette', maps.palette);
        case 'LicensePlateUaz': {
          m.scale.x *= plateWidth / 0.6372;
          m.scale.y *= plateHeight / 0.1397;
          return registrationMaterial;
        }
        default: return mat('dark', null, '#2a2a2a');
      }
    };
    m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material);

    if (!/LicensePlate/.test(m.name) && !/LicensePlate/.test(m.parent?.name ?? '')) {
      body.push(m);
    }
  });

  for (const name of ['WheelLF', 'WheelRF', 'WheelLB', 'WheelRB']) {
    const original = root.getObjectByName(name);
    if (!original?.parent) throw new Error(`Missing Urman-452 wheel mount: ${name}`);
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.copy(original.position);
    pivot.quaternion.copy(original.quaternion);
    const wheel = wheelTpl.clone(true);
    // The asset extends along +X from the mount, with its hub facing outward.
    if (pivot.position.x < 0) wheel.rotation.y = Math.PI;
    pivot.add(wheel);
    original.parent.add(pivot);
    original.removeFromParent();
    // The turned-round body reverses the spin in the model's local space.
    axles.push({ pivot, r: -0.376 });
  }

  group.updateMatrixWorld(true);
  if (livery === 'post') postDecals(group, body);

  const lights = headlights(group,
    [new THREE.Vector3(0.66, 0.74, 2.43), new THREE.Vector3(-0.66, 0.74, 2.43)],
    [new THREE.Vector3(0.86, 1.0, -1.95), new THREE.Vector3(-0.86, 1.0, -1.95)]);
  const tail = new THREE.MeshLambertMaterial({ color: '#a01810', emissive: '#ff2a18', emissiveIntensity: 0 });
  group.userData.color = livery;

  return {
    group,
    kind: 'uaz',
    axles,
    tail,
    beacons: [],
    length: 4.44,
    width: 1.94,
    rear: new THREE.Vector3(0, 0, -1.2),
    lights
  };
}
export const buildUaz = buildUrman;
export const buildUazWithInterior = buildUrman;
