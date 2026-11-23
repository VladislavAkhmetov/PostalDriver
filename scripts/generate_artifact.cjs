const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/amazi/.gemini/antigravity/brain/c9ad1dc4-6e99-4c4e-a539-e9f96f3488bf';
const samplesDir = path.join(__dirname, '../public/sound-samples/wipers');

const items = [
  {
    id: 'current',
    file: 'current_wiper.wav',
    mime: 'audio/wav',
    name: 'Текущий звук в игре (wiper.wav)',
    tag: 'Сейчас в игре',
    tagClass: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
    desc: 'Короткий сэмпл взмаха/реле (0.35 с). Одинаково срабатывает и вверху, и внизу. Нет протяжного скрипа резины по стеклу и нет отдельного удара об нижний упор.',
    rec: false
  },
  {
    id: 'vintage',
    file: '579490_vintage_1967_vw.mp3',
    mime: 'audio/mp3',
    name: 'Вариант 1: Винтажный механизм 1967 года',
    tag: '⭐ Рекомендуем для УАЗа',
    tagClass: 'border-amber-500/50 text-amber-300 bg-amber-500/10',
    desc: 'Настоящая аналоговая механика: плотный ход тяг, натуральный мягкий стук в крайней нижней точке, винтажный дух старого авто без пластика.',
    rec: true
  },
  {
    id: 'interior_clean',
    file: '733557_interior_clean_off.mp3',
    mime: 'audio/mp3',
    name: 'Вариант 2: Салонный скрип резины + стук перекладки',
    tag: 'Скрип + Тумп',
    tagClass: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10',
    desc: 'Чистая салонная запись при выключенном моторе: отчётливый скрип суховатой резины по стеклу («хрр-ииик») и выраженный глухой стук («тумп») снизу.',
    rec: true
  },
  {
    id: 'robinhood',
    file: '124737_robinhood_loopable.mp3',
    mime: 'audio/mp3',
    name: 'Вариант 3: Ритмичный взмах с нижним возвратным ударом',
    tag: 'Чёткий возврат',
    tagClass: 'border-sky-500/50 text-sky-300 bg-sky-500/10',
    desc: 'Профессиональная запись Robinhood76: естественный звук смахивания воды и акцентированный возвратный толчок лезвия в нижней точке.',
    rec: false
  },
  {
    id: 'squeak_spray',
    file: '50905_squeaky_rubber_spray.mp3',
    mime: 'audio/mp3',
    name: 'Вариант 4: Сочный скрип резины по мокрому стеклу',
    tag: 'Фактурная резина',
    tagClass: 'border-purple-500/50 text-purple-300 bg-purple-500/10',
    desc: 'Запись RutgerMuller: характерный влажный визг и трение резины о стекло при мороси. Очень узнаваемый дорожный звук.',
    rec: false
  },
  {
    id: 'cabin_thud',
    file: '237381_cabin_interior_thud.mp3',
    mime: 'audio/mp3',
    name: 'Вариант 5: Глухой салонный стук и моторчик привода',
    tag: 'Акустика кабины',
    tagClass: 'border-blue-500/50 text-blue-300 bg-blue-500/10',
    desc: 'Акустика закрытой кабины: приглушённое гудение редуктора и отчётливый глухой стук перекладки в крайнем положении.',
    rec: false
  }
];

