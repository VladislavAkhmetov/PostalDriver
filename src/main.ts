import * as THREE from 'three';
import { RetroRenderer } from './core/Renderer';
import { createTextures } from './core/textures';
import { clamp, damp } from './core/math';
import { Input, Action } from './core/Input';
import { Ground } from './world/Ground';
import { World } from './world/World';
import { Atmosphere, WINTER } from './world/Atmosphere';
import { Vehicle } from './vehicle/Vehicle';
import { Cabin, EYE, EYE_PITCH, HotspotId } from './vehicle/Cabin';
import { AudioEngine } from './audio/AudioEngine';
import { Voice } from './audio/Voice';
import { Mission } from './game/Mission';
import { freshProfile, grandpaLine, loadProfile, repair, saveProfile, type RepairKind } from './game/Profile';
import { clearDay, dayLabel, loadDay, replayedExtra, saveDay, type DaySave } from './game/Autosave';
import { boardFor, daysBetween, destName, newPlaceToday, paydays, reckon, TALONS_DAY, TALONS_MAX, type Order } from './game/Career';
import { Encounters } from './game/Encounters';
import { Cases, GRANDPA_HOME, morningCase, weekBefore, type MorningCase } from './game/Cases';
import { BeeCloud } from './vehicle/Bees';
import { Countryside } from './world/Countryside';
import { MuhaStory } from './game/MuhaStory';
import { RoadsideFix } from './game/Roadside';
import { farewellPages, keysPage, Prologue } from './game/Prologue';
import { FIRST_SHEET } from './audio/stations';
import { FirstMorning, KARTATAY, VISIT } from './game/FirstMorning';
import { Passenger } from './vehicle/Passenger';
import { RoadStop } from './game/RoadStop';
import { GRANDPA_LETTER, Letters, letterForBoard } from './game/Letters';
import { RadioNews } from './game/RadioNews';
import { playSummer, summerDue } from './game/Summer';
import { dateParts } from './game/Career';
import { rub } from './game/Money';
import { UI, Settings } from './ui/UI';
import { freshGai, Police } from './world/Police';
import { Rain } from './world/Rain';
import { Effects } from './world/Effects';
import { loadPeople } from './world/People';
import { loadCars } from './world/Cars';
import { loadSoviet } from './world/Soviet';
import { loadAnimals } from './world/Animals';
import { TitleShots } from './game/TitleShots';
import { buildUaz, loadUaz } from './world/Uaz';
import { initAnalytics, trackEvent } from './core/analytics';
import { FuelStop } from './game/Fuel';

const MIN_START_FUEL = 0.4;

