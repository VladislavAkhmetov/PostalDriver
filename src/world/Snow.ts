import * as THREE from 'three';

/**
 * Snow lying on the world (docs/design.md, «Зима»): one shared uniform drives a small patch on the
 * world's own materials, so the cover can come and go without rebuilding anything. Whatever faces
 * the sky — the ground, roofs, the tops of woodpiles — turns white; the roads take it packed and
 * grey with the ruts showing; trees get a dusting; open water freezes over in hard frost.
 */
export const snowCover = { value: 0 };
const snowColor = { value: new THREE.Color('#e9eef3') };
const roadColor = { value: new THREE.Color('#c9cdd0') };
const iceColor = { value: new THREE.Color('#b9c8d2') };

export type SnowKind = 'ground' | 'road' | 'dust' | 'ice';

/** Let `m` take the snow cover (call once per material, before its first use). */
export function snowy(m: THREE.Material, kind: SnowKind): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uSnow = snowCover;
    shader.uniforms.uSnowColor = kind === 'road' ? roadColor : kind === 'ice' ? iceColor : snowColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSnowUp;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;');
    const amount = kind === 'ground' ? 'uSnow * smoothstep(0.45, 0.8, vSnowUp)'
      : kind === 'road' ? 'uSnow * 0.8 * smoothstep(0.45, 0.8, vSnowUp)'
        : kind === 'dust' ? 'uSnow * 0.32'
          : 'smoothstep(0.65, 0.9, uSnow)';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSnowUp;\nuniform float uSnow;\nuniform vec3 uSnowColor;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float k = clamp(${amount}, 0.0, 1.0);
    // keep a trace of what is under it: the snow takes a little of the texture's light and shade
    vec3 sc = uSnowColor * (0.86 + 0.14 * dot(diffuseColor.rgb, vec3(0.333)));
    diffuseColor.rgb = mix(diffuseColor.rgb, sc, k);
  }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ''}snow-${kind}`;
}
