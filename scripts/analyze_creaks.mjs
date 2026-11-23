import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9625;
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
    { file: 'temp_creak_candidates/86234.mp3', name: '86234_suspension_creak' },
    { file: 'temp_creak_candidates/751719.mp3', name: '751719_squeaking_suspension' },
    { file: 'temp_creak_candidates/508281.mp3', name: '508281_old_truck_creaks' },
    { file: 'temp_creak_candidates/109197.mp3', name: '109197_car_seat_squeaks' },
    { file: 'temp_creak_candidates/630548.mp3', name: '630548_classic_car_seat' },
    { file: 'temp_creak_candidates/316886.mp3', name: '316886_pobeda_cabin_creaks' },
    { file: 'temp_creak_candidates/380703.mp3', name: '380703_spring_creaks' },
    { file: 'temp_creak_candidates/443796.mp3', name: '443796_cama_rechinando' }
  ];

  for (const item of files) {
    if (!existsSync(item.file)) continue;
    const b64 = readFileSync(item.file).toString('base64');
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

        // Find segments by energy threshold
        const blockSize = Math.floor(sr * 0.05); // 50ms blocks
        const blocks = [];
        for (let i = 0; i < data.length; i += blockSize) {
          let sum = 0;
          for (let j = 0; j < blockSize && i + j < data.length; j++) {
            sum += data[i + j] * data[i + j];
          }
          blocks.push(Math.sqrt(sum / blockSize));
        }

        const maxRms = Math.max(...blocks);
        const thresh = maxRms * 0.15;
        const events = [];
        let inEvent = false;
        let start = 0;

        for (let b = 0; b < blocks.length; b++) {
          const t = (b * blockSize) / sr;
          if (blocks[b] > thresh && !inEvent) {
            inEvent = true;
            start = Math.max(0, t - 0.05);
          } else if (blocks[b] <= thresh && inEvent) {
            // Check if silence persists for 150ms
            let silentAhead = true;
            for (let k = 1; k <= 3 && b + k < blocks.length; k++) {
              if (blocks[b + k] > thresh) { silentAhead = false; break; }
            }
            if (silentAhead) {
              inEvent = false;
              const end = Math.min(dur, t + 0.1);
              if (end - start > 0.12) {
                events.push({ start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), dur: Number((end - start).toFixed(3)) });
              }
            }
          }
        }

        return { dur: Number(dur.toFixed(2)), maxRms: Number(maxRms.toFixed(3)), eventsCount: events.length, events: events.slice(0, 10) };
      })()`
    });

    console.log(`\n=== ${item.name} (${item.file}) ===`);
    console.log(JSON.stringify(res.result?.value, null, 2));
  }

  try { ch.kill(); } catch {}
  process.exit(0);
}

main();
