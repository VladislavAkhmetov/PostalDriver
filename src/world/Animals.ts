import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clamp } from '../core/math';
import type { Ground } from './Ground';
import type { Collider } from './Props';
import cowUrl from '../assets/animals/Cow.fbx?url';
import horseUrl from '../assets/animals/Horse.fbx?url';
import pigUrl from '../assets/animals/Pig.fbx?url';
import sheepUrl from '../assets/animals/Sheep.fbx?url';
import dogUrl from '../assets/animals/Pug.fbx?url';

/**
 * Farm animals on Quaternius' CC0 "Farm Animals" pack (src/assets/animals): cows and horses
 * with real walk / run / death clips, pigs, sheep and a dog with an idle clip that the
 * code carries across the ground. They graze, wander, bolt from a van, block a track until
 * you hoot, and go down when hit.
 */
export type AnimalKind = 'cow' | 'horse' | 'pig' | 'sheep' | 'dog';

const FILES: Record<AnimalKind, string> = { cow: cowUrl, horse: horseUrl, pig: pigUrl, sheep: sheepUrl, dog: dogUrl };
/** Body length in metres, nose to tail. */
const LENGTH: Record<AnimalKind, number> = { cow: 2.4, horse: 2.4, pig: 1.3, sheep: 1.15, dog: 0.8 };
/** Walking speed, running speed (m/s). */
const SPEED: Record<AnimalKind, [number, number]> = { cow: [0.7, 5], horse: [1.2, 8], pig: [0.8, 3], sheep: [0.7, 4], dog: [1.3, 6.5] };
/** Collider radius and mass. */
const BODY: Record<AnimalKind, [number, number]> = { cow: [0.95, 450], horse: [1.0, 500], pig: [0.6, 120], sheep: [0.55, 70], dog: [0.35, 15] };
/** Which clip carries each gait; kinds without a walk clip slide on their idle. */
const CLIPS: Partial<Record<AnimalKind, { walk: string; run: string; down?: string }>> = {
  cow: { walk: 'WalkSlow', run: 'Run', down: 'Death' },
  horse: { walk: 'Walk', run: 'Run', down: 'Death' },
};

/** Which way each model faces in its clips (all but the horse look down +Z already). */
const TURN: Record<AnimalKind, number> = { cow: 0, horse: -Math.PI / 2, pig: 0, sheep: 0, dog: 0 };

interface Template { scene: THREE.Object3D; clips: Record<string, THREE.AnimationClip>; scale: number; lift: number }
const templates: Partial<Record<AnimalKind, Template>> = {};
let loading: Promise<void> | null = null;

export function loadAnimals(): Promise<void> {
  return (loading ??= (async () => {
    const loader = new FBXLoader();
    await Promise.all((Object.keys(FILES) as AnimalKind[]).map(async (k) => {
      const g = await loader.loadAsync(FILES[k]);
      const clips: Record<string, THREE.AnimationClip> = {};
      for (const c of g.animations) clips[c.name.split('|').pop()!] = c;
      g.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isMesh) return;
        // flat, lit with the rest of the world; keep the model's own colours
        const swap = (src: THREE.Material) => new THREE.MeshLambertMaterial({ color: (src as THREE.MeshPhongMaterial).color ?? '#aaaaaa' });
        m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
        m.frustumCulled = false;
      });
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      const scale = LENGTH[k] / Math.max(size.x, size.z);
      templates[k] = { scene: g, clips, scale, lift: -box.min.y * scale };
    }));
  })());
}

const _a = new THREE.Vector3();

export interface VanView { x: number; z: number; vx: number; vz: number; honk: boolean }

type State = 'graze' | 'walk' | 'run' | 'block' | 'down' | 'chase';

export class Animal {
  readonly group = new THREE.Group();
  readonly col: Collider;
  state: State = 'graze';
  x: number; z: number; yaw: number;
  /** The animal is a roadblock until it is hooted off the track. */
  blocker = false;
  private readonly home: THREE.Vector3;
  private readonly leash: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly model: THREE.Object3D;
  private clip = '';
  private tx = 0; private tz = 0;
  private timer = 1 + Math.random() * 5;
  private phase = Math.random() * 6;
  private kx = 0; private kz = 0;
  private barkT = 0;
  onHit?: (a: Animal, speed: number) => void;
  onBark?: () => void;

