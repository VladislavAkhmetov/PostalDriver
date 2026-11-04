import * as THREE from 'three';
import { clamp, mulberry32, RNG, tileNoise } from './math';

export const NARROW = '"PT Sans Narrow", "Arial Narrow", Arial, sans-serif';
export const SANS = '"PT Sans", Arial, sans-serif';
export const BLUE = '#1d4ea6';

export interface TexOpts { seed?: number; repeat?: boolean; mip?: boolean }
type Ctx = CanvasRenderingContext2D;
type Painter = (g: Ctx, w: number, h: number, r: RNG) => void;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTex(c: HTMLCanvasElement, o: TexOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  const mip = o.mip !== false;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  t.wrapS = t.wrapT = o.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  return t;
}

export function paint(w: number, h: number, fn: Painter, o: TexOpts = {}): THREE.CanvasTexture {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  fn(g, w, h, mulberry32(o.seed ?? 7));
  return toTex(c, o);
}

const cb = (v: number) => clamp(Math.round(v), 0, 255);
export const rgba = (r: number, g: number, b: number, a = 1): string => `rgba(${cb(r)},${cb(g)},${cb(b)},${a})`;

export function noiseFill(g: Ctx, w: number, h: number, seed: number, base: [number, number, number], amp: number, scale = 8, grain = 0.6): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const r = mulberry32(seed * 7 + 3);
  const px = Math.max(1, Math.round(w / scale)), py = Math.max(1, Math.round(h / scale));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = tileNoise((x / w) * px, (y / h) * py, px, py, seed) * 0.7 + tileNoise((x / w) * px * 3, (y / h) * py * 3, px * 3, py * 3, seed + 9) * 0.3;
      const v = (n - 0.5) * 2 * amp + (r() - 0.5) * amp * grain;
      const i = (y * w + x) * 4;
      d[i] = cb(base[0] + v);
      d[i + 1] = cb(base[1] + v);
      d[i + 2] = cb(base[2] + v);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function dots(g: Ctx, w: number, h: number, r: RNG, n: number, colors: string[], sw = 1, sh = 1): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.fillRect(Math.floor(r() * w), Math.floor(r() * h), sw, sh);
  }
}

function label(g: Ctx, str: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center'): void {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(str, x, y);
}

function brick(base: [number, number, number], mortar: string, seed: number): THREE.CanvasTexture {
  return paint(64, 64, (g, w, h, r) => {
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h; y += 4, row++) {
      for (let x = (row % 2) * 4 - 4; x < w; x += 8) {
        const v = (r() - 0.5) * 34;
        g.fillStyle = rgba(base[0] + v, base[1] + v * 0.8, base[2] + v * 0.7);
        g.fillRect(x, y, 7, 3);
      }
    }
    dots(g, w, h, r, 60, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.15)']);
  }, { seed });
}

function waves(ridges: number, base: [number, number, number], seed: number, rust: boolean): THREE.CanvasTexture {
  return paint(64, 64, (g, w, h, r) => {
    for (let x = 0; x < w; x++) {
      const t = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2 * ridges);
      const c = 0.72 + t * 0.32;
      g.fillStyle = rgba(base[0] * c, base[1] * c, base[2] * c);
      g.fillRect(x, 0, 1, h);
    }
    for (let y = 0; y < h; y += 21) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 1); }
    if (rust) dots(g, w, h, r, 160, ['rgba(120,60,30,0.55)', 'rgba(90,50,30,0.5)'], 2, 1);
    dots(g, w, h, r, 90, ['rgba(60,70,40,0.35)', 'rgba(0,0,0,0.2)'], 1, 2);
  }, { seed });
}

function izbaWindow(frame: string, seed: number): THREE.CanvasTexture {
  return paint(32, 48, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = frame;
    g.beginPath(); g.moveTo(0, 12); g.lineTo(w / 2, 1); g.lineTo(w, 12); g.closePath(); g.fill();
    g.fillRect(0, 10, w, h - 10);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 5; x < w - 4; x += 5) g.fillRect(x, 8, 2, 2);
    g.fillRect(w / 2 - 1, 4, 2, 2);
    g.fillStyle = '#273039';
    g.fillRect(5, 15, w - 10, h - 24);
    g.fillStyle = 'rgba(232,230,220,0.92)';
    g.fillRect(5, 15, 5, h - 24); g.fillRect(w - 10, 15, 5, h - 24); g.fillRect(5, 15, w - 10, 3);
    g.fillStyle = '#ebe8de';
    g.fillRect(w / 2 - 1, 15, 2, h - 24); g.fillRect(5, 25, w - 10, 2);
    g.fillStyle = frame; g.fillRect(1, h - 9, w - 2, 4);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(1, h - 5, w - 2, 1);
    g.fillStyle = '#b8322c'; g.fillRect(12, h - 13, 3, 2);
    g.fillStyle = '#3d6a2e'; g.fillRect(11, h - 11, 5, 2);
  }, { seed, repeat: false });
}

/**
 * A band of hills for the horizon ring: a profile summed from sines whose periods divide the width
 * (so it tiles round the ring), white below it, and with `crowns` a ragged edge of tree tops.
 */
function hillSilhouette(w: number, h: number, o: { top: number; low: number; periods: [number, number, number][]; crowns: boolean }, seed: number): THREE.CanvasTexture {
  return paint(w, h, (g, cw, ch, r) => {
    g.clearRect(0, 0, cw, ch);
    let norm = 0;
    for (const [, a] of o.periods) norm += a;
    const yAt = (x: number) => {
      let v = 0;
      for (const [p, a, ph] of o.periods) v += a * Math.sin((x / cw) * Math.PI * 2 * p + ph);
      const k = (v / norm + 1) / 2;
      return o.low - k * (o.low - o.top);
    };
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, ch);
    for (let x = 0; x <= cw; x += 2) g.lineTo(x, yAt(x));
    g.lineTo(cw, ch); g.closePath(); g.fill();
    // tree tops along the crest: round crowns, the odd spruce spire (drawn again a width over, so the seam tiles)
    const crown = (x: number, y: number) => {
      const spire = r() < 0.22, hw = 1.5 + r() * 1.5, ht = 4 + r() * 5, rad = 1.4 + r() * 2.2;
      for (const dx of [0, -cw, cw]) {
        g.beginPath();
        if (spire) { g.moveTo(x + dx - hw, y + 2); g.lineTo(x + dx, y - ht); g.lineTo(x + dx + hw, y + 2); } else g.arc(x + dx, y, rad, 0, 7);
        g.fill();
      }
    };
    if (o.crowns) for (let x = 0; x < cw; x += 1.5 + r() * 2.5) crown(x, yAt(x) - r() * 1.5);
    // the far ridges: only a fine fur of forest on the skyline
    else for (let x = 0; x < cw; x += 1 + r() * 2) g.fillRect(Math.floor(x), Math.floor(yAt(x) - 1 - r() * 2), 1, 3);
  }, { seed, mip: false });
}

