import * as THREE from 'three';
import { Bucket, boxGeo, gableRoof, planeGeo } from '../core/geom';
import { paint, NARROW, SANS } from '../core/textures';
import { boxCollider, Collider, Place, T } from './Props';

/** Turns a canvas texture into a World material key. */
export type SignFn = (tex: THREE.Texture) => string;

type Ctx = CanvasRenderingContext2D;
const txt = (g: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center') => {
  g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
};
const tex = (w: number, h: number, fn: (g: Ctx, w: number, h: number) => void) => paint(w, h, (g) => fn(g, w, h), { repeat: false });

// ------------------------------------------------------------ town stela

/** Concrete entrance stela: raised letters on the town side, a farewell on the back. */
export function stela(b: Bucket, p: Place, sign: SignFn, cols: Collider[]): void {
  const front = sign(tex(256, 64, (g, w, h) => {
    g.fillStyle = '#c8c4b8'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h);
    // emblem: gear rim and wheat ears
    g.strokeStyle = '#b8322c'; g.lineWidth = 5; g.beginPath(); g.arc(30, 32, 18, 0, 7); g.stroke();
    g.fillStyle = '#d8a83a'; for (let i = 0; i < 5; i++) { g.fillRect(22 + i * 4, 18 + Math.abs(2 - i) * 3, 3, 26 - Math.abs(2 - i) * 4); }
    txt(g, 'КЛЮЧЕВСК', 150, 34, `bold 38px ${NARROW}`, '#a82a22');
    txt(g, 'КЛЮЧЕВСК', 148, 32, `bold 38px ${NARROW}`, '#e8e2d2');
  }));
  const back = sign(tex(256, 64, (g, w, h) => {
    g.fillStyle = '#c8c4b8'; g.fillRect(0, 0, w, h);
    txt(g, 'СЧАСТЛИВОГО ПУТИ!', w / 2, 33, `bold 28px ${NARROW}`, '#2a4a8a');
  }));
  b.add('concrete', boxGeo(9.2, 0.6, 2.2), T(p, 0, 0.0, 0), '#a8a49a');
  b.add('concrete', boxGeo(1.0, 4.4, 0.9, 2), T(p, -3.6, 2.4, 0), '#d0ccc0');
  b.add('concrete', boxGeo(8.2, 2.0, 0.55, 2), T(p, 0.4, 3.0, 0), '#d0ccc0');
  b.add(front, planeGeo(7.8, 1.95), T(p, 0.4, 3.0, 0.28));
  b.add(back, planeGeo(7.8, 1.95), T(p, 0.4, 3.0, -0.28, 0, Math.PI, 0));
  // red star on the pillar top and a flower bed in front
  b.add('flat', new THREE.CylinderGeometry(0.55, 0.55, 0.12, 5), T(p, -3.6, 4.95, 0, Math.PI / 2, 0, 0), '#c02a20');
  b.add('flat', boxGeo(6, 0.3, 1.2), T(p, 0.4, 0.15, 1.8), '#5a4632');
  for (let i = 0; i < 12; i++) b.add('flat', boxGeo(0.25, 0.3, 0.25), T(p, -2.2 + i * 0.4, 0.4, 1.8 + (i % 2) * 0.3), i % 3 ? '#c84a3a' : '#e8c84a');
  cols.push(boxCollider(p, 0, 0, 9.2, 2.2));
}

// ------------------------------------------------------------ GAI post

const stripes = () => tex(64, 8, (g, _w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f0ece4' : '#c82a20'; g.fillRect(i * 8, 0, 8, h); }
});

