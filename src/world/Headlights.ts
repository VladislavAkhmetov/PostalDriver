import * as THREE from 'three';
import { makeCanvas } from '../core/textures';

/**
 * Night lamps for traffic, all fake and cheap: an additive glare on each
 * headlamp (a forward-facing quad, so it's seen from the front only), a faint
 * cone of light ahead of each lamp for the mist and rain to catch, a warm pool
 * on the road in front of the car, and red glows on the tail lamps. Every car
 * shares the same materials, so one call fades them all in at dusk.
 */
const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

let mats: { halo: THREE.MeshBasicMaterial; beam: THREE.MeshBasicMaterial; pool: THREE.MeshBasicMaterial; tail: THREE.MeshBasicMaterial } | null = null;

function materials() {
  if (mats) return mats;
  const glow = tex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,250,235,0.9)');
    r.addColorStop(0.35, 'rgba(255,230,180,0.28)'); r.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    // a thin horizontal streak, as glare does through a dirty windscreen
    const s = g.createLinearGradient(0, 0, 64, 0);
    s.addColorStop(0, 'rgba(255,240,210,0)'); s.addColorStop(0.5, 'rgba(255,240,210,0.5)'); s.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = s; g.fillRect(0, 30, 64, 4);
  });
  // beam: bright at the lamp (canvas top = cone apex), gone at the far end
  const beam = tex(8, 64, (g) => {
    const l = g.createLinearGradient(0, 0, 0, 64);
    l.addColorStop(0, 'rgba(255,240,210,1)'); l.addColorStop(0.4, 'rgba(255,235,200,0.35)'); l.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = l; g.fillRect(0, 0, 8, 64);
  });
  // pool: brightest just ahead of the bumper (canvas top), fanning out and fading
  const pool = tex(64, 128, (g) => {
    // an ellipse stretched down the road, faded out well inside the quad's edges
    g.scale(1, 4);
    const r = g.createRadialGradient(32, 1, 1, 32, 1, 31);
    r.addColorStop(0, 'rgba(255,236,200,0.95)'); r.addColorStop(0.4, 'rgba(255,226,180,0.4)'); r.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 32);
  });
  const add = (map: THREE.Texture, color: string, side: THREE.Side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
    map, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side,
  });
  mats = { halo: add(glow, '#fff2d8'), beam: add(beam, '#ffe8c0', THREE.DoubleSide), pool: add(pool, '#ffdcae'), tail: add(glow, '#ff3020') };
  mats.pool.polygonOffset = true; mats.pool.polygonOffsetFactor = -2; mats.pool.polygonOffsetUnits = -2;
  return mats;
}

const haloGeo = new THREE.PlaneGeometry(1.3, 1.3);
const tailGeo = new THREE.PlaneGeometry(0.7, 0.7);
const BEAM_LEN = 11;
const beamGeo = new THREE.ConeGeometry(1.5, BEAM_LEN, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, BEAM_LEN / 2);
const poolGeo = new THREE.PlaneGeometry(5, 13).rotateX(-Math.PI / 2);
/** High-beam glare: soft per-lamp streaks and textured cores, with no opaque panels. */
const flareGeo = new THREE.PlaneGeometry(2.4, 0.85);
const coreGeo = new THREE.PlaneGeometry(0.62, 0.62);
const highPoolGeo = new THREE.PlaneGeometry(6, 26).rotateX(-Math.PI / 2);

let flareMap: THREE.Texture | null = null;
/** Soft horizontal streak, bright in the middle: headlight glare on a dirty windscreen. */
function flareTexture(): THREE.Texture {
  return flareMap ??= tex(128, 64, (g) => {
    g.translate(64, 32);
    g.scale(1, 0.5);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 64);
    // Continuous falloff to transparent on every edge, with no opaque plateau.
    r.addColorStop(0, 'rgba(255,255,250,1)');
    r.addColorStop(0.08, 'rgba(255,250,230,0.8)');
    r.addColorStop(0.28, 'rgba(255,240,210,0.3)');
    r.addColorStop(0.6, 'rgba(255,235,200,0.06)');
    r.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = r;
    g.fillRect(-64, -64, 128, 128);
  });
}

