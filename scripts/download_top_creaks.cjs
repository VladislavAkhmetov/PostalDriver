const https = require('https');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'temp_creak_candidates');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function downloadDirect(url, dest) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = 'https://freesound.org' + loc;
        return downloadDirect(loc, dest).then(resolve);
      }
      if (res.statusCode !== 200) {
        console.log(`Failed ${url}: status ${res.statusCode}`);
        return resolve(false);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', (e) => { resolve(false); });
  });
}

async function getMp3FromSoundPage(id) {
  return new Promise((resolve) => {
    const req = https.get(`https://freesound.org/s/${id}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = 'https://freesound.org' + loc;
        https.get(loc, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (res2) => {
          let html = '';
          res2.on('data', c => html += c);
          res2.on('end', () => {
            const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                          html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
            const mp3 = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+-hq\.mp3/)?.[0] ||
                        html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/)?.[0];
            resolve({ id, title, mp3 });
          });
        }).on('error', () => resolve({ id, error: true }));
        return;
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                      html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        const mp3 = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+-hq\.mp3/)?.[0] ||
                    html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/)?.[0];
        resolve({ id, title, mp3 });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ id, error: 'timeout' }); });
    req.on('error', () => resolve({ id, error: true }));
  });
}

const targetIds = [
  '86234',  // Car suspension creak
  '508281', // Old truck metal squeaks/creaks
  '109197', // Car seats squeak
  '630548', // Classic car Mustang seat
  '751719', // Squeaking suspension
  '443796', // Bed creaking / springs
  '119468', // Metal creak
  '380703', // Squeaky chair
  '316886', // Pobeda handbrake & creaks
  '534362', // Spring metal grind squeak
  '425517', // Soundholder mechanical / car
  '490136'  // Metal creak
];

(async () => {
  for (const id of targetIds) {
    const dest = path.join(outDir, `${id}.mp3`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`Already have ${id} (${fs.statSync(dest).size}b)`);
      continue;
    }
    const info = await getMp3FromSoundPage(id);
    if (info && info.mp3) {
      console.log(`Downloading ${id}: ${info.title} -> ${info.mp3}`);
      const ok = await downloadDirect(info.mp3, dest);
      console.log(`  Saved: ${ok} (${fs.existsSync(dest) ? fs.statSync(dest).size : 0}b)`);
    } else {
      console.log(`No preview found for ${id}:`, info);
    }
  }
  console.log('All done!');
})();
