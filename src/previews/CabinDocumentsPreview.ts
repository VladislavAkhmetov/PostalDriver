import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RetroRenderer } from '../core/Renderer';
import { createTextures } from '../core/textures';
import { Cabin } from '../vehicle/Cabin';
import { loadDashboardAssets } from '../vehicle/Dashboard';
import { loadPeople } from '../world/People';
import { addCabinDocuments } from '../vehicle/CabinDocuments';
import { Bucket } from '../core/geom';

async function start() {
  await Promise.all([loadPeople(),loadDashboardAssets()]);
  const cabin=new Cabin(createTextures()),scene=new THREE.Scene();scene.background=new THREE.Color('#788477');
  scene.add(cabin.group,new THREE.HemisphereLight('#e4e8dc','#555744',1.8));
  const sun=new THREE.DirectionalLight('#fff5dc',1.2);sun.position.set(-3,5,-2);scene.add(sun);
  const renderer=new RetroRenderer(document.getElementById('app')!);
  const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.02,20);
  const controls=new OrbitControls(camera,renderer.renderer.domElement);controls.target.set(.04,.60,-1.015);
  controls.minDistance=.22;controls.maxDistance=1.2;controls.enablePan=false;
  const cabinView=()=>{camera.position.set(-.42,1.06,-.78);controls.target.set(.04,.60,-1.015);controls.update();};
  const closeView=()=>{camera.position.set(-.12,.99,-.70);controls.target.set(.07,.607,-.985);controls.update();};
  cabinView();
  const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.resize(innerWidth,innerHeight);};resize();window.addEventListener('resize',resize);
  document.getElementById('cabin')!.onclick=cabinView;document.getElementById('close')!.onclick=closeView;
  document.getElementById('retro')!.onclick=()=>{renderer.pixelMode=!renderer.pixelMode;document.getElementById('retro')!.textContent=`Ретро: ${renderer.pixelMode?'вкл.':'выкл.'}`;resize();};
  const atlas=(cabin.group.getObjectByName('cabin:documents') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  const b=new Bucket();addCabinDocuments(b);const papers=b.build({documents:atlas,flat:new THREE.MeshLambertMaterial()});
  let triangles=0;papers.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
  const stats={triangles,materials:papers.children.length,atlas:[512,512]};
  document.getElementById('status')!.textContent=`Путевой лист, почтовая накладная и служебный конверт · ${triangles} треугольников`;
  Object.assign(window,{__cabinDocuments:{cabin,camera,renderer,atlas,stats,closeView,cabinView}});
  renderer.renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
}
start().catch(error=>{document.getElementById('status')!.textContent=String(error);throw error;});
