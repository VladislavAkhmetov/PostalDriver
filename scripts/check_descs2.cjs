const https = require('https');

function fetch(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve(html));
    });
  });
}

(async () => {
  const html = await fetch('https://freesound.org/people/craigsmith/sounds/438464/');
  console.log(html.match(/<meta property="og:description" content="([^"]*)"/)?.[1]);
  const html2 = await fetch('https://freesound.org/people/14FValtrovaT/sounds/419707/');
  console.log(html2.match(/<meta property="og:description" content="([^"]*)"/)?.[1]);
})();
