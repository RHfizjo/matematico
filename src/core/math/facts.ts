/**
 * Uniwersum faktów i ich przynależność do kategorii (GDD 5.1).
 * Każda kategoria faktowa ma predykat; listy faktów powstają przez przefiltrowanie kandydatów,
 * więc factsOf i categoriesOfFact są spójne z definicji.
 * Fakty mnożenia z oboma czynnikami 1 (mul:1x1) nie należą do żadnej kategorii (poza uniwersum).
 */
import type { CategoryId, FactId, Op, ParentSettings } from '../types';
import { ALL_CATEGORY_IDS, CATEGORIES, isCategoryAvailable, tableOf } from './categories';

export type ParsedFact = { op: Op; a: number; b: number } | { op: 'cmp10'; a: number };

// Liczba w postaci kanonicznej (bez zer wiodących).
const NUM = '(0|[1-9]\\d*)';
const FACT_RE: Record<ParsedFact['op'], RegExp> = {
  add: new RegExp(`^add:${NUM}\\+${NUM}$`),
  sub: new RegExp(`^sub:${NUM}-${NUM}$`),
  mul: new RegExp(`^mul:${NUM}x${NUM}$`),
  div: new RegExp(`^div:${NUM}:${NUM}$`),
  cmp10: new RegExp(`^cmp10:${NUM}$`),
};

/**
 * Rozbiór identyfikatora faktu. Rzuca błąd dla złej składni lub faktu bez poprawnego
 * wyniku naturalnego (odejmowanie na minus, dzielenie z resztą lub przez 0, cmp10 > 10).
 */
export function parseFact(f: FactId): ParsedFact {
  const cmp = FACT_RE.cmp10.exec(f);
  if (cmp) {
    const a = Number(cmp[1]);
    if (a > 10) throw new Error(`Niepoprawny fakt (dopełnienie > 10): ${f}`);
    return { op: 'cmp10', a };
  }
  for (const op of ['add', 'sub', 'mul', 'div'] as const) {
    const m = FACT_RE[op].exec(f);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (op === 'sub' && b > a) throw new Error(`Niepoprawny fakt (wynik ujemny): ${f}`);
    if (op === 'div' && (b === 0 || a % b !== 0)) throw new Error(`Niepoprawny fakt (dzielenie): ${f}`);
    return { op, a, b };
  }
  throw new Error(`Niepoprawny identyfikator faktu: ${f}`);
}

/** Identyfikator faktu z rozbioru (odwrotność parseFact). */
export function formatFact(p: ParsedFact): FactId {
  switch (p.op) {
    case 'cmp10':
      return `cmp10:${p.a}`;
    case 'add':
      return `add:${p.a}+${p.b}`;
    case 'sub':
      return `sub:${p.a}-${p.b}`;
    case 'mul':
      return `mul:${p.a}x${p.b}`;
    case 'div':
      return `div:${p.a}:${p.b}`;
  }
}

/** Poprawna odpowiedź dla faktu (dla cmp10:a — brakujący składnik 10 − a). */
export function factAnswer(f: FactId): number {
  const p = parseFact(f);
  switch (p.op) {
    case 'cmp10':
      return 10 - p.a;
    case 'add':
      return p.a + p.b;
    case 'sub':
      return p.a - p.b;
    case 'mul':
      return p.a * p.b;
    case 'div':
      return p.a / p.b;
  }
}

/** Fakt przemienny (dodawanie i mnożenie z a ≠ b), np. mul:7x8 → mul:8x7; inaczej null. */
export function commutativePartner(f: FactId): FactId | null {
  const p = parseFact(f);
  if ((p.op === 'add' || p.op === 'mul') && p.a !== p.b) return formatFact({ op: p.op, a: p.b, b: p.a });
  return null;
}

// ───────────── Predykaty kategorii ─────────────

const between = (x: number, lo: number, hi: number): boolean => x >= lo && x <= hi;

