import * as THREE from 'three';

/**
 * Bees loose in the cab (the beekeeper's hives, Cases.ts): a dozen dark-gold specks darting about
 * between the driver and the windscreen, more of them the more are out. Cabin space: the cab faces
 * −Z, the driver's eye at Cabin.EYE.
 */
const N = 14;
const CENTRE = new THREE.Vector3(-0.15, 1.02, -1.42);

export class BeeCloud {
  private points: THREE.Points;
  private pos: Float32Array;
  private phase: Float32Array;
  private t = 0;

  constructor(parent: THREE.Object3D) {
    this.pos = new Float32Array(N * 3);
    this.phase = new Float32Array(N * 4).map(() => Math.random() * Math.PI * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#3a2c08', size: 0.022, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    parent.add(this.points);
  }

  update(dt: number, level: number): void {
    const n = Math.round(N * Math.min(1, level));
    this.points.visible = n > 0;
    if (!n) return;
    this.t += dt;
    const t = this.t, p = this.phase;
    for (let i = 0; i < N; i++) {
      // each on its own wobbly loop, darting now and then
      const a = p[i * 4], b = p[i * 4 + 1], c = p[i * 4 + 2], k = p[i * 4 + 3];
      this.pos[i * 3] = CENTRE.x + Math.sin(t * (2.1 + k * 0.3) + a) * 0.42 + Math.sin(t * 9 + c) * 0.04;
      this.pos[i * 3 + 1] = CENTRE.y + Math.sin(t * (1.7 + k * 0.2) + b) * 0.16 + Math.sin(t * 11 + a) * 0.03;
      this.pos[i * 3 + 2] = CENTRE.z + Math.cos(t * (1.9 + k * 0.25) + c) * 0.28;
    }
    // only as many as are out
    this.points.geometry.setDrawRange(0, n);
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
