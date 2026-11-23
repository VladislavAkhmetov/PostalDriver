const https = require('https');

async function searchFreesound(q, filter = '') {
  let url = `https://freesound.org/search/?q=${encodeURIComponent(q)}`;
  if (filter) url += `&f=${encodeURIComponent(filter)}`;
  return new Promise(resolve => {
    https.get(url, {
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
    }).on('error', () => resolve([]));
  });
}

(async () => {
  const queries = [
    'metal creak',
    'creaking metal',
    'creaking spring',
    'spring squeak',
    'bed creak',
    'metal squeak',
    'door creak',
    'old truck creak',
    'car interior',
    'van interior'
  ];
  for (const q of queries) {
    const list = await searchFreesound(q);
    console.log(`=== Query: ${q} (${list.length}) ===`);
    list.slice(0, 5).forEach(item => {
      console.log(`  ID: ${item.id} - ${item.title}`);
    });
  }
})();
