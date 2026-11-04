/**
 * Bring the Mixamo-rigged characters into the game (src/assets/people/CREDITS.md):
 *   node scripts/models/mixamo-people.mjs <dir with the .fbx files> [out dir = src/assets/people]
 *     URL=http://localhost:3000/   a running dev server (its module graph supplies three.js and meshoptimizer)
 *     CHROME=/usr/bin/chromium
 *
 * Each Mixamo FBX carries one generated character (50 000 triangles, a 4096² texture) on the
 * 25-bone «mixamorig» skeleton, and one clip. In a headless browser this script:
 *   – takes each character's mesh once: welds and simplifies it with meshoptimizer (to a few
 *     thousand triangles), scales the texture down to 512², paints out the brand stripes on Muha's
 *     trainers and trousers (the game shows no real logos), and writes <body>-mx.glb (mesh + skeleton);
 *   – pools every file's clip into one mixamo-clips.glb (the skeleton and the animations, named for
 *     the game: Idle, Talking, Walk, Driving, Sitting, Waving, Handshake, Texting, OldWalk…), walking
 *     clips made walk-in-place. The rest height of the hips is stored (glTF extras) for each body and
 *     each clip's source, so People.ts can scale the hips' motion from one body to another.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [inDir, outDir = 'src/assets/people'] = process.argv.slice(2);
if (!inDir) { console.error('usage: node scripts/models/mixamo-people.mjs <fbx dir> [out dir]'); process.exit(1); }
const url = process.env.URL || 'http://localhost:3000/';
const root = resolve('.');

/** Which file gives each body its mesh, and how far to simplify it. */
const CHARS = {
  hero: { mesh: 'hero_Standing_Idle', tris: 4500 },
  muha: { mesh: 'Waving', tris: 3800, debrand: true },
  kartatay: { mesh: 'kartatai', tris: 3800 },
  // the uniform's texture is cut into many small islands: simplified more gently, or the patches smear onto the trousers
  gai: { mesh: 'Kuzmin_Texting_While_Standing', tris: 5200, error: 0.012 },
};
/** The game's name for each clip, and the file it comes from. */
const CLIPS = {
  Idle: 'hero_Standing_Idle', Talking: 'hero_Talking', Talking2: 'Talking', Walk: 'Walk', Driving: 'Driving',
  Sitting: 'Sitting_Idle', Waving: 'Waving', Handshake: 'Shaking_Hands_2', Texting: 'Kuzmin_Texting_While_Standing', OldWalk: 'kartatai',
};
const IN_PLACE = ['Walk', 'OldWalk'];

