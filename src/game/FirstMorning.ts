import type { Vehicle } from '../vehicle/Vehicle';
import type { Ground } from '../world/Ground';
import type { World } from '../world/World';

/**
 * The first working morning (docs/design.md, «Первое утро»): the drive from the family's yard in
 * Urmanly through the wood to the post office in Klyuchevsk, the grandfather in the right-hand seat
 * — Timur takes him to the Ufa bus, which leaves from the post office (he goes into hospital today).
 * It is the game's lesson. The road (Ground.buildHomeRoad) was laid for it: the village street, the
 * forest, puddles, a hollow with mud in its bottom, the gravel mouth onto the asphalt, the town.
 * He teaches one thing at a time, at the place for it, and waits until it is done: the ignition, the
 * handbrake, the pedals and the wheel, the horn, the lights, looking about, the wipers, braking
 * before the hollow, the front axle and the low range in the mud and off again after, the map, the
 * gearbox and the radio, stopping before the main road and the turn, the ritual at the door. He
 * minds the speed on every stretch, helps when the van is stuck, skips a lesson whose place is
 * passed (with a word about it), and in between talks about the people and about life.
 */
export interface FirstMorningHooks {
  say(speaker: string, line: string): void;
  hint(id: string, text: string, keys?: string): void;
  clearHint(id: string): void;
  /** The van has pulled in at the GAI post: Kuzmin to the window for a word (VISIT); `done` after. False if the post is busy. */
  visit?(done: () => void): boolean;
}

/**
 * At the GAI post on the first morning: the grandfather and Sergeant Kuzmin are old acquaintances.
 * The way into the story: the grandson is learning the route to stand in for him while he is in
 * hospital in Ufa (docs/design.md, «Первое утро»).
 */
export const VISIT: [string, string][] = [
  ['Сержант Кузьмин, ГАИ', 'О-о, Урал-агай! Сколько лет, сколько зим! А за рулём кто — неужто внук?'],
  ['Картатай', 'Внук, Тимур. Позавчера из армии. Везёт меня к автобусу: сегодня в Уфу ложусь, в больницу — ноги подлатать, сердце послушать. Он за меня на почте будет.'],
  ['Сержант Кузьмин, ГАИ', 'Здоровья тебе, Урал-агай. Тридцать лет мимо меня ездишь — и ни разу не попался.'],
  ['Картатай', 'Потому что шестьдесят у поста — это шестьдесят. Слышал, солдат?'],
  ['Сержант Кузьмин, ГАИ', 'Слушай деда, почта. Аптечка, огнетушитель, путевой лист — чтоб всё было. А гонять будешь — не посмотрю, чей ты внук.'],
  ['Картатай', 'Не будет. А будет — сам ему уши надеру. Ну, бывай, сержант. Поехали, Тимур.'],
];

/** What the cab has on, read each frame. */
export interface CabState { lights: boolean; wipers: boolean; map: boolean; horn: boolean; lookYaw: number; lookBack: boolean }

export const KARTATAY = 'Картатай';

/** Where the van is on the morning's way, for the lessons. */
interface Ctx {
  v: Vehicle;
  kmh: number;
  /** Metres from the village end of the home road toward town (negative: still in the yard), or null off it. */
  p: number | null;
  /** Distance along the home road from the main street, or null off it. */
  rs: number | null;
  /** On the main street: its distance there, or null. */
  ms: number | null;
  toDoor: number;
  /** To the GAI inspector's place at the post. */
  toPost: number;
  fromHome: number;
  cab: CabState;
  /** Seconds the current lesson has been on. */
  t: number;
}

interface Step {
  id: string;
  /** When it begins (after the one before is over). */
  at: (c: Ctx) => boolean;
  line: string | ((c: Ctx) => string);
  hint?: [string, string];
  done: (c: Ctx) => boolean;
  praise?: string;
  /** Its place is behind: dropped, with this said (if anything). */
  skip?: (c: Ctx) => boolean;
  skipLine?: string;
  /** Said once if it drags on this long. */
  nag?: [number, string];
  /** Run when it begins. */
  enter?: () => void;
  /** Already so when it begins: this is said instead, and on to the next. */
  already?: (c: Ctx) => boolean;
  alreadyLine?: string | ((c: Ctx) => string);
  /** Run when it is done (not when skipped). */
  onDone?: () => void;
}

