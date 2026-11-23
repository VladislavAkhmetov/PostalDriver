const https = require('https');
const fs = require('fs');

async function searchFreesoundTag(tag) {
  return new Promise(resolve => {
    https.get(`https://freesound.org/search/?q=${encodeURIComponent(tag)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const matches = [...html.matchAll(/\/people\/([^/]+)\/sounds\/(\d+)\//g)];
        resolve(matches.map(m => `https://freesound.org${m[0]}`));
      });
    });
  });
}

(async () => {
  for (const q of ['car-horn beep', 'horn beep', 'truck horn beep', 'beep horn', 'lada horn']) {
    const list = await searchFreesoundTag(q);
    const unique = [...new Set(list)].slice(0, 5);
    console.log(q, unique);
  }
})();
