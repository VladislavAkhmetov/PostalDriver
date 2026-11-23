const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../public/sound-samples/wipers');
const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json')));

function getMp3Duration(filepath) {
  const buf = fs.readFileSync(filepath);
  // Simple estimate from bitrate or frame count
  // Standard freesound preview is 128 kbps CBR or VBR
  // Let's find first sync byte (0xFF, 0xFB/FA/F3/F2)
  let offset = 0;
  if (buf.slice(0, 3).toString('ascii') === 'ID3') {
    const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
    offset = 10 + size;
  }
  // Rough duration in seconds assuming ~128kbps (16000 bytes/sec)
  const audioBytes = buf.length - offset;
  return (audioBytes / 16000).toFixed(1);
}

for (const m of metadata) {
  const fp = path.join(dir, m.localFile);
  const dur = getMp3Duration(fp);
  console.log(`${m.localFile}: ~${dur}s | ${m.title}`);
}
