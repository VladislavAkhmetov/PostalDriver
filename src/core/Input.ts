import { clamp, damp } from './math';

export type Action =
  | 'start' | 'handbrake' | '4wd' | 'low' | 'gearUp' | 'gearDown' | 'gearMode' | 'lights' | 'wipers' | 'vent' | 'timeOfDay' | 'smoke' | 'stub'
  | 'map' | 'tape' | 'tapeNext' | 'volUp' | 'volDown' | 'weather' | 'mute' | 'pause' | 'reset' | 'lookBack' | 'help';

/**
 * Keys grouped by job, all within reach of the left hand on WASD:
 * Q/E gears and G box mode, Z/X the two transfer-case levers, F lights, R wipers (rain),
 * Enter ignition, Space handbrake, H horn. Reset sits on Backspace, away from the gears.
 * Old bindings (I, 4, L, P) still work as quiet aliases.
 */
const KEYMAP: Record<string, Action> = {
  Enter: 'start', NumpadEnter: 'start', KeyI: 'start',
  Space: 'handbrake',
  KeyQ: 'gearDown', KeyE: 'gearUp', KeyG: 'gearMode',
  KeyZ: '4wd', Digit4: '4wd', KeyX: 'low', KeyL: 'low',
  KeyF: 'lights', KeyR: 'wipers', KeyP: 'wipers', KeyB: 'vent', KeyT: 'timeOfDay', KeyJ: 'smoke', KeyY: 'stub',
  KeyM: 'map', Tab: 'map', KeyC: 'tape', KeyN: 'tapeNext', Equal: 'volUp', NumpadAdd: 'volUp', Minus: 'volDown', NumpadSubtract: 'volDown', KeyK: 'weather', KeyU: 'mute',
  Escape: 'pause', Backspace: 'reset', F1: 'help', Slash: 'help',
};

/**
 * Unifies keyboard, mouse look and touch into analog controls with the
 * forgiving smoothing a heavy van needs.
 */
export class Input {
  steer = 0;
  gas = 0;
  brake = 0;
  horn = false;
  lookYaw = 0;
  lookPitch = 0;
  lookBack = false;
  touchActive = false;
  enabled = false;
  private keys = new Set<string>();
  private touchSteer: number | null = null;
  private touchGas = 0;
  private touchBrake = 0;
  private touchHorn = false;
  private dragging = false;
  private dragMoved = 0;
  private last = { x: 0, y: 0 };
  private lookReturn = 0;
  pointer = { x: 0, y: 0, inside: false };
  /** Look sensitivity multiplier from settings. */
  lookScale = 1;
  /** Tilt steering (phone held like a wheel), opt-in from settings. */
  tilt = false;
  private tiltV: number | null = null;
  onAction?: (a: Action) => void;
  onClick?: (x: number, y: number) => void;
  onAnyKey?: () => void;