// a little file server: the page fetches the FBX files from it and posts the results back
const results = new Map();
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const name = decodeURIComponent(req.url.split('?')[0].slice(1));
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { results.set(name, Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  const p = resolve(inDir, name);
  if (!existsSync(p)) { res.statusCode = 404; res.end(); return; }
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const files = `http://localhost:${server.address().port}`;

const page = /* js */ `
const root = ${JSON.stringify(root)}, files = ${JSON.stringify(files)};
const CHARS = ${JSON.stringify(CHARS)}, CLIPS = ${JSON.stringify(CLIPS)}, IN_PLACE = ${JSON.stringify(IN_PLACE)};
const fbxUrl = '/@fs' + root + '/node_modules/three/examples/jsm/loaders/FBXLoader.js';
// the same three.js instance the dev server hands the loaders
const src = await (await fetch(fbxUrl)).text();
const THREE = await import(src.match(/from\\s+["']([^"']*\\/three[^"']*)["']/)[1]);
const { FBXLoader } = await import(fbxUrl);
const { GLTFExporter } = await import('/@fs' + root + '/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
const { MeshoptSimplifier } = await import('/@fs' + root + '/node_modules/meshoptimizer/meshopt_simplifier.module.js');
await MeshoptSimplifier.ready;
const log = [];
const loaded = {};
const load = async (f) => {
  if (loaded[f]) return loaded[f];
  const g = new FBXLoader().parse(await (await fetch(files + '/' + f + '.fbx')).arrayBuffer(), '');
  let sm = null; g.traverse((o) => { if (o.isSkinnedMesh) sm = o; });
  for (let k = 0; k < 100 && !(sm.material.map && sm.material.map.image && sm.material.map.image.width); k++) await new Promise((r) => setTimeout(r, 100));
  g.updateMatrixWorld(true);
  return (loaded[f] = { g, sm, hips: g.getObjectByName('mixamorigHips') });
};
const post = async (name, data) => { await fetch(files + '/' + name, { method: 'POST', body: data }); };
const exporter = new GLTFExporter();

/** Weld the FBX's per-corner vertices: same place, same UV, same skinning — one vertex. */
function weld(geo) {
  const a = geo.attributes, n = a.position.count, q = (x, k) => Math.round(x * k);
  const keys = new Map(), first = [], index = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let key = q(a.position.getX(i), 1e5) + ',' + q(a.position.getY(i), 1e5) + ',' + q(a.position.getZ(i), 1e5) + '|' + q(a.uv.getX(i), 1e5) + ',' + q(a.uv.getY(i), 1e5);
    if (a.skinIndex) key += '|' + a.skinIndex.getX(i) + ',' + a.skinIndex.getY(i) + ',' + a.skinIndex.getZ(i) + ',' + a.skinIndex.getW(i) + '|' + q(a.skinWeight.getX(i), 1e3) + ',' + q(a.skinWeight.getY(i), 1e3) + ',' + q(a.skinWeight.getZ(i), 1e3);
    let k = keys.get(key);
    if (k === undefined) { k = first.length; keys.set(key, k); first.push(i); }
    index[i] = k;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(a)) {
    const arr = new attr.array.constructor(first.length * attr.itemSize);
    first.forEach((src, d) => { for (let j = 0; j < attr.itemSize; j++) arr[d * attr.itemSize + j] = attr.array[src * attr.itemSize + j]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize, attr.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

/** Paint out light stripes inside the UV area of the triangles whose bind-pose height is in [y0, y1] (fractions of the height). */
function paintOut(ctx, geo, mw, y0, y1, fill) {
  const S = ctx.canvas.width, pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  let lo = Infinity, hi = -Infinity;
  const ys = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mw); ys[i] = v.y; lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
  const mask = document.createElement('canvas'); mask.width = mask.height = S;
  const m = mask.getContext('2d'); m.fillStyle = '#fff';
  const idx = geo.index ? geo.index.array : null, n = idx ? idx.length : pos.count;
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
    const inBand = [a, b, c].every((k) => { const f = (ys[k] - lo) / (hi - lo); return f >= y0 && f <= y1; });
    if (!inBand) continue;
    m.beginPath();
    m.moveTo(uv.getX(a) * S, (1 - uv.getY(a)) * S); m.lineTo(uv.getX(b) * S, (1 - uv.getY(b)) * S); m.lineTo(uv.getX(c) * S, (1 - uv.getY(c)) * S);
    m.closePath(); m.fill();
  }
  const img = ctx.getImageData(0, 0, S, S), mk = m.getImageData(0, 0, S, S).data, d = img.data;
  // the stripes: light and grey; the cloth round them gives the colour to paint them with
  let fr = 0, fg = 0, fb = 0, fn = 0;
  const light = (i) => { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 135 && (mx - mn) < 85; };
  for (let i = 0; i < d.length; i += 4) if (mk[i] > 128 && !light(i)) { fr += d[i]; fg += d[i + 1]; fb += d[i + 2]; fn++; }
  const col = fill ?? [fr / Math.max(1, fn), fg / Math.max(1, fn), fb / Math.max(1, fn)];
  let changed = 0;
  for (let i = 0; i < d.length; i += 4) if (mk[i] > 128 && light(i)) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; changed++; }
  ctx.putImageData(img, 0, 0);
  return changed;
}

for (const [body, c] of Object.entries(CHARS)) {
  const { g, sm, hips } = await load(c.mesh);
  // the texture at 512² (the renderer draws a pixelated picture anyway)
  const can = document.createElement('canvas'); can.width = can.height = 512;
  const ctx = can.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sm.material.map.image, 0, 0, 512, 512);
  // only what the game needs, welded: each triangle of the FBX comes with its own three vertices
  let geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) if (sm.geometry.attributes[k]) geo.setAttribute(k, sm.geometry.attributes[k].clone());
  geo = weld(geo);
  geo.computeVertexNormals();
  if (c.debrand) {
    const shoes = paintOut(ctx, geo, sm.matrixWorld, 0, 0.075, [30, 30, 32]);
    const legs = paintOut(ctx, geo, sm.matrixWorld, 0.075, 0.58, null);
    log.push(body + ': painted out ' + shoes + ' + ' + legs + ' texels');
  }
  const target = Math.min(geo.index.count, c.tris * 3);
  const [out, err] = MeshoptSimplifier.simplify(new Uint32Array(geo.index.array), new Float32Array(geo.attributes.position.array), 3, target, c.error ?? 0.05, []);
  // drop the vertices no triangle uses any more
  const remap = new Int32Array(geo.attributes.position.count).fill(-1);
  let nv = 0;
  for (const i of out) if (remap[i] < 0) remap[i] = nv++;
  const lean = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) {
    const arr = new a.array.constructor(nv * a.itemSize);
    for (let i = 0; i < remap.length; i++) if (remap[i] >= 0) for (let j = 0; j < a.itemSize; j++) arr[remap[i] * a.itemSize + j] = a.array[i * a.itemSize + j];
    lean.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  lean.setIndex(Array.from(out, (i) => remap[i]));
  const tex = new THREE.CanvasTexture(can);
  tex.colorSpace = THREE.SRGBColorSpace;
  sm.geometry = lean;
  sm.material = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1, metalness: 0, name: body });
  sm.name = body;
  g.userData = { hipsRest: hips.position.y, body };
  const glb = await exporter.parseAsync(g, { binary: true, onlyVisible: false, animations: [] });
  await post(body + '-mx.glb', glb);
  log.push(body + ': ' + lean.index.count / 3 + ' tris, ' + nv + ' verts, error ' + err.toFixed(4) + ', ' + (glb.byteLength / 1024).toFixed(0) + ' KB');
}

// the clips, pooled on a bare skeleton
const clips = [], clipHips = {};
for (const [name, f] of Object.entries(CLIPS)) {
  const { g, hips } = await load(f);
  const clip = g.animations[0].clone();
  clip.name = name;
  if (IN_PLACE.includes(name)) {
    // walk on the spot: the body moves the figure, not the clip
    const tr = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
    const v = tr.values, n = v.length / 3;
    for (let i = 0; i < n; i++) { v[i * 3] = v[0]; v[i * 3 + 2] = v[2]; }
  }
  clip.optimize();
  clips.push(clip);
  clipHips[name] = hips.position.y;
}
const skel = (await load(CHARS.hero.mesh)).hips.clone(true);
const holder = new THREE.Group();
holder.name = 'mixamo-clips';
holder.add(skel);
holder.userData = { clipHips };
const glb = await exporter.parseAsync(holder, { binary: true, onlyVisible: false, animations: clips });
await post('mixamo-clips.glb', glb);
log.push('clips: ' + clips.map((c) => c.name + ' ' + c.duration.toFixed(1) + 's').join(', ') + ' — ' + (glb.byteLength / 1024).toFixed(0) + ' KB');
return log;
`;

// the browser
const profile = '/tmp/mixamo-people-profile';
rmSync(profile, { recursive: true, force: true }); mkdirSync(profile, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const ch = spawn(process.env.CHROME || '/usr/bin/chromium', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quit = (code) => { try { ch.kill('SIGKILL'); } catch { /* gone */ } server.close(); process.exit(code); };
let list;
for (let i = 0; i < 80; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch { /* starting */ } await sleep(250); }
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.navigate', { url: new URL('@vite/client', url).href });
await sleep(1500);
const r = await send('Runtime.evaluate', { expression: `(async () => { try { return JSON.stringify(await (async () => { ${page} })()); } catch (e) { return JSON.stringify({ error: String(e && e.stack || e) }); } })()`, awaitPromise: true, returnByValue: true, timeout: 900000 });
const res = JSON.parse(r.result?.result?.value ?? '{"error":"no result"}');
if (res.error) { console.error(res.error); quit(1); }
for (const line of res) console.log(line);
mkdirSync(outDir, { recursive: true });
for (const [name, buf] of results) { writeFileSync(resolve(outDir, name), buf); console.log('wrote', resolve(outDir, name), (buf.length / 1024).toFixed(0), 'KB'); }
quit(0);