export function gaiPost(b: Bucket, p: Place, sign: SignFn, cols: Collider[]): void {
  const gai = sign(tex(128, 32, (g, w, h) => {
    g.fillStyle = '#1d4ea6'; g.fillRect(0, 0, w, h);
    txt(g, 'ПОСТ ГАИ', w / 2, h / 2 + 1, `bold 22px ${NARROW}`, '#ffffff');
  }));
  // glazed control cabin on a concrete column
  b.add('concrete', boxGeo(1.6, 3.2, 1.6, 2), T(p, 0, 1.6, 0), '#c8c4b8');
  b.add('plaster', boxGeo(4.2, 0.3, 3.6), T(p, 0, 3.3, 0), '#d8d4c8');
  b.add('flat', boxGeo(4.0, 2.0, 3.4), T(p, 0, 4.4, 0), '#3a4a58');
  for (const x of [-2, -0.67, 0.67, 2]) b.add('flat', boxGeo(0.1, 2.0, 3.45), T(p, x, 4.4, 0), '#e8e4da');
  for (const z of [-1.7, 1.7]) b.add('flat', boxGeo(4.05, 0.1, 0.1), T(p, 0, 3.45 + (z > 0 ? 0 : 1.95), z), '#e8e4da');
  b.add('plaster', boxGeo(4.6, 0.35, 4.0), T(p, 0, 5.55, 0), '#e8e4da');
  b.add(gai, planeGeo(3.6, 0.9), T(p, 0, 6.2, 0.4));
  b.add('flat', boxGeo(3.6, 0.9, 0.06), T(p, 0, 6.2, 0.35), '#d8d8d0');
  // stairs to the cabin
  for (let i = 0; i < 10; i++) b.add('concrete', boxGeo(1.0, 0.12, 0.35), T(p, 1.4, 0.15 + i * 0.32, -1.0 - i * 0.18), '#a8a49a');
  b.add('flat', boxGeo(0.05, 3.4, 0.05), T(p, 1.9, 1.8, -1.9, 0.5, 0, 0), '#3a3a38');
  cols.push(boxCollider(p, 0, 0, 2.2, 2.4));
  // concrete blocks along the lay-by
  for (const z of [-6, -3, 6]) b.add('concrete', boxGeo(1.0, 0.6, 1.6), T(p, -3, 0.3, z), '#b8b4aa');
}

/** Striped barrier arm (static), pivot at the post. */
export function barrierArm(b: Bucket, p: Place, len: number, angle: number, sign: SignFn): void {
  const key = sign(stripes());
  b.add('flat', boxGeo(0.25, 1.1, 0.25), T(p, 0, 0.55, 0), '#e8e4da');
  b.add('flat', boxGeo(0.4, 0.3, 0.4), T(p, 0, 1.0, 0), '#3a3a38');
  const g = boxGeo(len, 0.14, 0.1);
  g.translate(len / 2, 0, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 4));
  b.add(key, g, T(p, 0, 1.05, 0, 0, 0, angle));
}

// ------------------------------------------------------------ AZS

