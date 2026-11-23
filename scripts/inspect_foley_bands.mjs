import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9617;
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

  const p = 'temp_studio_foley/jeep_starter_difficult.mp3';
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
      const sr = audioBuf.sampleRate;
      const data = audioBuf.getChannelData(0);
      const list = [];
      for (let t = 0; t < audioBuf.duration; t += 0.2) {
        let sum = 0;
        const s = Math.floor(t * sr);
        const len = Math.floor(0.2 * sr);
        for (let i = 0; i < Math.min(len, data.length - s); i++) sum += data[s + i] * data[s + i];
        list.push({ t: t.toFixed(2), rms: Math.sqrt(sum / len).toFixed(3) });
      }
      return { dur: audioBuf.duration, list };
    })()`
  });
  console.log('jeep_starter_difficult duration:', res.result.value.dur);
  res.result.value.list.forEach(r => {
    const bar = '#'.repeat(Math.round(r.rms * 80));
    console.log(`${r.t.padStart(5)}s: ${r.rms} ${bar}`);
  });

  ch.kill();
  process.exit(0);
}

main();
