import theme from '../assets/music/pochta-main.mp3?url';

/**
 * The game's own music, outside the van: clean, full-range, not through the dashboard speaker —
 * the title theme («Почта», looped under the title and the opening page). Songs heard in the van
 * play on its radio instead (stations.ts, Tape.cue). One piece at a time; a new one, or none, fades
 * the old one out.
 */
export const MUSIC = {
  theme: { url: theme, loop: true, volume: 0.55 },
} as const;
export type Piece = keyof typeof MUSIC;

export class Score {
  private el = new Audio();
  private gain: GainNode;
  private want: Piece | null = null;
  private held = false;
  /** The piece has played to its end (not when faded out). */
  onEnd: ((p: Piece) => void) | null = null;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.el.preload = 'auto';
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    ctx.createMediaElementSource(this.el).connect(this.gain).connect(out);
    this.el.addEventListener('ended', () => {
      const p = this.want;
      this.want = null;
      if (p) this.onEnd?.(p);
    });
  }

  /** What is meant to be playing (it may still be waiting for the browser to allow sound). */
  get piece(): Piece | null { return this.want; }
  /** Actually sounding. */
  get audible(): boolean { return !!this.want && !this.el.paused && this.ctx.state === 'running'; }

  play(p: Piece, fadeIn = 2): void {
    if (this.want === p) return;
    const m = MUSIC[p];
    this.want = p;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.linearRampToValueAtTime(m.volume, t + fadeIn);
    this.el.loop = m.loop;
    this.el.src = m.url;
    this.start();
  }

  /** Fade out whatever is on. */
  stop(fade = 1.5): void {
    if (!this.want) return;
    this.want = null;
    const t = this.ctx.currentTime, g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    const el = this.el, src = el.src;
    setTimeout(() => { if (!this.want && el.src === src) el.pause(); }, fade * 1000 + 100);
  }

  /** The pause menu: the music waits with the game. */
  hold(on: boolean): void {
    this.held = on;
    if (on) this.el.pause(); else this.kick();
  }

  /** A user gesture has come: start what the browser refused to before one. */
  kick(): void { if (this.want && this.el.paused && !this.held) this.start(); }

  private start(): void { this.el.play().catch(() => { /* waits for a gesture: kick() */ }); }
}
