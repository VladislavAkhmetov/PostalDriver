const https = require('https');

https.get('https://freesound.org/people/LHermanns/sounds/557213/', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const desc = data.match(/<div id="sound_description">([\s\S]*?)<\/div>/);
    console.log('Desc:', desc ? desc[1].trim() : 'none');
  });
});
