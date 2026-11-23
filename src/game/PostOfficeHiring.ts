import * as THREE from 'three';
import { Human } from '../world/People';
import type { World } from '../world/World';
import type { SceneBeat, StorySceneScript } from './StoryScene';
import { HIRING_BEATS, HIRING_SHOTS, type HiringShot } from './PostOfficeHiringScript';

const ease = (a: number, b: number, t: number) => {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x);
};

/** Interior staging shared by the game and the shot-review preview. StoryScene owns playback,
 * voice duration, choices, cancellation and camera restoration. This class never commits progress. */
export class PostOfficeHiring {
  readonly root = new THREE.Group();
  readonly timur = new Human('hero');
  readonly grandpa = new Human('kartatay');
  readonly zinaida = new Human('zinaida');
  private readonly notebook = new THREE.Group();
  private readonly pen: THREE.Mesh;
  private readonly sheet: THREE.Object3D;
  private readonly sheetPosition: THREE.Vector3;
  private readonly sheetRotation: THREE.Euler;
  private lastBeat: SceneBeat | null = null;
  private shot = '';
  private shotTime = 0;
  private signed = false;
  private givenNotebook = false;
  private entered = false;
  /** Whether the street figure was already off-stage; the scene must not put her back. */
  private masterAway = true;

  constructor(private world: World, private camera: THREE.PerspectiveCamera, private sound: (kind: 'paper' | 'door') => void = () => {}) {
    this.root.name = 'post-office-hiring-cast'; this.root.visible = false;
    world.postInterior.root.add(this.root);
    this.root.add(this.timur.group, this.grandpa.group, this.zinaida.group, this.notebook);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(.14, .018, .2), new THREE.MeshLambertMaterial({ color: '#504333' }));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(.13, .012, .19), new THREE.MeshLambertMaterial({ color: '#cec4a7' }));
    pages.position.y = .003;
    const band = new THREE.Mesh(new THREE.BoxGeometry(.016, .024, .205), new THREE.MeshLambertMaterial({ color: '#242923' }));
    band.position.x = .035; this.notebook.add(cover, pages, band);
    this.pen = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .14, 6), new THREE.MeshLambertMaterial({ color: '#242827' }));
    this.root.add(this.pen);
    this.sheet = world.postInterior.root.getObjectByName('post-office-route-sheet')!;
    this.sheetPosition = this.sheet.position.clone(); this.sheetRotation = this.sheet.rotation.clone();
  }

  script(complete: () => void, cancel: () => void = () => {}): StorySceneScript {
    return {
      id: 'post-office-hiring', first: 'establish', beats: HIRING_BEATS,
      enter: () => this.enter(), update: (dt, beat, elapsed, speaking) => this.update(dt, beat, elapsed, speaking),
      leave: () => this.leave(), complete, cancel,
    };
  }

  /** A deterministic single-shot rehearsal, including the state of the objects at this beat. */
  inspect(id: string): void {
    if (!HIRING_BEATS[id]) return;
    this.enter();
    const ids = Object.keys(HIRING_BEATS), i = ids.indexOf(id);
    this.signed = i >= ids.indexOf('sign');
    this.givenNotebook = i > ids.indexOf('notebook');
    this.update(0, HIRING_BEATS[id], id === 'sign' ? 2 : id === 'take' ? 1.5 : id === 'notebook' ? 3 : 1, !!HIRING_BEATS[id].line);
  }

  enter(): void {
    if (!this.entered) {
      this.masterAway = this.world.isAway(this.world.postmaster);
      this.world.setAway(this.world.postmaster, true);
    }
    this.entered = true; this.root.visible = true;
    this.lastBeat = null; this.shot = ''; this.shotTime = 0;
    this.signed = this.givenNotebook = false;
    const marks = this.world.postInterior.anchors;
    for (const [h, mark, yaw] of [[this.timur, marks.hero, -.16], [this.grandpa, marks.grandpa, 0], [this.zinaida, marks.zinaida, Math.PI]] as const) {
      h.group.position.copy(mark); h.group.rotation.y = yaw; h.model.position.set(0, 0, 0);
      h.play('Idle', { fade: 0 }); h.tick(0);
    }
    this.zinaida.seat(.53); this.zinaida.tick(0);
    this.grandpa.seat(.53); this.grandpa.tick(0);
    this.sheet.position.copy(this.sheetPosition); this.sheet.rotation.copy(this.sheetRotation);
    this.sound('door');
  }

  leave(): void {
    if (!this.entered) return;
    this.entered = false; this.root.visible = false;
    this.sheet.position.copy(this.sheetPosition); this.sheet.rotation.copy(this.sheetRotation);
    this.world.setAway(this.world.postmaster, this.masterAway);
  }

  private reach(h: Human, side: 'L' | 'R', position: THREE.Vector3, weight = 1): void {
    const point = this.root.localToWorld(position.clone());
    h.reach(side, h.group.worldToLocal(point), new THREE.Vector3(side === 'R' ? -1 : 1, -.4, .6), weight);
  }

  private look(h: Human, target: THREE.Vector3, nod = 0): void {
    const point = this.root.localToWorld(target.clone()); h.group.worldToLocal(point);
    h.look(THREE.MathUtils.clamp(Math.atan2(point.x, point.z), -.55, .55), nod);
  }

  update(dt: number, beat: SceneBeat, elapsed: number, speaking: boolean): void {
    if (this.lastBeat !== beat) {
      this.lastBeat = beat;
      const order = Object.values(HIRING_BEATS), i = order.indexOf(beat);
      this.signed = i >= order.indexOf(HIRING_BEATS.sign);
      this.givenNotebook = i >= order.indexOf(HIRING_BEATS.notebook);
      if (beat.pose === 'take') this.sound('paper');
    }
    if (this.shot !== beat.shot) { this.shot = beat.shot; this.shotTime = 0; }
    this.shotTime += dt;
    // Timur stays in the authored Idle throughout, with no procedural bone overrides.
    // The first zero-time inspection still needs a mixer sample after restoring driven bones.
    for (const h of [this.timur, this.grandpa, this.zinaida]) h.tick(Math.max(dt, 1 / 120));
    this.root.updateMatrixWorld(true);
    const marks = this.world.postInterior.anchors;
    this.look(this.grandpa, beat.speaker === 'Тимур' || beat.pose === 'proud' ? marks.hero : marks.zinaida,
      beat.pose === 'proud' ? .07 * Math.sin(Math.min(elapsed / 1.6, 1) * Math.PI) : 0);
    this.look(this.zinaida, beat.speaker === 'Картатай' ? marks.grandpa : marks.hero,
      speaking && beat.speaker === 'Зинаида Павловна' ? Math.sin(elapsed * 2.1) * .012 : 0);

    const offer = beat.pose === 'offer' ? ease(.4, 1.7, elapsed) : this.signed ? 1 : 0;
    this.sheet.position.copy(this.sheetPosition).add(new THREE.Vector3(0, 0, -.25 * offer));
    this.sheet.rotation.copy(this.sheetRotation);
    // Initially readable from Zinaida's chair; she turns it towards Timur while offering it.
    this.sheet.rotation.z += Math.PI * offer;
    // Zinaida's hands rest on the desk; the right follows the sheet as it is slid forward.
    const zHand = new THREE.Vector3(-1.15 - .27 * offer, .83, .82 - .25 * offer);
    this.reach(this.zinaida, 'R', zHand, .85);
    this.reach(this.zinaida, 'L', new THREE.Vector3(-1.74, .83, .83), .8);
    // Keep the paperwork on the desk instead of floating beside idle hands.
    this.pen.visible = true;
    this.pen.position.set(-1.18, .796, .35);
    this.pen.rotation.set(Math.PI / 2, 0, .2);
    this.notebook.visible = true;
    if (this.givenNotebook) {
      const t = beat.pose === 'notebook' ? ease(.6, 3, elapsed) : 1;
      this.notebook.position.set(-1.85, .66, -.32).lerp(new THREE.Vector3(-1.85, .803, .3), t);
      this.notebook.rotation.set(.15 * (1 - t), .1, 0);
      this.reach(this.grandpa, 'L', this.notebook.position.clone().add(new THREE.Vector3(-.06, 0, 0)), 1 - ease(.55, 1, t));
    } else {
      // The notebook rests on his lap. Let the seated clip keep both arms relaxed;
      // reaching is reserved for the actual handover beat above.
      this.notebook.position.set(-1.85, .66, -.32); this.notebook.rotation.set(.15, .1, 0);
    }
    this.frame(beat.shot as HiringShot);
  }

  private frame(shot: HiringShot): void {
    const s = HIRING_SHOTS[shot], room = this.world.postInterior, cam = this.camera;
    const eye = new THREE.Vector3(...s.eye), aim = new THREE.Vector3(...s.target);
    // Narrow screens widen the lens instead of backing the camera through the wall.
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(s.fov / 2)) * Math.max(1, 1.45 / cam.aspect)));
    if (shot === 'master') eye.lerp(aim, Math.min(this.shotTime, 7) * .003);
    cam.position.copy(room.worldPoint(eye)); cam.lookAt(room.worldPoint(aim));
    cam.fov = Math.min(88, fov); cam.updateProjectionMatrix();
  }
}