/** Paint scheme of a Bashkir house or gate: the field colour, the white or cream carving, an accent. */
export interface FolkScheme { base: string; trim: string; accent: string }

export const FOLK_SCHEMES: FolkScheme[] = [
  { base: '#3f7a4a', trim: '#f0ece0', accent: '#e0b83a' },
  { base: '#2f5f9e', trim: '#f2efe6', accent: '#e6c84a' },
  { base: '#3a8a86', trim: '#f2efe6', accent: '#c8463a' },
  { base: '#8a5a34', trim: '#f0e2b0', accent: '#3a6aa0' },
  { base: '#5f8fc4', trim: '#ffffff', accent: '#24467a' },
];

/** A rising sun: a half disc with rays, sitting on (cx, cy). */
function halfSun(g: Ctx, cx: number, cy: number, rad: number, rays: number, fill: string, ray: string): void {
  g.strokeStyle = ray; g.lineWidth = 2;
  for (let i = 1; i < rays; i++) {
    const a = Math.PI + (i / rays) * Math.PI;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * rad * 1.15, cy + Math.sin(a) * rad * 1.15); g.lineTo(cx + Math.cos(a) * rad * 1.9, cy + Math.sin(a) * rad * 1.9); g.stroke();
  }
  g.fillStyle = fill;
  g.beginPath(); g.arc(cx, cy, rad, Math.PI, 0); g.closePath(); g.fill();
}

function rhomb(g: Ctx, cx: number, cy: number, rw: number, rh: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(cx, cy - rh); g.lineTo(cx + rw, cy); g.lineTo(cx, cy + rh); g.lineTo(cx - rw, cy); g.closePath(); g.fill();
}

/**
 * Street face of Bashkir yard gates (капка), 4.6 × 2.1 m: a wicket on the left, two broad leaves
 * painted in the field colour, framed in white, a rising sun across the top of the leaves and
 * rhombs on them — the pattern a village carpenter would cut and a family repaint every spring.
 */
export function folkGateTex(s: FolkScheme, seed: number): THREE.CanvasTexture {
  return paint(256, 128, (g, w, h, r) => {
    g.fillStyle = s.base; g.fillRect(0, 0, w, h);
    // the boards, a little weathered
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = 0; x < w; x += 7) g.fillRect(x, 0, 1, h);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 120; i++) g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 2 + Math.floor(r() * 5));
    const wk = 56, mid = wk + (w - wk) / 2;
    // frames: the wicket and each leaf
    g.strokeStyle = s.trim; g.lineWidth = 4;
    g.strokeRect(3, 3, wk - 6, h - 6);
    g.strokeRect(wk + 3, 3, (w - wk) / 2 - 5, h - 6);
    g.strokeRect(mid + 2, 3, (w - wk) / 2 - 5, h - 6);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wk - 1, 0, 2, h); g.fillRect(mid - 1, 0, 2, h);
    // the wicket: a chain of rhombs
    for (let y = 22; y < h - 12; y += 22) { rhomb(g, wk / 2, y, 10, 9, s.trim); rhomb(g, wk / 2, y, 5, 4.5, s.accent); }
    // the leaves: a sun rising over the join, rays across both; a rhomb in a rhomb on each
    halfSun(g, mid, 44, 18, 13, s.accent, s.trim);
    g.fillStyle = s.trim; g.fillRect(mid - 26, 44, 52, 3);
    for (const cx of [wk + (w - wk) / 4, wk + (3 * (w - wk)) / 4]) {
      rhomb(g, cx, 88, 22, 20, s.trim);
      rhomb(g, cx, 88, 16, 14, s.base);
      rhomb(g, cx, 88, 8, 7, s.accent);
      g.fillStyle = s.trim;
      for (const dx of [-30, 30]) { g.beginPath(); g.arc(cx + dx, 88, 3, 0, 7); g.fill(); }
    }
    // a band of scallops along the bottom
    g.fillStyle = s.trim;
    for (let x = wk + 6; x < w - 4; x += 10) { g.beginPath(); g.arc(x + 5, h - 6, 4, Math.PI, 0); g.fill(); }
  }, { seed, repeat: false });
}

/**
 * A window of a Bashkir log house as the street sees it: open shutters painted with a rhomb, the
 * carved surround with a crowned top and a sun in it, a lace curtain behind the glass, the frame
 * in the old T shape, geraniums on the sill. Transparent round the carving.
 */
export function folkWindowTex(s: FolkScheme, seed: number): THREE.CanvasTexture {
  return paint(96, 96, (g, w) => {
    g.clearRect(0, 0, w, w);
    const L = 20, R = w - 20;
    // shutters, open
    for (const x0 of [2, R + 2]) {
      g.fillStyle = s.base; g.fillRect(x0, 26, 16, 58);
      g.strokeStyle = s.trim; g.lineWidth = 2; g.strokeRect(x0 + 1, 27, 14, 56);
      rhomb(g, x0 + 8, 55, 6, 12, s.trim); rhomb(g, x0 + 8, 55, 3, 6, s.accent);
    }
    // glass, curtain, frame, the flowers on the sill
    g.fillStyle = '#273039'; g.fillRect(L + 4, 26, R - L - 8, 54);
    g.fillStyle = 'rgba(236,234,226,0.85)';
    g.fillRect(L + 4, 26, R - L - 8, 12);
    for (let x = L + 6; x < R - 4; x += 6) { g.beginPath(); g.arc(x, 38, 3, 0, Math.PI); g.fill(); }
    g.fillRect(L + 4, 38, 7, 32); g.fillRect(R - 11, 38, 7, 32);
    g.fillStyle = '#efece2';
    g.fillRect(w / 2 - 1, 42, 2, 38); g.fillRect(L + 4, 41, R - L - 8, 2);
    g.fillRect(L + 4, 26, 2, 54); g.fillRect(R - 6, 26, 2, 54);
    for (const fx of [L + 12, w / 2 + 8]) {
      g.fillStyle = '#9a4a2a'; g.fillRect(fx, 74, 6, 5);
      g.fillStyle = '#3d6a2e'; g.fillRect(fx - 2, 70, 10, 4);
      g.fillStyle = '#d8342c'; g.fillRect(fx, 67, 3, 3); g.fillRect(fx + 4, 68, 3, 3);
    }
    // the surround: side boards, the crown with its sun, the sill and its drops
    g.fillStyle = s.trim;
    g.fillRect(L, 24, 4, 60); g.fillRect(R - 4, 24, 4, 60);
    g.beginPath(); g.moveTo(L - 3, 25); g.lineTo(w / 2, 3); g.lineTo(R + 3, 25); g.closePath(); g.fill();
    g.fillStyle = s.base;
    g.beginPath(); g.moveTo(L + 4, 22); g.lineTo(w / 2, 8); g.lineTo(R - 4, 22); g.closePath(); g.fill();
    halfSun(g, w / 2, 22, 6, 9, s.accent, s.trim);
    g.fillStyle = s.trim;
    for (let x = L; x < R; x += 6) { g.beginPath(); g.arc(x + 3, 25, 3, 0, Math.PI); g.fill(); }
    g.fillRect(L - 4, 80, R - L + 8, 5);
    for (let x = L - 2; x < R + 2; x += 7) { g.beginPath(); g.moveTo(x, 85); g.lineTo(x + 3.5, 92); g.lineTo(x + 7, 85); g.fill(); }
  }, { seed, repeat: false });
}

