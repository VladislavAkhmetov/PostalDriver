import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { SIDE_WINDOW, sideWindowPane } from './CabinStructure';
import type { Hands } from './Hands';

const TAG = 'driver-window';
const WIND_TIME = 1.55;
const TURNS = Math.PI * 4;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Each press winds to the other position, then releases the handle. */
export class WindowWinder {
  readonly crank = new THREE.Group();
  readonly glass: THREE.Mesh;
  lean = 0;
  private readonly edge: THREE.LineSegments;
  private readonly glassRest: Float32Array;
  private readonly edgeRest: Float32Array;
  private readonly contact = new THREE.Vector3();
  private time = -1;
  private reaching = false;
  private opening = 0;
  private fromOpening = 0;
  private fromAngle = 0;
  private toOpening = 1;
  get openness(): number { return this.opening; }
  onWind?: (down: boolean) => void;

  constructor(parent: THREE.Group) {
    this.crank.name = 'driver-window-crank';
    this.crank.position.set(-.855, .397, -1.37);
    const end = new THREE.Vector3(.008, -.032, .12);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, end.length(), 6), new THREE.MeshLambertMaterial({ color: '#242a25' }));
    arm.position.copy(end).multiplyScalar(.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .035, 8), new THREE.MeshLambertMaterial({ color: '#181e19' }));
    knob.rotation.z = Math.PI / 2;
    knob.position.set(.024, end.y, end.z);
    this.crank.add(arm, knob);

    const geometry = new THREE.ShapeGeometry(sideWindowPane(false));
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-SIDE_WINDOW.x, 0, 0);
    this.glass = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: '#bdc9bb', transparent: true, opacity: .12, depthWrite: false,
      side: THREE.DoubleSide, forceSinglePass: true, fog: false,
    }));
    this.glass.name = 'driver-window-glass';
    this.glass.renderOrder = 4;
    this.edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#b8c9bf', transparent: true, opacity: .32, depthWrite: false }));
    this.edge.renderOrder = 5;
    this.glassRest = new Float32Array(geometry.attributes.position.array);
    this.edgeRest = new Float32Array(this.edge.geometry.attributes.position.array);
    parent.add(this.crank, this.glass, this.edge);
  }

  play(hands: Hands): boolean {
    if (this.reaching || this.time >= 0 || this.lean > .02 || hands.busy('L')) return false;
    this.reaching = true;
    this.fromOpening = this.opening;
    this.fromAngle = this.crank.rotation.x;
    // Finish an interrupted movement before switching direction on the next press.
    if (this.opening === 0) this.toOpening = 1;
    else if (this.opening === 1) this.toOpening = 0;
    hands.reach({
      hand: 'L', pose: 'knob', hold: 0, tag: TAG, follow: true,
      target: () => {
        this.crank.updateMatrix();
        return this.contact.set(.024, -.032, .12).applyMatrix4(this.crank.matrix);
      },
      palm: new THREE.Vector3(-1, 0, 0),
      onArrive: () => {
        this.reaching = false;
        this.time = 0;
        this.onWind?.(this.toOpening === 1);
      },
      until: () => this.time >= 0,
    });
    return true;
  }

  update(dt: number, hands: Hands): void {
    // Another left-hand action can take over without a disembodied crank continuing.
    if ((this.reaching || this.time >= 0) && hands.taskOf('L')?.tag !== TAG) {
      this.reaching = false;
      this.time = -1;
    }
    if (this.time >= 0) {
      this.time += dt;
      const progress = ease(this.time / WIND_TIME);
      this.opening = this.fromOpening + (this.toOpening - this.fromOpening) * progress;
      this.crank.rotation.x = this.fromAngle + TURNS * (this.opening - this.fromOpening);
      this.lowerGlass();
      if (this.time >= WIND_TIME) { this.opening = this.toOpening; this.time = -1; }
    }
    this.lean = damp(this.lean, this.reaching || this.time >= 0 ? 1 : 0, 12, dt);
    if (this.lean < .0001) this.lean = 0;
    hands.windowLean = this.lean;
  }

  private lowerGlass(): void {
    // Collapse the submerged triangles at the belt seal: no glass leaks through the door card.
    const bottom = SIDE_WINDOW.bottom + .017;
    for (const [geometry, rest] of [[this.glass.geometry, this.glassRest], [this.edge.geometry, this.edgeRest]] as const) {
      const positions = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) positions.setY(i, Math.max(bottom, rest[i * 3 + 1] - this.opening * .54));
      positions.needsUpdate = true;
    }
    this.glass.visible = this.edge.visible = this.opening < .999;
  }
}
