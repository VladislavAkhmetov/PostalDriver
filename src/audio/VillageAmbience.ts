import { clamp } from '../core/math';
import roosterUrl from '../assets/village/rooster.ogg?url';
import chickensUrl from '../assets/village/chickens.ogg?url';
import dogNearUrl from '../assets/village/dog_near.ogg?url';
import dogFarUrl from '../assets/village/dog_far.ogg?url';
import beeUrl from '../assets/village/bee.ogg?url';
import birdsUrl from '../assets/village/birds.ogg?url';

interface VillageBuffers {
  rooster: AudioBuffer;
  chickens: AudioBuffer;
  dogNear: AudioBuffer;
  dogFar: AudioBuffer;
  bee: AudioBuffer;
  birds: AudioBuffer;
}

/**
 * Authentic village soundscape built exclusively from REAL audio recordings:
 * - Real morning birds singing in the birch trees (continuous, subtle, warm background bed)
 * - Real bumblebee / bee flying past the listener with 3D stereo panning
 * - Real village dogs calling & responding (dog 1 nearby, dog 2 answering in the distance)
 * - Real distant rooster crowing across the morning valley
 * - Real farm chickens softly clucking in the yard
 *
 * Designed as a subtle, harmonious atmospheric background that sits gently
 * underneath the theme music without ever overpowering it.
 */
export class VillageAmbience {
  private masterGain: GainNode;
  private readonly warmFilter: BiquadFilterNode;
  private birdsGain: GainNode;
  private birdsSource: AudioBufferSourceNode | null = null;

  private buffers: VillageBuffers | null = null;
  private loadPromise: Promise<void> | null = null;
  private loaded = false;
  private running = false;
  private time = 0;

  // Timers for natural, non-annoying intervals
  private beeTimer = 4.5;
  private roosterTimer = 8.0;
  private dogsTimer = 12.0;
  private hensTimer = 16.5;

  constructor(private ctx: AudioContext, private dest: AudioNode) {
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;

    // A subtle warm low-pass filter to keep the ambient sounds gently sitting behind the music
    const warmFilter = this.warmFilter = ctx.createBiquadFilter();
    warmFilter.type = 'lowpass';
    warmFilter.frequency.value = 5200;
    warmFilter.Q.value = 0.5;

    this.masterGain.connect(warmFilter);
    warmFilter.connect(dest);

    this.birdsGain = ctx.createGain();
    this.birdsGain.gain.value = 0.10; // subtle morning birds level
    this.birdsGain.connect(this.masterGain);

    // Preload real audio recordings
    this.loadPromise = this.loadBuffers();
  }

  /** The title is heard outdoors; driving routes the same sounds through the cabin. */
  setDestination(dest: AudioNode): void {
    if (dest === this.dest) return;
    this.warmFilter.disconnect(this.dest);
    this.warmFilter.connect(dest);
    this.dest = dest;
  }

  private async loadBuffers(): Promise<void> {
    try {
      const fetchDecode = async (url: string): Promise<AudioBuffer> => {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        return await this.ctx.decodeAudioData(data);
      };

      const [rooster, chickens, dogNear, dogFar, bee, birds] = await Promise.all([
        fetchDecode(roosterUrl),
        fetchDecode(chickensUrl),
        fetchDecode(dogNearUrl),
        fetchDecode(dogFarUrl),
        fetchDecode(beeUrl),
        fetchDecode(birdsUrl),
      ]);

      this.buffers = { rooster, chickens, dogNear, dogFar, bee, birds };
      this.loaded = true;

      // If started before buffers finished decoding, start the birds bed now
      if (this.running) {
        this.startBirdsBed();
      }
    } catch (e) {
      console.warn('VillageAmbience: failed to load real sound recordings', e);
    }
  }

  /** Start the village soundscape with a gentle, smooth fade-in */
  start(targetGain = 0.42): void {
    if (this.running) return;
    this.running = true;
    this.time = 0;

    // Fast initial schedule so the player hears each element in the first 20 seconds
    this.beeTimer = 4.2;
    this.roosterTimer = 7.5;
    this.dogsTimer = 11.5;
    this.hensTimer = 15.5;

    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    // Master level (0.42) for audible, warm village ambience underneath the song
    this.masterGain.gain.linearRampToValueAtTime(targetGain, t + 2.0);

    if (this.loaded) {
      this.startBirdsBed();
    }
  }