/**
 * Remarks tied to a place rather than to a lesson: said as the van gets there, whatever lesson is on
 * (a lesson that drags on must not make him talk about Muha after the shop is behind).
 */
interface Sight { id: string; at: (c: Ctx) => boolean; line: string }

/** A line waiting to be said; one that has waited too long for its moment is dropped, not said late. */
interface Queued { line: string; pri: number; at: number; step: number }
/** How long a line may wait, by priority (0, the talk in passing, waits for a quiet spell any time). */
const KEEP = [Infinity, 8, 10, 6];

/** In between the lessons, while the road is quiet: the people, the work, life. */
const TALK: string[] = [
  'Автобус на Уфу — в десять, от почты. Успеваем, так что не гони.',
  'Путевой лист — закон. Кому, что, к какому часу — всё там. Пенсии — первым делом: их с утра у калиток ждут.',
  'В Сосновке Нина Петровна. Пенсию ей вовремя вози — она с неё за свет платит. А заговорит — час потеряешь.',
  'Опоздать можно. Врать нельзя. Опоздал — скажи как есть: тут все друг друга знают.',
  'Стекло в кузове — значит, по ямам ползком. Разобьёшь Валентине банки — она тебе до пенсии поминать будет.',
  'В Берёзовке Степаныч. Мы с ним в шестидесятых сено косили. Скажи — от Урала, мёду нальёт.',
  'Будут по дороге всякое предлагать. Подвезти человека — подвези. А чужие коробки не бери и не спрашивай, что внутри.',
  'Бензин — по талонам. Кончатся — заправка за посёлком, но уже за свои.',
  'Машину побьёшь — чинить из своего кармана. В моём гараже вечером, сам — только запчасти. Ключи там все, найдёшь. К Кольке в МТС — и запчасти, и работа, дороже.',
  'Заблудишься — карта, M. А если и карта не помогает — спроси у людей. Тут не город, тут ответят.',
  'А в Уфу ты поедешь. Почта — это пока. Хорошее «пока», честное. Но пока.',
];
const SPEEDING = [
  'Не гони, улым. Буханка не легковушка.',
  'Тише! Куда летишь — почта никуда не денется.',
  'Сбавь, говорю. Я в твои годы тоже гонял — потом мост менял.',
];

export class FirstMorning {
  private steps: Step[];
  private i = 0;
  private active = false;
  private stepT = 0;
  /** Lines waiting to be said, most pressing first: 3 a warning (speed, stuck, the wrong way), 2 the lesson or a place, 1 a word of praise, 0 the talk. */
  private queue: Queued[] = [];
  private sights: Sight[];
  private seen = new Set<string>();
  /** Stopped at the GAI post as asked (the visit, then his word about Kuzmin). */
  private pulledIn = false;
  /** Seconds the van has stood still. */
  private stillT = 0;
  /** On the asphalt with the front axle still in. */
  private axleT = 0;
  private axleTold = false;
  /** The lesson whose instruction was last said aloud (its praise only follows if it was). */
  private saidStep = -1;
  private gap = 0;
  private idle = 0;
  private talkI = 0;
  private fastT = 0;
  private fastCool = 0;
  private fastI = 0;
  private stuckT = 0;
  private stuckCool = 0;
  private hornWas = false;
  private horned = false;
  private mapSeen = false;
  private mapClosed = false;
  private acts = new Set<string>();
  private wrongTold = false;
  private honks: number[] = [];
  private t = 0;
  private gapFull = 0;
  /** For tests: every line as it is said, with the lesson's clock. */
  log: ((t: number, line: string) => void) | null = null;
  /** A speed the van is held down to (km/h) while he asks to pull in at the post; null otherwise. */
  assist: number | null = null;
  private visiting = false;
  /** The ritual done at the post office door: stopped, the handbrake on, two honks. */
  atDoor = false;
  /** He speaks: for the figure in the seat to turn to the driver. */
  onSay: ((seconds: number) => void) | null = null;

