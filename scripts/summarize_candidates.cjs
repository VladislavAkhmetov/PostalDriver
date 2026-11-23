const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../public/sound-samples/wipers');
const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json')));

console.log('--- Candidate Analysis ---');
metadata.forEach((m, idx) => {
  console.log(`\n[${idx + 1}] ID: ${m.id} (${m.key})`);
  console.log(`    Title: ${m.title}`);
  console.log(`    Note: ${m.note}`);
  console.log(`    File: ${m.localFile} (${fs.statSync(path.join(dir, m.localFile)).size} bytes)`);
});
