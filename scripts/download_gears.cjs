const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'temp_gears';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const zgTracks = [
  { name: 'truck_gearbox.mp3', url: 'https://zvukogram.com/mp3/33/truck-gearbox.mp3' },
  { name: 'transmission.mp3', url: 'https://zvukogram.com/mp3/42/transmission.mp3' },
  { name: 'kpp_doc.mp3', url: 'https://zvukogram.com/mp3/cats/732/kpp--dokumentalnyiy.mp3' },
  { name: 'transmissiya_real.mp3', url: 'https://zvukogram.com/mp3/cats/732/transmissiya--realnyiy-zvuk.mp3' },
  { name: 'diesel_shift.mp3', url: 'https://zvukogram.com/mp3/33/diesel-truck-movement-gear-shifting.mp3' }
];

const fsUrls = [
  'https://freesound.org/people/marciofao/sounds/519638/',
  'https://freesound.org/people/greatsoundstube/sounds/629324/',
  'https://freesound.org/people/qubodup/sounds/157451/',
  'https://freesound.org/people/timgormly/sounds/151271/',
  'https://freesound.org/people/Soundholder/sounds/425517/'
];

async function download(url, dest) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res2 => {
          const file = fs.createWriteStream(dest);
          res2.pipe(file).on('finish', () => { file.close(); resolve(); });
        });
      } else {
        const file = fs.createWriteStream(dest);
        res.pipe(file).on('finish', () => { file.close(); resolve(); });
      }
    }).on('error', () => resolve());
  });
}

(async () => {
  for (const t of zgTracks) {
    const dest = path.join(dir, t.name);
    await download(t.url, dest);
    console.log(`Downloaded ZG: ${t.name} (${fs.existsSync(dest) ? fs.statSync(dest).size : 0}b)`);
  }

  for (const u of fsUrls) {
    await new Promise(resolve => {
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        let html = '';
        res.on('data', c => html += c);
        res.on('end', async () => {
          const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
          const mp3 = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/g)?.[0];
          if (mp3) {
            const fname = path.basename(mp3);
            const dest = path.join(dir, fname);
            await download(mp3, dest);
            console.log(`Downloaded FS: ${fname} (${title.trim().slice(0, 40)})`);
          }
          resolve();
        });
      });
    });
  }
})();
