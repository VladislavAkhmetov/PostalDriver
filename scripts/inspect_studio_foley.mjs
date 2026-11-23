import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9616;
const ch = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { ch.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await sleep(1000);
  let list;
  for (let i = 0; i < 30; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (list && list.find((t) => t.type === 'page')) break;
    } catch {}
    await sleep(150);
  }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let reqId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = reqId++;
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === id) { ws.removeEventListener('message', handler); resolve(msg.result); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');

  const files = [
    'jeep_starter_difficult.mp3',
    'jeep_standing_idle_loop.mp3',
    'jeep_driving_slowly_loop.mp3',
    'jeep_goes_fast_loop.mp3',
    'uaz_drives_up_and_goes.mp3',
    'car_starts_engine_revs.mp3',
    'city_bus_start_idle.mp3'
  ];

  for (const f of files) {
    const p = `temp_studio_foley/${f}`;
    if (!existsSync(p)) continue;
    const b64 = readFileSync(p).toString('base64');
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
        const ch = audioBuf.numberOfChannels;
        const data = audioBuf.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        return { dur, ch, rms };
      })()`
    });
    const v = res.result.value;
    console.log(`${f.padEnd(30)}: Dur = ${v.dur.toFixed(2)}s, RMS = ${v.rms.toFixed(3)}`);
  }

  ch.kill();
  process.exit(0);
}

main();
