/**
 * Rig a T-posed character on the people's skeleton (Quaternius BaseHuman from man.glb), keeping its 11 clips.
 *   node scripts/models/rig-militsioner.mjs <simplified.glb> src/assets/people/man.glb <out.glb>
 * Needs (outside the app's dependencies): @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions, and Python with Pillow.
 * The landmarks in `J` (crotch, neck, shoulders, elbows, wrists… in the model's own units, Z up, -Y forward)
 * were measured for the GAI officer; a new model needs its own. Legs are scaled to the clip skeleton's leg length,
 * bones keep the bind (T-pose) orientations, translation tracks are shifted by the change in rest pose, and
 * weights fall off with distance to each bone, gated by region (arms, legs, trunk, head).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [copPath, manPath, outPath] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const cop = await io.read(copPath);
const doc = await io.read(manPath);

// ---------------------------------------------------------------- the cop's mesh, in its own Z-up units (height 1.155)
const cprim = cop.getRoot().listMeshes()[0].listPrimitives()[0];
const cpos = cprim.getAttribute('POSITION'), cnor = cprim.getAttribute('NORMAL'), cuv = cprim.getAttribute('TEXCOORD_0'), cidx = cprim.getIndices();
const N = cpos.getCount();
const P = [], Nn = [];
for (let i = 0; i < N; i++) {
  const v = cpos.getElement(i, []), n = cnor.getElement(i, []);
  // node rotation +90° about X → world (x, -z, y), Y up; armature-local is Z up with forward -Y: (x, -wz, wy) = (x, -y, -z)? see below
  // world: wx = v0, wy = -v2, wz = v1 ; armature local (Z up): lx = wx, ly = -wz, lz = wy
  P.push([v[0], -v[1], -v[2]]);
  Nn.push([n[0], -n[1], -n[2]]);
}
// sanity: Z must be up (0 … 1.155)
const zMin = Math.min(...P.map((p) => p[2])), zMax = Math.max(...P.map((p) => p[2]));
console.log('cop z range', zMin.toFixed(3), zMax.toFixed(3));

// ---------------------------------------------------------------- landmarks (cop units, Z up, -Y forward)
const crotch = 0.41 * 1.155;
const hipZ = 0.95 * crotch, footZ = 0.023 * hipZ;
const leg = hipZ - footZ;
const kneeZ = footZ + 0.611 * leg;
const neckZ = 0.925, headZ = 0.99, armZ = 0.857;
const lerpSpine = (r) => hipZ + r * (neckZ - hipZ);
const J = {
  Body: [0, 0.01, lerpSpine(-0.021)],
  Hips: [0, 0.01, lerpSpine(-0.106)],
  Abdomen: [0, 0.01, lerpSpine(0.095)],
  Torso: [0, 0.012, lerpSpine(0.503)],
  Neck: [0, 0.012, neckZ],
  Head: [0, 0.008, headZ],
  'Shoulder.L': [0.05, 0.012, 0.815], 'UpperArm.L': [0.122, 0.015, 0.862], 'LowerArm.L': [0.265, 0.015, 0.855], 'Palm.L': [0.392, 0.011, 0.849],
  'MiddleHand.L': [0.42, 0.011, 0.849], 'Fingers.L': [0.45, 0.011, 0.849], 'Thumb1.L': [0.405, -0.02, 0.845], 'Thumb2.L': [0.425, -0.035, 0.845],
  'UpperLeg.L': [0.07, 0.012, hipZ], 'LowerLeg.L': [0.065, 0.005, kneeZ], 'Foot.L': [0.09, 0.025, footZ],
};
for (const k of Object.keys(J)) if (k.endsWith('.L')) { const p = J[k]; J[k.replace('.L', '.R')] = [-p[0], p[1], p[2]]; }
const toe = (s) => [s * 0.09, -0.1, 0.012];

// ---------------------------------------------------------------- weights
const seg = (a, b, p) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
};
const BONES = {
  Head: [J.Head, [0, 0, 1.13]], Neck: [J.Neck, J.Head], Torso: [J.Torso, J.Neck], Abdomen: [J.Abdomen, J.Torso], Hips: [J.Hips, J.Abdomen],
};
for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
  BONES[`Shoulder.${S}`] = [J[`Shoulder.${S}`], J[`UpperArm.${S}`]];
  BONES[`UpperArm.${S}`] = [J[`UpperArm.${S}`], J[`LowerArm.${S}`]];
  BONES[`LowerArm.${S}`] = [J[`LowerArm.${S}`], J[`Palm.${S}`]];
  BONES[`Palm.${S}`] = [J[`Palm.${S}`], [s * 0.481, 0.011, 0.849]];
  BONES[`UpperLeg.${S}`] = [J[`UpperLeg.${S}`], J[`LowerLeg.${S}`]];
  BONES[`LowerLeg.${S}`] = [J[`LowerLeg.${S}`], J[`Foot.${S}`]];
  BONES[`Foot.${S}`] = [J[`Foot.${S}`], toe(s)];
}
function candidates(p) {
  const S = p[0] >= 0 ? 'L' : 'R';
  const ax = Math.abs(p[0]);
  // the deltoid belongs to the arm (blending into the torso), or it stays behind as a shelf when the arm drops
  if (p[2] > 0.76 && ax > 0.112) return [`Shoulder.${S}`, `UpperArm.${S}`, `LowerArm.${S}`, `Palm.${S}`, 'Torso'];
  if (p[2] < hipZ + 0.01 && ax < 0.17) {
    if (p[2] < footZ + 0.07) return [`LowerLeg.${S}`, `Foot.${S}`];
    return ['Hips', `UpperLeg.${S}`, `LowerLeg.${S}`];
  }
  if (p[2] > neckZ - 0.03 && ax < 0.11) return ['Torso', 'Neck', 'Head'];
  return ['Hips', 'Abdomen', 'Torso', 'Neck', 'Shoulder.L', 'Shoulder.R'];
}
const eps = 0.012;
const W = [];
for (const p of P) {
  const c = candidates(p).map((b) => [b, 1 / (seg(BONES[b][0], BONES[b][1], p) + eps) ** 4]);
  c.sort((a, b) => b[1] - a[1]);
  const top = c.slice(0, 3);
  const sum = top.reduce((a, x) => a + x[1], 0);
  W.push(top.map(([b, w]) => [b, w / sum]));
}

// ---------------------------------------------------------------- the skeleton: man's bones, moved to the cop's joints
const k = 0.0211 / leg; // leg length matches the clips
console.log('scale', k.toFixed(5), 'height', (zMax * k).toFixed(4));
const nodes = doc.getRoot().listNodes();
const byName = Object.fromEntries(nodes.map((n) => [n.getName(), n]));
const skin = doc.getRoot().listSkins()[0];
const joints = skin.listJoints();
const arm = byName.HumanArmature;
const local = (n) => new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(...n.getScale()));
const restBefore = new Map(nodes.map((n) => [n, n.getTranslation().slice()]));
// the file's bind pose is the T-pose (inverse bind matrices); the nodes' own rest pose has the arms down
const ibmIn = skin.getInverseBindMatrices().getArray();
const bind = new Map(joints.map((j, i) => [j, new THREE.Matrix4().fromArray(ibmIn, i * 16).invert()]));
// move each joint of the T-pose to the cop's, keeping the bone's orientation
for (const j of joints) {
  const want = J[j.getName()];
  if (!want) continue;
  const m = bind.get(j);
  m.setPosition(want[0] * k, want[1] * k, want[2] * k);
}
// bone offsets from the moved T-pose: each joint's position in its parent's bind frame
const order = [];
const walk = (n) => { order.push(n); n.listChildren().forEach(walk); };
arm.listChildren().forEach(walk);
const isJoint = new Set(joints);
for (const n of order) {
  if (!isJoint.has(n) || !J[n.getName()]) continue;
  const parent = n.getParentNode();
  const pb = isJoint.has(parent) ? bind.get(parent) : new THREE.Matrix4();
  const p = new THREE.Vector3().setFromMatrixPosition(bind.get(n)).applyMatrix4(pb.clone().invert());
  n.setTranslation([p.x, p.y, p.z]);
}
const ibm = new Float32Array(joints.length * 16);
joints.forEach((j, i) => { bind.get(j).clone().invert().toArray(ibm, i * 16); });
skin.getInverseBindMatrices().setArray(ibm);
// clips: translation tracks keep their motion, shifted by how much the rest pose moved
for (const anim of doc.getRoot().listAnimations()) {
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() !== 'translation') continue;
    const n = ch.getTargetNode();
    const a = restBefore.get(n), b = n.getTranslation();
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const out = ch.getSampler().getOutput();
    const arr = out.getArray().slice();
    for (let i = 0; i < arr.length; i += 3) { arr[i] += d[0]; arr[i + 1] += d[1]; arr[i + 2] += d[2]; }
    out.setArray(arr);
  }
}

// ---------------------------------------------------------------- the new skinned primitive
const mesh = byName.BaseHuman.getMesh();
for (const p of mesh.listPrimitives()) { mesh.removePrimitive(p); p.dispose(); }
for (const m of doc.getRoot().listMaterials()) m.dispose();
const jIndex = new Map(joints.map((j, i) => [j.getName(), i]));
const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), jo = new Uint16Array(N * 4), we = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  pos.set(P[i].map((x) => x * k), i * 3);
  nor.set(Nn[i], i * 3);
  uv.set(cuv.getElement(i, []), i * 2);
  W[i].forEach(([b, w], s) => { jo[i * 4 + s] = jIndex.get(b); we[i * 4 + s] = w; });
}
const buf = doc.getRoot().listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const idx = new Uint16Array(cidx.getCount());
for (let i = 0; i < idx.length; i++) idx[i] = cidx.getScalar(i);
// the colour texture, cut down to 512 px
const img = cop.getRoot().listMaterials()[0].getBaseColorTexture();
writeFileSync('/tmp/gai_tex_src.png', Buffer.from(img.getImage()));
execFileSync('python3', ['-c', "from PIL import Image; im = Image.open('/tmp/gai_tex_src.png').convert('RGB'); print(im.size); im.resize((512, 512), Image.LANCZOS).save('/tmp/gai_tex_512.png', optimize=True)"], { stdio: 'inherit' });
const tex = doc.createTexture('GaiUniform').setImage(readFileSync('/tmp/gai_tex_512.png')).setMimeType('image/png');
const mat = doc.createMaterial('Uniform').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
const prim = doc.createPrimitive()
  .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', uv))
  .setAttribute('JOINTS_0', acc('VEC4', jo)).setAttribute('WEIGHTS_0', acc('VEC4', we))
  .setIndices(acc('SCALAR', idx)).setMaterial(mat);
mesh.addPrimitive(prim);
mesh.setName('Militsioner');
await doc.transform(prune());
await io.write(outPath, doc);
console.log('tris', idx.length / 3, 'verts', N, 'joints', joints.length, 'clips', doc.getRoot().listAnimations().map((a) => a.getName().split('|').pop()).join(','));
