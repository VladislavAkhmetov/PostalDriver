import { mulberry32 } from '../core/math';
import { seasonOf, snowOf, type Season } from './Season';
import { SUNNY_START } from '../world/Atmosphere';

/**
 * Timur's service at the Klyuchevsk post office, one working day at a time and without end (docs/design.md).
 * As on a real rural post route of the 90s there is nothing to choose from: the morning brings the day's
 * waybill — the route by the weekly timetable and what goes where. What the player chooses are the
 * requests: a sack of sugar for someone's aunt, cash in Timur's own pocket. The pay is a salary — an
 * advance on the 15th, the rest at the month's end with a bonus earned by careful, punctual days, and
 * now and then it is late. Fuel comes on the post's coupons; past them it is out of his own money.
 */

export type OrderKind = 'pension' | 'letters' | 'papers' | 'parcel' | 'telegram' | 'medicine' | 'parts' | 'invoices';

export interface Order {
  id: string;
  /** Stop id in the world (`sosnovka`, `zarechye`, `khutor`, `kolkhoz`, `forestry`, `apiary`, `kainly`, `camp`). */
  dest: string;
  kind: OrderKind;
  /** Short cargo name for the board and the delivery card. */
  title: string;
  /** A line about it from the sender or the post office. */
  note: string;
  pay: number;
  fragile: boolean;
  /** Seconds of driving (engine time) it must be there by, or null for any time today. */
  due: number | null;
  /** A request on the side: who asks (paid in cash to Timur). Official mail has none and pays nothing by itself. */
  from?: string;
  /** An old letter from the cupboard (Letters.ts): no pay, no mark — its own line in the journal. */
  letter?: boolean;
}

interface KindInfo { title: string; base: number; fragile: boolean; urgent: boolean }
const KINDS: Record<OrderKind, KindInfo> = {
  pension: { title: 'Пенсия', base: 50000, fragile: false, urgent: true },
  letters: { title: 'Письма', base: 28000, fragile: false, urgent: false },
  papers: { title: 'Газеты и журналы', base: 25000, fragile: false, urgent: false },
  parcel: { title: 'Посылка — стекло', base: 50000, fragile: true, urgent: false },
  telegram: { title: 'Телеграмма', base: 40000, fragile: false, urgent: true },
  medicine: { title: 'Лекарства', base: 55000, fragile: true, urgent: true },
  parts: { title: 'Запчасти', base: 45000, fragile: false, urgent: false },
  invoices: { title: 'Накладные и бланки', base: 30000, fragile: false, urgent: false },
};

interface Dest {
  id: string;
  name: string;
  /** Who it is for, as the board names them. */
  who: string;
  /** «до Сосновки», «в Сосновку»: the name in the cases a sentence needs. */
  gen: string; acc: string;
  /** The day it first turns up on the board. */
  from: number;
  /** Rough driving time from the post office, seconds, at a careful pace. */
  eta: number;
  /** How far off the main road it is (pays a little more). */
  off: number;
  kinds: [OrderKind, string][];
}

