/** Prepare the supplied PAZ as traffic: node scripts/models/prep-paz.mjs input.glb output.glb */
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Quaternion, Vector3, BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide, Raycaster, PlaneGeometry } from 'three';
import sharp from 'sharp';
import { appendPazWheels } from './paz-wheels.mjs';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [input, output, frontWheel, rearWheel] = process.argv.slice(2);
if (!input || !output) throw new Error('Expected input.glb output.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source = await io.read(input);
await MeshoptSimplifier.ready;
await source.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.20, error: 0.0015, lockBorder: false }), dedup(), prune());
const sourceNode = source.getRoot().listNodes().find(n => n.getMesh());
const primitive = sourceNode.getMesh().listPrimitives()[0];
const position = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL');
const uv = primitive.getAttribute('TEXCOORD_0'), indices = primitive.getIndices();
const rotation = new Quaternion(...sourceNode.getRotation());
let points = Array.from({ length: position.getCount() }, (_, i) => new Vector3(...position.getElement(i, [])).applyQuaternion(rotation).toArray());
const normals = Array.from({ length: normal.getCount() }, (_, i) => new Vector3(...normal.getElement(i, [])).applyQuaternion(rotation).toArray());
const uvs = Array.from({ length: uv.getCount() }, (_, i) => uv.getElement(i, []));
const low = [0, 1, 2].map(a => Math.min(...points.map(p => p[a])));
const high = [0, 1, 2].map(a => Math.max(...points.map(p => p[a])));
const scale = 7 / (high[2] - low[2]);
points = points.map(p => [(p[0] - (low[0] + high[0]) / 2) * scale, (p[1] - low[1]) * scale, (p[2] - (low[2] + high[2]) / 2) * scale]);

// Keep the original axle locations, but remove the embedded wheels completely.
// The separately supplied front/rear models replace them below.
const wheels = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const patch = points.filter(p => p[1] < 0.045 && p[0] * sx > 0.7 && p[2] * sz > 1);
  if (!patch.length) throw new Error(`Missing wheel contact ${sx}, ${sz}`);
  const cz = (Math.min(...patch.map(p => p[2])) + Math.max(...patch.map(p => p[2]))) / 2;
  const cx = sx * 1.12, radius = 0.46;
  wheels.push({ name: `Wheel_${sz > 0 ? 'F' : 'R'}${sx > 0 ? 'L' : 'R'}`, cx, cz, radius });
}
const parts = new Map([['Body', []]]);
for (let i = 0; i < indices.getCount(); i += 3) {
  const tri = [0, 1, 2].map(j => indices.getScalar(i + j));
  const c = [0, 1, 2].map(a => tri.reduce((s, v) => s + points[v][a], 0) / 3);
  const wheel = wheels.find(w => Math.sign(c[0]) === Math.sign(w.cx) && Math.abs(c[0]) > 0.73 && Math.abs(c[0]) < 1.39
    && Math.hypot(c[1] - w.radius, c[2] - w.cz) < 0.53);
  if (!wheel) parts.get('Body').push(tri);
}
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('Paz');
const color = primitive.getMaterial().getBaseColorTexture().getImage();
const jpeg = await sharp(Buffer.from(color)).resize(1024, 1024).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
const texture = doc.createTexture('PAZ paint and curtains').setImage(jpeg).setMimeType('image/jpeg');
const material = doc.createMaterial('Paint').setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(0.95).setDoubleSided(true);
for (const [name, triangles] of parts) {
  const origin = [0, 0, 0];
  const remap = new Map(), p = [], n = [], t = [], ix = [];
  for (const tri of triangles) for (const old of tri) {
    if (!remap.has(old)) {
      remap.set(old, remap.size);
      const v = [...points[old]];
      p.push(...v.map((v, a) => v - origin[a])); n.push(...normals[old]); t.push(...uvs[old]);
    }
    ix.push(remap.get(old));
  }
  const accessor = (type, data) => doc.createAccessor().setType(type).setArray(data).setBuffer(buffer);
  const mesh = doc.createMesh(name).addPrimitive(doc.createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(p)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(n)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(t)))
    .setIndices(accessor('SCALAR', new Uint16Array(ix))).setMaterial(material));
  const node = doc.createNode(name).setMesh(mesh).setTranslation(origin);
  scene.addChild(node);
  console.log(name, triangles.length, 'triangles', origin);
}
await appendPazWheels(doc, scene, buffer, wheels,
  frontWheel ?? join(dirname(input), 'pazik_wheel_front.glb'),
  rearWheel ?? join(dirname(input), 'pazik_wheel_back.glb'));