const jsData = items.map(item => {
  const buf = fs.readFileSync(path.join(samplesDir, item.file));
  const b64 = buf.toString('base64');
  return {
    ...item,
    dataUri: `data:${item.mime};base64,${b64}`
  };
});

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
  <div class="max-w-3xl mx-auto space-y-3">
    <!-- Header banner -->
    <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div class="flex items-center justify-between gap-3 mb-1">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          <span>🌧</span> Прослушивание звуков стеклоочистителей (дворников)
        </h2>
        <span class="text-[11px] text-[var(--muted-foreground)]">УАЗ-452 «Почта»</span>
      </div>
      <p class="text-xs text-[var(--muted-foreground)] leading-relaxed">
        Сравните текущий звук игры с новыми живыми записями: ищем сочный скрип резины по стеклу и характерный стук в крайней нижней точке.
      </p>
    </div>

    <!-- Sounds List -->
    <div class="space-y-2.5" id="soundList">
      <!-- Generated items -->
    </div>
  </div>

  <script>
    const sounds = ${JSON.stringify(jsData)};
    const container = document.getElementById('soundList');

    let currentAudio = null;
    let currentId = null;

    sounds.forEach(s => {
      const card = document.createElement('div');
      card.className = "rounded-lg border " + 
        (s.rec ? "border-amber-500/40 bg-amber-500/[0.04]" : (s.id === 'current' ? "border-slate-500/30 bg-slate-500/[0.03]" : "border-[var(--border)] bg-[var(--card)]")) + 
        " p-3 transition-colors hover:border-slate-500/60";
      card.id = "card_" + s.id;

      card.innerHTML = \`
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-600 transition-all" id="ind_\${s.id}"></span>
              <span class="font-bold text-xs text-white">\${s.name}</span>
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded border \${s.tagClass}">\${s.tag}</span>
            </div>
            <p class="text-xs text-[var(--muted-foreground)] leading-normal">\${s.desc}</p>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]/50">
          <div class="flex items-center gap-2">
            <button onclick="togglePlay('\${s.id}')" id="btn_\${s.id}" class="px-3 py-1.5 rounded-md font-bold text-xs text-white transition-all \${s.rec ? 'bg-amber-600 hover:bg-amber-500' : (s.id === 'current' ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-500')} flex items-center gap-1.5">
              <span>▶</span> <span>Слушать</span>
            </button>
            <button onclick="toggleLoop('\${s.id}')" id="loop_\${s.id}" class="px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-700 text-slate-400 hover:text-white transition-all" title="Зациклить непрерывную работу">
              🔁 Зациклить
            </button>
          </div>

          <audio id="aud_\${s.id}" preload="metadata" src="\${s.dataUri}"></audio>
        </div>
      \`;

      container.appendChild(card);

      const aud = card.querySelector('#aud_' + s.id);
      aud.addEventListener('play', () => updateState(s.id, true));
      aud.addEventListener('pause', () => updateState(s.id, false));
      aud.addEventListener('ended', () => updateState(s.id, false));
    });

    function updateState(id, isPlaying) {
      const btn = document.getElementById('btn_' + id);
      const ind = document.getElementById('ind_' + id);
      const card = document.getElementById('card_' + id);

      if (btn) {
        btn.innerHTML = isPlaying ? '<span>⏸</span> <span>Пауза</span>' : '<span>▶</span> <span>Слушать</span>';
      }
      if (ind) {
        ind.className = 'w-2.5 h-2.5 rounded-full transition-all ' + 
          (isPlaying ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] playing-pulse' : 'bg-slate-600');
      }
    }

    function togglePlay(id) {
      const aud = document.getElementById('aud_' + id);
      if (!aud) return;

      if (currentAudio && currentAudio !== aud) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      if (aud.paused) {
        aud.play().catch(e => console.error(e));
        currentAudio = aud;
        currentId = id;
      } else {
        aud.pause();
        aud.currentTime = 0;
      }
    }

    function toggleLoop(id) {
      const aud = document.getElementById('aud_' + id);
      const loopBtn = document.getElementById('loop_' + id);
      if (!aud || !loopBtn) return;
      aud.loop = !aud.loop;
      if (aud.loop) {
        loopBtn.classList.remove('border-slate-700', 'text-slate-400');
        loopBtn.classList.add('border-emerald-500/50', 'bg-emerald-500/20', 'text-emerald-300');
        if (aud.paused) togglePlay(id);
      } else {
        loopBtn.classList.remove('border-emerald-500/50', 'bg-emerald-500/20', 'text-emerald-300');
        loopBtn.classList.add('border-slate-700', 'text-slate-400');
      }
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(brainDir, 'wiper-player.html'), htmlContent);
console.log('Artifact wiper-player.html successfully generated in brain directory!');
