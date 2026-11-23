const https = require('https');

async function searchZ(q) {
  return new Promise(resolve => {
    https.get('https://zvukogram.com/?r=search&s=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const tracks = [];
        const re = /data-track="([^"]+)"[\s\S]*?class="song-name"[^>]*>([\s\S]*?)<\/div>/g;
        let m;
        while ((m = re.exec(html)) !== null) {
          tracks.push({ track: m[1], name: m[2].replace(/<[^>]+>/g, '').trim() });
        }
        if (tracks.length === 0) {
          const re2 = /data-track="([^"]+)"/g;
          while ((m = re2.exec(html)) !== null) {
            tracks.push({ track: m[1], name: '' });
          }
        }
        resolve(tracks);
      });
    });
  });
}

(async () => {
  for (const q of ['переключение передачи', 'рычаг передач', 'кпп', 'переключение коробки передач', 'gear shift']) {
    console.log(`=== Query: ${q} ===`);
    const t = await searchZ(q);
    t.slice(0, 10).forEach(x => console.log(' ', x.track, x.name));
  }
})();
