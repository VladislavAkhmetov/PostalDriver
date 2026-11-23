import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9510;

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

  const b64 = readFileSync('public/sound-samples/window/classic_manual_window_lift.mp3').toString('base64');
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
        const ch = buf.getChannelData(0);
        const sr = 44100;

        function printRange(t0, t1) {
          const s0 = Math.floor(t0 * sr);
          const s1 = Math.floor(t1 * sr);
          const step = Math.floor(0.05 * sr);
          const out = [];
          for (let i = s0; i < s1; i += step) {
            let maxV = 0;
            const end = Math.min(i + step, s1);
            for (let j = i; j < end; j++) {
              const v = Math.abs(ch[j]);
              if (v > maxV) maxV = v;
            }
            out.push({ t: (i / sr).toFixed(2), v: maxV.toFixed(2) });
          }
          return out;
        }

        return {
          range1: printRange(21.4, 24.2),
          range2: printRange(27.0, 30.6)
        };
      })()
    `
  });

  console.log('--- Range 1 (Rolling down): 21.4s -> 24.2s ---');
  res.result.value.range1.forEach(p => {
    const bar = '#'.repeat(Math.round(p.v * 30));
    console.log(`  ${p.t}s: ${p.v} ${bar}`);
  });

  console.log('\n--- Range 2 (Rolling up): 27.0s -> 30.6s ---');
  res.result.value.range2.forEach(p => {
    const bar = '#'.repeat(Math.round(p.v * 30));
    console.log(`  ${p.t}s: ${p.v} ${bar}`);
  });

  ch.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); ch.kill(); process.exit(1); });
