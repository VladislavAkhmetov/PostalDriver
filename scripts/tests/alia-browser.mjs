import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
assert(browser,'A local Chromium browser is required');
const server=await createServer({server:{port:4199,strictPort:true,hmr:false}}); await server.listen();
const port=9439, profile=fs.mkdtempSync(path.join(os.tmpdir(),'postal-alia-'));
const child=spawn(browser,['--headless=new','--no-first-run','--no-sandbox','--mute-audio','--enable-unsafe-swiftshader','--window-size=1440,900',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'http://localhost:4199'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
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

  const until=async(expression,label)=>{for(let n=0;n<90;n++){if(await run(expression))return;await delay(300);}throw Error('Timeout: '+label);};
  const click=label=>run(`(()=>{const u=window.__uaz;const b=[...u.ui.choiceEl.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}));if(!b)throw Error('choice missing');b.click();})()`);
  const park=expression=>run(`(()=>{const u=window.__uaz,p=${expression};u.vehicle.place(p.x,p.z,0,u.ground);u.vehicle.handbrake=true;u.vehicle.engine='off';})()`);
  fs.mkdirSync('reports/alia',{recursive:true});
  const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('reports/alia/'+name+'.png',Buffer.from(s.result.data,'base64'));};
  await run(`(()=>{const u=window.__uaz;Object.assign(u.profile,{day:3,runs:2,prologue:true,alia:undefined,returnEvening:undefined});u.ui.onStart();})()`);
  await until('window.__uaz.ui.choiceOpen','morning family card');await click('своим ходом');
  await until('!!window.__uaz.aliaRide','morning Alia');
  await park('u.aliaRide.places.home');await until('window.__uaz.ui.choiceOpen','morning pickup');await shot('pickup');await click('Садись');
  assert(await run('window.__uaz.aliaSeat.visible'),'visible seated neighbour');await shot('passenger');
  await park('u.world.postDoor');await until('window.__uaz.ui.choiceOpen','morning arrival');await click('растерялся');
  await until('window.__uaz.ui.boardOpen','route sheet after dropoff');
  assert.equal(await run('window.__uaz.profile.alia.rides'),1);console.log('PASS: real morning ride, passenger and route sheet');
  await run(`(()=>{const p=window.__uaz.profile;p.day=5;p.runs=4;p.returnEvening=4;localStorage.setItem('uaz-zarechye-profile',JSON.stringify(p));localStorage.removeItem('uaz-zarechye-day');})()`);
  await send('Page.reload');await until('!!window.__uaz','reload');await run('window.__uaz.ui.onStart()');
  await until('window.__uaz.ui.choiceOpen','pending evening');await click('Доехать домой');
  await until('window.__uaz.eveningReturn && !!window.__uaz.aliaRide','evening drive');
  await park('u.aliaRide.places.town');await until('window.__uaz.ui.choiceOpen','evening pickup');await click('Садись');
  await park('u.aliaRide.places.home');await until('window.__uaz.ui.choiceOpen','evening arrival');await click('кулаки');
  await until('!window.__uaz.aliaRide.busy','evening farewell');assert.equal(await run('window.__uaz.profile.alia.rides'),2);await shot('home');
  // Reload after a credited dropoff but before Timur reached his own gate: no duplicate encounter.
  await send('Page.reload');await until('!!window.__uaz','reload after dropoff');await run('window.__uaz.ui.onStart()');
  await until('window.__uaz.ui.choiceOpen','return to evening');await click('Доехать домой');
  await until('window.__uaz.eveningReturn','continued evening');assert.equal(await run('window.__uaz.aliaRide'),null);
  await park('u.world.homePose');await until('!window.__uaz.profile.returnEvening','arrived home');
  assert.equal(await run('window.__uaz.profile.day'),5);assert.equal(await run('window.__uaz.profile.alia.rides'),2);
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: evening return, reload after dropoff, no duplicate credit, next morning');
} finally {ws?.close();child.kill();await server.close();}
