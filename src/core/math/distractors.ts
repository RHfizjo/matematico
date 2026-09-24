/**
 * Błędne opcje (dystraktory) — GDD 5.3. Każdy dystraktor ma rodzaj błędu (Propozycja 9).
 *
 * Niezmienniki: dokładnie `count` wartości, różne, całkowite, ≥ 0, ≠ odpowiedzi.
 * Przeciw „zdradzaniu wzorcem”: liczba dystraktorów poniżej odpowiedzi jest losowana
 * równomiernie, więc poprawna odpowiedź nie jest systematycznie środkową (medianą) opcją.
 */
import type { Rng } from '../rng';
import type { CategoryId, DistractorKind, Op, TaskFormat } from '../types';
import { isTwoDigitCategory } from './categories';

export interface DistractorInput {
  op: Op;
  /** Liczby widoczne w zadaniu (jak Task.operands; dla 'missing' ostatnia to wynik). */
  operands: number[];
  answer: number;
  categoryId: CategoryId;
  format: TaskFormat;
  /**
   * Tylko format 'missing': indeks niewiadomej wśród składników (np. 1 dla "8 + □ = 15").
   * Gdy brak — wnioskowany z liczb.
   */
  missingIndex?: number;
}

export interface Distractor {
  value: number;
  kind: DistractorKind;
}

interface Candidate {
  value: number;
  kind: DistractorKind;
  weight: number;
}

// Przy tej samej wartości wygrywa rodzaj bardziej szczegółowy.
const KIND_PRIORITY: readonly DistractorKind[] = [
  'lostCarry',
  'swappedDigits',
  'tableNeighbor',
  'divisorInstead',
  'wrongOp',
  'offByOne',
  'offByTwo',
  'offByTen',
  'other',
];

const tens = (n: number): number => Math.floor(n / 10);
const units = (n: number): number => n % 10;

/** Odwrócone cyfry liczby ≥ 10 (bez zera na końcu), np. 63 → 36; inaczej null. */
function reversed(n: number): number | null {
  if (n < 10 || n % 10 === 0) return null;
  const r = Number(String(n).split('').reverse().join(''));
  return r === n ? null : r;
}

/** Błąd „mniejsza od większej” w jednościach: 15 − 8 → 13, 52 − 27 → 35. */
function smallerFromLarger(m: number, s: number): number | null {
  if (m < 11 || units(m) >= units(s)) return null;
  return 10 * (tens(m) - tens(s)) + (units(s) - units(m));
}

function near(answer: number, w1: number, w2: number): Candidate[] {
  return [
    { value: answer - 1, kind: 'offByOne', weight: w1 },
    { value: answer + 1, kind: 'offByOne', weight: w1 },
    { value: answer - 2, kind: 'offByTwo', weight: w2 },
    { value: answer + 2, kind: 'offByTwo', weight: w2 },
  ];
}

function plusMinusTen(x: number, weight: number): Candidate[] {
  return [
    { value: x - 10, kind: 'offByTen', weight },
    { value: x + 10, kind: 'offByTen', weight },
  ];
}

/** Wnioskowanie pozycji niewiadomej (gdy nie podano): dla − i : niewiadoma na początku, gdy odpowiedź > pierwszej liczby. */
function inferMissingIndex(op: Op, known: number[], answer: number): number {
  if (known.length !== 1) return 1;
  const first = known[0] as number;
  if ((op === 'sub' || op === 'div') && answer > first) return 0;
  return 1;
}