  constructor(readonly kind: AnimalKind, x: number, z: number, yaw: number, private ground: Ground, leash = 14) {
    const tpl = templates[kind];
    if (!tpl) throw new Error('loadAnimals() must finish before animals are built');
    this.model = cloneSkinned(tpl.scene);
    this.model.scale.setScalar(tpl.scale);
    this.model.position.y = tpl.lift;
    this.model.rotation.y = TURN[kind];
    this.group.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.x = x; this.z = z; this.yaw = yaw;
    this.home = new THREE.Vector3(x, 0, z);
    this.leash = leash;
    this.play('Idle', Math.random());
    const [r, mass] = BODY[kind];
    this.col = { x, z, r, hw: 0, hd: 0, rot: 0, box: false, soft: kind === 'sheep' || kind === 'dog', mass };
    this.col.hit = (_nx, _nz, _j, sp) => this.knock(sp, _nx, _nz);
    this.sync();
  }

  private play(name: string, at?: number, speed = 1): void {
    const tpl = templates[this.kind]!;
    const clip = tpl.clips[name];
    if (!clip) return;
    if (name === this.clip) { this.mixer.timeScale = speed; return; }
    const a = this.mixer.clipAction(clip);
    const prev = this.clip ? this.mixer.clipAction(tpl.clips[this.clip]) : null;
    a.reset();
    a.setLoop(name === 'Death' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = name === 'Death';
    if (at !== undefined) a.time = at * clip.duration;
    a.play();
    if (prev) a.crossFadeFrom(prev, 0.3, false);
    this.mixer.timeScale = speed;
    this.clip = name;
  }

  private knock(speed: number, nx: number, nz: number): void {
    if (this.state === 'down' || speed < 2.2) return;
    this.state = 'down';
    this.timer = 18;
    this.kx = nx * speed * 0.4; this.kz = nz * speed * 0.4;
    const down = CLIPS[this.kind]?.down;
    if (down) this.play(down, 0, 1.2);
    this.col.x = 1e9; this.col.z = 1e9;
    this.onHit?.(this, speed);
  }

  private sync(): void {
    this.group.position.set(this.x, this.ground.height(this.x, this.z), this.z);
    this.group.rotation.y = this.yaw;
    if (this.state !== 'down') { this.col.x = this.x; this.col.z = this.z; }
  }

  /** Walk or run toward (tx, tz); the clip follows the gait. */
  private go(dt: number, tx: number, tz: number, run: boolean): boolean {
    const [w, r] = SPEED[this.kind];
    const sp = run ? r : w;
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.4) return true;
    const want = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += turn * Math.min(1, dt * (run ? 6 : 3));
    // do not charge ahead while still facing the wrong way
    const k = clamp(1 - Math.abs(turn) / 1.6, 0.15, 1);
    const step = Math.min(d, sp * k * dt);
    this.x += (dx / d) * step; this.z += (dz / d) * step;
    const gait = CLIPS[this.kind];
    if (gait) this.play(run ? gait.run : gait.walk, undefined, run ? 1 : 1);
    else { this.play('Idle', undefined, run ? 3.2 : 1.8); this.model.position.y = templates[this.kind]!.lift + Math.abs(Math.sin((this.phase += dt * (run ? 14 : 8)))) * (run ? 0.05 : 0.02); }
    return false;
  }

  private idle(): void {
    this.play('Idle', undefined, 1);
    this.model.position.y = templates[this.kind]!.lift;
  }

  /** Direction of the track a blocker stands on. */
  roadDir?: { x: number; z: number };

