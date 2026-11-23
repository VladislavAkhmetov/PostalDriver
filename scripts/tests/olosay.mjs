// Check actual People.ts loading, retargeting, skinning and animation transitions offline.
// node scripts/tests/olosay.mjs [olosay|gulnara] (texture decoding is stubbed; geometry and animation are real).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const body=process.argv[2]||'olosay';
assert(['olosay','gulnara'].includes(body));
const out=resolve('reports',body);mkdirSync(out,{recursive:true});
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:512,height:512,close(){}});
const originalLoad=GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync=async function(url){
  const b=readFileSync(url);return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
};
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
let source=readFileSync('src/world/People.ts','utf8');
source=source.replace(/import (\w+) from '([^']+\.glb)\?url';/g,(_,name,path)=>`const ${name}=${JSON.stringify(resolve('src/world',path))};`);
source=source.replace("'../core/math'","'./math.mjs'");
writeFileSync(out+'/People.mjs',compile(source));writeFileSync(out+'/math.mjs',compile(readFileSync('src/core/math.ts','utf8')));
try{
  const {loadPeople,Person}=await import(pathToFileURL(out+'/People.mjs'));
  await loadPeople();
  const p=new Person(body,{});
  for(const clip of ['Idle','Talking','Talking2','Walk','Waving'])assert(p.human.has(clip),clip);
  const v=new THREE.Vector3();
  const capture=()=>{
    p.group.updateMatrixWorld(true);const vertices=[],uv=[],indices=[];
    p.human.model.traverse(m=>{
      if(!m.isSkinnedMesh)return;m.skeleton.update();
      assert(m.material.map,'embedded texture');const base=vertices.length;
      const a=m.geometry.attributes;
      assert(a.normal&&a.normal.count===a.position.count,'normals required for game lighting');
      for(let i=0;i<a.position.count;i++){
        v.fromBufferAttribute(a.position,i);m.applyBoneTransform(i,v);v.applyMatrix4(m.matrixWorld);
        assert(v.toArray().every(Number.isFinite),'finite skinned vertex');vertices.push(v.toArray());uv.push([a.uv.getX(i),a.uv.getY(i)]);
        const weights=Array.from({length:4},(_,j)=>a.skinWeight.getComponent(i,j));assert(Math.abs(weights.reduce((x,y)=>x+y,0)-1)<0.0001,'normalized skin');
      }
      indices.push(...Array.from(m.geometry.index.array,i=>base+i));
    });
    const lo=[0,1,2].map(k=>Math.min(...vertices.map(v=>v[k]))),hi=[0,1,2].map(k=>Math.max(...vertices.map(v=>v[k])));
    assert(hi[1]-lo[1]>1.2&&hi[1]-lo[1]<1.85,'plausible height');
    assert(Math.abs(lo[1])<0.15,'feet at ground');
    return {vertices,uv,indices,bounds:{min:lo,max:hi},clip:p.human.clip};
  };
  p.human.play('Idle',{fade:0,at:0});p.update(0,0);
  const idle=capture();writeFileSync(out+'/idle.json',JSON.stringify(idle));
  p.talk(3);for(let i=0;i<60;i++)p.update(1/60,i/60);
  const talking=capture();assert(/^Talking/.test(talking.clip));writeFileSync(out+'/talking.json',JSON.stringify(talking));
  for(let i=0;i<240;i++)p.update(1/60,i/60);assert.equal(p.human.clip,'Idle');
  p.wave=3;for(let i=0;i<60;i++)p.update(1/60,i/60);
  const wave=capture();writeFileSync(out+'/wave.json',JSON.stringify(wave));
  assert(wave.vertices.some((v,i)=>v.some((x,k)=>Math.abs(x-idle.vertices[i][k])>0.05)),'wave moves geometry');
  const stats={body:p.human.body,triangles:idle.indices.length/3,idle:idle.bounds,talking:talking.bounds,wave:wave.bounds,returnsToIdle:true};
  writeFileSync(out+'/checks.json',JSON.stringify(stats,null,2));console.log(JSON.stringify(stats,null,2));
  if(body==='gulnara'){
    writeFileSync(out+'/HospitalReception.mjs',compile(readFileSync('src/game/HospitalReception.ts','utf8').replace("'../world/People'","'./People.mjs'")));
    writeFileSync(out+'/StoryScene.mjs',compile(readFileSync('src/game/StoryScene.ts','utf8')));
    const {HospitalReception}=await import(pathToFileURL(out+'/HospitalReception.mjs'));
    const {StoryScene}=await import(pathToFileURL(out+'/StoryScene.mjs'));
    const scene=new THREE.Scene(),cab=new THREE.Group(),exterior=new THREE.Group(),camera=new THREE.PerspectiveCamera(65);
    scene.add(cab,exterior);cab.add(camera);camera.position.set(0,1.6,0);
    const room=new HospitalReception(scene,camera,{x:20,y:1,z:10,rot:.4});
    assert.equal(room.root.visible,false,'no permanent hospital figure');
    let pick;let speaking='';
    const runner=new StoryScene(scene,camera,{begin(){},line(who){speaking=who;return 0;},choices(_options,callback){pick=callback;},clear(){},end(){}});
    const script=()=>room.script('Гульнара, әсәй','Заводите, я помогу.');
    assert(runner.play(script(),[cab,exterior]));assert(room.root.visible);assert(!exterior.visible);
    assert.equal(speaking,'Гульнара, әсәй');
    assert(camera.position.toArray().every(Number.isFinite));
    for(let i=0;i<600&&!pick;i++)runner.update(1/60);
    assert(pick,'return-to-van choice');pick(0);runner.update(.2);
    assert(!runner.active);assert(!room.root.visible);assert(exterior.visible&&cab.visible);
    assert.equal(camera.parent,cab);assert.equal(camera.fov,65);assert.deepEqual(camera.position.toArray(),[0,1.6,0]);
    assert(runner.play(script(),[cab,exterior]));runner.cancel();
    assert(!room.root.visible&&exterior.visible&&cab.visible);assert.equal(camera.parent,cab);
    console.log('Hospital reception: completion and cancellation restore camera, exterior and cabin.');
  }
}finally{GLTFLoader.prototype.loadAsync=originalLoad;}
