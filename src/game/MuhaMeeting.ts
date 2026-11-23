import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { Human } from '../world/People';
import { Muha } from '../world/Muha';
import { buildUaz } from '../world/Uaz';
import type { World } from '../world/World';
import type { VanPose } from './Cutscene';
import type { SceneBeat, StorySceneScript } from './StoryScene';

const MUHA = 'Женька Муха', TIMUR = 'Тимур';
const UP = new THREE.Vector3(0, 1, 0);

/** Authored blocking for the first meeting. StoryScene owns dialogue/branching and camera return;
 * this set owns only actors, props, gestures and the three sides of the conversation. */
export class MuhaMeeting {
  readonly root = new THREE.Group();
  readonly timur = new Human('timur');
  readonly muha = new Muha('L');
  private readonly vanFrame = new THREE.Group();
  private readonly center = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly cameraAt = new THREE.Vector3();
  private readonly cameraAim = new THREE.Vector3();
  private lastBeat: SceneBeat | null = null;
  private total = 0;
  private pose = '';
  private shot = '';
  private shotT = 0;
  private shotAspect = 0;
  private van!: VanPose;

  constructor(scene: THREE.Scene, private world: World, private camera: THREE.PerspectiveCamera, private slam: () => void) {
    const van = buildUaz('post');
    van.group.rotation.y = Math.PI;
    van.group.position.set(0, -0.75, 0.25);
    if (van.lights) van.lights.visible = false;
    this.vanFrame.rotation.order = 'YXZ';
    this.vanFrame.add(van.group);
    this.muha.staged = true;
    this.root.add(this.vanFrame, this.timur.group, this.muha.group);
    this.root.visible = false;
    scene.add(this.root);
  }

  script(van: VanPose, complete: (bond: number) => void, cancel: () => void): StorySceneScript {
    return {
      id: 'muha-meeting', first: 'arrival',
      beats: {
        arrival: { shot: 'wide', pose: 'arrive', seconds: 1.8, next: 'greeting' },
        greeting: { shot: 'two', pose: 'handshake', speaker: MUHA,
          line: 'Тимурка?! Живой! Дембель! А чего на почтовом вездеходе — картатай пристроил?', seconds: 6.3,
          choices: [{ text: 'Здорово, Жень! Сам-то как?', next: 'friendly' }, { text: 'Работаю. Некогда, Жень', next: 'busy' }] },
        friendly: { shot: 'timur', speaker: TIMUR, line: 'Здорово, Жень! Сам-то как?', next: 'brag' },
        busy: { shot: 'timur', speaker: TIMUR, line: 'Работаю. Некогда, Жень.', next: 'busyReply' },
        brag: { shot: 'car', speaker: MUHA,
          line: 'Я? Кручусь. При деле теперь — у одного серьёзного человека в райцентре. Видал тачку? Своя.',
          choices: [{ text: 'Откуда деньги-то, Жень?', next: 'money' }, { text: 'Красивая. Поздравляю', next: 'congrats' }] },
        money: { shot: 'timur', speaker: TIMUR, line: 'Откуда деньги-то, Жень?', next: 'secret' },
        congrats: { shot: 'timur', speaker: TIMUR, line: 'Красивая. Поздравляю.', next: 'pleased' },
        secret: { shot: 'muha', speaker: MUHA,
          line: 'Много будешь знать — скоро состаришься. Ладно, свои люди. Заезжай как-нибудь — дело есть, лёгкое. Почта ж везде ездит.', next: 'goodbye' },
        pleased: { shot: 'muha', speaker: MUHA,
          line: 'То-то! Слушай, заезжай как-нибудь — дело есть, лёгкое. Почта ж везде ездит. Бывай, дембель!', next: 'goodbye' },
        busyReply: { shot: 'muha', speaker: MUHA,
          line: 'Ну работай, работай, почтальон. Заезжай как-нибудь — дело есть. Лёгкое. Почта ж везде ездит.', next: 'goodbyeBusy' },
        goodbye: { shot: 'wide', pose: 'bye', seconds: 2, next: 'end' },
        goodbyeBusy: { shot: 'wide', pose: 'bye', seconds: 2, next: 'endBusy' },
        end: { shot: 'wide', pose: 'bye', seconds: 0.2 },
        endBusy: { shot: 'wide', pose: 'bye', seconds: 0.2 },
      },
      enter: () => this.enter(van),
      update: (dt, beat, elapsed, speaking) => this.update(dt, beat, elapsed, speaking),
      leave: () => { this.root.visible = false; },
      complete: last => complete(last === 'endBusy' ? 0 : 1), cancel,
    };
  }

