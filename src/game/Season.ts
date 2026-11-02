/**
 * The seasons of the service (docs/design.md, «Структура», «Зима»): autumn 1997, the first snow
 * in the second half of November, winter from December to February, the thaw in March, and the
 * spring and summer after. By the calendar's month (0 = January) and day of the month.
 */
export type Season = 'autumn' | 'first-snow' | 'winter' | 'thaw' | 'spring';

export function seasonOf(m: number, d: number): Season {
  if (m === 8 || m === 9 || (m === 10 && d < 15)) return 'autumn';
  if (m === 10) return 'first-snow';
  if (m === 11 || m === 0 || m === 1) return 'winter';
  if (m === 2 || (m === 3 && d < 10)) return 'thaw';
  return 'spring';
}

/** How much snow lies on a given date, 0…1, before the day's own weather adds to it. */
export function snowOf(m: number, d: number): number {
  const s = seasonOf(m, d);
  if (s === 'winter') return 1;
  if (s === 'first-snow') return 0.35;
  if (s === 'thaw') return m === 2 && d < 15 ? 0.8 : m === 2 ? 0.5 : 0.2;
  return 0;
}
