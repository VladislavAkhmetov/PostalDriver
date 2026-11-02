import type { Delivery, Order } from './Career';
import type { LettersState } from './Letters';
import type { PoliceLog } from './Mission';
import type { RoadStopState } from './RoadStop';

/**
 * The working day in progress, kept apart from the profile (its own storage key) so a half-written
 * or stale checkpoint can never spoil the career itself. Written at the morning's start from the
 * post office, after each delivery, every little while on the road and when the tab is hidden;
 * dropped when the evening comes. It belongs to one day of one career: `day` and `runs` must match
 * the profile, or it is ignored.
 *
 * What comes back on «Продолжить»: the morning's route sheet, which addressees have had their mail
 * (and how late, in what state), the clock, the parcels' condition, the GAI's record, the side money
 * already earned, the roads taken, the van where it stood with its tank and its knocks, and the
 * story beats that are settled once played (the roadside stop, the old letters). What is not kept:
 * riders in the cab and favours taken on the way (their parcels), and Muha's day — those systems
 * start the day over from the morning, so Muha's own entries are not carried over to be earned twice.
 */
export interface DaySave {
  v: 1;
  day: number;
  runs: number;
  /** When it was written (ms since the epoch), for the menu. */
  at: number;
  planned: Order[];
  handed: string[];
  deliveries: Delivery[];
  time: number;
  cargo: number;
  police: PoliceLog;
  extras: [string, number, number][];
  visited: string[];
  van: { x: number; z: number; yaw: number; fuel: number; damage: number; steer: number; rad: number; pull: -1 | 1; flat: boolean; coolant: number; odometer: number };
  roadStop?: RoadStopState;
  letters?: LettersState;
}

const KEY = 'uaz-zarechye-day';
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Muha's story replays from the morning on a resume: his day's money is not carried over. */
export const replayedExtra = (label: string): boolean => label.startsWith('Муха') || label.startsWith('Начальнице сообщили');

export function loadDay(day: number, runs: number): DaySave | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DaySave | null;
    if (!s || s.v !== 1 || s.day !== day || s.runs !== runs) return null;
    if (!Array.isArray(s.planned) || !s.planned.length || !Array.isArray(s.handed) || !Array.isArray(s.deliveries) || !Array.isArray(s.extras) || !Array.isArray(s.visited)) return null;
    if (!num(s.time) || !num(s.cargo) || !s.police || !num(s.police.fines)) return null;
    const v = s.van;
    if (!v || ![v.x, v.z, v.yaw, v.fuel, v.damage, v.steer, v.rad].every(num)) return null;
    return s;
  } catch { return null; }
}

export function saveDay(s: DaySave): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode, full storage */ }
}

export function clearDay(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

/** For the title menu: «в пути · Сосновка, Заречье — доставлено», or how far the day has got. */
export function dayLabel(s: DaySave, name: (dest: string) => string): string {
  const dests = [...new Set(s.planned.map((o) => o.dest))];
  const done = dests.filter((d) => s.planned.filter((o) => o.dest === d).every((o) => s.handed.includes(o.id)));
  if (!done.length) return `в пути · ${dests.length} ${dests.length === 1 ? 'адресат' : dests.length < 5 ? 'адресата' : 'адресатов'} впереди`;
  return `в пути · ${done.map(name).join(', ')} — доставлено, ${done.length} из ${dests.length}`;
}
