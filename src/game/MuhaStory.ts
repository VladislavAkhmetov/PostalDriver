import { clamp } from '../core/math';
import type { Police } from '../world/Police';
import type { Stop, World } from '../world/World';
import type { Vehicle } from '../vehicle/Vehicle';
import { destTo, type Order } from './Career';
import type { Mission } from './Mission';

/**
 * Muha's story, chapter one (docs/design.md, «Муха»): Zhenka, Timur's best friend from before the
 * army, hangs about by the shop in Klyuchevsk next to a tinted saloon and works for "a serious man"
 * in the district town. Told the way the rest of the game is, from the cab: cards with answers when
 * the van stops by him, a line of chatter, a fade to black — no cutscenes.
 *
 *  1. `meet`  — he waves the van down: "alive, demobbed!", a bit of bragging, "drop by, I've a job".
 *  2. `ask`   — another day: a box taped shut for Seryi in a village on today's route; cash up front.
 *     With it in the back the post checks papers more often, and at the window the sergeant asks
 *     what's in it: the truth, a lie or "no idea" — it is opened either way (blocks of cigarettes with
 *     no excise stamps), seized, and the fine depends on what was said. Or it gets through, and Seryi
 *     adds his share at the door.
 *  3. `after` — next time by the shop Muha has heard how it went, and says so.
 *
 * Chapter two, «разборки у лесопилки»:
 *  4. `saw`   — a couple of days on, a day whose route goes past the sawmill in the forest: Lysyi's
 *     people and the Zarechye lot are settling whose it is, two cars stand across the track and the
 *     cassette thumps through the trees. Muha, by the shop that morning, warns him off if the van
 *     stops ("go round by the forestry"); at the block a man in a leather jacket sends him back.
 *     The way round is the forestry ring. Tension and sound only — nobody lays a finger on anyone.
 *  5. `after2` — next time by the shop: Muha knows whether the van went near, and what was said.
 *
 * Chapter three, «Муху прижали»:
 *  6. `pressed` — some days on, Lysyi's people have "had a word" with him: no car, no jacket, a
 *     cracked rib. He sits by the last house before the fork, on every route. Stopped for, he asks
 *     to be hidden or seen to: the hospital in Klyuchevsk (әсәй is on her shift), Stepanych's farm,
 *     or the sergeant at the post — or Timur has the post to do. Driven past, that is an answer too.
 *  7. `after3` — the next morning, a word of how he is (from әсәй, the postmistress, the shop).
 * Chapter four, the end of it:
 *  8. `finale` — by what was chosen and how things stand: he has quit Lysyi (back by the shop
 *     without the car — «весной грузчиком на почту»), he has gone north on a shift (a letter under
 *     the wiper), or «сказали, сел» (the shop's girl on the step). Then `end`.
 *
 * The story does not wait for ever, nor does it vanish: a scene by the shop that Timur drives past
 * counts a missed day. After two, Muha leaves a note under the wiper; after four the scene closes on
 * its own with what would have happened anyway (he took the box to someone else, he took offence),
 * and the story moves on.
 *
 * The state moves on in a working copy and is kept only when the day is over (`state`), so a day
 * restarted from the pause menu plays the same again.
 */
export type MuhaStep = 'meet' | 'ask' | 'after' | 'saw' | 'after2' | 'pressed' | 'after3' | 'finale' | 'end' | 'wait';
export interface MuhaState {
  step: MuhaStep;
  /** The working day the last scene was played on: the next one waits for another day. */
  day: number;
  /** How things stand between the two of them, about −3…+3. */
  bond: number;
  outcome?: 'delivered' | 'seized' | 'refused';
  /** Chapter two: never went near the sawmill / saw the block and went round / stopped and talked / asked what was up. */
  saw?: 'away' | 'detour' | 'talked' | 'asked';
  /** Chapter two: Muha warned him off at the shop that morning. */
  warned?: boolean;
  /** Working days in a row a scene by the shop waited and the van drove past. */
  missed?: number;
  /** Chapter three: where Timur took him, or that he didn't. */
  pressed?: 'hospital' | 'hid' | 'police' | 'left' | 'passed';
  /** Chapter four: how it ended. */
  ending?: 'quit' | 'north' | 'jailed';
}

export interface StoryHooks {
  choice(speaker: string, line: string, options: string[], pick: (i: number) => void): void;
  closeChoice(): void;
  choiceOpen(): boolean;
  say(speaker: string, line: string): void;
  hint(id: string, text: string, keys?: string): void;
  toast(text: string): void;
  blackout(title: string, text: string, seconds: number, mid: () => void, done: () => void, stamp: string): void;
  /** A fine written out at the check, as the police would. */
  fine(amount: number, note: string): void;
  /** The cassette at the sawmill, 0…1 by distance (every frame). */
  boom(level: number): void;
  /** A man shouting out there, too far for the words. */
  shout(level: number): void;
  /** A car door slammed. */
  slam(level: number): void;
}

