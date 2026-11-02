import * as THREE from 'three';
import { clamp } from '../core/math';
import { Ground, GroundInfo, newGround, Surface } from './Ground';
import type { Vehicle } from '../vehicle/Vehicle';

const NC = 360, NP = 96;
const COLORS: Partial<Record<Surface, string>> = { mud: '#4e3c28', dirt: '#80664a', grass: '#55652d', gravel: '#a29c90', water: '#a8bac2', wood: '#8a6a44' };
const DUST: Partial<Record<Surface, string>> = { dirt: '#b19a74', gravel: '#b8b2a4', grass: '#8a9a62' };

/**
 * Throwaway physical debris and haze: clods of mud and stones flung from the
 * tyres, dust trails, water spray, crash shards and sparks, hood steam. Clods
 * are instanced boxes under gravity that stop on the ground; puffs are soft
 * sprites. Everything is pooled, nothing allocates per frame.
 */
export class Effects {
  readonly group = new THREE.Group();
  private clods: THREE.InstancedMesh;
  private cp = new Float32Array(NC * 3);
  private cv = new Float32Array(NC * 3);
  private cl = new Float32Array(NC);       // remaining life
  private cs = new Float32Array(NC);       // size
  private cr = new Float32Array(NC * 3);   // spin
  private cg = new Uint8Array(NC);         // grounded
  private cNext = 0;
  private puffs: { s: THREE.Sprite; v: THREE.Vector3; age: number; life: number; s0: number; s1: number; op: number }[] = [];
  private pNext = 0;
  private acc = [0, 0, 0, 0, 0, 0];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3();
  private p3 = new THREE.Vector3();
  private col = new THREE.Color();
  private gi: GroundInfo = newGround();
  private hoodT = 0;
  private patrolAcc = [0, 0];