/** Wiarygodne błędne odpowiedzi (przed filtrowaniem). */
function plausible(input: DistractorInput): Candidate[] {
  const { op, operands, answer, categoryId, format } = input;
  const is2d = isTwoDigitCategory(categoryId);
  const c: Candidate[] = [];

  if (format !== 'missing') {
    // Nieznany jest wynik.
    const terms = operands;
    if (op === 'add' && terms.length === 3) {
      const s = answer;
      c.push(...near(s, 3, 1.5));
      for (const t of terms) c.push({ value: s - t, kind: 'other', weight: 2 }); // pominięty składnik
      if (s >= 10) c.push({ value: s - 10, kind: 'lostCarry', weight: 1.5 }, { value: s + 10, kind: 'offByTen', weight: 0.5 });
      return c;
    }
    const a = terms[0] ?? 0;
    const b = terms[1] ?? 0;
    switch (op) {
      case 'add': {
        const s = answer;
        c.push(...near(s, 3, 1.5));
        if (units(a) + units(b) >= 10) c.push({ value: s - 10, kind: 'lostCarry', weight: 3 });
        if (s >= 10) c.push(...plusMinusTen(s, is2d ? 2 : 1));
        if (a !== b) c.push({ value: Math.abs(a - b), kind: 'wrongOp', weight: 1.2 });
        c.push({ value: a * b, kind: 'wrongOp', weight: 0.8 });
        const rev = is2d ? reversed(s) : null;
        if (rev !== null) c.push({ value: rev, kind: 'swappedDigits', weight: 1 });
        return c;
      }
      case 'sub': {
        const r = answer;
        c.push(...near(r, 3, 1.5));
        const bug = smallerFromLarger(a, b);
        if (bug !== null) c.push({ value: bug, kind: 'swappedDigits', weight: 3 });
        if (is2d && units(a) < units(b)) c.push({ value: r + 10, kind: 'lostCarry', weight: 2.5 });
        if (r >= 10 || is2d) c.push(...plusMinusTen(r, is2d ? 2 : 1.5));
        c.push({ value: a + b, kind: 'wrongOp', weight: 1 });
        const rev = is2d ? reversed(r) : null;
        if (rev !== null) c.push({ value: rev, kind: 'swappedDigits', weight: 1 });
        return c;
      }
      case 'mul': {
        const p = answer;
        // Sąsiedzi w tabliczce: 7×8 → 49, 63, 48, 64; pomylona para 6×9 = 54.
        for (const v of [(a - 1) * b, (a + 1) * b, a * (b - 1), a * (b + 1)]) {
          if (v > 0) c.push({ value: v, kind: 'tableNeighbor', weight: 3 });
        }
        for (const v of [(a - 1) * (b + 1), (a + 1) * (b - 1)]) {
          if (v > 0) c.push({ value: v, kind: 'tableNeighbor', weight: 1.5 });
        }
        c.push({ value: a + b, kind: 'wrongOp', weight: 1.5 });
        c.push(...near(p, 1, 0.5));
        const rev = reversed(p);
        if (rev !== null) c.push({ value: rev, kind: 'swappedDigits', weight: 0.8 });
        if (p >= 10) c.push(...plusMinusTen(p, 0.7));
        return c;
      }
      case 'div': {
        const q = answer;
        c.push(...near(q, 3, 1));
        if (b !== q) c.push({ value: b, kind: 'divisorInstead', weight: 2.5 });
        // Inny iloraz z tabliczki: inny czynnik dzielnej (24 : 6 → 3 lub 8).
        for (let d = 1; d <= 10; d++) {
          if (d !== q && d !== b && a % d === 0 && a / d <= 10) c.push({ value: d, kind: 'tableNeighbor', weight: 1.5 });
        }
        c.push({ value: a - b, kind: 'wrongOp', weight: 0.7 });
        return c;
      }
    }
  }

  // Format 'missing': odtwarzamy pełne działanie.
  const known = operands.slice(0, -1);
  const result = operands[operands.length - 1] ?? 0;
  const idx = input.missingIndex ?? inferMissingIndex(op, known, answer);
  const x = answer;
  c.push(...near(x, 3, 1.5));

  if (op === 'add' && known.length === 2) {
    // Trzy składniki z niewiadomą: zapomniany jeden ze znanych składników.
    for (const k of known) c.push({ value: result - k, kind: 'other', weight: 2 });
    c.push({ value: result + known[0]! + known[1]!, kind: 'wrongOp', weight: 0.5 });
    if (x >= 10) c.push(...plusMinusTen(x, 1));
    return c;
  }
  const k = known[0] ?? 0;
  switch (op) {
    case 'add': {
      // k + □ = s
      const s = result;
      c.push({ value: s + k, kind: 'wrongOp', weight: 1.2 });
      c.push({ value: s, kind: 'other', weight: 1 }, { value: k, kind: 'other', weight: 1 });
      if (k < 10 && s > 10 && s < 20) c.push({ value: 10 - k, kind: 'other', weight: 1 }); // zatrzymanie na 10
      const bug = smallerFromLarger(s, k);
      if (bug !== null) c.push({ value: bug, kind: 'swappedDigits', weight: 2 });
      if (x >= 10) c.push(...plusMinusTen(x, is2d ? 2 : 1));
      const rev = is2d ? reversed(x) : null;
      if (rev !== null) c.push({ value: rev, kind: 'swappedDigits', weight: 1 });
      return c;
    }
    case 'sub': {
      if (idx === 0) {
        // □ − s = r → odpowiedź s + r
        const s = k;
        const r = result;
        if (s !== r) c.push({ value: Math.abs(r - s), kind: 'wrongOp', weight: 2 });
        if (units(s) + units(r) >= 10) c.push({ value: x - 10, kind: 'lostCarry', weight: 2 });
        if (x >= 10) c.push(...plusMinusTen(x, 1));
        return c;
      }
      // m − □ = r → odpowiedź m − r
      const m = k;
      const r = result;
      c.push({ value: m + r, kind: 'wrongOp', weight: 1 });
      c.push({ value: r, kind: 'other', weight: 1.5 });
      const bug = smallerFromLarger(m, r);
      if (bug !== null) c.push({ value: bug, kind: 'swappedDigits', weight: 2 });
      if (x >= 10 || is2d) c.push(...plusMinusTen(x, is2d ? 2 : 1));
      return c;
    }
    case 'mul': {
      // k × □ = p
      const p = result;
      c.push({ value: p - k, kind: 'wrongOp', weight: 1 });
      c.push({ value: k, kind: 'other', weight: 1 });
      return c;
    }
    case 'div': {
      if (idx === 0) {
        // □ : k = q → odpowiedź k·q; sąsiedzi w tabliczce
        const q = result;
        for (const v of [(q - 1) * k, (q + 1) * k, q * (k - 1), q * (k + 1)]) {
          if (v > 0) c.push({ value: v, kind: 'tableNeighbor', weight: 3 });
        }
        c.push({ value: q + k, kind: 'wrongOp', weight: 1.5 });
        if (x >= 10) c.push(...plusMinusTen(x, 0.7));
        return c;
      }
      // p : □ = q → odpowiedź p : q
      const p = k;
      const q = result;
      c.push({ value: q, kind: 'other', weight: 1.5 });
      c.push({ value: p - q, kind: 'wrongOp', weight: 0.7 });
      return c;
    }
  }
}

