const https = require('https');

async function searchZvukogram(query) {
  const url = `https://zvukogram.com/?r=search&s=${encodeURIComponent(query)}`;
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const items = [];
        // Extract sound titles and mp3 URLs
        const regex = /data-track="([^"]+)"[\s\S]*?class="song-name"[^>]*>([^<]+)/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
          items.push({ mp3: m[1], name: m[2].trim() });
        }
        // Also look for other patterns if any
        const regex2 = /class="play"[^>]*data-url="([^"]+)"[^>]*>[\s\S]*?<div class="title">([^<]+)/g;
        while ((m = regex2.exec(html)) !== null) {
          items.push({ mp3: m[1], name: m[2].trim() });
        }
        resolve(items);
      });
    }).on('error', () => resolve([]));
  });
}

(async () => {
  for (const q of ['клаксон', 'гудок автомобиля', 'сигнал машины', 'клаксон уаз', 'гудок газ']) {
    console.log(`=== Query: ${q} ===`);
    const results = await searchZvukogram(q);
    console.log(`Found ${results.length} items`);
    results.slice(0, 8).forEach(r => console.log(' ', r.name, r.mp3));
  }
})();