const MUHA = 'Женька Муха';
/** Notes under the wiper when a scene by the shop has waited two days. */
const NOTES: Partial<Record<MuhaStep, string>> = {
  meet: 'Под дворником записка: «Тимурка, ты чё, загордился? Заедь к магазину, я там. Женя».',
  ask: 'Под дворником записка: «Дело стоит. Тормозни у магазина. Ж.»',
  after: 'Под дворником записка: «Заедь, поговорить надо. Ж.»',
  saw: 'Под дворником записка, торопливым почерком: «Тормозни у магазина, срочно. Ж.»',
  after2: 'Под дворником записка: «Заскочи к магазину. Ж.»',
  finale: 'Под дворником записка: «Заедь к магазину, разговор есть. Без машины я теперь, пешком. Ж.»',
};
/** Working days from the sawmill's aftermath to chapter three, and from chapter three's morning to the end. */
const PRESS_GAP = 3, FINALE_GAP = 3;
/** Where he sits on the day he was "talked to": by the last house before the fork, on every route. */
const PRESS_BEFORE_FORK = 170;
/** The next morning: how he is, by who has him. */
const AFTER3: Record<NonNullable<MuhaState['pressed']>, string> = {
  hospital: 'Әсәй вечером, за чаем: «Женю твоего подлатали — два ребра. Лежит, молчит. Какие-то приходили — я их не пустила. Он про тебя спрашивал».',
  hid: 'Зинаида Павловна, утром: «Степаныч звонил с хутора. Говорит, гость сидит тихо и ест за двоих. Какой ещё гость, Тимур?»',
  police: 'Зинаида Павловна, утром: «Кузьмин заходил. Твой Мухин, говорит, бумагу подписал — на Лысого. Ты, Тимур, осторожнее теперь по району».',
  left: 'У магазина говорят: Муху избили, и он пропал. Мать его по деревням ищет.',
  passed: 'У магазина говорят: Муху избили, и он пропал. Будто сидел у дороги перед развилкой — да никто не остановился.',
};
/** Talk in the cab on the way, Muha hurting. */
const RIDE: string[] = [
  'Не гони, а… На ямах больно.',
  'Я ж думал — свои. Лысый говорил: «Мы семья». Ага. Семья.',
  'Ты это… маме своей не говори, кто меня так. Хотя она сама поймёт.',
  'Помнишь, в седьмом классе с горки на велике? Тоже рёбра. Только тогда смешно было.',
];
const SERYI = 'Серый';
const KUZMIN = 'Сержант Кузьмин, ГАИ';
const BOX = 'muha-box';
const GUY = 'Парень в кожанке';
/** Working days between the end of chapter one and the sawmill. */
const SAW_GAP = 2;
/** Missed days before a note under the wiper, and before the scene closes on its own. */
const NOTE_AFTER = 2, GIVE_UP_AFTER = 4;
/** From this close, stopped, the van is by him. */
const NEAR = 13;

export class MuhaStory {
  private s: MuhaState;
  private still = 0;
  private busy = false;
  private hinted = false;
  /** The box is in the back today. */
  private carrying = false;
  private dest: Stop | null = null;
  /** The sergeant's question about the box is on screen. */
  private inspecting = false;
  // ---- chapter two, the day at the sawmill
  /** Today the track is shut at the sawmill. */
  private readonly sawToday: boolean;
  /** Muha's warning at the shop has been played today. */
  private warnedNow = false;
  /** The van came close enough to see the block. */
  private seen = false;
  /** The answer given to the man at the block, −1 for none yet. */
  private talk = -1;
  private talking = false;
  private toldTwice = false;
  private blockStill = 0;
  private shoutT = 1;
  private slammed = false;
  private hintedSide = { near: false, far: false };
  /** A note under the wiper, read once the day is under way. */
  private note: string | null = null;
  private noteT = 0;
  // ---- chapter three, the day he is found by the road
  private readonly pressedToday: boolean;
  private pressOut: MuhaState['pressed'] | undefined;
  private pressHinted = false;
  private riding: { pos: { x: number; z: number }; speaker: string; line: string; out: NonNullable<MuhaState['pressed']>; bond: number } | null = null;
  private rideT = 8;
  private rideI = 0;
  private arriveT = 0;
  /** «Сказали, сел»: told by the shop when the van comes by. */
  private shopNews: string | null = null;