  constructor(private world: World, private ground: Ground, private hooks: FirstMorningHooks, private cab: () => CabState) {
    const g = ground, road = g.homeRoad, L = road.length;
    const Vp = L - g.homeMarks.village, Hp = L - g.homeMarks.hollow, nb = 120;
    const onHome = (c: Ctx) => c.p !== null && c.p > 3;
    this.steps = [
      { id: 'ignition', at: () => true, line: 'Ну, солдат, первый рабочий день. Заводи — Enter. Буханка с утра как я: пока не раскашляется, не поедет.',
        hint: ['Зажигание — Enter. Всё управление — F1, пауза — Esc.', 'Enter'], done: (c) => c.v.engine !== 'off', praise: 'Схватил. Слышишь — ровно? Живая.',
        already: (c) => c.v.engine === 'running', alreadyLine: 'Ну, солдат, первый рабочий день. Мотор уже тарахтит — хорошо.' },
      { id: 'handbrake', at: (c) => c.v.engine === 'running', line: 'Ручник отпусти — пробел. На ручнике машина стоит, как я на палке: надёжно, но никуда.',
        hint: ['Ручник — пробел.', 'Пробел'], done: (c) => !c.v.handbrake },
      { id: 'pedals', at: () => true, line: 'Газ — W, тормоз — S, руль — A и D. Коробка сама переключит. Потихоньку — к воротам.',
        hint: ['Газ — W · тормоз — S · руль — A и D. Назад — держи S, когда стоишь.', 'W · S · A · D'], done: (c) => c.fromHome > 7,
        nag: [16, 'Газ — W. Не бойся, она не кусается.'] },
      { id: 'gate', at: () => true, line: 'В ворота — ровно, не спеша. Створки я сам вешал, в семьдесят восьмом. Заденешь — өләсәй нас обоих со двора выгонит.',
        done: onHome },
      { id: 'village', at: onHome, line: 'По деревне — двадцать, не больше. Куры, дети, бабки. Задавишь курицу — до пенсии не отмоешься.', done: (c) => c.t > 6 },
      { id: 'horn', at: (c) => c.p !== null && c.p > nb - 32, line: 'Вон соседка у калитки — посигналь ей, H. Она каждое утро почту провожает.',
        hint: ['Гудок — H.', 'H'], done: () => this.horned, praise: 'Видишь — машет. У адресата так же: встал, ручник, два раза — и выходят.',
        skip: (c) => c.p !== null && c.p > nb + 45, skipLine: 'Не посигналил — обидится. Ладно, өләсәй ей скажет: торопились к автобусу.' },
      { id: 'lights', at: (c) => c.p !== null && c.p > Vp + 12, line: 'Лес пошёл. Фары включи — F. Солнце солнцем, а под ёлками тень: с фарами тебя издалека видно.',
        hint: ['Фары — F.', 'F'], done: (c) => c.cab.lights, praise: 'Вот. И гаишники любят, когда с фарами.',
        nag: [12, 'Фары, говорю, — F.'], skip: (c) => c.p !== null && c.p > Vp + 95, skipLine: 'Ладно, без фар. Но в туман — обязательно, F, запомни.',
        already: (c) => c.cab.lights, alreadyLine: 'Лес пошёл. Фары у тебя горят — правильно, в лесу сумрак.' },
      { id: 'look', at: (c) => c.p !== null && c.p > Vp + 50, line: 'Оглядывайся почаще: мышью — по сторонам, в зеркала, V — назад. Сзади лесовоз может догнать.',
        hint: ['Обзор — мышь (на телефоне — свайп). Назад — держи V.', 'V'], done: (c) => c.t > 5 || Math.abs(c.cab.lookYaw) > 0.6 || c.cab.lookBack },
      { id: 'wipers', at: (c) => c.p !== null && c.p > Vp + 100, line: 'Лужи пошли. Проедешь по луже — стекло забрызгает. Дворники — R.',
        hint: ['Дворники — R.', 'R'], done: (c) => c.cab.wipers, praise: 'Хорошо. Как отмоет — выключи, тем же R: стекло не царапай.',
        skip: (c) => c.p !== null && c.p > Hp - 140 },
      { id: 'wipers-off', at: () => true, line: '', done: (c) => !c.cab.wipers || c.t > 25, praise: '', skip: (c) => c.p !== null && c.p > Hp - 135 },
      { id: 'slow', at: (c) => c.p !== null && c.p > Hp - 130, line: 'Впереди низина, внизу грязь. Сбрось скорость — S. Под горку она сама разгонится.',
        hint: ['Тормоз — S. Перед грязью — до двадцати.', 'S'], done: (c) => c.kmh < 22, praise: 'Вот так.',
        nag: [5, 'Тормози, говорю! Влетишь в грязь — сядем.'], skip: (c) => c.p !== null && c.p > Hp - 55 },
      { id: '4wd', at: (c) => c.p !== null && c.p > Hp - 100, line: 'Передний мост — Z. Включай до грязи, а не когда уже сел.',
        hint: ['Передний мост — Z.', 'Z'], done: (c) => c.v.fourWD, already: (c) => c.v.fourWD, alreadyLine: 'Мост уже включил? Молодец, сам догадался.',
        skip: (c) => c.p !== null && c.p > Hp - 28, skipLine: 'Не успел с мостом? Ну, держись теперь.' },
      { id: 'low', at: () => true, line: 'И понижайку — X. На ней ползком, зато не встанешь.',
        hint: ['Понижающая передача — X.', 'X'], done: (c) => c.v.low, already: (c) => c.v.low, alreadyLine: '',
        skip: (c) => c.p !== null && c.p > Hp - 22 },
      { id: 'mud', at: (c) => c.p !== null && c.p > Hp - 32, line: 'Газ ровно, руль прямо, не дёргай. Пошла, пошла, родная…', done: (c) => c.p !== null && c.p > Hp + 40,
        praise: 'Выбрались! А ты говоришь — буханка.' },
      { id: 'low-off', at: () => true, line: 'Понижайку выключи — X: на ней далеко не уедешь, мотор замучаешь.',
        hint: ['Понижающая — X ещё раз.', 'X'], done: (c) => !c.v.low, already: (c) => !c.v.low, alreadyLine: '',
        nag: [10, 'Понижайку выключи, говорю, — X. Слышишь, как воет?'],
        skip: (c) => (c.p !== null && c.p > Hp + 170) || (c.rs !== null && c.rs < 115), skipLine: 'Так на понижайке и поползём? Ну, мотор твой теперь.' },
      { id: 'map', at: (c) => c.p !== null && c.p > Hp + 60, line: 'Глянь карту — M. Вон наш лес, вон Ключевск, синие точки — кому сегодня везти. Закроешь — M ещё раз.',
        hint: ['Карта — M (или Tab). Закрыть — M ещё раз.', 'M'], done: () => this.mapClosed, nag: [18, 'Карту, говорю, глянь — M. Пригодится.'],
        skip: (c) => c.rs !== null && c.rs < 110 },
      { id: 'gearbox', at: () => true, line: 'Передачи пока не трогай — первое время я за тебя переключать буду, на слух. Привыкнешь — G, и сам: Q — ниже, E — выше. Я всю жизнь сам.',
        hint: ['Ручная коробка — G; передачи — Q ниже, E выше.', 'G · Q · E'], done: (c) => c.t > 7 || this.acts.has('gearMode'), skip: (c) => c.rs !== null && c.rs < 95 },
      { id: 'radio', at: () => true, line: 'Радио — C, следующая песня — N, громкость — плюс и минус. Но меня сперва дослушай.',
        hint: ['Радио — C · песня — N · громкость — + и −.', 'C · N'], done: (c) => c.t > 6 || this.acts.has('tape') || this.acts.has('tapeNext'), skip: (c) => c.rs !== null && c.rs < 82 },
      { id: 'gauges', at: () => true, line: 'На приборы поглядывай: бензин и температура. Стрелка к красному — встань на ручник, долей воды. Канистра в кузове.',
        hint: ['Приборы — слева от руля: спидометр, бензин, температура, масло.', ''], done: (c) => c.t > 7, skip: (c) => c.rs !== null && c.rs < 80 },
      { id: 'tractor', at: () => true, line: 'Сядешь где совсем — Backspace: трактор вытащит на дорогу. Но это позор на весь район, так что лучше не надо.',
        hint: ['Застрял насовсем — Backspace (трактор).', 'Backspace'], done: (c) => c.t > 6, skip: (c) => c.rs !== null && c.rs < 78 },
      { id: 'help', at: () => true, line: 'Забудешь, что где, — F1. Устанешь — Esc, передохни. Дорога подождёт.',
        hint: ['Управление — F1 · пауза — Esc.', 'F1 · Esc'], done: (c) => c.t > 5, skip: (c) => c.rs !== null && c.rs < 76 },
      { id: 'stop', at: (c) => c.rs !== null && c.rs < 75, line: 'Сейчас выезд на асфальт. Перед дорогой — стоп. Глянь налево, направо: с элеватора грузовики летают.',
        hint: ['Остановись перед главной дорогой — S.', 'S'], done: (c) => c.kmh < 3 && c.rs !== null && c.rs < 32, praise: 'Чисто. Поехали.',
        skip: (c) => c.ms !== null, skipLine: 'Без остановки вылетел! Повезло. Дальше так не делай.' },
      { id: '4wd-off', at: () => true, line: 'На асфальте передний мост ни к чему — выключи, Z. Резину съест.',
        hint: ['Передний мост — Z ещё раз.', 'Z'], done: (c) => !c.v.fourWD, already: (c) => !c.v.fourWD, alreadyLine: '',
        // (not a hold-up: past the turn it gives way to the post, and a reminder comes later if need be)
        skip: (c) => c.ms !== null && c.ms < g.marks.home - 8 },
      { id: 'turn', at: () => true, line: () => `Теперь ${this.turnWord} — к посёлку. Руль плавно, газ потом.`,
        done: (c) => c.ms !== null && c.ms < g.marks.home - 12, already: (c) => c.ms !== null && c.ms < g.marks.home - 12, alreadyLine: '' },
      // the GAI post, just up the road: a word with an old acquaintance (the van is held to a crawl meanwhile)
      { id: 'gai-ask', at: (c) => c.ms !== null, line: () => `Притормози-ка у поста — к Кузьмину заедем, поздороваемся. Карман у будки — ${this.laybyWord}, за шлагбаумом. Встань там — и на ручник.`,
        hint: ['Пост ГАИ: встань в кармане у будки и затяни ручник.', 'S · Пробел'], enter: () => { this.assist = 25; },
        // stopped by the box: on the handbrake, or just standing a couple of seconds
        done: (c) => c.kmh < 1 && c.toPost < 45 && (c.v.handbrake || this.stillT > 2), onDone: () => { this.pulledIn = true; },
        skip: (c) => c.ms !== null && c.ms < this.world.gai.sPost - 70, skipLine: 'Проехал! Ну ладно — из Уфы ему позвоню, привет передам.' },
      // Kuzmin at the window (only if the van has pulled in): the grandfather keeps quiet meanwhile
      { id: 'gai-visit', at: () => true, line: '', already: () => !this.pulledIn, alreadyLine: '',
        enter: () => { this.visiting = !!this.hooks.visit?.(() => { this.visiting = false; }); },
        done: () => !this.visiting },
      { id: 'gai-after', at: () => true, line: 'Кузьмин мужик неплохой. Но денег ему не суй: один раз сунешь — всю жизнь платить будешь. Поехали, в посёлок.',
        already: () => !this.pulledIn, alreadyLine: 'Кузьмин мужик неплохой. Но денег ему не суй: один раз сунешь — всю жизнь платить будешь.',
        done: (c) => c.t > 4 },
      { id: 'road', at: (c) => c.ms !== null, line: 'На асфальте держись правее. Обгоняй, только где далеко видно, — и не на горке.', done: (c) => c.t > 6 },
      { id: 'door', at: (c) => c.toDoor < 90, line: 'Вон почта. Подъезжай к дверям, к Зинаиде, — метров двадцать, не дальше. Встал — ручник — два раза посигналил. Так у каждого адресата.',
        hint: ['У дверей почты: стоп · ручник (пробел) · два гудка (H, H).', 'Пробел · H'], done: () => this.atDoor },
    ];
    this.sights = [
      { id: 'town', at: (c) => c.ms !== null && c.ms < g.marks.town + 30 && c.ms > g.marks.town - 60, line: 'Ключевск. В посёлке — шестьдесят, а лучше сорок: дети, куры.' },
      { id: 'muha', at: (c) => c.ms !== null && c.ms < 150 && c.ms > 70, line: 'Вон Муха твой у магазина. Ты с ним, улым, поосторожнее. Дружба дружбой, а почта — казённая.' },
    ];
  }

