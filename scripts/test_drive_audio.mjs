import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const defaultChrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9393;
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
for (let i = 0; i < 30; i++) {
  const r = await send('Runtime.evaluate', { expression: "typeof window.__uaz !== 'undefined'", returnByValue: true });
  if (r?.result?.value) break;
  await sleep(300);
}

// Start drive by unlocking audio, setting radioOnly = false, and starting vehicle
await send('Runtime.evaluate', {
  expression: `(async () => {
    await window.__uaz.audio.unlock();
    window.__uaz.audio.setRadioOnly(false);
    window.__uaz.vehicle.startEngine(0.1);
    window.__uaz.vehicle.catchStart();
  })()`,
  awaitPromise: true
});

await sleep(400);

// Run 20 simulation steps with full throttle
const testRes = await send('Runtime.evaluate', {
  expression: `(() => {
    const u = window.__uaz;
    const a = u.audio;
    for (let i = 0; i < 20; i++) {
      u.vehicle.throttle = 1.0;
      u.audio.update(0.02, u.vehicle, { rain: 0, wind: 0, village: 0, forest: 0, river: 0, dusk: 0, reception: 1, wet: 0 });
    }
    return {
      engine: u.vehicle.engine,
      rpm: Math.round(u.vehicle.rpm),
      engineGain: a.engineGain?.gain?.value,
      samplesReady: a.samples?.ready,
      samplesOutGain: a.samples?.out?.gain?.value,
      srcActive: !!a.samples?.src,
      playbackRate: a.samples?.src?.playbackRate?.value,
      toneFreq: a.samples?.tone?.frequency?.value,
      hpfFreq: a.samples?.hpf?.frequency?.value
    };
  })()`,
  returnByValue: true
});

console.log('Driving audio diagnostic:');
console.log(testRes?.result?.value);

ch.kill();
process.exit(0);
