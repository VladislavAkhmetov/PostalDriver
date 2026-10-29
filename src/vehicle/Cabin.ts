import * as THREE from 'three';
import { Bucket, boxGeo, mat, planeGeo } from '../core/geom';
import { clamp, damp, mulberry32, noise2 } from '../core/math';
import { makeCanvas, Textures, toTex } from '../core/textures';
import { RetroRenderer } from '../core/Renderer';
import { IDLE, Vehicle } from './Vehicle';

/** Driver eye in vehicle space (y=0 is 0.75 m above ground, forward is -Z). */
export const EYE = new THREE.Vector3(-0.42, 0.95, -1.08);
/** Resting downward gaze so the wheel, gauges and bonnet line sit in frame. */
export const EYE_PITCH = -0.25;
const WHEEL_Y = 0.5;
const FLOOR = 0.12;
const D2R = Math.PI / 180;
/** Windscreen overlay resolution (per pane) and wiper sweep radius in those pixels. */
const PW = 128, PH = 96, ARM = 80;
const GW = 0.835, GX = GW / 2;
/** One-piece windscreen: panes meet at the centre, the glass bows forward in the middle. */
const BOW = 0.055;
const bend = (x: number) => BOW * (x / 0.85) ** 2;

/** Rounded rectangle as a dense point loop (straight runs subdivided so the bow can bend them). */
function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const run = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.05));
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n));
  };
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i < 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  };
  run(x0 + r, y0, x1 - r, y0); arc(x1 - r, y0 + r, -Math.PI / 2);
  run(x1, y0 + r, x1, y1 - r); arc(x1 - r, y1 - r, 0);
  run(x1 - r, y1, x0 + r, y1); arc(x0 + r, y1 - r, Math.PI / 2);
  run(x0, y1 - r, x0, y0 + r); arc(x0 + r, y0 + r, Math.PI);
  return pts;
}

function bendGeo(g: THREE.BufferGeometry, offsetX = 0): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + bend(p.getX(i) + offsetX));
  g.computeVertexNormals();
  return g;
}

export type HotspotId = 'horn' | 'handbrake' | '4wd' | 'low' | 'wipers' | 'lights' | 'tape' | 'map';
export interface Hotspot { mesh: THREE.Mesh; id: HotspotId; label: string }

interface Pane {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  base: ImageData;
  tex: THREE.CanvasTexture;
  drops: { x: number; y: number; s: number; vy: number; life: number }[];
  pivot: [number, number];
}

interface Mirror { glass: THREE.Mesh; cam: THREE.PerspectiveCamera; rt: THREE.WebGLRenderTarget; pos: THREE.Vector3; normal: THREE.Vector3 }

const M = (color: THREE.ColorRepresentation, map: THREE.Texture | null = null) => new THREE.MeshLambertMaterial({ color, map });

export class Cabin {
  readonly group = new THREE.Group();
  readonly hotspots: Hotspot[] = [];
  lightsOn = false;
  wipersOn = false;
  private wheel = new THREE.Group();
  private needles: Record<'speed' | 'fuel' | 'temp' | 'oil' | 'amp', THREE.Mesh>;
  private lamps: Record<'brake' | 'oil' | 'charge' | 'beam', THREE.MeshBasicMaterial>;
  private clusterMat: THREE.MeshLambertMaterial;
  private gearLever = new THREE.Group();
  private lever4 = new THREE.Group();
  private leverLow = new THREE.Group();
  private handbrake = new THREE.Group();
  private fanBlades = new THREE.Group();
  private toggles: { wipers: THREE.Object3D; lights: THREE.Object3D };
  private wipers: THREE.Group[] = [];
  private wiperA = 0;
  private wiperPhase = 0;
  private wiperDir = 1;
  private panes: Pane[] = [];
  private paneDirty = true;
  private mirrors: Mirror[] = [];
  private fresh = new THREE.Group();
  private freshState = { ax: 0, vx: 0, az: 0, vz: 0 };
  private spots: THREE.SpotLight[] = [];
  private dashLight: THREE.PointLight;
  private temp = 40;
  onWiperEnd?: () => void;

