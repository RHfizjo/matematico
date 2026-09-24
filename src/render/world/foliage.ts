/**
 * Roślinność jako InstancedMesh (jedno wywołanie rysowania na typ): kępki trawy, wysoka trawa, kwiaty,
 * świecące grzybki, kamyczki. Kołysanie na wietrze w shaderze (materials.ts).
 */
import * as THREE from 'three';
import type { FoliageSpec, FoliageType } from '../scenes/types';
import { hexToLinear } from '../voxel/blocks';
import { worldUniforms } from '../voxel/materials';

interface BoxPart {
  min: [number, number, number];
  max: [number, number, number];
  color: string;
  /** Udział koloru instancji (0 = stały kolor, 1 = barwione instancją). */
  tint: number;
  /** Gradient jasności od dołu (0.6) do góry (1.1). */
  gradient?: boolean;
}

function partsGeometry(parts: BoxPart[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const tint: number[] = [];
  const idx: number[] = [];
  let maxY = 0;
  for (const p of parts) maxY = Math.max(maxY, p.max[1]);
  for (const p of parts) {
    const [x0, y0, z0] = p.min;
    const [x1, y1, z1] = p.max;
    const c = hexToLinear(p.color);
    const faces: { n: [number, number, number]; v: [number, number, number][] }[] = [
      { n: [0, 1, 0], v: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]] },
      { n: [1, 0, 0], v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
      { n: [-1, 0, 0], v: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]] },
      { n: [0, 0, 1], v: [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]] },
      { n: [0, 0, -1], v: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]] },
    ];
    for (const f of faces) {
      const base = pos.length / 3;
      for (const v of f.v) {
        pos.push(v[0], v[1], v[2]);
        nrm.push(f.n[0], f.n[1], f.n[2]);
        const g = p.gradient ? 0.72 + 0.5 * (v[1] / Math.max(0.01, maxY)) : 1;
        col.push(c[0] * g, c[1] * g, c[2] * g);
        tint.push(p.tint);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function blade(x: number, z: number, h: number, w = 0.09): BoxPart {
  return { min: [x - w / 2, 0, z - w / 2], max: [x + w / 2, h, z + w / 2], color: '#ffffff', tint: 1, gradient: true };
}

const GEOMETRY_BUILDERS: Record<FoliageType, () => THREE.BufferGeometry> = {
  tuft: () => partsGeometry([blade(-0.08, 0.02, 0.34), blade(0.07, -0.05, 0.44), blade(0.0, 0.09, 0.27)]),
  tallGrass: () =>
    partsGeometry([blade(-0.12, 0.03, 0.72, 0.08), blade(0.1, -0.06, 0.9, 0.08), blade(0.0, 0.12, 0.6, 0.08), blade(0.05, -0.14, 0.5, 0.07), blade(-0.14, -0.1, 0.45, 0.07)]),
  flower: () =>
    partsGeometry([
      { min: [-0.03, 0, -0.03], max: [0.03, 0.44, 0.03], color: '#4c9e35', tint: 0 },
      { min: [0.03, 0.12, -0.03], max: [0.16, 0.17, 0.05], color: '#5bb040', tint: 0 },
      { min: [-0.15, 0.2, -0.04], max: [-0.03, 0.25, 0.03], color: '#5bb040', tint: 0 },
      { min: [-0.13, 0.42, -0.13], max: [0.13, 0.51, 0.13], color: '#ffffff', tint: 1 },
      { min: [-0.06, 0.51, -0.06], max: [0.06, 0.56, 0.06], color: '#ffd23f', tint: 0 },
    ]),
  mushroom: () =>
    partsGeometry([
      { min: [-0.05, 0, -0.05], max: [0.05, 0.2, 0.05], color: '#f3ead8', tint: 0 },
      { min: [-0.14, 0.2, -0.14], max: [0.14, 0.3, 0.14], color: '#ffffff', tint: 1 },
      { min: [-0.09, 0.3, -0.09], max: [0.09, 0.35, 0.09], color: '#ffffff', tint: 1 },
    ]),
  crystal: () =>
    partsGeometry([
      { min: [-0.07, 0, -0.07], max: [0.07, 0.62, 0.07], color: '#ffffff', tint: 1, gradient: true },
      { min: [0.08, 0, -0.02], max: [0.18, 0.4, 0.08], color: '#ffffff', tint: 1, gradient: true },
      { min: [-0.2, 0, 0.02], max: [-0.1, 0.3, 0.12], color: '#ffffff', tint: 1, gradient: true },
      { min: [-0.04, 0, 0.1], max: [0.05, 0.22, 0.19], color: '#ffffff', tint: 1, gradient: true },
    ]),
  pebble: () =>
    partsGeometry([
      { min: [-0.14, 0, -0.1], max: [0.12, 0.09, 0.12], color: '#ffffff', tint: 1 },
      { min: [0.1, 0, 0.04], max: [0.2, 0.06, 0.16], color: '#ffffff', tint: 1 },
    ]),
};

const TYPE_GLOW: Partial<Record<FoliageType, number>> = { mushroom: 1.1, crystal: 0.9 };

function createFoliageMat(glow: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uWind = worldUniforms.uWind;
    shader.uniforms.uEmissiveBoost = worldUniforms.uEmissiveBoost;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;\nvarying float vTint;\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(1.0);
#ifdef USE_COLOR_ALPHA
  vColor *= color;
#elif defined( USE_COLOR )
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb = mix(vColor.rgb, vColor.rgb * instanceColor.rgb, aTint);
#endif
vTint = aTint;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.6 + sin(uTime * 2.9 + ip.x * 1.3 - ip.z * 0.9) * 0.25;
  float hgt = max(position.y, 0.0);
  transformed.x += sway * hgt * hgt * 0.35 * uWind;
  transformed.z += sway * hgt * hgt * 0.2 * uWind;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vTint;\nuniform float uEmissiveBoost;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vTint * ${glow.toFixed(2)} * uEmissiveBoost;`);
  };
  mat.customProgramCacheKey = () => `matematico-foliage-${glow.toFixed(2)}`;
  return mat;
}

export interface FoliageSet {
  meshes: { mesh: THREE.InstancedMesh; total: number }[];
  setDensity(d: number): void;
  dispose(): void;
}

export function buildFoliage(specs: readonly FoliageSpec[], density: number): FoliageSet {
  const byType = new Map<FoliageType, FoliageSpec[]>();
  for (const s of specs) {
    const list = byType.get(s.type) ?? [];
    list.push(s);
    byType.set(s.type, list);
  }
  const meshes: { mesh: THREE.InstancedMesh; total: number }[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();
  const mats: THREE.Material[] = [];
  for (const [type, list] of byType) {
    const geo = GEOMETRY_BUILDERS[type]();
    const mat = createFoliageMat(TYPE_GLOW[type] ?? 0);
    mats.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot);
      pos.set(s.x, s.y, s.z);
      scl.setScalar(s.scale);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
      const c = hexToLinear(s.color);
      color.setRGB(c[0], c[1], c[2]);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    meshes.push({ mesh, total: list.length });
  }
  const set: FoliageSet = {
    meshes,
    setDensity(d: number) {
      for (const m of meshes) m.mesh.count = Math.max(0, Math.min(m.total, Math.round(m.total * d)));
    },
    dispose() {
      for (const m of meshes) {
        m.mesh.geometry.dispose();
        m.mesh.dispose();
      }
      for (const mt of mats) mt.dispose();
    },
  };
  set.setDensity(density);
  return set;
}