  update(dt: number, van: VanView): void {
    const roadDir = this.roadDir;
    const dx = van.x - this.x, dz = van.z - this.z, d = Math.hypot(dx, dz);
    const vspeed = Math.hypot(van.vx, van.vz);
    const closing = d > 0.1 ? -(van.vx * dx + van.vz * dz) / d : 0;
    this.group.visible = d < 170;
    if (!this.group.visible) return;
    const near = d < 120;
    if (near) this.mixer.update(dt);
    if (!near && this.state !== 'down') return;
    this.barkT -= dt;

    switch (this.state) {
      case 'down':
        this.timer -= dt;
        this.x += this.kx * dt; this.z += this.kz * dt;
        this.kx *= Math.exp(-3 * dt); this.kz *= Math.exp(-3 * dt);
        if (this.timer <= 0) { this.state = 'graze'; this.timer = 4; this.col.x = this.x; this.col.z = this.z; this.clip = ''; this.play('Idle'); }
        break;
      case 'graze':
        this.idle();
        this.timer -= dt;
        if (closing > 4 && d < 22 && vspeed > 3.5 && this.kind !== 'dog') this.scare(van, d);
        else if (this.kind === 'dog' && vspeed > 3 && d < 40 && d > 4 && this.timer < 0) { this.state = 'chase'; this.timer = 7; if (this.barkT < 0) { this.onBark?.(); this.barkT = 3; } }
        else if (this.timer < 0) {
          // drift to somewhere near home
          const a = Math.random() * Math.PI * 2, r = Math.random() * this.leash;
          this.tx = this.home.x + Math.cos(a) * r; this.tz = this.home.z + Math.sin(a) * r;
          this.state = 'walk';
        }
        break;
      case 'walk':
        if (closing > 4 && d < 22 && vspeed > 3.5 && this.kind !== 'dog') { this.scare(van, d); break; }
        if (this.go(dt, this.tx, this.tz, false)) { this.state = 'graze'; this.timer = 3 + Math.random() * 8; }
        break;
      case 'run':
        this.timer -= dt;
        if (this.go(dt, this.tx, this.tz, true) || this.timer < 0) { this.state = 'graze'; this.timer = 4 + Math.random() * 4; }
        break;
      case 'chase': {
        // a dog runs after the van for a while, barking
        this.timer -= dt;
        this.go(dt, van.x + van.vx * 0.4, van.z + van.vz * 0.4, true);
        if (d < 3.5) { this.tx = this.x - dx * 4; this.tz = this.z - dz * 4; this.state = 'run'; this.timer = 1.5; }
        if (this.barkT < 0) { this.onBark?.(); this.barkT = 2.5; }
        if (this.timer < 0 || d > 70) { this.tx = this.home.x; this.tz = this.home.z; this.state = 'walk'; }
        break;
      }
      case 'block': {
        // standing in the track: gives way to a hoot, or to a van that waits patiently
        this.idle();
        this.timer += dt;
        const waited = vspeed < 1.2 && d < 9;
        if ((van.honk && d < 40) || (waited && this.timer > 14)) {
          const rd = roadDir ?? { x: 1, z: 0 };
          const sgn = (this.x - van.x) * -rd.z + (this.z - van.z) * rd.x >= 0 ? 1 : -1;
          this.tx = this.x + -rd.z * sgn * 9; this.tz = this.z + rd.x * sgn * 9;
          this.blocker = false;
          this.state = 'run'; this.timer = 3.5;
        } else if (closing > 7 && d < 14) this.scare(van, d);
        break;
      }
    }
    this.sync();
  }

  private scare(van: VanView, d: number): void {
    // bolt sideways to the van's line, away from it
    const sp = Math.hypot(van.vx, van.vz) || 1;
    const px = -van.vz / sp, pz = van.vx / sp;
    const sgn = (this.x - van.x) * px + (this.z - van.z) * pz >= 0 ? 1 : -1;
    this.tx = this.x + px * sgn * (10 + Math.random() * 5);
    this.tz = this.z + pz * sgn * (10 + Math.random() * 5);
    this.state = 'run';
    this.timer = d < 10 ? 4 : 3;
    this.blocker = false;
  }

  /** Stand in the track until hooted away. */
  block(): void { this.state = 'block'; this.blocker = true; this.timer = 0; this.idle(); }

  get down(): boolean { return this.state === 'down'; }
  setPosition(x: number, z: number): void { this.x = x; this.z = z; this.home.set(x, 0, z); this.sync(); }
  get position(): THREE.Vector3 { return _a.set(this.x, 0, this.z); }
}
