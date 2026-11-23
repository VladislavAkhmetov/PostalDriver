import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9620;
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
    { f: 'temp_studio_foley/jeep_standing_idle_loop.mp3', label: 'Jeep Standing Idle (Studio Foley)' },
    { f: 'temp_studio_foley/jeep_driving_slowly_loop.mp3', label: 'Jeep Driving Slowly (Studio Foley)' },
    { f: 'temp_studio_foley/jeep_goes_fast_loop.mp3', label: 'Jeep Goes Fast (Studio Foley)' },
    { f: 'temp_studio_foley/zoom_h5_engine_warmup.mp3', label: 'Zoom H5 Engine Warmup (LHermanns)' },
    { f: 'temp_studio_foley/car_starts_engine_revs.mp3', label: 'Car Starts & Revs (Studio Foley)' },
    { f: 'temp_studio_foley/city_bus_start_idle.mp3', label: 'City Bus Idle (Studio Foley)' }
  ];

  for (const item of files) {
    if (!existsSync(item.f)) continue;
    const b64 = readFileSync(item.f).toString('base64');
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

        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);

        return { dur, sr, rms };
      })()`
    });
    const v = res.result.value;
    console.log(`${item.label.padEnd(40)}: Dur = ${v.dur.toFixed(2)}s, RMS = ${v.rms.toFixed(3)}`);
  }

  ch.kill();
  process.exit(0);
}

main();
