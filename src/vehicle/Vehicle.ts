import { clamp, damp, lerp } from '../core/math';
import { Ground, GroundInfo, newGround, Surface } from '../world/Ground';
import { ColliderIndex } from '../world/World';

export interface Controls { steer: number; gas: number; brake: number }
export type GearMode = 'auto' | 'manual';

const G = 9.81;
// kerb weight plus driver, mail sacks and parcels
const MASS = 2180;
/** Engine, flywheel, clutch and gearbox inertia (kg·m²) and the four wheels with hubs. */
const J_ENGINE = 0.32, J_WHEELS = 4 * 1.4;
const A = 1.15, B = 1.15, WB = 2.3;
const HCG = 0.72;
const IZ = 2900, IP = 2700, IR = 950;
const R = 0.4;
const K = 33000, C = 2700;
export const H0 = 0.75;
/** Tank fractions: per metre driven, per second running (scaled so one run uses roughly half a tank). */
const FUEL_PER_M = 1 / 9500, FUEL_IDLE = 1 / 9000, FUEL_DRY = 0.025;
const LFREE = H0 + (MASS * G) / (4 * K);
const GEARS: Record<number, number> = { [-1]: 5.224, 0: 0, 1: 4.124, 2: 2.641, 3: 1.58, 4: 1.0 };
const FINAL = 4.625;
const LOWR = 1.94;
export const IDLE = 780;
const REDLINE = 4100;
// UMZ-451M, net at the flywheel: 75 hp at 4000, flat torque around 2200
const TQ: [number, number][] = [[500, 72], [1000, 122], [1600, 146], [2200, 158], [2800, 154], [3500, 141], [4000, 126], [4500, 86]];

function torque(rpm: number): number {
  if (rpm <= TQ[0][0]) return TQ[0][1];
  for (let i = 1; i < TQ.length; i++) {
    if (rpm < TQ[i][0]) {
      const t = (rpm - TQ[i - 1][0]) / (TQ[i][0] - TQ[i - 1][0]);
      return lerp(TQ[i - 1][1], TQ[i][1], t);
    }
  }
  return TQ[TQ.length - 1][1];
}

interface Wheel {
  lx: number; lz: number; len: number; F: number; g: GroundInfo;
  /** For audio: suspension velocity (m/s, + extending), biggest ground step and bump-stop hit this frame. */
  vel: number; hit: number; stop: number; ph: number;
}

const tire = (a: number) => Math.sin(1.35 * Math.atan(9 * a));

/**
 * UAZ-452/3741 model: floating chassis on four leaf-spring corners, bicycle-model
 * tyres with a friction circle, 4-speed box, transfer case with 4WD and 1.94 low range.
 * Tuned for a forgiving, weighty feel rather than hardcore simulation.
 */
export class Vehicle {
  x = 0; z = 0; y = H0;
  yaw = 0; pitch = 0; roll = 0;
  vx = 0; vy = 0; r = 0;
  private vyV = 0; private pitchRate = 0; private rollRate = 0;
  steer = 0; throttle = 0; brake = 0;
  handbrake = true;
  gear = 1;
  gearMode: GearMode = 'auto';
  fourWD = false;
  low = false;
  engine: 'off' | 'cranking' | 'running' = 'off';
  private crankDur = 1.15;
  private crankT = 0;
  rpm = 0; load = 0; slip = 0; clutch = 0;
  /** Throttle actually reaching the engine (lags the pedal). */
  thrEff = 0;
  speedKmh = 0; wheelAngle = 0;
  accelLong = 0; accelLat = 0;
  shiftTimer = 0;
  private shiftHold = 0;
  private revHold = 0; private fwdHold = 0;
  odometer = 0;
  stuckTime = 0;
  private plankAcc = 0;
  private wasWet = false;
  private splashCd = 0;
  private frameImpact = 0;
  /** Kickback through the unassisted steering when one front wheel drops or climbs (rad). */
  kick = 0;
  private sideF = 0;
  surface: Surface = 'asphalt';
  rough = 0;
  inWater = false;
  wheels: Wheel[] = [[-0.72, -1.15], [0.72, -1.15], [-0.72, 1.15], [0.72, 1.15]].map(([lx, lz]) => ({ lx, lz, len: H0, F: (MASS * G) / 4, g: newGround(), vel: 0, hit: 0, stop: 0, ph: NaN }));

