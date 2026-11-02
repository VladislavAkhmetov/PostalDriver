/**
 * Prepare a generated car (one welded mesh, three 4096² PBR maps) for the game:
 *   node scripts/models/prep-car.mjs <in.glb> <out.glb> <length m> [ratio=0.07]
 *   VAZ-2106: R=0.29 CLEAN="0.75:2.2:0.7;-2.2:-1.2:0.7" … 4.17   Niva: R=0.335 … 3.74
 * - simplified with meshoptimizer, the node's rotation baked in, scaled to the real length: metres,
 *   +Z forward, wheels on y = 0;
 * - the four wheels cut out of the body into nodes `Wheel_FL` … `Wheel_RR`, each with its origin on
 *   the axle so it can spin (found as the tyre under each wheel arch: contact patch, then the tyre's
 *   top below the gap to the arch, or R — the real tyre's radius in metres);
 * - the roof lamps' red and blue lenses split off into materials `BeaconRed` / `BeaconBlue`, so they
 *   can flash, and the painted windows into `Glass`, so the crew can be seen through them;
 * - one colour texture, 1024² JPEG; CLEAN="z0:z1:yMin;…" repaints the bonnet and boot lid flat in their
 *   own paint, dark details kept (the generator's illegible lettering on the 2106).
 * Needs (outside the app's dependencies): @gltf-transform/core @gltf-transform/extensions
 * @gltf-transform/functions meshoptimizer sharp.
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out, lenArg, ratio = '0.07'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(inp);
await MeshoptSimplifier.ready;
await src.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.002, lockBorder: false }), dedup(), prune());

const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const node = src.getRoot().listNodes().find((x) => x.getMesh());
const q = node.getRotation();
const pos = prim.getAttribute('POSITION'), norA = prim.getAttribute('NORMAL'), uvA = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices();
const n = pos.getCount();
// bake the node's rotation into the vertices (v' = q v q*)
const rot = ([x, y, z]) => {
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
};
let P = Array.from({ length: n }, (_, i) => rot(pos.getElement(i, [])));
const UV = Array.from({ length: n }, (_, i) => uvA.getElement(i, []));
const NR = Array.from({ length: n }, (_, i) => rot(norA.getElement(i, [])));
const T = [];
for (let i = 0; i < idx.getCount(); i += 3) T.push([idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)]);
// metres, centred, wheels on the ground
const mn = [0, 1, 2].map((a) => Math.min(...P.map((p) => p[a]))), mx = [0, 1, 2].map((a) => Math.max(...P.map((p) => p[a])));
const k = +lenArg / (mx[2] - mn[2]);
P = P.map((p) => [(p[0] - (mn[0] + mx[0]) / 2) * k, (p[1] - mn[1]) * k, (p[2] - (mn[2] + mx[2]) / 2) * k]);
const L = +lenArg, W = (mx[0] - mn[0]) * k, H = (mx[1] - mn[1]) * k;
console.log('size', W.toFixed(2), H.toFixed(2), L.toFixed(2), 'tris', T.length);

// ---- texture
const img = src.getRoot().listMaterials()[0].getBaseColorTexture().getImage();
const { data: px, info } = await sharp(Buffer.from(img)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const TW = info.width, TH = info.height;
const at = (u, v) => { const x = Math.min(TW - 1, Math.max(0, Math.floor(u * TW))), y = Math.min(TH - 1, Math.max(0, Math.floor(v * TH))); const o = (y * TW + x) * 3; return [px[o], px[o + 1], px[o + 2]]; };
const isBlue = (c) => c[2] > 110 && c[2] > c[0] + 50 && c[2] > c[1] + 30;
// CLEAN — "z0:z1:yMin;…" (metres): the upward-facing panels there (the bonnet, the boot lid) are
// repainted in their own paint colour, keeping only the dark details (vents, panel gaps): generated
// lettering and smudges go. Each panel's triangles are rasterised in the texture.
const tri2 = (t) => { const a = P[t[0]], b = P[t[1]], c = P[t[2]]; const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; return Math.abs(n[1] / l); };
for (const spec of (process.env.CLEAN ?? '').split(';').filter(Boolean)) {
  const [z0, z1, yMin] = spec.split(':').map(Number);
  const panel = T.filter((t) => { const c = [0, 1, 2].map((a) => (P[t[0]][a] + P[t[1]][a] + P[t[2]][a]) / 3); return c[2] > z0 && c[2] < z1 && c[1] > yMin && tri2(t) > 0.55; });
  const pixels = [];
  for (const t of panel) {
    const q = t.map((i) => [UV[i][0] * TW, UV[i][1] * TH]);
    const x0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])))), x1 = Math.min(TW - 1, Math.ceil(Math.max(...q.map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])))), y1 = Math.min(TH - 1, Math.ceil(Math.max(...q.map((p) => p[1]))));
    const d = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // a pixel's worth of margin, so the seams take the new paint too
      const px_ = x + 0.5, py_ = y + 0.5, m = -1.5 / Math.sqrt(Math.abs(d));
      const l0 = ((q[1][1] - q[2][1]) * (px_ - q[2][0]) + (q[2][0] - q[1][0]) * (py_ - q[2][1])) / d;
      const l1 = ((q[2][1] - q[0][1]) * (px_ - q[2][0]) + (q[0][0] - q[2][0]) * (py_ - q[2][1])) / d;
      if (l0 >= m && l1 >= m && 1 - l0 - l1 >= m) pixels.push(y * TW + x);
    }
  }
  // the panel's paint: the bright end of what is there
  const lum = pixels.map((i) => px[i * 3] + px[i * 3 + 1] + px[i * 3 + 2]).sort((a, b) => a - b);
  const ref = lum[Math.floor(lum.length * 0.8)] ?? 690;
  const pick = pixels.find((i) => px[i * 3] + px[i * 3 + 1] + px[i * 3 + 2] === ref) ?? 0;
  const paint = [px[pick * 3], px[pick * 3 + 1], px[pick * 3 + 2]];
  let n0 = 0;
  for (const i of pixels) { const o = i * 3; if (Math.max(px[o], px[o + 1], px[o + 2]) > 105) { px[o] = paint[0]; px[o + 1] = paint[1]; px[o + 2] = paint[2]; n0++; } }
  // just past the panel's edge in the atlas, blue marks too (texture filtering reaches across)
  const inside = new Uint8Array(TW * TH);
  for (const i of pixels) inside[i] = 1;
  const R = 8;
  for (const i of pixels) {
    const x = i % TW, y = (i / TW) | 0;
    if (inside[i - 1] && inside[i + 1] && inside[i - TW] && inside[i + TW]) continue;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
      const o = (yy * TW + xx) * 3;
      if (px[o + 2] > px[o] + 25 && px[o + 2] > px[o + 1] + 15) { px[o] = paint[0]; px[o + 1] = paint[1]; px[o + 2] = paint[2]; n0++; }
    }
  }
  console.log('clean', spec, 'tris', panel.length, 'px', n0, 'paint', paint.join(','));
}
const tex = await sharp(px, { raw: { width: TW, height: TH, channels: 3 } }).resize(1024, 1024, { kernel: 'lanczos3' }).jpeg({ quality: 86 }).toBuffer();
const colorAt = (t) => at((UV[t[0]][0] + UV[t[1]][0] + UV[t[2]][0]) / 3, (UV[t[0]][1] + UV[t[1]][1] + UV[t[2]][1]) / 3);
const cen = (t) => [0, 1, 2].map((a) => (P[t[0]][a] + P[t[1]][a] + P[t[2]][a]) / 3);

// ---- wheels: the contact patch under each corner, then the tyre's top below the arch
const wheels = [];
for (const [name, sx, sz] of [['Wheel_FL', 1, 1], ['Wheel_FR', -1, 1], ['Wheel_RL', 1, -1], ['Wheel_RR', -1, -1]]) {
  const patch = P.filter((p) => p[1] < 0.03 && p[0] * sx > 0.2 * W && p[2] * sz > 0.15 * L);
  if (!patch.length) throw new Error(`no contact patch for ${name}`);
  const cz = patch.reduce((a, p) => a + p[2], 0) / patch.length;
  const xs = patch.map((p) => Math.abs(p[0])), xIn = Math.min(...xs), xOut = Math.max(...xs);
  // up the column over the patch: tread from the ground up to 2r, a clear gap, then the arch
  const col = P.filter((p) => Math.abs(p[2] - cz) < 0.03 && Math.abs(p[0]) > xIn - 0.01 && Math.abs(p[0]) < xOut + 0.01).map((p) => p[1]).sort((a, b) => a - b);
  let top = col[0];
  for (let i = 1; i < col.length; i++) { if (col[i] > 0.3 && col[i] - col[i - 1] > 0.025) break; top = col[i]; }
  // R — the tyre radius in metres, when the simplified tread is too sparse to measure
  const r = process.env.R ? +process.env.R : Math.min(top, 0.4) / 2;
  wheels.push({ name, cx: sx * (xIn + xOut) / 2, cy: r, cz, r, xIn, xOut });
}
console.log('wheels', wheels.map((w) => `${w.name} z${w.cz.toFixed(2)} r${w.r.toFixed(3)} x${w.xIn.toFixed(2)}…${w.xOut.toFixed(2)}`).join(' | '));
// the roof under the lamp bar (the bar stands about a third of a metre on it)
const roof = H - 0.33;
const part = new Map();
const add = (key, t) => { (part.get(key) ?? part.set(key, []).get(key)).push(t); };
for (const t of T) {
  const c = cen(t), ax = Math.abs(c[0]);
  const w = wheels.find((x) => Math.sign(c[0]) === Math.sign(x.cx) && ax > x.xIn - 0.13 && ax < x.xOut + 0.07 && Math.hypot(c[1] - x.cy, c[2] - x.cz) < x.r * 1.02);
  if (w) { add(w.name, t); continue; }
  const col = colorAt(t);
  if (c[1] > H - 0.3) {
    if (col[0] > 140 && col[1] < 90 && col[2] < 90) { add('BeaconRed', t); continue; }
    if (isBlue(col) && col[0] < 90) { add('BeaconBlue', t); continue; }
  }
  // the glasshouse: between the waist and the roof, painted as dark or grey-blue glass
  if (c[1] > 0.64 * roof && c[1] < roof - 0.04 && (Math.max(...col) < 75 || (col[2] > col[0] + 5 && Math.max(...col) < 215 && Math.min(...col) > 105 && Math.max(...col) - Math.min(...col) < 55))) { add('Glass', t); continue; }
  add('Body', t);
}

// ---- write
const doc = new Document();
const buf = doc.createBuffer();
const texture = doc.createTexture('paint').setImage(new Uint8Array(tex)).setMimeType('image/jpeg');
const mats = {};
const mat = (name) => (mats[name] ??= doc.createMaterial(name).setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true));
const scene = doc.createScene();
for (const [key, tris] of part) {
  const w = wheels.find((x) => x.name === key);
  const o = w ? [w.cx, w.cy, w.cz] : [0, 0, 0];
  const remap = new Map(), p = [], nr = [], uv = [], ix = [];
  for (const t of tris) for (const i of t) {
    if (!remap.has(i)) { remap.set(i, remap.size); p.push(P[i][0] - o[0], P[i][1] - o[1], P[i][2] - o[2]); nr.push(...NR[i]); uv.push(UV[i][0], UV[i][1]); }
    ix.push(remap.get(i));
  }
  const pr = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nr)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(remap.size > 65535 ? new Uint32Array(ix) : new Uint16Array(ix)).setBuffer(buf))
    .setMaterial(mat(key.startsWith('Beacon') || key === 'Glass' ? key : 'Paint'));
  const nd = doc.createNode(key).setMesh(doc.createMesh(key).addPrimitive(pr)).setTranslation(o);
  if (w) nd.setExtras({ radius: w.r });
  scene.addChild(nd);
  console.log(key, tris.length);
}
await doc.transform(prune());
await io.write(out, doc);
