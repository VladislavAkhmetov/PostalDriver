import type { Ground } from '../world/Ground';
import type { Stop, World } from '../world/World';
import type { Vehicle } from '../vehicle/Vehicle';

export type RitualStep = 'near' | 'stop' | 'handbrake' | 'horn' | 'done';

export interface MissionEvents {
  hint(id: string, text: string, keys?: string): void;
  clearHint(id?: string): void;
  ritual(stop: Stop | null, step: RitualStep, honks: number): void;
  delivered(stop: Stop): void;
  dialogue(speaker: string, line: string): void;
  finished(stats: RunStats): void;
  /** Something for the driver to hear about: broken jars, running late. */
  notice(text: string): void;
}

/** The GAI's part in the run: money paid and how encounters ended. */
export interface PoliceLog { fines: number; arrests: number; escapes: number; warnings: number; checks: number }
export interface RunStats {
  time: number; distance: number; bumps: number; stuck: number; delivered: number; total: number; police: PoliceLog;
  /** Parcels' condition on arrival, 0…100 %. */
  cargo: number;
  /** The schedule, seconds, and how late the run came in (0 when on time). */
  budget: number; late: number;
  /** The postmaster's mark, 2…5, and why it isn't higher. */
  grade: number; remarks: string[];
}

/**
 * The run's schedule: the Zarechye shop shuts for lunch this many seconds of
 * engine time after the start. Tuned on the real physics: a steady driver
 * (≈35 km/h on the dirt, 80 on the asphalt) arrives with about a minute to spare.
 */
export const SCHEDULE = 720;
/** Parcels lost per unit of hard jolt (squared excess over 0.45) and per m/s of crash. */
const JOLT_DMG = 0.32, CRASH_DMG = 2.5;
/** Schedule time an arrest costs (protocol, the station). */
const ARREST_COST = 150;

const RADIUS = 25;

/** Delivery ritual (stop · handbrake · two honks) and contextual hints. */
export class Mission {
  routeS = 0;
  time = 0;
  private honks: number[] = [];
  private hornWas = false;
  private active: Stop | null = null;
  private step: RitualStep = 'near';
  private shown = new Set<string>();
  private stuckFor = 0;
  private stuckCount = 0;
  private bumps = 0;
  private deliveredT = -1;
  finished = false;
  /** Parcels' condition, 100 % at the start. */
  cargo = 100;
  private cargoWarned = 0;
  private lastJolt = -1;
  private lateWarned = 0;
  readonly police: PoliceLog = { fines: 0, arrests: 0, escapes: 0, warnings: 0, checks: 0 };
  private hintCooldown = 0;

  constructor(private world: World, private ground: Ground, private ev: MissionEvents) {}

  get nextStop(): Stop | null { return this.world.stops.find((s) => !s.done) ?? null; }
  get delivered(): number { return this.world.stops.filter((s) => s.done).length; }

  bump(): void { this.bumps++; }

  /** Seconds of schedule left (negative when late). */
  get left(): number { return SCHEDULE - this.time; }

  /** A suspension jolt (0…1): the hard ones knock the parcels about. */
  jolt(s: number): void {
    // a hard one counts as a pothole taken; a run of frames is one hit
    if (s > 0.6 && this.time - this.lastJolt > 0.4) this.bumps++;
    if (s > 0.6) this.lastJolt = this.time;
    this.hurt(Math.max(0, s - 0.45) ** 2 * JOLT_DMG);
  }
  /** Hit something at v m/s. */
  crash(v: number): void { this.hurt(Math.max(0, v - 0.8) * CRASH_DMG); }

