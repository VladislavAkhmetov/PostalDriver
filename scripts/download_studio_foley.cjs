const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'temp_studio_foley';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const tracks = [
  { name: 'jeep_starter_difficult.mp3', url: 'https://zvukogram.com/mp3/33/jeep-car-starter-engine-difficult-to-start.mp3' },
  { name: 'jeep_standing_idle_loop.mp3', url: 'https://zvukogram.com/mp3/33/the-jeep-car-is-standing-with-the-engine-running-loop.mp3' },
  { name: 'jeep_driving_slowly_loop.mp3', url: 'https://zvukogram.com/mp3/33/jeep-car-is-driving-slowly-loop.mp3' },
  { name: 'jeep_goes_fast_loop.mp3', url: 'https://zvukogram.com/mp3/33/jeep-car-goes-fast-loop.mp3' },
  { name: 'uaz_drives_up_and_goes.mp3', url: 'https://zvukogram.com/mp3/33/uaz-slowly-drives-up-and-goes.mp3' },
  { name: 'car_starts_engine_revs.mp3', url: 'https://zvukogram.com/mp3/33/car-starts-engine-revs.mp3' },
  { name: 'city_bus_start_idle.mp3', url: 'https://zvukogram.com/mp3/33/city-bus-engine-start-idle.mp3' }
];

async function download(t) {
  const dest = path.join(dir, t.name);
  return new Promise((resolve) => {
    https.get(t.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
          const file = fs.createWriteStream(dest);
          res2.pipe(file);
          file.on('finish', () => { file.close(); console.log(`Downloaded ${t.name}: ${fs.statSync(dest).size}b`); resolve(); });
        });
      } else {
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(`Downloaded ${t.name}: ${fs.statSync(dest).size}b`); resolve(); });
      }
    }).on('error', (e) => { console.log(t.name, e.message); resolve(); });
  });
}

(async () => {
  for (const t of tracks) await download(t);
})();
