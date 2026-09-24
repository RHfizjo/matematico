/**
 * Pomocnicze generatory do testów modułu save (fast-check, bez zależności od vitest).
 */
import fc from 'fast-check';
import { allFacts, categoriesOfFact } from '../math/facts';
import type {
  AttemptLog,
  CategoryState,
  EquipSlot,
  FactState,
  GlamEntry,
  LandId,
  LandProgress,
  Op,
  OwnedItem,
  ParentSettings,
  SaveV1,
  SessionLog,
  SkillModel,
} from '../types';
import {
  ATTEMPT_MODES,
  CARD_IDS,
  CATEGORY_IDS,
  CREATURE_IDS,
  DISTRACTOR_KINDS,
  ENEMY_IDS,
  EQUIP_SLOTS,
  ITEM_IDS,
  ITEM_SLOTS,
  LAND_IDS,
  OPS,
  QUALITY_PRESETS,
  STARTER_CARDS,
  TIME_LIMIT_MODES,
} from './ids';
import { defaultSettings } from './defaults';
import { SAVE_LIMITS as L } from './limits';

/** Usuwa −0 (nie przetrwa JSON). */
const z = (x: number): number => (x === 0 ? 0 : x);

const dbl = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map(z);

export const timeArb: fc.Arbitrary<number> = fc.oneof(fc.integer({ min: 0, max: 2_000_000_000_000 }), dbl(0, 2e12));
const count = (max = 500): fc.Arbitrary<number> => fc.integer({ min: 0, max });

export const factIdArb: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 })).map(([a, b]) => `add:${a}+${b}`),
  // Odejmowanie bez wyniku ujemnego (parseFact z core/math odrzuca b > a).
  fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 })).map(([a, b]) => `sub:${Math.max(a, b)}-${Math.min(a, b)}`),
  fc.tuple(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 })).map(([a, b]) => `mul:${a}x${b}`),
  fc.tuple(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 })).map(([a, b]) => `div:${a * b}:${b}`),
  fc.integer({ min: 1, max: 9 }).map((a) => `cmp10:${a}`),
);
export const categoryArb = fc.constantFrom(...CATEGORY_IDS);
/** Pary (fakt, kategoria), dla których generateTask działa — do powtórek (retries). */
const FACT_CATEGORY_PAIRS = allFacts({ ...defaultSettings(), range: 100 }).flatMap((factId) => categoriesOfFact(factId).map((categoryId) => ({ factId, categoryId })));
export const factCategoryArb = fc.constantFrom(...FACT_CATEGORY_PAIRS);

const roomArb = fc.constantFrom('entry', 'vault', 'nest', 'campfire', 'boss', 'meadow:chest:1');

const settingsArb: fc.Arbitrary<ParentSettings> = fc
  .record({
    range: fc.constantFrom(10 as const, 20 as const, 100 as const),
    ops: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
    combatOps: fc.constantFrom('themed' as const, 'all' as const),
    crossTenOnMeadow: fc.boolean(),
    mode: fc.constantFrom(...TIME_LIMIT_MODES),
    fixedSec: fc.tuple(dbl(L.fixedSecMin, L.fixedSecMax), dbl(3, 60), fc.integer({ min: 3, max: 60 }), dbl(3, 60)),
    breakReminderMin: fc.constantFrom(0 as const, 15 as const, 20 as const, 30 as const),
    quality: fc.constantFrom(...QUALITY_PRESETS),
    music: dbl(0, 1),
    sfx: dbl(0, 1),
    showFps: fc.boolean(),
  })
  .map((r) => {
    const ops = {} as Record<Op, boolean>;
    const fixedSec = {} as Record<Op, number>;
    OPS.forEach((op, i) => {
      ops[op] = r.ops[i] ?? true;
      fixedSec[op] = r.fixedSec[i] ?? 10;
    });
    if (!OPS.some((op) => ops[op])) ops.mul = true;
    return {
      range: r.range,
      ops,
      combatOps: r.combatOps,
      crossTenOnMeadow: r.crossTenOnMeadow,
      timeLimit: { mode: r.mode, fixedSec },
      breakReminderMin: r.breakReminderMin,
      quality: r.quality,
      audio: { music: r.music, sfx: r.sfx },
      showFps: r.showFps,
    };
  });

