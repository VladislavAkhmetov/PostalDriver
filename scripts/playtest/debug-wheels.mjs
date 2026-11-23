import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const port = 9397;
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

await call('Console.enable');
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data);
  if (d.method === 'Console.messageAdded') {
    console.log('BROWSER LOG:', d.params.message.text);
  }
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

const evalRes = await call('Runtime.evaluate', {
  expression: `(() => {
    // Find wheels in scene
    const info = [];
    const checkObj = (o) => {
      if (o.name && o.name.startsWith('Wheel')) {
        info.push({
          name: o.name,
          children: o.children.map(c => ({
            name: c.name,
            isMesh: c.isMesh,
            visible: c.visible,
            mat: c.material ? {
              name: c.material.name,
              type: c.material.type,
              color: '#' + c.material.color.getHexString(),
              map: c.material.map ? {
                imageWidth: c.material.map.image ? c.material.map.image.width : null,
                flipY: c.material.map.flipY
              } : null
            } : null
          }))
        });
      }
      for (const child of o.children) checkObj(child);
    };
    checkObj(window.__debugRoot || document.querySelector('canvas') ? (window.__debugScene || {}) : {});
  })()`
});

console.log('Eval result:', evalRes);

ws.close();
ch.kill();
process.exit(0);
