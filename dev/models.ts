/**
 * Harness deweloperski: galeria wszystkich modeli (render/models) + efekty.
 *   window.__demo('gallery' | 'anim:<name>[@t]' | 'transform[@t]' | 'particles[@t]' | 'closeup:<id>[@<anim>[:t]]'
 *                 | 'pair:<gatunek>' | 'lineup' | 'game' | 'highlight')
 *   '@t' = zasymuluj t sekund i zatrzymaj czas (do zrzutów ekranu).
 */
import '@fontsource/nunito/latin-ext-800.css';
import '@fontsource/nunito/latin-ext-700.css';
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, HueSaturationEffect, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import type { AnimName, BurstKind, ModelId } from '../src/game/contracts';
import { createFx, createModelFactory, MODEL_IDS } from '../src/render/models';
import type { ModelRig, ParticleSystem } from '../src/render/models/types';

const NAMES: Record<string, string> = {
  hero: 'Bohater',
  'creature:plusik': 'Plusik',
  'creature:dopelniak': 'Dopełniak',
  'creature:blizniak': 'Bliźniak',
  'creature:koniczynek': 'Koniczynek',
  'enemy:slimakorro': 'Ślimakorro Buciorro',
  'enemy:trzmielini': 'Trzmielini Tostini',
  'enemy:grzybello': 'Grzybello Kalafiorello',
  'enemy:kosiarrini': 'Kosiarrini Chwastorrini',
  'glam:slimakorro': 'Ślimakella Glamella',
  'glam:trzmielini': 'Trzmielina Brokatina',
  'glam:grzybello': 'Grzybella Perłella',
  'glam:kosiarrini': 'Kwiatorra, Królowa Łąki',
  'npc:kartonini': 'Handlarz Kartonini',
  'prop:chest': 'Skrzynia',
  'prop:gate': 'Brama',
  'prop:portal': 'Portal',
  'prop:campfire': 'Ognisko',
  'prop:anvil': 'Kowadło',
  'prop:treasury': 'Skarbiec',
  'prop:board': 'Tablica Wypraw',
  'prop:podium': 'Podium',
  'prop:vine': 'Pnącze',
  'prop:lantern': 'Latarnia',
  'prop:mushroom': 'Grzyb',
  'prop:crystal': 'Kryształ',
  'prop:den': 'Legowisko',
  'prop:sign': 'Drogowskaz',
};

// ───────────────────────────── scena ─────────────────────────────
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const SKY = new THREE.Color('#9fd8ff');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 40, 90);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 200);

const hemi = new THREE.HemisphereLight('#d6ecff', '#6f8f4a', 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

function aimSun(focus: THREE.Vector3, extent: number): void {
  sun.target.position.copy(focus);
  sun.position.copy(focus).add(new THREE.Vector3(-7, 14, 9));
  const cam = sun.shadow.camera;
  cam.left = -extent;
  cam.right = extent;
  cam.top = extent;
  cam.bottom = -extent;
  cam.near = 1;
  cam.far = 60;
  cam.updateProjectionMatrix();
}

// trawa: płytki 16×16 z lekkim szumem (styl kostkowy)
function grassTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const g = cv.getContext('2d');
  if (g) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const v = Math.abs(n);
        g.fillStyle = v > 0.8 ? '#86d45e' : v > 0.4 ? '#7cc956' : v > 0.15 ? '#74bf4f' : '#6db64a';
        g.fillRect(x, y, 1, 1);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(0, 15, 16, 1);
    g.fillRect(15, 0, 1, 16);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(300, 300);
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ map: grassTexture() }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const qs = new URLSearchParams(location.search);
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: Number(qs.get('msaa') ?? '4') });
// licznik czasu klatki (diagnostyka zrzutów w SwiftShader)
let frameMs = 0;
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({ luminanceThreshold: 0.95, luminanceSmoothing: 0.25, intensity: 1.1, mipmapBlur: true, radius: 0.62 });
const params = new URLSearchParams(location.search);
const TM: Record<string, ToneMappingMode> = { agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, neutral: ToneMappingMode.NEUTRAL };
const tmMode = TM[params.get('tm') ?? 'aces'] ?? ToneMappingMode.ACES_FILMIC;
const sat = Number(params.get('sat') ?? '0.05');
composer.addPass(new EffectPass(camera, bloom, new HueSaturationEffect({ saturation: sat }), new ToneMappingEffect({ mode: tmMode })));

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ───────────────────────────── modele ─────────────────────────────
const factory = createModelFactory();
const fx = createFx();
const particles: ParticleSystem = fx.createParticles();
scene.add(particles.object);

