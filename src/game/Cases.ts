import * as THREE from 'three';
import type { Ground, Road } from '../world/Ground';
import { makeMan, makePerson, type Person } from '../world/People';
import type { Stop, World } from '../world/World';
import type { Vehicle } from '../vehicle/Vehicle';
import type { Order } from './Career';
import type { Mission } from './Mission';

/**
 * «Случаи» (docs/design.md, «Случаи»): small stories of the district on their own days of the
 * season — the neighbours, the beekeeper, a wedding on the road. Most are about Дед Митяй, the
 * neighbour across the street in Urmanly (and баба Нюра, his wife), with whom something is always
 * happening. Told like the rest: a card with a question, a word in the cab, a fade to black.
 *
 * On the road: somebody waiting by the verge for a lift (`ride`), a machine to tow (`tow`), the road
 * across with a crowd and a ribbon (`block`); at an addressee's, after the delivery, a favour (`favor`)
 * or a ride with him (the beekeeper and his hives). At home, before the drive: `MORNING_CASES`, played
 * by the game's morning (main.ts). What came of each is kept in the profile, fixed in the evening.
 */

export { GRANDPA_HOME } from './Career';

export type CaseMark = 'done' | 'refused' | 'missed';
export type CasesSaved = Record<string, CaseMark>;

export interface CaseHooks {
  choice(speaker: string, line: string, options: string[], pick: (i: number) => void): void;
  closeChoice(): void;
  choiceOpen(): boolean;
  say(speaker: string, line: string): void;
  hint(id: string, text: string, keys?: string): void;
  toast(text: string): void;
  blackout(title: string, text: string, seconds: number, mid: () => void, done: () => void, stamp: string): void;
  /** Bees loose in the cab, 0…1. */
  bees(level: number): void;
  bleat(): void;
  /** Someone else already rides in the cab's one passenger seat (another story's rider). */
  seatTaken?(): boolean;
}

interface Ctx { world: World; ground: Ground; mission: Mission; saved: CasesSaved }
interface Where { road: Road; s: number; lat?: number }

const MITYAI = 'Дед Митяй';
const mityai = () => makeMan('#5a5a48', '#2e2c28', '#c8c4bc');
const stopOf = (c: Ctx, id: string): Stop | undefined => c.world.stops.find((s) => s.id === id);
/** On today's route at all. */
const onRoute = (c: Ctx, id: string) => c.mission.stops.some((s) => s.id === id);

interface Base {
  id: string;
  day: number;
  who: string;
  label: string;
  money: number;
  trust: number;
}
interface Ride extends Base {
  kind: 'ride';
  make: () => Person;
  /** Where they wait by the road; or `from`, the addressee himself, once his post is in his hands. */
  where?: (c: Ctx) => Where | null;
  from?: string;
  to: (c: Ctx) => Stop | undefined;
  ask: (c: Ctx) => string;
  yes: string; no: string;
  refused: string;
  chatter: string[];
  /** Said on a hard jolt, now and then. */
  bump?: string[];
  thanks: string;
  /** What rides in the back with them. */
  cargo?: 'bees' | 'ram';
}
interface Tow extends Base {
  kind: 'tow';
  make: () => Person;
  where: (c: Ctx) => Where | null;
  ask: string; yes: string; no: string; refused: string;
  title: string; tow: string; minutes: number; thanks: string;
}
interface Block extends Base {
  kind: 'block';
  where: (c: Ctx) => Where | null;
  ask: string;
  options: string[];
  answers: string[];
  pay: number[];
  minutes: number;
  /** Driven through without stopping. */
  through: string;
  warn: string;
}
interface Favor extends Base {
  kind: 'favor';
  from: string;
  ask: string; yes: string; no: string; refused: string; accepted: string;
  order: (c: Ctx) => Order | null;
}
type Case = Ride | Tow | Block | Favor;