  constructor(private ground: Ground) {
    const tex = new THREE.CanvasTexture(softDisc());
    this.clods = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), NC);
    this.clods.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.clods.frustumCulled = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < NC; i++) { this.clods.setMatrixAt(i, this.m); this.clods.setColorAt(i, this.col.set('#000')); }
    this.group.add(this.clods);
    for (let i = 0; i < NP; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.group.add(s);
      this.puffs.push({ s, v: new THREE.Vector3(), age: 9, life: 1, s0: 1, s1: 2, op: 0.4 });
    }
  }

  clod(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, color: THREE.ColorRepresentation, life = 2.5): void {
    const i = this.cNext;
    this.cNext = (i + 1) % NC;
    this.cp[i * 3] = x; this.cp[i * 3 + 1] = y; this.cp[i * 3 + 2] = z;
    this.cv[i * 3] = vx; this.cv[i * 3 + 1] = vy; this.cv[i * 3 + 2] = vz;
    this.cr[i * 3] = Math.random() * 6; this.cr[i * 3 + 1] = Math.random() * 6; this.cr[i * 3 + 2] = Math.random() * 6;
    this.cl[i] = life; this.cs[i] = size; this.cg[i] = 0;
    // a little tonal variation per lump
    this.col.set(color).multiplyScalar(0.8 + Math.random() * 0.4);
    this.clods.setColorAt(i, this.col);
    if (this.clods.instanceColor) this.clods.instanceColor.needsUpdate = true;
  }

  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, s0: number, s1: number, life: number, op: number, color: THREE.ColorRepresentation): void {
    const p = this.puffs[this.pNext];
    this.pNext = (this.pNext + 1) % NP;
    p.s.position.set(x, y, z);
    p.v.set(vx, vy, vz);
    p.age = 0; p.life = life; p.s0 = s0; p.s1 = s1; p.op = op;
    (p.s.material as THREE.SpriteMaterial).color.set(color);
    p.s.visible = true;
  }

  update(dt: number): void {
    const g = this.ground;
    let dirty = false;
    for (let i = 0; i < NC; i++) {
      if (this.cl[i] <= 0) continue;
      dirty = true;
      this.cl[i] -= dt;
      const k = i * 3;
      if (!this.cg[i]) {
        this.cv[k + 1] -= 9.8 * dt;
        this.cp[k] += this.cv[k] * dt; this.cp[k + 1] += this.cv[k + 1] * dt; this.cp[k + 2] += this.cv[k + 2] * dt;
        const gy = g.height(this.cp[k], this.cp[k + 2]) + this.cs[i] * 0.4;
        if (this.cp[k + 1] < gy) {
          this.cp[k + 1] = gy;
          // one small bounce, then it lies where it fell
          if (this.cv[k + 1] < -2.2) { this.cv[k + 1] *= -0.3; this.cv[k] *= 0.5; this.cv[k + 2] *= 0.5; } else this.cg[i] = 1;
        }
        this.cr[k] += dt * 9; this.cr[k + 1] += dt * 7;
      }
      const sz = this.cs[i] * (this.cl[i] > 0 ? Math.min(1, this.cl[i] / 0.5) : 0);
      this.e.set(this.cr[k], this.cr[k + 1], this.cr[k + 2]);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p3.set(this.cp[k], this.cp[k + 1], this.cp[k + 2]), this.q, this.sc.set(sz, sz, sz));
      this.clods.setMatrixAt(i, this.m);
    }
    if (dirty) this.clods.instanceMatrix.needsUpdate = true;
    for (const p of this.puffs) {
      if (!p.s.visible) continue;
      p.age += dt;
      if (p.age >= p.life) { p.s.visible = false; continue; }
      const k = p.age / p.life;
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.exp(-1.6 * dt));
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * Math.sqrt(k));
      (p.s.material as THREE.SpriteMaterial).opacity = p.op * Math.min(1, k * 8) * (1 - k);
    }
  }

  /** Mud, stones, spray and dust from the player's four tyres. */
  emitWheels(dt: number, v: Vehicle, wet: number): void {
    const speed = Math.abs(v.vx);
    const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    // van velocity in world space, to carry debris along
    const wvx = fx * v.vx + rx * v.vy, wvz = fz * v.vx + rz * v.vy;
    v.wheels.forEach((w, i) => {
      if (w.F < 40) return;
      const spin = Math.max(speed, v.slip * 9 + (v.throttle > 0.6 && speed < 4 ? 3 : 0));
      if (spin < 1.2) return;
      const surf: Surface = w.g.puddle || w.g.water > 0.02 ? 'water' : w.g.surface;
      const rate = surf === 'mud' ? spin * 2.4 + v.slip * 20
        : surf === 'water' ? spin * 1.8
        : surf === 'dirt' ? spin * (0.45 + wet * 0.9)
        : surf === 'grass' ? spin * 0.35
        : surf === 'gravel' ? spin * 0.5 : 0;
      const rear = w.lz > 0;
      const wx = v.x + rx * w.lx - fx * w.lz, wz = v.z + rz * w.lx - fz * w.lz;
      const wy = w.g.height + 0.15;
      if (rate > 0) {
        this.acc[i] += rate * dt;
        let n = Math.min(3, Math.floor(this.acc[i]));
        this.acc[i] -= Math.floor(this.acc[i]);
        const color = COLORS[surf] ?? '#6a5a44';
        const side = Math.sign(w.lx);
        while (n-- > 0) {
          // thrown back and up off the tread, a bit outward; fast lumps from the rear wheels
          const back = (0.25 + Math.random() * 0.35) * spin * (rear ? 1 : 0.5) + 1;
          const up = 1.5 + Math.random() * (2.5 + spin * 0.18);
          const out = side * (0.3 + Math.random() * 1.6);
          const small = surf === 'water' || surf === 'gravel';
          this.clod(wx, wy, wz, wvx * 0.7 - fx * back + rx * out, up, wvz * 0.7 - fz * back + rz * out,
            small ? 0.05 + Math.random() * 0.05 : 0.08 + Math.random() * (surf === 'mud' ? 0.2 : 0.12), color, surf === 'water' ? 1.2 : 2.6);
        }
      }
      // haze behind the wheel: dust on dry tracks, spray in puddles
      if (rear && spin > 5) {
        const dry = surf === 'dirt' || surf === 'gravel' || surf === 'grass';
        const dustK = dry ? clamp(1 - wet * 1.2, 0, 1) : 0;
        const sprayK = surf === 'water' ? 1 : 0;
        this.acc[4 + (w.lx > 0 ? 1 : 0)] += dt * (dustK * spin * 0.5 + sprayK * 6);
        const a = this.acc[4 + (w.lx > 0 ? 1 : 0)];
        if (a >= 1) {
          this.acc[4 + (w.lx > 0 ? 1 : 0)] = 0;
          const c = sprayK ? '#d8e2e6' : (DUST[surf] ?? '#b0a080');
          this.puff(wx - fx * 0.8, wy + 0.2, wz - fz * 0.8, wvx * 0.15 + (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.5, wvz * 0.15 + (Math.random() - 0.5) * 0.8,
            0.9, sprayK ? 2.4 : 3.2 + spin * 0.12, sprayK ? 0.9 : 1.8, sprayK ? 0.3 : 0.28 * Math.max(dustK, 0.3), c);
        }
      }
    });
  }

  /** The patrol car's tyres: same physics of mud and dust, driven by its path speed. */
  emitCar(dt: number, x: number, z: number, yaw: number, speed: number, braking: boolean, wet: number): void {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const fx = sy, fz = cy; // patrol yaw: forward is (sin, cos)
    const surf = this.ground.query(x, z, this.gi).surface;
    const dirt = surf === 'dirt' || surf === 'mud' || surf === 'gravel' || surf === 'grass';
    const smoke = surf === 'asphalt' && braking && speed > 10;
    if (speed < 4 || !(dirt || smoke)) return;
    for (let k = 0; k < 2; k++) {
      this.patrolAcc[k] += dt * (smoke ? 14 : speed * 0.7);
      while (this.patrolAcc[k] >= 1) {
        this.patrolAcc[k] -= 1;
        const side = k ? 1 : -1;
        const wx = x - fx * 1.4 + cy * side * 0.8, wz = z - fz * 1.4 - sy * side * 0.8;
        const wy = this.ground.height(wx, wz) + 0.2;
        const vx = fx * speed, vz = fz * speed;
        if (smoke) this.puff(wx, wy, wz, vx * 0.1, 0.5, vz * 0.1, 0.8, 3.4, 1.4, 0.3, '#d6d6d4');
        else if (Math.random() < 0.55) this.clod(wx, wy, wz, vx * 0.6 - fx * 4 + (Math.random() - 0.5) * 2, 2 + Math.random() * 3, vz * 0.6 - fz * 4 + (Math.random() - 0.5) * 2, 0.08 + Math.random() * 0.12, COLORS[surf] ?? '#6a5a44');
        else this.puff(wx, wy, wz, vx * 0.12, 0.6, vz * 0.12, 1.2, 4.6, 2.2, 0.3 * (1 - wet * 0.8), DUST[surf] ?? '#b0a080');
      }
    }
  }

  /** A crash at (x, y, z): normal (nx, nz) points away from the obstacle. */
  crash(x: number, y: number, z: number, nx: number, nz: number, power: number, glass: boolean): void {
    const n = Math.floor(6 + power * 3);
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 2.2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = nx * ca - nz * sa, dz = nx * sa + nz * ca;
      const sp = 2 + Math.random() * power * 0.7;
      // sparks and chips of paint
      this.clod(x, y, z, dx * sp, 1 + Math.random() * 3, dz * sp, 0.03 + Math.random() * 0.04, Math.random() < 0.5 ? '#ffd27a' : '#c8cdd0', 0.9);
      if (glass) this.clod(x, y + 0.4, z, dx * sp * 0.8, 1.5 + Math.random() * 2.5, dz * sp * 0.8, 0.04 + Math.random() * 0.05, '#cfe3ea', 1.6);
    }
    this.puff(x, y, z, nx * 1.2, 0.8, nz * 1.2, 1, 3.5 + power * 0.15, 1.6, 0.4, '#c8c2b4');
  }

  /** Hood steam or smoke from a damaged engine. */
  steam(dt: number, x: number, y: number, z: number, damage: number, vx: number, vz: number): void {
    if (damage < 0.45) return;
    this.hoodT -= dt;
    if (this.hoodT > 0) return;
    this.hoodT = 0.09;
    const dark = damage > 0.8;
    this.puff(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, vx * 0.5, 1.2 + Math.random(), vz * 0.5, 0.5, 2.2, 1.6, dark ? 0.5 : 0.38, dark ? '#2a2a28' : '#e8eaea');
  }
}

/** Soft round blob for puffs. */
function softDisc(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return c;
}
