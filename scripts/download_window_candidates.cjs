const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../public/sound-samples/window');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Top curated candidates:
const candidates = [
  {
    id: '848778',
    key: 'uhaul_truck_crank_squeaky',
    title: 'Truck / Uhaul Manual Crank (Open & Squeak)',
    desc: 'Настоящая ручка стеклоподъемника грузовика с выраженным характерным скрипом и механическим ходом',
    url: 'https://cdn.freesound.org/previews/848/848778_6951162-hq.mp3'
  },
  {
    id: '438464',
    key: 'craigsmith_squeaky_window',
    title: 'Vintage Squeaky Car Window & Door',
    desc: 'Сочный скрип резинового уплотнителя старого авто при движении стекла',
    url: 'https://cdn.freesound.org/previews/438/438464_1015240-hq.mp3'
  },
  {
    id: '82560',
    key: 'classic_manual_window_lift',
    title: 'Classic Car Manual Window Lift',
    desc: 'Чистое опускание и подъем стекла ручкой — классическая трещотка и механическое сопротивление',
    url: 'https://cdn.freesound.org/previews/82/82560_389377-hq.mp3'
  },
  {
    id: '635978',
    key: 'mercury_1979_down_up',
    title: '1979 Sedan Window Down & Up',
    desc: 'Винтажный седан 1979 года: ручное вращение, глухой ход стекла по салазкам и упор',
    url: 'https://cdn.freesound.org/previews/635/635978_14030247-hq.mp3'
  },
  {
    id: '532858',
    key: 'wound_down_and_up',
    title: 'Car Window Wound Down & Up',
    desc: 'Полный цикл: опускание стекла кручением ручки, пауза, затем подъем до закрытия',
    url: 'https://cdn.freesound.org/previews/532/532858_5674468-hq.mp3'
  },
  {
    id: '419707',
    key: 'manual_window_wav',
    title: 'Manual Car Window Squeak & Clack',
    desc: 'Тяжелый советский/европейский ручной механизм: тугой скрип резины и щелчки',
    url: 'https://cdn.freesound.org/previews/419/419707_7865567-hq.mp3'
  },
  {
    id: '765464',
    key: 'window_roll_down_fast',
    title: 'Window Roll Down (Fast Whir & Drop)',
    desc: 'Быстрое опускание с нарастающим трением резины',
    url: 'https://cdn.freesound.org/previews/765/765464_15688687-hq.mp3'
  },
  {
    id: '833815',
    key: 'window_rolling_up',
    title: 'Window Rolling Up (Effort & Thud)',
    desc: 'Подъем стекла наверх с натягом и глухим финальным ударом о верхнюю рамку двери',
    url: 'https://cdn.freesound.org/previews/833/833815_16526104-hq.mp3'
  },
  {
    id: '354003',
    key: 'window_roll_down_clean',
    title: 'Car Window Roll Down (Clean Interior)',
    desc: 'Запись из салона: плавное скольжение стекла по сухим направляющим',
    url: 'https://cdn.freesound.org/previews/354/354003_6354662-hq.mp3'
  },
  {
    id: '354002',
    key: 'window_roll_up_clean',
    title: 'Car Window Roll Up (Clean Interior)',
    desc: 'Запись из салона: закрывание стекла с плотным прижимом к уплотнителю',
    url: 'https://cdn.freesound.org/previews/354/354002_6354662-hq.mp3'
  },
  {
    id: '811519',
    key: 'crank_handle_mechanism',
    title: 'Compliant Handle Crank Open / Close',
    desc: 'Очень четкий механический хруст ручки и шестерен стеклоподъемника',
    url: 'https://cdn.freesound.org/previews/811/811519_6951162-hq.mp3'
  },
  {
    id: '395041',
    key: 'turn_crank_squeak_loop',
    title: 'Vintage Crank Squeak (Mechanical Rotations)',
    desc: 'Ритмичный винтажный скрип металлической/пластиковой ручки при каждом обороте',
    url: 'https://cdn.freesound.org/previews/395/395041_7487276-hq.mp3'
  },
  {
    id: '457473',
    key: 'winch_crank_squeak',
    title: 'Winch Crank Heavy Squeak',
    desc: 'Тяжелый натужный скрип при вращении ручки под нагрузкой',
    url: 'https://cdn.freesound.org/previews/457/457473_520316-hq.mp3'
  },
  {
    id: 'zg_rubber_squeak',
    key: 'zg_rubber_creak_squeak',
    title: 'Rubber Seal Creak & Friction',
    desc: 'Трение стекла о резиновую бархотку двери (Zvukogram)',
    url: 'https://zvukogram.com/mp3/28/rubber-creak-and-squeak.mp3'
  },
  {
    id: 'zg_door_squeak',
    key: 'zg_door_handle_squeak',
    title: 'Handle Squeak Tight Turn',
    desc: 'Скрип тугой дверной ручки / механизма вращения (Zvukogram)',
    url: 'https://zvukogram.com/mp3/48/door-handle-squeak.mp3'
  }
];

function download(url, dest) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) {
        console.warn(`Failed ${res.statusCode} for ${url}`);
        return resolve(false);
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => resolve(true));
    });
    req.on('error', (err) => {
      console.warn(`Error downloading ${url}:`, err.message);
      resolve(false);
    });
  });
}

(async () => {
  console.log(`Downloading ${candidates.length} candidate sound files...`);
  for (const c of candidates) {
    const dest = path.join(outDir, `${c.key}.mp3`);
    process.stdout.write(`Downloading [${c.key}]... `);
    const ok = await download(c.url, dest);
    console.log(ok ? 'OK' : 'FAILED');
  }
  fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(candidates, null, 2));
  console.log('All downloads completed!');
})();