  /** Smoothly fade out and stop the village soundscape */
  stop(fadeSec = 2.0): void {
    if (!this.running) return;
    this.running = false;

    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.3, fadeSec));

    setTimeout(() => {
      if (!this.running && this.birdsSource) {
        try { this.birdsSource.stop(); } catch {}
        this.birdsSource = null;
      }
    }, (fadeSec + 0.1) * 1000);
  }

  /** Update loop called from game tick */
  update(dt: number): void {
    if (!this.running || !this.buffers) return;
    this.time += dt;

    // Organic breathing for the background morning birds bed
    const birdsMod = 0.095 + 0.025 * Math.sin(this.time * 0.25);
    this.birdsGain.gain.setTargetAtTime(birdsMod, this.ctx.currentTime, 0.2);

    // Real bee flying past across the stereo field
    this.beeTimer -= dt;
    if (this.beeTimer <= 0) {
      this.playRealBee();
      this.beeTimer = 32 + Math.random() * 24; // gentle, non-repetitive interval
    }

    // Real rooster crowing in the distance
    this.roosterTimer -= dt;
    if (this.roosterTimer <= 0) {
      this.playRealRooster();
      this.roosterTimer = 34 + Math.random() * 28;
    }

    // Real dogs barking (call and response)
    this.dogsTimer -= dt;
    if (this.dogsTimer <= 0) {
      this.playRealDogs();
      this.dogsTimer = 28 + Math.random() * 24;
    }

    // Real chickens clucking in the yard
    this.hensTimer -= dt;
    if (this.hensTimer <= 0) {
      this.playRealChickens();
      this.hensTimer = 20 + Math.random() * 20;
    }
  }

  playBird(): void {
    // The birds bed is already playing the real 62s bird recording continuously
  }

  triggerDogs(): void {
    this.playRealDogs();
  }

  playRooster(): void {
    this.playRealRooster();
  }

  // ---------------------------------------------------------------------------
  // Sound playback methods using real decoded audio buffers
  // ---------------------------------------------------------------------------

  /** Continuous gentle morning birds bed from real recording (birds.ogg) */
  private startBirdsBed(): void {
    if (!this.buffers || this.birdsSource) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.birds;
      src.loop = true;

      // Soft filter so bird chirps are warm and cozy, never piercing
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3800;
      filter.Q.value = 0.6;

      src.connect(filter).connect(this.birdsGain);
      src.start(0, Math.random() * 15);
      this.birdsSource = src;
    } catch (e) {
      console.warn('startBirdsBed error', e);
    }
  }

  /** Real bee / bumblebee flying past with smooth 3D stereo panning (bee.ogg) */
  private playRealBee(): void {
    if (!this.buffers) return;
    try {
      const t = this.ctx.currentTime;
      const dur = 4.2;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const startPan = -0.85 * dir;
      const endPan = 0.85 * dir;

      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.bee;

      // Take a random 4.2s slice from the 44s real bee recording
      const maxOffset = Math.max(0, this.buffers.bee.duration - dur - 1);
      const offset = Math.random() * maxOffset;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      // Swell as it passes close by (peak gain 0.18)
      gain.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.48);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(startPan, t);
      panner.pan.linearRampToValueAtTime(0, t + dur * 0.48);
      panner.pan.linearRampToValueAtTime(endPan, t + dur);

      src.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);

      src.start(t, offset, dur);
    } catch {}
  }

  /** Real distant rooster crowing (rooster.ogg) */
  private playRealRooster(): void {
    if (!this.buffers) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.rooster;

      // Distance acoustics: slight low-pass for village distance
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2600;
      filter.Q.value = 0.7;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.19, t + 0.15); // gentle background level
      const playDur = Math.min(src.buffer.duration, 7.5);
      gain.gain.setValueAtTime(0.19, t + playDur - 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + playDur);

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = -0.45; // placed across the lane on the left

      src.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);

      src.start(t, 0, playDur);
    } catch {}
  }

  /** Real village dogs: first dog barks nearby, second answers in the distance */
  private playRealDogs(): void {
    if (!this.buffers) return;
    try {
      const t = this.ctx.currentTime;

      // Dog 1: nearby yard (dog_near.ogg, pan +0.55)
      const src1 = this.ctx.createBufferSource();
      src1.buffer = this.buffers.dogNear;
      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.14;
      const panner1 = this.ctx.createStereoPanner();
      panner1.pan.value = 0.55;

      src1.connect(gain1);
      gain1.connect(panner1);
      panner1.connect(this.masterGain);
      src1.start(t);

      // Dog 2: answering in the distance 1.6s later (dog_far.ogg, pan -0.65)
      const tFar = t + 1.6;
      const src2 = this.ctx.createBufferSource();
      src2.buffer = this.buffers.dogFar;

      // Distant muffling
      const filter2 = this.ctx.createBiquadFilter();
      filter2.type = 'lowpass';
      filter2.frequency.value = 1600;

      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.08; // soft and distant
      const panner2 = this.ctx.createStereoPanner();
      panner2.pan.value = -0.65;

      src2.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(panner2);
      panner2.connect(this.masterGain);
      src2.start(tFar);
    } catch {}
  }

  /** Real chickens clucking softly in the yard (chickens.ogg) */
  private playRealChickens(): void {
    if (!this.buffers) return;
    try {
      const t = this.ctx.currentTime;
      const dur = 4.0;
      const maxOffset = Math.max(0, this.buffers.chickens.duration - dur - 0.5);
      const offset = Math.random() * maxOffset;

      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.chickens;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.2); // quiet and cozy
      gain.gain.setValueAtTime(0.11, t + dur - 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0.25; // near the porch/veranda on the right

      src.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);

      src.start(t, offset, dur);
    } catch {}
  }
}