  constructor(private world: World, private mission: Mission, private police: Police, private hooks: StoryHooks, private day: number, saved?: MuhaState) {
    this.s = saved ? { ...saved } : { step: 'meet', day: 0, bond: 0 };
    // saves from before chapter two ended chapter one in `wait`
    if (this.s.step === 'wait' && !this.s.saw) this.s.step = 'saw';
    // …and saves from before chapter three ended chapter two in `wait`
    if (this.s.step === 'wait' && this.s.saw) this.s.step = 'pressed';
    police.checkOdds = 0.3;
    // the morning after chapter three: a word of him, and how it is going to end
    if (this.s.step === 'after3' && day > this.s.day) {
      this.note = AFTER3[this.s.pressed ?? 'passed'];
      this.s.ending = this.ending();
      this.s.step = 'finale';
      this.s.day = day;
    }
    // the end that needs no meeting comes by itself
    if (this.s.step === 'finale' && this.s.ending !== 'quit' && day >= this.s.day + FINALE_GAP) {
      if (this.s.ending === 'north') this.note = 'Под дворником письмо, сложенное треугольником: «Тимур, я на вахту, в Сургут. Лысому туда не достать. Мамке скажи — живой, пишу. Спасибо за всё. Женя».';
      else this.shopNews = 'У магазина пусто — ни Мухи, ни тачки. Продавщица курит на крыльце: «Женьку-то забрали. Говорят, сел — за ту коробку и ещё за что-то. Мать третий день плачет».';
      this.s.step = 'end';
      this.s.day = day;
    }
    const missed = this.s.missed ?? 0;
    if (missed >= GIVE_UP_AFTER) this.giveUp();
    else if (missed >= NOTE_AFTER && this.due) this.note = NOTES[this.s.step] ?? null;
    // the block stands only on a day whose route goes past it
    const block = world.sawmill;
    this.sawToday = this.s.step === 'saw' && day >= this.s.day + SAW_GAP && mission.stops.some((st) => st.s > block.s + 20);
    block.setOn(this.sawToday);
    // where he is today: by the shop with his saloon; by the road with nothing; or nowhere to be seen
    this.pressedToday = this.s.step === 'pressed' && day >= this.s.day + PRESS_GAP;
    const after = ['after3', 'finale', 'end'].includes(this.s.step);
    world.setMuhaCar(!this.pressedToday && !after);
    if (this.pressedToday) {
      const m = world.ground.marks, s = m.junction - PRESS_BEFORE_FORK;
      world.placeMuha(world.roadside(s, -(world.ground.main.zoneAt(s).width / 2 + 2.8)));
    } else if (after) {
      // quit and mended, he is back by the shop on foot — not before chapter four's day
      const back = this.s.ending === 'quit' && (this.s.step === 'end' || (this.s.step === 'finale' && day >= this.s.day + FINALE_GAP));
      world.placeMuha(back ? null : 'away');
    }
    else world.placeMuha(null);
  }

  /** He is in the cab: the day isn't over until he is out. */
  get aboard(): boolean { return this.riding !== null; }

  /** How chapter four goes, by chapter three and how things stand between them. */
  private ending(): NonNullable<MuhaState['ending']> {
    const b = this.s.bond, p = this.s.pressed ?? 'passed';
    if (p === 'left' || p === 'passed') return b >= 2 ? 'north' : 'jailed';
    if (p === 'police') return b >= -1 ? 'quit' : 'north';
    if (p === 'hospital') return b >= 0 ? 'quit' : 'north';
    return b >= 1 ? 'quit' : b >= -1 ? 'north' : 'jailed';
  }

  /** Today the story has the road (the sawmill's block): other set pieces keep off it. */
  get busyToday(): boolean { return this.sawToday || this.pressedToday; }

  /** What to keep at the end of the day. */
  get state(): MuhaState {
    // a scene still waiting at the day's end is a day missed
    if (this.pressedToday) return { ...this.s, step: 'after3', day: this.day, pressed: this.pressOut ?? 'passed', missed: 0 };
    if (!this.sawToday) return { ...this.s, missed: this.due ? (this.s.missed ?? 0) + 1 : 0 };
    const saw = this.talk === 2 ? 'asked' : this.talk >= 0 ? 'talked' : this.seen ? 'detour' : 'away';
    return { ...this.s, step: 'after2', day: this.day, saw, missed: 0 };
  }

  /** Driven past too often: the scene closes the way it would have gone without him, and the story moves on. */
  private giveUp(): void {
    const s = this.s;
    s.missed = 0;
    // the next scene is due today, as if the last one had been yesterday
    s.day = this.day - 1;
    const bond = (d: number) => { s.bond = Math.max(-3, Math.min(3, s.bond + d)); };
    if (s.step === 'meet') {
      s.step = 'ask'; bond(-1);
      this.note = 'Говорят, Муха обиделся: «Мимо ездит, не здоровается, дембель». Он всё там же, у магазина.';
    } else if (s.step === 'ask') {
      s.step = 'after'; s.outcome = 'refused'; bond(-1);
      this.note = 'Под дворником записка: «Коробку Витька отвёз. Ладно, без обид. Почти. Ж.»';
    } else if (s.step === 'after') {
      s.step = 'saw';
    } else if (s.step === 'after2') {
      s.step = 'pressed'; bond(-1);
    } else if (s.step === 'finale') {
      s.step = 'end';
    }
  }

