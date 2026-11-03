import * as THREE from 'three';
import { clamp, mulberry32 } from '../core/math';
import type { Ground } from '../world/Ground';
import { makeMan, type Person } from '../world/People';
import type { Collider } from '../world/Props';
import type { Actor } from '../world/Traffic';
import { buildVehicle, rollWheels, type VehicleModel } from '../world/Vehicles';
import type { Stop, World } from '../world/World';
import type { Vehicle } from '../vehicle/Vehicle';
import { destTo } from './Career';
import type { Mission } from './Mission';

/**
 * «Тормозят на дороге» (docs/design.md): once in the service, on a quiet stretch ahead, an
 * aubergine «пятёрка» with tinted glass stands half across the lane, a cassette thumping, and two
 * men by it wave the van down — Brityi in a leather jacket and his mate in a tracksuit.
 *  - Stop, and it is one of three: «выручи на бензин» (give / haggle / refuse — then the radio is
 *    "confiscated"), «дёрни на буксире» (a fade to black, then «скажи, что от Бритого»), «подкинь
 *    пацана» (a nervous lad with a bag, to the next village — he bolts if the GAI waves the van down).
 *  - Drive round them, and they come after the van, flashing and hooting, until a village («Атас!»),
 *    the mud of the river lowland (the «пятёрка» sits in it to the sills), or until they tire of it;
 *    if the van went over seventy-five doing it, the sergeant hears about it and fines Timur himself.
 * No weapons in sight, no fight: the danger is in the voice and the joke is the decade's.
 */
export interface RoadStopState { done: boolean; day?: number; outcome?: 'gave' | 'haggled' | 'robbed' | 'towed' | 'refused' | 'rode' | 'fled'; friend?: boolean }

export interface RoadStopHooks {
  choice(speaker: string, line: string, options: string[], pick: (i: number) => void): void;
  closeChoice(): void;
  choiceOpen(): boolean;
  /** Someone else already rides in the cab's one passenger seat (another story's rider). */
  seatTaken?(): boolean;
  say(speaker: string, line: string): void;
  hint(id: string, text: string, keys?: string): void;
  toast(text: string): void;
  blackout(title: string, text: string, seconds: number, mid: () => void, done: () => void, stamp: string): void;
  boom(level: number): void;
  shout(level: number): void;
  /** Their horn, behind the van. */
  horn(level: number): void;
  fine(amount: number, note: string): void;
  /** The radio taken off the dashboard for the day. */
  takeRadio(): void;
  /** The GAI has the van stopped (the lad bolts). */
  police(): boolean;
}

const BRITYI = 'Бритый';
const KID = 'Пацан с сумкой';
type Kind = 'fuel' | 'tow' | 'kid';

export class RoadStop {
  private s0 = 0;
  private state: 'off' | 'wait' | 'talk' | 'parked' | 'ride' | 'chase' | 'leave' | 'over' = 'off';
  private model: VehicleModel | null = null;
  private col: Collider | null = null;
  private actor: Actor | null = null;
  private men: Person[] = [];
  private kind: Kind = 'fuel';
  private still = 0;
  private hinted = false;
  private sCar = 0;
  private vCar = 0;
  private yawCar = 0;
  private hornT = 2;
  private shoutT = 1;
  private chaseT = 0;
  private offRoadT = 0;
  private maxKmh = 0;
  private end = 0;
  private dest: Stop | null = null;
  private chatT = 6;
  private chatI = 0;
  private readonly s: RoadStopState;

