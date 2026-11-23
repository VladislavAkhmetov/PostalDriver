import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const profile = `${os.tmpdir()}/interior_profile_${Date.now()}`;
const port = 9600;
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

  const files = ['jeep_interior_loop.mp3', 'uaz_in_cabin.mp3', 'engine_start_regas.mp3', 'motor_regas_3times.mp3'];
  for (const f of files) {
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
        const dur = audioBuf.duration;
        const sr = audioBuf.sampleRate;
        const data = audioBuf.getChannelData(0);

        let sum = 0, peak = 0, zeroCross = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i];
          const a = Math.abs(v);
          if (a > peak) peak = a;
          sum += v * v;
          if (i > 0 && ((v >= 0 && data[i-1] < 0) || (v < 0 && data[i-1] >= 0))) zeroCross++;
        }
        return {
          dur: +dur.toFixed(2),
          rms: +Math.sqrt(sum / data.length).toFixed(3),
          peak: +peak.toFixed(3),
          approxFreq: Math.round((zeroCross / 2) / dur)
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
