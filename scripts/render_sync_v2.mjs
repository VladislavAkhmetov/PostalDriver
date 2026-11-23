import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9520;

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

  const evalCode = `
    (async () => {
      const ctx = new AudioContext({ sampleRate: 44100 });
      const bin = atob("${b64}");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const sr = buf.sampleRate;
      const numCh = buf.numberOfChannels;

      function sliceAndNormalize(startSec, durSec, gain = 1.0, fadeIn = 0.015, fadeOut = 0.04) {
        const startSample = Math.floor(startSec * sr);
        const numSamples = Math.floor(durSec * sr);
        const inSamples = Math.floor(fadeIn * sr);
        const outSamples = Math.floor(fadeOut * sr);

        const mono = new Float32Array(numSamples);
        for (let ch = 0; ch < numCh; ch++) {
          const chData = buf.getChannelData(ch);
          for (let i = 0; i < numSamples; i++) {
            const idx = startSample + i;
            if (idx >= 0 && idx < chData.length) {
              mono[i] += chData[idx] / numCh;
            }
          }
        }

        // Apply gain & fade
        for (let i = 0; i < numSamples; i++) {
          let env = 1.0;
          if (i < inSamples) env = i / inSamples;
          else if (i > numSamples - outSamples) env = (numSamples - i) / outSamples;
          mono[i] *= gain * env;
        }

        // Encode WAV
        const wavBytes = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(wavBytes);
        function writeStr(offset, str) {
          for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        }
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
          const s = Math.max(-1, Math.min(1, mono[i]));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        }

        let binary = '';
        const bArray = new Uint8Array(wavBytes);
        for (let i = 0; i < bArray.length; i++) binary += String.fromCharCode(bArray[i]);
        return btoa(binary);
      }

      // Time-stretch / resample buffer to exact target duration
      function resampleBuffer(startSec, origDurSec, targetDurSec, gain = 1.0) {
        const startSample = Math.floor(startSec * sr);
        const srcLen = Math.floor(origDurSec * sr);
        const tgtLen = Math.floor(targetDurSec * sr);

        const mono = new Float32Array(tgtLen);
        const srcData = new Float32Array(srcLen);
        for (let ch = 0; ch < numCh; ch++) {
          const chData = buf.getChannelData(ch);
          for (let i = 0; i < srcLen; i++) {
            const idx = startSample + i;
            if (idx >= 0 && idx < chData.length) srcData[i] += chData[idx] / numCh;
          }
        }

        // Linear interpolation resample
        const ratio = srcLen / tgtLen;
        for (let i = 0; i < tgtLen; i++) {
          const srcPos = i * ratio;
          const idx0 = Math.floor(srcPos);
          const idx1 = Math.min(idx0 + 1, srcLen - 1);
          const frac = srcPos - idx0;
          mono[i] = (srcData[idx0] * (1 - frac) + srcData[idx1] * frac) * gain;
        }

        // Fades
        const inSamples = Math.floor(0.015 * sr);
        const outSamples = Math.floor(0.03 * sr);
        for (let i = 0; i < tgtLen; i++) {
          let env = 1.0;
          if (i < inSamples) env = i / inSamples;
          else if (i > tgtLen - outSamples) env = (tgtLen - i) / outSamples;
          mono[i] *= env;
        }

        const wavBytes = new ArrayBuffer(44 + tgtLen * 2);
        const view = new DataView(wavBytes);
        function writeStr(offset, str) {
          for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        }
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + tgtLen * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, tgtLen * 2, true);

        let offset = 44;
        for (let i = 0; i < tgtLen; i++) {
          const s = Math.max(-1, Math.min(1, mono[i]));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        }

        let binary = '';
        const bArray = new Uint8Array(wavBytes);
        for (let i = 0; i < bArray.length; i++) binary += String.fromCharCode(bArray[i]);
        return btoa(binary);
      }

      // Natural timing: exactly starts at first contact (21.72s down, 27.68s up)
      // Down: from 21.72 to 23.68 is 1.96s (natural)
      // Up: from 27.68 to 29.68 is 2.00s (natural)
      
      // Exact synchronized 1.55s version (stretched to precisely match 1.55s gameplay timing):
      const v2_sync_155_down = resampleBuffer(21.72, 1.92, 1.55, 1.5);
      const v2_sync_155_up = resampleBuffer(27.68, 1.95, 1.55, 1.6);

      // Exact natural 1.85s version:
      const v2_natural_185_down = sliceAndNormalize(21.72, 1.85, 1.5);
      const v2_natural_185_up = sliceAndNormalize(27.68, 1.85, 1.6);

      return {
        v2_sync_155_down,
        v2_sync_155_up,
        v2_natural_185_down,
        v2_natural_185_up
      };
    })()
  `;

  console.log('Rendering synchronized Variant 2 audio files...');
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
