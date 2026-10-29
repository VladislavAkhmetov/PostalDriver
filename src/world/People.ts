import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clamp, damp } from '../core/math';
import manUrl from '../assets/people/man.glb?url';
import womanUrl from '../assets/people/woman.glb?url';
import dressUrl from '../assets/people/woman-dress.glb?url';

/**
 * Skinned, animated people built on Quaternius' CC0 "BaseHuman" figures (see
 * src/assets/people/CREDITS.md). The models carry flat named materials, so
 * every figure is recoloured into 90s clothes, painted per vertex where the
 * base mesh is wrong (bare shins under shorts become trousers, stockings or
 * boots) and dressed with small procedural props bound to bones. On top of the
 * clips a light procedural layer turns the head and drives the arms with a
 * two-bone IK for waving, saluting, pointing a baton or holding a wheel.
 * Local forward is +Z, feet at the origin, sizes in metres.
 */
export type Body = 'man' | 'woman' | 'dress';

const URLS: Record<Body, string> = { man: manUrl, woman: womanUrl, dress: dressUrl };
const HEIGHT: Record<Body, number> = { man: 1.78, woman: 1.64, dress: 1.6 };

interface MeshInfo { raw: Float32Array; joint: string[]; index: ArrayLike<number> | null }
interface Template {
  scene: THREE.Object3D;
  clips: Record<string, THREE.AnimationClip>;
  meshes: MeshInfo[];
  /** Model-space height of the top of the hair, in file units. */
  top: number;
}
const templates: Partial<Record<Body, Template>> = {};
let loading: Promise<void> | null = null;

/** Fetch and prepare the character models; must resolve before any Human is built. */
export function loadPeople(): Promise<void> {
  return (loading ??= (async () => {
    const loader = new GLTFLoader();
    await Promise.all((Object.keys(URLS) as Body[]).map(async (b) => {
      const g = await loader.loadAsync(URLS[b]);
      const clips: Record<string, THREE.AnimationClip> = {};
      for (const c of g.animations) clips[c.name.split('|').pop()!.replace(/^(Man|Female)_/, '')] = c;
      g.scene.updateMatrixWorld(true);
      const meshes: MeshInfo[] = [];
      let top = 0;
      const v = new THREE.Vector3();
      g.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isSkinnedMesh) return;
        const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
        const raw = new Float32Array(pos.count * 3), joint: string[] = [];
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          raw[i * 3] = v.x; raw[i * 3 + 1] = v.y; raw[i * 3 + 2] = v.z;
          top = Math.max(top, v.y);
          let best = 0;
          for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
          joint.push(m.skeleton.bones[si.getComponent(i, best)]?.name ?? '');
        }
        meshes.push({ raw, joint, index: m.geometry.index ? m.geometry.index.array : null });
      });
      templates[b] = { scene: g.scene, clips, meshes, top };
    }));
  })());
}

const MATS = new Map<string, THREE.MeshLambertMaterial>();
export const lam = (c: string): THREE.MeshLambertMaterial => {
  let m = MATS.get(c);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); MATS.set(c, m); }
  return m;
};
let vcMat: THREE.MeshLambertMaterial | null = null;

export interface Outfit {
  /** Colour per model material (Shirt, Pants, Skin, Hair, Dress, Jacket, Shoes…). */
  colors?: Record<string, string>;
  /**
   * Repaint vertices of a material below a height in metres; later entries win.
   * Without `joints` arms and hands are left alone; with it only vertices
   * skinned to a matching bone are painted (e.g. sleeves).
   */
  paint?: { mat: string; below: number; color: string; joints?: RegExp }[];
}