const CASES: Case[] = [
  // ---- 8 May: the neighbour, to Sosnovka with a box of tomato seedlings
  {
    kind: 'ride', id: 'mityai-seedlings', day: 2, who: MITYAI, make: mityai, label: 'Попутчик · дед Митяй с рассадой до Сосновки', money: 10000, trust: 2,
    where: (c) => onRoute(c, 'sosnovka') ? { road: c.ground.main, s: c.ground.marks.town + 140 } : null,
    to: (c) => stopOf(c, 'sosnovka'),
    ask: () => 'Тимурка! Сосед! Узнал? Я ж тебя вот такого на мотоцикле катал. С дембелем! Подбрось до Сосновки — у меня рассада, ящик помидоров. Дочке, Нюра велела. Пешком не донесу — помну.',
    yes: 'Садись, дед Митяй', no: 'Не сегодня, дед',
    refused: 'Эх… Ну, иди-иди, почта. Рассада — она терпеливая. А я — нет. На велосипеде повезу, одной рукой.',
    chatter: [
      'Урал-то как? Звонил? Он крепкий, вернётся. Мы с ним в шестьдесят третьем на одном колхозном грузовике картошку возили. Он рулил, я спал.',
      'Я тут письмо в «Поле чудес» написал. Якубовичу. Про то, как мы с Нюрой поженились. Ответят — тебе первому скажу. Посылку-то ты привезёшь.',
      'Щуку вот такую на Кайынкуле видел. Не поймал. Но видел.',
      'Нюра ругается — мотоцикл мой третий год под брезентом. С коляской, зверь. А я его не брошу. Он меня не бросил — и я его.',
    ],
    thanks: 'Приехали! Спасибо, сосед. Помидоры будут — первый тебе. И на бензин, не спорь. Это не я, это Нюра велела.',
  },
  // ---- 14 May: by the lake, his motorcycle (out from under the tarpaulin for the spring) has died
  {
    kind: 'tow', id: 'mityai-moto', day: 4, who: MITYAI, make: mityai, label: 'Выручил · дёрнул мотоцикл деда Митяя', money: 0, trust: 2,
    where: (c) => onRoute(c, 'kainly') || onRoute(c, 'camp') ? { road: c.ground.stub, s: c.ground.branch.lake - 30 } : null,
    ask: 'Тимурка! Стой! Мотоцикл встал, зараза. Свечу продул, бензин есть — не хочет. Дёрни на тросе, а? Трос у меня свой, с шестьдесят девятого года.',
    yes: 'Цепляй, дед', no: 'Некогда, дед, график',
    refused: 'График… У Урала тоже график был. Ладно. Я тут посижу. С щукой.',
    title: 'На тросе', tow: 'Трос — на фаркоп, Митяй — в седло, буханка — вперёд. Рывок… ещё рывок… мотоцикл чихнул, выстрелил на всё озеро — и затарахтел. Утки снялись с воды.',
    minutes: 3,
    thanks: 'Завёлся! Спасибо, сосед! А щука-то — вот она, гляди! Вот такая. Я ж говорил. Нюре скажешь — сам поймал, без мотоцикла.',
  },
  // ---- 18 May: the beekeeper's hives to the sainfoin by the farm (it flowers in late May), and the bees get out
  {
    kind: 'ride', id: 'bees', day: 5, who: 'Рашит-агай', make: () => makeMan('#6a6a48', '#3a3a30', '#c8c4bc'), label: 'Ульи Рашит-агая на эспарцет', money: 30000, trust: 3,
    from: 'apiary', cargo: 'bees',
    to: (c) => stopOf(c, 'kolkhoz'),
    ask: () => 'Тимур, улым, выручай. У фермы эспарцет зацветает — розовое поле, сам увидишь, а мои пчёлки тут сидят. Два улья в кузов — и к ферме. Я с тобой поеду, они меня знают. Только по ямам — тихонечко, ладно?',
    yes: 'Грузим, Рашит-агай', no: 'Боюсь я пчёл, агай',
    refused: 'Боишься… А мёд любишь. Ладно, на телеге отвезу. Пчёлки потерпят. Лошадь — нет.',
    chatter: [
      'Слышишь, гудят? Это они разговаривают. Довольны. Эспарцет — это для них как для тебя зарплата. Мёд с него светлый, как слеза.',
      'Пчела — она умная. Злого человека жалит, доброго — тоже, но потом извиняется. Шучу.',
      'Картатаю мёда передай, как вернётся, — прошлогоднего, гречишного. Ему для сердца хорошо. Врачи не знают — а я знаю.',
    ],
    bump: [
      'Ай-яй! Тише! Крышка у улья подпрыгнула — вылетели!',
      'Ямы, улым, ямы! Они от тряски злые!',
      'Не маши руками! Не маши — они этого не любят!',
    ],
    thanks: 'Приехали! Ставь, ставь, аккуратно… Ну, живы? Подуй на ухо — пройдёт. Пчелиный яд, улым, от радикулита. Вот мёд — тебе и картатаю. В Уфу поедешь — бери банку, студенты мёд любят.',
  },
  // ---- 26 May: the forester's birch saplings for the alley the chairman wants at the farm
  {
    kind: 'favor', id: 'saplings', day: 7, who: 'Фёдор Иванович, лесник', from: 'forestry', label: 'Саженцы берёз на ферму', money: 15000, trust: 3,
    ask: 'Тимур, выручай. Председатель к юбилею колхоза аллею задумал — у правления, на ферме. Я берёзок накопал, двадцать штук, в мешковине. Отвезёшь? Корни — к кабине, макушки — к дверям. И не тряси: им ещё расти.',
    yes: 'Грузите, Фёдор Иванович', no: 'Не влезут, наверное',
    refused: 'Не влезут… В буханку всё влезает. Ладно, на телеге Палыч довезёт. К осени.',
    accepted: 'Вот и ладно. Двери не захлопывай — макушки прищемишь. Скажи председателю — от лесника, пусть поливают.',
    order: (c) => {
      // the farm, even when the van has been there already today: then it goes back (addOrder reopens the stop)
      const dest = c.world.stops.find((s) => s.id === 'kolkhoz');
      return dest ? { id: 'case-saplings', dest: dest.id, kind: 'parcel', title: 'Саженцы берёз', note: 'двадцать штук, в мешковине, макушки торчат из кузова', pay: 15000, fragile: false, due: null, from: 'Лесник' } : null;
    },
  },
  // ---- 4 June: the camp opens a shift again, and Митяй is the only accordion player in the district
  {
    kind: 'ride', id: 'mityai-camp', day: 9, who: MITYAI, make: mityai, label: 'Попутчик · дед Митяй с баяном в лагерь', money: 0, trust: 3,
    where: (c) => onRoute(c, 'camp') ? { road: c.ground.main, s: c.ground.marks.town + 140 } : null,
    to: (c) => stopOf(c, 'camp'),
    ask: () => 'Тимурка! Стой! В «Звёздочке» смену открывают — первую с девяносто второго! Михалыч просил баяниста на линейку, а баянист в районе один — я. Баян тяжёлый, ноги старые. Подбросишь?',
    yes: 'Садись, маэстро', no: 'Дед, у меня график',
    refused: 'График… А у детей — линейка. Ладно, пешком. С баяном. Буду играть на ходу — веселее.',
    chatter: [
      '«Взвейтесь кострами, синие ночи…» Помнишь? Не помнишь. Вы уже другие песни пели. Ничего, дети вспомнят.',
      'Я в этом лагере в шестидесятом вожатым был. Одну смену. Потом попросили — за то, что учил пионеров на баяне «Мурку». Шучу. Почти.',
      'Михалыч говорит: детей тридцать человек, а повариха одна. Нюра обещала пирожков напечь. Сто штук. Я сказал — двести, я тоже приду.',
    ],
    thanks: 'Приехали! Михалыч, встречай оркестр!.. Спасибо, Тимурка. Приходи на закрытие смены — сыграю тебе «Прощание славянки». В Уфу провожать.',
  },
  // ---- 8 June: perfume for баба Нюра's birthday, in secret
  {
    kind: 'ride', id: 'mityai-perfume', day: 10, who: MITYAI, make: mityai, label: 'Попутчик · дед Митяй с секретом', money: 5000, trust: 2,
    where: (c) => onRoute(c, 'sosnovka') ? { road: c.ground.main, s: c.ground.marks.town + 140 } : null,
    to: (c) => stopOf(c, 'sosnovka'),
    ask: () => 'Тимурка, тс-с! У Нюры в среду день рождения. Я ей духи взял — «Красная Москва», в райцентре, по блату. Спрятать надо у дочки, в Сосновке. Дома найдёт — она всё находит.',
    yes: 'Садись, конспиратор', no: 'Не по пути сегодня',
    refused: 'Эх… Придётся в сарае прятать. В валенке. Летом она туда не лазит. Надеюсь.',
    chatter: [
      'Сорок шесть лет вместе. Один раз в Сочи ездили — по путёвке, в семьдесят девятом. Нюра до сих пор вспоминает. Я тоже — я там на солнце сгорел.',
      'Ты только Нюре не проболтайся. Она тебя пирогами разговорит — ты стой. Как партизан.',
      'Духи — это главное. И пионы — у Фариды в палисаднике попрошу. И чтоб посуду помыл. Но главное — духи.',
    ],
    thanks: 'Спасибо, сосед. Спрятал. Если Нюра спросит, где я был, — я был на собрании. Про международное положение.',
  },
  // ---- 11 June: a wedding in Kainly has the road across
  {
    kind: 'block', id: 'wedding', day: 11, who: 'Дружка жениха', label: 'Свадьба в Кайынлы · выкуп', money: 0, trust: 2,
    where: (c) => onRoute(c, 'kainly') ? { road: c.ground.stub, s: c.ground.branch.kaiStart - 70 } : null,
    warn: 'Впереди поперёк дороги — лента и народ с гармошкой. Свадьба. Остановись.',
    ask: 'Стой, почта! В Кайынлы свадьба — Ильдар Фариду-апину племянницу берёт. Дорога наша, лента наша. Выкуп давай! Или песню. Или — что везёшь, то и отдай!',
    options: ['Выкуп — десять тысяч', 'Посигналить молодым на счастье', 'Спеть «Ромашки спрятались»'],
    answers: [
      'Вот это почта! Держи пирог с черёмухой и проезжай. И приезжай вечером — гулять будем три дня!',
      'Би-би, би-би-и! Вот это я понимаю — по-нашему! Режь ленту! Почте — дорога, молодым — счастья!',
      '«…ромашки спрятались, поникли лютики…» Ну, голос — как у трактора. Но от души! Проезжай, артист. Вот пирог — на дорожку.',
    ],
    pay: [-10000, 0, 0],
    minutes: 2,
    through: 'Эй! Почта! Ленту порвал — молодым счастья не будет! …Ладно, будет. Но ты всё равно приходи — извинишься.',
  },
  // ---- 13 June: Sabantuy in Sosnovka, and Митяй has won a ram
  {
    kind: 'ride', id: 'mityai-ram', day: 12, who: MITYAI, make: mityai, label: 'Сабантуй · дед Митяй с бараном', money: 10000, trust: 3,
    where: (c) => onRoute(c, 'khutor') ? { road: c.ground.main, s: c.ground.marks.sosStop + 45 } : null,
    to: (c) => stopOf(c, 'khutor'),
    ask: () => 'Тимурка!!! Я барана выиграл! На столб залез — молодые не смогли, а я залез! Шестьдесят девять лет! Нюра не верит. Его бы к Степанычу в Берёзовку, пока я праздную. Довезёшь? Он смирный. Почти.',
    yes: 'Грузи барана, чемпион', no: 'Дед, баран в почте — это слишком',
    refused: 'Слишком… А барана выиграть в шестьдесят девять — не слишком? Ладно, на верёвке поведу. Он меня поведёт, вернее.',
    chatter: [
      'Ты видел, как я на столб? Как белка! Ну, как старая белка. Но — белка!',
      'Нюра сказала: «Зачем нам баран?» А я ей: «Нюра, это не баран. Это — победа».',
      'Урал, говорят, тоже на Сабантуе был, в шестьдесят седьмом. Курицу выиграл. Мы её потом три года звали Призом.',
    ],
    thanks: 'Приехали! Степаныч, принимай чемпиона! Это я про барана. И про себя тоже. Спасибо, Тимурка, — на золотую свадьбу позову. Через четыре года! Из Уфы приедешь.',
    cargo: 'ram',
  },
  // ---- 18 June: off the footbridge after a pike, wet to the waist
  {
    kind: 'ride', id: 'mityai-river', day: 14, who: MITYAI, make: mityai, label: 'Попутчик · мокрый дед Митяй до Кайынлы', money: 0, trust: 3,
    where: (c) => onRoute(c, 'kainly') ? { road: c.ground.stub, s: c.ground.branch.lake + 20 } : null,
    to: (c) => stopOf(c, 'kainly'),
    ask: () => 'Тимурка… Я… это… с мостков сорвался. Щука дёрнула — я за ней. По пояс. Вода — как в проруби, а июнь называется. До Кайынлы, к Фариде в медпункт, а? Нюре — ни слова.',
    yes: 'Садись, печку включу', no: 'Дед, мне в другую сторону',
    refused: 'В другую… Ну, ладно. Я бегом. Бег — он греет. Говорят.',
    chatter: [
      'Печку-то на всю! Вот… вот так… Зуб на зуб, а июнь на дворе. Ничего, обсохну.',
      'Щука там, Тимурка. Вот такая. Я к ней — а мостки ко мне. Ну, неудачно познакомились.',
      'Ты Нюре скажи, что я в правлении задержался. По делам. По мокрым делам.',
    ],
    thanks: 'Фарида! Принимай утопленника!.. Спасибо, сосед. Если б не ты — сох бы я там до вечера, памятником рыбаку.',
  },
  // ---- 22 June: after a night's downpour the milk lorry is axle-deep in the lowland's clay
  {
    kind: 'tow', id: 'kolka-milk', day: 15, who: 'Колька, тракторист МТС', make: () => makeMan('#3a4a5a', '#2e2c28', '#888070'), label: 'Выручил · дёрнул молоковоз из грязи', money: 20000, trust: 3,
    where: (c) => onRoute(c, 'zarechye') ? { road: c.ground.main, s: c.ground.marks.sosEnd + 90 } : null,
    ask: 'Тимур! Стой! Молоковоз сел по самые мосты — ночью ливень был, в низине каша, будь она неладна! Фляги полные, с утренней дойки. Дёрнешь буханкой? Трос есть!',
    yes: 'Цепляй трос, Колька', no: 'Не могу, график горит',
    refused: 'График… Ну ладно, пойду на ферму за гусеничным. Только молоко скиснет на жаре…',
    title: 'Трос и июньская грязь', tow: 'Трос звенит, понижайка ревёт на всю низину. Буханка гребёт всеми четырьмя колёсами, комья мокрой глины летят в ветровое стекло… Рывок — и молоковоз со стоном вылезает из колеи на сухой бугор.',
    minutes: 4,
    thanks: 'Вытащил! Ай да буханка, ай да дедова школа! Держи двадцатку на бензин, и флягу свежего молока возьми — өләсәй поклон!',
  },
];

