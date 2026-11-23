import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9455;

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
  await sleep(1000);
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

  const b64_vintage = readFileSync('public/sound-samples/wipers/579490_vintage_1967_vw.mp3').toString('base64');
  const b64_squeak = readFileSync('public/sound-samples/wipers/50905_squeaky_rubber_spray.mp3').toString('base64');

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
        const startSample = Math.floor(startSec * sr);
        const numSamples = Math.floor(durSec * sr);
        const inSamples = Math.floor(fadeIn * sr);
        const outSamples = Math.floor(fadeOut * sr);

        // Mix down to mono
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

        // Apply gain & fade in/out
        for (let i = 0; i < numSamples; i++) {
          let env = 1.0;
          if (i < inSamples) env = i / inSamples;
          else if (i > numSamples - outSamples) env = (numSamples - i) / outSamples;
          mono[i] *= gain * env;
        }

        // Encode to 16-bit PCM WAV
        const wavBytes = new Uint8Array(44 + numSamples * 2);
        const view = new DataView(wavBytes.buffer);

        function writeString(offset, str) {
          for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        }

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // mono
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * 2, true); // byte rate
        view.setUint16(32, 2, true); // block align
        view.setUint16(34, 16, true); // 16-bit
        writeString(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
          const s = Math.max(-1, Math.min(1, mono[i]));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        }

        let binary = '';
        const len = wavBytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(wavBytes[i]);
        }
        return btoa(binary);
      }

      const bufVintage = await decode('${b64_vintage}');
      const bufSqueak = await decode('${b64_squeak}');

      // Let's extract:
      // 1. Vintage Up stroke (sweep upwards, no bottom bump): ~0.80s
      // Between peaks: 1.80 is a strong peak, 2.65 is turnaround, 3.55 is strong bottom peak.
      // From 1.82 to 2.62 = 0.80s (up stroke)
      // From 2.62 to 3.52 = 0.90s (down stroke ending in bottom bump)
      // Bottom bump alone: 3.42 to 3.72 = 0.30s
      const upStroke = bufferToWav(bufVintage, 1.85, 0.78, 1.1, 0.02, 0.04);
      const downStroke = bufferToWav(bufVintage, 2.65, 0.88, 1.1, 0.02, 0.04);
      const bottomBump = bufferToWav(bufVintage, 3.40, 0.28, 1.25, 0.01, 0.03);

      // Squeaks:
      // In 50905, peaks around 1.95 and 3.45 and 6.50
      // 1.85 to 2.35 = 0.50s squeak A
      // 6.35 to 6.85 = 0.50s squeak B
      // 7.85 to 8.40 = 0.55s squeak C
      const squeak1 = bufferToWav(bufSqueak, 1.82, 0.50, 0.85, 0.03, 0.05);
      const squeak2 = bufferToWav(bufSqueak, 6.38, 0.52, 0.85, 0.03, 0.05);
      const squeak3 = bufferToWav(bufSqueak, 7.88, 0.52, 0.85, 0.03, 0.05);

      return {
        upStroke,
        downStroke,
        bottomBump,
        squeak1,
        squeak2,
        squeak3
      };
    })()
  `;

  const res = await send('Runtime.evaluate', {
    expression: evalCode,
    awaitPromise: true,
    returnByValue: true
  });

  const val = res.result.value;
  const outDir = 'public/sound-samples/wipers';

  for (const [name, b64] of Object.entries(val)) {
    const filePath = path.join(outDir, `${name}.wav`);
    writeFileSync(filePath, Buffer.from(b64, 'base64'));
    console.log(`Saved ${filePath} (${Buffer.from(b64, 'base64').length} bytes)`);
  }

  ch.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  ch.kill();
  process.exit(1);
});
