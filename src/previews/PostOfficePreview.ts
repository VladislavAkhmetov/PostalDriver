import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RetroRenderer } from '../core/Renderer';
import { createTextures } from '../core/textures';
import { Ground } from '../world/Ground';
import { World } from '../world/World';
import { loadPeople } from '../world/People';
import { loadCars } from '../world/Cars';
import { loadSoviet } from '../world/Soviet';
import { loadAnimals } from '../world/Animals';
import { loadUaz } from '../world/Uaz';
import type { PostOfficeShot } from '../world/PostOfficeInterior';
import { StoryScene } from '../game/StoryScene';
import { PostOfficeHiring } from '../game/PostOfficeHiring';
import { HIRING_BEATS, HIRING_SHOTS, type HiringShot } from '../game/PostOfficeHiringScript';
import { Input } from '../core/Input';
import { UI } from '../ui/UI';

async function start(): Promise<void> {
  await Promise.all([loadPeople(), loadCars(), loadSoviet(), loadAnimals(), loadUaz()]);
  const world = new World(new Ground(), createTextures());
  world.setDay(4, 6); // Zero-based month: the first working morning, May 6, 1998.
  const room = world.postInterior;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b4c5c4'); scene.fog = new THREE.Fog('#b4c5c4', 150, 650);
  scene.add(world.group, new THREE.HemisphereLight('#e1e5d4', '#6c6652', 1.25));
  const sun = new THREE.DirectionalLight('#fff0cd', 1.1); sun.position.set(-80, 110, 60); scene.add(sun);
  const renderer = new RetroRenderer(document.getElementById('app')!);
  // Use the actual game UI, including its fonts, subtitle layout and numbered choices.
  const input = new Input(renderer.canvas); input.enabled = false;
  const ui = new UI(input); ui.hideTitle(); ui.root.hidden = true;
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .03, 1200);
  const controls = new OrbitControls(camera, renderer.canvas);
  controls.enableDamping = true; controls.minDistance = .25; controls.maxDistance = 5;
  const select = (shot: PostOfficeShot) => {
    controls.target.copy(room.frame(camera, shot)); controls.maxDistance = shot === 'window' ? 15 : 5;
    controls.update();
    document.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shot === shot)));
  };
  document.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach(b => b.onclick = () => select(b.dataset.shot as PostOfficeShot));
  const furniture = document.querySelector<HTMLButtonElement>('#furniture')!;
  furniture.onclick = () => { room.furniture.visible = !room.furniture.visible; furniture.setAttribute('aria-pressed', String(room.furniture.visible)); };
  const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.resize(innerWidth, innerHeight); };
  document.querySelector<HTMLButtonElement>('#retro')!.onclick = e => {
    renderer.pixelMode = !renderer.pixelMode; (e.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(renderer.pixelMode)); resize();
  };
  addEventListener('resize', resize); resize(); select('wide');
  document.getElementById('status')!.textContent = 'Ключевское отделение связи. 6 мая 1998 года. За окном — настоящая игровая локация.';
  const status = document.getElementById('status')!;
  const selector = document.querySelector<HTMLSelectElement>('#scene-beat')!;
  const pause = document.querySelector<HTMLButtonElement>('#scene-pause')!;
  const hiring = new PostOfficeHiring(world, camera);
  let paused = false, review: string | null = null;
  const caption = (speaker: string, line: string) => {
    if (line) ui.sceneLine(speaker, line); else ui.clearSceneLine();
  };
  const staging = (on: boolean) => {
    document.body.classList.toggle('staging', on); controls.enabled = !on;
    ui.root.hidden = !on; ui.storyCinema(on);
    if (on) { room.furniture.visible = true; furniture.setAttribute('aria-pressed', 'true'); }
  };
  const player = new StoryScene(scene, camera, {
    begin: () => staging(true), line: (who, line) => { caption(who, line); return 0; },
    choices: (options, pick) => ui.sceneChoices(options, pick),
    clear: () => ui.clearSceneLine(),
    end: () => staging(false),
  });
  const label = (id: string) => `${Object.keys(HIRING_BEATS).indexOf(id) + 1} · ${HIRING_SHOTS[HIRING_BEATS[id].shot as HiringShot].title}${HIRING_BEATS[id].speaker ? ' · ' + HIRING_BEATS[id].speaker : ''}`;
  for (const id of Object.keys(HIRING_BEATS)) { const o = document.createElement('option'); o.value = id; o.textContent = label(id); selector.appendChild(o); }
  const inspect = (id: string) => {
    player.cancel(); hiring.leave(); review = id; paused = true; ui.paused = true; pause.textContent = 'Продолжить';
    staging(true); hiring.inspect(id); selector.value = id; status.textContent = label(id) + ' · постановочный кадр';
    caption(HIRING_BEATS[id].speaker ?? '', HIRING_BEATS[id].line ?? '');
  };
  const play = (first = 'establish') => {
    player.cancel(); hiring.leave(); review = null; paused = false; ui.paused = false; pause.textContent = 'Пауза';
    const script = hiring.script(() => inspect('end')); script.first = first;
    player.play(script);
  };
  document.getElementById('hiring')!.onclick = () => inspect('establish');
  document.getElementById('scene-play')!.onclick = () => play();
  pause.onclick = () => { if (review) { play(review); return; } paused = !paused; ui.paused = paused; pause.textContent = paused ? 'Продолжить' : 'Пауза'; };
  selector.onchange = () => inspect(selector.value);
  document.getElementById('scene-exit')!.onclick = () => {
    player.cancel(); hiring.leave(); review = null; paused = false; staging(false); select('wide');
    status.textContent = 'Ключевское отделение связи. 6 мая 1998 года. За окном — настоящая игровая локация.';
  };
  // Open with the three-character composition, ready to play or inspect any authored beat.
  inspect('establish');
  const clock = new THREE.Clock(); let time = 0;
  renderer.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), .05); time += dt;
    if (controls.enabled) controls.update();
    if (!paused) player.update(dt);
    ui.update(paused ? 0 : dt);
    if (player.currentBeat) { selector.value = player.currentBeat; status.textContent = label(player.currentBeat) + (paused ? ' · пауза' : ''); }
    world.updateLife(dt, time, camera.position.x, camera.position.z, 0, 0, 0);
    world.update(dt, time, camera.position); renderer.render(scene, camera);
  });
  Object.assign(window, { __postOffice: { world, room, scene, camera, renderer, select, player, hiring } });
}
start().catch(error => { document.getElementById('status')!.textContent = String(error); console.error(error); });
