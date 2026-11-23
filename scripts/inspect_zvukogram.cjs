const https = require('https');

https.get('https://zvukogram.com/?r=search&s=' + encodeURIComponent('гудок'), {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const mp3s = html.match(/https?:\/\/[^\s"'<>]+\.mp3/g) || [];
    console.log('MP3 count:', mp3s.length);
    console.log(mp3s.slice(0, 15));
    // Check titles around mp3s
    const blocks = html.match(/<div class="[^"]*track[^"]*"[\s\S]*?<\/div>/g) || [];
    console.log('Track blocks count:', blocks.length);
    // Find all links or text
    const re = /data-track="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) console.log('track:', m[1]);
    const re2 = /data-title="([^"]+)"/g;
    while ((m = re2.exec(html)) !== null) console.log('title:', m[1]);
  });
});