const DESTS: Dest[] = [
  {
    id: 'sosnovka', gen: 'до Сосновки', acc: 'в Сосновку', name: 'Сосновка', who: 'Нина Петровна', from: 1, eta: 330, off: 0,
    kinds: [
      ['pension', 'Пенсию ждут к обеду — за свет платить.'],
      ['papers', 'Районная газета и журнал для хозяек, подписка на квартал.'],
      ['letters', 'Письмо от внучки из Рязани, конверт с цветочками.'],
      ['medicine', 'Капли от давления из районной аптеки. Не трясти, пузырьки.'],
    ],
  },
  {
    id: 'zarechye', gen: 'до Заречья', acc: 'в Заречье', name: 'Заречье', who: 'Валентина, сельпо', from: 1, eta: 600, off: 0,
    kinds: [
      ['parcel', 'Банки с огурцами от райпотребсоюза. Стекло!'],
      ['invoices', 'Накладные на сахар и спички, без них не примут товар.'],
      ['telegram', '«Встречай в субботу автобус двенадцать тчк Люба». Срочно.'],
      ['papers', 'Журналы с кроссвордами и выкройками для сельпо.'],
    ],
  },
  {
    id: 'khutor', gen: 'до хутора Берёзки', acc: 'на хутор Берёзки', name: 'Хутор Берёзки', who: 'Василий Степанович', from: 2, eta: 260, off: 380,
    kinds: [
      ['parts', 'Ремкомплект для мотоблока, заказан почтой.'],
      ['pension', 'Пенсия Степанычу — ждёт с утра у калитки.'],
      ['letters', 'Письмо от сына с Севера, толстое.'],
      ['parcel', 'Рассада в банках от сестры. Стекло, аккуратно.'],
    ],
  },
  {
    id: 'kolkhoz', gen: 'до колхозной фермы', acc: 'на колхозную ферму', name: 'Колхозная ферма', who: 'Галина Ивановна', from: 3, eta: 660, off: 360,
    kinds: [
      ['invoices', 'Ведомости и бланки для фермы.'],
      ['parts', 'Подшипники для доильного аппарата.'],
      ['medicine', 'Ветеринарные препараты, ампулы. Стекло!'],
      ['telegram', 'Из района: «Комиссия в пятницу тчк». Срочно.'],
    ],
  },
  {
    id: 'forestry', gen: 'до лесничества', acc: 'в лесничество', name: 'Лесничество', who: 'Фёдор, лесник', from: 4, eta: 520, off: 320,
    kinds: [
      ['papers', 'Газета лесхоза и журнал для охотников.'],
      ['letters', 'Письма из областного управления, официальные.'],
      ['parts', 'Цепь для бензопилы, новая.'],
    ],
  },
  {
    id: 'apiary', gen: 'до пасеки', acc: 'на пасеку', name: 'Пасека у реки', who: 'Рашит-агай, пасечник', from: 5, eta: 720, off: 380,
    kinds: [
      ['parcel', 'Пустые банки под мёд, целый ящик. Звенят.'],
      ['letters', 'Журнал для пасечников и письмо от кума.'],
      ['telegram', '«Приезжаем за мёдом в воскресенье тчк Петровы». Срочно.'],
    ],
  },
  {
    id: 'kainly', gen: 'до Кайынлы', acc: 'в Кайынлы', name: 'Кайынлы', who: 'Фарида-апа, медпункт', from: 2, eta: 480, off: 0,
    kinds: [
      ['medicine', 'Инсулин и шприцы для медпункта. В холодке, не трясти.'],
      ['pension', 'Пенсии на Кайынлы — Фарида-апа раздаст по дворам.'],
      ['papers', '«Кызыл таң» и районка на татарском, подписка сельсовета.'],
      ['letters', 'Письма из Казани и из армии — сыну Галиевых, с части.'],
      ['parcel', 'Банки с вареньем от дочки из Уфы. Стекло!'],
    ],
  },
  {
    id: 'camp', gen: 'до пионерлагеря', acc: 'в пионерлагерь', name: 'Пионерлагерь «Звёздочка»', who: 'Михалыч, сторож', from: 8, eta: 420, off: 250,
    kinds: [
      ['papers', '«Советский спорт» и «Сельская новь» — сторож выписывает с восьмидесятого.'],
      ['pension', 'Пенсия Михалычу. Сам в район не ездит — «на кого лагерь оставлю?»'],
      ['invoices', 'Бумаги из районо: акт о консервации лагеря, на подпись сторожу.'],
    ],
  },
];

/** Requests Timur can take on top of the waybill. */
export const CAPACITY = 2;
/** What Timur is saving for: the trip to Ufa and the entrance exams, summer 1998. */
export const GOAL = 3_000_000;
/** The driver-postman's salary per month, and the share paid as the advance on the 15th. */
export const OKLAD = 450_000;
const ADVANCE = 0.4;
/** Litres of fuel coupons the post gives for a working day, and how many he can hold. */
export const TALONS_DAY = 25, TALONS_MAX = 60;

export interface DayInfo {
  day: number;
  /** «Пятница, 19 сентября». */
  date: string;
  /** Weather preset name for Atmosphere, or null for the old route weather (clouding over, rain by the river). */
  weather: string | null;
  forecast: string;
  /** «Большое кольцо: Сосновка — Заречье». */
  route: string;
  /** The waybill: everything that must go out today. */
  orders: Order[];
  /** Requests on the side, to take or not. */
  requests: Order[];
  /** The season, and how much snow lies this morning (0…1). */
  season: Season;
  snow: number;
  /** A word from the postmistress for the season (New Year's week), or null. */
  note: string | null;
}

