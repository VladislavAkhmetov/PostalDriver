import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const defaultChrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9394;
const ch = spawn(defaultChrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, 'http://localhost:3000/horn-preview.html'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

let list;
for (let i = 0; i < 30; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    if (list?.find(t => t.type === 'page')) break;
  } catch {}
  await sleep(150);
}
const page = list?.find(t => t.type === 'page');
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

const files = readdirSync('temp_gears').filter(f => f.endsWith('.mp3'));

const evalRes = await send('Runtime.evaluate', {
  expression: `(async () => {
    const files = ${JSON.stringify(files)};
    const res = {};
    for (const f of files) {
      try {
        const buf = await window.getBuf('/sound-samples/' + f);
        res[f] = { duration: buf.duration.toFixed(2), channels: buf.numberOfChannels };
      } catch(e) {
        res[f] = { error: e.message };
      }
    }
    return JSON.stringify(res, null, 2);
  })()`,
  awaitPromise: true,
  returnByValue: true
});

console.log(evalRes?.result?.value);
ch.kill();
process.exit(0);
