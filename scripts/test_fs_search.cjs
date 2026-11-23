const https = require('https');

async function searchFreesound(q) {
  return new Promise(resolve => {
    https.get(`https://freesound.org/search/?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const matches = [...html.matchAll(/href="(\/people\/[^/]+\/sounds\/(\d+)\/)"[^>]*title="([^"]*)"/g)];
        const items = [];
        const seen = new Set();
        for (const m of matches) {
          if (!seen.has(m[2])) {
            seen.add(m[2]);
            items.push({ id: m[2], url: 'https://freesound.org' + m[1], title: m[3] });
          }
        }
        resolve(items);
      });
    }).on('error', (e) => {
      console.error(e);
      resolve([]);
    });
  });
}

(async () => {
  for (const q of ['car creak', 'car squeak', 'leaf spring', 'suspension creak', 'car bounce creak', 'car interior creak']) {
    const list = await searchFreesound(q);
    console.log(`=== Query: ${q} (${list.length}) ===`);
    list.slice(0, 5).forEach(item => {
      console.log(`  ID: ${item.id} - ${item.title}`);
    });
  }
})();