  onBump?: (s: number) => void;
  /** Crash speed along the contact normal, and where/how it happened (world contact point, normal away from the obstacle). */
  onImpact?: (v: number, hit?: { x: number; z: number; nx: number; nz: number; soft: boolean; arm: number }) => void;
  /** 0…1 accumulated crash damage (body and engine): weaker engine, steam and smoke from the hood. */
  damage = 0;
  /**
   * 0…1 wear of the steering linkage from knocks on the wheels' corners: the van pulls toward the
   * side that was hit (`pullDir`, −1 left, 1 right). A roadside tightening takes most of it out.
   */
  steerWear = 0;
  pullDir: -1 | 1 = 1;
  /** 0…1 wear of the radiator from knocks on the nose: it leaks coolant while the engine runs. */
  radWear = 0;
  /** Coolant in the radiator, 0…1 (topped up every morning, or from the canister on the roadside). */
  coolant = 1;
  /** Coolant temperature, 0 cold … ~0.55 normal (86 °C) … 1 boiling. */
  heat = 0;
  /** 0…1 of a full tank. Burns with distance and idling; near empty the engine runs on fumes. */
  fuel = 1;
  /** A punctured front tyre: the van pulls to one side, drags and rumbles until the spare goes on. */
  flat = false;
  /** False in the sandbox: the tank never runs down. */
  burnFuel = true;
  onShift?: () => void;
  onSplash?: (s: number) => void;
  onPlank?: () => void;

  place(x: number, z: number, yaw: number, ground: Ground): void {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = ground.height(x, z) + H0;
    for (const w of this.wheels) w.ph = NaN;
    this.vx = this.vy = this.r = this.vyV = this.pitchRate = this.rollRate = 0;
    this.pitch = this.roll = 0;
    for (const w of this.wheels) w.len = H0;
  }

  /** The engine catches now (the starter sound ended), however slow the frames are. */
  catchStart(): void {
    if (this.engine === 'cranking') { this.engine = 'running'; this.rpm = 1450; }
  }

  /** Crank for `crank` seconds (matched to the starter sound), then it runs. */
  startEngine(crank = 1.15): void {
    if (this.engine === 'off') { this.engine = 'cranking'; this.crankT = 0; this.crankDur = crank; }
  }

  shift(g: number): void {
    if (g === this.gear) return;
    this.gear = g;
    // a heavy, unsynchronised-feeling box: clutch down, lever across, clutch up
    this.shiftTimer = 0.62;
    this.shiftHold = 1.5;
    this.onShift?.();
  }

  shiftBy(d: number): void {
    const order = [-1, 0, 1, 2, 3, 4];
    const i = clamp(order.indexOf(this.gear) + d, 0, order.length - 1);
    this.shift(order[i]);
  }

  toggle4WD(): void { this.fourWD = !this.fourWD; if (!this.fourWD) this.low = false; }
  toggleLow(): void { this.low = !this.low; if (this.low) this.fourWD = true; }
  toggleHandbrake(): void { this.handbrake = !this.handbrake; }

  private mapPedals(dt: number, c: Controls): void {
    const fwd = c.gas, back = c.brake;
    if (this.gearMode === 'auto') {
      if (this.gear === -1) {
        if (fwd > 0.1 && back < 0.05 && this.vx > -0.5) { this.fwdHold += dt; if (this.fwdHold > 0.25) { this.shift(1); this.fwdHold = 0; } } else this.fwdHold = 0;
        this.throttle = this.gear === -1 ? back : fwd;
        this.brake = this.gear === -1 ? fwd : back;
      } else {
        if (this.gear === 0) this.gear = 1;
        if (back > 0.1 && fwd < 0.05 && this.vx < 0.5) { this.revHold += dt; if (this.revHold > 0.35) { this.shift(-1); this.revHold = 0; } } else this.revHold = 0;
        this.throttle = this.gear === -1 ? back : fwd;
        this.brake = this.gear === -1 ? fwd : back;
      }
    } else {
      this.throttle = fwd;
      this.brake = back;
    }
    if (this.engine !== 'running') this.throttle = 0;
    // carburettor: the accelerator pump and manifold fill take a moment
    this.thrEff = damp(this.thrEff, this.throttle, this.throttle > this.thrEff ? 2.6 : 6, dt);
  }

