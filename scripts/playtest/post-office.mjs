import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const out = 'reports/post-office'; mkdirSync(out, { recursive: true });
const port = 9468;
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(tmpdir() + '/post-office-')}`,
  '--window-size=1440,1000', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws; let id = 0; const pending = new Map(); const errors = [];
try {
  let pages;
  for (let i = 0; i < 60; i++) {
    try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.length) break; } catch {}
    await pause(250);
  }
  if (!pages?.some(p => p.type === 'page')) throw new Error('Chrome debugging connection unavailable; no browser checks ran.');
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; const timeout = setTimeout(() => { pending.delete(n); reject(new Error('CDP timeout: ' + method)); }, 60000);
    pending.set(n, m => { clearTimeout(timeout); resolve(m); }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
    return response.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: (process.env.URL || 'http://127.0.0.1:4317') + '/post-office-preview.html' });
  let ready = false;
  for (let i = 0; i < 180; i++) { ready = await evaluate('!!window.__postOffice'); if (ready) break; await pause(400); }
  if (!ready) throw new Error('Preview failed: ' + await evaluate('document.body.innerText'));
  for (const shot of ['wide', 'entrance', 'zinaida', 'hero', 'window']) {
    await evaluate(`window.__postOffice.select('${shot}')`); await pause(450);
    const png = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${shot}.png`, Buffer.from(png.result.data, 'base64'));
  }
  const checks = await evaluate(`(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const {world, room, camera, renderer} = window.__postOffice;
    world.group.updateMatrixWorld(true);
    const origin = room.worldPoint(new T.Vector3(-2.15, 1.65, 1.8));
    const end = room.worldPoint(new T.Vector3(-2.15, 1.65, 15));
    const ray = new T.Raycaster(origin, end.sub(origin).normalize(), 0, 100);
    const hits = ray.intersectObject(world.group, true).filter(h => !h.object.material?.transparent);
    let triangles = 0;
    room.root.traverse(o => { if(o.isMesh) triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; });
    document.getElementById('furniture').click(); const hidesFurniture = !room.furniture.visible;
    document.getElementById('furniture').click();
    const finite = camera.position.toArray().every(Number.isFinite);
    const stats = {triangles, realWorldParent:room.root.parent===world.group, firstOpaqueHit:hits[0]?.distance,
      firstOpaqueName:hits[0]?.object.name, clearWindow:!hits.length||hits[0].distance>2,
      hasRealExterior:hits.length>0, hidesFurniture, restoresFurniture:room.furniture.visible, finite,
      hasRacks:!!room.root.getObjectByName('postcards-rack')&&!!room.root.getObjectByName('newspapers-rack')};
    return stats;
  })()`);
  checks.errors = errors; writeFileSync(out + '/checks.json', JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
  if (!checks.clearWindow || !checks.hasRealExterior || !checks.realWorldParent || !checks.hidesFurniture || !checks.restoresFurniture || !checks.hasRacks || !checks.finite || errors.length) process.exitCode = 1;
  await Promise.race([send('Browser.close'), pause(1000)]);
} finally { ws?.close(); browser.kill(); }