  private enter(van: VanPose): void {
    this.van = van;
    this.vanFrame.position.set(van.x, van.y, van.z);
    this.vanFrame.rotation.set(van.pitch ?? 0, van.yaw, -(van.roll ?? 0));
    const forward = new THREE.Vector3(-Math.sin(van.yaw), 0, -Math.cos(van.yaw));
    const left = new THREE.Vector3(-Math.cos(van.yaw), 0, Math.sin(van.yaw));
    this.axis.copy(forward);
    this.side.copy(left);
    // Beside the driver's door; move the pair together when a fence or the sedan occupies the spot.
    const origin = new THREE.Vector3(van.x, 0, van.z);
    let found = false;
    for (const lateral of [2.5, 3.5, 4.5]) {
      for (const along of [0.3, 2.6, -2.8]) {
        const c = origin.clone().addScaledVector(left, lateral).addScaledVector(forward, along);
        const a = c.clone().addScaledVector(forward, -0.57), b = c.clone().addScaledVector(forward, 0.57);
        if (this.free(a, 0.4) && this.free(b, 0.4)) { this.center.copy(c); found = true; break; }
      }
      if (found) break;
    }
    if (!found) {
      // Tight parking: meet at Muha's already walkable standing point, rather than inside a wall.
      this.center.copy(this.world.muha!.group.position).addScaledVector(forward, -0.57);
    }
    const ground = this.world.ground;
    for (const [h, offset] of [[this.timur, -0.57], [this.muha.human, 0.57]] as const) {
      h.group.position.copy(this.center).addScaledVector(this.axis, offset);
      h.group.position.y = ground.height(h.group.position.x, h.group.position.z);
      h.group.rotation.y = Math.atan2(this.axis.x, this.axis.z) + (offset > 0 ? Math.PI : 0);
      h.model.position.set(0, 0, 0);
      h.play('Idle', { fade: 0 }); h.tick(0);
    }
    this.center.y = (this.timur.group.position.y + this.muha.group.position.y) / 2;
    this.total = 0; this.lastBeat = null; this.pose = ''; this.shot = ''; this.shotT = 0;
    this.muha.resetStage();
    this.root.visible = true;
    this.slam();
  }

  private free(p: THREE.Vector3, radius: number): boolean {
    return !this.world.colliders.query(p.x, p.z, radius + 1).some(c => {
      if (!c.box) return Math.hypot(p.x - c.x, p.z - c.z) < c.r + radius;
      const x = p.x - c.x, z = p.z - c.z, co = Math.cos(c.rot), si = Math.sin(c.rot);
      return Math.abs(x * co - z * si) < c.hw + radius && Math.abs(x * si + z * co) < c.hd + radius;
    });
  }

