import type { Profile } from './Profile';
import type { Vehicle } from '../vehicle/Vehicle';

/** Litres in a full tank, the pump's rate in litres per second, and A-76 per litre in 1997 roubles. */
export const TANK_L = 60;
export const PUMP_LPS = 2.6;
export const PRICE = 2100;
/** Slowest the van must be to count as standing at the pump. */
const STOP_MS = 2.5;

export interface FuelView {
  /** Litres taken so far this stop, how many of them on the post's coupons, and what the rest cost. */
  liters: number;
  talon: number;
  paid: number;
  /** Coupons left, litres. */
  talonsLeft: number;
  level: number;
  price: number;
  note: string;
  pumping: boolean;
}

interface Hooks {
  view: (v: FuelView | null) => void;
  pump: (on: boolean) => void;
  done: (liters: number, paid: number, why: 'full' | 'broke' | 'left', talon: number) => void;
}

/**
 * Filling up without a key or a menu: roll up beside the pump and stand still, and the tank fills —
 * on the post's coupons first, then out of Timur's own pocket; roll out and the stop is over.
 */
export class FuelStop {
  private liters = 0;
  private talon = 0;
  private paid = 0;
  private owed = 0;
  private blocked = false;
  private was = false;
  private pumping = false;
  private why: 'full' | 'broke' | null = null;
  private reported = false;

  constructor(private hooks: Hooks) {}

  private left = 0;

  update(dt: number, v: Vehicle, inBay: boolean, profile: Profile): void {
    this.left = profile.talons;
    const stopped = Math.abs(v.vx) < STOP_MS && Math.abs(v.vy) < STOP_MS;
    if (!inBay) {
      if (this.was) this.finish('left');
      this.blocked = false;
      this.was = false;
      return;
    }
    this.was = true;
    if (this.blocked) { this.hooks.view(this.viewOf(v, this.why === 'broke' ? 'Денег не хватило' : 'Бак полный', false)); return; }
    let pumping = false;
    let note = 'Остановись у колонки';
    if (stopped) {
      const room = (1 - v.fuel) * TANK_L;
      if (room < 0.05) {
        this.why = 'full'; this.blocked = true;
        this.finish('full');
      } else if (profile.talons < 0.01 && profile.money + (1 - this.owed) < PRICE * 0.1) {
        this.why = 'broke'; this.blocked = true;
        this.finish('broke');
      } else {
        let dl = Math.min(PUMP_LPS * dt, room);
        // coupons first
        const t = Math.min(dl, profile.talons);
        profile.talons -= t; this.talon += t;
        let rest = dl - t;
        if (rest > 0) {
          rest = Math.min(rest, (profile.money + 1 - this.owed) / PRICE);
          this.owed += rest * PRICE;
          const whole = Math.min(profile.money, Math.floor(this.owed));
          profile.money -= whole; this.paid += whole; this.owed -= whole;
        }
        dl = t + Math.max(0, rest);
        v.fuel = Math.min(1, v.fuel + dl / TANK_L);
        this.liters += dl;
        pumping = true;
        note = t > 0 ? 'Заправка по талонам · А-76' : 'Талоны кончились — за свои';
      }
    }
    if (pumping !== this.pumping) { this.pumping = pumping; this.hooks.pump(pumping); }
    this.hooks.view(this.viewOf(v, this.blocked ? (this.why === 'broke' ? 'Денег не хватило' : 'Бак полный') : note, pumping));
  }

  private viewOf(v: Vehicle, note: string, pumping: boolean): FuelView {
    return { liters: this.liters, talon: this.talon, paid: this.paid, talonsLeft: this.left, level: v.fuel, price: PRICE, note, pumping };
  }

  private finish(why: 'full' | 'broke' | 'left'): void {
    if (this.pumping) { this.pumping = false; this.hooks.pump(false); }
    if (!this.reported && (this.liters > 0.05 || this.paid > 0)) { this.reported = true; this.hooks.done(this.liters, this.paid, why, this.talon); }
    if (why === 'left') {
      this.hooks.view(null);
      this.liters = 0; this.talon = 0; this.paid = 0; this.reported = false;
    }
  }
}
