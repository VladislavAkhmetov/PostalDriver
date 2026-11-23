import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = 'public/sound-samples/creaks';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const port = 9626;
const ch = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { ch.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true);  // AudioFormat (PCM)
  view.setUint16(22, 1, true);  // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return Buffer.from(buffer);
}

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

  const groups = [
    {
      groupId: 'suspension',
      groupTitle: 'Вариант 1: Подвеска и амортизаторы (Car Suspension & Leaf Springs)',
      sourceName: 'Car_Suspension_Creak (Freesound #86234)',
      sourceFile: 'temp_creak_candidates/86234.mp3',
      description: 'Однородная запись покачивания реальной подвески автомобиля. Скрип сайлентблоков, рессор и амортизаторов на кочках.',
      slices: [
        { name: 'suspension_01_soft_bounce.wav', title: 'Мягкий отбой (Soft bounce)', start: 0.82, end: 1.42 },
        { name: 'suspension_02_short_creak.wav', title: 'Короткий скрип рессоры (Short creak)', start: 1.50, end: 1.74 },
        { name: 'suspension_03_elastic_rub.wav', title: 'Упругое трение (Elastic rub)', start: 1.75, end: 2.05 },
        { name: 'suspension_04_pothole_creak.wav', title: 'Сжатие на неровности (Pothole flex)', start: 3.90, end: 4.45 },
        { name: 'suspension_05_weight_shift.wav', title: 'Крен кузова / сдвиг веса (Body roll)', start: 5.35, end: 5.92 },
        { name: 'suspension_06_quick_squeak.wav', title: 'Быстрый щелчок-скрип (Quick squeak)', start: 6.30, end: 6.58 },
        { name: 'suspension_07_heavy_creak.wav', title: 'Глубокий скрип на яме (Heavy heave)', start: 11.90, end: 12.65 }
      ]
    },
    {
      groupId: 'pobeda_cabin',
      groupTitle: 'Вариант 2: Советское ретро — кузов и рычаги ГАЗ-М20 «Победа»',
      sourceName: 'Handbrake & Cabin Creaks Pobeda 1957 (Freesound #316886)',
      sourceFile: 'temp_creak_candidates/316886.mp3',
      description: 'Аутентичная студийная запись финского радиоархива (YleArkisto) салона и механических узлов советского автомобиля 1957 года. Настоящий тяжелый металл и винтажный характер.',
      slices: [
        { name: 'pobeda_01_metal_strain.wav', title: 'Металлическое натяжение кузова', start: 0.50, end: 1.25 },
        { name: 'pobeda_02_joint_creak.wav', title: 'Сухой скрип сочленения рамы', start: 3.15, end: 3.95 },
        { name: 'pobeda_03_body_twist.wav', title: 'Скрип кузова на диагональном вывешивании', start: 5.40, end: 6.35 },
        { name: 'pobeda_04_short_friction.wav', title: 'Короткое сухое трение металла', start: 9.50, end: 9.88 },
        { name: 'pobeda_05_heavy_flex.wav', title: 'Глубокий скрип кабины', start: 11.50, end: 12.20 }
      ]
    },
    {
      groupId: 'seat_springs',
      groupTitle: 'Вариант 3: Пружины старого автомобильного сиденья',
      sourceName: 'Classic Car Seat (Freesound #630548)',
      sourceFile: 'temp_creak_candidates/630548.mp3',
      description: 'Запись скрипа пружин водительского кресла старого автомобиля при покачивании водителя на кочках и гравии.',
      slices: [
        { name: 'seat_01_chirp.wav', title: 'Короткий скрип пружины под весом', start: 1.15, end: 1.40 },
        { name: 'seat_02_weight_shift.wav', title: 'Смещение водителя на повороте', start: 10.35, end: 10.70 },
        { name: 'seat_03_rebound.wav', title: 'Отбой пружин на кочке', start: 11.60, end: 12.10 },
        { name: 'seat_04_compression.wav', title: 'Сжатие каркаса сиденья', start: 14.05, end: 14.40 },
        { name: 'seat_05_double_creak.wav', title: 'Двойной скрип пружинного блока', start: 17.70, end: 18.20 },
        { name: 'seat_06_roll_groan.wav', title: 'Продолжительный скрип сиденья', start: 19.00, end: 19.55 },
        { name: 'seat_07_pothole_jolt.wav', title: 'Толчок на яме (быстрое сжатие)', start: 20.45, end: 21.00 }
      ]
    },
    {
      groupId: 'metal_chassis',
      groupTitle: 'Вариант 4: Сухой скрип металла и рамы грузовика',
      sourceName: 'Old Truck Metal Squeaks & Hinges (Freesound #508281 & #751719)',
      sourceFile: 'temp_creak_candidates/380703.mp3',
      description: 'Плотный скрежещущий скрип металлических элементов, трение листов рессор и пружинных блоков под высокой нагрузкой.',
      slices: [
        { name: 'metal_01_slow_creak.wav', title: 'Медленный протяжный скрежет', start: 0.40, end: 1.45 },
        { name: 'metal_02_sharp_slip.wav', title: 'Резкий срыв металла (Stick-slip)', start: 1.65, end: 1.88 },
        { name: 'metal_03_heavy_cycle.wav', title: 'Тяжелый скрип рессорного листа', start: 6.70, end: 7.20 },
        { name: 'metal_04_friction_rub.wav', title: 'Трение металла о резину/дерево', start: 10.65, end: 11.15 },
        { name: 'metal_05_quick_snap.wav', title: 'Короткий скрежет-щелчок', start: 14.60, end: 14.95 }
      ]
    }
  ];

  const metadataReport = [];

  for (const group of groups) {
    console.log(`\nProcessing Group: ${group.groupTitle}...`);
    const b64 = readFileSync(group.sourceFile).toString('base64');

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

        const slicesData = ${JSON.stringify(group.slices)};
        const outputs = [];

        for (const s of slicesData) {
          const startIdx = Math.max(0, Math.floor(s.start * sr));
          const endIdx = Math.min(data.length, Math.floor(s.end * sr));
          const len = endIdx - startIdx;
          const slice = new Float32Array(len);
          slice.set(data.subarray(startIdx, endIdx));

          // Apply 12ms fade in, 25ms fade out
          const fadeIn = Math.floor(sr * 0.012);
          for (let i = 0; i < fadeIn && i < len; i++) {
            slice[i] *= (i / fadeIn);
          }
          const fadeOut = Math.floor(sr * 0.025);
          for (let i = 0; i < fadeOut && i < len; i++) {
            slice[len - 1 - i] *= (i / fadeOut);
          }

          // Peak normalize to 0.85
          let peak = 0;
          for (let i = 0; i < len; i++) {
            const abs = Math.abs(slice[i]);
            if (abs > peak) peak = abs;
          }
          if (peak > 1e-4) {
            const gain = 0.85 / peak;
            for (let i = 0; i < len; i++) slice[i] *= gain;
          }

          // Convert to regular array or base64
          outputs.push({
            name: s.name,
            title: s.title,
            dur: Number((len / sr).toFixed(2)),
            samples: Array.from(slice)
          });
        }

        return { sr, outputs };
      })()`
    });

    const val = res.result?.value;
    if (!val) {
      console.error(`Failed to process group ${group.groupId}`);
      continue;
    }

    const groupResult = {
      ...group,
      slices: []
    };

    for (const out of val.outputs) {
      const wavBuf = encodeWav(out.samples, val.sr);
      const filePath = path.join(outDir, out.name);
      writeFileSync(filePath, wavBuf);
      console.log(`  Saved ${out.name} (${wavBuf.length} bytes, ${out.dur}s)`);
      groupResult.slices.push({
        file: `sound-samples/creaks/${out.name}`,
        name: out.name,
        title: out.title,
        duration: out.dur,
        size: wavBuf.length
      });
    }

    metadataReport.push(groupResult);
  }

  writeFileSync('public/sound-samples/creaks/creaks_catalog.json', JSON.stringify(metadataReport, null, 2));
  console.log('\nAll sliced creaks written to public/sound-samples/creaks/ successfully!');

  try { ch.kill(); } catch {}
  process.exit(0);
}

main();
