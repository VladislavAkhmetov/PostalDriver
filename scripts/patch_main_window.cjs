const fs = require('fs');
let s = fs.readFileSync('src/main.ts', 'utf8');
const target = '  cabin.onWiperEnd = (dir) => audio.wiper(dir);';
const repl = target + '\r\n  cabin.onWindowWind = (down) => audio.windowWind(down);';
s = s.replace(target, repl);
fs.writeFileSync('src/main.ts', s, 'utf8');
console.log('main.ts updated successfully');
