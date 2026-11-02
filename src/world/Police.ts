import { rub } from '../game/Money';
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math';
import { crewFor, type PoliceKind } from './Cars';
import type { Ground } from './Ground';
import { Officer } from './Officer';
import type { Collider } from './Props';
import { stopSpeed, type Actor, type Path, type Traffic } from './Traffic';
import { rollWheels, setBeacons, setBrake, VehicleModel } from './Vehicles';

/** The patrol cars and the inspector at the GAI post, built by World. */
export interface GaiPatrol {
  /** The saloon and the 4×4; one of them is on duty each run. */
  models: VehicleModel[];
  col: Collider;
  park: { x: number; y: number; z: number; yaw: number };
  inspector: Officer;
  /** The inspector's collider, moved with him. */
  insCol: Collider;
  /** Where the inspector stands at the post, facing the road. */
  post: { x: number; z: number; yaw: number };
  /** Main-road distance of the post. */
  sPost: number;
  /** A third patrol car and its collider: the roadblock thrown across the asphalt in a long chase. */
  block: { model: VehicleModel; col: Collider };
}

/** What the encounter left on the driver's record. */
/** `bribe`: paid «без квитанции» — out of Timur's pocket, on no protocol (and no mark against the run). */
export type PoliceRecord = { kind: 'check' | 'warning' | 'fine' | 'arrest' | 'escape' | 'bribe'; fine: number; note: string };

/**
 * What Sergeant Kuzmin remembers of the post van across the service: how often they have met, the
 * envelopes taken and the ones refused, the times he let it go with a word. Kept in the profile.
 */
export interface GaiMemory { met: number; bribes: number; refused: number; warned: number }
export const freshGai = (): GaiMemory => ({ met: 0, bribes: 0, refused: 0, warned: 0 });

export interface PoliceEvents {
  say(speaker: string, line: string, stamp: string | null): void;
  toast(text: string, seconds?: number): void;
  whistle(): void;
  /** A line through the roof loudspeaker. */
  megaphone(line: string): void;
  /** Handcuffs, a slammed door: the click of an arrest. */
  cuffs(): void;
  /** Freeze the van (hands on the wheel) or let it go. */
  hold(on: boolean): void;
  /** Fade to black over a card; `mid` runs while the screen is dark. */
  blackout(title: string, text: string, seconds: number, mid: () => void, done: () => void): void;
  record(r: PoliceRecord): void;
  /** The patrol bumps the van's flank or tail: side −1 left / +1 right, power 0…1. */
  nudge?(side: number, power: number): void;
  /**
   * The documents are done and the inspector is still at the window: a look at the load. Return true
   * to hold the conversation (the inspection is told elsewhere) and call `done` when it is over.
   */
  inspect?(reason: 'speed' | 'check' | 'flee', done: () => void): boolean;
  /** The driver's answer at the window: the options, and `pick` with the index. Absent: the inspector just pronounces. */
  choice?(speaker: string, line: string, options: string[], pick: (i: number) => void): void;
  closeChoice?(): void;
}

type State = 'idle' | 'signal' | 'talk' | 'pursuit' | 'arrest' | 'bogged' | 'away' | 'cool';
type Reason = 'speed' | 'check' | 'flee' | 'ram';
/** Pursuit manoeuvre: sit on the van's tail, pull out to pass, cut in and brake. */
type Phase = 'tail' | 'overtake' | 'block';

const SPEAKER = 'Сержант Кузьмин, ГАИ';
const PARTNER = 'Лейтенант Белов, ГАИ';
const LOUD = 'Мегафон · ГАИ';
/** Radar "Барьер-2" reads from here; a little leniency over the 60 sign. */
const RADAR = 120;
/** The limit by the post. In the 90s there was no free margin: anything over sixty is a fine. */
const LIMIT = 60;
/** Walks up to the driver's window only from this close; farther away he talks from the post. */
const WALK_UP = 32;
/** Top speed and acceleration of the patrol car on asphalt, m/s and m/s². */
const VMAX = 33, ACCEL = 3.2, BRAKE = 7;
/** The patrol 4×4 is slower on the asphalt but goes where the saloon can't. */
const VMAX_SUV = 30, ACCEL_SUV = 2.7;
/** Gap at which the van has got away, metres. */
const ESCAPE = 320;
const _v = new THREE.Vector3();
/** Grip the patrol driver dares to use in a bend, m/s² (less on snow): what slows him before the curves. */
const LAT_G = 6.2;
/** Below this closing speed a touch on the patrol is a scrape, not a ram, m/s. */
const RAM = 2.5;
/** What a documents check can turn up: the line, the fine, the protocol's words. */
const FAULTS: [string, number, string][] = [
  ['Аптечка у вас… девяносто второго года. Просрочена.', 5000, 'просроченная аптечка'],
  ['Огнетушитель где? А, вот. Пустой. Манометр на нуле.', 5000, 'пустой огнетушитель'],
  ['Знак аварийный покажите. …Нету? А если встанешь на трассе?', 5000, 'нет знака аварийной остановки'],
  ['Талон техосмотра где? Под стеклом должен быть, а не в бардачке.', 10000, 'талон техосмотра не на месте'],
  ['Фара левая не горит. Днём, говоришь? А вечером?', 10000, 'неисправная фара'],
];
const BRIBE_OK = [
  'Кхм… Это что? Ладно. Квитанцию не выписываю — и чтоб я тебя на ста не видел.',
  'Ну, раз почта торопится… Давай. И быстро отсюда.',
  'Как обычно, значит. Езжай, почта. Деду привет.',
];
const CALLS = [
  'Водитель УАЗа! Немедленно остановитесь!',
  'Почта, прижмись к обочине! Кому сказано!',
  'Буханка, номер вижу! Остановитесь — хуже будет!',
  'Глуши мотор, гонщик! Всё равно догоним!',
];
const CALLS_DIRT = ['Ты куда в лес полез?! Стоять!', 'Почта! По грязи не уйдёшь — стой!'];

/**
 * GAI post behaviour: radar speed check and the odd documents check, the baton
 * signal, a short roadside conversation (warning or fine). A van that doesn't
 * pull over is chased: blue-and-red beacons and siren, calls through the
 * loudspeaker, and on the asphalt the patrol pulls out, passes and cuts in to
 * box the van. The post's car changes from run to run: the saloon gives up
 * where the forest track starts; the 4×4 follows onto it, slower in the ruts,
 * until the deepest bog swallows it while a van in 4×4 ploughs through.
 * Stopping, or ramming the patrol, ends in an arrest: both officers get out,
 * a protocol, handcuffs and two hours at the station.
 */