  private hurt(d: number): void {
    // once the parcels are handed over there's nothing left to break
    if (this.finished || d <= 0 || this.world.stops.find((s) => s.id === 'zarechye')?.done) return;
    this.cargo = Math.max(0, this.cargo - d);
    const steps: [number, string][] = [
      [92, 'В кузове что-то звякнуло. Посылки едут в Заречье — тише на ямах.'],
      [78, 'Слышно, как по кузову катается разбитая банка. Сбавь на ямах!'],
      [55, 'Посылки превращаются в кашу. Валентина это не оценит.'],
    ];
    for (let i = this.cargoWarned; i < steps.length; i++) {
      if (this.cargo < steps[i][0]) { this.cargoWarned = i + 1; this.ev.notice(steps[i][1]); }
    }
  }

  /** An encounter with the GAI goes on the record. */
  record(kind: 'check' | 'warning' | 'fine' | 'arrest' | 'escape', fine: number): void {
    const p = this.police;
    p.fines += fine;
    if (kind === 'arrest') { p.arrests++; this.time += ARREST_COST; }
    else if (kind === 'escape') p.escapes++;
    else if (kind === 'warning') p.warnings++;
    else if (kind === 'check') p.checks++;
  }

  private once(id: string, text: string, keys?: string): void {
    if (this.shown.has(id) || this.hintCooldown > 0) return;
    this.shown.add(id);
    this.hintCooldown = 5;
    this.ev.hint(id, text, keys);
  }

  /** What the addressee says depends on how the parcels and the schedule fared. */
  private lineFor(stop: Stop): string {
    if (stop.id !== 'zarechye') return stop.line;
    const late = this.left < 0, broken = this.cargo < 75;
    if (late && broken) return 'Явился! Я уж закрыла, на обед ушла… А посылки-то мокрые — банки побил? Ой, горе. Накладные давай, акт составлять будем.';
    if (broken) return 'Через Серебрянку перебрался — и то ладно. А что посылки звенят? Банки побились, что ли… Ну, накладные давай, акт составим.';
    if (late) return 'Наконец-то! Я уж на обед закрывать собралась, полчаса тут стою. Ладно, заноси посылки, накладные — мне.';
    return stop.line;
  }

  /** The postmaster's mark for the run: start from five, lose points for each sin. */
  private stats(distance: number): RunStats {
    const late = Math.max(0, -this.left);
    const p = this.police;
    let grade = 5;
    const remarks: string[] = [];
    if (late > 0) { grade -= late > 120 ? 1.5 : late > 30 ? 1 : 0.5; remarks.push(`опоздал на ${Math.ceil(late / 60)} мин`); }
    if (this.cargo < 90) { grade -= this.cargo < 50 ? 2 : this.cargo < 75 ? 1 : 0.5; remarks.push(`посылки побиты (${Math.round(this.cargo)} %)`); }
    if (p.arrests) { grade -= 1.5; remarks.push('задержан ГАИ'); }
    else if (p.fines) { grade -= 0.5; remarks.push('штраф ГАИ'); }
    if (p.escapes) { grade -= 0.5; remarks.push('из ГАИ звонили'); }
    return {
      time: this.time, distance, bumps: this.bumps, stuck: this.stuckCount, delivered: this.delivered, total: this.world.stops.length,
      police: { ...p }, cargo: this.cargo, budget: SCHEDULE, late, grade: Math.max(2, Math.floor(grade + 1e-6)), remarks,
    };
  }

