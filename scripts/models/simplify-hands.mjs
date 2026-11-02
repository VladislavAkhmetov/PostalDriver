/**
 * Simplify a generated T-posed character like simplify.mjs, but keep detail in the hands: they are
 * blown up about the wrists before meshoptimizer runs (so their small features weigh as much as the
 * body's), and every kept vertex gets its true position back afterwards (simplification only drops
 * vertices, it never moves the ones it keeps).
 *   node scripts/models/simplify-hands.mjs <in.glb> <out.glb> [ratio=0.05] [error=0.01] [handScale=5]
 * Timur and Muha: 50 000 → 2 500 triangles with the defaults.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [inp, out, ratio = '0.05', err = '0.01', hs = '5'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
await MeshoptSimplifier.ready;
const S = +hs;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), n = pos.getCount();
  const raw = pos.getArray().slice();
  // the rig's frame: x across, z up (file y/z swapped by the node's rotation)
  let zmin = Infinity, zmax = -Infinity, xmax = 0;
  for (let i = 0; i < n; i++) { const z = -raw[i * 3 + 2]; zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); xmax = Math.max(xmax, Math.abs(raw[i * 3])); }
  const h = zmax - zmin, wristX = xmax - 0.115 * h;
  const inHand = (i) => Math.abs(raw[i * 3]) > wristX && -raw[i * 3 + 2] - zmin > 0.6 * h;
  const piv = { 1: [0, 0, 0, 0], [-1]: [0, 0, 0, 0] };
  for (let i = 0; i < n; i++) if (inHand(i)) { const p = piv[Math.sign(raw[i * 3])]; p[0] += raw[i * 3 + 1]; p[1] += raw[i * 3 + 2]; p[3]++; }
  const scaled = raw.slice();
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!inHand(i)) continue;
    count++;
    const s = Math.sign(raw[i * 3]), p = piv[s];
    const c = [s * wristX, p[0] / p[3], p[1] / p[3]];
    for (let k = 0; k < 3; k++) scaled[i * 3 + k] = c[k] + (raw[i * 3 + k] - c[k]) * S;
  }
  pos.setArray(scaled);
  prim.setAttribute('_ORIG', doc.createAccessor().setType('VEC3').setArray(raw).setBuffer(pos.getBuffer()));
  console.log('hand vertices before', count, 'of', n);
}
await doc.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +err, lockBorder: false }), dedup(), prune());
let tris = 0, verts = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const o = p.getAttribute('_ORIG');
  p.getAttribute('POSITION').setArray(o.getArray().slice());
  p.setAttribute('_ORIG', null);
  tris += p.getIndices().getCount() / 3; verts += p.getAttribute('POSITION').getCount();
}
await doc.transform(prune());
console.log('tris', tris, 'verts', verts);
await io.write(out, doc);