type State = 'wait' | 'asked' | 'riding' | 'done';
interface Live {
  c: Case;
  state: State;
  person: Person | null;
  crowd: Person[];
  ribbon: THREE.Mesh | null;
  pos: THREE.Vector3;
  /** Across the road where they wait (for stepping aside). */
  side: THREE.Vector3;
  still: number;
  cool: number;
  told: boolean;
  /** Has said the seat is taken. */
  full?: boolean;
}

const SAY: [number, number] = [26, 40];
/** The addressee's own figure (not spawned for the case, not removed after). */
const atStop = (c: Case) => c.kind === 'favor' || (c.kind === 'ride' && !!c.from);

export class Cases {
  private live: Live[] = [];
  private saved: CasesSaved;
  private chatT = SAY[0];
  private chatI = 0;
  private bumpCool = 0;
  private bleatT = 6;
  private beeLevel = 0;
  private t = 0;
  /** A twitch of the wheel while bees are loose in the cab (added to the driver's steering). */
  steerNudge = 0;

  constructor(private world: World, private ground: Ground, private mission: Mission, private hooks: CaseHooks, day: number, saved: CasesSaved | undefined) {
    this.saved = { ...(saved ?? {}) };
    const ctx = this.ctx();
    for (const c of CASES) {
      if (c.day !== day || this.saved[c.id]) continue;
      if (atStop(c)) {
        const st = mission.stops.find((s) => s.id === (c as Favor | Ride).from);
        if (!st) continue;
        this.live.push({ c, state: 'wait', person: st.person, crowd: [], ribbon: null, pos: st.pos.clone(), side: new THREE.Vector3(), still: 0, cool: 0, told: false });
        continue;
      }
      const w = (c as Ride | Tow | Block).where?.(ctx);
      if (w) this.spawn(c, w);
    }
  }

