// Headless playtest runner (docs/playtest.md): opens the game in Chromium, runs a script in the page
// and prints its result, the page's errors and the script's progress lines («FLOW …») as they come.
//
//   node scripts/playtest/cdp.mjs <script.js> [prelude.js]
//     URL=http://localhost:4180/   the game (a dev build: `vite build --mode development` keeps window.__uaz)
//     CHROME=/usr/bin/chromium      the browser;  PROFILE=/tmp/playtest/profile  its profile (localStorage survives runs)
//
// The script is the body of an async function run once window.__uaz is there; the prelude runs before
// the game's own code on every page load (set localStorage, window.__P…).
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';

const body = readFileSync(process.argv[2], 'utf8');
const pre = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : '';
const url = process.env.URL || 'http://localhost:4180/';

const defaultProfile = process.platform === 'win32' ? `${os.tmpdir()}/playtest/profile` : '/tmp/playtest/profile';
const profile = process.env.PROFILE || defaultProfile;
mkdirSync(profile, { recursive: true });
for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) rmSync(`${profile}/${f}`, { force: true });
const port = 9300 + Math.floor(Math.random() * 500);

const defaultChrome = process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync)
  : '/usr/bin/chromium';

const ch = spawn(process.env.CHROME || defaultChrome, ['--headless=new', '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, '--window-size=480,300', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { ch.kill(); } catch { /* gone */ } });
process.on('SIGTERM', () => process.exit(1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let list;
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch { /* starting */ } await sleep(250); }
const page = list?.find((t) => t.type === 'page');
if (!page) { console.log('no browser page'); process.exit(3); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let closing = false;
ws.addEventListener('close', () => { if (closing) return; console.log('CDP closed'); console.log('LOGS:\n' + logs.join('\n')); process.exit(4); });
let id = 0; const wait = new Map(); const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Inspector.targetCrashed') { console.log('CRASHED'); console.log('LOGS:\n' + logs.join('\n')); process.exit(2); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'log'].includes(m.params.type)) {
    const text = m.params.args.map((a) => a.value ?? a.description).join(' ');
    if (m.params.args[0]?.value === 'FLOW') console.log('>>', text.slice(5, 400));
    else if (m.params.type !== 'log' && !/FBXLoader|skinning weights/.test(text)) logs.push(`[${m.params.type}] ${text.slice(0, 400)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 800));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Inspector.enable');
if (pre) await send('Page.addScriptToEvaluateOnNewDocument', { source: pre });
await send('Page.navigate', { url });
// boot; a texture that failed to load (a flaky dev server) is worth another try
let booted = false;
for (let i = 0; i < 400 && !booted; i++) {
  const r = await send('Runtime.evaluate', { expression: "window.__uaz ? 'ok' : (document.body?.innerText.includes('Не удалось запустить') ? 'fail' : '')", returnByValue: true });
  const v = r.result?.result?.value;
  if (v === 'ok') { booted = true; console.log('BOOTED', i); break; }
  if (v === 'fail') { logs.push('[reload after boot fail]'); await send('Page.navigate', { url: 'about:blank' }); await sleep(1500); await send('Page.navigate', { url }); await sleep(3000); }
  await sleep(400);
}
if (!booted) { console.log('did not boot'); console.log('LOGS:\n' + logs.join('\n')); process.exit(5); }
const r = await send('Runtime.evaluate', { expression: `(async () => { try { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); } catch (e) { return JSON.stringify({ THROW: String(e.stack) }); } })()`, awaitPromise: true, returnByValue: true, timeout: 4 * 3600 * 1000 });
console.log('RESULT:', r.result?.result?.value ?? JSON.stringify(r));
console.log('LOGS:\n' + logs.join('\n'));
// close the browser properly: it writes localStorage to the profile lazily, and a kill loses the
// last day's save (the next run would «continue» from the day before)
closing = true;
try {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const b = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res) => b.addEventListener('open', res));
  b.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
} catch { /* already gone */ }
for (let i = 0; i < 60 && ch.exitCode === null && ch.signalCode === null; i++) await sleep(250);
process.exit(0);
