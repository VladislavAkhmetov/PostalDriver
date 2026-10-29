import * as THREE from 'three';
import { RetroRenderer } from './core/Renderer';
import { createTextures } from './core/textures';
import { clamp, damp } from './core/math';
import { Input, Action } from './core/Input';
import { Ground } from './world/Ground';
import { World } from './world/World';
import { Atmosphere } from './world/Atmosphere';
import { Vehicle } from './vehicle/Vehicle';
import { Cabin, EYE, EYE_PITCH, HotspotId } from './vehicle/Cabin';
import { AudioEngine } from './audio/AudioEngine';
import { Mission } from './game/Mission';
import { UI, Settings } from './ui/UI';
import { Police } from './world/Police';
import { Rain } from './world/Rain';
import { loadPeople } from './world/People';
import { loadCars } from './world/Cars';
import { TitleShots } from './game/TitleShots';
import { buildUaz, loadUaz } from './world/Uaz';
import { initAnalytics, trackEvent } from './core/analytics';

async function boot(): Promise<void> {
  initAnalytics();
  const app = document.getElementById('app')!;
  // the character and car models load alongside the fonts
  const people = Promise.all([loadPeople(), loadCars(), loadUaz()]);
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
  const rainTint = new THREE.Color();
  const WHITE = new THREE.Color(1, 1, 1);
  const vehicle = new Vehicle();
  const cabin = new Cabin(T);
  scene.add(cabin.group);
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
  cabin.group.rotation.order = 'YXZ';

  // title sequence: the camera leaves the cab to film a post van on the route
  let title: TitleShots | null = new TitleShots(ground, scene);
  scene.add(camera);
  cabin.group.visible = false;

  const input = new Input(renderer.canvas);
  const ui = new UI(input);
  const audio = new AudioEngine();
  ui.buildMap(ground, world.stops);

  // an arrest holds the van on the handbrake, hands off the pedals: the brake
  // pedal must not be used, at a standstill the automatic box reads it as reverse
  let held = false;
  const police = new Police(ground, world.traffic, world.gai, {
    say: (who, line, stamp) => { ui.dialogue(who, line, stamp); if (stamp) audio.stamp(); else audio.paper(); },
    toast: (text, sec) => ui.toast(text, sec),
    whistle: () => audio.whistle(),
    megaphone: (line) => { ui.dialogue('Мегафон · ГАИ', line, null); audio.megaphone(line); },
    cuffs: () => audio.cuffs(),
    hold: (on) => { held = on; vehicle.handbrake = on; },
    blackout: (title, text, sec, mid, done) => ui.blackout(title, text, sec, mid, done),
    record: (r) => { mission.record(r.kind, r.fine); trackEvent('police_stop'); },
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

  let mission!: Mission;
  const newMission = () => new Mission(world, ground, {
    hint: (id, text, keys) => ui.hint(id, text, keys),
    clearHint: (id) => ui.clearHint(id),
    ritual: (stop, step, honks) => ui.ritual(stop, step, honks),
    delivered: () => { audio.stamp(); audio.chime(); trackEvent('delivered'); },
    dialogue: (who, line) => ui.dialogue(who, line),
    finished: (st) => { ui.showEnd(st); audio.chime(); input.enabled = false; },
    notice: (text) => { ui.hint('notice', text); audio.clink(); },
  });
  mission = newMission();

  let forestAmb = 0;
  const reset = () => {
    const p = world.startPose;
    vehicle.place(p.x, p.z, p.yaw, ground);
  };
  reset();
  if (import.meta.env.DEV) Object.assign(window, { __uaz: { input, vehicle, ground, world, cabin, atmo, camera, scene, renderer, police, rain, ui, audio, get mission() { return mission; } } });

  // ---- vehicle feedback
  let shake = 0;
  vehicle.onImpact = (v) => { audio.impact(v); shake = Math.min(1.2, shake + v * 0.6); mission.crash(v); police.impact(v, vehicle.x, vehicle.z); };
  vehicle.onBump = (s) => { shake = Math.min(1.2, shake + s * 0.25); if (s > 0.2) audio.rattle(s); if (started) mission.jolt(s); };
  vehicle.onShift = () => audio.gearShift();
  vehicle.onSplash = (s) => audio.splash(s);
  vehicle.onPlank = () => audio.plank(clamp(Math.abs(vehicle.vx) / 8, 0.3, 1));
  cabin.onWiperEnd = () => audio.wiper();
  atmo.onLightning = (d) => audio.thunder(d);
  ui.onType = () => audio.type();

  // ---- actions
  let started = false;
  let lastKeyboard = 0;
  let hornTap = 0;
  const act = (a: Action | HotspotId) => {
    if (!started && a !== 'pause' && a !== 'help') return;
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
      case 'lights': cabin.toggleLights(); audio.click(); ui.clearHint('lights'); break;
      case 'wipers': cabin.toggleWipers(); audio.click(); ui.clearHint('wipers'); break;
      case 'horn': hornTap = 0.25; break;
      case 'map': ui.setMap(!ui.mapOpen, vehicle, progress()); audio.paper(); break;
      case 'tape': if (audio.tape) { audio.click(); audio.tape.toggle(); } break;
      case 'tapeNext': if (audio.tape) { audio.click(); audio.tape.next(); } break;
      case 'weather': ui.toast(`Погода: ${atmo.cyclePreset()}`); break;
      case 'mute': audio.setMuted(!audio.muted); ui.setMuted(audio.muted); break;
      case 'pause':
        if (ui.helpOpen) { ui.toggleHelp(false); break; }
        if (!started) break;
        if (ui.mapOpen) { ui.setMap(false); break; }
        ui.setPaused(!ui.paused);
        input.enabled = !ui.paused && !mission.finished;
        void (ui.paused ? audio.ctx?.suspend() : audio.ctx?.resume());
        break;
      case 'reset': {
        const s = ground.main.nearestS(vehicle.x, vehicle.z);
        const f = ground.main.frame(s);
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
  // own cassettes: pick in the pause menu or drop audio files onto the window
  const loadTapes = (files: FileList | File[]) => {
    const n = audio.tape?.loadFiles(files) ?? 0;
    ui.toast(n ? `Кассета вставлена · ${n} ${n === 1 ? 'трек' : n < 5 ? 'трека' : 'треков'}` : audio.tape ? 'Это не аудиофайлы' : 'Сначала заведи машину');
  };
  ui.onFiles = loadTapes;
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer?.files.length) loadTapes(e.dataTransfer.files); });

  const ignition = () => {
    if (vehicle.engine !== 'off') return;
    trackEvent('engine_start');
    const crank = audio.starter();
    vehicle.startEngine(crank);
    // the sound runs on the audio clock: catch on its last chuff even if frames lag
    setTimeout(() => vehicle.catchStart(), crank * 1000);
    ui.clearHint('start');
  };

  const begin = async () => {
    if (started) return;
    started = true;
    ui.hideTitle();
    // back into the cab
    if (title) { title.dispose(); title = null; }
    head.add(camera);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    cabin.group.visible = true;
    resize();
    input.enabled = true;
    try { await audio.unlock(); } catch (e) { console.warn('audio unavailable', e); }
    setTimeout(ignition, 700);
    setTimeout(() => ui.hint('intro', 'Сосновка, потом Заречье. Сельпо закрывается на обед через 12 минут, а в посылках банки: по асфальту — живее, на ямах — аккуратнее. На развилке — направо.', 'M'), 3200);
  };
  ui.onStart = () => void begin();
  ui.onRestart = () => {
    for (const s of world.stops) { s.done = false; s.person.wave = 0; }
    vehicle.engine = 'off';
    vehicle.handbrake = true;
    vehicle.fourWD = vehicle.low = false;
    vehicle.gear = 1;
    vehicle.odometer = 0;
    reset();
    held = false;
    police.reset();
    mission = newMission();
    ui.hideEnd();
    ui.setPaused(false);
    ui.ritual(null, 'near', 0);
    void audio.ctx?.resume();
    input.enabled = true;
    setTimeout(ignition, 600);
  };
  input.onAnyKey = () => { lastKeyboard = performance.now(); ui.setTouchMode(false); };
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') ui.setTouchMode(true); }, { capture: true });
  window.addEventListener('keydown', (e) => { if (!started && e.code === 'Enter') { e.preventDefault(); void begin(); } });

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
  input.onClick = (x, y) => { const id = pick(x, y); if (id) act(id); };

  const progress = () => {
    const done = world.stops.filter((s) => s.done).length;
    return `пройдено ${(mission.routeS / 1000).toFixed(1).replace('.', ',')} из ${(ground.main.length / 1000).toFixed(1).replace('.', ',')} км · вручено ${done} из ${world.stops.length}`;
  };

  // ---- sizing
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.resize(w, h);
    camera.aspect = w / h;
    camera.fov = title ? (w / h < 1.3 ? 62 : 46) : w / h < 1.3 ? 78 : 68;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  applySettings(ui.settings, null);

  // ---- loop
  const clock = new THREE.Clock();
  let t = 0, frame = 0, titleT = 0, chipT = 0;
  const sway = { x: 0, y: 0, vx: 0, vy: 0 };
  const camWorld = new THREE.Vector3();
  let hornWas = false;
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
    vehicle.update(dt, controls, ground, world.colliders);

    // horn: held key/touch, or a short tap from the cabin hotspot
    hornTap = Math.max(0, hornTap - dt);
    const horn = input.horn || hornTap > 0;
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
        title.update(dt, camera);
        ui.setTitleFade(title.fade, title.caption);
      }
    } else {
      const back = input.lookBack ? 2.6 : 0;
      head.rotation.set(input.lookPitch + EYE_PITCH + jy * 0.4, damp(head.rotation.y, input.lookYaw + back, 10, dt) + sway.x * 0.5, -vehicle.roll * 0.3 + jx * 0.6);
    }

    camera.getWorldPosition(camWorld);
    atmo.update(dt, started ? mission.routeS : 0, camWorld);
    // world-space velocity of the van for rain, traffic, the train timer and Doppler
    const sy = Math.sin(vehicle.yaw), cy = Math.cos(vehicle.yaw);
    const pvx = -sy * vehicle.vx + cy * vehicle.vy, pvz = -cy * vehicle.vx - sy * vehicle.vy;
    rainTint.copy(atmo.state.fogColor).lerp(WHITE, 0.7).multiplyScalar(1 - atmo.state.dark * 0.3);
    rain.update(dt, {
      rain: atmo.state.rain, wind: atmo.state.wind, wet: atmo.state.wet, dark: atmo.state.dark,
      cam: camWorld, groundY: ground.height(camWorld.x, camWorld.z),
      vx: pvx, vz: pvz, px: vehicle.x, pz: vehicle.z, yaw: vehicle.yaw, tint: rainTint,
    });
    // nothing past the fog is visible; keep the far-forest ring (r = 560) inside
    const far = Math.max(620, atmo.fog.far + 80);
    if (Math.abs(camera.far - far) > 20) { camera.far = far; camera.updateProjectionMatrix(); }
    renderer.setGrade(atmo.grade);
    ground.wet = atmo.state.wet;
    world.setAtmosphere(atmo.state.dark, atmo.state.wet, atmo.state.skyColor, atmo.state.fogColor);
    world.update(dt, t, camWorld);
    const life = world.updateLife(dt, t, vehicle.x, vehicle.z, pvx, pvz, atmo.state.dark, vehicle.yaw);
    cabin.update(dt, vehicle, atmo.state.rain, atmo.state.dark);

    if (started) {
      mission.update(dt, vehicle, horn, { lights: cabin.lightsOn, wipers: cabin.wipersOn, rain: atmo.state.rain, dark: atmo.state.dark });
      const m = ground.marks;
      const s = mission.routeS;
      const near = (a: number, b: number, fade = 120) => clamp(Math.min(s - a + fade, b - s + fade) / fade, 0, 1);
      audio.update(dt, vehicle, {
        rain: atmo.state.rain, wind: atmo.state.wind, dusk: atmo.state.dark, wet: atmo.state.wet,
        village: Math.max(near(0, m.town), ...world.hamlets.map(([a, b]) => near(a, b))),
        forest: forestAmb = damp(forestAmb, ground.main.zoneAt(s).tag === 'forest' ? 1 : 0, 0.6, dt), river: clamp(1 - ground.riverDist(vehicle.x, vehicle.z) / 140, 0, 1),
        // FM fades with distance from the town masts, worst in the river lowland; the farm's tower helps
        reception: Math.max(clamp(1 - s / 2600, 0.32, 1) - forestAmb * 0.1 - near(m.mud, m.bridge, 60) * 0.15, 1 - Math.abs(s - m.tower) / 260, near(m.zarStart, m.zarEnd, 200) * 0.62),
      });
      audio.life(dt, life);
      police.update(dt, t, vehicle.x, vehicle.z, pvx, pvz, vehicle.yaw);
      if (police.state === 'pursuit' && policeWas !== 'pursuit') {
        ui.hint('chase', 'Погоня! Остановишься — штраф. Нет — на асфальте догонят и подрежут. Уходи в лес на грунтовку: легковая ГАИ туда не полезет, а внедорожник рано или поздно сядет в болоте — буханке с передним мостом оно нипочём.', 'Z');
      }
      policeWas = police.state;
      audio.siren(police.siren, t);
      chipT -= dt;
      if (chipT < 0) {
        chipT = 0.1;
        const gear = vehicle.gear === -1 ? 'R' : vehicle.gear === 0 ? 'N' : String(vehicle.gear);
        ui.setChips({
          gear, auto: vehicle.gearMode === 'auto', fourWD: vehicle.fourWD, low: vehicle.low, handbrake: vehicle.handbrake,
          lights: cabin.lightsOn, wipers: cabin.wipersOn, engine: vehicle.engine, tape: audio.tape?.playing ? `▶ ${audio.tape.title}` : null,
        });
        ui.setWeather(atmo.state.name);
        const next = mission.nextStop;
        const len = ground.main.length;
        const sv = ground.main.nearestS(vehicle.x, vehicle.z);
        ui.setRoute({
          next: next?.name ?? null, dist: next ? next.s - mission.routeS : 0, progress: mission.routeS / len,
          stops: world.stops.map((st) => ({ at: st.s / len, done: st.done })),
          left: mission.nextStop ? mission.left : null, cargo: mission.cargo,
          kmh: vehicle.speedKmh, limit: sv > m.town + 170 && sv < m.town + 490 ? 60 : null,
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