  private ctx(): Ctx { return { world: this.world, ground: this.ground, mission: this.mission, saved: this.saved }; }

  /** A rider is waiting by the road today (the day's random hitch-hiker stays home). */
  get roadRider(): boolean { return this.live.some((l) => l.c.kind === 'ride' && !l.c.from); }
  /** A story on the road today (not at an addressee's gate): other set pieces keep off the day. */
  get busyToday(): boolean { return this.live.some((l) => !atStop(l.c)); }
  /** Someone in the cab: the day isn't over until they are out. */
  get riding(): boolean { return this.live.some((l) => l.state === 'riding'); }
  /** What came of the cases so far (for the evening; today's untouched ones are «missed»). */
  get result(): CasesSaved {
    const out = { ...this.saved };
    for (const l of this.live) if (!out[l.c.id]) out[l.c.id] = l.state === 'done' ? 'done' : 'missed';
    return out;
  }

  private spawn(c: Case, w: Where): void {
    const f = w.road.frame(w.s);
    const half = w.road.zoneAt(w.s).width / 2;
    const put = (p: Person, lat: number, along: number, face: number) => {
      const x = f.x + f.rx * lat + f.tx * along, z = f.z + f.rz * lat + f.tz * along;
      p.group.position.set(x, this.ground.height(x, z), z);
      p.group.rotation.y = face;
      this.world.group.add(p.group);
      this.world.people.push(p);
      return p;
    };
    const l: Live = { c, state: 'wait', person: null, crowd: [], ribbon: null, pos: new THREE.Vector3(f.x, 0, f.z), side: new THREE.Vector3(f.rx, 0, f.rz), still: 0, cool: 0, told: false };
    if (c.kind === 'block') {
      // across the road: the best man in the middle, a girl at each end of the ribbon, an accordion on the verge
      // (all facing the van as it comes: down the road toward s falling)
      const face = Math.atan2(-f.tx, -f.tz);
      l.person = put(makeMan('#2a2a30', '#2a2a30', '#3a2e26'), 0, 0, face);
      l.crowd.push(put(makePerson('#c8452e', '#f0e0a0', false, 'woman'), -half + 0.4, 0.4, face));
      l.crowd.push(put(makePerson('#3a6a9a', '#e8c8d8', false, 'woman'), half - 0.4, 0.4, face));
      l.crowd.push(put(makeMan('#6a3a2a', '#2e2a30', '#5a4232'), half + 2.2, 1.5, face));
      const rib = new THREE.Mesh(new THREE.BoxGeometry(half * 2 - 0.8, 0.05, 0.02), new THREE.MeshLambertMaterial({ color: '#d02a2a' }));
      rib.position.set(f.x + f.tx * 0.4, this.ground.height(f.x, f.z) + 1.0, f.z + f.tz * 0.4);
      rib.rotation.y = Math.atan2(f.rx, f.rz) - Math.PI / 2;
      this.world.group.add(rib);
      l.ribbon = rib;
    } else {
      const lat = w.lat ?? half + 2.3;
      l.person = put((c as Ride | Tow).make(), lat, 0, Math.atan2(-f.rx, -f.rz));
      l.pos.set(f.x + f.rx * lat, 0, f.z + f.rz * lat);
    }
    this.live.push(l);
  }