export type Side = 'L' | 'R';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qd = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ARM = /Arm|Palm|Hand|Finger|Thumb/;
const DRIVEN = ['Torso', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR'];

export class Human {
  /** Positioned in the world; feet at the origin, facing +Z. */
  readonly group = new THREE.Group();
  /** The skinned model inside the group (offset when seated). */
  readonly model: THREE.Object3D;
  /** File units to metres. */
  readonly s: number;
  private readonly tpl: Template;
  private readonly bones: Record<string, THREE.Bone> = {};
  /** Bone frames in the bind pose (the file's T-pose), group space, metres. */
  private readonly bind: Record<string, THREE.Matrix4> = {};
  private readonly mixer: THREE.AnimationMixer;
  private action: THREE.AnimationAction | null = null;
  /** Bones the procedural layer rotates, with their rest pose (not every clip animates them). */
  private readonly driven: [THREE.Bone, THREE.Quaternion][] = [];
  clip = '';

  constructor(readonly body: Body, outfit: Outfit = {}) {
    const tpl = templates[body];
    if (!tpl) throw new Error('loadPeople() must finish before building people');
    this.tpl = tpl;
    this.s = HEIGHT[body] / tpl.top;
    this.model = cloneSkinned(tpl.scene);
    this.model.scale.setScalar(this.s);
    this.group.add(this.model);
    let mi = 0;
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone;
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const info = tpl.meshes[mi++];
      const src = m.material as THREE.MeshStandardMaterial;
      const base = outfit.colors?.[src.name] ?? `#${src.color.getHexString()}`;
      const paints = outfit.paint?.filter((p) => p.mat === src.name) ?? [];
      if (paints.length) {
        // per-vertex colour: the geometry is cloned for this figure only
        const geo = m.geometry.clone();
        const n = geo.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
        for (let i = 0; i < n; i++) {
          const y = info.raw[i * 3 + 1] * this.s;
          let hex = base;
          // hands hang below the knees; only the legs and torso get repainted
          const j = info.joint[i];
          for (const p of paints) if (y < p.below && (p.joints ? p.joints.test(j) : !ARM.test(j))) hex = p.color;
          c.set(hex);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        m.geometry = geo;
        m.material = vcMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
      } else m.material = lam(base);
      // skinned bounds are computed in the bind pose; seated figures would be culled
      m.frustumCulled = false;
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const n of DRIVEN) if (this.bones[n]) this.driven.push([this.bones[n], this.bones[n].quaternion.clone()]);
    this.group.updateMatrixWorld(true);
    // the rest pose (arms down, head forward) is not the pose the mesh was
    // modelled in; props measured on the mesh must be bound through the bind pose
    const toGroup = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const meshG = toGroup.clone().multiply(m.matrixWorld);
      m.skeleton.bones.forEach((b, i) => {
        this.bind[b.name] ??= meshG.clone().multiply(m.skeleton.boneInverses[i].clone().invert());
      });
    });
  }

  bone(name: string): THREE.Bone { return this.bones[name]; }

  /** Bone origin in group space (metres), as currently posed. */
  at(name: string, out = new THREE.Vector3()): THREE.Vector3 {
    this.bones[name].getWorldPosition(out);
    return this.group.worldToLocal(out);
  }

  /** Bone origin in the bind pose, the space `extent()` measures and `attach()` takes. */
  bindAt(name: string, out = new THREE.Vector3()): THREE.Vector3 {
    const m = this.bind[name];
    return m ? out.setFromMatrixPosition(m) : this.at(name, out);
  }

  /**
   * Extents of the bind-pose mesh, in metres: vertices skinned mostly to one of
   * `joints` (any if empty), optionally of one material, within a height band.
   */
  extent(joints: string[], y0: number, y1: number, x0 = -Infinity, x1 = Infinity): THREE.Box3 {
    const box = new THREE.Box3();
    for (const m of this.tpl.meshes) {
      for (let i = 0; i < m.joint.length; i++) {
        if (joints.length && !joints.includes(m.joint[i])) continue;
        const x = m.raw[i * 3] * this.s, y = m.raw[i * 3 + 1] * this.s, z = m.raw[i * 3 + 2] * this.s;
        if (y < y0 || y > y1 || x < x0 || x > x1) continue;
        box.expandByPoint(_a.set(x, y, z));
      }
    }
    return box;
  }

  /**
   * Depth of the bind-pose surface at (x, y), metres: the frontmost hit of a ray
   * along -Z through the mesh triangles (the rearmost with `back`), or NaN.
   */
  probe(x: number, y: number, back = false): number {
    const k = 1 / this.s, px = x * k, py = y * k;
    let best = back ? Infinity : -Infinity;
    for (const m of this.tpl.meshes) {
      const r = m.raw, n = m.index ? m.index.length : r.length / 3;
      for (let i = 0; i < n; i += 3) {
        const a = (m.index ? m.index[i] : i) * 3, b = (m.index ? m.index[i + 1] : i + 1) * 3, c = (m.index ? m.index[i + 2] : i + 2) * 3;
        const x0 = r[a], y0 = r[a + 1], x1 = r[b], y1 = r[b + 1], x2 = r[c], y2 = r[c + 1];
        const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
        if (Math.abs(d) < 1e-12) continue;
        const u = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / d;
        const v = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / d;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const z = u * r[a + 2] + v * r[b + 2] + (1 - u - v) * r[c + 2];
        best = back ? Math.min(best, z) : Math.max(best, z);
      }
    }
    return Number.isFinite(best) ? best * this.s : NaN;
  }

  /**
   * Bind a prop to a bone. The prop is placed in group space on the bind-pose
   * mesh (see `extent()` and `bindAt()`), and follows the bone from then on.
   */
  attach(bone: string, obj: THREE.Object3D): THREE.Object3D {
    const b = this.bind[bone];
    if (!b) {
      this.group.add(obj);
      this.group.updateMatrixWorld(true);
      this.bones[bone].attach(obj);
      return obj;
    }
    obj.updateMatrix();
    const local = b.clone().invert().multiply(obj.matrix);
    local.decompose(obj.position, obj.quaternion, obj.scale);
    this.bones[bone].add(obj);
    return obj;
  }

  play(name: string, opts: { fade?: number; speed?: number; once?: boolean; at?: number } = {}): void {
    if (name === this.clip) {
      if (this.action && opts.speed !== undefined) this.action.timeScale = opts.speed;
      return;
    }
    const clip = this.tpl.clips[name];
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    a.reset();
    a.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!opts.once;
    a.timeScale = opts.speed ?? 1;
    if (opts.at !== undefined) a.time = opts.at * clip.duration;
    a.play();
    const prev = this.action;
    if (prev && (opts.fade ?? 0.3) > 0) a.crossFadeFrom(prev, opts.fade ?? 0.3, false);
    else prev?.stop();
    this.action = a;
    this.clip = name;
  }

  /** Advance the clips; procedural overrides (look, reach) go after this. */
  tick(dt: number): void {
    // overrides are absolute per frame: undo last frame's before the clips apply
    for (const [b, q] of this.driven) b.quaternion.copy(q);
    this.mixer.update(dt);
    this.group.updateMatrixWorld(true);
  }

  /** Turn the head (and a little of the chest) by yaw, nod by pitch, radians in group space. */
  look(yaw: number, pitch = 0): void {
    if (Math.abs(yaw) + Math.abs(pitch) < 1e-4) return;
    const ax = _c.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.spin('Torso', UP, yaw * 0.25);
    this.spin('Neck', UP, yaw * 0.35);
    this.spin('Head', UP, yaw * 0.4);
    this.spin('Neck', ax, pitch * 0.4);
    this.spin('Head', ax, pitch * 0.6);
  }

  /**
   * Two-bone IK for an arm: bring the wrist to a group-space target, the elbow
   * bending toward `pole` (group-space direction), blended in by `w`.
   */
  reach(side: Side, target: THREE.Vector3, pole: THREE.Vector3, w = 1): void {
    if (w <= 0.001) return;
    const U = this.bones[`UpperArm${side}`], L = this.bones[`LowerArm${side}`], P = this.bones[`Palm${side}`];
    const mw = this.group.matrixWorld;
    U.getWorldPosition(_s); L.getWorldPosition(_e); P.getWorldPosition(_h);
    const l1 = _s.distanceTo(_e), l2 = _e.distanceTo(_h);
    _t.copy(target).applyMatrix4(mw);
    _t.lerpVectors(_h, _t, clamp(w, 0, 1));
    const dir = _d.subVectors(_t, _s);
    const len = clamp(dir.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    dir.normalize();
    _t.copy(_s).addScaledVector(dir, len);
    const pw = _p.copy(pole).transformDirection(mw);
    pw.addScaledVector(dir, -pw.dot(dir));
    if (pw.lengthSq() < 1e-8) pw.set(0, -1, 0);
    pw.normalize();
    const a = Math.acos(clamp((l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), -1, 1));
    const elbow = _b.copy(_s).addScaledVector(dir, Math.cos(a) * l1).addScaledVector(pw, Math.sin(a) * l1);
    this.aim(U, _e, elbow);
    P.getWorldPosition(_h);
    this.aim(L, _h, _t);
  }

  /** Rotate a bone so that its child at world `from` swings toward world `to`. */
  private aim(bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3): void {
    bone.getWorldPosition(_a);
    const u = from.clone().sub(_a).normalize(), v = to.clone().sub(_a).normalize();
    this.rot(bone, _qd.setFromUnitVectors(u, v));
  }

  private spin(name: string, axisGroup: THREE.Vector3, angle: number): void {
    const bone = this.bones[name];
    this.group.getWorldQuaternion(_q);
    const ax = axisGroup.clone().applyQuaternion(_q).normalize();
    this.rot(bone, _qd.setFromAxisAngle(ax, angle));
  }

  /** Apply a world-space rotation to a bone, keeping its parent. */
  private rot(bone: THREE.Bone, qWorld: THREE.Quaternion): void {
    bone.parent!.getWorldQuaternion(_qp);
    _q.copy(_qp).invert().multiply(qWorld).multiply(_qp);
    bone.quaternion.premultiply(_q);
    bone.updateMatrixWorld(true);
  }
}

