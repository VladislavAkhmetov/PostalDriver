const https = require('https');

function getWithRedirect(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = 'https://freesound.org' + loc;
        return getWithRedirect(loc).then(resolve);
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve({ url, html, statusCode: res.statusCode }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

(async () => {
  const ids = ['86234', '508281', '109197', '630548'];
  for (const id of ids) {
    const res = await getWithRedirect(`https://freesound.org/s/${id}/`);
    const html = res.html || '';
    const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                  html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
    const mp3 = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/g);
    console.log(`ID ${id}: finalUrl=${res.url}, title=${title}`);
    console.log(`MP3s:`, mp3?.slice(0, 2));
  }
})();
