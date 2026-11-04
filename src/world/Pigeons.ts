import * as THREE from 'three';

/**
 * The dovecote's flock: a dozen-odd pigeons wheeling over the garages in a loose ring that breathes
 * wider and narrower, rising and dipping, wings beating. Three instanced meshes (bodies and each
 * wing) — three draw calls for the lot. Nothing is updated when the van is far off, after dark (they
 * are in the loft) or in heavy rain.
 */
export class Pigeons {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private wings: [THREE.InstancedMesh, THREE.InstancedMesh];
  private birds: { phase: number; r: number; h: number; speed: number; flap: number }[] = [];
  private t = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(private readonly home: THREE.Vector3, n = 14, seed = 7) {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const grey = new THREE.MeshLambertMaterial({ color: '#7a7e86' });
    const wingMat = new THREE.MeshLambertMaterial({ color: '#8a8e96', side: THREE.DoubleSide });
    const bodyGeo = new THREE.SphereGeometry(0.1, 5, 3);
    bodyGeo.scale(1, 0.85, 1.9);
    // a wing: a flat blade out to one side from the shoulder (x from 0 to 0.32)
    const wingGeo = new THREE.BoxGeometry(0.32, 0.01, 0.13);
    const wing = (side: number): THREE.InstancedMesh => {
      const g = wingGeo.clone();
      g.translate(side * 0.16, 0, 0);
      const im = new THREE.InstancedMesh(g, wingMat, n);
      im.frustumCulled = false;
      return im;
    };
    this.wings = [wing(-1), wing(1)];
    this.body = new THREE.InstancedMesh(bodyGeo, grey, n);
    this.body.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      this.birds.push({ phase: (i / n) * Math.PI * 2 + r() * 0.4, r: 14 + r() * 10, h: 9 + r() * 9, speed: 0.5 + r() * 0.12, flap: 9 + r() * 4 });
      // a white one or two among the grey
      if (r() < 0.2) this.body.setColorAt(i, new THREE.Color('#e8e6e0'));
      else this.body.setColorAt(i, new THREE.Color('#ffffff'));
    }
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.group.add(this.body, ...this.wings);
    // shown by update() once the van is near enough
    this.group.visible = false;
  }

  update(dt: number, cam: { x: number; z: number }, dark: number, rain: number): void {
    const d = Math.hypot(cam.x - this.home.x, cam.z - this.home.z);
    const out = dark < 0.55 && rain < 0.5;
    this.group.visible = out && d < 380;
    if (!this.group.visible || d > 320) return;
    this.t += dt;
    const t = this.t;
    // the ring breathes and drifts, the flock turning as one
    const breathe = 1 + 0.35 * Math.sin(t * 0.13);
    this.birds.forEach((b, i) => {
      const a = b.phase + t * b.speed;
      const R = b.r * breathe;
      const x = this.home.x + Math.cos(a) * R + Math.sin(t * 0.07) * 6;
      const z = this.home.z + Math.sin(a) * R + Math.cos(t * 0.05) * 6;
      const y = this.home.y + b.h + Math.sin(a * 2 + i) * 2.5;
      // heading along the circle, banked into the turn
      this.e.set(0, -a, -0.35);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(x, y, z), this.q, this.one);
      this.body.setMatrixAt(i, this.m);
      // wings beat, with a glide now and then
      const glide = Math.sin(t * 0.6 + i) > 0.6;
      const flap = glide ? 0.12 : Math.sin(t * b.flap + i) * 0.7;
      for (const [k, side] of [[0, -1], [1, 1]] as [number, number][]) {
        this.e.set(0, -a, -0.35 + side * flap);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(x, y + 0.03, z), this.q, this.one);
        this.wings[k].setMatrixAt(i, this.m);
      }
    });
    this.body.instanceMatrix.needsUpdate = true;
    for (const w of this.wings) w.instanceMatrix.needsUpdate = true;
  }
}
