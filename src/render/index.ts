/**
 * render/ — implementacja RenderApi (src/game/contracts.ts) na three.js.
 * Modele i efekty są wstrzykiwane (ModelFactory, FxApi z render/models/types.ts) — ten moduł nie importuje
 * render/models/index.ts.
 */
import * as THREE from 'three';
import type {
  AnimName,
  BurstKind,
  EntityId,
  ModelId,
  Poi,
  QualityLevel,
  RenderApi,
  RenderStats,
  SceneInfo,
  SceneRequest,
  ScreenPos,
  TimeOfDay,
  Vec2,
  Vec3,
} from '../game/contracts';
import type { FxApi, ModelFactory, ParticleSystem } from './models/types';
import { CameraRig } from './camera';
import { Engine } from './engine';
import { EntityManager } from './entities';
import { PortraitRenderer } from './portrait';
import { pickQualityFromBenchmark, QUALITY_PRESETS, shouldRenderFrame } from './quality';
import { buildScene, type SceneBuild } from './scenes';
import { Atmosphere } from './world/atmosphere';
import { Ground } from './world/ground';
import { applyTreeFade, buildSceneMeshes, clearTreeCache, type SceneMeshes } from './world/sceneMeshes';
import { worldUniforms } from './voxel/materials';
import { damp } from './util/rng';
import { segmentHitsVoxels } from './world/occlusion';
import { Fireflies } from './world/fireflies';

export interface CreateRenderOptions {
  container: HTMLElement;
  models: ModelFactory;
  fx: FxApi;
  quality?: QualityLevel;
  /** Nadpisanie devicePixelRatio (harness, zrzuty ekranu). */
  pixelRatio?: number;
}

/** Dodatkowe narzędzia (harness, diagnostyka) — poza kontraktem. */
export interface RenderDebug {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  sceneBuild(): SceneBuild | null;
  /** Wymusza klatkę (np. gdy pętla stoi). */
  renderOnce(): void;
}

const HERO_SPEED = 5;

