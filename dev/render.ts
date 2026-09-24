/**
 * Harness deweloperski silnika renderowania (src/render/).
 * Użycie: npx vite --port 5311 → http://localhost:5311/dev/render.html[?q=high&dpr=2&scene=meadow&tod=day&hud=0]
 * Klawiatura: WASD / strzałki — ruch bohatera. window.__demo(stan) — sceny do zrzutów ekranu:
 *   'base' | 'meadow' | 'room-fight' | 'room-chest' | 'room-rest' | 'room-boss' | 'dawn' | 'day' | 'dusk' | 'night'
 *   'title-orbit' | 'portraits' | 'fade' | 'transform' | 'combat' | 'stats'
 */
import * as THREE from 'three';
import { createRender } from '../src/render';
import type { AnimName, EntityId, ModelId, QualityLevel, RenderApi, SceneInfo, TimeOfDay, BurstKind } from '../src/game/contracts';
import type { FxApi, ModelFactory, ModelRig, ParticleSystem, TransformContext } from '../src/render/models/types';

// ───────────── Zastępcze modele (gdy render/models nie jest gotowe) ─────────────

function placeholderFactory(): ModelFactory {
  const colors: Record<string, string> = { hero: '#3fa7ff', creature: '#7ee081', enemy: '#b5e61d', glam: '#ffc6e8', npc: '#c89c6a', prop: '#b98a58' };
  return {
    ids: ['hero'],
    create(id: ModelId): ModelRig {
      const root = new THREE.Group();
      const kind = id.split(':')[0] ?? 'prop';
      const h = kind === 'prop' ? 1.2 : kind === 'hero' ? 1.7 : 1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), new THREE.MeshLambertMaterial({ color: colors[kind] ?? '#fff' }));
      mesh.position.y = h / 2;
      mesh.castShadow = true;
      root.add(mesh);
      let t = 0;
      let current: AnimName = 'idle';
      return {
        root,
        height: h,
        radius: 0.45,
        get current() {
          return current;
        },
        update(dt) {
          t += dt;
          mesh.position.y = h / 2 + (current === 'walk' ? Math.abs(Math.sin(t * 9)) * 0.12 : Math.sin(t * 2) * 0.03);
        },
        play(anim) {
          current = anim;
          return new Promise((r) => setTimeout(r, ['idle', 'walk', 'windup', 'dance', 'sleep'].includes(anim) ? 0 : 500));
        },
        setHighlight() {},
        dispose() {
          mesh.geometry.dispose();
        },
      };
    },
  };
}

function placeholderFx(): FxApi {
  return {
    createParticles(): ParticleSystem {
      const object = new THREE.Group();
      return { object, burst(_p: THREE.Vector3, _k: BurstKind) {}, update() {}, dispose() {} };
    },
    playTransform(ctx: TransformContext) {
      return new Promise((resolve) => {
        let t = 0;
        const step = (): void => {
          t += 1 / 60;
          ctx.from.root.scale.setScalar(Math.max(0, 1 - t * 2));
          ctx.to.root.scale.setScalar(Math.min(1, Math.max(0, t * 2 - 1)));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        step();
      });
    },
  };
}

async function loadModels(): Promise<{ models: ModelFactory; fx: FxApi; real: boolean }> {
  const mods = import.meta.glob('../src/render/models/index.ts');
  const loader = Object.values(mods)[0];
  if (loader) {
    try {
      const m = (await loader()) as { createModelFactory?: () => ModelFactory; createFx?: () => FxApi };
      if (m.createModelFactory && m.createFx) return { models: m.createModelFactory(), fx: m.createFx(), real: true };
    } catch (err) {
      console.warn('[dev/render] render/models niegotowe — modele zastępcze', err);
    }
  }
  return { models: placeholderFactory(), fx: placeholderFx(), real: false };
}

// ───────────── Harness ─────────────

const params = new URLSearchParams(location.search);
const container = document.getElementById('game') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const portraitsBox = document.getElementById('portraits') as HTMLElement;
if (params.get('hud') === '0') hud.classList.add('hidden');

const { models, fx, real } = await loadModels();
const quality = (params.get('q') as QualityLevel | null) ?? 'medium';
const dpr = params.get('dpr') ? Number(params.get('dpr')) : undefined;
const render = createRender({ container, models, fx, quality, pixelRatio: dpr });
render.start();
(window as unknown as { render: RenderApi }).render = render;

let info: SceneInfo | null = null;
let hero: EntityId | null = null;
let tod: TimeOfDay = (params.get('tod') as TimeOfDay | null) ?? 'day';
let label = '';
const extra: EntityId[] = [];

function frames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let c = 0;
    const off = render.onFrame(() => {
      if (++c >= n) {
        off();
        resolve();
      }
    });
  });
}

function poi(id: string): { x: number; z: number } {
  const p = info?.pois.find((q) => q.id === id);
  return p ? p.pos : (info?.spawn ?? { x: 0, z: 0 });
}