  /** Whether today has a scene waiting by the shop. */
  private get due(): boolean {
    const st = this.s.step;
    if (st === 'wait' || st === 'end' || st === 'after3') return false;
    if (st === 'pressed') return this.pressedToday && !this.pressOut;
    if (st === 'finale') return this.s.ending === 'quit' && this.day >= this.s.day + FINALE_GAP;
    // the warning makes no sense once the van has been to the sawmill already
    if (this.s.step === 'saw') return this.sawToday && !this.warnedNow && !this.seen;
    return this.s.step === 'meet' || this.day > this.s.day;
  }

  update(dt: number, v: Vehicle): void {
    const muha = this.world.muha;
    if (!muha) return;
    // a box in the back and a patrol that caught the van: it goes with the rest at the station
    if (this.carrying && this.police.state === 'arrest') {
      this.seize();
      this.hooks.toast('При задержании коробку Мухи изъяли');
    }
    // drove off with the question still open: that is a chase now, the box still in the back
    if (this.inspecting && this.police.state !== 'talk') { this.inspecting = false; this.hooks.closeChoice(); }
    if (this.sawToday) this.atSawmill(dt, v);
    if (this.riding) this.ride(dt, v);
    if (this.shopNews) {
      const sp = this.world.muhaCar.group.position;
      if (Math.hypot(sp.x - v.x, sp.z - v.z) < 45) { this.hooks.hint('muha-news', this.shopNews); this.shopNews = null; }
    }
    // chapter three: drove on past him by the road
    if (this.pressedToday && !this.pressOut && !this.busy) {
      const p = muha.group.position, g = this.world.ground;
      if (!this.pressHinted && Math.hypot(p.x - v.x, p.z - v.z) < 130) {
        this.pressHinted = true;
        this.hooks.hint('muha-pressed', 'У крайнего дома перед развилкой на лавке сидит парень — согнувшись, без куртки. Да это же Муха! Притормози.');
      }
      if (g.main.nearestS(v.x, v.z) > g.marks.junction - PRESS_BEFORE_FORK + 60 && Math.hypot(p.x - v.x, p.z - v.z) > 60) {
        this.pressOut = 'passed';
        this.hooks.hint('muha-passed', 'В зеркале — Муха поднял руку и опустил.');
      }
    }
    // the note under the wiper, once the van is on its way
    if (this.note) {
      this.noteT += dt;
      if (this.noteT > 7 && !this.hooks.choiceOpen()) { this.hooks.hint('muha-note', this.note); this.note = null; }
    }
    if (!this.due || this.busy) return;
    const p = muha.group.position;
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    const kmh = Math.abs(v.speedKmh);
    if (d < 70 && d > NEAR) {
      // he has seen the van: an arm up now and then
      if (muha.wave <= 0 && Math.random() < dt * 0.6) muha.wave = 1.6;
      if (!this.hinted) {
        this.hinted = true;
        if (this.s.step !== 'pressed') this.hooks.hint('muha', this.s.step === 'meet'
          ? 'У магазина машет парень у тонированной легковушки — да это же Женька Муха! Притормози рядом.'
          : this.s.step === 'saw'
            ? 'Муха у магазина машет тебе — и как-то без улыбки. Остановись.'
            : this.s.step === 'finale'
              ? 'Муха у магазина — пешком, без машины. Машет тебе.'
              : 'Муха у магазина машет тебе. Остановись, если хочешь поговорить.');
      }
    }
    this.still = d < NEAR && kmh < 3 ? this.still + dt : 0;
    if (this.still > 0.7 && !this.hooks.choiceOpen()) {
      this.still = 0;
      this.busy = true;
      if (this.s.step === 'meet') this.meet();
      else if (this.s.step === 'ask') this.ask();
      else if (this.s.step === 'after') this.after();
      else if (this.s.step === 'saw') this.warn();
      else if (this.s.step === 'pressed') this.pressed();
      else if (this.s.step === 'finale') this.finale();
      else this.after2();
    }
  }

  private done(next: MuhaStep, bond = 0): void {
    this.s.step = next;
    this.s.day = this.day;
    this.s.bond = Math.max(-3, Math.min(3, this.s.bond + bond));
    this.busy = false;
  }

  // ------------------------------------------------------------ 1. the meeting

