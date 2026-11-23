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
      items.push({ id: m[2], url: 'https://freesound.org' + m[1], title: m[3] });
    }
  }
  return items;
}

async function getMp3(id) {
  const html = await fetchPage(`https://freesound.org/s/${id}/`);
  const mp3Match = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"'<>]+\.mp3/g) || [];
  const hqMp3 = mp3Match.find(u => u.includes('-hq.mp3')) || mp3Match[0];
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
  const descMatch = html.match(/<div id="sound_description">([\s\S]*?)<\/div>/) || html.match(/<meta property="og:description" content="([^"]*)"/);
  const title = titleMatch ? titleMatch[1].replace(' - Freesound', '').replace(' | Freesound', '').trim() : id;
  const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  const durMatch = html.match(/class="duration"[^>]*>([^<]+)<\/span>/);
  return { id, title, desc, duration: durMatch ? durMatch[1].trim() : '', mp3: hqMp3 };
}

(async () => {
  const queries = [
    'car window crank foley',
    'car window winder',
    'manual window crank',
    'roll down car window crank',
    'crank window squeak',
    'car window crank handle',
    'manual window lift',
    'car window manual open close'
  ];

  const results = [];
  const seen = new Set();

  for (const q of queries) {
    const list = await searchFreesound(q);
    console.log(`Query "${q}": ${list.length} results`);
    for (const item of list.slice(0, 8)) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        const info = await getMp3(item.id);
        if (info.mp3) {
          console.log(`  [${info.id}] "${info.title}" (${info.duration})`);
          console.log(`       Desc: ${info.desc.slice(0, 100)}...`);
          results.push(info);
        }
      }
    }
  }

  fs.writeFileSync('temp_fs_cranks.json', JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} sounds to temp_fs_cranks.json`);
})();
