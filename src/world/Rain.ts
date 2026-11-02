import * as THREE from 'three';
import { clamp } from '../core/math';

export interface RainFrame {
  rain: number; wind: number; wet: number; dark: number;
  /** Falling snow 0…1: the same particles as slow, swaying flakes. */
  snow?: number;
  cam: THREE.Vector3;
  /** Ground height under the camera: a single query, splashes treat the ground as flat locally. */
  groundY: number;
  /** Van pose and world velocity: streaks slant by apparent wind, and stay out of the cabin. */
  vx: number; vz: number; px: number; pz: number; yaw: number;
  tint: THREE.Color;
}

const N = 2000;
const BOX = 36;
const RINGS = 48;

/**
 * Rain as camera-wrapped streaks plus ground ripples. Streaks are RGBA line
 * segments: a bright head fading to a clear tail, oriented by the drop's
 * velocity relative to the moving van (motion blur), so they lean towards the
 * windscreen at speed. Ripples are one instanced ring mesh.
 */
export class Rain {
  readonly group = new THREE.Group();
  /** Quality scale 0…1 for the streak count. */
  density = 1;
  private heads = new Float32Array(N * 3);
  private fall = new Float32Array(N);
  private pos = new Float32Array(N * 6);
  private col = new Float32Array(N * 8);
  private lines: THREE.LineSegments;
  private rings: THREE.InstancedMesh;
  private ringAge = new Float32Array(RINGS).fill(9);
  private ringXYZ = new Float32Array(RINGS * 3);
  private ringNext = 0;
  private time = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  /** This frame's particles are flakes, not drops. */
  private snowing = false;

