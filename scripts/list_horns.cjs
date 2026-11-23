const fs = require('fs');
const path = require('path');

const dir = 'temp_horns';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3'));

console.log(`Found ${files.length} horn files in ${dir}`);
files.forEach(f => {
  const stat = fs.statSync(path.join(dir, f));
  console.log(`- ${f}: ${stat.size} bytes`);
});
