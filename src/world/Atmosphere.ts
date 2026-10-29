import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';
import type { Grade } from '../core/Renderer';

export interface WeatherKey {
  name: string;
  at: number; // route distance (m)
  sunElev: number; sunAz: number;
  sunColor: string; sunInt: number;
  zenith: string; horizon: string; fog: string;
  fogNear: number; fogFar: number;
  hemiSky: string; hemiGround: string; hemiInt: number;
  cloud: number; rain: number; wind: number; dark: number; storm: number;
  tint: string; sat: number; contrast: number; exposure: number;
}

/** Morning-to-dusk progression of the run, pinned to route distance. */
export const TIMELINE: WeatherKey[] = [
  { name: 'Туман, рассвет', at: 0, sunElev: 4, sunAz: 115, sunColor: '#ffc89a', sunInt: 1.1, zenith: '#8fa0aa', horizon: '#e8d2b4', fog: '#cfc6b4', fogNear: 4, fogFar: 120, hemiSky: '#c8ccd0', hemiGround: '#5a5040', hemiInt: 1.4, cloud: 0.3, rain: 0, wind: 0.1, dark: 0.35, storm: 0, tint: '#fff1de', sat: 0.82, contrast: 1.02, exposure: 1.02 },
  { name: 'Золотое утро', at: 900, sunElev: 12, sunAz: 120, sunColor: '#ffd8a0', sunInt: 2.2, zenith: '#6d95b8', horizon: '#f0dcb8', fog: '#d8cdb4', fogNear: 30, fogFar: 380, hemiSky: '#b8cce0', hemiGround: '#6a5a3c', hemiInt: 1.3, cloud: 0.35, rain: 0, wind: 0.2, dark: 0, storm: 0, tint: '#fff2dc', sat: 1.0, contrast: 1.05, exposure: 1.04 },
  { name: 'Ясно', at: 1700, sunElev: 22, sunAz: 140, sunColor: '#fff0d8', sunInt: 2.5, zenith: '#5a86b4', horizon: '#c8d4dc', fog: '#bcc8cc', fogNear: 60, fogFar: 520, hemiSky: '#b0c8e0', hemiGround: '#5a5a3a', hemiInt: 1.3, cloud: 0.42, rain: 0, wind: 0.25, dark: 0, storm: 0, tint: '#ffffff', sat: 1.0, contrast: 1.05, exposure: 1.0 },
  { name: 'Пасмурно', at: 2500, sunElev: 26, sunAz: 160, sunColor: '#e0e0dc', sunInt: 0.9, zenith: '#7a8288', horizon: '#a8aca8', fog: '#9aa09a', fogNear: 30, fogFar: 330, hemiSky: '#a8b0b4', hemiGround: '#4a4a38', hemiInt: 1.6, cloud: 0.78, rain: 0, wind: 0.4, dark: 0.1, storm: 0, tint: '#eef2ee', sat: 0.82, contrast: 1.02, exposure: 0.98 },
  { name: 'Дождь', at: 3150, sunElev: 18, sunAz: 190, sunColor: '#c8ccd0', sunInt: 0.4, zenith: '#555c62', horizon: '#80868a', fog: '#767c7e', fogNear: 15, fogFar: 210, hemiSky: '#8a9296', hemiGround: '#3a3a30', hemiInt: 1.4, cloud: 0.95, rain: 0.7, wind: 0.6, dark: 0.35, storm: 0.3, tint: '#e2eaee', sat: 0.72, contrast: 1.0, exposure: 0.95 },
  { name: 'Сумерки, ливень', at: 3700, sunElev: 3, sunAz: 240, sunColor: '#b08c80', sunInt: 0.15, zenith: '#2c323c', horizon: '#5c5858', fog: '#43474c', fogNear: 8, fogFar: 150, hemiSky: '#5a6270', hemiGround: '#24241e', hemiInt: 1.0, cloud: 1, rain: 1, wind: 0.8, dark: 0.85, storm: 1, tint: '#d4dcea', sat: 0.7, contrast: 1.0, exposure: 1.0 },
];

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */ `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 fogC; uniform vec3 sunDir; uniform vec3 sunC;
uniform float cloud; uniform float time; uniform float flash; uniform float haze;
varying vec3 vDir;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + 17.0; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(horizon, zenith, pow(max(up, 0.0), 0.55));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunC * (pow(sd, 6.0) * 0.35 + pow(sd, 900.0) * 3.0) * (1.0 - cloud * 0.8);
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 1.4 + vec2(time * 0.006, time * 0.002);
    float c = fbm(uv);
    float cov = smoothstep(0.62 - cloud * 0.5, 0.95 - cloud * 0.25, c);
    vec3 cc = mix(vec3(1.0), zenith * 0.6 + horizon * 0.25, cloud * 0.85);
    cc += sunC * pow(sd, 4.0) * 0.4 * (1.0 - cloud);
    col = mix(col, cc * (0.85 + 0.25 * fbm(uv * 2.1 + 3.0)), cov * smoothstep(0.0, 0.18, d.y));
  }
  col = mix(col, fogC, smoothstep(0.22, 0.0, up) * haze);
  col += vec3(0.75, 0.8, 0.95) * flash;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Atmosphere {
  readonly sun = new THREE.DirectionalLight('#ffffff', 2);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  readonly fog = new THREE.Fog('#cccccc', 10, 300);
  readonly sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  readonly state = {
    // wet: how soaked the land is — it rained overnight, dries slowly, refills in the storm
    name: '', rain: 0, wind: 0, dark: 0, storm: 0, cloud: 0, flash: 0, wet: 0.62,
    skyColor: new THREE.Color(), fogColor: new THREE.Color(),
  };
  readonly grade: Grade = { tint: new THREE.Color(1, 1, 1), saturation: 1, contrast: 1, exposure: 1, flash: 0 };
  private time = 0;
  private nextBolt = 8;
  private presetOverride: number | null = null;
  onLightning?: (dist: number) => void;
  private cur: WeatherKey = { ...TIMELINE[0] };

  constructor(scene: THREE.Scene) {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, fogC: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunC: { value: new THREE.Color() },
        cloud: { value: 0 }, time: { value: 0 }, flash: { value: 0 }, haze: { value: 1 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
  }

  /** Cycle forced weather presets for the debug/weather button; null = follow route. */
  cyclePreset(): string {
    this.presetOverride = this.presetOverride === null ? 0 : this.presetOverride + 1;
    if (this.presetOverride >= TIMELINE.length) this.presetOverride = null;
    return this.presetOverride === null ? 'По маршруту' : TIMELINE[this.presetOverride].name;
  }

  private sample(at: number): WeatherKey {
    if (this.presetOverride !== null) return TIMELINE[this.presetOverride];
    let i = 0;
    while (i < TIMELINE.length - 2 && at > TIMELINE[i + 1].at) i++;
    const a = TIMELINE[i], b = TIMELINE[i + 1];
    const t = smoothstep(a.at, b.at, at);
    const out = { ...a } as WeatherKey;
    const C = new THREE.Color();
    for (const k of Object.keys(a) as (keyof WeatherKey)[]) {
      const va = a[k], vb = b[k];
      if (typeof va === 'number' && typeof vb === 'number') (out[k] as number) = lerp(va, vb, t);
      else if (typeof va === 'string' && typeof vb === 'string' && va.startsWith('#')) (out[k] as string) = '#' + C.set(va).lerp(new THREE.Color(vb), t).getHexString();
    }
    out.name = t < 0.5 ? a.name : b.name;
    return out;
  }

  update(dt: number, routeS: number, cam: THREE.Vector3): void {
    this.time += dt;
    const target = this.sample(routeS);
    // ease towards target so manual preset changes and backtracking blend smoothly
    const k = 1 - Math.exp(-dt * 0.8);
    const C = new THREE.Color();
    for (const key of Object.keys(target) as (keyof WeatherKey)[]) {
      const tv = target[key];
      if (typeof tv === 'number') (this.cur[key] as number) = lerp(this.cur[key] as number, tv, k);
      else if (typeof tv === 'string' && tv.startsWith('#')) (this.cur[key] as string) = '#' + C.set(this.cur[key] as string).lerp(new THREE.Color(tv), k).getHexString();
    }
    this.cur.name = target.name;
    const w = this.cur;
    const s = this.state;
    s.name = w.name; s.rain = w.rain; s.wind = w.wind; s.dark = w.dark; s.storm = w.storm; s.cloud = w.cloud;
    const wetT = Math.max(0.28, w.rain);
    s.wet += (wetT - s.wet) * (1 - Math.exp(-dt * (wetT > s.wet ? 0.12 : 0.004)));

    // lightning
    this.nextBolt -= dt;
    if (w.storm > 0.25 && this.nextBolt < 0) {
      this.nextBolt = lerp(22, 7, w.storm) * (0.6 + Math.random() * 0.8);
      s.flash = 1;
      this.onLightning?.(0.5 + Math.random() * 3);
    }
    s.flash = Math.max(0, s.flash - dt * (s.flash > 0.5 ? 6 : 2.5));
    const flick = s.flash > 0 ? s.flash * (0.6 + 0.4 * Math.sin(this.time * 70)) : 0;

    const el = (w.sunElev * Math.PI) / 180, az = (w.sunAz * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
    this.sun.position.copy(cam).addScaledVector(dir, 200);
    this.sun.target.position.copy(cam);
    this.sun.color.set(w.sunColor);
    this.sun.intensity = w.sunInt * (1 - w.cloud * 0.5) + flick * 2;
    this.hemi.color.set(w.hemiSky);
    this.hemi.groundColor.set(w.hemiGround);
    this.hemi.intensity = w.hemiInt + flick * 1.5;
    this.fog.color.set(w.fog);
    this.fog.near = w.fogNear;
    this.fog.far = w.fogFar;
    s.fogColor.set(w.fog);
    s.skyColor.set(w.zenith).lerp(new THREE.Color(w.horizon), 0.5);

    const u = this.skyMat.uniforms;
    (u.zenith.value as THREE.Color).set(w.zenith);
    (u.horizon.value as THREE.Color).set(w.horizon).lerp(new THREE.Color(w.fog), clamp(1 - w.fogFar / 500, 0, 1) * 0.5);
    (u.fogC.value as THREE.Color).set(w.fog);
    (u.sunDir.value as THREE.Vector3).copy(dir);
    (u.sunC.value as THREE.Color).set(w.sunColor);
    u.cloud.value = w.cloud;
    u.time.value = this.time;
    u.flash.value = flick * 0.6;
    u.haze.value = clamp(1.4 - w.fogFar / 400, 0.35, 1);
    this.sky.position.copy(cam);

    const g = this.grade;
    g.tint.set(w.tint);
    g.saturation = w.sat;
    g.contrast = w.contrast;
    g.exposure = w.exposure;
    g.flash = flick * 0.25;
  }
}
