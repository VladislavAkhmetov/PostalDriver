// Isolated full-game verification of cabin views, live controls and render cost.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const out = 'reports/cabin-documents';
mkdirSync(out,{recursive:true});
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--remote-debugging-port=9442',`--user-data-dir=${mkdtempSync(tmpdir()+'/speedometer-')}`,
  '--window-size=1400,1100','--hide-scrollbars','about:blank'
],{stdio:'ignore',windowsHide:true});
const pause = ms => new Promise(r=>setTimeout(r,ms));
let ws; const pending = new Map(); let id=0; const errors=[];
try {
  let pages;
  for(let i=0;i<60;i++){try{pages=await(await fetch('http://127.0.0.1:9442/json')).json();if(pages.length)break;}catch{} await pause(250);}
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);} if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4317/cabin-documents-preview.html'});
  let ready=false;
  for(let i=0;i<240;i++){ready=await evaluate('!!window.__cabinDocuments');if(ready)break;await pause(400);}
  if(!ready)throw new Error('Cabin preview failed: '+await evaluate('document.body.innerText'));
  async function shot(name){await pause(700);const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+name+'.png',Buffer.from(r.result.data,'base64'));}
  await shot('driver-view');
  await evaluate('window.__cabinDocuments.closeView()');await shot('documents-retro');
  await evaluate("document.getElementById('retro').click()");await shot('documents-detail');
  const atlas=await evaluate("window.__cabinDocuments.atlas.map.image.toDataURL('image/png')");
  writeFileSync(out+'/document-atlas.png',Buffer.from(atlas.split(',')[1],'base64'));
  const report=await evaluate(`(async()=>{const u=window.__cabinDocuments,T=await import('/node_modules/three/build/three.module.js');const mesh=u.cabin.group.getObjectByName('cabin:documents');const uv=Array.from(mesh.geometry.attributes.uv.array);u.cabin.group.updateMatrixWorld(true);u.camera.updateMatrixWorld(true);const h=u.cabin.hotspots.find(h=>h.id==='map');const p=h.mesh.getWorldPosition(new T.Vector3()).project(u.camera);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(p.x,p.y),u.camera);const hits=ray.intersectObjects(u.cabin.hotspots.map(h=>h.mesh),false).map(a=>u.cabin.hotspots.find(h=>h.mesh===a.object).id);return {...u.stats,paperTriangles:mesh.geometry.attributes.position.count/3,uvInRange:uv.every(x=>Number.isFinite(x)&&x>=0&&x<=1),mapHit:hits[0],mapVisible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1};})()`);
  report.errors=errors;writeFileSync(out+'/checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(errors.length||!report.uvInRange||!report.mapVisible||report.mapHit!=='map')process.exitCode=1;
  await Promise.race([send('Browser.close'),pause(1000)]);
} finally {ws?.close();browser.kill();}