// Small, reproducible repairs to the generator's illegible front markings.
// These are baked into the derivative GLB, including the exact route lettering.
const bodyPrim = doc.getRoot().listNodes().find(n => n.getName() === 'Body').getMesh().listPrimitives()[0];
const shellGeometry = new BufferGeometry().setAttribute('position', new BufferAttribute(bodyPrim.getAttribute('POSITION').getArray(), 3));
shellGeometry.setIndex(new BufferAttribute(bodyPrim.getIndices().getArray(), 1));
const shell = new Mesh(shellGeometry, new MeshBasicMaterial({ side: DoubleSide }));
const ray = new Raycaster();
const surface = (x, y, side=1) => {
  ray.set(new Vector3(x, y, side*8), new Vector3(0, 0, -side));
  return ray.intersectObject(shell)[0]?.point.z ?? side*3.3;
};
async function decal(name, width, height, x, y, svg, side=1, extra=0, fixedZ=null) {
  const geometry = new PlaneGeometry(width, height, 8, 2);
  if(side<0)geometry.rotateY(Math.PI);
  const positions = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const px = positions.getX(i) + x, py = positions.getY(i) + y;
    positions.setXYZ(i, px, py, surface(px, py, side) + side*(0.014+extra));
    uv.setY(i, 1 - uv.getY(i)); // glTF's image origin is the top left.
  }
  if (name !== 'Route_KLYUCHEVSK_UFA') {
    const depths=Array.from({ length: positions.count }, (_, i) => positions.getZ(i));
    const z=fixedZ ?? (side>0?Math.max(...depths):Math.min(...depths));
    for (let i = 0; i < positions.count; i++) positions.setZ(i, z);
  }
  geometry.computeVertexNormals();
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const texture = doc.createTexture(name).setImage(image).setMimeType('image/png');
  const mat = doc.createMaterial(name).setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const p = doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', accessor('VEC3', positions.array))
    .setAttribute('NORMAL', accessor('VEC3', geometry.attributes.normal.array))
    .setAttribute('TEXCOORD_0', accessor('VEC2', uv.array))
    .setIndices(accessor('SCALAR', geometry.index.array));
  const node=doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p));
  scene.addChild(node);
  return {node,z:positions.getZ(0)};
}
await decal('Route_KLYUCHEVSK_UFA', 1.04, 0.23, -0.65, 1.78,
  '<svg width="512" height="112" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="112" fill="#ede9d8"/><rect x="5" y="5" width="502" height="102" fill="none" stroke="#45483e" stroke-width="5"/><text x="256" y="75" text-anchor="middle" font-family="Arial" font-size="48" font-weight="bold" fill="#20251f">КЛЮЧЕВСК-УФА</text></svg>');
await decal('Upper_vent', 1.8, 0.135, 0, 2.79,
  '<svg width="512" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="40" fill="#242723"/><path d="M8 8H504M8 17H504M8 26H504M8 35H504" stroke="#50514a" stroke-width="3"/></svg>');
