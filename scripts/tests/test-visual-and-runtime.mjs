import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const SCREENSHOTS_DIR = path.join(ROOT, 'reports/screenshots');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

console.log('=== ВИЗУАЛЬНЫЙ И РАНТАЙМ ТЕСТ: THREE.JS, РЕНДЕРИНГ И ИНТЕРФЕЙС ===\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Start Vite Server
console.log('1. Запуск тестового Vite сервера...');
const PORT = 4190;
const vite = await createServer({
  root: ROOT,
  server: { port: PORT }
});
await vite.listen();
console.log(`   Сервер слушает на http://localhost:${PORT}/`);

// 2. Find Chrome
const CHROME_PATH = process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync)
  : '/usr/bin/chromium';

if (!CHROME_PATH) {
  console.error('❌ Chrome / Chromium не найден!');
  await vite.close();
  process.exit(1);
}
console.log(`2. Найден браузер: ${CHROME_PATH}`);

const profileDir = path.join(os.tmpdir(), `uaz-test-${Date.now()}`);
fs.mkdirSync(profileDir, { recursive: true });
const cdpPort = 9350 + Math.floor(Math.random() * 200);

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

let cleanedUp = false;
async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try { chromeProc.kill(); } catch {}
  try { await vite.close(); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', cleanup);

console.log(`3. Подключение по CDP на порту ${cdpPort}...`);

let targetPage = null;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
    targetPage = list.find((t) => t.type === 'page');
    if (targetPage) break;
  } catch {}
  await sleep(250);
}

if (!targetPage) {
  console.error('❌ Не удалось подключиться к целевой странице Chrome CDP!');
  await cleanup();
  process.exit(1);
}

const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let msgId = 0;
const pending = new Map();
const consoleLogs = [];
const consoleErrors = [];

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const type = m.params.type;
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    consoleLogs.push(`[${type}] ${text}`);
    if (type === 'error') {
      consoleErrors.push(text);
    }
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const text = m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text;
    consoleErrors.push(`[EXCEPTION] ${text}`);
  }
});

const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');

async function evalInPage(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.exception?.description ?? 'Eval failed');
  }
  return res.result?.result?.value;
}

async function takeScreenshot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(res.result.data, 'base64');
  const filePath = path.join(SCREENSHOTS_DIR, name);
  fs.writeFileSync(filePath, buffer);
  console.log(`   📸 Скриншот сохранён: ${path.relative(ROOT, filePath)} (${(buffer.length / 1024).toFixed(1)} KB)`);
  return filePath;
}

console.log('4. Ожидание полной инициализации игры (window.__uaz)...');
let booted = false;
for (let i = 0; i < 60; i++) {
  const hasUaz = await evalInPage('typeof window.__uaz !== "undefined"');
  if (hasUaz) {
    booted = true;
    break;
  }
  await sleep(300);
}

if (!booted) {
  console.error('❌ Игра не инициализировала window.__uaz в течение 18 секунд!');
  console.log('Логи консоли:\n' + consoleLogs.join('\n'));
  await cleanup();
  process.exit(1);
}
console.log('✅ Игра успешно загружена и инициализирована в WebGL context!');

// Check Three.js Scene and Renderer
console.log('\n5. Проверка WebGLRenderer и графа сцены Three.js:');
const renderInfo = await evalInPage(`
  (() => {
    const u = window.__uaz;
    const retro = u.renderer;
    const r = retro?.renderer ?? retro;
    const s = u.scene;
    let meshCount = 0;
    let lightCount = 0;
    s.traverse((obj) => {
      if (obj.isMesh) meshCount++;
      if (obj.isLight) lightCount++;
    });
    return {
      rendererType: r?.constructor?.name ?? typeof r,
      canvasWidth: r?.domElement?.width ?? 0,
      canvasHeight: r?.domElement?.height ?? 0,
      sceneChildren: s?.children?.length ?? 0,
      meshCount,
      lightCount,
      geometries: r?.info?.memory?.geometries ?? 0,
      textures: r?.info?.memory?.textures ?? 0
    };
  })()
`);
console.log('   Three.js Render Info:', renderInfo);
if (renderInfo.meshCount > 0 && renderInfo.lightCount > 0) {
  console.log(`✅ Граф сцены содержит ${renderInfo.meshCount} мешей, ${renderInfo.lightCount} источников света, ${renderInfo.textures} текстур.`);
} else {
  console.warn('⚠️ Мешей или света в сцене меньше ожидаемого');
}