interface Item {
  id: ModelId;
  rig: ModelRig;
  label: HTMLDivElement | null;
}
const gallery = new THREE.Group();
scene.add(gallery);
const stage = new THREE.Group();
stage.position.set(100, 0, 0);
scene.add(stage);
const items: Item[] = [];
let stageItems: Item[] = [];
const labelsEl = document.getElementById('labels') as HTMLDivElement;
const hud = document.getElementById('hud') as HTMLDivElement;

function makeLabel(id: ModelId): HTMLDivElement {
  const d = document.createElement('div');
  const cls = id.startsWith('enemy:') ? 'rot' : id.startsWith('glam:') ? 'glam' : id.startsWith('prop:') ? 'prop' : '';
  d.className = `lbl ${cls}`;
  d.innerHTML = `${NAMES[id] ?? id}<small>${id}</small>`;
  labelsEl.appendChild(d);
  return d;
}

// układ galerii: rzędy
const LAYOUT: { z: number; ids: ModelId[]; gap: number }[] = [
  { z: 5.2, gap: 2.3, ids: ['hero', 'creature:plusik', 'creature:dopelniak', 'creature:blizniak', 'creature:koniczynek', 'npc:kartonini'] },
  { z: 1.6, gap: 2.5, ids: ['enemy:slimakorro', 'glam:slimakorro', 'enemy:trzmielini', 'glam:trzmielini', 'enemy:grzybello', 'glam:grzybello'] },
  {
    z: -2.4,
    gap: 2.05,
    ids: ['prop:chest', 'prop:campfire', 'prop:anvil', 'prop:lantern', 'prop:mushroom', 'prop:crystal', 'prop:den', 'prop:sign', 'prop:podium', 'prop:vine'],
  },
  { z: -7.6, gap: 4.4, ids: ['enemy:kosiarrini', 'glam:kosiarrini', 'prop:gate', 'prop:portal', 'prop:treasury', 'prop:board'] },
];
const placed = new Set<ModelId>();
for (const row of LAYOUT) {
  const w = (row.ids.length - 1) * row.gap;
  row.ids.forEach((id, i) => {
    const rig = factory.create(id);
    rig.root.position.set(-w / 2 + i * row.gap, 0, row.z);
    gallery.add(rig.root);
    items.push({ id, rig, label: makeLabel(id) });
    placed.add(id);
  });
}
for (const id of MODEL_IDS) if (!placed.has(id)) console.warn('model not in gallery layout:', id);

// ───────────────────────────── kamera i czas ─────────────────────────────
let camTarget = new THREE.Vector3();
function lookFrom(target: THREE.Vector3, dist: number, elev: number, yaw = 0): void {
  camTarget = target.clone();
  const e = THREE.MathUtils.degToRad(elev);
  const y = THREE.MathUtils.degToRad(yaw);
  camera.position.set(target.x + Math.sin(y) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z + Math.cos(y) * Math.cos(e) * dist);
  camera.lookAt(target);
}

let paused = false;
let orbit = 0;
function stepWorld(dt: number): void {
  for (const it of items) it.rig.update(dt);
  for (const it of stageItems) it.rig.update(dt);
  particles.update(dt);
  extraTick?.(dt);
}
let extraTick: ((dt: number) => void) | null = null;
function simulate(seconds: number): void {
  let t = seconds;
  while (t > 1e-6) {
    const d = Math.min(1 / 60, t);
    stepWorld(d);
    t -= d;
  }
}

function clearStage(): void {
  for (const it of stageItems) {
    it.rig.dispose();
    it.label?.remove();
  }
  stageItems = [];
  extraTick = null;
}

function addToStage(id: ModelId, x: number, z = 0, withLabel = true, facing = 0): Item {
  const rig = factory.create(id);
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = facing;
  stage.add(rig.root);
  const it: Item = { id, rig, label: withLabel ? makeLabel(id) : null };
  stageItems.push(it);
  return it;
}

function showGallery(on: boolean): void {
  gallery.visible = on;
  for (const it of items) if (it.label) it.label.style.display = on ? '' : 'none';
}

function parseT(s: string): [string, number | null] {
  const m = s.match(/^(.*)@([\d.]+)$/);
  return m ? [m[1] ?? s, Number(m[2])] : [s, null];
}

function setHud(text: string): void {
  hud.innerHTML = `${text}<br><small>__demo('gallery' | 'anim:attack' | 'closeup:hero' | 'transform' | 'particles' | 'pair:slimakorro' | 'game')</small>`;
}

function stageFocus(h: number, x = 0): THREE.Vector3 {
  return new THREE.Vector3(stage.position.x + x, h, 0);
}

