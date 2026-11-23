const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../public/sound-samples/wipers');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const sounds = [
  { id: '579490', key: 'vintage_1967_vw', note: '1967 Vintage wipers — ретро-механика, натуральный ход кулис и мягкий перестук, дух старого УАЗа' },
  { id: '733557', key: 'interior_clean_off', note: 'Чистая запись из салона авто — скрип резины по стеклу + четкий глухой стук перекладки' },
  { id: '50905', key: 'squeaky_rubber_spray', note: 'RutgerMuller — выразительный резиновый визг/скрип по влажному стеклу' },
  { id: '50904', key: 'slow_squeak_loop', note: 'RutgerMuller — тягучий, фактурный скрип резиновых лезвий' },
  { id: '50903', key: 'slowest_squeak', note: 'RutgerMuller — медленный скрип со звонким резиновым трением' },
  { id: '124737', key: 'robinhood_loopable', note: 'Robinhood76 — реалистичный полный цикл: скольжение + нижний возвратный удар' },
  { id: '237381', key: 'cabin_interior_thud', note: 'Салонный звук с приглушенным моторчиком и отчетливым тупым стуком перекладки' },
  { id: '869005', key: 'noisy_ice_struggle', note: 'Тяжелый уличный звук: плотное трение резины о стекло с металлическим лязгом механизма' },
  { id: '327389', key: 'clean_wipers_interior', note: 'Классические дворники в салоне: мягкий шелест воды и двойной щелчок' }
];

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
  const title = titleMatch ? titleMatch[1].replace(' - Freesound', '').trim() : id;
  return { id, title, mp3: hqMp3 };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve(false);
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return resolve(false);
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close();
        resolve(true);
      });
    }).on('error', (e) => {
      console.error('Download error:', e.message);
      resolve(false);
    });
  });
}

async function main() {
  const results = [];
  for (const s of sounds) {
    console.log(`Fetching [${s.id}]...`);
    const info = await fetchFreesoundInfo(s.id);
    console.log(`  Title: ${info.title}`);
    console.log(`  MP3: ${info.mp3}`);
    const filename = `${s.id}_${s.key}.mp3`;
    const dest = path.join(outDir, filename);
    let downloaded = false;
    if (info.mp3) {
      downloaded = await downloadFile(info.mp3, dest);
      console.log(`  Downloaded: ${downloaded ? fs.statSync(dest).size + ' bytes' : 'FAILED'}`);
    }
    results.push({
      ...s,
      title: info.title,
      mp3Url: info.mp3,
      localFile: filename,
      downloaded
    });
  }
  fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(results, null, 2));
  console.log('Finished downloading all!');
}

main();