/** Czy fakt spełnia definicję kategorii (bez filtra zakresu). */
function inCategory(cat: CategoryId, p: ParsedFact): boolean {
  if (p.op === 'cmp10') return cat === 'add.complement10' && between(p.a, 1, 9);
  const { a, b } = p;
  switch (cat) {
    case 'add.within10':
      return p.op === 'add' && a >= 1 && b >= 1 && a + b <= 10;
    case 'add.doubles':
      return p.op === 'add' && a === b && between(a, 1, 10);
    case 'add.within20': {
      if (p.op !== 'add') return false;
      // jeden składnik 10..19, drugi 1..9, jedności bez przekroczenia progu
      const teen = Math.max(a, b);
      const unit = Math.min(a, b);
      return between(teen, 10, 19) && between(unit, 1, 9) && (teen - 10) + unit <= 9;
    }
    case 'add.cross10':
      return p.op === 'add' && between(a, 2, 9) && between(b, 2, 9) && a + b >= 11;
    case 'sub.within10':
      return p.op === 'sub' && between(a, 2, 10) && between(b, 1, a - 1);
    case 'sub.within20':
      return p.op === 'sub' && between(a, 11, 19) && between(b, 1, 9) && a % 10 >= b;
    case 'sub.cross10':
      return p.op === 'sub' && between(a, 11, 18) && between(b, 2, 9) && a % 10 < b;
    default: {
      const k = tableOf(cat);
      if (k === null) return false;
      if (cat.startsWith('mul.')) return p.op === 'mul' && between(a, 1, 10) && between(b, 1, 10) && (a === k || b === k);
      return p.op === 'div' && b === k && a % k === 0 && between(a / k, 1, 10);
    }
  }
}

// Kandydaci (w kolejności leksykograficznej), z których filtrujemy fakty kategorii.
let candidatesCache: Record<ParsedFact['op'], ParsedFact[]> | null = null;

function candidates(): Record<ParsedFact['op'], ParsedFact[]> {
  if (candidatesCache) return candidatesCache;
  const add: ParsedFact[] = [];
  const sub: ParsedFact[] = [];
  const mul: ParsedFact[] = [];
  const div: ParsedFact[] = [];
  const cmp10: ParsedFact[] = [];
  for (let a = 1; a <= 19; a++) for (let b = 1; b <= 19; b++) add.push({ op: 'add', a, b });
  for (let a = 1; a <= 20; a++) for (let b = 1; b <= a; b++) sub.push({ op: 'sub', a, b });
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) mul.push({ op: 'mul', a, b });
  for (let p = 1; p <= 100; p++) for (let k = 1; k <= 10; k++) if (p % k === 0) div.push({ op: 'div', a: p, b: k });
  for (let a = 0; a <= 10; a++) cmp10.push({ op: 'cmp10', a });
  candidatesCache = { add, sub, mul, div, cmp10 };
  return candidatesCache;
}

/**
 * Fakty kategorii (pełna lista wg definicji z types.ts) lub null dla kategorii proceduralnych.
 * Jedyny filtr zakresu: add.doubles przy zakresie 10 obejmuje tylko a + a ≤ 10.
 */
export function factsOf(cat: CategoryId, settings: ParentSettings): FactId[] | null {
  const def = CATEGORIES[cat];
  if (def === undefined || !def.factBased) return null;
  const pool = cat === 'add.complement10' ? candidates().cmp10 : candidates()[def.op];
  const out: FactId[] = [];
  for (const p of pool) {
    if (!inCategory(cat, p)) continue;
    if (cat === 'add.doubles' && p.op === 'add' && p.a + p.b > settings.range) continue;
    out.push(formatFact(p));
  }
  return out;
}

/**
 * Wszystkie kategorie faktowe zawierające fakt (w kolejności ALL_CATEGORY_IDS), np.
 * add:6+6 → [add.doubles, add.cross10]; mul:7x8 → [mul.t7, mul.t8]; mul:1x1 → [].
 * Dla niepoprawnego identyfikatora zwraca [] (odporność na uszkodzony zapis).
 */
export function categoriesOfFact(f: FactId): CategoryId[] {
  let p: ParsedFact;
  try {
    p = parseFact(f);
  } catch {
    return [];
  }
  return ALL_CATEGORY_IDS.filter((cat) => CATEGORIES[cat].factBased && inCategory(cat, p));
}

/** Suma (bez powtórzeń) faktów ze wszystkich dostępnych kategorii faktowych. */
export function allFacts(settings: ParentSettings): FactId[] {
  const seen = new Set<FactId>();
  const out: FactId[] = [];
  for (const cat of ALL_CATEGORY_IDS) {
    if (!isCategoryAvailable(cat, settings)) continue;
    const list = factsOf(cat, settings);
    if (list === null) continue;
    for (const f of list) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}