async function boot(): Promise<void> {
  initAnalytics();
  const app = document.getElementById('app')!;
  // the character and car models load alongside the fonts
  const people = Promise.all([loadPeople(), loadCars(), loadUaz(), loadSoviet(), loadAnimals()]);
  // canvas textures bake text, so fonts must be ready first
  try {
    await Promise.race([
      Promise.all(['PT Sans', 'PT Sans Narrow', 'PT Serif', 'PT Mono'].map((f) => document.fonts.load(`16px "${f}"`, 'Почта'))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fall back to system fonts */ }

  await people;
  const T = createTextures();
  const renderer = new RetroRenderer(app);
  const scene = new THREE.Scene();
  const ground = new Ground();
  const world = new World(ground, T);
  scene.add(world.group);
  const atmo = new Atmosphere(scene);
  const rain = new Rain();
  scene.add(rain.group);
  const fx = new Effects(ground);
  // the life round the road by the calendar: benches, the herd, the tractor, the combines, the ice, Sabantuy
  const country = new Countryside(world, ground, fx);
  /** The world as today's date has it. */
  const dayWorld = () => { const dp = dateParts(today.day); country.setDay(dp.m, dp.d); };
  scene.add(fx.group);
  const rainTint = new THREE.Color();
  const WHITE = new THREE.Color(1, 1, 1);
  const vehicle = new Vehicle();
  const cabin = new Cabin(T);
  scene.add(cabin.group);
  // the right-hand seat: the grandfather rides there on the drive home and on the first morning
  const grandpaSeat = new Passenger(cabin.group, new THREE.Vector3(0.62, 0.4, -0.7));
  {
    // our own post van's body, seen only in the door mirrors; the cab's frame
    // faces -Z with the driver over the front axle, the model's wheelbase centre is 0
    const own = buildUaz('post');
    if (own.lights) own.lights.visible = false;
    own.group.rotation.y = Math.PI;
    own.group.position.set(0, -0.75, 0.25);
    const body = new THREE.Group();
    body.add(own.group);
    cabin.attachExterior(body);
  }
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 1200);
  const head = new THREE.Object3D();
  head.position.copy(EYE);
  head.rotation.order = 'YXZ';
  cabin.group.add(head);
  head.add(camera);
  camera.layers.enable(2);
  // the cigarette hangs from the lips, so it turns with the head
  cabin.smoker.follow(head);
  cabin.group.rotation.order = 'YXZ';

  // title sequence: the camera leaves the cab to film a post van on the route
  let title: TitleShots | null = new TitleShots(ground, scene);
  scene.add(camera);
  cabin.group.visible = false;

  const input = new Input(renderer.canvas);
  const ui = new UI(input);
  const profile = loadProfile();
  // a day saved part-way (Autosave.ts) offers «Продолжить» from where the van stood
  const saved = () => loadDay(profile.day, profile.runs);
  const titleResume = () => { const s = saved(); ui.setResume(s ? dayLabel(s, (d) => destName(d)) : null); };
  titleResume();
  ui.setGarage(profile);
  /** The van as the profile has it: its damage, the steering's pull, the radiator's leak; fresh coolant, a cold engine. */
  const applyWear = (fresh = false) => {
    vehicle.damage = fresh ? 0 : profile.damage;
    vehicle.steerWear = fresh ? 0 : profile.wear?.steer ?? 0;
    vehicle.radWear = fresh ? 0 : profile.wear?.rad ?? 0;
    vehicle.pullDir = profile.wear?.pull ?? 1;
    vehicle.coolant = 1;
    vehicle.heat = 0;
  };
  ui.onRepair = (kind: RepairKind) => {
    const share = repair(profile, kind);
    saveProfile(profile);
    applyWear();
    if (profile.damage < 0.1) cabin.repair();
    ui.setGarage(profile);
    if (share <= 0) { ui.toast('Нечего чинить или касса пуста', 2.4); return; }
    const part = share < 0.99 ? ' Денег хватило не на всё — остальное в другой раз.' : '';
    // (the day just played: in the evening the profile has already moved on to tomorrow)
    const home = (mission?.finished ? profile.day - 1 : profile.day) >= GRANDPA_HOME;
    if (kind === 'grandpa') ui.blackout('Гараж картатая, вечер', home
      ? `Лампочка над ямой, радио «Маяк». Картатай на табуретке у ямы — подаёт ключи и не молчит:<br><br>«${grandpaLine(profile)}»${part}`
      : `Лампочка над ямой, радио «Маяк», дедовы ключи на табуретке — сам. Потом — межгород из Уфы, картатай из больницы:<br><br>«${grandpaLine(profile, false)}»${part}`, 5, () => {}, () => {}, 'Починили');
    else ui.toast(`Колька, мастерская МТС: «Сделано. Деньги вперёд — как договаривались».${part}`, 3.4);
  };
  const audio = new AudioEngine();
  // recorded voices, when there are files for them (docs/voice/README.md): every line on screen asks for its own
  const voice = new Voice(() => audio.ctx, () => audio.voiceBus);
  voice.onDuck = (on) => audio.tape?.duck(on);
  ui.onLine = (who, text, kind) => voice.say(who, text, kind);
  ui.buildMap(ground, world.stops);

  // an arrest holds the van on the handbrake, hands off the pedals: the brake
  // pedal must not be used, at a standstill the automatic box reads it as reverse
  let held = false;
  const police = new Police(ground, world.traffic, world.gai, {
    say: (who, line, stamp) => { ui.dialogue(who, line, stamp); if (stamp) audio.stamp(); else audio.paper(); if (who === KARTATAY) grandpaSeat.speak(3 + line.length * 0.03); },
    toast: (text, sec) => ui.toast(text, sec),
    whistle: () => audio.whistle(),
    megaphone: (line) => { ui.dialogue('Мегафон · ГАИ', line, null); audio.megaphone(line); },
    cuffs: () => audio.cuffs(),
    hold: (on) => { held = on; vehicle.handbrake = on; },
    blackout: (title, text, sec, mid, done) => ui.blackout(title, text, sec, mid, done),
    // «без квитанции» comes out of Timur's pocket and goes on no protocol: no fine on the run's record
    record: (r) => { if (r.kind === 'bribe') mission.extra('ГАИ · «без квитанции»', -r.fine, 0); else mission.record(r.kind, r.fine); trackEvent('police_stop'); },
    choice: (who, line, opts, pick) => { audio.paper(); ui.choice(who, line, opts, pick); },
    closeChoice: () => ui.closeChoice(),
    inspect: (reason, done) => story?.inspect(reason, done) ?? false,
    nudge: (side, power) => {
      // the patrol's bumper meets the van's flank: a shove, a yaw kick and a thump
      vehicle.vy += side * power * 1.8;
      vehicle.r += side * power * 0.3;
      shake = Math.min(1.2, shake + power * 0.8);
      audio.impact(power * 3.5);
      cabin.splatter(0.4, false);
    },
  });

  // ---- settings: render scale + rain density, look sensitivity, tilt steering
  const QUALITY = { low: { side: 270, rain: 0.45 }, mid: { side: 360, rain: 0.75 }, high: { side: 480, rain: 1 } };
  const applySettings = (st: Settings, changed: keyof Settings | null) => {
    const q = QUALITY[st.quality] ?? QUALITY.mid;
    if (renderer.shortSide !== q.side) { renderer.shortSide = q.side; resize(); }
    rain.density = q.rain;
    input.lookScale = st.look;
    if (changed === null && st.tilt) void input.setTilt(true);
    if (changed === 'tilt') void input.setTilt(st.tilt).then((ok) => { if (!ok) ui.tiltFailed(); else if (st.tilt) ui.toast('Руль — наклоном телефона', 2); });
  };
  ui.onSettings = applySettings;

  // ---- filling station: roll into a bay, stand still, pay by the litre
  const fuelStop = new FuelStop({
    view: (v) => ui.setFuel(v),
    pump: (on) => audio.fuelPump(on),
    done: (liters, paid, why, talon) => {
      profile.fuel = vehicle.fuel; saveProfile(profile); ui.setGarage(profile);
      const how = paid > 0 ? `${talon >= 0.5 ? `${talon.toFixed(0)} л по талонам, ` : ''}за свои ${rub(paid)}` : 'по талонам';
      ui.toast(why === 'broke' ? `Талоны и деньги кончились · залито ${liters.toFixed(0)} л` : `Заправлено ${liters.toFixed(0)} л · ${how}`, 3);
    },
  });
  let fuelHinted = false;
  /** Snow lying on the world now (0…1), eased toward the day's. */
  let snowNow = 0;

  let mission!: Mission;
  // the working day: this morning's board at the post office
  let today = boardFor(profile.day, profile.trust);
  // the title scene is filmed in the day's own weather, with the season's snow lying
  atmo.setDayWeather(today.weather); dayWorld();
  snowNow = today.snow;
  /** Everything from the start: a fresh profile (the story's state too), no day saved. */
  const wipeCareer = () => {
    // (cleared first: the story's own records — Muha, the letters, the GAI's memory — are not in a fresh profile)
    for (const k of Object.keys(profile)) delete (profile as unknown as Record<string, unknown>)[k];
    Object.assign(profile, freshProfile());
    saveProfile(profile);
    clearDay();
    ui.setResume(null);
    vehicle.damage = 0;
    cabin.repair();
    today = boardFor(profile.day, profile.trust);
    atmo.setDayWeather(today.weather); dayWorld();
    ui.setGarage(profile);
  };
  const newMission = (orders: Order[] = []) => new Mission(world, ground, {
    hint: (id, text, keys) => ui.hint(id, text, keys),
    clearHint: (id) => ui.clearHint(id),
    ritual: (stop, step, honks) => ui.ritual(stop, step, honks),
    delivered: (stop) => { audio.stamp(); audio.chime(); trackEvent('delivered'); story?.delivered(stop); letters?.delivered(stop); checkpoint(); },
    dialogue: (who, line) => ui.dialogue(who, line),
    finished: (st) => {
      // the evening's reckoning; the van's damage and the tank stay as the day left them
      // the evening: the journal and the bonus it earns, the day's cash, and any payday falling due
      const rec = reckon(st.deliveries, st.police.fines, st.police.arrests, vehicle.damage, profile.trust, st.extras);
      const day = today;
      profile.pay.premium = Math.max(0, Math.min(30, profile.pay.premium + rec.premium));
      const premium = profile.pay.premium;
      const pay = paydays(profile.pay, day.day);
      const cash = rec.total + pay.lines.reduce((a, [, v]) => a + v, 0);
      profile.money = Math.max(0, profile.money + cash); profile.trust = rec.trustAfter; profile.runs++; profile.day++;
      profile.damage = vehicle.damage; profile.fuel = vehicle.fuel;
      profile.wear = { steer: vehicle.steerWear, rad: vehicle.radWear, pull: vehicle.pullDir };
      // the story keeps what happened today
      if (story) profile.muha = story.state;
      if (roadStop) profile.roadStop = roadStop.saved;
      if (letters) profile.letters = letters.saved;
      if (cases) profile.cases = cases.result;
      profile.gai = { ...police.memory };
      const grandpa = !!letters?.grandpaTonight;
      // tomorrow's fuel coupons
      profile.talons = Math.min(TALONS_MAX, profile.talons + TALONS_DAY);
      // the day is in the profile now: its checkpoint goes (and could not be resumed anyway: `runs` moved on)
      clearDay();
      ui.setResume(null);
      saveProfile(profile);
      ui.setGarage(profile);
      // a short walk back into the post office, then the evening at the counter
      setTimeout(() => {
        ui.showEvening(day, st, rec, profile, { onRepair: (kind) => ui.onRepair?.(kind), onNext: toMorning, pay, premium });
        // the evening the grandfather's own letter went home: before the journal, his story
        if (grandpa) ui.blackout('Вечер, лавка у ворот', GRANDPA_LETTER, 9, () => {}, () => {}, '');
      }, 600);
      audio.chime(); input.enabled = false;
    },
    notice: (text) => { ui.hint('notice', text); audio.clink(); },
  }, orders);
  mission = newMission();
  world.onAnimalHit = (kind, sp) => {
    audio.impact(sp * 0.6); shake = Math.min(1.4, shake + 0.6); mission.crash(sp * 0.8);
    ui.toast(kind === 'cow' ? 'Вы сбили корову!' : kind === 'horse' ? 'Вы сбили лошадь!' : kind === 'dog' ? 'Собаке не повезло…' : 'Вы сбили животное!', 3);
    audio.animal(kind === 'cow' ? 'cow' : 'dog');
  };
  world.onBark = () => audio.animal('dog');
  let eventN = 0;
  world.onEvent = (text) => ui.hint(`event${eventN++}`, text);
  country.onEvent = (text) => { if (started && !morning) ui.hint('herd', text); };
  world.villagers.onHit = (sp) => { audio.impact(sp * 0.5); shake = Math.min(1.4, shake + 0.5); ui.toast('Вы сбили человека!', 3); mission.crash(sp); };

  let forestAmb = 0;
  const reset = () => {
    const p = world.startPose;
    vehicle.place(p.x, p.z, p.yaw, ground);
  };
  reset();
  if (import.meta.env.DEV) Object.assign(window, { __uaz: { input, vehicle, ground, world, cabin, atmo, camera, scene, renderer, police, rain, ui, audio, get mission() { return mission; }, get encounters() { return encounters; }, get story() { return story; }, get roadStop() { return roadStop; }, get title() { return title; }, fx, grandpaSeat, get first() { return first; }, country, get cases() { return cases; }, get profile() { return profile; }, voice, get morning() { return morning; }, get birth() { return birth; }, get today() { return today; } } });

  // ---- vehicle feedback
  let shake = 0;
  const wearTold = { steer: false, rad: false };
  vehicle.onImpact = (v, hit) => {
    audio.impact(v);
    shake = Math.min(1.4, shake + v * 0.6);
    mission.crash(v);
    if (!sandbox) police.impact(v, vehicle.x, vehicle.z);
    if (hit) {
      const y = vehicle.y + 0.2;
      fx.crash(hit.x, y, hit.z, hit.nx, hit.nz, v, !hit.soft && v > 4);
      // a hard hit cracks the windscreen and may stall the engine
      if (!hit.soft && v > 4.5) { cabin.crack(clamp((v - 4) / 8, 0.15, 1)); audio.clink(); }
      if (!hit.soft && v > 8.5 && vehicle.engine === 'running') {
        vehicle.engine = 'off';
        ui.toast('Двигатель заглох от удара', 2.6);
      }
      // what the knock broke, said once each
      if (!sandbox && !hit.soft) {
        if (vehicle.steerWear > 0.15 && !wearTold.steer) {
          wearTold.steer = true;
          ui.hint('dmg-steer', `Удар пришёлся на колесо — машину тянет ${vehicle.pullDir < 0 ? 'влево' : 'вправо'}. На обочине можно встать на ручник и подтянуть тягу, а как следует — вечером в гараже.`, 'Пробел');
        } else if (vehicle.radWear > 0.15 && !wearTold.rad) {
          wearTold.rad = true;
          ui.hint('dmg-rad', 'Капот принял удар — радиатор, похоже, потёк. Следи за стрелкой температуры: закипит — встань и долей воды из канистры.');
        } else if (vehicle.damage > 0.6) ui.hint('dmg', 'Машина побита: мотор слабеет и парит. Едь аккуратнее.');
      }
    }
  };
  vehicle.onBump = (s) => {
    shake = Math.min(1.2, shake + s * 0.25);
    if (s > 0.2) audio.rattle(s);
    if (started) { mission.jolt(s); cases?.jolt(s); }
    // the morning's passenger to the maternity feels every pothole
    if (birth && s > 0.5 && birth.cool <= 0) { const b = birth.mc.ride!.bump; ui.dialogue('Зульфия', b[birth.said++ % b.length], null); birth.cool = 6; birth.bumps++; }
  };
  vehicle.onShift = () => audio.gearShift();
  vehicle.onSplash = (s) => audio.splash(s);
  vehicle.onPlank = () => audio.plank(clamp(Math.abs(vehicle.vx) / 8, 0.3, 1));
  cabin.onWiperEnd = () => audio.wiper();
  cabin.smoker.onToast = (t) => ui.toast(t, 2.4);
  cabin.smoker.onSfx = (k) => audio.smoking(k);
  cabin.onMist = () => ui.hint('mist', 'Стёкла запотели изнутри. Включи обдув или протри рукой — клик по стеклу.', 'B');
  atmo.onLightning = (d) => audio.thunder(d);
  ui.onType = () => audio.type();

  // ---- actions
  let started = false;
  let baseFov = 68;
  let sandbox = false;
  let sandboxS = 0;
  let lastKeyboard = 0;
  let hornTap = 0;
  const act = (a: Action | HotspotId) => {
    if (!started && a !== 'pause' && a !== 'help') return;
    first?.action(a);
    if (a === 'handbrake' || a === '4wd' || a === 'low' || a === 'lights' || a === 'wipers' || a === 'vent' || a === 'map' || a === 'tapeNext') cabin.reach(a);
    if (a === 'tape') cabin.reach('tape', { cassette: !!audio.tape && !audio.tape.playing });
    switch (a) {
      case 'start': ignition(); break;
      case 'handbrake': vehicle.toggleHandbrake(); audio.ratchet(vehicle.handbrake); ui.clearHint('hb'); break;
      case '4wd': vehicle.toggle4WD(); audio.gearShift(); ui.toast(vehicle.fourWD ? 'Передний мост включён' : 'Передний мост выключен'); ui.clearHint('mud'); ui.clearHint('stuck'); break;
      case 'low': vehicle.toggleLow(); audio.gearShift(); ui.toast(vehicle.low ? 'Понижающая передача' : 'Прямая передача'); ui.clearHint('mud'); ui.clearHint('stuck'); ui.clearHint('lowasphalt'); break;
      case 'gearUp': if (vehicle.gearMode === 'manual') vehicle.shiftBy(1); break;
      case 'gearDown': if (vehicle.gearMode === 'manual') vehicle.shiftBy(-1); break;
      case 'gearMode':
        if (vehicle.engine === 'off') { ignition(); break; }
        vehicle.gearMode = vehicle.gearMode === 'auto' ? 'manual' : 'auto';
        audio.click();
        ui.toast(vehicle.gearMode === 'auto' ? 'Коробка: автомат' : 'Коробка: вручную — Q ниже, E выше');
        break;
      case 'smoke': cabin.smoke(); break;
      case 'stub': cabin.stubOut(); break;
      case 'vent': cabin.toggleVent(); audio.click(); ui.toast(cabin.ventOn ? 'Обдув стекла включён' : 'Обдув стекла выключен'); ui.clearHint('mist'); break;
      case 'timeOfDay': if (sandbox) ui.toast(`Время суток: ${atmo.cycleClock()}`); else ui.toast('Время суток меняется только в песочнице'); break;
      case 'lights': cabin.toggleLights(); audio.click(); ui.clearHint('lights'); break;
      case 'wipers': cabin.toggleWipers(); audio.click(); ui.clearHint('wipers'); break;
      case 'horn': hornTap = 0.25; break;
      case 'map': ui.setMap(!ui.mapOpen, vehicle, progress()); audio.paper(); break;
      case 'tape': if (audio.tape) { audio.click(); const on = audio.tape.toggle(); if (on) ui.toast(audio.tape.title, 3); } break;
      case 'volUp': case 'volDown': if (audio.tape) { const v = audio.tape.setVolume(audio.tape.volume + (a === 'volUp' ? 0.1 : -0.1)); ui.toast(`Громкость радио · ${Math.round(v * 100)} %`, 1.2); } break;
      case 'tapeNext': if (audio.tape) { audio.click(); ui.toast(audio.tape.next(), 3); } break;
      case 'weather': ui.toast(`Погода: ${atmo.cyclePreset()}`); break;
      case 'mute': audio.setMuted(!audio.muted); ui.setMuted(audio.muted); break;
      case 'pause':
        if (ui.helpOpen) { ui.toggleHelp(false); break; }
        if (!started) break;
        if (ui.mapOpen) { ui.setMap(false); break; }
        ui.setPaused(!ui.paused);
        input.enabled = !ui.paused && !mission.finished;
        void (ui.paused ? audio.ctx?.suspend() : audio.ctx?.resume());
        audio.score?.hold(ui.paused);
        break;
      case 'reset': {
        // onto the nearest road, whichever it is (out of the mud on the forest road, not back to the highway)
        const hit = ground.nearestRoad(vehicle.x, vehicle.z, 600);
        const road = hit?.sample.road ?? ground.main;
        const s = hit ? hit.s : ground.main.nearestS(vehicle.x, vehicle.z);
        const f = road.frame(Math.max(2, Math.min(road.length - 2, s)));
        vehicle.place(f.x + f.rx * 1.6, f.z + f.rz * 1.6, Math.atan2(-f.tx, -f.tz), ground);
        ui.toast('Трактор вытащил на дорогу');
        break;
      }
      case 'lookBack': break;
      case 'help': ui.toggleHelp(); break;
    }
  };
  input.onAction = act;
  ui.onAction = act;
  ui.onVolume = (v) => audio.tape?.setVolume(v);
  // the audio graph is built at boot; the radio comes on with the drive (browsers need a first tap or key)
  audio.unlock().catch((e) => console.warn('audio unavailable', e));
  // the title's own theme (it starts on the first tap or key if the browser holds it back)
  audio.music('theme', 3);
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, () => audio.gesture(), { capture: true });
  // a dropped file must not navigate away from the game
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => e.preventDefault());
  const ignition = () => {
    if (vehicle.engine !== 'off') return;
    cabin.reach('start');
    trackEvent('engine_start');
    const crank = audio.starter();
    vehicle.startEngine(crank);
    // the sound runs on the audio clock: catch on its last chuff even if frames lag
    setTimeout(() => vehicle.catchStart(), crank * 1000);
    ui.clearHint('start');
  };

  // the day's roadside encounters: riders, favours, a nail in a tyre
  let encounters: Encounters | null = null;
  /** The day's «случаи» (Cases.ts): the neighbours, the beekeeper, the wedding. */
  let cases: Cases | null = null;
  /** Bees in the cab, the day the beekeeper rides with his hives. */
  const bees = new BeeCloud(cabin.group);
  let beeLevel = 0;
  /**
   * The morning a neighbour's wife is in labour (MORNING_CASES): she rides to the district hospital,
   * across from the post office, before the route sheet; what it earns goes into the day's journal.
   */
  let birth: { mc: MorningCase; t: number; cool: number; said: number; bumps: number; hurried: boolean } | null = null;
  let morningExtra: [string, number, number] | null = null;
  let story: MuhaStory | null = null;
  let roadside: RoadsideFix | null = null;
  let roadStop: RoadStop | null = null;
  let letters: Letters | null = null;
  let news: RadioNews | null = null;
  /** The cab has one passenger seat: whoever of the day's stories has someone in it. */
  const seatTaken = () => !!(encounters?.riding || cases?.riding || roadStop?.riding || story?.aboard);
  const newEncounters = (resume?: DaySave) => {
    wearTold.steer = wearTold.rad = false;
    // mending at the roadside: never at an addressee's door, with the GAI about, or with a flat (the spare comes first)
    roadside = new RoadsideFix(mission, {
      choice: (who, line, opts, pick) => { audio.paper(); ui.choice(who, line, opts, pick); },
      choiceOpen: () => ui.choiceOpen,
      hint: (id, text, keys) => ui.hint(id, text, keys),
      toast: (text) => ui.toast(text, 3),
      blackout: (title, text, sec, mid, done, stamp) => ui.blackout(title, text, sec, mid, done, stamp),
    }, () => vehicle.flat || (police.state !== 'idle' && police.state !== 'cool') || mission.stops.some((s) => !s.done && Math.hypot(s.pos.x - vehicle.x, s.pos.z - vehicle.z) < 40));
    cases?.dispose();
    cases = new Cases(world, ground, mission, {
      choice: (who, line, opts, pick) => { audio.paper(); ui.choice(who, line, opts, pick); },
      closeChoice: () => ui.closeChoice(),
      choiceOpen: () => ui.choiceOpen,
      say: (who, line) => { ui.dialogue(who, line, null); audio.paper(); },
      hint: (id, text, keys) => ui.hint(id, text, keys),
      toast: (text) => ui.toast(text, 3),
      blackout: (title, text, sec, mid, done, stamp) => ui.blackout(title, text, sec, mid, done, stamp),
      bees: (k) => { beeLevel = k; audio.buzz(k); },
      bleat: () => audio.animal('sheep'),
      seatTaken,
    }, today.day, profile.cases);
    const cs = cases;
    encounters?.dispose();
    encounters = new Encounters(world, ground, mission, {
      choice: (who, line, opts, pick) => { audio.paper(); ui.choice(who, line, opts, pick); },
      closeChoice: () => ui.closeChoice(),
      choiceOpen: () => ui.choiceOpen,
      say: (who, line) => { ui.dialogue(who, line, null); audio.paper(); },
      hint: (id, text, keys) => ui.hint(id, text, keys),
      toast: (text) => ui.toast(text, 3),
      blackout: (title, text, sec, mid, done, stamp) => ui.blackout(title, text, sec, mid, done, stamp),
      flat: () => { audio.impact(3); shake = Math.min(1.4, shake + 0.7); },
      seatTaken,
    }, today.day, cs.roadRider);
    const enc = encounters;
    mission.hold = () => enc.riding || cs.riding;
    // Muha's story, from where the last finished day left it
    story?.dispose();
    story = new MuhaStory(world, mission, police, {
      choice: (who, line, opts, pick) => { audio.paper(); ui.choice(who, line, opts, pick); },
      closeChoice: () => ui.closeChoice(),
      choiceOpen: () => ui.choiceOpen,
      say: (who, line) => { ui.dialogue(who, line, null); audio.paper(); },
      hint: (id, text, keys) => ui.hint(id, text, keys),
      toast: (text) => ui.toast(text, 3),
      blackout: (title, text, sec, mid, done, stamp) => { audio.stamp(); ui.blackout(title, text, sec, mid, done, stamp); },
      fine: (amount, note) => { mission.record('fine', amount); ui.toast(`Штраф ${rub(amount)} · ${note}`, 3); },
      boom: (level) => audio.boombox(level),
      shout: (level) => audio.shout(level),
      slam: (level) => audio.doorSlam(level),
      seatTaken,
    }, today.day, profile.muha);
    // «Тормозят на дороге»: once in the service, never on the day of the sawmill's block
    roadStop?.dispose();
    audio.tape?.giveBack();
    roadStop = new RoadStop(world, ground, mission, {
      choice: (who, line, opts, pick) => { audio.paper(); ui.choice(who, line, opts, pick); },
      closeChoice: () => ui.closeChoice(),
      choiceOpen: () => ui.choiceOpen,
      say: (who, line) => { ui.dialogue(who, line, null); audio.paper(); },
      hint: (id, text, keys) => ui.hint(id, text, keys),
      toast: (text) => ui.toast(text, 3),
      blackout: (title, text, sec, mid, done, stamp) => ui.blackout(title, text, sec, mid, done, stamp),
      boom: (level) => audio.boombox(level),
      shout: (level) => audio.shout(level),
      horn: (level) => audio.otherHorn(level),
      fine: (amount, note) => { mission.record('fine', amount); ui.toast(`Штраф ${rub(amount)} · ${note}`, 3); },
      takeRadio: () => audio.tape?.takeAway(),
      police: () => police.state === 'signal' || police.state === 'talk',
      seatTaken,
    }, today.day, resume?.roadStop ?? profile.roadStop, !!story?.busyToday || cs.busyToday);
    // the radio's words between the songs, for this day
    news = new RadioNews(profile);
    voice.prefetch(news.all);
    letters = new Letters(mission, {
      say: (who, line) => { ui.dialogue(who, line, null); audio.paper(); },
      toast: (text) => ui.toast(text, 3),
    }, today.day, resume?.letters ?? profile.letters);
    const rs = roadStop;
    const st = story;
    mission.hold = () => enc.riding || rs.riding || st.aboard || cs.riding;
  };

  /**
   * The GAI's day: Kuzmin's memory as the last evening left it; now and then a captain from the
   * region at the post (by the book: no «договоримся»); and some days the radar is not at the lay-by
   * but out in the village before the fork, where sixty is the limit too.
   */
  const policeDay = () => {
    police.memory = { ...(profile.gai ?? freshGai()) };
    const d = profile.day;
    police.strict = d >= 3 && d % 7 === 5;
    police.setPost(d >= 4 && d % 5 === 4 ? ground.marks.junction - 180 : null);
    police.reset();
  };

  /** Between days, and on the morning drive before the route sheet: no riders, no Muha, no roadside stop. */
  const endDaySystems = () => {
    encounters?.dispose(); encounters = null;
    cases?.dispose(); cases = null;
    story?.dispose(); story = null;
    roadStop?.dispose(); roadStop = null;
    audio.tape?.giveBack();
    roadside = null; letters = null;
    news = new RadioNews(profile);
  };

  // ---- the autosave: the day part-way, apart from the profile (Autosave.ts)
  let saveT = 0;
  const checkpoint = () => {
    if (!started || sandbox || morning || prologue || mission.finished || !mission.planned.length) return;
    // not with the GAI about: a reload must not be the way out of a stop or a chase (the last save stands)
    if (police.state !== 'idle' && police.state !== 'cool') return;
    const m = mission.snapshot();
    saveDay({
      v: 1, day: profile.day, runs: profile.runs, at: Date.now(), planned: mission.planned, ...m,
      extras: m.extras.filter(([label]) => !replayedExtra(label)),
      van: { x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw, fuel: vehicle.fuel, damage: vehicle.damage, steer: vehicle.steerWear, rad: vehicle.radWear, pull: vehicle.pullDir, flat: vehicle.flat, coolant: vehicle.coolant, odometer: vehicle.odometer },
      roadStop: roadStop?.saved, letters: letters?.saved,
    });
    saveT = 20;
  };
  addEventListener('pagehide', checkpoint);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') checkpoint(); });

  // ---- the morning: from the family's yard to the post office, where the route sheet waits
  let morning = false;
  /** The board was opened at the post office door after the morning drive: the van stays where it stopped. */
  let fromMorning = false;
  /** The word at the porch in the mornings: өләсәй's, while the grandfather is in hospital… */
  const MORNING = [
    'Чай попил, улым? Беги, Зинаида ждать не любит.',
    'Перемячи в дорогу, в газетке. Одну Зинаиде Павловне дай — она любит.',
    'Картатай из Уфы звонил, на почту, Зинаиде: кормят, говорит, как в санатории. Велел тебе не гнать.',
    'Шапку надень! …Ну, хоть шарф. Зинаида, поди, уже мешки разложила.',
    'Әсәй с ночной пришла, спит. Тихонько со двора, не газуй под окнами.',
  ];
  /**
   * …and once he is home, his or hers, by turns — those that fit the day: the hat in the cold months,
   * a bow to Нина Петровна when the route goes through Sosnovka, Степаныч's when it goes to the hamlet.
   */
  type MorningDay = { stops: Set<string>; cold: boolean };
  const MORNING_HOME: [string, string, ((t: MorningDay) => boolean)?][] = [
    ['Картатай', 'Масло проверил? Проверь. Я в твои годы не проверял — потом мост менял.'],
    ['Өләсәй', 'Перемячи в дорогу, в газетке. Одну Зинаиде Павловне дай — она любит.'],
    ['Картатай', 'Нине Петровне — поклон. Скажи, Урал ещё живой, на лавке сидит, всех пересидит.', (t) => t.stops.has('sosnovka')],
    ['Өләсәй', 'Шапку надень! …Ну, хоть шарф. Картатай вон без шапки — и что? Кашляет.', (t) => t.cold],
    ['Картатай', 'На хутор поедешь — Степанычу привет. Скажи, в субботу — на рыбалку, на зорьке. Я сказал.', (t) => t.stops.has('khutor')],
    ['Өләсәй', 'Әсәй с ночной пришла, спит. Тихонько со двора, не газуй под окнами.'],
    ['Картатай', 'Митяй опять с утра у ворот — что-то затевает. Ты, улым, не вмешивайся. Ну, разве что чуть-чуть.'],
  ];
  /** The day's word: one that fits it, in turn after the one said the played day before (worked out the same way). */
  const morningHome = (day: number): [string, string] => {
    const b = day === profile.day ? today : boardFor(day, profile.trust);
    const t: MorningDay = { stops: new Set(b.orders.map((o) => o.dest)), cold: b.season !== 'spring' && b.season !== 'autumn' || /октябр/.test(b.date) };
    const n = MORNING_HOME.length;
    const said = day - 1 > GRANDPA_HOME ? morningHome(day - 1)[1] : null;
    const prev = said !== null ? MORNING_HOME.findIndex(([, l]) => l === said) : (day - 2 + n) % n;
    for (let k = 1; k <= n; k++) {
      const [who, line, when] = MORNING_HOME[(prev + k) % n];
      if (!when || when(t)) return [who, line];
    }
    return [MORNING_HOME[0][0], MORNING_HOME[0][1]];
  };
  /** The fade before a morning: how long since the last played day. */
  const weekTitle = (day: number): string => {
    const n = daysBetween(day - 1);
    return n <= 3 ? 'Через пару дней' : n <= 9 ? 'Неделя спустя' : n <= 17 ? 'Две недели спустя' : n <= 24 ? 'Три недели спустя' : 'Месяц спустя';
  };
  const ZINAIDA = [
    'Явился. Путевой лист на стойке, мешки — сам знаешь где.',
    'Доброе утро, Тимур. Почта сегодня тяжёлая — смотри не растеряй.',
    'Опять последний! Ладно, ладно — вот твой лист. Распишись.',
    'А, Тимурка. Чайник горячий, но тебе некогда. Держи лист.',
  ];
  const placeHome = () => { const h = world.homePose; vehicle.place(h.x, h.z, h.yaw, ground); };
  /**
   * The grandfather in the van's right-hand seat (and so not at the gate at home), or out of it.
   * From the first working day's evening he is in hospital in Ufa: not at home either.
   */
  const seatGrandpa = (on: boolean) => {
    grandpaSeat.visible = on;
    if (world.home.grandpa) world.setAway(world.home.grandpa, on || inHospital());
  };
  /** In hospital in Ufa: from the first morning's goodbye at the post office until he is home (GRANDPA_HOME). */
  const inHospital = () => profile.day < GRANDPA_HOME && (profile.runs >= 1 || seenOff);
  /** The grandfather has been seen off at the post office this morning (he waits on its porch for the bus). */
  let seenOff = false;
  /** «Первый чистый лист» is due as the first route begins (after the goodbye and the keys). */
  let firstSheetDue = false;
  /** He is on the post office porch, to wave the van off once (then the bus has him). */
  let porch: { waved: boolean } | null = null;
  const showPorch = (on: boolean) => { world.setAway(world.postGrandpa, !on); porch = on ? { waved: false } : null; };
  /** The first working morning's drive with the grandfather (FirstMorning.ts); null on any other. */
  let first: FirstMorning | null = null;
  /**
   * In the yard by the house: өләсәй's word at the porch, then the drive into town (or straight to
   * the counter). The first working morning the grandfather rides along and shows the way.
   */
  const morningStart = () => {
    morning = true;
    fromMorning = false;
    vehicle.handbrake = true;
    const firstDay = profile.runs === 0;
    seenOff = firstSheetDue = false;
    showPorch(false);
    birth = null;
    morningExtra = null;
    // a neighbour at the gate before dawn: the morning starts dark
    const sky = !firstDay ? morningCase(profile.day, profile.cases)?.sky : undefined;
    if (sky) atmo.setDayWeather(sky);
    seatGrandpa(firstDay);
    first = firstDay ? new FirstMorning(world, ground, {
      say: (who, line) => { ui.dialogue(who, line, null); audio.paper(); },
      hint: (id, text, keys) => ui.hint(id, text, keys),
      clearHint: (id) => ui.clearHint(id),
      visit: (done) => police.visit(VISIT, done),
    }, () => ({ lights: cabin.lightsOn, wipers: cabin.wipersOn, map: ui.mapOpen, horn: input.horn || hornTap > 0, lookYaw: input.lookYaw, lookBack: input.lookBack })) : null;
    if (first) first.onSay = (sec) => grandpaSeat.speak(sec);
    // the post is quiet the first morning: the grandfather has his own word with Kuzmin
    if (first) police.quiet = true;
    setTimeout(() => {
      if (!morning) return;
      audio.paper();
      if (first) {
        grandpaSeat.speak(4);
        ui.choice(KARTATAY, 'Ну что, солдат, довезёшь деда до автобуса? Он от почты идёт — заодно и дорогу покажу, и машину.', ['Поехали, картатай', 'Я дорогу помню — сразу к почте'], (i) => {
          if (!morning) return;
          if (i === 1) { reset(); vehicle.handbrake = true; atPostDoor(); return; }
          first?.start();
        });
        return;
      }
      // the week between (a fade, skippable), the neighbour with something that will not wait, then the word at the porch
      const day = profile.day;
      const card = () => {
        if (!morning) return;
        audio.paper();
        const [who, line] = day === GRANDPA_HOME
          ? ['Картатай', 'Ну что, почтальон. Мне теперь — на лавке сидеть, кур считать. А ты — езжай. Вечером расскажешь, как там Нина Петровна.']
          : day > GRANDPA_HOME ? morningHome(day) : ['Өләсәй', MORNING[(day - 1) % MORNING.length]];
        ui.choice(who, line, ['Поехали — до почты своим ходом', 'Сразу к почте'], (i) => {
          if (!morning) return;
          if (i === 1) { reset(); vehicle.handbrake = true; atPostDoor(); return; }
          ui.hint('morning', 'Почта — в Ключевске: по улице и лесом до трассы, там направо — мимо поста ГАИ, в посёлок. Встань у дверей, где Зинаида Павловна, и затяни ручник — там путевой лист.', 'Пробел');
        });
      };
      const mc = morningCase(day, profile.cases);
      const then = () => { if (morning) { if (mc) playMorningCase(mc, card); else card(); } };
      const week = weekBefore(day, profile.cases);
      if (week) ui.blackout(weekTitle(day), week, clamp(2.5 + week.length * 0.035, 4, 9), () => {}, then, '', true);
      else then();
    }, 900);
  };
  /** The neighbour at the gate before the drive (Cases.MORNING_CASES): a ride to the hospital, or a tow in the frost. */
  const playMorningCase = (mc: MorningCase, next: () => void) => {
    const mark = (m: 'done' | 'refused') => { profile.cases = { ...(profile.cases ?? {}), [mc.id]: m }; };
    audio.paper();
    ui.choice(mc.who, mc.ask, mc.options, (i) => {
      if (!morning) return;
      if (i === 1) {
        mark('refused');
        ui.dialogue(mc.who, mc.refused, null);
        setTimeout(next, 3200);
        return;
      }
      mark('done');
      if (mc.fade) {
        const f = mc.fade;
        ui.blackout(f.title, f.text, 4.5, () => {}, () => {
          if (!morning) return;
          ui.dialogue(mc.who, f.thanks, null);
          morningExtra = [`Выручил соседа · ${mc.who.toLowerCase()}`, f.money, 2];
          setTimeout(next, 3400);
        }, 'Трос');
      } else if (mc.ride) {
        birth = { mc, t: 0, cool: 4, said: 0, bumps: 0, hurried: false };
        ui.toast(`${mc.who.split(',')[0]} и Зульфия — в кабине · райбольница, Ключевск`, 3.2);
        ui.hint('birth', mc.ride.hint, 'F');
      }
    });
  };
  /** The drive to the district hospital, across from the post office: in at the door, then on to the post. */
  const birthUpdate = (dt: number) => {
    const b = birth!, R = b.mc.ride!;
    b.t += dt; b.cool -= dt;
    if (!b.hurried && b.t > 140) { b.hurried = true; ui.dialogue('Зульфия', R.hurry, null); }
    const h = world.hospital.pos;
    if (Math.hypot(h.x - vehicle.x, h.z - vehicle.z) < 26 && Math.abs(vehicle.speedKmh) < 2) {
      birth = null;
      ui.clearHint('birth');
      ui.dialogue(R.arrive[0], R.arrive[1], null);
      world.hospital.nurse.wave = 4;
      audio.chime();
      // a smooth ride is remembered (the bumps are counted)
      morningExtra = [R.label, R.money, Math.max(2, R.trust - Math.floor(b.bumps / 2))];
      setTimeout(() => ui.hint('morning', 'Теперь — к почте, через дорогу. Встань у дверей и затяни ручник.', 'Пробел'), 3000);
    }
  };
  /**
   * At the post office door: Zinaida's word, and the day's orders on the counter. The first
   * morning the grandfather gets out here for the Ufa bus: the goodbye, then she gives Timur the
   * keys, and as the first route begins, its song.
   */
  const atPostDoor = () => {
    morning = false;
    fromMorning = true;
    ui.clearHint('morning');
    ui.closeChoice();
    audio.paper();
    if (first) {
      const f = first;
      first = null;
      f.arrive();
      grandpaSeat.speak(4);
      input.enabled = false;
      vehicle.handbrake = true;
      setTimeout(() => {
        // out of the cab and onto the porch, to wait for the bus; at home he is not any more
        grandpaSeat.visible = false;
        seenOff = true;
        showPorch(true);
        if (world.home.grandpa) world.setAway(world.home.grandpa, true);
        const page = (eyebrow: string, text: string, opts?: Parameters<typeof ui.storyPage>[2]) => { audio.paper(); ui.storyPage(eyebrow, text, opts); };
        farewellPages(page, () => keysPage(page, () => { ui.hideStory(); firstSheetDue = true; openBoard(); }));
      }, 3400);
      return;
    }
    ui.dialogue('Зинаида Павловна', ZINAIDA[(profile.day - 1) % ZINAIDA.length], null);
    setTimeout(openBoard, 1400);
  };
  /** The next day (or the first after a reload): it starts in the yard at home. */
  const toMorning = () => {
    ui.hideEnd();
    today = boardFor(profile.day, profile.trust);
    if (!started) void begin(false, [], { home: true });
    else startDay([], 'home');
  };
  /** Back into a day saved part-way. */
  const resumeDay = (s: DaySave) => {
    today = boardFor(profile.day, profile.trust);
    // a day saved part-way is past its morning: the grandfather is on his way to Ufa
    seenOff = true;
    void begin(false, s.planned, { resume: s });
  };

  /** Morning: the day's orders on the counter — and once a year, in July, the summer's pages before them. */
  const openBoard = () => {
    const dp = dateParts(profile.day);
    if (summerDue(profile, dp.y, dp.m)) {
      input.enabled = false;
      playSummer(profile, dp.y, {
        page: (eyebrow, text, opts) => { audio.paper(); ui.storyPage(eyebrow, text, opts); },
        done: () => { saveProfile(profile); ui.setGarage(profile); ui.hideStory(); openBoard(); },
      });
      return;
    }
    openBoardNow();
  };
  const openBoardNow = () => {
    today = boardFor(profile.day, profile.trust);
    // an old letter from the cupboard, when its turn has come, goes out with the requests
    const letter = letterForBoard(profile.letters, today.day);
    if (letter) today.requests.unshift(letter.order);
    input.enabled = false;
    ui.showBoard(today, profile, {
      newPlace: newPlaceToday(profile.day),
      note: [today.note,
        police.ambush ? 'Шофера с утра говорят: гаишники сегодня не на посту — с радаром в деревне перед развилкой. Там шестьдесят.' : null,
        police.strict ? 'На посту ГАИ, говорят, капитан из области с проверкой. Сегодня там всё строго.' : null,
        muhaHelps() ? 'Женька Муха — грузчиком при почте: мешки в буханке ещё до тебя. «Давай, почтальон, не опаздывай!»' : null, letter?.note].filter(Boolean).join('<br>') || null,
      onRepair: (kind) => ui.onRepair?.(kind),
      onGo: (ids) => {
        // the waybill goes out whole; the requests are the ones taken
        const orders = [...today.orders, ...today.requests.filter((o) => ids.includes(o.id))];
        if (!started) void begin(false, orders); else startDay(orders, fromMorning ? 'here' : 'post');
        fromMorning = false;
      },
    });
  };
  /** Spring after he quit Lysyi: Muha loads the van in the mornings (a head start on the schedule). */
  const muhaHelps = () => profile.muha?.ending === 'quit' && today.season === 'spring';

  /** What the day holds, for the first hint in the cab. */
  const dayIntro = (orders: Order[]) => {
    const by = new Map<string, Order[]>();
    for (const o of orders) by.set(o.dest, [...(by.get(o.dest) ?? []), o]);
    const parts = [...by.entries()].map(([d, os]) => `${destName(d)} — ${os.map((o) => `${o.from ? `просьба: ${o.from.toLowerCase()}` : o.title.toLowerCase()}${o.due !== null ? ` (срочно, ${Math.round(o.due / 60)} мин)` : ''}`).join(', ')}`);
    const fragile = orders.some((o) => o.fragile) ? ' Стекло в кузове — на ямах аккуратнее.' : '';
    return `Сегодня: ${parts.join('; ')}.${fragile} Можно в любом порядке. Карта — M.`;
  };

  const begin = async (free = false, orders: Order[] = [], at: { home?: boolean; resume?: DaySave } = {}) => {
    if (started) return;
    started = true;
    sandbox = free;
    const quiet = !!at.home;
    // the morning's drive to the post office, before the route sheet, has no roadside encounters and no Muha yet
    if (!free) { mission = newMission(orders); atmo.setDayWeather(today.weather); dayWorld(); snowNow = today.snow; if (!quiet) newEncounters(at.resume); else if (at.home) endDaySystems(); if (!quiet && muhaHelps()) mission.addTime(-90); }
    else { atmo.setDayWeather(null); story?.dispose(); story = null; }
    if (at.resume) mission.restore(at.resume);
    if (!free) { policeDay(); seatGrandpa(false); }
    // a run starts with the van as the last one left it; the sandbox is always a fresh one
    applyWear(free);
    // a run starts with what is in the tank, but never less than a canister's worth
    vehicle.burnFuel = !free;
    vehicle.fuel = free ? 1 : Math.max(profile.fuel, MIN_START_FUEL);
    if (at.resume) {
      const v = at.resume.van;
      vehicle.fuel = v.fuel; vehicle.damage = v.damage; vehicle.steerWear = v.steer; vehicle.radWear = v.rad; vehicle.pullDir = v.pull;
      vehicle.flat = !!v.flat; vehicle.coolant = v.coolant ?? 1; vehicle.odometer = v.odometer ?? 0;
    }
    fuelHinted = false;
    if (vehicle.damage > 0.3) cabin.crack(clamp(vehicle.damage, 0.2, 0.9));
    if (sandbox) {
      const places: [string, string][] = [['start', 'Ключевск'], ['junction', 'Развилка'], ['sosnovka', 'Сосновка'], ['bridge', 'Мост через Серебрянку'], ['zarechye', 'Заречье']];
      for (const d of ground.detours) places.push([`d:${d.road.id}`, d.name[0].toUpperCase() + d.name.slice(1)]);
      ui.setSandbox(true, places);
      ui.onTeleport = (id) => {
        const m2 = ground.marks;
        let road = ground.main;
        let sPos = 22;
        if (id === 'junction') sPos = m2.junction - 10;
        else if (id === 'sosnovka') sPos = m2.sosStop - 20;
        else if (id === 'bridge') sPos = m2.bridge - 40;
        else if (id === 'zarechye') sPos = m2.zarStart + 10;
        else if (id.startsWith('d:')) { road = ground.detours.find((d) => `d:${d.road.id}` === id)!.road; sPos = 30; }
        const f = road.frame(sPos);
        vehicle.place(f.x + f.rx * 1.2, f.z + f.rz * 1.2, Math.atan2(-f.tx, -f.tz), ground);
        ui.toast('Перенесло на место');
      };
    }
    ui.hideTitle();
    // back into the cab
    if (title) { title.dispose(); title = null; }
    head.add(camera);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    cabin.group.visible = true;
    resize();
    input.enabled = true;
    audio.setRadioOnly(false);
    // the title theme gives way to the van's radio
    audio.music(null, 1.8);
    try { await audio.unlock(); } catch (e) { console.warn('audio unavailable', e); }
    audio.radioOn();
    // between the songs, the presenter (only on a working day: the sandbox's radio just plays)
    if (audio.tape) audio.tape.onBreak = () => {
      // (not while the grandfather is talking: the drive home and the first morning)
      const text = !sandbox && !ui.choiceOpen && !first && !prologue ? news?.next() ?? null : null;
      if (!text) return 0;
      ui.dialogue('Радио «Заречье» · 101,7', text, null);
      voice.note('Радио «Заречье»', text, 'radio');
      audio.tape!.presenterClip = voice.bufferNow(text);
      return text.length;
    };
    // the first morning the grandfather teaches the ignition: the engine waits for Enter
    if (!(at.home && profile.runs === 0)) setTimeout(ignition, 700);
    if (sandbox) {
      setTimeout(() => ui.hint('intro', 'Песочница: без графика и ГАИ. Погода — K, время суток — T, обдув стекла — B, закурить — J, телепорт — в паузе (Esc). Есть три объезда по грунтовке и охотничья просека в тупик.', 'K'), 3000);
      return;
    }
    if (at.home) { placeHome(); mission.relocate(vehicle.x, vehicle.z); morningStart(); return; }
    if (at.resume) {
      const v = at.resume.van;
      vehicle.place(v.x, v.z, v.yaw, ground);
      mission.relocate(v.x, v.z);
      vehicle.handbrake = true;
      const left = mission.stops.filter((s) => !s.done).map((s) => s.name);
      setTimeout(() => ui.hint('intro', left.length ? `Продолжаем рейс. Осталось: ${left.join(', ')}. Карта — M.` : 'Продолжаем рейс: все адресаты обслужены — день вот-вот кончится.', 'M'), 2600);
      saveT = 20;
      return;
    }
    setTimeout(() => ui.hint('intro', dayIntro(orders), 'M'), 3200);
    checkpoint();
  };
  // ---- the prologue: home from the army, the drive with the grandfather, the keys
  let prologue: Prologue | null = null;
  const runPrologue = () => {
    prologue = new Prologue({
      page: (eyebrow, text, opts) => { input.enabled = false; audio.paper(); ui.storyPage(eyebrow, text, opts); },
      finish: () => {
        prologue = null;
        profile.prologue = true;
        saveProfile(profile);
        ui.hideStory();
        // the next morning, at home: the first working day's drive to the post office
        toMorning();
      },
    });
    prologue.start();
  };
  // «Новая игра» over a career: wiped, and straight into the opening page and the first morning
  ui.onNewGame = () => {
    if (started || ui.boardOpen || ui.storyOpen) return;
    wipeCareer();
    runPrologue();
  };
  // «В главное меню» from the pause: the day saved where the van stands, and the page starts over at the title
  // (a fresh start of everything, rather than unwinding a day in progress piece by piece)
  ui.onToTitle = () => {
    checkpoint();
    audio.music(null, 0.4);
    ui.leave(() => location.reload());
  };
  ui.onStart = () => {
    if (started || ui.boardOpen || ui.storyOpen) return;
    if (!profile.prologue) { runPrologue(); return; }
    const s = saved();
    if (s) resumeDay(s); else toMorning();
  };
  ui.onFreshDay = () => {
    if (started || ui.boardOpen || ui.storyOpen) return;
    clearDay();
    ui.setResume(null);
    toMorning();
  };
  ui.onStartSandbox = () => void begin(true);
  /**
   * A fresh day (or the same day again from the pause menu): back at the post office with these
   * orders; or the orders taken at the door after the morning drive, the van where it stopped
   * ('here'); or the next morning in the yard at home, before any orders ('home').
   */
  const startDay = (orders: Order[], at: 'post' | 'here' | 'home' = 'post') => {
    const home = at === 'home';
    atmo.setDayWeather(today.weather); dayWorld();
    snowNow = today.snow;
    vehicle.engine = 'off';
    vehicle.handbrake = true;
    vehicle.fourWD = vehicle.low = false;
    vehicle.gear = 1;
    vehicle.odometer = 0;
    applyWear(sandbox);
    vehicle.fuel = sandbox ? 1 : Math.max(profile.fuel, MIN_START_FUEL);
    fuelHinted = false;
    cabin.repair();
    if (vehicle.damage > 0.3) cabin.crack(clamp(vehicle.damage, 0.2, 0.9));
    world.resetEvents();
    if (at === 'post') reset(); else if (home) placeHome();
    held = false;
    policeDay();
    seatGrandpa(false);
    // the first route begins from the post office porch, the grandfather seeing the van off: its song
    if (at === 'here' && firstSheetDue) { firstSheetDue = false; audio.cue(FIRST_SHEET); setTimeout(() => { if (audio.tape?.playing) ui.toast(audio.tape.title, 3.2); }, 1200); }
    else if (at !== 'here') showPorch(false);
    mission = newMission(orders);
    mission.relocate(vehicle.x, vehicle.z);
    if (!sandbox && !home && muhaHelps()) mission.addTime(-90);
    if (!home && morningExtra) { mission.extra(...morningExtra); morningExtra = null; }
    vehicle.flat = false;
    ui.closeChoice();
    if (!sandbox) { if (home) endDaySystems(); else newEncounters(); }
    ui.hideEnd();
    ui.setPaused(false);
    ui.ritual(null, 'near', 0);
    void audio.ctx?.resume();
    input.enabled = true;
    if (!(home && profile.runs === 0)) setTimeout(ignition, 600);
    if (home) { morningStart(); return; }
    morning = false;
    if (!sandbox) setTimeout(() => ui.hint('intro', dayIntro(orders), 'M'), 2600);
    checkpoint();
  };
  // the morning's drive has no orders yet: «заново» is the yard again
  ui.onRestart = () => (morning ? startDay([], 'home') : startDay(mission.planned));
  input.onAnyKey = () => { lastKeyboard = performance.now(); ui.setTouchMode(false); };
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') ui.setTouchMode(true); }, { capture: true });

  // ---- hotspots
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (x: number, y: number): HotspotId | null => {
    const r = renderer.canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(cabin.hotspots.map((h) => h.mesh), false)[0];
    return hit ? cabin.hotspots.find((h) => h.mesh === hit.object)!.id : null;
  };
  input.onClick = (x, y) => { const id = pick(x, y); if (id) act(id); else if (started && cabin.wipeAt(ray)) audio.click(); };

  const progress = () => {
    const done = mission.stops.filter((s) => s.done).length;
    return `пройдено ${(mission.routeS / 1000).toFixed(1).replace('.', ',')} из ${(ground.main.length / 1000).toFixed(1).replace('.', ',')} км · вручено ${done} из ${mission.stops.length}`;
  };

  // ---- sizing
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.resize(w, h);
    camera.aspect = w / h;
    baseFov = title ? (w / h < 1.3 ? 62 : 46) : w / h < 1.3 ? 78 : 68;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  applySettings(ui.settings, null);

  // ---- loop
  const clock = new THREE.Clock();
  let t = 0, frame = 0, titleT = 0, chipT = 0, titleS = 0;
  const sway = { x: 0, y: 0, vx: 0, vy: 0 };
  const camWorld = new THREE.Vector3();
  let hornWas = false;
  let splashT = 0;
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;mix-blend-mode:screen;transition:none';
  document.body.appendChild(flash);
  let policeWas = police.state;

  const tick = () => {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (ui.paused) { renderer.render(scene, camera); return; }
    t += dt;
    frame++;

    input.update(dt, Math.abs(vehicle.vx));
    if (held) vehicle.handbrake = true;
    const controls = held ? { steer: 0, gas: 0, brake: 0 }
      : started && input.enabled && !ui.mapOpen ? { steer: input.steer, gas: input.gas, brake: input.brake } : { steer: 0, gas: 0, brake: 0 };
    // the first morning, while the grandfather asks to pull in at the post: the van eases off by itself
    // bees loose in the cab twitch the wheel
    if (cases?.steerNudge) controls.steer = clamp(controls.steer + cases.steerNudge, -1, 1);
    const assist = morning ? first?.assist ?? null : null;
    if (assist !== null && Math.abs(vehicle.speedKmh) > assist) {
      controls.gas = 0;
      controls.brake = Math.max(controls.brake, clamp((Math.abs(vehicle.speedKmh) - assist) / 20, 0.15, 0.6));
    }
    vehicle.update(dt, controls, ground, world.colliders);
    if (started && !sandbox) {
      fuelStop.update(dt, vehicle, world.inFuelBay(vehicle.x, vehicle.z), profile);
      if (!fuelHinted && vehicle.fuel < 0.12) { fuelHinted = true; ui.hint('fuel', 'Стрелка бензобака у нуля. На нуле мотор тянет на парах — заправка (АЗС) у дороги, просто заезжай и стой у колонки.'); }
    } else if (started) {
      vehicle.fuel = 1;
    }

    // horn: held key/touch, or a short tap from the cabin hotspot
    hornTap = Math.max(0, hornTap - dt);
    // the grandfather on the post office porch: a wave as the van pulls away; out of sight, the bus has him
    if (porch) {
      const d = Math.hypot(vehicle.x - world.postDoor.x, vehicle.z - world.postDoor.z);
      if (!porch.waved && !morning && !ui.storyOpen && !ui.boardOpen && Math.abs(vehicle.speedKmh) > 3) { porch.waved = true; world.postGrandpa.wave = 4.5; }
      else if (d > 160) showPorch(false);
    }
    const horn = input.horn || hornTap > 0;
    cabin.setHorn(horn);
    if (horn && !hornWas) audio.hornOn();
    if (!horn && hornWas) audio.hornOff();
    hornWas = horn;

    // body pose → cabin
    cabin.group.position.set(vehicle.x, vehicle.y, vehicle.z);
    cabin.group.rotation.set(vehicle.pitch, vehicle.yaw, -vehicle.roll);

    // head: inertial sway, road shake, free look
    sway.vx += (-90 * sway.x - 12 * sway.vx - vehicle.accelLat * 0.012) * dt;
    sway.vy += (-90 * sway.y - 12 * sway.vy - vehicle.accelLong * 0.008) * dt;
    sway.x += sway.vx * dt; sway.y += sway.vy * dt;
    shake = damp(shake, 0, 6, dt);
    const rough = vehicle.rough * clamp(Math.abs(vehicle.vx) / 10, 0, 1);
    const idle = vehicle.engine === 'running' ? 0.0012 * (1 + Math.sin(t * 3.1)) : 0;
    const jx = (Math.random() - 0.5) * (shake * 0.02 + rough * 0.006);
    const jy = (Math.random() - 0.5) * (shake * 0.03 + rough * 0.01) + Math.sin(t * 26) * idle;
    head.position.set(EYE.x + sway.x + jx, EYE.y + jy, EYE.z + sway.y);
    if (!started) {
      titleT += dt;
      if (title) {
        titleS = title.update(dt, camera);
        ui.setTitleFade(title.fade, `#${atmo.state.fogColor.getHexString()}`);
      }
      audio.updateRadio(dt);
      // the theme waits for the browser to let the sound in (the first tap or key)
      ui.setSoundWaiting(audio.musicWaiting);
    } else {
      const back = input.lookBack ? 2.6 : 0;
      head.rotation.set(input.lookPitch + EYE_PITCH + jy * 0.4, damp(head.rotation.y, input.lookYaw + back, 10, dt) + sway.x * 0.5, -vehicle.roll * 0.3 + jx * 0.6);
    }

    camera.getWorldPosition(camWorld);
    if (sandbox && frame % 15 === 0) sandboxS = ground.main.nearestS(vehicle.x, vehicle.z);
    atmo.update(dt, started ? (sandbox ? sandboxS : mission.routeS) : titleS, camWorld);
    // world-space velocity of the van for rain, traffic, the train timer and Doppler
    const sy = Math.sin(vehicle.yaw), cy = Math.cos(vehicle.yaw);
    const pvx = -sy * vehicle.vx + cy * vehicle.vy, pvz = -cy * vehicle.vx - sy * vehicle.vy;
    rainTint.copy(atmo.state.fogColor).lerp(WHITE, 0.7).multiplyScalar(1 - atmo.state.dark * 0.3);
    // snow lying: the morning's by the season (none in the sandbox), deepening while it snows
    // (in the sandbox a winter sky picked with K brings its snow with it, to see the winter any time)
    const winterSky = WINTER.some((k) => k.name === atmo.state.name && k.name !== 'Оттепель');
    const snowWant = Math.max(sandbox ? (winterSky ? 1 : 0) : today.snow, atmo.state.snow > 0.3 ? 0.75 : 0);
    snowNow = damp(snowNow, snowWant, snowWant > snowNow ? 0.04 : 0.02, dt);
    ground.snow = snowNow;
    ground.thaw = !sandbox && today.season === 'thaw';
    rain.update(dt, {
      rain: atmo.state.rain, snow: atmo.state.snow, wind: atmo.state.wind, wet: atmo.state.wet, dark: atmo.state.dark,
      cam: camWorld, groundY: ground.height(camWorld.x, camWorld.z),
      vx: pvx, vz: pvz, px: vehicle.x, pz: vehicle.z, yaw: vehicle.yaw, tint: rainTint,
    });
    // nothing past the fog is visible; keep the far-forest ring (r = 560) inside
    const far = Math.max(620, atmo.fog.far + 80);
    if (Math.abs(camera.far - far) > 20) { camera.far = far; camera.updateProjectionMatrix(); }
    renderer.setGrade(atmo.grade);
    ground.wet = atmo.state.wet;
    world.setAtmosphere(atmo.state.dark, atmo.state.wet, atmo.state.skyColor, atmo.state.fogColor);
    world.setSnow(snowNow);
    world.update(dt, t, camWorld);
    country.update(dt, started ? { x: vehicle.x, z: vehicle.z, speed: Math.abs(vehicle.vx) } : { x: camWorld.x, z: camWorld.z, speed: 0 }, { rain: atmo.state.rain, dark: atmo.state.dark, snow: snowNow });
    const life = world.updateLife(dt, t, vehicle.x, vehicle.z, pvx, pvz, atmo.state.dark, vehicle.yaw);
    // falling snow melts on the warm glass: the wipers have work in winter too
    const onGlass = Math.max(atmo.state.rain, atmo.state.snow * 0.5);
    cabin.update(dt, vehicle, onGlass, atmo.state.dark);
    grandpaSeat.update(dt);
    world.honk = horn;
    world.setWeather(atmo.state.rain);
    world.watch = police.state === 'pursuit' ? { x: police.patrol.x, z: police.patrol.z } : null;
    if (started) {
      fx.emitWheels(dt, vehicle, atmo.state.wet);
      // the hood steams and then smokes once the front is badly knocked about
      const hx = -Math.sin(vehicle.yaw), hz = -Math.cos(vehicle.yaw);
      // …and a boiling radiator blows white steam whatever the body looks like
      fx.steam(dt, vehicle.x + hx * 2.3, vehicle.y + 1.5, vehicle.z + hz * 2.3, Math.max(vehicle.damage, vehicle.heat > 0.88 ? 0.6 : 0), pvx * 0.6, pvz * 0.6);
      // mud and puddle water thrown up onto the glass
      splashT -= dt;
      const wetRoad = vehicle.wheels[0].g.puddle || vehicle.wheels[0].g.surface === 'mud' || vehicle.wheels[1].g.puddle;
      if (splashT < 0 && wetRoad && Math.abs(vehicle.vx) > 5) {
        splashT = 0.5 + Math.random() * 0.8;
        cabin.splatter(clamp(Math.abs(vehicle.vx) / 14, 0.2, 1) * 0.6, vehicle.wheels[0].g.surface === 'mud');
      }
      if (police.state === 'pursuit') {
        const p = police.patrol;
        fx.emitCar(dt, p.x, p.z, p.yaw, p.v, p.braking, atmo.state.wet);
      }
    }
    fx.update(dt);

    if (started) {
      if (!sandbox) { encounters?.update(dt, vehicle, mission.routeS); cases?.update(dt, vehicle); story?.update(dt, vehicle); roadside?.update(dt, vehicle); roadStop?.update(dt, vehicle); }
      if (!sandbox) mission.update(dt, vehicle, horn, { lights: cabin.lightsOn, wipers: cabin.wipersOn, rain: Math.max(atmo.state.rain, atmo.state.snow * 0.5), dark: atmo.state.dark });
      const m = ground.marks;
      const s = sandbox ? sandboxS : mission.routeS;
      const near = (a: number, b: number, fade = 120) => clamp(Math.min(s - a + fade, b - s + fade) / fade, 0, 1);
      // out along the branch road from the fork, its own distance (the main road's progress stands still there)
      const onB = ground.nearestRoad(vehicle.x, vehicle.z, 60);
      const bs = onB && onB.sample.road === ground.stub && onB.s > 60 ? onB.s : -1;
      const nearB = (a: number, b: number, fade = 120) => (bs < 0 ? 0 : clamp(Math.min(bs - a + fade, b - bs + fade) / fade, 0, 1));
      // on the forest road home: its own wood and its own village (not the town the main road's progress stands at)
      const hs = onB && onB.sample.road === ground.homeRoad ? onB.s : -1;
      const tag = hs >= 0 ? ground.homeRoad.zoneAt(hs).tag : bs >= 0 ? ground.stub.zoneAt(bs).tag : ground.main.zoneAt(s).tag;
      const homeVillage = hs < 0 ? 0 : clamp((hs - ground.homeMarks.village + 60) / 60, 0, 1);
      audio.update(dt, vehicle, {
        rain: atmo.state.rain, wind: atmo.state.wind, dusk: atmo.state.dark, wet: atmo.state.wet,
        village: hs >= 0 ? Math.max(homeVillage, clamp(1 - hs / 80, 0, 1)) : Math.max(near(0, m.town), ...world.hamlets.map(([a, b]) => near(a, b)), nearB(ground.branch.kaiStart, ground.branch.end)),
        forest: forestAmb = damp(forestAmb, tag === 'forest' || tag === 'bor' ? 1 : 0, 0.6, dt), river: clamp(1 - ground.waterDist(vehicle.x, vehicle.z) / 140, 0, 1),
        // FM fades with distance from the town masts, worst in the river lowland; the farm's tower helps
        reception: Math.max(clamp(1 - s / 2600, 0.32, 1) - forestAmb * 0.1 - near(m.mud, m.bridge, 60) * 0.15, 1 - Math.abs(s - m.tower) / 260, near(m.zarStart, m.zarEnd, 200) * 0.62),
      });
      audio.life(dt, life);
      if (!sandbox) police.update(dt, t, vehicle.x, vehicle.z, pvx, pvz, vehicle.yaw);
      // the morning: stopped on the handbrake at the post office door, the route sheet
      if (morning && first) first.update(dt, vehicle);
      if (birth) birthUpdate(dt);
      bees.update(dt, beeLevel);
      if (morning && !birth && !ui.boardOpen && (!first || first.atDoor) && vehicle.handbrake && Math.abs(vehicle.speedKmh) < 1 && Math.hypot(world.postDoor.x - vehicle.x, world.postDoor.z - vehicle.z) < (first ? 22 : 16)) atPostDoor();
      // the autosave on the road, every so often
      saveT -= dt;
      if (saveT < 0) { saveT = 20; checkpoint(); }
      if (police.state === 'pursuit' && policeWas !== 'pursuit') {
        ui.hint('chase', 'Погоня! Остановишься — штраф. Нет — на асфальте догонят и подрежут. Уходи в лес на грунтовку: легковая ГАИ туда не полезет, а внедорожник рано или поздно сядет в болоте — почтовой машине с передним мостом оно нипочём.', 'Z');
      }
      policeWas = police.state;
      audio.siren(police.siren, t);
      chipT -= dt;
      if (chipT < 0) {
        chipT = 0.1;
        const gear = vehicle.gear === -1 ? 'R' : vehicle.gear === 0 ? 'N' : String(vehicle.gear);
        ui.setChips({
          gear, auto: vehicle.gearMode === 'auto', fourWD: vehicle.fourWD, low: vehicle.low, handbrake: vehicle.handbrake,
          lights: cabin.lightsOn, wipers: cabin.wipersOn, smoke: cabin.smoker.status, volume: audio.tape?.volume, engine: vehicle.engine, tape: audio.tape?.playing ? `▶ ${audio.tape.title}` : null,
        });
        ui.setWeather(atmo.state.name);
        const next = mission.nextStop;
        const len = ground.main.length;
        const sv = ground.main.nearestS(vehicle.x, vehicle.z);
        ui.setRoute({
          next: morning ? 'почты, за путевым листом' : next?.name ?? null, dist: morning ? Math.max(0, mission.routeS - 40) : next ? next.s - mission.routeS : 0, progress: mission.routeS / len,
          stops: mission.stops.map((st) => ({ at: st.s / len, done: st.done })),
          left: mission.dueLeft, urgent: mission.urgentLabel, cargo: mission.fragileAboard ? mission.cargo : null,
          kmh: vehicle.speedKmh, limit: (sv > m.town + 170 && sv < m.town + 490) || world.hamlets.some(([a, b]) => sv > a - 20 && sv < b + 20) ? 60 : null,
          alert: police.alert,
        });
        if (ui.mapOpen) ui.setMap(true, vehicle, progress());
      }
      // hotspot tooltip on hover (desktop)
      if (input.pointer.inside && performance.now() - lastKeyboard > 400 && frame % 4 === 0) {
        const id = pick(input.pointer.x, input.pointer.y);
        const h = id ? cabin.hotspots.find((x) => x.id === id) : null;
        ui.tip(h ? h.label : null, input.pointer.x, input.pointer.y);
        renderer.canvas.style.cursor = h ? 'pointer' : 'grab';
      }
    }
    // chase: strobing blue and red on the windscreen, a rising field of view with speed, rattled by the patrol on the tail
    const chasing = started && police.state === 'pursuit';
    const near = chasing ? clamp(1 - police.gap / 70, 0.15, 1) : 0;
    const odd = Math.floor(t * 5) % 2 === 0;
    flash.style.opacity = chasing ? String(near * (Math.floor(t * 10) % 2 === 0 ? 0.85 : 0.4)) : '0';
    if (chasing) flash.style.background = odd
      ? 'radial-gradient(ellipse 70% 60% at 15% 100%, rgba(40,90,255,0.65), rgba(40,90,255,0) 70%)'
      : 'radial-gradient(ellipse 70% 60% at 85% 100%, rgba(255,40,30,0.6), rgba(255,40,30,0) 70%)';
    if (chasing && police.gap < 14) shake = Math.max(shake, (1 - police.gap / 14) * 0.22);
    if (started) {
      const fov = baseFov + clamp(Math.abs(vehicle.speedKmh) / 90, 0, 1) * 3 + (chasing ? near * 3 : 0);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
    }
    ui.update(dt);

    cabin.group.updateMatrixWorld();
    cabin.renderMirrors(renderer, scene, frame);
    renderer.render(scene, camera);
  };
  tick();
}

boot().catch((e) => {
  console.error(e);
  const p = document.createElement('pre');
  p.className = 'boot-error';
  p.textContent = `Не удалось запустить: ${e instanceof Error ? e.message : String(e)}`;
  document.body.appendChild(p);
});