  update(dt: number, v: Vehicle, horn: boolean, ctx: { lights: boolean; wipers: boolean; rain: number; dark: number }): void {
    if (this.finished) return;
    if (v.engine === 'running') this.time += dt;
    this.hintCooldown -= dt;
    // route progress, monotone-ish so side trips don't jump the weather around
    const s = this.ground.main.nearestS(v.x, v.z);
    if (Math.abs(s - this.routeS) < 120 || s < this.routeS) this.routeS = s;

    // horn press edges
    if (horn && !this.hornWas) this.honks.push(this.time);
    this.hornWas = horn;
    this.honks = this.honks.filter((t) => this.time - t < 3);

    // stop ritual
    const stop = this.nextStop;
    let near: Stop | null = null;
    if (stop) {
      const d = Math.hypot(stop.pos.x - v.x, stop.pos.z - v.z);
      if (d < RADIUS) near = stop;
      if (d < 140 && d >= RADIUS) this.once(`approach-${stop.id}`, `Впереди ${stop.name}. Остановись у адресата — метров двадцать, не больше.`);
    }
    if (near !== this.active) {
      this.active = near;
      this.honks = [];
      if (!near) this.ev.ritual(null, 'near', 0);
    }
    if (near) {
      const stopped = Math.abs(v.speedKmh) < 1;
      let step: RitualStep = 'stop';
      if (stopped) step = v.handbrake ? 'horn' : 'handbrake';
      if (step !== 'horn') this.honks = [];
      if (step === 'horn' && this.honks.length >= 2) {
        step = 'done';
        near.done = true;
        near.person.wave = 3.5;
        this.deliveredT = this.time;
        this.ev.delivered(near);
        this.ev.dialogue(near.speaker, this.lineFor(near));
        this.active = null;
      }
      if (step !== this.step || step === 'horn') this.ev.ritual(near.done ? null : near, step, this.honks.length);
      this.step = step;
    } else this.step = 'near';

    if (!this.nextStop && this.deliveredT > 0 && this.time - this.deliveredT > 9) {
      this.finished = true;
      this.ev.finished(this.stats(v.odometer));
    }

    // the schedule: a word at two minutes to go, and when it's blown
    if (this.lateWarned === 0 && this.left < 120 && this.nextStop) { this.lateWarned = 1; this.ev.notice('До обеда в сельпо две минуты — поднажми, где дорога позволяет.'); }
    if (this.lateWarned === 1 && this.left < 0 && this.nextStop) { this.lateWarned = 2; this.ev.notice('Опаздываешь: сельпо закрылось на обед. Валентина будет ворчать.'); }

    // contextual hints
    const m = this.ground.marks;
    if (v.engine === 'running' && v.handbrake && Math.abs(v.speedKmh) < 1 && v.throttle > 0.2) this.once('hb', 'Ручник затянут. Отпусти его.', 'Пробел');
    if (this.routeS > m.junction - 160 && this.routeS < m.junction) this.once('junction', 'На развилке — направо, в лес на Сосновку. Дальше грунтовка размыта: ямы, лужи, колея. Включи передний мост и не гони.', 'Z');
    if (this.routeS > m.mud - 160 && this.routeS < m.mud + 40 && !v.fourWD) this.once('mud', 'Впереди низина у реки — колея и грязь. Включи передний мост, а лучше и понижайку.', 'Z · X');
    if (ctx.rain > 0.3 && !ctx.wipers) this.once('wipers', 'Дождь. Включи дворники.', 'R');
    if (ctx.dark > 0.5 && !ctx.lights) this.once('lights', 'Темнеет. Включи фары.', 'F');
    if (v.surface === 'asphalt' && v.low && Math.abs(v.speedKmh) > 25) this.once('lowasphalt', 'Понижайка на асфальте ни к чему — выключи, мотор не мучай.', 'X');

    // stuck detection
    const trying = v.throttle > 0.5 && Math.abs(v.speedKmh) < 2 && v.engine === 'running' && !v.handbrake;
    this.stuckFor = trying ? this.stuckFor + dt : Math.max(0, this.stuckFor - dt * 2);
    if (this.stuckFor > 3) {
      this.stuckFor = -6;
      this.stuckCount++;
      if (!v.fourWD) this.ev.hint('stuck', 'Буксуешь. Включи передний мост.', 'Z');
      else if (!v.low) this.ev.hint('stuck', 'Мало тяги — включи понижающую.', 'X');
      else this.ev.hint('stuck', 'Сдай назад и раскачай машину — газ мягче, руль прямо. Если совсем увяз — Backspace.', 'S · W');
    }
  }
}
