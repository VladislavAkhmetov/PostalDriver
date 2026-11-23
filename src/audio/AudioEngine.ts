import { clamp } from '../core/math';
import { SURF, Surface } from '../world/Ground';
import type { RailSound } from '../world/Railway';
import type { TrafficSound } from '../world/Traffic';
import type { Vehicle } from '../vehicle/Vehicle';
import { crackleBuffer, impulseResponse, noiseBuffer, squelchBuffer } from './buffers';
import { ENGINE_WORKLET } from './engineWorklet';
import { EngineSamples } from './EngineSamples';
import { ChassisSounds } from './Chassis';
import { Tape } from './Tape';
import type { Track } from './stations';
import { Piece, Score } from './Score';
import { VillageAmbience } from './VillageAmbience';
import starterUrl from '../assets/engine/starter.wav?url';
import hornUrl from '../assets/engine/horn.mp3?url';
import trainHornUrl from '../assets/rail/p36-whistle.mp3?url';
import handbrakePullUrl from '../assets/cabin/handbrake_pull.mp3?url';
import handbrakeReleaseUrl from '../assets/cabin/handbrake_release.mp3?url';
import switchOnUrl from '../assets/cabin/switch_on.mp3?url';
import switchOffUrl from '../assets/cabin/switch_off.mp3?url';
import switchClickUrl from '../assets/cabin/switch_click.wav?url';
import gearShiftUrl from '../assets/cabin/gear_shift.mp3?url';
import gearSlideUrl from '../assets/cabin/gear_slide.wav?url';
import wiperUrl from '../assets/cabin/wiper.wav?url';
import wiperUpUrl from '../assets/cabin/wiper_up.wav?url';
import wiperDownUrl from '../assets/cabin/wiper_down.wav?url';
import windowDownUrl from '../assets/cabin/window_down.wav?url';
import windowUpUrl from '../assets/cabin/window_up.wav?url';
import wiperSqueak1Url from '../assets/cabin/wiper_squeak1.wav?url';
import wiperSqueak2Url from '../assets/cabin/wiper_squeak2.wav?url';
import susp1 from '../assets/creaks/suspension_01_soft_bounce.wav?url';
import susp2 from '../assets/creaks/suspension_02_short_creak.wav?url';
import susp3 from '../assets/creaks/suspension_03_elastic_rub.wav?url';
import susp4 from '../assets/creaks/suspension_04_pothole_creak.wav?url';
import susp5 from '../assets/creaks/suspension_05_weight_shift.wav?url';
import susp6 from '../assets/creaks/suspension_06_quick_squeak.wav?url';
import susp7 from '../assets/creaks/suspension_07_heavy_creak.wav?url';
import seat1 from '../assets/creaks/seat_01_chirp.wav?url';
import seat2 from '../assets/creaks/seat_02_weight_shift.wav?url';
import seat3 from '../assets/creaks/seat_03_rebound.wav?url';
import seat4 from '../assets/creaks/seat_04_compression.wav?url';
import seat5 from '../assets/creaks/seat_05_double_creak.wav?url';
import seat6 from '../assets/creaks/seat_06_roll_groan.wav?url';
import seat7 from '../assets/creaks/seat_07_pothole_jolt.wav?url';

interface Loop { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }

export interface AmbientState { rain: number; wind: number; village: number; forest: number; river: number; dusk: number; reception: number; wet: number; windowOpening?: number }

