/**
 * Materiały świata z kostek: MeshLambertMaterial + wstrzyknięte wzory „pikselowych tekstur” (proceduralnie,
 * w shaderze, z pozycji w obiekcie), AO z atrybutu wierzchołka (tylko światło rozproszone/otoczenia)
 * i emisja per-kostka (grzyby, kryształy, żar) wzmacniana nocą.
 */
import * as THREE from 'three';
import type { MeshArrays, WaterArrays } from './mesher';
import { hexToLinear } from './blocks';

/** Uniformy współdzielone przez wszystkie materiały świata (czas, wiatr, emisja). */
export const worldUniforms = {
  uTime: { value: 0 },
  uEmissiveBoost: { value: 1 },
  uWind: { value: 1 },
  uDirtColor: { value: new THREE.Color().setRGB(...hexToLinear('#8e5d3b')) },
  uWaterDeep: { value: new THREE.Color().setRGB(...hexToLinear('#2b8fd6')) },
  uWaterShallow: { value: new THREE.Color().setRGB(...hexToLinear('#5fd3ea')) },
  uWaterGlow: { value: 0.0 },
};

const VOX_PARS_VERTEX = /* glsl */ `
attribute vec3 aVox;
varying vec3 vVox;
varying vec3 vOPos;
varying vec3 vONrm;
`;

const VOX_PARS_FRAGMENT = /* glsl */ `
varying vec3 vVox;
varying vec3 vOPos;
varying vec3 vONrm;
uniform float uEmissiveBoost;
uniform vec3 uDirtColor;
float vhash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
`;

/** Wzory kostek: modyfikuje diffuseColor, dodaje emisję. Kody zgodne z MAT w blocks.ts. */
const VOX_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 n = normalize(vONrm);
  vec3 an = abs(n);
  vec3 cell = floor(vOPos - n * 0.02);
  vec2 fp;
  if (an.y > 0.5) fp = vOPos.xz;
  else if (an.x > 0.5) fp = vec2(vOPos.z, vOPos.y);
  else fp = vec2(vOPos.x, vOPos.y);
  vec2 f = fract(fp - n.xz * 0.0);
  vec2 tx = floor(f * 8.0);
  vec2 q = (tx + 0.5) / 8.0;
  float fid = dot(n, vec3(1.0, 2.0, 3.0));
  vec3 cseed = cell * vec3(1.0, 1.7, 2.3);
  float r = vhash(vec3(tx.x + cseed.x * 9.1 + cseed.y * 3.3, tx.y + cseed.z * 7.7, fid + cseed.y));
  int code = int(vVox.y + 0.5);
  float m = 1.0;
  vec3 col = diffuseColor.rgb;
  bool side = an.y < 0.5;
  if (code == 0) {
    m = 0.95 + 0.1 * r;
  } else if (code == 1) {
    // Bok trawy: zielony pas u góry, poszarpana krawędź, niżej ziemia.
    float edge = 0.74 - vhash(vec3(tx.x, cseed.x + cseed.z * 3.1, 5.0)) * 0.26;
    if (q.y < edge) { col = uDirtColor; m = 0.9 + 0.18 * r; }
    else m = 0.93 + 0.12 * r;
  } else if (code == 15) {
    m = 0.92 + 0.14 * r;
    if (r > 0.92) m = 1.14;
  } else if (code == 2) {
    float row = floor(q.y * 4.0);
    float board = vhash(vec3(row, cseed.x + cseed.z, cseed.y));
    m = 0.9 + 0.16 * board + 0.05 * r;
    if (fract(q.y * 4.0) < 0.2) m *= 0.74;
    if (tx.x == floor(board * 7.0) && fract(q.y * 4.0) > 0.4) m *= 0.85;
  } else if (code == 3) {
    float by = floor(q.y * 4.0);
    float bx = q.x * 2.0 + mod(by, 2.0) * 0.5;
    float brick = vhash(vec3(floor(bx), by, cseed.x + cseed.z * 5.0 + cseed.y));
    m = 0.9 + 0.16 * brick;
    if (fract(q.y * 4.0) < 0.26 || fract(bx) < 0.12) m = 1.12;
  } else if (code == 4) {
    float stripe = vhash(vec3(tx.x, cseed.x + cseed.z, 11.0));
    m = 0.82 + 0.22 * stripe;
    if (r > 0.9) m *= 0.8;
  } else if (code == 5) {
    float d = max(abs(q.x - 0.5), abs(q.y - 0.5));
    m = fract(d * 5.0) < 0.35 ? 0.86 : 1.04;
    if (d > 0.42) { m = 0.62; }
  } else if (code == 6) {
    m = 0.86 + 0.22 * r;
    if (r < 0.1) m = 0.68;
    if (r > 0.95) m = 1.16;
  } else if (code == 7) {
    m = 0.88 + 0.24 * r;
  } else if (code == 8) {
    float blob = vhash(vec3(floor(tx / 2.0), cseed.x + cseed.y * 2.0 + cseed.z * 3.0 + fid));
    m = 0.86 + 0.2 * blob + 0.04 * r;
    if (r > 0.94) m *= 0.8;
  } else if (code == 9) {
    m = 0.96 + 0.08 * r;
  } else if (code == 10) {
    m = 0.84 + 0.26 * r;
  } else if (code == 11) {
    float stripe = vhash(vec3(tx.x, cseed.x + cseed.z, 3.0));
    m = 0.88 + 0.2 * stripe;
    if (side && q.y > 0.4 && q.y < 0.6) m *= 0.78;
  } else if (code == 12) {
    m = 0.78 + 0.45 * (q.x * 0.6 + q.y * 0.4);
    if (abs(q.x - q.y) < 0.07) m = 1.25;
  } else if (code == 13) {
    m = 0.95 + 0.06 * r;
    if (side && vhash(vec3(tx.y, cseed.x + cseed.z, 2.0)) > 0.78 && r > 0.25) m = 0.28;
  } else if (code == 14) {
    float rowf = fract(q.y * 4.0);
    float sh = vhash(vec3(floor(q.x * 3.0 + floor(q.y * 4.0) * 0.5), floor(q.y * 4.0), cseed.x + cseed.z));
    m = (0.84 + 0.18 * sh) * (rowf < 0.25 ? 0.8 : 1.0);
  } else if (code == 16) {
    m = 1.0;
  } else if (code == 17) {
    m = (mod(tx.x + tx.y, 2.0) < 1.0 ? 0.96 : 1.04) * (0.97 + 0.06 * r);
  }
  diffuseColor.rgb = col * m;
  totalEmissiveRadiance += diffuseColor.rgb * vVox.z * uEmissiveBoost;
}
`;

const VOX_AO = /* glsl */ `
#include <lights_fragment_end>
reflectedLight.indirectDiffuse *= vVox.x;
reflectedLight.directDiffuse *= mix(1.0, vVox.x, 0.55);
`;

export interface VoxelMaterialOptions {
  transparent?: boolean;
  opacity?: number;
}

/** Materiał dla siatek z greedyMesh (teren, drzewa, chmury). */
export function createVoxelMaterial(opts: VoxelMaterialOptions = {}): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: !(opts.transparent ?? false),
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEmissiveBoost = worldUniforms.uEmissiveBoost;
    shader.uniforms.uDirtColor = worldUniforms.uDirtColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VOX_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVox = aVox; vOPos = position; vONrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${VOX_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', VOX_COLOR)
      .replace('#include <lights_fragment_end>', VOX_AO);
  };
  mat.customProgramCacheKey = () => 'matematico-voxel-v1';
  return mat;
}

export function geometryFromMesh(m: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  g.setAttribute('aVox', new THREE.BufferAttribute(m.vox, 3));
  const needs32 = m.vertexCount > 65535;
  g.setIndex(new THREE.BufferAttribute(needs32 ? m.indices : Uint16Array.from(m.indices), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ───────────────────────────── Woda ─────────────────────────────

const WATER_VERTEX_PARS = /* glsl */ `
attribute vec2 aWater;
varying vec2 vWater;
varying vec3 vWPos;
uniform float uTime;
`;

const WATER_FRAGMENT_PARS = /* glsl */ `
varying vec2 vWater;
varying vec3 vWPos;
uniform float uTime;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uWaterGlow;
float whash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

