/**
 * Number plates of Bashkortostan as they were in 1997: the new Russian plates of 1993
 * (ГОСТ Р 50577-93, region 02), the blue militia ones, and the Soviet plates of 1977
 * that many older cars still wore («а 12-34 БА», Bashkir ASSR series).
 * Only the twelve letters that read the same in Latin are used on the new plates.
 */
const LAT = 'АВЕКМНОРСТУХ';
/** Lower-case series letters of the Soviet plates. */
const SER = 'абвгдежклмнопрстуфхцчш';
/** Soviet region letters of the Bashkir ASSR. */
const BASH = ['БА', 'БШ'];

export type PlateKind = 'new' | 'militia' | 'soviet';

const rng = (seed: number) => {
  let s = (Math.abs(Math.floor(seed)) * 9301 + 49297) % 233280;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
};

export interface Plate { kind: PlateKind; main: string; region: string }

export function plateFor(seed: number, kind: PlateKind): Plate {
  const r = rng(seed);
  const L = () => LAT[Math.floor(r() * LAT.length)];
  const d = (n: number) => String(Math.floor(r() * 10 ** n)).padStart(n, '0');
  if (kind === 'militia') return { kind, main: `${L()} ${d(4)}`, region: '02' };
  if (kind === 'soviet') {
    const n = d(4);
    return { kind, main: `${SER[Math.floor(r() * SER.length)]} ${n.slice(0, 2)}-${n.slice(2)}`, region: BASH[Math.floor(r() * BASH.length)] };
  }
  const num = String(Math.floor(r() * 999) + 1).padStart(3, '0');
  return { kind, main: `${L()} ${num} ${L()}${L()}`, region: '02' };
}

/** Old cars still on Soviet plates in 1997: about a third of them. */
export const plateKindFor = (seed: number, old: boolean): PlateKind => (old && rng(seed * 7 + 3)() < 0.45 ? 'soviet' : 'new');

const FONT = (px: number) => `bold ${px}px "PT Sans Narrow", "Arial Narrow", sans-serif`;

/** Draw a plate into a canvas `w`×`h` (about 4.6 : 1). */
export function drawPlate(g: CanvasRenderingContext2D, p: Plate, w: number, h: number): void {
  const blue = p.kind === 'militia';
  const ink = blue ? '#f4f4ee' : '#141414';
  g.fillStyle = blue ? '#1d3f8a' : '#f2f0e8';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = ink; g.lineWidth = Math.max(1, h / 14); g.strokeRect(1, 1, w - 2, h - 2);
  g.fillStyle = ink; g.textBaseline = 'middle'; g.textAlign = 'center';
  const fit = (text: string, cx: number, cy: number, maxW: number, px: number) => {
    g.font = FONT(px);
    const k = Math.min(1, maxW / g.measureText(text).width);
    g.save(); g.translate(cx, cy); g.scale(k, 1); g.fillText(text, 0, 0); g.restore();
  };
  if (p.kind === 'soviet') {
    // one field: the series and number, then the region letters
    fit(`${p.main} ${p.region}`, w / 2, h * 0.54, w - h * 0.5, h * 0.78);
    return;
  }
  // number field, and the region field on the right: code over «RUS» and the flag
  const split = w * 0.77;
  fit(p.main, split / 2 + h * 0.05, h * 0.55, split - h * 0.45, h * 0.8);
  g.fillRect(split, h * 0.1, Math.max(1, h / 18), h * 0.8);
  const rx = split + (w - split) / 2;
  fit(p.region, rx, h * 0.36, (w - split) * 0.8, h * 0.5);
  fit('RUS', rx - (w - split) * 0.12, h * 0.78, (w - split) * 0.5, h * 0.24);
  const fx = rx + (w - split) * 0.12, fy = h * 0.68, fw = (w - split) * 0.24, fh = h * 0.2;
  g.fillStyle = '#ffffff'; g.fillRect(fx, fy, fw, fh / 3);
  g.fillStyle = '#2048a8'; g.fillRect(fx, fy + fh / 3, fw, fh / 3);
  g.fillStyle = '#c82820'; g.fillRect(fx, fy + (2 * fh) / 3, fw, fh / 3);
  g.strokeStyle = ink; g.lineWidth = 0.5; g.strokeRect(fx, fy, fw, fh);
}