// ---------------- props ----------------

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

/**
 * A horizontal slice of the head at `frac` of the way from the skull base to
 * the crown: centre and half-width/depth in metres, plus the crown height.
 * Sliced rather than boxed, so a nose or long hair does not inflate it.
 */
export function headOf(h: Human, frac = 0.55): { c: THREE.Vector3; rx: number; rz: number; top: number } {
  const base = h.bindAt('Head').y;
  const top = h.extent(['Head'], base, 9).max.y;
  const y = base + (top - base) * frac;
  const box = h.extent(['Head'], y - 0.02, y + 0.02);
  const c = box.getCenter(new THREE.Vector3());
  c.set(0, y, c.z);
  return { c, rx: (box.max.x - box.min.x) / 2, rz: (box.max.z - box.min.z) / 2, top };
}

/** A cotton headscarf tied under the chin: cap over the crown and a tail at the back. */
export function kerchief(h: Human, color: string): void {
  const { c, rx, rz: rzHair, top } = headOf(h);
  const m = lam(color);
  // long hair at the back would balloon the scarf; fit the skull, keep the face line
  const rz = Math.min(rzHair, rx * 1.3);
  c.z += rzHair - rz;
  const ry = top - c.y + 0.012;
  // pulled low over the brow and down past the ears and cheeks
  const cap = mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.74).scale(rx + 0.016, ry, rz + 0.016), m, c.x, c.y, c.z - 0.004);
  cap.rotation.x = -0.62;
  h.attach('Head', cap);
  // the folded corner hanging down the back of the neck
  const tail = mesh(new THREE.ConeGeometry(rx * 0.75, ry * 1.1, 3), m, c.x, c.y - ry * 0.75, c.z - rz * 0.85);
  tail.rotation.x = Math.PI - 0.35;
  h.attach('Head', tail);
  // two ends knotted under the chin
  for (const s of [-1, 1]) {
    const end = mesh(new THREE.BoxGeometry(0.03, 0.07, 0.012), m, c.x + s * rx * 0.55, c.y - ry * 0.95, c.z + rz * 0.5);
    end.rotation.z = s * 0.5;
    h.attach('Head', end);
  }
  h.attach('Head', mesh(new THREE.SphereGeometry(0.022, 6, 4), m, c.x, c.y - ry * 1.18, c.z + rz * 0.62));
}