export function gasStation(b: Bucket, p: Place, sign: SignFn, cols: Collider[]): void {
  const band = sign(tex(128, 16, (g, w, h) => {
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c82a20'; g.fillRect(0, h - 4, w, 4);
    txt(g, 'А З С', w / 2, 7, `bold 12px ${SANS}`, '#1d4ea6');
  }));
  const prices = sign(tex(64, 96, (g, w, h) => {
    g.fillStyle = '#1d4ea6'; g.fillRect(0, 0, w, h);
    txt(g, 'АЗС', w / 2, 13, `bold 18px ${NARROW}`, '#ffffff');
    g.fillStyle = '#f2f0e8'; g.fillRect(4, 26, w - 8, h - 30);
    [['А-76', '2100'], ['А-92', '2650'], ['ДТ', '1900']].forEach(([n, v], i) => {
      txt(g, n, 8, 38 + i * 20, `bold 11px ${NARROW}`, '#1a1a1a', 'left');
      txt(g, v, w - 8, 38 + i * 20, `bold 11px ${NARROW}`, '#b8281e', 'right');
    });
  }));
  const pumpFace = sign(tex(32, 64, (g, w, h) => {
    g.fillStyle = '#d8d4c4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a1a'; g.fillRect(4, 6, w - 8, 18);
    g.fillStyle = '#e8c84a'; for (let i = 0; i < 4; i++) g.fillRect(6 + i * 5, 10, 4, 6);
    g.fillStyle = '#c82a20'; g.fillRect(0, 30, w, 8);
    txt(g, '76', w / 2, 34.5, `bold 8px ${SANS}`, '#ffffff');
  }));
  const kassa = sign(tex(64, 16, (g, w, h) => {
    g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, w, h);
    txt(g, 'КАССА', w / 2, h / 2 + 1, `bold 11px ${NARROW}`, '#1a1a1a');
  }));
  // forecourt slab, canopy on four columns
  b.add('concrete', boxGeo(18, 0.2, 12), T(p, 0, 0.05, -1), '#a8a49c');
  for (const x of [-4.5, 4.5]) for (const z of [-3, 1.5]) {
    b.add('concrete', boxGeo(0.35, 4.6, 0.35), T(p, x, 2.4, z), '#d8d4c8');
    cols.push(boxCollider(p, x, z, 0.4, 0.4));
  }
  b.add('plaster', boxGeo(11, 0.5, 6.5), T(p, 0, 4.85, -0.75), '#e8e4da');
  b.add(band, planeGeo(11, 0.5), T(p, 0, 4.85, 2.53));
  b.add('flat', boxGeo(10.6, 0.05, 6.1), T(p, 0, 4.58, -0.75), '#f0ecd8');
  // three pumps on an island
  b.add('concrete', boxGeo(7, 0.25, 1.2), T(p, 0, 0.25, -0.75), '#c8c4b8');
  for (const x of [-2.4, 0, 2.4]) {
    b.add('flat', boxGeo(0.8, 1.7, 0.55), T(p, x, 1.2, -0.75), '#e0dccc');
    b.add(pumpFace, planeGeo(0.7, 1.4), T(p, x, 1.2, -0.47));
    b.add('flat', new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), T(p, x + 0.45, 1.1, -0.6, 0.3, 0, 0), '#1a1a1a');
  }
  cols.push(boxCollider(p, 0, -0.75, 7, 1.2));
  // cashier kiosk with a window and its sign
  b.add('plaster', boxGeo(5, 3, 3.6, 2), T(p, 0, 1.5, -6.5), '#d8e0e4');
  b.add('slate', boxGeo(5.4, 0.12, 4), T(p, 0, 3.05, -6.5), '#8a8a84');
  b.add('bigWin', planeGeo(2, 1.2), T(p, 1, 1.6, -4.68));
  b.add('door', planeGeo(1, 2), T(p, -1.4, 1.0, -4.68));
  b.add(kassa, planeGeo(1.4, 0.35), T(p, 1, 2.5, -4.67));
  cols.push(boxCollider(p, 0, -6.5, 5, 3.6));
  // tall price board by the road
  b.add('flat', boxGeo(0.15, 4.6, 0.15), T(p, 7.8, 2.3, 4.6), '#5a5a58');
  b.add(prices, planeGeo(1.6, 2.4), T(p, 7.8, 4.2, 4.7));
  b.add('flat', boxGeo(1.6, 2.4, 0.06), T(p, 7.8, 4.2, 4.65), '#3a3a38');
  cols.push(boxCollider(p, 7.8, 4.6, 0.3, 0.3));
  // fuel drums and a sand box
  for (let i = 0; i < 3; i++) b.add('rust', new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), T(p, -7.5 + i * 0.65, 0.5, -4), i === 1 ? '#5a7a4a' : '#7a3a2a');
  b.add('boards', boxGeo(1.2, 0.6, 0.8), T(p, -7.4, 0.35, -2.4), '#c83a2a');
}

// ------------------------------------------------------------ café / truck stop

