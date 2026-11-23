const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve(html));
    }).on('error', () => resolve(''));
  });
}

async function searchZvukiPro(query) {
  // zvukipro search url
  const html = await fetchUrl(`https://zvukipro.com/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`);
  const matches = [...html.matchAll(/<a[^>]*href="(https:\/\/zvukipro\.com\/[^\"]+\.html)"[^>]*>([^<]+)<\/a>/g)];
  return matches.map(m => ({ url: m[1], title: m[2].trim() }));
}

async function searchZvukogram(query) {
  const html = await fetchUrl(`https://zvukogram.com/?r=search&s=${encodeURIComponent(query)}`);
  const tracks = [...html.matchAll(/data-track="([^"]+)"[\s\S]*?class="title"[^>]*>([^<]+)/g)];
  if (tracks.length > 0) {
    return tracks.map(t => ({ url: 'https://zvukogram.com' + t[1], title: t[2].trim() }));
  }
  const simple = [...html.matchAll(/data-track="([^"]+)"/g)];
  return simple.map(s => ({ url: 'https://zvukogram.com' + s[1], title: s[1] }));
}

(async () => {
  console.log('--- ZvukiPro ---');
  for (const q of ['стеклоподъемник', 'стекло машины', 'окно машины', 'ручка стеклоподъемника']) {
    const list = await searchZvukiPro(q);
    console.log(`ZvukiPro "${q}": found ${list.length}`);
    list.slice(0, 5).forEach(item => console.log('  ', item.title, '->', item.url));
  }

  console.log('\n--- Zvukogram ---');
  for (const q of ['стеклоподъемник', 'ручной стеклоподъемник', 'стекло авто', 'ручка окна']) {
    const list = await searchZvukogram(q);
    console.log(`Zvukogram "${q}": found ${list.length}`);
    list.slice(0, 8).forEach(item => console.log('  ', item.title, '->', item.url));
  }
})();
