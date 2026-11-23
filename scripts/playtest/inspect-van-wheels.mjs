import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const port = 9399;
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

// Inspect materials of prologueVan
const res = await call('Runtime.evaluate', {
  expression: `(() => {
    const v = window.__prologueVan;
    if (!v) return 'No prologueVan';
    const report = [];
    v.group.traverse(obj => {
      if (obj.name && (obj.name.includes('Wheel') || obj.name.includes('Paint') || obj.isMesh)) {
        report.push({
          name: obj.name,
          parent: obj.parent ? obj.parent.name : null,
          type: obj.type,
          isMesh: obj.isMesh,
          pos: [obj.position.x, obj.position.y, obj.position.z],
          rot: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
          scale: [obj.scale.x, obj.scale.y, obj.scale.z],
          mat: obj.material ? {
            name: obj.material.name,
            type: obj.material.type,
            color: obj.material.color ? obj.material.color.getHexString() : null,
            roughness: obj.material.roughness,
            metalness: obj.material.metalness,
            hasMap: !!obj.material.map,
            mapImage: obj.material.map && obj.material.map.image ? [obj.material.map.image.width, obj.material.map.image.height] : null
          } : null
        });
      }
    });
    return report;
  })()`,
  returnByValue: true
});

console.log('Report:\n', JSON.stringify(res.result.value, null, 2));

ws.close();
ch.kill();
process.exit(0);
