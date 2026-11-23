import re

with open('src/main.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add camera angle definitions and UI button
old_block = """  let prologueModelVariant: PrologueVariant = 'interior';
  let compareBtn: HTMLButtonElement | null = null;"""

new_block = """  let prologueModelVariant: PrologueVariant = 'interior';
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
  };"""

assert old_block in content, "old_block not found in main.ts"
content = content.replace(old_block, new_block, 1)

# 2. Add keydown listener for [C]
old_key = """    if ((e.code === 'KeyV' || e.key === 'v' || e.key === 'м' || e.key === 'М') && prologueCam) {
      setPrologueModel(nextPrologueVariant());
    }"""

new_key = """    if ((e.code === 'KeyV' || e.key === 'v' || e.key === 'м' || e.key === 'М') && prologueCam) {
      setPrologueModel(nextPrologueVariant());
    }
    if ((e.code === 'KeyC' || e.key === 'c' || e.key === 'с' || e.key === 'С') && prologueCam) {
      setPrologueCamAngle(nextPrologueCamAngle());
    }"""

assert old_key in content, "old_key not found in main.ts"
content = content.replace(old_key, new_key, 1)

# 3. Add camBtn creation and removal in runPrologue
old_btn = """      compareBtn.onclick = () => setPrologueModel(nextPrologueVariant());
      document.body.appendChild(compareBtn);
    }"""

new_btn = """      compareBtn.onclick = () => setPrologueModel(nextPrologueVariant());
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
    }"""

assert old_btn in content, "old_btn not found in main.ts"
content = content.replace(old_btn, new_btn, 1)

# 4. Remove camBtn in finish
old_cleanup = """        if (compareBtn) {
          compareBtn.remove();
          compareBtn = null;
        }"""

new_cleanup = """        if (compareBtn) {
          compareBtn.remove();
          compareBtn = null;
        }
        if (camBtn) {
          camBtn.remove();
          camBtn = null;
        }"""

assert old_cleanup in content, "old_cleanup not found in main.ts"
content = content.replace(old_cleanup, new_cleanup, 1)

# 5. Update render loop camera position based on prologueCamAngle
old_render = """      if (prologueCam) {
        // Real in-engine 3D render framing the Bukhanka in the family yard
        const cp = world.yardPoint(3.4, 7.6);
        const lp = world.yardPoint(-1.6, -1.0);
        camera.position.set(cp.x + Math.sin(t * 0.12) * 0.08, cp.y + 1.42 + Math.cos(t * 0.16) * 0.03, cp.z);
        camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        ui.setTitleFade(0, '#000000');
        audio.updateVillage(dt);
      }"""

new_render = """      if (prologueCam) {
        let cp, lp;
        if (prologueCamAngle === 'front') {
          cp = world.yardPoint(-2.7, 0.3);
          lp = world.yardPoint(0.3, 3.8);
          camera.position.set(cp.x + Math.sin(t * 0.12) * 0.05, cp.y + 1.35 + Math.cos(t * 0.16) * 0.02, cp.z);
          camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        } else if (prologueCamAngle === 'cab') {
          cp = world.yardPoint(-1.85, 3.0);
          lp = world.yardPoint(0.3, 3.3);
          camera.position.set(cp.x + Math.sin(t * 0.12) * 0.03, cp.y + 1.38 + Math.cos(t * 0.16) * 0.02, cp.z);
          camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        } else {
          cp = world.yardPoint(3.4, 7.6);
          lp = world.yardPoint(-1.6, -1.0);
          camera.position.set(cp.x + Math.sin(t * 0.12) * 0.08, cp.y + 1.42 + Math.cos(t * 0.16) * 0.03, cp.z);
          camera.lookAt(lp.x, lp.y + 1.25, lp.z);
        }
        ui.setTitleFade(0, '#000000');
        audio.updateVillage(dt);
      }"""

assert old_render in content, "old_render not found in main.ts"
content = content.replace(old_render, new_render, 1)

with open('src/main.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated main.ts successfully with camera angle switching!")
