const https = require('https');

async function searchFreesound(q) {
  return new Promise(resolve => {
    https.get(`https://freesound.org/search/?q=${encodeURIComponent(q)}&f=duration:[0.5+TO+4]`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const matches = [...html.matchAll(/class="sound_title"[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
        const list = matches.map(m => ({ url: 'https://freesound.org' + m[1], title: m[2].trim() }));
        resolve(list);
      });
    });
  });
}

(async () => {
  for (const q of ['vintage car horn', 'old horn beep', 'classic car horn', 'retro horn']) {
    console.log(`=== ${q} ===`);
    const res = await searchFreesound(q);
    res.slice(0, 5).forEach(r => console.log(' ', r.title, r.url));
  }
})();
