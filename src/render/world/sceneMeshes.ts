/**
 * Zamiana SceneBuild (czyste dane) na obiekty three.js: porcje terenu (greedy + AO), woda, dekoracje,
 * roślinność (instancje), drzewa (osobne obiekty z zanikaniem), światła punktowe, snopy światła.
 */
import * as THREE from 'three';
import type { SceneBuild } from '../scenes/types';
import { B, blockTable, FACE_SIDE, FACE_TOP, JITTER_LEVELS } from '../voxel/blocks';
import { greedyMesh, meshWater } from '../voxel/mesher';
import { paddedFromDense } from '../voxel/world';
import { createVoxelMaterial, createWaterMaterial, geometryFromMesh, geometryFromWater } from '../voxel/materials';
import { buildFoliage, type FoliageSet } from './foliage';
import { makeTree, type TreeKind, type TreeVolume } from './trees';
import { fbm2, hash3 } from '../util/rng';

export const MESH_CHUNK = 32;

export interface TreeObject {
  mesh: THREE.Mesh;
  /** Obszar zasłaniania (świat) — szybki test wstępny. */
  box: THREE.Box3;
  /** Wolumen drzewa (dokładny test kostek) i przekształcenie świat → wolumen. */
  vol: TreeVolume;
  worldToVol: THREE.Matrix4;
  fade: number;
  target: number;
  opaqueMat: THREE.Material;
  fadeMat: THREE.MeshLambertMaterial | null;
  /** Przebieg tylko-głębia przed półprzezroczystym (widać tylko przednią powierzchnię „ducha”). */
  depthMesh: THREE.Mesh | null;
}

const depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });

export interface FlickerLight {
  light: THREE.PointLight;
  base: number;
  phase: number;
  flicker: boolean;
}

export interface SceneMeshes {
  group: THREE.Group;
  terrain: THREE.Mesh[];
  water: THREE.Mesh | null;
  foliage: FoliageSet;
  trees: TreeObject[];
  treeColliders: { x: number; z: number; r: number }[];
  lights: FlickerLight[];
  shafts: THREE.Mesh[];
  triangles: number;
  /** Klucze współdzielonych geometrii drzew użytych w tej scenie (patrz pruneTreeCache). */
  treeKeys: ReadonlySet<string>;
  dispose(): void;
}

const yieldFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Szum „łanów” — sąsiednie kostki trawy mają podobny odcień, plus drobny losowy rozrzut. */
function terrainJitter(seed: number): (x: number, y: number, z: number, id: number) => number {
  return (x, y, z, id) => {
    const r = hash3(x, y, z, seed);
    if (id === B.grass || id === B.moss || id === B.flowerBed || id === B.leaves) {
      const n = fbm2(x * 0.08, z * 0.08, seed + 17, 2);
      return Math.floor(Math.min(0.999, Math.max(0, n * 1.3 - 0.15 + (r - 0.5) * 0.5)) * JITTER_LEVELS);
    }
    return Math.floor(r * JITTER_LEVELS);
  };
}

