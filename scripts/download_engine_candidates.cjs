const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'temp_engine_candidates';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const tracks = [
  { name: 'jeep_standing_loop.mp3', url: 'https://zvukogram.com/mp3/33/the-jeep-car-is-standing-with-the-engine-running-loop.mp3' },
  { name: 'jeep_running_engine.mp3', url: 'https://zvukogram.com/mp3/77/the-sound-of-a-running-engine-in-a-standing-jeep.mp3' },
  { name: 'start_and_regas.mp3', url: 'https://zvukogram.com/mp3/33/starting-the-engine-and-regassing.mp3' },
  { name: 'peppy_engine.mp3', url: 'https://zvukogram.com/mp3/84/uninterrupted-peppy-engine-sound.mp3' },
  { name: 'long_engine_op.mp3', url: 'https://zvukogram.com/mp3/77/long-uninterrupted-engine-operation.mp3' }
];

async function download(t) {
  const dest = path.join(dir, t.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`Already have ${t.name}: ${fs.statSync(dest).size} bytes`);
    return;
  }
  return new Promise((resolve) => {
    https.get(t.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
          const file = fs.createWriteStream(dest);
          res2.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log(`Downloaded ${t.name}: ${fs.statSync(dest).size} bytes`);
            resolve();
          });
        });
      } else {
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`Downloaded ${t.name}: ${fs.statSync(dest).size} bytes`);
          resolve();
        });
      }
    }).on('error', (err) => {
      console.log(`Error ${t.name}: ${err.message}`);
      resolve();
    });
  });
}

(async () => {
  for (const t of tracks) {
    await download(t);
  }
})();
