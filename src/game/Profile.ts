import { newPayBook, type PayBook } from './Career';
import { OLD_TO_1997 } from './Money';
import type { MuhaState } from './MuhaStory';
import type { RoadStopState } from './RoadStop';
import type { LettersState } from './Letters';
import type { GaiMemory } from '../world/Police';
import type { CasesSaved } from './Cases';
/** What carries over from run to run, kept in the browser. */
export interface Profile {
  /** Roubles in the depot's till. */
  money: number;
  runs: number;
  /** The van's crash damage, 0…1: it is not mended unless you pay. */
  damage: number;
  /** What is left in the tank, 0…1. */
  fuel: number;
  /** The working day the postman is on (1, 2, …; endless). */
  day: number;
  /** How much the district trusts its postman, 0…100. */
  trust: number;
  /** Litres of the post's fuel coupons in hand. */
  talons: number;
  /** The salary book: this month's bonus and the paydays. */
  pay: PayBook;
  /** Which roubles `money` is in: 1997 (old saves held denominated ones). */
  rub?: number;
  /** How far Muha's story has got (absent: not met yet). */
  muha?: MuhaState;
  /** The van's broken parts, on top of `damage`: the steering linkage (and which way it pulls), the radiator. */
  wear?: Wear;
  /** Evenings spent in the garage with the grandfather (his stories come in turn). */
  garage?: number;
  /** The prologue has been played: Timur is home and has the keys. */
  prologue?: boolean;
  /** What came of the season's «случаи» (Cases.ts): done, refused or missed. */
  cases?: CasesSaved;
  /** «Тормозят на дороге»: once in the service, and how it went. */
  roadStop?: RoadStopState;
  /** The old letters from the cupboard: which have gone home, which is on its way. */
  letters?: LettersState;
  /** The summer's exams in Ufa: gone and passed, or «на следующий год»; and the July they come next. */
  exams?: 'passed' | 'next';
  examYear?: number;
  /** What Sergeant Kuzmin remembers of the post van: meetings, envelopes, warnings. */
  gai?: GaiMemory;
}

export interface Wear { steer: number; rad: number; pull: -1 | 1 }

const KEY = 'uaz-zarechye-profile';
export const freshProfile = (): Profile => ({ money: 0, runs: 0, damage: 0, fuel: 0.8, day: 1, trust: 20, talons: 25, pay: newPayBook(), rub: 1997, wear: { steer: 0, rad: 0, pull: 1 }, garage: 0, prologue: false });

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && typeof p.money === 'number') return { rub: 1997, money: Math.max(0, p.rub === 1997 ? p.money : Math.round((p.money * OLD_TO_1997) / 1000) * 1000), runs: p.runs ?? 0, damage: Math.min(1, Math.max(0, p.damage ?? 0)), fuel: Math.min(1, Math.max(0, p.fuel ?? 0.8)), day: Math.max(1, Math.floor(p.day ?? (p.runs ?? 0) + 1)), trust: Math.min(100, Math.max(0, p.trust ?? 20)), talons: Math.max(0, p.talons ?? 25), pay: p.pay && Array.isArray(p.pay.paid) ? p.pay : newPayBook(), muha: p.muha && typeof p.muha.step === 'string' ? p.muha : undefined,
      // saves from before the parts were told apart: the old one-number damage split between them
      wear: p.wear && typeof p.wear.steer === 'number' ? p.wear : { steer: Math.min(1, (p.damage ?? 0) * 0.6), rad: Math.min(1, (p.damage ?? 0) * 0.4), pull: 1 },
      garage: p.garage ?? 0,
      // a save from before the prologue existed has never seen it: it plays once, on «Продолжить»
      prologue: p.prologue ?? false,
      roadStop: p.roadStop && typeof p.roadStop.done === 'boolean' ? p.roadStop : undefined,
      letters: p.letters && Array.isArray(p.letters.done) ? p.letters : undefined,
      cases: p.cases && typeof p.cases === 'object' && !Array.isArray(p.cases) ? p.cases : undefined,
      exams: p.exams, examYear: p.examYear,
      gai: p.gai && ['met', 'bribes', 'refused', 'warned'].every((k) => typeof p.gai[k] === 'number') ? p.gai : undefined };
  } catch { /* private mode or bad data */ }
  return freshProfile();
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

/** How the van gets mended: in his grandfather's garage at home (parts only — Timur alone while the grandfather is in hospital in Ufa, then with him on the stool by the pit), or at Kolka's workshop (parts and labour). */
export type RepairKind = 'grandpa' | 'kolka';
/** Parts for a full repair, 1997 roubles: the body and engine, the steering linkage, the radiator. */
const FULL_REPAIR = 300000, STEER_PARTS = 70000, RAD_PARTS = 50000;
/** Kolka's workshop charges for the work on top of the parts. */
const KOLKA_LABOUR = 0.6;