function demo(state: string): string {
  paused = false;
  orbit = 0;
  clearStage();
  for (const it of items) it.rig.setHighlight(false);
  if (state === 'gallery' || state === 'highlight') {
    showGallery(true);
    for (const it of items) void it.rig.play('idle');
    if (state === 'highlight') for (const it of items) it.rig.setHighlight(true);
    lookFrom(new THREE.Vector3(0, 0.2, -0.6), 25.5, 42);
    aimSun(new THREE.Vector3(0, 0, -1), 16);
    setHud('Galeria — wszystkie modele (idle)');
    return state;
  }
  if (state.startsWith('anim:')) {
    const [rest, t] = parseT(state.slice(5));
    const anim = rest as AnimName;
    showGallery(true);
    for (const it of items) void it.rig.play(anim);
    lookFrom(new THREE.Vector3(0, 0.2, -0.6), 25.5, 42);
    aimSun(new THREE.Vector3(0, 0, -1), 16);
    if (t !== null) {
      simulate(t);
      paused = true;
    }
    setHud(`Galeria — animacja: ${anim}${t !== null ? ` @ ${t}s` : ''}`);
    return state;
  }
  showGallery(false);
  if (state.startsWith('closeup:')) {
    // closeup:<id>[@<anim>[:t]]
    const body = state.slice(8);
    const [idPart, animPart] = body.split('@') as [string, string | undefined];
    const id = idPart as ModelId;
    const it = addToStage(id, 0, 0, false);
    const h = it.rig.height;
    const big = h > 2.5;
    lookFrom(stageFocus(h * 0.48), Math.max(2.4, h * 1.75 + it.rig.radius * 1.2), big ? 22 : 18, 28);
    aimSun(stageFocus(0), Math.max(4, h * 1.4));
    let label = `${NAMES[id] ?? id}`;
    if (animPart) {
      const [anim, ts] = animPart.split(':') as [string, string | undefined];
      void it.rig.play(anim as AnimName);
      label += ` — ${anim}`;
      if (ts !== undefined) {
        simulate(Number(ts));
        paused = true;
        label += ` @ ${ts}s`;
      }
    } else {
      simulate(0.5);
    }
    setHud(`Zbliżenie: ${label}`);
    return state;
  }
  if (state.startsWith('pair:')) {
    const [sp, t] = parseT(state.slice(5));
    const a = addToStage(`enemy:${sp}` as ModelId, -1.3 * (sp === 'kosiarrini' ? 2.2 : 1), 0, true, 0.35);
    const b = addToStage(`glam:${sp}` as ModelId, 1.3 * (sp === 'kosiarrini' ? 2.2 : 1), 0, true, -0.35);
    const h = Math.max(a.rig.height, b.rig.height);
    lookFrom(stageFocus(h * 0.45), h * 2.2 + 3.2, 18, 0);
    aimSun(stageFocus(0), h * 2 + 2);
    if (t !== null) {
      simulate(t);
      paused = true;
    }
    setHud(`Brainrot → brainglam: ${sp}`);
    return state;
  }
  if (state === 'lineup') {
    const ids: ModelId[] = ['creature:plusik', 'creature:koniczynek', 'hero', 'enemy:slimakorro', 'enemy:trzmielini', 'enemy:grzybello', 'npc:kartonini'];
    ids.forEach((id, i) => addToStage(id, (i - 3) * 1.6));
    lookFrom(stageFocus(0.9), 11.5, 14);
    aimSun(stageFocus(0), 8);
    simulate(0.3);
    setHud('Porównanie wielkości');
    return state;
  }
  if (state.startsWith('game')) {
    // ujęcie jak w grze: stała kamera ~50° z góry
    const [, t] = parseT(state);
    addToStage('hero', -1.2, 0.8, false, 0.8);
    const p = addToStage('creature:plusik', -2.6, 2.0, false, 0.4);
    addToStage('enemy:grzybello', 2.2, -0.6, false, -2.2);
    addToStage('prop:lantern', 4.2, 1.5, false);
    addToStage('prop:mushroom', -4.0, -1.2, false);
    addToStage('prop:chest', 0.6, -3.0, false);
    addToStage('creature:dopelniak', -3.4, -2.2, false, 0.9);
    void p.rig.play('walk');
    lookFrom(stageFocus(0.5, 0), 17, 52);
    aimSun(stageFocus(0), 10);
    if (t !== null) {
      simulate(t);
      paused = true;
    }
    setHud('Ujęcie z gry (kamera ~50°)');
    return state;
  }
  if (state.startsWith('transform')) {
    const [rest, t] = parseT(state);
    const sp = rest.split(':')[1] ?? 'slimakorro';
    const from = addToStage(`enemy:${sp}` as ModelId, 0, 0, false);
    const to = addToStage(`glam:${sp}` as ModelId, 0, 0, false);
    to.rig.root.scale.setScalar(0);
    const h = Math.max(from.rig.height, to.rig.height);
    lookFrom(stageFocus(h * 0.55), h * 2.1 + 3, 16, 20);
    aimSun(stageFocus(0), h * 2 + 2);
    const t0 = performance.now();
    void fx.playTransform({ scene, particles, from: from.rig, to: to.rig }).then(() => {
      setHud(`Przemiana: ${sp} — gotowe (${((performance.now() - t0) / 1000).toFixed(2)} s realnie)`);
    });
    if (t !== null) {
      simulate(t);
      paused = true;
    }
    setHud(`Przemiana: ${sp}${t !== null ? ` @ ${t}s` : ''}`);
    return state;
  }
  if (state.startsWith('particles')) {
    const [, t] = parseT(state);
    const kinds: BurstKind[] = ['sparkle', 'hit', 'crit', 'block', 'heal', 'catch', 'digits', 'poof'];
    const spots = kinds.map((k, i) => ({ k, pos: new THREE.Vector3(stage.position.x + (i - 3.5) * 2.1, 1.2, 0) }));
    for (const s of spots) {
      const lab = document.createElement('div');
      lab.className = 'lbl';
      lab.textContent = s.k;
      labelsEl.appendChild(lab);
      stageItems.push({ id: 'prop:sign', rig: dummyRig(s.pos), label: lab });
    }
    const fire = (): void => {
      for (const s of spots) particles.burst(s.pos, s.k);
    };
    fire();
    let acc = 0;
    extraTick = dt => {
      acc += dt;
      if (acc > 1.6) {
        acc = 0;
        fire();
      }
    };
    lookFrom(stageFocus(1.3), 13, 12);
    aimSun(stageFocus(0), 10);
    if (t !== null) {
      simulate(t);
      paused = true;
    }
    setHud(`Cząsteczki${t !== null ? ` @ ${t}s` : ''}`);
    return state;
  }
  setHud(`Nieznany stan: ${state}`);
  return 'unknown';
}