/** Roadside café with a mangal; returns the smoke vent position. */
export function cafe(b: Bucket, p: Place, sign: SignFn, cols: Collider[]): THREE.Vector3 {
  const name = sign(tex(128, 32, (g, w, h) => {
    g.fillStyle = '#7a2a20'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8c84a'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
    txt(g, 'КАФЕ «ДОРОЖНОЕ»', w / 2, h / 2 + 1, `bold 15px ${NARROW}`, '#f2e8c8');
  }));
  const menu = sign(tex(64, 48, (g, w, h) => {
    g.fillStyle = '#f0ead8'; g.fillRect(0, 0, w, h);
    txt(g, 'ШАШЛЫК', w / 2, 10, `bold 12px ${NARROW}`, '#b8281e');
    txt(g, 'ПЕЛЬМЕНИ', w / 2, 24, `bold 10px ${NARROW}`, '#1a1a1a');
    txt(g, 'ЧАЙ · КОФЕ', w / 2, 37, `bold 9px ${NARROW}`, '#1a1a1a');
  }));
  const W = 11, D = 7, H = 3.2;
  b.add('concrete', boxGeo(W + 0.4, 0.6, D + 0.4), T(p, 0, 0, 0), '#a8a49a');
  b.add('boards', boxGeo(W, H, D, 2), T(p, 0, H / 2 + 0.2, 0), '#c8b890');
  const { roof, gables } = gableRoof(D, W, 1.6, 0.6);
  b.add('metalRoof', roof, T(p, 0, H + 0.2, 0, 0, Math.PI / 2, 0), '#4f7a5a');
  b.add('boards', gables, T(p, 0, H + 0.2, 0, 0, Math.PI / 2, 0), '#c8b890');
  b.add(name, planeGeo(6, 1.5), T(p, 0, H + 0.9, D / 2 + 0.32));
  for (const x of [-3.5, 3.5]) b.add('bigWinLit', planeGeo(2.2, 1.4), T(p, x, 1.8, D / 2 + 0.02));
  b.add('door', planeGeo(1.2, 2.2), T(p, 0, 1.3, D / 2 + 0.02));
  // veranda with plastic tables and parasols
  b.add('planks', boxGeo(W, 0.15, 3.2, 1), T(p, 0, 0.3, D / 2 + 1.6), '#9a8a6a');
  for (const x of [-3.5, 0.2, 3.6]) {
    b.add('flat', new THREE.CylinderGeometry(0.45, 0.45, 0.04, 10), T(p, x, 1.1, D / 2 + 1.8), '#e8e8e0');
    b.add('flat', new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), T(p, x, 1.5, D / 2 + 1.8), '#e8e8e0');
    b.add('flat', new THREE.ConeGeometry(1.3, 0.5, 8, 1, true), T(p, x, 2.75, D / 2 + 1.8), x > 0 ? '#c83a2a' : '#e8e0c8');
    for (const s of [-1, 1]) b.add('flat', boxGeo(0.4, 0.45, 0.4), T(p, x + s * 0.7, 0.6, D / 2 + 1.8), '#e8e8e0');
  }
  // mangal: a steel trough on legs with skewers, the menu board beside it
  const mx = -W / 2 - 1.8, mz = D / 2 + 1.0;
  b.add('rust', boxGeo(1.2, 0.3, 0.4), T(p, mx, 0.85, mz), '#3a3430');
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.15, 0.15]) b.add('flat', boxGeo(0.04, 0.7, 0.04), T(p, mx + sx, 0.35, mz + sz), '#2a2a28');
  b.add('flat', boxGeo(1.0, 0.04, 0.3), T(p, mx, 1.02, mz), '#c8582a');
  for (let i = 0; i < 5; i++) b.add('flat', boxGeo(0.02, 0.02, 0.6), T(p, mx - 0.4 + i * 0.2, 1.06, mz), '#9a9a94');
  b.add('flat', boxGeo(0.06, 1.6, 0.06), T(p, mx + 1.2, 0.8, mz + 0.8), '#4a3a2a');
  b.add(menu, planeGeo(1.0, 0.75), T(p, mx + 1.2, 1.5, mz + 0.84));
  cols.push(boxCollider(p, 0, 0, W + 0.4, D + 0.4));
  cols.push(boxCollider(p, mx, mz, 1.3, 0.6));
  // gravel lot with a lean-to and a trash bin
  b.add('concrete', boxGeo(1, 1, 1), T(p, W / 2 + 1.2, 0.5, D / 2 + 0.5), '#5a6a5a');
  const v = new THREE.Vector3().setFromMatrixPosition(T(p, mx, 1.15, mz));
  return v;
}

// ------------------------------------------------------------ billboards

export type BillboardText = { lines: string[]; bg: string; fg: string; accent?: string };

export const BILLBOARDS: BillboardText[] = [
  { lines: ['ШИНОМОНТАЖ', 'ВУЛКАНИЗАЦИЯ', '24 ЧАСА · 500 м'], bg: '#e8c84a', fg: '#1a1a1a', accent: '#b8281e' },
  { lines: ['ОКНА ПВХ', 'тёплые · недорого', 'тел. 2-14-37'], bg: '#f0f0ea', fg: '#1d4ea6', accent: '#1d4ea6' },
  { lines: ['МЁД', 'с пасеки', 'направо 2 км →'], bg: '#d8a83a', fg: '#3a2010', accent: '#7a3a10' },
  { lines: ['КАРТОФЕЛЬ', 'оптом и в розницу', 'совхоз «Рассвет»'], bg: '#5a7a3a', fg: '#f2ecd8', accent: '#e8c84a' },
  { lines: ['БЕРЕГИТЕ ЛЕС', 'ОТ ПОЖАРА!'], bg: '#2a5a2a', fg: '#f2ecd8', accent: '#c83a2a' },
];

