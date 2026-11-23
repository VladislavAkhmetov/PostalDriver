const https = require('https');

function fetch(id) {
  return new Promise(resolve => {
    https.get(`https://freesound.org/s/${id}/`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = 'https://freesound.org' + loc;
        https.get(loc, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res2 => {
          let html = '';
          res2.on('data', c => html += c);
          res2.on('end', () => resolve(html));
        });
        return;
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve(html));
    }).on('error', () => resolve(''));
  });
}

(async () => {
  for (const id of ['419707', '848778', '82560', '635978', '532858', '438464']) {
    const html = await fetch(id);
    const desc = html.match(/<div id="sound_description">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
    const tags = [...html.matchAll(/class="tag"[^>]*>([^<]+)<\/a>/g)].map(x => x[1].trim());
    console.log(`ID ${id}:`);
    console.log(`  Desc: ${desc.slice(0, 150)}`);
    console.log(`  Tags: ${tags.slice(0, 10).join(', ')}`);
  }
})();