/** Pusty „rig” tylko do pozycjonowania etykiety cząstek. */
function dummyRig(pos: THREE.Vector3): ModelRig {
  const root = new THREE.Group();
  root.position.copy(pos).sub(stage.position).setY(0);
  stage.add(root);
  return {
    root,
    height: 2.6,
    radius: 0,
    current: 'idle',
    update: () => {},
    play: () => Promise.resolve(),
    setHighlight: () => {},
    dispose: () => root.removeFromParent(),
  };
}

// ───────────────────────────── pętla ─────────────────────────────
const _v = new THREE.Vector3();
function placeLabels(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const all = [...items.filter(() => gallery.visible), ...stageItems];
  for (const it of all) {
    if (!it.label) continue;
    it.rig.root.getWorldPosition(_v);
    _v.y += it.rig.height + 0.25;
    _v.project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    it.label.style.display = vis ? '' : 'none';
    it.label.style.left = `${((_v.x + 1) / 2) * w}px`;
    it.label.style.top = `${((1 - _v.y) / 2) * h}px`;
  }
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    stepWorld(dt);
    if (orbit) {
      const off = camera.position.clone().sub(camTarget);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit * dt);
      camera.position.copy(camTarget).add(off);
      camera.lookAt(camTarget);
    }
  }
  const t0 = performance.now();
  composer.render(dt);
  frameMs = performance.now() - t0;
  (window as unknown as { __frameMs: number }).__frameMs = frameMs;
  placeLabels();
  requestAnimationFrame(frame);
}

// przyciski (ręczne przeglądanie na tablecie)
const bar = document.getElementById('bar') as HTMLDivElement;
const buttons: [string, string][] = [
  ['Galeria', 'gallery'],
  ['Taniec', 'anim:dance'],
  ['Atak', 'anim:attack'],
  ['Przemiana', 'transform'],
  ['Cząsteczki', 'particles'],
  ['Gra', 'game'],
  ['Wielkości', 'lineup'],
];
for (const [label, st] of buttons) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => demo(st));
  bar.appendChild(b);
}
// dotknięcie modelu w galerii → zbliżenie
const ray = new THREE.Raycaster();
canvas.addEventListener('pointerup', e => {
  if (!gallery.visible) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(gallery, true)[0];
  if (!hit) return;
  let o: THREE.Object3D | null = hit.object;
  while (o && !o.userData.modelId) o = o.parent;
  if (o) demo(`closeup:${o.userData.modelId as string}@dance`);
});

declare global {
  interface Window {
    __demo?: (state: string) => string;
  }
}
window.__demo = demo;
const initial = params.get('state') ?? 'gallery';
demo(initial);
requestAnimationFrame(frame);
