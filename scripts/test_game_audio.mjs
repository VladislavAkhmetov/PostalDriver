import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const defaultChrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9391;
const ch = spawn(defaultChrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, 'http://localhost:3000/'], { stdio: 'ignore' });

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

// Wait for __uaz
let ready = false;
for (let i = 0; i < 30; i++) {
  const r = await send('Runtime.evaluate', { expression: "typeof window.__uaz !== 'undefined'", returnByValue: true });
  if (r?.result?.value) { ready = true; break; }
  await sleep(300);
}

console.log('__uaz available:', ready);

const state = await send('Runtime.evaluate', {
  expression: `(() => {
    const u = window.__uaz;
    if (!u) return { error: 'no uaz' };
    const a = u.audio;
    return {
      audioCtxState: a.ctx?.state,
      samplesReady: a.samples?.ready,
      hornBuffer: !!a.hornBuffer,
      engineState: u.vehicle.engine
    };
  })()`,
  returnByValue: true
});

console.log('Audio state at startup:', state?.result?.value);

// Trigger gesture to unlock audio
await send('Runtime.evaluate', {
  expression: `window.__uaz.audio.gesture();`
});
await sleep(500);

const state2 = await send('Runtime.evaluate', {
  expression: `(() => {
    const a = window.__uaz.audio;
    return {
      audioCtxState: a.ctx?.state,
      samplesReady: a.samples?.ready,
      hornBuffer: !!a.hornBuffer
    };
  })()`,
  returnByValue: true
});

console.log('Audio state after gesture:', state2?.result?.value);

ch.kill();
process.exit(0);
