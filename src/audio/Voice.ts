/**
 * Recorded voices (docs/voice/README.md). Every line said in the game — a card, a word at the door,
 * the passenger in the cab, a page of the album, the presenter on the radio — has a stable id: a
 * hash of its text, normalised (`voiceId`). A file `src/assets/voice/<id>.mp3` (or .ogg/.wav) is that
 * line spoken; when it is there, it plays with the subtitle, the radio ducks under it, and the
 * subtitle stays up as long as the voice. When it is not, nothing changes: the game is text-first.
 * `npm run voice:script` (scripts/voice-script.mjs) writes the actors' script with the ids.
 */

const FILES = import.meta.glob('../assets/voice/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URLS = new Map(Object.entries(FILES).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]));

/**
 * The text as it is recorded: no markup, no guillemets round the whole line, one kind of space and
 * dash. (scripts/voice-script.mjs normalises the same way — keep the two in step.)
 */
export function voiceText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\u00a0\u2009\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^«(.*)»$/, '$1')
    .trim();
}

/** FNV-1a, 32 bits, as 7 base-36 characters: «v» + that, the file's name. */
export function voiceId(text: string): string {
  const s = voiceText(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'v' + h.toString(36).padStart(7, '0');
}

export interface VoiceLine { id: string; speaker: string; text: string; kind: VoiceKind; has: boolean }
/** Where it was said: a word (subtitle), a question on a card, an album page, the radio. */
export type VoiceKind = 'say' | 'ask' | 'page' | 'radio';

export class Voice {
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private current: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  /** Everything said this session, for the script and the tests (DEV). */
  readonly heard = new Map<string, VoiceLine>();
  /** The radio ducks while someone speaks: 0…1 → (the engine). */
  onDuck: ((on: boolean) => void) | null = null;
  volume = 1;

  constructor(private ctx: () => AudioContext | null, private out: () => AudioNode | null) {}

  /** How many lines have a recording. */
  static get recorded(): number { return URLS.size; }

  has(text: string): boolean { return URLS.has(voiceId(text)); }

  /** The recording, decoded (null when there is none or it cannot be read). */
  buffer(text: string): Promise<AudioBuffer | null> {
    const id = voiceId(text), url = URLS.get(id), ctx = this.ctx();
    if (!url || !ctx) return Promise.resolve(null);
    let p = this.cache.get(id);
    if (!p) {
      p = fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null);
      this.cache.set(id, p);
    }
    return p;
  }

  /** Decode ahead (the radio's words for the day): `bufferNow` then has them without waiting. */
  prefetch(texts: string[]): void { for (const t of texts) if (this.has(t)) void this.buffer(t).then((b) => { if (b) this.ready.set(voiceId(t), b); }); }
  private ready = new Map<string, AudioBuffer>();
  /** A recording already decoded, or null. */
  bufferNow(text: string): AudioBuffer | null { return this.ready.get(voiceId(text)) ?? null; }

  /** Note a line as said (and its recording, if any). */
  note(speaker: string, text: string, kind: VoiceKind): VoiceLine {
    const id = voiceId(text);
    const l = { id, speaker, text: voiceText(text), kind, has: URLS.has(id) };
    if (!this.heard.has(id)) this.heard.set(id, l);
    return l;
  }

  /**
   * Someone says a line: its recording plays, if there is one (the one before it stops). Resolves
   * with the recording's length in seconds, 0 when there is none.
   */
  async say(speaker: string, text: string, kind: VoiceKind = 'say'): Promise<number> {
    const l = this.note(speaker, text, kind);
    this.stop();
    if (!l.has) return 0;
    const ctx = this.ctx(), out = this.out();
    const buf = await this.buffer(text);
    if (!buf || !ctx || !out) return 0;
    if (!this.gain) { this.gain = ctx.createGain(); this.gain.connect(out); }
    this.gain.gain.value = this.volume;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.onended = () => { if (this.current === src) { this.current = null; this.onDuck?.(false); } };
    this.current = src;
    this.onDuck?.(true);
    src.start();
    return buf.duration;
  }

  stop(): void {
    if (!this.current) return;
    const c = this.current;
    this.current = null;
    try { c.stop(); } catch { /* already ended */ }
    this.onDuck?.(false);
  }
}
