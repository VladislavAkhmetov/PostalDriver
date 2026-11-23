const https = require('https');
const fs = require('fs');
const path = require('path');

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

async function searchFreesound(q, filter = '') {
  let url = `https://freesound.org/search/?q=${encodeURIComponent(q)}`;
  if (filter) url += `&f=${encodeURIComponent(filter)}`;
  const html = await fetchPage(url);
  const matches = [...html.matchAll(/href="(\/people\/[^/]+\/sounds\/(\d+)\/)"[^>]*title="([^"]*)"/g)];
  const items = [];
  const seen = new Set();
  for (const m of matches) {
    if (!seen.has(m[2])) {
      seen.add(m[2]);
      items.push({ id: m[2], path: m[1], title: m[3] });
    }
  }
  return items;
}

async function getSoundInfo(id) {
  const html = await fetchPage(`https://freesound.org/s/${id}/`);
  const mp3Match = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"'<>]+\.mp3/g) || [];
  const hqMp3 = mp3Match.find(u => u.includes('-hq.mp3')) || mp3Match[0];
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(' - Freesound', '').replace(' | Freesound', '').trim() : id;
  const durMatch = html.match(/class="duration"[^>]*>([^<]+)<\/span>/);
  
  // Extract text description
  const descMatch = html.match(/<div id="sound_description">([\s\S]*?)<\/div>/) ||
                    html.match(/<meta property="og:description" content="([^"]*)"/);
  const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  return { id, title, desc, duration: durMatch ? durMatch[1].trim() : '', mp3: hqMp3 };
}

(async () => {
  const queries = [
    'window crank',
    'manual window',
    'window lift',
    'car window roll',
    'car window open',
    'car window close',
    'crank squeak',
    'window regulator'
  ];

  const foundMap = new Map();
  for (const q of queries) {
    const list = await searchFreesound(q);
    console.log(`Query "${q}": found ${list.length}`);
    for (const item of list.slice(0, 10)) {
      if (!foundMap.has(item.id)) {
        foundMap.set(item.id, item);
      }
    }
  }

  console.log(`Total unique sounds to inspect: ${foundMap.size}`);
  const details = [];
  for (const [id, item] of foundMap.entries()) {
    const info = await getSoundInfo(id);
    if (info.mp3) {
      console.log(`[${info.id}] ${info.title} (${info.duration})`);
      console.log(`    ${info.desc.slice(0, 120)}`);
      details.push(info);
    }
  }

  fs.writeFileSync('temp_crank_candidates_raw.json', JSON.stringify(details, null, 2));
  console.log('Saved details to temp_crank_candidates_raw.json');
})();