const factStateArb: fc.Arbitrary<FactState> = fc
  .record({
    m: dbl(0, 1),
    lt: fc.option(dbl(-5, 12), { nil: null }),
    n: count(),
    nOk: count(),
    box: fc.integer({ min: 0, max: L.boxMax }),
    lastSeenAt: timeArb,
    lastSeenSession: count(),
    helped: count(),
    last2: fc.array(fc.boolean(), { maxLength: L.last2 }),
  })
  .map((f) => ({ ...f, nOk: Math.min(f.nOk, f.n), helped: Math.min(f.helped, f.n) }));

const categoryStateArb: fc.Arbitrary<CategoryState> = fc
  .record({
    recentMs: fc.array(dbl(0, 60_000), { maxLength: L.recentMs }),
    n: count(),
    nOk: count(),
    m: dbl(0, 1),
    prior: dbl(0, 1),
  })
  .map((c) => ({ ...c, nOk: Math.min(c.nOk, c.n) }));

const modelArb: fc.Arbitrary<SkillModel> = fc.record({
  facts: fc.dictionary(factIdArb, factStateArb, { maxKeys: 15, noNullPrototype: true }),
  categories: fc.dictionary(categoryArb, categoryStateArb, { maxKeys: 6, noNullPrototype: true }),
  session: count(),
  taskCounter: count(10_000),
  window: fc.array(fc.boolean(), { maxLength: L.window }),
  recent: fc.array(fc.record({ factId: fc.option(factIdArb, { nil: null }), categoryId: categoryArb }), {
    maxLength: L.recent,
  }),
  retries: fc.array(
    fc
      .record({ pair: factCategoryArb, dueAtTask: count(10_000), session: count() })
      .map(({ pair, dueAtTask, session }) => ({ ...pair, dueAtTask, session })),
    { maxLength: 5 },
  ),
  errorStreak: count(10),
});

const attemptArb: fc.Arbitrary<AttemptLog> = fc.record({
  f: fc.option(factIdArb, { nil: null }),
  c: categoryArb,
  ok: fc.boolean(),
  to: fc.boolean(),
  ms: fc.oneof(fc.integer({ min: 0, max: 120_000 }), dbl(0, 120_000)),
  h: fc.boolean(),
  md: fc.constantFrom(...ATTEMPT_MODES),
  ek: fc.option(fc.constantFrom(...DISTRACTOR_KINDS), { nil: null }),
  t: timeArb,
});

const sessionArb: fc.Arbitrary<SessionLog> = fc
  .record({ start: timeArb, dur: fc.integer({ min: 0, max: 3_600_000 }), tasks: count(200), correct: count(200) })
  .map((s) => ({ start: s.start, end: s.start + s.dur, tasks: s.tasks, correct: Math.min(s.correct, s.tasks) }));

const landsArb: fc.Arbitrary<Record<LandId, LandProgress>> = fc
  .array(
    fc.record({
      unlocked: fc.boolean(),
      stage: fc.integer({ min: 1, max: L.maxStage }),
      bossDefeated: fc.boolean(),
      gatesOpened: count(50),
      dungeonRuns: count(50),
    }),
    { minLength: LAND_IDS.length, maxLength: LAND_IDS.length },
  )
  .map((ls) => {
    const out = {} as Record<LandId, LandProgress>;
    LAND_IDS.forEach((id, i) => {
      const l = ls[i] as LandProgress;
      out[id] = id === 'meadow' ? { ...l, unlocked: true } : l;
    });
    return out;
  });

const dungeonArb: fc.Arbitrary<SaveV1['progress']['dungeon']> = fc
  .record({
    active: fc.boolean(),
    roomOrder: fc.array(roomArb, { maxLength: 5 }),
    roomIndex: count(10),
    enemyCzar: fc.dictionary(roomArb, dbl(0, 200), { maxKeys: 3, noNullPrototype: true }),
    bossPhase: fc.integer({ min: 1, max: 3 }),
    vines: fc.integer({ min: 0, max: L.vinesMax }),
    heroHp: fc.option(fc.integer({ min: 1, max: L.heroHpMax }), { nil: null }),
  })
  .map((d) => ({
    active: d.active,
    roomOrder: d.roomOrder,
    roomIndex: Math.min(d.roomIndex, d.roomOrder.length),
    enemyCzar: d.enemyCzar,
    bossPhase: d.bossPhase,
    vines: d.vines,
    heroHp: d.heroHp,
  }));

