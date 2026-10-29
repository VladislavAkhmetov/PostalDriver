import * as THREE from 'three';

export interface Grade {
  tint: THREE.Color;
  saturation: number;
  contrast: number;
  exposure: number;
  flash: number;
}

/**
 * Renders the scene into a low-resolution target and upscales it with nearest
 * filtering, then applies a 16-bit-era dither + quantise pass.
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  pixelMode = true;
  shortSide = 360;
  readonly internal = new THREE.Vector2(640, 360);

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = true;
    container.appendChild(this.renderer.domElement);

    this.rt = new THREE.WebGLRenderTarget(640, 360, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      type: THREE.HalfFloatType,
    });

    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        res: { value: this.internal },
        tint: { value: new THREE.Color(1, 1, 1) },
        sat: { value: 1 },
        contrast: { value: 1 },
        exposure: { value: 1 },
        flash: { value: 0 },
        dither: { value: 1 },
        levels: { value: 31 },
        vignette: { value: 0.55 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 res;
        uniform vec3 tint;
        uniform float sat, contrast, exposure, flash, dither, levels, vignette;
        varying vec2 vUv;
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb * exposure + flash;
          c = c / (1.0 + c * 0.28) * 1.2;
          c *= tint;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, sat);
          c = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
          c = (c - 0.5) * contrast + 0.5;
          vec2 px = floor(vUv * res);
          c += (bayer4(px) - 0.5) * dither / levels;
          c = floor(c * levels + 0.5) / levels;
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q, q) * vignette;
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    let iw: number, ih: number;
    if (this.pixelMode) {
      const s = this.shortSide;
      if (w >= h) { ih = s; iw = Math.round((s * w) / h); } else { iw = s; ih = Math.round((s * h) / w); }
    } else {
      const k = Math.min(window.devicePixelRatio || 1, 1.5);
      iw = Math.round(w * k);
      ih = Math.round(h * k);
    }
    this.internal.set(iw, ih);
    this.rt.setSize(iw, ih);
    const u = this.post.uniforms;
    u.dither.value = this.pixelMode ? 1 : 0;
    u.levels.value = this.pixelMode ? 31 : 255;
  }

  setGrade(g: Grade): void {
    const u = this.post.uniforms;
    (u.tint.value as THREE.Color).copy(g.tint);
    u.sat.value = g.saturation;
    u.contrast.value = g.contrast;
    u.exposure.value = g.exposure;
    u.flash.value = g.flash;
  }

  renderTo(target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
