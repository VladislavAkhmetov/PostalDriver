const https = require('https');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'temp_creak_candidates');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

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

function downloadFile(url, dest) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file).on('finish', () => { file.close(); resolve(true); });
    }).on('error', () => resolve(false));
  });
}

(async () => {
  const ids = JSON.parse(fs.readFileSync('temp_fs_ids.json', 'utf8'));
  const results = [];

  for (const id of ids) {
    const page = await getWithRedirect(`https://freesound.org/s/${id}/`);
    if (!page.html) continue;
    const title = page.html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                  page.html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
    const desc = page.html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] || '';
    const mp3 = page.html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+-hq\.mp3/)?.[0] ||
                page.html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"']+\.mp3/)?.[0];
    
    // Check if relevant by keywords in title or desc
    const combined = (title + ' ' + desc).toLowerCase();
    const isRelevant = /creak|squeak|rattle|spring|suspension|chassis|seat|door|friction|groan|rub/i.test(combined);

    if (mp3 && isRelevant) {
      const dest = path.join(outDir, `${id}.mp3`);
      if (!fs.existsSync(dest)) {
        await downloadFile(mp3, dest);
      }
      const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
      results.push({ id, title: title.replace(/&amp;/g, '&'), desc: desc.slice(0, 150), mp3, size, file: `${id}.mp3` });
      console.log(`[+] Saved ${id} (${size}b): ${title.slice(0, 50)}`);
    }
  }

  fs.writeFileSync('temp_creaks_meta.json', JSON.stringify(results, null, 2));
  console.log(`\nDone. Filtered and downloaded ${results.length} relevant candidates.`);
})();
