/**
 * Generator zadań (GDD 5.1–5.2). Kategorie faktowe losują fakt z listy kategorii,
 * proceduralne budują działanie wg definicji z types.ts.
 *
 * Wywołujący odpowiada za dostępność kategorii (isCategoryAvailable) — dla zakresu
 * mniejszego niż minRange kategorii generator rzuca RangeError.
 */
import type { Rng } from '../rng';
import type { CategoryId, DistractorKind, FactId, ParentSettings, Task, TaskFormat } from '../types';
import { CATEGORIES } from './categories';
import { makeDistractors } from './distractors';
import { MISSING_MARK, evalTerms, formatTerms, type Equation } from './equation';
import { categoriesOfFact, factsOf, parseFact } from './facts';

export interface GenerateTaskArgs {
  categoryId: CategoryId;
  /** Konkretny fakt (musi należeć do kategorii) albo null — wtedy losowy fakt kategorii. */
  factId: FactId | null;
  rng: Rng;
  settings: ParentSettings;
  format: TaskFormat;
  /** Liczba opcji dla 'choice'/'missing' (domyślnie 4). */
  optionsCount?: 3 | 4;
  id: string;
}

/** Kategorie zawsze pokazywane jako „brakująca liczba”. */
const ALWAYS_MISSING: ReadonlySet<CategoryId> = new Set<CategoryId>(['add.complement10', 'sub.missing']);

function eq(op: Equation['op'], terms: number[]): Equation {
  return { op, terms, result: evalTerms(op, terms) };
}

/** Trzy składniki 1..9, suma ≤ max; w połowie przypadków z parą do 10 (4 + 6 + 3). */
function genThree(max: number, rng: Rng): Equation {
  if (max >= 11 && rng.chance(0.5)) {
    const x = rng.int(1, 9);
    const z = rng.int(1, Math.min(9, max - 10));
    return eq('add', rng.shuffle([x, 10 - x, z]));
  }
  for (let i = 0; i < 200; i++) {
    const terms = [rng.int(1, 9), rng.int(1, 9), rng.int(1, 9)];
    if (evalTerms('add', terms) <= max) return eq('add', terms);
  }
  return eq('add', [1, 2, Math.max(1, Math.min(9, max - 3))]);
}

/** Dwucyfrowe dodawanie: bez przeniesienia (suma ≤ 99) lub z przeniesieniem (suma ≤ 100). */
function genAdd2d(carry: boolean, rng: Rng): Equation {
  for (let i = 0; i < 200; i++) {
    const ta = rng.int(1, 8);
    const tb = rng.int(1, 9 - ta);
    let ua: number;
    let ub: number;
    if (carry) {
      ua = rng.int(1, 9);
      ub = rng.int(10 - ua, 9);
    } else {
      ua = rng.int(0, 9);
      ub = rng.int(0, 9 - ua);
    }
    const a = 10 * ta + ua;
    const b = 10 * tb + ub;
    if (a + b > (carry ? 100 : 99)) continue;
    return eq('add', rng.chance(0.5) ? [a, b] : [b, a]);
  }
  return eq('add', carry ? [38, 25] : [34, 25]);
}

/** Dwucyfrowe odejmowanie: bez pożyczania lub z pożyczaniem; odjemnik dwucyfrowy, wynik ≥ 1. */
function genSub2d(borrow: boolean, rng: Rng): Equation {
  const tm = rng.int(2, 9);
  const ts = rng.int(1, tm - 1);
  let um: number;
  let us: number;
  if (borrow) {
    um = rng.int(0, 8);
    us = rng.int(um + 1, 9);
  } else {
    um = rng.int(0, 9);
    us = rng.int(0, um);
  }
  return eq('sub', [10 * tm + um, 10 * ts + us]);
}

/** Odejmowanie z brakującą liczbą: odjemna ≤ max, odjemnik ≤ 10, różnica ≥ 1. */
function genSubMissing(max: number, rng: Rng): Equation {
  const m = rng.int(5, max);
  const s = rng.int(1, Math.min(m - 1, 10));
  return eq('sub', [m, s]);
}

