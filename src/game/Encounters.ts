import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import type { Ground } from '../world/Ground';
import { makeMan, makePerson, Person } from '../world/People';
import type { Stop, World } from '../world/World';
import type { Vehicle } from '../vehicle/Vehicle';
import { dateParts, destTo, destWho, type Order } from './Career';
import type { Mission } from './Mission';

/**
 * The day's deck of roadside encounters: somebody thumbing a lift, somebody with a jar for a relative
 * down the road, a nail in a tyre. Each is told in the cab — a card with a question and answers, the
 * rider's chatter while driving, a fade to black while the wheel is changed — no cutscenes.
 */

export interface EncounterHooks {
  choice(speaker: string, line: string, options: string[], pick: (i: number) => void): void;
  closeChoice(): void;
  choiceOpen(): boolean;
  /** A line from someone, without a stamp. */
  say(speaker: string, line: string): void;
  hint(id: string, text: string, keys?: string): void;
  toast(text: string): void;
  blackout(title: string, text: string, seconds: number, mid: () => void, done: () => void, stamp: string): void;
  flat(): void;
  /** Someone else already rides in the cab's one passenger seat (another story's rider). */
  seatTaken?(): boolean;
}

interface Rider {
  name: string;
  make: () => Person;
  ask: string;
  yes: string; no: string;
  refused: string;
  chatter: string[];
  thanks: string;
  money: number; trust: number;
  /** Only on such days (month 0…11, day of the month, weekday 0 = Monday). */
  when?: (m: number, d: number, wd: number) => boolean;
  /** Going home: only to this village (баба Шура and her goat — Sosnovka); the others go anywhere ahead. */
  home?: string;
}

const RIDERS: Rider[] = [
  {
    name: 'Баба Шура', make: () => makePerson('#6a5a7a', '#3a6a8a', true, 'dress'),
    ask: 'Сынок, {to} не подбросишь? Автобус опять не пришёл, а у меня коза недоена.',
    yes: 'Садитесь, подвезу', no: 'Извините, спешу',
    refused: 'Ну и ладно. Ноги свои, не казённые — дойду.',
    chatter: [
      'Коза у меня, Зорька, умнее председателя. Калитку сама открывает. Закрывать — не научилась.',
      'Ты на ямах-то потише, у меня в сумке яйца. Десяток. Было.',
      'Валентина-то, из сельпо, говорят, замуж собралась. Ну, это я тебе не говорила.',
      'Раньше автобус три раза в день ходил. А теперь — как бог на душу положит.',
    ],
    thanks: 'Спасибо, родной. Вот пирожков возьми, с капустой. И денежку — не спорь, на бензин.',
    money: 10000, trust: 2, home: 'sosnovka',
  },
  {
    name: 'Дядя Гоша, сторож элеватора', make: () => makeMan('#5a5040', '#2e2c28', '#a8a49c'),
    ask: 'Подвези {to}, а? Смену сдал, а автобус — сам знаешь, как бог на душу положит.',
    yes: 'Садись, дядя Гоша', no: 'Не сегодня, извини',
    refused: 'Ну, иди-иди. Я пешком. Я ж сторож — мне спешить некуда, я всё уже усторожил.',
    chatter: [
      'На элеваторе тихо теперь. Зерна нет — сторожу пустоту. Пустоту, говорят, тоже воруют.',
      'Радио-то у тебя ловит? У меня приёмник только когда ветер с реки.',
      'У старой берёзы на развилке не гони. Там лось ходит. Сам видел, честно.',
      'Урал-агай раньше меня всегда подвозил. Ты на него похож. Особенно когда молчишь.',
    ],
    thanks: 'Ну, спасибо, выручил. Держи вот — на бензин, не спорь.',
    money: 15000, trust: 2,
  },
  {
    name: 'Лида, медсестра', make: () => makePerson('#e8e4dc', '#3a6a8a', false, 'woman'),
    ask: 'Ой, Тимур! Ты ж Гульнарин сын? Подвези {to}, у меня там уколы по домам, а рейсовый сломался.',
    yes: 'Садитесь, тётя Лида', no: 'Не по пути, простите',
    refused: 'Ну, беги, беги. Маме привет. Скажи — Лида пешком пошла, пусть ей стыдно будет. Шучу.',
    chatter: [
      'Мама твоя у нас лучшая. Уколы ставит — никто не чувствует. А я ставлю — вся деревня слышит.',
      'В райбольнице опять ремонт обещают. Третий год обещают. Краску уже купили — одну банку.',
      'Ты ешь хорошо? По глазам вижу — нет. Өләсәй скажу.',
    ],
    thanks: 'Спасибо, Тимурчик. На вот, витаминки — аскорбинки пачка. Шофёру положено.',
    money: 5000, trust: 2,
  },
  {
    name: 'Механизатор Рамиль', make: () => makeMan('#3a4a3a', '#2e2a26', '#6a5a4a'),
    ask: 'Почта, выручай — трактор встал на дальнем поле, а мне {to}, за деталью. Подкинешь?',
    yes: 'Садись', no: 'Не могу, извини',
    refused: 'Понял. Пойду пешком. Тракторист без трактора — пешеход.',
    chatter: [
      'Трактору сорок лет. Мне — тридцать. Он старше, а слушается хуже.',
      'Председатель говорит: «Рамиль, ты же механизатор». А я говорю: «Механизатор — это когда есть запчасти».',
      'Брат в Кайынлы женился недавно? Нет, это не брат, это Ильдар. У нас все друг другу братья.',
    ],
    thanks: 'Приехали. Спасибо, почта! Будешь мимо поля — посигналь, я тебе рукой помашу. Если трактор заведу — двумя.',
    money: 10000, trust: 1,
    // the farm's work: from the sowing to the autumn ploughing
    when: (m) => m >= 3 && m <= 9,
  },
  {
    name: 'Оля, студентка', make: () => makePerson('#8a3a4a', '#e0d0b0', false, 'woman'),
    ask: 'Здравствуйте! Вы {to}? Я домой на выходные, из техникума. Возьмёте?',
    yes: 'Конечно, садись', no: 'Не по пути, извини',
    refused: 'Ой, ну ладно… Попутку подожду. Тут раз в час кто-нибудь да едет.',
    chatter: [
      'А радио можно погромче? Хорошая песня. У нас в общежитии такую по кассете крутят.',
      'В городе сейчас все в джинсах ходят. А у нас — в фуфайках. Зато тепло.',
      'Мама опять скажет, что я похудела. Она всем так говорит, даже соседу.',
      'Я на бухгалтера учусь. Буду вам зарплату считать. Шучу. Наверное.',
    ],
    thanks: 'Спасибо огромное! Вот, возьмите — мама бы ругалась, если бы я не заплатила.',
    money: 20000, trust: 1,
    // home for the weekend: Friday and Saturday, in term time
    when: (m, _d, wd) => (wd === 4 || wd === 5) && m !== 6 && m !== 7,
  },
];

