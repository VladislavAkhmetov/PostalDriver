const https = require('https');

https.get('https://zvukipro.com/avto/111-zvuki-gudka-avtomobilya.html', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const audio = html.match(/<audio[\s\S]*?<\/audio>/g) || [];
    console.log('Audio tags:', audio.length);
    audio.slice(0, 5).forEach(a => console.log(a));
    const files = html.match(/\/uploads\/[^\s"'<>]+\.(?:mp3|wav)/g) || [];
    console.log('Uploads:', files.slice(0, 10));
  });
});
