const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/amazi/.gemini/antigravity/brain/c9ad1dc4-6e99-4c4e-a539-e9f96f3488bf';
const samplesDir = path.join(__dirname, '../public/sound-samples/wipers');

const sampleFiles = ['upStroke.wav', 'downStroke.wav', 'bottomBump.wav', 'squeak1.wav', 'squeak2.wav', 'squeak3.wav'];
const b64Data = {};
for (const f of sampleFiles) {
  const buf = fs.readFileSync(path.join(samplesDir, f));
  b64Data[f] = 'data:audio/wav;base64,' + buf.toString('base64');
}

const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    @keyframes pulse-ring {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }
    .playing-pulse {
      animation: pulse-ring 1.2s infinite ease-in-out;
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] p-3 select-none font-sans text-xs">
  <div class="max-w-2xl mx-auto space-y-3">
    <!-- Header banner -->
    <div class="rounded-xl border border-amber-500/40 bg-[var(--card)] p-4 shadow-sm">
      <div class="flex items-center justify-between gap-3 mb-1">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          <span>🌧</span> Симуляция: Винтаж 1967 (негромко) + редкий скрип в такт
        </h2>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">Такт: 1.61 с</span>
      </div>
      <p class="text-xs text-[var(--muted-foreground)] leading-relaxed">
        Точный игровой такт: ход вверх (0.8 с) → разворот → ход вниз (0.8 с) с глухим мягким стуком в упоре. Скрип звучит строго в фазе разгона лезвия.
      </p>

      <!-- Visual Wiper Box -->
      <div class="mt-3 relative h-28 rounded-lg bg-black/40 border border-[var(--border)] overflow-hidden flex items-center justify-center">
        <!-- Reflection -->
        <div class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent pointer-events-none"></div>

        <!-- Wiper Arm -->
        <div id="wiperArm" class="absolute bottom-2 w-1 h-20 bg-slate-300 rounded-sm origin-bottom transition-transform duration-75 shadow-lg" style="transform: rotate(-55deg);">
          <div class="absolute top-0 -left-0.5 w-2 h-14 bg-slate-800 border-l border-slate-950 rounded-sm"></div>
        </div>

        <!-- Status overlay -->
        <div class="absolute top-2 right-3 font-mono text-[11px] flex flex-col items-end gap-1">
          <span id="phasePill" class="px-2 py-0.5 rounded bg-black/60 border border-white/10 text-slate-400">Фаза: 0.00 рад</span>
          <span id="actionPill" class="px-2 py-0.5 rounded bg-black/60 border border-white/10 text-slate-400">Покой</span>
        </div>

        <div class="absolute bottom-2 left-3 font-mono text-[10px] text-slate-600">ЛОБОВОЕ СТЕКЛО УАЗ-452</div>
      </div>

      <!-- Controls Row -->
      <div class="mt-3 flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-[var(--border)]/40">
        <button id="btnToggleSim" onclick="toggleSim()" class="px-4 py-2 rounded-lg font-bold text-xs text-white bg-amber-600 hover:bg-amber-500 transition-all flex items-center gap-2 shadow-sm">
          <span id="btnIcon">▶</span> <span id="btnText">Запустить симуляцию дворников</span>
        </button>

        <div class="flex items-center gap-4 text-[11px]">
          <div class="flex flex-col gap-0.5">
            <span class="text-slate-400">Громкость: <b id="volLabel" class="text-white">25%</b></span>
            <input type="range" id="volRange" min="5" max="60" value="25" oninput="updateSettings()" class="w-24 accent-amber-500 cursor-pointer">
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="text-slate-400">Частота скрипа: <b id="squeakLabel" class="text-white">~25% (редко)</b></span>
            <input type="range" id="squeakRange" min="0" max="60" value="25" oninput="updateSettings()" class="w-24 accent-amber-500 cursor-pointer">
          </div>
        </div>
      </div>
    </div>

    <!-- Components List -->
    <div class="grid grid-cols-2 gap-2 text-xs">
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5 flex items-center justify-between">
        <div>
          <div class="font-bold text-white text-[11px]">↗ Взмах вверх (Up)</div>
          <div class="text-[10px] text-[var(--muted-foreground)]">Тихий ход механики (0.78 с)</div>
        </div>
        <button onclick="playOne('upStroke.wav')" class="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 font-bold text-[10px] text-white">▶ Тест</button>
      </div>

      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5 flex items-center justify-between">
        <div>
          <div class="font-bold text-white text-[11px]">↘ Вниз + стук в упоре</div>
          <div class="text-[10px] text-[var(--muted-foreground)]">Ход со стуком внизу (0.88 с)</div>
        </div>
        <button onclick="playOne('downStroke.wav')" class="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 font-bold text-[10px] text-white">▶ Тест</button>
      </div>

      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5 flex items-center justify-between">
        <div>
          <div class="font-bold text-white text-[11px]">💥 Стук упора (Bump)</div>
          <div class="text-[10px] text-[var(--muted-foreground)]">Мягкий аналоговый стук (0.28 с)</div>
        </div>
        <button onclick="playOne('bottomBump.wav')" class="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 font-bold text-[10px] text-white">▶ Тест</button>
      </div>

      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5 flex items-center justify-between">
        <div>
          <div class="font-bold text-white text-[11px]">✨ Резиновый скрип</div>
          <div class="text-[10px] text-[var(--muted-foreground)]">Фактурная резина (0.50 с)</div>
        </div>
        <button onclick="playOne('squeak1.wav')" class="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 font-bold text-[10px] text-white">▶ Тест</button>
      </div>
    </div>
  </div>

  <script>
    const sampleUris = ${JSON.stringify(b64Data)};
    let isRunning = false;
    let animFrame = null;
    let phase = 0;
    let wiperDir = 1;

    let audioCtx = null;
    const buffers = {};

    function getCtx() {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }

    async function loadBuffers() {
      const ctx = getCtx();
      for (const [name, uri] of Object.entries(sampleUris)) {
        if (!buffers[name]) {
          const resp = await fetch(uri);
          const ab = await resp.arrayBuffer();
          buffers[name] = await ctx.decodeAudioData(ab);
        }
      }
    }

    function playSound(buf, vol = 0.25, pitch = 1.0) {
      if (!buf) return;
      const ctx = getCtx();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    }

    function playOne(name) {
      loadBuffers().then(() => {
        const vol = parseFloat(document.getElementById('volRange').value) / 100;
        playSound(buffers[name], vol, 1.0);
      });
    }

    function updateSettings() {
      const vol = document.getElementById('volRange').value;
      document.getElementById('volLabel').textContent = vol + '%';
      const sq = document.getElementById('squeakRange').value;
      document.getElementById('squeakLabel').textContent = sq == 0 ? 'Выключен' : (sq <= 20 ? 'Очень редко' : (sq <= 35 ? 'Редко (~' + sq + '%)' : 'Часто (~' + sq + '%)'));
    }

    function toggleSim() {
      if (isRunning) stopSim();
      else startSim();
    }

    async function startSim() {
      await loadBuffers();
      isRunning = true;
      document.getElementById('btnToggleSim').className = 'px-4 py-2 rounded-lg font-bold text-xs text-white bg-red-600 hover:bg-red-500 transition-all flex items-center gap-2 shadow-sm';
      document.getElementById('btnIcon').textContent = '⏹';
      document.getElementById('btnText').textContent = 'Остановить дворники';
      phase = 0;
      wiperDir = 1;

      onStroke(1);

      let last = performance.now();
      function loop(now) {
        if (!isRunning) return;
        const dt = (now - last) / 1000;
        last = now;

        phase += dt * 3.9;
        const angle = 1.85 * (0.5 - 0.5 * Math.cos(phase));
        const deg = -55 + (angle / 1.85) * 105;
        document.getElementById('wiperArm').style.transform = 'rotate(' + deg.toFixed(1) + 'deg)';

        const dir = Math.sign(Math.sin(phase));
        if (dir !== 0 && dir !== wiperDir) {
          wiperDir = dir;
          onStroke(wiperDir);
        }

        document.getElementById('phasePill').textContent = 'Фаза: ' + (phase % (Math.PI * 2)).toFixed(2) + ' рад';
        animFrame = requestAnimationFrame(loop);
      }
      animFrame = requestAnimationFrame(loop);
    }

    function stopSim() {
      isRunning = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      document.getElementById('btnToggleSim').className = 'px-4 py-2 rounded-lg font-bold text-xs text-white bg-amber-600 hover:bg-amber-500 transition-all flex items-center gap-2 shadow-sm';
      document.getElementById('btnIcon').textContent = '▶';
      document.getElementById('btnText').textContent = 'Запустить симуляцию дворников';
      document.getElementById('wiperArm').style.transform = 'rotate(-55deg)';
      document.getElementById('phasePill').textContent = 'Фаза: 0.00 рад';
      document.getElementById('actionPill').textContent = 'Покой';
      document.getElementById('actionPill').className = 'px-2 py-0.5 rounded bg-black/60 border border-white/10 text-slate-400';
    }

    function onStroke(dir) {
      const vol = parseFloat(document.getElementById('volRange').value) / 100;
      const sqChance = parseFloat(document.getElementById('squeakRange').value) / 100;
      const act = document.getElementById('actionPill');

      if (dir > 0) {
        playSound(buffers['upStroke.wav'], vol, 0.98 + Math.random() * 0.04);
        act.textContent = 'Взмах вверх ↗';
        act.className = 'px-2 py-0.5 rounded bg-black/60 border border-sky-400/50 text-sky-300';
      } else {
        playSound(buffers['downStroke.wav'], vol, 0.98 + Math.random() * 0.04);
        act.textContent = 'Взмах вниз ↘ + СТУК В УПОР';
        act.className = 'px-2 py-0.5 rounded bg-black/60 border border-amber-400/50 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]';
      }

      if (Math.random() < sqChance) {
        const sqs = ['squeak1.wav', 'squeak2.wav', 'squeak3.wav'];
        const chosen = sqs[Math.floor(Math.random() * sqs.length)];
        setTimeout(() => {
          if (!isRunning) return;
          playSound(buffers[chosen], vol * 0.85, 0.96 + Math.random() * 0.08);
          act.textContent = 'Скрип резины ✨ (' + (dir > 0 ? 'вверх' : 'вниз') + ')';
          act.className = 'px-2 py-0.5 rounded bg-black/60 border border-emerald-400/50 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
        }, 120);
      }
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(brainDir, 'wiper-player.html'), htmlContent);
console.log('Successfully updated artifact wiper-player.html with interactive simulation!');