  dispose(): void {
    this.hooks.bees(0);
    for (const l of this.live) {
      const mine = [...(!atStop(l.c) && l.person ? [l.person] : []), ...l.crowd];
      for (const p of mine) {
        p.group.removeFromParent();
        const i = this.world.people.indexOf(p);
        if (i >= 0) this.world.people.splice(i, 1);
      }
      l.ribbon?.removeFromParent();
    }
    this.live = [];
  }

  /** A suspension jolt (0…1): riders feel the potholes, bees get out of the hives. */
  jolt(s: number): void {
    const l = this.live.find((x) => x.state === 'riding');
    if (!l || l.c.kind !== 'ride' || s < 0.5) return;
    if (l.c.cargo === 'bees') this.beeLevel = Math.min(1, this.beeLevel + 0.3 + s * 0.2);
    if (l.c.bump && this.bumpCool <= 0) {
      this.hooks.say(l.c.who, l.c.bump[Math.floor(Math.random() * l.c.bump.length)]);
      this.bumpCool = 6;
    }
  }

  update(dt: number, v: Vehicle): void {
    this.t += dt;
    this.bumpCool -= dt;
    const kmh = Math.abs(v.speedKmh);
    for (const l of this.live) {
      l.cool = Math.max(0, l.cool - dt);
      const d = Math.hypot(l.pos.x - v.x, l.pos.z - v.z);
      const c = l.c;
      if (l.state === 'wait') {
        if (atStop(c)) {
          // the addressee, once the post is in his hands, while the van still stands at his gate
          const st = this.mission.stops.find((s) => s.id === (c as Favor | Ride).from);
          if (!st?.done) continue;
          l.still = d < 26 && kmh < 2 ? l.still + dt : 0;
          // drove off straight after the honks: he waves after the van, once — there is more to it
          if (!l.told && d > 30 && d < 140) {
            l.told = true;
            if (l.person) l.person.wave = 4;
            this.hooks.hint(`case-${c.id}-back`, `${c.who.split(',')[0]} машет вслед — у него к тебе ещё что-то. Вернись к дому и встань.`);
          }
          if (l.still > 1.5 && l.cool <= 0 && !this.hooks.choiceOpen()) {
            if (c.kind === 'ride' && this.full(l)) continue;
            l.state = 'asked'; this.ask(l);
          }
          continue;
        }
        if (c.kind === 'block') {
          if (!l.told && d < 90) { l.told = true; this.hooks.hint(`case-${c.id}`, c.warn); }
          if (d < 7 && kmh > 8) { this.scatter(l); this.hooks.say(c.who, c.through); this.saved[c.id] = 'refused'; l.state = 'done'; continue; }
        } else if (l.person && d < 80 && d > 12) l.person.wave = Math.max(l.person.wave, 0.6);
        l.still = d < (c.kind === 'block' ? 16 : 18) && kmh < 3 ? l.still + dt : 0;
        if (l.still > 0.6 && l.cool <= 0 && !this.hooks.choiceOpen()) {
          if (c.kind === 'ride' && this.full(l)) continue;
          l.state = 'asked'; this.ask(l);
        }
      } else if (l.state === 'asked') {
        // drove off without answering: the question waits for another stop
        if (kmh > 10 || d > 34) { this.hooks.closeChoice(); l.state = 'wait'; l.cool = 6; }
      } else if (l.state === 'riding' && c.kind === 'ride') this.ride(l, c, dt, v, kmh);
    }
    // the bees: out with every pothole, back to the hives (or out of the window) on a quiet stretch or a stop
    if (this.beeLevel > 0) {
      this.beeLevel = Math.max(0, this.beeLevel - dt * (kmh < 1 ? 0.12 : 0.025));
      const k = this.beeLevel;
      this.steerNudge = k * 0.32 * Math.sin(this.t * 7.3) * Math.sin(this.t * 2.3 + 1);
      this.hooks.bees(k);
    } else if (this.steerNudge !== 0) { this.steerNudge = 0; this.hooks.bees(0); }
  }

