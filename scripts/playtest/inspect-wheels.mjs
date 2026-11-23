import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const port = 9396;
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);

const ch = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=' + port,
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

await call('Runtime.enable');
await sleep(2000);

// Click prologue button
await call('Runtime.evaluate', {
  expression: `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Начать') || b.textContent.includes('Новая') || b.textContent.includes('Пролог'));
    if (btn) btn.click();
  })()`
});

await sleep(1500);

const inspect = await call('Runtime.evaluate', {
  expression: `(() => {
    // Find wheels in scene
    const results = [];
    window.__prologueScene = window.scene;
    // traverse all meshes in scene that have wheel in name
    const meshes = [];
    window.scene.traverse(o => {
      if (o.isMesh && (o.name.includes('Wheel') || (o.parent && o.parent.name.includes('Wheel')))) {
        meshes.push({
          name: o.name,
          parentName: o.parent ? o.parent.name : null,
          matName: o.material ? o.material.name : null,
          matType: o.material ? o.material.type : null,
          matColor: o.material && o.material.color ? o.material.color.getHexString() : null,
          hasMap: !!(o.material && o.material.map)
        });
      }
    });
    return JSON.stringify(meshes);
  })()`
});

console.log('Wheels in scene:', inspect.result.value);

ws.close();
ch.kill();
process.exit(0);
