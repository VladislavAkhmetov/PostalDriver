// Real dialogue clock, room geometry and camera rays. No GPU or recordings are required.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const result = await build({stdin:{contents:`export {StoryScene} from './src/game/StoryScene';
export {HIRING_BEATS,HIRING_SHOTS} from './src/game/PostOfficeHiringScript';
export {PostOfficeInterior} from './src/world/PostOfficeInterior'; export * as THREE from 'three';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {StoryScene,HIRING_BEATS,HIRING_SHOTS,PostOfficeInterior,THREE:T}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const canvas=new Proxy({}, {get:(o,k)=>k==='createRadialGradient'?()=>({addColorStop(){}}):o[k]??(()=>{})});
globalThis.document={createElement:()=>({getContext:()=>canvas})};
const room=new PostOfficeInterior({x:11,y:2,z:30,rot:.7});
room.root.updateMatrixWorld(true);
const targets={master:[[-1.45,1.2,1.3],[-1.05,1.65,-.4],[-2.02,1.15,-.55]],pair:[[-1.05,1.65,-.4],[-2.02,1.15,-.55]],zinaida:[[-1.45,1.2,1.3]],timur:[[-1.05,1.65,-.4]],grandpa:[[-2.02,1.15,-.55]],paper:[[-1.43,.81,.26]]};
let rays=0;
for(const [name,s] of Object.entries(HIRING_SHOTS)){
  const [x,y,z]=s.eye;
  assert(x>-.5&&x<2.7&&Math.abs(z)<2.3&&y>0&&y<2.85,`Camera outside room / wrong side of axis: ${name}`);
  for(const p of targets[name]){
    const a=room.worldPoint(new T.Vector3(...s.eye)),b=room.worldPoint(new T.Vector3(...p));
    const hits=new T.Raycaster(a,b.clone().sub(a).normalize(),0,a.distanceTo(b)-.03).intersectObject(room.root,true)
      .filter(h=>!h.object.material.transparent);
    assert(!hits.length,`${name} blocked by ${hits[0]?.object.name}`); rays++;
  }
}
assert(room.anchors.hero.distanceTo(room.anchors.grandpa)>.7,'Actors overlap');
const scene=new T.Scene(),parent=new T.Group(),camera=new T.PerspectiveCamera(68,16/9,.03,1000),cab=new T.Group();
scene.add(parent,cab);parent.add(camera);camera.position.set(.1,1.3,.2);camera.rotation.set(.05,.3,0);
const original={p:camera.position.clone(),q:camera.quaternion.clone()};
let complete=0,cancel=0,left=0,pick=null,seen=[];
const player=new StoryScene(scene,camera,{begin(){},line(){return 0},choices(options,fn){assert.equal(options.length,1);pick=fn},clear(){},end(){}});
const script={id:'hiring-test',first:'establish',beats:HIRING_BEATS,enter(){},update(dt,b){if(seen.at(-1)!==b)seen.push(b);camera.position.set(10,10,10);camera.fov=40},leave(){left++},complete(){complete++},cancel(){cancel++}};
assert(player.play(script,[cab]));assert(!cab.visible);
assert.equal(player.play(script),false,'Nested play must not replace active scene');
for(let i=0;i<2000&&!pick;i++)player.update(.05);
assert(pick,'Signature choice was not reached');
assert.equal(player.currentBeat,'offer');
for(let i=0;i<500;i++)player.update(.05);
assert.equal(complete,0,'Route committed before signature');assert.equal(player.currentBeat,'offer');
const stalePick=pick;player.cancel();
assert.equal(complete,0);assert.equal(cancel,1);assert(cab.visible);
assert.equal(camera.parent,parent);assert(camera.position.equals(original.p));assert(camera.quaternion.equals(original.q));assert.equal(camera.fov,68);
stalePick(0);assert(!player.active,'Stale choice restarted cancelled scene');
pick=null;seen=[];player.play(script,[cab]);
for(let i=0;i<4000&&player.active;i++){player.update(.05);if(pick){const choose=pick;pick=null;choose(0)}}
assert.equal(complete,1);assert.equal(left,2);assert(!player.active);assert(cab.visible);
assert.equal(seen.length,Object.keys(HIRING_BEATS).length,'Not all authored beats played');
assert.equal(camera.parent,parent);assert(camera.position.equals(original.p));assert(camera.quaternion.equals(original.q));assert.equal(camera.fov,68);
room.dispose();delete globalThis.document;
console.log(JSON.stringify({beats:seen.length,clearCameraRays:rays,signatureGate:true,cancelRestoresCamera:true,completionExactlyOnce:true},null,2));