/** Frontmost (or, with `back`, rearmost) z of the torso within a height band, metres. */
export function frontOf(h: Human, y0: number, y1: number, back = false, halfW = 0.12): number {
  const box = h.extent([], y0, y1, -halfW, halfW);
  return back ? box.min.z : box.max.z;
}

/** An apron hanging from the waist down to `bottom` (metres), following the front of the clothes. */
export function apron(h: Human, bottom?: number, color = '#e8e4da'): void {
  const hipY = h.bindAt('Hips').y;
  const yTop = hipY + 0.22, yBot = bottom ?? Math.max(0.3, hipY - 0.3);
  // clear of a jacket hem hanging over the waist
  let zTop = frontOf(h, yTop - 0.06, yTop + 0.14, false, 0.16) + 0.01;
  let zBot = Math.max(frontOf(h, yBot, yBot + 0.1, false, 0.14) + 0.008, zTop);
  if (!Number.isFinite(zTop + zBot)) return;
  // push the whole sheet forward until nothing between waist and hem pokes through
  let push = 0;
  for (let y = yBot; y <= yTop; y += 0.03) {
    const f = frontOf(h, y - 0.015, y + 0.015, false, 0.14);
    if (Number.isFinite(f)) push = Math.max(push, f + 0.03 - (zBot + ((y - yBot) / (yTop - yBot)) * (zTop - zBot)));
  }
  zTop += push; zBot += push;
  const len = Math.hypot(yTop - yBot, zBot - zTop);
  const a = mesh(new THREE.BoxGeometry(0.28, len, 0.01), lam(color), 0, (yTop + yBot) / 2, (zTop + zBot) / 2);
  a.rotation.x = Math.atan2(zBot - zTop, yTop - yBot);
  h.attach('Hips', a);
}

