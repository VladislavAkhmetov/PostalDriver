import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import type { Ground } from '../world/Ground';
import { makeMan, makePerson, Person } from '../world/People';
import type { Stop, World } from '../world/World';
import type { Vehicle } from '../vehicle/Vehicle';
import { destTo, destWho, type Order } from './Career';
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
    money: 10000, trust: 2,
  },
  {
    name: 'Дед Митяй', make: () => makeMan('#6a6a58', '#3a3630', '#b8b4ac'),
    ask: 'Подвези {to}, а? Я с грибами, полное ведро. Белые!',
    yes: 'Садись, дед', no: 'Не сегодня, дед',
    refused: 'Эх, молодёжь… Ну, иди-иди. Грибы-то не убегут.',
    chatter: [
      'Тут в восьмидесятом щуку поймал — вот такую. Ну, может, чуть поменьше.',
      'У старой берёзы на развилке не гони. Там лось ходит. Сам видел, честно.',
      'Радио-то у тебя ловит? У меня приёмник только когда ветер с реки.',
      'Белые в этом году пошли рано. К дождю, значит. Или к урожаю. Или просто так.',
    ],
    thanks: 'Ну, спасибо, выручил. Вот грибов возьми — жене пожаришь. И это, на бензин.',
    money: 15000, trust: 2,
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
  },
];

interface Favor {
  name: string;
  make: () => Person;
  ask: string;
  yes: string; no: string;
  accepted: string; refused: string;
  title: string; note: string; fragile: boolean; pay: number;
}

const FAVORS: Favor[] = [
  {
    name: 'Петрович', make: () => makeMan('#4a5a6a', '#2e2a30', '#7a6a5a'),
    ask: 'Слышь, почта! Будь другом, закинь банку мёда {into}. Получатель — {who}, она в курсе. Обещал ещё в среду, отблагодарят.',
    yes: 'Давай, отвезу', no: 'Не положено, Петрович',
    accepted: 'Вот спасибо! Только не разбей — мёд свой, гречишный.',
    refused: 'Ишь, «не положено». Ладно, сам отвезу. На велосипеде. К Новому году.',
    title: 'Гостинец — мёд', note: 'банка, стекло', fragile: true, pay: 20000,
  },
  {
    name: 'Тамара Ильинична', make: () => makePerson('#4a6a5a', '#c8452e', true, 'dress'),
    ask: 'Голубчик, передай носки вязаные {into}, внуку на зиму. Получатель — {who}. Я подписала, всё как полагается.',
    yes: 'Передам', no: 'Не могу, простите',
    accepted: 'Дай бог тебе здоровья. Носки шерстяные, сама пряла.',
    refused: 'Ну что ж… Пошлю тогда бандеролью. Через тебя же и придёт, через неделю.',
    title: 'Гостинец — носки', note: 'мягкое, не бьётся', fragile: false, pay: 15000,
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
}

const SAY_EVERY: [number, number] = [28, 45];

export class Encounters {
  private list: Encounter[] = [];
  private chatT = SAY_EVERY[0];
  private chatI = 0;
  private flatAsk = 0;

  constructor(private world: World, private ground: Ground, private mission: Mission, private hooks: EncounterHooks, day: number) {
    const r = mulberry32(day * 131 + 7);
    const m = ground.marks;
    const maxS = Math.max(...mission.stops.map((s) => s.s), 0);
    const stopsAt = mission.stops.map((s) => s.s);
    // spots on the main road where someone might wait: by the town's last houses, the hamlet before the fork,
    // the forest track's start, past Sosnovka, over the bridge
    const spots = [m.town + 140, m.junction - 260, m.junction + 70, m.sosEnd + 70, m.bridge + 45]
      .filter((s) => s < maxS - 60 && stopsAt.every((q) => Math.abs(q - s) > 90));
    const take = () => spots.splice(Math.floor(r() * spots.length), 1)[0];
    // Kainly lies off the main road: a rider asks for it only on a day the van goes there
    const villages = ['sosnovka', 'zarechye', 'kainly'].map((id) => world.stops.find((s) => s.id === id)!).filter(Boolean)
      .filter((v) => v.id !== 'kainly' || mission.stops.includes(v));
    // a rider: the first day always, then most days
    if (spots.length && (day === 1 || r() < 0.7)) {
      const s = day === 1 ? spots.splice(spots.indexOf(m.junction - 260) >= 0 ? spots.indexOf(m.junction - 260) : 0, 1)[0] : take();
      const dest = villages.find((v) => v.s > s + 150 && v.s <= maxS + 60);
      if (dest) this.spawn({ kind: 'rider', s, state: 'wait', rider: RIDERS[day === 1 ? 0 : Math.floor(r() * RIDERS.length)], dest, still: 0, cool: 0 });
    }
    // a favour for someone on today's route
    if (spots.length && day > 1 && r() < 0.5) {
      const s = take();
      const ahead = mission.stops.filter((st) => st.s > s + 100);
      if (ahead.length) this.spawn({ kind: 'favor', s, state: 'wait', favor: FAVORS[Math.floor(r() * FAVORS.length)], dest: ahead[Math.floor(r() * ahead.length)], still: 0, cool: 0 });
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
        if (e.still > 0.6 && e.cool <= 0 && !this.hooks.choiceOpen()) { e.state = 'asked'; this.ask(e); }
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
        const f = this.ground.main.frame(dest.s + 6);
        const half = this.ground.main.zoneAt(dest.s).width / 2;
        const x = f.x + f.rx * (half + 2.4), z = f.z + f.rz * (half + 2.4);
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