/**
 * Who comes to the road on a given day, by the date and the day's own draw — never the same face as
 * the played day before (that day's face, worked out the same way). Day 1 is баба Шура.
 */
function face<T extends { name: string; when?: (m: number, d: number, wd: number) => boolean }>(day: number, all: T[], salt: number): T | null {
  if (day < 1) return null;
  if (salt === 11 && day === 1) return all[0];
  const dp = dateParts(day);
  const list = all.filter((x) => !x.when || x.when(dp.m, dp.d, dp.wd));
  if (!list.length) return null;
  let i = Math.floor(mulberry32(day * 131 + salt)() * list.length);
  const prev = day > 1 ? face(day - 1, all, salt)?.name : null;
  if (list.length > 1 && list[i].name === prev) i = (i + 1) % list.length;
  return list[i];
}

interface Favor {
  name: string;
  make: () => Person;
  ask: string;
  yes: string; no: string;
  accepted: string; refused: string;
  title: string; note: string; fragile: boolean; pay: number;
  when?: (m: number, d: number, wd: number) => boolean;
  /** Not to these addressees (no honey to the beekeeper). */
  not?: string[];
}

const FAVORS: Favor[] = [
  {
    name: 'Петрович', make: () => makeMan('#4a5a6a', '#2e2a30', '#7a6a5a'),
    ask: 'Слышь, почта! Будь другом, закинь банку мёда {into}. Получатель — {who}, в курсе. Обещал ещё в среду, отблагодарят.',
    yes: 'Давай, отвезу', no: 'Не положено, Петрович',
    accepted: 'Вот спасибо! Только не разбей — мёд свой, гречишный.',
    refused: 'Ишь, «не положено». Ладно, сам отвезу. На велосипеде. К Новому году.',
    title: 'Гостинец — мёд', note: 'банка, стекло', fragile: true, pay: 20000, not: ['apiary'],
  },
  {
    name: 'Тамара Ильинична', make: () => makePerson('#4a6a5a', '#c8452e', true, 'dress'),
    ask: 'Голубчик, передай носки вязаные {into}, на морозы. Получатель — {who}, знакомы сто лет. Я подписала, всё как полагается.',
    yes: 'Передам', no: 'Не могу, простите',
    accepted: 'Дай бог тебе здоровья. Носки шерстяные, сама пряла.',
    refused: 'Ну что ж… Пошлю тогда бандеролью. Через тебя же и придёт, через неделю.',
    title: 'Гостинец — носки', note: 'мягкое, не бьётся', fragile: false, pay: 15000,
    // socks for the winter: from the autumn to the end of February
    when: (m) => m >= 8 || m <= 1,
  },
  {
    name: 'Учительница Анна Сергеевна', make: () => makePerson('#4a4a6a', '#e8e0d0', false, 'woman'),
    ask: 'Молодой человек, вы на почте? Передайте, пожалуйста, тетради и мел {into}, для школы. Получатель — {who}, она отнесёт. Я обещала, а сама не доеду: у меня шестой «Б».',
    yes: 'Передам', no: 'Сегодня не успею',
    accepted: 'Спасибо! Тетради в клетку, двенадцать листов. Мел — белый. Цветной кончился в восемьдесят девятом.',
    refused: 'Ну что ж. Напишут пока на газетах. Им полезно — хоть газеты прочитают.',
    title: 'Тетради и мел', note: 'пачка тетрадей, коробка мела', fragile: false, pay: 12000,
    // only the villages with a school (and a woman at the door to take them there)
    not: ['camp', 'khutor', 'kolkhoz', 'forestry', 'apiary'],
  },
  {
    name: 'Шофёр лесовоза', make: () => makeMan('#4a3a2a', '#2a2a2a', '#5a4a3a'),
    ask: 'Почта! Слушай, кинь {into} аккумулятор. Получатель — {who}, я обещал, а мне в другую сторону, с лесом. Тяжёлый, но не бьётся.',
    yes: 'Грузи', no: 'Тяжёлое не беру',
    accepted: 'Вот спасибо! Кислоту не разлей — она там внутри, она там живёт.',
    refused: 'Не берёт… Почта, а почта — это и есть «тяжёлое». Ладно, сам как-нибудь.',
    title: 'Аккумулятор', note: 'тяжёлый, кислотный — не переворачивать', fragile: false, pay: 18000,
    // to a working place: the hamlet, the farm, the forestry, the apiary, the shop
    not: ['camp', 'kainly', 'sosnovka'],
  },
];

