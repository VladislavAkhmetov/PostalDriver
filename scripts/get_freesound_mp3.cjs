const https = require('https');

https.get('https://freesound.org/people/LHermanns/sounds/557213/', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const mp3 = data.match(/https:\/\/[^"']+\.mp3/g);
    console.log('MP3 previews:', mp3);
  });
});
