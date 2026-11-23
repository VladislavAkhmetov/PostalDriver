import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const url = 'http://localhost:3000/';
const port = 9395;
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const profile = `${os.tmpdir()}/playtest-final`;

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

console.log('Waiting for page load...');
await sleep(3500);

// Click start prologue
await call('Runtime.evaluate', {
  expression: `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Начать') || b.textContent.includes('Новая') || b.textContent.includes('Пролог'));
    if (btn) btn.click();
  })()`
});

await sleep(2000);

// Capture screenshot
let res = await call('Page.captureScreenshot', { format: 'png' });
if (res?.data) {
  writeFileSync('final_prologue.png', Buffer.from(res.data, 'base64'));
  console.log('Saved final_prologue.png');
}

ws.close();
ch.kill();
process.exit(0);
