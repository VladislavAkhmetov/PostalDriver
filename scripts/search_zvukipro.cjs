const https = require('https');

async function searchZvukiPro(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        const mp3s = html.match(/https?:\/\/[^\s"'<>]+\.mp3/g) || [];
        const titles = html.match(/class="title"[^>]*>([\s\S]*?)<\/div>/g) || [];
        resolve({ mp3s, htmlLength: html.length, sampleHtml: html.slice(0, 500) });
      });
    }).on('error', () => resolve({ mp3s: [] }));
  });
}

(async () => {
  const r1 = await searchZvukiPro('https://zvukipro.com/avto/111-zvuki-gudka-avtomobilya.html');
  console.log('r1 mp3s:', r1.mp3s.slice(0, 10));
  const r2 = await searchZvukiPro('https://zvukipro.com/avto/625-zvuki-klaksona-starogo-avtomobilya.html');
  console.log('r2 mp3s:', r2.mp3s.slice(0, 10));
})();
