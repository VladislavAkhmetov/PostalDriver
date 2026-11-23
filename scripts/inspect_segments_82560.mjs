import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9505;

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
        
        // Detailed RMS every 100ms
        const step = Math.floor(0.1 * sr);
        const detailed = [];
        for (let i = 0; i < ch.length; i += step) {
          let pk = 0;
          let sum = 0;
          const end = Math.min(i + step, ch.length);
          for (let j = i; j < end; j++) {
            const v = Math.abs(ch[j]);
            if (v > pk) pk = v;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / (end - i));
          if (rms > 0.01) {
            detailed.push({ t: (i / sr).toFixed(2), pk: pk.toFixed(2), rms: rms.toFixed(3) });
          }
        }
        return { dur: buf.duration.toFixed(2), count: detailed.length, detailed };
      })()
    `
  });

  console.log('Total duration:', res.result.value.dur);
  // Group continuous sound segments
  const d = res.result.value.detailed;
  let segStart = null;
  let lastT = null;
  const segs = [];
  for (const item of d) {
    const t = parseFloat(item.t);
    if (segStart === null) {
      segStart = t;
    } else if (t - lastT > 0.35) {
      segs.push({ start: segStart, end: lastT, dur: (lastT - segStart + 0.1).toFixed(2) });
      segStart = t;
    }
    lastT = t;
  }
  if (segStart !== null) segs.push({ start: segStart, end: lastT, dur: (lastT - segStart + 0.1).toFixed(2) });
  
  console.log('Segments found in 82560:');
  segs.forEach(s => console.log(`  Segment: ${s.start}s -> ${s.end}s (dur: ${s.dur}s)`));

  ch.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); ch.kill(); process.exit(1); });
