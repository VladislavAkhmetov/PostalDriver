const https = require('https');

async function searchZvukogram(query) {
  const url = `https://zvukogram.com/?r=search&s=${encodeURIComponent(query)}`;
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const items = [];
        const regex = /data-track="([^"]+)"[\s\S]*?class="song-name"[^>]*>([^<]+)/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
          items.push({ mp3: m[1], name: m[2].trim() });
        }
        resolve(items);
      });
    }).on('error', () => resolve([]));
  });
}

async function searchFreesound(q) {
  return new Promise(resolve => {
    https.get(`https://freesound.org/search/?q=${encodeURIComponent(q)}&f=duration:[0.5+TO+8]`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const matches = [...html.matchAll(/class="sound_title"[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
        const list = matches.map(m => ({ url: 'https://freesound.org' + m[1], title: m[2].trim() }));
        resolve(list);
      });
    }).on('error', () => resolve([]));
  });
}

(async () => {
  const zQueries = [
    'стеклоподъемник',
    'окно машины',
    'открывание окна',
    'закрывание окна',
    'скрип стекла',
    'скрип резины',
    'ручка окна',
    'трещотка'
  ];

  console.log('=== ZVUKOGRAM ===');
  for (const q of zQueries) {
    const res = await searchZvukogram(q);
    console.log(`\n-- ${q} (found: ${res.length}) --`);
    res.slice(0, 8).forEach(r => console.log('  ', r.name, '->', r.mp3));
  }

  const fsQueries = [
    'car window crank',
    'window crank',
    'roll down window',
    'car window roll',
    'window winder',
    'manual window',
    'window squeak car'
  ];

  console.log('\n=== FREESOUND ===');
  for (const q of fsQueries) {
    const res = await searchFreesound(q);
    console.log(`\n-- ${q} (found: ${res.length}) --`);
    res.slice(0, 8).forEach(r => console.log('  ', r.title, '->', r.url));
  }
})();
