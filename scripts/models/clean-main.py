with open('src/main.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update import
text = text.replace(
    "import { buildUaz, buildUazWithInterior, buildUazHunyuan, loadUaz } from './world/Uaz';",
    "import { buildUaz, loadUaz } from './world/Uaz';"
)

# 2. Update prologue definition and runPrologue
old_prologue_block = '''  // ---- the prologue: home from the army, the drive with the grandfather, the keys
  let prologue: Prologue | null = null;
  let prologueCam = false;
  let prologueVan: VehicleModel | null = null;
  type PrologueVariant = 'interior' | 'classic' | 'hunyuan';
  let prologueModelVariant: PrologueVariant = 'interior';
  let compareBtn: HTMLButtonElement | null = null;
  type CameraAngle = 'rear' | 'front' | 'cab';
  let prologueCamAngle: CameraAngle = 'rear';
  let camBtn: HTMLButtonElement | null = null;

  const setPrologueCamAngle = (angle: CameraAngle) => {
    prologueCamAngle = angle;
    if (camBtn) {
      const label = prologueCamAngle === 'front'
        ? '👀 Спереди (Лобовое + Кабина)'
        : (prologueCamAngle === 'cab' ? '🚪 Дверь водителя (Руль + Салон)' : '🏡 Двор (Сзади)');
      camBtn.innerHTML = '<span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.75;display:block;margin-bottom:2px">Ракурс камеры [C]</span>' +
        '<span style="color:#38bdf8;font-weight:600">' + label + '</span>';
    }
  };

  const nextPrologueCamAngle = (): CameraAngle => {
    if (prologueCamAngle === 'rear') return 'front';
    if (prologueCamAngle === 'front') return 'cab';
    return 'rear';
  };

  const setPrologueModel = (variant: PrologueVariant) => {
    prologueModelVariant = variant;
    if (prologueVan) {
      scene.remove(prologueVan.group);
      prologueVan = null;
    }
    if (prologueModelVariant === 'interior') {
      prologueVan = buildUazWithInterior('post');
    } else if (prologueModelVariant === 'classic') {
      prologueVan = buildUaz('post');
    } else {
      prologueVan = buildUazHunyuan(false);
    }
    scene.add(prologueVan.group);
    const h = world.homePose;
    const sy = Math.sin(h.yaw), cy = Math.cos(h.yaw);
    const yFront = ground.height(h.x - sy * 1.3, h.z - cy * 1.3);
    const yRear = ground.height(h.x + sy * 1.3, h.z + cy * 1.3);
    const pitch = -Math.atan2(yFront - yRear, 2.6);
    prologueVan.group.position.set(h.x, (yFront + yRear) / 2, h.z);
    prologueVan.group.rotation.set(pitch, h.yaw, 0, 'YXZ');
    prologueVan.group.visible = true;

    if (compareBtn) {
      const label = prologueModelVariant === 'interior'
        ? '✨ Классика 90-х (Прозрачные стёкла + Салон)'
        : (prologueModelVariant === 'classic' ? '📦 Базовая классика (Без салона)' : '🤖 Hunyuan3D (Нейросеть)');
      const color = prologueModelVariant === 'interior' ? '#4ade80' : (prologueModelVariant === 'classic' ? '#60a5fa' : '#f59e0b');
      compareBtn.innerHTML = '<span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.75;display:block;margin-bottom:2px">Сравнение моделей [V]</span>' +
        '<span style="color:' + color + ';font-weight:600">' + label + '</span>';
    }
  };

  const nextPrologueVariant = (): PrologueVariant => {
    if (prologueModelVariant === 'interior') return 'classic';
    if (prologueModelVariant === 'classic') return 'hunyuan';
    return 'interior';
  };

  window.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyV' || e.key === 'v' || e.key === 'м' || e.key === 'М') && prologueCam) {
      setPrologueModel(nextPrologueVariant());
    }
    if ((e.code === 'KeyC' || e.key === 'c' || e.key === 'с' || e.key === 'С') && prologueCam) {
      setPrologueCamAngle(nextPrologueCamAngle());
    }
  });

  const runPrologue = () => {
    ui.hideTitle();
    if (title) { title.dispose(); title = null; }
    audio.musicVolume(0.22, 2.5);
    audio.startVillage(0.42);
    atmo.setDayWeather(today.weather || 'Золотая осень');
    dayWorld();
    placeHome();
    seatGrandpa(false);

    // Keep the interior driving cabin hidden during the exterior cinematic prologue
    cabin.group.visible = false;

    if (!compareBtn) {
      compareBtn = document.createElement('button');
      compareBtn.style.cssText = 'position:fixed;top:18px;right:18px;z-index:9999;background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.22);color:#f8fafc;padding:9px 14px;border-radius:8px;cursor:pointer;font-family:sans-serif;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,0.45);text-align:left;transition:all 0.15s ease;user-select:none;';
      compareBtn.title = 'Нажмите V или кликните для переключения';
      compareBtn.onmouseenter = () => { if (compareBtn) compareBtn.style.borderColor = '#38bdf8'; };
      compareBtn.onmouseleave = () => { if (compareBtn) compareBtn.style.borderColor = 'rgba(255,255,255,0.22)'; };
      compareBtn.onclick = () => setPrologueModel(nextPrologueVariant());
      document.body.appendChild(compareBtn);
    }

    if (!camBtn) {
      camBtn = document.createElement('button');
      camBtn.style.cssText = 'position:fixed;top:74px;right:18px;z-index:9999;background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.22);color:#f8fafc;padding:9px 14px;border-radius:8px;cursor:pointer;font-family:sans-serif;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,0.45);text-align:left;transition:all 0.15s ease;user-select:none;';
      camBtn.title = 'Нажмите C или кликните для смены ракурса камеры';
      camBtn.onmouseenter = () => { if (camBtn) camBtn.style.borderColor = '#38bdf8'; };
      camBtn.onmouseleave = () => { if (camBtn) camBtn.style.borderColor = 'rgba(255,255,255,0.22)'; };
      camBtn.onclick = () => setPrologueCamAngle(nextPrologueCamAngle());
      document.body.appendChild(camBtn);
      setPrologueCamAngle('rear');
    }

    setPrologueModel('interior');
    prologueCam = true;

    prologue = new Prologue({
      page: (eyebrow, text, opts) => { input.enabled = false; audio.paper(); ui.storyPage(eyebrow, text, opts); },
      finish: () => {
        prologue = null;
        profile.prologue = true;
        saveProfile(profile);
        ui.hideStory();
        prologueCam = false;

        // Clean up exterior prologue van & compare button
        if (compareBtn) {
          compareBtn.remove();
          compareBtn = null;
        }
        if (camBtn) {
          camBtn.remove();
          camBtn = null;
        }
        if (prologueVan) {
          scene.remove(prologueVan.group);
          prologueVan = null;
        }
        audio.music(null, 1.8);
        audio.stopVillage(2.0);

        // the next morning, at home: the first working day's drive to the post office
        toMorning();
      },
    });
    prologue.start();
  };'''

new_prologue_block = '''  // ---- the prologue: home from the army, the drive with the grandfather, the keys
  let prologue: Prologue | null = null;
  let prologueCam = false;
  let prologueVan: VehicleModel | null = null;

  const runPrologue = () => {
    ui.hideTitle();
    if (title) { title.dispose(); title = null; }
    audio.musicVolume(0.22, 2.5);
    audio.startVillage(0.42);
    atmo.setDayWeather(today.weather || 'Золотая осень');
    dayWorld();
    placeHome();
    seatGrandpa(false);

    // Keep the interior driving cabin hidden during the exterior cinematic prologue
    cabin.group.visible = false;

    // Classic post van standing in the yard with Hunyuan 3D wheels, transparent glass and interior
    prologueVan = buildUaz('post');
    scene.add(prologueVan.group);
    const h = world.homePose;
    const sy = Math.sin(h.yaw), cy = Math.cos(h.yaw);
    const yFront = ground.height(h.x - sy * 1.3, h.z - cy * 1.3);
    const yRear = ground.height(h.x + sy * 1.3, h.z + cy * 1.3);
    const pitch = -Math.atan2(yFront - yRear, 2.6);
    prologueVan.group.position.set(h.x, (yFront + yRear) / 2, h.z);
    prologueVan.group.rotation.set(pitch, h.yaw, 0, 'YXZ');
    prologueVan.group.visible = true;

    prologueCam = true;

    prologue = new Prologue({
      page: (eyebrow, text, opts) => { input.enabled = false; audio.paper(); ui.storyPage(eyebrow, text, opts); },
      finish: () => {
        prologue = null;
        profile.prologue = true;
        saveProfile(profile);
        ui.hideStory();
        prologueCam = false;

        // Clean up exterior prologue van
        if (prologueVan) {
          scene.remove(prologueVan.group);
          prologueVan = null;
        }
        audio.music(null, 1.8);
        audio.stopVillage(2.0);

        // the next morning, at home: the first working day's drive to the post office
        toMorning();
      },
    });
    prologue.start();
  };'''

text = text.replace(old_prologue_block.replace('\n', '\r\n'), new_prologue_block.replace('\n', '\r\n'))

# 3. Restore camera angle 1 in render loop
old_cam_render = '''      if (prologueCam) {
        let cp, lp;
        if (prologueCamAngle === 'front') {
          cp = world.yardPoint(-2.7, 0.3);
          lp = world.yardPoint(0.3, 3.8);
          camera.position.set(cp.x + Math.sin(t * 0.12) * 0.05, cp.y + 1.35 + Math.cos(t * 0.16) * 0.02, cp.z);
          camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        } else if (prologueCamAngle === 'cab') {
          cp = world.yardPoint(2.2, 2.9);
          lp = world.yardPoint(0.3, 3.2);
          camera.position.set(cp.x + Math.sin(t * 0.12) * 0.03, cp.y + 1.36 + Math.cos(t * 0.16) * 0.02, cp.z);
          camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        } else {
          cp = world.yardPoint(3.4, 7.6);
          lp = world.yardPoint(-1.6, -1.0);
          camera.position.set(cp.x + Math.sin(t * 0.12) * 0.08, cp.y + 1.42 + Math.cos(t * 0.16) * 0.03, cp.z);
          camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        }
        ui.setTitleFade(0, '#000000');
        audio.updateVillage(dt);
      }'''

new_cam_render = '''      if (prologueCam) {
        // Real in-engine 3D render framing the Bukhanka in the family yard (Angle 1)
        const cp = world.yardPoint(3.4, 7.6);
        const lp = world.yardPoint(-1.6, -1.0);
        camera.position.set(cp.x + Math.sin(t * 0.12) * 0.08, cp.y + 1.42 + Math.cos(t * 0.16) * 0.03, cp.z);
        camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        ui.setTitleFade(0, '#000000');
        audio.updateVillage(dt);
      }'''

text = text.replace(old_cam_render.replace('\n', '\r\n'), new_cam_render.replace('\n', '\r\n'))

with open('src/main.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print('Cleaned up main.ts successfully!')
