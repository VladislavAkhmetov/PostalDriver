const https = require('https');

const soundIds = [
  '86234',
  '508281',
  '109197',
  '630548',
  '362046',
  '534362',
  '443796',
  '444389',
  '119468',
  '172411',
  '380703'
];

async function inspectSound(id) {
  return new Promise(resolve => {
    https.get(`https://freesound.org/people/any/sounds/${id}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                      html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        const desc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ||
                     html.match(/id="sound_description">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').trim() || '';
        const mp3 = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+-hq\.mp3/)?.[0] ||
                    html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/)?.[0];
        const duration = html.match(/class="duration">([^<]+)<\/span>/)?.[1] ||
                         html.match(/(\d+:\d+(\.\d+)?)/)?.[0] || '';
        resolve({ id, title, duration, mp3, desc: (desc || '').slice(0, 200) });
      });
    }).on('error', (e) => resolve({ id, error: e.message }));
  });
}

(async () => {
  for (const id of soundIds) {
    const info = await inspectSound(id);
    console.log(`\n--- ID: ${info.id} | ${info.title} (${info.duration}) ---`);
    console.log(`MP3: ${info.mp3}`);
    console.log(`Desc: ${info.desc}`);
  }
})();