export function billboardTex(t: BillboardText): THREE.Texture {
  return tex(128, 64, (g, w, h) => {
    g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
    g.fillStyle = t.accent ?? t.fg; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
    const n = t.lines.length;
    t.lines.forEach((l, i) => {
      const big = i === 0;
      txt(g, l, w / 2, (h / (n + 0.6)) * (i + 0.8), `bold ${big ? 20 : 11}px ${NARROW}`, big ? (t.accent ?? t.fg) : t.fg);
    });
    // weathering: peeling streaks
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 9; i++) g.fillRect((i * 37) % w, (i * 19) % h, 6, 1);
  });
}

export function billboard(b: Bucket, p: Place, key: string, w = 6, h = 3, height = 2.4): Collider[] {
  for (const x of [-w * 0.35, w * 0.35]) b.add('boards', boxGeo(0.18, height + h, 0.18), T(p, x, (height + h) / 2, -0.12), '#6a5a44');
  b.add('boards', boxGeo(w + 0.2, h + 0.2, 0.08), T(p, 0, height + h / 2, -0.08), '#8a7a62');
  b.add(key, planeGeo(w, h), T(p, 0, height + h / 2, 0));
  return [boxCollider(p, -w * 0.35, -0.12, 0.3, 0.3), boxCollider(p, w * 0.35, -0.12, 0.3, 0.3)];
}

// ------------------------------------------------------------ babushka's stall

export function vendorStall(b: Bucket, p: Place, sign: SignFn): void {
  const card = sign(tex(64, 32, (g, w, h) => {
    g.fillStyle = '#c4a878'; g.fillRect(0, 0, w, h);
    txt(g, 'КАРТОШКА', w / 2, 11, `bold 11px ${NARROW}`, '#2a2a2a');
    txt(g, 'ГРИБЫ', w / 2, 24, `bold 11px ${NARROW}`, '#7a2a20');
  }));
  // stool, buckets of potatoes, a basket of mushrooms, three-litre jars
  b.add('planks', boxGeo(0.4, 0.04, 0.4), T(p, -0.6, 0.45, -0.3), '#a89878');
  for (const sx of [-0.15, 0.15]) for (const sz of [-0.15, 0.15]) b.add('flat', boxGeo(0.03, 0.45, 0.03), T(p, -0.6 + sx, 0.22, -0.3 + sz), '#5c5040');
  const r = [0.2, 0.7, 0.45, 0.9];
  for (let i = 0; i < 3; i++) {
    const x = 0.2 + i * 0.45;
    b.add('flat', new THREE.CylinderGeometry(0.17, 0.13, 0.3, 9, 1, true), T(p, x, 0.15, 0.1), i === 1 ? '#5a7aa0' : '#8a8a86');
    for (let k = 0; k < 6; k++) b.add('flat', new THREE.SphereGeometry(0.06, 5, 3), T(p, x + Math.cos(k + r[i]) * 0.08, 0.3, 0.1 + Math.sin(k * 1.7) * 0.08), '#b8945a');
  }
  b.add('flat', new THREE.CylinderGeometry(0.22, 0.17, 0.2, 9, 1, true), T(p, 1.6, 0.1, 0.0), '#8a6a3a');
  for (let k = 0; k < 7; k++) b.add('flat', new THREE.SphereGeometry(0.05, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2), T(p, 1.6 + Math.cos(k) * 0.1, 0.2, Math.sin(k) * 0.1), '#7a4a22');
  for (let k = 0; k < 2; k++) b.add('flat', new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8), T(p, -0.1 + k * 0.2, 0.13, 0.45), k ? '#c83a2a' : '#5a7a3a');
  // cardboard sign propped on a stick
  b.add('flat', boxGeo(0.03, 1.1, 0.03), T(p, 0.6, 0.55, 0.45), '#4a3a2a');
  b.add(card, planeGeo(0.7, 0.35), T(p, 0.6, 1.0, 0.47));
}

// ------------------------------------------------------------ railway crossing booth

