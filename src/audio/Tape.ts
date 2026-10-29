import { Station, STATIONS } from './stations';

/**
 * The dashboard radio-cassette deck ("магнитола"). Sources, cycled with N:
 *  - FM: live Russian 90s stations, with tuning static and reception that fades
 *    in the forest and the river lowland — the deck's own music;
 *  - cassettes: only the user's own tracks — audio files dropped into /music at
 *    the project root (bundled by Vite) or loaded at runtime from the pause menu.
 * Everything plays through a small dashboard speaker: band-pass, mild drive,
 * tape hiss and wow for cassettes. When no station comes in, the deck hisses
 * and keeps scanning the dial.
 */
/** Audio files placed in /music at the project root. */
const BUNDLED = import.meta.glob('/music/*.{mp3,ogg,m4a,aac,wav,flac,opus,webm}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

type Source =
  | { kind: 'file'; name: string; url: string }
  | { kind: 'radio'; station: Station };

const prettyName = (path: string) => decodeURIComponent(path.split('/').pop() ?? path).replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');

export class Tape {
  private sources: Source[] = [];
  private idx = 0;
  private on = false;
  private el: HTMLAudioElement;
  private media: GainNode;
  private bus: GainNode;
  private staticGain: GainNode;
  private hissGain: GainNode;
  private tone: BiquadFilterNode;
  /** Tape dropouts: brief dips where the oxide is worn. */
  private dropout!: GainNode;
  private dropoutT = 8;
  /** The speaker's output (for metering). */
  readonly speaker: GainNode;
  private tuning = 0;
  private buffering = false;
  private failed = false;
  private reception = 1;
  private dropT = 0;
  private dropDepth = 0;
  private t = 0;
  private fileCount = 0;
  /** Seconds the current file/stream has been trying to start. */
  private waitT = 0;
  /** Playing the current station straight from its host rather than through our relay. */
  private direct = false;
  /** Stations in a row that failed to start; after a full sweep the deck rests on static. */
  private misses = 0;
  /** Seconds until the next scan when nothing on the dial comes in. */
  private rescan = 0;

  constructor(private ctx: AudioContext, out: AudioNode, private noise: AudioBuffer) {
    // a cheap 4-inch dashboard speaker in a tin door: mono, almost no bass
    // (two stacked high-passes, 24 dB/oct from ~400 Hz), a nasal cone
    // resonance and a honky mid, nothing above ~4 kHz, and it breaks up when loud
    const mono = ctx.createGain();
    mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    const hp1 = ctx.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = 420; hp1.Q.value = 0.9;
    const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 320; hp2.Q.value = 0.6;
    const honk = ctx.createBiquadFilter(); honk.type = 'peaking'; honk.frequency.value = 950; honk.Q.value = 1.1; honk.gain.value = 4;
    const cone = ctx.createBiquadFilter(); cone.type = 'peaking'; cone.frequency.value = 2300; cone.Q.value = 2.2; cone.gain.value = 7;
    const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 3800; lp1.Q.value = 0.9;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 4600; lp2.Q.value = 0.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    // asymmetric soft clip: the paper cone bottoms out a little sooner one way
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * (x > 0 ? 2.2 : 1.8)) / Math.tanh(2); }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const level = this.speaker = ctx.createGain(); level.gain.value = 0.9;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(mono).connect(hp1).connect(hp2).connect(honk).connect(cone).connect(shaper).connect(lp1).connect(lp2).connect(level).connect(out);

    this.el = new Audio();
    this.el.crossOrigin = 'anonymous';
    this.el.preload = 'none';
    (this.el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    this.el.addEventListener('ended', () => { if (this.current.kind === 'file') this.step(1, 'file'); });
    this.el.addEventListener('waiting', () => (this.buffering = true));
    this.el.addEventListener('playing', () => { this.buffering = false; this.failed = false; this.misses = 0; this.rescan = 0; });
    this.el.addEventListener('error', () => { if (this.el.getAttribute('src')) { this.buffering = true; this.failed = true; } });
    this.media = ctx.createGain();
    this.media.gain.value = 1.1;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 12000;
    // the tape transport: the music runs through a short delay line whose length
    // wanders — slow wow, quick flutter and a lazy drift — which bends the pitch
    // like a tired cassette deck; the head adds a little saturation of its own
    const wowDelay = ctx.createDelay(0.1); wowDelay.delayTime.value = 0.03;
    const lfo = (f: number, depth: number) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = depth;
      o.connect(g).connect(wowDelay.delayTime); o.start();
    };
    lfo(0.55, 0.0011); lfo(0.17, 0.0009); lfo(7.3, 0.00005);
    const head = ctx.createWaveShaper();
    const hc = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; hc[i] = Math.tanh(x * 1.3) / Math.tanh(1.3); }
    head.curve = hc;
    this.dropout = ctx.createGain();
    ctx.createMediaElementSource(this.el).connect(this.tone).connect(this.media).connect(wowDelay).connect(head).connect(this.dropout).connect(this.bus);

    const staticSrc = ctx.createBufferSource(); staticSrc.buffer = noise; staticSrc.loop = true;
    const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 2400; sbp.Q.value = 0.5;
    this.staticGain = ctx.createGain(); this.staticGain.gain.value = 0;
    staticSrc.connect(sbp).connect(this.staticGain).connect(this.bus);
    staticSrc.start();
    const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true; hiss.playbackRate.value = 0.93;
    const hhp = ctx.createBiquadFilter(); hhp.type = 'highpass'; hhp.frequency.value = 2000;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    hiss.connect(hhp).connect(this.hissGain).connect(this.bus);
    hiss.start();

    for (const [path, url] of Object.entries(BUNDLED).sort(([a], [b]) => a.localeCompare(b))) this.sources.push({ kind: 'file', name: prettyName(path), url });
    this.fileCount = this.sources.length;
    for (const station of STATIONS) this.sources.push({ kind: 'radio', station });
    // start on the dial, not on a cassette
    this.idx = this.fileCount;
  }

  private get current(): Source { return this.sources[this.idx]; }
  get playing(): boolean { return this.on; }
  get title(): string {
    const c = this.current;
    if (c.kind === 'file') return `Кассета · ${c.name}${this.failed ? ' · не читается' : ''}`;
    if (this.rescan > 0) return 'FM · эфир не ловится — ищу станцию…';
    return `FM ${c.station.freq} · ${c.station.name}${this.failed ? ' · нет сигнала' : this.buffering ? ' …' : ''}`;
  }

  /** Adds user-picked files as cassettes at the front of the list and plays the first one. */
  loadFiles(files: FileList | File[]): number {
    const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|ogg|m4a|aac|wav|flac|opus|webm)$/i.test(f.name));
    if (!list.length) return 0;
    const added: Source[] = list.map((f) => ({ kind: 'file', name: prettyName(f.name), url: URL.createObjectURL(f) }));
    this.sources.splice(this.fileCount, 0, ...added);
    this.idx = this.fileCount;
    this.fileCount += added.length;
    if (this.on) this.start(); else this.toggle();
    return added.length;
  }

  toggle(): boolean {
    this.on = !this.on;
    const t = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(this.on ? 0.75 : 0, t, 0.05);
    if (this.on) this.start(); else this.stop();
    return this.on;
  }

  next(): string {
    this.misses = 0;
    this.direct = false;
    this.rescan = 0;
    this.step(1);
    if (!this.on) this.toggle(); else this.start();
    return this.title;
  }

  private step(d: number, kind?: Source['kind']): void {
    if (kind) {
      // advance within the same kind of source (next song on the cassette)
      const same = this.sources.map((s, i) => [s, i] as const).filter(([s]) => s.kind === kind).map(([, i]) => i);
      const k = same.indexOf(this.idx);
      this.idx = same[(k + d + same.length) % same.length];
      this.start();
      return;
    }
    this.idx = (this.idx + d + this.sources.length) % this.sources.length;
  }

  private stop(): void {
    this.el.pause();
  }

  private start(): void {
    const c = this.current;
    this.el.pause();
    this.buffering = false;
    this.failed = false;
    this.waitT = 0;
    // the mechanism clunks / the dial sweeps through static while the stream connects
    this.tuning = c.kind === 'radio' ? 1 : 0.35;
    this.buffering = true;
    // stations come through the dev server's same-origin relay first (see vite.config.ts)
    this.el.src = c.kind === 'radio' ? (this.direct ? c.station.url : `/radio/${c.station.id}`) : c.url;
    this.el.playbackRate = 1;
    this.el.play().catch(() => (this.buffering = true));
  }

  /** Call every frame. `reception` 0..1 is FM signal quality at the van's position. */
  update(dt: number, reception: number): void {
    if (!this.on) {
      this.staticGain.gain.value = 0;
      this.hissGain.gain.value = 0;
      return;
    }
    this.t += dt;
    let c = this.current;
    // a stream that errors or never starts (no signal, blocked, offline) must not
    // leave the deck silent: sweep on to the next station; after a full sweep
    // of the dial with nothing, rest on static and try again a little later
    if (this.rescan > 0) {
      this.rescan -= dt;
      if (this.rescan <= 0) { this.rescan = 0; this.misses = 0; this.direct = false; this.start(); }
    } else if (this.buffering) {
      this.waitT += dt;
      if ((this.failed && this.waitT > 1.5) || this.waitT > 7) {
        this.misses++;
        if (c.kind === 'radio' && !this.direct) { this.misses--; this.direct = true; this.start(); }
        else if (c.kind === 'file') { if (this.misses >= 2) { this.misses = 0; this.idx = this.fileCount; this.start(); } else this.step(1, 'file'); }
        else if (this.misses >= STATIONS.length) { this.el.pause(); this.el.removeAttribute('src'); this.rescan = 14; }
        else { this.direct = false; this.step(1, 'radio'); }
        c = this.current;
      }
    }
    const now = this.ctx.currentTime;
    this.tuning = Math.max(0, this.tuning - dt * 1.3);
    this.reception += (reception - this.reception) * Math.min(1, dt * 0.5);
    let level = 1, stat = 0, hiss = 0;
    if (c.kind === 'radio') {
      const q = this.reception;
      // weak signal: hiss, a duller top end and the odd fade-out under trees
      this.dropT -= dt;
      if (this.dropT < 0) {
        this.dropT = 1.5 + Math.random() * 6 * (0.3 + q);
        this.dropDepth = q < 0.6 && Math.random() < 0.8 - q ? (0.6 - q) * 1.4 * Math.random() : 0;
      }
      this.dropDepth *= Math.exp(-dt * 2.2);
      level = Math.max(0.15, 1 - this.dropDepth) * (0.55 + 0.45 * q);
      stat = (1 - q) * 0.05 + this.dropDepth * 0.08;
      this.tone.frequency.setTargetAtTime(2600 + q * 9000, now, 0.3);
    } else if (c.kind === 'file') {
      hiss = 0.01;
      this.tone.frequency.setTargetAtTime(9000, now, 0.3);
    }
    // the whole deck plays through the tape path: a bed of hiss, and now and
    // then the level dips for a moment where the tape is worn
    hiss = Math.max(hiss, 0.008);
    this.dropoutT -= dt;
    if (this.dropoutT < 0) {
      this.dropoutT = 9 + Math.random() * 22;
      const d = this.dropout.gain, at = now + 0.02, len = 0.08 + Math.random() * 0.25;
      d.cancelScheduledValues(now);
      d.setValueAtTime(1, at);
      d.linearRampToValueAtTime(0.35 + Math.random() * 0.3, at + 0.03);
      d.linearRampToValueAtTime(1, at + len);
    }
    if (this.rescan > 0) stat = 0.07;
    else if (this.buffering) stat = Math.max(stat, c.kind === 'radio' ? 0.09 : 0.02);
    stat = Math.max(stat, this.tuning * 0.12);
    this.media.gain.setTargetAtTime(this.rescan > 0 ? 0 : 1.1 * level * (1 - this.tuning * 0.8), now, 0.05);
    // static and hiss sit under the music, not over it
    this.staticGain.gain.setTargetAtTime(stat * 0.5, now, 0.04);
    this.hissGain.gain.setTargetAtTime(hiss * 0.5, now, 0.1);
  }
}
