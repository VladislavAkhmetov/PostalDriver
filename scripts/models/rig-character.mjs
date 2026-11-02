/**
 * Rig a T-posed generated character on the people's skeleton (Quaternius BaseHuman from man.glb), keeping its clips.
 *   node scripts/models/rig-character.mjs <simplified.glb> src/assets/people/man.glb <out.glb> [name]
 * Environment: HAND — wrist to fingertip as a fraction of the height (default 0.077; a real hand is about 0.11),
 * CROTCH — the fork of the legs as a fraction of the height when a jacket hides it (default: measured),
 * TEX — a ready 512² colour texture to use instead of the model's own (Muha's has the brand stripes painted out).
 * ARM — stretch the arms between shoulder and wrist (default 1).
 *   Timur: HAND=0.112 CROTCH=0.5 ARM=1.3   Muha: HAND=0.108 CROTCH=0.47 TEX=muha-512.png
 * Needs (outside the app's dependencies): @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions, and Python with Pillow.
 * Landmarks are measured on the mesh (crotch, arm line, torso width, hands); the legs are scaled to the
 * clip skeleton's leg length, bones keep the bind (T-pose) orientations, translation tracks are shifted by
 * the change in rest pose. Weights fall off with distance to each bone, gated by region; the hands are
 * split over palm, knuckles, fingers and thumb so they can close round a steering wheel.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [copPath, manPath, outPath, meshName = 'Character'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(copPath);
const doc = await io.read(manPath);

const sprim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const spos = sprim.getAttribute('POSITION'), snor = sprim.getAttribute('NORMAL'), suv = sprim.getAttribute('TEXCOORD_0'), sidx = sprim.getIndices();
const N = spos.getCount();
const P = [], Nn = [], T = [];
for (let i = 0; i < N; i++) { const v = spos.getElement(i, []), n = snor.getElement(i, []); P.push([v[0], -v[1], -v[2]]); Nn.push([n[0], -n[1], -n[2]]); }
for (let i = 0; i < sidx.getCount(); i += 3) T.push([sidx.getScalar(i), sidx.getScalar(i + 1), sidx.getScalar(i + 2)]);
const zs = P.map((p) => p[2]); const h = Math.max(...zs) - Math.min(...zs), bot = Math.min(...zs);
for (const p of P) p[2] -= bot;
let xmax = Math.max(...P.map((p) => p[0]));

// ---- measurements
const covered = (z) => T.some((t) => { const v = t.map((i) => P[i]); const pts = []; for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3]; if ((a[0] <= 0) !== (b[0] <= 0)) { const u = a[0] / (a[0] - b[0]); pts.push(a[2] + (b[2] - a[2]) * u); } } return pts.length === 2 && Math.min(...pts) <= z && Math.max(...pts) >= z; });
let crotch = 0.45 * h;
// the highest point the legs are still apart (trouser legs may touch lower down, at the thighs)
for (let f = 0.2; f < 0.6; f += 0.005) if (!covered(f * h)) crotch = f * h;
// a long jacket hides the fork of the legs: the crotch can be given as a fraction of the height
if (process.env.CROTCH) crotch = +process.env.CROTCH * h;
const slice = (x, w, zMin) => P.filter((p) => Math.abs(p[0] - x) < w && p[2] > zMin);
const mid = (s, i) => (Math.min(...s.map((p) => p[i])) + Math.max(...s.map((p) => p[i]))) / 2;
const armS = slice(0.62 * xmax, 0.03 * h, 0.55 * h);
const armZ = mid(armS, 2), armY = mid(armS, 1);
const chest = P.filter((p) => Math.abs(p[2] - (armZ - 0.12 * h)) < 0.02 * h);
const torsoHalf = Math.max(...chest.map((p) => Math.abs(p[0])));
const shX = Math.min(torsoHalf * 1.2, 0.28 * xmax);
// wrist to fingertip as a fraction of the height (a real hand is about 0.11): joints of the hand scale with it
const HL = +(process.env.HAND ?? 0.077), hr = HL / 0.077;
// ARM — stretch the arms from shoulder to wrist by this factor (the hand rides along unchanged): a model
// with short arms for its height, which must reach a steering wheel. Done here, evenly along the sleeve,
// rather than by moving bones at run time, which would stretch the skin only at the joints.
const ARMK = +(process.env.ARM ?? 1);
if (ARMK !== 1) {
  const w0 = xmax - HL * h;
  for (const p of P) {
    const ax = Math.abs(p[0]);
    if (ax <= shX || p[2] < armZ - 0.12 * h) continue;
    const nx = ax < w0 ? shX + (ax - shX) * ARMK : ax + (w0 - shX) * (ARMK - 1);
    p[0] = Math.sign(p[0]) * nx;
  }
  xmax = Math.max(...P.map((p) => p[0]));
}
const wristX = xmax - HL * h;
const handS = slice(wristX + 0.03 * hr * h, 0.015 * h, armZ - 0.08 * h);
const handZ = mid(handS, 2), handY = mid(handS, 1);
const legC = (f, side) => { const s = P.filter((p) => Math.abs(p[2] - f * h) < 0.03 * h && p[0] * side > 0 && Math.abs(p[0]) < 0.2 * h); return [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length]; };
const hipZ = 0.95 * crotch, footZ = 0.023 * hipZ, leg = hipZ - footZ, kneeZ = footZ + 0.611 * leg;
const neckZ = armZ + 0.06 * h, headZ = neckZ + 0.056 * h;
const [kneeX, kneeY] = legC(kneeZ / h, 1), [ankX, ankY] = legC(0.06, 1);
// under a long jacket the slice at the hips is the jacket: keep the hip joints at least about as wide as the knees
const hipX = Math.max(legC((hipZ - 0.04 * h) / h, 1)[0], kneeX * 0.85);
const toeY = Math.min(...P.filter((p) => p[2] < 0.04 * h && p[0] > 0).map((p) => p[1]));
console.log(meshName, JSON.stringify({ h: +h.toFixed(3), crotch: +(crotch / h).toFixed(3), armZ: +(armZ / h).toFixed(3), torsoHalf: +(torsoHalf / h).toFixed(3), shX: +(shX / h).toFixed(3), xmax: +(xmax / h).toFixed(3), hip: +hipX.toFixed(3), knee: +kneeX.toFixed(3), ank: +ankX.toFixed(3) }));

const lerpSpine = (r) => hipZ + r * (neckZ - hipZ);
const hx = (dx) => wristX + dx * hr * h;
const J = {
  Body: [0, armY, lerpSpine(-0.021)], Hips: [0, armY, lerpSpine(-0.106)], Abdomen: [0, armY, lerpSpine(0.095)], Torso: [0, armY, lerpSpine(0.503)],
  Neck: [0, armY, neckZ], Head: [0, armY * 0.7, headZ],
  'Shoulder.L': [0.41 * shX, armY, armZ - 0.04 * h], 'UpperArm.L': [shX, armY, armZ + 0.005 * h], 'LowerArm.L': [(shX + wristX) / 2 + 0.005 * h, armY, (armZ + handZ) / 2], 'Palm.L': [wristX, handY, handZ],
  'MiddleHand.L': [hx(0.036), handY, handZ], 'Fingers.L': [hx(0.058), handY, handZ - 0.003 * h], 'Thumb1.L': [hx(0.012), handY - 0.017 * h, handZ - 0.004 * h], 'Thumb2.L': [hx(0.03), handY - 0.03 * h, handZ - 0.006 * h],
  'UpperLeg.L': [hipX, ankY * 0.6, hipZ], 'LowerLeg.L': [kneeX, kneeY, kneeZ], 'Foot.L': [ankX, ankY, footZ],
};
for (const k of Object.keys(J)) if (k.endsWith('.L')) { const p = J[k]; J[k.replace('.L', '.R')] = [-p[0], p[1], p[2]]; }

// ---- weights
const seg = (a, b, p) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)); return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t); };
const BONES = { Head: [J.Head, [0, 0, 0.978 * h]], Neck: [J.Neck, J.Head], Torso: [J.Torso, J.Neck], Abdomen: [J.Abdomen, J.Torso], Hips: [J.Hips, J.Abdomen] };
for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
  const j = (n) => J[`${n}.${S}`];
  BONES[`Shoulder.${S}`] = [j('Shoulder'), j('UpperArm')]; BONES[`UpperArm.${S}`] = [j('UpperArm'), j('LowerArm')]; BONES[`LowerArm.${S}`] = [j('LowerArm'), j('Palm')];
  BONES[`Palm.${S}`] = [j('Palm'), j('MiddleHand')]; BONES[`MiddleHand.${S}`] = [j('MiddleHand'), j('Fingers')]; BONES[`Fingers.${S}`] = [j('Fingers'), [s * xmax, handY, handZ - 0.006 * h]];
  BONES[`Thumb1.${S}`] = [j('Thumb1'), j('Thumb2')]; BONES[`Thumb2.${S}`] = [j('Thumb2'), [s * hx(0.05), handY - 0.045 * h, handZ - 0.008 * h]];
  BONES[`UpperLeg.${S}`] = [j('UpperLeg'), j('LowerLeg')]; BONES[`LowerLeg.${S}`] = [j('LowerLeg'), j('Foot')]; BONES[`Foot.${S}`] = [j('Foot'), [s * ankX, toeY, 0.012 * h]];
}
function candidates(p) {
  const S = p[0] >= 0 ? 'L' : 'R', ax = Math.abs(p[0]);
  if (p[2] > armZ - 0.085 * h && ax > torsoHalf * 1.1) {
    // the hand: palm, knuckles, fingers; the thumb sticks out forward near the wrist
    if (ax > wristX - 0.012 * h) {
      const thumbSide = p[1] < handY - 0.012 * h && ax < hx(0.055);
      return thumbSide ? [`Palm.${S}`, `Thumb1.${S}`, `Thumb2.${S}`] : [`LowerArm.${S}`, `Palm.${S}`, `MiddleHand.${S}`, `Fingers.${S}`];
    }
    return [`Shoulder.${S}`, `UpperArm.${S}`, `LowerArm.${S}`, 'Torso'];
  }
  if (p[2] < hipZ + 0.01 * h && ax < 0.15 * h) {
    if (p[2] < footZ + 0.06 * h) return [`LowerLeg.${S}`, `Foot.${S}`];
    return ['Hips', `UpperLeg.${S}`, `LowerLeg.${S}`];
  }
  if (p[2] > neckZ - 0.026 * h && ax < 0.095 * h) return ['Torso', 'Neck', 'Head'];
  return ['Hips', 'Abdomen', 'Torso', 'Neck', 'Shoulder.L', 'Shoulder.R'];
}
const eps = 0.0105 * h;
const W = P.map((p) => {
  const c = candidates(p).map((b) => [b, 1 / (seg(BONES[b][0], BONES[b][1], p) + eps) ** 4]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const sum = c.reduce((a, x) => a + x[1], 0);
  return c.map(([b, w]) => [b, w / sum]);
});

// ---- skeleton: man's bones moved to these joints in the bind (T) pose
const k = 0.0211 / leg;
const nodes = doc.getRoot().listNodes(), byName = Object.fromEntries(nodes.map((n) => [n.getName(), n]));
const skin = doc.getRoot().listSkins()[0], joints = skin.listJoints(), arm = byName.HumanArmature;
const restBefore = new Map(nodes.map((n) => [n, n.getTranslation().slice()]));
const ibmIn = skin.getInverseBindMatrices().getArray();
const bind = new Map(joints.map((j, i) => [j, new THREE.Matrix4().fromArray(ibmIn, i * 16).invert()]));
for (const j of joints) { const w = J[j.getName()]; if (w) bind.get(j).setPosition(w[0] * k, w[1] * k, w[2] * k); }
const order = []; const walk = (n) => { order.push(n); n.listChildren().forEach(walk); }; arm.listChildren().forEach(walk);
const isJoint = new Set(joints);
for (const n of order) {
  if (!isJoint.has(n) || !J[n.getName()]) continue;
  const parent = n.getParentNode();
  const pb = isJoint.has(parent) ? bind.get(parent) : new THREE.Matrix4();
  const p = new THREE.Vector3().setFromMatrixPosition(bind.get(n)).applyMatrix4(pb.clone().invert());
  n.setTranslation([p.x, p.y, p.z]);
}
const ibm = new Float32Array(joints.length * 16); joints.forEach((j, i) => bind.get(j).clone().invert().toArray(ibm, i * 16));
skin.getInverseBindMatrices().setArray(ibm);
for (const anim of doc.getRoot().listAnimations()) for (const ch of anim.listChannels()) {
  if (ch.getTargetPath() !== 'translation') continue;
  const n = ch.getTargetNode(), a = restBefore.get(n), b = n.getTranslation(), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const out = ch.getSampler().getOutput(), arr = out.getArray().slice();
  for (let i = 0; i < arr.length; i += 3) { arr[i] += d[0]; arr[i + 1] += d[1]; arr[i + 2] += d[2]; }
  out.setArray(arr);
}
const mesh = byName.BaseHuman.getMesh();
for (const p of mesh.listPrimitives()) { mesh.removePrimitive(p); p.dispose(); }
for (const m of doc.getRoot().listMaterials()) m.dispose();
const jIndex = new Map(joints.map((j, i) => [j.getName(), i]));
const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), jo = new Uint16Array(N * 4), we = new Float32Array(N * 4);
for (let i = 0; i < N; i++) { pos.set(P[i].map((x) => x * k), i * 3); nor.set(Nn[i], i * 3); uv.set(suv.getElement(i, []), i * 2); W[i].forEach(([b, w], s) => { jo[i * 4 + s] = jIndex.get(b); we[i * 4 + s] = w; }); }
const buf = doc.getRoot().listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const idx = new Uint16Array(sidx.getCount()); for (let i = 0; i < idx.length; i++) idx[i] = sidx.getScalar(i);
const img = src.getRoot().listMaterials()[0].getBaseColorTexture();
const texIn = `/tmp/${meshName}_src.png`, texOut = process.env.TEX ?? `/tmp/${meshName}_512.png`;
writeFileSync(texIn, Buffer.from(img.getImage()));
if (!process.env.TEX) execFileSync('python3', ['-c', `from PIL import Image; im = Image.open('${texIn}').convert('RGB'); im.resize((512, 512), Image.LANCZOS).save('${texOut}', optimize=True)`]);
const tex = doc.createTexture(meshName).setImage(readFileSync(texOut)).setMimeType('image/png');
const mat = doc.createMaterial(meshName).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', uv)).setAttribute('JOINTS_0', acc('VEC4', jo)).setAttribute('WEIGHTS_0', acc('VEC4', we)).setIndices(acc('SCALAR', idx)).setMaterial(mat));
mesh.setName(meshName);
await doc.transform(prune());
await io.write(outPath, doc);
console.log(' tris', idx.length / 3, 'scale', k.toFixed(5));
