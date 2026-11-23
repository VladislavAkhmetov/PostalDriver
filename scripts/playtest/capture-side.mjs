import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const port = 9396;
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);

const ch = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=' + port,
  '--window-size=1280,720',
  'http://localhost:3000/'
], { stdio: 'ignore' });

process.on('exit', () => { try { ch.kill(); } catch {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);

let list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let id = 1;
const call = (method, params = {}) => new Promise((resolve) => {
  const reqId = id++;
  const handler = (e) => {
    const data = JSON.parse(e.data);
    if (data.id === reqId) {
      ws.removeEventListener('message', handler);
      resolve(data.result);
    }
  };
  ws.addEventListener('message', handler);
  ws.send(JSON.stringify({ id: reqId, method, params }));
});

await call('Page.enable');
await call('Runtime.enable');
await sleep(2500);

// Click prologue button
await call('Runtime.evaluate', {
  expression: `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Начать') || b.textContent.includes('Новая') || b.textContent.includes('Пролог'));
    if (btn) btn.click();
  })()`
});

await sleep(1500);

// Move camera to side view of the van to inspect side decals and both wheels
await call('Runtime.evaluate', {
  expression: `(() => {
    // In main.ts camera is looking at yardPoint
    const v = window.__prologueVan;
    if (v) {
      const p = v.group.position;
      // Camera looking at side (left side)
      const cam = window.__debugCamera || (window.__scene ? window.__scene.children.find(c => c.isCamera) : null);
      if (cam) {
        cam.position.set(p.x + 3.8, p.y + 1.2, p.z - 0.2);
        cam.lookAt(p.x, p.y + 0.8, p.z);
      }
    }
  })()`
});

await sleep(500);

let res = await call('Page.captureScreenshot', { format: 'png' });
if (res?.data) {
  writeFileSync('scripts/playtest/side_inspect.png', Buffer.from(res.data, 'base64'));
  console.log('Saved side_inspect.png');
}

ws.close();
ch.kill();
process.exit(0);
