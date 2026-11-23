import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { wheelFrame } from '../models/wheel-axis.mjs';

const file = 'src/assets/cars/paz.glb';
const doc = await new NodeIO().read(file), nodes = doc.getRoot().listNodes();
const wheels = nodes.filter(n => n.getName().startsWith('Wheel_'));
assert.equal(wheels.length, 4, 'Four independently animated wheels');
assert.equal(nodes.find(n => n.getName() === 'Wheel_FL').getMesh(), nodes.find(n => n.getName() === 'Wheel_FR').getMesh(), 'Front wheels share prepared geometry');
assert.equal(nodes.find(n => n.getName() === 'Wheel_RL').getMesh(), nodes.find(n => n.getName() === 'Wheel_RR').getMesh(), 'Rear wheels share prepared geometry');
assert.notEqual(nodes.find(n => n.getName() === 'Wheel_FL').getMesh(), nodes.find(n => n.getName() === 'Wheel_RL').getMesh(), 'Distinct front and rear models retained');
let triangles = 0;
for (const node of nodes) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
  const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL'), uv = primitive.getAttribute('TEXCOORD_0'), index = primitive.getIndices();
  assert.equal(positions.getCount(), normals.getCount()); assert.equal(positions.getCount(), uv.getCount());
  assert.equal(index.getCount() % 3, 0);
  assert.ok([...positions.getArray(), ...normals.getArray(), ...uv.getArray()].every(Number.isFinite), node.getName());
  assert.ok(Math.max(...index.getArray()) < positions.getCount(), 'Valid indices');
  assert.ok(primitive.getMaterial().getBaseColorTexture(), 'All materials retain paint or repaired detail');
  triangles += index.getCount() / 3;
}
for (const wheel of wheels) {
  assert.equal(wheel.getExtras().radius, 0.46);
  assert.equal(wheel.getTranslation()[1], 0.46);
  assert.equal(wheel.getExtras().source, wheel.getName().startsWith('Wheel_F') ? 'pazik_wheel_front.glb' : 'pazik_wheel_back.glb');
  const p = wheel.getMesh().listPrimitives()[0].getAttribute('POSITION');
  const isFront=wheel.getName().startsWith('Wheel_F'),width=wheel.getExtras().width;
  assert.ok(isFront ? width>.285&&width<.31 : width===.5, 'Front retains natural source width; rear retains approved width');
  if(isFront) {
    const points=Array.from({length:p.getCount()},(_,i)=>p.getElement(i,[]));
    const unique=[...new Map(points.map(p=>[p.map(v=>Math.round(v*1e6)).join(','),p])).values()];
    const axis=wheelFrame(unique).axis;
    assert.ok(Math.abs(axis.x)>.995 && Math.abs(axis.y)<.025, 'Front axle is horizontal; tyre has no source camber');
  }
  for (let i = 0; i < p.getCount(); i++) {
    const [x, y, z] = p.getElement(i, []);
    assert.ok(Math.hypot(y, z) <= 0.461, `${wheel.getName()}: circular rolling envelope`);
    assert.ok(Math.abs(x) <= width/2+.001, `${wheel.getName()}: correct tyre width`);
    assert.ok(Math.abs(wheel.getTranslation()[0] + x) < 1.28, 'Tyres fit within the bodywork');
  }
}
const sign = nodes.find(n => n.getName() === 'Route_KLYUCHEVSK_UFA');
for(const side of ['L','R']) {
  const front=nodes.find(n=>n.getName()===`Front_lamp_panel_${side}`),rear=nodes.find(n=>n.getName()===`Rear_lamp_panel_${side}`),lens=nodes.find(n=>n.getName()===`Headlight_${side}`);
  assert.ok(front&&rear&&lens,'Black lamp surrounds at both ends');
  const z=node=>node.getMesh().listPrimitives()[0].getAttribute('POSITION').getElement(0,[])[2];
  assert.ok(z(lens)>z(front)+.004,'Headlight stays visible ahead of its black surround');
  assert.ok(z(rear)<-3,'Rear surround faces the back of the bus');
}
assert.ok(sign, 'Route card is baked into the reusable GLB');
const signPos = sign.getMesh().listPrimitives()[0].getAttribute('POSITION');
for (let i = 0; i < signPos.getCount(); i++) {
  const [x, y, z] = signPos.getElement(i, []);
  assert.ok(x < 0 && y > 1.6 && y < 1.95 && z > 3, 'Card stays in lower viewer-left windscreen');
}
const tones = [];
for (const name of ['Wheel_FL', 'Wheel_RL']) {
  const p=nodes.find(n=>n.getName()===name).getMesh().listPrimitives()[0],material=p.getMaterial();
  assert.equal(material.getRoughnessFactor(), 1, 'Same matte surface');
  assert.equal(material.getMetallicFactor(), 0, 'No mismatched PBR gloss');
  const {data,info}=await sharp(Buffer.from(material.getBaseColorTexture().getImage())).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const pos=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_0'),rubber=[],steel=[];
  for(let i=0;i<pos.getCount();i++) {
    const [,y,z]=pos.getElement(i,[]),[u,v]=uv.getElement(i,[]),r=Math.hypot(y,z);
    const x=Math.min(info.width-1,Math.floor(u*info.width)),ty=Math.min(info.height-1,Math.floor(v*info.height)),o=(ty*info.width+x)*3,lum=(data[o]+data[o+1]+data[o+2])/3;
    if(r>.38&&lum<55)rubber.push(lum);
    if(r<.29&&lum>65)steel.push(lum);
  }
  rubber.sort((a,b)=>a-b);steel.sort((a,b)=>a-b);
  tones.push({rubber:rubber[Math.floor(rubber.length/2)],steel:steel[Math.floor(steel.length/2)]});
}
assert.ok(Math.abs(tones[0].rubber-tones[1].rubber)<8,`Matching rubber tone: ${JSON.stringify(tones)}`);
assert.ok(Math.abs(tones[0].steel-tones[1].steel)<20,`Matching steel tone: ${JSON.stringify(tones)}`);
assert.ok(triangles < 27000, 'Traffic triangle budget');
assert.ok(statSync(file).size < 1_800_000, 'Traffic download budget');
console.log(JSON.stringify({ ok: true, triangles, bytes: statSync(file).size, tones, wheels: wheels.map(n => n.getName()), sign: sign.getName() }, null, 2));
