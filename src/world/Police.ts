import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math';
import { crewFor, type PoliceKind } from './Cars';
import type { Ground } from './Ground';
import { Officer } from './Officer';
import type { Collider } from './Props';
import type { Path, Traffic } from './Traffic';
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
}

/** What the encounter left on the driver's record. */
export type PoliceRecord = { kind: 'check' | 'warning' | 'fine' | 'arrest' | 'escape'; fine: number; note: string };

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
const TOLERANCE = 72;
/** Walks up to the driver's window only from this close; farther away he talks from the post. */
const WALK_UP = 32;
/** Top speed and acceleration of the patrol car on asphalt, m/s and m/s². */
const VMAX = 33, ACCEL = 3.2, BRAKE = 7;
/** The patrol 4×4 is slower on the asphalt but goes where the saloon can't. */
const VMAX_SUV = 30, ACCEL_SUV = 2.7;
/** Gap at which the van has got away, metres. */
const ESCAPE = 320;
const _v = new THREE.Vector3();

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
  private reason: Reason = 'check';
  private kmh = 0;
  private rolled = false;
  private timer = 0;
  private step = 0;
  private car = {
    path: null as Path | null, d: 0, dir: 1, v: 0, merge: 0, lost: 0, x: 0, z: 0, yaw: 0, flash: false,
    /** Lateral offset from the centre line and where it's heading. */
    lat: 0, phase: 'tail' as Phase, phaseT: 0, close: 0, sink: 0, chaseT: 0, boxed: false,
  };
  private readonly f = { x: 0, z: 0, tx: 0, tz: 0 };
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

  reset(): void {
    this.car.path = null;
    this.state = 'idle';
    this.step = 0;
    this.rolled = false;
    this.siren = 0;
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
    if (this.state === 'talk') this.greet();
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
    model.group.rotation.set(-Math.atan2(yf - yb, L * 2) + sink * 0.25, yaw, 0, 'YXZ');
    col.x = x; col.z = z; col.rot = yaw;
    this.car.x = x; this.car.z = z; this.car.yaw = yaw;
  }

  /** Main-road distance under the patrol (dirt path) or -1 on the asphalt. */
  private dirtS(): number {
    const c = this.car;
    return c.path && c.path.name === 'dirt' ? this.junction + c.d : -1;
  }

  // ------------------------------------------------------------ talk

  private verdict(): void {
    const k = Math.round(this.kmh);
    if (this.reason === 'check') {
      this.ev.say(SPEAKER, 'Аптечка, огнетушитель, знак аварийный… Порядок. Счастливого пути, почта.', 'Проверено');
      this.ev.record({ kind: 'check', fine: 0, note: 'проверка документов' });
    } else if (this.reason === 'flee') {
      this.ev.say(SPEAKER, 'Одумался, значит. Неподчинение — протокол и штраф сто рублей. Ещё раз — поедешь в отдел.', 'Штраф');
      this.ev.record({ kind: 'fine', fine: 100, note: 'неподчинение' });
    } else if (k > 90 || Math.random() < 0.45) {
      this.ev.say(SPEAKER, `${k} при знаке шестьдесят. Штраф пятьдесят рублей — квитанцию держите.`, 'Штраф');
      this.ev.record({ kind: 'fine', fine: 50, note: `${k} км/ч при 60` });
    } else {
      this.ev.say(SPEAKER, `${k} км/ч, а там шестьдесят. Почта, говорите? Ладно, на первый раз — устно.`, 'Предупреждение');
      this.ev.record({ kind: 'warning', fine: 0, note: `${k} км/ч при 60` });
    }
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
      if (dIns < RADAR && closing && kmh > TOLERANCE) this.signal('speed', kmh);
      else if (!this.rolled && dIns < 60 && closing && kmh > 5) {
        this.rolled = true;
        if (Math.random() < 0.3) this.signal('check', kmh);
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
        if (this.timer > 40) { this.step = 0; this.timer = 0; this.greet(); }
      } else if (this.step === 0) {
        if (o && o.mode === 'salute' && this.timer > 1.6) o.setMode('talk');
        if (this.timer > 3.4 + (o ? 1.4 : 0)) { this.step = 1; this.timer = 0; this.verdict(); }
      } else if (this.step === 1 && this.timer > 5.5) {
        this.ev.toast(this.reason === 'check' ? 'Проверка документов пройдена' : 'Инспектор отпустил — можно ехать', 2.4);
        this.state = c.path ? 'away' : 'cool';
        this.timer = 0;
        if (o) { o.setMode('salute'); this.step = 2; }
      }
      // drove off mid-conversation: now it's a chase
      if (this.state === 'talk' && this.step <= 0 && speed > 3 && Math.hypot(c.x - px, c.z - pz) > 25) {
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
    this.flashLight.intensity = c.flash && (Math.floor(t * 5) % 2 === 0) ? 2.2 : 0;
    const dist = Math.hypot(c.x - px, c.z - pz);
    const wail = this.state === 'pursuit' ? clamp(1 - dist / 320, 0, 1) ** 1.3 : this.state === 'bogged' ? clamp(1 - this.timer / 4, 0, 1) * 0.6 : 0;
    this.siren = damp(this.siren, wail, 4, dt);
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

  private talk(): void {
    this.state = 'talk';
    this.timer = 0;
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
    this.ev.say(SPEAKER, this.reason === 'flee' ? 'Ну что, гонщик, догнали? Права и путевой лист — из машины не выходить.' : 'Сержант Кузьмин. Документики ваши и путевой лист, пожалуйста.', null);
  }

  // ------------------------------------------------------------ chase

  private pursue(px: number, pz: number): void {
    const pl = this.traffic.locate(px, pz);
    const path = this.traffic.paths[0];
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
    const vmax = dirt ? this.dirtCap(sDirt) : this.suv ? VMAX_SUV : VMAX;
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
      target = Math.min((this.suv ? VMAX_SUV : VMAX) + 3, speed + 6);
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
    // the driver is still walking back to the car
    if (!this.inCar.has(this.drv)) target = 0;
    const braking = target < c.v - 0.3;
    c.v = braking ? Math.max(target, c.v - BRAKE * dt) : Math.min(target, c.v + (this.suv ? ACCEL_SUV : ACCEL) * dt);
    const lastLat = c.lat;
    c.lat = damp(c.lat, latT, c.phase === 'tail' ? 2 : 1.4, dt);
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
      ? 'Таран, неподчинение, превышение. Штраф пятьсот рублей, протокол — и в отдел, там разберутся.'
      : 'Неподчинение требованию остановиться, превышение. Штраф двести рублей, протокол — и прокатишься с нами в отдел.', 'Протокол');
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
      const fine = this.reason === 'ram' ? 500 : 200;
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
          this.ev.toast(`Отпустили. Штраф ${this.reason === 'ram' ? 500 : 200} ₽ — рейс продолжается`, 3.2);
        });
    }
  }
}
