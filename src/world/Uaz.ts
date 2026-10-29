import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { decal, decalMat, font, tex } from './Cars';
import { headlights } from './Headlights';
import type { VehicleModel } from './Vehicles';
import uazUrl from '../assets/uaz/uaz-452.glb?url';
import postUrl from '../assets/uaz/UazPost.png?url';
import gasUrl from '../assets/uaz/UazGas.png?url';
import greyUrl from '../assets/uaz/UazTex.png?url';
import paletteUrl from '../assets/uaz/palette.png?url';
import wheelUrl from '../assets/uaz/Wheel.png?url';

/**
 * The UAZ-452 "буханка" on Mehozavr's CC0 low-poly model (src/assets/uaz/CREDITS.md):
 * hand-painted textures in three liveries — the 1990s post van (repainted:
 * off-white over post blue, with ПОЧТА lettering, the district communications
 * office and the post-horn emblem as decals, so the mirrored side UVs don't
 * mirror the words), the emergency gas service in orange, and plain grey.
 * Local forward is +Z, left +X, wheels on y = 0, metres (as the other cars).
 */
export type UazLivery = 'post' | 'gas' | 'grey';

let tpl: THREE.Object3D | null = null;
let loading: Promise<void> | null = null;
const maps: Record<string, THREE.Texture> = {};

export function loadUaz(): Promise<void> {
  return (loading ??= (async () => {
    tpl = (await new GLTFLoader().loadAsync(uazUrl)).scene;
    const tl = new THREE.TextureLoader();
    await Promise.all(Object.entries({ post: postUrl, gas: gasUrl, grey: greyUrl, palette: paletteUrl, wheel: wheelUrl }).map(async ([k, url]) => {
      const t = await tl.loadAsync(url);
      // the model keeps the FBX's uv convention
      t.flipY = true;
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      maps[k] = t;
    }));
  })());
}

const MATS = new Map<string, THREE.MeshLambertMaterial>();
const mat = (key: string, map: THREE.Texture | null, color = '#ffffff') => {
  let m = MATS.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ map, color }); MATS.set(key, m); }
  return m;
};

// ---------------- post livery decals ----------------

let letters: THREE.Material | null = null, office: THREE.Material | null = null, emblem: THREE.Material | null = null, rearLetters: THREE.Material | null = null;
let plate: THREE.Texture | null = null;

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

/** "М 417 ВН 62": white 1993-pattern plate. */
const plateTex = () => tex(128, 28, (g) => {
  g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, 128, 28);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 26);
  g.fillStyle = '#141414'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = font(22);
  const text = 'М 417 ВН';
  const k = Math.min(1, 88 / g.measureText(text).width);
  g.save(); g.translate(50, 15); g.scale(k, 1); g.fillText(text, 0, 0); g.restore();
  g.fillRect(98, 3, 1.5, 22);
  g.font = font(14); g.fillText('62', 113, 11);
  g.font = font(7); g.fillText('RUS', 113, 22);
});

function postDecals(group: THREE.Group, body: THREE.Mesh[]): void {
  letters ??= decalMat(wordTex('ПОЧТА', 256, 48, 46, 3));
  office ??= decalMat(wordTex('КЛЮЧЕВСКИЙ РАЙОННЫЙ УЗЕЛ ПОЧТОВОЙ СВЯЗИ', 512, 24, 18, 0));
  rearLetters ??= letters;
  emblem ??= decalMat(emblemTex());
  for (const s of [1, -1] as const) {
    // the big word on the blue below the side windows, the office name under it
    decal(group, body, letters, 1.75, 0.33, 0.86, -0.55, 'x', s, 5);
    decal(group, body, office, 1.75, 0.075, 0.6, -0.55, 'x', s, 5);
    // the emblem on the cab doors
    decal(group, body, emblem, 0.36, 0.36, 0.92, 1.36, 'x', s, 1);
  }
  decal(group, body, emblem, 0.3, 0.3, 1.08, 0, 'z', 1);
  decal(group, body, rearLetters, 0.95, 0.18, 0.86, 0, 'z', -1, 2);
}

// ---------------- build ----------------

export function buildUaz(livery: UazLivery): VehicleModel {
  if (!tpl) throw new Error('loadUaz() must finish before building the UAZ');
  const root = tpl.clone(true);
  // the file faces -Z with its left on -X: turn it round to the game's +Z/+X
  root.rotation.y = Math.PI;
  const group = new THREE.Group();
  group.add(root);
  plate ??= plateTex();
  const body: THREE.Mesh[] = [];
  const axles: VehicleModel['axles'] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pick = (src: THREE.Material) => {
      switch (src.name) {
        case 'UazMat': return mat(`body-${livery}`, maps[livery]);
        case 'Pixelly': return mat('palette', maps.palette);
        case 'WheelMat': return mat('wheel', maps.wheel);
        case 'LicensePlateUaz': return mat('plate', plate);
        default: return mat('dark', null, '#2a2a2a');
      }
    };
    m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material);
    // glTF splits the multi-material body into sibling primitives under one node
    let wheel: THREE.Object3D | null = null;
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) if (/^Wheel/.test(p.name)) wheel = p;
    if (wheel) {
      // each wheel node sits on its axle; the turned-round root reverses its spin
      if (!axles.some((a) => a.pivot === wheel)) axles.push({ pivot: wheel, r: -0.375 });
    } else if (!/LicensePlate/.test(m.name) && !/LicensePlate/.test(m.parent?.name ?? '')) body.push(m);
  });
  group.updateMatrixWorld(true);
  if (livery === 'post') postDecals(group, body);
  const lights = headlights(group,
    [new THREE.Vector3(0.66, 0.74, 2.43), new THREE.Vector3(-0.66, 0.74, 2.43)],
    [new THREE.Vector3(0.86, 1.0, -1.95), new THREE.Vector3(-0.86, 1.0, -1.95)]);
  const tail = new THREE.MeshLambertMaterial({ color: '#a01810', emissive: '#ff2a18', emissiveIntensity: 0 });
  group.userData.color = livery;
  return { group, kind: 'uaz', axles, tail, beacons: [], length: 4.37, width: 2.0, rear: new THREE.Vector3(0, 0, -1.2), lights };
}