  constructor(private world: World, private ground: Ground, private mission: Mission, private hooks: RoadStopHooks, private day: number, saved: RoadStopState | undefined, blocked: boolean) {
    this.s = saved ? { ...saved } : { done: false };
    if (this.s.done || blocked || day < 5) return;
    const r = mulberry32(day * 977 + 31);
    if (r() > 0.35) return;
    const m = ground.marks, maxS = Math.max(0, ...mission.stops.map((st) => st.s));
    const rail = m.town + 520;
    // quiet stretches: past the level crossing on the asphalt, the forest track after the fork, the woods past Sosnovka
    const spots = [rail + 110, m.junction + 260, m.sosEnd + 180]
      .filter((s) => s < maxS - 150 && mission.stops.every((st) => Math.abs(st.s - s) > 160));
    if (!spots.length) return;
    this.s0 = spots[Math.floor(r() * spots.length)];
    this.kind = (['fuel', 'tow', 'kid'] as Kind[])[Math.floor(r() * 3)];
    this.build();
    this.state = 'wait';
  }

  /** What to keep at the end of the day. */
  get saved(): RoadStopState { return { ...this.s }; }

  /** The lad is in the cab: the day isn't over until he is out. */
  get riding(): boolean { return this.state === 'ride'; }

  private build(): void {
    const g = this.ground, f = g.main.frame(this.s0);
    // half across the right lane, nose toward the middle of the road
    const m = buildVehicle('vaz2105', 'baklaj', 3);
    const x = f.x + f.rx * 1.1, z = f.z + f.rz * 1.1;
    this.yawCar = Math.atan2(f.tx, f.tz) + 0.85;
    m.group.position.set(x, g.height(x, z), z);
    m.group.rotation.y = this.yawCar;
    this.world.group.add(m.group);
    this.model = m;
    this.col = { x, z, r: Math.hypot(m.width, m.length) / 2, hw: m.width / 2, hd: m.length / 2, rot: this.yawCar, box: true };
    this.world.colliders.dynamic.push(this.col);
    this.actor = { x, z, vx: 0, vz: 0, yaw: this.yawCar, hw: m.width / 2, hl: m.length / 2 };
    this.world.traffic.actors.push(this.actor);
    // Brityi on the crown of the road facing the van; his mate leaning on the wing
    const brityi = makeMan('#1e1c1c', '#2a3040', '#c8977a');
    const mate = makeMan('#2a3a6a', '#2a3a6a', '#3a2e26');
    const place = (p: Person, along: number, lat: number, yaw: number) => {
      const px = f.x + f.tx * along + f.rx * lat, pz = f.z + f.tz * along + f.rz * lat;
      p.group.position.set(px, g.height(px, pz), pz);
      p.group.rotation.y = yaw;
      this.world.group.add(p.group);
      this.world.people.push(p);
      this.men.push(p);
    };
    const back = Math.atan2(-f.tx, -f.tz);
    place(brityi, -4.5, -0.6, back);
    place(mate, 1.5, 3.4, back + 0.6);
  }

  private removeMen(): void {
    for (const p of this.men) {
      p.group.removeFromParent();
      const i = this.world.people.indexOf(p);
      if (i >= 0) this.world.people.splice(i, 1);
    }
    this.men = [];
  }

  dispose(): void {
    this.removeMen();
    this.hooks.boom(0);
    if (this.model) this.model.group.removeFromParent();
    if (this.col) { const i = this.world.colliders.dynamic.indexOf(this.col); if (i >= 0) this.world.colliders.dynamic.splice(i, 1); }
    if (this.actor) { const i = this.world.traffic.actors.indexOf(this.actor); if (i >= 0) this.world.traffic.actors.splice(i, 1); }
    this.model = null; this.col = null; this.actor = null;
    this.state = 'over';
  }

  private get carPos(): THREE.Vector3 { return this.model ? this.model.group.position : new THREE.Vector3(1e9, 0, 1e9); }