function generateProcedural(cat: CategoryId, settings: ParentSettings, rng: Rng): Equation {
  const max20 = Math.min(20, settings.range);
  switch (cat) {
    case 'add.three':
      return genThree(max20, rng);
    case 'add.2d':
      return genAdd2d(false, rng);
    case 'add.2d.carry':
      return genAdd2d(true, rng);
    case 'sub.2d':
      return genSub2d(false, rng);
    case 'sub.2d.borrow':
      return genSub2d(true, rng);
    case 'sub.missing':
      return genSubMissing(max20, rng);
    default:
      throw new Error(`Kategoria ${cat} nie jest proceduralna`);
  }
}

/** Pozycja niewiadomej: w 3 składnikach dowolna; w 2 — zwykle druga ("8 + □ = 15"), czasem pierwsza. */
function chooseMissingIndex(e: Equation, rng: Rng): number {
  if (e.terms.length === 3) return rng.int(0, 2);
  return rng.chance(0.25) ? 0 : 1;
}

/**
 * Tworzy zadanie. Tekst: "8 + 7 = ?", "8 + □ = 15"; znaki − (U+2212), × (U+00D7), ":".
 * add.complement10 i sub.missing zawsze pokazują □ (format 'choice' zamieniany na 'missing';
 * 'typed' zostaje 'typed' — dziecko wpisuje brakującą liczbę).
 */
export function generateTask(args: GenerateTaskArgs): Task {
  const { categoryId, factId, rng, settings, format, id } = args;
  const def = CATEGORIES[categoryId];
  if (def === undefined) throw new Error(`Nieznana kategoria: ${String(categoryId)}`);
  if (settings.range < def.minRange) {
    throw new RangeError(`Kategoria ${categoryId} wymaga zakresu ${def.minRange} (jest ${settings.range})`);
  }

  let fact: FactId | null = null;
  let equation: Equation;
  let forcedMissing: number | null = null;
  if (def.factBased) {
    if (factId !== null) {
      if (!categoriesOfFact(factId).includes(categoryId)) {
        throw new Error(`Fakt ${factId} nie należy do kategorii ${categoryId}`);
      }
      fact = factId;
    } else {
      const list = factsOf(categoryId, settings) ?? [];
      if (list.length === 0) throw new RangeError(`Brak faktów w kategorii ${categoryId}`);
      fact = rng.pick(list);
    }
    const p = parseFact(fact);
    if (p.op === 'cmp10') {
      equation = { op: 'add', terms: [p.a, 10 - p.a], result: 10 };
      forcedMissing = 1;
    } else {
      equation = eq(p.op, [p.a, p.b]);
    }
  } else {
    if (factId !== null) throw new Error(`Kategoria ${categoryId} jest proceduralna — factId musi być null`);
    equation = generateProcedural(categoryId, settings, rng);
  }

  const alwaysMissing = ALWAYS_MISSING.has(categoryId);
  const taskFormat: TaskFormat = alwaysMissing && format === 'choice' ? 'missing' : format;
  const showMissing = alwaysMissing || format === 'missing';

  let text: string;
  let operands: number[];
  let answer: number;
  let missingIndex: number | undefined;
  if (showMissing) {
    const idx = forcedMissing ?? chooseMissingIndex(equation, rng);
    missingIndex = idx;
    answer = equation.terms[idx] as number;
    const shown: (number | string)[] = equation.terms.map((t, i) => (i === idx ? MISSING_MARK : t));
    text = `${formatTerms(equation.op, shown)} = ${equation.result}`;
    operands = [...equation.terms.filter((_, i) => i !== idx), equation.result];
  } else {
    answer = equation.result;
    text = `${formatTerms(equation.op, equation.terms)} = ?`;
    operands = [...equation.terms];
  }

  let options: number[] = [];
  const distractorKinds: Record<string, DistractorKind> = {};
  if (taskFormat !== 'typed') {
    const count = (args.optionsCount ?? 4) - 1;
    const distractors = makeDistractors(
      {
        op: equation.op,
        operands,
        answer,
        categoryId,
        format: taskFormat,
        ...(missingIndex !== undefined ? { missingIndex } : {}),
      },
      count,
      rng,
    );
    for (const d of distractors) distractorKinds[String(d.value)] = d.kind;
    options = rng.shuffle([answer, ...distractors.map((d) => d.value)]);
  }

  return {
    id,
    factId: fact,
    categoryId,
    categories: fact !== null ? categoriesOfFact(fact) : [categoryId],
    format: taskFormat,
    op: equation.op,
    text,
    operands,
    answer,
    options,
    distractorKinds,
  };
}
