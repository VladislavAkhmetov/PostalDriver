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

async function searchFreesound(q) {
  const html = await fetchPage(`https://freesound.org/search/?q=${encodeURIComponent(q)}`);
  const matches = [...html.matchAll(/href="(\/people\/[^/]+\/sounds\/(\d+)\/)"[^>]*title="([^"]*)"/g)];
  const items = [];
  const seen = new Set();
  for (const m of matches) {
    if (!seen.has(m[2])) {
      seen.add(m[2]);
      items.push({ id: m[2], title: m[3] });
    }
  }
  return items;
}

async function fetchFreesoundInfo(id) {
  const url = `https://freesound.org/s/${id}/`;
  const html = await fetchPage(url);
  const mp3Match = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"'<>]+\.mp3/g) || [];
  const hqMp3 = mp3Match.find(u => u.includes('-hq.mp3')) || mp3Match[0];
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
  const title = titleMatch ? titleMatch[1].replace(' - Freesound', '').replace(' | Freesound', '').trim() : id;
  const desc = descMatch ? descMatch[1] : '';
  const durMatch = html.match(/class="duration"[^>]*>([^<]+)<\/span>/);
  return { id, title, desc, duration: durMatch ? durMatch[1].trim() : '', mp3: hqMp3 };
}

(async () => {
  const queries = [
    'car window',
    'car window open',
    'car window close',
    'window roll',
    'manual window',
    'crank window',
    'window handle',
    'window crank',
    'vintage car window',
    'old car window'
  ];

  const all = JSON.parse(fs.readFileSync('temp_window_results.json', 'utf8'));
  const seenIds = new Set(all.map(x => x.id));

  for (const q of queries) {
    const list = await searchFreesound(q);
    console.log(`Query "${q}" found ${list.length}`);
    for (const item of list.slice(0, 10)) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        const info = await fetchFreesoundInfo(item.id);
        if (info.mp3) {
          console.log(`  + [${info.id}] ${info.title} (${info.duration})`);
          all.push(info);
        }
      }
    }
  }

  fs.writeFileSync('temp_window_results.json', JSON.stringify(all, null, 2));
  console.log(`Total candidates: ${all.length}`);
})();