  private meet(): void {
    const h = this.hooks;
    h.choice(MUHA, 'Тимурка?! Живой! Дембель! А чего на почтовой буханке — картатай пристроил?', ['Здорово, Жень! Сам-то как?', 'Работаю. Некогда, Жень'], (i) => {
      if (i === 1) {
        h.say(MUHA, 'Ну работай, работай, почтальон. Заезжай как-нибудь — дело есть. Лёгкое. Почта ж везде ездит.');
        this.done('ask');
        return;
      }
      h.choice(MUHA, 'Я? Кручусь. При деле теперь — у одного серьёзного человека в райцентре. Видал тачку? Своя.', ['Откуда деньги-то, Жень?', 'Красивая. Поздравляю'], (j) => {
        h.say(MUHA, j === 0
          ? 'Много будешь знать — скоро состаришься. Ладно, свои люди. Заезжай как-нибудь — дело есть, лёгкое. Почта ж везде ездит.'
          : 'То-то! Слушай, заезжай как-нибудь — дело есть, лёгкое. Почта ж везде ездит. Бывай, дембель!');
        this.done('ask', 1);
      });
    });
  }

  // ------------------------------------------------------------ 2. the box

  /** Where the box goes: Zarechye if the route goes there today, else the farthest stop. */
  private target(): Stop | null {
    const st = this.mission.stops;
    return st.find((s) => s.id === 'zarechye' && !s.done) ?? [...st].reverse().find((s) => !s.done) ?? null;
  }

  private ask(): void {
    const h = this.hooks;
    const dest = this.target();
    // nowhere to take it today (every stop done already): he'll ask another day
    if (!dest) { this.hooks.say(MUHA, 'О, ты уже всё развёз? Ладно, в другой раз — дело есть.'); return; }
    const to = destTo(dest.id, 'acc');
    const take = () => {
      this.dest = dest;
      this.carrying = true;
      // a box with no line in the waybill: the post looks closer at vans that carry such things
      this.police.checkOdds = 0.75;
      const o: Order = { id: BOX, dest: dest.id, kind: 'parcel', title: 'Коробка от Мухи', note: 'замотана скотчем, не по ведомости', pay: 30000, fragile: false, due: null, from: 'Муха' };
      this.mission.addOrder(o);
      this.mission.extra('Муха · задаток за коробку', 50000, 0);
      h.say(MUHA, 'Красавчик! Пятьдесят — держи, остальное Серый отдаст. Только у поста ГАИ не гони, лишний раз не светись.');
      h.toast(`В кузове: коробка от Мухи → ${dest.name}`);
      this.done('after');
    };
    const refuse = () => {
      this.s.outcome = 'refused';
      h.say(MUHA, 'Ну смотри. Я-то думал, свой пацан… Ладно, бывай, почтальон.');
      this.done('after', -1);
    };
    h.choice(MUHA, `Тимур, выручи. Коробку надо ${to} закинуть, Серому — он тебя сам найдёт. Пятьдесят тысяч сразу, и он ещё сверху добавит. Тебе ж по пути.`,
      ['Что внутри?', 'Давай, отвезу', 'Не, Жень. Почта — не такси для коробок'], (i) => {
        if (i === 1) take();
        else if (i === 2) refuse();
        else h.choice(MUHA, 'Запчасти. Ну… почти запчасти. Не бойся, не взрывается. Скотч только не трогай.', ['Ладно, давай', 'Нет, без меня'], (j) => (j === 0 ? take() : refuse()));
      });
  }

  /** The van has handed over at `stop`: Seryi is there for the box. */
  delivered(stop: Stop): void {
    if (!this.carrying || stop !== this.dest || !this.mission.handedOver(BOX)) return;
    this.carrying = false;
    this.police.checkOdds = 0.3;
    this.s.outcome = 'delivered';
    setTimeout(() => this.hooks.say(SERYI, 'От Мухи? Давай сюда. Не открывал? Правильно. Держи сверху — и забудь, что видел.'), 3200);
  }

  private seize(): void {
    this.carrying = false;
    this.police.checkOdds = 0.3;
    this.s.outcome = 'seized';
    this.mission.drop(BOX);
  }

