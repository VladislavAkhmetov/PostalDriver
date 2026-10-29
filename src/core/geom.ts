import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Box whose UVs are scaled in meters so tiled textures keep their density. */
export function boxGeo(w: number, h: number, d: number, tile = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < 24; i++) {
    const f = Math.floor(i / 4);
    let su: number, sv: number;
    if (f < 2) { su = d; sv = h; } else if (f < 4) { su = w; sv = d; } else { su = w; sv = h; }
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return g;
}

export function planeGeo(w: number, h: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** Gable roof with the ridge along Z. Returns slopes and the two gable triangles. */
export function gableRoof(w: number, d: number, rise: number, over: number, tile = 2): { roof: THREE.BufferGeometry; gables: THREE.BufferGeometry } {
  const hw = w / 2 + over, hd = d / 2 + over;
  const slope = Math.hypot(hw, rise);
  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], e: number[], ua: number[], ub: number[], uc: number[], ue: number[]) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...e);
    uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ue);
  };
  // left slope (-x)
  quad([-hw, 0, hd], [0, rise, hd], [0, rise, -hd], [-hw, 0, -hd], [0, 0], [0, slope / tile], [(2 * hd) / tile, slope / tile], [(2 * hd) / tile, 0]);
  // right slope (+x)
  quad([hw, 0, -hd], [0, rise, -hd], [0, rise, hd], [hw, 0, hd], [0, 0], [0, slope / tile], [(2 * hd) / tile, slope / tile], [(2 * hd) / tile, 0]);
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roof.computeVertexNormals();

  const gw = w / 2, gd = d / 2;
  const gp = [-gw, 0, gd, gw, 0, gd, 0, rise, gd, gw, 0, -gd, -gw, 0, -gd, 0, rise, -gd];
  const gu = [0, 0, w / tile, 0, w / (2 * tile), rise / tile, 0, 0, w / tile, 0, w / (2 * tile), rise / tile];
  const gables = new THREE.BufferGeometry();
  gables.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  gables.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
  gables.computeVertexNormals();
  return { roof, gables };
}

/** n vertical quads crossing at the centre; base at y=0, unit size. Normals point up for flat, baked foliage light. */
export function crossQuads(n = 3): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 0, -cz, cx, 1, cz, -cx, 1, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

const KEEP = ['position', 'normal', 'uv', 'color'];

export function prepGeo(g: THREE.BufferGeometry, m?: THREE.Matrix4, color?: THREE.ColorRepresentation): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  if (m) geo.applyMatrix4(m);
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const c = new THREE.Color(color ?? 0xffffff);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(geo.attributes)) if (!KEEP.includes(k)) geo.deleteAttribute(k);
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

/** Collects static geometry by material key and merges it into a handful of draw calls. */
export class Bucket {
  private parts = new Map<string, THREE.BufferGeometry[]>();

  add(key: string, g: THREE.BufferGeometry, m?: THREE.Matrix4, color?: THREE.ColorRepresentation): void {
    this.addPrepared(key, prepGeo(g, m, color));
  }

  addPrepared(key: string, geo: THREE.BufferGeometry): void {
    let list = this.parts.get(key);
    if (!list) { list = []; this.parts.set(key, list); }
    list.push(geo);
  }

  build(materials: Record<string, THREE.Material>, name = 'bucket'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, list] of this.parts) {
      const mtl = materials[key];
      if (!mtl || list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mtl);
      mesh.name = `${name}:${key}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}
