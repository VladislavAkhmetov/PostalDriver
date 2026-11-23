import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const defaultChrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9396;
const ch = spawn(defaultChrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, 'http://localhost:3000/shift-preview.html'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

let list;
for (let i = 0; i < 30; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    if (list?.find(t => t.type === 'page')) break;
  } catch {}
  await sleep(150);
}
const page = list?.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));

let id = 1;
function send(method, params = {}) {
  return new Promise(resolve => {
    const curId = id++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });
}

// Extract trimmed and normalized audio as base64 WAV
const evalRes = await send('Runtime.evaluate', {
  expression: `(async () => {
    const c = new AudioContext();
    const res = await fetch('/sound-samples/629324_13885154-lq.mp3');
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    const data = buf.getChannelData(0);

    // Find start of sound (threshold > 0.02)
    let startIdx = 0;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > 0.025) {
        startIdx = Math.max(0, i - Math.floor(buf.sampleRate * 0.01)); // keep 10ms pre-attack
        break;
      }
    }

    // Find end of click (after sound drops back down or max 0.45s duration)
    const maxLen = Math.floor(buf.sampleRate * 0.5);
    const endIdx = Math.min(data.length, startIdx + maxLen);
    const sliced = data.slice(startIdx, endIdx);

    // Peak normalize to 0.88
    let max = 0;
    for (let i = 0; i < sliced.length; i++) {
      const a = Math.abs(sliced[i]);
      if (a > max) max = a;
    }
    const gain = max > 0 ? (0.88 / max) : 1;
    for (let i = 0; i < sliced.length; i++) {
      sliced[i] *= gain;
    }

    // Encode to 16-bit mono WAV
    const sr = buf.sampleRate;
    const numSamples = sliced.length;
    const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuffer);

    function writeString(offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sr, true); // Sample rate
    view.setUint32(28, sr * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, sliced[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    // Convert to binary string
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  })()`,
  awaitPromise: true,
  returnByValue: true
});

const b64 = evalRes?.result?.value;
if (b64) {
  const buf = Buffer.from(b64, 'base64');
  writeFileSync('src/assets/cabin/gear_shift.wav', buf);
  writeFileSync('src/assets/cabin/gear_shift.mp3', buf); // also keep mp3 path updated
  console.log(`Saved trimmed, boosted gear_shift: ${buf.length} bytes`);
} else {
  console.log('Failed to extract b64');
}

ch.kill();
process.exit(0);