type State = 'wait' | 'asked' | 'riding' | 'done';
interface Encounter {
  kind: 'rider' | 'favor' | 'flat';
  s: number;
  state: State;
  person?: Person;
  pos?: THREE.Vector3;
  rider?: Rider;
  favor?: Favor;
  dest?: Stop;
  still: number;
  cool: number;
  /** Has said the seat is taken. */
  full?: boolean;
}

const SAY_EVERY: [number, number] = [28, 45];

export class Encounters {
  private list: Encounter[] = [];
  private chatT = SAY_EVERY[0];
  private chatI = 0;
  private flatAsk = 0;

  /** `noRider`: someone the day's story has by the road already (Cases): no chance hitch-hiker as well. */
  constructor(private world: World, private ground: Ground, private mission: Mission, private hooks: EncounterHooks, day: number, noRider = false) {
    const r = mulberry32(day * 131 + 7);
    const m = ground.marks;
    const maxS = Math.max(...mission.stops.map((s) => s.s), 0);
    const stopsAt = mission.stops.map((s) => s.s);
    // spots on the main road where someone might wait: by the town's last houses, the hamlet before the fork,
    // the forest track's start, past Sosnovka, over the bridge
    const spots = [m.town + 140, m.junction - 260, m.junction + 70, m.sosEnd + 70, m.bridge + 45]
      .filter((s) => s < maxS - 60 && stopsAt.every((q) => Math.abs(q - s) > 90))
      // (the town's end is where the day's story has its rider waiting)
      .filter((s) => !noRider || s !== m.town + 140);
    const take = () => spots.splice(Math.floor(r() * spots.length), 1)[0];
    // Kainly lies off the main road: a rider asks for it only on a day the van goes there
    const villages = ['sosnovka', 'zarechye', 'kainly'].map((id) => world.stops.find((s) => s.id === id)!).filter(Boolean)
      .filter((v) => v.id !== 'kainly' || mission.stops.includes(v));
    // whoever sent something through the post office this morning is not by the road as well
    const sent = new Set(mission.orders.map((o) => o.from).filter(Boolean));
    // a rider: the first day always, then most days
    if (spots.length && !noRider && (day === 1 || r() < 0.7)) {
      const s = day === 1 ? spots.splice(spots.indexOf(m.junction - 260) >= 0 ? spots.indexOf(m.junction - 260) : 0, 1)[0] : take();
      const rider = face(day, RIDERS, 11);
      const dest = villages.find((v) => v.s > s + 150 && v.s <= maxS + 60 && (!rider?.home || v.id === rider.home));
      if (dest && rider && !sent.has(rider.name)) this.spawn({ kind: 'rider', s, state: 'wait', rider, dest, still: 0, cool: 0 });
    }
    // a favour for someone on today's route
    if (spots.length && day > 1 && r() < 0.5) {
      const s = take();
      const favor = face(day, FAVORS, 13)!;
      const ahead = mission.stops.filter((st) => st.s > s + 100 && !favor.not?.includes(st.id));
      if (ahead.length && !sent.has(favor.name)) this.spawn({ kind: 'favor', s, state: 'wait', favor, dest: ahead[Math.floor(r() * ahead.length)], still: 0, cool: 0 });
    }
    // a nail on the forest track
    if (day > 1 && maxS > m.junction + 400 && r() < 0.3) this.list.push({ kind: 'flat', s: m.junction + 150 + r() * (Math.min(maxS, m.bridge) - m.junction - 300), state: 'wait', still: 0, cool: 0 });
  }

