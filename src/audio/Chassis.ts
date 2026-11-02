import { clamp } from '../core/math';
import type { Vehicle } from '../vehicle/Vehicle';

interface Loop { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }

/**
 * Everything the van's body and wheels say on a bad road, all synthesised:
 * leaf springs and rubber bushings squeaking (stick-slip), the body creaking as
 * it twists, bump stops, wheels thumping into pothole edges (panned to the
 * corner that hit), stones pinging the floor on gravel, asphalt joints under
 * both axles, puddles slapping the wheel arches, mud sucking at the tyres and
 * the cab's own collection of rattles.
 */
export class ChassisSounds {
  private squeakCd = [0, 0, 0, 0];
  private prevVel = [0, 0, 0, 0];
  private puddleWas = [false, false, false, false];
  private puddleCd = [0, 0, 0, 0];
  private springPitch = [1.0, 1.13, 0.92, 1.05];
  private creakCd = 0;
  private stoneT = 0;
  private jointD = 20;
  private rattleT = 1;
  private mudT = 0;
  private coverT = 0;
  private rollPrev = 0;
  private wet: Loop;
  private spray: Loop;
  /** Transfer case and front-axle gear whine: two always-running tones steered by road speed. */
  private tcase: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  private axle: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  private cabinT = 1;
  private leafCd = [0, 0, 0, 0];

  constructor(private ctx: AudioContext, private inside: AudioNode, private outside: AudioNode, private buf: Record<string, AudioBuffer>) {
    this.wet = this.loop('pink', 'highpass', 2200, 0.5, outside);
    this.spray = this.loop('white', 'lowpass', 3200, 0.5, outside);
    const whine = (type: OscillatorType, q: number) => {
      const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = 200;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = q; filter.frequency.value = 400;
      const gain = ctx.createGain(); gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(inside);
      osc.start();
      return { osc, filter, gain };
    };
    this.tcase = whine('sawtooth', 5);
    this.axle = whine('triangle', 7);
  }

  /**
   * The UAZ's famous howl: straight-cut gears in the transfer case sing at
   * (road speed × final ratio × teeth). Louder on the throttle, much louder in
   * the low range, and the front axle joins in a different pitch once 4×4 is on.
   */
  private drivetrain(v: Vehicle, speed: number): void {
    const t = this.ctx.currentTime;
    const run = v.engine === 'running' && v.gear !== 0 ? 1 : 0;
    // road wheel rev/s → propeller shaft (hub-reduction axle ≈ 5.1:1)
    const prop = (speed / (2 * Math.PI * 0.375)) * 5.125;
    const lowK = v.low ? 1.94 : 1;
    const f1 = prop * 23 * lowK, f2 = prop * 17;
    const drive = clamp(0.3 + v.load * 1.1, 0.3, 1.2);
    const rise = clamp(speed / 3, 0, 1) * run;
    const g1 = rise * (0.007 + (v.fourWD ? 0.012 : 0) + (v.low ? 0.026 : 0)) * drive;
    const g2 = rise * (v.fourWD ? 0.009 + (v.low ? 0.012 : 0) : 0) * drive;
    this.tcase.osc.frequency.setTargetAtTime(Math.max(60, f1), t, 0.05);
    this.tcase.filter.frequency.setTargetAtTime(clamp(f1 * 1.04, 200, 3800), t, 0.05);
    this.tcase.gain.gain.setTargetAtTime(g1, t, 0.12);
    this.axle.osc.frequency.setTargetAtTime(Math.max(60, f2), t, 0.05);
    this.axle.filter.frequency.setTargetAtTime(clamp(f2 * 1.03, 200, 3800), t, 0.05);
    this.axle.gain.gain.setTargetAtTime(g2, t, 0.12);
  }


  private loop(buf: string, type: BiquadFilterType, f: number, q: number, dest: AudioNode): Loop {
    const src = this.ctx.createBufferSource(); src.buffer = this.buf[buf]; src.loop = true;
    const filter = this.ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = f; filter.Q.value = q;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(dest);
    src.start(0, Math.random() * 2);
    return { src, gain, filter };
  }

  // ---- building blocks -------------------------------------------------
  private panners = new Map<AudioNode, AudioNode[]>();
  /** One of five fixed panners per bus (−0.8 … 0.8), so nothing is allocated per frame. */
  private out(pan: number, dest: AudioNode): AudioNode {
    let list = this.panners.get(dest);
    if (!list) {
      list = [-0.8, -0.4, 0, 0.4, 0.8].map((v) => {
        if (v === 0) return dest;
        const p = this.ctx.createStereoPanner();
        p.pan.value = v;
        p.connect(dest);
        return p;
      });
      this.panners.set(dest, list);
    }
    return list[Math.round(clamp(pan, -0.8, 0.8) / 0.4) + 2];
  }

