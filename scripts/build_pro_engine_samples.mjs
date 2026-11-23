import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9622;
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

  const tasks = [
    // 1. Jeep Standing Idle (from exact same studio Foley session as starter_jeep_long.wav!)
    {
      src: 'temp_studio_foley/jeep_standing_idle_loop.mp3',
      start: 0.2,
      end: 5.6,
      crossfade: 0.6,
      hpf: 125,
      out: 'public/sound-samples/pro_jeep_studio_idle.wav',
      desc: 'Родной Джип — Студийный холостой ход (из той же сессии, что и стартер)'
    },
    // 2. Jeep Driving Slowly (from exact same studio Foley session as starter!)
    {
      src: 'temp_studio_foley/jeep_driving_slowly_loop.mp3',
      start: 2.0,
      end: 10.0,
      crossfade: 0.8,
      hpf: 125,
      out: 'public/sound-samples/pro_jeep_studio_cruise.wav',
      desc: 'Родной Джип — Студийный крейсерский ход (из той же сессии, что и стартер)'
    },
    // 3. Zoom H5 Field Recording (LHermanns)
    {
      src: 'temp_studio_foley/zoom_h5_engine_warmup.mp3',
      start: 1.0,
      end: 9.0,
      crossfade: 0.8,
      hpf: 130,
      out: 'public/sound-samples/pro_zoom_h5_warmup.wav',
      desc: 'Zoom H5 — Прогрев 4-цил мотора (студийный рекордер, кристальная чёткость)'
    },
    // 4. Klankbeeld Classic 4-cylinder (Sennheiser / Sound Devices)
    {
      src: 'temp_studio_foley/klankbeeld_classic_beetle.mp3',
      start: 0.5,
      end: 8.5,
      crossfade: 0.8,
      hpf: 130,
      out: 'public/sound-samples/pro_klankbeeld_classic.wav',
      desc: 'Klankbeeld — Классический 4-цил (Sennheiser, чёткий сухой такт)'
    },
    // 5. Volvo 240 DL Vintage 4-cylinder Idle
    {
      src: 'temp_studio_foley/volvo240_engine.mp3',
      start: 8.0,
      end: 16.0,
      crossfade: 0.8,
      hpf: 125,
      out: 'public/sound-samples/pro_volvo_classic_idle.wav',
      desc: 'Volvo 240 — Ретро 4-цил карбюратор (студийная стерео-запись)'
    }
  ];

  for (const t of tasks) {
    if (!existsSync(t.src)) {
      console.log('Skipping missing:', t.src);
      continue;
    }
    const b64 = readFileSync(t.src).toString('base64');
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
        const eIdx = Math.min(data.length, Math.floor(${t.end} * sr));
        const rawLen = eIdx - sIdx;
        const xLen = Math.floor(${t.crossfade} * sr);
        const outLen = rawLen - xLen;
        const outData = new Float32Array(outLen);

        for (let i = 0; i < outLen; i++) {
          outData[i] = data[sIdx + i];
        }

        // Seamless equal-power crossfade at boundaries
        for (let i = 0; i < xLen; i++) {
          const w = i / xLen;
          const head = data[sIdx + i];
          const tail = data[sIdx + outLen + i];
          // Equal power crossfade
          const gHead = Math.sin(w * Math.PI * 0.5);
          const gTail = Math.cos(w * Math.PI * 0.5);
          outData[i] = head * gHead + tail * gTail;
        }

        // High-pass filter to eliminate boomy bass drone
        const filterCtx = new OfflineAudioContext(1, outLen, sr);
        const bSource = filterCtx.createBufferSource();
        const b = filterCtx.createBuffer(1, outLen, sr);
        b.copyToChannel(outData, 0);
        bSource.buffer = b;

        const hpf = filterCtx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = ${t.hpf};
        hpf.Q.value = 0.7;

        bSource.connect(hpf);
        hpf.connect(filterCtx.destination);
        bSource.start(0);

        const rendered = await filterCtx.startRendering();
        const chData = rendered.getChannelData(0);

        // Normalize peak to 0.88 (-1.1 dBFS)
        let maxPeak = 0;
        for (let i = 0; i < chData.length; i++) {
          const a = Math.abs(chData[i]);
          if (a > maxPeak) maxPeak = a;
        }
        const normFactor = maxPeak > 0 ? 0.88 / maxPeak : 1;

        // Encode 16-bit PCM WAV
        const wavBuffer = new ArrayBuffer(44 + chData.length * 2);
        const view = new DataView(wavBuffer);
        const writeString = (offset, string) => {
          for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + chData.length * 2, true);
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
        view.setUint32(40, chData.length * 2, true);

        for (let i = 0; i < chData.length; i++) {
          let s = Math.max(-1, Math.min(1, chData[i] * normFactor));
          view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        const uint8 = new Uint8Array(wavBuffer);
        let binary = '';
        const chunk = 16384;
        for (let i = 0; i < uint8.length; i += chunk) {
          binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk));
        }
        const b64Out = btoa(binary);
        return { b64Out, dur: chData.length / sr };
      })()`
    });

    const val = res.result ? res.result.value : res.value;
    const binOut = Buffer.from(val.b64Out, 'base64');
    writeFileSync(t.out, binOut);
    console.log(`Saved ${t.out} (${val.dur.toFixed(1)}s): ${t.desc}`);
  }

  ch.kill();
  process.exit(0);
}

main();