  constructor(private T: Textures) {
    const b = new Bucket();
    this.buildShell(b);
    this.group.add(b.build({
      paint: new THREE.MeshLambertMaterial({ map: T.paintMetal, color: '#d8dee2', vertexColors: true }),
      vinyl: new THREE.MeshLambertMaterial({ map: T.vinyl, vertexColors: true }),
      rubber: new THREE.MeshLambertMaterial({ map: T.rubber, vertexColors: true }),
      seat: new THREE.MeshLambertMaterial({ map: T.seat, vertexColors: true }),
      doorCard: new THREE.MeshLambertMaterial({ map: T.doorCard, vertexColors: true }),
      flat: new THREE.MeshLambertMaterial({ vertexColors: true }),
      newspaper: new THREE.MeshLambertMaterial({ map: T.newspaper, vertexColors: true }),
      sack: new THREE.MeshLambertMaterial({ map: T.sack, vertexColors: true }),
      sticker: new THREE.MeshLambertMaterial({ map: T.sticker, vertexColors: true }),
      icon: new THREE.MeshLambertMaterial({ map: T.icon, vertexColors: true }),
      waybill: new THREE.MeshLambertMaterial({ map: T.waybill, vertexColors: true }),
      cassette: new THREE.MeshLambertMaterial({ map: T.cassette, vertexColors: true }),
      mirrorInner: new THREE.MeshBasicMaterial({ map: T.mirrorInner, vertexColors: true }),
      van: new THREE.MeshLambertMaterial({ map: T.vanSide, vertexColors: true }),
    }, 'cabin'));

    // instrument pod: a black steel box riding on the dash lip, tilted up at the
    // driver so the gauges sit in the open top half of the wheel
    const pod = new THREE.Group();
    pod.position.set(-0.42, 0.525, -1.675);
    pod.rotation.x = -0.6;
    this.group.add(pod);
    const podBody = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.15, 0.1), M('#1a1a19'));
    podBody.position.z = -0.052;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.014, 0.07), M('#202020'));
    hood.position.set(0, 0.081, -0.008);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.006, 0.006), M('#a8a8a2'));
    trim.position.set(0, -0.074, 0.002);
    pod.add(podBody, hood, trim);
    this.clusterMat = new THREE.MeshLambertMaterial({ map: T.cluster, emissive: '#a8e0b0', emissiveMap: T.cluster, emissiveIntensity: 0 });
    const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), this.clusterMat);
    cluster.position.z = 0.001;
    pod.add(cluster);
    const k = 0.5 / 384;
    const bezel = M('#b4b4ae');
    for (const [px, rad] of [[192, 43], [40, 24], [94, 24], [290, 24], [344, 24]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * k, 0.0028, 4, 28), bezel);
      ring.position.set((px - 192) * k, 0, 0.003);
      pod.add(ring);
    }
    const needle = (len: number, x: number, y: number) => {
      const g = new THREE.PlaneGeometry(len, len > 0.03 ? 0.0036 : 0.003);
      g.translate(len / 2 - 0.004, 0, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ff8a3a' }));
      m.position.set(x, y, 0.002);
      cluster.add(m);
      return m;
    };
    this.needles = {
      speed: needle(0.048, 0, 0),
      fuel: needle(0.025, (40 - 192) * k, 0),
      temp: needle(0.025, (94 - 192) * k, 0),
      oil: needle(0.025, (290 - 192) * k, 0),
      amp: needle(0.025, (344 - 192) * k, 0),
    };
    const lamp = (px: number, py: number, color: string) => {
      const mtl = new THREE.MeshBasicMaterial({ color: '#202020' });
      mtl.userData.on = new THREE.Color(color);
      const m = new THREE.Mesh(new THREE.CircleGeometry(6 * k, 8), mtl);
      m.position.set((px - 192) * k, (48 - py) * k, 0.002);
      cluster.add(m);
      return mtl;
    };
    this.lamps = { brake: lamp(140, 30, '#ff3a2a'), oil: lamp(140, 64, '#ff4a2a'), charge: lamp(244, 30, '#ff4a2a'), beam: lamp(244, 64, '#4a8aff') };

    this.buildWheel();
    this.buildExtras();
    this.buildLevers();
    this.toggles = { wipers: this.toggle(-0.14, 'wipers', 'Дворники · R'), lights: this.toggle(-0.075, 'lights', 'Фары · F') };
    this.buildGlass();
    this.buildMirrors();
    this.buildFreshener();
    this.buildTrinkets();
    this.addHit('tape', 'Магнитола «Электроника» · C', new THREE.BoxGeometry(0.2, 0.07, 0.16), 0.2, 0.15, -1.62);
    this.addHit('map', 'Путевой лист и схема · M', new THREE.BoxGeometry(0.25, 0.05, 0.32), 0.0, 0.61, -1.05);

    for (const s of [-1, 1]) {
      const sp = new THREE.SpotLight('#fff1d6', 0, 90, 0.45, 0.55, 1);
      sp.position.set(s * 0.62, -0.15, -2.05);
      sp.target.position.set(s * 0.6, -1.2, -24);
      this.group.add(sp, sp.target);
      this.spots.push(sp);
    }
    this.dashLight = new THREE.PointLight('#9fd8a8', 0, 1.2, 2);
    this.dashLight.position.set(-0.42, 0.62, -1.5);
    this.group.add(this.dashLight);
  }

  private buildShell(b: Bucket): void {
    const add = (key: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, c: THREE.ColorRepresentation = '#ffffff') => b.add(key, g, mat(x, y, z, rx, ry, rz), c);
    // UAZ-452 cab: pressed steel in light grey enamel, black rubber, dark grey leatherette
    const DASH = '#d4dadc', PILLAR = '#c2c8cb', ROOF = '#dde2e4', HUMP = '#4c4c4b', DARK = '#26241f', CHROME = '#b8b8b2';
    // ---- floor, pedals, front wall
    add('rubber', boxGeo(1.8, 0.04, 1.5, 0.5), 0, FLOOR - 0.02, -1.25);
    add('paint', boxGeo(1.8, 0.4, 0.04), 0, FLOOR + 0.2, -1.95, 0, 0, 0, '#9a9a96');
    for (const [x, w, z] of [[-0.6, 0.07, -1.74], [-0.45, 0.07, -1.74], [-0.29, 0.05, -1.7]] as [number, number, number][]) {
      add('flat', boxGeo(0.018, 0.018, 0.3), x, FLOOR + 0.2, z - 0.06, -0.9, 0, 0, '#1c1c1c');
      add('flat', boxGeo(w, 0.1, 0.018), x, FLOOR + 0.1, z + 0.06, -0.45, 0, 0, '#2a2a2a');
      // ribbed rubber pad on each pedal
      for (let i = 0; i < 4; i++) add('flat', boxGeo(w - 0.01, 0.006, 0.006), x, FLOOR + 0.07 + i * 0.022, z + 0.07 - i * 0.011, -0.45, 0, 0, '#3e3e3e');
    }
    // ---- dashboard: deep flat steel shelf, rolled front edge, vertical face
    add('paint', boxGeo(1.8, 0.025, 0.28), 0, 0.483, -1.8, 0, 0, 0, DASH);
    add('paint', new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), 0, 0.462, -1.665, 0, 0, Math.PI / 2, DASH);
    add('paint', boxGeo(1.8, 0.27, 0.025), 0, 0.33, -1.68, 0, 0, 0, DASH);
    add('paint', boxGeo(1.8, 0.03, 0.12), 0, 0.2, -1.72, 0, 0, 0, '#bdbdb8');
    // a strip of dust and grime along the base of the windscreen
    add('flat', boxGeo(1.7, 0.002, 0.07), 0, 0.497, -1.9, 0, 0, 0, '#a6a49a');
    // glovebox lid with its lock, and the stickers
    add('paint', boxGeo(0.34, 0.14, 0.012), 0.5, 0.34, -1.665, 0, 0, 0, '#cfcfca');
    add('flat', boxGeo(0.04, 0.02, 0.012), 0.5, 0.39, -1.657, 0, 0, 0, CHROME);
    add('sticker', planeGeo(0.12, 0.06), 0.66, 0.42, -1.665);
    add('icon', planeGeo(0.05, 0.075), 0.14, 0.535, -1.86, -0.2);
    // black switch strip right of the column: toggles, red hazard button, ignition lock with key
    add('flat', boxGeo(0.34, 0.075, 0.012), -0.02, 0.405, -1.672, 0, 0, 0, '#161616');
    add('flat', boxGeo(0.35, 0.005, 0.014), -0.02, 0.444, -1.672, 0, 0, 0, CHROME);
    add('flat', boxGeo(0.35, 0.005, 0.014), -0.02, 0.366, -1.672, 0, 0, 0, CHROME);
    add('flat', new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10), 0.03, 0.405, -1.664, Math.PI / 2, 0, 0, '#6a6a66');
    add('flat', new THREE.CylinderGeometry(0.01, 0.01, 0.014, 10), 0.03, 0.405, -1.66, Math.PI / 2, 0, 0, '#c8281e');
    add('flat', new THREE.CylinderGeometry(0.017, 0.017, 0.016, 10), 0.105, 0.405, -1.664, Math.PI / 2, 0, 0, CHROME);
    add('flat', boxGeo(0.012, 0.004, 0.004), 0.105, 0.405, -1.655, 0, 0, 0, '#2a2a2a');
    add('flat', boxGeo(0.014, 0.04, 0.005), 0.108, 0.385, -1.65, 0, 0, 0.18, '#c8c8c0');
    add('flat', new THREE.TorusGeometry(0.009, 0.0018, 4, 10), 0.112, 0.358, -1.649, 0, 0, 0, '#b8b8b0');
    add('flat', boxGeo(0.018, 0.026, 0.003), 0.115, 0.343, -1.648, 0, 0, 0.1, '#c8a838');
    // speaker grille and ashtray in the middle of the dash
    add('flat', boxGeo(0.17, 0.06, 0.008), 0.3, 0.4, -1.668, 0, 0, 0, '#1c1c1c');
    for (let i = 0; i < 6; i++) add('flat', boxGeo(0.15, 0.003, 0.004), 0.3, 0.382 + i * 0.0075, -1.663, 0, 0, 0, '#3e3e3c');
    add('flat', boxGeo(0.07, 0.03, 0.012), 0.12, 0.27, -1.664, 0, 0, 0, '#8a8a82');
    // radio cassette deck hung under the dash
    add('flat', boxGeo(0.19, 0.055, 0.15), 0.2, 0.15, -1.63, 0, 0, 0, '#1c1c1c');
    add('cassette', planeGeo(0.18, 0.05), 0.2, 0.15, -1.554);
    // ---- windscreen frame: one rounded pane (no divider), slim pillars, header
    add('paint', boxGeo(1.8, 0.065, 0.09), 0, 1.17, -1.86, 0, 0, 0, PILLAR);
    add('paint', boxGeo(1.8, 0.035, 0.06), 0, 0.497, -1.94, 0, 0, 0, PILLAR);
    for (const s of [-1, 1]) {
      add('paint', boxGeo(0.07, 0.69, 0.075), s * 0.9, 0.83, -1.86, 0.11, 0, 0, PILLAR);
      // grab handle on the pillar
      add('flat', new THREE.CylinderGeometry(0.011, 0.011, 0.34, 6), s * 0.84, 0.86, -1.82, 0.11, 0, 0, '#b0b0aa');
      for (const y of [0.7, 1.02]) add('flat', boxGeo(0.05, 0.02, 0.02), s * 0.862, y, -1.835 + (y - 0.86) * 0.11, 0, 0, 0, '#b0b0aa');
    }
    // ---- roof: ribs, dome light, visors, interior mirror stalk
    add('paint', boxGeo(1.82, 0.03, 1.5), 0, 1.235, -1.2, 0, 0, 0, ROOF);
    for (const z of [-1.6, -1.25, -0.9, -0.55]) add('paint', boxGeo(1.8, 0.025, 0.04), 0, 1.214, z, 0, 0, 0, '#c4c4bf');
    // round dome light: chrome rim, frosted lens, a wire stapled along a roof rib
    add('flat', new THREE.CylinderGeometry(0.06, 0.064, 0.018, 14), 0, 1.212, -1.08, 0, 0, 0, '#9a9a94');
    add('flat', new THREE.SphereGeometry(0.052, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.203, -1.08, Math.PI, 0, 0, '#f0ecd8');
    add('flat', boxGeo(0.006, 0.006, 0.5), 0.02, 1.218, -1.35, 0, 0, 0, '#1c1c1c');
    // padded grey visors with sewn edges and a hinge rod
    for (const s of [-1, 1]) {
      add('flat', boxGeo(0.46, 0.022, 0.17), s * 0.45, 1.2, -1.76, 0.1, 0, 0, '#8e8e8a');
      add('flat', boxGeo(0.44, 0.024, 0.006), s * 0.45, 1.2, -1.677, 0.1, 0, 0, '#6e6e6a');
      add('flat', new THREE.CylinderGeometry(0.006, 0.006, 0.46, 5), s * 0.45, 1.214, -1.845, 0, 0, Math.PI / 2, CHROME);
    }
    // small pale interior mirror on a short stalk
    add('flat', boxGeo(0.165, 0.058, 0.02), 0, 1.075, -1.802, 0, 0, 0, '#a8a8a2');
    add('flat', boxGeo(0.012, 0.08, 0.012), 0, 1.15, -1.81, 0, 0, 0, '#8a8a86');
    // ---- doors: pressed steel with stamped panels, sliding windows
    for (const s of [-1, 1]) {
      add('paint', boxGeo(0.035, 0.44, 1.08), s * 0.905, 0.34, -1.24, 0, 0, 0, '#cacac5');
      for (const z of [-1.5, -0.98]) add('paint', boxGeo(0.02, 0.2, 0.36), s * 0.885, 0.32, z, 0, 0, 0, '#d4d4cf');
      add('paint', boxGeo(0.07, 0.04, 1.1), s * 0.9, 0.57, -1.24, 0, 0, 0, '#c2c2bd');
      add('paint', boxGeo(0.05, 0.045, 1.1), s * 0.91, 1.13, -1.24, 0, 0, 0, PILLAR);
      add('paint', boxGeo(0.035, 0.55, 0.03), s * 0.91, 0.85, -1.3, 0, 0, 0, PILLAR);
      add('paint', boxGeo(0.09, 1.12, 0.1), s * 0.9, 0.66, -0.68, 0, 0, 0, PILLAR);
      add('flat', boxGeo(0.03, 0.025, 0.12), s * 0.875, 0.45, -1.5, 0, 0, 0, CHROME);
      add('flat', boxGeo(0.02, 0.02, 0.05), s * 0.875, 0.45, -1.43, 0, 0, 0, CHROME);
      add('van', planeGeo(1.18, 0.9, 0, 0, 0.37, 0.56), s * 0.975, 0.09, -1.31, 0, s * Math.PI / 2);
    }
    // ---- engine cover between the seats: dark grey padded leatherette with sewn ribs
    const hump = new THREE.CylinderGeometry(0.29, 0.29, 0.8, 14, 1, false, Math.PI / 2, Math.PI);
    hump.rotateX(Math.PI / 2);
    hump.scale(1, 0.62, 1);
    add('flat', boxGeo(0.58, 0.3, 0.8), 0.2, FLOOR + 0.15, -1.2, 0, 0, 0, '#3e3e3d');
    add('flat', hump, 0.2, FLOOR + 0.3, -1.2, 0, 0, 0, HUMP);
    add('flat', boxGeo(0.58, 0.2, 0.2), 0.2, 0.36, -1.62, 0.55, 0, 0, '#454544');
    for (const z of [-1.48, -1.2, -0.92]) {
      const rib = new THREE.CylinderGeometry(0.293, 0.293, 0.014, 14, 1, true, Math.PI / 2, Math.PI);
      rib.rotateX(Math.PI / 2);
      rib.scale(1, 0.62, 1);
      add('flat', rib, 0.2, FLOOR + 0.3, z, 0, 0, 0, '#2c2c2b');
    }
    add('flat', boxGeo(0.012, 0.008, 0.8), 0.2, FLOOR + 0.48, -1.2, 0, 0, 0, '#2c2c2b');
    // cover latches and the hinge strip along the front
    for (const x of [-0.09, 0.49]) for (const z of [-1.45, -0.95]) {
      add('flat', boxGeo(0.014, 0.05, 0.05), x, FLOOR + 0.28, z, 0, 0, 0, '#2a2a28');
      add('flat', boxGeo(0.016, 0.014, 0.03), x + Math.sign(x - 0.2) * 0.004, FLOOR + 0.3, z, 0, 0, 0, CHROME);
    }
    add('flat', boxGeo(0.56, 0.014, 0.02), 0.2, FLOOR + 0.33, -1.6, 0, 0, 0, '#8a8a84');
    // the postman's clutter on the hump
    add('newspaper', boxGeo(0.3, 0.05, 0.22, 0.3), 0.24, 0.625, -1.42, 0, 0.25, -0.05);
    add('newspaper', boxGeo(0.28, 0.01, 0.2, 0.28), 0.2, 0.655, -1.4, 0, -0.2);
    add('flat', new THREE.CylinderGeometry(0.045, 0.045, 0.27, 8), 0.38, 0.72, -0.95, 0, 0, 0, '#5a7a5a');
    add('flat', new THREE.CylinderGeometry(0.047, 0.047, 0.05, 8), 0.38, 0.87, -0.95, 0, 0, 0, '#9a9a98');
    add('waybill', boxGeo(0.22, 0.012, 0.3, 0.3), 0.1, 0.61, -1.08, 0, 0.15, 0.04);
    // ---- seats: dark vinyl cushions on painted boxes
    for (const x of [-0.48, 0.62]) {
      add('seat', boxGeo(0.5, 0.12, 0.46), x, 0.42, -0.6);
      add('seat', boxGeo(0.5, 0.58, 0.1), x, 0.76, -0.36, 0.12);
      add('paint', boxGeo(0.46, 0.3, 0.42), x, 0.22, -0.6, 0, 0, 0, '#7a7a76');
    }
    // ---- steering column rising steeply out of the floor
    add('flat', new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6), -0.42, WHEEL_Y - 0.25, -1.62, 0.73, 0, 0, '#1c1c1c');
    add('flat', new THREE.CylinderGeometry(0.04, 0.046, 0.2, 8), -0.42, WHEEL_Y - 0.085, -1.5, 0.73, 0, 0, DARK);
    // ---- outer mirror arms (round heads are built with the mirror glass)
    for (const s of [-1, 1]) {
      // arms run behind the mirror head so they never cross the glass
      add('flat', new THREE.CylinderGeometry(0.01, 0.01, 0.34, 5), s * 1.03, 0.8, -1.95, 0, 0, Math.PI / 2 - s * 0.12, '#1e1e1e');
      add('flat', new THREE.CylinderGeometry(0.01, 0.01, 0.24, 5), s * 1.1, 0.72, -1.95, 0, 0, s * 0.9, '#1e1e1e');
    }
    this.buildDetails(add);
    this.buildBulkheadAndCargo(add);
    // ---- exterior shell, seen in the side mirrors
    for (const s of [-1, 1]) {
      add('van', planeGeo(3.05, 1.6), s * 0.975, 0.44, 0.805, 0, s * Math.PI / 2);
      add('flat', boxGeo(0.06, 0.08, 4.25), s * 0.95, 1.28, 0.2, 0, 0, 0, '#e8e6df');
      for (const z of [-1.15, 1.15]) {
        add('flat', new THREE.CylinderGeometry(0.4, 0.4, 0.22, 10), s * 0.82, -0.35, z, 0, 0, Math.PI / 2, '#1a1a1a');
        add('flat', new THREE.CylinderGeometry(0.17, 0.17, 0.23, 8), s * 0.82, -0.35, z, 0, 0, Math.PI / 2, '#5a6a5a');
      }
    }
  }

  /** Small period clutter that makes the cab read as a working 90s Bukhanka. */
  private buildDetails(add: (key: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number, c?: THREE.ColorRepresentation) => void): void {
    const DARK = '#1a1a18', CHROME = '#9a9a92';
    // heater ("печка") hung under the dash, its fan drum and hoses into the front wall
    add('paint', boxGeo(0.34, 0.17, 0.22), 0.3, 0.1, -1.79, 0, 0, 0, '#5e5e52');
    add('paint', new THREE.CylinderGeometry(0.085, 0.085, 0.12, 10), 0.53, 0.1, -1.79, 0, 0, Math.PI / 2, '#4e4e44');
    for (const x of [0.2, 0.38]) add('flat', new THREE.CylinderGeometry(0.018, 0.018, 0.28, 6), x, 0.04, -1.86, 1.2, 0, 0, DARK);
    add('flat', boxGeo(0.02, 0.06, 0.012), 0.22, 0.155, -1.672, 0, 0, 0.3, '#2a2a28');
    // windscreen demister slots on the dash top
    for (const x of [-0.45, 0.45]) add('flat', boxGeo(0.3, 0.006, 0.035), x, 0.497, -1.9, 0, 0, 0, '#222220');
    // wiring loom sagging under the dash, a few coloured strays
    for (let i = 0; i < 8; i++) {
      const x0 = -0.82 + i * 0.12, sag = Math.sin((i / 7) * Math.PI) * 0.03;
      add('flat', new THREE.CylinderGeometry(0.012, 0.012, 0.125, 5), x0 + 0.06, 0.175 - sag, -1.72, 0, 0, Math.PI / 2 + (i < 4 ? 0.12 : -0.12), DARK);
    }
    for (const [x, c] of [[-0.62, '#8a2a20'], [-0.5, '#c8a830'], [-0.36, '#3a5a8a']] as [number, string][]) add('flat', new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), x, 0.13, -1.71, 0.3, 0, 0.2, c);
    // choke and hand-throttle pull knobs under the instruments
    for (const [x, c] of [[-0.62, '#151515'], [-0.55, '#151515']] as [number, string][]) {
      add('flat', new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4), x, 0.255, -1.65, Math.PI / 2, 0, 0, CHROME);
      add('flat', new THREE.CylinderGeometry(0.013, 0.013, 0.018, 8), x, 0.255, -1.633, Math.PI / 2, 0, 0, c);
    }
    // slotted screw heads along the dash face and the glovebox
    for (let x = -0.85; x <= 0.86; x += 0.17) add('flat', new THREE.CylinderGeometry(0.006, 0.006, 0.006, 6), x, 0.448, -1.666, Math.PI / 2, 0, 0, '#8a8676');
    // cigarettes and matches on the dash top
    add('flat', boxGeo(0.055, 0.022, 0.085), 0.36, 0.507, -1.74, 0, 0.3, 0, '#d4c49a');
    add('flat', boxGeo(0.056, 0.023, 0.03), 0.36, 0.508, -1.74, 0, 0.3, 0, '#a8281e');
    add('flat', boxGeo(0.05, 0.016, 0.036), 0.27, 0.504, -1.7, 0, -0.2, 0, '#d8b84a');
    // seat piping and tubular frames
    for (const x of [-0.48, 0.62]) {
      add('flat', boxGeo(0.5, 0.018, 0.018), x, 0.48, -0.37, 0, 0, 0, '#2c2c2c');
      add('flat', boxGeo(0.5, 0.016, 0.016), x, 0.47, -0.83, 0, 0, 0, '#2c2c2c');
      for (const sx of [-0.24, 0.24]) add('flat', boxGeo(0.016, 0.58, 0.016), x + sx, 0.76, -0.31, 0.12, 0, 0, '#2c2c2c');
      for (const sx of [-0.22, 0.22]) add('flat', new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), x + sx, 0.22, -0.82, 0, 0, 0, '#2a2a26');
    }
    // fire extinguisher clamped by the passenger seat
    add('flat', new THREE.CylinderGeometry(0.048, 0.048, 0.3, 8), 0.33, FLOOR + 0.17, -0.42, 0, 0, 0, '#a8281e');
    add('flat', boxGeo(0.06, 0.05, 0.05), 0.33, FLOOR + 0.35, -0.42, 0, 0, 0, '#2a2a28');
    // dried mud clods on the floor mat
    const r = mulberry32(919);
    for (let i = 0; i < 14; i++) {
      const x = -0.75 + r() * 0.75, z = -1.75 + r() * 1.0;
      add('flat', new THREE.SphereGeometry(0.03 + r() * 0.04, 5, 3), x, FLOOR + 0.005, z, 0, r() * 3, 0, ['#3a3024', '#4a3c2a', '#2e261c'][i % 3]);
    }
    // door hardware: sliding-window latches, pull straps, window channels
    for (const s of [-1, 1]) {
      add('flat', boxGeo(0.03, 0.03, 0.05), s * 0.895, 0.62, -1.32, 0, 0, 0, CHROME);
      add('flat', boxGeo(0.012, 0.03, 0.2), s * 0.875, 0.52, -1.0, 0, 0, 0, '#3a2a1e');
      add('flat', boxGeo(0.02, 0.02, 1.08), s * 0.918, 0.6, -1.24, 0, 0, 0, '#1c1c1a');
      add('flat', boxGeo(0.02, 0.02, 1.08), s * 0.918, 1.11, -1.24, 0, 0, 0, '#1c1c1a');
    }
  }

  /** Transparent / animated / canvas-textured extras that cannot go through the bucket. */
  private buildExtras(): void {
    // dirty sliding door glass: front pane slides behind the rear one
    const glassMat = new THREE.MeshBasicMaterial({ color: '#a8b0a8', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const s of [-1, 1]) for (const [z, dx] of [[-1.56, 0], [-1.04, 0.012]] as [number, number][]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.5), glassMat);
      g.position.set(s * (0.918 - dx), 0.86, z);
      g.rotation.y = Math.PI / 2;
      g.renderOrder = 4;
      this.group.add(g);
    }
    // "Ветерок" dashboard fan
    const fan = new THREE.Group();
    fan.position.set(0.7, 0.63, -1.79);
    fan.rotation.y = -1.0;
    fan.scale.setScalar(1.35);
    const black = M('#1e1e1c');
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.03, 10), black);
    base.position.y = -0.1;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 5), black);
    stem.position.y = -0.055;
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 4, 16), M('#8a8a84'));
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 8), black);
    motor.rotation.x = Math.PI / 2;
    motor.position.z = -0.03;
    this.fanBlades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.065, 0.004), M('#3a5a6a'));
      b.position.y = 0.036;
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * Math.PI * 2;
      b.rotation.y = 0.4;
      arm.add(b);
      this.fanBlades.add(arm);
    }
    fan.add(base, stem, cage, motor, this.fanBlades);
    this.group.add(fan);
    // 1998 pocket-calendar poster on the partition
    const c = document.createElement('canvas');
    c.width = 64; c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, 64, 96);
    const sky = g.createLinearGradient(0, 4, 0, 44);
    sky.addColorStop(0, '#5a7aa0'); sky.addColorStop(1, '#c8a878');
    g.fillStyle = sky; g.fillRect(4, 4, 56, 40);
    g.fillStyle = '#3a4a2a'; g.beginPath(); g.moveTo(4, 44); g.lineTo(18, 30); g.lineTo(30, 38); g.lineTo(46, 24); g.lineTo(60, 36); g.lineTo(60, 44); g.fill();
    g.fillStyle = '#a8281e'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('1998', 32, 56);
    g.fillStyle = '#3a3a36';
    for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) g.fillRect(8 + col * 7, 62 + row * 6, 4, 3);
    g.fillStyle = '#a8281e'; g.fillRect(8 + 6 * 7, 62, 4, 27);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), new THREE.MeshLambertMaterial({ map: tex }));
    cal.position.set(0.7, 0.95, -0.268);
    cal.rotation.set(0, Math.PI, 0.03);
    this.group.add(cal);
  }

  /**
   * Cab partition with its small window and the cargo bay behind it (shelves,
   * parcels, mail sacks, rear doors with glass) — what the interior mirror shows.
   */
  private buildBulkheadAndCargo(add: (key: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number, c?: THREE.ColorRepresentation) => void): void {
    const WALL = '#c9c8c2', Z = -0.25, BACK = 2.42, Y0 = FLOOR, Y1 = 1.24;
    // partition built around a 0.9 x 0.36 window opening at y 0.78..1.14
    add('paint', boxGeo(1.82, 0.66, 0.03), 0, Y0 + 0.33, Z, 0, 0, 0, WALL);
    add('paint', boxGeo(1.82, 0.1, 0.03), 0, 1.19, Z, 0, 0, 0, WALL);
    for (const s of [-1, 1]) add('paint', boxGeo(0.46, 0.36, 0.03), s * 0.68, 0.96, Z, 0, 0, 0, WALL);
    for (const x of [-0.15, 0.15]) add('flat', boxGeo(0.012, 0.36, 0.012), x, 0.96, Z, 0, 0, 0, '#3a3a36');
    // cargo bay shell (inside faces)
    const L = BACK - Z, zc = (Z + BACK) / 2;
    add('rubber', boxGeo(1.8, 0.03, L, 0.5), 0, Y0 - 0.015, zc, 0, 0, 0, '#6a6a66');
    add('paint', boxGeo(1.82, 0.03, L), 0, Y1 + 0.01, zc, 0, 0, 0, '#d0d0cb');
    for (const s of [-1, 1]) {
      add('paint', boxGeo(0.03, Y1 - Y0, L), s * 0.93, (Y0 + Y1) / 2, zc, 0, 0, 0, WALL);
      for (let z = Z + 0.5; z < BACK; z += 0.6) add('paint', boxGeo(0.04, Y1 - Y0, 0.05), s * 0.905, (Y0 + Y1) / 2, z, 0, 0, 0, '#b4b3ad');
    }
    // rear doors: two leaves, each with a window opening left open to the road behind
    for (const s of [-1, 1]) {
      const cx = s * 0.46;
      add('paint', boxGeo(0.9, 0.55, 0.04), cx, Y0 + 0.275, BACK, 0, 0, 0, WALL);
      add('paint', boxGeo(0.9, 0.12, 0.04), cx, Y1 - 0.06, BACK, 0, 0, 0, WALL);
      add('paint', boxGeo(0.14, 0.45, 0.04), cx + s * 0.38, 0.9, BACK, 0, 0, 0, WALL);
      add('paint', boxGeo(0.14, 0.45, 0.04), cx - s * 0.38, 0.9, BACK, 0, 0, 0, WALL);
      add('flat', boxGeo(0.03, 0.08, 0.05), cx - s * 0.36, 0.55, BACK - 0.03, 0, 0, 0, '#8a8a84');
    }
    // timber shelving along the left wall with parcels and a shelf of letters
    for (const y of [0.42, 0.82]) add('planks', boxGeo(0.42, 0.03, 1.9), -0.7, y, 1.0, 0, 0, 0, '#9a8a6a');
    for (const z of [0.06, 1.0, 1.94]) add('flat', boxGeo(0.04, 0.9, 0.04), -0.5, 0.57, z, 0, 0, 0, '#6a5a44');
    const r = mulberry32(31);
    for (let i = 0; i < 9; i++) {
      const w = 0.18 + r() * 0.2, h = 0.12 + r() * 0.16, d = 0.2 + r() * 0.2;
      const shelf = i % 2 === 0 ? 0.42 : 0.82;
      add('flat', boxGeo(w, h, d), -0.7 + (r() - 0.5) * 0.1, shelf + 0.015 + h / 2, 0.2 + (i / 9) * 1.6, 0, (r() - 0.5) * 0.4, 0, ['#b08a5a', '#c49a62', '#a07848', '#d8c8a0'][i % 4]);
    }
    for (let i = 0; i < 5; i++) add('flat', boxGeo(0.02, 0.012, 0.12), -0.63 + i * 0.03, 0.85, 1.4, 0, 0, 0, '#e8e4d8');
    // mail sacks and parcels on the floor, a spare wheel against the doors
    add('sack', new THREE.SphereGeometry(0.3, 7, 5), 0.35, Y0 + 0.22, 0.4, 0, 0.4, 0);
    add('sack', new THREE.SphereGeometry(0.26, 7, 5), 0.5, Y0 + 0.2, 1.0, 0.2, 1.2, 0, '#d8d8e0');
    add('sack', new THREE.SphereGeometry(0.22, 7, 5), 0.15, Y0 + 0.18, 1.5, 0, 0.7, 0, '#c8c0b0');
    add('flat', boxGeo(0.45, 0.32, 0.38), 0.45, Y0 + 0.16, 1.85, 0, 0.2, 0, '#b08a5a');
    add('flat', boxGeo(0.3, 0.22, 0.3), 0.42, Y0 + 0.43, 1.83, 0, -0.1, 0, '#c49a62');
    add('flat', new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10), 0.55, Y0 + 0.4, BACK - 0.16, Math.PI / 2, 0, 0, '#1a1a1a');
    add('flat', new THREE.CylinderGeometry(0.17, 0.17, 0.23, 8), 0.55, Y0 + 0.4, BACK - 0.16, Math.PI / 2, 0, 0, '#5a6a5a');
    // a sack slumped against the partition, visible over the shoulder
    add('sack', new THREE.SphereGeometry(0.28, 7, 5), 0.06, 0.3, -0.5, 0, 0.4, 0);
  }

  private addHit(id: HotspotId, label: string, g: THREE.BufferGeometry, x: number, y: number, z: number, parent: THREE.Object3D = this.group): THREE.Mesh {
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y, z);
    parent.add(m);
    this.hotspots.push({ mesh: m, id, label });
    return m;
  }

  private buildWheel(): void {
    const tilt = new THREE.Group();
    tilt.position.set(-0.42, WHEEL_Y, -1.42);
    tilt.rotation.x = -0.96;
    this.group.add(tilt);
    tilt.add(this.wheel);
    // big thin black bakelite three-spoke wheel with a smooth round rim
    const black = new THREE.MeshLambertMaterial({ color: '#141414', emissive: '#050505' });
    const R = 0.245;
    this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.0115, 8, 56), black));
    for (const a of [-90, 30, 150]) {
      // flat steel spokes sleeved in black plastic, widening into the hub
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.016, R - 0.05, 0.006), black);
      const m = (R + 0.05) / 2;
      sp.position.set(Math.cos(a * D2R) * m, Math.sin(a * D2R) * m, -0.018);
      sp.rotation.z = a * D2R - Math.PI / 2;
      sp.rotation.x = 0.12;
      this.wheel.add(sp);
      const root = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.012), black);
      root.position.set(Math.cos(a * D2R) * 0.068, Math.sin(a * D2R) * 0.068, -0.026);
      root.rotation.z = a * D2R - Math.PI / 2;
      this.wheel.add(root);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), black);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.03;
    hub.scale.set(1, 0.6, 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 4, 14), M('#9a9a94'));
    ring.position.z = -0.03;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), M('#7a1e18'));
    cap.position.z = 0.004;
    this.wheel.add(hub, ring, cap);
    this.addHit('horn', 'Клаксон · H', new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), 0, 0, 0, tilt).rotation.x = Math.PI / 2;
  }

  private lever(g: THREE.Group, x: number, z: number, len: number, knob: string): void {
    g.position.set(x, FLOOR, z);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.013, len, 5), M('#1c1c1c'));
    rod.position.y = len / 2;
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.026, 7, 5), M(knob));
    k.position.y = len;
    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 7), M('#262626'));
    boot.position.y = 0.04;
    g.add(rod, k, boot);
    this.group.add(g);
  }

  private buildLevers(): void {
    // long cranked gear lever and the two transfer-case levers rising out of the floor
    this.lever(this.gearLever, -0.13, -1.4, 0.66, '#151515');
    this.lever(this.lever4, -0.19, -1.02, 0.46, '#7a2a22');
    this.lever(this.leverLow, -0.12, -1.02, 0.46, '#151515');
    this.addHit('4wd', 'Передний мост · Z', new THREE.BoxGeometry(0.09, 0.12, 0.09), 0, 0.43, 0, this.lever4);
    this.addHit('low', 'Понижающая передача · X', new THREE.BoxGeometry(0.09, 0.12, 0.09), 0, 0.43, 0, this.leverLow);
    this.handbrake.position.set(-0.2, FLOOR, -1.58);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), M('#2a2a2a'));
    rod.position.y = 0.21;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 6), M('#151515'));
    grip.position.y = 0.44;
    this.handbrake.add(rod, grip);
    this.group.add(this.handbrake);
    this.addHit('handbrake', 'Ручник · Пробел', new THREE.BoxGeometry(0.1, 0.2, 0.1), 0, 0.38, 0, this.handbrake);
  }

  private toggle(x: number, id: HotspotId, label: string): THREE.Object3D {
    const g = new THREE.Group();
    g.position.set(x, 0.405, -1.676);
    const bez = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 8), M('#8a8a86'));
    bez.rotation.x = Math.PI / 2;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 5), M('#d8d8d0'));
    stick.position.z = 0.012;
    stick.rotation.x = Math.PI / 2;
    const piv = new THREE.Group();
    piv.add(stick);
    g.add(bez, piv);
    this.group.add(g);
    this.addHit(id, label, new THREE.BoxGeometry(0.05, 0.05, 0.05), 0, 0, 0, g);
    return piv;
  }

  private buildGlass(): void {
    const frame = new THREE.Group();
    frame.position.set(0, 0.5, -1.93);
    frame.rotation.x = 0.11;
    this.group.add(frame);
    const r = mulberry32(77);
    for (const [cx, pivotX] of [[-GX, -0.76], [GX, 0.08]]) {
      const canvas = makeCanvas(PW, PH);
      const ctx = canvas.getContext('2d')!;
      const pivot: [number, number] = [((pivotX - cx + GW / 2) / GW) * PW, (1 - 0.03 / 0.62) * PH];
      const base = ctx.createImageData(PW, PH);
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        const dx = x - pivot[0], dy = pivot[1] - y;
        const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        const swept = d < ARM && d > 10 && a > -0.05 && a < 1.9;
        const edge = Math.max(0, 1 - Math.min(x, PW - 1 - x, y * 2, PH - 1 - y) / 18);
        let alpha = (0.08 + noise2(x * 0.12, y * 0.12, 3) * 0.12 + edge * 0.26) * (swept ? 0.25 : 1);
        if (r() < 0.0015) alpha = 0.5;
        const i = (y * PW + x) * 4;
        base.data[i] = 120; base.data[i + 1] = 108; base.data[i + 2] = 86; base.data[i + 3] = Math.round(clamp(alpha, 0, 1) * 255);
      }
      const tex = toTex(canvas, { repeat: false, mip: false });
      const mesh = new THREE.Mesh(bendGeo(new THREE.PlaneGeometry(GW, 0.62, 10, 1), cx), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      mesh.position.set(cx, 0.31, 0.004);
      mesh.renderOrder = 5;
      frame.add(mesh);
      this.panes.push({ canvas, ctx, base, tex, drops: [], pivot });

      const w = new THREE.Group();
      w.position.set(pivotX, 0.03, 0.014);
      const black = M('#141414');
      const armM = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.012, 0.008), black);
      armM.position.x = 0.26;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.016, 0.012), black);
      blade.position.set(0.31, 0, -0.006);
      w.add(armM, blade);
      frame.add(w);
      this.wipers.push(w);
    }
    // painted frame with a rounded opening, and the black rubber seal following it
    const R0 = 0.115, ih = 0.62;
    const hole = roundedRect(-GW, 0, GW, ih, R0);
    const panel = new THREE.Shape(roundedRect(-0.95, -0.07, 0.95, ih + 0.09, 0.02));
    panel.holes.push(new THREE.Path([...hole].reverse()));
    const panelM = new THREE.Mesh(bendGeo(new THREE.ShapeGeometry(panel)), M('#c2c8cb'));
    panelM.position.z = 0.016;
    const ring = new THREE.Shape(roundedRect(-GW - 0.004, -0.004, GW + 0.004, ih + 0.004, R0 + 0.004));
    ring.holes.push(new THREE.Path(roundedRect(-GW + 0.02, 0.02, GW - 0.02, ih - 0.02, R0 - 0.02).reverse()));
    const seal = new THREE.Mesh(bendGeo(new THREE.ShapeGeometry(ring)), M('#0c0c0c'));
    seal.position.z = 0.01;
    frame.add(panelM, seal);
  }

  private buildMirrors(): void {
    const flip = (rt: THREE.WebGLRenderTarget) => { rt.texture.repeat.set(-1, 1); rt.texture.offset.set(1, 0); return rt.texture; };
    // round outside mirrors on long arms, like the real Bukhanka
    for (const s of [-1, 1]) {
      const rt = new THREE.WebGLRenderTarget(56, 56, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      const ry = s < 0 ? 0.25 : -0.35;
      const head = new THREE.Group();
      head.position.set(s * 1.2, 0.84, -1.885);
      head.rotation.y = ry;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.092, 0.035, 14), M('#161616'));
      shell.rotation.x = Math.PI / 2;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.088, 14), new THREE.MeshBasicMaterial({ map: flip(rt), color: '#c8d0d4', fog: false }));
      glass.position.z = 0.019;
      head.add(shell, glass);
      this.group.add(head);
      head.updateMatrix();
      const pos = new THREE.Vector3(0, 0, 0.019).applyMatrix4(head.matrix);
      const cam = new THREE.PerspectiveCamera(26, 1, 0.3, 260);
      this.mirrors.push({ glass, cam, rt, pos, normal: new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)) });
    }
    // interior mirror: angled so the driver sees straight back through the cargo bay
    const pos = new THREE.Vector3(0, 1.075, -1.789);
    const normal = new THREE.Vector3().subVectors(EYE, pos).normalize().add(new THREE.Vector3(0, 0, 1)).normalize();
    const rt = new THREE.WebGLRenderTarget(84, 26, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.152, 0.047), new THREE.MeshBasicMaterial({ map: flip(rt), color: '#d6dada', fog: false }));
    glass.position.copy(pos);
    glass.lookAt(pos.clone().add(normal));
    this.group.add(glass);
    this.mirrors.push({ glass, cam: new THREE.PerspectiveCamera(22, 0.152 / 0.047, 0.05, 160), rt, pos, normal });
  }

  private buildFreshener(): void {
    const c = makeCanvas(16, 24);
    const g = c.getContext('2d')!;
    g.fillStyle = '#2f8a3a';
    g.beginPath(); g.moveTo(8, 0); g.lineTo(14, 8); g.lineTo(11, 8); g.lineTo(15, 15); g.lineTo(11, 15); g.lineTo(13, 21); g.lineTo(3, 21); g.lineTo(5, 15); g.lineTo(1, 15); g.lineTo(5, 8); g.lineTo(2, 8); g.closePath(); g.fill();
    g.fillStyle = '#e8e0c0'; g.fillRect(7, 21, 2, 3);
    const tex = toTex(c, { repeat: false, mip: false });
    this.fresh.position.set(0, 1.04, -1.8);
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.1, 0.003), M('#d8d0b8'));
    str.position.y = -0.05;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.075), new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    card.position.y = -0.135;
    this.fresh.add(str, card);
    this.group.add(this.fresh);
  }

  toggleWipers(): void { this.wipersOn = !this.wipersOn; }

  /** Period keepsakes: pennant, prayer beads, TO coupon, a postal card in the windscreen. */
  private buildTrinkets(): void {
    const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
      const c = makeCanvas(w, h);
      const g = c.getContext('2d')!;
      draw(g);
      return toTex(c, { repeat: false, mip: false });
    };
    // red velvet pennant with gold fringe and tassel, hung from the windscreen header
    const pen = canvasTex(40, 56, (g) => {
      g.fillStyle = '#a81e1a';
      g.beginPath(); g.moveTo(2, 0); g.lineTo(38, 0); g.lineTo(38, 38); g.lineTo(20, 52); g.lineTo(2, 38); g.closePath(); g.fill();
      g.fillStyle = '#d8b24a';
      g.fillRect(2, 0, 36, 3);
      for (let x = 3; x < 38; x += 3) g.fillRect(x, 38 + Math.abs(20 - x) * -0.7 + 14, 1, 4);
      g.beginPath(); g.moveTo(20, 7); g.lineTo(23, 14); g.lineTo(30, 14); g.lineTo(24, 18); g.lineTo(26, 25); g.lineTo(20, 21); g.lineTo(14, 25); g.lineTo(16, 18); g.lineTo(10, 14); g.lineTo(17, 14); g.closePath(); g.fill();
      g.font = 'bold 6px sans-serif'; g.textAlign = 'center';
      g.fillText('ЛУЧШЕМУ', 20, 31); g.fillText('ВОДИТЕЛЮ', 20, 38);
    });
    const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.126), new THREE.MeshLambertMaterial({ map: pen, alphaTest: 0.5, side: THREE.DoubleSide }));
    pennant.position.set(-0.3, 1.075, -1.83);
    pennant.rotation.set(0.08, 0.05, 0.02);
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.004), M('#d8b24a'));
    cord.position.set(-0.3, 1.14, -1.832);
    this.group.add(pennant, cord);

    // amber prayer beads with a little cross, swinging with the freshener
    const bead = new THREE.SphereGeometry(0.0065, 5, 4);
    const amber = M('#b06a22');
    for (let i = 0; i < 17; i++) {
      const t = i / 16;
      const b = new THREE.Mesh(bead, amber);
      b.position.set(-0.026 + Math.sin(t * Math.PI * 2) * 0.012 - t * 0.004, -Math.sin(t * Math.PI) * 0.11, 0.004);
      this.fresh.add(b);
    }
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.026, 0.003), M('#c8a848'));
    crossV.position.set(-0.03, -0.128, 0.004);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.003), M('#c8a848'));
    crossH.position.set(-0.03, -0.122, 0.004);
    this.fresh.add(crossV, crossH);

    // TO coupon stuck inside the glass, lower corner of the right pane
    const to = canvasTex(32, 32, (g) => {
      g.fillStyle = '#f2ecd2'; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
      g.strokeStyle = '#2a5aa8'; g.lineWidth = 2; g.beginPath(); g.arc(16, 16, 13, 0, 7); g.stroke();
      g.fillStyle = '#2a5aa8'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('ТО', 16, 14);
      g.fillStyle = '#a81e1a'; g.font = 'bold 8px sans-serif'; g.fillText('1998', 16, 24);
    });
    const coupon = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({ map: to, alphaTest: 0.5, color: '#cfcfc8', side: THREE.DoubleSide }));
    coupon.position.set(0.12, 0.575, -1.906);
    coupon.rotation.x = 0.11;
    this.group.add(coupon);

    // cardboard "ПОЧТА" card leaning on the right pane, seen from behind: the
    // marker lettering shows through mirrored, two strips of yellowed tape
    const card = canvasTex(96, 40, (g) => {
      g.fillStyle = '#b89a6a'; g.fillRect(0, 0, 96, 40);
      g.fillStyle = 'rgba(80,60,30,0.25)'; for (let y = 2; y < 40; y += 3) g.fillRect(0, y, 96, 1);
      g.save(); g.scale(-1, 1);
      g.fillStyle = 'rgba(30,50,120,0.16)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('ПОЧТА', -48, 28);
      g.restore();
      g.fillStyle = 'rgba(230,210,140,0.75)'; g.fillRect(4, 0, 12, 9); g.fillRect(80, 0, 12, 9);
    });
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.125), new THREE.MeshLambertMaterial({ map: card }));
    placard.position.set(0.52, 0.565, -1.9);
    placard.rotation.set(0.24, -0.06, 0);
    this.group.add(placard);

    // a spare cassette in its cracked case on the dash top
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.07), new THREE.MeshLambertMaterial({ color: '#6a6e72', transparent: true, opacity: 0.85 }));
    box.position.set(0.18, 0.504, -1.76);
    box.rotation.y = 0.35;
    const insert = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshLambertMaterial({ map: this.T.cassette }));
    insert.rotation.x = -Math.PI / 2;
    insert.position.y = 0.0085;
    box.add(insert);
    this.group.add(box);
  }

  toggleLights(): void { this.lightsOn = !this.lightsOn; }

  update(dt: number, v: Vehicle, rain: number, dark: number): void {
    if (v.engine === 'running') this.fanBlades.rotation.z += dt * 38;
    // steering wheel
    this.wheel.rotation.z = -(v.steer * 540 * D2R + v.kick * 9);
    // gauges
    const kmh = Math.abs(v.speedKmh);
    const jitter = v.engine === 'running' ? Math.sin(performance.now() * 0.03) * 0.6 : 0;
    this.needles.speed.rotation.z = -(135 + (270 * clamp(kmh + jitter * (kmh > 2 ? 1 : 0), 0, 125)) / 120) * D2R;
    const running = v.engine === 'running';
    this.temp = damp(this.temp, running ? 86 : 40, running ? 0.02 : 0.005, dt);
    const small = (n: THREE.Mesh, f: number) => { n.rotation.z = -(225 + 90 * clamp(f, 0, 1)) * D2R; };
    small(this.needles.fuel, 0.68 - v.odometer / 60000);
    small(this.needles.temp, (this.temp - 40) / 80);
    small(this.needles.oil, running ? 0.25 + (v.rpm / 4200) * 0.55 : 0);
    small(this.needles.amp, running ? 0.58 : v.engine === 'cranking' ? 0.15 : 0.5);
    const setLamp = (m: THREE.MeshBasicMaterial, on: boolean) => m.color.copy(on ? (m.userData.on as THREE.Color) : new THREE.Color('#1c1c1c'));
    setLamp(this.lamps.brake, v.handbrake);
    setLamp(this.lamps.oil, !running || v.rpm < IDLE * 0.6);
    setLamp(this.lamps.charge, !running);
    setLamp(this.lamps.beam, this.lightsOn);
    this.clusterMat.emissiveIntensity = this.lightsOn ? 0.55 : 0;
    this.dashLight.intensity = this.lightsOn ? 0.25 * dark : 0;
    for (const s of this.spots) s.intensity = this.lightsOn ? 70 : 0;

    // levers
    const gpos: Record<number, [number, number]> = { [-1]: [0.14, -0.16], 0: [0, 0], 1: [-0.14, -0.16], 2: [-0.14, 0.16], 3: [0, -0.16], 4: [0, 0.16] };
    const gp = gpos[v.gear] ?? [0, 0];
    this.gearLever.rotation.x = damp(this.gearLever.rotation.x, 0.42 + gp[1], 14, dt);
    this.gearLever.rotation.z = damp(this.gearLever.rotation.z, -gp[0], 14, dt);
    this.lever4.rotation.x = damp(this.lever4.rotation.x, v.fourWD ? -0.2 : 0.3, 12, dt);
    this.leverLow.rotation.x = damp(this.leverLow.rotation.x, v.low ? -0.2 : 0.3, 12, dt);
    this.handbrake.rotation.x = damp(this.handbrake.rotation.x, v.handbrake ? 0.2 : 0.95, 12, dt);
    this.toggles.wipers.rotation.x = this.wipersOn ? -0.5 : 0.5;
    this.toggles.lights.rotation.x = this.lightsOn ? -0.5 : 0.5;

    // freshener pendulum
    const fs = this.freshState;
    fs.vx += (-60 * fs.ax - 1.2 * fs.vx + v.accelLong * 2.2) * dt;
    fs.vz += (-60 * fs.az - 1.2 * fs.vz - v.accelLat * 2.2) * dt;
    fs.ax = clamp(fs.ax + fs.vx * dt, -0.8, 0.8);
    fs.az = clamp(fs.az + fs.vz * dt, -0.8, 0.8);
    this.fresh.rotation.set(fs.ax - v.pitch, 0, fs.az + v.roll);

    this.updateWipers(dt);
    this.updateRain(dt, v, rain);
  }

  private updateWipers(dt: number): void {
    const prev = this.wiperA;
    if (this.wipersOn || this.wiperPhase % (Math.PI * 2) > 0.05) {
      const before = this.wiperPhase;
      this.wiperPhase += dt * 3.9;
      if (!this.wipersOn && Math.floor(before / (Math.PI * 2)) !== Math.floor(this.wiperPhase / (Math.PI * 2))) this.wiperPhase = 0;
      this.wiperA = 1.85 * (0.5 - 0.5 * Math.cos(this.wiperPhase));
    } else {
      this.wiperPhase = 0;
      this.wiperA = 0;
    }
    const dir = Math.sign(this.wiperA - prev);
    if (dir !== 0 && dir !== this.wiperDir) { this.wiperDir = dir; this.onWiperEnd?.(); }
    for (const w of this.wipers) w.rotation.z = this.wiperA;
    if (this.wiperA !== prev) {
      const lo = Math.min(prev, this.wiperA) - 0.02, hi = Math.max(prev, this.wiperA) + 0.02;
      for (const p of this.panes) {
        p.drops = p.drops.filter((d) => {
          const dx = d.x - p.pivot[0], dy = p.pivot[1] - d.y;
          const dist = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          return !(dist < ARM + 3 && a >= lo && a <= hi);
        });
      }
      this.paneDirty = true;
    }
  }

  private updateRain(dt: number, v: Vehicle, rain: number): void {
    const speed = Math.abs(v.vx);
    for (const p of this.panes) {
      const spawn = rain * (40 + speed * 3.5) * dt;
      let n = Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0);
      while (n-- > 0 && p.drops.length < 420) p.drops.push({ x: Math.random() * PW, y: Math.random() * PH, s: Math.random() < 0.25 ? 2 : 1, vy: 0, life: 1 });
      if (p.drops.length) this.paneDirty = true;
      for (const d of p.drops) {
        // airflow pushes drops up the glass at speed; heavy ones creep down when slow
        const target = speed > 9 ? -(speed - 9) * 2.8 : d.s > 1 ? 6 : 0.8;
        d.vy = damp(d.vy, target, 2, dt);
        d.y += d.vy * dt;
        // without fresh rain the glass slowly dries
        if (rain < 0.05) d.life -= dt * (0.08 + Math.random() * 0.12);
      }
      p.drops = p.drops.filter((d) => d.y > -1 && d.y < PH + 1 && d.life > 0);
    }
    if (!this.paneDirty) return;
    this.paneDirty = false;
    for (const p of this.panes) {
      p.ctx.putImageData(p.base, 0, 0);
      for (const d of p.drops) {
        // a bead: bright refracted sky above, dark lensed ground below
        const a = Math.min(1, d.life * 1.5);
        const x = Math.floor(d.x), y = Math.floor(d.y);
        p.ctx.fillStyle = `rgba(214,222,228,${0.42 * a})`;
        p.ctx.fillRect(x, y, d.s, 1);
        p.ctx.fillStyle = `rgba(36,42,46,${0.38 * a})`;
        p.ctx.fillRect(x, y + 1, d.s, d.s);
      }
      p.tex.needsUpdate = true;
    }
  }

  private readonly _e = new THREE.Vector3();
  private readonly _d = new THREE.Vector3();
  private readonly _w = new THREE.Vector3();

  /** Renders one mirror per frame, alternating, at a tiny resolution. */
  /**
   * The van's own body, for the door mirrors only: it lives on layer 1, which
   * the driver's camera doesn't render (its panels would cover the windows),
   * while the two door-mirror cameras do — so the blue flank shows in them.
   */
  attachExterior(body: THREE.Object3D): void {
    body.traverse((o) => o.layers.set(1));
    this.group.add(body);
    this.mirrors.forEach((m, i) => { if (i < 2) m.cam.layers.enable(1); });
  }

  renderMirrors(r: RetroRenderer, scene: THREE.Scene, frame: number): void {
    const m = this.mirrors[frame % this.mirrors.length];
    const glassVis = this.mirrors.map((x) => x.glass.visible);
    this.mirrors.forEach((x) => (x.glass.visible = false));
    this._d.copy(m.pos).sub(EYE).normalize();
    this._d.sub(this._w.copy(m.normal).multiplyScalar(2 * this._d.dot(m.normal)));
    m.cam.position.copy(m.pos).applyMatrix4(this.group.matrixWorld);
    this._e.copy(m.pos).add(this._d).applyMatrix4(this.group.matrixWorld);
    m.cam.up.set(0, 1, 0).transformDirection(this.group.matrixWorld);
    m.cam.lookAt(this._e);
    m.cam.updateMatrixWorld();
    r.renderTo(m.rt, scene, m.cam);
    this.mirrors.forEach((x, i) => (x.glass.visible = glassVis[i]));
  }
}
