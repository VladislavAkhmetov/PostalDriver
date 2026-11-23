const https = require('https');
const fs = require('fs');

function fetchPage(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = 'https://freesound.org' + loc;
        return fetchPage(loc).then(resolve);
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve(html));
    }).on('error', () => resolve(''));
  });
}

async function searchByTag(tag) {
  const html = await fetchPage(`https://freesound.org/search/?q=&f=tag%3A%22${encodeURIComponent(tag)}%22+duration%3A%5B0.5+TO+10%5D`);
  const matches = [...html.matchAll(/href="(\/people\/[^/]+\/sounds\/(\d+)\/)"[^>]*title="([^"]*)"/g)];
  return matches.map(m => ({ id: m[2], url: 'https://freesound.org' + m[1], title: m[3] }));
}

async function searchCombined(q) {
  const html = await fetchPage(`https://freesound.org/search/?q=${encodeURIComponent(q)}&f=duration%3A%5B0.5+TO+12%5D`);
  const matches = [...html.matchAll(/href="(\/people\/[^/]+\/sounds\/(\d+)\/)"[^>]*title="([^"]*)"/g)];
  return matches.map(m => ({ id: m[2], url: 'https://freesound.org' + m[1], title: m[3] }));
}

(async () => {
  for (const q of [
    'window crank',
    'car window crank',
    'manual window',
    'car window manual',
    'car window squeak',
    'cranking',
    'hand crank squeak',
    'crank squeak',
    'ratchet crank'
  ]) {
    const list = await searchCombined(q);
    console.log(`=== Query "${q}" (${list.length}) ===`);
    list.slice(0, 6).forEach(i => console.log(`  [${i.id}] ${i.title}`));
  }
})();
