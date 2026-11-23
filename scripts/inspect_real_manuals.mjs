import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9495;

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

  const b64_lift = readFileSync('public/sound-samples/window/classic_manual_window_lift.mp3').toString('base64');
  const b64_uhaul = readFileSync('public/sound-samples/window/uhaul_truck_crank_squeaky.mp3').toString('base64');
  const b64_wound = readFileSync('public/sound-samples/window/wound_down_up_car.mp3').toString('base64');
  const b64_mercury = readFileSync('public/sound-samples/window/mercury_1979_down_up.mp3').toString('base64');
  const b64_rubber = readFileSync('public/sound-samples/window/rubber_creak_squeak_zg.mp3').toString('base64');
  const b64_crank = readFileSync('public/sound-samples/window/turn_crank_squeak_loop.mp3').toString('base64');

  const evalCode = `
    (async () => {
      const ctx = new AudioContext({ sampleRate: 44100 });
      async function decode(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return await ctx.decodeAudioData(bytes.buffer);
      }

      const lift = await decode("${b64_lift}");
      const uhaul = await decode("${b64_uhaul}");
      const wound = await decode("${b64_wound}");
      const mercury = await decode("${b64_mercury}");
      const rubber = await decode("${b64_rubber}");
      const crank = await decode("${b64_crank}");

      function analyzeEvents(buf, label) {
        const ch = buf.getChannelData(0);
        const step = 0.5 * 44100;
        const events = [];
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
          if (rms > 0.012) {
            events.push({ t: (i / 44100).toFixed(1) + 's', pk: pk.toFixed(2), rms: rms.toFixed(3) });
          }
        }
        return { label, dur: buf.duration.toFixed(1) + 's', events };
      }

      return [
        analyzeEvents(lift, '82560 classic_manual_window_lift'),
        analyzeEvents(uhaul, '848778 uhaul_truck_crank_squeaky'),
        analyzeEvents(wound, '532858 wound_down_up_car'),
        analyzeEvents(mercury, '635978 mercury_1979_down_up'),
        analyzeEvents(rubber, 'rubber_creak_squeak_zg'),
        analyzeEvents(crank, 'turn_crank_squeak_loop')
      ];
    })()
  `;

  const res = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: evalCode
  });

  for (const item of res.result.value) {
    console.log(`\n=== ${item.label} (${item.dur}) ===`);
    item.events.forEach(e => console.log(`  ${e.t}: pk=${e.pk}, rms=${e.rms}`));
  }

  ch.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); ch.kill(); process.exit(1); });
