const https = require('https');
const fs = require('fs');

const ids = ['239031', '239030', '461944', '468441', '43801', '848271', '479997', '615566', '217138'];

async function fetchInfo(id) {
  return new Promise((resolve) => {
    https.get(`https://freesound.org/sounds/${id}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        const mp3Matches = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/g) || [];
        const desc = html.match(/<div id="sound_description"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
        resolve({ id, title: title.replace(' | Freesound', '').trim(), mp3: mp3Matches[0], desc: desc.replace(/<[^>]+>/g, '').trim().slice(0, 150) });
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  for (const id of ids) {
    const res = await fetchInfo(id);
    if (res) {
      console.log(`[${res.id}] ${res.title}`);
      console.log(`  Desc: ${res.desc}`);
      console.log(`  MP3: ${res.mp3}\n`);
    }
  }
})();
