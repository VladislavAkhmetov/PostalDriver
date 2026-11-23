import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9488;

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

  const checkFile = async (name) => {
    const b64 = readFileSync(`public/sound-samples/window/${name}`).toString('base64');
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
          // compute spectrum in speech band 300Hz - 3400Hz vs high frequency squeak >3500Hz
          return { dur: buf.duration.toFixed(2), ch: buf.numberOfChannels };
        })()
      `
    });
    console.log(name, res.result.value);
  };

  await checkFile('manual_window_wav.mp3');
  await checkFile('squeaky_car_window_craigsmith.mp3');
  await checkFile('mercury_1979_down_up.mp3');
  await checkFile('classic_manual_window_lift.mp3');
  await checkFile('uhaul_truck_crank_squeaky.mp3');
  await checkFile('wound_down_up_car.mp3');

  ch.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); ch.kill(); process.exit(1); });
