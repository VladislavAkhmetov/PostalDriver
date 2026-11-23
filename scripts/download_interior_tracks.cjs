const fs = require('fs');
const path = require('path');
const https = require('https');

const dir = path.join(__dirname, '../temp_light_4x4');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const tracks = [
  { name: 'jeep_interior_loop.mp3', url: 'https://zvukogram.com/mp3/33/jeep-car-rides-interior-recording-loop.mp3' },
  { name: 'uaz_in_cabin.mp3', url: 'https://zvukogram.com/mp3/31/uaz-in-the-cabin-driving-on-a-bumpy-road-rumbling-and-shaking.mp3' },
  { name: 'engine_start_regas.mp3', url: 'https://zvukogram.com/mp3/33/starting-the-engine-and-regassing.mp3' },
  { name: 'motor_regas_3times.mp3', url: 'https://zvukogram.com/mp3/33/regassing-the-motor-3-times.mp3' }
];

function download(t) {
  return new Promise(resolve => {
    const dest = path.join(dir, t.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return resolve(dest);
    const file = fs.createWriteStream(dest);
    https.get(t.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return resolve(null);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', () => resolve(null));
  });
}

async function run() {
  for (const t of tracks) {
    const p = await download(t);
    console.log(t.name, p ? `${fs.statSync(p).size} bytes` : 'FAILED');
  }
}

run();
