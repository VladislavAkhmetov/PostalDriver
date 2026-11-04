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

/**
 * A rural filling station of the 90s: one island along the road with a single tall two-sided pump,
 * a car filling on each side of it, nose to tail along the island; a small canopy on two posts,
 * a drive-through forecourt with a way in and a way out, the operator's brick booth with its pay
 * hatch behind, the fire board and the sand box. Local x runs along the road, +z towards it;
 * `edge` is the road's edge on local z.
 */
export function gasStation(b: Bucket, p: Place, sign: SignFn, cols: Collider[], edge = 13): void {
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
  // the pump's face, the same on both sides: grade lamp, the two mechanical counters, the pump's number
  const pumpFace = sign(tex(40, 80, (g, w, h) => {
    g.fillStyle = '#dcd8c8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c82a20'; g.fillRect(0, 0, w, 12);
    txt(g, 'А-76', w / 2, 6.5, `bold 9px ${NARROW}`, '#ffffff');
    for (const [y, label] of [[18, 'ЛИТРЫ'], [36, 'СУММА']] as [number, string][]) {
      g.fillStyle = '#1a1a1a'; g.fillRect(4, y, w - 8, 12);
      g.fillStyle = '#f0e6c0'; for (let i = 0; i < 5; i++) g.fillRect(6 + i * 6, y + 2, 5, 8);
      txt(g, label, w / 2, y + 15, `bold 5px ${SANS}`, '#3a3a38');
    }
    g.fillStyle = '#9a968a'; g.fillRect(0, 58, w, 2);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, 69, 7, 0, Math.PI * 2); g.fill();
    txt(g, '1', w / 2, 69.5, `bold 10px ${SANS}`, '#c82a20');
  }));
  const booth = sign(tex(64, 16, (g, w, h) => {
    g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, w, h);
    txt(g, 'ОПЕРАТОР', w / 2, h / 2 + 1, `bold 10px ${NARROW}`, '#1a1a1a');
  }));
  const hatch = sign(tex(48, 12, (g, w, h) => {
    g.fillStyle = '#1d4ea6'; g.fillRect(0, 0, w, h);
    txt(g, 'ОПЛАТА', w / 2, h / 2 + 1, `bold 8px ${NARROW}`, '#ffffff');
  }));
  const noSmoking = sign(tex(32, 32, (g, w, h) => {
    g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c82a20'; g.lineWidth = 3; g.beginPath(); g.arc(16, 12, 9, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(9.6, 5.6); g.lineTo(22.4, 18.4); g.stroke();
    g.fillStyle = '#1a1a1a'; g.fillRect(9, 11, 12, 2.5);
    txt(g, 'НЕ КУРИТЬ', w / 2, 27, `bold 6px ${NARROW}`, '#c82a20');
  }));
  const fireBoard = sign(tex(32, 32, (g, w, h) => {
    g.fillStyle = '#c82a20'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f0e8'; g.fillRect(2, 2, w - 4, 5);
    txt(g, 'ПОЖАРНЫЙ ЩИТ', w / 2, 4.8, `bold 3.6px ${SANS}`, '#c82a20');
    g.fillStyle = '#1a1a1a'; g.fillRect(5, 10, 2, 18); g.fillRect(3, 10, 6, 3);
    g.fillRect(13, 10, 2, 18); g.beginPath(); g.moveTo(11, 26); g.lineTo(17, 26); g.lineTo(14, 30); g.fill();
    g.fillStyle = '#e8e4d8'; g.beginPath(); g.moveTo(21, 12); g.lineTo(29, 12); g.lineTo(27, 22); g.lineTo(23, 22); g.fill();
  }));

  const A = '#b8b8b2', K = '#b4b0a6';
  const slab = (x: number, z: number, w: number, d: number) => b.add('asphalt', boxGeo(w, 1, d, 4), T(p, x, -0.35, z), A);
  // forecourt, and the two mouths to the road: in at one end, out at the other
  const D = 6.5, HW = 15, mouth = 6;
  slab(0, 0, HW * 2, D * 2);
  const mz0 = D, mz1 = edge + 0.4;
  for (const sx of [-1, 1]) slab(sx * (HW - mouth / 2), (mz0 + mz1) / 2, mouth, mz1 - mz0);
  // kerbs round the forecourt: the back, the ends, and the strip of grass between the two mouths
  b.add('concrete', boxGeo(HW * 2 + 0.4, 0.3, 0.3), T(p, 0, 0.1, -D - 0.15), K);
  for (const sx of [-1, 1]) {
    b.add('concrete', boxGeo(0.3, 0.3, D * 2 + (mz1 - mz0)), T(p, sx * (HW + 0.15), 0.1, (mz1 - D) / 2 - 0.2), K);
    b.add('concrete', boxGeo(0.3, 0.3, mz1 - mz0), T(p, sx * (HW - mouth - 0.15), 0.1, (mz0 + mz1) / 2), K);
  }
  b.add('concrete', boxGeo((HW - mouth) * 2, 0.3, 0.3), T(p, 0, 0.1, D + 0.15), K);
  // lane lines along the island and arrows: in on the left, out on the right
  for (const z of [5.0, -5.0]) b.add('flat', boxGeo(18, 0.02, 0.12), T(p, 0, 0.155, z), '#e8e4d0');
  for (const z of [1.25, -1.25]) for (const sx of [-1, 1]) b.add('flat', boxGeo(0.12, 0.02, 0.8), T(p, sx * 3.6, 0.155, z * 2.2), '#e8d24a');
  for (const [x, z] of [[-11, 2.9], [11, 2.9], [-11, -2.9], [11, -2.9]] as [number, number][]) {
    b.add('flat', boxGeo(1.6, 0.02, 0.22), T(p, x, 0.155, z), '#e8e4d0');
    b.add('flat', new THREE.CylinderGeometry(0.5, 0.5, 0.02, 3), T(p, x + 1.0, 0.155, z, 0, 0, 0), '#e8e4d0');
  }

  // the island: one tall two-sided pump in the middle, a hose and nozzle on each side
  b.add('concrete', boxGeo(9, 0.22, 1.2), T(p, 0, 0.23, 0), '#c8c4b8');
  b.add('flat', boxGeo(9.1, 0.06, 1.3), T(p, 0, 0.36, 0), '#e8d24a');
  b.add('flat', boxGeo(0.95, 0.25, 0.6), T(p, 0, 0.47, 0), '#5a5a58');
  b.add('flat', boxGeo(0.9, 1.75, 0.52), T(p, 0, 1.47, 0), '#e2ded0');
  b.add('flat', boxGeo(0.94, 0.3, 0.56), T(p, 0, 2.48, 0), '#c82a20');
  for (const side of [1, -1]) {
    b.add(pumpFace, planeGeo(0.8, 1.6), T(p, 0, 1.45, side * 0.265, 0, side < 0 ? Math.PI : 0, 0));
    // hose from the cabinet's shoulder down to the nozzle hung in its holster
    b.add('flat', new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), T(p, side * 0.52, 1.25, side * 0.12, 0.25 * side, 0, 0.15 * side), '#1a1a1a');
    b.add('flat', boxGeo(0.06, 0.16, 0.2), T(p, side * 0.5, 1.05, side * 0.27), '#3a3a38');
  }
  cols.push(boxCollider(p, 0, 0, 9, 1.2));
  // fire extinguisher and a "no smoking" sign at the island's ends
  b.add('flat', new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), T(p, -4.1, 0.6, 0.3), '#c82a20');
  b.add('flat', boxGeo(0.05, 1.5, 0.05), T(p, 4.2, 1.1, 0), '#5a5a58');
  b.add(noSmoking, planeGeo(0.4, 0.4), T(p, 4.2, 1.9, 0.03));
  b.add(noSmoking, planeGeo(0.4, 0.4), T(p, 4.2, 1.9, -0.03, 0, Math.PI, 0));

  // a modest canopy on two posts standing on the island
  for (const x of [-3.6, 3.6]) b.add('concrete', boxGeo(0.25, 4.3, 0.25), T(p, x, 2.5, 0), '#d8d4c8');
  b.add('plaster', boxGeo(11, 0.45, 8.6), T(p, 0, 4.8, 0), '#e8e4da');
  b.add('flat', boxGeo(10.6, 0.05, 8.2), T(p, 0, 4.55, 0), '#f0ecd8');
  b.add(band, planeGeo(11, 0.45), T(p, 0, 4.8, 4.31));
  b.add(band, planeGeo(11, 0.45), T(p, 0, 4.8, -4.31, 0, Math.PI, 0));

  // the operator's booth behind the forecourt, its pay hatch facing the pump
  const bz = -D - 2.2;
  b.add('brickWhite', boxGeo(4.2, 2.7, 3, 2), T(p, -6, 1.35, bz), '#e4ded0');
  b.add('slate', boxGeo(4.6, 0.12, 3.4), T(p, -6, 2.76, bz, 0.06, 0, 0), '#8a8a84');
  b.add('bigWin', planeGeo(1.1, 0.8), T(p, -5.4, 1.45, bz + 1.51));
  b.add('flat', boxGeo(1.2, 0.06, 0.25), T(p, -5.4, 1.02, bz + 1.6), '#5a5a58');
  for (let i = 0; i < 4; i++) b.add('flat', boxGeo(0.03, 0.8, 0.03), T(p, -5.85 + i * 0.3, 1.45, bz + 1.53), '#2a2a28');
  b.add(hatch, planeGeo(0.7, 0.18), T(p, -5.4, 0.85, bz + 1.52));
  b.add('door', planeGeo(0.9, 2), T(p, -7.4, 1.0, bz + 1.51));
  b.add(booth, planeGeo(1.6, 0.4), T(p, -6, 2.35, bz + 1.52));
  b.add(fireBoard, planeGeo(1.1, 1.1), T(p, -3.88, 1.3, bz, 0, Math.PI / 2, 0));
  cols.push(boxCollider(p, -6, bz, 4.2, 3));
  // sand box with its scoop, and fuel drums by the booth
  b.add('boards', boxGeo(1.1, 0.55, 0.7), T(p, -2.6, 0.28, bz + 0.6), '#c83a2a');
  b.add('flat', boxGeo(1.12, 0.04, 0.72), T(p, -2.6, 0.57, bz + 0.6), '#a83020');
  for (let i = 0; i < 3; i++) b.add('rust', new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), T(p, -9 - i * 0.65, 0.45, bz + 0.3), i === 1 ? '#5a7a4a' : '#7a3a2a');
  cols.push(boxCollider(p, -2.6, bz + 0.6, 1.1, 0.7));

  // tall price board on the grass between the two mouths, facing the road
  const pz = (mz0 + mz1) / 2 + 1;
  b.add('flat', boxGeo(0.15, 4.6, 0.15), T(p, 0, 2.3, pz), '#5a5a58');
  b.add(prices, planeGeo(1.6, 2.4), T(p, 0, 4.2, pz + 0.05));
  b.add('flat', boxGeo(1.6, 2.4, 0.06), T(p, 0, 4.2, pz), '#3a3a38');
  cols.push(boxCollider(p, 0, pz, 0.3, 0.3));
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
    txt(g, 'РАССАДА', w / 2, 11, `bold 11px ${NARROW}`, '#2a2a2a');
    txt(g, 'ЗЕЛЕНЬ', w / 2, 24, `bold 11px ${NARROW}`, '#2a6a20');
  }));
  // May–June: stool, buckets of seed potatoes, radishes and spring onions, a basket of greens, three-litre jars
  b.add('planks', boxGeo(0.4, 0.04, 0.4), T(p, -0.6, 0.45, -0.3), '#a89878');
  for (const sx of [-0.15, 0.15]) for (const sz of [-0.15, 0.15]) b.add('flat', boxGeo(0.03, 0.45, 0.03), T(p, -0.6 + sx, 0.22, -0.3 + sz), '#5c5040');
  const r = [0.2, 0.7, 0.45, 0.9];
  for (let i = 0; i < 3; i++) {
    const x = 0.2 + i * 0.45;
    b.add('flat', new THREE.CylinderGeometry(0.17, 0.13, 0.3, 9, 1, true), T(p, x, 0.15, 0.1), i === 1 ? '#5a7aa0' : '#8a8a86');
    for (let k = 0; k < 6; k++) b.add('flat', new THREE.SphereGeometry(0.06, 5, 3), T(p, x + Math.cos(k + r[i]) * 0.08, 0.3, 0.1 + Math.sin(k * 1.7) * 0.08), ['#b8945a', '#c43a48', '#5a9a3a'][i]);
  }
  b.add('flat', new THREE.CylinderGeometry(0.22, 0.17, 0.2, 9, 1, true), T(p, 1.6, 0.1, 0.0), '#8a6a3a');
  for (let k = 0; k < 7; k++) b.add('flat', new THREE.SphereGeometry(0.05, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2), T(p, 1.6 + Math.cos(k) * 0.1, 0.2, Math.sin(k) * 0.1), k % 3 ? '#4f8a34' : '#6aa040');
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
