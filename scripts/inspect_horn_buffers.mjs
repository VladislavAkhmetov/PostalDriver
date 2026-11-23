import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const defaultChrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9388;
const ch = spawn(defaultChrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, 'http://localhost:3000/horn-preview.html'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

let list;
for (let i = 0; i < 30; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    if (list?.find(t => t.type === 'page')) break;
  } catch {}
  await sleep(200);
}
const page = list?.find(t => t.type === 'page');
if (!page) { console.log('no page'); ch.kill(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));

let id = 1;
function send(method, params = {}) {
  return new Promise(resolve => {
    const curId = id++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });
}

const evalRes = await send('Runtime.evaluate', {
  expression: `(async () => {
    const res = [];
    for (const h of window.horns) {
      try {
        const buf = await window.getBuf(h.url);
        res.push({ id: h.id, name: h.name, duration: buf.duration, sampleRate: buf.sampleRate, channels: buf.numberOfChannels });
      } catch(e) {
        res.push({ id: h.id, error: e.message });
      }
    }
    return JSON.stringify(res);
  })()`,
  awaitPromise: true,
  returnByValue: true
});

console.log('Evaluated horn buffers:');
console.log(evalRes?.result?.value);

ch.kill();
process.exit(0);
