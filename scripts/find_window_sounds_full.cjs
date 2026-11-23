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

async function fetchFreesoundInfo(id) {
  const url = `https://freesound.org/s/${id}/`;
  const html = await fetchPage(url);
  const mp3Match = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"'<>]+\.mp3/g) || [];
  const hqMp3 = mp3Match.find(u => u.includes('-hq.mp3')) || mp3Match[0];
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
  const title = titleMatch ? titleMatch[1].replace(' - Freesound', '').replace(' | Freesound', '').trim() : id;
  const desc = descMatch ? descMatch[1] : '';
  return { id, title, desc, mp3: hqMp3 };
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

(async () => {
  const seedIds = [
    '848778', // Nicholas Judy: Truck, Uhaul, Crank, Open, Squeaky
    '82560',  // car - manual window lift
    '635978', // Window Down/Up on 1979 Mercury Zephyr Sedan
    '419707', // window.wav (manual car window)
    '765464', // car window rolled down
    '833815', // car-window-rolling-up
    '354002', // car windows roll up
    '354003', // car window roll down
    '326391', // CAR window - Opening and closing (SFX)
    '811519', // Window with Compliant Handle, Crank Open, Close
    '845623'  // VEHMech-HYUNDAI KONA_Window Crank Exterior
  ];

  console.log('--- Fetching Seed IDs ---');
  const results = [];
  for (const id of seedIds) {
    const info = await fetchFreesoundInfo(id);
    if (info.mp3) {
      console.log(`[${info.id}] "${info.title}"`);
      console.log(`    MP3: ${info.mp3}`);
      console.log(`    Desc: ${info.desc.slice(0, 100)}...`);
      results.push(info);
    }
  }

  const queries = [
    'crank window',
    'car window crank',
    'window crank squeak',
    'manual window',
    'roll down car window',
    'window roll down squeak',
    'cranking squeak'
  ];

  for (const q of queries) {
    const found = await searchFreesound(q);
    console.log(`Query: ${q} (${found.length} results)`);
    for (const f of found.slice(0, 5)) {
      if (!results.some(r => r.id === f.id)) {
        const info = await fetchFreesoundInfo(f.id);
        if (info.mp3) {
          console.log(`  + [${info.id}] "${info.title}"`);
          console.log(`      MP3: ${info.mp3}`);
          results.push(info);
        }
      }
    }
  }

  fs.writeFileSync('temp_window_results.json', JSON.stringify(results, null, 2));
  console.log(`\nTotal candidate sounds fetched: ${results.length}`);
})();
