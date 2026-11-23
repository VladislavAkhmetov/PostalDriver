import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9470;

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

  const b64_uhaul = readFileSync('public/sound-samples/window/uhaul_truck_crank_squeaky.mp3').toString('base64');
  const b64_smith = readFileSync('public/sound-samples/window/squeaky_car_window_craigsmith.mp3').toString('base64');
  const b64_manual = readFileSync('public/sound-samples/window/manual_window_wav.mp3').toString('base64');
  const b64_mercury = readFileSync('public/sound-samples/window/mercury_1979_down_up.mp3').toString('base64');
  const b64_rubber = readFileSync('public/sound-samples/window/rubber_creak_squeak_zg.mp3').toString('base64');
  const b64_roll_up = readFileSync('public/sound-samples/window/window_rolling_up.mp3').toString('base64');

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

        // Apply gain and fade
        for (let i = 0; i < numSamples; i++) {
          let env = 1.0;
          if (i < inSamples) env = i / inSamples;
          else if (i > numSamples - outSamples) env = (numSamples - i) / outSamples;
          mono[i] *= gain * env;
        }

        // Encode 16-bit PCM WAV
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
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
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

        // Soft limit
        for (let i = 0; i < numSamples; i++) {
          mixed[i] = Math.tanh(mixed[i]);
        }

        // Return as WAV
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
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
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

      const uhaul = await decode("${b64_uhaul}");
      const smith = await decode("${b64_smith}");
      const manual = await decode("${b64_manual}");
      const mercury = await decode("${b64_mercury}");
      const rubber = await decode("${b64_rubber}");
      const rollUp = await decode("${b64_roll_up}");

      // Game wind duration is exactly 1.55s
      const WIND = 1.55;

      // 1. Variant 1: UAZ Authentic (Mechanical crank gear teeth + rubber squeak + bottom/top thud)
      const v1_down = mixBuffers([
        { buf: manual, startSec: 1.0, gain: 0.8, fadeIn: 0.05, fadeOut: 0.08 },
        { buf: smith, startSec: 0.2, gain: 0.65, delaySec: 0.15, fadeIn: 0.1, fadeOut: 0.1 },
        { buf: mercury, startSec: 2.1, gain: 0.7, delaySec: 1.35, fadeIn: 0.01, fadeOut: 0.05 }
      ], WIND);

      const v1_up = mixBuffers([
        { buf: manual, startSec: 4.8, gain: 0.85, fadeIn: 0.05, fadeOut: 0.08 },
        { buf: smith, startSec: 16.5, gain: 0.7, delaySec: 0.1, fadeIn: 0.1, fadeOut: 0.1 },
        { buf: manual, startSec: 10.3, gain: 0.9, delaySec: 1.32, fadeIn: 0.01, fadeOut: 0.05 }
      ], WIND);

      // 2. Variant 2: Heavy U-Haul Truck (Distinct crank friction + high pitched squeak)
      const v2_down = mixBuffers([
        { buf: uhaul, startSec: 0.2, gain: 1.2, fadeIn: 0.04, fadeOut: 0.08 },
        { buf: uhaul, startSec: 4.6, gain: 1.0, delaySec: 0.3, fadeIn: 0.05, fadeOut: 0.08 }
      ], WIND);

      const v2_up = mixBuffers([
        { buf: uhaul, startSec: 4.8, gain: 1.3, fadeIn: 0.04, fadeOut: 0.08 },
        { buf: rollUp, startSec: 2.8, gain: 0.9, delaySec: 1.1, fadeIn: 0.02, fadeOut: 0.05 }
      ], WIND);

      // 3. Variant 3: Vintage 1979 Zephyr (Clean mechanical ratchet clicks & subtle glass drag)
      const v3_down = bufferToWav(mercury, 0.4, WIND, 1.4, 0.04, 0.06);
      const v3_up = bufferToWav(mercury, 4.8, WIND, 1.5, 0.04, 0.06);

      // 4. Variant 4: Craig Smith Squeak Archive (Maximum juicy rubber seal friction)
      const v4_down = bufferToWav(smith, 0.0, WIND, 1.2, 0.05, 0.08);
      const v4_up = bufferToWav(smith, 21.3, WIND, 1.3, 0.05, 0.08);

      return {
        v1_down, v1_up,
        v2_down, v2_up,
        v3_down, v3_up,
        v4_down, v4_up
      };
    })()
  `;

  console.log('Rendering 1.55s tuned game variants...');
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