export class Police {
  state: State = 'idle';
  /** 0…1 for the audio engine. */
  siren = 0;
  /** Distance between the patrol and the van during a chase, metres. */
  gap = 0;
  /** Patrol car state for effects (dust, smoke) and the camera. */
  patrol = { x: 0, z: 0, yaw: 0, v: 0, braking: false };
  private dive = 0;
  private lean = 0;
  private nudgeT = 4;
  /** The roadblock ahead of a van that will not stop (asphalt only, once per run). */
  private roadblock = { on: false, used: false, x: 0, z: 0, yaw: 0 };
  private reason: Reason = 'check';
  private kmh = 0;
  private rolled = false;
  /** Odds the post stops a van for its papers as it rolls up (higher with something in the back). */
  checkOdds = 0.3;
  /** Kuzmin's memory of the van, across the service (the profile keeps it: main sets and takes it back). */
  memory: GaiMemory = freshGai();
  /** A captain from the region at the post today: everything by the book, no «договоримся». */
  strict = false;
  /** No radar, no checks (the prologue's drive, the first morning's lesson): until the next reset(). */
  quiet = false;
  /** A visit by arrangement (the first morning): who says what at the window, and what comes after. */
  private scripted: { lines: [string, string][]; i: number; gap: number; done: () => void } | null = null;
  /** Where the post's radar is today, main-road distance: the lay-by, or out on the road in a village. */
  get postS(): number { return this.p.sPost; }
  /** True while the post is out on the road today rather than at its lay-by. */
  get ambush(): boolean { return this.base.sPost !== this.p.sPost; }
  /** The lay-by's own places, to come back to after a day out on the road. */
  private readonly base: { post: GaiPatrol['post']; park: GaiPatrol['park']; sPost: number };
  /** A scrape on the patrol already told this chase (the next is a ram all the same only if hard). */
  private scraped = false;
  /** The fine named at the window while the driver makes up his mind. */
  private pending = { fine: 0, note: '' };
  /** Whether the load has been looked at in this conversation. */
  private inspected = false;
  private timer = 0;
  private step = 0;
  private car = {
    path: null as Path | null, d: 0, dir: 1, v: 0, merge: 0, lost: 0, x: 0, z: 0, yaw: 0, flash: false,
    /** Lateral offset from the centre line and where it's heading. */
    lat: 0, phase: 'tail' as Phase, phaseT: 0, close: 0, sink: 0, chaseT: 0, boxed: false,
  };
  private readonly f = { x: 0, z: 0, tx: 0, tz: 0 };
  private readonly f2 = { x: 0, z: 0, tx: 0, tz: 0 };
  /** The police's own entries in the traffic's actor list (the patrol in a chase, the roadblock). */
  private readonly own: Actor[] = [];
  /** The crew: the driver talks after a chase, his partner covers the passenger side. */
  private readonly drv = new Officer(false);
  private readonly mate = new Officer(false);
  private readonly inCar = new Set<Officer>();
  /** Who walks up to the van for the current conversation, if anyone. */
  private talker: Officer | null = null;
  private van = { x: 0, z: 0, yaw: 0 };
  private routedAt = { x: 0, z: 0 };
  private readonly eye = new THREE.Vector3();
  private callT = 0;
  private callI = 0;
  private readonly flashLight = new THREE.PointLight('#3c6cff', 0, 22, 1.6);
  private readonly junction: number;
  /** Which of the post's cars is on duty this run. */
  private cur = 0;
  private get model(): VehicleModel { return this.p.models[this.cur]; }
  /** The 4×4 follows onto the forest track; the saloon can't. */
  private get suv(): boolean { return this.model.kind === 'militiaSuv'; }
  private get crew() { return crewFor(this.model.kind as PoliceKind); }

  constructor(private ground: Ground, private traffic: Traffic, private p: GaiPatrol, private ev: PoliceEvents) {
    const h = (x: number, z: number) => ground.height(x, z);
    p.inspector.ground = h;
    this.drv.ground = h;
    this.mate.ground = h;
    this.junction = ground.marks.junction;
    this.base = { post: { ...p.post }, park: { ...p.park }, sPost: p.sPost };
    this.flashLight.position.set(0, 1.6, -0.4);
    this.duty(Math.random() < 0.5 ? 0 : 1);
  }

  /** Put one of the post's cars on duty, crew aboard; the other stays out of sight. */
  duty(i: number): void {
    this.cur = i;
    this.p.models.forEach((m, k) => { m.group.visible = k === i; if (k !== i) m.group.position.y = -50; });
    const m = this.model, col = this.p.col;
    col.hw = m.width / 2; col.hd = m.length / 2; col.r = Math.hypot(m.width, m.length) / 2;
    m.group.add(this.flashLight);
    this.flashLight.position.y = this.suv ? 1.95 : 1.6;
    this.seat(this.drv);
    this.seat(this.mate);
    this.home();
  }

  /** Readout for the HUD, or null when the police aren't after the van. */
  get alert(): string | null {
    if (this.state === 'pursuit') return this.car.phase === 'block' ? 'ГАИ подрезает — тормозите!' : `ГАИ · погоня · ${Math.round(this.gap)} м · оторвитесь или остановитесь`;
    if (this.state === 'signal') return 'ГАИ · жезл — остановитесь';
    if (this.state === 'arrest') return 'Задержание · руки на руль';
    return null;
  }

  /**
   * Today's post: at the lay-by (null), or out on the asphalt at main-road distance `s` — the
   * inspector on the verge with the radar, the car tucked behind him — in a village, where sixty is
   * the limit anyway. Takes effect with the next reset().
   */
  setPost(s: number | null): void {
    const p = this.p;
    if (s === null) {
      Object.assign(p.post, this.base.post); Object.assign(p.park, this.base.park); p.sPost = this.base.sPost;
      return;
    }
    const g = this.ground.main, f = g.frame(s), half = g.zoneAt(s).width / 2;
    const ix = f.x + f.rx * (half + 1.6), iz = f.z + f.rz * (half + 1.6);
    Object.assign(p.post, { x: ix, z: iz, yaw: Math.atan2(-f.rx, -f.rz) });
    const fk = g.frame(s - 10);
    const kx = fk.x + fk.rx * (half + 3.6), kz = fk.z + fk.rz * (half + 3.6);
    Object.assign(p.park, { x: kx, y: this.ground.height(kx, kz) + 0.02, z: kz, yaw: Math.atan2(-fk.tx, -fk.tz) + 0.08 });
    p.sPost = s;
  }

  reset(): void {
    this.car.path = null;
    this.scraped = false;
    this.quiet = false;
    this.scripted = null;
    this.state = 'idle';
    this.step = 0;
    this.rolled = false;
    this.siren = 0;
    this.clearBlock();
    this.roadblock.used = false;
    this.talker = null;
    for (const o of [this.drv, this.mate]) o.speed = 1.45;
    this.duty(Math.random() < 0.5 ? 0 : 1);
    const ins = this.p.inspector, post = this.p.post;
    ins.setMode('idle');
    ins.group.position.set(post.x, this.ground.height(post.x, post.z), post.z);
    ins.group.rotation.y = post.yaw;
  }