  private update(dt: number, beat: SceneBeat, elapsed: number, speaking: boolean): void {
    this.total += dt; this.shotT += dt;
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      if (beat.speaker === TIMUR) this.muha.draw();
      this.chooseShot(beat.shot);
    }
    if (this.shotAspect !== this.camera.aspect) this.chooseShot(beat.shot);
    const shaking = beat.pose === 'handshake' && elapsed < 3.8;
    const walking = beat.pose === 'arrive' && elapsed < 1.4;
    const pose = walking ? 'walk' : shaking ? 'handshake' : speaking ? beat.speaker === TIMUR ? 'timur' : 'muha' : 'idle';
    if (pose !== this.pose) {
      this.pose = pose;
      this.timur.play(shaking ? 'Handshake' : pose === 'timur' ? 'Talking' : 'Idle', { fade: 0.3, once: shaking });
      this.muha.act(walking ? 'Walk' : shaking ? 'Handshake' : pose === 'muha' ? 'Talking2' : 'Idle', 3600);
    }
    if (beat.pose === 'arrive') {
      this.muha.group.position.copy(this.center).addScaledVector(this.axis, 0.57 + (1 - smoothstep(0, 1.4, elapsed)) * 0.6);
      this.muha.group.position.y = this.world.ground.height(this.muha.group.position.x, this.muha.group.position.z);
    }
    this.timur.tick(dt);
    this.muha.van.copy(this.timur.group.position).addScaledVector(UP, 1.6);
    this.muha.update(dt, this.total);
    this.timur.look(0, beat.pose === 'bye' ? Math.sin(Math.min(elapsed, 1) * Math.PI) * 0.12 : 0.02);
    if (shaking) {
      const grip = smoothstep(0.35, 0.9, elapsed) * (1 - smoothstep(2.9, 3.7, elapsed));
      const contact = this.center.clone().addScaledVector(UP, 1.04 + Math.sin(elapsed * 7) * 0.025);
      for (const [h, sign] of [[this.timur, -1], [this.muha.human, 1]] as const) {
        const wrist = contact.clone().addScaledVector(this.axis, sign * 0.085).addScaledVector(this.side, sign * 0.018);
        h.reach('R', h.group.worldToLocal(wrist), new THREE.Vector3(-1, -0.6, 0.4), grip);
        h.orientPalm('R', new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), grip);
      }
    }
    if (beat.shot === 'car' && speaking) {
      const show = smoothstep(3.5, 4.2, elapsed) * (1 - smoothstep(5.5, 6.3, elapsed));
      const h = this.muha.human;
      const toCar = h.group.worldToLocal(this.world.muhaCar.group.position.clone()).setY(0).normalize();
      const hand = toCar.multiplyScalar(0.5).add(new THREE.Vector3(0, 1.05, 0));
      h.reach('R', hand, new THREE.Vector3(-1, -0.7, 0), show);
    }
    // A listener takes a drag during a long choice too, never over the handshake or his own speech.
    if (!speaking && !shaking && elapsed > 8 && Math.floor(elapsed / 9) > Math.floor((elapsed - dt) / 9)) this.muha.draw();
    this.frame();
  }

  private chooseShot(shot: string): void {
    this.shot = shot; this.shotT = 0;
    this.shotAspect = this.camera.aspect;
    const portrait = Math.max(1, 1.45 / this.camera.aspect);
    let distance = (shot === 'wide' || shot === 'car' ? 5.6 : shot === 'two' ? 3.6 : 2.5) * portrait;
    const along = shot === 'muha' ? -1.65 : shot === 'timur' ? 1.65 : 0.5;
    const aim = this.center.clone().addScaledVector(UP, shot === 'wide' ? 1.05 : 1.3);
    if (shot === 'muha') aim.addScaledVector(this.axis, 0.4);
    if (shot === 'timur') aim.addScaledVector(this.axis, -0.4);
    if (shot === 'car') {
      const car = this.world.muhaCar.group.position.clone(); car.y = aim.y;
      if (car.distanceTo(aim) < 14) { aim.lerp(car, 0.22); distance += 1.3; }
    }
    this.cameraAim.copy(aim);
    // Keep the camera on one side of the dialogue axis, trying nearby eye-level angles first.
    let clear = false;
    for (const d of [distance, distance * 0.75, distance * 1.2]) {
      for (const offset of [along, along * 0.5, 0, -along * 0.5]) {
        this.cameraAt.copy(this.center).addScaledVector(this.side, d).addScaledVector(this.axis, offset);
        this.cameraAt.y = this.center.y + 1.65;
        const delta = aim.clone().sub(this.cameraAt);
        clear = true;
        for (let k = 0; k < 0.78; k += 0.1) {
          if (!this.free(this.cameraAt.clone().addScaledVector(delta, k), 0.2)) { clear = false; break; }
        }
        if (clear) break;
      }
      if (clear) break;
    }
    if (!clear) this.cameraAt.y += 1.7;
    this.cameraAt.y = Math.max(this.cameraAt.y, this.world.ground.height(this.cameraAt.x, this.cameraAt.z) + 0.8);
  }

  private frame(): void {
    const cam = this.camera;
    cam.position.copy(this.cameraAt).lerp(this.cameraAim, Math.min(this.shotT, 8) * 0.006);
    cam.lookAt(this.cameraAim);
    cam.fov = this.shot === 'wide' || this.shot === 'car' ? 49 : 43;
    cam.updateProjectionMatrix();
  }
}