  private spawn(e: Encounter): void {
    const f = this.ground.main.frame(e.s);
    const half = this.ground.main.zoneAt(e.s).width / 2;
    const lat = half + 2.3;
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
    const p = (e.rider ?? e.favor)!.make();
    p.group.position.set(x, this.ground.height(x, z), z);
    p.group.rotation.y = Math.atan2(-f.rx, -f.rz);
    this.world.group.add(p.group);
    this.world.people.push(p);
    e.person = p;
    e.pos = new THREE.Vector3(x, 0, z);
    this.list.push(e);
  }

  /** Someone is in the passenger seat: the day isn't over until they are out. */
  get riding(): boolean { return this.list.some((e) => e.state === 'riding'); }

  dispose(): void {
    for (const e of this.list) {
      if (!e.person) continue;
      e.person.group.removeFromParent();
      const i = this.world.people.indexOf(e.person);
      if (i >= 0) this.world.people.splice(i, 1);
    }
    this.list = [];
  }

  update(dt: number, v: Vehicle, routeS: number): void {
    const kmh = Math.abs(v.speedKmh);
    for (const e of this.list) {
      e.cool = Math.max(0, e.cool - dt);
      if (e.kind === 'flat') { this.flat(e, dt, v, routeS, kmh); continue; }
      const d = e.pos ? Math.hypot(e.pos.x - v.x, e.pos.z - v.z) : 1e9;
      if (e.state === 'wait' && e.person && d < 80 && d > 14) e.person.wave = Math.max(e.person.wave, 0.6);
      if (e.state === 'wait') {
        e.still = d < 18 && kmh < 3 ? e.still + dt : 0;
        if (e.still > 0.6 && e.cool <= 0 && !this.hooks.choiceOpen()) {
          // one passenger seat: with someone in it, a rider waits for the next car (said once)
          if (e.rider && this.hooks.seatTaken?.()) {
            if (!e.full) { e.full = true; this.hooks.say(e.rider.name, 'У тебя уже сидит кто-то? Ну, ничего, я следующего подожду.'); }
            e.cool = 8;
          } else { e.state = 'asked'; this.ask(e); }
        }
      } else if (e.state === 'asked') {
        // drove off without answering: the question waits for another stop
        if (kmh > 10 || d > 30) { this.hooks.closeChoice(); e.state = 'wait'; e.cool = 6; }
      } else if (e.state === 'riding') this.ride(e, dt, v, kmh);
    }
  }

  private fill(text: string, e: Encounter): string {
    const id = e.dest?.id ?? '';
    return text.replace('{to}', destTo(id, 'gen')).replace('{into}', destTo(id, 'acc')).replace('{who}', e.dest ? destWho(id).split(',')[0] : '');
  }