  /** The van hit something at `v` m/s; ramming the patrol during a chase is the end of it. */
  impact(v: number, px: number, pz: number): void {
    if (this.state !== 'pursuit' || v < 0.25) return;
    // a scrape at walking pace (the patrol leaning on the flank, a bumper kissed in the block) is not a ram
    const near = (this.roadblock.on && Math.hypot(this.roadblock.x - px, this.roadblock.z - pz) < 6.5) || Math.hypot(this.car.x - px, this.car.z - pz) <= 4.8;
    if (near && v < RAM) {
      if (!this.scraped) { this.scraped = true; this.ev.megaphone('Аккуратнее, почта! Ещё раз заденешь — пойдёшь за таран!'); }
      return;
    }
    if (this.roadblock.on && Math.hypot(this.roadblock.x - px, this.roadblock.z - pz) < 6.5) {
      this.reason = 'ram';
      this.ev.toast('Таран заграждения!', 2.4);
      this.arrest();
      return;
    }
    if (Math.hypot(this.car.x - px, this.car.z - pz) > 4.8) return;
    this.reason = 'ram';
    this.ev.toast('Таран патрульной машины!', 2.4);
    this.arrest();
  }

  // ------------------------------------------------------------ crew

  private seatOf(o: Officer) { return o === this.drv ? this.crew.driver : this.crew.partner; }

  /** Put an officer back in his seat. */
  private seat(o: Officer): void {
    this.model.group.add(o.group);
    o.group.position.copy(this.seatOf(o).seat);
    o.group.rotation.set(0, 0, 0);
    o.group.scale.setScalar(this.crew.scale);
    o.setMode('sit');
    // settle into the seat now: the crew is seen in the car before the run starts
    o.update(3);
    this.inCar.add(o);
  }

