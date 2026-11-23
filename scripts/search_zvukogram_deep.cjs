const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve(html));
    }).on('error', reject);
  });
}

async function searchZ(q) {
  const html = await fetchUrl(`https://zvukogram.com/?r=search&s=${encodeURIComponent(q)}`);
  // Find all elements with data-track and their names
  const regex = /data-track="([^"]+)"[\s\S]*?(?:data-title="([^"]+)"|<div class="name"[^>]*>([^<]+)|class="title"[^>]*>([^<]+)|<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+))/g;
  const items = [];
  let m;
  // Also simply match all data-track and find nearby title
  const trackRegex = /<div[^>]*class="[^"]*track[^"]*"[^>]*data-track="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g;
  while ((m = trackRegex.exec(html)) !== null) {
    const track = m[1];
    const inner = m[2];
    const titleMatch = inner.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/) ||
                       inner.match(/<a[^>]*>([^<]+)<\/a>/) ||
                       inner.match(/data-title="([^"]+)"/);
    const title = titleMatch ? titleMatch[1].trim() : track;
    items.push({ track: 'https://zvukogram.com' + track, title });
  }
  if (items.length === 0) {
    // Fallback: match any data-track
    const simpleTrack = /data-track="([^"]+)"/g;
    while ((m = simpleTrack.exec(html)) !== null) {
      items.push({ track: 'https://zvukogram.com' + m[1], title: m[1] });
    }
  }
  return items;
}

(async () => {
  const queries = [
    'стеклоподъемник',
    'окно машины',
    'скрип стекла',
    'скрип резины',
    'ручка',
    'трещотка',
    'механизм',
    'шестеренка',
    'рычаг'
  ];
  for (const q of queries) {
    const res = await searchZ(q);
    console.log(`=== Query "${q}" found: ${res.length} ===`);
    res.slice(0, 8).forEach(r => console.log(' ', r.title, '->', r.track));
  }
})();