/** Kolekcja kart: dowolne znane karty 0..99 kopii; karty startowe zawsze ≥ 3 (GDD 9.5a). */
export const cardsArb: fc.Arbitrary<SaveV1['cards']> = fc
  .dictionary(fc.constantFrom(...CARD_IDS), fc.integer({ min: 0, max: L.cardMax }), { maxKeys: CARD_IDS.length, noNullPrototype: true })
  .map((d) => {
    const owned: Record<string, number> = { ...d };
    for (const [id, start] of Object.entries(STARTER_CARDS)) {
      owned[id] = Math.max(owned[id] ?? start, Math.min(start, L.starterCardMin));
    }
    return { owned };
  });

const equipmentArb: fc.Arbitrary<SaveV1['equipment']> = fc
  .tuple(
    fc.subarray([...ITEM_IDS]),
    fc.array(fc.integer({ min: 1, max: L.itemMaxLevel }), { minLength: 8, maxLength: 8 }),
    fc.array(fc.nat(), { minLength: 4, maxLength: 4 }),
  )
  .map(([ids, levels, picks]) => {
    const owned: OwnedItem[] = ids.map((id, i) => ({ id, level: levels[i] ?? 1 }));
    const equipped = {} as Record<EquipSlot, string | null>;
    EQUIP_SLOTS.forEach((slot, i) => {
      const cands: (string | null)[] = [null, ...ids.filter((id) => ITEM_SLOTS[id] === slot)];
      equipped[slot] = cands[(picks[i] ?? 0) % cands.length] ?? null;
    });
    return { owned, equipped };
  });

/** Dowolny poprawny SaveV1 (bogatszy niż świeży zapis). */
export const saveArb: fc.Arbitrary<SaveV1> = fc
  .record({
    createdAt: timeArb,
    updatedAt: timeArb,
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    name: fc.constantFrom('Bohater', 'Ala', 'Zośka Źdźbło', 'X', 'a'.repeat(L.nameMaxLength)),
    color: fc.constantFrom('#3fa7ff', '#FFF', '#a1b2c3'),
    settings: settingsArb,
    model: modelArb,
    digits: fc.array(fc.integer({ min: 0, max: L.digitMax }), { minLength: 10, maxLength: 10 }),
    cards: cardsArb,
    // Plusik zawsze (prezent na start, nie da się go stracić).
    creatures: fc.subarray(CREATURE_IDS.filter((id) => id !== 'plusik')).map((ids) => ['plusik', ...ids]),
    creatureLevels: fc.array(fc.integer({ min: 1, max: L.creatureMaxLevel }), { minLength: 4, maxLength: 4 }),
    fed: fc.array(fc.integer({ min: -1, max: 40 }), { minLength: 4, maxLength: 4 }),
    caughtAt: timeArb,
    equipment: equipmentArb,
    cycle: count(40),
    flags: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
    lands: landsArb,
    glams: fc.subarray([...ENEMY_IDS]),
    glamCounts: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 4, maxLength: 4 }),
    openedChests: fc.uniqueArray(fc.constantFrom('c1', 'c2', 'meadow:chest:3', 'x'), { maxLength: 4 }),
    chestPity: count(3),
    dungeon: dungeonArb,
    merchantDailyCycle: fc.integer({ min: -1, max: 40 }),
    history: fc.array(attemptArb, { maxLength: 30 }),
    sessions: fc.array(sessionArb, { maxLength: 8 }),
  })
  .map((r): SaveV1 => {
    const glams: Record<string, GlamEntry> = {};
    r.glams.forEach((id, i) => {
      glams[id] = { enemyId: id, count: r.glamCounts[i] ?? 1, firstAt: r.caughtAt };
    });
    return {
      version: 1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      seed: r.seed,
      profile: { name: r.name, color: r.color },
      settings: r.settings,
      model: r.model,
      inventory: { digits: r.digits },
      cards: r.cards,
      creatures: r.creatures.map((id, i) => ({
        id,
        level: r.creatureLevels[i] ?? 1,
        fedCycle: Math.min(r.fed[i] ?? -1, r.cycle),
        caughtAt: r.caughtAt,
      })),
      equipment: r.equipment,
      progress: {
        cycle: r.cycle,
        taskSinceReturn: r.flags[0],
        calibrated: r.flags[1],
        firstExpeditionDone: r.flags[2],
        lands: r.lands,
        glams,
        openedChests: r.openedChests,
        chestPity: r.chestPity,
        dungeon: r.dungeon,
        pendingBonusChest: r.flags[3],
        merchantDailyCycle: Math.min(r.merchantDailyCycle, r.cycle),
      },
      history: r.history,
      sessions: r.sessions,
    };
  })
  // Kopia JSON: zwykłe prototypy (fc.record/dictionary potrafią dać obiekty bez prototypu).
  .map((s) => JSON.parse(JSON.stringify(s)) as SaveV1);