  update(dt: number, v: Vehicle): void {
    if (this.state === 'off' || this.state === 'over') return;
    const h = this.hooks;
    const p = this.carPos;
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    const kmh = Math.abs(v.speedKmh);
    const music = this.state === 'wait' || this.state === 'talk' || this.state === 'chase' || this.state === 'parked';
    h.boom(music ? clamp(1 - d / 240, 0, 1) ** 1.5 * (this.state === 'chase' ? 1.2 : 1) : 0);
    if (this.state === 'ride') { this.ride(dt, v, kmh); return; }
    if (this.state === 'chase') { this.chase(dt, v, kmh); return; }
    if (this.state === 'leave') { this.leave(dt, v); return; }
    if (this.state === 'parked') { if (d > 220) this.dispose(); return; }
    // waiting across the lane
    for (const m of this.men) if (d < 120 && d > 18) m.wave = Math.max(m.wave, 0.6);
    if (!this.hinted && d < 170) {
      this.hinted = true;
      h.hint('roadstop', 'Впереди поперёк полосы — «пятёрка» цвета баклажан, тонированная. Кассета бухает на всю округу, двое у машины машут: тормози.');
    }
    if (this.state === 'talk') { if (d > 35) { h.closeChoice(); this.state = 'wait'; } return; }
    this.still = d < 22 && kmh < 2 ? this.still + dt : 0;
    if (this.still > 0.8 && !h.choiceOpen()) { this.state = 'talk'; this.talk(); return; }
    // gone round them: they come after the van
    const sv = this.ground.main.nearestS(v.x, v.z);
    if (sv > this.s0 + 12 && d < 60) this.startChase(sv);
  }

  // ------------------------------------------------------------ stopping for them

  private talk(): void {
    const h = this.hooks;
    const after = () => { this.s.done = true; this.s.day = this.day; this.state = 'parked'; this.removeMen(); };
    if (this.kind === 'kid' && h.seatTaken?.()) this.kind = 'fuel';
    if (this.kind === 'kid') {
      const ahead = this.mission.stops.filter((st) => !st.done && st.s > this.s0 + 100 && !st.branch);
      this.dest = ahead[0] ?? null;
      if (!this.dest) this.kind = 'fuel';
    }
    if (this.kind === 'fuel') {
      h.choice(BRITYI, 'Здорово, почта. Слышь, выручи на бензин — сам видишь, обсохли. Тридцатку, а? Мы ж не звери, мы попросить.', ['Держи тридцать', 'Пятнадцать — больше нет', 'Нету, мужики'], (i) => {
        if (i === 0) {
          this.mission.extra('Бритый · «на бензин»', -30000, 0);
          this.s.outcome = 'gave'; this.s.friend = true;
          h.say(BRITYI, 'Красава. Если что — скажешь, от Бритого. Тебя в районе никто не тронет.');
        } else if (i === 1) {
          this.mission.extra('Бритый · «на бензин», поторговались', -15000, 0);
          this.s.outcome = 'haggled';
          h.say(BRITYI, 'Жмот ты, почта. Ладно, давай пятнашку. Живи.');
        } else {
          this.s.outcome = 'robbed';
          h.say(BRITYI, 'Нету? А магнитола у тебя на что играет? Сымай, Вован. Конфискуем — за моральный ущерб. Езжай, почтальон, не задерживай.');
          setTimeout(() => { h.takeRadio(); h.toast('Магнитолу сняли · радио молчит до конца дня'); }, 1800);
        }
        after();
      });
    } else if (this.kind === 'tow') {
      h.choice(BRITYI, 'Почта! Дёрни на буксире, а? Аккумулятор сел, а эта баклажанина с толкача не заводится. Трос есть, мы не жадные.', ['Давай трос', 'Некогда, мужики'], (i) => {
        if (i === 0) {
          h.blackout('Буксир', 'Трос — за фаркоп, рывок, ещё рывок. «Пятёрка» чихнула, выплюнула сизое облако и завелась. Бритый хлопает буханку по крыше.', 2.6, () => {
            this.mission.addTime(300);
            this.mission.extra('Бритый · «за буксир»', 20000, 0);
          }, () => h.say(BRITYI, 'Спасибо, почта. На пиво — держи. Скажешь, что от Бритого, — нигде не тронут.'), 'Завелась');
          this.s.outcome = 'towed'; this.s.friend = true;
        } else {
          this.s.outcome = 'refused';
          h.say(BRITYI, 'Некогда ему… Ну смотри, почта. Дорога длинная, а район маленький.');
        }
        after();
      });
    } else {
      const to = destTo(this.dest!.id, 'gen');
      h.choice(BRITYI, `Слышь, почта, подкинь пацана ${to}. Ему срочно, а у нас тут дела. Сумку не трогай — там личное.`, ['Садись', 'Не положено, мужики'], (i) => {
        if (i === 0) {
          this.s.outcome = 'rode';
          this.s.done = true; this.s.day = this.day;
          this.removeMen();
          this.state = 'ride';
          this.chatT = 5; this.chatI = 0;
          h.toast(`${KID} садится в кабину · ${to}`);
        } else {
          this.s.outcome = 'refused';
          h.say(BRITYI, 'Не положено… Законник нашёлся. Ну-ну.');
          after();
        }
      });
    }
  }

