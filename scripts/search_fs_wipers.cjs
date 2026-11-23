const https = require('https');

async function searchFreesound(q) {
  return new Promise(resolve => {
    const url = `https://freesound.org/search/?q=${encodeURIComponent(q)}&f=duration:[1+TO+30]`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const results = [];
        // Extract sound titles and URLs
        // Freesound structure: <a class="bw-link--black" href="/people/.../sounds/.../">Title</a>
        // or data-sound-id or mp3 preview in search results
        const matches = [...html.matchAll(/href="(\/people\/[^/]+\/sounds\/(\d+)\/)"[^>]*>([^<]+)<\/a>/g)];
        for (const m of matches) {
          if (m[3].trim()) {
            results.push({ url: 'https://freesound.org' + m[1], id: m[2], title: m[3].trim() });
          }
        }
        resolve(results);
      });
    }).on('error', () => resolve([]));
  });
}

(async () => {
  for (const q of ['windshield wipers squeak', 'car wipers', 'windscreen wipers', 'windshield wiper motor']) {
    console.log(`=== Query: ${q} ===`);
    const list = await searchFreesound(q);
    // deduplicate by id
    const seen = new Set();
    const unique = [];
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }
    console.log(`Found ${unique.length} sounds`);
    unique.slice(0, 8).forEach(s => console.log(`  [${s.id}] ${s.title} (${s.url})`));
  }
})();
