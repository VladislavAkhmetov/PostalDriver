const https = require('https');

function search(q) {
  return new Promise(resolve => {
    https.get('https://zvukogram.com/?r=search&s=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        const matches = [];
        const tracks = b.match(/data-track="([^"]+)"/g) || [];
        for (const t of tracks) {
          const tr = t.match(/data-track="([^"]+)"/)[1];
          matches.push({ name: tr.split('/').pop(), track: tr });
        }
        resolve({ q, matches });
      });
    });
  });
}

const qList = [
  'джип едет',
  'джип звук',
  'мотор джип',
  'внедорожник',
  'автомобиль едет',
  'двигатель авто',
  'легковой автомобиль едет',
  'старый автомобиль'
];

async function run() {
  for (const q of qList) {
    const res = await search(q);
    console.log(`=== ${q} (${res.matches.length}) ===`);
    const foley = res.matches.filter(x => x.track.includes('/33/'));
    console.log(`  Foley /33/ count: ${foley.length}`);
    foley.slice(0, 6).forEach(x => {
      console.log(`   - ${x.name}: https://zvukogram.com${x.track}`);
    });
  }
}

run();