async function load(kind: 'base' | 'meadow' | 'dungeon-room', room?: 'fight' | 'chest' | 'rest' | 'boss'): Promise<void> {
  label = room ? `room-${room}` : kind;
  extra.length = 0;
  info = await render.loadScene({ kind, seed: 20260924, timeOfDay: tod, ...(room ? { room: { kind: room, index: 1 } } : {}) });
  hero = render.spawn('hero', info.spawn, { facing: Math.PI });
  render.setHero(hero);
  render.cameraFollow(hero);
  render.setHeroFrozen(false);
  if (kind === 'meadow') {
    const add = (m: ModelId, at: string): void => {
      const p = poi(at);
      const id = render.spawn(m, { x: p.x + 1, z: p.z + 0.5 });
      render.wander(id, p, 3);
      extra.push(id);
    };
    add('creature:plusik', 'den-plusik');
    add('creature:dopelniak', 'den-dopelniak');
    add('creature:blizniak', 'den-blizniak');
    // Plusik blisko startu (do zrzutu).
    const s = info.spawn;
    const pl = render.spawn('creature:plusik', { x: s.x + 3, z: s.z - 3 });
    render.wander(pl, { x: s.x + 3, z: s.z - 3 }, 2.5);
    extra.push(pl);
  }
  if (kind === 'base') {
    const pc = poi('pen-center');
    for (const m of ['creature:plusik', 'creature:dopelniak', 'creature:blizniak'] as ModelId[]) {
      const id = render.spawn(m, { x: pc.x + Math.random() * 2 - 1, z: pc.z + Math.random() * 2 - 1 });
      render.wander(id, pc, 3.5);
      extra.push(id);
    }
    ['glam:slimakorro', 'glam:trzmielini', 'glam:grzybello'].forEach((m, i) => {
      const p = poi(`glam-${i * 2 + 1}`);
      const id = render.spawn(m as ModelId, p, { facing: 0.4 });
      void render.play(id, 'dance');
      extra.push(id);
    });
  }
  if (kind === 'dungeon-room' && (room === 'fight' || room === 'boss')) {
    const hs = poi('hero-spot');
    const es = poi('enemy-spot-0');
    render.setPosition(hero, hs);
    render.faceTowards(hero, es);
    const enemy = render.spawn(room === 'boss' ? 'enemy:kosiarrini' : 'enemy:slimakorro', es);
    render.faceTowards(enemy, hs);
    extra.push(enemy);
    if (room === 'fight') {
      const e1 = poi('enemy-spot-1');
      const second = render.spawn('enemy:trzmielini', e1);
      render.faceTowards(second, hs);
      extra.push(second);
    }
    render.setHeroFrozen(true);
    render.cameraCombat(hero, enemy);
  }
  await frames(6);
}

async function logStats(tag: string): Promise<ReturnType<RenderApi['getStats']>> {
  await frames(4);
  const s = render.getStats();
  console.log(`[stats] ${tag}`, JSON.stringify(s));
  return s;
}

const demos: Record<string, () => Promise<unknown>> = {
  base: async () => {
    await load('base');
    return logStats('base');
  },
  meadow: async () => {
    await load('meadow');
    return logStats('meadow');
  },
  'room-fight': async () => {
    await load('dungeon-room', 'fight');
    return logStats('room-fight');
  },
  'room-chest': async () => {
    await load('dungeon-room', 'chest');
    return logStats('room-chest');
  },
  'room-rest': async () => {
    await load('dungeon-room', 'rest');
    return logStats('room-rest');
  },
  'room-boss': async () => {
    await load('dungeon-room', 'boss');
    return logStats('room-boss');
  },
  dawn: () => setTod('dawn'),
  day: () => setTod('day'),
  dusk: () => setTod('dusk'),
  night: () => setTod('night'),
  'meadow-gate': async () => {
    if (label !== 'meadow') await load('meadow');
    const g = poi('gate-dungeon');
    if (hero !== null) render.setPosition(hero, { x: g.x + 1, z: g.z + 1.5 });
    await frames(30);
    return logStats('meadow-gate');
  },
  'base-north': async () => {
    if (label !== 'base') await load('base');
    const g = poi('station-galeria');
    if (hero !== null) render.setPosition(hero, { x: g.x, z: g.z + 1 });
    await frames(30);
    return logStats('base-north');
  },
  'title-orbit': async () => {
    if (label !== 'base' && label !== 'meadow') await load('meadow');
    render.cameraOrbit({ x: 0, y: 14, z: 0 }, 58, 0.05);
    await frames(20);
    return logStats('title-orbit');
  },
  fade: async () => {
    if (label !== 'meadow') await load('meadow');
    // Stań za drzewem (od strony kamery drzewo zasłania bohatera).
    const b = (render as unknown as { debug: { sceneBuild(): { trees: { x: number; z: number; kind: string }[] } | null } }).debug.sceneBuild();
    const t = b?.trees.find((tr) => tr.kind === 'oak' || tr.kind === 'blossom' || tr.kind === 'autumn');
    if (t && hero !== null) render.setPosition(hero, { x: t.x - 1.2, z: t.z - 2.8 });
    await frames(40);
    return logStats('fade');
  },
  combat: async () => {
    await load('dungeon-room', 'fight');
    return logStats('combat');
  },
  transform: async () => {
    await load('dungeon-room', 'fight');
    const enemy = extra[0];
    if (enemy === undefined) return null;
    const p = render.transform(enemy, 'glam:slimakorro');
    await frames(40);
    await p;
    return logStats('transform');
  },
  portraits: async () => {
    const ids: ModelId[] = [
      'hero',
      'creature:plusik',
      'creature:dopelniak',
      'creature:blizniak',
      'creature:koniczynek',
      'npc:kartonini',
      'enemy:slimakorro',
      'enemy:trzmielini',
      'enemy:grzybello',
      'enemy:kosiarrini',
      'glam:slimakorro',
      'glam:trzmielini',
    ];
    portraitsBox.innerHTML = '';
    portraitsBox.style.display = 'grid';
    for (const id of ids) {
      const url = await render.portrait(id, 256);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = url;
      fig.append(img, document.createTextNode(id));
      portraitsBox.append(fig);
    }
    return ids.length;
  },
  stats: () => logStats(label),
  drawinfo: async () => {
    const dbg = (render as unknown as { debug: { scene: THREE.Scene } }).debug;
    const counts: Record<string, number> = {};
    dbg.scene.traverseVisible((o) => {
      if (!(o as THREE.Mesh).isMesh && !(o as THREE.Points).isPoints) return;
      let top: THREE.Object3D = o;
      while (top.parent && top.parent !== dbg.scene && !top.name.startsWith('entity:')) top = top.parent;
      const key = top.name || top.type;
      counts[key] = (counts[key] ?? 0) + 1;
    });
    console.log('[drawinfo]', JSON.stringify(counts));
    return counts;
  },
};

