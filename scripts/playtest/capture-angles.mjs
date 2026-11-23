import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const url = 'http://localhost:3000/';
const port = 9392;
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const profile = `${os.tmpdir()}/playtest-angles-test`;

const ch = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${port}`,
  '--window-size=1280,720',
  `--user-data-dir=${profile}`,
  url
], { stdio: 'ignore' });

process.on('exit', () => { try { ch.kill(); } catch {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let list;
for (let i = 0; i < 40; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    if (list.find((t) => t.type === 'page')) break;
  } catch {}
  await sleep(250);
}
const page = list?.find((t) => t.type === 'page');
if (!page) { console.error('No page found'); process.exit(1); }

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

console.log('Waiting for load...');
await sleep(4000);

// Click prologue button
await call('Runtime.evaluate', {
  expression: `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Начать') || b.textContent.includes('Новая') || b.textContent.includes('Пролог'));
    if (btn) btn.click();
  })()`
});

await sleep(2000);

// 1. Capture Rear 3/4 (default prologue angle)
let res1 = await call('Page.captureScreenshot', { format: 'png' });
if (res1?.data) {
  writeFileSync('angle_rear.png', Buffer.from(res1.data, 'base64'));
  console.log('Saved angle_rear.png');
}

// 2. Hide story text box temporarily to see the full vehicle
await call('Runtime.evaluate', {
  expression: `(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    for (const d of divs) {
      if (d.textContent.includes('СЕЛЬСКАЯ ПОЧТА') || d.textContent.includes('Тимуру двадцать')) {
        d.style.opacity = '0.15';
      }
    }
  })()`
});

let res2 = await call('Page.captureScreenshot', { format: 'png' });
if (res2?.data) {
  writeFileSync('angle_rear_clean.png', Buffer.from(res2.data, 'base64'));
  console.log('Saved angle_rear_clean.png');
}

ws.close();
ch.kill();
process.exit(0);