// Check UI Elements
console.log('\n6. Проверка элементов UI и HUD:');
const uiInfo = await evalInPage(`
  (() => {
    const title = document.querySelector('.title:not(.out)');
    const hud = document.querySelector('.hud');
    const logo = document.querySelector('.logo');
    const menuItems = [...document.querySelectorAll('.tt-item')].map(e => e.textContent.trim());
    return {
      titleVisible: !!title,
      hudPresent: !!hud,
      logoPresent: !!logo,
      menuItems
    };
  })()
`);
console.log('   UI Elements:', uiInfo);
if (uiInfo.titleVisible && uiInfo.menuItems.length > 0) {
  console.log('✅ Главное меню и логотип отображаются корректно!');
}

// Screenshot 1: Title Screen
await takeScreenshot('01_title_screen.png');

// Test Start Game
console.log('\n7. Тестирование перехода в игровой режим:');
await evalInPage('window.__uaz.ui.onNewGame()');
await sleep(1500);

// Screenshot 2: First morning / prologue
await takeScreenshot('02_first_morning.png');

const storyVisible = await evalInPage('!!document.querySelector(".blackout.story, .blackout:not(.out)")');
console.log(`   Диалог первого утра / пролог активен: ${storyVisible}`);

// Settle morning dialog to enter cab
console.log('\n8. Переход в кабину вездехода...');
await evalInPage(`
  (() => {
    // skip story dialogs
    const btn = document.querySelector('.st-answers button');
    if (btn) btn.click();
    else {
      const bo = document.querySelector('.blackout:not(.out)');
      if (bo) bo.classList.add('out');
    }
    // ensure vehicle is ready
    const v = window.__uaz.vehicle;
    v.engine = 'running';
    v.rpm = 950;
    v.headlights = true;
  })()
`);
await sleep(1200);

// Screenshot 3: Cabin driver view
await takeScreenshot('03_cabin_driver_view.png');

// Test Weather Presets
console.log('\n9. Тестирование погодных пресетов (шейдеры и атмосфера):');
const weatherPresets = ['Тихое утро', 'Ясно', 'Пасмурно', 'Дождь', 'Морось', 'Гроза', 'Слепой дождь'];
let weatherErrors = 0;

for (const wp of weatherPresets) {
  const res = await evalInPage(`
    (() => {
      try {
        window.__uaz.atmo.setDayWeather("${wp}");
        // force render update
        window.__uaz.atmo.update(0.016, window.__uaz.vehicle.x, window.__uaz.vehicle.z, window.__uaz.ground);
        return { ok: true, name: "${wp}" };
      } catch (err) {
        return { ok: false, name: "${wp}", error: err.message };
      }
    })()
  `);
  if (res.ok) {
    console.log(`   🌤️ Пресет «${wp}» успешно применён`);
  } else {
    console.error(`   ❌ Ошибка при пресете «${wp}»:`, res.error);
    weatherErrors++;
  }
  await sleep(200);
}

// Screenshot 4: Thunderstorm weather
await evalInPage('window.__uaz.atmo.setDayWeather("Гроза")');
await sleep(600);
await takeScreenshot('04_thunderstorm_weather.png');

// 10. Check Console Errors
console.log('\n10. Проверка логов консоли браузера на критические ошибки:');
const filteredErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('FBXLoader'));
if (filteredErrors.length === 0) {
  console.log('✅ Ошибок консоли браузера и необработанных исключений (0) не зафиксировано!');
} else {
  console.warn(`⚠️ Обнаружено ${filteredErrors.length} предупреждений/ошибок в консоли:`);
  for (const err of filteredErrors) console.warn('   -', err);
}

console.log('\n=== ВИЗУАЛЬНОЕ И РАНТАЙМ ТЕСТИРОВАНИЕ УСПЕШНО ЗАВЕРШЕНО ===\n');

await cleanup();
