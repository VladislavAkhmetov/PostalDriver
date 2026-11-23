const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../public/sound-samples/window');

const items = [
  {
    key: 'squeaky_car_window_craigsmith',
    url: 'https://cdn.freesound.org/previews/438/438464_2524442-hq.mp3',
    title: 'Vintage Squeaky Window (Craig Smith Archive)',
    desc: 'Настоящая архивная запись: винтажный скрип резинового уплотнителя и дребезг стекла'
  },
  {
    key: 'wound_down_up_car',
    url: 'https://cdn.freesound.org/previews/532/532858_11431915-hq.mp3',
    title: 'Manual Car Window Wound Down & Up (D. Jones)',
    desc: 'Запись реального ручного опускания и подъема стекла в машине с натужным ходом'
  },
  {
    key: 'car_window_open_close_sfx',
    url: 'https://cdn.freesound.org/previews/326/326391_5636854-hq.mp3',
    title: 'Car Window Opening & Closing Studio SFX',
    desc: 'Плотный салонный звук с резиновым трением и упором в крайних положениях'
  },
  {
    key: 'hyundai_kona_crank_exterior',
    url: 'https://cdn.freesound.org/previews/845/845623_12846320-hq.mp3',
    title: 'Manual Crank Exterior / Frame Friction',
    desc: 'Детализированный скрежет и щелчки механизма привода'
  },
  {
    key: 'car_window_open_smooth',
    url: 'https://cdn.freesound.org/previews/369/369057_1535801-hq.mp3',
    title: 'Car Window Open (Smooth Drag)',
    desc: 'Мягкое скольжение стекла вниз с бархатным шелестом'
  },
  {
    key: 'car_window_close_firm',
    url: 'https://cdn.freesound.org/previews/369/369060_1535801-hq.mp3',
    title: 'Car Window Close (Firm Fit)',
    desc: 'Подъем и плотная посадка в верхний паз двери'
  },
  {
    key: 'rubber_creak_squeak_zg',
    url: 'https://zvukogram.com/mp3/28/rubber-creak-and-squeak.mp3',
    title: 'Rubber Creak & Squeak (Zvukogram)',
    desc: 'Фактурный скрип резины при трении о стекло'
  },
  {
    key: 'door_handle_squeak_zg',
    url: 'https://zvukogram.com/mp3/48/door-handle-squeak.mp3',
    title: 'Handle Squeak Mechanical (Zvukogram)',
    desc: 'Скрип несмазанной вращающейся ручки'
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
  for (const item of items) {
    const dest = path.join(outDir, `${item.key}.mp3`);
    process.stdout.write(`Downloading [${item.key}]... `);
    const ok = await download(item.url, dest);
    console.log(ok ? 'OK' : 'FAILED');
  }
  console.log('Done!');
})();