// ---------------- villagers ----------------

export class Person {
  readonly human: Human;
  get group(): THREE.Group { return this.human.group; }
  /** Seconds of waving left; set by the mission on delivery. */
  wave = 0;
  private w = 0;
  private readonly target = new THREE.Vector3();

  constructor(body: Body, outfit: Outfit) {
    this.human = new Human(body, outfit);
    this.human.play('Idle', { fade: 0, at: Math.random(), speed: 0.85 + Math.random() * 0.3 });
  }

  update(dt: number, t: number): void {
    const h = this.human;
    this.wave = Math.max(0, this.wave - dt);
    this.w = damp(this.w, this.wave > 0 ? 1 : 0, 7, dt);
    h.tick(dt);
    if (this.w > 0.01) {
      // right hand up above the shoulder, swinging side to side
      h.at('UpperArmR', this.target);
      this.target.x += -0.2 + Math.sin(t * 9) * 0.12;
      this.target.y += 0.42;
      this.target.z += 0.12;
      h.reach('R', this.target, _c.set(-1, -0.6, 0.1), this.w);
    }
  }
}

/**
 * A village woman: headscarf, coat or dress, thick stockings, maybe an apron.
 * `body` 'dress' reads as an older woman in a long dress, 'woman' as a younger
 * one in a jacket and trousers.
 */
export function makePerson(coat: string, scarf: string, withApron = false, body: Body = 'dress'): Person {
  // hair (and the eyebrows painted into it) stays hair: grey under an old woman's scarf
  const hair = body === 'dress' ? '#8e8880' : '#5a4232';
  const colors: Record<string, string> = { Hair: hair, HairBase: hair, Shoes: '#2a2420', Skin: '#d8a888' };
  const skirt = `#${new THREE.Color(coat).multiplyScalar(0.55).getHexString()}`;
  if (body === 'dress') colors.Dress = coat;
  else Object.assign(colors, { Jacket: coat, LightJacket: coat, Shirt: '#b8b0a0', Pants: '#2e2a30' });
  const p = new Person(body, {
    colors,
    paint: body === 'dress'
      ? [
        // thick stockings, long sleeves and a closed neckline: a village dress, not a summer frock
        { mat: 'Skin', below: 0.62, color: '#5e4a3e' },
        { mat: 'Skin', below: 9, color: coat, joints: /Shoulder|UpperArm|LowerArm|Torso|Abdomen|Hips/ },
        // a knitted cardigan over a dark skirt
        { mat: 'Dress', below: 0.88, color: skirt },
      ]
      : [],
  });
  kerchief(p.human, scarf);
  // the long dress ends at the knee, so the apron stops at its hem
  if (withApron) apron(p.human, body === 'dress' ? 0.63 : undefined);
  return p;
}