function decorGeometry(build: SceneBuild, shadow: boolean): THREE.BufferGeometry | null {
  const boxes = build.decor.filter((d) => !d.noShadow === shadow);
  if (!boxes.length) return null;
  const table = blockTable();
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const vox: number[] = [];
  const idx: number[] = [];
  boxes.forEach((bx, bi) => {
    const [x0, y0, z0] = bx.min;
    const [x1, y1, z1] = bx.max;
    const faces: { n: [number, number, number]; fc: number; v: [number, number, number][] }[] = [
      { n: [0, 1, 0], fc: FACE_TOP, v: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]] },
      { n: [1, 0, 0], fc: FACE_SIDE, v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
      { n: [-1, 0, 0], fc: FACE_SIDE, v: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]] },
      { n: [0, 0, 1], fc: FACE_SIDE, v: [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]] },
      { n: [0, 0, -1], fc: FACE_SIDE, v: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]] },
      { n: [0, -1, 0], fc: 2, v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    ];
    const lvl = Math.floor(hash3(bi, 3, 7) * JITTER_LEVELS);
    for (const f of faces) {
      const base = pos.length / 3;
      const ci = ((bx.block * 3 + f.fc) * JITTER_LEVELS + lvl) * 3;
      const mat = table.mat[bx.block * 3 + f.fc] ?? 0;
      const emis = table.emissive[bx.block] ?? 0;
      for (const v of f.v) {
        pos.push(v[0], v[1], v[2]);
        nrm.push(f.n[0], f.n[1], f.n[2]);
        col.push(table.color[ci] ?? 1, table.color[ci + 1] ?? 1, table.color[ci + 2] ?? 1);
        // Delikatne AO u podstawy dekoracji.
        const ao = f.n[1] === 0 && v[1] === y0 ? 0.72 : 1;
        vox.push(ao, mat, emis);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aVox', new THREE.Float32BufferAttribute(vox, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const treeGeoCache = new Map<string, { geo: THREE.BufferGeometry; vol: TreeVolume }>();

/** Zwalnia wspólne geometrie drzew (dispose całego renderu). */
export function clearTreeCache(): void {
  for (const v of treeGeoCache.values()) v.geo.dispose();
  treeGeoCache.clear();
}

/**
 * Zwalnia geometrie drzew nieużywane przez bieżącą scenę. Warianty zależą od ziarna sceny, więc bez
 * sprzątania pamięć GPU rosłaby z każdą wyprawą (nowe ziarno Łąki / pokoju).
 */
export function pruneTreeCache(keep: ReadonlySet<string>): void {
  for (const [key, v] of treeGeoCache) {
    if (keep.has(key)) continue;
    v.geo.dispose();
    treeGeoCache.delete(key);
  }
}

function treeKey(kind: TreeKind, variantSeed: number): string {
  return `${kind}:${variantSeed}`;
}

function treeGeometry(kind: TreeKind, variantSeed: number): { geo: THREE.BufferGeometry; vol: TreeVolume } {
  const key = treeKey(kind, variantSeed);
  const hit = treeGeoCache.get(key);
  if (hit) return hit;
  const vol = makeTree(kind, variantSeed);
  const m = greedyMesh(paddedFromDense(vol.sx, vol.sy, vol.sz, vol.dense, -vol.px, 0, -vol.pz), blockTable(), { seed: variantSeed });
  const geo = geometryFromMesh(m);
  const out = { geo, vol };
  treeGeoCache.set(key, out);
  return out;
}

function shaftMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vH; varying float vEdge;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vH; varying float vEdge;
      void main() {
        float a = pow(vH, 2.0) * pow(vEdge, 2.5) * 0.12;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

export async function buildSceneMeshes(build: SceneBuild, opts: { seed: number; foliageDensity: number }): Promise<SceneMeshes> {
  const group = new THREE.Group();
  group.name = `scene:${build.kind}`;
  const table = blockTable();
  const world = build.world;
  const terrainMat = createVoxelMaterial();
  const materials: THREE.Material[] = [terrainMat];
  const geometries: THREE.BufferGeometry[] = [];
  const terrain: THREE.Mesh[] = [];
  let triangles = 0;
  const jitter = terrainJitter(opts.seed);
  const skipBelow = build.island.surfaceY - 3;

  // ── Teren w porcjach (pełna wysokość).
  const cx0 = Math.floor(world.minX / MESH_CHUNK);
  const cx1 = Math.floor(world.maxX / MESH_CHUNK);
  const cz0 = Math.floor(world.minZ / MESH_CHUNK);
  const cz1 = Math.floor(world.maxZ / MESH_CHUNK);
  const sy = world.maxY - world.minY + 1;
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const vol = world.extract(cx * MESH_CHUNK, world.minY, cz * MESH_CHUNK, MESH_CHUNK, sy, MESH_CHUNK);
      const m = greedyMesh(vol, table, { jitter, skipBottomBelow: skipBelow });
      if (m.quads === 0) continue;
      const geo = geometryFromMesh(m);
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, terrainMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `chunk ${cx},${cz}`;
      group.add(mesh);
      terrain.push(mesh);
      triangles += m.indices.length / 3;
      await yieldFrame();
    }

  // ── Woda.
  let water: THREE.Mesh | null = null;
  {
    const vol = world.extract(world.minX, world.minY, world.minZ, world.maxX - world.minX + 1, sy, world.maxZ - world.minZ + 1);
    const wm = meshWater(vol, B.water);
    if (wm.quads > 0) {
      const geo = geometryFromWater(wm);
      geometries.push(geo);
      const mat = createWaterMaterial();
      materials.push(mat);
      water = new THREE.Mesh(geo, mat);
      water.receiveShadow = true;
      water.renderOrder = 2;
      water.name = 'water';
      group.add(water);
      triangles += wm.indices.length / 3;
    }
  }

  // ── Dekoracje (płoty, stół, karty): 2 siatki — rzucające cień i drobiazgi bez cienia.
  for (const withShadow of [true, false]) {
    const g = decorGeometry(build, withShadow);
    if (!g) continue;
    geometries.push(g);
    const mesh = new THREE.Mesh(g, terrainMat);
    mesh.castShadow = withShadow;
    mesh.receiveShadow = true;
    mesh.name = withShadow ? 'decor' : 'decor-small';
    group.add(mesh);
    triangles += (g.index?.count ?? 0) / 3;
  }

  // ── Roślinność.
  const foliage = buildFoliage(build.foliage, opts.foliageDensity);
  for (const f of foliage.meshes) group.add(f.mesh);

  // ── Drzewa (3 warianty na rodzaj, wspólne geometrie).
  const trees: TreeObject[] = [];
  const treeColliders: { x: number; z: number; r: number }[] = [];
  const treeKeys = new Set<string>();
  for (const t of build.trees) {
    const variant = t.kind === 'bigOak' ? opts.seed : ((opts.seed * 31 + (t.seed % 3)) >>> 0);
    treeKeys.add(treeKey(t.kind, variant));
    const { geo, vol } = treeGeometry(t.kind, variant);
    const mesh = new THREE.Mesh(geo, terrainMat);
    mesh.position.set(t.x, t.y, t.z);
    mesh.rotation.y = (t.rot * Math.PI) / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `tree:${t.kind}`;
    mesh.updateMatrixWorld(true);
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    // Strefa zasłaniania: korona i pień (bez samego dołu, żeby nie zanikały od stóp bohatera).
    box.min.y = t.y + Math.min(1.2, vol.height * 0.3);
    const worldToVol = new THREE.Matrix4().makeTranslation(vol.px, 0, vol.pz).multiply(mesh.matrixWorld.clone().invert());
    trees.push({ mesh, box, vol, worldToVol, fade: 1, target: 1, opaqueMat: terrainMat, fadeMat: null, depthMesh: null });
    treeColliders.push({ x: t.x, z: t.z, r: vol.collider });
    triangles += (geo.index?.count ?? 0) / 3;
  }

  // ── Światła punktowe (latarnie, ogniska, portal).
  const lights: FlickerLight[] = build.lights.map((l, i) => {
    const light = new THREE.PointLight(new THREE.Color(l.color), l.intensity, l.distance, 1.6);
    light.position.set(l.x, l.y, l.z);
    light.castShadow = false;
    group.add(light);
    return { light, base: l.intensity, phase: i * 1.7, flicker: !!l.flicker };
  });

  // ── Snopy światła (jaskinia).
  const shafts: THREE.Mesh[] = [];
  for (const s of build.lightShafts ?? []) {
    const h = 14;
    const geo = new THREE.CylinderGeometry(s.radius * 0.45, s.radius, h, 24, 1, true);
    // uv.y: 1 u góry, 0 na dole → odwracamy, żeby jaśniej było przy podłodze.
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    geometries.push(geo);
    const mat = shaftMaterial(new THREE.Color('#ffe9b8'));
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, s.y + h / 2, s.z);
    mesh.rotation.z = 0.18;
    mesh.rotation.x = -0.12;
    mesh.renderOrder = 5;
    mesh.name = 'shaft';
    group.add(mesh);
    shafts.push(mesh);
  }

  return {
    group,
    terrain,
    water,
    foliage,
    trees,
    treeColliders,
    lights,
    shafts,
    triangles,
    treeKeys,
    dispose() {
      foliage.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of trees) t.fadeMat?.dispose();
      group.removeFromParent();
    },
  };
}

/** Ustawia przezroczystość drzewa (zanikanie, gdy zasłania bohatera). */
export function applyTreeFade(t: TreeObject): void {
  if (t.fade >= 0.999) {
    if (t.mesh.material !== t.opaqueMat) {
      t.mesh.material = t.opaqueMat;
      t.mesh.renderOrder = 0;
    }
    if (t.depthMesh) t.depthMesh.visible = false;
    return;
  }
  if (!t.fadeMat) t.fadeMat = createVoxelMaterial({ transparent: true, opacity: t.fade });
  if (!t.depthMesh) {
    t.depthMesh = new THREE.Mesh(t.mesh.geometry, depthOnlyMat);
    t.depthMesh.castShadow = false;
    t.depthMesh.receiveShadow = false;
    t.depthMesh.renderOrder = 6;
    t.mesh.add(t.depthMesh);
  }
  t.depthMesh.visible = true;
  t.fadeMat.opacity = t.fade;
  if (t.mesh.material !== t.fadeMat) {
    t.mesh.material = t.fadeMat;
    t.mesh.renderOrder = 7;
  }
}