  /** The sergeant at the window, the papers done: the box. Returns false when there is nothing to find. */
  inspect(reason: 'speed' | 'check' | 'flee', done: () => void): boolean {
    if (!this.carrying) return false;
    // stopped for speed the sergeant only glances in the back now and then; for papers, always
    if (reason === 'speed' && Math.random() < 0.5) return false;
    const h = this.hooks;
    const open = (line: string, fine: number, note: string, trust: number) => {
      h.blackout('Досмотр', 'Скотч, картон, газета «Труд»… Внутри — блоки сигарет. Двадцать штук, и ни на одном акцизной марки.', 2.6, () => {
        this.seize();
      }, () => {
        h.say(KUZMIN, line);
        h.fine(fine, note);
        if (trust) this.mission.extra('Начальнице сообщили о досмотре', 0, trust);
        done();
      }, 'Изъято');
    };
    this.inspecting = true;
    h.choice(KUZMIN, 'А это что за коробка у вас в кузове? В путевом листе такой нет.', ['Знакомый попросил передать', 'Посылка, по ведомости', 'Не знаю, подкинули'], (i) => {
      this.inspecting = false;
      if (i === 0) {
        h.say(KUZMIN, 'Знакомый, значит. Ну, открываем.');
        setTimeout(() => open('Коробку изымаю, протокол — штраф сто тысяч. А знакомому своему передай: Кузьмин его знает. И тачку его тоже.', 100000, 'груз без документов', 0), 1600);
      } else if (i === 1) {
        h.say(KUZMIN, 'По ведомости, говоришь? Ведомость — вот она. Открывай.');
        setTimeout(() => open('Ещё и врёт в глаза. Изъятие, штраф двести тысяч, и начальнице твоей позвоню — пусть знает, что у неё по району возят.', 200000, 'груз без документов, ложные показания', -5), 1600);
      } else {
        h.say(KUZMIN, 'Подкинули ему… Сам и открывай.');
        setTimeout(() => open('Сто тысяч штраф, коробка — в отдел. В следующий раз, почта, смотри, что тебе «подкидывают».', 100000, 'груз без документов', 0), 1600);
      }
    });
    return true;
  }

  // ------------------------------------------------------------ 3. the day after

  private after(): void {
    const h = this.hooks;
    const o = this.s.outcome;
    if (o === 'delivered') {
      h.say(MUHA, 'Ну ты красава! Серый доволен, Лысый тоже. Говорил же — ерунда. Будет ещё что — свистну.');
      this.done('saw', 1);
    } else if (o === 'seized') {
      h.choice(MUHA, 'Ты чё, коробку ментам отдал?! Это ж не моя, это Лысого… Мне теперь за неё отвечать.', ['Жень, во что ты ввязался?', 'Сам виноват — не надо было'], (i) => {
        h.say(MUHA, i === 0 ? 'Не лезь, Тимур. Я сам разберусь. Правда — сам.' : 'Нормально. Я запомню, почтальон.');
        this.done('saw', i === 0 ? 0 : -1);
      });
    } else {
      h.say(MUHA, 'Ну что, почтальон, не передумал? Да ладно, без обид. Витька с лесопилки отвёз — и ничего, живой.');
      this.done('saw');
    }
  }

  // ------------------------------------------------------------ 4. the sawmill

  /** By the shop that morning: don't go past the sawmill today. */
  private warn(): void {
    const h = this.hooks;
    this.warnedNow = true;
    h.choice(MUHA, 'Тимур, стой. Ты сегодня через лес, за реку? Слушай сюда: мимо пилорамы не езди. Там сегодня… разговор. У Лысого с заречными — кто лесопилку держит.',
      ['Какой ещё разговор, Жень?', 'Понял. Объеду через лесничество'], (i) => {
        this.s.warned = true;
        if (i === 1) {
          h.say(MUHA, 'Красава. Кольцом, мимо лесника, — и за пилорамой опять на дорогу выскочишь. И ты меня не слышал.');
          this.busy = false;
          return;
        }
        h.choice(MUHA, 'Обычный. Мужики поговорят и разъедутся. Наверное. Тебе там делать нечего — почта, газеты, бабки с пенсией. Через лесничество, понял?',
          ['А ты сам там будешь?', 'Ладно, понял'], (j) => {
            h.say(MUHA, j === 0
              ? 'Я? Я тут, у магазина. Меня на такое не зовут. Пока. Всё, давай, езжай. И ты меня не слышал.'
              : 'Вот и хорошо. Через лесничество. И ты меня не слышал.');
            this.busy = false;
          });
      });
  }