  /** One passenger seat: with someone else in it, the rider waits until it is free (and says so once). */
  private full(l: Live): boolean {
    if (!this.hooks.seatTaken?.()) return false;
    if (!l.full) { l.full = true; this.hooks.say(l.c.who, 'Ой, у тебя занято. Ты своего довези — а я подожду, мне не к спеху. Почти.'); }
    l.cool = 8;
    return true;
  }

  private ask(l: Live): void {
    const c = l.c, ctx = this.ctx();
    if (c.kind === 'ride') {
      const to = c.to(ctx);
      if (!to) { l.state = 'done'; return; }
      this.hooks.choice(c.who, c.ask(ctx), [c.yes, c.no], (i) => {
        if (i === 0) {
          l.state = 'riding';
          // the addressee's own figure stays at his gate; a rider from the roadside climbs in
          if (!c.from && l.person) l.person.group.visible = false;
          this.chatT = SAY[0] * 0.5;
          this.chatI = 0;
          this.hooks.toast(`${c.who} — в кабине · ${to.name}`);
          if (c.cargo === 'bees') this.hooks.hint('case-bees', 'Два улья в кузове. На ямах крышки подпрыгивают — пчёлы вылетают в кабину и мешают рулить. Едь плавно; встанешь — сами улетят.');
          if (c.cargo === 'ram') this.hooks.hint('case-ram', 'Баран в кузове. Смирный. Почти.');
        } else { l.state = 'done'; this.saved[c.id] = 'refused'; this.hooks.say(c.who, c.refused); }
      });
    } else if (c.kind === 'tow') {
      this.hooks.choice(c.who, c.ask, [c.yes, c.no], (i) => {
        if (i === 1) { l.state = 'done'; this.saved[c.id] = 'refused'; this.hooks.say(c.who, c.refused); return; }
        this.hooks.blackout(c.title, c.tow, 3.2, () => this.mission.addTime(c.minutes * 60), () => {
          l.state = 'done';
          this.saved[c.id] = 'done';
          this.hooks.say(c.who, c.thanks);
          this.mission.extra(c.label, c.money, c.trust);
          if (l.person) l.person.wave = 4;
          this.hooks.toast(`−${c.minutes} мин`);
        }, 'Трос');
      });
    } else if (c.kind === 'block') {
      this.hooks.choice(c.who, c.ask, c.options, (i) => {
        l.state = 'done';
        this.saved[c.id] = 'done';
        this.hooks.say(c.who, c.answers[i]);
        this.mission.extra(c.label, c.pay[i], c.trust);
        this.mission.addTime(c.minutes * 60);
        this.scatter(l, true);
      });
    } else {
      this.hooks.choice(c.who, c.ask, [c.yes, c.no], (i) => {
        l.state = 'done';
        if (i === 1) { this.saved[c.id] = 'refused'; this.hooks.say(c.who, c.refused); return; }
        const o = c.order(ctx);
        if (!o) { this.saved[c.id] = 'missed'; return; }
        this.saved[c.id] = 'done';
        this.mission.addOrder(o);
        this.hooks.say(c.who, c.accepted);
        this.hooks.toast(`В путевой лист: ${o.title.toLowerCase()}`);
      });
    }
  }

  /** The crowd off the road: cheerfully (waving), or jumping clear of a van that did not stop. */
  private scatter(l: Live, wave = false): void {
    l.ribbon?.removeFromParent();
    l.ribbon = null;
    const clear = 4.4;
    [l.person, ...l.crowd].forEach((p, i) => {
      if (!p) return;
      const pos = p.group.position;
      const lat = (pos.x - l.pos.x) * l.side.x + (pos.z - l.pos.z) * l.side.z;
      const want = Math.abs(lat) > clear ? lat : (i % 2 === 0 ? 1 : -1) * (clear + i * 0.5);
      pos.x += l.side.x * (want - lat); pos.z += l.side.z * (want - lat);
      pos.y = this.ground.height(pos.x, pos.z);
      if (wave) p.wave = 4;
    });
  }

  private ride(l: Live, c: Ride, dt: number, v: Vehicle, kmh: number): void {
    const to = c.to(this.ctx());
    if (!to) return;
    const d = Math.hypot(to.pos.x - v.x, to.pos.z - v.z);
    if (c.cargo === 'ram') {
      this.bleatT -= dt;
      if (this.bleatT < 0) { this.hooks.bleat(); this.bleatT = 7 + Math.random() * 12; }
    }
    if (d < 34 && kmh < 2.5) {
      l.still += dt;
      if (l.still > 0.6) {
        l.state = 'done';
        this.saved[c.id] = 'done';
        this.beeLevel = 0;
        this.hooks.say(c.who, c.thanks);
        this.mission.extra(c.label, c.money, c.trust);
        // out by the addressee's spot, waving the van off (the beekeeper stays with his hives, off screen)
        if (l.person && !c.from) {
          const p = l.person;
          p.group.position.set(to.pos.x + 2, to.pos.y, to.pos.z + 2);
          p.group.visible = true;
          p.wave = 4;
        }
      }
      return;
    }
    l.still = 0;
    if (kmh > 8) this.chatT -= dt;
    if (this.chatT <= 0 && this.chatI < c.chatter.length && !this.hooks.choiceOpen()) {
      this.hooks.say(c.who, c.chatter[this.chatI++]);
      this.chatT = SAY[0] + Math.random() * (SAY[1] - SAY[0]);
    }
  }
}

