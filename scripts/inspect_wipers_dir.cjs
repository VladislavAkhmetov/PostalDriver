const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../public/sound-samples/wipers');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));

console.log('Found files in wipers directory:');
for (const f of files) {
  const stat = fs.statSync(path.join(dir, f));
  console.log(` - ${f} (${stat.size} bytes)`);
}