  /** The block itself: music through the trees, voices, a door, and a man who sends the van back. */
  private atSawmill(dt: number, v: Vehicle): void {
    const h = this.hooks;
    const b = this.world.sawmill;
    const d = Math.hypot(b.pos.x - v.x, b.pos.z - v.z);
    const kmh = Math.abs(v.speedKmh);
    h.boom(clamp(1 - d / 280, 0, 1) ** 1.6);
    if (d < 170) this.seen = true;
    if (d < 210) {
      // which way the van comes from: the turn back to the forestry ring is behind it either way
      const f = this.world.ground.main.frame(b.s);
      const near = (v.x - b.pos.x) * f.tx + (v.z - b.pos.z) * f.tz < 0;
      const side = near ? 'near' : 'far';
      if (!this.hintedSide[side]) {
        this.hintedSide[side] = true;
        const turn = near ? 'поворот назад, сразу за Сосновкой' : 'поворот назад, перед низиной';
        h.hint(`sawmill-${side}`, this.s.warned
          ? `Вот она, пилорама. Муха не шутил: поперёк дороги две машины, у ворот мужики в кожанках, кассета бухает на весь лес. Объезд — кольцом через лесничество: ${turn}.`
          : `Впереди, у пилорамы, поперёк дороги — две машины. Мужики в кожанках, музыка на весь лес. Дорога перекрыта. Объезд — кольцом через лесничество: ${turn}.`);
      }
    }
    // voices over the music now and then; a door slams as the van comes up
    if (d < 150) {
      this.shoutT -= dt;
      if (this.shoutT <= 0) { this.shoutT = 2.5 + Math.random() * 5; h.shout(clamp(1 - d / 150, 0.15, 1)); }
      if (d < 70 && !this.slammed) { this.slammed = true; h.slam(0.7); }
    }
    // drove off with the question still open
    if (this.talking && d > 40) { this.talking = false; h.closeChoice(); }
    this.blockStill = d < 30 && kmh < 3 ? this.blockStill + dt : 0;
    if (this.talk < 0 && !this.talking && this.blockStill > 1 && !h.choiceOpen()) {
      this.talking = true;
      h.choice(GUY, 'Э, почта! Куда прёшь? Закрыто. Разворачивай свою буханку.', ['Мне дальше, почту везу', 'Понял, разворачиваюсь', 'Мужики, а что случилось-то?'], (i) => {
        this.talking = false;
        this.talk = i;
        this.blockStill = 0;
        h.say(GUY, i === 0
          ? 'Почту он везёт… Через лесничество объедешь, не маленький. Давай-давай, не стой тут.'
          : i === 1
            ? 'Вот и молодец. Шустрее.'
            : 'Лес пилим. Не видно? Езжай, почтальон, пока колёса целы. И нас ты тут не видел.');
      });
    }
    // still standing there after being told
    if (this.talk >= 0 && !this.toldTwice && this.blockStill > 14) {
      this.toldTwice = true;
      h.slam(1);
      h.say(GUY, 'Я непонятно сказал? Разворачивай, почта. По-хорошему.');
    }
  }

  // ------------------------------------------------------------ 5. the day after the sawmill

  private after2(): void {
    const h = this.hooks;
    const o = this.s.saw, warned = this.s.warned;
    const end = (bond: number) => this.done('pressed', bond);
    if (o === 'asked') {
      h.choice(MUHA, 'Ты ещё и спрашивать к ним полез — «что случилось»?! Тимур, ты дурак? Лысый меня вчера полчаса пытал, что за почта такая любопытная.',
        ['Жень, уходи ты от них', 'Сам разберусь, Жень'], (i) => {
          h.say(MUHA, i === 0 ? 'Куда я уйду? На почту, газеты таскать? …Ладно. Подумаю. Только не лезь туда больше, а.' : 'Ну разбирайся. Только потом не говори, что я не предупреждал.');
          end(i === 0 ? 1 : -1);
        });
    } else if (o === 'talked') {
      h.choice(MUHA, `${warned ? 'Я ж тебе говорил — не езди мимо пилорамы! ' : ''}Ты чё к ним подъехал-то? Мне Лысый вечером: «Чья это почта у лесопилки крутилась?» Я сказал — моя, свой пацан, не трогай.`,
        ['Спасибо, Жень', 'Я на работе был. Дорога общая'], (i) => {
          h.say(MUHA, i === 0 ? 'Да ладно, свои же. Разъехались там, кстати, без всего — покричали и разъехались. Пилорама теперь Лысого.' : 'Общая… Была общая. Теперь всё чьё-то. Ладно, проехали.');
          end(i === 0 ? 1 : 0);
        });
    } else if (o === 'detour') {
      h.choice(MUHA, warned
        ? 'Ну что, объехал? Молодец, что послушал. Разъехались там без всего — покричали и разъехались. Пилорама теперь Лысого.'
        : 'Слыхал, ты вчера к пилораме подъезжал — пацаны буханку видели. Хорошо, что развернулся. Я тебя утром предупредить хотел, а ты мимо пролетел.',
      ['Жень, а ты там был?', 'Мне-то что, я почту вожу'], (i) => {
        h.say(MUHA, i === 0
          ? 'Был. Позвали всё-таки, под конец. Стоял у машины, как дурак. Витьку жалко — он там двадцать лет пилил, а теперь «под Лысым». Ладно, не бери в голову.'
          : 'Во-во. Вози. Так спокойнее. Мне б так.');
        end(i === 0 ? 1 : 0);
      });
    } else {
      h.say(MUHA, 'Вчера у пилорамы шумно было. Хорошо, что ты туда не сунулся. Пилорама теперь Лысого — вот так, Тимур.');
      end(0);
    }
  }