  update(dt: number, c: Controls, ground: Ground, colliders: ColliderIndex): void {
    // a zero step would divide suspension velocity by zero and poison the pose
    if (!(dt > 1e-5)) return;
    if (this.engine === 'cranking') {
      this.crankT += dt;
      if (this.crankT > this.crankDur) { this.engine = 'running'; this.rpm = 1450; }
    }
    // a bent track rod pulls toward the side that took the knock, a cracked head loses power
    this.steer = clamp(c.steer + Math.max(0, this.steerWear - 0.05) * 0.2 * this.pullDir + (this.flat ? 0.09 : 0), -1, 1);
    this.mapPedals(dt, c);
    this.throttle *= 1 - 0.45 * this.damage * this.damage;
    this.cool(dt);
    // boiling over: the engine loses its breath
    if (this.heat > 0.9) this.throttle *= 0.55;
    // an empty tank: coughing along on what is left in the pipes
    if (this.fuel < FUEL_DRY) this.throttle *= 0.3 + 0.7 * clamp(this.fuel / FUEL_DRY, 0, 1);

    // Decide on road speed (rpm each gear would impose), not on engine rpm,
    // which is still flared from the declutched shift window.
    if (this.gearMode === 'auto' && this.engine === 'running' && this.shiftTimer <= 0 && this.shiftHold <= 0 && this.gear >= 1) {
      const kmh = Math.abs(this.speedKmh);
      const wheelRpm = (Math.abs(this.vx) / (2 * Math.PI * R)) * 60 * FINAL * (this.low ? LOWR : 1);
      const at = (g: number) => wheelRpm * GEARS[g];
      if (this.gear < 4 && this.throttle > 0.1 && at(this.gear) > 2900 && at(this.gear + 1) > 1350 && this.slip < 0.3) this.shift(this.gear + 1);
      else if (this.gear > 1 && at(this.gear) < 1150) this.shift(this.gear - 1);
      else if (this.gear > 1 && this.throttle > 0.85 && at(this.gear) < 1600 && at(this.gear - 1) < 3300 && kmh > 8) this.shift(this.gear - 1);
      else if (this.gear > 1 && kmh < 6) this.shift(1);
    }
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.shiftHold = Math.max(0, this.shiftHold - dt);

    this.frameImpact = 0;
    for (const w of this.wheels) { w.hit = 0; w.stop = 0; }
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, ground);
    this.collide(colliders);

