import * as THREE from 'three';
import { boxGeo } from '../core/geom';
import type { Place } from './Props';
import { addPostOfficeDetails } from './PostOfficeDetails';

/** One small ground-floor room inside the existing post-office building.
 * All positions are metres, in room space. +Z faces the actual street.
 * No backdrop/second scene: the window looks directly into World.group. */
export const POST_ROOM = {
  width: 5.4, depth: 4.6, height: 2.85,
  origin: new THREE.Vector3(-1.6, .5, 2.4),
  window: { left: -2.65, right: -.95, bottom: .9, top: 2.25 },
  entrance: { left: .8, right: 2.4, top: 2.3 },
} as const;

export type PostOfficeShot = 'wide' | 'entrance' | 'zinaida' | 'hero' | 'window' | 'desk' | 'print';
export const POST_SHOTS: Record<PostOfficeShot, { eye: number[]; target: number[]; fov: number }> = {
  wide: { eye: [2.1, 1.65, -1.95], target: [-.65, 1.25, .85], fov: 65 },
  entrance: { eye: [1.65, 1.65, 1.95], target: [-.6, 1.2, -.9], fov: 68 },
  zinaida: { eye: [-1.45, 1.3, -.65], target: [-1.45, 1.25, 1.45], fov: 48 },
  hero: { eye: [-1.9, 1.35, 1.6], target: [-1.45, 1.25, -.5], fov: 52 },
  window: { eye: [-2.15, 1.65, 1.25], target: [-2.15, 1.65, 12], fov: 58 },
  desk: { eye: [-1.3, 1.5, -.1], target: [-1.55, .82, .6], fov: 62 },
  print: { eye: [1.9, 1.5, .25], target: [.8, 1.1, -2], fov: 57 },
};

function surface(color: string, kind: 'paint' | 'floor' | 'wood' = 'paint'): THREE.MeshLambertMaterial {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 128);
  let seed = 98;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1900; i++) {
    ctx.fillStyle = random() > .5 ? 'rgba(255,255,240,.045)' : 'rgba(25,22,12,.045)';
    ctx.fillRect(random() * 128, random() * 128, kind === 'wood' ? 12 : 1, 1);
  }
  if (kind === 'floor') {
    ctx.strokeStyle = 'rgba(40,31,22,.18)'; ctx.strokeRect(.5, .5, 127, 127);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  return new THREE.MeshLambertMaterial({ map });
}

export class PostOfficeInterior {
  readonly root = new THREE.Group();
  readonly furniture = new THREE.Group();
  readonly ceiling = new THREE.Group();
  readonly anchors = {
    zinaida: new THREE.Vector3(-1.45, 0, 1.3),
    hero: new THREE.Vector3(-1.05, 0, -.4),
    grandpa: new THREE.Vector3(-2.02, 0, -.55),
    document: new THREE.Vector3(-1.45, .79, .55),
  };
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly details: { dispose(): void };

