import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9500;

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
  const b64_mercury = readFileSync('public/sound-samples/window/mercury_1979_down_up.mp3').toString('base64');
  const b64_wound = readFileSync('public/sound-samples/window/wound_down_up_car.mp3').toString('base64');
  const b64_rubber = readFileSync('public/sound-samples/window/rubber_creak_squeak_zg.mp3').toString('base64');

  const evalCode = `
    (async () => {
      const ctx = new AudioContext({ sampleRate: 44100 });
      async function decode(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return await ctx.decodeAudioData(bytes.buffer);
      }

      function bufferToWav(buf, startSec, durSec, gain = 1.0, fadeIn = 0.02, fadeOut = 0.03) {
        const sr = buf.sampleRate;
        const startSample = Math.max(0, Math.floor(startSec * sr));
        const numSamples = Math.floor(durSec * sr);
        const inSamples = Math.floor(fadeIn * sr);
        const outSamples = Math.floor(fadeOut * sr);

        const mono = new Float32Array(numSamples);
        const numCh = buf.numberOfChannels;
        for (let ch = 0; ch < numCh; ch++) {
          const chData = buf.getChannelData(ch);
          for (let i = 0; i < numSamples; i++) {
            const srcIdx = startSample + i;
            if (srcIdx < chData.length) {
              mono[i] += chData[srcIdx] / numCh;
            }
          }
        }

        for (let i = 0; i < numSamples; i++) {
          let env = 1.0;
          if (i < inSamples) env = i / inSamples;
          else if (i > numSamples - outSamples) env = (numSamples - i) / outSamples;
          mono[i] *= gain * env;
        }

        const wavBytes = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(wavBytes);
        function writeString(offset, string) {
          for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
        }
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
          const s = Math.max(-1, Math.min(1, mono[i]));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        }

        let binary = '';
        const bytes = new Uint8Array(wavBytes);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }

      function mixBuffers(layers, durSec) {
        const sr = 44100;
        const numSamples = Math.floor(durSec * sr);
        const mixed = new Float32Array(numSamples);

        for (const layer of layers) {
          const { buf, startSec, gain, fadeIn = 0.02, fadeOut = 0.03, delaySec = 0 } = layer;
          const startSample = Math.max(0, Math.floor(startSec * sr));
          const delaySamples = Math.floor(delaySec * sr);
          const inSamples = Math.floor(fadeIn * sr);
          const outSamples = Math.floor(fadeOut * sr);
          const numCh = buf.numberOfChannels;

          for (let i = 0; i < numSamples - delaySamples; i++) {
            let sampleVal = 0;
            for (let ch = 0; ch < numCh; ch++) {
              const chData = buf.getChannelData(ch);
              const srcIdx = startSample + i;
              if (srcIdx < chData.length) sampleVal += chData[srcIdx] / numCh;
            }
            let env = 1.0;
            if (i < inSamples) env = i / inSamples;
            else if (i > (numSamples - delaySamples) - outSamples) env = ((numSamples - delaySamples) - i) / outSamples;
            mixed[delaySamples + i] += sampleVal * gain * env;
          }
        }

        for (let i = 0; i < numSamples; i++) {
          mixed[i] = Math.tanh(mixed[i]);
        }

        const wavBytes = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(wavBytes);
        function writeString(offset, string) {
          for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
        }
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
          const s = Math.max(-1, Math.min(1, mixed[i]));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        }
        let binary = '';
        const bytes = new Uint8Array(wavBytes);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }

      const lift = await decode("${b64_lift}");
      const uhaul = await decode("${b64_uhaul}");
      const mercury = await decode("${b64_mercury}");
      const wound = await decode("${b64_wound}");
      const rubber = await decode("${b64_rubber}");

      const WIND = 1.55;

      // 1. Опция А: U-Haul Truck (Freesound #848778) - натуральный скрип ручки грузовика
      // Clean isolated crank with squeak, no voices!
      const opt_uhaul_down = bufferToWav(uhaul, 4.4, WIND, 1.6, 0.03, 0.06);
      const opt_uhaul_up = mixBuffers([
        { buf: uhaul, startSec: 4.6, gain: 1.4, fadeIn: 0.03, fadeOut: 0.06 },
        { buf: mercury, startSec: 6.0, gain: 0.9, delaySec: 1.35, fadeIn: 0.01, fadeOut: 0.04 }
      ], WIND);

      // 2. Опция Б: Classic Car Manual Window (Freesound #82560) - чистая запись ручного стеклоподъемника авто
      // 21.4s to 23.0s is clean winding with squeak; 27.5s to 29.5s is winding up to top frame clunk
      const opt_classic_down = bufferToWav(lift, 21.4, WIND, 1.5, 0.04, 0.06);
      const opt_classic_up = bufferToWav(lift, 28.0, WIND, 1.5, 0.04, 0.06);

      // 3. Опция В: 1979 Zephyr Sedan (Freesound #635978) - винтажный механический редуктор ручки
      // 0.3s to 1.85s is rolling down; 4.8s to 6.35s is rolling up
      const opt_zephyr_down = bufferToWav(mercury, 0.3, WIND, 1.7, 0.03, 0.06);
      const opt_zephyr_up = bufferToWav(mercury, 4.8, WIND, 1.8, 0.03, 0.06);

      // 4. Опция Г: Car Window Wound Down & Up (Freesound #532858) - салонная запись кручения ручки с натугой
      // 2.0s to 3.55s is down; 8.0s to 9.55s is up with effort
      const opt_wound_down = bufferToWav(wound, 2.0, WIND, 2.0, 0.04, 0.06);
      const opt_wound_up = bufferToWav(wound, 8.2, WIND, 2.0, 0.04, 0.06);

      // 5. Опция Д: УАЗ-Скрип (Реальный ручной ход 82560 + сухой резиновый скрип бархотки Zvukogram)
      // Чистая механика ручки + сочный скрип резины о стекло, без посторонних шумов
      const opt_uaz_squeak_down = mixBuffers([
        { buf: lift, startSec: 21.4, gain: 1.2, fadeIn: 0.03, fadeOut: 0.06 },
        { buf: rubber, startSec: 1.0, gain: 0.45, delaySec: 0.1, fadeIn: 0.08, fadeOut: 0.08 }
      ], WIND);
      const opt_uaz_squeak_up = mixBuffers([
        { buf: lift, startSec: 28.0, gain: 1.2, fadeIn: 0.03, fadeOut: 0.06 },
        { buf: rubber, startSec: 6.0, gain: 0.4, delaySec: 0.1, fadeIn: 0.08, fadeOut: 0.08 },
        { buf: mercury, startSec: 6.0, gain: 0.8, delaySec: 1.35, fadeIn: 0.01, fadeOut: 0.04 }
      ], WIND);

      return {
        opt_uhaul_down, opt_uhaul_up,
        opt_classic_down, opt_classic_up,
        opt_zephyr_down, opt_zephyr_up,
        opt_wound_down, opt_wound_up,
        opt_uaz_squeak_down, opt_uaz_squeak_up
      };
    })()
  `;

  console.log('Rendering pure manual window sound options (no voices)...');
  const res = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: evalCode
  });

  const waves = res.result.value;
  const outDir = 'public/sound-samples/window';

  for (const [key, b64] of Object.entries(waves)) {
    const fn = path.join(outDir, `${key}.wav`);
    writeFileSync(fn, Buffer.from(b64, 'base64'));
    console.log(`Saved ${fn}`);
  }

  ch.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); ch.kill(); process.exit(1); });
