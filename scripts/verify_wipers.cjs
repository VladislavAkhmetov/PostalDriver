const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../public/sound-samples/wipers');
const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json')));

console.log('Inspecting downloaded wiper files:');
metadata.forEach(m => {
  const p = path.join(dir, m.localFile);
  const size = fs.statSync(p).size;
  console.log(`- ${m.key} (${m.localFile}): ${size} bytes`);
});