await decal('Front_grille', 2.26, 0.24, 0, 1.23,
  '<svg width="512" height="64" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="g" width="14" height="10" patternUnits="userSpaceOnUse"><rect width="14" height="10" fill="#1d211e"/><path d="M0 0H14M0 0V10" stroke="#484b43" stroke-width="2"/></pattern></defs><rect width="512" height="64" fill="url(#g)"/><rect x="2" y="2" width="508" height="60" fill="none" stroke="#292d28" stroke-width="4"/></svg>');
await decal('Front_hatch', 1.03, 0.38, 0, 0.94,
  '<svg width="256" height="96" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="96" fill="#d9dbd4"/><rect x="2" y="2" width="252" height="92" fill="none" stroke="#979e93" stroke-width="2"/><path d="M40 70H92M100 70H152M160 70H212" stroke="#262c26" stroke-width="8"/></svg>');
for (const side of [-1, 1]) {
  const flip=side>0?'':'transform="translate(320 0) scale(-1 1)"';
  const frontPanel=await decal(`Front_lamp_panel_${side<0?'L':'R'}`, .69, .40, side*.87, .94,
    `<svg width="320" height="208" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="208" fill="#1c211e"/><rect x="3" y="3" width="314" height="202" fill="none" stroke="#353d35" stroke-width="6"/><g ${flip}><path d="M55 31H204V178H55Z" fill="#101612"/><path d="M58 34H201V175H58Z" fill="none" stroke="#3d443b" stroke-width="5"/><rect x="245" y="40" width="48" height="60" fill="#a75b16" stroke="#333c31" stroke-width="6"/><path d="M251 49H286M251 60H286M251 71H286M251 82H286" stroke="#c07724" stroke-width="3"/><rect x="245" y="114" width="48" height="44" fill="#c4cbc0" stroke="#333c31" stroke-width="6"/><path d="M251 125H286M251 135H286M251 145H286" stroke="#8a958b" stroke-width="3"/></g></svg>`,1,.025);
  await decal(`Headlight_${side<0?'L':'R'}`, .29, .29, side*.8, .94,
    '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#151c17"/><circle cx="32" cy="32" r="28" fill="#767f75"/><circle cx="32" cy="32" r="24" fill="#c3cbbf"/><path d="M20 17V47M28 10V54M36 10V54M44 17V47M11 29H53M11 36H53" stroke="#9aa69a" stroke-width="2"/></svg>',1,.055,frontPanel.z+.006);
  const colours=side>0?['#ad661b','#8e2923','#bec7bb']:['#bec7bb','#8e2923','#ad661b'];
  const lamps=colours.map((colour,i)=>`<rect x="${55+i*66}" y="39" width="58" height="50" fill="${colour}" stroke="#51594b" stroke-width="4"/>`).join('');
  await decal(`Rear_lamp_panel_${side<0?'L':'R'}`, .70, .34, side*.87, .90,
    `<svg width="320" height="128" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="128" fill="#181f19"/><rect x="3" y="3" width="314" height="122" fill="none" stroke="#353e33" stroke-width="6"/><path d="M12 12H308L260 28H49Z" fill="#333c31"/><path d="M12 116H308L260 100H49Z" fill="#30382f"/>${lamps}</svg>`,-1,.018);
  await decal(`Rear_bumper_reflector_${side<0?'L':'R'}`, .36, .14, side*.93, .68,
    '<svg width="160" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="64" fill="#b8bfb4"/><rect x="40" y="17" width="80" height="30" rx="2" fill="#77251f" stroke="#575f54" stroke-width="4"/></svg>',-1,.015);
}
await decal('Rear_plate_base', .62, .22, 0, 1.15,
  '<svg width="256" height="96" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="96" fill="#eff1ea"/><rect x="20" y="12" width="216" height="48" fill="#d8dcd1" stroke="#373f35" stroke-width="2"/></svg>',-1,.02);
await doc.transform(dedup(), prune());
mkdirSync(dirname(output), { recursive: true });
await io.write(output, doc);
console.log('Bytes', statSync(input).size, '->', statSync(output).size);
