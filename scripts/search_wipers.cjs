const https = require('https');

async function searchZvukogram(query) {
  const url = 'https://zvukogram.com/?r=search&s=' + encodeURIComponent(query);
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const items = [];
        const regex = /data-track="([^"]+)"[\s\S]*?class="song-name"[^>]*>([^<]+)/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
          items.push({ mp3: m[1], name: m[2].trim() });
        }
        resolve(items);
      });
    }).on('error', () => resolve([]));
  });
}

(async () => {
  for (const q of ['дворники', 'стеклоочиститель', 'wiper', 'windshield wiper']) {
    console.log('=== ' + q + ' ===');
    const res = await searchZvukogram(q);
    console.log('Found:', res.length);
    res.slice(0, 10).forEach(r => console.log('  -', r.name, r.mp3));
  }
})();