// ─────────────── Mutacje do testów odporności ───────────────

export type Path = (string | number)[];

/** Wszystkie ścieżki w drzewie JSON (łącznie z korzeniem []). */
export function allPaths(v: unknown, prefix: Path = [], out: Path[] = []): Path[] {
  out.push(prefix);
  if (Array.isArray(v)) v.forEach((x, i) => allPaths(x, [...prefix, i], out));
  else if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) allPaths((v as Record<string, unknown>)[k], [...prefix, k], out);
  }
  return out;
}

export type Mutation = { kind: 'set'; value: unknown } | { kind: 'delete' } | { kind: 'addKey'; key: string; value: unknown };

/** Wartości „złośliwe”: typy spoza schematu, NaN, nieskończoności, −0, puste struktury. */
export const junkArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(
    NaN,
    Infinity,
    -Infinity,
    -0,
    -1,
    0.5,
    1.5,
    7,
    1e308,
    -1e308,
    2 ** 53,
    '',
    'x',
    '__proto__',
    null,
    undefined,
    true,
    false,
    [],
    {},
    [1, 2, 3],
    [-1, NaN, 'a'],
    { __proto__: null },
    { m: 2, n: -3 },
  ),
  fc.jsonValue({ maxDepth: 2 }),
  fc.anything({ maxDepth: 2 }),
);

export const mutationArb: fc.Arbitrary<Mutation> = fc.oneof(
  fc.record({ kind: fc.constant('set' as const), value: junkArb }),
  fc.constant({ kind: 'delete' as const }),
  fc.record({ kind: fc.constant('addKey' as const), key: fc.string().map((s) => `x_${s}`), value: junkArb }),
);

/** Kopia `root` z mutacją pod ścieżką (oryginał nietknięty). */
export function applyMutation(root: unknown, path: Path, m: Mutation): unknown {
  const copy: unknown = JSON.parse(JSON.stringify(root));
  if (path.length === 0) {
    if (m.kind === 'set') return m.value;
    if (m.kind === 'delete') return undefined;
  }
  let parent: unknown = copy;
  for (let i = 0; i < path.length - 1; i++) parent = (parent as Record<string | number, unknown>)[path[i] as string];
  const last = path[path.length - 1];
  const container = parent as Record<string | number, unknown>;
  if (m.kind === 'set' && last !== undefined) container[last] = m.value;
  else if (m.kind === 'delete' && last !== undefined) {
    if (Array.isArray(container) && typeof last === 'number') container.splice(last, 1);
    else delete container[last];
  } else if (m.kind === 'addKey') {
    const target = last === undefined ? container : container[last];
    if (typeof target === 'object' && target !== null && !Array.isArray(target)) {
      Object.defineProperty(target, m.key, { value: m.value, enumerable: true, writable: true, configurable: true });
    }
  }
  return copy;
}

/** Głębokie zamrożenie (wykrywa mutowanie wejścia). */
export function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}
