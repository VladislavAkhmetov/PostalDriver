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
  // ---- Sept: the neighbour, to Sosnovka with his mushrooms
  {
    kind: 'ride', id: 'mityai-mushrooms', day: 2, who: MITYAI, make: mityai, label: 'Попутчик · дед Митяй до Сосновки', money: 10000, trust: 2,
    where: (c) => onRoute(c, 'sosnovka') ? { road: c.ground.main, s: c.ground.marks.town + 140 } : null,
    to: (c) => stopOf(c, 'sosnovka'),
    ask: () => 'Тимурка! Сосед! Узнал? Я ж тебя вот такого на мотоцикле катал. Подбрось до Сосновки — у меня белые, ведро. Дочке, Нюра велела.',
    yes: 'Садись, дед Митяй', no: 'Не сегодня, дед',
    refused: 'Эх… Ну, иди-иди, почта. Грибы — они не убегут. А я — убегу, пешком, к обеду.',
    chatter: [
      'Урал-то как? Звонил? Он крепкий, вернётся. Мы с ним в шестьдесят третьем на одном колхозном грузовике картошку возили. Он рулил, я спал.',
      'Я тут письмо в «Поле чудес» написал. Якубовичу. Про то, как мы с Нюрой поженились. Ответят — тебе первому скажу. Посылку-то ты привезёшь.',
      'Щуку вот такую на Кайынкуле видел. Не поймал. Но видел.',
      'Нюра ругается — мотоцикл мой третий год под брезентом. С коляской, зверь. А я его не брошу. Он меня не бросил — и я его.',
    ],
    thanks: 'Приехали! Спасибо, сосед. Вот тебе белых — половину, Нюра не узнает. И на бензин, не спорь.',
  },
  // ---- Oct: by the lake, his motorcycle has died
  {
    kind: 'tow', id: 'mityai-moto', day: 6, who: MITYAI, make: mityai, label: 'Выручил · дёрнул мотоцикл деда Митяя', money: 0, trust: 2,
    where: (c) => onRoute(c, 'kainly') || onRoute(c, 'camp') ? { road: c.ground.stub, s: c.ground.branch.lake - 30 } : null,
    ask: 'Тимурка! Стой! Мотоцикл встал, зараза. Свечу продул, бензин есть — не хочет. Дёрни на тросе, а? Трос у меня свой, с шестьдесят девятого года.',
    yes: 'Цепляй, дед', no: 'Некогда, дед, график',
    refused: 'График… У Урала тоже график был. Ладно. Я тут посижу. С щукой.',
    title: 'На тросе', tow: 'Трос — на фаркоп, Митяй — в седло, буханка — вперёд. Рывок… ещё рывок… мотоцикл чихнул, выстрелил на всё озеро — и затарахтел. Утки снялись с воды.',
    minutes: 3,
    thanks: 'Завёлся! Спасибо, сосед! А щука-то — вот она, гляди! Вот такая. Я ж говорил. Нюре скажешь — сам поймал, без мотоцикла.',
  },
  // ---- Nov: a wedding in Kainly has the road across
  {
    kind: 'block', id: 'wedding', day: 11, who: 'Дружка жениха', label: 'Свадьба в Кайынлы · выкуп', money: 0, trust: 2,
    where: (c) => onRoute(c, 'kainly') ? { road: c.ground.stub, s: c.ground.branch.kaiStart - 70 } : null,
    warn: 'Впереди поперёк дороги — лента и народ с гармошкой. Свадьба. Остановись.',
    ask: 'Стой, почта! В Кайынлы свадьба — Ильдар Фариду-апину племянницу берёт. Дорога наша, лента наша. Выкуп давай! Или песню. Или — что везёшь, то и отдай!',
    options: ['Выкуп — десять тысяч', 'Посигналить молодым на счастье', 'Спеть «Ой, мороз, мороз»'],
    answers: [
      'Вот это почта! Держи пирог с калиной и проезжай. И приезжай вечером — гулять будем три дня!',
      'Би-би, би-би-и! Вот это я понимаю — по-нашему! Режь ленту! Почте — дорога, молодым — счастья!',
      '«…не морозь меня…» Ну, голос — как у трактора. Но от души! Проезжай, артист. Вот пирог — на дорожку.',
    ],
    pay: [-10000, 0, 0],
    minutes: 2,
    through: 'Эй! Почта! Ленту порвал — молодым счастья не будет! …Ладно, будет. Но ты всё равно приходи — извинишься.',
  },
  // ---- Dec: through the ice at the edge, wet to the knees
  {
    kind: 'ride', id: 'mityai-ice', day: 15, who: MITYAI, make: mityai, label: 'Попутчик · мокрый дед Митяй до Кайынлы', money: 0, trust: 3,
    where: (c) => onRoute(c, 'kainly') ? { road: c.ground.stub, s: c.ground.branch.lake + 20 } : null,
    to: (c) => stopOf(c, 'kainly'),
    ask: () => 'Тимурка… Я… это… у берега… лёд тонкий. По колено. Ничего страшного, только ноги не чувствую. До Кайынлы, к Фариде в медпункт, а? Нюре — ни слова.',
    yes: 'Садись, печку включу', no: 'Дед, мне в другую сторону',
    refused: 'В другую… Ну, ладно. Я бегом. Бег — он греет. Говорят.',
    chatter: [
      'Печку-то на всю! Вот… вот так… Пальцы, кажись, вернулись. Девять. Шучу — все.',
      'Щука там, Тимурка. Вот такая. Я к ней — а лёд ко мне. Ну, неудачно познакомились.',
      'Ты Нюре скажи, что я в правлении задержался. По делам. По мокрым делам.',
    ],
    thanks: 'Фарида! Принимай утопленника!.. Спасибо, сосед. Если б не ты — стоял бы я там до весны, памятником рыбаку.',
  },
  // ---- Dec: the forester's fir tree for the children's party at the farm
  {
    kind: 'favor', id: 'yolka', day: 17, who: 'Фёдор Иванович, лесник', from: 'forestry', label: 'Ёлка к утреннику на ферме', money: 15000, trust: 3,
    ask: 'Тимур, выручай. Председатель просил ёлку к утреннику — для ребятни с фермы. Срубил, связал. Красавица, два метра. Отвезёшь на ферму, в красный уголок? Из кузова, правда, торчать будет.',
    yes: 'Грузите, Фёдор Иванович', no: 'Не влезет, наверное',
    refused: 'Не влезет… В буханку всё влезает. Ладно, на санях Палыч довезёт. К Пасхе.',
    accepted: 'Вот и ладно. Двери не захлопывай — макушку прищемишь. Ребятишкам скажи — от лесника.',
    order: (c) => {
      // the farm, even when the van has been there already today: then it goes back (addOrder reopens the stop)
      const dest = c.world.stops.find((s) => s.id === 'kolkhoz');
      return dest ? { id: 'case-yolka', dest: dest.id, kind: 'parcel', title: 'Ёлка к утреннику', note: 'два метра, связана бечёвкой, торчит из кузова', pay: 15000, fragile: false, due: null, from: 'Лесник' } : null;
    },
  },
  // ---- Dec 30: Дед Мороз himself, to the farm's party
  {
    kind: 'ride', id: 'mityai-moroz', day: 18, who: 'Дед Мороз (дед Митяй)', make: () => makeMan('#b8322c', '#b8322c', '#f2f0ea'), label: 'Попутчик · Дед Мороз на утренник', money: 0, trust: 3,
    where: (c) => onRoute(c, 'kolkhoz') ? { road: c.ground.main, s: c.ground.marks.town + 140 } : null,
    to: (c) => stopOf(c, 'kolkhoz'),
    ask: () => 'Ох-хо-хо! Здравствуй, внучек! …Тимурка, это я, Митяй. Борода из ваты, шуба — Нюрин халат. На ферме утренник, а Деда Мороза нету — завклубом в райцентре. Подвези, а?',
    yes: 'Садитесь, Дедушка Мороз', no: 'Дедушка, у меня почта',
    refused: 'У Деда Мороза тоже почта — письма от детей… Ладно, пешком дойду. С посохом.',
    chatter: [
      'Стишок мне расскажи, внучек. «Ёлочка» знаешь? Я — нет. Забыл. Подскажешь там, если что.',
      'Подарки — в мешке: мандарины, по две штуки, и «Мишка на Севере». Председатель выдал. Одну конфету я уже… для проверки.',
      'Борода чешется. Вата медицинская, у Фариды взял. Пахнет больницей — дети скажут, Дед Мороз хворый.',
    ],
    thanks: 'Приехали, внучек! Ох-хо-хо! …Тимурка, поправь бороду. Вот так. С наступающим! Мандарин — тебе. Без проверки.',
  },
  // ---- March: perfume for баба Нюра, in secret
  {
    kind: 'ride', id: 'mityai-perfume', day: 23, who: MITYAI, make: mityai, label: 'Попутчик · дед Митяй с секретом', money: 5000, trust: 2,
    where: (c) => onRoute(c, 'sosnovka') ? { road: c.ground.main, s: c.ground.marks.town + 140 } : null,
    to: (c) => stopOf(c, 'sosnovka'),
    ask: () => 'Тимурка, тс-с! Восьмое марта на носу. Я Нюре духи взял — «Красная Москва», в райцентре, по блату. Спрятать надо у дочки, в Сосновке. Дома найдёт — она всё находит.',
    yes: 'Садись, конспиратор', no: 'Не по пути сегодня',
    refused: 'Эх… Придётся в сарае прятать. В валенке. Она туда не лазит. Надеюсь.',
    chatter: [
      'Сорок шесть лет вместе. Один раз в Сочи ездили — по путёвке, в семьдесят девятом. Нюра до сих пор вспоминает. Я тоже — я там на солнце сгорел.',
      'Ты только Нюре не проболтайся. Она тебя пирогами разговорит — ты стой. Как партизан.',
      'Духи — это главное. И мимоза. И чтоб посуду помыл. Но главное — духи.',
    ],
    thanks: 'Спасибо, сосед. Спрятал. Если Нюра спросит, где я был, — я был на собрании. Про международное положение.',
  },
  // ---- May: the beekeeper's hives to the sainfoin by the farm (it flowers in late May), and the bees get out
  {
    kind: 'ride', id: 'bees', day: 27, who: 'Рашит-агай', make: () => makeMan('#6a6a48', '#3a3a30', '#c8c4bc'), label: 'Ульи Рашит-агая на эспарцет', money: 30000, trust: 3,
    from: 'apiary', cargo: 'bees',
    to: (c) => stopOf(c, 'kolkhoz'),
    ask: () => 'Тимур, улым, выручай. У фермы эспарцет зацветает — розовое поле, сам увидишь, а мои пчёлки тут сидят. Два улья в кузов — и к ферме. Я с тобой поеду, они меня знают. Только по ямам — тихонечко, ладно?',
    yes: 'Грузим, Рашит-агай', no: 'Боюсь я пчёл, агай',
    refused: 'Боишься… А мёд любишь. Ладно, на телеге отвезу. Пчёлки потерпят. Лошадь — нет.',
    chatter: [
      'Слышишь, гудят? Это они разговаривают. Довольны. Эспарцет — это для них как для тебя зарплата. Мёд с него светлый, как слеза.',
      'Пчела — она умная. Злого человека жалит, доброго — тоже, но потом извиняется. Шучу.',
      'Картатаю мёда передай, прошлогоднего, гречишного. Ему для сердца хорошо. Врачи не знают — а я знаю.',
    ],
    bump: [
      'Ай-яй! Тише! Крышка у улья подпрыгнула — вылетели!',
      'Ямы, улым, ямы! Они от тряски злые!',
      'Не маши руками! Не маши — они этого не любят!',
    ],
    thanks: 'Приехали! Ставь, ставь, аккуратно… Ну, живы? Подуй на ухо — пройдёт. Пчелиный яд, улым, от радикулита. Вот мёд — тебе и картатаю. Спасибо.',
  },
  // ---- June: Sabantuy in Sosnovka, and Митяй has won a ram
  {
    kind: 'ride', id: 'mityai-ram', day: 28, who: MITYAI, make: mityai, label: 'Сабантуй · дед Митяй с бараном', money: 10000, trust: 3,
    where: (c) => onRoute(c, 'khutor') ? { road: c.ground.main, s: c.ground.marks.sosStop + 45 } : null,
    to: (c) => stopOf(c, 'khutor'),
    ask: () => 'Тимурка!!! Я барана выиграл! На столб залез — молодые не смогли, а я залез! Шестьдесят девять лет! Нюра не верит. Его бы к Степанычу на хутор, пока я праздную. Довезёшь? Он смирный. Почти.',
    yes: 'Грузи барана, чемпион', no: 'Дед, баран в почте — это слишком',
    refused: 'Слишком… А барана выиграть в шестьдесят девять — не слишком? Ладно, на верёвке поведу. Он меня поведёт, вернее.',
    chatter: [
      'Ты видел, как я на столб? Как белка! Ну, как старая белка. Но — белка!',
      'Нюра сказала: «Зачем нам баран?» А я ей: «Нюра, это не баран. Это — победа».',
      'Урал, говорят, тоже на Сабантуе был, в шестьдесят седьмом. Курицу выиграл. Мы её потом три года звали Призом.',
    ],
    thanks: 'Приехали! Степаныч, принимай чемпиона! Это я про барана. И про себя тоже. Спасибо, Тимурка, — на золотую свадьбу позову. Через четыре года!',
    cargo: 'ram',
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
  /** For a fade to black (the frost tow): its title, text and the reward. */
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
      hint: 'Райбольница — в Ключевске, напротив почты. Быстро, но плавно: на каждой яме — «ой». Фары — F: ещё темно.',
      bump: ['Ой! Ой-ой… Тише, Тимур, тише на ямах…', 'Тимур! Яма!.. Ничего, ничего, едем…', 'Ринат, скажи ему, пусть объезжает!..'],
      hurry: 'Тимур… быстрее, а? Только не по ямам. Быстрее, но не по ямам!',
      arrive: ['Әсәй (райбольница)', 'Каталку! Зульфия, милая, всё хорошо, всё успели… Ринат — за ней, халат накинь! Тимур — молодец. А теперь — марш на работу.'],
      label: 'Довёз Зульфию в роддом', trust: 5, money: 0,
    },
  },
  {
    id: 'mityai-frost', day: 20, who: MITYAI,
    ask: 'Тимурка, выручай! Минус тридцать два! Мотоцикл мой — ни в какую. А мне в райцентр, в собес, к девяти. Дёрни на тросе, а? Нюра уже и чайник поставила — тебе.',
    options: ['Цепляй, дед', 'Дед, на работу опоздаю'],
    refused: 'На работу… А собес — не работа? Ладно. Пешком пойду. К обеду дойду — как раз на обед и успею.',
    fade: {
      title: 'Минус тридцать два',
      text: 'Трос звенит на морозе, Митяй в тулупе — в седле, буханка буксует, Нюра в окне крестится. Рывок… ещё… мотоцикл кашлянул синим дымом на всю улицу — и пошёл.',
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
    2: 'Четверг отработал по расписанию — первый день без деда. Сам, по дедову блокноту. Вечером он позвонил из Уфы, на почту, Зинаиде: «Положили, кормят кашей. Как машина? Как Нина Петровна?»',
    3: 'В выходной копали картошку всей улицей — у өләсәй и у бабы Нюры. Дед Митяй руководил с лавки. Әсәй с ночных: в райбольнице опять нет бинтов.',
    4: 'Неделя по расписанию: Сосновка, хутора, за реку. Картатаю сделали операцию на ногах — звонил, голос бодрый: «Через неделю отпустят. Не гони там».',
    5: 'В пятницу вечерним автобусом вернулся картатай. Похудел, ходит с палкой, но ходит. Врачи за руль не велели: «Сердце, Урал Хисамович. Накатались». Так что почта — за тобой.',
    6: `Неделя по расписанию. По вечерам — гараж: картатай на табуретке, Тимур под машиной. ${c['mityai-mushrooms'] === 'done' ? 'Дед Митяй всем рассказывает, что «почта его возит».' : 'Дед Митяй дуется: «Возит всех, кроме соседа».'} А в субботу он снял брезент со своего мотоцикла с коляской: «Раз Урал-агай дома — и мой драндулет поедет». Поехал. Недалеко.`,
    7: `${c['mityai-moto'] === 'done' ? 'Щуку деда Митяя видела вся улица — баба Нюра её закоптила.' : 'Дед Митяй дотолкал мотоцикл с озера к ночи. Щуку, говорит, видел.'} По утрам заморозки, на огородах жгут ботву.`,
    8: 'Неделя дождей: грунтовки развезло, у лесничества буханка садилась дважды. Ринат, сосед, ходит с круглыми глазами — Зульфия вот-вот родит.',
    9: c.birth === 'done'
      ? 'Ринат стучал в ворота среди ночи — с лимонадом и тортом «Птичье молоко»: мальчик, три восемьсот! Назвали Тимуром. Зульфия говорит — в честь Тамерлана. Ринат говорит — в честь водителя.'
      : 'Зульфия родила мальчика — на тракторе успели. Ринат неделю не здоровался, потом отошёл: «Ладно. Крёстным не будешь — будешь дядей».',
    10: 'Ноябрь. Колхоз докопал свёклу, скотину поставили на зиму. Октябрьскую получку дали без задержки — Зинаида сама удивилась.',
    11: 'Первый мороз, лужи встали. В Кайынлы, говорят, свадьба: Ильдар женится. Зинаида Павловна велела — без опозданий, там телеграмм мешок.',
    12: `${c.wedding === 'done' ? 'Кайынлы гуляло три дня. Пирог с калиной съели всей почтой.' : c.wedding === 'refused' ? 'Про порванную ленту знает весь Кайынлы. Фарида-апа смеётся: «Счастье у них будет, я проверяла».' : 'Кайынлы гуляло три дня.'} Ночью выпал первый снег.`,
    13: 'Неделя снега и слякоти. Картатай учит надевать цепи на колёса. Дед Митяй каждый день спрашивает у почты: «Мне из Москвы ничего?» Ничего.',
    14: 'Декабрь, зима встала. Котельная топит через раз, грейдер один на район. Кайынкуль затянуло льдом — у берега пока тонким.',
    15: 'На озере уже сидят рыбаки. Дед Митяй достал ледобур: «Щука — моя». Нюра велела у берега не ходить.',
    16: `${c['mityai-ice'] === 'done' ? 'Митяй всю неделю ходит в валенках с калошами и говорит, что купался «для здоровья».' : 'Митяя из Кайынлы привезли на санях.'} Баба Нюра всё знает. Почта перед праздниками — мешками.`,
    17: 'Новогодняя неделя. Открытки мешками, посылки из Уфы и с Севера. Зинаида обещала премию — если без опозданий.',
    18: `${c.yolka === 'done' ? 'Утренник на ферме прошёл с ёлкой от лесника.' : 'Ёлку на ферму Палыч привёз на санях — к утреннику успели.'} Тридцатое декабря. Дед Митяй с утра ищет вату.`,
    19: `Новый, девяносто восьмой, встретили дома: пельмени, «Голубой огонёк», картатай уснул до курантов. ${c['mityai-moroz'] === 'done' ? 'Дети с фермы до сих пор говорят, что Дед Мороз пах больницей. ' : ''}А тринадцатого на почту пришла бандероль: Митяю, из Москвы, Останкино. Тимур сам привёз её домой — Митяй отказался вскрывать без свидетелей.`,
    20: 'Бандероль вскрыли при всей улице, Тимур — понятым: календарь «Поле чудес» с автографом и письмо — «ваша история будет рассмотрена». Повесил календарь над телевизором. Нюра третий день не ворчит.',
    21: `${c['mityai-frost'] === 'done' ? 'В собес Митяй успел — на мотоцикле, в тулупе; говорят, обогнал автобус.' : 'В собес Митяй не успел, зато познакомился в автобусе с вдовой из Сосновки. Нюра знает.'} Морозы.`,
    22: 'Февраль, метели. Зинаида Павловна: «Двадцать третье — день мужской. Открытки — по всему маршруту. Тебе — тоже будет».',
    23: 'Зинаида подарила Тимуру одеколон «Шипр» и пачку конвертов. Картатай — свою старую кожаную планшетку: «Почтальон без планшетки — как баран без рогов». Скоро восьмое марта.',
    24: `${c['mityai-perfume'] === 'done' ? 'На восьмое марта баба Нюра получила «Красную Москву» и мимозу. Плакала. Митяй ходит гордый.' : 'Духи Митяй прятал в валенке. Нюра нашла. Плакала всё равно.'} Тает, с крыш капает.`,
    25: 'Распутица. Грунтовки — каша, на лесной дороге лесовоз сидит по оси. Река поднялась — у моста вода до самого настила.',
    26: 'Апрель. Сошёл снег, пашут, в низинах ещё вода. Дети выгоняют коров на первую траву. Картатай сидит на лавке у ворот и считает грачей.',
    27: 'Май. Сажали картошку всей улицей. Рашит-агай передал: эспарцет у фермы зацветёт к двадцатому — ульи надо везти заранее.',
    28: `${c.bees === 'done' ? 'Ухо у Тимура прошло через три дня. Мёда — на всю зиму вперёд.' : 'Рашит-агай отвёз ульи на телеге. Лошадь, говорят, до сих пор нервная.'} Июнь. Сегодня суббота, и в Сосновке — Сабантуй.`,
    29: `${c['mityai-ram'] === 'done' ? 'Баран деда Митяя живёт у Степаныча, звать Чемпион.' : 'Митяй привёл барана с Сабантуя на верёвке — к ночи, весь в репьях.'} Июль, сенокос, жара. На автостанции — абитуриенты с чемоданами. Копилку Тимур пересчитал ещё в июне.`,
  };
  return W[day] ?? null;
}