export function createRender(opts: CreateRenderOptions): RenderApi & { readonly debug: RenderDebug } {
  const { container, models, fx } = opts;
  const scene = new THREE.Scene();
  scene.name = 'matematico';
  const cam = new CameraRig(Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight));
  const engine = new Engine(scene, cam.camera, opts.quality ?? 'medium', opts.pixelRatio);
  container.appendChild(engine.canvas);
  const atmosphere = new Atmosphere(scene);
  const entities = new EntityManager(models);
  scene.add(entities.group);
  const particles: ParticleSystem = fx.createParticles();
  scene.add(particles.object);
  const portraits = new PortraitRenderer(engine.renderer, models);
  const fireflies = new Fireflies();
  scene.add(fireflies.points);
  const fireflyColor = new THREE.Color();

  let meshes: SceneMeshes | null = null;
  let build: SceneBuild | null = null;
  let ground: Ground | null = null;
  let timeOfDay: TimeOfDay = 'day';
  let heroId: EntityId | null = null;
  let heroInput = { x: 0, y: 0 };
  let heroFrozen = false;
  let timeScale = 1;
  let tsFrom = 1;
  let tsTo = 1;
  let tsT = 1;
  let tsDur = 0.25;
  const callbacks = new Set<(dt: number) => void>();
  let running = false;
  let rafId = 0;
  let lastRendered = 0;
  let fps = 60;
  let frameMs = 16.7;
  let lastDrawCalls = 0;
  let lastTriangles = 0;
  let lastDrop = -1e9;
  let clock = 0;
  let loadToken = 0;
  let bench: { samples: number[]; until: number; resolve: (q: QualityLevel) => void; prev: QualityLevel } | null = null;
  const tmpV = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const ray = new THREE.Ray();
  const segA = new THREE.Vector3();
  const segB = new THREE.Vector3();

  const lookup = {
    position(id: number): THREE.Vector3 | null {
      const e = entities.get(id);
      return e ? e.holder.position : null;
    },
    height(id: number): number {
      const e = entities.get(id);
      return e ? Math.max(0.5, e.rig.height * e.scale) : 1.5;
    },
  };

  // ── Rozmiar.
  const resize = (): void => {
    engine.resize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  };
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  if (!ro) window.addEventListener('resize', resize);

  // ── Jakość.
  const applyQualityToWorld = (): void => {
    const p = engine.preset;
    atmosphere.configure({
      viewDistance: p.viewDistance,
      fog: p.fog,
      shadowMapSize: p.shadowMapSize || 1024,
      shadowArea: p.shadowArea || 40,
      shadowRadius: p.shadowRadius,
      shadows: p.shadows,
    });
    cam.camera.far = p.viewDistance + 80;
    cam.camera.updateProjectionMatrix();
    entities.setBlobShadows(!p.shadows);
    meshes?.foliage.setDensity(p.foliage);
  };
  applyQualityToWorld();

  // ── Bohater.
  const updateHero = (dt: number): void => {
    if (heroId === null || !ground) return;
    const e = entities.get(heroId);
    if (!e) return;
    const p = e.holder.position;
    const r = Math.max(0.3, Math.min(0.6, e.rig.radius * e.scale));
    if (!heroFrozen && !entities.isMoving(heroId)) {
      const mag = Math.min(1, Math.hypot(heroInput.x, heroInput.y));
      if (mag > 0.08) {
        const { right, up } = cam.screenAxes();
        let dx = right.x * heroInput.x + up.x * heroInput.y;
        let dz = right.y * heroInput.x + up.y * heroInput.y;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const step = HERO_SPEED * mag * dt;
        const fromY = ground.heightAt(p.x, p.z);
        const res = ground.slide(p.x, p.z, dx * step, dz * step, r, Number.isNaN(fromY) ? p.y : fromY, heroId);
        p.x = res.x;
        p.z = res.z;
        e.targetYaw = Math.atan2(dx, dz);
        entities.locomote(heroId, 'walk', 0.7 + 0.6 * mag);
      } else {
        entities.locomote(heroId, 'idle');
      }
    }
    if (!entities.isMoving(heroId)) {
      const gy = ground.standHeight(p.x, p.z, r);
      if (!Number.isNaN(gy)) p.y += (gy - p.y) * damp(gy > p.y ? 18 : 12, dt);
    }
  };

  // ── Zanikanie drzew między kamerą a bohaterem.
  const updateTreeFade = (dt: number): void => {
    if (!meshes) return;
    const hero = heroId !== null ? entities.get(heroId) : undefined;
    const mode = cam.mode.kind;
    const check = !!hero && mode !== 'orbit';
    const from = cam.camera.position;
    for (const t of meshes.trees) {
      let target = 1;
      if (check && hero) {
        const hp = hero.holder.position;
        const cx = (t.box.min.x + t.box.max.x) / 2;
        const cz = (t.box.min.z + t.box.max.z) / 2;
        if (Math.abs(cx - hp.x) < 22 && Math.abs(cz - hp.z) < 22) {
          for (const hy of [0.5, 1.6]) {
            tmpV.set(hp.x, hp.y + hy, hp.z);
            const segLen = from.distanceTo(tmpV);
            ray.origin.copy(from);
            ray.direction.copy(tmpV).sub(from).normalize();
            const hit = ray.intersectBox(t.box, focus);
            if (hit && from.distanceTo(hit) < segLen - 0.3) {
              // Dokładnie: czy odcinek kamera → bohater przechodzi przez kostki drzewa?
              const a = segA.copy(from).applyMatrix4(t.worldToVol);
              const b2 = segB.copy(tmpV).addScaledVector(ray.direction, -0.4).applyMatrix4(t.worldToVol);
              if (segmentHitsVoxels(t.vol.dense, t.vol.sx, t.vol.sy, t.vol.sz, a.x, a.y, a.z, b2.x, b2.y, b2.z)) {
                target = 0.3;
                break;
              }
            }
          }
        }
      }
      t.target = target;
      if (Math.abs(t.fade - t.target) > 0.001) {
        t.fade += (t.target - t.fade) * damp(7, dt);
        if (Math.abs(t.fade - t.target) < 0.01) t.fade = t.target;
        applyTreeFade(t);
      }
    }
  };

  const updateLights = (): void => {
    if (!meshes) return;
    for (const l of meshes.lights) {
      if (!l.flicker) continue;
      const k = 0.82 + 0.12 * Math.sin(clock * 11 + l.phase) + 0.07 * Math.sin(clock * 23.7 + l.phase * 2.3) + 0.04 * Math.sin(clock * 41 + l.phase);
      l.light.intensity = l.base * k;
    }
  };

  // ── Klatka.
  const tick = (dtReal: number, interval: number): void => {
    const t0 = performance.now();
    if (tsT < 1) {
      tsT = Math.min(1, tsT + dtReal / tsDur);
      const e = tsT * tsT * (3 - 2 * tsT);
      timeScale = tsFrom + (tsTo - tsFrom) * e;
    }
    const dt = dtReal * timeScale;
    clock += dt;
    worldUniforms.uTime.value = clock;
    updateHero(dt);
    entities.update(dt, heroId);
    cam.update(dtReal, lookup);
    const hero = heroId !== null ? entities.get(heroId) : undefined;
    if (hero) focus.copy(hero.holder.position);
    else focus.copy(cam.target);
    atmosphere.update(dtReal, focus, cam.camera);
    try {
      particles.update(dt);
    } catch {
      /* efekty nie mogą zatrzymać pętli */
    }
    updateTreeFade(dtReal);
    updateLights();
    {
      const ff = atmosphere.fireflies;
      // Kolor HDR (bloom).
      fireflyColor.copy(ff.color).multiplyScalar(2.6);
      fireflies.update(dt, cam.target, ff.strength, engine.renderer.getPixelRatio(), (x, z) => (ground ? ground.heightAt(x, z) : NaN), fireflyColor);
    }
    for (const s of meshes?.shafts ?? []) s.visible = true;
    for (const cb of callbacks) {
      try {
        cb(dtReal);
      } catch (err) {
        console.error('[render] onFrame callback', err);
      }
    }
    engine.setBloomStrength(atmosphere.bloomStrength);
    engine.setSaturation(atmosphere.saturation);
    const gr = atmosphere.grade;
    engine.setGrade(gr.mul, gr.lift);
    const info = engine.renderer.info;
    info.reset();
    engine.render(dtReal);
    lastDrawCalls = info.render.calls;
    lastTriangles = info.render.triangles;
    const work = performance.now() - t0;
    if (bench) {
      // Synchronizacja z GPU (odczyt 1 piksela) — mierzy realny koszt klatki.
      const gl = engine.renderer.getContext();
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      bench.samples.push(performance.now() - t0);
      if (performance.now() >= bench.until) finishBench();
    }
    // Statystyki i dynamiczna rozdzielczość.
    fps += (1000 / Math.max(1, interval) - fps) * 0.1;
    frameMs += (interval - frameMs) * 0.1;
    if (!bench) {
      const now = performance.now();
      const slow = interval > 18;
      // Przy limicie 60 fps interwał nie spada poniżej ~16,7 ms — „szybko” = trzymamy limit przy małym koszcie CPU.
      const sampleMs = slow ? interval : work < 7 && interval < 17.6 && now - lastDrop > 15000 ? 10 : 15;
      if (engine.dyn.sample(sampleMs, dtReal)) {
        if (slow) lastDrop = now;
        engine.applyScale();
      }
    }
  };

  const frame = (now: number): void => {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (!shouldRenderFrame(now, lastRendered)) return;
    const interval = lastRendered ? now - lastRendered : 16.7;
    const dtReal = Math.min(0.1, interval / 1000);
    lastRendered = now;
    tick(dtReal, interval);
  };

  function finishBench(): void {
    const b = bench;
    if (!b) return;
    bench = null;
    const s = [...b.samples].sort((a, c) => a - c);
    const med = s[Math.floor(s.length / 2)] ?? 99;
    const q = pickQualityFromBenchmark(med);
    engine.setQuality(q);
    applyQualityToWorld();
    b.resolve(q);
  }

  // ── Scena.
  function clearScene(): void {
    entities.clear();
    heroId = null;
    heroInput = { x: 0, y: 0 };
    if (meshes) {
      meshes.dispose();
      meshes = null;
    }
    atmosphere.clearClouds();
    ground = null;
    entities.ground = null;
  }

  async function loadScene(req: SceneRequest): Promise<SceneInfo> {
    const token = ++loadToken;
    const b = buildScene(req);
    const m = await buildSceneMeshes(b, { seed: req.seed, foliageDensity: engine.preset.foliage });
    if (token !== loadToken) {
      m.dispose();
      throw new Error('loadScene: przerwane przez nowsze żądanie');
    }
    clearScene();
    build = b;
    meshes = m;
    scene.add(m.group);
    const g = new Ground(b.world, b.bounds);
    for (const [x, z] of b.blocked) g.block(x, z);
    for (const c of m.treeColliders) g.colliders.push({ ...c });
    ground = g;
    entities.ground = g;

    // Atmosfera.
    atmosphere.outdoor = b.outdoor;
    if (req.timeOfDay) timeOfDay = req.timeOfDay;
    atmosphere.setPalette(b.outdoor ? timeOfDay : (b.palette ?? 'cave'), 0);
    if (b.outdoor) {
      const isl = b.island;
      atmosphere.buildClouds(new THREE.Vector3(isl.cx, 0, isl.cz), isl.radius, isl.surfaceY, req.seed);
    }
    engine.renderer.setClearColor(atmosphere.fogColor, 1);

    // Rekwizyty (encje) przypięte do POI.
    const pois: Poi[] = b.pois.map((p) => ({ ...p, pos: { ...p.pos } }));
    for (const pr of b.props) {
      const pos = pr.y !== undefined ? { x: pr.x, y: pr.y, z: pr.z } : { x: pr.x, z: pr.z };
      let id: EntityId;
      try {
        id = entities.spawn(pr.model, pos, { facing: pr.facing ?? 0, scale: pr.scale ?? 1, isProp: true });
      } catch (err) {
        console.warn('[render] nie udało się utworzyć rekwizytu', pr.model, err);
        continue;
      }
      if (pr.collider !== false) entities.addCollider(id, typeof pr.collider === 'number' ? pr.collider : undefined);
      if (pr.poi) {
        const poi = pois.find((p) => p.id === pr.poi);
        if (poi) poi.entity = id;
      }
    }

    // Kompilacja shaderów przed pierwszą klatką (bez przycięcia po wczytaniu sceny).
    try {
      await engine.renderer.compileAsync(scene, cam.camera);
    } catch {
      /* brak KHR_parallel_shader_compile — skompiluje się przy renderze */
    }
    if (token !== loadToken) throw new Error('loadScene: przerwane przez nowsze żądanie');
    // Kamera: od razu nad punktem startu.
    cam.lookAtPoint(new THREE.Vector3(b.spawn.x, g.heightAt(b.spawn.x, b.spawn.z) || b.island.surfaceY + 1, b.spawn.z));
    cam.snap();
    applyQualityToWorld();
    return { kind: b.kind, spawn: { ...b.spawn }, pois, bounds: { ...b.bounds } };
  }

  const toVec3 = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z);

  function worldToScreen(pos: Vec3): ScreenPos {
    const v = toVec3(pos).project(cam.camera);
    const { w, h } = engine.cssSize;
    const visible = v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible };
  }

  const api: RenderApi & { readonly debug: RenderDebug } = {
    canvas: engine.canvas,

    start() {
      if (running) return;
      running = true;
      lastRendered = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    onFrame(cb) {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    },

    setQuality(q) {
      engine.setQuality(q);
      applyQualityToWorld();
    },
    getQuality() {
      return engine.preset.level;
    },
    autoDetectQuality() {
      return new Promise<QualityLevel>((resolve) => {
        const prev = engine.preset.level;
        engine.setQuality('high');
        applyQualityToWorld();
        bench = { samples: [], until: performance.now() + 3000, resolve, prev };
        if (!running) {
          // Pętla stoi — własna krótka pętla testu.
          let last = performance.now();
          const step = (now: number): void => {
            if (!bench) return;
            tick(Math.min(0.1, (now - last) / 1000), now - last);
            last = now;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      });
    },
    getStats(): RenderStats {
      return {
        fps: Math.round(fps * 10) / 10,
        frameMs: Math.round(frameMs * 10) / 10,
        drawCalls: lastDrawCalls,
        triangles: lastTriangles,
        renderScale: engine.renderScale,
        quality: engine.preset.level,
      };
    },

    loadScene,
    setTimeOfDay(t) {
      timeOfDay = t;
      if (atmosphere.outdoor) atmosphere.setPalette(t, 1500);
    },

    spawn(model: ModelId, pos: Vec2 | Vec3, o?: { facing?: number; scale?: number; color?: string }) {
      return entities.spawn(model, pos, o ?? {});
    },
    despawn(id) {
      if (id === heroId) heroId = null;
      entities.despawn(id);
    },
    exists: (id) => entities.exists(id),
    getPosition: (id) => entities.getPosition(id),
    setPosition: (id, pos) => entities.setPosition(id, pos),
    setFacing: (id, yaw) => entities.setFacing(id, yaw),
    faceTowards: (id, target) => entities.faceTowards(id, target),
    play: (id: EntityId, anim: AnimName, o?: { speed?: number }) => entities.play(id, anim, o),
    wander: (id, center, radius) => entities.wander(id, center, radius),
    stopWander: (id) => entities.stopWander(id),
    moveTo: (id, target, speed) => entities.moveTo(id, target, speed),
    setVisible: (id, v) => entities.setVisible(id, v),
    setHighlight: (id, on) => entities.setHighlight(id, on),

    setHero(id) {
      heroId = id;
      entities.resetLoco(id);
    },
    setHeroInput(move) {
      heroInput = { x: move.x, y: move.y };
    },
    setHeroFrozen(frozen) {
      if (frozen === heroFrozen) return;
      heroFrozen = frozen;
      if (heroId !== null) {
        if (frozen) entities.locomote(heroId, 'idle');
        else entities.resetLoco(heroId);
      }
    },

    cameraFollow(id) {
      cam.setMode({ kind: 'follow', id });
    },
    cameraCombat(a, b) {
      cam.setMode({ kind: 'combat', a, b });
    },
    cameraCloseup(id) {
      cam.setMode({ kind: 'closeup', id });
    },
    cameraOrbit(center, radius, speed) {
      cam.setMode({ kind: 'orbit', center: toVec3(center), radius, speed, angle: cam.yaw });
    },

    setTimeScale(scale, rampMs = 250) {
      tsFrom = timeScale;
      tsTo = Math.max(0, scale);
      tsDur = Math.max(0.001, rampMs / 1000);
      tsT = rampMs <= 0 ? 1 : 0;
      if (rampMs <= 0) timeScale = tsTo;
    },
    setFocusDim(on) {
      const c = engine.canvas;
      c.style.transition = 'filter 320ms ease';
      c.style.filter = on ? 'brightness(0.55) saturate(0.8)' : '';
    },

    burst(pos: Vec3, kind: BurstKind) {
      try {
        particles.burst(toVec3(pos), kind);
      } catch (err) {
        console.warn('[render] burst', err);
      }
    },
    async transform(enemyEntity, glamModel) {
      const e = entities.get(enemyEntity);
      const pos = e ? { x: e.holder.position.x, y: e.holder.position.y, z: e.holder.position.z } : { x: cam.target.x, y: cam.target.y, z: cam.target.z };
      const glamId = entities.spawn(glamModel, pos, { facing: e?.yaw ?? 0, scale: e?.scale ?? 1 });
      const g = entities.get(glamId);
      if (!e || !g) return glamId;
      g.rig.root.scale.setScalar(0);
      try {
        await fx.playTransform({ scene, particles, from: e.rig, to: g.rig });
      } catch (err) {
        console.warn('[render] transform', err);
      }
      if (g.rig.root.scale.x < 0.99) g.rig.root.scale.setScalar(1);
      if (cam.mode.kind === 'combat') {
        if (cam.mode.a === enemyEntity) cam.mode.a = glamId;
        if (cam.mode.b === enemyEntity) cam.mode.b = glamId;
      }
      if ((cam.mode.kind === 'follow' || cam.mode.kind === 'closeup') && cam.mode.id === enemyEntity) cam.mode.id = glamId;
      entities.despawn(enemyEntity);
      return glamId;
    },
    shake(intensity, ms) {
      cam.shake(intensity, ms);
    },

    portrait(model, size = 256) {
      return portraits.portrait(model, size);
    },

    worldToScreen,
    entityScreenPos(id, offsetY = 0.25) {
      const e = entities.get(id);
      if (!e) return { x: 0, y: 0, visible: false };
      const p = e.holder.position;
      return worldToScreen({ x: p.x, y: p.y + e.rig.height * e.scale + offsetY, z: p.z });
    },
    heightAt(x, z) {
      const h = ground?.heightAt(x, z);
      return h === undefined || Number.isNaN(h) ? (build?.island.surfaceY ?? 0) + 1 : h;
    },

    dispose() {
      api.stop();
      ro?.disconnect();
      if (!ro) window.removeEventListener('resize', resize);
      clearScene();
      entities.dispose();
      try {
        particles.dispose();
      } catch {
        /* ignore */
      }
      atmosphere.dispose();
      fireflies.dispose();
      portraits.dispose();
      engine.dispose();
      clearTreeCache();
      callbacks.clear();
    },

    debug: {
      scene,
      camera: cam.camera,
      renderer: engine.renderer,
      sceneBuild: () => build,
      renderOnce() {
        tick(1 / 60, 16.7);
      },
    },
  };
  return api;
}

export { QUALITY_PRESETS };
export type { ModelFactory, FxApi } from './models/types';
