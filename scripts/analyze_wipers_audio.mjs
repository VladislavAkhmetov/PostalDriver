import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9450;

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

  const b64_vintage = readFileSync('public/sound-samples/wipers/579490_vintage_1967_vw.mp3').toString('base64');
  const b64_squeak = readFileSync('public/sound-samples/wipers/50905_squeaky_rubber_spray.mp3').toString('base64');

  const evalCode = `
    (async () => {
      const ctx = new AudioContext({ sampleRate: 44100 });
      async function decode(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return await ctx.decodeAudioData(bytes.buffer);
      }

      const bufVintage = await decode('${b64_vintage}');
      const bufSqueak = await decode('${b64_squeak}');

      // Find peaks and rhythm in Vintage 1967
      const ch0 = bufVintage.getChannelData(0);
      const step = Math.floor(44100 * 0.05); // 50ms window
      const energy = [];
      for (let i = 0; i < ch0.length; i += step) {
        let sum = 0;
        for (let j = 0; j < step && i + j < ch0.length; j++) sum += ch0[i+j] * ch0[i+j];
        energy.push(Math.sqrt(sum / step));
      }

      // Find local peaks in energy (turnarounds/clunks)
      const peaks = [];
      for (let i = 2; i < energy.length - 2; i++) {
        if (energy[i] > 0.05 && energy[i] > energy[i-1] && energy[i] > energy[i+1] && energy[i] > energy[i-2] && energy[i] > energy[i+2]) {
          peaks.push({ time: (i * 0.05).toFixed(2), amp: energy[i].toFixed(3) });
        }
      }

      return {
        vintage: {
          duration: bufVintage.duration,
          sampleRate: bufVintage.sampleRate,
          channels: bufVintage.numberOfChannels,
          peaks: peaks.slice(0, 15)
        },
        squeak: {
          duration: bufSqueak.duration,
          sampleRate: bufSqueak.sampleRate
        }
      };
    })()
  `;

  const res = await send('Runtime.evaluate', {
    expression: evalCode,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Audio Analysis Result:', JSON.stringify(res.result.value, null, 2));

  ch.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  ch.kill();
  process.exit(1);
});
