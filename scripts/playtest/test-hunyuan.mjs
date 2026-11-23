import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const port = 9398;
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

const evalRes = await call('Runtime.evaluate', {
  expression: `(() => {
    // Check if hunyuanTpl exists or inspect all objects in scene
    const names = [];
    document.querySelectorAll('*');
    // Let's inspect the scene objects through Three.js:
    // In main.ts, scene was added with vehicle and prologueVan
    // Let's find any Object3D
    let found = null;
    const canvas = document.querySelector('canvas');
    return 'Canvas found: ' + !!canvas;
  })()`
});

console.log('Result:', evalRes.result.value);

ws.close();
ch.kill();
process.exit(0);
