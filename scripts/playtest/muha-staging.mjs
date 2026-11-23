import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const out = process.env.MUHA_OUT || 'reports/muha-staging';
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4329', '--strictPort'], { stdio: 'ignore', windowsHide: true });
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--remote-debugging-port=9463',
  `--user-data-dir=${mkdtempSync(tmpdir() + '/muha-scene-')}`,
  '--window-size=1400,1000', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map(), errors = [];
try {
  let pages;
  for (let i = 0; i < 60; i++) {
    try { pages = await (await fetch('http://127.0.0.1:9463/json')).json(); if (pages.length) break; } catch {}
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
  await send('Page.navigate', { url: 'http://127.0.0.1:4329/' });
  await until('!!window.__uaz');


  await evaluate('window.__uaz.ui.onStartSandbox()');
  await until("window.__uaz.vehicle.engine === 'running'");
  const results=[];
  for(let turn=0;turn<4;turn++) {
    const result=await evaluate(`(() => {
      const u=window.__uaz,p=u.world.muha.group.position;
      u.ui.clearSceneLine();u.atmo.setDayWeather('Ясно');
      u.vehicle.place(p.x+4,p.z-1,u.world.muha.group.rotation.y+${turn}*Math.PI/2,u.ground);
      const started=u.meetMuha(()=>{},()=>{});
      for(let i=0;i<70;i++)u.narrative.update(.05);
      const m=u.meeting,h=m.timur,g=m.muha.human,V=h.group.position.constructor;
      u.camera.updateMatrixWorld(true);
      const project=x=>x.group.position.clone().add(new V(0,1.4,0)).project(u.camera).toArray();
      return {turn:${turn},started,actors:[project(h),project(g)],
        contact:h.bone('PalmR').getWorldPosition(new V()).distanceTo(g.bone('PalmR').getWorldPosition(new V())),
        clear:[m.free(h.group.position,.3),m.free(g.group.position,.3)]};
    })()`);
    results.push(result);await shot('parking-'+turn);
    assert(result.started,'Scene starts for each parking direction');
    assert(result.actors.every(p=>Math.abs(p[0])<.85&&Math.abs(p[1])<.75&&p[2]<1),'Faces remain within frame');
    assert(result.contact<.21,'Hands meet');
    assert(result.clear.every(Boolean),'Both actors stand clear of obstacles');
    await evaluate('window.__uaz.narrative.cancel()');
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  writeFileSync(out+'/checks.json',JSON.stringify({results,errors},null,2));
  console.log(JSON.stringify({results,errors}));
  await Promise.race([send('Browser.close'),pause(1000)]);
} finally {ws?.close();browser.kill();server.kill();}
