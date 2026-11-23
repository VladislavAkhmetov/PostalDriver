const https = require('https');
const fs = require('fs');
const path = require('path');

async function searchFreesound(q) {
  let url = `https://freesound.org/search/?q=${encodeURIComponent(q)}`;
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

async function getSoundDetails(id, soundUrl) {
  return new Promise(resolve => {
    https.get(soundUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const mp3Match = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/);
        const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        const durationMatch = html.match(/class="duration"[^>]*>([^<]+)<\/span>/);
        resolve({
          id,
          url: soundUrl,
          title: titleMatch ? titleMatch[1].replace(' | Freesound', '').trim() : '',
          desc: descMatch ? descMatch[1] : '',
          mp3: mp3Match ? mp3Match[0] : null,
          duration: durationMatch ? durationMatch[1].trim() : ''
        });
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  const ids = [
    '848778', // Truck, Uhaul, Crank, Open, Squeaky
    '82560',  // car - manual window lift
    '635978', // Window Down/Up on 1979 Mercury Zephyr Sedan
    '419707', // window.wav
    '765464', // car window rolled down
    '833815', // car-window-rolling-up
    '354002', // car windows roll up
    '354003', // car window roll down
    '326391', // CAR window - Opening and closing (SFX)
    '811519', // Window with Compliant Handle, Crank Open, Close
    '407325', // window with heavy metal frame latch open close creak squeak various
    '845623'  // VEHMech-HYUNDAI KONA_Window Crank Exterior
  ];

  console.log('Fetching details for known IDs...');
  const known = [];
  for (const id of ids) {
    const d = await getSoundDetails(id, `https://freesound.org/people/any/sounds/${id}/`);
    if (d && d.mp3) {
      console.log(`[${d.id}] ${d.title} (${d.duration}) -> ${d.mp3}`);
      known.push(d);
    }
  }

  // Also search for more candidates
  const moreQueries = [
    'old car window crank',
    'car window crank handle',
    'window crank squeak',
    'manual window crank car',
    'crank window squeak',
    'ratchet window',
    'window regulator'
  ];

  for (const q of moreQueries) {
    const list = await searchFreesound(q);
    console.log(`\nSearch "${q}" (${list.length}):`);
    for (const item of list.slice(0, 4)) {
      if (!ids.includes(item.id)) {
        ids.push(item.id);
        const d = await getSoundDetails(item.id, item.url);
        if (d && d.mp3) {
          console.log(`  + [${d.id}] ${d.title} -> ${d.mp3}`);
          known.push(d);
        }
      }
    }
  }

  fs.writeFileSync('temp_window_candidates.json', JSON.stringify(known, null, 2));
  console.log(`\nSaved ${known.length} candidates to temp_window_candidates.json`);
})();