/**
 * The weekly timetable of the van: Monday, Wednesday, Friday the big ring; Tuesday the farms;
 * Thursday the lake road straight on from the fork to Kainly; Saturday a short one.
 */
const ROUTES: Record<number, { name: string; stops: string[] }> = {
  0: { name: 'Большое кольцо: Сосновка — Заречье', stops: ['sosnovka', 'zarechye', 'kolkhoz', 'apiary'] },
  1: { name: 'Хутора: Берёзки — лесничество', stops: ['khutor', 'forestry', 'kolkhoz'] },
  3: { name: 'Озёрный: Кайынлы — лагерь «Звёздочка»', stops: ['camp', 'kainly'] },
  5: { name: 'Короткий: Сосновка — Берёзки', stops: ['sosnovka', 'khutor'] },
};
const routeOf = (wd: number) => ROUTES[wd === 1 ? 1 : wd === 3 ? 3 : wd === 5 ? 5 : 0];

/** Neighbours' requests, by where they go: who asks, what, how much, whether it can break. */
const REQUESTS: Record<string, [string, string, number, boolean][]> = {
  sosnovka: [
    ['Валентина из сельпо', 'Мешок сахара Нине Петровне — та к варенью просила.', 15000, false],
    ['Сосед по подъезду', 'Банки с соленьями тёще в Сосновку. Осторожно, стекло.', 18000, true],
    ['Учительница из Ключевска', 'Стопку учебников для сосновской начальной школы.', 12000, false],
  ],
  zarechye: [
    ['Тракторист Колька', 'Канистру масла — оставь у сельпо, он заберёт.', 20000, false],
    ['Фельдшер райбольницы', 'Коробку бинтов и ваты в заречный медпункт.', 15000, false],
    ['Тётка с рынка', 'Ящик рассады в банках сестре в Заречье.', 16000, true],
  ],
  khutor: [
    ['Сестра Степаныча', 'Банки с вареньем брату на хутор. Стекло!', 15000, true],
    ['Механик из гаража', 'Ремень вариатора для Степанычева мотоблока.', 14000, false],
  ],
  kolkhoz: [
    ['Завхоз фермы', 'Ящик гвоздей и рулон рубероида на ферму.', 25000, false],
    ['Жена зоотехника', 'Сумку с обедом и термос — Галине Ивановне.', 8000, true],
  ],
  forestry: [
    ['Охотник Палыч', 'Сухари, чай и батарейки к рации — леснику.', 10000, false],
  ],
  apiary: [
    ['Кум Рашит-агая', 'Пустые фляги под кумыс — на пасеку.', 18000, false],
    ['Соседка Рашит-агая', 'Стеклянные банки под мёд, целый ящик.', 16000, true],
  ],
  kainly: [
    ['Мулла из райцентра', 'Стопку календарей и книжек для мечети в Кайынлы.', 15000, false],
    ['Апа с рынка', 'Корзину яиц сестре в Кайынлы — к свадьбе печь будут.', 14000, true],
    ['Тракторист Ильдар', 'Сальники и ремень — брату на Кайынлы, у него «Беларусь» встал.', 18000, false],
  ],
  camp: [
    ['Бывшая пионервожатая', 'Коробку старых фотографий — Михалычу, «пусть в лагере будут».', 12000, false],
  ],
};

const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Day 1 is Wednesday, 17 September 1997; Sundays the post office is shut and the calendar skips them. */
/** The calendar of the service: «Пятница, 19 сентября» and the postmark's «19·09·97». */
export function calendar(day: number): { text: string; short: string } {
  const d = new Date(Date.UTC(1997, 8, 17));
  let n = day - 1;
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0) n--; }
  const pad = (x: number) => String(x).padStart(2, '0');
  return { text: dateOf(day).text, short: `${pad(d.getUTCDate())}·${pad(d.getUTCMonth() + 1)}·97` };
}

/** The working day's date: month (0 = January), day of the month, weekday (0 = Monday). */
export function dateParts(day: number): { y: number; m: number; d: number; wd: number } { const x = dateOf(day); return { y: x.y, m: x.m, d: x.d, wd: x.wd }; }

