import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4199;
const vite = await createServer({ root: ROOT, server: { port: PORT } });
await vite.listen();

const CHROME_PATH = process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync)
  : '/usr/bin/chromium';

const profileDir = path.join(os.tmpdir(), `uaz-diag-${Date.now()}`);
fs.mkdirSync(profileDir, { recursive: true });
const cdpPort = 9410;

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--mute-audio',
  '--window-size=1280,720',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profileDir}`,
  `http://localhost:${PORT}/`
], { stdio: 'ignore' });

async function cleanup() {
  try { chromeProc.kill(); } catch {}
  try { await vite.close(); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);

let targetPage = null;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
    targetPage = list.find((t) => t.type === 'page');
    if (targetPage) break;
  } catch {}
  await sleep(250);
}

const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let msgId = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    console.log('BROWSER LOG:', text);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    console.log('BROWSER EXC:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
});

const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');

// Wait for __uaz
for (let i = 0; i < 50; i++) {
  const res = await send('Runtime.evaluate', { expression: 'typeof window.__uaz !== "undefined"' });
  if (res.result?.result?.value) break;
  await sleep(300);
}

console.log('--- Calling onNewGame ---');
await send('Runtime.evaluate', { expression: 'window.__uaz.ui.onNewGame()' });
await sleep(1000);

const diag1 = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const st = document.querySelector('.blackout.story');
      const btns = [...document.querySelectorAll('.blackout.story button')].map(b => ({
        text: b.textContent,
        className: b.className,
        box: b.getBoundingClientRect()
      }));
      return {
        storyClass: st?.className,
        hasOut: st?.classList.contains('out'),
        btns
      };
    })()
  `,
  returnByValue: true
});
console.log('Diag 1 (before click):', JSON.stringify(diag1.result?.result?.value, null, 2));

console.log('--- Clicking button 0 ---');
const clickRes = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const b = document.querySelector('.blackout.story button');
      if (b) {
        b.click();
        return 'clicked: ' + b.textContent;
      }
      return 'no button';
    })()
  `,
  returnByValue: true
});
console.log('Click result:', clickRes.result?.result?.value);
await sleep(4000);

const diag2 = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const st = document.querySelector('.blackout.story');
      const bo = document.querySelector('.blackout:not(.story)');
      const ch = document.querySelector('.dialogue.choice');
      const hud = document.querySelector('.hud');
      const u = window.__uaz;
      return {
        storyClass: st?.className,
        boClass: bo?.className,
        boText: bo?.textContent?.slice(0, 100),
        chClass: ch?.className,
        chText: ch?.textContent?.slice(0, 100),
        hudClass: hud?.className,
        morning: u?.morning,
        birth: !!u?.birth,
        boardOpen: u?.ui?.boardOpen,
        prologueDone: u?.profile?.prologue,
        started: u?.started
      };
    })()
  `,
  returnByValue: true
});
console.log('Diag 2 (after click):', JSON.stringify(diag2.result?.result?.value, null, 2));

await cleanup();
