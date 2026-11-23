import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
if (!chromePath) process.exit(1);

const profile = `${os.tmpdir()}/light_4x4_${Date.now()}`;
try { mkdirSync(profile, { recursive: true }); } catch {}
const port = 9610;
const ch = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { ch.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let list;
  for (let i = 0; i < 40; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (list && list.find((t) => t.type === 'page')) break;
    } catch {}
    await sleep(200);
  }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let reqId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = reqId++;
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');

  const tasks = [
    {
      dir: 'temp_light_4x4',
      src: 'jeep_interior_loop.mp3',
      start: 0.5,
      end: 8.5,
      crossfade: 0.8,
      highpass: 110,
      out: 'engine_jeep_cabin_loop.wav',
      desc: 'Запись в салоне джипа (срез саб-гула ниже 110 Гц)'
    },
    {
      dir: 'temp_light_4x4',
      src: 'uaz_in_cabin.mp3',
      start: 10.0,
      end: 18.0,
      crossfade: 0.8,
      highpass: 120,
      out: 'engine_uaz_cabin_light.wav',
      desc: 'УАЗ в салоне (легкий ход без низкого гула)'
    },
    {
      dir: 'temp_uaz_audio',
      src: 'uaz_ignition_v2.mp3',
      start: 61.0,
      end: 67.0,
      crossfade: 0.5,
      highpass: 115,
      out: 'engine_uaz_pull_clean.wav',
      desc: 'Родной разгон УАЗа с отсеченным саб-гулом (HPF 115 Гц)'
    },
    {
      dir: 'temp_uaz_audio',
      src: 'uaz_ignition_v2.mp3',
      start: 12.0,
      end: 18.0,
      crossfade: 0.5,
      highpass: 115,
      out: 'engine_uaz_idle_clean.wav',
      desc: 'Родной холостой УАЗа с отсеченным саб-гулом (HPF 115 Гц)'
    }
  ];

  for (const t of tasks) {
    const fPath = path.join(t.dir, t.src);
    if (!existsSync(fPath)) {
      console.log('Missing:', fPath);
      continue;
    }
    const b64 = readFileSync(fPath).toString('base64');
    const res = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const bin = atob("${b64}");
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const ctx = new OfflineAudioContext(1, 44100, 44100);
        const audioBuf = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const sr = audioBuf.sampleRate;
        const data = audioBuf.getChannelData(0);

        const sIdx = Math.floor(${t.start} * sr);
        const eIdx = Math.floor(${t.end} * sr);
        const rawLen = eIdx - sIdx;
        const xLen = Math.floor(${t.crossfade} * sr);
        const outLen = rawLen - xLen;
        const outData = new Float32Array(outLen);

        for (let i = 0; i < outLen; i++) {
          outData[i] = data[sIdx + i];
        }

        // Crossfade
        for (let i = 0; i < xLen; i++) {
          const w = i / xLen;
          const headVal = data[sIdx + i];
          const tailVal = data[sIdx + outLen + i];
          const cosW = Math.cos(w * Math.PI * 0.5);
          const sinW = Math.sin(w * Math.PI * 0.5);
          outData[i] = headVal * sinW + tailVal * cosW;
        }

        // Render through high-pass filter to strip annoying sub-bass rumble
        const filterCtx = new OfflineAudioContext(1, outLen, sr);
        const bufNode = filterCtx.createBuffer(1, outLen, sr);
        bufNode.copyToChannel(outData, 0);
        const srcNode = filterCtx.createBufferSource();
        srcNode.buffer = bufNode;
        
        const hpf = filterCtx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = ${t.highpass};
        hpf.Q.value = 0.65;

        // Mild dip at 150 Hz to clear boomy boxiness
        const notch = filterCtx.createBiquadFilter();
        notch.type = 'peaking';
        notch.frequency.value = 150;
        notch.gain.value = -3.0;
        notch.Q.value = 1.0;

        srcNode.connect(hpf).connect(notch).connect(filterCtx.destination);
        srcNode.start();
        const rendered = await filterCtx.startRendering();
        const cleanData = rendered.getChannelData(0);

        // Normalize
        let maxPeak = 0;
        for (let i = 0; i < outLen; i++) {
          const a = Math.abs(cleanData[i]);
          if (a > maxPeak) maxPeak = a;
        }
        const gain = maxPeak > 0.001 ? 0.88 / maxPeak : 1;
        for (let i = 0; i < outLen; i++) {
          cleanData[i] = Math.max(-1, Math.min(1, cleanData[i] * gain));
        }

        // Encode WAV
        const numChannels = 1;
        const byteRate = sr * numChannels * 2;
        const blockAlign = numChannels * 2;
        const dataSize = outLen * 2;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        function writeString(offset, str) {
          for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        }
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        let offset = 44;
        for (let i = 0; i < outLen; i++) {
          const s = Math.max(-1, Math.min(1, cleanData[i]));
          const pcm = s < 0 ? s * 0x8000 : s * 0x7FFF;
          view.setInt16(offset, pcm, true);
          offset += 2;
        }

        const wavBytes = new Uint8Array(buffer);
        let outB64 = '';
        const chunk = 8192;
        for (let i = 0; i < wavBytes.length; i += chunk) {
          outB64 += String.fromCharCode.apply(null, wavBytes.subarray(i, i + chunk));
        }
        return {
          dur: +(outLen / sr).toFixed(2),
          wavB64: btoa(outB64)
        };
      })()`
    });

    const val = res.result?.value;
    if (val && val.wavB64) {
      const outBuf = Buffer.from(val.wavB64, 'base64');
      const destPath = path.join('public', 'sound-samples', t.out);
      writeFileSync(destPath, outBuf);
      console.log(`Saved ${t.out} (${val.dur}s): ${t.desc}`);
    }
  }

  ch.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  try { ch.kill(); } catch {}
  process.exit(1);
});