function dateOf(day: number): { text: string; wd: number; y: number; m: number; d: number } {
  const d = new Date(Date.UTC(1997, 8, 17));
  let n = day - 1;
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0) n--; }
  const wd = (d.getUTCDay() + 6) % 7;
  return { text: `${WEEKDAYS[wd]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, wd, y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

const WEATHER: [string | null, string, number][] = [
  ['Золотое утро', 'По радио: ясно, без осадков, тихо. Дороги подсохли.', 2],
  ['Ясно', 'По радио: солнечно, ветер слабый. Самое время ехать.', 3],
  ['Пасмурно', 'По радио: облачно, без существенных осадков.', 3],
  ['Дождь', 'По радио: дождь весь день. В низине у реки развезёт.', 2],
  [null, 'По радио: с утра ясно, к обеду тучи, у реки — ливень.', 2],
];

/** The first snow, the winter and the thaw have their own weather (Atmosphere's WINTER keys). */
const SEASON_WEATHER: Partial<Record<Season, [string | null, string, number][]>> = {
  'first-snow': [
    ['Снегопад', 'По радио: первый снег! На асфальте гололедица, на грунтовках — каша.', 3],
    ['Морозно, ясно', 'По радио: минус десять, ясно. Первый мороз — лужи встали.', 2],
    ['Пасмурно', 'По радио: облачно, около нуля, без осадков.', 2],
    ['Оттепель', 'По радио: оттепель, мокрый снег с дождём. Дороги развезёт.', 2],
  ],
  winter: [
    ['Морозно, ясно', 'По радио: мороз минус восемнадцать, ясно. Дороги укатаны — на поворотах скользко.', 3],
    ['Снегопад', 'По радио: снег весь день, видимость плохая. На лесной дороге — перемёты.', 3],
    ['Метель', 'По радио: метель, ветер северный. Без нужды из дома не выходить. Почте — нужда.', 1],
    ['Пасмурно', 'По радио: облачно, минус пять, без осадков. Река встала.', 2],
  ],
  thaw: [
    ['Оттепель', 'По радио: оттепель, капель. На грунтовках каша, в низине — не проехать без моста.', 3],
    ['Пасмурно', 'По радио: облачно, плюс два. Снег оседает.', 2],
    ['Ясно', 'По радио: солнечно, снег тает на глазах. Грачи прилетели.', 2],
    ['Снегопад', 'По радио: вернулась зима — снег, ночью до минус десяти.', 1],
  ],
};

/** The morning at the post office: today's waybill by the timetable, and the requests. Same day, same morning. */
export function boardFor(day: number, _trust = 0): DayInfo {
  const r = mulberry32(day * 7919 + 97);
  const date = dateOf(day);
  const season = seasonOf(date.m, date.d);
  const skies = SEASON_WEATHER[season] ?? WEATHER;
  const total = skies.reduce((a, w) => a + w[2], 0);
  let pick = r() * total, wi = 0;
  while (pick > skies[wi][2]) { pick -= skies[wi][2]; wi++; }
  // the first day: a sunny morning for the lesson and the first stretch, clouding over later, rain by the river
  const [weather, forecast] = day === 1 ? [SUNNY_START, WEATHER[4][1]] : skies[wi];
  const route = routeOf(date.wd);
  const stops = route.stops.map((id) => DESTS.find((d) => d.id === id)!).filter((d) => d.from <= day);
  // pensions go out at the start of the month and after the middle
  const pensionDays = (date.d >= 1 && date.d <= 8) || (date.d >= 16 && date.d <= 23);
  const orders: Order[] = [];
  const add = (d: Dest, k: [OrderKind, string], extra: Partial<Order> = {}) => {
    const info = KINDS[k[0]];
    const due = info.urgent ? Math.round((d.eta * 1.45 + 120) / 30) * 30 : null;
    orders.push({ id: `${day}-${orders.length}`, dest: d.id, kind: k[0], title: info.title, note: k[1], pay: 0, fragile: info.fragile, due, ...extra });
  };
  for (const d of stops) {
    // the first day is the original run: a pension to Sosnovka and jars to Zarechye
    if (day === 1) { add(d, d.kinds[0]); continue; }
    const kinds = d.kinds.filter(([k]) => k !== 'pension' || pensionDays);
    const n = 1 + (r() < 0.5 ? 1 : 0);
    const used = new Set<OrderKind>();
    for (let i = 0; i < n && used.size < kinds.length; i++) {
      let k = kinds[Math.floor(r() * kinds.length)];
      for (let g = 0; used.has(k[0]) && g < 8; g++) k = kinds[Math.floor(r() * kinds.length)];
      if (used.has(k[0])) continue;
      used.add(k[0]);
      add(d, k);
    }
  }
  // two or three requests for places on today's route
  const pool = stops.flatMap((d) => (REQUESTS[d.id] ?? []).map((q) => [d, q] as const));
  const requests: Order[] = [];
  const nReq = day === 1 ? 1 : 2 + (r() < 0.4 ? 1 : 0);
  while (requests.length < nReq && pool.length) {
    const [d, [from, note, pay, fragile]] = pool.splice(Math.floor(r() * pool.length), 1)[0];
    requests.push({ id: `${day}-r${requests.length}`, dest: d.id, kind: 'parcel', title: 'Просьба', note, pay, fragile, due: null, from });
  }
  // New Year's week: cards and parcels for everyone on the route
  let note: string | null = null;
  if (date.m === 11 && date.d >= 22) {
    note = 'Зинаида Павловна: «Новогодняя неделя — открытки и посылки мешками. Без опозданий — будет премия к празднику».';
    for (const st of stops) orders.push({ id: `${day}-ny-${st.id}`, dest: st.id, kind: 'letters', title: 'Новогодние открытки', note: 'Полный мешок: «С Новым 1998 годом!», «Здоровья и счастья», «Ждём в гости».', pay: 0, fragile: false, due: null });
  }
  return { day, date: date.text, weather, forecast, route: route.name, orders, requests, season, snow: snowOf(date.m, date.d), note };
}

export const destName = (id: string): string => DESTS.find((d) => d.id === id)?.name ?? id;
/** «до Сосновки» / «в Сосновку». */
export const destTo = (id: string, motion: 'gen' | 'acc'): string => { const d = DESTS.find((x) => x.id === id); return d ? d[motion] : id; };
export const destWho = (id: string): string => DESTS.find((d) => d.id === id)?.who ?? '';
/** A place on today's route that has never been on it before. */
export function newPlaceToday(day: number): string | null {
  if (day <= 1) return null;
  const on = (dd: number) => routeOf(dateOf(dd).wd).stops.filter((id) => (DESTS.find((x) => x.id === id)?.from ?? 99) <= dd);
  const before = new Set<string>();
  for (let dd = 1; dd < day; dd++) on(dd).forEach((id) => before.add(id));
  const fresh = on(day).find((id) => !before.has(id));
  return fresh ? destName(fresh) : null;
}

/** How one order went. */
export interface Delivery { order: Order; late: number; cargo: number }

export interface Reckoning {
  /** What happened, for the day's journal: official mail, no money attached. */
  journal: [string, string][];
  /** Cash in or out of Timur's pocket today. */
  lines: [string, number, string?][];
  total: number;
  /** Change to this month's bonus, percentage points. */
  premium: number;
  trustBefore: number;
  trustAfter: number;
  /** What the postmistress says. */
  word: string;
}

/** The evening: the journal of the official mail, the bonus it earns, the day's cash, trust up or down. */
export function reckon(done: Delivery[], fines: number, arrests: number, damage: number, trust: number, extras: [string, number, number][] = []): Reckoning {
  const journal: [string, string][] = [];
  const lines: [string, number, string?][] = [];
  let dTrust = 0, premium = 0, clean = true;
  for (const d of done) {
    // an old letter from the cupboard is written up by itself (Letters.ts)
    if (d.order.letter) continue;
    const notes: string[] = [];
    let ok = true;
    if (d.late > 0) { notes.push(`опоздание ${Math.ceil(d.late / 60)} мин`); dTrust -= 1; ok = false; }
    else if (d.order.due !== null) dTrust += 2;
    else dTrust += 1;
    if (d.order.fragile && d.cargo < 90) { notes.push(`побито ${Math.round(100 - d.cargo)} %`); ok = false; if (d.cargo < 60) dTrust -= 2; }
    if (!ok) clean = false;
    if (d.order.from) {
      // a request: paid in cash, less what broke
      const pay = d.order.fragile && d.cargo < 90 ? d.order.pay * Math.max(0.3, d.cargo / 100) : d.order.pay;
      lines.push([`${d.order.from} · ${destName(d.order.dest).toLowerCase()}`, Math.round(pay / 1000) * 1000, notes.join(', ') || undefined]);
    } else {
      journal.push([`${destName(d.order.dest)} · ${d.order.title.toLowerCase()}`, notes.join(', ') || (d.order.due !== null ? 'в срок' : 'вручено')]);
      premium += ok ? 0.3 : -1;
    }
  }
  // things that pay go to the cash; the rest (an old letter home) to the journal
  for (const [label, money, t] of extras) {
    if (money) lines.push([label, money]); else journal.push([label, t > 0 ? `доверие +${t}` : 'записано']);
    dTrust += t;
  }
  if (clean && damage < 0.1 && journal.length) premium += 0.4;
  if (fines) lines.push(['Штрафы ГАИ — из своих', -fines]);
  if (arrests) { journal.push(['Задержание ГАИ', 'объяснительная, минус к премии']); premium -= 5; dTrust -= 2; }
  const total = lines.reduce((a, [, v]) => a + v, 0);
  const after = Math.max(0, Math.min(100, trust + dTrust));
  const word = dTrust >= 4 ? '«Люди звонили, хвалили. Так держать.»'
    : dTrust >= 1 ? '«Нормально съездил. Завтра — новый путевой лист.»'
    : dTrust === 0 ? '«Без происшествий — и то хорошо.»'
    : '«Жалобы были. Ничего, бывает — завтра исправишься.»';
  return { journal, lines, total, premium, trustBefore: trust, trustAfter: after, word };
}

/** The salary book in the profile. */
export interface PayBook {
  /** Bonus earned this month, percent of the salary (paid with the month's main pay, 0…30). */
  premium: number;
  /** Paydays already paid («1997-8-A» is September's advance, «…-B» its main pay). */
  paid: string[];
  /** Paydays that are late: the service day they will finally come on. */
  at: Record<string, number>;
}
/** «10,4» */
export const pct = (x: number): string => x.toFixed(x % 1 ? 1 : 0).replace('.', ',');
export const newPayBook = (): PayBook => ({ premium: 0, paid: [], at: {} });

/**
 * Paydays falling due by the evening of `day`: the advance from the 15th, the main pay from the 28th
 * (or as soon as the month is over). Each may be late a few days — decided once, the same every time.
 * Returns the cash lines and the notes for the journal; the book is updated.
 */
export function paydays(book: PayBook, day: number): { lines: [string, number, string?][]; notes: [string, string][] } {
  const lines: [string, number, string?][] = [], notes: [string, string][] = [];
  const { y, m, d } = dateOf(day);
  const keys: [string, number, number, boolean][] = [];
  const prevM = m === 0 ? 11 : m - 1, prevY = m === 0 ? y - 1 : y;
  // last month's main pay is due as soon as the new month starts; this month's from the 28th
  if (!(prevY === 1997 && prevM < 8)) keys.push([`${prevY}-${prevM}-B`, prevY, prevM, true]);
  // he starts on the 17th of September: no advance for that month
  if (d >= 15 && !(y === 1997 && m === 8)) keys.push([`${y}-${m}-A`, y, m, false]);
  if (d >= 28) keys.push([`${y}-${m}-B`, y, m, true]);
  for (const [key, , mm, main] of keys) {
    if (book.paid.includes(key)) continue;
    if (book.at[key] === undefined) {
      const rr = mulberry32(key.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
      book.at[key] = day + (rr() < 0.6 ? 0 : 1 + Math.floor(rr() * 4));
    }
    const what = `${main ? 'Получка' : 'Аванс'} за ${MONTH_NOM[mm]}`;
    if (day < book.at[key]) {
      const n = book.at[key] - day;
      notes.push([what, `задерживают: «денег в кассе нет, ${n === 1 ? 'будет завтра' : `будет через ${n} ${n < 5 ? 'дня' : 'дней'}`}»`]);
      continue;
    }
    book.paid.push(key);
    if (main) {
      const prem = Math.max(0, Math.min(30, book.premium));
      // September 1997 is half a month, from the 17th
      const part = key === '1997-8-B' ? 0.47 : 1 - ADVANCE;
      lines.push([what, Math.round((OKLAD * part + (OKLAD * prem) / 100) / 1000) * 1000, `${key === '1997-8-B' ? 'с 17-го, ' : ''}${prem > 0 ? `премия ${pct(prem)} %` : 'без премии'}`]);
      book.premium = 0;
    } else lines.push([what, Math.round((OKLAD * ADVANCE) / 1000) * 1000]);
  }
  return { lines, notes };
}
