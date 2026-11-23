import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const profile = `${os.tmpdir()}/interior_fft_${Date.now()}`;
const port = 9605;
const ch = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { ch.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let list;
  for (let i = 0; i < 40; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (list && list.find((t) => t.type === 'page')) break;
    } catch {}
    await sleep(200);
  }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let reqId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = reqId++;
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');

  for (const f of ['jeep_interior_loop.mp3', 'uaz_in_cabin.mp3']) {
    const b64 = readFileSync(path.join('temp_light_4x4', f)).toString('base64');
    const res = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const bin = atob("${b64}");
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const ctx = new OfflineAudioContext(1, 44100, 44100);
        const audioBuf = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const data = audioBuf.getChannelData(0);
        const sr = audioBuf.sampleRate;
        
        // Calculate energy in frequency bands: sub (30-90Hz), low-mid (90-250Hz), mid (250-1000Hz), high (>1000Hz)
        // using simple biquads in offline context
        async function bandEnergy(f1, f2) {
          const c = new OfflineAudioContext(1, data.length, sr);
          const s = c.createBufferSource();
          s.buffer = audioBuf;
          const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f1;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f2;
          s.connect(hp).connect(lp).connect(c.destination);
          s.start();
          const rendered = await c.startRendering();
          const d = rendered.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
          return Math.sqrt(sum / d.length);
        }

        const sub = await bandEnergy(20, 90);
        const lowMid = await bandEnergy(90, 250);
        const mid = await bandEnergy(250, 1200);
        const high = await bandEnergy(1200, 8000);

        return {
          dur: +audioBuf.duration.toFixed(2),
          sub: +sub.toFixed(4),
          lowMid: +lowMid.toFixed(4),
          mid: +mid.toFixed(4),
          high: +high.toFixed(4)
        };
      })()`
    });
    console.log(f, res.result?.value);
  }

  ch.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  try { ch.kill(); } catch {}
  process.exit(1);
});