  private ride(dt: number, v: Vehicle, kmh: number): void {
    const h = this.hooks, dest = this.dest!;
    // the GAI waves the van down: he is out of the door and into the bushes
    if (h.police()) {
      h.say(KID, 'Тормози, я тут выйду! Всё, дядя, ты меня не видел!');
      h.toast('Пацан выскочил и ушёл в кусты — с сумкой');
      this.state = 'parked'; this.end = 0;
      return;
    }
    const d = Math.hypot(dest.pos.x - v.x, dest.pos.z - v.z);
    if (d < 32 && kmh < 2.5) {
      h.say(KID, 'Всё, приехали. Спасибо, дядя. На вот — Бритый велел. И это… ты меня не видел.');
      this.mission.extra(`Попутчик · пацан от Бритого ${destTo(dest.id, 'gen')}`, 25000, 0);
      this.state = 'parked';
      return;
    }
    if (kmh > 8) this.chatT -= dt;
    const lines = [
      'А ты быстро можешь? Не, не надо быстро. Нормально едь. Обычно.',
      'Это… если менты — я с тобой не ехал. Я вообще по грибы.',
      'Что в сумке? Ничего в сумке. Носки. Тёплые.',
      'Музыку сделай погромче. Не, потише. Как было.',
    ];
    if (this.chatT <= 0 && this.chatI < lines.length && !h.choiceOpen()) { h.say(KID, lines[this.chatI++]); this.chatT = 22 + Math.random() * 12; }
  }

  // ------------------------------------------------------------ driving round them

  private startChase(sv: number): void {
    this.state = 'chase';
    this.s.done = true; this.s.day = this.day; this.s.outcome = 'fled';
    this.removeMen();
    this.sCar = this.s0;
    this.vCar = 4;
    this.chaseT = 0;
    this.maxKmh = 0;
    this.hooks.hint('roadstop-chase', 'Объехал — а «пятёрка» разворачивается и с визгом идёт следом, мигает фарами, гудит. Оторвись до деревни или поста — при людях они не полезут.');
    void sv;
  }

