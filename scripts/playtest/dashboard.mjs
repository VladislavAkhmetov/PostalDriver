// Isolated full-game verification of cabin views, live controls and render cost.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const out = process.env.CABIN_REPORT_DIR || 'reports/dashboard';
mkdirSync(out,{recursive:true});
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--remote-debugging-port=9438',`--user-data-dir=${mkdtempSync(tmpdir()+'/speedometer-')}`,
  '--window-size=1400,1100','--hide-scrollbars','about:blank'
],{stdio:'ignore',windowsHide:true});
const pause = ms => new Promise(r=>setTimeout(r,ms));
let ws; const pending = new Map(); let id=0; const errors=[];
try {
  let pages;
  for(let i=0;i<60;i++){try{pages=await(await fetch('http://127.0.0.1:9438/json')).json();if(pages.length)break;}catch{} await pause(250);}
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);} if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4317/'});
  let ready=false;
  for(let i=0;i<300;i++){ready=await evaluate('!!window.__uaz');if(ready)break;await pause(400);}
  if(!ready)throw new Error('Game boot failed: '+await evaluate('document.body.innerText'));
  await evaluate(`(async()=>{window.__testTHREE=await import('/node_modules/three/build/three.module.js');window.__uaz.ui.onStartSandbox();})()`);
  await pause(2500);
  await evaluate(`(()=>{const u=window.__uaz;u.atmo.cycleClock();u.atmo.cycleClock();u.atmo.setDayWeather('Ясно');for(let i=0;i<50;i++)u.atmo.update(.1,0,u.camera.position);u.vehicle.handbrake=true;window.__savedHead=u.camera.parent;window.__threeFrames=[];let calls=0,tris=0;const gl=u.renderer.renderer,render=gl.render.bind(gl);gl.render=(s,c)=>{render(s,c);calls+=gl.info.render.calls;tris+=gl.info.render.triangles;};const end=u.renderer.render.bind(u.renderer);u.renderer.render=(s,c)=>{end(s,c);window.__threeFrames.push({calls,tris});if(window.__threeFrames.length>90)window.__threeFrames.shift();calls=0;tris=0;};})()`);
  await pause(2500);
  async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+name+'.png',Buffer.from(r.result.data,'base64'));}
  await shot('driver-forward');
  await evaluate(`(()=>{const u=window.__uaz;u.cabin.group.add(u.camera);u.camera.position.set(-.42,1.06,-1.08);u.camera.rotation.set(-.65,0,0);})()`);
  await pause(800);await shot('driver-dashboard');
  const controls=await evaluate(`(()=>{const u=window.__uaz;const results=[];for(const id of ['lights','wipers','vent','tape','start','4wd','low']){if(id==='4wd'){u.camera.rotation.set(-.65,-.45,0,'YXZ');u.camera.updateMatrixWorld(true);}if(id==='start'){u.vehicle.engine='off';u.vehicle.rpm=0;}const h=u.cabin.hotspots.find(h=>h.id===id);const p=h.mesh.getWorldPosition(u.camera.position.clone()).project(u.camera);const r=u.renderer.canvas.getBoundingClientRect();const x=r.left+(p.x+1)*r.width/2,y=r.top+(1-p.y)*r.height/2;const ray=new window.__testTHREE.Raycaster();ray.setFromCamera(new window.__testTHREE.Vector2(p.x,p.y),u.camera);const hits=ray.intersectObjects(u.cabin.hotspots.map(h=>h.mesh),false).map(a=>u.cabin.hotspots.find(h=>h.mesh===a.object).id);const before={lights:u.cabin.lightsOn,wipers:u.cabin.wipersOn,vent:u.cabin.ventOn,radio:u.audio.tape?.playing,engine:u.vehicle.engine,fourWD:u.vehicle.fourWD,low:u.vehicle.low};u.input.onClick(x,y);results.push({id,hits,ndc:p.toArray(),before,after:{lights:u.cabin.lightsOn,wipers:u.cabin.wipersOn,vent:u.cabin.ventOn,radio:u.audio.tape?.playing,engine:u.vehicle.engine,fourWD:u.vehicle.fourWD,low:u.vehicle.low}});}return results;})()`);
  await pause(1800);await shot('controls-on');
  await evaluate(`(()=>{const u=window.__uaz;u.camera.position.set(0,1.08,-.40);u.camera.rotation.set(-.52,0,0);})()`);
  await pause(600);await shot('cabin-wide');
  await evaluate(`(()=>{const u=window.__uaz;u.camera.position.set(-.42,1.06,-1.08);u.camera.rotation.set(-.40,-.72,0,'YXZ');})()`);
  await pause(600);await shot('passenger-side');
  await evaluate(`(()=>{const u=window.__uaz;u.camera.position.set(0,1.07,-.31);u.camera.rotation.set(-.9,-.80,0,'YXZ');})()`);
  await pause(600);await shot('passenger-seat');
  await evaluate(`(()=>{const u=window.__uaz;u.camera.position.set(-.42,1.06,-1.08);u.camera.rotation.set(-.18,1.18,0,'YXZ');})()`);
  await pause(600);await shot('driver-door-mirror');
  await evaluate(`(()=>{const u=window.__uaz;u.camera.position.set(-.25,1.01,-1.05);u.camera.rotation.set(-.60,1.18,0,'YXZ');})()`);
  await pause(600);await shot('driver-door-card');
  await evaluate(`(()=>{const u=window.__uaz;u.camera.position.set(-.32,1.06,-.87);u.camera.rotation.set(-1.0,-.47,0,'YXZ');})()`);
  await pause(600);await shot('tunnel-documents');
  const atlas=await evaluate(`window.__uaz.cabin.group.getObjectByName('cabin:documents')?.material.map.image.toDataURL('image/png')`);
  if(atlas)writeFileSync(out+'/document-atlas.png',Buffer.from(atlas.split(',')[1],'base64'));
  const sceneStats=await evaluate(`(()=>{const u=window.__uaz;let triangles=0,meshes=0;const materials=new Set();u.cabin.dashboard.group.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;meshes++;materials.add(o.material.uuid);}});const shell=u.cabin.group.getObjectByName('cabin');const staticParts=shell.children.map(o=>({name:o.name,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3}));return {staticParts,dashboard:{triangles,meshes,materials:materials.size},sceneFrames:window.__threeFrames.slice(-30),speedNeedle:u.cabin.dashboard.needles.speed.rotation.z,lights:u.cabin.lightsOn};})()`);
  const structure=await evaluate(`(async()=>{const T=window.__testTHREE;const {Bucket}=await import('/src/core/geom.ts');const {addCabinStructure,sideWindowPane,sideWindowOutline,SIDE_WINDOW,WINDSCREEN,windscreenSlantHeight,windscreenZ}=await import('/src/vehicle/CabinStructure.ts');const b=new Bucket();addCabinStructure(b);const material=new T.MeshBasicMaterial();const g=b.build({paint:material,flat:material,seat:material});g.updateMatrixWorld(true);const cast=(origin,dir)=>new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...dir)).intersectObject(g,true).map(h=>({distance:h.distance,point:h.point.toArray()}));const apertures=[-1,1].map(s=>cast([0,.86,-1.10],[s,0,0]).length===0);const quarterlight=[-1,1].map(s=>cast([0,.72,-1.64],[s,0,0]).length===0);const rakedPillar=[-1,1].map(s=>cast([0,1.00,windscreenZ(SIDE_WINDOW.x,1.00)],[s,0,0]).some(h=>h.distance>.88&&h.distance<.96));const paneBounds=[false,true].map(q=>{const p=sideWindowPane(q).getPoints();return {quarterlight:q,min:Math.min(...p.map(v=>v.x)),max:Math.max(...p.map(v=>v.x))};});const paneGap=paneBounds[1].min-paneBounds[0].max;const seats=[[-.48,-.80],[.62,-.60]].map(([x,z])=>cast([x,1.05,z],[0,-1,0])[0]?.point[1]);const roof=cast([0,1.10,-1.05],[0,1,0])[0]?.point[1];const header=cast([0,1.19,-1.0],[0,0,-1])[0]?.point[2];const u=window.__uaz,frame=u.cabin.group.getObjectByName('windscreen-assembly');frame.updateMatrix();const bottom=new T.Vector3(0,0,0).applyMatrix4(frame.matrix),top=new T.Vector3(0,windscreenSlantHeight,0).applyMatrix4(frame.matrix);const frontSlope=(top.z-bottom.z)/(top.y-bottom.y);const sidePoints=sideWindowOutline().getPoints();const sideSlope=-(sidePoints[3].x-sidePoints[2].x)/(sidePoints[3].y-sidePoints[2].y);const award=u.cabin.group.getObjectByName('driver-award'),cloth=award.getObjectByName('driver-award-cloth');const awardBottom=award.position.y+cloth.position.y-.063;const awardClearance=award.position.z-windscreenZ(award.position.x,award.position.y);u.cabin.group.updateMatrixWorld(true);const inverse=u.cabin.group.matrixWorld.clone().invert();let fanClearance=Infinity;u.cabin.group.getObjectByName('dashboard-fan').traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;const transform=inverse.clone().multiply(o.matrixWorld);for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(transform);if(v.y>WINDSCREEN.bottomY)fanClearance=Math.min(fanClearance,v.z-windscreenZ(v.x,v.y));}});const windshield={fanClearance,degreesFromVertical:Math.atan(frontSlope)*180/Math.PI,frontSlope,sideSlope,top:top.toArray(),bottom:bottom.toArray(),awardBottom,awardClearance,passed:fanClearance>.01&&Math.abs(frontSlope-sideSlope)<.00001&&frontSlope>.25&&awardClearance>.008&&awardClearance<.04&&awardBottom>.85};const finite=g.children.every(m=>['position','normal'].every(key=>Array.from(m.geometry.attributes[key].array).every(Number.isFinite)));let triangles=0;g.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return {windshield,triangles,drawCalls:g.children.length,apertures,quarterlight,rakedPillar,paneGap,seats,roof,header,finite,passed:windshield.passed&&finite&&apertures.every(Boolean)&&quarterlight.every(Boolean)&&rakedPillar.every(Boolean)&&paneGap>.019&&seats.every(y=>y>.32&&y<.36)&&roof>1.24&&roof<1.28&&header< -1.55&&header> -1.75};})()`);
  const report={controls,sceneStats,structure,errors};writeFileSync(out+'/checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(!structure?.passed||controls.find(c=>c.id==='4wd').before.fourWD===controls.find(c=>c.id==='4wd').after.fourWD||controls.find(c=>c.id==='low').before.low===controls.find(c=>c.id==='low').after.low||errors.length||!controls.every(c=>Number.isFinite(c.ndc[0])&&c.ndc[2]<1)||!controls.filter(c=>['lights','wipers','vent'].includes(c.id)).every(c=>c.before[c.id]!==c.after[c.id])||controls.find(c=>c.id==='start').after.engine!=='cranking'||controls.find(c=>c.id==='tape').before.radio===controls.find(c=>c.id==='tape').after.radio)process.exitCode=1;
  await Promise.race([send('Browser.close'),pause(1000)]);
} finally {ws?.close();browser.kill();}