export function crossingBooth(b: Bucket, p: Place, sign: SignFn, cols: Collider[]): void {
  const plate = sign(tex(64, 16, (g, w, h) => {
    g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, w, h);
    txt(g, 'ПЕРЕЕЗД', w / 2, h / 2 + 1, `bold 11px ${NARROW}`, '#1a1a1a');
  }));
  b.add('brickRed', boxGeo(2.6, 2.5, 2.6, 2), T(p, 0, 1.25, 0));
  const { roof } = gableRoof(2.6, 2.6, 0.9, 0.3);
  b.add('metalRoof', roof, T(p, 0, 2.5, 0), '#5a6a5a');
  b.add('bigWinLit', planeGeo(1.2, 0.9), T(p, 0, 1.6, 1.32));
  b.add('door', planeGeo(0.8, 1.9), T(p, 1.32, 0.95, 0, 0, Math.PI / 2, 0));
  b.add(plate, planeGeo(1.4, 0.35), T(p, 0, 2.3, 1.33));
  cols.push(boxCollider(p, 0, 0, 2.6, 2.6));
}

// ------------------------------------------------------------ horizon industry

export function grainElevator(b: Bucket, p: Place, cols: Collider[]): void {
  for (let i = 0; i < 6; i++) b.add('concrete', new THREE.CylinderGeometry(3, 3, 26, 12), T(p, -16 + i * 6.1, 13, 0), '#d0ccc0');
  b.add('concrete', boxGeo(37, 3, 6.4), T(p, 0.25, 27.5, 0), '#c4c0b4');
  b.add('concrete', boxGeo(8, 40, 8, 4), T(p, 22, 20, 0), '#d8d4c8');
  b.add('concrete', boxGeo(6, 6, 6), T(p, 22, 43, 0), '#c4c0b4');
  for (let y = 6; y < 40; y += 4) b.add('flat', boxGeo(8.1, 0.6, 1.2), T(p, 22, y, 3.5), '#2a2a2a');
  b.add('rust', boxGeo(1.2, 1.2, 30), T(p, 6, 30, 10, 0.75, 0, 0), '#7a5a3a');
  cols.push(boxCollider(p, 2, 0, 46, 8));
}

export function chimney(b: Bucket, p: Place, h = 52): void {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const r0 = 2.6 - (i / n) * 1.4, r1 = 2.6 - ((i + 1) / n) * 1.4;
    b.add('flat', new THREE.CylinderGeometry(r1, r0, h / n, 10, 1, true), T(p, 0, (i + 0.5) * (h / n), 0), i % 2 ? '#e8e4da' : '#b8322c');
  }
  b.add('brickRed', boxGeo(16, 9, 12, 3), T(p, 10, 4.5, 0));
}

/** Lattice high-voltage pylon; returns the three wire attachment points. */
export function pylon(b: Bucket, p: Place): THREE.Vector3[] {
  const H = 26, base = 3.2, top = 0.9;
  const C = '#7a7e7a';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lean = Math.atan2(base - top, H);
    b.add('flat', boxGeo(0.14, H / Math.cos(lean), 0.14), T(p, sx * (base + top) / 2, H / 2, sz * (base + top) / 2, -sz * lean, 0, sx * lean), C);
  }
  // cross-bracing at a few levels
  for (let k = 0; k < 6; k++) {
    const y = 2 + k * 4, w = base - (base - top) * (y / H);
    for (const s of [-1, 1]) {
      b.add('flat', boxGeo(w * 2, 0.08, 0.08), T(p, 0, y, s * w), C);
      b.add('flat', boxGeo(0.08, 0.08, w * 2), T(p, s * w, y, 0), C);
      b.add('flat', boxGeo(w * 2.6, 0.06, 0.06), T(p, 0, y + 2, s * w, 0, 0, s * 0.8), C);
    }
  }
  b.add('flat', boxGeo(13, 0.3, 0.3), T(p, 0, H - 4, 0), C);
  b.add('flat', boxGeo(7, 0.3, 0.3), T(p, 0, H, 0), C);
  const pts: THREE.Vector3[] = [];
  for (const [x, y] of [[-6, H - 5.4], [6, H - 5.4], [0, H - 1.4]]) {
    b.add('flat', boxGeo(0.12, 1.3, 0.12), T(p, x, y + 0.7, 0), '#c8d0c8');
    pts.push(new THREE.Vector3().setFromMatrixPosition(T(p, x, y, 0)));
  }
  return pts;
}