  constructor(place: Place) {
    this.root.name = 'post-office-interior';
    this.root.position.copy(POST_ROOM.origin).applyAxisAngle(new THREE.Vector3(0, 1, 0), place.rot)
      .add(new THREE.Vector3(place.x, place.y, place.z));
    this.root.rotation.y = place.rot;
    this.furniture.name = 'post-office-furniture';
    this.ceiling.name = 'post-office-ceiling';
    this.root.add(this.furniture, this.ceiling);
    const plaster = surface('#d5cdb5'), green = surface('#8a9270'), floor = surface('#80705b', 'floor');
    const wood = surface('#65503d', 'wood'), trim = surface('#c6bfa6');
    const dark = new THREE.MeshLambertMaterial({ color: '#48463c' });
    const paper = new THREE.MeshLambertMaterial({ color: '#d7cba9' });
    const glass = new THREE.MeshLambertMaterial({ color: '#c3d6d0', transparent: true, opacity: .08, depthWrite: false });
    this.materials.push(plaster, green, floor, wood, trim, dark, paper, glass);
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number,
      material: THREE.Material, parent = this.root) => {
      const geo = boxGeo(w, h, d, material === floor ? 1.15 : 1);
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, material); mesh.name = name; mesh.position.set(x, y, z);
      parent.add(mesh); return mesh;
    };
    const wall = (name: string, w: number, d: number, x: number, z: number, bottom = 0, top = 2.85) => {
      const split = 1.35;
      if (bottom < split) { const hi = Math.min(split, top); box(name + '-paint', w, hi - bottom, d, x, (hi + bottom) / 2, z, green); }
      if (top > split) { const lo = Math.max(split, bottom); box(name + '-plaster', w, top - lo, d, x, (top + lo) / 2, z, plaster); }
    };
    box('linoleum', 5.4, .12, 4.6, 0, -.06, 0, floor);
    box('ceiling', 5.52, .12, 4.72, 0, 2.91, 0, plaster, this.ceiling);
    wall('left-wall', .14, 4.6, -2.77, 0);
    wall('right-wall', .14, 4.6, 2.77, 0);
    // Back room exists behind this door; its storage is deliberately not in the public room.
    wall('rear-left', 1.15, .14, -2.125, -2.37);
    wall('rear-right', 3.15, .14, 1.125, -2.37);
    wall('rear-lintel', 1.1, .14, -1, -2.37, 2.12);
    box('store-door', .98, 2.05, .065, -1, 1.025, -2.32, wood);
    for (const x of [-1.57, -.43]) box('store-door-jamb', .085, 2.2, .16, x, 1.1, -2.29, trim);
    box('store-door-head', 1.22, .085, .16, -1, 2.16, -2.29, trim);
    box('store-door-handle', .14, .025, .065, -.63, 1.02, -2.24, dark);
    // Front plaster follows exactly the two holes cut in Props.postOffice's brick shell.
    wall('front-left', .05, .08, -2.675, 2.26);
    wall('front-between', 1.75, .08, -.075, 2.26);
    wall('front-right', .3, .08, 2.55, 2.26);
    wall('window-apron', 1.7, .08, -1.8, 2.26, 0, .9);
    wall('window-lintel', 1.7, .08, -1.8, 2.26, 2.25);
    wall('entrance-lintel', 1.6, .08, 1.6, 2.26, 2.3);
    // Deep reveal, painted timber frames and a sill; clear glass has no fake scenery texture.
    for (const x of [-2.6, -1]) box('window-jamb', .09, 1.35, .3, x, 1.575, 2.45, trim);
    for (const y of [.95, 2.2]) box('window-frame', 1.7, .09, .3, -1.8, y, 2.45, trim);
    box('window-mullion', .065, 1.25, .13, -1.8, 1.575, 2.49, trim);
    box('window-transom', 1.6, .065, .13, -1.8, 1.9, 2.49, trim);
    box('window-sill', 1.85, .065, .46, -1.8, .91, 2.25, trim);
    box('window-glass', 1.5, 1.15, .008, -1.8, 1.575, 2.5, glass);
    for (const x of [.8, 2.4]) box('entrance-jamb', .1, 2.4, .29, x, 1.2, 2.45, trim);
    box('entrance-head', 1.7, .1, .29, 1.6, 2.35, 2.45, trim);
    box('entrance-door', 1.48, 2.23, .07, 1.6, 1.115, 2.48, wood);
    box('entrance-panel', 1.18, .85, .025, 1.6, 1.62, 2.43, trim);
    box('entrance-handle', .035, .18, .09, 1.04, 1.03, 2.39, dark);
    for (const x of [-2.67, 2.67]) box('skirting', .06, .1, 4.6, x, .05, 0, wood);
    box('front-skirting', 3.45, .1, .06, -.975, .05, 2.2, wood);
    box('rear-skirting-left', 1.1, .1, .06, -2.15, .05, -2.27, wood);
    box('rear-skirting-right', 3.1, .1, .06, 1.15, .05, -2.27, wood);
    // Short operator counter, one service opening, and a 1.3 m passage at the back.
    box('counter', .48, 1, 2.75, .4, .5, .925, wood);
    box('counter-top', .7, .065, 2.85, .4, 1.03, .925, wood);
    for (const z of [-.45, .45, 1.5, 2.25]) box('counter-upright', .065, 1.05, .065, .4, 1.58, z, trim);
    box('counter-header', .065, .065, 2.8, .4, 2.1, .9, trim);
    for (const [z, d] of [[0, .83], [1.88, .67]]) box('counter-glass', .008, .97, d, .4, 1.57, z, glass);
    box('service-transom', .008, .32, .99, .4, 1.91, .975, glass);
    box('service-rail', .065, .04, 1.05, .4, 1.74, .975, trim);
    // Two modest fixtures. Lighting belongs to the room, never a duplicate exterior.
    const diffuser = new THREE.MeshBasicMaterial({ color: '#e5dfc6' }); this.materials.push(diffuser);
    for (const x of [-1.3, 1.55]) {
      box('ceiling-fixture', .25, .075, 1.15, x, 2.77, -.1, dark, this.ceiling);
      box('ceiling-diffuser', .22, .025, 1.08, x, 2.72, -.1, diffuser, this.ceiling);
    }
    // Low-cost fill approximates bounced interior light without touching the global sun.
    const fill = new THREE.PointLight('#fff5de', .45, 6, 1); fill.position.set(-.3, 2.25, 0); this.root.add(fill);
    // Furniture remains a separate group for architectural review.
    box('zinaida-desk-top', 1.4, .07, .78, -1.45, .755, .55, wood, this.furniture);
    for (const x of [-1.98, -.92]) box('desk-pedestal', .3, .7, .68, x, .35, .55, wood, this.furniture);
    // Solid visitor-facing back; the knee space and drawers open towards Zinaida (+Z).
    box('desk-visitor-panel', .78, .48, .035, -1.45, .45, .225, wood, this.furniture);
    const chair = (name: string, x: number, z: number, facing: number) => {
      box(name + '-seat', .43, .065, .43, x, .46, z, wood, this.furniture);
      box(name + '-back', .43, .42, .055, x, .7, z - facing * .2, wood, this.furniture);
      for (const dx of [-.17, .17]) for (const dz of [-.17, .17]) box(name + '-leg', .035, .43, .035, x + dx, .215, z + dz, dark, this.furniture);
    };
    chair('zinaida-chair', -1.45, 1.3, -1); chair('visitor-chair', 1.85, -.65, -1);
    chair('grandpa-chair', this.anchors.grandpa.x, this.anchors.grandpa.z, 1);
    // The two required racks have different silhouettes and are visible from the entrance.
    const rack = (name: string, x: number, z: number, width: number, height: number, rows: number, cards: boolean) => {
      const g = new THREE.Group(); g.name = name; g.position.set(x, 0, z); this.furniture.add(g);
      box(name + '-base', width, .06, .42, 0, .03, 0, dark, g);
      for (const sx of [-1, 1]) box(name + '-post', .035, height, .035, sx * (width / 2 - .02), height / 2, -.14, dark, g);
      for (let i = 0; i < rows; i++) {
        const y = .25 + i * (height - .35) / rows;
        box(name + '-shelf', width, .025, .26, 0, y, 0, dark, g);
        if (cards) {
          for (const xx of [-.15, .15]) box('postcard-placeholder', .22, .17, .015, xx, y + .09, .02, paper, g);
        } else box('newspaper-placeholder', width - .08, .24, .02, 0, y + .13, -.035, paper, g);
        box(name + '-lip', width, .025, .025, 0, y + .06, .13, dark, g);
      }
    };
    rack('postcards-rack', .05, -2, .65, 1.45, 5, true);
    rack('newspapers-rack', 1.4, -2, 1.05, 1.3, 3, false);
    box('forms-shelf', .35, .045, .75, 2.49, 1.04, -.65, wood, this.furniture);
    this.details = addPostOfficeDetails(this.furniture);
    this.root.updateMatrixWorld(true);
  }

  worldPoint(local: THREE.Vector3): THREE.Vector3 { this.root.updateWorldMatrix(true, false); return this.root.localToWorld(local.clone()); }

  frame(camera: THREE.PerspectiveCamera, shot: PostOfficeShot): THREE.Vector3 {
    const view = POST_SHOTS[shot];
    camera.position.copy(this.worldPoint(new THREE.Vector3(...view.eye)));
    const target = this.worldPoint(new THREE.Vector3(...view.target));
    camera.fov = view.fov; camera.updateProjectionMatrix(); camera.lookAt(target);
    return target;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.details.dispose();
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => { if (m instanceof THREE.MeshLambertMaterial) m.map?.dispose(); m.dispose(); });
  }
}
