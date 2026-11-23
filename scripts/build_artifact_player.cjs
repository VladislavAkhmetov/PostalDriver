const fs = require('fs');
const path = require('path');

const samples = JSON.parse(fs.readFileSync('temp_b64_creaks.json', 'utf8'));
const artifactPath = path.join('C:\\Users\\amazi\\.gemini\\antigravity\\brain\\a161babd-b42f-4bec-a66d-a7bfbfb3f753', 'creaks-player.html');

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3 select-none">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl p-5 shadow-lg max-w-2xl mx-auto flex flex-col gap-4">
    
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[var(--border)] pb-3">
      <div>
        <h2 class="text-base font-bold flex items-center gap-2">
          <span>🛞</span> Звуки скрипа автомобиля для езды
        </h2>
        <p class="text-xs text-[var(--muted-foreground)] mt-0.5">
          Однородные наборы из единых сессий записи. Разные движения кузова на кочках.
        </p>
      </div>
      <button id="simBtn" onclick="toggleSimulation()" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition active:scale-95 flex items-center gap-1.5 shadow-sm">
        <span>🎲</span> <span id="simBtnText">Тест-драйв на кочках</span>
      </button>
    </div>

    <!-- Group Tabs -->
    <div class="flex gap-1.5 bg-[var(--secondary)] p-1 rounded-xl overflow-x-auto text-xs">
      <button onclick="selectGroup(0)" id="tab-0" class="tab-btn px-3 py-1.5 rounded-lg font-medium transition bg-[var(--card)] shadow-sm text-[var(--foreground)]">
        🛞 Подвеска и рессоры
      </button>
      <button onclick="selectGroup(1)" id="tab-1" class="tab-btn px-3 py-1.5 rounded-lg font-medium transition text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        🏛 ГАЗ-М20 «Победа» 1957
      </button>
      <button onclick="selectGroup(2)" id="tab-2" class="tab-btn px-3 py-1.5 rounded-lg font-medium transition text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        🪑 Сиденье водителя
      </button>
      <button onclick="selectGroup(3)" id="tab-3" class="tab-btn px-3 py-1.5 rounded-lg font-medium transition text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        ⚙️ Скрежет сухих рессор
      </button>
    </div>

    <!-- Active Group Info & Status -->
    <div class="bg-[var(--secondary)]/50 border border-[var(--border)] rounded-xl p-3 flex items-center justify-between">
      <div class="flex flex-col gap-0.5">
        <span id="groupDescTitle" class="text-xs font-semibold text-[var(--foreground)]">Реальная подвеска авто</span>
        <span id="simStatus" class="text-xs text-[var(--muted-foreground)] font-mono">Готов к прослушиванию</span>
      </div>
      <span id="groupTag" class="text-xs px-2 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono font-medium">
        Freesound #86234
      </span>
    </div>

    <!-- Slices list -->
    <div id="slicesContainer" class="grid grid-cols-1 sm:grid-cols-2 gap-2"></div>

    <!-- Footer hint -->
    <div class="text-xs text-[var(--muted-foreground)] text-center pt-1 border-t border-[var(--border)]">
      💡 В игре звуки запускаются случайным образом с легким питч-джиттером (±4%) для полной естественности.
    </div>

  </div>

  <script>
    const samples = ` + JSON.stringify(samples) + `;
    
    const groups = [
      {
        name: 'Подвеска и рессоры (Car Suspension)',
        desc: 'Скрип сайлентблоков, амортизаторов и рессор на неровностях дороги',
        tag: 'Freesound #86234',
        ids: ['susp_1', 'susp_2', 'susp_3', 'susp_4', 'susp_5']
      },
      {
        name: 'ГАЗ-М20 «Победа» 1957 (Архив YleArkisto)',
        desc: 'Аутентичный советский тяжелый металл кузова и рычагов салона',
        tag: 'YleArkisto #316886',
        ids: ['pob_1', 'pob_2', 'pob_3', 'pob_4']
      },
      {
        name: 'Пружины водительского кресла',
        desc: 'Подпрыгивание водителя на пружинах старого сиденья на ухабах',
        tag: 'Freesound #630548',
        ids: ['seat_1', 'seat_2', 'seat_3', 'seat_4']
      },
      {
        name: 'Скрежет сухих рессор грузовика',
        desc: 'Сухое трение металлических листов и сочленений под нагрузкой',
        tag: 'Freesound #380703',
        ids: ['met_1', 'met_2', 'met_3']
      }
    ];

    let currentGroupIdx = 0;
    let audioCtx = null;
    const audioBuffers = {};
    let simTimer = null;

    function initAudio() {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    async function getBuffer(sample) {
      if (audioBuffers[sample.id]) return audioBuffers[sample.id];
      initAudio();
      const res = await fetch(sample.b64);
      const ab = await res.arrayBuffer();
      const buf = await audioCtx.decodeAudioData(ab);
      audioBuffers[sample.id] = buf;
      return buf;
    }

    async function playSample(sampleId, rate = 1.0) {
      initAudio();
      const s = samples.find(x => x.id === sampleId);
      if (!s) return;
      const buf = await getBuffer(s);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(audioCtx.destination);
      src.start();

      const el = document.getElementById('card-' + sampleId);
      if (el) {
        el.classList.add('ring-2', 'ring-[var(--primary)]', 'bg-[var(--secondary)]');
        setTimeout(() => el.classList.remove('ring-2', 'ring-[var(--primary)]', 'bg-[var(--secondary)]'), 350);
      }
    }

    function selectGroup(idx) {
      currentGroupIdx = idx;
      document.querySelectorAll('.tab-btn').forEach((b, i) => {
        if (i === idx) {
          b.className = 'tab-btn px-3 py-1.5 rounded-lg font-medium transition bg-[var(--card)] shadow-sm text-[var(--foreground)]';
        } else {
          b.className = 'tab-btn px-3 py-1.5 rounded-lg font-medium transition text-[var(--muted-foreground)] hover:text-[var(--foreground)]';
        }
      });

      const g = groups[idx];
      document.getElementById('groupDescTitle').textContent = g.desc;
      document.getElementById('groupTag').textContent = g.tag;
      renderSlices();
    }

    function renderSlices() {
      const g = groups[currentGroupIdx];
      const container = document.getElementById('slicesContainer');
      const groupSamples = samples.filter(s => g.ids.includes(s.id));
      
      container.innerHTML = groupSamples.map(s => \`
        <div id="card-\${s.id}" onclick="playSample('\${s.id}')" class="cursor-pointer bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 flex items-center justify-between hover:border-[var(--primary)] hover:bg-[var(--secondary)]/40 transition active:scale-[0.98]">
          <div class="flex flex-col gap-0.5 overflow-hidden">
            <span class="text-xs font-semibold truncate text-[var(--foreground)]">\${s.name}</span>
            <span class="text-xs text-[var(--muted-foreground)] font-mono">\${s.file}</span>
          </div>
          <button class="w-8 h-8 rounded-lg bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--foreground)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] transition flex-shrink-0">
            ▶
          </button>
        </div>
      \`).join('');
    }

    function toggleSimulation() {
      const btn = document.getElementById('simBtn');
      const text = document.getElementById('simBtnText');
      const status = document.getElementById('simStatus');

      if (simTimer) {
        clearTimeout(simTimer);
        simTimer = null;
        text.textContent = 'Тест-драйв на кочках';
        btn.classList.remove('bg-red-500', 'text-white');
        btn.classList.add('bg-[var(--primary)]', 'text-[var(--primary-foreground)]');
        status.textContent = 'Тест-драйв остановлен';
        return;
      }

      initAudio();
      text.textContent = 'Остановить кочки';
      btn.classList.remove('bg-[var(--primary)]', 'text-[var(--primary-foreground)]');
      btn.classList.add('bg-red-500', 'text-white');

      function nextBump() {
        const g = groups[currentGroupIdx];
        const sId = g.ids[Math.floor(Math.random() * g.ids.length)];
        const rate = 0.96 + Math.random() * 0.08;
        const s = samples.find(x => x.id === sId);
        
        status.innerHTML = 'Кочка! <span class="text-[var(--primary)] font-semibold">' + s.name + '</span> (тон: ' + rate.toFixed(2) + 'x)';
        playSample(sId, rate);

        const delay = 450 + Math.random() * 700;
        simTimer = setTimeout(nextBump, delay);
      }

      nextBump();
    }

    selectGroup(0);
  </script>
</body>
</html>`;

fs.writeFileSync(artifactPath, html);
console.log('Artifact written to:', artifactPath, 'Size:', fs.statSync(artifactPath).size, 'bytes');
