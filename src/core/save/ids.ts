/**
 * Stałe identyfikatory treści i zbiory dozwolonych wartości używane przy walidacji zapisu.
 * `core/` nie importuje `content/`, więc identyfikatory są powielone tutaj (test pilnuje zgodności
 * z kategoriami z core/math). Poprawność faktów sprawdza core/math (to samo źródło prawdy co generator).
 */
import { categoriesOfFact, parseFact } from '../math/facts';
import type {
  AttemptMode,
  CategoryId,
  DistractorKind,
  EquipSlot,
  LandId,
  NumberRange,
  Op,
  QualityPreset,
  TimeLimitMode,
} from '../types';

// Rekordy `Record<X, true>` wymuszają kompletność listy w czasie kompilacji.
function keysOf<K extends string>(rec: Record<K, true>): readonly K[] {
  return Object.keys(rec) as K[];
}

// ─────────────── Treść (content IDs) ───────────────

export const CREATURE_IDS = ['plusik', 'dopelniak', 'blizniak', 'koniczynek'] as const;
export type CreatureId = (typeof CREATURE_IDS)[number];

export const ENEMY_IDS = ['slimakorro', 'trzmielini', 'grzybello', 'kosiarrini'] as const;
export type EnemyId = (typeof ENEMY_IDS)[number];

/** Przedmiot → slot. */
export const ITEM_SLOTS = {
  'drewniany-miecz': 'weapon',
  'miecz-slonecznika': 'weapon',
  'kamizelka-z-lisci': 'armor',
  'pancerz-liczydlo': 'armor',
  'siatka-z-trawy': 'net',
  'siec-pajecza': 'net',
  'zlota-siec': 'net',
  'amulet-drugiej-szansy': 'amulet',
} as const satisfies Record<string, EquipSlot>;
export type ItemId = keyof typeof ITEM_SLOTS;
export const ITEM_IDS = Object.keys(ITEM_SLOTS) as readonly ItemId[];

export const LAND_IDS = keysOf<LandId>({ meadow: true, cave: true, volcano: true, castle: true, ice: true });
export const EQUIP_SLOTS = keysOf<EquipSlot>({ weapon: true, armor: true, net: true, amulet: true });
export const OPS = keysOf<Op>({ add: true, sub: true, mul: true, div: true });

/** Stworek startowy i sprzęt startowy (GDD 13). */
export const STARTER_CREATURE: CreatureId = 'plusik';
export const STARTER_EQUIPPED: Readonly<Record<EquipSlot, ItemId | null>> = {
  weapon: 'drewniany-miecz',
  armor: 'kamizelka-z-lisci',
  net: 'siatka-z-trawy',
  amulet: null,
};

// ─────────────── Wartości wyliczeniowe ───────────────

export const CATEGORY_IDS = keysOf<CategoryId>({
  'add.within10': true,
  'add.complement10': true,
  'add.doubles': true,
  'add.within20': true,
  'add.cross10': true,
  'add.three': true,
  'add.2d': true,
  'add.2d.carry': true,
  'sub.within10': true,
  'sub.within20': true,
  'sub.cross10': true,
  'sub.missing': true,
  'sub.2d': true,
  'sub.2d.borrow': true,
  'mul.t2': true,
  'mul.t3': true,
  'mul.t4': true,
  'mul.t5': true,
  'mul.t6': true,
  'mul.t7': true,
  'mul.t8': true,
  'mul.t9': true,
  'mul.t10': true,
  'div.by2': true,
  'div.by3': true,
  'div.by4': true,
  'div.by5': true,
  'div.by6': true,
  'div.by7': true,
  'div.by8': true,
  'div.by9': true,
  'div.by10': true,
});

export const ATTEMPT_MODES = keysOf<AttemptMode>({
  combat: true,
  catch: true,
  gate: true,
  feed: true,
  calibration: true,
  chest: true,
  forge: true,
});

export const DISTRACTOR_KINDS = keysOf<DistractorKind>({
  offByOne: true,
  offByTwo: true,
  offByTen: true,
  lostCarry: true,
  wrongOp: true,
  tableNeighbor: true,
  swappedDigits: true,
  divisorInstead: true,
  other: true,
});

export const NUMBER_RANGES: readonly NumberRange[] = [10, 20, 100];
export const TIME_LIMIT_MODES = keysOf<TimeLimitMode>({ none: true, gentle: true, fixed: true });
export const QUALITY_PRESETS = keysOf<QualityPreset>({ auto: true, low: true, medium: true, high: true });
export const COMBAT_OPS: readonly ('themed' | 'all')[] = ['themed', 'all'];
export const BREAK_REMINDERS: readonly (0 | 15 | 20 | 30)[] = [0, 15, 20, 30];

/** Format FactId (types.ts): "add:8+7", "sub:15-8", "mul:7x8", "div:56:8", "cmp10:3". */
export const FACT_ID_RE = /^(?:add:\d{1,3}\+\d{1,3}|sub:\d{1,3}-\d{1,3}|mul:\d{1,3}x\d{1,3}|div:\d{1,4}:\d{1,3}|cmp10:\d{1,2})$/;

// ─────────────── Strażnicy typów ───────────────

function member<T>(list: readonly T[]): (v: unknown) => v is T {
  const set = new Set<unknown>(list);
  return (v: unknown): v is T => set.has(v);
}

export const isCreatureId = member<CreatureId>(CREATURE_IDS);
export const isEnemyId = member<EnemyId>(ENEMY_IDS);
export const isItemId = member<ItemId>(ITEM_IDS);
export const isLandId = member<LandId>(LAND_IDS);
export const isCategoryId = member<CategoryId>(CATEGORY_IDS);
export const isAttemptMode = member<AttemptMode>(ATTEMPT_MODES);
export const isDistractorKind = member<DistractorKind>(DISTRACTOR_KINDS);

/**
 * Poprawny fakt: krótki format z FACT_ID_RE i akceptowany przez parseFact z core/math
 * (bez zer wiodących, bez wyniku ujemnego, bez dzielenia z resztą/przez 0, cmp10 ≤ 10).
 * Inaczej generator zadań rzuciłby wyjątek na fakcie z zapisu.
 */
export function isFactId(v: unknown): v is string {
  if (typeof v !== 'string' || !FACT_ID_RE.test(v)) return false;
  try {
    parseFact(v);
    return true;
  } catch {
    return false;
  }
}

/** Czy fakt należy do kategorii (wg core/math) — warunek generateTask({ factId, categoryId }). */
export function isFactInCategory(factId: string, categoryId: CategoryId): boolean {
  return categoriesOfFact(factId).includes(categoryId);
}