/**
 * At home, before the drive (main.ts plays them in the yard): a neighbour at the gate with
 * something that will not wait.
 */
export interface MorningCase {
  id: string;
  day: number;
  who: string;
  ask: string;
  options: [string, string];
  /** The second answer. */
  refused: string;
  /** For a ride (the maternity): where, and what is said. */
  ride?: { hint: string; bump: string[]; hurry: string; arrive: [string, string]; label: string; trust: number; money: number };
  /** For a fade to black (the haymaking tow at the gate): its title, text and the reward. */
  fade?: { title: string; text: string; thanks: string; money: number };
  /** The morning's sky for it (before dawn). */
  sky?: string;
}
export const MORNING_CASES: MorningCase[] = [
  {
    id: 'birth', day: 8, who: 'Ринат, сосед', sky: 'Туман, рассвет',
    ask: 'Тимур! Тимур, вставай! Зульфия рожает! Скорая в Заречье на вызове, в райбольнице сказали — час ждать! Мой трактор — разве ж на нём… Довези, а? Ради бога!',
    options: ['Садитесь! В райбольницу', 'Ринат, на тракторе быстрее'],
    refused: 'На тракторе?! Ты… Ладно! Зульфия, держись, на тракторе и поедем!.. Тимур, я тебе это припомню!',
    ride: {
      hint: 'Райбольница — в Ключевске, напротив почты. Быстро, но плавно: на каждой яме — «ой». Фары — F: ещё не рассвело.',
      bump: ['Ой! Ой-ой… Тише, Тимур, тише на ямах…', 'Тимур! Яма!.. Ничего, ничего, едем…', 'Ринат, скажи ему, пусть объезжает!..'],
      hurry: 'Тимур… быстрее, а? Только не по ямам. Быстрее, но не по ямам!',
      arrive: ['Әсәй (райбольница)', 'Каталку! Зульфия, милая, всё хорошо, всё успели… Ринат — за ней, халат накинь! Тимур — молодец. А теперь — марш на работу.'],
      label: 'Довёз Зульфию в роддом', trust: 5, money: 0,
    },
  },
  {
    id: 'mityai-hay', day: 16, who: MITYAI,
    ask: 'Тимурка, выручай! Сенокос — мой покос за Кайынкулем, роса сойдёт — косить поздно. А мотоцикл — ни в какую. Дёрни на тросе, а? Нюра уже и чайник поставила — тебе.',
    options: ['Цепляй, дед', 'Дед, на работу опоздаю'],
    refused: 'На работу… А покос — не работа? Ладно. Пешком пойду, с косой через всю деревню. К обеду дойду — как раз на обед и успею.',
    fade: {
      title: 'Трос у ворот',
      text: 'Трос звенит, Митяй в кепке — в седле, коса поперёк коляски, буханка буксует по мокрой траве, Нюра в окне крестится. Рывок… ещё… мотоцикл кашлянул синим дымом на всю улицу — и пошёл.',
      thanks: 'Пошёл, родимый! Спасибо, сосед! Нюра — пирожков ему! И сметаны! И это… на бензин, не спорь.',
      money: 10000,
    },
  },
];

/** The neighbour's case for this morning at home, if any (and not already played). */
export function morningCase(day: number, saved: CasesSaved | undefined): MorningCase | null {
  return MORNING_CASES.find((m) => m.day === day && !saved?.[m.id]) ?? null;
}

/**
 * What happened in the week before a played day (the fade before the morning): the days off screen,
 * the district's news, how the cases came out. `cases`: what has come of them so far.
 */
