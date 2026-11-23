const fs = require('fs');
const path = require('path');

function normalizeWav(srcPath, destPath, targetPeak = 0.85) {
  const buf = fs.readFileSync(srcPath);
  let max = 0;
  for (let i = 44; i < buf.length; i += 2) {
    const val = Math.abs(buf.readInt16LE(i));
    if (val > max) max = val;
  }
  if (max === 0) return;
  const currentRatio = max / 32767;
  const gain = targetPeak / currentRatio;
  console.log(`Normalizing ${path.basename(srcPath)}: max was ${max} (${(currentRatio*100).toFixed(1)}%), gain = ${gain.toFixed(2)}x`);

  const outBuf = Buffer.from(buf);
  for (let i = 44; i < outBuf.length; i += 2) {
    let s = outBuf.readInt16LE(i) * gain;
    s = Math.max(-32767, Math.min(32767, Math.round(s)));
    outBuf.writeInt16LE(s, i);
  }
  fs.writeFileSync(destPath, outBuf);
}

const dir = 'src/assets/cabin';
const pubDir = 'public/sound-samples/wipers';

['wiper_up.wav', 'wiper_down.wav', 'wiper_squeak1.wav', 'wiper_squeak2.wav'].forEach(f => {
  normalizeWav(path.join(dir, f), path.join(dir, f), 0.85);
});

// Also normalize in public/sound-samples/wipers
['upStroke.wav', 'downStroke.wav', 'bottomBump.wav', 'squeak1.wav', 'squeak2.wav'].forEach(f => {
  if (fs.existsSync(path.join(pubDir, f))) {
    normalizeWav(path.join(pubDir, f), path.join(pubDir, f), 0.85);
  }
});

console.log('Normalization complete!');