interface BeamFlash {
  root: THREE.Group;
  flare: THREE.MeshBasicMaterial;
  core: THREE.MeshBasicMaterial;
  pool: THREE.MeshBasicMaterial;
}

/** Per-car high beam (the dipped lamps share one material, so a warning flash can't). Off until setHighBeam. */
function highBeam(heads: THREE.Vector3[]): BeamFlash {
  const root = new THREE.Group();
  root.name = 'highbeam';
  root.visible = false;
  const flare = new THREE.MeshBasicMaterial({
    map: flareTexture(), color: '#fff4d4', transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const core = new THREE.MeshBasicMaterial({
    map: materials().halo.map, color: '#fffef8', transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const pool = new THREE.MeshBasicMaterial({
    map: materials().pool.map, color: '#ffe6b0', transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  if (heads.length) {
    for (const p of heads) {
      const streak = new THREE.Mesh(flareGeo, flare);
      streak.position.set(p.x, p.y, p.z + 0.2);
      root.add(streak);
      const lamp = new THREE.Mesh(coreGeo, core);
      lamp.position.set(p.x, p.y, p.z + 0.22);
      root.add(lamp);
    }
    // Brighten the road at night without drawing cone shells in clear air.
    const road = new THREE.Mesh(highPoolGeo, pool);
    road.position.set(0, .075, Math.max(...heads.map(p => p.z)) + 13.2);
    root.add(road);
  }
  return { root, flare, core, pool };
}

/**
 * Lamps on a vehicle (local forward +Z, wheels on y = 0): headlamp and tail
 * lamp centres. Returns the group so a parked car can keep them off.
 */
export function headlights(parent: THREE.Object3D, heads: THREE.Vector3[], tails: THREE.Vector3[] = []): THREE.Group {
  const M = materials();
  const g = new THREE.Group();
  g.name = 'lamps';
  let front = -Infinity;
  for (const p of heads) {
    const h = new THREE.Mesh(haloGeo, M.halo);
    h.position.set(p.x, p.y, p.z + 0.05);
    g.add(h);
    const b = new THREE.Mesh(beamGeo, M.beam);
    b.position.set(p.x, p.y, p.z + 0.08);
    // dipped: aimed a touch down at the road
    b.rotation.x = 0.07;
    g.add(b);
    front = Math.max(front, p.z);
  }
  if (heads.length) {
    const pool = new THREE.Mesh(poolGeo, M.pool);
    pool.position.set(0, 0.07, front + 6.8);
    g.add(pool);
  }
  for (const p of tails) {
    const t = new THREE.Mesh(tailGeo, M.tail);
    t.position.set(p.x, p.y, p.z - 0.04);
    t.rotation.y = Math.PI;
    g.add(t);
  }
  const flash = highBeam(heads);
  g.add(flash.root);
  g.userData.high = flash;
  // the transparent quads would be culled by the car's bounding box otherwise
  g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 2; });
  parent.add(g);
  return g;
}

/** k: 0 by day … 1 at night. */
export function setHeadlightGlow(lamps: number): void {
  const M = materials();
  // the glass glows from early dusk; the glare, beams and pools only once it's
  // properly dark (at dawn they'd paint pale wedges on the road)
  const k = Math.max(0, Math.min(1, (lamps - 0.25) / 0.75)) ** 1.5;
  M.halo.opacity = k * 0.95;
  M.beam.opacity = k * 0.1;
  M.pool.opacity = k * 0.5;
  M.tail.opacity = k * 0.55;
  const on = k > 0.02;
  for (const m of Object.values(M)) m.visible = on;
}

/**
 * High-beam flash on one vehicle. `k` is 0 or 1 (a stalk, not a fade); `night`
 * is 0 by day … 1 in the dark, and only then does the road pool show. By day
 * the lamp cores and their soft glare carry it.
 */
export function setHighBeam(lights: THREE.Group | undefined, k: number, night = 0): void {
  const h = lights?.userData.high as BeamFlash | undefined;
  if (!h) return;
  const on = k > 0.04;
  h.root.visible = on;
  if (!on) return;
  h.core.opacity = k;
  h.flare.opacity = k * 0.95;
  h.pool.opacity = k * night * night * 0.35;
}
