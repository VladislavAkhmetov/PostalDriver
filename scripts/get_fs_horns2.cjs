const https = require('https');
const fs = require('fs');
const path = require('path');

const urls = [
  'https://freesound.org/people/krissyeliot/sounds/125520/',
  'https://freesound.org/people/cinemafia/sounds/24074/',
  'https://freesound.org/people/SamsterBirdies/sounds/581602/',
  'https://freesound.org/people/fogma/sounds/26185/',
  'https://freesound.org/people/AmishRob/sounds/423990/'
];

async function checkUrl(u) {
  return new Promise(resolve => {
    https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        const mp3 = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/g)?.[0] || '';
        resolve({ url: u, title: title.replace(' | Freesound', '').trim(), mp3 });
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  for (const u of urls) {
    const info = await checkUrl(u);
    if (info) {
      console.log(info.title);
      console.log(' ', info.mp3);
      if (info.mp3) {
        const fname = path.basename(info.mp3);
        const dest = path.join('temp_horns', fname);
        https.get(info.mp3, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
          res.pipe(fs.createWriteStream(dest)).on('finish', () => console.log('  Downloaded:', fname));
        });
      }
    }
  }
})();
