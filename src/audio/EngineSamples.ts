import { clamp } from '../core/math';
import lowUrl from '../assets/engine/engine_low.wav?url';
import midUrl from '../assets/engine/engine_mid.wav?url';
import hi1Url from '../assets/engine/engine_hi1.wav?url';
import hi2Url from '../assets/engine/engine_hi2.wav?url';

/**
 * The engine's voice from real recordings (src/assets/engine/CREDITS.md): four seamless loops
 * of a petrol four-cylinder at different speeds. Each plays at a rate that follows the
 * revs, and they cross-fade with rpm so the tone stays natural over the whole range. The
 * synthesised tappets, carburettor hiss and fan are mixed on top by the worklet.
 *
 * `ref` is the crank speed each loop was recorded at: a four-cylinder fires rpm / 30 times a
 * second, and the loops' pulse rates were measured (21.4, 31.5, 64.9, 76 Hz).
 */
const LAYERS = [
  { url: lowUrl, ref: 642 },
  { url: midUrl, ref: 945 },
  { url: hi1Url, ref: 1947 },
  { url: hi2Url, ref: 2280 },
];

interface Voice { src: AudioBufferSourceNode; gain: GainNode; ref: number }

export class EngineSamples {
  ready = false;
  private voices: Voice[] = [];
  private tone: BiquadFilterNode;
  private out: GainNode;
  private hunt = 0;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass'; this.tone.frequency.value = 1400; this.tone.Q.value = 0.6;
    this.out.connect(this.tone).connect(dest);
  }

  async load(): Promise<void> {
    const bufs = await Promise.all(LAYERS.map(async (l) => this.ctx.decodeAudioData(await (await fetch(l.url)).arrayBuffer())));
    LAYERS.forEach((l, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = bufs[i]; src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.out);
      src.start(0, Math.random() * bufs[i].duration);
      this.voices.push({ src, gain, ref: l.ref });
    });
    this.ready = true;
  }

  update(dt: number, rpm: number, load: number, thr: number, on: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.hunt += dt;
    // the carburettor never settles at idle: a slow wobble in the pitch
    const idle = clamp(1 - (rpm - 750) / 900, 0, 1);
    const wob = 1 + idle * (0.012 * Math.sin(this.hunt * 5) + 0.006 * Math.sin(this.hunt * 13.1));
    const r = Math.max(rpm, 200) * wob;
    let norm = 0;
    const w = this.voices.map((v) => {
      const d = Math.log(r / v.ref);
      // bell in log-rpm; the ends stay open so the lowest and highest loops cover the extremes
      const lo = v === this.voices[0] && d < 0, hi = v === this.voices[this.voices.length - 1] && d > 0;
      const g = lo || hi ? 1 : Math.max(0, 1 - Math.abs(d) / 0.62) ** 1.5;
      norm += g * g;
      return g;
    });
    const k = 1 / Math.sqrt(Math.max(norm, 1e-4));
    this.voices.forEach((v, i) => {
      v.gain.gain.setTargetAtTime(w[i] * k, t, 0.05);
      v.src.playbackRate.setTargetAtTime(clamp(r / v.ref, 0.5, 2.4), t, 0.04);
    });
    const pull = Math.max(load, thr * 0.8);
    // off the throttle the engine is duller; pulling hard it opens up
    this.tone.frequency.setTargetAtTime(900 + 4200 * pull + rpm * 0.35, t, 0.1);
    this.out.gain.setTargetAtTime(on * (0.42 + 0.5 * load), t, 0.12);
  }
}
