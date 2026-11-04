import type { Vehicle } from '../vehicle/Vehicle';
import type { Mission } from './Mission';

/**
 * Mending the van at the roadside (docs/design.md, «Ремонт»): with the van stood on the handbrake
 * away from a door and from the GAI, a card offers what can be done with the tools under the seat.
 * Tightening the bent track rod takes most of the pull out — not all of it; the garage does the rest.
 * Topping the leaking radiator up from the canister buys time until it boils again. Either costs
 * minutes against the schedule, told by a fade to black, as the spare wheel is.
 */
export interface RoadsideHooks {
  choice(speaker: string, line: string, options: string[], pick: (i: number) => void): void;
  choiceOpen(): boolean;
  hint(id: string, text: string, keys?: string): void;
  toast(text: string): void;
  blackout(title: string, text: string, seconds: number, mid: () => void, done: () => void, stamp: string): void;
  /** A short scene outside the cab instead of the fade (Cutscene.ts): Timur at the front wheel or at the radiator hatch. False if it can't play. */
  scene?(kind: 'wheel' | 'hood', title: string, text: string, seconds: number, mid: () => void, done: () => void): boolean;
}

/** Below this the pull is not worth a stop. */
const PULL = 0.18;

export class RoadsideFix {
  private still = 0;
  private cool = 0;
  private boilTold = false;
  /** The steering's wear when last tightened: once more only after new knocks. */
  private tightenedAt = -1;
  private working = false;

  /** `busy`: something else has the van's attention (a door, the GAI, a puncture, a scene). */
  constructor(private mission: Mission, private hooks: RoadsideHooks, private busy: () => boolean) {}

  update(dt: number, v: Vehicle): void {
    this.cool -= dt;
    if (v.heat > 0.9 && !this.boilTold) {
      this.boilTold = true;
      this.hooks.hint('boil', 'Стрелка температуры в красном — закипел! Встань, затяни ручник, дай остыть и долей воды: канистра под сиденьем.', 'Пробел');
    }
    if (v.heat < 0.7) this.boilTold = false;
    const pull = v.steerWear > PULL && (this.tightenedAt < 0 || v.steerWear > this.tightenedAt + 0.1);
    const hot = v.heat > 0.72 || v.coolant < 0.5;
    if ((!pull && !hot) || this.working) { this.still = 0; return; }
    this.still = Math.abs(v.speedKmh) < 1 && v.handbrake && !this.busy() ? this.still + dt : 0;
    if (this.still < 1.6 || this.cool > 0 || this.hooks.choiceOpen()) return;
    this.still = 0;
    const opts: { label: string; go: () => void }[] = [];
    if (pull) opts.push({ label: 'Подтянуть рулевую тягу (минут десять)', go: () => this.tighten(v) });
    if (hot) opts.push({ label: 'Долить воды в радиатор (минут пять)', go: () => this.topUp(v) });
    opts.push({ label: 'Ехать дальше', go: () => { this.cool = 90; } });
    const what = pull && hot ? `Машину тянет ${v.pullDir < 0 ? 'влево' : 'вправо'}, и мотор греется.` : pull ? `Машину тянет ${v.pullDir < 0 ? 'влево' : 'вправо'} — тяга погнулась.` : 'Мотор греется — радиатор течёт.';
    this.hooks.choice('Под сиденьем', `${what} Ключи, монтировка и канистра с водой — под сиденьем.`, opts.map((o) => o.label), (i) => opts[i].go());
  }

  /** The work shown: a scene at the van if it can play, the fade to black otherwise. */
  private show(kind: 'wheel' | 'hood', title: string, text: string, seconds: number, mid: () => void, done: () => void, stamp: string): void {
    if (this.hooks.scene?.(kind, title, text, seconds + 1.8, mid, done)) return;
    this.hooks.blackout(title, text, seconds, mid, done, stamp);
  }

  private tighten(v: Vehicle): void {
    this.working = true;
    this.show('wheel', 'Подтягиваю тягу', 'Монтировку под колесо, ключ на двадцать два… Подтянул на глаз, как дед учил. Тянет меньше, но до гаража — аккуратно.', 2.6, () => {
      v.steerWear *= 0.4;
      this.tightenedAt = v.steerWear;
      this.mission.addTime(600);
    }, () => { this.working = false; this.hooks.toast('Тяга подтянута · −10 мин'); }, 'Подтянуто');
  }

  private topUp(v: Vehicle): void {
    this.working = true;
    this.show('hood', 'Доливаю воду', 'Дал постоять, тряпкой открутил пробку — пар в лицо. Долил из канистры. Течёт, зараза, но до вечера доедем.', 2.4, () => {
      v.coolant = 1;
      v.heat = Math.min(v.heat, 0.45);
      this.mission.addTime(300);
    }, () => { this.working = false; this.hooks.toast('Радиатор долит · −5 мин'); }, 'Долито');
  }
}
