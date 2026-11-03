import type { Ground } from '../world/Ground';
import type { Stop, World } from '../world/World';
import type { Vehicle } from '../vehicle/Vehicle';
import { storyFor } from './Stories';
import type { Delivery, Order } from './Career';

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
  /** Each order of the day and how it went. */
  deliveries: Delivery[];
  /** Things on the side: riders driven, favours done — label, roubles, trust. */
  extras: [string, number, number][];
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
  /** Mission time of the last hand-over, null before the first (the time itself may start below zero: Muha's head start). */
  private deliveredT: number | null = null;
  finished = false;
  /** Parcels' condition, 100 % at the start. */
  cargo = 100;
  private cargoWarned = 0;
  private lastJolt = -1;
  private lateWarned = 0;
  private warnedFor = '';
  readonly police: PoliceLog = { fines: 0, arrests: 0, escapes: 0, warnings: 0, checks: 0 };
  private hintCooldown = 0;
  private sideCheck = 0;

  /** The day's addressees, in route order. */
  stops: Stop[];
  readonly extras: [string, number, number][] = [];
  /** Orders already handed over. */
  private readonly handed = new Set<string>();
  private readonly deliveries: Delivery[] = [];

  /** The orders the day started with (a restart from the pause menu takes these again). */
  readonly planned: Order[];
  readonly orders: Order[];

  constructor(private world: World, private ground: Ground, private ev: MissionEvents, orders: Order[] = []) {
    this.planned = [...orders];
    this.orders = [...orders];
    for (const st of world.stops) { st.done = false; st.person.wave = 0; st.cargo = ''; }
    this.stops = [];
    this.restop();
  }

  private restop(): void {
    const ids = new Set(this.orders.map((o) => o.dest));
    this.stops = this.world.stops.filter((s) => ids.has(s.id)).sort((a, b) => a.s - b.s);
    for (const st of this.stops) st.cargo = this.orders.filter((o) => o.dest === st.id).map((o) => o.title.toLowerCase()).join(', ');
  }

  /** Something taken on the way (a favour): one more order, outside the morning's load. */
  addOrder(o: Order): void {
    const st = this.world.stops.find((s) => s.id === o.dest);
    if (st?.done) st.done = false;
    this.orders.push(o);
    this.restop();
  }

  /** Something taken off the van before it was handed over (seized at a check): off the route too. */
  drop(id: string): void {
    const i = this.orders.findIndex((o) => o.id === id);
    if (i < 0 || this.handed.has(id)) return;
    this.orders.splice(i, 1);
    this.restop();
  }

  /** The day so far, for the autosave (Autosave.ts). */
  snapshot(): { handed: string[]; deliveries: Delivery[]; time: number; cargo: number; police: PoliceLog; extras: [string, number, number][]; visited: string[] } {
    return { handed: [...this.handed], deliveries: this.deliveries.map((d) => ({ ...d })), time: this.time, cargo: this.cargo, police: { ...this.police }, extras: this.extras.map((e) => [...e] as [string, number, number]), visited: [...this.visited] };
  }

  /** Back to a day saved part-way: the morning's orders are this mission's; these were handed over, at these times. */
  restore(s: ReturnType<Mission['snapshot']>): void {
    const ids = new Set(this.orders.map((o) => o.id));
    for (const id of s.handed) if (ids.has(id)) this.handed.add(id);
    this.deliveries.push(...s.deliveries.filter((d) => this.handed.has(d.order.id)));
    this.time = s.time;
    this.cargo = s.cargo;
    Object.assign(this.police, s.police);
    this.extras.push(...s.extras);
    for (const v of s.visited) this.visited.add(v);
    for (const st of this.stops) {
      st.done = this.orders.filter((o) => o.dest === st.id).every((o) => this.handed.has(o.id));
      // the approach words for an addressee already served are not said again
      if (st.done) { this.shown.add(`approach-${st.id}`); this.shown.add(`turn-${st.id}`); }
    }
    // with everyone served, the evening comes as after the last delivery
    if (this.deliveries.length) this.deliveredT = this.time;
  }

  /** Main-road progress at a point; out on the branch road from the fork (and its dead ends) it stands at the fork. */
  private routeAt(x: number, z: number): { s: number; branch: boolean } {
    const g = this.ground;
    const nb = g.nearestRoad(x, z, 40);
    const branch = !!nb && (nb.sample.road === g.stub || g.branchSpurs.includes(nb.sample.road)) && !(nb.sample.road === g.stub && nb.s < 30);
    return { s: branch ? g.marks.junction : g.main.nearestS(x, z), branch };
  }

  /**
   * The van put somewhere else (the yard at home, a day resumed part-way): progress jumps there.
   * (update() only follows it a little at a time, so a side trip doesn't jump the weather around.)
   */
  relocate(x: number, z: number): void { this.routeS = this.routeAt(x, z).s; }

  /** Whether an order has been handed over today. */
  handedOver(id: string): boolean { return this.handed.has(id); }

  /** While this is true the day can't end (a rider still in the cab). */
  hold: (() => boolean) | null = null;

  /** Time spent off the clock-face — changing a wheel, a chat — counts against the deadlines. */
  addTime(sec: number): void { this.time += sec; }

  /** A rider driven, a favour done: on the evening sheet. */
  extra(label: string, money: number, trust: number): void { this.extras.push([label, money, trust]); }

  get nextStop(): Stop | null { return this.stops.find((s) => !s.done) ?? null; }
  get delivered(): number { return this.stops.filter((s) => s.done).length; }

  bump(): void { this.bumps++; }

  /** The soonest deadline still ahead, or null when nothing on board is urgent. */
  private get soonest(): Order | null {
    let best: Order | null = null;
    for (const o of this.orders) {
      if (o.due === null || this.handed.has(o.id)) continue;
      if (!best || o.due < best.due!) best = o;
    }
    return best;
  }

  /** Seconds left to the soonest deadline (negative when late), or a large number when none. */
  get left(): number { const o = this.soonest; return o ? o.due! - this.time : 1e4; }
  /** For the route strip: seconds to the soonest deadline, or null. */
  get dueLeft(): number | null { const o = this.soonest; return o ? o.due! - this.time : null; }
  /** «Пенсия → Сосновка» for the soonest deadline, or null. */
  get urgentLabel(): string | null {
    const o = this.soonest;
    return o ? `${o.title} → ${this.stops.find((s) => s.id === o.dest)?.name ?? ''}` : null;
  }
  /** Anything breakable still in the back? */
  get fragileAboard(): boolean { return this.orders.some((o) => o.fragile && !this.handed.has(o.id)); }

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
    if (this.finished || d <= 0 || !this.fragileAboard) return;
    this.cargo = Math.max(0, this.cargo - d);
    const steps: [number, string][] = [
      [92, 'В кузове что-то звякнуло. Там стекло — тише на ямах.'],
      [78, 'Слышно, как по кузову катается разбитая банка. Сбавь на ямах!'],
      [55, 'Хрупкий груз превращается в кашу. Адресат это не оценит.'],
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

  /** Back roads driven so far, for the addressees to remark on. */
  readonly visited = new Set<string>();
  private lastDamage = 0;
  private lastRain = 0;
  private lastDark = 0;

  /** What the addressee says depends on how the trip went: parcels, schedule, GAI, mud, the van, the weather, the roads taken. */
  private lineFor(stop: Stop): string {
    const p = this.police;
    const mine = this.orders.filter((o) => o.dest === stop.id);
    const due = mine.filter((o) => o.due !== null).map((o) => o.due!);
    const fragile = mine.some((o) => o.fragile);
    return storyFor(stop.id, {
      cargo: fragile ? this.cargo : 100, left: due.length ? Math.min(...due) - this.time : 1e4, damage: this.lastDamage, fines: p.fines, arrests: p.arrests, escapes: p.escapes,
      rain: this.lastRain, dark: this.lastDark, stuck: this.stuckCount, visited: [...this.visited], kinds: mine.map((o) => o.kind),
    }, stop.line);
  }

  /** The postmaster's mark for the run: start from five, lose points for each sin. */
  private stats(distance: number): RunStats {
    const late = this.deliveries.reduce((a, d) => Math.max(a, d.late), 0);
    const fragile = this.orders.some((o) => o.fragile);
    const p = this.police;
    let grade = 5;
    const remarks: string[] = [];
    if (late > 0) { grade -= late > 120 ? 1.5 : late > 30 ? 1 : 0.5; remarks.push(`опоздал на ${Math.ceil(late / 60)} мин`); }
    if (fragile && this.cargo < 90) { grade -= this.cargo < 50 ? 2 : this.cargo < 75 ? 1 : 0.5; remarks.push(`посылки побиты (${Math.round(this.cargo)} %)`); }
    if (p.arrests) { grade -= 1.5; remarks.push('задержан ГАИ'); }
    else if (p.fines) { grade -= 0.5; remarks.push('штраф ГАИ'); }
    if (p.escapes) { grade -= 0.5; remarks.push('из ГАИ звонили'); }
    return {
      time: this.time, distance, bumps: this.bumps, stuck: this.stuckCount, delivered: this.delivered, total: this.stops.length,
      police: { ...p }, cargo: fragile ? this.cargo : 100, budget: SCHEDULE, late, grade: Math.max(2, Math.floor(grade + 1e-6)), remarks,
      deliveries: [...this.deliveries],
      extras: [...this.extras],
    };
  }

  update(dt: number, v: Vehicle, horn: boolean, ctx: { lights: boolean; wipers: boolean; rain: number; dark: number }): void {
    if (this.finished) return;
    if (v.engine === 'running') this.time += dt;
    this.lastDamage = v.damage; this.lastRain = ctx.rain; this.lastDark = ctx.dark;
    // which back roads has he taken?
    if (this.sideCheck-- <= 0) {
      this.sideCheck = 20;
      const hit = this.ground.nearestRoad(v.x, v.z, 6);
      if (hit && hit.sample.road !== this.ground.main && hit.sample.road !== this.ground.stub && hit.d < hit.sample.road.zoneAt(hit.s).width) this.visited.add(hit.sample.road.id);
    }
    this.hintCooldown -= dt;
    // route progress, monotone-ish so side trips don't jump the weather around; out on the branch
    // road from the fork (and its dead ends) the main road's progress stands at the fork
    const { s, branch } = this.routeAt(v.x, v.z);
    if (branch || Math.abs(s - this.routeS) < 120 || s < this.routeS) this.routeS = s;

    // horn press edges
    if (horn && !this.hornWas) this.honks.push(this.time);
    this.hornWas = horn;
    this.honks = this.honks.filter((t) => this.time - t < 3);

    // stop ritual
    let near: Stop | null = null;
    let nearD = RADIUS;
    for (const st of this.stops) {
      if (st.done) continue;
      const d = Math.hypot(st.pos.x - v.x, st.pos.z - v.z);
      if (d < nearD) { near = st; nearD = d; }
      if (d < 140 && d >= RADIUS) this.once(`approach-${st.id}`, `Впереди ${st.name}. Остановись у адресата — метров двадцать, не больше.`);
      // the back-road addressees: a word at the turn-off board
      if (st.turn && Math.abs(this.routeS - st.turn.s) < 120 && d > 140) this.once(`turn-${st.id}`, `Поворот на «${st.turn.name}» — по указателю у дороги. Там ждут почту.`);
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
        for (const o of this.orders) {
          if (o.dest !== near.id || this.handed.has(o.id)) continue;
          this.handed.add(o.id);
          this.deliveries.push({ order: o, late: o.due === null ? 0 : Math.max(0, this.time - o.due), cargo: o.fragile ? this.cargo : 100 });
        }
        this.deliveredT = this.time;
        this.ev.delivered(near);
        this.ev.dialogue(near.speaker, this.lineFor(near));
        this.active = null;
      }
      if (step !== this.step || step === 'horn') this.ev.ritual(near.done ? null : near, step, this.honks.length);
      this.step = step;
    } else this.step = 'near';

    if (!this.nextStop && this.deliveredT !== null && this.time - this.deliveredT > 9 && !this.hold?.()) {
      this.finished = true;
      this.ev.finished(this.stats(v.odometer));
    }

    // the schedule: a word at two minutes to go, and when it's blown
    const urgent = this.soonest;
    if (urgent && urgent.id !== this.warnedFor) { this.warnedFor = urgent.id; this.lateWarned = 0; }
    if (urgent) {
      const where = this.stops.find((s) => s.id === urgent.dest)?.name ?? '';
      if (this.lateWarned === 0 && this.left < 120 && this.left > 0) { this.lateWarned = 1; this.ev.notice(`${urgent.title} в ${where}: до срока две минуты — поднажми, где дорога позволяет.`); }
      if (this.lateWarned <= 1 && this.left < 0) { this.lateWarned = 2; this.ev.notice(`${urgent.title} в ${where} опаздывает. Ничего — доедь, извинишься.`); }
    }

    // contextual hints
    const m = this.ground.marks;
    if (v.engine === 'running' && v.handbrake && Math.abs(v.speedKmh) < 1 && v.throttle > 0.2) this.once('hb', 'Ручник затянут. Отпусти его.', 'Пробел');
    if (this.routeS > m.junction - 160 && this.routeS < m.junction - 20 && this.stops.some((st) => !st.done && st.branch)) this.once('junction-branch', 'На развилке — прямо, по асфальту, на Кайынлы. Дальше щебёнка и грунтовка вдоль озера — не гони.');
    if (this.routeS > m.junction - 160 && this.routeS < m.junction && this.stops.some((st) => !st.done && st.s > m.junction)) this.once('junction', 'На развилке — направо, в лес. Дальше грунтовка размыта: ямы, лужи, колея. Включи передний мост и не гони.', 'Z');
    if (this.routeS > m.mud - 160 && this.routeS < m.mud + 40 && !v.fourWD && this.stops.some((st) => !st.done && st.s > m.mud)) this.once('mud', 'Впереди низина у реки — колея и грязь. Включи передний мост, а лучше и понижайку.', 'Z · X');
    if (ctx.rain > 0.3 && !ctx.wipers) this.once('wipers', this.ground.snow > 0.3 ? 'Снег тает на стекле. Включи дворники.' : 'Дождь. Включи дворники.', 'R');
    if (this.ground.snow > 0.5 && v.surface === 'asphalt' && Math.abs(v.speedKmh) > 45) this.once('ice', 'Гололёд: на асфальте тормози заранее, в повороты — плавно. Передний мост поможет тронуться, но не остановиться.');
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
