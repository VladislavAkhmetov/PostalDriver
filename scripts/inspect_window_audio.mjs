import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9460;

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

  const dir = 'public/sound-samples/window';
  const files = readdirSync(dir).filter(f => f.endsWith('.mp3'));

  console.log(`Analyzing ${files.length} audio files...`);

  for (const f of files) {
    const b64 = readFileSync(path.join(dir, f)).toString('base64');
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
          let peak = 0;
          let sumSquares = 0;
          const ch0 = buf.getChannelData(0);
          for (let i = 0; i < ch0.length; i++) {
            const v = Math.abs(ch0[i]);
            if (v > peak) peak = v;
            sumSquares += v * v;
          }
          const rms = Math.sqrt(sumSquares / ch0.length);
          return {
            duration: buf.duration.toFixed(2),
            channels: buf.numberOfChannels,
            sampleRate: buf.sampleRate,
            peak: peak.toFixed(3),
            rms: rms.toFixed(4)
          };
        })()
      `
    });
    const info = res.result.value;
    console.log(`${f.padEnd(35)} dur: ${info.duration}s | peak: ${info.peak} | rms: ${info.rms} | ${info.channels}ch`);
  }

  ch.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  ch.kill();
  process.exit(1);
});
