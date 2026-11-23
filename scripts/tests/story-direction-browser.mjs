import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
assert(browser,'A local Chromium browser is required');
const server=await createServer({server:{port:4197,strictPort:true,hmr:false}}); await server.listen();
const port=9437, profile=fs.mkdtempSync(path.join(os.tmpdir(),'postal-story-'));
const child=spawn(browser,['--headless=new','--no-first-run','--no-sandbox','--mute-audio','--enable-unsafe-swiftshader','--window-size=1440,900',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'http://localhost:4197'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
let browserLog=''; child.stderr.on('data',d=>browserLog+=d); child.on('error',e=>console.error(e));
const delay=ms=>new Promise(r=>setTimeout(r,ms)); let ws;
try {
  let page;
  for(let n=0;n<80&&!page;n++){try {page=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');}catch{} if(!page)await delay(250);}
  assert(page,'Browser debugging endpoint: '+browserLog); ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  let seq=0; const pending=new Map(), errors=[];
  ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),30000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});ws.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{const m=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(m.result?.exceptionDetails)throw Error(m.result.exceptionDetails.exception?.description);return m.result?.result?.value;};
  await send('Runtime.enable'); await send('Page.enable');
  let ready=false;
  for(let n=0;n<160&&!ready;n++){ready=await run('!!window.__uaz');if(!ready)await delay(500);}
  assert(ready,'Game boot'); console.log('Game booted');
  const homes=await run(`(()=>{const u=window.__uaz;u.ui.paused=true;return {homes:u.world.villageHomes,length:u.ground.homeRoad.length-u.ground.homeMarks.village};})()`);
  assert.equal(homes.length,330); assert.deepEqual(homes.homes.map(h=>h.id).sort(),['alia','mityai','rafail','rinat']); console.log(JSON.stringify(homes));
  const heard=await run(`(async()=>{
    const {FirstMorning}=await import('/src/game/FirstMorning.ts');const u=window.__uaz, lines=[];
    let p=0;const v={speedKmh:20,engine:'running',handbrake:false,x:u.world.homePose.x,z:u.world.homePose.z,fourWD:false,low:false,throttle:0};
    const lesson=new FirstMorning(u.world,u.ground,{say:(_,l)=>lines.push(l),hint:()=>{},clearHint:()=>{}},()=>({lights:false,wipers:false,map:false,horn:p>95,lookYaw:0,lookBack:false}));
    lesson.start();
    for(let n=0;n<700;n++){p=n*.5;const f=u.ground.homeRoad.frame(u.ground.homeRoad.length-p);v.x=f.x;v.z=f.z;lesson.update(.1,v);}
    return lines;
  })()`);
  for(const name of ['Нюра','Ринат','Рафаэль']) assert(heard.some(l=>l.includes(name)),name+' heard on the first drive');
  console.log('Onboarding:',JSON.stringify(heard));
  const uiCheck=await run(`(async()=>{
    const u=window.__uaz,{reckon,boardFor,newPayBook,paydays}=await import('/src/game/Career.ts');
    u.profile.money=0;u.profile.damage=.4;u.ui.setGarage(u.profile);
    const title=u.ui.root.innerText;
    u.ui.hideTitle();u.ui.showEvening(boardFor(18),{time:300,distance:1200,grade:5,remarks:[],police:{fines:0,arrests:0,escapes:0,warnings:0,checks:0}},reckon([],0,0,.4,20,[['Выручил соседа',10000,2]]),u.profile,{onRepair:()=>{},onNext:()=>{},pay:paydays(newPayBook(),18),premium:20});
    return {title,journal:u.ui.root.innerText,repairButtons:[...document.querySelectorAll('.end button')].map(b=>b.textContent)};
  })()`);
  assert(!/копилка|\b₽\b/i.test(uiCheck.title));assert(!/Копилка|Премия за месяц|Доверие|Итого за день/.test(uiCheck.journal));
  assert(uiCheck.repairButtons.some(t=>t.includes('гараж')));
  fs.mkdirSync('reports/story-direction',{recursive:true});
  let shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('reports/story-direction/journal.png',Buffer.from(shot.result.data,'base64'));
  await run(`(()=>{const u=window.__uaz;u.ui.root.style.display='none';u.cabin.group.visible=false;u.grandpaSeat.visible=false;
    const h=u.world.villageHomes.find(h=>h.id==='rafail'),road=u.ground.homeRoad;
    const eye=road.frame(h.s+29),target=road.frame(h.s-10);
    u.camera.position.set(eye.x-eye.rx*2,u.ground.height(eye.x,eye.z)+2.1,eye.z-eye.rz*2);
    u.camera.lookAt(target.x+target.rx*15,u.ground.height(target.x+target.rx*15,target.z+target.rz*15)+4,target.z+target.rz*15);
    u.camera.fov=68;u.camera.updateProjectionMatrix();u.renderer.pixelMode=false;
    return true;})()`);
  await delay(500);shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('reports/story-direction/rafail.png',Buffer.from(shot.result.data,'base64'));
  assert.deepEqual(errors,[]);console.log('PASS: WebGL boot, four addresses, onboarding timing, money-free journal and repair actions, screenshots.');
} finally {ws?.close(); child.kill(); await server.close();}