/** Glow mask for folkWindowTex: the glass only, warm behind the curtain. */
export function folkWindowGlow(): THREE.CanvasTexture {
  return paint(96, 96, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd08a'; g.fillRect(31, 44, w - 62, 34);
    g.fillStyle = '#a8784a'; g.fillRect(24, 38, 7, 32); g.fillRect(w - 31, 38, 7, 32);
  }, { repeat: false });
}

/**
 * The boarded gable of a Bashkir house: boards fanning out from a sun under the attic window, in
 * the field colour with the rays picked out. Drawn on a triangle (uv (0,0) (1,0) (0.5,1)).
 */
export function folkGableTex(s: FolkScheme, seed: number): THREE.CanvasTexture {
  return paint(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath(); g.moveTo(0, h); g.lineTo(w / 2, 0); g.lineTo(w, h); g.closePath(); g.clip();
    g.fillStyle = s.base; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h - 3;
    for (let i = 0; i < 18; i++) {
      const a0 = Math.PI + (i / 18) * Math.PI, a1 = Math.PI + ((i + 1) / 18) * Math.PI;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * 140, cy + Math.sin(a0) * 140); g.lineTo(cx + Math.cos(a1) * 140, cy + Math.sin(a1) * 140); g.closePath(); g.fill();
    }
    halfSun(g, cx, cy, 12, 15, s.trim, s.trim);
    g.fillStyle = s.accent; g.beginPath(); g.arc(cx, cy, 7, Math.PI, 0); g.fill();
    // the attic window above the sun
    g.fillStyle = s.trim; g.fillRect(cx - 7, 20, 14, 17);
    g.fillStyle = '#273039'; g.fillRect(cx - 5, 22, 10, 13);
    g.fillStyle = s.trim; g.fillRect(cx - 1, 22, 2, 13); g.fillRect(cx - 5, 28, 10, 2);
    g.restore();
    // the carved eaves boards
    g.strokeStyle = s.trim; g.lineWidth = 3;
    g.beginPath(); g.moveTo(1, h - 1); g.lineTo(w / 2, 1); g.lineTo(w - 1, h - 1); g.stroke();
  }, { seed, repeat: false });
}

export function settlementSign(name: string, exit: boolean): THREE.CanvasTexture {
  return paint(128, 48, (g, w, h) => {
    g.fillStyle = '#f2f1ea'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    label(g, name.toUpperCase(), w / 2, h / 2 + 1, `bold 24px ${NARROW}`, '#111');
    if (exit) {
      g.strokeStyle = '#c22a20'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(8, h - 8); g.lineTo(w - 8, 8); g.stroke();
    }
  }, { repeat: false });
}

export function directionSign(lines: [string, string][], arrow: 'right' | 'left' | 'up'): THREE.CanvasTexture {
  return paint(128, 64, (g, w, h) => {
    g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6);
    lines.forEach(([n, km], i) => {
      const y = 18 + i * 24;
      label(g, n, 10, y, `bold 17px ${NARROW}`, '#fff', 'left');
      label(g, km, w - 30, y, `bold 17px ${NARROW}`, '#fff', 'right');
    });
    g.fillStyle = '#fff';
    if (arrow === 'right') {
      g.fillRect(w - 26, 28, 12, 4); g.beginPath(); g.moveTo(w - 14, 22); g.lineTo(w - 7, 30); g.lineTo(w - 14, 38); g.fill();
    } else if (arrow === 'left') {
      g.fillRect(w - 21, 28, 12, 4); g.beginPath(); g.moveTo(w - 21, 22); g.lineTo(w - 28, 30); g.lineTo(w - 21, 38); g.fill();
    } else {
      g.fillRect(w - 18, 30, 4, 22); g.beginPath(); g.moveTo(w - 24, 32); g.lineTo(w - 16, 22); g.lineTo(w - 8, 32); g.fill();
    }
  }, { repeat: false });
}

export function warningSign(kind: 'uneven' | 'slippery' | 'kids'): THREE.CanvasTexture {
  return paint(64, 64, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#c62a22';
    g.beginPath(); g.moveTo(w / 2, 3); g.lineTo(w - 2, w - 6); g.lineTo(2, w - 6); g.closePath(); g.fill();
    g.fillStyle = '#f4f2ea';
    g.beginPath(); g.moveTo(w / 2, 13); g.lineTo(w - 11, w - 11); g.lineTo(11, w - 11); g.closePath(); g.fill();
    g.fillStyle = '#111'; g.strokeStyle = '#111'; g.lineWidth = 3;
    if (kind === 'uneven') {
      g.beginPath(); g.moveTo(18, 46); g.quadraticCurveTo(25, 34, 32, 46); g.quadraticCurveTo(39, 34, 46, 46); g.stroke();
    } else if (kind === 'slippery') {
      g.fillRect(25, 28, 14, 7); g.fillRect(27, 24, 10, 5);
      g.lineWidth = 2; g.beginPath(); g.moveTo(22, 48); g.bezierCurveTo(28, 40, 20, 40, 28, 36); g.moveTo(42, 48); g.bezierCurveTo(36, 40, 44, 40, 36, 36); g.stroke();
    } else {
      g.beginPath(); g.arc(28, 26, 3, 0, 7); g.arc(38, 30, 3, 0, 7); g.fill();
      g.fillRect(26, 30, 4, 10); g.fillRect(36, 34, 4, 8);
    }
  }, { repeat: false });
}

export function blueSign(lines: string[], w = 128, h = 32): THREE.CanvasTexture {
  return paint(w, h, (g) => {
    g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
    lines.forEach((l, i) => label(g, l, w / 2, (h / (lines.length + 1)) * (i + 1) + 1, `bold ${Math.floor(h / (lines.length + 0.9))}px ${NARROW}`, '#fff'));
  }, { repeat: false });
}