/** Game audio: synthesised at runtime, with the engine's tone from real recordings. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  tape: Tape | null = null;
  /** The game's own music (the title theme, scored moments): clean, past the dashboard speaker. */
  score: Score | null = null;
  /** The piece meant to be on (asked for before the audio graph is built, it starts once it is). */
  private piece: Piece | null = null;
  muted = false;
  /** On the title screen only the radio is audible; the engine and the world wait for the drive. */
  private radioOnly = true;
  private master!: GainNode;
  /** Recorded voices (Voice.ts): dry, straight to the master — they are in the cab, or at its window. */
  voiceBus: GainNode | null = null;
  private cabin!: BiquadFilterNode;
  private exteriorLevel!: GainNode;
  private world!: GainNode;
  private engine: AudioWorkletNode | null = null;
  private fallback: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private engineGain!: GainNode;
  private samples: EngineSamples | null = null;
  private loops: Record<string, Loop> = {};
  private whine!: { osc: OscillatorNode; gain: GainNode };
  private buffers: Record<string, AudioBuffer> = {};
  private starterBuffer: AudioBuffer | null = null;
  private hornBuffer: AudioBuffer | null = null;
  private trainHornBuffer: AudioBuffer | null = null;
  private handbrakePullBuffer: AudioBuffer | null = null;
  private handbrakeReleaseBuffer: AudioBuffer | null = null;
  private switchOnBuffer: AudioBuffer | null = null;
  private switchOffBuffer: AudioBuffer | null = null;
  private switchClickBuffer: AudioBuffer | null = null;
  private gearShiftBuffer: AudioBuffer | null = null;
  private gearSlideBuffer: AudioBuffer | null = null;
  private wiperBuffer: AudioBuffer | null = null;
  private wiperUpBuffer: AudioBuffer | null = null;
  private wiperDownBuffer: AudioBuffer | null = null;
  private windowDownBuffer: AudioBuffer | null = null;
  private windowUpBuffer: AudioBuffer | null = null;
  private wiperSqueakBuffers: AudioBuffer[] = [];
  private suspensionBuffers: AudioBuffer[] = [];
  private seatBuffers: AudioBuffer[] = [];
  private rattleT = 0;
  private birdT = 2;
  private animalT = 6;
  private thunderQ: number[] = [];
  private started = false;
  private passing!: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode };
  private bellT = 0;
  private clackT = 0;
  private chassis: ChassisSounds | null = null;
  villageAmbience: VillageAmbience | null = null;

  private ready: Promise<void> | null = null;

  /**
   * Build the audio graph once; later calls wait for that same build (the first one starts at boot,
   * the drive's call must not run ahead of it and find no radio yet).
   */
  async unlock(): Promise<void> {
    if (!this.ready) this.ready = this.init();
    try {
      await Promise.race([
        this.ready,
        new Promise((r) => setTimeout(r, 600))
      ]);
    } catch (e) {
      console.warn('Audio init timed out or failed', e);
    }
    try {
      await Promise.race([
        this.ctx?.resume(),
        new Promise((r) => setTimeout(r, 400))
      ]);
    } catch {}
  }

  /** The radio comes on with the drive (the title screen stays quiet until it has a track of its own). */
  radioOn(): void {
    if (this.tape && !this.tape.playing && !this.radioTouched) this.tape.toggle();
    this.radioTouched = true;
  }
  /** The radio has been switched on once already (after that it is the driver's to switch). */
  private radioTouched = false;

  private async init(): Promise<void> {
    this.started = true;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(comp).connect(ctx.destination);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    // cabin muffling for exterior sounds
    this.cabin = ctx.createBiquadFilter();
    this.cabin.type = 'lowpass'; this.cabin.frequency.value = 2600; this.cabin.Q.value = 0.5;
    this.exteriorLevel = ctx.createGain();
    this.exteriorLevel.gain.value = .78;
    this.world = ctx.createGain();
    this.world.gain.value = this.radioOnly ? 0 : 1;
    this.world.connect(this.cabin).connect(this.exteriorLevel).connect(this.master);
    const verb = ctx.createConvolver();
    verb.buffer = impulseResponse(ctx, 0.35, 3);
    const verbG = ctx.createGain(); verbG.gain.value = 0.18;
    this.exteriorLevel.connect(verb).connect(verbG).connect(this.master);

    this.buffers = {
      white: noiseBuffer(ctx, 3, 'white'),
      pink: noiseBuffer(ctx, 4, 'pink'),
      brown: noiseBuffer(ctx, 4, 'brown'),
      gravel: crackleBuffer(ctx, 3, 900, 6, 0.6),
      rain: crackleBuffer(ctx, 3, 2400, 4, 0.5),
      roof: crackleBuffer(ctx, 3, 500, 18, 0.18),
      mud: squelchBuffer(ctx, 4),
    };

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = this.radioOnly ? 0 : 0.85;
    // Direct clean connection to master without artificial boomy low-shelf
    this.engineGain.connect(this.master);
    try {
      const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.engine = new AudioWorkletNode(ctx, 'uaz-engine', { numberOfInputs: 0, outputChannelCount: [1] });
      this.engine.connect(this.engineGain);
      // Real studio Foley recordings replace procedural engine entirely
      try {
        const es = new EngineSamples(ctx, this.engineGain);
        await es.load();
        this.samples = es;
        // Disconnect worklet to eliminate synthetic hiss, 1750 Hz whistle and body boom
        this.engine.disconnect();
      } catch (e) { console.warn('engine samples unavailable, using the synthesised exhaust', e); }
      try {
        const res = await fetch(starterUrl);
        this.starterBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        console.warn('starter sound recording unavailable, using synthesis fallback', e);
      }
      try {
        const res = await fetch(hornUrl);
        this.hornBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        console.warn('horn sound recording unavailable, using synthesis fallback', e);
      }
      try {
        const res = await fetch(trainHornUrl);
        this.trainHornBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        console.warn('train horn recording unavailable, using synthesis fallback', e);
      }
      try {
        const loadBuf = async (url: string) => {
          try {
            const res = await fetch(url);
            return await ctx.decodeAudioData(await res.arrayBuffer());
          } catch (e) {
            console.warn('Failed to load cabin audio buffer', url, e);
            return null;
          }
        };
        const [hbPull, hbRel, swOn, swOff, swClk, gShift, gSlide, wiper, wUp, wDown, winDown, winUp, wSq1, wSq2] = await Promise.all([
          loadBuf(handbrakePullUrl),
          loadBuf(handbrakeReleaseUrl),
          loadBuf(switchOnUrl),
          loadBuf(switchOffUrl),
          loadBuf(switchClickUrl),
          loadBuf(gearShiftUrl),
          loadBuf(gearSlideUrl),
          loadBuf(wiperUrl),
          loadBuf(wiperUpUrl),
          loadBuf(wiperDownUrl),
          loadBuf(windowDownUrl),
          loadBuf(windowUpUrl),
          loadBuf(wiperSqueak1Url),
          loadBuf(wiperSqueak2Url),
        ]);
        this.handbrakePullBuffer = hbPull;
        this.handbrakeReleaseBuffer = hbRel;
        this.switchOnBuffer = swOn;
        this.switchOffBuffer = swOff;
        this.switchClickBuffer = swClk;
        this.gearShiftBuffer = gShift;
        this.gearSlideBuffer = gSlide;
        this.wiperBuffer = wiper;
        this.wiperUpBuffer = wUp;
        this.wiperDownBuffer = wDown;
        this.windowDownBuffer = winDown;
        this.windowUpBuffer = winUp;
        this.wiperSqueakBuffers = [wSq1, wSq2].filter((b): b is AudioBuffer => b !== null);

        // Load vehicle creak samples (suspension and seat)
        const suspUrls = [susp1, susp2, susp3, susp4, susp5, susp6, susp7];
        const seatUrls = [seat1, seat2, seat3, seat4, seat5, seat6, seat7];
        const [suspBufs, seatBufs] = await Promise.all([
          Promise.all(suspUrls.map(loadBuf)),
          Promise.all(seatUrls.map(loadBuf)),
        ]);
        this.suspensionBuffers = suspBufs.filter((b): b is AudioBuffer => b !== null);
        this.seatBuffers = seatBufs.filter((b): b is AudioBuffer => b !== null);
      } catch (e) {
        console.warn('Failed to load cabin audio assets', e);
      }
    } catch {
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const osc = [0, 1].map((i) => { const o = ctx.createOscillator(); o.type = i ? 'square' : 'sawtooth'; o.connect(filter); o.start(); return o; });
      filter.connect(gain).connect(this.engineGain);
      this.fallback = { osc, gain, filter };
    }

    const loop = (name: string, buf: string, type: BiquadFilterType, f: number, q: number, dest: AudioNode = this.world): Loop => {
      const src = ctx.createBufferSource(); src.buffer = this.buffers[buf]; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = f; filter.Q.value = q;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(dest);
      src.start(0, Math.random() * 2);
      this.loops[name] = { src, gain, filter };
      return this.loops[name];
    };
    loop('tyre', 'pink', 'bandpass', 420, 0.8);
    loop('rumble', 'brown', 'lowpass', 140, 0.7, this.master);
    loop('gravel', 'gravel', 'highpass', 600, 0.5);
    loop('mud', 'mud', 'lowpass', 900, 0.8);
    loop('splash', 'white', 'lowpass', 2400, 0.5);
    loop('slip', 'pink', 'bandpass', 900, 3);
    loop('wind', 'pink', 'bandpass', 500, 0.6);
    loop('rain', 'rain', 'highpass', 1800, 0.4);
    loop('roof', 'roof', 'lowpass', 1600, 0.6, this.master);
    loop('river', 'pink', 'bandpass', 700, 0.5);
    loop('leaves', 'pink', 'highpass', 2600, 0.3);
    // passing traffic: tyre roar plus a low engine drone that bends with the Doppler shift
    loop('traffic', 'brown', 'lowpass', 380, 0.7);
    loop('train', 'brown', 'lowpass', 160, 0.8);
    {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 42;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 260; filter.Q.value = 2;
      const gain = ctx.createGain(); gain.gain.value = 0;
      o.connect(filter).connect(gain).connect(this.world); o.start();
      this.passing = { osc: o, gain, filter };
    }

    const osc = ctx.createOscillator(); osc.type = 'triangle';
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 320;
    const wg = ctx.createGain(); wg.gain.value = 0;
    osc.connect(wf).connect(wg).connect(this.master); osc.start();
    this.whine = { osc, gain: wg };

    this.chassis = new ChassisSounds(ctx, this.master, this.world, this.buffers, {
      suspension: this.suspensionBuffers,
      seat: this.seatBuffers,
    });
    this.tape = new Tape(ctx, this.master, this.buffers.white);
    this.villageAmbience = new VillageAmbience(ctx, this.radioOnly ? this.master : this.world);
    this.score = new Score(ctx, this.master);
    this.score.onEnd = () => { this.piece = null; };
    if (this.piece) this.score.play(this.piece, 2.5);
    // publish the context last: update() and one-shots key off it being ready
    this.ctx = ctx;
    await ctx.resume();
  }

  /** Hand the cab over to the drive: the engine and the world fade in under the radio. */
  setRadioOnly(on: boolean): void {
    this.radioOnly = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0 : 0.8, t, 0.3);
    this.world.gain.setTargetAtTime(on ? 0 : 1, t, 0.3);
    this.villageAmbience?.setDestination(on ? this.master : this.world);
  }

  /** Music on (or `null`: off), fading over `fade` seconds, optional `scale` (1 = full). */
  music(p: Piece | null, fade = 2, scale = 1): void {
    this.piece = p;
    if (!this.score) return;
    if (p) this.score.play(p, fade, scale); else this.score.stop(fade);
  }

  /** Smoothly scale the music volume (e.g. 0.22 for quiet background in the prologue), over `fade` seconds. */
  musicVolume(scale = 1, fade = 2): void {
    this.score?.fadeVolume(scale, fade);
  }
  /** Music is meant to be on but the browser has not let the sound in yet. */
  get musicWaiting(): boolean { return !!this.piece && !this.score?.audible; }

  /** A moment of the story: the radio comes on with this song (and goes back to its programme after). */
  cue(tr: Track): void {
    this.radioTouched = true;
    this.tape?.cue(tr);
  }

  /** The title screen has no drive to update, only the radio. */
  updateRadio(dt: number): void { this.tape?.update(dt, 0.9); }

  /** Village morning soundscape (birds, bee, dogs, rooster, hens, breeze) */
  startVillage(scale = 0.42): void {
    if (!this.villageAmbience && this.ctx) this.villageAmbience = new VillageAmbience(this.ctx, this.radioOnly ? this.master : this.world);
    this.villageAmbience?.start(scale);
  }

  stopVillage(fade = 2): void {
    this.villageAmbience?.stop(fade);
  }

  updateVillage(dt: number): void {
    this.villageAmbience?.update(dt);
  }

  /** First tap or key press: wake the audio context and any radio the browser refused to start. */
  gesture(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    this.tape?.kick();
    this.score?.kick();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  update(dt: number, v: Vehicle, amb: AmbientState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (p: AudioParam, val: number, tc = 0.06) => p.setTargetAtTime(val, t, tc);
    // while cranking the starter one-shot carries the sound; the engine voice joins as it catches
    const on = v.engine === 'running' ? 1 : 0;
    const rpm = v.engine === 'off' ? 0 : v.rpm;
    if (this.engine) {
      const p = this.engine.parameters;
      set(p.get('rpm')!, rpm, 0.02);
      set(p.get('load')!, clamp(v.load, 0, 1), 0.04);
      set(p.get('throttle')!, v.thrEff, 0.03);
      set(p.get('on')!, on, 0.02);
      this.samples?.update(dt, rpm, clamp(v.load, 0, 1), v.thrEff, on);
    } else if (this.fallback) {
      const f = (rpm / 60) * 2;
      this.fallback.osc.forEach((o, i) => set(o.frequency, f * (i ? 0.5 : 1)));
      set(this.fallback.gain.gain, on * (0.12 + v.load * 0.15));
      set(this.fallback.filter.frequency, 300 + v.load * 900);
    }

    const speed = Math.abs(v.vx);
    const s = SURF[v.surface as Surface] ?? SURF.asphalt;
    const L = this.loops;
    const sp = clamp(speed / 20, 0, 1);
    const contact = v.wheels.reduce((a, w) => a + (w.F > 50 ? 0.25 : 0), 0);
    const surf = v.surface;
    set(L.tyre.gain.gain, contact * sp * (surf === 'asphalt' ? 0.22 : surf === 'wood' ? 0.15 : 0.12));
    set(L.tyre.filter.frequency, 280 + speed * 18);
    set(L.rumble.gain.gain, contact * Math.min(1, speed / 6) * (0.2 + s.rough * 0.8));
    set(L.rumble.filter.frequency, 70 + speed * 4 + s.rough * 60);
    set(L.gravel.gain.gain, contact * sp * (surf === 'gravel' ? 0.55 : surf === 'dirt' ? 0.18 : 0));
    const water = v.inWater ? 1 : 0;
    set(L.mud.gain.gain, contact * Math.min(1, (speed + v.slip * 6) / 6) * (surf === 'mud' ? 0.42 : 0) + water * 0.1 * Math.min(1, speed / 4));
    set(L.splash.gain.gain, water * Math.min(1, speed / 8) * 0.4);
    set(L.slip.gain.gain, clamp(v.slip - 0.15, 0, 1) * (surf === 'asphalt' ? 0.25 : 0.1));
    set(L.slip.filter.frequency, surf === 'asphalt' ? 1100 : 500);
    set(L.wind.gain.gain, clamp((speed - 4) / 24, 0, 1) * 0.16 + amb.wind * 0.08);
    set(L.wind.filter.frequency, 380 + speed * 18);
    set(L.rain.gain.gain, amb.rain * 0.18);
    set(L.roof.gain.gain, amb.rain * 0.5);
    set(L.river.gain.gain, amb.river * 0.22);
    set(L.leaves.gain.gain, amb.forest * 0.025 * (0.5 + amb.wind));
    const windowOpening = clamp(amb.windowOpening ?? 0, 0, 1);
    const closedCutoff = 2600 + Math.min(speed, 30) * 20;
    set(this.cabin.frequency, closedCutoff + (7200 - closedCutoff) * windowOpening, .18);
    set(this.exteriorLevel.gain, .78 + .22 * windowOpening, .18);

    // gearbox, transfer case and axle whine: subtle mechanical geared rumble, not an electronic beep
    const gearR = v.gear === 0 ? 0 : Math.abs(v.rpm);
    const howl = v.gear === -1 ? 0.02 : v.gear === 1 ? 0.015 : v.gear === 2 ? 0.01 : 0.004;
    set(this.whine.osc.frequency, Math.max(30, gearR * 0.18 * (v.gear === -1 ? 1.4 : 1) * (v.gear === 1 ? 1.15 : 1)));
    set(this.whine.gain.gain, on && v.gear !== 0 ? clamp(speed / 6, 0, 1) * (howl + (v.low ? 0.008 : 0) + (v.fourWD ? 0.004 : 0)) * (0.25 + v.load * 0.4) : 0);

    // suspension, body, wheel impacts, stones, joints, puddles and cab rattles
    this.chassis?.update(dt, v, amb.wet);

    // thunder
    while (this.thunderQ.length && this.thunderQ[0] <= t) { this.thunderQ.shift(); this.thunderNow(); }
    this.tape?.update(dt, amb.reception);
  }

  /** Roadside life: passing trucks, the freight train and the crossing bell. */
  life(dt: number, s: { traffic: TrafficSound; rail: RailSound }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (p: AudioParam, val: number, tc = 0.08) => p.setTargetAtTime(val, t, tc);
    const tr = s.traffic;
    set(this.loops.traffic.gain.gain, tr.gain * 0.5);
    set(this.loops.traffic.filter.frequency, 240 + tr.pitch * 260);
    set(this.loops.traffic.src.playbackRate, tr.pitch, 0.1);
    set(this.passing.gain.gain, tr.gain * (0.05 + tr.heavy * 0.07));
    set(this.passing.osc.frequency, 34 * tr.pitch * (1.4 - tr.heavy * 0.4), 0.1);
    if (tr.honk > 0) this.farHorn(tr.honk);

    const rl = s.rail;
    set(this.loops.train.gain.gain, rl.train * 0.55, 0.3);
    if (rl.train > 0.02) {
      // rail joints: a "ta-tak" per bogie pair as each wagon rolls by
      this.clackT -= dt * rl.clack;
      if (this.clackT < 0) {
        this.clackT += 1;
        const g = rl.train * 0.25;
        this.burst('brown', 'bandpass', 520, 1.5, g, 0.06, this.world);
        this.burst('brown', 'bandpass', 480, 1.5, g * 0.8, 0.06, this.world, 1, t + 0.14);
      }
    }
    if (rl.bell > 0.01) {
      // electric crossing bell: fast metallic strokes
      this.bellT -= dt;
      if (this.bellT < 0) {
        this.bellT = 0.2;
        this.tone('sine', 1480, 0.05 * rl.bell, 0.002, 0.16, this.world);
        this.tone('sine', 2230, 0.025 * rl.bell, 0.002, 0.1, this.world);
      }
    }
    if (rl.horn > 0) this.trainHorn(rl.horn);
  }

  /** A real Soviet locomotive whistle (P36, recorded in Moscow). The oscillators are the fallback. */
  private trainHorn(v: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (this.trainHornBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.trainHornBuffer;
      const g = ctx.createGain();
      g.gain.value = 0.7 * v;
      src.connect(g).connect(this.world);
      src.start(t);
      return;
    }
    for (const [at, dur] of [[0, 1.5], [1.8, 0.7]]) {
      for (const f of [311, 370]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = 700; bpf.Q.value = 0.9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(0.09 * v, t + at + 0.08);
        g.gain.setValueAtTime(0.09 * v, t + at + dur);
        g.gain.linearRampToValueAtTime(0, t + at + dur + 0.25);
        o.connect(bpf).connect(g).connect(this.world);
        o.start(t + at); o.stop(t + at + dur + 0.3);
      }
    }
  }

  /** Somebody else's horn on the road (a car behind the van), 0…1. */
  otherHorn(level: number): void { if (this.ctx && level > 0) this.farHorn(level * 2.2); }

  /** A truck behind or in front leaning on its horn. */
  private farHorn(v: number): void {
    const t = this.ctx!.currentTime;
    for (const [at, d] of [[0, 0.35], [0.45, 0.5]]) for (const f of [330, 415]) this.tone('sawtooth', f, 0.05 * v, 0.02, d, this.world, t + at);
  }

  private sirenNodes: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; hi: boolean } | null = null;
  /** GAI two-tone siren, gain 0…1 by distance; built once and left running silent. */
  siren(gain: number, t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.sirenNodes) {
      if (gain <= 0) return;
      const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 700;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1100; filter.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0;
      osc.connect(filter).connect(g).connect(this.world);
      osc.start();
      this.sirenNodes = { osc, gain: g, filter, hi: false };
    }
    const s = this.sirenNodes;
    const now = ctx.currentTime;
    const hi = Math.floor(t * 1.5) % 2 === 1;
    if (hi !== s.hi) { s.hi = hi; s.osc.frequency.setTargetAtTime(hi ? 950 : 700, now, 0.02); }
    s.gain.gain.setTargetAtTime(gain * 0.07, now, 0.1);
  }

  /** Inspector's whistle: a short trill. */
  /**
   * A line through the patrol car's roof loudspeaker: a feedback squeal, then a
   * blare of "speech" — a buzzy voice stepping through syllables, honked through
   * a horn-shaped band-pass and clipped. Subtitles carry the words.
   */
  megaphone(line: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    const dur = clamp(line.length * 0.055, 0.9, 2.8);
    this.tone('sine', 2350, 0.025, 0.02, 0.22, this.world, t - 0.03, 2600);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1350; bp.Q.value = 1.6;
    const formant = ctx.createBiquadFilter(); formant.type = 'peaking'; formant.frequency.value = 800; formant.gain.value = 8;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 5); }
    clip.curve = curve;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(formant).connect(clip).connect(bp).connect(g).connect(this.world);
    // syllables: a pitch contour and an envelope with short gaps
    let at = t + 0.12;
    const end = t + 0.12 + dur;
    o.frequency.setValueAtTime(150, at);
    while (at < end) {
      const syl = 0.09 + Math.random() * 0.11;
      o.frequency.linearRampToValueAtTime(120 + Math.random() * 90, at + syl * 0.6);
      formant.frequency.setValueAtTime(500 + Math.random() * 1400, at);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.05, at + 0.02);
      g.gain.setValueAtTime(0.05, at + syl * 0.75);
      g.gain.linearRampToValueAtTime(0, at + syl);
      at += syl + (Math.random() < 0.18 ? 0.12 : 0.02);
    }
    o.start(t); o.stop(end + 0.2);
    this.burst('white', 'bandpass', 2400, 2, 0.04, 0.08, this.world, 1, end + 0.05);
  }

  /** Glass jars / cargo rattle in the back: physical acoustic impact without synthetic sine beeps. */
  clink(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst('white', 'bandpass', 3200, 3, 0.04, 0.035, this.master, 1, t);
    this.burst('brown', 'lowpass', 500, 0.8, 0.045, 0.04, this.master, 1, t);
  }

  private boom: { gain: GainNode; bus: BiquadFilterNode; next: number; i: number } | null = null;
  /**
   * A cassette thumping out of an open car door somewhere ahead: kick on every beat, a bass line on
   * the off-beats, everything above the bass lost in the trees. `level` 0…1 by distance, every frame.
   */
  boombox(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.boom) {
      if (level <= 0) return;
      const bus = ctx.createBiquadFilter(); bus.type = 'lowpass'; bus.frequency.value = 320; bus.Q.value = 0.7;
      const gain = ctx.createGain(); gain.gain.value = 0;
      bus.connect(gain).connect(this.world);
      this.boom = { gain, bus, next: ctx.currentTime + 0.1, i: 0 };
    }
    const b = this.boom, now = ctx.currentTime;
    b.gain.gain.setTargetAtTime(level * 0.9, now, 0.25);
    if (level <= 0.001) { b.next = now + 0.1; return; }
    const beat = 60 / 126;
    const bass = [55, 55, 65.4, 49];
    if (b.next < now) b.next = now + 0.05;
    while (b.next < now + 0.25) {
      const at = b.next, i = b.i++;
      this.tone('sine', 120, 0.5, 0.004, 0.22, b.bus, at, 42);
      this.tone('sawtooth', bass[Math.floor(i / 4) % 4], 0.22, 0.01, beat * 0.4, b.bus, at + beat / 2);
      b.next += beat;
    }
  }

  /** A man shouting something out in the open, too far off for the words: a muffled run of syllables. */
  shout(level: number): void {
    const ctx = this.ctx;
    if (!ctx || level <= 0) return;
    const t = ctx.currentTime + 0.02;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const formant = ctx.createBiquadFilter(); formant.type = 'bandpass'; formant.frequency.value = 700; formant.Q.value = 1.2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(formant).connect(lp).connect(g).connect(this.world);
    const end = t + 0.5 + Math.random() * 0.8, peak = 0.09 * level;
    let at = t;
    o.frequency.setValueAtTime(170 + Math.random() * 40, at);
    while (at < end) {
      const syl = 0.08 + Math.random() * 0.12;
      o.frequency.linearRampToValueAtTime(140 + Math.random() * 110, at + syl * 0.6);
      formant.frequency.setValueAtTime(450 + Math.random() * 900, at);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.02);
      g.gain.setValueAtTime(peak, at + syl * 0.7);
      g.gain.linearRampToValueAtTime(0, at + syl);
      at += syl + (Math.random() < 0.2 ? 0.1 : 0.015);
    }
    o.start(t); o.stop(end + 0.2);
  }

  /** A car door slammed outside. */
  doorSlam(level: number): void {
    if (!this.ctx || level <= 0) return;
    this.burst('brown', 'lowpass', 420, 0.8, 0.6 * level, 0.16, this.world);
    this.tone('sine', 90, 0.2 * level, 0.003, 0.12, this.world);
  }

  /** Handcuffs ratcheting shut, then the patrol car's door. */
  cuffs(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 7; i++) this.burst('white', 'highpass', 4200, 1, 0.1, 0.012, this.master, 1, t + i * 0.03);
    this.tone('triangle', 3100, 0.03, 0.001, 0.25, this.master, t + 0.22);
    this.burst('brown', 'lowpass', 500, 0.8, 0.5, 0.18, this.master, 1, t + 0.9);
  }

  whistle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28;
    const depth = ctx.createGain(); depth.gain.value = 140;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.03);
    g.gain.setValueAtTime(0.06, t + 0.55);
    g.gain.linearRampToValueAtTime(0, t + 0.7);
    o.connect(g).connect(this.world);
    o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
  }

  // --- one-shots ----------------------------------------------------
  private env(dest: AudioNode, a: number, peak: number, d: number, at?: number): GainNode {
    const ctx = this.ctx!;
    const t = at ?? ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0005, t + a + d);
    g.connect(dest);
    return g;
  }

  private burst(buf: string, type: BiquadFilterType, f: number, q: number, peak: number, d: number, dest: AudioNode = this.master, rate = 1, at?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.buffers[buf]; src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = f; filter.Q.value = q;
    const t = at ?? ctx.currentTime;
    src.connect(filter).connect(this.env(dest, 0.003, peak, d, t));
    src.start(t, Math.random() * 1.5);
    src.stop(t + d + 0.1);
  }

  private tone(type: OscillatorType, f: number, peak: number, a: number, d: number, dest: AudioNode = this.master, at?: number, fEnd?: number): OscillatorNode {
    const ctx = this.ctx!;
    const t = at ?? ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + a + d);
    o.connect(this.env(dest, a, peak, d, t));
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }

  private horn: { src: AudioBufferSourceNode; gain: GainNode } | { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  hornOn(): void {
    const ctx = this.ctx;
    if (!ctx || this.horn) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain(); gain.gain.value = 0;

    // Real recorded vintage mechanical horn with seamless sustain loop ("БИ-И-ИП")
    if (this.hornBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.hornBuffer;
      src.loop = true;
      // The take is silent until the diaphragm speaks at 0.26 s. Starting at 0
      // (and looping back through 0.15) played that pause before every blast.
      src.loopStart = 0.3401;
      src.loopEnd = 1.6511;

      src.connect(gain).connect(this.master);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(1.35, t + 0.015);
      src.start(t, 0.2569);
      this.horn = { src, gain };
      return;
    }

    // Resonant bandpass tuned to the horn housing and radiator grille (fallback)
    const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = 980; bpf.Q.value = 2.0;
    const highShelf = ctx.createBiquadFilter(); highShelf.type = 'highshelf'; highShelf.frequency.value = 3400; highShelf.gain.value = -6;

    // Diaphragm non-linear saturation
    const shaper = ctx.createWaveShaper();
    const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128 - 1);
      c[i] = Math.tanh(x * 2.6) + 0.12 * Math.sin(x * Math.PI * 2);
    }
    shaper.curve = c;

    // Single-tone ~400 Hz mono fundamental with diaphragm slap
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(425, t);
    o1.frequency.exponentialRampToValueAtTime(400, t + 0.02);

    // Diaphragm metallic octave overtone
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(800, t);
    o2.frequency.exponentialRampToValueAtTime(796, t + 0.02);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o2.connect(g2);

    o1.connect(shaper);
    g2.connect(shaper);
    shaper.connect(bpf).connect(highShelf).connect(gain).connect(this.world);

    // Punchy attack
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.55, t + 0.01);

    o1.start(t);
    o2.start(t);
    this.horn = { oscs: [o1, o2], gain };
  }
  hornOff(): void {
    const ctx = this.ctx;
    if (!ctx || !this.horn) return;
    const h = this.horn;
    const t = ctx.currentTime;
    h.gain.gain.setValueAtTime(h.gain.gain.value, t);
    h.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    if ('src' in h) {
      h.src.stop(t + 0.04);
    } else {
      h.oscs.forEach((o) => o.stop(t + 0.04));
    }
    this.horn = null;
  }

  /**
   * The UMZ-451 engine starting: real starter recording (whine, compression strokes,
   * fuel catch and rev up into idle). Returns duration in seconds so vehicle physics
   * and ignition key animation match the audio.
   */
  starter(): number {
    const ctx = this.ctx;
    if (!ctx) return 1.65;
    const t0 = ctx.currentTime + 0.02;

    if (this.starterBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.starterBuffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.95, t0);
      // Smoothly cross-fade starter tail into the continuous running engine between 3.4s and 3.9s
      gain.gain.setValueAtTime(0.95, t0 + 3.4);
      gain.gain.linearRampToValueAtTime(0, t0 + 3.9);
      src.connect(gain).connect(this.master);
      src.start(t0);
      src.stop(t0 + 4.0);
      // Return 3.4s so the vehicle catches and engine audio blends at the exact peak moment
      return 3.4;
    }

    // Synthesis fallback if the audio buffer has not loaded yet
    const dur = 1.65;
    this.burst('white', 'highpass', 3000, 0.8, 0.22, 0.025, this.master, 1, t0);
    this.tone('sine', 140, 0.22, 0.002, 0.07, this.master, t0, 70);
    this.burst('white', 'bandpass', 1500, 3, 0.1, 0.06, this.master, 1, t0 + 0.05);
    const ts = t0 + 0.09, end = ts + dur;
    const m = ctx.createOscillator(); m.type = 'sawtooth';
    const m2 = ctx.createOscillator(); m2.type = 'square';
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1050; bp.Q.value = 0.8;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    const g = ctx.createGain(); g.gain.value = 0;
    m.connect(bp); m2.connect(g2).connect(bp);
    bp.connect(lp).connect(g).connect(this.master);
    g.gain.setValueAtTime(0, ts);
    g.gain.linearRampToValueAtTime(0.12, ts + 0.05);
    let at = ts;
    while (at < end) {
      const k = Math.min(1, (at - ts) / 0.6);
      const rpm = 95 + 105 * k;
      const period = 30 / rpm;
      const f = 150 + 130 * k;
      m.frequency.setValueAtTime(f, at);
      m.frequency.linearRampToValueAtTime(f * 0.7, at + period * 0.45);
      m.frequency.linearRampToValueAtTime(f * 1.06, at + period * 0.85);
      m2.frequency.setValueAtTime(f * 2.02, at);
      m2.frequency.linearRampToValueAtTime(f * 1.42, at + period * 0.45);
      m2.frequency.linearRampToValueAtTime(f * 2.12, at + period * 0.85);
      g.gain.setValueAtTime(0.115, at);
      g.gain.linearRampToValueAtTime(0.17, at + period * 0.45);
      g.gain.linearRampToValueAtTime(0.105, at + period * 0.85);
      this.burst('brown', 'lowpass', 240, 0.7, 0.5, period * 0.55, this.master, 1, at + period * 0.42);
      this.tone('sine', 50, 0.15, 0.012, period * 0.45, this.master, at + period * 0.42, 38);
      at += period;
    }
    for (const [dt, v] of [[0.3, 0.35], [0.17, 0.5], [0.07, 0.6]]) this.burst('brown', 'lowpass', 600, 0.8, v, 0.07, this.master, 1, end - dt);
    m.frequency.setTargetAtTime(55, end, 0.09);
    m2.frequency.setTargetAtTime(110, end, 0.09);
    g.gain.setTargetAtTime(0, end, 0.07);
    m.start(ts); m2.start(ts);
    m.stop(end + 0.6); m2.stop(end + 0.6);
    return end - t0;
  }

  playSample(buf: AudioBuffer | null, dest: AudioNode = this.master, gain = 1, rate = 1, time?: number): AudioBufferSourceNode | null {
    if (!this.ctx || !buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(time ?? this.ctx.currentTime);
    return src;
  }

  clunk(v = 0.6): void {
    if (!this.ctx) return;
    if (this.gearShiftBuffer) {
      this.playSample(this.gearShiftBuffer, this.master, 0.7 * v, 0.95 + Math.random() * 0.1);
      return;
    }
    this.tone('sine', 120, 0.2 * v, 0.002, 0.08, this.master, undefined, 60);
    this.burst('white', 'bandpass', 1800, 2, 0.12 * v, 0.04);
  }

  click(v = 0.5, on?: boolean): void {
    if (!this.ctx) return;
    if (on === true && this.switchOnBuffer) {
      this.playSample(this.switchOnBuffer, this.master, 0.7 * v, 0.98 + Math.random() * 0.04);
      return;
    }
    if (on === false && this.switchOffBuffer) {
      this.playSample(this.switchOffBuffer, this.master, 0.7 * v, 0.98 + Math.random() * 0.04);
      return;
    }
    if (this.switchClickBuffer) {
      this.playSample(this.switchClickBuffer, this.master, 0.6 * v, 0.95 + Math.random() * 0.1);
      return;
    }
    this.burst('white', 'highpass', 3500, 0.7, 0.18 * v, 0.02);
  }

  ratchet(on: boolean): void {
    if (!this.ctx) return;
    if (on) {
      if (this.handbrakePullBuffer) {
        this.playSample(this.handbrakePullBuffer, this.master, 0.85, 0.98 + Math.random() * 0.04);
        return;
      }
      const t = this.ctx.currentTime;
      for (let i = 0; i < 6; i++) this.burst('white', 'bandpass', 2600, 4, 0.12, 0.015, this.master, 1, t + i * 0.035);
      this.clunk(0.3);
    } else {
      if (this.handbrakeReleaseBuffer) {
        this.playSample(this.handbrakeReleaseBuffer, this.master, 0.85, 0.98 + Math.random() * 0.04);
        return;
      }
      const t = this.ctx.currentTime;
      for (let i = 0; i < 2; i++) this.burst('white', 'bandpass', 2600, 4, 0.12, 0.015, this.master, 1, t + i * 0.035);
      this.clunk(0.5);
    }
  }

  gearShift(grind = false): void {
    if (!this.ctx) return;
    if (this.gearShiftBuffer) {
      const t = this.ctx.currentTime;
      // Authentic tactile 4x4 manual gearbox shift: clean mechanical gate click and lock
      this.playSample(this.gearShiftBuffer, this.master, 1.15, 0.98 + Math.random() * 0.04, t);
      if (grind) this.burst('white', 'bandpass', 2200, 6, 0.08, 0.25);
      return;
    }
    this.clunk(0.5);
    if (grind) this.burst('white', 'bandpass', 2200, 6, 0.08, 0.25);
  }
  rattle(v: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.burst('white', 'bandpass', 1200 + Math.random() * 2500, 5, 0.05 * v, 0.03, this.master, 1, t + i * 0.025 + Math.random() * 0.02);
  }
  bumpCreak(s: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = clamp(s, 0.35, 1.2);
    // Suspension creak on road bump / pothole
    if (this.suspensionBuffers.length > 0) {
      const sBuf = this.suspensionBuffers[Math.floor(Math.random() * this.suspensionBuffers.length)];
      this.playSample(sBuf, this.master, 0.65 * k, 0.96 + Math.random() * 0.08, t);
    }
    // Driver seat compression creak (softer than suspension, distinct and cozy)
    if (this.seatBuffers.length > 0) {
      const stBuf = this.seatBuffers[Math.floor(Math.random() * this.seatBuffers.length)];
      this.playSample(stBuf, this.master, 0.35 * k, 0.97 + Math.random() * 0.06, t + 0.035);
    }
  }
  impact(v: number): void {
    if (!this.ctx) return;
    this.tone('sine', 70 + Math.random() * 20, 0.35 * clamp(v, 0, 1.5), 0.003, 0.18, this.master, undefined, 40);
    this.burst('brown', 'lowpass', 400, 0.8, 0.5 * clamp(v, 0, 1.5), 0.12);
    this.rattle(v * 1.5);
  }
  plank(v = 0.5): void {
    if (!this.ctx) return;
    this.tone('triangle', 160 + Math.random() * 60, 0.12 * v, 0.002, 0.09, this.world);
    this.burst('white', 'bandpass', 700, 3, 0.18 * v, 0.06, this.world);
  }
  splash(v: number): void { if (this.ctx) this.burst('white', 'lowpass', 1600, 0.6, 0.35 * clamp(v, 0, 1), 0.6, this.world, 0.7); }
  windowWind(down = true): void {
    if (!this.ctx) return;
    const buf = down ? this.windowDownBuffer : this.windowUpBuffer;
    if (buf) {
      this.playSample(buf, this.master, 0.72, 0.98 + Math.random() * 0.04);
    } else {
      this.burst('pink', 'bandpass', 1800, 2, 0.04, 1.55);
    }
  }
  wiper(dir = 1): void {
    if (!this.ctx) return;
    const isUp = dir > 0;
    const buf = isUp ? (this.wiperUpBuffer || this.wiperBuffer) : (this.wiperDownBuffer || this.wiperBuffer);
    if (buf) {
      this.playSample(buf, this.master, 0.5, 0.98 + Math.random() * 0.04);
    } else {
      this.burst('pink', 'bandpass', 2400, 3, 0.03, 0.18);
      this.tone('square', 90, 0.01, 0.01, 0.06);
    }
    // Occasional realistic rubber squeak strictly in tempo (~25% chance per stroke)
    if (this.wiperSqueakBuffers.length > 0 && Math.random() < 0.25) {
      const sqBuf = this.wiperSqueakBuffers[Math.floor(Math.random() * this.wiperSqueakBuffers.length)];
      setTimeout(() => {
        if (!this.ctx) return;
        this.playSample(sqBuf, this.master, 0.34, 0.96 + Math.random() * 0.08);
      }, 110);
    }
  }
  stamp(): void { if (this.ctx) { this.tone('sine', 180, 0.35, 0.001, 0.07, this.master, undefined, 90); this.burst('brown', 'lowpass', 900, 0.6, 0.4, 0.06); } }
  /** The small noises of a cigarette: pack rustle, the lighter's wheel and flame, a draw, a breath out, a butt in the tin. */
  smoking(k: 'pack' | 'flick' | 'flame' | 'puff' | 'exhale' | 'stub'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (k) {
      case 'pack':
        this.burst('white', 'bandpass', 3200, 1.2, 0.05, 0.12, this.master, 0.7);
        this.burst('white', 'highpass', 5200, 0.8, 0.03, 0.07, this.master, 1, t + 0.06);
        break;
      case 'flick':
        // the wheel scrapes the flint, the gas lights with a soft whoomp
        this.burst('white', 'bandpass', 4200, 4, 0.1, 0.05, this.master);
        this.tone('square', 2400, 0.03, 0.001, 0.015, this.master, t + 0.02, 1800);
        break;
      case 'flame':
        this.burst('pink', 'bandpass', 900, 1.2, 0.07, 0.24, this.master, 1, t);
        this.burst('white', 'highpass', 6000, 0.7, 0.025, 1.6, this.master, 1, t + 0.1);
        break;
      case 'puff':
        // an intake of breath through the cigarette, and the crackle of the leaf
        this.burst('pink', 'bandpass', 700, 1.5, 0.09, 0.4, this.master, 0.8, t);
        for (let i = 0; i < 5; i++) this.burst('white', 'bandpass', 3800, 6, 0.035, 0.012, this.master, 1, t + 0.08 + i * 0.07 + Math.random() * 0.03);
        break;
      case 'exhale':
        this.burst('pink', 'lowpass', 1200, 0.5, 0.085, 1.1, this.master, 0.7, t + 0.05);
        break;
      case 'stub':
        this.burst('white', 'bandpass', 1500, 2, 0.06, 0.1, this.master);
        this.burst('white', 'highpass', 4800, 0.8, 0.03, 0.25, this.master, 1, t + 0.04);
        break;
    }
  }

  private pumpSrc: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  /** The petrol pump: a steady gurgling hiss while the tank fills, and a click when the nozzle's trigger lets go. */
  fuelPump(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (on && !this.pumpSrc) {
      const src = ctx.createBufferSource(); src.buffer = this.buffers.pink; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.9;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5;
      const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(f.frequency);
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.1, t + 0.25);
      src.connect(f).connect(gain).connect(this.world);
      src.start(t); lfo.start(t);
      this.pumpSrc = { gain, src };
      this.tone('square', 140, 0.04, 0.001, 0.05, this.world, t, 70);
    } else if (!on && this.pumpSrc) {
      const { gain, src } = this.pumpSrc;
      this.pumpSrc = null;
      gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + 0.2);
      src.stop(t + 0.3);
      this.tone('square', 200, 0.05, 0.001, 0.04, this.world, t + 0.2, 90);
      this.burst('white', 'bandpass', 2200, 3, 0.05, 0.03, this.world, 1, t + 0.2);
    }
  }

  paper(): void {
    if (!this.ctx) return;
    this.burst('pink', 'bandpass', 1200, 1.2, 0.035, 0.1, this.master, 0.5);
  }
  type(): void { if (this.ctx) this.burst('white', 'bandpass', 2800, 3, 0.05, 0.015); }
  chime(): void {
    // Procedural arcade chime removed; deliveries are confirmed with tactile audio.stamp()
  }
  thunder(delay: number): void {
    if (!this.ctx) return;
    this.thunderQ.push(this.ctx.currentTime + delay);
    this.thunderQ.sort((a, b) => a - b);
  }
  private thunderNow(): void {
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 4; i++) this.burst('brown', 'lowpass', 160 + Math.random() * 200, 0.6, 0.6 - i * 0.1, 1.5 + Math.random() * 1.5, this.world, 0.6, t + i * (0.15 + Math.random() * 0.4));
    this.burst('white', 'lowpass', 900, 0.5, 0.15, 0.4, this.world, 1, t);
  }
  private chirp(_kind: 'tit' | 'crow'): void {
    this.villageAmbience?.playBird();
  }
  /** Bees loose in the cab, 0 (none) … 1 (a cloud of them): a buzz that wanders in pitch and loudness. */
  buzz(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.bees) {
      if (level <= 0) return;
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2;
      const oscs = [205, 231, 248].map((fr) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
        // each bee's pitch drifts as it flies about
        const lfo = ctx.createOscillator(); lfo.frequency.value = 2 + Math.random() * 5;
        const lg = ctx.createGain(); lg.gain.value = 18 + Math.random() * 16;
        lfo.connect(lg).connect(o.frequency); lfo.start(); o.start();
        o.connect(f);
        return o;
      });
      f.connect(g).connect(this.master);
      this.bees = { g, oscs };
    }
    this.bees.g.gain.setTargetAtTime(Math.min(1, level) * 0.06, ctx.currentTime, 0.15);
  }
  private bees: { g: GainNode; oscs: OscillatorNode[] } | null = null;

  animal(kind: 'dog' | 'rooster' | 'cow' | 'sheep'): void {
    if (kind === 'dog') this.villageAmbience?.triggerDogs();
    else if (kind === 'rooster') this.villageAmbience?.playRooster();
  }
}
