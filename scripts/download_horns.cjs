const https = require('https');
const fs = require('fs');
const path = require('path');

const candidates = [
  { name: 'vintage_horn_beep.mp3', url: 'https://zvukogram.com/mp3/30/vintage-car-horn-beep-beep.mp3' },
  { name: 'long_car_signal_beep.mp3', url: 'https://zvukogram.com/mp3/31/the-sound-of-a-long-car-signal-beep-horn.mp3' },
  { name: 'car_signal_beep.mp3', url: 'https://zvukogram.com/mp3/31/the-sound-of-a-car-signal-beep-horn.mp3' },
  { name: 'car_horn_v2.mp3', url: 'https://zvukogram.com/mp3/31/car-horn-version-2.mp3' },
  { name: 'car_horn_base.mp3', url: 'https://zvukogram.com/mp3/31/car-horn.mp3' },
  { name: 'truck_horn_single.mp3', url: 'https://zvukogram.com/mp3/31/truck-horn-single.mp3' },
  { name: 'bus_horn_2.mp3', url: 'https://zvukogram.com/mp3/31/bus-horn-2.mp3' }
];

const dir = 'temp_horns';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

async function dl(item) {
  const dest = path.join(dir, item.name);
  return new Promise(resolve => {
    https.get(item.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${item.name}: ${fs.statSync(dest).size}b`);
        resolve();
      });
    }).on('error', e => { console.log(item.name, e.message); resolve(); });
  });
}

(async () => {
  for (const c of candidates) await dl(c);
})();
