import * as THREE from 'three';
import { Person } from '../world/People';
import type { Place } from '../world/Props';
import type { StorySceneScript } from './StoryScene';

/** A short reception-room scene, used only when a patient has been delivered.
 * Gulnara works inside; neither she nor a stand-in waits permanently by the road.
 * StoryScene owns camera/UI restoration. The delivery itself is already complete.
 */
export class HospitalReception {
  readonly root = new THREE.Group();
  readonly gulnara = new Person('gulnara', {});

  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, place: Place) {
    this.root.name = 'hospital-reception';
    this.root.position.set(place.x, place.y + .08, place.z);
    this.root.rotation.y = place.rot;
    this.root.visible = false;
    scene.add(this.root);
    const mat = (color: string) => new THREE.MeshLambertMaterial({ color });
    const plaster = mat('#ddd8c9'), green = mat('#88a69b'), wood = mat('#675748');
    const metal = mat('#a4afa9'), dark = mat('#414b4a'), linen = mat('#dbdacc');
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.name = name; m.position.set(x, y, z); this.root.add(m); return m;
    };
    box('floor', 5.8, .1, 5, 0, -.05, 0, mat('#8d9287'));
    box('ceiling', 5.8, .1, 5, 0, 3, 0, plaster);
    for (const x of [-2.9, 2.9]) {
      box('side-wall', .12, 3, 5, x, 1.5, 0, plaster);
      box('side-dado', .14, 1.35, 5, x, .675, 0, green);
    }
    for (const z of [-2.5, 2.5]) {
      box('end-wall', 5.8, 3, .12, 0, 1.5, z, plaster);
      box('end-dado', 5.8, 1.35, .14, 0, .675, z, green);
    }
    // Worn tiled floor, a bench for relatives, and the door to the ward.
    for (let x = -2.5; x <= 2.5; x += .5) box('tile-joint', .012, .003, 5, x, .004, 0, metal);
    for (let z = -2; z <= 2; z += .5) box('tile-joint', 5.8, .003, .012, 0, .004, z, metal);
    box('ward-door-frame', 1.35, 2.35, .12, 1.75, 1.175, -2.4, dark);
    box('ward-door', 1.18, 2.22, .14, 1.75, 1.11, -2.32, mat('#bdcbbd'));
    box('door-window', .65, .6, .02, 1.75, 1.68, -2.24, mat('#9eaeb0'));
    box('door-handle', .05, .16, .07, 1.3, 1, -2.2, metal);
    box('waiting-bench', .48, .1, 1.8, -2.35, .48, .45, wood);
    box('bench-back', .08, .4, 1.8, -2.58, .77, .45, wood);
    for (const z of [-.2, 1.1]) box('bench-leg', .38, .43, .06, -2.35, .215, z, dark);
    box('desk', 1.15, .08, .65, -1.65, .8, -1.4, wood);
    for (const x of [-2.12, -1.18]) for (const z of [-1.65, -1.15]) box('desk-leg', .06, .76, .06, x, .38, z, dark);
    box('register', .36, .035, .26, -1.65, .86, -1.35, mat('#455f66'));
    box('paper', .28, .01, .2, -1.63, .884, -1.35, linen);
    box('medical-cabinet', .68, 1.65, .42, -2.38, .92, -2.15, linen);
    box('cabinet-glass', .55, .72, .025, -2.38, 1.25, -1.925, mat('#7e9691'));
    for (const x of [-2.55, -2.3]) box('medicine-bottle', .08, .2, .04, x, 1.08, -1.9, mat('#b2a78b'));
    // A parked examination trolley, not a patient standing outdoors.
    box('trolley-frame', .75, .08, 1.85, 2.15, .68, .2, metal);
    box('trolley-mattress', .7, .12, 1.8, 2.15, .78, .2, linen);
    box('pillow', .58, .12, .35, 2.15, .9, -.38, linen);
    for (const x of [1.86, 2.44]) for (const z of [-.5, .9]) {
      box('trolley-leg', .04, .55, .04, x, .36, z, metal);
      box('trolley-wheel', .09, .14, .14, x, .09, z, dark);
    }
    box('ceiling-lamp', 1.1, .08, .25, 0, 2.9, 0, new THREE.MeshBasicMaterial({ color: '#fff8db' }));
    const light = new THREE.PointLight('#fff3da', 7, 8, 2); light.position.set(0, 2.65, .5); this.root.add(light);
    this.gulnara.group.position.set(-.1, 0, -.7);
    this.gulnara.group.rotation.y = .18;
    this.root.add(this.gulnara.group);
  }

  script(speaker: string, line: string): StorySceneScript {
    const frame = () => {
      this.root.updateMatrixWorld(true);
      this.camera.position.copy(this.root.localToWorld(new THREE.Vector3(.75, 1.58, 2.05)));
      this.camera.lookAt(this.root.localToWorld(new THREE.Vector3(-.1, 1.23, -.7)));
      this.camera.fov = 53; this.camera.updateProjectionMatrix();
    };
    const leave = () => { this.root.visible = false; };
    return {
      id: 'hospital-reception', first: 'receive',
      beats: {
        receive: { shot: 'gulnara', speaker, line, choices: [{ text: 'Вернуться к машине', next: 'exit' }] },
        exit: { shot: 'gulnara', seconds: .15 },
      },
      enter: () => {
        this.root.visible = true;
        this.gulnara.human.play('Idle', { fade: 0 });
        frame();
      },
      update: (dt, _beat, elapsed, speaking) => {
        if (speaking) this.gulnara.talk(.2);
        this.gulnara.update(dt, elapsed); frame();
      },
      leave, complete: () => {}, cancel: () => {},
    };
  }
}
