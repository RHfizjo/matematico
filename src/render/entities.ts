/**
 * Encje: modele (ModelRig z fabryki — wstrzykiwana) na scenie, stojące na terenie.
 * Wędrowanie, ruch do celu (Promise), animacje (delegowane do rig.play), podświetlenie, plamka cienia.
 */
import * as THREE from 'three';
import type { AnimName, EntityId, ModelId, Vec2, Vec3 } from '../game/contracts';
import type { ModelFactory, ModelRig } from './models/types';
import type { CircleCollider, Ground } from './world/ground';
import { angleDelta, damp } from './util/rng';

const LOOP_ANIMS: ReadonlySet<AnimName> = new Set(['idle', 'walk', 'windup', 'dance', 'sleep']);

interface WanderState {
  center: Vec2;
  radius: number;
  phase: 'idle' | 'walk';
  timer: number;
  target: Vec2 | null;
  stuck: number;
}

interface MoveState {
  target: Vec2;
  speed: number;
  resolve: () => void;
}

export interface Entity {
  id: EntityId;
  model: ModelId;
  rig: ModelRig;
  holder: THREE.Group;
  yaw: number;
  targetYaw: number;
  scale: number;
  /** Wysokość podana jawnie (Vec3) — nie przyklejamy do terenu, dopóki encja się nie ruszy. */
  fixedY: number | null;
  wander: WanderState | null;
  move: MoveState | null;
  /** Animacja lokomocji ustawiona przez render (walk/idle). */
  loco: AnimName | null;
  /**
   * Animacja „spoczynku” — domyślnie idle; pętla zlecona z zewnątrz (dance, sleep, windup) trwa w postoju
   * (także przy wędrowaniu) aż do następnego kroku.
   */
  idleAnim: AnimName;
  /** Trwa jednorazowa animacja zlecona z zewnątrz — lokomocja jej nie przerywa. */
  busy: number;
  blob: THREE.Mesh;
  ring: THREE.Mesh | null;
  collider: CircleCollider | null;
  highlighted: boolean;
  isProp: boolean;
}

function makeBlobTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const d = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - d, 1.6);
      const i = (y * n + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.round(a * 255);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export class EntityManager {
  readonly group = new THREE.Group();
  private readonly list = new Map<EntityId, Entity>();
  private nextId = 1;
  ground: Ground | null = null;
  private readonly blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly blobTex = makeBlobTexture();
  private readonly blobMat = new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.45, fog: false });
  private readonly ringGeo = new THREE.RingGeometry(0.78, 1, 48).rotateX(-Math.PI / 2);
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, depthWrite: false, opacity: 0.8, blending: THREE.AdditiveBlending, fog: false });
  blobShadows = false;
  private time = 0;

  constructor(private readonly models: ModelFactory) {
    this.group.name = 'entities';
  }

  get all(): IterableIterator<Entity> {
    return this.list.values();
  }

  get(id: EntityId): Entity | undefined {
    return this.list.get(id);
  }

  exists(id: EntityId): boolean {
    return this.list.has(id);
  }

  groundY(x: number, z: number): number {
    const h = this.ground?.heightAt(x, z);
    return h === undefined || Number.isNaN(h) ? 0 : h;
  }

  spawn(model: ModelId, pos: Vec2 | Vec3, opts: { facing?: number; scale?: number; color?: string; isProp?: boolean } = {}): EntityId {
    const rig = this.models.create(model, opts.color ? { color: opts.color } : undefined);
    const holder = new THREE.Group();
    holder.name = `entity:${model}`;
    holder.add(rig.root);
    const scale = opts.scale ?? 1;
    holder.scale.setScalar(scale);
    const fixedY = 'y' in pos && typeof pos.y === 'number' ? pos.y : null;
    holder.position.set(pos.x, fixedY ?? this.groundY(pos.x, pos.z), pos.z);
    const yaw = opts.facing ?? 0;
    holder.rotation.y = yaw;
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
    const br = Math.max(0.3, rig.radius) * 2.4;
    blob.scale.set(br, 1, br);
    blob.position.y = 0.03;
    blob.renderOrder = 1;
    blob.visible = this.blobShadows;
    holder.add(blob);
    this.group.add(holder);
    const id = this.nextId++;
    const e: Entity = {
      id,
      model,
      rig,
      holder,
      yaw,
      targetYaw: yaw,
      scale,
      fixedY,
      wander: null,
      move: null,
      loco: null,
      idleAnim: 'idle',
      busy: 0,
      blob,
      ring: null,
      collider: null,
      highlighted: false,
      isProp: opts.isProp ?? model.startsWith('prop:'),
    };
    this.list.set(id, e);
    return id;
  }

  /** Dodaje kolizję okrągłą (rekwizyty). */
  addCollider(id: EntityId, r?: number): void {
    const e = this.list.get(id);
    if (!e || !this.ground) return;
    const c: CircleCollider = { x: e.holder.position.x, z: e.holder.position.z, r: r ?? Math.max(0.3, e.rig.radius * e.scale), owner: id };
    e.collider = c;
    this.ground.colliders.push(c);
  }

  despawn(id: EntityId): void {
    const e = this.list.get(id);
    if (!e) return;
    e.move?.resolve();
    e.holder.removeFromParent();
    if (e.collider && this.ground) this.ground.colliders = this.ground.colliders.filter((c) => c !== e.collider);
    try {
      e.rig.dispose();
    } catch {
      /* rig mógł już zostać zwolniony */
    }
    this.list.delete(id);
  }

  clear(): void {
    for (const id of [...this.list.keys()]) this.despawn(id);
  }

  getPosition(id: EntityId): Vec3 {
    const e = this.list.get(id);
    if (!e) return { x: 0, y: 0, z: 0 };
    return { x: e.holder.position.x, y: e.holder.position.y, z: e.holder.position.z };
  }

  setPosition(id: EntityId, pos: Vec2 | Vec3): void {
    const e = this.list.get(id);
    if (!e) return;
    e.fixedY = 'y' in pos && typeof pos.y === 'number' ? pos.y : null;
    e.holder.position.set(pos.x, e.fixedY ?? this.groundY(pos.x, pos.z), pos.z);
    if (e.collider) {
      e.collider.x = pos.x;
      e.collider.z = pos.z;
    }
  }

  setFacing(id: EntityId, yaw: number): void {
    const e = this.list.get(id);
    if (!e) return;
    e.yaw = yaw;
    e.targetYaw = yaw;
    e.holder.rotation.y = yaw;
  }

  faceTowards(id: EntityId, target: Vec2): void {
    const e = this.list.get(id);
    if (!e) return;
    const dx = target.x - e.holder.position.x;
    const dz = target.z - e.holder.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.setFacing(id, Math.atan2(dx, dz));
  }

  play(id: EntityId, anim: AnimName, opts?: { speed?: number }): Promise<void> {
    const e = this.list.get(id);
    if (!e) return Promise.resolve();
    const loop = LOOP_ANIMS.has(anim);
    if (loop) {
      // Pętla to nowy stan spoczynku/chodu — lokomocja (wędrowanie) jej nie nadpisze w postoju.
      if (anim !== 'walk') e.idleAnim = anim;
      e.loco = anim === 'walk' ? 'walk' : 'idle';
    } else {
      e.busy++;
      e.loco = null;
    }
    let p: Promise<void>;
    try {
      p = e.rig.play(anim, opts);
    } catch {
      p = Promise.resolve();
    }
    if (loop) return p;
    return p.finally(() => {
      e.busy = Math.max(0, e.busy - 1);
    });
  }

  private setLoco(e: Entity, anim: 'walk' | 'idle', speed?: number): void {
    if (e.busy > 0) return;
    if (e.loco === anim) return;
    e.loco = anim;
    if (anim === 'walk') e.idleAnim = 'idle';
    try {
      void e.rig.play(anim === 'idle' ? e.idleAnim : anim, speed ? { speed } : undefined);
    } catch {
      /* model bez tej animacji */
    }
  }

  /** Lokomocja sterowana z zewnątrz (bohater): walk/idle bez przerywania animacji jednorazowych. */
  locomote(id: EntityId, anim: 'walk' | 'idle', speed?: number): void {
    const e = this.list.get(id);
    if (e) this.setLoco(e, anim, speed);
  }

  /** Zapomnij bieżący stan lokomocji (np. po odblokowaniu bohatera). */
  resetLoco(id: EntityId): void {
    const e = this.list.get(id);
    if (e) e.loco = null;
  }

  isMoving(id: EntityId): boolean {
    return !!this.list.get(id)?.move;
  }

  wander(id: EntityId, center: Vec2, radius: number): void {
    const e = this.list.get(id);
    if (!e) return;
    e.wander = { center: { ...center }, radius, phase: 'idle', timer: 0.3 + Math.random() * 1.5, target: null, stuck: 0 };
  }

  stopWander(id: EntityId): void {
    const e = this.list.get(id);
    if (!e || !e.wander) return;
    e.wander = null;
    this.setLoco(e, 'idle');
  }

  moveTo(id: EntityId, target: Vec2, speed = 2.4): Promise<void> {
    const e = this.list.get(id);
    if (!e) return Promise.resolve();
    e.move?.resolve();
    e.wander = null;
    return new Promise<void>((resolve) => {
      e.move = { target: { ...target }, speed, resolve };
    });
  }

  setVisible(id: EntityId, visible: boolean): void {
    const e = this.list.get(id);
    if (e) e.holder.visible = visible;
  }

  setHighlight(id: EntityId, on: boolean): void {
    const e = this.list.get(id);
    if (!e || e.highlighted === on) return;
    e.highlighted = on;
    try {
      e.rig.setHighlight(on);
    } catch {
      /* brak podświetlenia w modelu */
    }
    if (on) {
      if (!e.ring) {
        e.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
        const r = Math.max(0.5, e.rig.radius) * 1.35;
        e.ring.scale.set(r, 1, r);
        e.ring.position.y = 0.06;
        e.ring.renderOrder = 3;
        e.holder.add(e.ring);
      }
      e.ring.visible = true;
    } else if (e.ring) {
      e.ring.visible = false;
    }
  }

  setBlobShadows(on: boolean): void {
    this.blobShadows = on;
    for (const e of this.list.values()) e.blob.visible = on;
  }

  /** Jeden krok symulacji encji (dt już przeskalowane przez timeScale). heroId — pomijany (sterowany osobno). */
  update(dt: number, heroId: EntityId | null): void {
    this.time += dt;
    const pulse = 0.55 + 0.35 * Math.sin(this.time * 5);
    this.ringMat.opacity = pulse;
    for (const e of this.list.values()) {
      if (e.move) this.stepMove(e, dt);
      else if (e.wander && e.id !== heroId) this.stepWander(e, dt);
      // Płynny obrót.
      const d = angleDelta(e.yaw, e.targetYaw);
      if (Math.abs(d) > 1e-4) {
        e.yaw += d * damp(12, dt);
        e.holder.rotation.y = e.yaw;
      }
      if (e.ring) e.ring.rotation.y += dt * 0.8;
      try {
        e.rig.update(dt);
      } catch {
        /* błąd w animacji modelu nie może zatrzymać pętli */
      }
    }
  }

  private followGround(e: Entity, dt: number): void {
    if (e.fixedY !== null) e.fixedY = null;
    const gy = this.groundY(e.holder.position.x, e.holder.position.z);
    const y = e.holder.position.y;
    e.holder.position.y = gy > y ? y + (gy - y) * damp(16, dt) : y + (gy - y) * damp(10, dt);
    if (e.collider) {
      e.collider.x = e.holder.position.x;
      e.collider.z = e.holder.position.z;
    }
  }

  private stepMove(e: Entity, dt: number): void {
    const m = e.move;
    if (!m) return;
    const p = e.holder.position;
    const dx = m.target.x - p.x;
    const dz = m.target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const step = m.speed * dt;
    if (dist <= Math.max(0.02, step)) {
      p.x = m.target.x;
      p.z = m.target.z;
      this.followGround(e, 1);
      e.move = null;
      this.setLoco(e, 'idle');
      m.resolve();
      return;
    }
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    e.targetYaw = Math.atan2(dx, dz);
    this.followGround(e, dt);
    this.setLoco(e, 'walk', Math.min(1.6, 0.6 + m.speed / 3));
  }

  private stepWander(e: Entity, dt: number): void {
    const w = e.wander;
    if (!w) return;
    const g = this.ground;
    w.timer -= dt;
    if (w.phase === 'idle') {
      this.setLoco(e, 'idle');
      if (w.timer > 0) return;
      // Nowy cel w promieniu, na stałym gruncie.
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * w.radius;
        const tx = w.center.x + Math.cos(a) * r;
        const tz = w.center.z + Math.sin(a) * r;
        if (!g || (!g.isWater(tx, tz) && !g.isBlocked(tx, tz) && !Number.isNaN(g.heightAt(tx, tz)))) {
          w.target = { x: tx, z: tz };
          w.phase = 'walk';
          w.timer = 8;
          w.stuck = 0;
          break;
        }
      }
      if (w.phase === 'idle') w.timer = 1;
      return;
    }
    const t = w.target;
    if (!t) {
      w.phase = 'idle';
      return;
    }
    const p = e.holder.position;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const dist = Math.hypot(dx, dz);
    const speed = 1.4;
    if (dist < 0.15 || w.timer <= 0) {
      w.phase = 'idle';
      w.timer = 1.2 + Math.random() * 2.8;
      return;
    }
    const step = Math.min(dist, speed * dt);
    let nx = p.x + (dx / dist) * step;
    let nz = p.z + (dz / dist) * step;
    if (g) {
      const r = Math.max(0.25, e.rig.radius * e.scale * 0.8);
      const s = g.slide(p.x, p.z, nx - p.x, nz - p.z, r, g.heightAt(p.x, p.z), e.id);
      nx = s.x;
      nz = s.z;
      if (Math.hypot(nx - p.x, nz - p.z) < step * 0.3) {
        w.stuck += dt;
        if (w.stuck > 0.6) {
          w.phase = 'idle';
          w.timer = 0.8 + Math.random();
          return;
        }
      }
    }
    p.x = nx;
    p.z = nz;
    e.targetYaw = Math.atan2(dx, dz);
    this.followGround(e, dt);
    this.setLoco(e, 'walk');
  }

  dispose(): void {
    this.clear();
    this.blobGeo.dispose();
    this.blobTex.dispose();
    this.blobMat.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
    this.group.removeFromParent();
  }
}