  /** Which way out of the wood onto the main street for the post office: «направо» or «налево». */
  private get turnWord(): string {
    const g = this.ground, a = g.homeRoad.frame(12), b = g.homeRoad.frame(0);
    // the way he drives out (toward s = 0), and the main street's way toward the post office (s falling)
    const fx = b.x - a.x, fz = b.z - a.z;
    const m = g.main.frame(g.marks.home);
    const px = -m.tx, pz = -m.tz;
    // right of a heading (fx, fz) is (-fz, fx) in this world (see Police.vanPt)
    return px * -fz + pz * fx > 0 ? 'направо' : 'налево';
  }

  /** Which side of the road the post's lay-by is on, driving in toward town: «справа» or «слева». */
  private get laybyWord(): string {
    const g = this.ground, p = this.world.gai.post, f = g.main.frame(this.world.gai.sPost);
    // across the road from the way in (the main road's right, driving out of town, is its left driving in)
    const lat = (p.x - f.x) * f.rx + (p.z - f.z) * f.rz;
    return lat < 0 ? 'справа' : 'слева';
  }

  /** Queue a line; `step` ties a lesson's instruction to its lesson (it goes unsaid once the lesson is over). */
  private say(line: string, pri = 2, step = -1): void {
    if (!line) return;
    // a new lesson pushes out what was still to be said in passing
    if (pri >= 2) this.queue = this.queue.filter((q) => q.pri >= 2);
    this.queue.push({ line, pri, at: this.t, step });
    this.queue.sort((a, b) => b.pri - a.pri);
  }

