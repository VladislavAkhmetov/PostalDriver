// Geometry checks do not require a browser/GPU. Only canvas painting is stubbed;
// production Three.js geometry, transforms, camera projection and raycasting run unchanged.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
const result = await build({
  stdin: { contents: `export {PostOfficeInterior, POST_SHOTS} from './src/world/PostOfficeInterior';
    export {postOffice} from './src/world/Props'; export {Bucket} from './src/core/geom';
    export {Ground} from './src/world/Ground'; export * as THREE from 'three';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const {PostOfficeInterior, POST_SHOTS, postOffice, Bucket, Ground, THREE: T} = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const canvasStub = new Proxy({}, {get: (o, key) => key === 'createRadialGradient' ? () => ({addColorStop(){}}) : (o[key] ?? (()=>{}))});
globalThis.document = { createElement: () => ({ getContext: () => canvasStub }) };
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const ground = new Ground(), frame = ground.main.frame(40);
const place = {x:frame.x+frame.rx*17.5, z:frame.z+frame.rz*17.5, y:0, rot:Math.atan2(-frame.rx,-frame.rz)};
const c = Math.cos(place.rot), s = Math.sin(place.rot);
place.y = Math.min(...[[-8,-5],[8,-5],[8,5],[-8,5],[0,0]].map(([x,z])=>ground.terrainAt(place.x+x*c+z*s,place.z-x*s+z*c)));
const room = new PostOfficeInterior(place), root = new T.Group(); root.add(room.root);
const bucket = new Bucket(), colliders = []; postOffice(bucket,place,colliders);
const material = new T.MeshLambertMaterial();
root.add(bucket.build(Object.fromEntries(['brickWhite','flat','pochta','concrete','bigWinLit','bigWin'].map(k=>[k,material]))));
root.updateMatrixWorld(true);
let rays = 0;
// Sample the two clear lower panes; check both directions across the actual brick shell.
for(const x of [-2.3,-2.1,-1.5,-1.3]) for(const y of [1.3,1.65,2]) {
  const a=room.worldPoint(new T.Vector3(x,y,1.9)), b=room.worldPoint(new T.Vector3(x,y,3.1));
  for(const [start,end] of [[a,b],[b,a]]) {
    const ray=new T.Raycaster(start,end.clone().sub(start).normalize(),0,start.distanceTo(end));
    const opaque=ray.intersectObject(root,true).filter(h=>!h.object.material.transparent);
    assert(!opaque.length, 'Window blocked by '+opaque[0]?.object.name); rays++;
  }
}
const camera=new T.PerspectiveCamera(65,16/9,.03,1200);
for(const shot of Object.keys(POST_SHOTS)) {
  room.frame(camera,shot); camera.updateMatrixWorld(true);
  const local=room.root.worldToLocal(camera.position.clone());
  assert(Math.abs(local.x)<2.7&&Math.abs(local.z)<2.3&&local.y>0&&local.y<2.85,'Camera outside room: '+shot);
  assert(camera.projectionMatrix.elements.every(Number.isFinite),'Invalid projection: '+shot);
}
let minimumFloorClearance=Infinity;
for(let x=-2.6;x<2.7;x+=.4)for(let z=-2.2;z<2.3;z+=.4){
  const p=room.worldPoint(new T.Vector3(x,0,z)); minimumFloorClearance=Math.min(minimumFloorClearance,p.y-ground.terrainAt(p.x,p.z));
}
assert(minimumFloorClearance>0,'Terrain intersects floor: '+minimumFloorClearance);
assert(colliders.length===1&&colliders[0].hw===8&&colliders[0].hd===5,'Exterior vehicle collision changed');
for(const name of ['postcards-rack','newspapers-rack','store-door','zinaida-desk-top'])assert(room.root.getObjectByName(name),'Missing '+name);
let triangles=0; room.root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
const report={windowRaysPassed:rays,cameraShotsPassed:Object.keys(POST_SHOTS).length,minimumFloorClearance,triangles,vehicleColliderPreserved:true};
mkdirSync('reports/post-office',{recursive:true});writeFileSync('reports/post-office/geometry-checks.json',JSON.stringify(report,null,2));
room.dispose();assert(!room.root.parent,'Dispose did not detach room');
console.log(JSON.stringify(report,null,2));delete globalThis.document;