function kindByDistance(value: number, answer: number): DistractorKind {
  const d = Math.abs(value - answer);
  if (d === 1) return 'offByOne';
  if (d === 2) return 'offByTwo';
  if (d === 10) return 'offByTen';
  return 'other';
}

/** Losowanie ważone bez zwracania. */
function pickWeighted(pool: Candidate[], n: number, rng: Rng): Candidate[] {
  const rest = pool.slice();
  const out: Candidate[] = [];
  while (out.length < n && rest.length > 0) {
    const i = rng.weightedIndex(rest.map((c) => c.weight));
    out.push(rest[i] as Candidate);
    rest.splice(i, 1);
  }
  return out;
}

/**
 * Zwraca dokładnie `count` wiarygodnych błędnych odpowiedzi (różnych, ≥ 0, ≠ answer),
 * z rodzajem błędu. Gdy wiarygodnych brakuje — uzupełnia liczbami bliskimi odpowiedzi.
 */
export function makeDistractors(input: DistractorInput, count: number, rng: Rng): Distractor[] {
  const { answer } = input;
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`makeDistractors: zła liczba ${count}`);
  if (!Number.isInteger(answer) || answer < 0) throw new RangeError(`makeDistractors: zła odpowiedź ${answer}`);
  if (count === 0) return [];

  // „Rozsądny zakres”: nie dalej niż max(10, answer) ponad odpowiedź.
  const cap = answer + Math.max(10, answer);
  // W tabliczce mnożenia i dzieleniu 0 nie jest wiarygodną odpowiedzią (i nie może być dzielnikiem).
  const minValue = input.op === 'mul' || input.op === 'div' ? Math.min(1, answer) : 0;
  const best = new Map<number, Candidate>();
  for (const cand of plausible(input)) {
    const v = cand.value;
    if (!Number.isInteger(v) || v < minValue || v === answer || v > cap) continue;
    const weight = v === 0 ? cand.weight * 0.3 : cand.weight;
    const prev = best.get(v);
    if (prev === undefined) {
      best.set(v, { value: v, kind: cand.kind, weight });
    } else {
      const kind = KIND_PRIORITY.indexOf(cand.kind) < KIND_PRIORITY.indexOf(prev.kind) ? cand.kind : prev.kind;
      best.set(v, { value: v, kind, weight: Math.max(prev.weight, weight) });
    }
  }
  const pool = [...best.values()];
  const below = pool.filter((c) => c.value < answer);
  const above = pool.filter((c) => c.value > answer);

  // Liczba opcji poniżej odpowiedzi — równomiernie (w granicach możliwości: wartości minValue..answer−1).
  const nBelow = rng.int(0, Math.min(count, answer - minValue));
  const nAbove = count - nBelow;
  const used = new Set<number>([answer]);
  const picked: Distractor[] = [];
  const take = (c: Candidate): void => {
    used.add(c.value);
    picked.push({ value: c.value, kind: c.kind });
  };

  pickWeighted(below, nBelow, rng).forEach(take);
  for (let d = 1; picked.length < nBelow; d++) {
    const v = answer - d;
    if (!used.has(v)) take({ value: v, kind: kindByDistance(v, answer), weight: 1 });
  }
  pickWeighted(above, nAbove, rng).forEach(take);
  for (let d = 1; picked.length < count; d++) {
    const v = answer + d;
    if (!used.has(v)) take({ value: v, kind: kindByDistance(v, answer), weight: 1 });
  }
  return rng.shuffle(picked);
}
