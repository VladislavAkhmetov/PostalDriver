import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const out = process.env.SMOKING_OUT || 'reports/smoking-pose';
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4317', '--strictPort'], { stdio: 'ignore', windowsHide: true });
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--remote-debugging-port=9451',
  `--user-data-dir=${mkdtempSync(tmpdir() + '/smoking-pose-')}`,
  '--window-size=1400,1000', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map(), errors = [];
try {
  let pages;
  for (let i = 0; i < 60; i++) {
    try { pages = await (await fetch('http://127.0.0.1:9451/json')).json(); if (pages.length) break; } catch {}
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
  await send('Page.navigate', { url: 'http://127.0.0.1:4317/' });
  await until('!!window.__uaz');
  await evaluate('window.__uaz.ui.onStartSandbox()');
  await until("window.__uaz.vehicle.engine === 'running' && !window.__uaz.cabin.hands.busy('L')");
  await pause(500);
  await evaluate(`(async () => {
    const u=window.__uaz,c=u.cabin,T=await import('/node_modules/three/build/three.module.js');
    window.__T=T;
    u.vehicle.handbrake=true;
    u.atmo.setDayWeather('Ясно');
    u.input.lookYaw=0; u.input.lookPitch=0;
    window.__stepCabin=c.update.bind(c);
    c.update=()=>{};
    window.__sampleSmoking=()=>{
      const s=c.smoker,h=c.hands;
      c.group.updateWorldMatrix(true,true);
      const cabin=o=>c.group.worldToLocal(o.getWorldPosition(new T.Vector3()));
      const tip=s.cigTip(new T.Vector3()),flame=cabin(s.flame),wrist=cabin(h.rigR.group);
      const project=p=>p.clone().applyMatrix4(c.group.matrixWorld).project(u.camera).toArray();
      return {state:s.state,brand:s.brand,lightT:s.lightT,on:s.flame.visible,
        tip:tip.toArray(),flame:flame.toArray(),wrist:wrist.toArray(),mouth:s.mouth.toArray(),
        error:tip.distanceTo(flame),project:{tip:project(tip),flame:project(flame),wrist:project(wrist)},
        target:h.taskOf('R')?.target().toArray(),hand:h.right.pos.toArray(),head:s.head.rotation.toArray(),
        task:h.taskOf('R')?.tag,extent:h.right.extent,rigScale:h.rigR.group.scale.toArray()};
    };
  })()`);
  await evaluate('window.__uaz.cabin.smoke()');
  const frames=await evaluate(`(() => {
    const u=window.__uaz,frames=[];
    for(let i=0;i<650;i++) {
      window.__stepCabin(1/60,u.vehicle,0,0);
      if(i%10===0)frames.push(window.__sampleSmoking());
      if(u.cabin.smoker.flame.visible&&u.cabin.smoker.lightT>.9)break;
    }
    return frames;
  })()`);
  const pose=await evaluate('window.__sampleSmoking()');
  const occlusion=await evaluate(`(() => {
    const u=window.__uaz,s=u.cabin.smoker,T=window.__T;
    const origin=u.camera.getWorldPosition(new T.Vector3()),flame=s.flame.getWorldPosition(new T.Vector3());
    const ray=new T.Raycaster(origin,flame.clone().sub(origin).normalize(),0,origin.distanceTo(flame));
    ray.layers.enable(2);
    return {hits:ray.intersectObject(u.cabin.hands.human.group,true).filter(hit=>hit.object.isSkinnedMesh).slice(0,5).map(hit=>({distance:hit.distance,point:hit.point.toArray(),name:hit.object.name})),
      bones:['PalmR','MiddleHandR','FingersR','Thumb1R','Thumb2R'].map(name=>({name,position:u.cabin.hands.toCabin(u.cabin.hands.human.at(name),new T.Vector3()).toArray()}))};
  })()`);
  assert(pose.on && pose.error < .01, 'The flame touches the cigarette');
  assert.equal(occlusion.hits.length,0,'The hand does not hide the flame');
  await pause(250); await shot('lighting');
  const checks=await evaluate(`(() => {
    const u=window.__uaz,c=u.cabin,s=c.smoker,T=window.__T,checks=[];
    const step=()=>window.__stepCabin(1/60,u.vehicle,0,0);
    const finish=()=>{for(let i=0;i<600&&s.state!=='smoking';i++)step();};
    finish();
    checks.push({kind:'completed',state:s.state,flame:s.flame.visible,returned:s.lighter.parent===c.group});
    c.stubOut();for(let i=0;i<600&&s.state!=='idle';i++)step();
    checks.push({kind:'stubbed',state:s.state});
    // Every brand, including the longer papirosa, and turning the head during the hold.
    for(const brand of ['prima','belomor','petr','magna','opal','nord']) {
      const random=Math.random;
      try { Math.random=()=>0; for(let i=0;i<6&&s.brand!==brand;i++)s.cycleBrand(); }
      finally { Math.random=random; }
      c.smoke();
      for(let i=0;i<600&&!(s.flame.visible&&s.lightT>.5);i++)step();
      for(const [yaw,pitch] of [[0,-.25],[.5,-.25],[-.5,-.25],[0,-.6],[0,.1]]) {
        for(let i=0;i<10;i++){s.head.rotation.set(pitch,yaw,0);step();}
        checks.push({kind:'pose',brand,yaw,pitch,...window.__sampleSmoking()});
      }
      finish();
      c.stubOut();for(let i=0;i<600&&s.state!=='idle';i++)step();
    }
    // A gear/control action can take the right hand away mid-lighting.
    c.smoke();
    for(let i=0;i<600&&!(s.flame.visible&&s.lightT>.4);i++)step();
    c.hands.reach({hand:'R',pose:'grip',target:()=>new T.Vector3(.1,.5,-1.6),hold:.2,tag:'test-control'});
    for(let i=0;i<900&&(s.state!=='smoking'||c.hands.busy('R'));i++)step();
    checks.push({kind:'interrupted',state:s.state,flame:s.flame.visible,returned:s.lighter.parent===c.group});
    return checks;
  })()`);
  writeFileSync(`${out}/checks.json`, JSON.stringify({pose,occlusion,frames,checks,errors},null,2));
  const poses=checks.filter(q=>q.kind==='pose');
  assert(poses.every(q=>q.error<.015), 'The flame follows every cigarette and head pose within 1.5 cm');
  assert(checks.filter(q=>['completed','interrupted'].includes(q.kind)).every(q=>q.state==='smoking'&&!q.flame&&q.returned), 'Lighting completes and recovers after interruption');
  assert(checks.find(q=>q.kind==='stubbed').state==='idle', 'Stubbing completes');
  assert.equal(errors.length,0,'No browser exceptions');
  console.log(JSON.stringify({poseChecks:poses.length,maxError:Math.max(...poses.map(q=>q.error)),flameOccluded:occlusion.hits.length>0,checks:checks.filter(q=>q.kind!=='pose'),errors}));
  await Promise.race([send('Browser.close'),pause(1000)]);
} finally {ws?.close();browser.kill();server.kill();}