  /** An officer climbs out by his door, into world space. */
  private unseat(o: Officer): void {
    const car = this.model.group;
    const parent = car.parent;
    if (!parent || !this.inCar.has(o)) return;
    car.updateMatrixWorld();
    const door = this.seatOf(o).door;
    _v.copy(door).applyMatrix4(car.matrixWorld);
    parent.add(o.group);
    o.group.scale.setScalar(1);
    o.group.position.set(_v.x, this.ground.height(_v.x, _v.z), _v.z);
    o.group.rotation.set(0, this.car.yaw + (door.x > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
    o.setMode('idle');
    this.inCar.delete(o);
  }

  private get crewIn(): boolean { return this.inCar.has(this.drv) && this.inCar.has(this.mate); }

  /** World point in van-local metres: f forward, r to the right. */
  private vanPt(f: number, r: number): THREE.Vector3 {
    const { x, z, yaw } = this.van;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    return new THREE.Vector3(x - sy * f + cy * r, 0, z - cy * f - sy * r);
  }

  /** Path to the driver's (left) window, round the nose or tail of the van rather than through it. */
  private approach(o: Officer): void {
    const { x, z, yaw } = this.van;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const rx = o.group.position.x - x, rz = o.group.position.z - z;
    const lf = -sy * rx - cy * rz, lr = cy * rx - sy * rz;
    const pts: THREE.Vector3[] = [];
    if (lr > -1.3) {
      const cf = lf > 0.4 ? 3.1 : -3.0;
      if (lr > 1.3 && Math.abs(lf) < 2.8) pts.push(this.vanPt(cf, 1.7));
      pts.push(this.vanPt(cf, -1.65));
    }
    pts.push(this.vanPt(1.05, -1.5));
    this.routedAt = { x, z };
    o.walk(pts, () => this.arrived(o));
  }

  /** The partner covers the passenger side, a few steps off the van's right front. */
  private cover(o: Officer): void {
    const { x, z, yaw } = this.van;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const rx = o.group.position.x - x, rz = o.group.position.z - z;
    const lf = -sy * rx - cy * rz, lr = cy * rx - sy * rz;
    const pts: THREE.Vector3[] = [];
    if (lr < 1.3) pts.push(this.vanPt(lf > 0.4 ? 3.2 : -3.1, 2.2));
    pts.push(this.vanPt(1.9, 2.3));
    o.walk(pts);
  }

  private arrived(o: Officer): void {
    if ((this.state !== 'talk' && this.state !== 'arrest') || this.talker !== o || this.step !== -1) return;
    this.step = 0;
    this.timer = 0;
    o.setMode('salute');
    if (this.state === 'talk') { if (!this.scripted) this.greet(); }
    else this.arrestLine(0);
  }

  /** Back to his post, or back to the car and into his seat. */
  private sendBack(o: Officer): void {
    if (o === this.drv || o === this.mate) {
      if (this.inCar.has(o)) return;
      const car = this.model.group;
      car.updateMatrixWorld();
      _v.copy(this.seatOf(o).door).applyMatrix4(car.matrixWorld);
      o.walk([_v.clone()], () => this.seat(o));
    } else {
      const post = this.p.post;
      o.faceTo(post.yaw);
      o.walk([new THREE.Vector3(post.x, 0, post.z)], () => o.faceTo(post.yaw));
    }
  }

  // ------------------------------------------------------------ the car

  private home(): void {
    const { park, col } = this.p, model = this.model;
    model.group.position.set(park.x, park.y, park.z);
    model.group.rotation.set(0, park.yaw, 0);
    col.x = park.x; col.z = park.z; col.rot = park.yaw;
    const c = this.car;
    c.x = park.x; c.z = park.z; c.yaw = park.yaw;
    c.v = 0; c.flash = false; c.sink = 0;
    setBrake(model, false);
  }

  /** Pose on the current path at the car's distance and lateral offset. */
  private roadPose(): { x: number; z: number; yaw: number } {
    const c = this.car;
    const f = c.path!.frame(c.d, this.f);
    return { x: f.x - f.tz * c.lat, z: f.z + f.tx * c.lat, yaw: Math.atan2(c.dir * f.tx, c.dir * f.tz) };
  }

  private place(x: number, z: number, yaw: number, sink = 0): void {
    const { col } = this.p, model = this.model;
    const hx = Math.sin(yaw), hz = Math.cos(yaw), L = 1.5;
    const yf = this.ground.height(x + hx * L, z + hz * L), yb = this.ground.height(x - hx * L, z - hz * L);
    model.group.position.set(x, (yf + yb) / 2 + 0.02 - sink, z);
    model.group.rotation.set(-Math.atan2(yf - yb, L * 2) + sink * 0.25 + this.dive, yaw, this.lean, 'YXZ');
    col.x = x; col.z = z; col.rot = yaw;
    this.car.x = x; this.car.z = z; this.car.yaw = yaw;
    this.patrol.x = x; this.patrol.z = z; this.patrol.yaw = yaw;
  }

  /** Main-road distance under the patrol (dirt path) or -1 on the asphalt. */
  private dirtS(): number {
    const c = this.car;
    return c.path && c.path.name === 'dirt' ? this.junction + c.d : -1;
  }

  // ------------------------------------------------------------ talk

  private verdict(): void {
    const k = Math.round(this.kmh);
    if (this.reason === 'flee') {
      // with the lieutenant at the passenger door there is nothing to discuss
      this.ev.say(SPEAKER, 'Одумался, значит. Неподчинение — протокол и штраф пятьдесят тысяч. Ещё раз — поедешь в отдел.', 'Штраф');
      this.ev.record({ kind: 'fine', fine: 50000, note: 'неподчинение' });
      return;
    }
    if (this.reason === 'check') {
      // the papers, the kit: usually in order; on the captain's day he looks harder
      const f = Math.random() < (this.strict ? 0.6 : 0.35) ? FAULTS[Math.floor(Math.random() * FAULTS.length)] : null;
      if (!f || !this.ev.choice) {
        this.ev.say(SPEAKER, this.memory.met > 4 ? 'Всё на месте, как всегда. Езжай, Тимур, — деду привет.' : 'Аптечка, огнетушитель, знак аварийный… Порядок. Счастливого пути, почта.', 'Проверено');
        this.ev.record({ kind: 'check', fine: 0, note: 'проверка документов' });
        return;
      }
      this.offer(`${f[0]} Штраф ${rub(f[1])}.`, f[1], f[2], 'check', 0);
      return;
    }
    // any speed over the sign is a fine; the more over, the more it costs
    const over = k - LIMIT;
    const [fine, words] = over > 40 ? [40000, 'сорок тысяч'] : over > 20 ? [20000, 'двадцать тысяч'] : [10000, 'десять тысяч'];
    const line = over > 40 ? `${k} при знаке шестьдесят?! Штраф ${words}, и скажите спасибо, что не права.`
      : over > 20 ? `${k} при знаке шестьдесят. Штраф ${words} — квитанцию держите.`
      : `${k} км/ч, а знак — шестьдесят. Шестьдесят — это шестьдесят, а не «чуть-чуть». Штраф ${words}.`;
    if (!this.ev.choice) {
      this.ev.say(SPEAKER, line, 'Штраф');
      this.ev.record({ kind: 'fine', fine, note: `${k} км/ч при ${LIMIT}` });
      return;
    }
    this.offer(line, fine, `${k} км/ч при ${LIMIT}`, 'speed', over);
  }

  /** The fine is named: the driver answers — the receipt, «без квитанции», or a word for himself. */
  private offer(line: string, fine: number, note: string, kind: 'speed' | 'check', over: number): void {
    this.step = 5;
    this.timer = 0;
    this.pending = { fine, note };
    const m = this.memory;
    // once he has taken a few, the price of «без квитанции» creeps up
    const bribe = Math.max(2000, Math.round((fine * (m.bribes >= 3 ? 0.75 : 0.5)) / 1000) * 1000);
    const plea = kind === 'speed' ? 'Пенсии везу, товарищ сержант. Бабушки ждут…' : 'Завтра же куплю, честное слово';
    this.ev.choice!(SPEAKER, line, ['Выписывайте квитанцию', `Может, без квитанции? (сунуть ${rub(bribe)})`, plea], (i) => {
      if (this.state !== 'talk' || this.step !== 5) return;
      this.answer(i, fine, bribe, note, kind, over);
    });
  }

  private answer(i: number, fine: number, bribe: number, note: string, kind: 'speed' | 'check', over: number): void {
    const m = this.memory;
    this.step = 1;
    this.timer = 0;
    if (i === 1) {
      // he takes it on an ordinary day, and the more readily the more often he has; never under the captain's eye
      if (!this.strict && Math.random() < (m.bribes > 0 ? 0.9 : 0.72) - Math.min(2, m.refused) * 0.1) {
        m.bribes++;
        this.ev.say(SPEAKER, BRIBE_OK[Math.min(BRIBE_OK.length - 1, m.bribes - 1)], null);
        this.ev.record({ kind: 'bribe', fine: bribe, note: 'без квитанции' });
      } else {
        m.refused++;
        this.ev.say(SPEAKER, this.strict
          ? 'Ты что, ослеп? Капитан из области вон стоит! Убери… Штраф по полной — и вдвойне, за находчивость.'
          : 'Ты мне что суёшь?! Сотруднику при исполнении? Убери. Штраф вдвойне — и скажи спасибо, что не протокол о взятке.', 'Штраф');
        this.ev.record({ kind: 'fine', fine: fine * 2, note: `${note}, попытка «договориться»` });
      }
      return;
    }
    if (i === 2) {
      // a word for himself: a couple of times in the service, more for a driver who has never tried to pay him off
      const allowance = m.met >= 5 && m.bribes === 0 ? 4 : 2;
      if (!this.strict && m.warned < allowance && (kind === 'check' || over <= 20)) {
        m.warned++;
        this.ev.say(SPEAKER, kind === 'speed' ? 'Пенсии, говоришь… Ладно, почта. Первый и последний раз — и чтоб шестьдесят!' : 'Завтра, значит. Ладно — завтра и проверю. Езжай.', 'Предупреждение');
        this.ev.record({ kind: 'warning', fine: 0, note });
        return;
      }
      this.ev.say(SPEAKER, kind === 'speed' ? 'У всех бабушки, все спешат. Квитанцию держи.' : 'Завтра, завтра… А штраф — сегодня.', 'Штраф');
      this.ev.record({ kind: 'fine', fine, note });
      return;
    }
    this.ev.say(SPEAKER, 'Вот квитанция. Сбербанк, в течение месяца. Счастливого пути.', 'Штраф');
    this.ev.record({ kind: 'fine', fine, note });
  }

  update(dt: number, t: number, px: number, pz: number, pvx: number, pvz: number, pyaw = 0): void {
    const ins = this.p.inspector;
    const ip = ins.group.position;
    const dIns = Math.hypot(ip.x - px, ip.z - pz);
    const speed = Math.hypot(pvx, pvz);
    const kmh = speed * 3.6;
    const c = this.car;
    this.timer += dt;
    this.van.x = px; this.van.z = pz; this.van.yaw = pyaw;
    // the driver's head, for whoever is watching or talking
    const head = this.vanPt(1.08, -0.42);
    this.eye.set(head.x, 0, head.z);

    if (this.state === 'idle') {
      // approaching only: closing on the post
      const closing = (ip.x - px) * pvx + (ip.z - pz) * pvz > 0;
      if (this.quiet) { /* nobody stops the van today */ }
      else if (dIns < RADAR && closing && kmh > LIMIT + 0.5) this.signal('speed', kmh);
      else if (!this.rolled && dIns < 60 && closing && kmh > 5) {
        this.rolled = true;
        if (Math.random() < this.checkOdds) this.signal('check', kmh);
      }
    } else if (this.state === 'signal') {
      if (this.reason === 'speed') this.kmh = Math.max(this.kmh, dIns < RADAR ? kmh : 0);
      const away = (px - ip.x) * pvx + (pz - ip.z) * pvz > 0;
      if (speed < 1 && (dIns < 50 || (dIns < 130 && this.timer > 3))) this.talk();
      else if (dIns > 60 && away && this.timer > 1.5) this.pursue(px, pz);
      else if (dIns > 200) this.state = 'idle';
    } else if (this.state === 'talk') {
      const o = this.talker;
      if (this.step === -1) {
        // walking up; follow the van if it creeps forward, give up waiting after a while
        if (o && Math.hypot(px - this.routedAt.x, pz - this.routedAt.z) > 2.5 && speed < 1) this.approach(o);
        if (this.timer > 40) { this.step = 0; this.timer = 0; if (!this.scripted) this.greet(); }
      } else if (this.step === 0 && this.scripted) {
        // a word between old acquaintances at the window, line by line
        const sc = this.scripted;
        if (o && o.mode === 'salute' && this.timer > 1.6) o.setMode('talk');
        if (this.timer > sc.gap) {
          this.timer = 0;
          if (sc.i < sc.lines.length) {
            const [who, line] = sc.lines[sc.i++];
            this.ev.say(who, line, null);
            sc.gap = 2 + line.length * 0.05;
          } else this.endVisit(o);
        }
      } else if (this.step === 0) {
        if (o && o.mode === 'salute' && this.timer > 1.6) o.setMode('talk');
        if (this.timer > 3.4 + (o ? 1.4 : 0)) { this.step = 1; this.timer = 0; this.verdict(); }
      } else if (this.step === 5 && this.timer > 30) {
        // no answer at the window: the receipt, then
        this.ev.closeChoice?.();
        this.ev.say(SPEAKER, 'Молчишь? Ну, значит, квитанция.', null);
        this.step = 1; this.timer = 0;
        this.ev.record({ kind: 'fine', fine: this.pending.fine, note: this.pending.note });
      } else if (this.step === 1 && this.timer > 5.5) {
        // and before the van goes: what's in the back?
        if (!this.inspected && this.reason !== 'ram') {
          this.inspected = true;
          if (this.ev.inspect?.(this.reason, () => { if (this.state === 'talk' && this.step === 4) this.release(o); })) { this.step = 4; this.timer = 0; }
          else this.release(o);
        } else this.release(o);
      }
      // drove off in the middle of a friendly word: just the end of it
      if (this.state === 'talk' && this.scripted && speed > 3) this.endVisit(o);
      // drove off mid-conversation (or mid-search): now it's a chase
      if (this.state === 'talk' && (this.step <= 0 || this.step === 4 || this.step === 5) && speed > 3 && Math.hypot(c.x - px, c.z - pz) > 25) {
        if (this.step === 5) this.ev.closeChoice?.();
        if (o) { this.sendBack(o); this.talker = null; }
        if (c.path) this.startChase(); else this.pursue(px, pz);
      }
    } else if (this.state === 'pursuit') {
      this.chase(dt, px, pz, speed);
    } else if (this.state === 'arrest') {
      this.arresting(dt);
    } else if (this.state === 'bogged') {
      // wheels spinning in the slurry, then the driver climbs out to look
      c.sink = Math.min(0.16, c.sink + dt * 0.05);
      if (this.timer < 5) rollWheels(this.model, dt * 9 * (1 - this.timer / 5));
      const rp = this.roadPose();
      this.place(rp.x, rp.z, rp.yaw, c.sink + Math.sin(t * 31) * 0.006 * Math.max(0, 1 - this.timer / 5));
      if (this.timer > 3 && this.inCar.has(this.drv)) {
        this.unseat(this.drv);
        const car = this.model.group;
        car.updateMatrixWorld();
        this.drv.walk([new THREE.Vector3(1.0, 0, 2.3).applyMatrix4(car.matrixWorld)], () => this.drv.faceTo(c.yaw + Math.PI));
      }
      c.flash = this.timer < 8;
      if (Math.hypot(c.x - px, c.z - pz) > 260) this.goHome();
    } else if (this.state === 'away') {
      if (c.path && this.crewIn) {
        c.v = damp(c.v, 0, 2, dt);
        c.d += c.dir * c.v * dt;
        const rp = this.roadPose();
        this.place(rp.x, rp.z, rp.yaw);
        rollWheels(this.model, c.v * dt);
        c.flash = this.timer < 4;
      }
      if (Math.hypot(c.x - px, c.z - pz) > 220 && dIns > 220) this.goHome();
    } else if (this.state === 'cool') {
      if (dIns > 260 && !this.talker) { this.state = 'idle'; this.rolled = true; }
    }

    // after the parting salute, walk back (inspector to the post, crew to the car)
    if (this.step === 2 && this.talker && this.timer > 1.4) {
      this.sendBack(this.talker);
      this.talker = null;
      this.step = 3;
    }
    this.animate(dt, dIns);
    setBeacons(this.model, t, c.flash);
    // the blue strobe washes the verges at dusk and in the rain
    const odd = Math.floor(t * 5) % 2 === 0;
    this.flashLight.color.setHex(odd ? 0x3c6cff : 0xff2a22);
    this.flashLight.distance = this.state === 'pursuit' ? 34 : 22;
    this.flashLight.intensity = c.flash ? (this.state === 'pursuit' ? 6 : 2.2) * (Math.floor(t * 10) % 2 === 0 || this.state !== 'pursuit' ? 1 : 0.35) : 0;
    const dist = Math.hypot(c.x - px, c.z - pz);
    const wail = this.state === 'pursuit' ? clamp(1 - dist / 320, 0, 1) ** 1.3 : this.state === 'bogged' ? clamp(1 - this.timer / 4, 0, 1) * 0.6 : 0;
    this.siren = damp(this.siren, wail, 4, dt);
    // tell the traffic about the patrol and the roadblock (only the police's own: others — a block by
    // the sawmill, a car across the lane — stay in the list)
    const acts = this.traffic.actors;
    for (const a of this.own) { const i = acts.indexOf(a); if (i >= 0) acts.splice(i, 1); }
    this.own.length = 0;
    const push = (a: Actor) => { acts.push(a); this.own.push(a); };
    if (this.state === 'pursuit' && this.car.path) {
      const cc = this.car;
      push({ x: cc.x, z: cc.z, vx: Math.sin(cc.yaw) * cc.v, vz: Math.cos(cc.yaw) * cc.v, yaw: cc.yaw, hw: this.model.width / 2, hl: this.model.length / 2, siren: true, path: cc.path ?? undefined, d: cc.d, dir: cc.dir });
    }
    if (this.roadblock.on) {
      if (this.state !== 'pursuit') this.clearBlock();
      else {
        const rb = this.roadblock;
        push({ x: rb.x, z: rb.z, vx: 0, vz: 0, yaw: rb.yaw, hw: 0.9, hl: 2.1 });
        setBeacons(this.p.block.model, t, true);
      }
    }
  }

  /** Back to the lay-by with the whole crew, out of sight of the van. */
  private goHome(): void {
    for (const o of [this.drv, this.mate]) { if (!this.inCar.has(o)) this.seat(o); o.speed = 1.45; }
    this.car.path = null;
    this.talker = null;
    this.home();
    this.state = 'cool';
  }

  /** Poses and gaze for the inspector and the crew, from the current state. */
  private animate(dt: number, dIns: number): void {
    const ins = this.p.inspector;
    const busy = (o: Officer) => o === this.talker || o.walking;
    if (!busy(ins)) {
      if (this.state === 'signal') { ins.setMode('signal'); ins.lookAt(this.eye); }
      else {
        if (ins.mode !== 'idle') ins.setMode('idle');
        ins.lookAt(dIns < 70 || this.state === 'pursuit' ? this.eye : null);
        ins.faceTo(this.p.post.yaw);
      }
    } else if (ins === this.talker && this.step >= 0) ins.lookAt(this.eye);
    else if (ins.walking) ins.lookAt(null);
    for (const o of [this.drv, this.mate]) {
      if (this.inCar.has(o)) o.lookAt(Math.hypot(this.car.x - this.eye.x, this.car.z - this.eye.z) < 45 ? this.eye : null);
      else if (o === this.talker && this.step >= 0) o.lookAt(this.eye);
      else if (o.walking) o.lookAt(null);
      else if (this.state === 'bogged' && o === this.drv) { o.setMode('idle'); o.lookAt(null); }
      else { o.setMode('idle'); o.lookAt(this.eye); }
      o.update(dt);
    }
    ins.update(dt);
    this.p.insCol.x = ins.group.position.x;
    this.p.insCol.z = ins.group.position.z;
  }

  private signal(reason: Reason, kmh: number): void {
    this.state = 'signal';
    this.reason = reason;
    this.kmh = kmh;
    this.timer = 0;
    this.ev.whistle();
    this.ev.toast(reason === 'speed' ? `Радар ГАИ: ${Math.round(kmh)} км/ч при 60 — инспектор требует остановиться` : 'Инспектор ГАИ машет жезлом — прижмитесь к обочине', 3.2);
  }

  /**
   * The van has pulled in at the post by arrangement (the first morning: the grandfather wants a
   * word with Kuzmin): the inspector walks up to the window and the `lines` are said in turn; no
   * check, no fine. `done` when it is over (or the van drives off). False if the post is busy.
   */
  visit(lines: [string, string][], done: () => void): boolean {
    if (this.state !== 'idle' && this.state !== 'cool') return false;
    this.memory.met = Math.max(1, this.memory.met);
    this.scripted = { lines, i: 0, gap: 0.8, done };
    this.reason = 'check';
    this.state = 'talk';
    this.timer = 0;
    this.inspected = true;
    const ins = this.p.inspector;
    const nearIns = Math.hypot(ins.group.position.x - this.van.x, ins.group.position.z - this.van.z) < 60;
    this.talker = nearIns ? ins : null;
    if (this.talker) { this.step = -1; this.approach(this.talker); } else this.step = 0;
    return true;
  }

  private endVisit(o: Officer | null): void {
    const sc = this.scripted;
    if (!sc) return;
    this.scripted = null;
    this.state = 'cool';
    this.timer = 0;
    this.step = 1;
    if (o) { o.setMode('salute'); this.step = 2; }
    sc.done();
  }

  /** The conversation is over: on your way. */
  private release(o: Officer | null): void {
    const c = this.car;
    this.ev.toast(this.reason === 'check' ? 'Проверка документов пройдена' : 'Инспектор отпустил — можно ехать', 2.4);
    this.state = c.path ? 'away' : 'cool';
    this.timer = 0;
    this.step = 1;
    if (o) { o.setMode('salute'); this.step = 2; }
  }

  private talk(): void {
    this.state = 'talk';
    this.timer = 0;
    this.inspected = false;
    // after a chase the patrol driver gets out; at the post the inspector walks over if close
    const ins = this.p.inspector;
    const nearIns = Math.hypot(ins.group.position.x - this.van.x, ins.group.position.z - this.van.z) < WALK_UP;
    if (this.car.path) { this.unseat(this.drv); this.talker = this.drv; }
    else this.talker = nearIns ? ins : null;
    if (this.talker) {
      this.step = -1;
      this.approach(this.talker);
      this.ev.toast('Инспектор идёт к машине — ждите', 2.4);
    } else {
      this.step = 0;
      this.greet();
    }
  }

  private greet(): void {
    if (this.reason === 'flee') { this.ev.say(SPEAKER, 'Ну что, гонщик, догнали? Права и путевой лист — из машины не выходить.', null); return; }
    // he knows the post van by now; and the captain's day he says so, for the driver's own good
    const m = this.memory;
    const known = m.met === 0 ? 'Сержант Кузьмин. Документики ваши и путевой лист, пожалуйста.'
      : m.met < 4 ? 'Опять почта. Документики, путевой лист.'
      : m.bribes >= 3 ? 'А, почта. Ну что, как обычно? Документы давай для порядка.'
      : 'Тимур, здорово. Как дед, ходит? Документы давай — порядок есть порядок.';
    m.met++;
    this.ev.say(SPEAKER, this.strict ? `${known} И без глупостей: у нас сегодня капитан из области.` : this.ambush ? `${known} Что, не ждал нас тут?` : known, null);
  }

  // ------------------------------------------------------------ chase

  private pursue(px: number, pz: number): void {
    const path = this.traffic.paths[0];
    // a van that slipped past along the verge or across the field is still on the patrol's road for the chase
    let pl = this.traffic.locate(px, pz);
    if (!pl) {
      const sNear = this.ground.main.nearestS(px, pz);
      const f = this.ground.main.frame(sNear);
      if (sNear < this.junction && Math.hypot(f.x - px, f.z - pz) < 80) pl = { path, d: sNear, lat: 0 };
    }
    if (!pl || pl.path !== path) { this.state = 'cool'; return; }
    const c = this.car;
    c.path = path;
    c.d = this.p.sPost;
    c.dir = pl.d >= c.d ? 1 : -1;
    c.v = 2; c.merge = 0; c.lost = 0; c.flash = true;
    c.lat = this.traffic.laneAt(path, c.d, c.dir);
    c.chaseT = 0;
    this.ev.whistle();
    this.ev.toast('Патруль ГАИ с мигалкой — за вами!', 2.6);
    this.startChase();
  }

  private startChase(): void {
    const c = this.car;
    this.reason = 'flee';
    this.state = 'pursuit';
    this.timer = 0;
    c.phase = 'tail'; c.phaseT = 0; c.close = 0; c.boxed = false;
    this.callT = 2.5;
  }

  private call(dirt: boolean): void {
    const list = dirt ? CALLS_DIRT : CALLS;
    this.ev.megaphone(list[this.callI++ % list.length]);
    this.callT = 7 + Math.random() * 3;
  }

  /** The speed for the sharpest bend in the next ~60 m of road, from the heading change over 20 m stretches. */
  private bendCap(path: Path, d: number, dir: number, ice: number): number {
    let cap = 1e3;
    const a = path.frame(clamp(d, 0, path.length), this.f2);
    let ax = a.tx, az = a.tz;
    for (let k = 1; k <= 3; k++) {
      const dd = clamp(d + dir * k * 20, 0, path.length);
      const b = path.frame(dd, this.f2);
      const turn = Math.abs(Math.atan2(ax * b.tz - az * b.tx, ax * b.tx + az * b.tz));
      if (turn > 0.02) {
        // radius of that stretch, and the room left to brake for it
        const r = 20 / turn;
        const vb = Math.sqrt(LAT_G * ice * r);
        cap = Math.min(cap, Math.sqrt(vb * vb + 2 * BRAKE * 0.6 * ice * Math.max(0, (k - 1) * 20)));
      }
      ax = b.tx; az = b.tz;
    }
    return cap;
  }

  /** How fast the patrol 4×4 goes on the dirt track at main-road distance s. */
  private dirtCap(s: number): number {
    const g = this.ground.main;
    let cap = 12.5;
    for (const h of g.holes) if (Math.abs(h.s - s) < 9) cap = Math.min(cap, 7.5);
    const bog = g.bogAt(s);
    if (bog > 0.05) cap = Math.min(cap, lerp(10, 3, bog));
    if (g.zoneAt(s).surface === 'mud') cap = Math.min(cap, 4);
    return cap;
  }

  private chase(dt: number, px: number, pz: number, speed: number): void {
    const c = this.car;
    const paths = this.traffic.paths;
    const pl = this.traffic.locate(px, pz);
    c.chaseT += dt;
    c.phaseT += dt;
    // the van turned off onto the forest track: the 4×4 follows it at the
    // junction; the saloon would leave its sump on the first rut and gives up
    if (c.path === paths[0] && pl && pl.path === paths[1] && c.d > this.junction - 25 && c.dir > 0) {
      if (!this.suv) {
        this.state = 'away';
        this.timer = 0;
        this.ev.megaphone('Ушёл в лес, зараза… На легковой туда не сунешься!');
        this.ev.toast('Легковой патруль на грунтовку не полез — ушли от погони!', 3.2);
        this.ev.record({ kind: 'escape', fine: 0, note: 'ушёл в лес' });
        return;
      }
      c.path = paths[1];
      c.d = Math.max(0, c.d - this.junction);
      c.phase = 'tail';
      this.ev.megaphone('В лес?! Думаешь, по лесу не догоним? Стоять, почта!');
      this.callT = 6;
    }
    const path = c.path!;
    const on = pl && pl.path === path;
    c.lost = on ? 0 : c.lost + dt;
    const gap = on ? c.dir * (pl!.d - c.d) : 60;
    this.gap = Math.max(0, Math.hypot(c.x - px, c.z - pz) - 4);
    const sDirt = this.dirtS();
    const dirt = sDirt >= 0;
    // on snow the patrol driver is as careful as anyone: less speed, softer throttle and brakes
    const ice = 1 - this.ground.snow * (dirt ? 0.15 : 0.3);
    const vtop = (this.suv ? VMAX_SUV : VMAX) * ice;
    let vmax = dirt ? this.dirtCap(sDirt) : vtop;
    // and he lifts for the bends: the heading change over the road ahead, the speed the grip allows through it
    vmax = Math.min(vmax, this.bendCap(path, c.d, c.dir, ice));
    const lane = this.traffic.laneAt(path, c.d, c.dir);

    // manoeuvre: on the asphalt, after a few seconds on the van's tail, pull out,
    // pass and cut in ahead of it, braking to box it in
    let target: number;
    let latT = lane;
    if (c.phase === 'tail') {
      c.close = on && gap < 18 && speed > 7 ? c.close + dt : Math.max(0, c.close - dt);
      if (gap > 40) target = vmax;
      else if (gap > 16) target = Math.min(vmax, speed + 3 + (gap - 16) * 0.25);
      else target = Math.min(vmax, Math.max(0, speed + (gap - 11) * 0.8));
      if (!dirt && c.close > 2 && c.merge >= 1) { c.phase = 'overtake'; c.phaseT = 0; this.ev.megaphone('Прижимаю! Тормози, почта!'); this.callT = 6; }
    } else if (c.phase === 'overtake') {
      latT = -lane;
      target = Math.min(vtop + 3, vmax + 3, speed + 6);
      if (gap < -8) { c.phase = 'block'; c.phaseT = 0; }
      else if (gap > 34 || c.phaseT > 14 || dirt) { c.phase = 'tail'; c.close = 0; }
    } else {
      // ahead of the van: swing into its lane and brake, staying just in front
      // of its bumper so it has to stop too
      latT = lane * 0.6;
      const ahead = -gap;
      target = ahead > 10 ? Math.max(0, speed - 3 - (ahead - 10) * 0.5) : ahead < 6 ? speed + 0.5 : Math.max(0, speed - 2.5);
      c.boxed = true;
      if (gap > 2 || dirt) { c.phase = 'tail'; c.close = -2; c.phaseT = 0; }
    }
    if (c.merge < 1) target = Math.min(target, 6);
    // never drive through other people's cars: brake for whatever is in the patrol's lane, and
    // give up an overtake when something is coming the other way
    const lead = this.traffic.lead(path, c.d, c.dir, c.lat, 110);
    if (lead) {
      if (c.phase === 'overtake' && lead.oncoming && lead.gap < 120) { c.phase = 'tail'; c.close = -3; c.phaseT = 0; }
      target = Math.min(target, stopSpeed(lead.gap - lead.len / 2 - 2.3 - 3.5, lead.v));
      if (lead.gap < 25 && !lead.oncoming && c.v > lead.v + 1) this.nudgeT = Math.max(this.nudgeT, 3);
    }
    // a long chase on the asphalt and the van will not stop: radio ahead, a second car across the road
    if (!dirt && !this.roadblock.on && !this.roadblock.used && c.chaseT > 30 && on && speed > 8 && c.merge >= 1) this.throwBlock(pl!, dirt);
    // the driver is still walking back to the car
    if (!this.inCar.has(this.drv)) target = 0;
    const braking = target < c.v - 0.3;
    c.v = braking ? Math.max(target, c.v - BRAKE * (0.45 + 0.55 * ice) * dt) : Math.min(target, c.v + (this.suv ? ACCEL_SUV : ACCEL) * ice * dt);
    const lastLat = c.lat;
    c.lat = damp(c.lat, latT, c.phase === 'tail' ? 2 : 1.4, dt);
    // the body dives under braking, squats under power and rolls into the lane change
    this.dive = damp(this.dive, braking ? -0.05 : c.v < target - 0.5 ? 0.03 : 0, 5, dt);
    this.lean = damp(this.lean, clamp(((c.lat - lastLat) / Math.max(dt, 1e-3)) * c.dir * -0.012 * Math.min(1, c.v / 12), -0.1, 0.1), 5, dt);
    this.patrol.v = c.v; this.patrol.braking = braking;
    // close on the tail, the patrol leans on the van: a bump on the flank to scare it into stopping
    this.nudgeT -= dt;
    if (c.phase === 'tail' && on && gap > 2 && gap < 7 && speed > 12 && c.merge >= 1 && this.nudgeT < 0) {
      this.nudgeT = 5 + Math.random() * 5;
      this.ev.nudge?.(Math.random() < 0.5 ? -1 : 1, 0.4 + Math.random() * 0.4);
    }
    c.d = clamp(c.d + c.dir * c.v * dt, 2, path.length - 2);
    rollWheels(this.model, c.v * dt);
    setBrake(this.model, braking);
    const rp = this.roadPose();
    // nose into the lane change
    const steer = c.v > 1 ? Math.atan2((c.lat - lastLat) / dt, c.v) * -c.dir : 0;
    if (c.merge < 1) {
      // roll out of the lay-by onto the road over a couple of seconds
      c.merge = Math.min(1, c.merge + dt / 2.4);
      const k = c.merge * c.merge * (3 - 2 * c.merge);
      const pk = this.p.park;
      let dy = rp.yaw - pk.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.place(lerp(pk.x, rp.x, k), lerp(pk.z, rp.z, k), pk.yaw + dy * k);
    } else this.place(rp.x, rp.z, rp.yaw + steer);

    this.callT -= dt;
    if (this.callT < 0 && c.merge >= 1) this.call(dirt);

    // the deepest waterlogged hollows are too much even for the 4×4 on road tyres
    if (dirt) {
      const bog = this.ground.main.bogAt(sDirt);
      c.sink = bog > 0.86 ? c.sink + dt * bog : Math.max(0, c.sink - dt);
      if (c.sink > 1.6) { this.bog(); return; }
    }
    // the van stopped with the patrol on it
    if (speed < 1 && c.merge >= 1 && Math.hypot(c.x - px, c.z - pz) < (c.boxed ? 60 : 22) && c.v < 2) {
      // a quick change of heart is a fine; a real chase ends in the station
      if (c.chaseT < 14 && !c.boxed) this.talk(); else this.arrest();
      return;
    }
    if (c.lost > 8 || (on && gap > ESCAPE) || c.chaseT > 160) {
      this.state = 'away';
      this.timer = 0;
      this.ev.megaphone('Ушёл, зараза…');
      this.ev.toast('Оторвались от погони!', 2.8);
      this.ev.record({ kind: 'escape', fine: 0, note: 'ушёл от погони' });
    }
  }

  /** Park the second patrol car across the road far ahead of the van, leaving a gap on one side. */
  private throwBlock(pl: { path: Path; d: number }, dirt: boolean): void {
    const path = pl.path;
    if (dirt || path !== this.traffic.paths[0] || !this.p.block) return;
    const c = this.car;
    const dRB = pl.d + c.dir * 300;
    if (dRB < 60 || dRB > this.junction - 60 || dRB > path.length - 40) return;
    const f = path.frame(dRB, this.f);
    const side = c.dir * 1.9;
    const x = f.x - f.tz * side, z = f.z + f.tx * side;
    const yaw = Math.atan2(f.tx, f.tz) + Math.PI / 2;
    const { model, col } = this.p.block;
    model.group.visible = true;
    model.group.position.set(x, this.ground.height(x, z) + 0.02, z);
    model.group.rotation.set(0, yaw, 0);
    col.x = x; col.z = z; col.rot = yaw; col.hw = model.width / 2; col.hd = model.length / 2; col.r = Math.hypot(col.hw, col.hd);
    this.roadblock = { on: true, used: true, x, z, yaw };
    this.ev.megaphone('Всем постам! Буханка идёт на вас — перекрыть дорогу!');
    this.ev.toast('Впереди заграждение ГАИ!', 3);
  }

  private clearBlock(): void {
    if (!this.roadblock.on) return;
    this.roadblock.on = false;
    const { model, col } = this.p.block;
    model.group.visible = false;
    col.x = 1e9; col.z = 1e9;
  }

  private bog(): void {
    const c = this.car;
    this.state = 'bogged';
    this.timer = 0;
    c.v = 0;
    c.sink = 0.02;
    setBrake(this.model, false);
    this.ev.megaphone('Сели… Ну, почта, попадёшься ты мне ещё!');
    this.ev.toast('Внедорожник ГАИ засел в болоте по самые пороги — ушли от погони!', 3.4);
    this.ev.record({ kind: 'escape', fine: 0, note: 'патруль засел в болоте' });
  }

  // ------------------------------------------------------------ arrest

  private arrest(): void {
    const c = this.car;
    this.state = 'arrest';
    this.timer = 0;
    this.step = -2;
    c.flash = true;
    this.ev.hold(true);
    this.ev.megaphone(this.reason === 'ram' ? 'Стоять! Руки на руль!' : 'Глуши мотор! Руки на руль!');
  }

  private arrestLine(i: number): void {
    const ram = this.reason === 'ram';
    if (i === 0) this.ev.say(SPEAKER, ram ? 'Ты что творишь?! Патрульную машину таранить! Руки на руль, из машины не выходить!' : 'Приехали, гонщик. Руки на руль, чтоб я видел. Права и путевой лист — медленно.', null);
    else if (i === 1) this.ev.say(PARTNER, 'Серёга, глянь — почта. Посылки, пенсии… На бандита не похож.', null);
    else this.ev.say(SPEAKER, ram
      ? 'Таран, неподчинение, превышение. Штраф сто пятьдесят тысяч, протокол — и в отдел, там разберутся.'
      : 'Неподчинение требованию остановиться, превышение. Штраф семьдесят пять тысяч, протокол — и прокатишься с нами в отдел.', 'Протокол');
  }

  private arresting(dt: number): void {
    const c = this.car;
    // the patrol rolls up close behind the van (or stops dead if it's in front)
    if (c.path) {
      const hx = Math.sin(c.yaw), hz = Math.cos(c.yaw);
      const behind = (this.van.x - c.x) * hx + (this.van.z - c.z) * hz > 0;
      const room = Math.hypot(this.van.x - c.x, this.van.z - c.z) - 4.5;
      const want = behind && this.step === -2 ? Math.sqrt(2 * 4 * Math.max(0, room - 3)) : 0;
      c.v = want < c.v ? Math.max(want, c.v - 8 * dt) : Math.min(want, c.v + 2 * dt);
      c.d = clamp(c.d + c.dir * c.v * dt, 2, c.path.length - 2);
      rollWheels(this.model, c.v * dt);
      setBrake(this.model, true);
      const rp = this.roadPose();
      this.place(rp.x, rp.z, rp.yaw);
    }
    if (this.step === -2 && c.v < 0.3 && this.timer > 1) {
      // both doors open: the driver to the window, his partner round the passenger side
      this.unseat(this.drv);
      this.unseat(this.mate);
      this.talker = this.drv;
      this.step = -1;
      this.timer = 0;
      // a brisk step, not a stroll
      this.drv.speed = this.mate.speed = 2.1;
      this.approach(this.drv);
      this.cover(this.mate);
      this.ev.toast('Задержание — не двигайтесь', 2.4);
    } else if (this.step === -1 && this.timer > 12) {
      this.step = 0; this.timer = 0; this.arrestLine(0);
    } else if (this.step === 0) {
      if (this.drv.mode === 'salute' && this.timer > 1.4) this.drv.setMode('talk');
      if (this.timer > 4.8) { this.step = 1; this.timer = 0; this.arrestLine(1); }
    } else if (this.step === 1 && this.timer > 4.2) {
      this.step = 4; this.timer = 0; this.arrestLine(2);
      const fine = this.reason === 'ram' ? 150000 : 75000;
      this.ev.record({ kind: 'arrest', fine, note: this.reason === 'ram' ? 'таран патрульной машины' : 'неподчинение, погоня' });
    } else if (this.step === 4 && this.timer > 5.4) {
      this.step = 5;
      this.ev.cuffs();
      this.ev.blackout('Отделение ГАИ · Ключевск',
        'Два часа на казённой скамейке, протокол в трёх экземплярах, чай в гранёном стакане. Начальник отдела махнул рукой: «А почту кто повезёт — я?» Отпустили под честное слово.',
        6.5,
        () => {
          // while the screen is dark the crew drives back to its lay-by
          this.goHome();
          this.state = 'arrest';
        },
        () => {
          this.state = 'cool';
          this.step = 3;
          this.ev.hold(false);
          this.ev.toast(`Отпустили. Штраф ${rub(this.reason === 'ram' ? 150000 : 75000)} — рейс продолжается`, 3.2);
        });
    }
  }
}
