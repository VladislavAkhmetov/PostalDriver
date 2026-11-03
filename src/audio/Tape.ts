import { Channel, CHANNELS, Track } from './stations';

/**
 * The dashboard radio-cassette deck ("магнитола"), tuned like a GTA car radio: N flips to the next
 * channel (with a single station on the dial, to its next song). A station is a looping broadcast
 * of the game's own songs, running on a wall clock so that a channel you left carries on without
 * you; a channel with nothing on it is whistling, buzzing static.
 * Everything plays through a worn cassette path (wow and flutter, dropouts, hiss, a rolled-off top)
 * and a small dashboard speaker: band-pass, mild drive, breaking up when loud.
 */
const VOL_KEY = 'uaz-radio-volume';
const DEFAULT_VOLUME = 0.4;
function loadVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY) ?? '');
    if (Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  } catch { /* private mode */ }
  return DEFAULT_VOLUME;
}
/** Gain on the speaker bus for a dial position: quadratic, so the low half of the knob is genuinely quiet. */
const dialGain = (v: number) => 1.5 * v * v;

export class Tape {
  private ch = 0;
  private on = false;
  private el: HTMLAudioElement;
  private media: GainNode;
  private bus: GainNode;
  private staticGain: GainNode;
  private hissGain: GainNode;
  private buzzGain: GainNode;
  private whistle: OscillatorNode;
  private whistleGain: GainNode;
  private sweep: BiquadFilterNode;
  private tone: BiquadFilterNode;
  /** Tape dropouts: brief dips where the oxide is worn. */
  private dropout!: GainNode;
  private dropoutT = 8;
  /** The speaker's output (for metering). */
  readonly speaker: GainNode;
  /** A burst of static as the dial moves; 1 → 0. */
  private tuning = 0;
  private buffering = false;
  private failed = false;
  private reception = 1;
  private dropT = 0;
  private dropDepth = 0;
  private t = 0;
  /** Seconds the current file has been trying to start. */
  private waitT = 0;
  /** Which song of the channel's programme is on air. */
  private song = 0;
  /** Where the broadcast clock starts, so every session opens mid-programme. */
  private readonly seed = Math.random() * 1000;
  /** Seconds the broadcast clock has been moved on by skipping songs. */
  private shift = 0;
  private whistleT = 0;
  /** The presenter has the air between two songs: nothing may start the next one early. */
  private talking = false;
  /** A play() is on its way: a tap meanwhile must not start the song over. */
  private starting = false;
  /** The pending seek of the song now loading (one at a time). */
  private seek: (() => void) | null = null;
  /** A song put on out of the programme (`cue`), playing now; the programme resumes after it. */
  private special: Track | null = null;
  /** The cued song has played to its end. */
  onCueEnd: (() => void) | null = null;
  /** Dial volume 0…1, kept between visits. */
  volume = loadVolume();

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
    this.el.preload = 'none';
    this.el.addEventListener('ended', () => this.songEnded());
    this.el.addEventListener('waiting', () => (this.buffering = true));
    this.el.addEventListener('playing', () => { this.buffering = false; this.failed = false; this.starting = false; });
    this.el.addEventListener('error', () => { if (this.el.getAttribute('src')) { this.buffering = true; this.failed = true; } });
    this.media = ctx.createGain();
    this.media.gain.value = 1.1;
    // the cassette's own top end: dull and a little muffled
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 5200;
    // the tape transport: the music runs through a short delay line whose length
    // wanders — slow wow, quick flutter and a lazy drift — which bends the pitch
    // like a tired cassette deck; the head adds a little saturation of its own
    const wowDelay = ctx.createDelay(0.1); wowDelay.delayTime.value = 0.03;
    const lfo = (f: number, depth: number) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = depth;
      o.connect(g).connect(wowDelay.delayTime); o.start();
    };
    lfo(0.55, 0.0016); lfo(0.17, 0.0012); lfo(7.3, 0.00008);
    const head = ctx.createWaveShaper();
    const hc = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; hc[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    head.curve = hc;
    this.dropout = ctx.createGain();
    ctx.createMediaElementSource(this.el).connect(this.tone).connect(this.media).connect(wowDelay).connect(head).connect(this.dropout).connect(this.bus);

    // the empty channels and the dial's noise: a swept band of static, hiss, mains buzz, a drifting whistle
    const staticSrc = ctx.createBufferSource(); staticSrc.buffer = noise; staticSrc.loop = true;
    this.sweep = ctx.createBiquadFilter(); this.sweep.type = 'bandpass'; this.sweep.frequency.value = 2400; this.sweep.Q.value = 0.5;
    this.staticGain = ctx.createGain(); this.staticGain.gain.value = 0;
    staticSrc.connect(this.sweep).connect(this.staticGain).connect(this.bus);
    staticSrc.start();
    const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true; hiss.playbackRate.value = 0.93;
    const hhp = ctx.createBiquadFilter(); hhp.type = 'highpass'; hhp.frequency.value = 2000;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    hiss.connect(hhp).connect(this.hissGain).connect(this.bus);
    hiss.start();
    const buzz = ctx.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 100;
    this.buzzGain = ctx.createGain(); this.buzzGain.gain.value = 0;
    buzz.connect(this.buzzGain).connect(this.bus); buzz.start();
    this.whistle = ctx.createOscillator(); this.whistle.type = 'sine'; this.whistle.frequency.value = 1800;
    this.whistleGain = ctx.createGain(); this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain).connect(this.bus); this.whistle.start();
  }

  private get channel(): Channel { return CHANNELS[this.ch]; }
  get playing(): boolean { return this.on; }
  get title(): string {
    if (this.gone) return 'Магнитолы нет — сняли';
    const c = this.channel;
    if (!c.tracks.length) return `FM ${c.freq} · помехи`;
    return `FM ${c.freq} · ${c.name} · ${(this.special ?? c.tracks[this.song]).title}${this.failed ? ' · нет сигнала' : ''}`;
  }

  /** The radio has been taken off the dashboard (until the next day). */
  private gone = false;
  /** Someone speaks over it (a recorded voice, Voice.ts): the dial goes down to a third, and back. */
  duck(on: boolean): void {
    this.ducked = on ? 0.3 : 1;
    if (this.on) this.bus.gain.setTargetAtTime(dialGain(this.volume) * this.ducked, this.ctx.currentTime, on ? 0.12 : 0.6);
  }
  private ducked = 1;
  /** The presenter's recorded words for the break `onBreak` has just announced (Voice.ts), or null. */
  presenterClip: AudioBuffer | null = null;
  takeAway(): void { if (this.on) this.toggle(); this.gone = true; }
  giveBack(): void { this.gone = false; }

  toggle(): boolean {
    if (this.gone) return false;
    this.on = !this.on;
    if (!this.on) { this.starting = false; this.special = null; }
    this.bus.gain.setTargetAtTime(this.on ? dialGain(this.volume) * this.ducked : 0, this.ctx.currentTime, 0.05);
    if (this.on) this.tune(); else this.el.pause();
    return this.on;
  }

  /** Turn the volume knob; returns the new dial position 0…1. */
  setVolume(v: number): number {
    this.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
    try { localStorage.setItem(VOL_KEY, String(this.volume)); } catch { /* private mode */ }
    if (this.on) this.bus.gain.setTargetAtTime(dialGain(this.volume) * this.ducked, this.ctx.currentTime, 0.04);
    return this.volume;
  }

  /** A user gesture has arrived: browsers refuse to start media before one, so try again now. */
  kick(): void {
    if (this.on && this.channel.tracks.length && this.el.paused && !this.starting && !this.talking) this.retry();
  }

  private retry(): void {
    if (this.special) { this.failed = false; this.playSong(0); return; }
    const { song, at } = this.onAir(this.channel);
    this.song = song;
    this.failed = false;
    this.playSong(at);
  }

  /** Next channel on the dial (switches the radio on first if it was off); one station — its next song. */
  next(): string {
    if (this.gone) return this.title;
    // off the cued song, back to the programme where it has got to
    if (this.special) { this.special = null; if (!this.on) this.toggle(); else this.tune(); return this.title; }
    if (CHANNELS.length < 2) {
      if (!this.on) { this.toggle(); return this.title; }
      // the broadcast clock jumps to the start of the next song, so the programme stays in order
      const c = this.channel, { song, at } = this.onAir(c);
      this.shift += c.tracks[song].seconds - at + 0.01;
      this.tune();
      return this.title;
    }
    this.ch = (this.ch + 1) % CHANNELS.length;
    if (!this.on) this.toggle(); else this.tune();
    return this.title;
  }

  /** Where the broadcast stands now: which song, and how many seconds in. */
  private onAir(c: Channel): { song: number; at: number } {
    const total = c.tracks.reduce((a, tr) => a + tr.seconds, 0);
    let p = (Date.now() / 1000 + this.seed + this.shift) % total;
    for (let i = 0; i < c.tracks.length; i++) {
      if (p < c.tracks[i].seconds) return { song: i, at: p };
      p -= c.tracks[i].seconds;
    }
    return { song: 0, at: 0 };
  }

  /** Move the needle: static washes over, and the channel's programme is picked up where it is. */
  private tune(): void {
    const c = this.channel;
    this.el.pause();
    this.tuning = 1;
    this.waitT = 0;
    this.failed = false;
    if (!c.tracks.length) { this.buffering = false; this.el.removeAttribute('src'); return; }
    const { song, at } = this.onAir(c);
    this.song = song;
    this.playSong(at);
  }

  /**
   * The station puts a song on for the moment, out of its programme: the deck comes on (with the
   * dial's static as the needle finds it) and plays it through the same tape and speaker; after it,
   * the programme carries on where it has got to.
   */
  cue(tr: Track): void {
    if (this.gone || !this.channel.tracks.length) return;
    this.special = tr;
    if (!this.on) {
      this.on = true;
      this.bus.gain.setTargetAtTime(dialGain(this.volume), this.ctx.currentTime, 0.05);
    }
    this.el.pause();
    this.tuning = 1;
    this.failed = false;
    this.playSong(0);
  }

  private playSong(at: number): void {
    const tr = this.special ?? this.channel.tracks[this.song];
    this.buffering = true;
    this.waitT = 0;
    // a song started over drops the seek of the one before, so it never jumps about
    if (this.seek) this.el.removeEventListener('loadedmetadata', this.seek);
    this.el.src = tr.url;
    const seek = this.seek = () => { this.seek = null; if (at > 0.5) try { this.el.currentTime = at; } catch { /* not seekable yet */ } };
    this.el.addEventListener('loadedmetadata', seek, { once: true });
    this.starting = true;
    this.el.play().catch(() => { this.buffering = true; this.failed = true; this.starting = false; });
  }

  /**
   * Between two songs the station speaks: its call sign on a little vibraphone, then the presenter
   * (a voice under the subtitles) — `onBreak` says what — and the next song after it.
   */
  onBreak?: () => number;
  private songEnded(): void {
    if (this.special) {
      this.special = null;
      this.onCueEnd?.();
      if (this.on && !this.gone) this.tune();
      return;
    }
    if (!this.on || this.gone || !this.channel.tracks.length || !this.onBreak) { this.nextSong(); return; }
    const words = this.onBreak();
    if (words <= 0) { this.nextSong(); return; }
    this.jingle();
    // the recorded presenter, through the same old speaker as the songs; or her murmur under the subtitles
    const clip = this.presenterClip;
    this.presenterClip = null;
    const talk = clip ? clip.duration : Math.min(9, 1.5 + words * 0.06);
    if (clip) {
      const src = this.ctx.createBufferSource();
      src.buffer = clip;
      src.connect(this.dropout);
      src.start(this.ctx.currentTime + 1.4);
    } else this.voice(1.4, talk);
    this.talking = true;
    setTimeout(() => { this.talking = false; if (this.on && !this.gone && this.el.paused) this.nextSong(); }, (1.4 + talk + 0.8) * 1000);
  }

  /** The call sign: three soft vibraphone notes. */
  private jingle(): void {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    [784, 659, 523, 659].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      const at = t0 + i * 0.22;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.32, at + 0.01); g.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
      o.connect(g).connect(this.dropout); o.start(at); o.stop(at + 0.65);
    });
  }

  /** The presenter talking: a run of syllables, `at` seconds from now for `dur` seconds (the words are on screen). */
  private voice(at: number, dur: number): void {
    const ctx = this.ctx, t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const formant = ctx.createBiquadFilter(); formant.type = 'bandpass'; formant.frequency.value = 900; formant.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(formant).connect(g).connect(this.dropout);
    let t = t0;
    o.frequency.setValueAtTime(205, t);
    while (t < t0 + dur) {
      const syl = 0.08 + Math.random() * 0.1;
      o.frequency.linearRampToValueAtTime(185 + Math.random() * 70, t + syl * 0.6);
      formant.frequency.setValueAtTime(550 + Math.random() * 1300, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + syl * 0.7); g.gain.linearRampToValueAtTime(0, t + syl);
      t += syl + (Math.random() < 0.15 ? 0.22 : 0.02);
    }
    o.start(t0); o.stop(t + 0.2);
  }

  private nextSong(): void {
    const c = this.channel;
    if (!this.on || !c.tracks.length) return;
    this.song = (this.song + 1) % c.tracks.length;
    this.playSong(0);
  }

  /** Call every frame. `reception` 0..1 is FM signal quality at the van's position. */
  update(dt: number, reception: number): void {
    if (!this.on) {
      this.staticGain.gain.value = 0;
      this.hissGain.gain.value = 0;
      this.buzzGain.gain.value = 0;
      this.whistleGain.gain.value = 0;
      return;
    }
    this.t += dt;
    const c = this.channel;
    const now = this.ctx.currentTime;
    // a file that errors or never starts must not leave the deck silent: try again
    if (c.tracks.length && this.buffering) {
      this.waitT += dt;
      if ((this.failed && this.waitT > 1.5) || this.waitT > 8) this.retry();
    }
    this.tuning = Math.max(0, this.tuning - dt * 1.6);
    this.reception += (reception - this.reception) * Math.min(1, dt * 0.5);
    let level = 1, stat = 0, hiss = 0.012, buzz = 0, whistle = 0;
    if (c.tracks.length) {
      const q = this.reception;
      // weak signal: hiss, a duller top end and the odd fade-out under trees
      this.dropT -= dt;
      if (this.dropT < 0) {
        this.dropT = 1.5 + Math.random() * 6 * (0.3 + q);
        this.dropDepth = q < 0.6 && Math.random() < 0.8 - q ? (0.6 - q) * 1.4 * Math.random() : 0;
      }
      this.dropDepth *= Math.exp(-dt * 2.2);
      level = Math.max(0.15, 1 - this.dropDepth) * (0.6 + 0.4 * q);
      stat = (1 - q) * 0.05 + this.dropDepth * 0.08 + 0.006;
      this.tone.frequency.setTargetAtTime(1800 + q * 3600, now, 0.3);
    } else {
      // dead air: static that swells and ebbs, slowly sweeping through the band
      const swell = 0.75 + 0.25 * Math.sin(this.t * 0.7) * Math.sin(this.t * 0.23 + 1);
      stat = 0.16 * swell;
      hiss = 0.05;
      this.sweep.frequency.setTargetAtTime(1600 + 1500 * (0.5 + 0.5 * Math.sin(this.t * 0.37)), now, 0.1);
      if (c.noise === 'buzz') buzz = 0.012 * (0.6 + 0.4 * Math.sin(this.t * 2.1));
      if (c.noise === 'whistle') {
        // a heterodyne whistle that wanders in and out between stations
        this.whistleT -= dt;
        if (this.whistleT < 0) { this.whistleT = 1 + Math.random() * 3; this.whistle.frequency.setTargetAtTime(700 + Math.random() * 2600, now, 0.8); }
        whistle = 0.006 * Math.max(0, Math.sin(this.t * 0.5));
      }
    }
    // now and then the level dips for a moment where the tape is worn
    this.dropoutT -= dt;
    if (this.dropoutT < 0) {
      this.dropoutT = 7 + Math.random() * 18;
      const d = this.dropout.gain, at = now + 0.02, len = 0.08 + Math.random() * 0.3;
      d.cancelScheduledValues(now);
      d.setValueAtTime(1, at);
      d.linearRampToValueAtTime(0.3 + Math.random() * 0.3, at + 0.03);
      d.linearRampToValueAtTime(1, at + len);
    }
    if (this.buffering && c.tracks.length) stat = Math.max(stat, 0.09);
    stat = Math.max(stat, this.tuning * 0.2);
    this.media.gain.setTargetAtTime(1.1 * level * (1 - this.tuning * 0.9), now, 0.04);
    // static and hiss sit under the music, not over it
    this.staticGain.gain.setTargetAtTime(stat * 0.5, now, 0.04);
    this.hissGain.gain.setTargetAtTime(hiss * 0.5, now, 0.1);
    this.buzzGain.gain.setTargetAtTime(buzz, now, 0.1);
    this.whistleGain.gain.setTargetAtTime(whistle, now, 0.2);
  }
}
