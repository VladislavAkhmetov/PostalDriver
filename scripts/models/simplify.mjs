/**
 * Weld and simplify a generated model with meshoptimizer, keeping UV seams.
 *   node scripts/models/simplify.mjs <in.glb> <out.glb> [ratio=0.06] [error=0.004]
 * The GAI officer: 50 000 → 2 000 triangles with ratio 0.04, error 0.01.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [inp, out, ratio = '0.06', err = '0.004'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
await MeshoptSimplifier.ready;
await doc.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +err, lockBorder: false }), dedup(), prune());
let tris = 0, verts = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { tris += p.getIndices().getCount() / 3; verts += p.getAttribute('POSITION').getCount(); }
console.log('tris', tris, 'verts', verts);
await io.write(out, doc);
