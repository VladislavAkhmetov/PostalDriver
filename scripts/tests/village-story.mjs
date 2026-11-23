import { build } from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error(e.message);console.error(e.stack?.split('\n').filter(l=>!l.includes('data:')).slice(1,5).join('\n'));process.exit(1);});

// Exercise the actual village generator and lesson state machine without a GPU.
// Trees and the loaded SUV mesh are omitted; house geometry and colliders are real.
const result=await build({stdin:{contents:`export {World} from './src/world/World'; export {Ground} from './src/world/Ground';
  export {FirstMorning} from './src/game/FirstMorning'; export {brickMansion,mansionGate} from './src/world/Urmanly';
  export {mulberry32} from './src/core/math'; export * as THREE from 'three';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
  plugins:[{name:'test-assets',setup(b){
    b.onResolve({filter:/\?(url|raw)$/},a=>({path:a.path,namespace:'asset'}));
    b.onLoad({filter:/.*/,namespace:'asset'},()=>({contents:'export default ""',loader:'js'}));
    b.onLoad({filter:/[\\/]Cars\.ts$/},a=>({contents:fs.readFileSync(a.path,'utf8').replace("if (!tpl) throw new Error('loadCars() must finish before building cars');","if (!tpl) return {group:new THREE.Group(), length:4.5, width:1.9, tail:new THREE.MeshLambertMaterial(), axles:[], beacons:[], rear:new THREE.Vector3(), kind};"),loader:'ts'}));
  }}]});
const canvas=new Proxy({}, {get:(o,k)=>o[k]??(k==='measureText'?()=>({width:20}):()=>{})});
globalThis.document={createElement:()=>({getContext:()=>canvas})};
const {World,Ground,FirstMorning,brickMansion,mansionGate,mulberry32,THREE:T}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const ground=new Ground(); assert.equal(ground.homeRoad.length-ground.homeMarks.village,330);
const stats={vertices:0,top:-Infinity};
const bucket={add(key,geo,matrix){
  const copy=geo.clone();if(matrix)copy.applyMatrix4(matrix);const a=copy.attributes.position;
  for(let i=0;i<a.count;i++){assert(Number.isFinite(a.getX(i)+a.getY(i)+a.getZ(i)));stats.top=Math.max(stats.top,a.getY(i));}
  stats.vertices+=a.count;copy.dispose();
}};
const shapes=[];brickMansion(bucket,{x:0,y:0,z:0,rot:0},shapes);mansionGate(bucket,{x:15,y:0,z:0,rot:0},shapes);
assert(stats.top>10);assert(shapes.some(c=>c.hw>5));assert(shapes.some(c=>c.hw>4&&c.hw<5));
let samples=0;
for(const seed of [1,42,1998,9001]) {
  const world=Object.create(World.prototype);
  Object.assign(world,{ground,colliders:{add:()=>{}},group:new T.Group(),villageHomes:[],exclusions:[],benches:[],folk:[{gate:'flat',win:'flat',winLit:'flat',gable:'flat',base:'#777',trim:'#ddd'}],mats:{},signCount:0,
    addTree:()=>{}, homePose:ground.homeRoad.frame(ground.homeRoad.length),postDoor:ground.main.frame(40),gai:{post:ground.main.frame(ground.marks.home-80),sPost:ground.marks.home-80}});
  const colliders=[]; world.buildUrmanly(bucket,mulberry32(seed),colliders);
  assert.deepEqual(world.villageHomes.map(h=>h.id).sort(),['alia','mityai','rafail','rinat']);
  for(const speed of [15,20,25]) {
    let distance=0;const heard=[],hints=[];const cab={lights:false,wipers:false,map:false,horn:false,lookYaw:0,lookBack:false};
    const van={speedKmh:speed,engine:'running',handbrake:false,x:world.homePose.x,z:world.homePose.z,fourWD:false,low:false,throttle:0};
    const lesson=new FirstMorning(world,ground,{say:(_,line)=>heard.push({line,distance}),hint:(id)=>{
      hints.push(id);
      if(id==='ob-wipers')cab.wipers=true;
      if(id==='ob-lights')cab.lights=true;
      if(id==='ob-4wd')van.fourWD=true;
      if(id==='ob-low')van.low=true;
      if(id==='ob-low-off')van.low=false;
    },clearHint:()=>{}},()=>({...cab,horn:distance>90}));
    lesson.start();
    while(distance<620){const f=ground.homeRoad.frame(ground.homeRoad.length-distance);van.x=f.x;van.z=f.z;lesson.update(.1,van);distance+=speed/3.6*.1;}
    for(const id of ['ob-wipers','ob-lights','ob-slow','ob-4wd','ob-low','ob-low-off']) assert(hints.includes(id),`${id}: missing after village extension`);
    for(const name of ['Нюра','Ринат','Рафаэль']) assert(heard.some(h=>h.line.includes(name)),`${name} at seed ${seed}, ${speed} km/h`);
    for(const id of ['rinat','rafail']) {
      const h=world.villageHomes.find(h=>h.id===id),name=id==='rinat'?'Ринат':'Рафаэль';
      const said=heard.find(h=>h.line.includes(name));const passed=said.distance-(ground.homeRoad.length-h.s);
      assert(passed<13,`${id}: line spoken after house is gone`);
    }
    samples++;
  }
}
console.log(`PASS: mansion geometry, four addresses across four seeds, ${samples} onboarding drives (15/20/25 km/h). SUV appearance not tested.`);
