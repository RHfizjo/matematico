/**
 * Kontrakt wewnętrzny render/ ⇄ render/models/.
 * render/ (silnik, sceny, encje) NIE importuje modeli bezpośrednio — dostaje ModelFactory przez createRender().
 */
import type * as THREE from 'three';
import type { AnimName, BurstKind, ModelId } from '../../game/contracts';

export interface ModelRig {
  /** Korzeń modelu: początek układu w środku podstawy (stopy na y=0), przód w kierunku +Z. 1 jednostka = 1 kostka. */
  readonly root: THREE.Group;
  /** Wysokość modelu (do pozycji dymków, paska Czaru, portretu). */
  readonly height: number;
  /** Promień podstawy (kolizje, odstępy). */
  readonly radius: number;
  /** Postęp animacji proceduralnej; dt w sekundach (już przeskalowane przez timeScale świata). */
  update(dt: number): void;
  /** Pętle (idle, walk, windup, dance, sleep) — rozwiązują się od razu; jednorazowe — po zakończeniu (potem wraca idle). */
  play(anim: AnimName, opts?: { speed?: number }): Promise<void>;
  /** Czy obecnie trwa animacja chodu (render ustawia walk/idle przy ruchu). */
  readonly current: AnimName;
  setHighlight(on: boolean): void;
  /** Materiały emisyjne (poświata) — np. brainglamy, grzyby, kryształy — są już ustawione w modelu. */
  dispose(): void;
}

export interface ModelFactory {
  create(id: ModelId, opts?: { color?: string }): ModelRig;
  /** Lista wszystkich znanych identyfikatorów (do galerii testowej i prefetchu portretów). */
  readonly ids: readonly ModelId[];
}

export interface ParticleSystem {
  readonly object: THREE.Object3D;
  burst(pos: THREE.Vector3, kind: BurstKind): void;
  update(dt: number): void;
  dispose(): void;
}

export interface TransformContext {
  scene: THREE.Scene;
  particles: ParticleSystem;
  from: ModelRig;
  /** Model docelowy — już dodany do sceny w tym samym miejscu, na starcie niewidoczny (skala 0). */
  to: ModelRig;
}

export interface FxApi {
  createParticles(): ParticleSystem;
  /** Sekwencja przemiany brainrot → brainglam (~2.5 s): wir, rozpad na świecące kostki, złożenie, brokat. */
  playTransform(ctx: TransformContext): Promise<void>;
}
