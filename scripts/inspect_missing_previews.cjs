const https = require('https');

function fetch(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = 'https://freesound.org' + loc;
        return fetch(loc).then(resolve);
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve(html));
    }).on('error', () => resolve(''));
  });
}

(async () => {
  for (const id of ['438464', '532858', '326391', '845623', '369057', '369060']) {
    const html = await fetch(`https://freesound.org/s/${id}/`);
    const mp3s = html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"'<>]+\.mp3/g) || [];
    console.log(`ID ${id}:`, mp3s);
  }
})();