    this.speedKmh = this.vx * 3.6;
    if (this.frameImpact > 1.3) this.onBump?.(clamp((this.frameImpact - 1.1) / 3, 0, 1));
    const fl = this.wheels[0].g;
    this.surface = fl.surface;
    this.inWater = this.wheels.some((w) => w.g.surface === 'water');
    const speed = Math.abs(this.vx);
    if (this.engine === 'running' && this.throttle > 0.5 && speed < 1.0 && this.gear !== 0 && !this.handbrake) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    this.splashCd -= dt;
    // one splash on entering water, not a repeat every half second while in it
    const wetNow = this.wheels.some((w) => w.g.puddle) || this.inWater;
    if (wetNow && !this.wasWet && speed > 2 && this.splashCd <= 0) {
      this.onSplash?.(clamp(speed / 14, 0.2, 1));
      this.splashCd = 1.2;
    }
    this.wasWet = wetNow;
    if (fl.surface === 'wood') {
      this.plankAcc += speed * dt;
      if (this.plankAcc > 1.2) { this.plankAcc = 0; this.onPlank?.(); }
    }
  }

  private step(h: number, ground: Ground): void {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    let Fsum = 0, Tp = 0, Tr = 0, Nf = 0, Nr = 0;
    let muF = 0, muR = 0, crr = 0, rough = 0;
    let hF = 0, hR = 0;
    let water = false;
    for (const w of this.wheels) {
      const fo = -w.lz;
      const wx = this.x + fx * fo + rx * w.lx, wz = this.z + fz * fo + rz * w.lx;
      ground.query(wx, wz, w.g);
      const anchor = this.y + fo * sp - w.lx * sr;
      const len = anchor - w.g.height;
      const lenVel = (len - w.len) / h;
      w.len = len;
      w.vel = lenVel;
      if (!Number.isNaN(w.ph)) w.hit = Math.max(w.hit, Math.abs(w.g.height - w.ph));
      w.ph = w.g.height;
      let F = 0;
      const comp = LFREE - len;
      if (comp > 0) {
        F = K * comp - C * lenVel;
        const stop = H0 - 0.14 - len;
        if (stop > 0) { F += 240000 * stop - 9000 * lenVel; w.stop = Math.max(w.stop, -lenVel); }
        F = Math.max(0, F);
        if (-lenVel > this.frameImpact) this.frameImpact = -lenVel;
      }
      w.F = F;
      Fsum += F;
      Tp += F * fo;
      Tr += -F * w.lx;
      if (fo > 0) { Nf += F; muF += w.g.mu * 0.5; hF += w.g.height * 0.5; } else { Nr += F; muR += w.g.mu * 0.5; hR += w.g.height * 0.5; }
      crr += w.g.crr * 0.25;
      rough += w.g.rough * 0.25;
      if (w.g.surface === 'water') water = true;
    }
    // a flat drags like soft ground and shakes the cab
    if (this.flat) { crr += 0.035; rough += 0.25; }
    this.rough = rough;

    const speed = Math.abs(this.vx);
    // no power steering: a front wheel dropping into a hole or riding up its edge
    // yanks the wheels toward it, harder the faster you hit it
    const side = this.wheels[0].g.height - this.wheels[1].g.height;
    const dSide = side - this.sideF;
    this.sideF = side;
    if (Math.abs(dSide) < 0.5) this.kick += dSide * 0.13 * clamp(speed / 10, 0, 1.7);
    this.kick = clamp(this.kick * Math.exp(-h * 5), -0.12, 0.12);
    // full lock about 30° at a crawl, narrowing with speed
    let delta = this.steer * lerp(0.52, 0.14, clamp(speed / 24, 0, 1)) + this.kick;
    const g0 = this.wheels[0].g, g1 = this.wheels[1].g;
    let rutF = 0;
    if ((g0.surface === 'mud' || g0.surface === 'dirt') && g0.onRoad) {
      // deep ruts grab the tyres and steer the van along them
      const lat = (g0.lat + g1.lat) / 2;
      const grip = g0.surface === 'mud' ? 1 : 0.45;
      if (Math.abs(lat) < 0.6) { rutF = (-lat * 9000 - this.vy * 1600) * grip; delta *= 1 - 0.4 * grip; }
    }
    this.wheelAngle = delta;

    // ---- drivetrain
    const ratio = this.gear === 0 ? 0 : GEARS[this.gear] * FINAL * (this.low ? LOWR : 1) * (this.gear < 0 ? -1 : 1);
    const wheelRpm = (this.vx / (2 * Math.PI * R)) * 60;
    const coupled = wheelRpm * ratio;
    let drive = 0;
    if (this.engine === 'running') {
      const shifting = this.shiftTimer > 0;
      if (this.gear === 0 || shifting) this.clutch = 0;
      else if (coupled > IDLE * 1.05) this.clutch = 1;
      // pulling away: the clutch slips (never counts as locked) so the engine can rev into its torque
      else this.clutch = this.throttle > 0.02 ? clamp(0.3 + this.throttle * 0.9, 0, 0.97) : 0;
      let target: number;
      if (this.clutch >= 1) target = coupled * (1 + this.slip * 0.8);
      else if (this.clutch > 0) target = IDLE + this.thrEff * 1400 + this.slip * 800;
      else target = IDLE + this.thrEff * (this.gear === 0 || shifting ? 3000 : 1200);
      target = clamp(target, IDLE * 0.92, 4400);
      this.rpm = damp(this.rpm, target, this.clutch >= 1 ? 20 : 7, h);
      let tq = this.thrEff * torque(this.rpm);
      if (this.rpm > REDLINE) tq *= clamp(1 - (this.rpm - REDLINE) / 150, 0, 1);
      const eb = this.clutch >= 1 ? (1 - this.throttle) * (16 + this.rpm * 0.011) : 0;
      const trans = this.clutch >= 1 ? tq - eb : tq * this.clutch;
      drive = (trans * ratio * 0.82) / R;
      this.load = clamp(this.thrEff * (this.clutch > 0 ? 1 : 0.35) + this.slip * 0.2, 0, 1);
    } else {
      this.rpm = this.engine === 'cranking' ? 230 + Math.sin(this.crankT * 50) * 40 : damp(this.rpm, 0, 3, h);
      this.clutch = 0;
      this.load = 0;
    }

    // ---- tyres
    const sgn = clamp(this.vx / 0.6, -1, 1);
    let FxF = drive * (this.fourWD ? 0.5 : 0);
    let FxR = drive * (this.fourWD ? 0.5 : 1);
    const brakeF = this.brake * 15000;
    FxF -= brakeF * 0.62 * sgn;
    FxR -= (brakeF * 0.38 + (this.handbrake ? 9000 : 0)) * sgn;
    const vxa = Math.max(speed, 2.2);
    const aF = Math.atan((this.vy + this.r * A) / vxa) - delta * (this.vx >= 0 ? 1 : -1);
    const aR = Math.atan((this.vy - this.r * B) / vxa);
    // at a crawl the slip angle above is not real: a tyre turned on the spot rolls the way it points
    // (the low-speed yaw below steers the van). Without this the full-lock "slip" stood the van still.
    const crawl = clamp(0.12 + speed / 3, 0.12, 1);
    let FyF = -muF * Nf * tire(aF) * crawl;
    let FyR = -muR * Nr * tire(aR) * (this.handbrake && speed > 2 ? 0.45 : 1.06) * crawl;
    const limF = muF * Nf, limR = muR * Nr;
    let slip = 0;
    const magF = Math.hypot(FxF, FyF);
    if (magF > limF && magF > 1) {
      const k = limF / magF;
      slip = Math.max(slip, (Math.abs(FxF) - limF * 0.85) / Math.max(limF, 1));
      FxF *= k; FyF *= k;
    }
    const magR = Math.hypot(FxR, FyR);
    if (magR > limR && magR > 1) {
      const k = limR / magR;
      slip = Math.max(slip, (Math.abs(FxR) - limR * 0.85) / Math.max(limR, 1));
      FxR *= k; FyR *= k;
    }
    this.slip = damp(this.slip, clamp(slip, 0, 1.5), 10, h);

    const froll = crr * Fsum * sgn;
    const aero = 1.3 * this.vx * Math.abs(this.vx);
    const slope = (hF - hR) / WB;
    const grade = (-MASS * G * slope) / Math.sqrt(1 + slope * slope);
    let wdrag = water ? -this.vx * Math.abs(this.vx) * 500 - this.vx * 900 : 0;
    // ploughing through a flooded pit: a bow wave per wheel, scaled by water depth;
    // hit one on one side at speed and it drags the van (and the wheel) toward it
    let dragL = 0, dragR = 0;
    for (const w of this.wheels) {
      if (w.g.water <= 0 || w.F < 30) continue;
      const d = this.vx * Math.abs(this.vx) * 34 * Math.min(1, w.g.water / 0.25);
      if (w.lx < 0) dragL += d; else dragR += d;
    }
    wdrag -= dragL + dragR;
    this.kick += (dragL - dragR) * h * -4e-5;

    const cd = Math.cos(delta), sd = Math.sin(delta);
    const Fx = FxF * cd - FyF * sd + FxR - froll - aero + grade + wdrag;
    const Fy = FxF * sd + FyF * cd + FyR + rutF;
    const Mz = A * (FxF * sd + FyF * cd) - B * FyR;
    // spinning up the engine and wheels through the gearing costs a lot in the low gears
    const jEng = this.engine === 'running' ? J_ENGINE * ratio * ratio * Math.min(1, this.clutch) : 0;
    const mLong = MASS + (J_WHEELS + jEng) / (R * R);
    const ax = Fx / mLong, ay = Fy / MASS;
    this.vx += (ax + this.vy * this.r) * h;
    this.vy += (ay - this.vx * this.r) * h;
    this.r += (Mz / IZ) * h;
    if (speed < 4) {
      const k = 1 - speed / 4;
      const rk = (this.vx * Math.tan(delta)) / WB;
      this.r = lerp(this.r, rk, k * 0.3);
      this.vy *= 1 - k * 0.25;
    }
    const hold = brakeF + (this.handbrake ? 9000 : 0);
    if (Math.abs(this.vx) < 0.35 && hold > 1500 && Math.abs(drive) < hold && Math.abs(grade) < hold) {
      this.vx *= 0.6;
      if (Math.abs(this.vx) < 0.02) this.vx = 0;
    }
    this.accelLong = damp(this.accelLong, ax, 12, h);
    this.accelLat = damp(this.accelLat, ay, 12, h);

    // ---- body
    this.vyV += (Fsum / MASS - G) * h;
    this.y += this.vyV * h;
    this.pitchRate += ((Tp + MASS * ax * HCG) / IP) * h;
    this.pitchRate *= 1 - 0.6 * h;
    this.pitch += this.pitchRate * h;
    this.rollRate += ((Tr - MASS * ay * HCG) / IR) * h;
    this.rollRate *= 1 - 0.6 * h;
    this.roll += this.rollRate * h;

    const wvx = fx * this.vx + rx * this.vy, wvz = fz * this.vx + rz * this.vy;
    this.x += wvx * h;
    this.z += wvz * h;
    this.yaw -= this.r * h;
    this.odometer += speed * h;
    if (this.burnFuel && this.engine === 'running') {
      this.fuel = Math.max(0, this.fuel - speed * h * FUEL_PER_M - h * FUEL_IDLE * (0.5 + this.thrEff));
    }
  }

  /**
   * Where a knock lands decides what it breaks: the nose takes the radiator, a corner by a wheel
   * the steering. `along` / `lat`: the contact point from the centre, metres forward / to the right.
   */
  private wear(d: number, along: number, lat: number): void {
    const front = clamp((along - 0.4) / 1.4, 0, 1);
    const corner = clamp(Math.abs(lat) / 0.8, 0, 1) * (Math.abs(along) > 0.7 ? 1 : 0.4);
    const ds = d * (0.35 + corner * 1.3);
    if (ds > 0.008 && Math.abs(lat) > 0.25) this.pullDir = lat < 0 ? -1 : 1;
    this.steerWear = clamp(this.steerWear + ds, 0, 1);
    this.radWear = clamp(this.radWear + d * front * 1.5, 0, 1);
  }

  /**
   * The cooling system: a leaking radiator loses coolant while the engine runs; with less of it the
   * engine runs hotter, the more so under load, until it boils.
   */
  private cool(dt: number): void {
    const running = this.engine === 'running';
    if (running) this.coolant = Math.max(0, this.coolant - Math.max(0, this.radWear - 0.08) * 0.0035 * dt);
    const short = 1 - this.coolant;
    const target = running ? 0.55 + short * short * 1.1 * (0.5 + clamp(this.load, 0, 1)) : 0.08;
    this.heat = damp(this.heat, clamp(target, 0, 1.05), running ? 0.06 : 0.025, dt);
  }

  /**
   * Impulse-based collisions. Three circles along the body probe the obstacles;
   * each contact applies a rigid-body impulse at the actual contact point, so a
   * hit off-centre spins the van (yaw), a nose-on hit dips the nose and a side
   * hit rolls it. Soft obstacles absorb it, movable ones (traffic, people) take
   * part of it and are told to react. Hard hits cost damage.
   */
  private collide(ci: ColliderIndex): void {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    const rad = 1.0;
    for (const off of [-1.5, 0, 1.5]) {
      const cx = this.x + fx * off, cz = this.z + fz * off;
      for (const c of ci.query(cx, cz, rad + 1)) {
        let nx = 0, nz = 0, pen = 0;
        if (!c.box) {
          const dx = cx - c.x, dz = cz - c.z;
          const d = Math.hypot(dx, dz);
          pen = rad + c.r - d;
          if (pen <= 0 || d < 1e-4) continue;
          nx = dx / d; nz = dz / d;
        } else {
          const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
          const dx = cx - c.x, dz = cz - c.z;
          const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
          const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
          const ddx = lx - qx, ddz = lz - qz;
          const d = Math.hypot(ddx, ddz);
          let lnx: number, lnz: number;
          if (d > 1e-4) {
            if (d >= rad) continue;
            pen = rad - d; lnx = ddx / d; lnz = ddz / d;
          } else {
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { lnx = Math.sign(lx) || 1; lnz = 0; pen = px + rad; } else { lnx = 0; lnz = Math.sign(lz) || 1; pen = pz + rad; }
          }
          nx = cs * lnx + sn * lnz;
          nz = -sn * lnx + cs * lnz;
        }
        // light movable things (people) are brushed aside rather than pushed back against
        const light = c.mass !== undefined && c.mass < 500;
        if (!light) { this.x += nx * pen; this.z += nz * pen; }
        // contact point relative to the centre of mass, and the point's world velocity
        const px = cx - nx * rad - this.x, pz = cz - nz * rad - this.z;
        const w = -this.r;
        let wvx = fx * this.vx + rx * this.vy, wvz = fz * this.vx + rz * this.vy;
        const vcx = wvx + w * pz, vcz = wvz - w * px;
        const ovx = 0, ovz = 0;
        const vn = (vcx - ovx) * nx + (vcz - ovz) * nz;
        if (vn >= 0) continue;
        const arm = pz * nx - px * nz;
        const invM = 1 / MASS + (arm * arm) / IZ + (c.mass ? 1 / c.mass : 0);
        const e = c.soft ? 0.04 : c.mass ? 0.25 : -vn > 4 ? 0.12 : 0.2;
        const j = Math.min(MASS * 22, (-(1 + e) * vn) / invM);
        const ovxL = this.vx, ovyL = this.vy;
        wvx += (j * nx) / MASS; wvz += (j * nz) / MASS;
        this.r -= clamp((arm * j) / IZ, -1.1, 1.1) * 0.55;
        // scrubbing along the contact: paint on paint, tyre on kerb
        const tx = -nz, tz = nx;
        const vt = vcx * tx + vcz * tz;
        const jt = clamp(-vt * MASS * 0.35, -0.4 * j, 0.4 * j);
        wvx += (jt * tx) / MASS; wvz += (jt * tz) / MASS;
        this.vx = wvx * fx + wvz * fz;
        this.vy = wvx * rx + wvz * rz;
        // the body answers the jolt the way it answers braking and cornering
        this.pitchRate += clamp((MASS * (this.vx - ovxL) * HCG) / IP, -1.6, 1.6) * 0.4;
        this.rollRate += clamp((-MASS * (this.vy - ovyL) * HCG) / IR, -2.2, 2.2) * 0.4;
        c.hit?.(-nx, -nz, j, -vn);
        const speed = -vn;
        if (speed > 0.8) {
          const d = ((0.5 * MASS * speed * speed) / 420000) * (c.soft ? 0.15 : 1);
          this.damage = clamp(this.damage + d, 0, 1);
          this.wear(d, px * fx + pz * fz, px * rx + pz * rz);
          this.onImpact?.(speed, { x: cx - nx * rad, z: cz - nz * rad, nx, nz, soft: !!c.soft, arm });
        }
      }
    }
  }
}