  private ask(e: Encounter): void {
    if (e.rider) {
      const R = e.rider;
      this.hooks.choice(R.name, this.fill(R.ask, e), [R.yes, R.no], (i) => {
        if (i === 0) {
          e.state = 'riding';
          e.person!.group.visible = false;
          this.chatT = SAY_EVERY[0] * 0.6;
          this.chatI = 0;
          this.hooks.toast(`${R.name} садится в кабину · ${destTo(e.dest!.id, 'gen')}`);
        } else { e.state = 'done'; this.hooks.say(R.name, R.refused); }
      });
    } else if (e.favor) {
      const F = e.favor;
      this.hooks.choice(F.name, this.fill(F.ask, e), [F.yes, F.no], (i) => {
        e.state = 'done';
        if (i === 0) {
          const o: Order = { id: `favor-${e.s.toFixed(0)}`, dest: e.dest!.id, kind: 'parcel', title: F.title, note: F.note, pay: F.pay, fragile: F.fragile, due: null, from: F.name };
          this.mission.addOrder(o);
          this.hooks.say(F.name, F.accepted);
          this.hooks.toast(`В путевой лист: ${F.title.toLowerCase()} → ${e.dest!.name}`);
        } else this.hooks.say(F.name, F.refused);
      });
    }
  }

  private ride(e: Encounter, dt: number, v: Vehicle, kmh: number): void {
    const R = e.rider!, dest = e.dest!;
    const d = Math.hypot(dest.pos.x - v.x, dest.pos.z - v.z);
    // out at the village, once the van has stopped
    if (d < 32 && kmh < 2.5) {
      e.still += dt;
      if (e.still > 0.6) {
        e.state = 'done';
        this.hooks.say(R.name, R.thanks);
        this.mission.extra(`Попутчик · ${R.name} ${destTo(dest.id, 'gen')}`, R.money, R.trust);
        // back on her feet a few steps from the addressee's spot, waving the van off
        // (by the road nearest the addressee — Kainly and the camp are off the main road)
        const hit = this.ground.nearestRoad(dest.pos.x, dest.pos.z, 40);
        let x = dest.pos.x + 2, z = dest.pos.z + 2;
        if (hit) {
          const p = hit.sample, half = p.road.zoneAt(hit.s).width / 2, side = hit.lat >= 0 ? 1 : -1;
          x = p.x - p.tz * side * (half + 2.4) + p.tx * 6; z = p.z + p.tx * side * (half + 2.4) + p.tz * 6;
        }
        e.person!.group.position.set(x, this.ground.height(x, z), z);
        e.person!.group.visible = true;
        e.person!.wave = 4;
      }
      return;
    }
    e.still = 0;
    // a word now and then while driving
    if (kmh > 8) this.chatT -= dt;
    if (this.chatT <= 0 && this.chatI < R.chatter.length && !this.hooks.choiceOpen()) {
      this.hooks.say(R.name, R.chatter[this.chatI++]);
      this.chatT = SAY_EVERY[0] + Math.random() * (SAY_EVERY[1] - SAY_EVERY[0]);
    }
  }

  private flat(e: Encounter, dt: number, v: Vehicle, routeS: number, kmh: number): void {
    if (e.state === 'wait') {
      if (routeS > e.s && kmh > 12 && v.surface !== 'asphalt') {
        e.state = 'asked';
        v.flat = true;
        this.hooks.flat();
        this.hooks.hint('flat', 'Хлопок — и машину тянет в сторону. Прокол! Остановись, затяни ручник: запаска под сиденьем.', 'Пробел');
      }
      return;
    }
    if (e.state !== 'asked' || !v.flat) return;
    this.flatAsk = kmh < 1 && v.handbrake ? this.flatAsk + dt : 0;
    if (this.flatAsk > 0.8 && e.cool <= 0 && !this.hooks.choiceOpen()) {
      this.flatAsk = 0;
      this.hooks.choice('Колесо', 'Переднее правое спущено, на ободе. Запаска, домкрат и балонник — под сиденьем.', ['Поменять колесо (минут пять)', 'Доеду так'], (i) => {
        if (i === 0) {
          this.hooks.blackout('Меняю колесо', 'Домкрат в грязь, кирпич под колесо, гайки «на сорок»… Руки по локоть в глине, зато запаска на месте.', 2.4, () => {
            v.flat = false;
            this.mission.addTime(300);
          }, () => { e.state = 'done'; this.hooks.toast('Запаска на месте · −5 мин'); }, 'Запаска');
        } else e.cool = 40;
      });
    }
  }
}
