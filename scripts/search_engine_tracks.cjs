const https = require('https');

const queries = [
  'холостой ход',
  'двигатель холостые',
  'двигатель работает',
  'мотор работает',
  'звук мотора уаз',
  'старый джип',
  'карбюратор',
  'автомобиль на холостых',
  'звук двигателя авто'
];

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

async function run() {
  for (const q of queries) {
    const res = await search(q);
    console.log(`=== ${q} (${res.matches.length}) ===`);
    for (const item of res.matches.slice(0, 7)) {
      console.log(` - ${item.name} -> ${item.track}`);
    }
  }
}

run();
