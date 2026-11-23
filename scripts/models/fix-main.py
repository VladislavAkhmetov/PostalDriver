with open('src/main.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if "type PrologueVariant" in line:
        start_idx = i
    if "«Новая игра»" in line:
        end_idx = i

print('start_idx:', start_idx, 'end_idx:', end_idx)

replacement = """  const runPrologue = () => {
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
  };
"""

new_lines = lines[:start_idx] + [replacement] + lines[end_idx:]
with open('src/main.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Done!')
