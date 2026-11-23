import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9465;

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
  await sleep(1200);
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

  const targets = [
    'uhaul_truck_crank_squeaky.mp3',
    'squeaky_car_window_craigsmith.mp3',
    'manual_window_wav.mp3',
    'mercury_1979_down_up.mp3',
    'turn_crank_squeak_loop.mp3',
    'wound_down_up_car.mp3'
  ];

  for (const t of targets) {
    const b64 = readFileSync(path.join('public/sound-samples/window', t)).toString('base64');
    const res = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        (async () => {
          const ctx = new AudioContext({ sampleRate: 44100 });
          const bin = atob("${b64}");
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const buf = await ctx.decodeAudioData(bytes.buffer);
          const ch0 = buf.getChannelData(0);
          const stepSec = 0.25;
          const stepSamples = Math.floor(stepSec * 44100);
          const blocks = [];
          for (let i = 0; i < ch0.length; i += stepSamples) {
            let maxV = 0;
            let sumSq = 0;
            const end = Math.min(i + stepSamples, ch0.length);
            for (let j = i; j < end; j++) {
              const v = Math.abs(ch0[j]);
              if (v > maxV) maxV = v;
              sumSq += v * v;
            }
            const rms = Math.sqrt(sumSq / (end - i));
            blocks.push({ t: (i / 44100).toFixed(2), peak: maxV.toFixed(2), rms: rms.toFixed(3) });
          }
          return { dur: buf.duration.toFixed(2), blocks };
        })()
      `
    });
    const info = res.result.value;
    console.log(`\n=== ${t} (dur: ${info.dur}s) ===`);
    const activeBlocks = info.blocks.filter(b => parseFloat(b.rms) > 0.015);
    activeBlocks.forEach(b => console.log(`  t=${b.t}s: peak=${b.peak}, rms=${b.rms}`));
  }

  ch.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); ch.kill(); process.exit(1); });
