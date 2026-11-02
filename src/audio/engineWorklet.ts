/**
 * Carburetted UMZ-451 inline-4 under the cover between the seats of a UAZ-452,
 * synthesised per combustion event in an AudioWorklet:
 *  - exhaust: shaped blowdown pulses (firing order 1-2-4-3) with per-cylinder
 *    imbalance, a tailpipe waveguide and a muffler whose cutoff follows load;
 *  - intake: carburettor roar modulated by each intake stroke, with throttle;
 *  - mechanics: tappet clatter at valve events, timing gears, fan and belt;
 *  - the cab: boomy panel resonances, since the engine sits inside it;
 *  - idle hunting and the odd miss, overrun burble and afterfire pops.
 */
export const ENGINE_WORKLET = /* js */ `
function bp(f, q) {
  const w = 2 * Math.PI * f / sampleRate, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return { b0: al / a0, b1: 0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function lp(f, q) {
  const w = 2 * Math.PI * f / sampleRate, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: -2 * c / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
/** Retune a low-pass in place (cheap enough at k-rate). */
function setLp(o, f, q) {
  const w = 2 * Math.PI * Math.min(f, sampleRate * 0.45) / sampleRate, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  o.b0 = (1 - c) / 2 / a0; o.b1 = (1 - c) / a0; o.b2 = o.b0; o.a1 = -2 * c / a0; o.a2 = (1 - al) / a0;
}
function run(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
  return y;
}
class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 0, minValue: 0, maxValue: 8000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'on', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // 1 = the synthesised exhaust and cab boom (no recordings), 0 = only the mechanical layers
      { name: 'exh', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    const sr = sampleRate;
    this.seed = 1234567;
    this.rev = 0;                 // crank position in revolutions, 0..2 (one 4-stroke cycle)
    this.ev = 0;                  // next firing event index (0..3 within the cycle)
    this.valve = 0;               // next valve event (0..7)
    // firing order 1-2-4-3: slight timing and charge differences make the half-order lope
    this.offs = [0, 0.006, -0.004, 0.003];
    this.gain = [1.0, 0.86, 1.1, 0.93];
    this.s1 = 0; this.s2 = 0; this.d = 0.99;          // alpha-function pulse shaper
    this.nEnv = 0; this.nD = 0.99;                    // combustion rasp envelope
    this.inEnv = 0;                                   // intake stroke envelope
    this.tick = 0; this.tickAmp = 0;                  // tappet click
    this.pop = 0;
    this.dc = 0;
    // tailpipe: open-ended waveguide ~2.3 m
    this.dl = new Float32Array(4096); this.dw = 0; this.loopLp = 0;
    this.D = Math.round(sr / 74);
    this.muffler = lp(400, 0.9); this.muffler2 = lp(400, 0.7);
    this.boom = bp(96, 4.5); this.panel = bp(178, 3.2); this.cover = bp(420, 2.4);
    this.intakeA = bp(720, 1.6); this.intakeB = bp(1750, 2.2);
    this.tapA = bp(3300, 3.5); this.tapB = bp(5600, 4);
    this.fan = bp(620, 0.7);
    this.out = lp(3600, 0.7);
    this.rpmS = 0; this.onS = 0; this.loadS = 0; this.thrS = 0;
    this.gearPh = 0; this.hunt = 0;
    this.k = 0;
  }
  rand() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  process(inputs, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const n = out.length, sr = sampleRate;
    const rpmT = params.rpm[0], loadT = params.load[0], thrT = params.throttle[0], on = params.on[0], exh = params.exh[0];
    // k-rate: retune the muffler with load and revs (brighter and louder when pulling)
    if ((this.k++ & 3) === 0) {
      const L = this.loadS, rp = this.rpmS;
      setLp(this.muffler, 260 + 950 * L + rp * 0.16, 0.9);
      setLp(this.muffler2, 380 + 1400 * L + rp * 0.22, 0.7);
    }
    for (let i = 0; i < n; i++) {
      this.rpmS += (rpmT - this.rpmS) * 0.0015;
      this.onS += (on - this.onS) * (on > this.onS ? 0.0006 : 0.00015);
      this.loadS += (loadT - this.loadS) * 0.0008;
      this.thrS += (thrT - this.thrS) * 0.0012;
      const load = this.loadS, thr = this.thrS;
      const idle = Math.max(0, Math.min(1, 1 - (this.rpmS - 750) / 900));
      // idle hunting: the carb never quite settles
      this.hunt += 0.8 / sr;
      const rpm = this.rpmS * (1 + idle * 0.018 * Math.sin(this.hunt * 6.2831853) + idle * 0.008 * Math.sin(this.hunt * 17.3));
      const revRate = rpm / 60 / sr;
      this.rev += revRate;
      if (this.rev >= 2) { this.rev -= 2; this.ev = 0; this.valve = 0; }

      let imp = 0;
      // combustion events every half revolution
      if (rpm > 90 && this.ev < 4 && this.rev >= this.ev * 0.5 + this.offs[this.ev] + (this.ev === 0 ? 0.0001 : 0)) {
        const c = this.ev++;
        const overrun = thr < 0.04 && rpm > 1300;
        let amp = (overrun ? 0.18 : 0.42 + 0.75 * load + 0.15 * thr) * this.gain[c];
        amp *= 1 + (this.rand() - 0.5) * (0.12 + 0.45 * idle * (1 - load));
        if (idle > 0.6 && this.rand() < 0.007) amp *= 0.15;            // a lazy plug
        if (overrun && this.rand() < 0.035) { this.pop = 0.9 + this.rand() * 0.6; }
        imp = amp;
        // pulse width: wide and soft at low revs and light load, short and hard when pulling
        const tau = (0.0011 + 0.0024 * (1 - load)) * Math.pow(900 / Math.max(rpm, 500), 0.45);
        this.d = Math.exp(-1 / (tau * sr));
        this.nEnv = amp * (0.25 + 0.75 * load);
        this.nD = Math.exp(-1 / (0.0009 * sr));
        this.inEnv = 1;
      }
      // eight valve closures per cycle: the UMZ's audible tappets
      if (rpm > 90 && this.valve < 8 && this.rev >= this.valve * 0.25 + 0.11) {
        this.valve++;
        this.tickAmp = 0.5 + this.rand() * 0.6;
        this.tick = 1;
      }
      const noise = this.rand() * 2 - 1;

      // exhaust pressure: alpha pulse t·e^(-t/τ) plus combustion rasp, DC removed
      this.s1 = this.s1 * this.d + imp;
      this.s2 = this.s2 * this.d + this.s1 * (1 - this.d);
      this.nEnv *= this.nD;
      let ex = this.s2 * 1.0 + noise * this.nEnv * 0.5 + this.pop * noise * 1.4;
      this.pop *= 0.9975;
      this.dc += (ex - this.dc) * 0.003;
      ex -= this.dc;
      // tailpipe waveguide: inverting reflection at the open end, damped
      let rd = this.dw - this.D; if (rd < 0) rd += 4096;
      this.loopLp += (this.dl[rd] - this.loopLp) * 0.35;
      const pipe = ex - 0.5 * this.loopLp;
      this.dl[this.dw] = pipe; this.dw = (this.dw + 1) & 4095;
      const exhaust = run(this.muffler2, run(this.muffler, pipe));

      // intake: carb hiss on each intake stroke, mostly with the throttle open
      this.inEnv *= 0.9992;
      const inN = noise * this.inEnv * (0.15 + thr * 0.85) * Math.min(1, rpm / 2600);
      const intake = run(this.intakeA, inN) * 0.5 + run(this.intakeB, inN) * 0.25;

      // mechanics
      this.tick *= 0.9;
      const tap = (run(this.tapA, noise * this.tick) + 0.6 * run(this.tapB, noise * this.tick)) * this.tickAmp * (0.55 + rpm / 5000);
      this.gearPh += (rpm / 60) * 23 / sr;
      if (this.gearPh > 1) this.gearPh -= 1;
      const gears = Math.sin(this.gearPh * 6.2831853) * 0.006 * Math.min(1, rpm / 3000);
      const fanK = (rpm / 4000) * (rpm / 4000);
      const fan = run(this.fan, noise) * 0.22 * fanK;

      // the cab rings: a boom near 96 Hz, panels and the engine cover
      const body = run(this.boom, exhaust) * 1.2 + run(this.panel, exhaust) * 0.6 + run(this.cover, ex) * 0.12 * (0.4 + load);
      const mix = (exhaust * 1.25 + body) * exh + intake * 0.9 + tap * (0.11 + 0.1 * (1 - exh)) + gears + fan;
      out[i] = run(this.out, Math.tanh(mix * 1.6)) * 0.62 * this.onS;
    }
    return true;
  }
}
registerProcessor('uaz-engine', EngineProcessor);
`;