async function setTod(t: TimeOfDay): Promise<unknown> {
  tod = t;
  render.setTimeOfDay(t);
  await frames(50);
  return logStats(`${label}-${t}`);
}

(window as unknown as { __demo: (s: string) => Promise<unknown> }).__demo = async (s: string) => {
  portraitsBox.style.display = 'none';
  const fn = demos[s];
  if (!fn) throw new Error(`nieznany stan: ${s}`);
  return fn();
};

// ───────────── Sterowanie klawiaturą ─────────────
const keys = new Set<string>();
const updateInput = (): void => {
  const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const y = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const l = Math.hypot(x, y) || 1;
  render.setHeroInput({ x: x / l, y: y / l });
};
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  updateInput();
  if (e.key === ' ' && hero !== null) {
    const p = render.getPosition(hero);
    render.burst({ x: p.x, y: p.y + 1, z: p.z }, 'sparkle');
    void render.play(hero, 'cheer');
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  updateInput();
});

// ───────────── Panel ─────────────
function button(text: string, onClick: () => void, on = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  if (on) b.classList.add('on');
  b.addEventListener('click', onClick);
  return b;
}
const rowQ = document.createElement('div');
rowQ.className = 'row';
const qButtons: HTMLButtonElement[] = [];
for (const q of ['low', 'medium', 'high'] as QualityLevel[]) {
  const b = button(q, () => {
    render.setQuality(q);
    qButtons.forEach((x) => x.classList.toggle('on', x === b));
  }, q === quality);
  qButtons.push(b);
  rowQ.append(b);
}
rowQ.append(
  button('auto', () => {
    void render.autoDetectQuality().then((q) => {
      qButtons.forEach((x) => x.classList.toggle('on', x.textContent === q));
      console.log('[auto] →', q);
    });
  }),
);
const rowS = document.createElement('div');
rowS.className = 'row';
for (const s of ['base', 'meadow', 'room-fight', 'room-chest', 'room-rest', 'room-boss', 'title-orbit', 'portraits']) rowS.append(button(s, () => void (window as unknown as { __demo: (s: string) => Promise<unknown> }).__demo(s)));
const rowT = document.createElement('div');
rowT.className = 'row';
for (const t of ['dawn', 'day', 'dusk', 'night']) rowT.append(button(t, () => void setTod(t as TimeOfDay)));
const stats = document.createElement('div');
stats.id = 'stats';
hud.append(rowQ, rowS, rowT, stats);
setInterval(() => {
  const s = render.getStats();
  stats.textContent = `${label} · ${s.quality} · ${real ? 'modele' : 'zastępcze'}\nfps ${s.fps.toFixed(0)}  klatka ${s.frameMs.toFixed(1)} ms  skala ${(s.renderScale * 100).toFixed(0)}%\ndraw ${s.drawCalls}  tri ${(s.triangles / 1000).toFixed(1)}k`;
}, 500);

const start = params.get('scene') ?? 'meadow';
await (window as unknown as { __demo: (s: string) => Promise<unknown> }).__demo(start);
