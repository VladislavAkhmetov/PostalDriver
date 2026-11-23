/** Offline FBX -> game GLB; preserves the supplied model, UVs and Mixamo skin.
 * PYTHON=<python with Pillow> node scripts/models/prep-olosay.mjs [olosay|gulnara]
 * Originals: src/assets/people/<body>.fbx. No source assets are overwritten.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const body=process.argv[2]||'olosay';
if(!['olosay','gulnara'].includes(body))throw new Error('Expected olosay or gulnara');
const out=`src/assets/people/${body}-mx.glb`;
const scratch=`reports/${body}`; mkdirSync(scratch,{recursive:true});
const blobs=[];
URL.createObjectURL=blob=>{blobs.push(blob);return 'embedded:'+(blobs.length-1);};
globalThis.window=globalThis;
globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){this.url=v;}})};
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:'+blob.type+';base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}
};
const source=readFileSync(`src/assets/people/${body}.fbx`);
const g=new FBXLoader().parse(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
const meshes=[];g.traverse(o=>{if(o.isMesh)meshes.push(o);});
if(meshes.length!==1||!meshes[0].isSkinnedMesh||blobs.length!==1||!g.getObjectByName('mixamorigHips')) throw new Error('Unexpected FBX layout');
const sm=meshes[0];
const flipY=sm.material.map.flipY;
sm.normalizeSkinWeights();
await MeshoptSimplifier.ready;
// Weld matching UVs and skin weights, preserving seams.
const attrs=sm.geometry.attributes,first=[],keys=new Map(),indices=[];
for(let i=0;i<attrs.position.count;i++){
  const key=Object.entries(attrs).filter(([k])=>['position','normal','uv','skinIndex','skinWeight'].includes(k)).map(([k,a])=>Array.from({length:a.itemSize},(_,j)=>Math.round(a.array[i*a.itemSize+j]*(k==='skinIndex'?1:1e5))).join(',')).join('|');
  if(!keys.has(key)){keys.set(key,first.length);first.push(i);}
  indices.push(keys.get(key));
}
const geo=new THREE.BufferGeometry();
for(const [name,a] of Object.entries(attrs)){
  if(!['position','normal','uv','skinIndex','skinWeight'].includes(name))continue;
  const data=new a.array.constructor(first.length*a.itemSize);
  first.forEach((src,d)=>{for(let j=0;j<a.itemSize;j++)data[d*a.itemSize+j]=a.array[src*a.itemSize+j];});
  geo.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize,a.normalized));
}
const [simple,error]=MeshoptSimplifier.simplify(new Uint32Array(indices),geo.attributes.position.array,3,6500*3,0.015,[]);
const remap=new Map();for(const i of simple)if(!remap.has(i))remap.set(i,remap.size);
const lean=new THREE.BufferGeometry();
for(const [name,a] of Object.entries(geo.attributes)){
  const data=new a.array.constructor(remap.size*a.itemSize);
  for(const [src,d] of remap)for(let j=0;j<a.itemSize;j++)data[d*a.itemSize+j]=a.array[src*a.itemSize+j];
  lean.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize,a.normalized));
}
lean.setIndex(Array.from(simple,i=>remap.get(i)));
// Generated FBXs can omit normals. Rebuild them after reduction for Lambert lighting.
lean.computeVertexNormals();sm.geometry=lean;sm.normalizeSkinWeights();
sm.name=body;sm.material=new THREE.MeshStandardMaterial({name:body,side:THREE.DoubleSide,roughness:1,metalness:0});
g.userData={body,hipsRest:g.getObjectByName('mixamorigHips').position.y};
// The supplied one-frame clip is a pose, not an idle loop. Runtime fits its shared clips.
const bare=Buffer.from(await new GLTFExporter().parseAsync(g,{binary:true,onlyVisible:false,animations:[]}));
writeFileSync(scratch+'/source.png',Buffer.from(await blobs[0].arrayBuffer()));
execFileSync(process.env.PYTHON||'python',['-c',
  "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGB').resize((512,512),Image.Resampling.LANCZOS); im=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM) if sys.argv[3]=='true' else im; im.save(sys.argv[2])",
  scratch+'/source.png',scratch+'/color.png',String(flipY)]);
const png=readFileSync(scratch+'/color.png');
const jsonSize=bare.readUInt32LE(12),json=JSON.parse(bare.subarray(20,20+jsonSize));
const binStart=20+jsonSize+8,bin=bare.subarray(binStart);
const offset=(bin.length+3)&~3;
json.bufferViews??=[];const view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:png.length})-1;
json.images=[{mimeType:'image/png',bufferView:view}];json.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
json.textures=[{source:0,sampler:0}];json.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};
const binary=Buffer.alloc((offset+png.length+3)&~3);bin.copy(binary);png.copy(binary,offset);json.buffers[0].byteLength=binary.length;
const txt=Buffer.from(JSON.stringify(json));const padded=Buffer.alloc((txt.length+3)&~3,32);txt.copy(padded);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
const result=Buffer.concat([header,padded,bh,binary]);writeFileSync(out,result);
const stats={sourceTriangles:indices.length/3,triangles:simple.length/3,vertices:remap.size,error,bytes:result.length,texture:[512,512],bones:sm.skeleton.bones.length,output:out};
writeFileSync(scratch+'/conversion.json',JSON.stringify(stats,null,2));console.log(stats);