export function kmPost(n: number): THREE.CanvasTexture {
  return paint(32, 32, (g, w, h) => {
    g.fillStyle = '#f1f0ea'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    label(g, String(n), w / 2, h / 2 + 1, `bold 20px ${NARROW}`, '#111');
  }, { repeat: false });
}

export function createTextures() {
  const T = {
    grass: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 11, [190, 194, 162], 30, 16, 0.9);
      dots(g, w, h, r, 240, ['rgba(110,120,80,0.6)', 'rgba(240,232,190,0.5)'], 1, 2);
    }, { seed: 11 }),

    grassSummer: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 11, [95, 142, 65], 26, 16, 0.9);
      dots(g, w, h, r, 260, ['rgba(55,105,38,0.7)', 'rgba(130,185,75,0.6)', 'rgba(235,210,90,0.35)'], 1, 2);
    }, { seed: 11 }),

    asphalt: paint(64, 128, (g, w, h, r) => {
      noiseFill(g, w, h, 21, [118, 118, 115], 15, 8, 1.1);
      for (let i = 0; i < 6; i++) {
        const pw = 10 + r() * 18, ph = 12 + r() * 40;
        g.fillStyle = rgba(76, 76, 78, 0.6);
        g.fillRect(Math.floor(r() * (w - pw)), Math.floor(r() * h), Math.floor(pw), Math.floor(ph));
      }
      g.fillStyle = rgba(206, 204, 190, 0.5);
      for (let y = 6; y < h; y += 64) for (let k = 0; k < 30; k++) if (r() < 0.75) g.fillRect(w / 2 - 1, y + k, 2, 1);
      g.strokeStyle = rgba(40, 40, 40, 0.75);
      g.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        let x = r() * w, y = r() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 8; y += (r() - 0.3) * 8; g.lineTo(x, y); }
        g.stroke();
      }
      for (let y = 0; y < h; y++) {
        g.fillStyle = rgba(122, 110, 86, 0.85);
        g.fillRect(0, y, 2 + Math.floor(r() * 4), 1);
        const e2 = 2 + Math.floor(r() * 4);
        g.fillRect(w - e2, y, e2, 1);
      }
      dots(g, w, h, r, 220, ['rgba(165,165,160,0.6)', 'rgba(60,60,60,0.5)']);
    }, { seed: 21 }),

    gravel: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 31, [154, 144, 124], 18, 8, 1.4);
      for (const cx of [0.3, 0.7]) { g.fillStyle = rgba(128, 120, 104, 0.55); g.fillRect(cx * w - 5, 0, 10, h); }
      dots(g, w, h, r, 520, ['rgba(205,196,178,0.9)', 'rgba(95,88,78,0.9)', 'rgba(172,162,142,0.9)']);
    }, { seed: 31 }),

    dirt: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 41, [114, 94, 68], 18, 8, 1.0);
      for (const cx of [0.3, 0.7]) { g.fillStyle = rgba(90, 72, 52, 0.6); g.fillRect(cx * w - 6, 0, 12, h); }
      for (let y = 0; y < h; y++) {
        const a = (0.44 + (r() - 0.5) * 0.05) * w, b = (0.56 + (r() - 0.5) * 0.05) * w;
        g.fillStyle = rgba(100, 112, 58, 0.85);
        g.fillRect(Math.floor(a), y, Math.floor(b - a), 1);
        const e = 3 + Math.floor(r() * 6);
        g.fillRect(0, y, e, 1); g.fillRect(w - e, y, e, 1);
      }
      dots(g, w, h, r, 160, ['rgba(140,150,80,0.9)', 'rgba(70,58,40,0.8)']);
    }, { seed: 41 }),

    mud: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 51, [84, 66, 48], 16, 8, 0.8);
      for (const cx of [0.35, 0.65]) {
        g.fillStyle = rgba(58, 45, 34, 0.85); g.fillRect(cx * w - 6, 0, 12, h);
        for (let y = 0; y < h; y++) if (r() < 0.25) { g.fillStyle = rgba(150, 152, 148, 0.5); g.fillRect(cx * w - 3 + Math.floor(r() * 6), y, 1 + Math.floor(r() * 2), 1); }
      }
      dots(g, w, h, r, 140, ['rgba(120,110,100,0.7)', 'rgba(50,38,28,0.8)']);
    }, { seed: 51 }),

    planks: paint(64, 64, (g, w, h, r) => {
      for (let y = 0; y < h; y += 8) {
        const c = 92 + r() * 34;
        g.fillStyle = rgba(c, c * 0.88, c * 0.74); g.fillRect(0, y, w, 8);
        g.fillStyle = rgba(36, 30, 24, 0.95); g.fillRect(0, y, w, 1);
        for (let k = 0; k < 20; k++) { g.fillStyle = rgba(c - 24, (c - 24) * 0.88, (c - 24) * 0.74, 0.6); g.fillRect(Math.floor(r() * w), y + 1 + Math.floor(r() * 6), 3 + Math.floor(r() * 8), 1); }
        g.fillStyle = 'rgba(30,30,30,0.9)'; g.fillRect(6, y + 4, 1, 1); g.fillRect(w - 7, y + 4, 1, 1);
      }
    }, { seed: 61 }),

    logs: paint(64, 64, (g, w, h, r) => {
      for (let y = 0; y < h; y += 8) {
        for (let k = 0; k < 8; k++) {
          const t = Math.sin(((k + 0.5) / 8) * Math.PI);
          const c = 72 + t * 62;
          g.fillStyle = rgba(c * 1.04, c * 0.93, c * 0.8); g.fillRect(0, y + k, w, 1);
        }
        g.fillStyle = 'rgb(34,28,22)'; g.fillRect(0, y + 7, w, 1);
      }
      for (let i = 0; i < 160; i++) { g.fillStyle = rgba(48, 40, 30, 0.4); g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2 + Math.floor(r() * 6), 1); }
    }, { seed: 71 }),

    boards: paint(64, 64, (g, w, h, r) => {
      for (let x = 0; x < w; x += 6) {
        const c = 120 + r() * 40;
        g.fillStyle = rgba(c, c * 0.93, c * 0.84); g.fillRect(x, 0, 6, h);
        g.fillStyle = 'rgba(38,32,26,0.9)'; g.fillRect(x, 0, 1, h);
      }
      for (let i = 0; i < 120; i++) { g.fillStyle = rgba(60, 52, 44, 0.35); g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 3 + Math.floor(r() * 7)); }
    }, { seed: 81 }),

    brickRed: brick([150, 72, 52], '#8c7a6a', 91),
    brickWhite: brick([214, 208, 192], '#a8a49a', 92),
    slate: waves(8, [168, 168, 160], 93, false),
    metalRoof: waves(5, [200, 200, 200], 94, true),

    plaster: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 95, [224, 218, 202], 9, 16, 0.6);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(120,110,90,0.18)'; g.fillRect(Math.floor(r() * w), Math.floor(r() * h * 0.5), 2 + Math.floor(r() * 3), 10 + Math.floor(r() * 30)); }
    }, { seed: 95 }),

    concrete: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 96, [152, 152, 148], 13, 8, 1);
      g.fillStyle = 'rgba(60,60,60,0.5)'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h);
      dots(g, w, h, r, 100, ['rgba(80,80,80,0.5)', 'rgba(200,200,200,0.4)']);
    }, { seed: 96 }),

    rust: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 97, [124, 76, 48], 24, 8, 1);
      dots(g, w, h, r, 120, ['rgba(60,40,30,0.6)', 'rgba(170,110,70,0.5)'], 2, 2);
    }, { seed: 97 }),

    hay: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 98, [182, 152, 88], 20, 8, 1);
      for (let i = 0; i < 300; i++) {
        const x = r() * w, y = r() * h, a = (r() - 0.5) * 1.2, l = 3 + r() * 6;
        g.strokeStyle = r() < 0.5 ? 'rgba(226,196,120,0.8)' : 'rgba(110,86,48,0.7)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * l, y + Math.cos(a) * l); g.stroke();
      }
    }, { seed: 98 }),

    water: paint(64, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 99, [70, 86, 88], 10, 16, 0.4);
      for (let i = 0; i < 70; i++) { g.fillStyle = r() < 0.5 ? 'rgba(190,205,210,0.5)' : 'rgba(30,40,40,0.5)'; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 3 + Math.floor(r() * 6), 1); }
    }, { seed: 99 }),

    pothole: paint(32, 32, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const ring = (rad: number, col: string) => {
        g.fillStyle = col; g.beginPath();
        for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; const rr = rad * (0.75 + r() * 0.35); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr * 0.8); }
        g.fill();
      };
      ring(15, 'rgba(70,64,56,0.95)');
      ring(11, 'rgba(46,42,38,1)');
      ring(6, 'rgba(78,86,92,0.95)');
      dots(g, w, h, r, 30, ['rgba(140,130,120,0.8)']);
    }, { seed: 100, repeat: false }),

    puddle: paint(32, 32, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.beginPath();
      for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 2; const rr = 14 * (0.78 + r() * 0.24); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
      g.fill();
      g.fillStyle = 'rgba(160,165,170,1)'; for (let i = 0; i < 18; i++) g.fillRect(6 + Math.floor(r() * 20), 6 + Math.floor(r() * 20), 3, 1);
    }, { seed: 101, repeat: false }),

    picket: paint(64, 32, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#d8d4c8'; g.fillRect(0, 9, w, 2); g.fillRect(0, 22, w, 2);
      for (let x = 1; x < w; x += 8) {
        if (r() < 0.08) continue;
        const tilt = Math.floor((r() - 0.5) * 2);
        g.fillStyle = r() < 0.2 ? '#bdb7a8' : '#e8e4d8';
        g.fillRect(x + tilt, 4, 5, h - 4);
        g.beginPath(); g.moveTo(x + tilt, 4); g.lineTo(x + tilt + 2.5, 0); g.lineTo(x + tilt + 5, 4); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + tilt + 4, 4, 1, h - 4);
      }
    }, { seed: 102 }),

    woodEnds: paint(32, 32, (g, w, h, r) => {
      g.fillStyle = '#3a2c20'; g.fillRect(0, 0, w, h);
      for (let y = 3; y < h; y += 6) for (let x = 3 + ((y / 6) % 2) * 3; x < w; x += 6) {
        g.fillStyle = rgba(196 + r() * 30, 160 + r() * 20, 110); g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
        g.fillStyle = 'rgba(120,80,40,0.8)'; g.fillRect(x, y, 1, 1);
      }
    }, { seed: 103 }),

    birch: paint(64, 128, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2;
      for (let y = Math.floor(h * 0.16); y < h; y++) {
        const x = Math.round(cx + Math.sin(y * 0.06) * 1.2 - 1.5);
        const wd = y > h * 0.86 ? 4 : 3;
        g.fillStyle = '#ebe8dc'; g.fillRect(x, y, wd, 1);
        if (r() < 0.35) { g.fillStyle = '#1e1e1e'; g.fillRect(x + Math.floor(r() * wd), y, 1 + Math.floor(r() * 2), 1); }
      }
      g.fillStyle = '#3a3026';
      for (let i = 0; i < 10; i++) {
        const y = h * 0.28 + r() * h * 0.36, dir = r() < 0.5 ? -1 : 1;
        for (let k = 0; k < 11; k++) g.fillRect(Math.floor(cx + dir * k * 1.6), Math.floor(y - k * 1.1), 1, 1);
      }
      const cols = ['#5f5a24', '#7d7426', '#a88d2a', '#c99f2e', '#ddb43a', '#f0d060', '#93a03a', '#6f8a36'];
      for (let i = 0; i < 950; i++) {
        const t = r();
        const y = h * 0.04 + t * h * 0.64;
        const spread = Math.sin(Math.min(1, t * 1.12) * Math.PI) * w * 0.45 + 3;
        const x = cx + (r() - 0.5) * 2 * spread * Math.sqrt(r());
        const ci = Math.min(cols.length - 1, Math.floor((i / 950) * 4 + r() * 4));
        g.fillStyle = cols[ci];
        g.fillRect(Math.floor(x), Math.floor(y), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
      }
    }, { seed: 104, repeat: false }),

    birchSummer: paint(64, 128, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2;
      for (let y = Math.floor(h * 0.16); y < h; y++) {
        const x = Math.round(cx + Math.sin(y * 0.06) * 1.2 - 1.5);
        const wd = y > h * 0.86 ? 4 : 3;
        g.fillStyle = '#ebe8dc'; g.fillRect(x, y, wd, 1);
        if (r() < 0.35) { g.fillStyle = '#1e1e1e'; g.fillRect(x + Math.floor(r() * wd), y, 1 + Math.floor(r() * 2), 1); }
      }
      g.fillStyle = '#3a3026';
      for (let i = 0; i < 10; i++) {
        const y = h * 0.28 + r() * h * 0.36, dir = r() < 0.5 ? -1 : 1;
        for (let k = 0; k < 11; k++) g.fillRect(Math.floor(cx + dir * k * 1.6), Math.floor(y - k * 1.1), 1, 1);
      }
      const cols = ['#264e1c', '#346624', '#478232', '#5ea342', '#76b84e', '#3f7028', '#528a36', '#6db345'];
      for (let i = 0; i < 950; i++) {
        const t = r();
        const y = h * 0.04 + t * h * 0.64;
        const spread = Math.sin(Math.min(1, t * 1.12) * Math.PI) * w * 0.45 + 3;
        const x = cx + (r() - 0.5) * 2 * spread * Math.sqrt(r());
        const ci = Math.min(cols.length - 1, Math.floor((i / 950) * 4 + r() * 4));
        g.fillStyle = cols[ci];
        g.fillRect(Math.floor(x), Math.floor(y), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
      }
    }, { seed: 104, repeat: false }),

    spruce: paint(64, 128, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const top = 2, base = h * 0.9, cx = w / 2;
      for (let y = top; y < base; y++) {
        const t = (y - top) / (base - top);
        const hw = (t * 0.92 + 0.05) * w * 0.45 * (0.82 + 0.3 * Math.abs(Math.sin(y * 0.7)));
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
          const edge = Math.abs(x - cx) / Math.max(1, hw);
          if (edge > 0.82 && r() < 0.5) continue;
          const s = (x > cx ? 1.18 : 0.84) * (0.78 + 0.4 * r()) * (1 - edge * 0.2) * (y % 9 < 2 ? 0.6 : 1);
          g.fillStyle = rgba(34 * s, 58 * s, 38 * s);
          g.fillRect(x, y, 1, 1);
        }
      }
      g.fillStyle = '#3e2d20'; g.fillRect(cx - 1, base, 3, h - base);
    }, { seed: 105, repeat: false }),

    pine: paint(64, 128, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2;
      for (let y = Math.floor(h * 0.15); y < h; y++) {
        const x = Math.round(cx + Math.sin(y * 0.04) * 2 - 1);
        g.fillStyle = y < h * 0.6 ? '#9a5c36' : '#5c3e2a'; g.fillRect(x, y, 3, 1);
      }
      for (let c = 0; c < 6; c++) {
        const ccx = cx + (r() - 0.5) * w * 0.55, ccy = h * 0.06 + r() * h * 0.3;
        const rx = 8 + r() * 10, ry = 4 + r() * 5;
        g.strokeStyle = '#4a3424'; g.beginPath(); g.moveTo(cx, ccy + 6); g.lineTo(ccx, ccy); g.stroke();
        for (let i = 0; i < 170; i++) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r());
          const s = (Math.sin(a) < 0 ? 1.15 : 0.8) * (0.8 + r() * 0.4);
          g.fillStyle = rgba(40 * s, 70 * s, 42 * s);
          g.fillRect(Math.floor(ccx + Math.cos(a) * rx * d), Math.floor(ccy + Math.sin(a) * ry * d), 2, 1);
        }
      }
    }, { seed: 106, repeat: false }),

    bush: paint(64, 64, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const cols = ['#4e6a2e', '#6c8436', '#8f9a3a', '#b59a34', '#5a5a26', '#a8402a'];
      for (let i = 0; i < 1000; i++) {
        const a = r() * Math.PI, d = Math.sqrt(r());
        const x = w / 2 + Math.cos(a) * w * 0.46 * d * (r() < 0.5 ? -1 : 1);
        const y = h - Math.sin(a) * h * 0.85 * d;
        g.fillStyle = cols[Math.floor(r() * (r() < 0.05 ? 6 : 5))];
        g.fillRect(Math.floor(x), Math.floor(y), 2, 1 + Math.floor(r() * 2));
      }
    }, { seed: 107, repeat: false }),

    bushSummer: paint(64, 64, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const cols = ['#29521e', '#386928', '#4c8535', '#639e44', '#78b050', '#3e702a'];
      for (let i = 0; i < 1000; i++) {
        const a = r() * Math.PI, d = Math.sqrt(r());
        const x = w / 2 + Math.cos(a) * w * 0.46 * d * (r() < 0.5 ? -1 : 1);
        const y = h - Math.sin(a) * h * 0.85 * d;
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.fillRect(Math.floor(x), Math.floor(y), 2, 1 + Math.floor(r() * 2));
      }
    }, { seed: 107, repeat: false }),

    reeds: paint(32, 64, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const x = 1 + r() * (w - 2), top = h * (0.15 + r() * 0.5);
        g.fillStyle = ['#8d8a4c', '#a9a060', '#6f7a3c'][i % 3];
        g.fillRect(Math.floor(x), Math.floor(top), 1, h);
        if (r() < 0.3) { g.fillStyle = '#5a4630'; g.fillRect(Math.floor(x) - 1, Math.floor(top), 2, 5); }
      }
    }, { seed: 108, repeat: false }),

    // the horizon round the map: the Ural foothills, low wooded ridges one behind another.
    // White silhouettes tinted by their material; both tile seamlessly round the ring.
    farHills: hillSilhouette(1024, 128, { top: 6, low: 27, periods: [[1, 0.5, 0.3], [3, 0.3, 1.9], [5, 0.2, 4.1], [11, 0.08, 0.7]], crowns: true }, 111),
    farRidge: hillSilhouette(1024, 128, { top: 10, low: 46, periods: [[1, 0.45, 2.2], [2, 0.35, 0.4], [4, 0.2, 3.3], [9, 0.06, 1.2]], crowns: false }, 112),

    clouds: paint(128, 128, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0, a = 0.5, f = 4, n = 0;
        for (let o = 0; o < 5; o++) { v += a * tileNoise((x / w) * f, (y / h) * f, f, f, 200 + o); n += a; a *= 0.5; f *= 2; }
        v /= n;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = cb(v * 255); img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, { seed: 110 }),

    // ---------- buildings ----------
    winBlue: izbaWindow('#3f6fb0', 120),
    winWhite: izbaWindow('#e8e4d8', 121),
    winGreen: izbaWindow('#4c7a4a', 122),
    winGlow: paint(32, 48, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd08a'; g.fillRect(10, 18, w - 20, h - 27);
      g.fillStyle = '#a8784a'; g.fillRect(5, 15, 5, h - 24); g.fillRect(w - 10, 15, 5, h - 24);
    }, { repeat: false }),

    facade: paint(256, 128, (g, w, h, r) => {
      noiseFill(g, w, h, 130, [196, 194, 186], 8, 32, 0.5);
      for (let f = 0; f < 5; f++) for (let c = 0; c < 16; c++) {
        const x = c * 16, y = 4 + f * 24;
        g.fillStyle = 'rgba(90,90,90,0.4)'; g.fillRect(x, y - 4, 16, 1); g.fillRect(x, y - 4, 1, 24);
        const balcony = c % 4 === 1;
        g.fillStyle = r() < 0.3 ? '#3a4652' : '#2a323a'; g.fillRect(x + 3, y + 3, 10, 12);
        g.fillStyle = '#d9d6cc'; g.fillRect(x + 7, y + 3, 1, 12); g.fillRect(x + 3, y + 7, 10, 1);
        if (r() < 0.25) { g.fillStyle = 'rgba(230,220,200,0.8)'; g.fillRect(x + 3, y + 3, 3, 12); }
        if (balcony && f > 0) { g.fillStyle = '#a7a59c'; g.fillRect(x + 1, y + 13, 14, 6); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y + 18, 14, 1); }
      }
      g.fillStyle = '#7d7a72'; g.fillRect(0, h - 8, w, 8);
    }, { seed: 130 }),
    facadeGlow: paint(256, 128, (g, w, h, r) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let f = 0; f < 5; f++) for (let c = 0; c < 16; c++) {
        if (r() < 0.38) { g.fillStyle = r() < 0.7 ? '#ffcc80' : '#b8d4ff'; g.fillRect(c * 16 + 3, 4 + f * 24 + 3, 10, 12); }
      }
    }, { seed: 131 }),

    pochtaSign: paint(256, 32, (g, w, h) => {
      g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.fillRect(10, 8, 26, 17); g.fillStyle = BLUE;
      g.beginPath(); g.moveTo(10, 8); g.lineTo(23, 18); g.lineTo(36, 8); g.lineTo(34, 8); g.lineTo(23, 15); g.lineTo(12, 8); g.fill();
      // a district communications office in 1997: «Почта России» is a name from 2002
      label(g, 'ПОЧТА · ТЕЛЕГРАФ', w / 2 + 16, h / 2 + 1, `bold 22px ${NARROW}`, '#fff');
    }, { repeat: false }),
    shopSign: paint(128, 32, (g, w, h) => {
      g.fillStyle = '#ece6d6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7a2a20'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
      label(g, 'ПРОДУКТЫ', w / 2, h / 2 + 1, `bold 22px ${NARROW}`, '#b22a20');
    }, { repeat: false }),
    door: paint(32, 64, (g, w, h, r) => {
      noiseFill(g, w, h, 140, [120, 80, 56], 14, 8, 0.6);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(4, 6, w - 8, 22); g.fillRect(4, 34, w - 8, 24);
      g.fillStyle = '#c8b070'; g.fillRect(w - 8, 32, 3, 3);
      dots(g, w, h, r, 30, ['rgba(0,0,0,0.3)']);
    }, { repeat: false }),
    mosaic: paint(64, 32, (g, w, h, r) => {
      const cols = ['#c9a23a', '#2f6a9a', '#b8452e', '#e8e2d0', '#3c7a52'];
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { g.fillStyle = cols[Math.floor(r() * 5)]; g.fillRect(x, y, 2, 2); }
      g.fillStyle = '#e8b830'; g.beginPath(); g.arc(20, 14, 8, 0, 7); g.fill();
      g.fillStyle = '#2a5a8a'; g.fillRect(34, 6, 22, 4); g.fillRect(36, 14, 18, 4); g.fillRect(38, 22, 14, 4);
    }, { seed: 141 }),
    garageDoor: paint(32, 32, (g, w, h, r) => {
      noiseFill(g, w, h, 142, [96, 104, 92], 12, 8, 0.6);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(w / 2, 0, 1, h);
      dots(g, w, h, r, 40, ['rgba(140,80,40,0.7)'], 2, 1);
    }, { repeat: false }),
    bigWindow: paint(32, 32, (g, w, h) => {
      g.fillStyle = '#e6e2d6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a333c'; g.fillRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#e6e2d6'; g.fillRect(w / 2 - 1, 3, 2, h - 6); g.fillRect(3, 11, w - 6, 2);
    }, { repeat: false }),
    vanSide: paint(256, 64, (g, w, h, r) => {
      g.fillStyle = '#e9e7e0'; g.fillRect(0, 0, w, h);
      g.fillStyle = BLUE; g.fillRect(0, 30, w, 8);
      label(g, 'ПОЧТА', w * 0.55, 18, `bold 20px ${NARROW}`, BLUE);
      const grad = g.createLinearGradient(0, h - 18, 0, h);
      grad.addColorStop(0, 'rgba(110,90,60,0)'); grad.addColorStop(1, 'rgba(100,80,55,0.8)');
      g.fillStyle = grad; g.fillRect(0, h - 18, w, 18);
      dots(g, w, h, r, 80, ['rgba(120,100,70,0.6)'], 2, 1);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(70, 2, 1, h - 6); g.fillRect(150, 2, 1, h - 6);
    }, { repeat: false }),

    // ---------- cabin ----------
    paintMetal: paint(64, 64, (g, w, h, r) => {
      // worn enamel: soft brush streaks and a few scuffs rather than blotches
      noiseFill(g, w, h, 150, [220, 218, 208], 4, 16, 0.35);
      for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`; g.fillRect(0, y, w, 1); }
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(90,84,74,0.22)'; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 4), 1); }
      dots(g, w, h, r, 6, ['rgba(120,84,50,0.25)'], 1, 1);
      // chipped enamel showing grey primer, a few rust freckles, greasy hand marks
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(r() * w), y = Math.floor(r() * h);
        g.fillStyle = 'rgba(128,124,112,0.35)'; g.fillRect(x, y, 2, 1);
        g.fillStyle = 'rgba(122,70,36,0.3)'; g.fillRect(x + 1, y + 1, 1, 1);
      }
    }, { seed: 150 }),
    vinyl: paint(32, 32, (g, w, h, r) => {
      noiseFill(g, w, h, 151, [46, 45, 44], 6, 8, 1);
      dots(g, w, h, r, 40, ['rgba(90,90,90,0.5)']);
    }, { seed: 151 }),
    rubber: paint(64, 64, (g, w, h) => {
      noiseFill(g, w, h, 152, [44, 44, 44], 5, 8, 1);
      for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, y, w, 1); g.fillStyle = 'rgba(110,110,110,0.35)'; g.fillRect(0, y + 1, w, 1); }
    }, { seed: 152 }),
    seat: paint(32, 32, (g, w, h) => {
      // dark grey leatherette with sewn flutes
      noiseFill(g, w, h, 153, [92, 94, 96], 7, 8, 0.8);
      g.fillStyle = 'rgba(0,0,0,0.38)'; for (let x = 4; x < w; x += 8) g.fillRect(x, 0, 1, h);
      g.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 5; x < w; x += 8) g.fillRect(x, 0, 1, h);
    }, { seed: 153 }),
    doorCard: paint(64, 64, (g, w, h) => {
      noiseFill(g, w, h, 154, [104, 104, 102], 8, 16, 0.8);
      g.fillStyle = 'rgba(30,30,30,0.7)'; for (let x = 4; x < w; x += 14) { g.fillRect(x, 4, 1, 1); g.fillRect(x, h - 5, 1, 1); }
    }, { seed: 154 }),
    // black instrument strip: five separate round gauges, speedometer in the middle
    cluster: paint(384, 120, (g, w, h) => {
      g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2e2e2e'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
      const dial = (cx: number, cy: number, rad: number, a0: number, a1: number, ticks: number, labels: string[], title: string) => {
        g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(cx, cy, rad + 3, 0, 7); g.fill();
        g.strokeStyle = '#f0f0ea';
        for (let i = 0; i <= ticks; i++) {
          const a = a0 + ((a1 - a0) * i) / ticks;
          const big = i % 2 === 0;
          g.lineWidth = big ? 2 : 1;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * rad * (big ? 0.72 : 0.82), cy + Math.sin(a) * rad * (big ? 0.72 : 0.82));
          g.lineTo(cx + Math.cos(a) * rad * 0.95, cy + Math.sin(a) * rad * 0.95);
          g.stroke();
        }
        labels.forEach((l, i) => {
          const a = a0 + ((a1 - a0) * i) / (labels.length - 1);
          label(g, l, cx + Math.cos(a) * rad * 0.55, cy + Math.sin(a) * rad * 0.55, `bold 9px ${SANS}`, '#f0f0ea');
        });
        label(g, title, cx, cy + rad * 0.5, `bold 9px ${SANS}`, '#d8d8d0');
      };
      const D = Math.PI / 180;
      // four equal gauges: speedometer, fuel, coolant, oil pressure
      dial(48, 60, 40, 135 * D, 405 * D, 12, ['0', '20', '40', '60', '80', '100', '120'], 'км/ч');
      g.fillStyle = '#242424'; g.fillRect(32, 82, 32, 10);
      label(g, '041787', 48, 87.5, `8px ${SANS}`, '#e8e8e0');
      dial(144, 60, 40, 225 * D, 315 * D, 4, ['0', '', '1'], 'Б');
      dial(240, 60, 40, 225 * D, 315 * D, 4, ['40', '', '120'], '°C');
      dial(336, 60, 40, 225 * D, 315 * D, 4, ['0', '', '8'], 'кгс/см²');
      // tell-tale sockets under the gauges
      for (const x of [60, 156, 252, 340]) {
        g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(x, 112, 7, 0, 7); g.fill();
        g.strokeStyle = '#6a6a66'; g.lineWidth = 1; g.beginPath(); g.arc(x, 112, 7, 0, 7); g.stroke();
      }
    }, { repeat: false }),
    cassette: paint(64, 32, (g, w, h) => {
      g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#9a9a96'; g.fillRect(2, 2, w - 4, 9);
      label(g, 'КАССЕТА · 60', w / 2, 6.5, `bold 7px ${NARROW}`, '#1a1a1a');
      g.fillStyle = '#3a3a3a'; g.fillRect(14, 14, 36, 12);
      g.fillStyle = '#c9c0a8'; g.beginPath(); g.arc(23, 20, 3.5, 0, 7); g.arc(41, 20, 3.5, 0, 7); g.fill();
      for (let i = 0; i < 5; i++) { g.fillStyle = '#5a5a5a'; g.fillRect(4 + i * 5, 28, 4, 3); }
      g.fillStyle = '#c23a2a'; g.fillRect(56, 15, 3, 3);
    }, { repeat: false }),
    newspaper: paint(64, 64, (g, w, h, r) => {
      g.fillStyle = '#e4dfcf'; g.fillRect(0, 0, w, h);
      label(g, 'СЕЛЬСКАЯ', w / 2, 7, `bold 10px ${NARROW}`, '#2a2a2a');
      label(g, 'НОВЬ', w / 2, 16, `bold 10px ${NARROW}`, '#2a2a2a');
      g.fillStyle = '#9a2a20'; g.fillRect(4, 22, w - 8, 1);
      for (let y = 26; y < h - 2; y += 3) { g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(4, y, w / 2 - 6, 1); g.fillRect(w / 2 + 2, y, w / 2 - 6 - Math.floor(r() * 6), 1); }
      g.fillStyle = 'rgba(60,60,60,0.6)'; g.fillRect(w / 2 + 2, 26, w / 2 - 6, 14);
    }, { seed: 155, repeat: false }),
    sack: paint(32, 32, (g, w, h, r) => {
      noiseFill(g, w, h, 156, [118, 128, 140], 10, 8, 1);
      label(g, 'ПОЧТА', w / 2, h / 2, `bold 9px ${NARROW}`, 'rgba(30,50,110,0.85)');
      dots(g, w, h, r, 30, ['rgba(0,0,0,0.2)']);
    }, { seed: 156, repeat: false }),
    sticker: paint(64, 32, (g, w, h) => {
      g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.fillRect(6, 9, 16, 12);
      g.fillStyle = BLUE; g.beginPath(); g.moveTo(6, 9); g.lineTo(14, 16); g.lineTo(22, 9); g.fill();
      label(g, 'ПОЧТА', 43, 16, `bold 11px ${NARROW}`, '#fff');
    }, { repeat: false }),
    icon: paint(32, 48, (g, w, h) => {
      g.fillStyle = '#b8902e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5a3a22'; g.fillRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#d8b04a'; g.beginPath(); g.arc(w / 2, 16, 7, 0, 7); g.fill();
      g.fillStyle = '#c8a07a'; g.beginPath(); g.arc(w / 2, 16, 4, 0, 7); g.fill();
      g.fillStyle = '#7a2a22'; g.fillRect(w / 2 - 6, 22, 12, 20);
    }, { repeat: false }),
    waybill: paint(64, 64, (g, w, h) => {
      g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ece6d4'; g.fillRect(4, 8, w - 8, h - 10);
      g.fillStyle = '#9a9a9a'; g.fillRect(w / 2 - 10, 2, 20, 8);
      label(g, 'ПУТЕВОЙ ЛИСТ', w / 2, 15, `bold 8px ${NARROW}`, '#2a2a2a');
      for (let y = 22; y < h - 4; y += 4) { g.fillStyle = 'rgba(40,60,120,0.5)'; g.fillRect(8, y, w - 16, 1); }
      g.strokeStyle = 'rgba(90,60,140,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(44, 46, 8, 0, 7); g.stroke();
    }, { repeat: false }),
    mirrorInner: paint(64, 32, (g, w, h) => {
      g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#9aa4ac'; g.fillRect(14, 8, 14, 12); g.fillRect(36, 8, 14, 12);
      g.fillStyle = '#4a4e52'; g.fillRect(0, 24, w, 8);
      g.fillStyle = '#5a6a7a'; g.fillRect(6, 22, 12, 6);
    }, { repeat: false }),
  };
  return T;
}

export type Textures = ReturnType<typeof createTextures>;