  constructor() {
    for (let i = 0; i < N; i++) {
      this.heads.set([(Math.random() - 0.5) * BOX, Math.random() * 9, (Math.random() - 0.5) * BOX], i * 3);
      this.fall[i] = 12 + Math.random() * 5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;

    const rg = new THREE.RingGeometry(0.78, 1, 14);
    rg.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }), RINGS);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < RINGS; i++) { this.rings.setMatrixAt(i, this.m); this.rings.setColorAt(i, this.c.setRGB(0, 0, 0)); }
    this.rings.visible = false;
    this.group.add(this.lines, this.rings);
  }

  update(dt: number, f: RainFrame): void {
    this.time += dt;
    const snow = f.snow ?? 0;
    const amount = Math.max(f.rain, snow);
    const on = amount > 0.02;
    this.lines.visible = on;
    this.snowing = snow > f.rain;
    const active = on ? Math.floor(N * this.density * clamp(amount * 1.15, 0, 1)) : 0;
    if (on) this.streaks(dt, f, active);
    this.ripples(dt, f);
  }

  private streaks(dt: number, f: RainFrame, n: number): void {
    const H = this.heads, P = this.pos, C = this.col;
    // gusting wind from the north-west
    const gust = f.wind * (0.75 + 0.35 * Math.sin(this.time * 0.7) + 0.15 * Math.sin(this.time * 2.3));
    // flakes ride the wind further than drops do
    const snow = this.snowing, wk = snow ? 1.7 : 1;
    const wx = 5.5 * gust * wk, wz = 3.2 * gust * wk;
    // spawn volume leads the van so it never drives out of the rain
    const cx = f.cam.x + f.vx * 0.55, cz = f.cam.z + f.vz * 0.55;
    // visible band through the glass: a little above the roof down to the road
    const top = f.cam.y + 7, floor = f.groundY;
    const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
    const roof = f.cam.y + 0.7;
    const r = f.tint.r, g = f.tint.g, b = f.tint.b;
    const near = 13;
    let splashes = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      // flakes drift down at a walking pace, each swaying on its own
      const vy = snow ? -this.fall[i] * 0.11 : -this.fall[i] * (0.85 + f.rain * 0.25);
      const sway = snow ? Math.sin(this.time * 1.3 + i * 0.37) * 0.7 : 0;
      let x = H[k] + (wx + sway) * dt, y = H[k + 1] + vy * dt, z = H[k + 2] + (wz + Math.cos(this.time * 1.1 + i) * sway * 0.6) * dt;
      // wrap horizontally around the moving centre
      let dx = x - cx, dz = z - cz;
      // modulo, so drops catch up at once after a teleport or a stale stretch
      if (dx > BOX / 2 || dx < -BOX / 2) x -= Math.floor(dx / BOX + 0.5) * BOX;
      if (dz > BOX / 2 || dz < -BOX / 2) z -= Math.floor(dz / BOX + 0.5) * BOX;
      if (y > top + 4) y = floor + Math.random() * (top - floor);
      if (y < floor) {
        dx = x - f.cam.x; dz = z - f.cam.z;
        if (!snow && splashes < 5 && f.wet > 0.35 && dx * dx + dz * dz < near * near && Math.random() < 0.35) { this.splash(x, floor + 0.03, z); splashes++; }
        y = top - Math.random() * 3;
      }
      H[k] = x; H[k + 1] = y; H[k + 2] = z;

      // apparent velocity → motion-blurred streak behind the head
      const rx = wx - f.vx, rz = wz - f.vz;
      let ex = rx * 0.04, ey = vy * 0.04, ez = rz * 0.04;
      const len = Math.hypot(ex, ey, ez);
      // a flake is a short tick standing still, a streak only at speed
      const cap = snow ? 0.9 : 2.2, min = snow ? 0.07 : 0;
      if (len > cap) { const s = cap / len; ex *= s; ey *= s; ez *= s; }
      else if (len < min) { ey -= min - len; }
      const o = i * 6;
      P[o] = x; P[o + 1] = y; P[o + 2] = z;
      P[o + 3] = x - ex; P[o + 4] = y - ey; P[o + 5] = z - ez;

      // fade with distance; hide drops inside the van body
      dx = x - f.cam.x; dz = z - f.cam.z;
      const d = Math.sqrt(dx * dx + dz * dz + (y - f.cam.y) ** 2);
      let a = clamp(1.35 - d / 26, 0.3, 1) * clamp((d - 0.8) / 2.5, 0, 1) * (snow ? 0.95 : 0.6 + f.rain * 0.35);
      const lx = x - f.px, lz = z - f.pz;
      const fwd = -(lx * sy + lz * cy), lat = lx * cy - lz * sy;
      if (Math.abs(lat) < 1.25 && fwd > -2.8 && fwd < 2.6 && y < roof) a = 0;
      const q = i * 8;
      C[q] = r; C[q + 1] = g; C[q + 2] = b; C[q + 3] = a;
      C[q + 4] = r; C[q + 5] = g; C[q + 6] = b; C[q + 7] = 0;
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, n * 2);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  private splash(x: number, y: number, z: number): void {
    const i = this.ringNext;
    this.ringNext = (i + 1) % RINGS;
    this.ringAge[i] = 0;
    this.ringXYZ.set([x, y, z], i * 3);
  }

  private ripples(dt: number, f: RainFrame): void {
    let any = false;
    const glow = 0.5 - f.dark * 0.25;
    for (let i = 0; i < RINGS; i++) {
      const age = (this.ringAge[i] += dt);
      const life = 0.55;
      if (age > life) {
        if (age - dt <= life) { this.m.makeScale(0, 0, 0); this.rings.setMatrixAt(i, this.m); }
        continue;
      }
      any = true;
      const k = age / life;
      const s = 0.06 + k * 0.32;
      this.m.makeScale(s, 1, s).setPosition(this.ringXYZ[i * 3], this.ringXYZ[i * 3 + 1], this.ringXYZ[i * 3 + 2]);
      this.rings.setMatrixAt(i, this.m);
      this.rings.setColorAt(i, this.c.copy(f.tint).multiplyScalar((1 - k) * glow));
    }
    this.rings.visible = any;
    if (any) {
      this.rings.instanceMatrix.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }
  }
}
