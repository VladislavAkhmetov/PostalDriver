/** Pre-rendered noise and texture buffers used by looping sources. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w * 0.5;
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
  }
  return buf;
}

/** Sparse decaying clicks — gravel crunch, rain ticks. */
export function crackleBuffer(ctx: BaseAudioContext, seconds: number, perSec: number, decayMs: number, bright: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const count = Math.floor(perSec * seconds);
  for (let k = 0; k < count; k++) {
    const start = Math.floor(Math.random() * n);
    const amp = Math.pow(Math.random(), 2) * 0.9 + 0.1;
    const len = Math.floor((decayMs / 1000) * sr * (0.5 + Math.random()));
    let lpz = 0;
    for (let i = 0; i < len; i++) {
      const j = (start + i) % n;
      const w = Math.random() * 2 - 1;
      lpz += (w - lpz) * bright;
      d[j] += lpz * amp * Math.exp((-5 * i) / len);
    }
  }
  return buf;
}

/**
 * Mud under the tyres: a thick, low slush with small cracks as the tread breaks
 * suction. Deliberately unpitched (no chirps) so it never reads as bubbling.
 */
export function squelchBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  // bed: brown-ish noise, slowly breathing
  let b = 0;
  for (let i = 0; i < n; i++) {
    b = b * 0.985 + (Math.random() * 2 - 1) * 0.015;
    d[i] = b * 2.2 * (0.7 + 0.3 * Math.sin((i / sr) * 2.1 + Math.sin((i / sr) * 0.7) * 2));
  }
  // grains: short low-passed noise smacks, each with its own darkness
  const grains = Math.floor(seconds * 14);
  for (let k = 0; k < grains; k++) {
    const start = Math.floor(Math.random() * n);
    const len = Math.floor(sr * (0.03 + Math.random() * 0.07));
    const a = 0.02 + Math.random() * 0.08; // one-pole coefficient: 0.02 dark … 0.1 brighter
    const amp = 0.25 + Math.random() * 0.45;
    let y = 0;
    for (let i = 0; i < len; i++) {
      y += a * ((Math.random() * 2 - 1) - y);
      const env = Math.exp(-5 * (i / len)) * Math.min(1, i / (sr * 0.002));
      d[(start + i) % n] += y * env * amp * 6;
    }
  }
  // cracks: tiny bright ticks where the suction lets go
  for (let k = 0; k < seconds * 10; k++) {
    const start = Math.floor(Math.random() * n);
    const len = Math.floor(sr * 0.004);
    const amp = 0.05 + Math.random() * 0.1;
    for (let i = 0; i < len; i++) d[(start + i) % n] += (Math.random() * 2 - 1) * amp * (1 - i / len);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] *= 0.8 / (peak || 1);
  return buf;
}

export function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return buf;
}
