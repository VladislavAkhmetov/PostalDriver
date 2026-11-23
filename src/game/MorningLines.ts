import { dateParts, type DayInfo } from './Career';

/** Before grandpa returns: ordinary family words, with weather checked on this day. */
const MORNING = [
  'Чай попил, улым? Беги, Зинаида ждать не любит.',
  'Перемячи в дорогу, в газетке. Одну Зинаиде Павловне дай — она любит.',
  'Картатай из санатория звонил, на почту, Зинаиде: режим, говорит, как в армии — подъём, грязи, кефир. Велел тебе не гнать.',
  '',
  'Әсәй с ночной пришла, спит. Тихонько со двора, не газуй под окнами.',
];

export function morningAway(day: number, info: Pick<DayInfo, 'season' | 'forecast'>): string {
  const line = MORNING[(day - 1) % MORNING.length];
  if (line) return line;
  if (dateParts(day).m === 4 && /холода/.test(info.forecast))
    return 'Куртку возьми! Черёмуховые холода. Зинаида, поди, уже мешки разложила.';
  if (['first-snow', 'winter', 'thaw'].includes(info.season))
    return 'Куртку застегни, улым. И рукавицы под сиденьем — я положила.';
  if (/гроз|дожд|ливень|морось/.test(info.forecast))
    return 'Дождевик под сиденье положила. Мешки накрой, когда понесёшь.';
  if (/жарко|жара/.test(info.forecast))
    return 'Воду во флягу налила. Пей в дороге, сегодня жарко будет.';
  return 'Хлеба на обратном пути возьми, улым. И Зинаиде от меня привет.';
}
