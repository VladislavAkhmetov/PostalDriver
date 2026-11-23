const fs = require('fs');
const path = require('path');

const wipersDir = path.join(__dirname, '../public/sound-samples/wipers');

// Let's create the comprehensive preview page
const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Эмулятор и настройка звука дворников УАЗа · Вариант 1</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=PT+Mono&family=PT+Sans:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0e1117;
      --card: #161b22;
      --card-accent: #1c222b;
      --border: #28303d;
      --accent-gold: #f59e0b;
      --accent-green: #10b981;
      --accent-blue: #3b82f6;
      --text: #e2e8f0;
      --text-dim: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'PT Sans', system-ui, sans-serif;
      min-height: 100vh;
      padding: 24px 16px 80px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    header {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 22px 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    h1 {
      font-size: 22px;
      margin-bottom: 6px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .desc {
      color: var(--text-dim);
      font-size: 14px;
      line-height: 1.5;
    }
    .hero-card {
      background: linear-gradient(145deg, #18202c 0%, #11161f 100%);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 12px;
      padding: 22px;
      box-shadow: 0 4px 25px rgba(245, 158, 11, 0.08);
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .hero-title h2 {
      font-size: 18px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hero-title p {
      font-size: 13.5px;
      color: var(--text-dim);
      margin-top: 4px;
    }
    .badge-gold {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(245, 158, 11, 0.2);
      color: var(--accent-gold);
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    /* Wiper Visualizer Box */
    .wiper-stage {
      background: #0a0d12;
      border: 1px solid var(--border);
      border-radius: 10px;
      height: 160px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .glass-reflection {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%);
      pointer-events: none;
    }
    .glass-dirt {
      position: absolute;
      bottom: 12px;
      font-family: 'PT Mono', monospace;
      font-size: 11px;
      color: #475569;
      pointer-events: none;
    }
    .wiper-arm {
      position: absolute;
      bottom: 16px;
      width: 4px;
      height: 110px;
      background: #94a3b8;
      border-radius: 2px;
      transform-origin: bottom center;
      transform: rotate(-55deg);
      transition: transform 0.05s linear;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
    }
    .wiper-blade {
      position: absolute;
      top: 0;
      left: -2px;
      width: 8px;
      height: 70px;
      background: #334155;
      border-left: 2px solid #0f172a;
      border-radius: 2px;
    }
    .wiper-status-overlay {
      position: absolute;
      top: 14px;
      right: 16px;
      font-family: 'PT Mono', monospace;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }
    .status-pill {
      background: rgba(0,0,0,0.6);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.08);
      color: #94a3b8;
    }
    .status-pill.bump {
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
    }
    .status-pill.squeak {
      border-color: var(--accent-green);
      color: var(--accent-green);
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
    }

    .controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      background: rgba(0,0,0,0.25);
      padding: 14px 18px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.04);
    }
    .btn-main {
      appearance: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-weight: 700;
      font-size: 14px;
      padding: 10px 22px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #d97706;
      color: #fff;
      transition: all 0.15s;
    }
    .btn-main:hover { background: #b45309; transform: translateY(-1px); }
    .btn-main.running { background: #dc2626; }
    .btn-main.running:hover { background: #b91c1c; }

    .sliders {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .slider-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .slider-group label {
      font-size: 11.5px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
    }
    input[type=range] {
      accent-color: var(--accent-gold);
      width: 140px;
      cursor: pointer;
    }

    .components-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: all 0.15s ease-out;
    }
    .card:hover { border-color: #3b4759; }
    .card h4 {
      font-size: 14px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .card p {
      font-size: 12.5px;
      color: var(--text-dim);
      line-height: 1.4;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .btn-play {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      transition: all 0.12s;
    }
    .btn-play:hover { background: #1d4ed8; }
    .tag {
      font-size: 10.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.07);
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🌧 Настройка звука дворников УАЗа (Вариант 1 + Скрип)</h1>
      <p class="desc">
        Винтажный механический ход 1967 года с мягким комфортным уровнем громкости и периодическим скрипом резины строго в такт взмаха.
      </p>
    </header>

    <!-- Interactive Hero Wiper Simulation -->
    <div class="hero-card">
      <div class="hero-top">
        <div class="hero-title">
          <h2>
            <span>🚗</span> Интерактивная симуляция работы в кабине УАЗа
            <span class="badge-gold">Такт: 1.61 сек</span>
          </h2>
          <p>Дворник идет вверх (0.8 с) → разворот → идет вниз (0.8 с) → глухой стук в упоре. Скрип звучит строго в фазе разгона лезвия.</p>
        </div>
      </div>

      <!-- Wiper visualizer -->
      <div class="wiper-stage">
        <div class="glass-reflection"></div>
        <div class="wiper-arm" id="wiperArm">
          <div class="wiper-blade"></div>
        </div>
        <div class="glass-dirt">ЛОБОВОЕ СТЕКЛО УАЗ-452 · ТЕМП 3.9 РАД/С</div>
        <div class="wiper-status-overlay">
          <div class="status-pill" id="phasePill">Фаза: Покой (0.00)</div>
          <div class="status-pill" id="actionPill">Действие: Выключено</div>
        </div>
      </div>

      <!-- Controls -->
      <div class="controls-row">
        <button class="btn-main" id="btnToggleSim" onclick="toggleSimulation()">
          <span id="btnIcon">▶</span> <span id="btnText">Запустить симуляцию дворников</span>
        </button>

        <div class="sliders">
          <div class="slider-group">
            <label><span>Громкость механики:</span> <span id="volLabel">25%</span></label>
            <input type="range" id="volRange" min="5" max="60" value="25" oninput="updateSettings()">
          </div>
          <div class="slider-group">
            <label><span>Частота скрипа:</span> <span id="squeakFreqLabel">Редко (~25%)</span></label>
            <input type="range" id="squeakFreqRange" min="0" max="60" value="25" oninput="updateSettings()">
          </div>
        </div>
      </div>
    </div>

    <!-- Components Grid -->
    <h3 style="font-size: 15px; color: var(--accent-gold); margin-top: 10px;">
      🔍 Отдельные компоненты звука (из чего собран такт)
    </h3>
    <div class="components-grid">
      <div class="card">
        <h4><span>↗</span> Взмах вверх (Up Stroke)</h4>
        <p>Плавный ход винтажной механики вверх по стеклу без удара. Тихий фоновый шелест.</p>
        <div class="card-footer">
          <span class="tag">0.78 с · ~25% громкость</span>
          <button class="btn-play" onclick="playSingle('upStroke.wav')">▶ Тест</button>
        </div>
      </div>

      <div class="card">
        <h4><span>↘</span> Взмах вниз со стуком (Down Stroke)</h4>
        <p>Обратный ход щетки вниз, переходящий в мягкий глуховатый стук перекладки/упора кулисы.</p>
        <div class="card-footer">
          <span class="tag">0.88 с · ~25% громкость</span>
          <button class="btn-play" onclick="playSingle('downStroke.wav')">▶ Тест</button>
        </div>
      </div>

      <div class="card">
        <h4><span>💥</span> Стук в упоре крупным планом</h4>
        <p>Изолированный аналоговый стук нижней точки для детальной оценки мягкости.</p>
        <div class="card-footer">
          <span class="tag">0.28 с · ~25% громкость</span>
          <button class="btn-play" onclick="playSingle('bottomBump.wav')">▶ Тест</button>
        </div>
      </div>

      <div class="card">
        <h4><span>✨</span> Скрип резины: Вариант A</h4>
        <p>Короткий фактурный скрип резинового лезвия о стекло с каплями.</p>
        <div class="card-footer">
          <span class="tag">0.50 с · ~20% громкость</span>
          <button class="btn-play" onclick="playSingle('squeak1.wav')">▶ Тест</button>
        </div>
      </div>

      <div class="card">
        <h4><span>✨</span> Скрип резины: Вариант B</h4>
        <p>Чуть более глуховатый скрип полусухого прохода резины.</p>
        <div class="card-footer">
          <span class="tag">0.52 с · ~20% громкость</span>
          <button class="btn-play" onclick="playSingle('squeak2.wav')">▶ Тест</button>
        </div>
      </div>

      <div class="card">
        <h4><span>✨</span> Скрип резины: Вариант C</h4>
        <p>Тонкий, легкий призвук скольжения по стеклу.</p>
        <div class="card-footer">
          <span class="tag">0.52 с · ~20% громкость</span>
          <button class="btn-play" onclick="playSingle('squeak3.wav')">▶ Тест</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let isRunning = false;
    let animFrame = null;
    let phase = 0;
    let prevPhase = 0;
    let wiperDir = 1;
    let strokeCount = 0;

    let audioCtx = null;
    const buffers = {};
    const sampleFiles = ['upStroke.wav', 'downStroke.wav', 'bottomBump.wav', 'squeak1.wav', 'squeak2.wav', 'squeak3.wav'];

    function getAudioCtx() {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }

    async function loadBuffers() {
      const ctx = getAudioCtx();
      for (const f of sampleFiles) {
        if (!buffers[f]) {
          try {
            const resp = await fetch('sound-samples/wipers/' + f);
            const ab = await resp.arrayBuffer();
            buffers[f] = await ctx.decodeAudioData(ab);
          } catch(e) {
            console.error('Failed to load', f, e);
          }
        }
      }
    }

    function playBuffer(buf, volume = 0.25, pitch = 1.0) {
      if (!buf) return;
      const ctx = getAudioCtx();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    }

    function playSingle(name) {
      loadBuffers().then(() => {
        const vol = parseFloat(document.getElementById('volRange').value) / 100;
        playBuffer(buffers[name], vol, 1.0);
      });
    }

    function updateSettings() {
      const vol = document.getElementById('volRange').value;
      document.getElementById('volLabel').textContent = vol + '%';
      const squeak = document.getElementById('squeakFreqRange').value;
      document.getElementById('squeakFreqLabel').textContent = squeak == 0 ? 'Выключен' : (squeak <= 20 ? 'Очень редко' : (squeak <= 35 ? 'Редко (~' + squeak + '%)' : 'Часто (~' + squeak + '%)'));
    }

    function toggleSimulation() {
      if (isRunning) {
        stopSimulation();
      } else {
        startSimulation();
      }
    }

    async function startSimulation() {
      await loadBuffers();
      isRunning = true;
      document.getElementById('btnToggleSim').className = 'btn-main running';
      document.getElementById('btnIcon').textContent = '⏹';
      document.getElementById('btnText').textContent = 'Остановить дворники';
      phase = 0;
      prevPhase = 0;
      wiperDir = 1;
      strokeCount = 0;

      // Trigger first stroke
      onStroke(1);

      let lastTime = performance.now();
      function loop(now) {
        if (!isRunning) return;
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        const before = phase;
        phase += dt * 3.9; // exact game frequency (3.9 rad/s)
        const angle = 1.85 * (0.5 - 0.5 * Math.cos(phase)); // 0 to 1.85 rad

        // Angle mapping to degrees for visual arm: -55deg to +50deg
        const deg = -55 + (angle / 1.85) * 105;
        document.getElementById('wiperArm').style.transform = 'rotate(' + deg.toFixed(1) + 'deg)';

        const dir = Math.sign(Math.sin(phase));
        if (dir !== 0 && dir !== wiperDir) {
          wiperDir = dir;
          onStroke(wiperDir);
        }

        const normalizedPhase = (phase % (Math.PI * 2)).toFixed(2);
        document.getElementById('phasePill').textContent = 'Фаза: ' + normalizedPhase + ' rad';

        animFrame = requestAnimationFrame(loop);
      }
      animFrame = requestAnimationFrame(loop);
    }

    function stopSimulation() {
      isRunning = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      document.getElementById('btnToggleSim').className = 'btn-main';
      document.getElementById('btnIcon').textContent = '▶';
      document.getElementById('btnText').textContent = 'Запустить симуляцию дворников';
      document.getElementById('wiperArm').style.transform = 'rotate(-55deg)';
      document.getElementById('phasePill').textContent = 'Фаза: Покой (0.00)';
      document.getElementById('actionPill').className = 'status-pill';
      document.getElementById('actionPill').textContent = 'Действие: Выключено';
    }

    function onStroke(dir) {
      strokeCount++;
      const vol = parseFloat(document.getElementById('volRange').value) / 100;
      const squeakChance = parseFloat(document.getElementById('squeakFreqRange').value) / 100;

      const act = document.getElementById('actionPill');

      if (dir > 0) {
        // Upward stroke
        playBuffer(buffers['upStroke.wav'], vol, 0.98 + Math.random() * 0.04);
        act.className = 'status-pill';
        act.textContent = 'Взмах вверх ↗';
      } else {
        // Downward stroke (ends in bottom bump!)
        playBuffer(buffers['downStroke.wav'], vol, 0.98 + Math.random() * 0.04);
        act.className = 'status-pill bump';
        act.textContent = 'Взмах вниз ↘ + СТУК В УПОР';
      }

      // Check occasional squeak (in tempo during the sweep!)
      if (Math.random() < squeakChance) {
        const squeakList = ['squeak1.wav', 'squeak2.wav', 'squeak3.wav'];
        const chosen = squeakList[Math.floor(Math.random() * squeakList.length)];
        // Play squeak with slight delay (~0.12s) to hit the sweet spot of maximum sweep speed!
        setTimeout(() => {
          if (!isRunning) return;
          playBuffer(buffers[chosen], vol * 0.85, 0.96 + Math.random() * 0.08);
          act.className = 'status-pill squeak';
          act.textContent = 'Скрип резины ✨ (' + (dir > 0 ? 'вверх' : 'вниз') + ')';
        }, 120);
      }
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '../public/wiper-preview.html'), html);
console.log('Successfully updated public/wiper-preview.html with interactive simulation!');
