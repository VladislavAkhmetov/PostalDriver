import { clamp } from '../core/math';
import studioIdleUrl from '../assets/engine/engine_studio_idle.wav?url';

/**
 * Authentic studio-recorded engine voice:
 * Sourced directly from the same professional Foley recording session as the vehicle's
 * struggle starter ('starter.wav').
 *
 * Signal processing tuned for authentic vehicle feel:
 * - High-Pass Filter (HPF) at 170 Hz (Q = 0.7) to eliminate all boomy low-end drone.
 * - Dynamic Low-Pass Filter (1700 Hz base, opening up to ~3200 Hz with RPM & throttle).
 * - Gentle, natural pitch modulation (clamped to [0.86 .. 1.28]), avoiding cartoonish
 *   chipmunk speedups or violent digital shifts between gears.
 * - Internal RPM damping to ensure gear changes sound smooth and mechanical.
 * - Subtle organic carburetor idle wobble (never mechanically static).
 * - Dynamic source management ensuring reliable playback on any browser state.
 */
export class EngineSamples {
  ready = false;
  private src: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private hpf: BiquadFilterNode;
  private tone: BiquadFilterNode;
  private out: GainNode;
  private hunt = 0;
  private smoothRpm = 800;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;

    // High-pass filter tuned to 170 Hz (Max crisp/dry, eliminating all low-end drone)
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 170;
    this.hpf.Q.value = 0.7;

    // Low-pass tone filter (smooth natural highs without synthetic whistle or hiss)
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 2200;
    this.tone.Q.value = 0.55;

    // Signal chain: out -> HPF (170Hz) -> Lowpass -> master engine gain
    this.out.connect(this.hpf).connect(this.tone).connect(dest);
  }

  async load(): Promise<void> {
    const res = await fetch(studioIdleUrl);
    this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    this.ready = true;
  }

  update(dt: number, rpm: number, load: number, thr: number, on: number): void {
    if (!this.ready || !this.buffer) return;
    const t = this.ctx.currentTime;

    if (on <= 0) {
      this.out.gain.setTargetAtTime(0, t, 0.08);
      this.hunt = 0;
      this.smoothRpm = 800;
      if (this.src) {
        const s = this.src;
        this.src = null;
        setTimeout(() => { try { s.stop(); } catch(e){} }, 120);
      }
      return;
    }

    // Ensure audio buffer source is active when running
    if (!this.src) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.loop = true;
      src.connect(this.out);
      src.start(t, Math.random() * this.buffer.duration);
      this.src = src;
    }

    this.hunt += dt;

    // Smooth RPM feeding the audio engine to prevent digital pitch snaps during gear changes
    this.smoothRpm += (rpm - this.smoothRpm) * Math.min(1, dt * 5.5);

    // Subtle carburetor idle wobble (only active around idle)
    const idle = clamp(1 - (this.smoothRpm - 750) / 900, 0, 1);
    const wob = 1 + idle * (0.006 * Math.sin(this.hunt * 4.2) + 0.003 * Math.sin(this.hunt * 10.8));
    const r = Math.max(this.smoothRpm, 400) * wob;

    // Compressed natural pitch curve:
    // User requirement: "не менять так сильно тон"
    // Reference 1350 RPM = 1.0; gentle range [0.86 .. 1.28] across the whole powerband.
    const rpmNorm = (r - 1350) / 1350;
    const rate = clamp(1.0 + Math.sign(rpmNorm) * Math.pow(Math.abs(rpmNorm), 0.75) * 0.28, 0.86, 1.28);
    this.src.playbackRate.setTargetAtTime(rate, t, 0.06);

    // Dynamic lowpass filter communicates engine revving and throttle breathing
    const pull = Math.max(load, thr * 0.8);
    const targetCutoff = 1700 + (this.smoothRpm - 750) * 0.35 + pull * 550;
    this.tone.frequency.setTargetAtTime(clamp(targetCutoff, 1400, 3200), t, 0.08);

    // Full, present engine volume matching the preview audition
    const targetGain = on * (0.82 + 0.25 * pull);
    this.out.gain.setTargetAtTime(targetGain, t, 0.1);
  }
}
