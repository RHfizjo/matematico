/**
 * Definicje kategorii (umiejętności) — GDD 5.1, 6.5. Zakresy faktów: komentarz w core/types.ts.
 *
 * Dostępność (minRange):
 * - do 10: add.within10, add.complement10, add.doubles (przy zakresie 10 tylko do 5+5), sub.within10;
 * - do 20: add.within20, add.cross10, add.three, sub.within20, sub.cross10, sub.missing;
 * - do 100: kategorie dwucyfrowe (add.2d, add.2d.carry, sub.2d, sub.2d.borrow);
 * - tabliczka mnożenia i dzielenie (mul.tK, div.byK) — przy KAŻDYM zakresie: dziecko zna tabliczkę,
 *   a zakres liczb dotyczy dodawania i odejmowania (wyniki mnożenia sięgają 100 niezależnie od zakresu).
 */
import type { CategoryDef, CategoryId, MulTable, ParentSettings } from '../types';

/** Tabliczki mnożenia / dzielenia obecne w kategoriach. */
export const MUL_TABLES: readonly MulTable[] = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const ADD_SUB_DEFS: CategoryDef[] = [
  { id: 'add.within10', op: 'add', label: 'Dodawanie do 10', minRange: 10, factBased: true },
  { id: 'add.complement10', op: 'add', label: 'Dopełnianie do 10', minRange: 10, factBased: true },
  { id: 'add.doubles', op: 'add', label: 'Podwajanie', minRange: 10, factBased: true },
  {
    id: 'add.within20',
    op: 'add',
    label: 'Dodawanie do 20 bez przekraczania 10',
    minRange: 20,
    factBased: true,
  },
  { id: 'add.cross10', op: 'add', label: 'Dodawanie z przekroczeniem 10', minRange: 20, factBased: true },
  { id: 'add.three', op: 'add', label: 'Dodawanie trzech liczb', minRange: 20, factBased: false },
  {
    id: 'add.2d',
    op: 'add',
    label: 'Dodawanie liczb dwucyfrowych bez przenoszenia',
    minRange: 100,
    factBased: false,
  },
  {
    id: 'add.2d.carry',
    op: 'add',
    label: 'Dodawanie liczb dwucyfrowych z przenoszeniem',
    minRange: 100,
    factBased: false,
  },
  { id: 'sub.within10', op: 'sub', label: 'Odejmowanie do 10', minRange: 10, factBased: true },
  {
    id: 'sub.within20',
    op: 'sub',
    label: 'Odejmowanie do 20 bez przekraczania 10',
    minRange: 20,
    factBased: true,
  },
  { id: 'sub.cross10', op: 'sub', label: 'Odejmowanie z przekroczeniem 10', minRange: 20, factBased: true },
  { id: 'sub.missing', op: 'sub', label: 'Brakująca liczba w odejmowaniu', minRange: 20, factBased: false },
  {
    id: 'sub.2d',
    op: 'sub',
    label: 'Odejmowanie liczb dwucyfrowych bez pożyczania',
    minRange: 100,
    factBased: false,
  },
  {
    id: 'sub.2d.borrow',
    op: 'sub',
    label: 'Odejmowanie liczb dwucyfrowych z pożyczaniem',
    minRange: 100,
    factBased: false,
  },
];

const MUL_DEFS: CategoryDef[] = MUL_TABLES.map(
  (k): CategoryDef => ({ id: `mul.t${k}`, op: 'mul', label: `Mnożenie przez ${k}`, minRange: 10, factBased: true }),
);

const DIV_DEFS: CategoryDef[] = MUL_TABLES.map(
  (k): CategoryDef => ({ id: `div.by${k}`, op: 'div', label: `Dzielenie przez ${k}`, minRange: 10, factBased: true }),
);

const ALL_DEFS: CategoryDef[] = [...ADD_SUB_DEFS, ...MUL_DEFS, ...DIV_DEFS];

/** Wszystkie kategorie w stałej kolejności (dodawanie, odejmowanie, mnożenie, dzielenie). */
export const ALL_CATEGORY_IDS: CategoryId[] = ALL_DEFS.map((d) => d.id);

/** Definicje kategorii po identyfikatorze. */
export const CATEGORIES: Record<CategoryId, CategoryDef> = Object.fromEntries(
  ALL_DEFS.map((d) => [d.id, d]),
) as Record<CategoryId, CategoryDef>;

/** Czy kategoria jest dostępna: działanie włączone przez rodzica i zakres liczb ≥ minRange. */
export function isCategoryAvailable(id: CategoryId, settings: ParentSettings): boolean {
  const def = CATEGORIES[id] as CategoryDef | undefined;
  if (def === undefined) return false;
  return settings.ops[def.op] === true && settings.range >= def.minRange;
}

/** Tabliczka (K) dla kategorii mul.tK / div.byK; null dla pozostałych. */
export function tableOf(id: CategoryId): MulTable | null {
  if (id.startsWith('mul.t')) return Number(id.slice(5)) as MulTable;
  if (id.startsWith('div.by')) return Number(id.slice(6)) as MulTable;
  return null;
}

/** Czy kategoria dotyczy liczb dwucyfrowych (zakres 100). */
export function isTwoDigitCategory(id: CategoryId): boolean {
  return id === 'add.2d' || id === 'add.2d.carry' || id === 'sub.2d' || id === 'sub.2d.borrow';
}
