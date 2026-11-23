import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor('#202724');
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .001, 10);
camera.position.set(.06, .025, .27);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -.01, 0); controls.enableDamping = true;
controls.minDistance = .13; controls.maxDistance = 1.2;
scene.add(new THREE.HemisphereLight('#f4f0da', '#465347', 2));
const key = new THREE.DirectionalLight('#fff3d7', 3); key.position.set(-.1,.15,.2); scene.add(key);
const fill = new THREE.DirectionalLight('#c1d9e8', 1.5); fill.position.set(.15,0,.1); scene.add(fill);
const status = document.querySelector<HTMLDivElement>('#status')!;
const slider = document.querySelector<HTMLInputElement>('#speed')!;
const output = document.querySelector<HTMLOutputElement>('#value')!;
let needle: THREE.Object3D | undefined;
let sweeping = false, sweepTime = 0, current = 42, retro = false;
const axis = new THREE.Vector3(0,0,1);
type Variant = 'game' | 'cinematic';
const models = new Map<Variant, THREE.Group>();
let active: THREE.Group | undefined, selected: Variant = 'game', loadId = 0;
const loader = new GLTFLoader();
async function select(variant: Variant) {
  const request = ++loadId;
  status.textContent = 'Загрузка модели…';
  try {
    let mount = models.get(variant);
    if (!mount) {
      const gltf = await loader.loadAsync(variant === 'game' ? '/models/cabin-game/uaz-speedometer-game.glb' : '/models/cabin-prototype/uaz-speedometer.glb');
      mount = new THREE.Group();
      if (variant === 'cinematic') mount.rotation.x = Math.PI / 2;
      mount.add(gltf.scene);
      let gameMaterial: THREE.MeshLambertMaterial | undefined;
      let geometryTriangles=0;
      gltf.scene.traverse(ob => {
    if (!(ob instanceof THREE.Mesh)) return;
    geometryTriangles+=(ob.geometry.index?.count??ob.geometry.attributes.position.count)/3;
    if (variant === 'game') {
      const old = ob.material as THREE.MeshStandardMaterial;
      // The runtime matches the cabin's inexpensive diffuse material model.
      gameMaterial ??= new THREE.MeshLambertMaterial({map:old.map});
      ob.material = gameMaterial;
    }
    if (ob.name === 'glass') { ob.material.transparent = true; ob.material.depthWrite = false; ob.renderOrder = 2; }
    if (ob.name === 'dial') {
      const mat = ob.material as THREE.MeshStandardMaterial;
      if(mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.needsUpdate = true; }
    }
      });
      mount.userData.geometryTriangles=geometryTriangles;
      models.set(variant,mount);
    }
    if (request !== loadId) return;
    if (active) scene.remove(active);
    active=mount; selected=variant; scene.add(active);
    needle=active.getObjectByName('speed_needle');
    if (!needle) throw new Error('В модели отсутствует стрелка');
    axis.set(0,variant==='cinematic'?1:0,variant==='game'?1:0);
    for (const name of ['game','cinematic']) document.querySelector(`#${name}`)!.setAttribute('aria-pressed',String(name===variant));
  } catch(err) { status.textContent = 'Не удалось загрузить модель'; console.error(err); }
}
document.querySelector<HTMLButtonElement>('#game')!.onclick=()=>void select('game');
document.querySelector<HTMLButtonElement>('#cinematic')!.onclick=()=>void select('cinematic');
void select('game');
let atDistance=false;
document.querySelector<HTMLButtonElement>('#distance')!.onclick=e=>{
  atDistance=!atDistance;
  (e.currentTarget as HTMLButtonElement).setAttribute('aria-pressed',String(atDistance));
  camera.fov=atDistance?65:32; camera.updateProjectionMatrix();
  camera.position.set(.06,.025,atDistance?.7:.27);
};
const sweep = document.querySelector<HTMLButtonElement>('#sweep')!;
sweep.onclick = () => { sweeping = !sweeping; sweepTime = 0; sweep.setAttribute('aria-pressed', String(sweeping)); };
slider.oninput = () => { sweeping = false; sweep.setAttribute('aria-pressed','false'); };
document.querySelector<HTMLButtonElement>('#front')!.onclick = () => { camera.position.set(0, -.01, .27); controls.target.set(0,-.01,0); };
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(retro ? 360/Math.min(innerWidth,innerHeight) : Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth,innerHeight); renderer.domElement.style.imageRendering = retro ? 'pixelated' : 'auto';
}
document.querySelector<HTMLButtonElement>('#retro')!.onclick = e => { retro = !retro; (e.currentTarget as HTMLButtonElement).setAttribute('aria-pressed',String(retro)); resize(); };
addEventListener('resize',resize);
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(),.1); sweepTime += dt;
  if (sweeping) slider.value = String(Math.round((1-Math.cos(sweepTime*.7))*60));
  const target = Number(slider.value);
  current = THREE.MathUtils.damp(current,target,14,dt);
  output.value = `${target} км/ч`;
  if (needle) needle.quaternion.setFromAxisAngle(axis,THREE.MathUtils.degToRad(135-270*current/120));
  controls.update(); renderer.render(scene,camera);
  if(active && needle) {
    const info=renderer.info.render;
    const metric={variant:selected,triangles:active.userData.geometryTriangles,renderedTriangles:info.triangles,calls:info.calls,speed:current,needleAngle:needle.rotation[selected==='game'?'z':'y'],transparent:selected==='game'?0:1};
    status.textContent=`${selected==='game'?'Игровой вариант':'Для роликов'} · ${metric.triangles.toLocaleString('ru-RU')} треугольников · Отрисовок: ${info.calls}${atDistance?' · Условная дистанция 70 см':''}`;
    status.dataset.metrics=JSON.stringify(metric);
  }
});