export function weekBefore(day: number, cases: CasesSaved | undefined): string | null {
  const c = cases ?? {};
  const W: Record<number, string> = {
    2: 'Четверг отработал по расписанию — первый день одному, по дедову блокноту. Вечером картатай позвонил из Уфы, на почту, Зинаиде: «Положили, кормят кашей. Как машина? Как Нина Петровна?» Дома өләсәй гладит дембельскую форму: «На Девятое мая наденешь».',
    3: `${c['mityai-seedlings'] === 'done' ? 'Рассада деда Митяя доехала до дочки целой — помидоры, говорит, будут «с кулак».' : 'Рассаду дед Митяй довёз до Сосновки на велосипеде — половину помял, на другую ругается.'} На Девятое мая всей улицей ходили к обелиску в Ключевске. Зацвела черёмуха — и сразу похолодало, по утрам пар изо рта.`,
    4: 'Два дня дождь, грунтовки раскисли — у лесничества буханка садилась, вытягивал на понижайке. Картатаю сделали операцию на ногах — звонил, голос бодрый: «Через неделю отпустят. Не гони там». А дед Митяй снял брезент со своего мотоцикла с коляской: «Весна — и мой драндулет поедет».',
    5: `${c['mityai-moto'] === 'done' ? 'Щуку деда Митяя видела вся улица — баба Нюра её закоптила.' : 'Дед Митяй дотолкал мотоцикл с озера к ночи. Щуку, говорит, видел.'} В выходные сажали картошку всей улицей — у өләсәй и у бабы Нюры, Митяй руководил с лавки. Рашит-агай передал через Зинаиду: эспарцет у фермы зацветает — ульи пора везти.`,
    6: `${c.bees === 'done' ? 'Ухо у Тимура прошло через три дня. Мёда Рашит-агай обещал — на всю Уфу хватит.' : 'Рашит-агай отвёз ульи на телеге. Лошадь, говорят, до сих пор нервная.'} В пятницу вечерним автобусом вернулся картатай. Похудел, ходит с палкой, но ходит. Врачи за руль не велели: «Сердце, Урал Хисамович. Накатались». Так что почта — за тобой. До Уфы.`,
    7: 'В понедельник в школах отзвенел последний звонок — в Сосновке выпускники прошли по улице с лентами, баба Шура плакала. Картатай с утра на лавке у ворот, считает, сколько раз за день проедет почта. По вечерам — гараж: дед на табуретке, Тимур под машиной.',
    8: `${c.saplings === 'done' ? 'Берёзки у правления фермы посадили всем колхозом — председатель назвал аллею «Почтовой».' : 'Саженцы лесник отвёз на телеге — половина засохла по дороге.'} Неделя гроз: дважды выбивало свет, в низине у реки вода. Ринат, сосед, ходит с круглыми глазами — Зульфия вот-вот родит.`,
    9: `${c.birth === 'done'
      ? 'Ринат стучал в ворота среди ночи — с лимонадом и тортом «Птичье молоко»: мальчик, три восемьсот! Назвали Тимуром. Зульфия говорит — в честь Тамерлана. Ринат говорит — в честь водителя.'
      : 'Зульфия родила мальчика — на тракторе успели. Ринат неделю не здоровался, потом отошёл: «Ладно. Крёстным не будешь — будешь дядей».'} Первое июня — у детей каникулы, на озере уже купаются, хоть вода ледяная. В «Звёздочке» красят ворота: первая смена — впервые с девяносто второго.`,
    10: `${c['mityai-camp'] === 'done' ? 'На линейке открытия смены дед Митяй играл на баяне «Взвейтесь кострами» — дети хлопали, вожатые плакали.' : 'Баян на линейку Митяй донёс сам — опоздал к подъёму флага, зато успел к обеду.'} У бабы Нюры в среду день рождения — Митяй всю неделю ходит загадочный.`,
    11: `${c['mityai-perfume'] === 'done' ? 'На день рождения баба Нюра получила «Красную Москву» и пионы. Плакала. Митяй ходит гордый.' : 'Духи Митяй прятал в сарае, в валенке. Нюра нашла. Плакала всё равно.'} В Кайынлы, говорят, свадьба: Ильдар женится. Зинаида Павловна велела — без опозданий, там телеграмм мешок.`,
    12: `${c.wedding === 'done' ? 'Кайынлы гуляло три дня. Пирог с черёмухой съели всей почтой.' : c.wedding === 'refused' ? 'Про порванную ленту знает всё Кайынлы. Фарида-апа смеётся: «Счастье у них будет, я проверяла».' : 'Кайынлы гуляло три дня.'} Сегодня суббота, и в Сосновке — Сабантуй. Дед Митяй с утра делает зарядку: «Столб — мой».`,
    13: `${c['mityai-ram'] === 'done' ? 'Баран деда Митяя живёт у Степаныча, звать Чемпион.' : 'Митяй привёл барана с Сабантуя на верёвке — к ночи, весь в репьях.'} Три дня гроз: у моста размыло обочину, в низине вода по ступицу. Тимур по вечерам пересчитывает копилку на клеёнке — тетрадка «до Уфы» вся в цифрах.`,
    14: 'На почту пришла бандероль: Митяю, из Москвы, Останкино. Тимур сам привёз её домой — Митяй отказался вскрывать без свидетелей. Вскрыли при всей улице: календарь «Поле чудес» с автографом и письмо — «ваша история будет рассмотрена». На радостях Митяй пошёл на озеро: «Щука ждать не будет».',
    15: `${c['mityai-river'] === 'done' ? 'Митяй всю неделю ходит в шерстяных носках и говорит, что купался «для здоровья».' : 'Митяя с озера привели под руки рыбаки — мокрого, но со щукой. Нюра знает.'} Ночью опять гроза — у Сосновки в низине вода стоит, молоковоз с фермы ездит в объезд.`,
    16: `${c['kolka-milk'] === 'done' ? 'Председатель колхоза жал Кольке руку за молоко, а Колька всем говорит: «Это почта вытащила».' : c['kolka-milk'] === 'refused' ? 'Молоковоз просидел в колее до вечера, молоко с утренней дойки скисло.' : 'Молоковоз вытащили гусеничным к вечеру.'} С утра начался сенокос: на лугах за Урманлы косят с рассвета, пахнет сеном на всю улицу.`,
    17: `${c['mityai-hay'] === 'done' ? 'Митяй успел на свой покос — на мотоцикле, с косой поперёк коляски; говорят, обогнал автобус.' : 'На покос Митяй пошёл пешком, с косой через всю деревню, — к обеду дошёл.'} В пятницу в Ключевской школе был выпускной — до рассвета пели под гитару у озера. Зинаида Павловна выписала Тимуру характеристику: «Не подвёл». Автобус на Уфу — в среду утром.`,
    18: 'Выходные — сборы: өләсәй шьёт мешочек для денег на резинке, әсәй купила рубашку «для экзаменов», картатай достал дерматиновый чемодан, с которым сам когда-то уходил в армию. Сегодня — последний рейс перед Уфой.',
  };
  return W[day] ?? null;
}