  private chase(dt: number, v: Vehicle, kmh: number): void {
    const h = this.hooks, g = this.ground, m = g.marks;
    this.chaseT += dt;
    this.maxKmh = Math.max(this.maxKmh, kmh);
    const onMain = g.nearestRoad(v.x, v.z, 14)?.sample.road === g.main;
    this.offRoadT = onMain ? 0 : this.offRoadT + dt;
    const sv = g.main.nearestS(v.x, v.z);
    // keep a car-length or three behind the van; never into it
    const gap = sv - this.sCar;
    const surf = g.main.zoneAt(this.sCar).surface;
    const vmax = surf === 'asphalt' ? 30 : surf === 'mud' ? 4 : 17;
    const want = clamp((gap - 12) * 1.3 + Math.abs(v.vx), 0, vmax);
    this.vCar += clamp(want - this.vCar, -9 * dt, 5 * dt);
    this.sCar = Math.min(this.sCar + this.vCar * dt, sv - 7);
    this.place(this.sCar, 0.4, 0);
    this.hornT -= dt;
    if (this.hornT <= 0 && gap < 80) { this.hornT = 2.5 + Math.random() * 3; h.horn(clamp(1 - gap / 80, 0.3, 1)); }
    this.shoutT -= dt;
    if (this.shoutT <= 0 && gap < 50) { this.shoutT = 3 + Math.random() * 4; h.shout(clamp(1 - gap / 50, 0.3, 1)); }
    if (this.model?.lights) this.model.lights.visible = Math.floor(this.chaseT * 3) % 2 === 0;
    // where it ends: people about, the lowland's mud, the van off the main road, or they tire of it
    const village = this.world.hamlets.some(([a]) => sv > a - 30 && sv < a + 60) || (sv > m.sosStart - 30 && sv < m.sosStart + 60) || Math.abs(sv - this.world.gai.sPost) < 160;
    if (village) return this.stopChase('Атас!.. «Пятёрка» резко тормозит, разворачивается через обочину и уходит назад. Сквозь музыку слышно: «Менты, Вован, менты!»');
    if (this.sCar > m.mud - 15) return this.stopChase('«Пятёрка» влетела в низину и села по пороги. Сзади — вой мотора, мат и брызги грязи. Буханка с передним мостом идёт дальше.');
    if (this.offRoadT > 6) return this.stopChase('Свернул с большака — «пятёрка» постояла на перекрёстке, побибикала и уехала.');
    if (this.chaseT > 110) return this.stopChase('Бритому надоело: «пятёрка» мигнула напоследок и отстала.');
  }

  private stopChase(text: string): void {
    const h = this.hooks;
    h.hint('roadstop-end', text);
    this.state = 'leave';
    if (this.model?.lights) this.model.lights.visible = true;
    // racing about the district: the sergeant hears of it from someone
    if (this.maxKmh > 75) {
      const top = Math.round(this.maxKmh / 5) * 5;
      setTimeout(() => {
        h.say('Сержант Кузьмин, ГАИ (по рации в сельсовете)', `Почта, ты чего по району под ${top} гоняешь? Мне уже из двух деревень звонили. Сорок тысяч — заедешь, заплатишь.`);
        h.fine(40000, 'превышение скорости');
      }, 6000);
    }
  }

  private leave(dt: number, v: Vehicle): void {
    // back the way they came, and gone once out of sight
    this.vCar = Math.min(this.vCar + dt * 4, 14);
    this.sCar = Math.max(5, this.sCar - this.vCar * dt);
    this.place(this.sCar, -1.6, Math.PI);
    const p = this.carPos;
    if (Math.hypot(p.x - v.x, p.z - v.z) > 260) this.dispose();
  }

  /** Put the car on the main road at `s`, `lat` to the right, facing along it (or back, `turn` = π). */
  private place(s: number, lat: number, turn: number): void {
    const m = this.model;
    if (!m) return;
    const f = this.ground.main.frame(s);
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
    const prev = m.group.position.clone();
    m.group.position.set(x, this.ground.height(x, z), z);
    const yaw = Math.atan2(f.tx, f.tz) + turn;
    m.group.rotation.y += Math.atan2(Math.sin(yaw - m.group.rotation.y), Math.cos(yaw - m.group.rotation.y)) * 0.2;
    rollWheels(m, prev.distanceTo(m.group.position));
    if (this.col) { this.col.x = x; this.col.z = z; this.col.rot = m.group.rotation.y; }
    if (this.actor) { this.actor.x = x; this.actor.z = z; this.actor.yaw = m.group.rotation.y; }
  }
}
