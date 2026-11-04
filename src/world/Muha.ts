import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { lam, mesh, Person } from './People';

/**
 * Zhenka "Muha", Timur's best friend from before the army: the modelled figure (vest, blue
 * tracksuit trousers, a chain with a cross) on the people's skeleton, like the GAI officer.
 * He hangs about by the shop next to his tinted saloon with a cigarette: now and then he draws on
 * it, a thread of smoke goes up off the tip, his head follows the post van when it is near, and
 * the first time it rolls up he waves. Local forward is +Z, as for every Human.
 */
export class Muha extends Person {
  /** The player's van (world space), set by the world every frame. */
  readonly van = new THREE.Vector3(1e9, 0, 1e9);
  private yaw = 0;
  private pitch = 0;
  private dragW = 0;
  private dragT = 0;
  private nextDrag = 4 + Math.random() * 6;
  private greeted = false;
  private readonly tip = new THREE.Object3D();
  private readonly ember: THREE.Mesh;
  private readonly wisps: { s: THREE.Sprite; age: number }[] = [];
  private wispT = 0;
  private glow = 0.3;

  constructor() {
    super('muha', {});
    // he hails the van with both arms (the Waving clip), not a hand raised
    this.waveClip = true;
    const h = this.human;
    // a cigarette between the fingers of the right hand, pointing forward in the T-pose (palms down)
    const at = h.bindAt('FingersR');
    const cig = new THREE.Group();
    cig.position.set(at.x - 0.01, at.y - 0.012, at.z + 0.01);
    cig.rotation.x = Math.PI / 2;
    cig.add(mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.022, 6), lam('#c9a05e'), 0, 0.011, 0));
    cig.add(mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.045, 6), lam('#f0ece0'), 0, 0.0445, 0));
    this.ember = mesh(new THREE.SphereGeometry(0.0048, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff6a24' }), 0, 0.068, 0);
    cig.add(this.ember);
    this.tip.position.set(0, 0.07, 0);
    cig.add(this.tip);
    h.attach('FingersR', cig);
    // a thread of smoke, in the group's own frame (he stands still)
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: '#cfd3d6' }));
      s.visible = false;
      h.group.add(s);
      this.wisps.push({ s, age: 9 });
    }
  }

  update(dt: number, t: number): void {
    const h = this.human;
    const local = h.group.worldToLocal(this.van.clone());
    const dist = Math.hypot(local.x, local.z);
    // the first time the van rolls up he waves it over
    if (!this.greeted && dist < 14) { this.greeted = true; this.wave = 2.4; }
    if (dist > 40) this.greeted = false;
    // a draw now and then, never while waving
    this.nextDrag -= dt;
    if (this.nextDrag <= 0 && this.wave <= 0 && !this.busy) { this.dragT = 1.8; this.nextDrag = 8 + Math.random() * 7; }
    this.dragT = Math.max(0, this.dragT - dt);
    this.dragW = damp(this.dragW, this.dragT > 0.3 ? 1 : 0, 5, dt);
    this.glow = damp(this.glow, this.dragT > 0.3 && this.dragT < 1.4 ? 1 : 0.3, 8, dt);
    super.update(dt, t);
    // head toward the van while it is close, otherwise looking down the street
    const near = dist < 30;
    this.yaw = damp(this.yaw, near ? clamp(Math.atan2(local.x, local.z), -1.2, 1.2) : Math.sin(t * 0.13) * 0.3, 3, dt);
    this.pitch = damp(this.pitch, near ? clamp(Math.atan2(local.y - 1.5, Math.max(1, dist)), -0.3, 0.2) : 0, 3, dt);
    h.look(this.yaw, this.pitch);
    if (this.dragW > 0.01) {
      // the right hand up to the lips, elbow out and down
      const m = h.at('Head').add(_o.set(-0.025, 0.02, 0.12));
      h.reach('R', m, _p.set(-1, -0.8, 0.2), this.dragW);
    }
    (this.ember.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.28 + 0.3 * this.glow, 0.08 + 0.1 * this.glow);
    this.ember.scale.setScalar(0.8 + this.glow * 0.5);
    // the thread of smoke off the tip
    this.wispT -= dt;
    if (this.wispT <= 0) {
      this.wispT = 0.18;
      const w = this.wisps.find((x) => !x.s.visible);
      if (w) {
        this.tip.getWorldPosition(w.s.position);
        h.group.worldToLocal(w.s.position);
        w.age = 0;
        w.s.visible = true;
      }
    }
    for (const w of this.wisps) {
      if (!w.s.visible) continue;
      w.age += dt;
      const k = w.age / 2.4;
      if (k >= 1) { w.s.visible = false; continue; }
      w.s.position.y += dt * 0.12;
      w.s.position.x += Math.sin(w.age * 3 + t) * dt * 0.03;
      w.s.scale.setScalar(0.02 + k * 0.12);
      (w.s.material as THREE.SpriteMaterial).opacity = 0.32 * Math.min(1, k * 6) * (1 - k);
    }
  }
}

const _o = new THREE.Vector3(), _p = new THREE.Vector3();