  constructor(private surface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.onAnyKey?.();
      if (!this.enabled && e.code !== 'Escape') return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'Backspace' || e.code === 'Enter' || e.code.startsWith('Arrow') || e.code === 'F1') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyH') this.hornTaps++;
      const a = KEYMAP[e.code];
      if (a) this.onAction?.(a);
      if (e.code === 'KeyV') this.lookBack = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyV') this.lookBack = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.touchGas = this.touchBrake = 0; this.touchSteer = null; this.touchHorn = false; });

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.dragging = true; this.dragMoved = 0;
      this.last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.pointer = { x: e.clientX, y: e.clientY, inside: true };
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.last = { x: e.clientX, y: e.clientY };
      this.look(dx, dy);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse' || !this.dragging) return;
      this.dragging = false;
      if (this.dragMoved < 5 && e.target === surface) this.onClick?.(e.clientX, e.clientY);
    });
    surface.addEventListener('mouseleave', () => (this.pointer.inside = false));
  }

  /** Free-look in radians from pixel deltas (mouse drag or touch look zone). */
  look(dx: number, dy: number, gain = 0.0042): void {
    gain *= this.lookScale;
    this.lookYaw = clamp(this.lookYaw - dx * gain, -1.9, 1.9);
    this.lookPitch = clamp(this.lookPitch - dy * gain, -0.55, 0.45);
    this.lookReturn = 1.4;
  }

  setTouchSteer(v: number | null): void { this.touchSteer = v; this.touchActive = true; }
  setTouchPedal(which: 'gas' | 'brake', v: number): void { if (which === 'gas') this.touchGas = v; else this.touchBrake = v; this.touchActive = true; }
  setTouchHorn(on: boolean): void { this.touchHorn = on; }

  /** Turns tilt steering on (asks for motion permission on iOS); resolves false if unavailable. */
  async setTilt(on: boolean): Promise<boolean> {
    window.removeEventListener('devicemotion', this.onMotion);
    this.tiltV = null;
    this.tilt = false;
    if (!on) return true;
    if (!('DeviceMotionEvent' in window)) return false;
    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DM.requestPermission === 'function') {
      try { if ((await DM.requestPermission()) !== 'granted') return false; } catch { return false; }
    }
    window.addEventListener('devicemotion', this.onMotion);
    this.tilt = true;
    return true;
  }

  private onMotion = (e: DeviceMotionEvent): void => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    const ang = ((((screen.orientation?.angle ?? 0) % 360) + 360) % 360);
    // gravity in screen axes; the overall sign differs between platforms, so normalise on "up"
    const [gR, gU] = ang === 90 ? [-g.y, g.x] : ang === 270 ? [g.y, -g.x] : ang === 180 ? [-g.x, -g.y] : [g.x, g.y];
    const sgn = gU < 0 ? -1 : 1;
    const roll = Math.atan2(gR * sgn, gU * sgn);
    const v = clamp(-roll / 0.45, -1, 1);
    this.tiltV = Math.abs(v) < 0.04 ? 0 : v;
    this.touchActive = true;
  };

  private down(...codes: string[]): boolean { return codes.some((c) => this.keys.has(c)); }
  /**
   * Horn presses not yet seen by a frame: a quick tap on a slow machine can begin and end between two
   * frames, and the delivery ritual counts two honks — each tap is a frame of horn, with a frame of
   * silence between taps so that two quick ones are still two.
   */
  private hornTaps = 0;

  update(dt: number, speed: number): void {
    const k = this.enabled;
    const left = k && this.down('KeyA', 'ArrowLeft'), right = k && this.down('KeyD', 'ArrowRight');
    const gasK = k && this.down('KeyW', 'ArrowUp'), brakeK = k && this.down('KeyS', 'ArrowDown');
    const held = (k && this.down('KeyH')) || this.touchHorn;
    if (!k) this.hornTaps = 0;
    if (this.hornTaps > 0 && !this.horn) { this.horn = true; this.hornTaps--; }
    else if (this.hornTaps > 0) this.horn = false;
    else this.horn = held;
    if (this.touchSteer !== null) {
      this.steer = damp(this.steer, this.touchSteer, 7, dt);
    } else if (this.tilt && this.tiltV !== null && !left && !right) {
      this.steer = damp(this.steer, this.tiltV, 5, dt);
    } else {
      // keyboard steering: a heavy unassisted wheel turned by an unhurried driver, slower still at speed
      const rate = 1.05 / (1 + speed * 0.09);
      const target = (right ? 1 : 0) - (left ? 1 : 0);
      if (target !== 0) this.steer = clamp(this.steer + target * rate * dt * (Math.sign(target) !== Math.sign(this.steer) ? 1.6 : 1), -1, 1);
      else this.steer = damp(this.steer, 0, 1.9 + speed * 0.1, dt);
    }
    this.gas = damp(this.gas, Math.max(gasK ? 1 : 0, this.touchGas), gasK || this.touchGas ? 4 : 10, dt);
    this.brake = damp(this.brake, Math.max(brakeK ? 1 : 0, this.touchBrake), 9, dt);
    // eyes drift back to the road after free-look
    if (!this.dragging) {
      this.lookReturn -= dt;
      if (this.lookReturn < 0 && !this.touchLooking) {
        this.lookYaw = damp(this.lookYaw, 0, 1.6, dt);
        this.lookPitch = damp(this.lookPitch, 0, 1.6, dt);
      }
    }
  }
  touchLooking = false;
}
