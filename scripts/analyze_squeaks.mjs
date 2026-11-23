import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9452;

const ch = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--remote-debugging-port=${port}`,
  'about:blank'
], { stdio: 'ignore' });

process.on('exit', () => { try { ch.kill(); } catch {} });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await sleep(1000);
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let reqId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = reqId++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const b64_50905 = readFileSync('public/sound-samples/wipers/50905_squeaky_rubber_spray.mp3').toString('base64');
  const b64_733557 = readFileSync('public/sound-samples/wipers/733557_interior_clean_off.mp3').toString('base64');

  const evalCode = `
    (async () => {
      const ctx = new AudioContext({ sampleRate: 44100 });
      async function decode(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return await ctx.decodeAudioData(bytes.buffer);
      }

      function findPeaks(buf) {
        const ch0 = buf.getChannelData(0);
        const step = Math.floor(44100 * 0.05); // 50ms
        const energy = [];
        for (let i = 0; i < ch0.length; i += step) {
          let sum = 0;
          for (let j = 0; j < step && i + j < ch0.length; j++) sum += ch0[i+j] * ch0[i+j];
          energy.push(Math.sqrt(sum / step));
        }
        const peaks = [];
        for (let i = 2; i < energy.length - 2; i++) {
          if (energy[i] > 0.08 && energy[i] > energy[i-1] && energy[i] > energy[i+1] && energy[i] > energy[i-2] && energy[i] > energy[i+2]) {
            peaks.push({ time: +(i * 0.05).toFixed(2), amp: +energy[i].toFixed(3) });
          }
        }
        return peaks;
      }

      const buf1 = await decode('${b64_50905}');
      const buf2 = await decode('${b64_733557}');

      return {
        squeak50905: findPeaks(buf1),
        interior733557: findPeaks(buf2).slice(0, 15)
      };
    })()
  `;

  const res = await send('Runtime.evaluate', {
    expression: evalCode,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Squeak Analysis:', JSON.stringify(res.result.value, null, 2));

  ch.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  ch.kill();
  process.exit(1);
});
