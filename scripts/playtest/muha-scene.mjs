import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const out = process.env.MUHA_OUT || 'reports/muha-scene';
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4328', '--strictPort'], { stdio: 'ignore', windowsHide: true });
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--remote-debugging-port=9462',
  `--user-data-dir=${mkdtempSync(tmpdir() + '/muha-scene-')}`,
  '--window-size=1400,1000', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map(), errors = [];
try {
  let pages;
  for (let i = 0; i < 60; i++) {
    try { pages = await (await fetch('http://127.0.0.1:9462/json')).json(); if (pages.length) break; } catch {}
    await pause(250);
  }
  assert(pages?.length, 'Browser starts');
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  ws.addEventListener('message', e => {
    const message = JSON.parse(e.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise(resolve => {
    const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
    return response.result?.result?.value;
  };
  const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${name}.png`, Buffer.from(result.result.data, 'base64'));
  };
  const until = async expression => {
    for (let i = 0; i < 240; i++) { if (await evaluate(expression)) return; await pause(250); }
    throw new Error(`Timed out: ${expression}`);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:4328/' });
  await until('!!window.__uaz');

  await evaluate('window.__uaz.ui.onStartSandbox()');
  await until("window.__uaz.vehicle.engine === 'running'");
  await evaluate(`(() => {
    const u=window.__uaz,p=u.world.muha.group.position;
    u.atmo.setDayWeather('Ясно');
    u.vehicle.place(p.x+4,p.z-1,u.world.muha.group.rotation.y+Math.PI,u.ground);
    u.vehicle.handbrake=true;u.ui.clearSceneLine();
    window.__result=null;
    u.meetMuha(bond=>window.__result={bond},()=>window.__result={cancel:true});
  })()`);
  await until('window.__uaz.narrative.currentBeat === "greeting"');
  await pause(1600); await shot('handshake');
  await until('window.__uaz.ui.choiceOpen');
  await shot('choice');
  const sample=await evaluate(`(() => {
    const u=window.__uaz,m=u.meeting;
    return {beat:u.narrative.currentBeat,car:u.world.muhaCar.group.position.toArray(),
      van:[u.vehicle.x,u.vehicle.y,u.vehicle.z,u.vehicle.yaw],center:m.center.toArray(),camera:u.camera.position.toArray(),
      hero:m.timur.group.position.toArray(),muha:m.muha.group.position.toArray(),
      clips:[m.timur.clip,m.muha.human.clip],root:m.root.visible};
  })()`);
  await evaluate('document.querySelector(".scene-answers .answer").click()');
  await pause(1200); await shot('smoking');
  const smoke=await evaluate(`(() => {
    const u=window.__uaz,h=u.meeting.muha.human,m=u.meeting.muha;
    const V=h.group.position.constructor;
    const p=o=>o.getWorldPosition(new V());
    return {error:p(m.lips).distanceTo(p(m.cigarette)),mouth:h.group.worldToLocal(p(m.lips)).toArray(),
      filter:h.group.worldToLocal(p(m.cigarette)).toArray(),head:h.at('Head').toArray(),weight:m.dragW,
      hand:h.at('PalmL').toArray(),top:h.extent(['Head'],h.bindAt('Head').y,3).max.y};
  })()`);
  writeFileSync(out+'/smoke.json',JSON.stringify(smoke,null,2));
  assert(smoke.error < .01, 'The cigarette filter reaches the mouth within 1 cm');
  console.log('Smoking contact',smoke);
  await until('window.__uaz.narrative.currentBeat === "brag"');
  await pause(400); await shot('car');
  await until('window.__uaz.ui.choiceOpen');
  await evaluate('document.querySelector(".scene-answers .answer").click()');
  await until('window.__uaz.narrative.currentBeat === "secret"');
  await pause(1000); await shot('muha');
  await until('!window.__uaz.narrative.active');
  await shot('returned');
  assert.deepEqual(await evaluate('window.__result'),{bond:1});
  assert.equal(errors.length,0,JSON.stringify(errors));
  // Additional branches use the same runner, accelerated between meaningful states.
  const branches=await evaluate(`(() => {
    const u=window.__uaz,results=[];
    const advance=()=>{for(let i=0;i<1200&&u.narrative.active&&!u.ui.choiceOpen;i++)u.narrative.update(.05);};
    for(const path of [[1],[0,1]]) {
      let bond=null;u.meetMuha(b=>bond=b,()=>{});advance();
      for(const choice of path) {document.querySelectorAll('.scene-answers .answer')[choice].click();advance();}
      results.push({path,bond,active:u.narrative.active});
    }
    return results;
  })()`);
  assert.deepEqual(branches.map(b=>b.bond),[0,1]);
  const cancellation=await evaluate(`(() => {
    const u=window.__uaz,cam=u.camera,parent=cam.parent,pos=cam.position.clone(),q=cam.quaternion.clone(),fov=cam.fov;
    let completed=false,cancelled=false;
    u.meetMuha(()=>completed=true,()=>cancelled=true);u.narrative.update(.5);u.narrative.cancel();
    return {completed,cancelled,camera:cam.parent===parent&&cam.position.equals(pos)&&cam.quaternion.equals(q)&&cam.fov===fov,
      restored:u.cabin.group.visible&&u.world.muha.group.visible&&!u.meeting.root.visible&&u.input.enabled&&!u.ui.choiceOpen};
  })()`);
  assert.deepEqual(cancellation,{completed:false,cancelled:true,camera:true,restored:true});
  console.log('Branches and cancellation passed');
  // Resume a real working day, so the proximity trigger and persistence are exercised together.
  await evaluate(`(() => {
    const u=window.__uaz,v=u.vehicle,p={...u.profile,prologue:true};delete p.muha;
    const saved={v:1,day:p.day,runs:p.runs,at:Date.now(),planned:u.today.orders,handed:[],deliveries:[],time:45,cargo:100,
      police:{fines:0,arrests:0,escapes:0,warnings:0,checks:0},extras:[],visited:[],
      van:{x:v.x+45,z:v.z,yaw:v.yaw,fuel:1,damage:0,steer:0,rad:0,pull:1,flat:false,coolant:1,odometer:0}};
    localStorage.setItem('uaz-zarechye-profile',JSON.stringify(p));localStorage.setItem('uaz-zarechye-day',JSON.stringify(saved));
  })()`);
  await send('Page.reload');await pause(1200);
  await until('!!window.__uaz');
  await evaluate('window.__uaz.ui.onStart()');
  await until('!!window.__uaz.story && window.__uaz.input.enabled');
  console.log('Working day resumed');
  await pause(1100);
  assert.equal(await evaluate('window.__uaz.narrative.active'),false,'No meeting at a distance');
  await evaluate(`(() => {
    const u=window.__uaz,p=u.world.muha.group.position;
    u.vehicle.place(p.x+4,p.z-1,u.world.muha.group.rotation.y+Math.PI,u.ground);
    u.vehicle.handbrake=true;
  })()`);
  await until('window.__uaz.narrative.active');
  const before=await evaluate('({time:__uaz.mission.time,x:__uaz.vehicle.x,z:__uaz.vehicle.z,fuel:__uaz.vehicle.fuel})');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW'});
  await pause(700);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'});
  assert.deepEqual(await evaluate('({time:__uaz.mission.time,x:__uaz.vehicle.x,z:__uaz.vehicle.z,fuel:__uaz.vehicle.fuel})'),before,'Scene freezes vehicle and mission');
  await evaluate("window.__uaz.input.onAction('pause')");
  const elapsed=await evaluate('window.__uaz.narrative.elapsed');
  await pause(400);
  assert.equal(await evaluate('window.__uaz.narrative.elapsed'),elapsed,'Pause freezes scene');
  await shot('pause');
  await evaluate("window.__uaz.input.onAction('pause')");
  assert.equal(await evaluate('window.__uaz.input.enabled'),false,'Resume still locks driving');
  await until('window.__uaz.ui.choiceOpen');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await pause(200);await shot('portrait');
  const layout=await evaluate(`Array.from(document.querySelectorAll('.scene-answers .answer')).map(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})`);
  assert(layout.every(Boolean),'Portrait answers fit viewport');
  await send('Emulation.clearDeviceMetricsOverride');
  await evaluate(`(() => {
    const u=window.__uaz;
    document.querySelectorAll('.scene-answers .answer')[0].click();
    for(let i=0;i<1200&&u.narrative.active&&!u.ui.choiceOpen;i++)u.narrative.update(.05);
    document.querySelectorAll('.scene-answers .answer')[1].click();
    for(let i=0;i<1200&&u.narrative.active;i++)u.narrative.update(.05);
  })()`);
  assert.equal(await evaluate('window.__uaz.story.state.step'),'ask');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('uaz-zarechye-profile')).muha.step"),'ask');
  await send('Page.reload');await pause(1200);await until('!!window.__uaz');
  await evaluate('window.__uaz.ui.onStart()');
  await until('!!window.__uaz.story && window.__uaz.input.enabled');
  await pause(1000);
  assert.equal(await evaluate('window.__uaz.narrative.active'),false,'Completed introduction never repeats on resume');
  assert.equal(await evaluate('window.__uaz.story.state.step'),'ask');
  assert.equal(errors.length,0,JSON.stringify(errors));
  writeFileSync(out+'/checks.json',JSON.stringify({sample,smoke,branches,cancellation,layout,
    integration:{proximity:true,vehicleAndMissionFrozen:true,pause:true,persisted:true,noRepeatOnResume:true},errors},null,2));
  console.log(JSON.stringify({sample,smoke,branches,cancellation,layout,errors}));
  await Promise.race([send('Browser.close'),pause(1000)]);
} finally {ws?.close();browser.kill();server.kill();}
