import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

console.log('=== СЮЖЕТНО-ИГРОВОЙ ТЕСТ: АВТОПРОХОЖДЕНИЕ ДНЯ 1 ===\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 4195;
const vite = await createServer({
  root: ROOT,
  server: { port: PORT }
});
await vite.listen();
console.log(`1. Тестовый сервер запущен на http://localhost:${PORT}/`);

const CHROME_PATH = process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync)
  : '/usr/bin/chromium';

const profileDir = path.join(os.tmpdir(), `uaz-pt-${Date.now()}`);
fs.mkdirSync(profileDir, { recursive: true });
const cdpPort = 9380 + Math.floor(Math.random() * 200);

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--mute-audio',
  '--window-size=800,600',
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
const flowLogs = [];

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const args = m.params.args.map((a) => a.value ?? a.description ?? '');
    if (args[0] === 'FLOW') {
      const line = args.slice(1).join(' ');
      flowLogs.push(line);
      console.log('   >>', line.slice(0, 100));
    }
  }
});

const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');

// Inject prelude
const prelude = "window.__P = { policy: 'yes', days: 1, fresh: true, seed: 42 };";
await send('Page.addScriptToEvaluateOnNewDocument', { source: prelude });
await send('Page.navigate', { url: `http://localhost:${PORT}/` });

// Wait for __uaz
let booted = false;
for (let i = 0; i < 50; i++) {
  const res = await send('Runtime.evaluate', { expression: 'typeof window.__uaz !== "undefined"' });
  if (res.result?.result?.value) { booted = true; break; }
  await sleep(300);
}

if (!booted) {
  console.error('❌ Не удалось запустить игру');
  await cleanup();
  process.exit(1);
}
console.log('2. Игра загружена, запуск скрипта автопилота autopilot.js...');

const autopilotCode = fs.readFileSync(path.join(ROOT, 'scripts/playtest/autopilot.js'), 'utf-8');

// Wrap autopilot script in async function
const wrappedScript = `(async () => {\n${autopilotCode}\n})()`;

const runRes = await send('Runtime.evaluate', {
  expression: wrappedScript,
  awaitPromise: true,
  returnByValue: true
});

if (runRes.result?.exceptionDetails) {
  console.error('❌ Исключение в процессе прохождения:', runRes.result.exceptionDetails.exception?.description);
} else {
  const report = runRes.result?.result?.value;
  console.log('\n3. Результаты автопрохождения дня 1:');
  console.log('   Всего реплик произнесено:', report?.lines ?? 0);
  console.log('   Выборов сделано:', report?.choices?.length ?? 0);
  console.log('   Сюжетных страниц прочитано:', report?.pages?.length ?? 0);
  console.log('   Дней завершено:', report?.days?.length ?? 0);
  console.log('   Проблем/зависаний обнаружено:', report?.problems?.length ?? 0);

  if (report?.problems?.length > 0) {
    console.warn('\n⚠️ Список замечаний:');
    for (const p of report.problems) console.warn('   -', p);
  } else {
    console.log('✅ Прохождение дня 1 завершено без единой ошибки и зависания!');
  }
}

await cleanup();