/** What needs mending at all, as roubles of parts. */
const partsFor = (p: Profile): number => p.damage * FULL_REPAIR + (p.wear?.steer ?? 0) * STEER_PARTS + (p.wear?.rad ?? 0) * RAD_PARTS;
export const repairCost = (p: Profile, kind: RepairKind = 'grandpa'): number => Math.round((partsFor(p) * (kind === 'kolka' ? 1 + KOLKA_LABOUR : 1)) / 1000) * 1000;
/** Anything worth mending. */
export const needsRepair = (p: Profile): boolean => repairCost(p) >= 1000;

/** Pay for a repair as far as the till allows; returns the share of the work done, 0…1. */
export function repair(p: Profile, kind: RepairKind): number {
  if (!needsRepair(p)) return 0;
  const full = repairCost(p, kind);
  const share = Math.min(1, p.money / full);
  p.money = Math.max(0, p.money - Math.round(full * share));
  const keep = 1 - share;
  p.damage = keep < 0.01 ? 0 : p.damage * keep;
  if (p.wear) { p.wear.steer = keep < 0.01 ? 0 : p.wear.steer * keep; p.wear.rad = keep < 0.01 ? 0 : p.wear.rad * keep; }
  if (kind === 'grandpa') p.garage = (p.garage ?? 0) + 1;
  return share;
}

/**
 * The grandfather's word on the evenings Timur mends the van in his garage alone: a long-distance
 * call from the hospital in Ufa, one evening at a time — the work, the old days on this route, and
 * now and then a hint at what he never told (docs/design.md, «Тайна картатая»).
 */
/** In the garage of an evening, from the stool by the pit (the grandfather home from hospital). */
const GRANDPA: string[] = [
  'Тягу на сколько затягивал? На четырнадцать?.. Ключ на тринадцать, улым! Армия армией, а ключи учить надо.',
  'В семьдесят девятом у меня на этой самой буханке тяга лопнула под Сосновкой. Шёл пешком, мешок на плече. Баба Шура тогда ещё молодая была, накормила. Привет ей передай.',
  'Радиатор паял? Олово, канифоль да терпение. Терпения у тебя, улым, пока на одну пайку. Ничего, у меня тоже на одну было.',
  'Зинаида на почту девчонкой пришла, собак боялась. А теперь собаки её боятся. И начальство тоже. Ты её слушай.',
  'Знаешь, почему в Заречье почту ждут? Я ни разу не опоздал. Ну, один раз. Мост тогда смыло — так я вброд.',
  'Есть одно письмо… Ладно. Не сегодня. Гайки на колёсах проверь.',
  'Машину не жалеешь — себя не жалеешь. Ты ей ласково: «Ну, давай, родная». Она и пойдёт. Вот как өләсәй со мной.',
  'Өләсәй твоя за меня вышла, потому что я ей письма сам носил. От себя же. Ты ей помогай — она за нас двоих тянет.',
  'Муха этот твой… Мальчишкой у меня в гараже велосипеды чинил. Руки золотые были. Куда он их теперь дел?',
  'В шкафу у Зинаиды пачка писем лежит, «до востребования», с девяносто первого. Никто не востребовал. Ты загляни как-нибудь.',
  'Я в твои годы тоже в город хотел. Не поехал — дед заболел. Вот и я заболел. А ты всё равно поедешь. Я сказал.',
  'Развал на глаз выставил? Завтра проедешь — скажешь, как. Тянет — значит, глаз ещё не набил. Ничего, набьёшь.',
  'Митяй опять свой мотоцикл заводил — слышал? Полвека заводит. Вот это, улым, характер.',
];
/** The first weeks, while he is in hospital in Ufa: on the trunk line to the post office. */
const GRANDPA_PHONE: string[] = [
  'Тягу на сколько затягивал? На четырнадцать?.. Ключ на тринадцать, улым! Армия армией, а ключи учить надо.',
  'Радиатор паял? Олово, канифоль да терпение. Тут врачи тоже всё про терпение.',
  'Есть одно письмо… Ладно. Не по телефону. Приеду — расскажу. Гайки на колёсах проверь.',
];
export const grandpaLine = (p: Profile, home = true): string => {
  const l = home ? GRANDPA : GRANDPA_PHONE;
  return l[((p.garage ?? 1) - 1) % l.length];
};
