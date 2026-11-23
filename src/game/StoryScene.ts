import * as THREE from 'three';

export interface SceneChoice { text: string; next: string }
export interface SceneBeat {
  shot: string;
  pose?: string;
  speaker?: string;
  line?: string;
  seconds?: number;
  next?: string;
  choices?: SceneChoice[];
}
export interface StorySceneScript {
  id: string;
  first: string;
  beats: Record<string, SceneBeat>;
  enter(): void;
  update(dt: number, beat: SceneBeat, elapsed: number, speaking: boolean): void;
  leave(): void;
  complete(lastBeat: string): void;
  cancel(): void;
}
interface SceneUI {
  begin(): void;
  line(speaker: string, text: string): Promise<number> | number;
  choices(options: string[], pick: (index: number) => void): void;
  clear(): void;
  end(): void;
}

/** Branching dialogue clock. Only a completed graph commits story progress; cancellation restores
 * the borrowed camera and visibility without running the ending. No wall-clock scene timers. */
export class StoryScene {
  private script: StorySceneScript | null = null;
  private beatId = '';
  private elapsed = 0;
  private duration = 0;
  private awaitingChoice = false;
  private revision = 0;
  private hidden: [THREE.Object3D, boolean][] = [];
  private restoreCamera: (() => void) | null = null;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private ui: SceneUI) {}
  get active(): boolean { return this.script !== null; }
  get currentBeat(): string | null { return this.active ? this.beatId : null; }

  play(script: StorySceneScript, hide: THREE.Object3D[] = []): boolean {
    if (this.active) return false;
    for (const beat of Object.values(script.beats)) {
      for (const next of [beat.next, ...(beat.choices ?? []).map(c => c.next)]) {
        if (next && !script.beats[next]) throw new Error(`Unknown scene beat: ${script.id}/${next}`);
      }
    }
    if (!script.beats[script.first]) throw new Error(`Missing opening: ${script.id}`);
    const cam = this.camera, parent = cam.parent;
    const pos = cam.position.clone(), q = cam.quaternion.clone(), fov = cam.fov;
    this.restoreCamera = () => {
      if (parent) parent.add(cam); else cam.removeFromParent();
      cam.position.copy(pos); cam.quaternion.copy(q); cam.fov = fov; cam.updateProjectionMatrix();
    };
    this.hidden = hide.map(o => [o, o.visible]);
    for (const [o] of this.hidden) o.visible = false;
    this.scene.add(cam);
    this.script = script;
    this.ui.begin();
    script.enter();
    this.go(script.first);
    return true;
  }

  private go(id: string): void {
    const script = this.script!;
    this.beatId = id; this.elapsed = 0; this.awaitingChoice = false;
    const token = ++this.revision, beat = script.beats[id];
    this.duration = beat.seconds ?? (beat.line ? Math.max(2.5, 1.4 + beat.line.length * 0.055) : 1);
    this.ui.clear();
    if (beat.line) {
      void Promise.resolve(this.ui.line(beat.speaker ?? '', beat.line)).then(seconds => {
        if (this.revision === token && this.script === script && seconds > 0) {
          this.duration = Math.max(this.duration, this.elapsed + seconds + 0.4);
        }
      }).catch(() => { /* Unavailable recording: retain the reading time. */ });
    }
    script.update(0, beat, 0, !!beat.line);
  }

  update(dt: number): void {
    const script = this.script;
    if (!script) return;
    this.elapsed += dt;
    const beat = script.beats[this.beatId];
    script.update(dt, beat, this.elapsed, !!beat.line && this.elapsed < this.duration);
    if (this.elapsed < this.duration || this.awaitingChoice) return;
    if (beat.choices?.length) {
      this.awaitingChoice = true;
      const token = this.revision;
      this.ui.choices(beat.choices.map(c => c.text), index => {
        if (this.revision !== token || this.script !== script || !beat.choices?.[index]) return;
        this.go(beat.choices[index].next);
      });
    } else if (beat.next) this.go(beat.next);
    else this.finish(true);
  }

  cancel(): void { this.finish(false); }

  private finish(completed: boolean): void {
    const script = this.script;
    if (!script) return;
    const last = this.beatId;
    this.script = null; ++this.revision;
    script.leave();
    for (const [o, visible] of this.hidden) o.visible = visible;
    this.hidden = [];
    this.restoreCamera?.(); this.restoreCamera = null;
    this.ui.clear(); this.ui.end();
    if (completed) script.complete(last); else script.cancel();
  }
}
