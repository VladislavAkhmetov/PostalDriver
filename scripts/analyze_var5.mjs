import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const defaultChrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9395;
const ch = spawn(defaultChrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, 'http://localhost:3000/shift-preview.html'], { stdio: 'ignore' });

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

const evalRes = await send('Runtime.evaluate', {
  expression: `(async () => {
    const c = new AudioContext();
    const res = await fetch('/sound-samples/629324_13885154-lq.mp3');
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    const data = buf.getChannelData(0);
    let peak = 0;
    let firstNonZero = -1;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
      if (abs > 0.05 && firstNonZero === -1) firstNonZero = i;
    }
    return JSON.stringify({
      duration: buf.duration,
      peak,
      firstClickMs: (firstNonZero / buf.sampleRate * 1000).toFixed(1)
    });
  })()`,
  awaitPromise: true,
  returnByValue: true
});

console.log('Variant 5 analysis:');
console.log(evalRes?.result?.value);
ch.kill();
process.exit(0);
