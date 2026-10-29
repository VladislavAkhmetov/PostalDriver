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
