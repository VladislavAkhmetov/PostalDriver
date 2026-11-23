const fs = require('fs');
let s = fs.readFileSync('src/audio/AudioEngine.ts', 'utf8');

// 1. Add imports
const importTarget = "import wiperDownUrl from '../assets/cabin/wiper_down.wav?url';";
const importRepl = importTarget + "\r\nimport windowDownUrl from '../assets/cabin/window_down.wav?url';\r\nimport windowUpUrl from '../assets/cabin/window_up.wav?url';";
s = s.replace(importTarget, importRepl);

// 2. Add buffers properties
const bufTarget = 'private wiperDownBuffer: AudioBuffer | null = null;';
const bufRepl = bufTarget + '\r\n  private windowDownBuffer: AudioBuffer | null = null;\r\n  private windowUpBuffer: AudioBuffer | null = null;';
s = s.replace(bufTarget, bufRepl);

// 3. Load buffers in loadBuf Promise.all
const loadTarget = 'loadBuf(wiperDownUrl),';
const loadRepl = loadTarget + '\r\n          loadBuf(windowDownUrl),\r\n          loadBuf(windowUpUrl),';
s = s.replace(loadTarget, loadRepl);

// 4. Assign loaded buffers
const assignTarget = 'const [hbPull, hbRel, swOn, swOff, swClk, gShift, gSlide, wiper, wUp, wDown, wSq1, wSq2]';
const assignRepl = 'const [hbPull, hbRel, swOn, swOff, swClk, gShift, gSlide, wiper, wUp, wDown, winDown, winUp, wSq1, wSq2]';
s = s.replace(assignTarget, assignRepl);

const assignBufTarget = 'this.wiperDownBuffer = wDown;';
const assignBufRepl = assignBufTarget + '\r\n        this.windowDownBuffer = winDown;\r\n        this.windowUpBuffer = winUp;';
s = s.replace(assignBufTarget, assignBufRepl);

// 5. Add windowWind method
const methodTarget = '  wiper(dir = 1): void {';
const methodRepl = '  windowWind(down = true): void {\r\n    if (!this.ctx) return;\r\n    const buf = down ? this.windowDownBuffer : this.windowUpBuffer;\r\n    if (buf) {\r\n      this.playSample(buf, this.master, 0.72, 0.98 + Math.random() * 0.04);\r\n    } else {\r\n      this.burst(\'pink\', \'bandpass\', 1800, 2, 0.04, 1.55);\r\n    }\r\n  }\r\n' + methodTarget;
s = s.replace(methodTarget, methodRepl);

fs.writeFileSync('src/audio/AudioEngine.ts', s, 'utf8');
console.log('AudioEngine.ts patched successfully');
