const https = require('https');

https.get('https://freesound.org/people/klankbeeld/sounds/544344/', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const mp3 = data.match(/https:\/\/cdn\.freesound\.org\/previews\/[^"']+\.mp3/g);
    console.log('HQ MP3:', mp3 ? mp3.filter(x => x.includes('hq.mp3')) : 'none');
  });
});
