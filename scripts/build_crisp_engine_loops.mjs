import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9615;
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
    // 1. Бесшовное продолжение эталонного УАЗа (сразу после схватывания стартера)
    {
      src: 'temp_uaz_audio/uaz_ignition_v2.mp3',
      start: 4.2,
      end: 12.2,
      crossfade: 0.8,
      hpf: 125,
      notch: 150,
      out: 'public/sound-samples/engine_uaz_direct_continuation.wav',
      desc: 'Прямое бесшовное продолжение эталонного УАЗа (из той же записи сразу после пуска, без баса)'
    },
    // 2. УАЗ устойчивый ровный холостой ход (из той же записи, середина)
    {
      src: 'temp_uaz_audio/uaz_ignition_v2.mp3',
      start: 22.0,
      end: 30.0,
      crossfade: 0.8,
      hpf: 125,
      notch: 150,
      out: 'public/sound-samples/engine_uaz_steady_idle.wav',
      desc: 'УАЗ устойчивый холостой ход (та же запись, 22-30с, ровный четкий такт)'
    },
    // 3. УАЗ четкая перегазовка/разгон (из той же записи, 60-66с)
    {
      src: 'temp_uaz_audio/uaz_ignition_v2.mp3',
      start: 60.0,
      end: 66.5,
      crossfade: 0.6,
      hpf: 125,
      notch: 150,
      out: 'public/sound-samples/engine_uaz_crisp_rev.wav',
      desc: 'УАЗ четкий разгон/обороты (та же запись, 60-66с, без саб-гула)'
    },
    // 4. Стоящий джип — чистый звук двигателя без движения кузова
    {
      src: 'temp_engine_candidates/jeep_standing_loop.mp3',
      start: 0.5,
      end: 5.5,
      crossfade: 0.6,
      hpf: 130,
      notch: 0,
      out: 'public/sound-samples/engine_jeep_standing_crisp.wav',
      desc: 'Стоящий внедорожник — чистый звук двигателя без движения кузова (HPF 130 Гц)'
    },
    // 5. Бодрый классический 4-цилиндровый мотор (сухое отчетливое тарахтение)
    {
      src: 'temp_engine_candidates/peppy_engine.mp3',
      start: 0.2,
      end: 2.5,
      crossfade: 0.4,
      hpf: 135,
      notch: 0,
      out: 'public/sound-samples/engine_peppy_4cyl_crisp.wav',
      desc: 'Бодрый 4-цилиндровый мотор — сухое отчетливое тарахтение в средних частотах'
    },
    // 6. Ровная работа старого карбюраторного мотора (Long Engine Op)
    {
      src: 'temp_engine_candidates/long_engine_op.mp3',
      start: 1.0,
      end: 8.5,
      crossfade: 0.7,
      hpf: 130,
      notch: 0,
      out: 'public/sound-samples/engine_classic_carb_smooth.wav',
      desc: 'Старый карбюраторный мотор — ровная уверенная работа (HPF 130 Гц)'
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

        // Crossfade for seamless looping
        for (let i = 0; i < xLen; i++) {
          const w = i / xLen;
          const head = data[sIdx + i];
          const tail = data[sIdx + outLen + i];
          outData[i] = head * w + tail * (1 - w);
        }

        // Offline filter processing (High-Pass + optional Notch)
        const filterCtx = new OfflineAudioContext(1, outLen, sr);
        const bSource = filterCtx.createBufferSource();
        const b = filterCtx.createBuffer(1, outLen, sr);
        b.copyToChannel(outData, 0);
        bSource.buffer = b;

        const hpf = filterCtx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = ${t.hpf};
        hpf.Q.value = 0.7;

        let lastNode = hpf;
        if (${t.notch} > 0) {
          const notch = filterCtx.createBiquadFilter();
          notch.type = 'peaking';
          notch.frequency.value = ${t.notch};
          notch.gain.value = -3.5;
          notch.Q.value = 1.2;
          hpf.connect(notch);
          lastNode = notch;
        }

        bSource.connect(hpf);
        lastNode.connect(filterCtx.destination);
        bSource.start(0);

        const rendered = await filterCtx.startRendering();
        const chData = rendered.getChannelData(0);

        // Normalize peak to 0.88
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
