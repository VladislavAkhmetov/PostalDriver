const https = require('https');

async function searchFreesound(q) {
  return new Promise(resolve => {
    https.get(`https://freesound.org/search/?q=${encodeURIComponent(q)}&f=duration:[0.2+TO+3]`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const matches = [...html.matchAll(/\/people\/([^/]+)\/sounds\/(\d+)\//g)];
        const list = [...new Set(matches.map(m => `https://freesound.org${m[0]}`))];
        resolve(list);
      });
    });
  });
}

(async () => {
  for (const q of ['gear shift car', 'manual gear shift', 'gear lever', 'truck gear']) {
    console.log(`=== ${q} ===`);
    const res = await searchFreesound(q);
    res.slice(0, 6).forEach(r => console.log(' ', r));
  }
})();
