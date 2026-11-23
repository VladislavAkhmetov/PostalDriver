const https = require('https');

const soundIds = [
  '50905',
  '50904',
  '50903',
  '48439',
  '171542',
  '869005'
];

function fetchPage(id) {
  return new Promise((resolve) => {
    const url = `https://freesound.org/s/${id}/`;
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      // Follow redirect if 301/302
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = 'https://freesound.org' + loc;
        https.get(loc, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        }, (res2) => {
          let html = '';
          res2.on('data', c => html += c);
          res2.on('end', () => {
            const matches = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"'<>]+\.mp3/g) || [];
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(' - Freesound', '').trim() : id;
            resolve({ id, title, previews: [...new Set(matches)] });
          });
        }).on('error', () => resolve({ id, title: 'Error', previews: [] }));
      } else {
        let html = '';
        res.on('data', c => html += c);
        res.on('end', () => {
          const matches = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"'<>]+\.mp3/g) || [];
          const titleMatch = html.match(/<title>([^<]+)<\/title>/);
          const title = titleMatch ? titleMatch[1].replace(' - Freesound', '').trim() : id;
          resolve({ id, title, previews: [...new Set(matches)] });
        });
      }
    }).on('error', () => resolve({ id, title: 'Error', previews: [] }));
  });
}

(async () => {
  for (const id of soundIds) {
    const r = await fetchPage(id);
    console.log(`[${r.id}] ${r.title}`);
    for (const p of r.previews) console.log('   Preview:', p);
  }
})();