const WATER_COLOR = /* glsl */ `
{
  float shore = vWater.x;
  float depth = vWater.y;
  vec2 px = floor(vWPos.xz * 8.0) / 8.0;
  float t = uTime;
  float w1 = sin(px.x * 2.1 + t * 1.3) * sin(px.y * 1.7 - t * 1.1);
  float w2 = sin((px.x + px.y) * 3.3 - t * 1.9);
  float ripple = w1 * 0.6 + w2 * 0.4;
  vec3 col = mix(uWaterShallow, uWaterDeep, clamp(depth * 1.4 - shore * 0.35, 0.0, 1.0));
  col *= 0.92 + 0.12 * ripple;
  float sparkle = step(0.982, whash(px + floor(t * 2.0))) * (0.5 + 0.5 * ripple);
  float foam = smoothstep(0.55, 0.95, shore + 0.18 * sin(t * 2.0 + px.x * 3.0 + px.y * 2.0));
  col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.75);
  diffuseColor.rgb = col;
  diffuseColor.a = mix(0.72, 0.92, max(foam, depth * 0.5));
  totalEmissiveRadiance += vec3(0.9, 0.97, 1.0) * sparkle * 0.9 + col * uWaterGlow;
}
`;

export function createWaterMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uWaterDeep = worldUniforms.uWaterDeep;
    shader.uniforms.uWaterShallow = worldUniforms.uWaterShallow;
    shader.uniforms.uWaterGlow = worldUniforms.uWaterGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WATER_VERTEX_PARS}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWater = aWater;
transformed.y += (sin(uTime * 1.6 + position.x * 0.9 + position.z * 0.7) * 0.03 + sin(uTime * 2.3 - position.x * 0.5 + position.z * 1.3) * 0.02) * (1.0 - aWater.x * 0.6);
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WATER_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${WATER_COLOR}`);
  };
  mat.customProgramCacheKey = () => 'matematico-water-v1';
  return mat;
}

export function geometryFromWater(m: WaterArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  const normals = new Float32Array(m.positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('aWater', new THREE.BufferAttribute(m.water, 2));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