  private env(dest: AudioNode, a: number, peak: number, d: number, at: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + a);
    g.gain.exponentialRampToValueAtTime(0.0005, at + a + d);
    g.connect(dest);
    return g;
  }

  private noise(buf: string, type: BiquadFilterType, f: number, q: number, peak: number, d: number, dest: AudioNode, at = this.ctx.currentTime, fEnd?: number): void {
    const src = this.ctx.createBufferSource(); src.buffer = this.buf[buf];
    const filter = this.ctx.createBiquadFilter(); filter.type = type; filter.frequency.setValueAtTime(f, at); filter.Q.value = q;
    if (fEnd) filter.frequency.exponentialRampToValueAtTime(fEnd, at + d);
    src.connect(filter).connect(this.env(dest, 0.003, peak, d, at));
    src.start(at, Math.random() * 1.5);
    src.stop(at + d + 0.1);
  }

  private tone(type: OscillatorType, f: number, peak: number, d: number, dest: AudioNode, at = this.ctx.currentTime, fEnd?: number): void {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, at + d);
    o.connect(this.env(dest, 0.002, peak, d, at));
    o.start(at); o.stop(at + d + 0.05);
  }

  /**
   * Stick-slip squeak: a pulse train at the slip rate rings a resonance.
   * Leaf springs ~ 90–150 Hz slips through a 1–2 kHz ring; body seams much slower and lower.
   */
  private creak(rate: number, rateEnd: number, res: number, q: number, peak: number, d: number, dest: AudioNode, at = this.ctx.currentTime): void {
    const o = this.ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(rate, at);
    o.frequency.linearRampToValueAtTime(rateEnd, at + d);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = res; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + d * 0.25);
    g.gain.linearRampToValueAtTime(peak * 0.7, at + d * 0.7);
    g.gain.linearRampToValueAtTime(0, at + d);
    o.connect(f).connect(g).connect(dest);
    o.start(at); o.stop(at + d + 0.02);
  }

  /** Struck steel: a few inharmonic partials (jack, tool box, loose bracket). */
  private clank(peak: number, dest: AudioNode, base = 420, at = this.ctx.currentTime): void {
    for (const [k, a, d] of [[1, 1, 0.22], [2.76, 0.6, 0.14], [4.4, 0.4, 0.09], [6.9, 0.25, 0.06]]) {
      this.tone('sine', base * k * (0.97 + Math.random() * 0.06), peak * a, d, dest, at);
    }
    this.noise('white', 'highpass', 2500, 0.7, peak * 0.6, 0.02, dest, at);
  }

  // ---- per frame -------------------------------------------------------
  update(dt: number, v: Vehicle, wetness: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const speed = Math.abs(v.vx);
    const surf = v.surface;
    const contact = v.wheels.reduce((a, w) => a + (w.F > 50 ? 0.25 : 0), 0);
    const moving = clamp(speed / 3, 0, 1);

    v.wheels.forEach((w, i) => {
      const pan = (w.lx < 0 ? -1 : 1) * 0.55;
      const rear = w.lz > 0 ? 0.75 : 1;
      const dest = this.out(pan, this.inside);
      // pothole edges and stones: the tyre thumps, the axle answers
      if (w.hit > 0.022 && speed > 1.2 && w.F > 30) {
        const k = clamp(w.hit * 8 * clamp(speed / 10, 0.25, 1.6), 0, 1.2) * rear;
        this.noise('brown', 'lowpass', 180 + w.hit * 2200, 0.9, 0.42 * k, 0.09 + k * 0.06, dest, t);
        this.tone('sine', 62 + Math.random() * 18, 0.22 * k, 0.12, dest, t, 38);
        if (k > 0.55 && Math.random() < 0.5) this.clank(0.035 * k, this.out(0.25, this.inside), 380 + Math.random() * 200, t + 0.03);
      }
      // bump stop: rubber and steel meeting hard
      if (w.stop > 0.35) {
        const k = clamp(w.stop / 1.6, 0.2, 1) * rear;
        this.noise('brown', 'lowpass', 260, 0.8, 0.55 * k, 0.16, dest, t);
        this.tone('sine', 52, 0.3 * k, 0.2, dest, t, 34);
      }
      // leaf spring squeak when the suspension reverses after a big stroke
      this.squeakCd[i] -= dt;
      const pv = this.prevVel[i];
      if (this.squeakCd[i] <= 0 && Math.sign(pv) !== Math.sign(w.vel) && Math.abs(pv) > 0.16 && speed < 22) {
        this.squeakCd[i] = 0.35 + Math.random() * 0.4;
        const k = clamp(Math.abs(pv) / 0.6, 0.2, 1);
        const p = this.springPitch[i];
        const up = pv > 0;
        this.creak(95 * p, (up ? 140 : 75) * p, 1350 * p, 7, 0.05 * k * rear, 0.1 + k * 0.12, dest, t);
        // the rubber shackle bushes groan lower
        if (Math.random() < 0.6) this.creak(34 * p, 26 * p, 420 * p, 5, 0.035 * k, 0.16 + k * 0.1, dest, t + 0.02);
      }
      // small strokes still rub the leaves: a quiet, frequent "skrip-skrip" on rough ground
      this.leafCd[i] -= dt;
      if (this.leafCd[i] <= 0 && speed > 1.5 && w.F > 30 && Math.abs(w.vel) > 0.05 && Math.sign(pv) !== Math.sign(w.vel)) {
        this.leafCd[i] = 0.5 + Math.random() * 0.9;
        const k = clamp(Math.abs(w.vel) / 0.25, 0.2, 1) * rear;
        this.creak(70 * this.springPitch[i], 105 * this.springPitch[i], 1100 * this.springPitch[i], 8, 0.022 * k, 0.07 + k * 0.05, dest, t);
      }
      this.prevVel[i] = w.vel;
      // puddles: a broadband "pshh" off the tyre and a soft thud of water in the arch;
      // unpitched, and at most one per wheel every ~0.6 s so a string of puddles never bubbles
      const inPuddle = w.g.puddle || w.g.water > 0.02;
      this.puddleCd[i] -= dt;
      if (inPuddle && !this.puddleWas[i] && speed > 2 && this.puddleCd[i] <= 0) {
        this.puddleCd[i] = 0.6 + Math.random() * 0.3;
        const k = clamp(speed / 14, 0.2, 1) * (w.lz > 0 ? 0.55 : 1);
        const od = this.out(pan, this.outside);
        this.noise('white', 'lowpass', 2600 + speed * 60, 0.5, 0.16 * k, 0.22 + k * 0.2, od, t);
        this.noise('white', 'highpass', 3500, 0.5, 0.05 * k, 0.12 + k * 0.1, od, t + 0.02);
        this.noise('brown', 'lowpass', 160, 0.5, 0.22 * k, 0.1, dest, t + 0.015);
      }
      this.puddleWas[i] = inPuddle;
    });

    // body twisting over ruts and potholes: slow, low groans from the seams
    const rollRate = (v.roll - this.rollPrev) / Math.max(dt, 1e-3);
    this.rollPrev = v.roll;
    this.creakCd -= dt;
    if (this.creakCd <= 0 && Math.abs(rollRate) > 0.09 && speed > 0.8) {
      this.creakCd = 0.6 + Math.random() * 1.2;
      const k = clamp(Math.abs(rollRate) / 0.4, 0.2, 1);
      const res = 260 + Math.random() * 260;
      this.creak(18 + Math.random() * 10, 30 + Math.random() * 12, res, 6, 0.03 * k, 0.3 + Math.random() * 0.35, this.out((Math.random() - 0.5) * 0.8, this.inside), t);
    }

    // the cab itself: seat springs, door seals rubbing, dash plastic ticking as the body works
    this.cabinT -= dt * contact * moving * (0.25 + v.rough * 4 + Math.abs(v.accelLat) * 0.05 + Math.abs(v.accelLong) * 0.04);
    if (this.cabinT < 0) {
      this.cabinT = 0.7 + Math.random() * 2.2;
      const k = clamp(0.35 + v.rough * 2 + Math.abs(v.accelLat) * 0.04, 0.2, 1);
      const pick = Math.random();
      if (pick < 0.4) {
        // seat springs: two short groans
        const d = this.out(-0.15, this.inside);
        this.creak(38, 52, 640 + Math.random() * 160, 6, 0.028 * k, 0.16, d, t);
        this.creak(44, 60, 760 + Math.random() * 160, 6, 0.02 * k, 0.12, d, t + 0.11);
      } else if (pick < 0.75) {
        // rubber door seal sliding on the pillar
        const d = this.out(Math.random() < 0.5 ? -0.7 : 0.7, this.inside);
        this.noise('pink', 'bandpass', 1500 + Math.random() * 700, 3, 0.05 * k, 0.3 + Math.random() * 0.25, d, t, 900);
      } else {
        // dashboard plastic ticking
        const d = this.out(0.1, this.inside);
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.creak(110, 150, 2100 + Math.random() * 600, 9, 0.02 * k, 0.05, d, t + i * 0.08);
      }
    }
    this.drivetrain(v, speed);

    // gravel and dirt: stones flicked into the floor and the wheel arches
    if ((surf === 'gravel' || surf === 'dirt') && speed > 2) {
      this.stoneT -= dt * speed * (surf === 'gravel' ? 0.75 : 0.25) * contact;
      if (this.stoneT < 0) {
        this.stoneT = 0.4 + Math.random() * 1.6;
        const d = this.out(Math.random() * 1.4 - 0.7, this.inside);
        const f = 1800 + Math.random() * 3200;
        this.tone('triangle', f, 0.03 + Math.random() * 0.04, 0.03 + Math.random() * 0.05, d, t, f * 0.92);
        this.noise('white', 'bandpass', f, 3, 0.04, 0.015, d, t);
      }
    }

    // asphalt joints and patched cracks: "ta-tak" under the front then the rear axle
    if (surf === 'asphalt' && speed > 3) {
      this.jointD -= speed * dt;
      if (this.jointD < 0) {
        this.jointD = 12 + Math.random() * 38;
        const k = clamp(speed / 20, 0.2, 1);
        const lag = 2.3 / speed;
        for (const [at, g] of [[0, 1], [lag, 0.75]]) {
          this.noise('brown', 'lowpass', 220, 0.8, 0.16 * k * g, 0.07, this.inside, t + at);
          this.noise('white', 'bandpass', 1400, 1.5, 0.025 * k * g, 0.03, this.inside, t + at);
        }
      }
    }

    // mud: heavy clods flung off the tread smack the arches (dull, no pitch sweep)
    if (surf === 'mud' && speed + v.slip * 4 > 1) {
      this.mudT -= dt * (speed * 0.5 + v.slip * 3);
      if (this.mudT < 0) {
        this.mudT = 0.9 + Math.random() * 1.6;
        const d = this.out(Math.random() * 1.2 - 0.6, this.inside);
        this.noise('brown', 'lowpass', 300 + Math.random() * 150, 0.6, 0.14, 0.07, d, t);
      }
    }

    // the cab's rattles: sliding window glass, tool box, parcels, door lock, the jack
    this.rattleT -= dt * contact * moving * (0.15 + v.rough * 5 + clamp(speed / 25, 0, 0.5));
    if (this.rattleT < 0) {
      this.rattleT = 0.25 + Math.random() * 1.4;
      const k = clamp(0.3 + v.rough * 2 + speed / 30, 0.2, 1);
      const pick = Math.random();
      const side = Math.random() < 0.5 ? -0.7 : 0.7;
      if (pick < 0.3) {
        // window glass buzzing in its runners
        const d = this.out(side, this.inside);
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this.noise('white', 'bandpass', 2600 + Math.random() * 600, 6, 0.03 * k, 0.018, d, t + i * 0.022);
      } else if (pick < 0.5) {
        this.clank(0.022 * k, this.out(0.3, this.inside), 300 + Math.random() * 250, t);
      } else if (pick < 0.7) {
        // parcels and sacks shifting in the back
        this.noise('brown', 'lowpass', 260, 0.7, 0.12 * k, 0.12, this.inside, t);
      } else if (pick < 0.85) {
        const d = this.out(side, this.inside);
        this.noise('white', 'bandpass', 3600, 5, 0.04 * k, 0.012, d, t);
        this.noise('white', 'bandpass', 3200, 5, 0.03 * k, 0.012, d, t + 0.05);
      } else {
        // the engine cover lid and its latches
        this.noise('white', 'bandpass', 1100, 4, 0.04 * k, 0.04, this.out(0.15, this.inside), t);
        this.tone('square', 180, 0.01 * k, 0.04, this.inside, t);
      }
    }

    // idling around 850–1000 rpm, the engine cover lid buzzes against its latch
    if (v.engine === 'running' && v.rpm > 820 && v.rpm < 1050 && speed < 1) {
      this.coverT -= dt;
      if (this.coverT < 0) {
        this.coverT = 0.9 + Math.random() * 2.5;
        for (let i = 0; i < 4; i++) this.noise('white', 'bandpass', 900, 5, 0.02, 0.02, this.out(0.15, this.inside), t + i * (60 / v.rpm));
      }
    }

    // continuous: wet-road hiss off the tyres, and spray in the arches
    const asphaltish = surf === 'asphalt' || surf === 'gravel' ? 1 : 0.4;
    this.wet.gain.gain.setTargetAtTime(contact * clamp(speed / 18, 0, 1) * clamp(wetness - 0.3, 0, 1) * 0.28 * asphaltish, t, 0.15);
    this.wet.filter.frequency.setTargetAtTime(1700 + speed * 40, t, 0.2);
    const puddles = v.wheels.reduce((a, w) => a + (w.g.puddle || w.g.water > 0.02 ? 0.25 : 0), 0);
    this.spray.gain.gain.setTargetAtTime(puddles * clamp(speed / 10, 0, 1) * 0.18, t, 0.12);
  }
}