  // ------------------------------------------------------------ 6. pressed

  private pressed(): void {
    const h = this.hooks;
    const g = this.world;
    const box = this.s.outcome === 'seized' ? ' За коробку, за пилораму — за всё сразу.' : '';
    h.choice(MUHA, `Тимур… Тормозни, а. Лысый своих прислал — поговорить. Поговорили.${box} Машину забрали, куртку тоже. Ребро, кажись… Мне бы спрятаться где. Или к врачу.`,
      ['В больницу. Мама сегодня на смене', 'Спрячу у Степаныча на хуторе', 'Поехали к Кузьмину — пусть разбирается', 'Жень, у меня почта. Не могу'], (i) => {
        if (i === 3) {
          h.say(MUHA, 'Понял. Иди, почтальон, работай. Я сам как-нибудь.');
          this.pressOut = 'left';
          this.s.bond = Math.max(-3, this.s.bond - 2);
          this.busy = false;
          return;
        }
        const khutor = g.stops.find((st) => st.id === 'khutor');
        const dests = [
          { pos: g.hospital.pos, speaker: 'Гульнара, әсәй', out: 'hospital' as const, bond: 1,
            line: 'Женя?! Господи, что с лицом… Заводи, заводи его. Рентген, потом в палату. Тимур, езжай работай — я сама. Вечером поговорим.' },
          { pos: khutor ? khutor.pos : g.hospital.pos, speaker: 'Василий Степанович, хутор Берёзки', out: 'hid' as const, bond: 1,
            line: 'Пусть в сарае отлежится. Сено есть, молоко есть, собака злая. Я никого не видел — я вообще глухой.' },
          { pos: g.gai.post, speaker: KUZMIN, out: 'police' as const, bond: -1,
            line: 'Ну-ка, ну-ка… Мухин. Заявление писать будешь? Будешь. А ты, почта, свободен. Езжай.' },
        ];
        this.riding = dests[i];
        this.rideT = 6; this.rideI = 0; this.arriveT = 0;
        g.placeMuha('away');
        h.say(MUHA, i === 2 ? 'К ментам?.. Ладно. Может, так и надо. Поехали.' : 'Спасибо, Тимур… Поехали. Только не по ямам.');
        h.toast(i === 0 ? 'Муха в кабине · в райбольницу, Ключевск' : i === 1 ? 'Муха в кабине · на хутор Берёзки' : 'Муха в кабине · на пост ГАИ');
      });
  }

  private ride(dt: number, v: Vehicle): void {
    const r = this.riding!, h = this.hooks;
    const kmh = Math.abs(v.speedKmh);
    const d = Math.hypot(r.pos.x - v.x, r.pos.z - v.z);
    this.arriveT = d < 26 && kmh < 2.5 ? this.arriveT + dt : 0;
    if (this.arriveT > 0.6) {
      h.say(r.speaker, r.line);
      if (r.out === 'police') setTimeout(() => h.say(MUHA, 'Сдал, значит… Ладно. Может, так и правильно. Бывай, Тимур.'), 5200);
      this.pressOut = r.out;
      this.s.bond = Math.max(-3, Math.min(3, this.s.bond + r.bond));
      this.riding = null;
      this.busy = false;
      return;
    }
    if (kmh > 8) this.rideT -= dt;
    if (this.rideT <= 0 && this.rideI < RIDE.length && !h.choiceOpen()) { h.say(MUHA, RIDE[this.rideI++]); this.rideT = 20 + Math.random() * 10; }
  }

  // ------------------------------------------------------------ 8. the end of it

  private finale(): void {
    const h = this.hooks;
    h.choice(MUHA, 'Здорово, почтальон. Тачку Лысый забрал — и пусть. Я, Тимур, всё. Завязал. Зинаида Павловна сказала — весной грузчик на почту нужен. Возьмёшь в напарники?',
      ['Возьму, Жень', 'Посмотрим, как себя покажешь'], (i) => {
        h.say(MUHA, i === 0 ? 'Я ж знал. С меня пельмени. Ну, с мамки моей.' : 'Справедливо. Покажу. Ты ещё увидишь, какой я грузчик.');
        this.done('end', i === 0 ? 1 : 0);
      });
  }

  dispose(): void {
    this.world.placeMuha(null);
    this.world.setMuhaCar(true);
    this.police.checkOdds = 0.3;
    this.hooks.closeChoice();
    this.hooks.boom(0);
    this.world.sawmill.setOn(false);
  }
}