  /** Lines whose moment has gone: an instruction for a lesson already over, or anything kept too long. */
  private stale(q: Queued): boolean {
    if (q.step >= 0) return q.step !== this.i;
    return this.t - q.at > KEEP[q.pri];
  }

  private on = false;
  /** In the yard, at the start (after the «на работу?» card). */
  start(): void { this.on = true; this.active = false; this.i = 0; }

  /** A control the player used (from the game's action handler). */
  action(a: string): void { this.acts.add(a); }

  update(dt: number, v: Vehicle): void {
    if (!this.on) return;
    this.t += dt;
    const g = this.ground, road = g.homeRoad, L = road.length;
    const cab = this.cab();
    const home = this.world.homePose, door = this.world.postDoor;
    const near = g.nearestRoad(v.x, v.z, 14);
    const onHome = near && near.sample.road === road && Math.abs(near.lat) < 8;
    const onMain = near && near.sample.road === g.main && Math.abs(near.lat) < 8;
    const fromHome = Math.hypot(v.x - home.x, v.z - home.z);
    const rs = onHome ? near!.s : null;
    const c: Ctx = {
      v, kmh: Math.abs(v.speedKmh), cab, t: this.stepT,
      rs, p: rs !== null ? L - rs : fromHome < 30 ? -1 : null, ms: onMain ? near!.s : null,
      toDoor: Math.hypot(v.x - door.x, v.z - door.z), fromHome,
      toPost: Math.hypot(v.x - this.world.gai.post.x, v.z - this.world.gai.post.z),
    };
    // the controls he watches for
    if (cab.horn && !this.hornWas) { this.horned = true; this.honks.push(this.t); }
    this.hornWas = cab.horn;
    this.honks = this.honks.filter((h) => this.t - h < 3);
    if (cab.map) this.mapSeen = true; else if (this.mapSeen) this.mapClosed = true;
    if (c.toDoor < 22 && c.kmh < 1 && v.handbrake && this.honks.length >= 2) this.atDoor = true;

    // the lessons, one at a time
    const st = this.steps[this.i];
    if (st) {
      if (!this.active) {
        if (st.at(c)) {
          this.active = true;
          this.stepT = 0;
          c.t = 0;
          if (st.already?.(c)) { const al = st.alreadyLine ?? ''; this.say(typeof al === 'string' ? al : al(c), 1); this.next(); }
          else {
            this.say(typeof st.line === 'string' ? st.line : st.line(c), 2, this.i);
            if (st.hint) this.hooks.hint(`ob-${st.id}`, st.hint[0], st.hint[1] || undefined);
            st.enter?.();
          }
        }
      } else {
        this.stepT += dt;
        // (no «вот так» for a lesson done before he had a chance to say what to do)
        if (st.done(c)) { st.onDone?.(); if (this.saidStep === this.i || !st.line) this.say(st.praise ?? '', 1); this.next(); }
        else if (st.skip?.(c)) { this.say(st.skipLine ?? '', 1); this.next(); }
        else if (st.nag && this.stepT > st.nag[0] && this.stepT - dt <= st.nag[0]) this.say(st.nag[1], 3);
      }
    }

    // the places on the way: said as they come, whatever the lesson
    for (const sg of this.sights) if (!this.seen.has(sg.id) && sg.at(c)) { this.seen.add(sg.id); this.say(sg.line, 2); }
    this.stillT = c.kmh < 0.5 ? this.stillT + dt : 0;
    // the front axle left in on the asphalt: a word, once (the lesson for it has given way to the post)
    this.axleT = c.ms !== null && v.fourWD ? this.axleT + dt : 0;
    if (!this.axleTold && this.axleT > 12 && !this.visiting) { this.axleTold = true; this.say('Мост-то передний так и не выключил — Z. На асфальте резину съест.', 3); }

    // the speed on each stretch: the yard, the village, the forest, the hollow, the town
    const limit = c.p !== null && c.p < 4 ? 15
      : rs !== null ? (rs > g.homeMarks.village ? 25 : Math.abs(rs - g.homeMarks.hollow) < 70 ? 22 : rs < 40 ? 30 : 45)
      : c.ms !== null ? 60 : 45;
    this.fastT = c.kmh > limit + 7 ? this.fastT + dt : 0;
    this.fastCool -= dt;
    if (this.fastT > 1.5 && this.fastCool <= 0) { this.say(SPEEDING[this.fastI++ % SPEEDING.length], 3); this.fastCool = 12; }
    // stuck: gas on, going nowhere
    const trying = v.throttle > 0.5 && c.kmh < 2 && v.engine === 'running' && !v.handbrake && c.p !== null && c.p > 4;
    this.stuckT = trying ? this.stuckT + dt : 0;
    this.stuckCool -= dt;
    if (this.stuckT > 3.5 && this.stuckCool <= 0) {
      this.say(!v.fourWD ? 'Буксуем. Передний мост — Z, и понижайку — X. Тогда пойдёт.'
        : 'Не газуй в пол. Назад чуть сдай — S, потом вперёд, раскачай. Совсем сели — Backspace, трактор вытащит.', 3);
      this.stuckCool = 15;
    }
    // the wrong way on the main street (away from the post office)
    if (!this.wrongTold && c.ms !== null && c.ms > g.marks.home + 45) { this.wrongTold = true; this.say('Не туда! Почта — в другую сторону, разворачивайся.', 3); }

    // say what is queued, one line at a time; in a quiet spell, the talk
    // (what has missed its moment is dropped; while Kuzmin is at the window, he holds his tongue)
    this.queue = this.queue.filter((q) => !this.stale(q));
    this.gap -= dt;
    // (a lesson waits less behind a line already said: the hint card shows it at once anyway)
    if (this.queue.length && !this.visiting && (this.gap <= 0 || (this.queue[0].pri >= 2 && this.gap <= this.gapFull * 0.5))) {
      const { line, step } = this.queue.shift()!;
      if (step >= 0) this.saidStep = step;
      this.hooks.say(KARTATAY, line);
      this.onSay?.(2 + line.length * 0.03);
      this.gapFull = this.gap = 1.6 + line.length * 0.026;
      this.idle = 0;
      this.log?.(this.t, line);
    } else if (!this.queue.length) this.idle += dt;
    // (nothing in passing while Kuzmin is at the window)
    const waiting = (!this.active || !st?.hint) && !this.visiting;
    if (this.idle > 7 && waiting && this.talkI < TALK.length && (c.p !== null ? c.p > 10 : c.ms !== null)) { this.say(TALK[this.talkI++], 0); this.idle = 0; }
  }

  private next(): void {
    const st = this.steps[this.i];
    if (st) this.hooks.clearHint(`ob-${st.id}`);
    this.assist = null;
    this.i++;
    this.active = false;
  }

  /** At the door: the lesson is over; he gets out to wait for the Ufa bus. */
  arrive(): void {
    this.queue.length = 0;
    this.hooks.clearHint('ob-door');
    this.hooks.say(KARTATAY, 'Вот так. Запомнил? Ну всё, улым, приехали. Помоги деду вылезти — ноги совсем не те.');
    this.onSay?.(5);
  }
}
