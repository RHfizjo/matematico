/**
 * Modele kostkowe i efekty (render/models). Publiczne API:
 *   createModelFactory(): ModelFactory   — tworzy ModelRig dla każdego ModelId (lista: factory.ids)
 *   createFx(): FxApi                    — cząsteczki + przemiana brainrot → brainglam
 *
 * Uwagi dla render/:
 *  - Modele budowane w kodzie z kostek; kostki części łączone w jedną siatkę z kolorami w wierzchołkach
 *    (wspólny materiał bazowy), świecące kostki części — też jedna siatka (wspólny MeshBasicMaterial, kolor HDR
 *    w wierzchołkach). Zwykle 2–21 siatek na model (brainglamy ≤ 22 — test).
 *  - Hierarchia: rig.root (TY: pozycja, obrót Y, skala) → 'fx' (przemiana) → 'all' (animacja) → części.
 *    Nie ruszaj dzieci root — animacja nadpisuje je co klatkę.
 *  - 'hide' trzyma model schowany (current === 'hide') do następnego play() (zwykle 'appear').
 *    Rekwizyty: 'open' trzyma otwarty stan (skrzynia, brama); pnącze: 'hit' = zwiędnięcie (trzyma).
 *  - Bohater: miecz jest w części o nazwie 'weapon' (root.getObjectByName('weapon').visible = false, by schować).
 *  - Emisja jest dobrana pod bloom z progiem luminancji ok. 1.0 (HDR, np. HalfFloat) i mapowanie ACES/AgX
 *    (harness dev/models.html: ACES + bloom mipmap, próg 1.0).
 *  - Cząstki: ParticleSystem.object dodaj do sceny (najlepiej w korzeniu); burst(pos) w układzie jego rodzica.
 *  - playTransform: zegarem jest update() modelu `to` (czas świata); gdy nikt go nie aktualizuje — zapas na rAF.
 *  - Nieznane identyfikatory (np. przyszłe stworki) dostają zastępczy model „?” zamiast wyjątku.
 */
import type { ModelId, PropKind } from '../../game/contracts';
import type { FxApi, ModelFactory, ModelRig, TransformContext } from './types';
import { ModelBuilder } from './builder';
import { baseMaterial, glamBaseMaterial } from './materials';
import { bodyMotion } from './motion';
import { Particles } from './particles';
import { Rig } from './rig';
import { playTransform } from './transform';
import { brainrots } from './defs/brainrots';
import { blizniak, dopelniak, koniczynek, plusik } from './defs/creatures';
import type { BuildOpts, ModelDef } from './defs/common';
import { eyePair, INK, sparkleMotion, sparkles } from './defs/common';
import { hero } from './defs/hero';
import { kartonini } from './defs/npc';
import { props } from './defs/props';

export type { ModelRig, ModelFactory, FxApi, ParticleSystem, TransformContext } from './types';
export { Rig } from './rig';
export { Particles } from './particles';

const PROP_KINDS: readonly PropKind[] = [
  'chest', 'gate', 'portal', 'campfire', 'anvil', 'treasury', 'board', 'podium', 'vine', 'lantern', 'mushroom', 'crystal', 'den', 'sign',
];

const DEFS = new Map<ModelId, ModelDef>();
DEFS.set('hero', hero);
DEFS.set('creature:plusik', plusik);
DEFS.set('creature:dopelniak', dopelniak);
DEFS.set('creature:blizniak', blizniak);
DEFS.set('creature:koniczynek', koniczynek);
for (const [id, d] of Object.entries(brainrots)) DEFS.set(id as ModelId, d);
DEFS.set('npc:kartonini', kartonini);
for (const k of PROP_KINDS) DEFS.set(`prop:${k}`, props[k]);

/** Kolejność galerii: bohater, stworki, brainroty, brainglamy, NPC, rekwizyty. */
export const MODEL_IDS: readonly ModelId[] = [
  'hero',
  'creature:plusik',
  'creature:dopelniak',
  'creature:blizniak',
  'creature:koniczynek',
  'enemy:slimakorro',
  'enemy:trzmielini',
  'enemy:grzybello',
  'enemy:kosiarrini',
  'glam:slimakorro',
  'glam:trzmielini',
  'glam:grzybello',
  'glam:kosiarrini',
  'npc:kartonini',
  ...PROP_KINDS.map(k => `prop:${k}` as const),
];

/** Model zastępczy: kostka z „?” (brainrot = kwaśna zieleń, brainglam = pastel z brokatem). */
function placeholder(id: ModelId): ModelDef {
  const glam = id.startsWith('glam:');
  const enemy = id.startsWith('enemy:');
  const body = glam ? '#ffc6e8' : enemy ? '#b5e61d' : '#9fd8ff';
  return {
    height: 1.1,
    radius: 0.4,
    glam,
    build(b: ModelBuilder) {
      b.pivot('eyes', 'all', [0, 0.62, 0.36]);
      if (glam) b.pivot('sparkles', 'all', [0, 0, 0]);
      b.box('all', [0.7, 0.7, 0.7], [0, 0.45, 0], body, { shade: 0.8 });
      b.box('all', [0.2, 0.08, 0.26], [0.18, 0.04, 0.05], INK);
      b.box('all', [0.2, 0.08, 0.26], [-0.18, 0.04, 0.05], INK);
      eyePair(b, 'eyes', { y: 0.62, z: 0.355, dx: 0.15, w: 0.1, h: 0.13 });
      // znak zapytania na czubku
      const q = '#ffffff';
      b.box('all', [0.26, 0.07, 0.07], [0, 1.02, 0], q);
      b.box('all', [0.07, 0.14, 0.07], [0.1, 0.94, 0], q);
      b.box('all', [0.07, 0.07, 0.07], [0.02, 0.86, 0], q);
      b.box('all', [0.07, 0.07, 0.07], [0.02, 0.8, 0], q);
      if (glam) sparkles(b, { count: 6, radius: 0.6, y0: 0.3, y1: 1.1 });
    },
    motions: () => [bodyMotion({ amp: enemy ? 1.3 : 1, wob: enemy ? 1 : 0, walk: 'hop', h: 1.1, elegant: glam }), sparkleMotion],
  };
}

/** Buduje rig dla definicji (eksport do testów). */
export function buildRig(id: ModelId, def: ModelDef, opts: BuildOpts = {}, seed?: number): Rig {
  const base = def.glam ? glamBaseMaterial() : baseMaterial();
  const b = new ModelBuilder(base, def.scale ?? 1);
  def.build(b, opts);
  const built = b.build();
  return new Rig({
    id,
    built,
    height: def.height,
    radius: def.radius,
    motions: def.motions(),
    holds: def.holds ?? ['hide'],
    durations: def.durations,
    baseMaterial: base,
    receiveShadow: def.receiveShadow,
    seed,
  });
}

export function createModelFactory(): ModelFactory {
  return {
    ids: MODEL_IDS,
    create(id: ModelId, opts?: { color?: string }): ModelRig {
      const def = DEFS.get(id) ?? placeholder(id);
      return buildRig(id, def, opts ?? {});
    },
  };
}

export function createFx(): FxApi {
  return {
    createParticles: () => new Particles(),
    playTransform: (ctx: TransformContext) => playTransform(ctx),
  };
}
