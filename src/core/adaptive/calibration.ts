/**
 * Kalibracja startowa „Próba Plusika” (GDD 6.6): ok. 20 zadań z włączonych działań,
 * od łatwych do trudnych, przeplatane; wyniki ustawiają priorytety kategorii.
 */
import type { Rng } from '../rng';
import type { Attempt, CategoryId, FactId, Op, ParentSettings, SkillModel, Task } from '../types';
import { CATEGORIES, generateTask, isCategoryAvailable, parseFact, tableOf } from '../math';
import { attemptScore, categoryFacts, clamp, ensureCategory, isValidMs, recordAttempt, safePartner } from './model';
import { DEFAULT_PRIORS, isKnownCategory } from './priors';

/** Docelowa liczba zadań kalibracji. */
export const CALIBRATION_SIZE = 20;
/** Granice priorytetu po kalibracji. */
export const PRIOR_MIN = 0.05;
export const PRIOR_MAX = 0.95;

const OPS: readonly Op[] = ['add', 'sub', 'mul', 'div'];

interface Slot {
  c: CategoryId;
  /** Trudność (do sortowania od łatwych). */
  diff: number;
}

// Kolejność na liście = priorytet wyboru przy małym przydziale; diff = kolejność pokazywania.
const PLAN: Readonly<Record<Op, readonly Slot[]>> = {
  add: [
    { c: 'add.within10', diff: 1 },
    { c: 'add.cross10', diff: 4 },
    { c: 'add.within20', diff: 3 },
    { c: 'add.2d', diff: 5 },
    { c: 'add.cross10', diff: 4 },
    { c: 'add.2d.carry', diff: 6 },
    { c: 'add.complement10', diff: 2 },
    { c: 'add.doubles', diff: 2 },
    { c: 'add.three', diff: 5 },
  ],
  sub: [
    { c: 'sub.within10', diff: 1 },
    { c: 'sub.cross10', diff: 4 },
    { c: 'sub.within20', diff: 3 },
    { c: 'sub.2d', diff: 5 },
    { c: 'sub.cross10', diff: 4 },
    { c: 'sub.2d.borrow', diff: 6 },
    { c: 'sub.missing', diff: 4 },
  ],
  mul: [
    { c: 'mul.t2', diff: 1 },
    { c: 'mul.t5', diff: 1 },
    { c: 'mul.t7', diff: 3 },
    { c: 'mul.t8', diff: 3 },
    { c: 'mul.t9', diff: 3 },
    { c: 'mul.t3', diff: 2 },
    { c: 'mul.t4', diff: 2 },
    { c: 'mul.t6', diff: 3 },
    { c: 'mul.t10', diff: 1 },
  ],
  div: [
    { c: 'div.by2', diff: 1 },
    { c: 'div.by8', diff: 3 },
    { c: 'div.by3', diff: 2 },
    { c: 'div.by5', diff: 1 },
    { c: 'div.by7', diff: 3 },
    { c: 'div.by6', diff: 3 },
    { c: 'div.by9', diff: 3 },
    { c: 'div.by4', diff: 2 },
    { c: 'div.by10', diff: 1 },
  ],
};

/** Grupy podobnych kategorii — nietestowane dostają przesunięcie testowanych z grupy. */
const GROUPS: readonly (readonly CategoryId[])[] = [
  ['add.within10', 'add.complement10', 'add.doubles'],
  ['add.within20', 'add.three'],
  ['add.cross10'],
  ['add.2d', 'add.2d.carry'],
  ['sub.within10'],
  ['sub.within20', 'sub.missing'],
  ['sub.cross10'],
  ['sub.2d', 'sub.2d.borrow'],
  ['mul.t2', 'mul.t5', 'mul.t10'],
  ['mul.t3', 'mul.t4'],
  ['mul.t6', 'mul.t7', 'mul.t8', 'mul.t9'],
  ['div.by2', 'div.by5', 'div.by10'],
  ['div.by3', 'div.by4'],
  ['div.by6', 'div.by7', 'div.by8', 'div.by9'],
];

/**
 * Fakt „reprezentatywny” (bez trywialnych +1, −1 itp.). Tabliczka ×K / :K: drugi czynnik (iloraz) 3..9 —
 * bez ×1, ×2, ×10, bo np. 9 × 2 mierzy tabliczkę ×2, a nie ×9.
 */
function isRepresentative(f: FactId, c: CategoryId): boolean {
  const p = parseFact(f);
  switch (p.op) {
    case 'cmp10':
      return p.a >= 2 && p.a <= 8;
    case 'add':
      return p.a >= 2 && p.b >= 2;
    case 'sub':
      return p.b >= 2 && p.a - p.b >= 2;
    case 'mul': {
      const k = tableOf(c);
      const other = k === p.a ? p.b : p.a;
      return k !== null && (p.a === k || p.b === k) && other >= 3 && other <= 9;
    }
    case 'div': {
      const q = p.a / p.b;
      return q >= 3 && q <= 9;
    }
  }
}

function pickFact(c: CategoryId, settings: ParentSettings, used: Set<FactId>, rng: Rng): FactId | null {
  const facts = categoryFacts(c, settings);
  if (facts === null || facts.length === 0) return null;
  const fresh = facts.filter((f) => !used.has(f));
  const good = fresh.filter((f) => isRepresentative(f, c));
  return rng.pick(good.length > 0 ? good : fresh.length > 0 ? fresh : facts);
}

/**
 * Zadania kalibracji: ok. 20, format 'choice' (4 opcje), rozłożone po włączonych działaniach
 * (przydział po równo; przy małej liczbie kategorii kolejne rundy z innymi faktami), w każdym działaniu
 * od łatwych do trudnych, działania przeplatane (+, −, ×, :, +, …). Id zadań: "cal1", "cal2", …
 * Bez włączonych działań — pusta lista.
 */
export function createCalibration(settings: ParentSettings, rng: Rng): { tasks: Task[] } {
  const ops = OPS.filter((op) => settings.ops[op]);
  const slots = new Map<Op, Slot[]>();
  for (const op of ops) {
    const avail = PLAN[op].filter((s) => isCategoryAvailable(s.c, settings));
    if (avail.length > 0) slots.set(op, avail);
  }
  const active = ops.filter((op) => slots.has(op));

  // Przydział po równo (round-robin); przy małej liczbie kategorii kolejne rundy (inne fakty).
  const perOp: Slot[][] = active.map(() => []);
  for (let k = 0; k < CALIBRATION_SIZE && active.length > 0; k++) {
    const i = k % active.length;
    const list = slots.get(active[i] as Op) as Slot[];
    const mine = perOp[i] as Slot[];
    mine.push(list[mine.length % list.length] as Slot);
  }
  for (const l of perOp) {
    const sorted = l.map((s, i) => ({ s, i })).sort((x, y) => x.s.diff - y.s.diff || x.i - y.i);
    l.splice(0, l.length, ...sorted.map((x) => x.s));
  }

  const order: Slot[] = [];
  const longest = Math.max(0, ...perOp.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of perOp) if (i < l.length) order.push(l[i] as Slot);

  const used = new Set<FactId>();
  const tasks: Task[] = [];
  for (const slot of order) {
    const factId = CATEGORIES[slot.c].factBased ? pickFact(slot.c, settings, used, rng) : null;
    if (factId !== null) {
      used.add(factId);
      const p = safePartner(factId);
      if (p !== null) used.add(p);
    }
    tasks.push(
      generateTask({
        categoryId: slot.c,
        factId,
        rng,
        settings,
        format: 'choice',
        optionsCount: 4,
        id: `cal${tasks.length + 1}`,
      }),
    );
  }
  return { tasks };
}

function median(xs: readonly number[]): number | null {
  if (xs.length < 3) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

const clampPrior = (x: number): number => clamp(x, PRIOR_MIN, PRIOR_MAX);

/**
 * Wyniki kalibracji: każda próba trafia do recordAttempt (bez planowania powtórek),
 * potem dla testowanych kategorii prior = 0.5·domyślny + 0.5·średni wynik s (poprawność
 * skorygowana szybkością względem mediany dziecka w danym działaniu); nietestowane kategorie
 * tego samego działania dostają przesunięcie (prior − domyślny) testowanych z tej samej grupy
 * (np. mul.t6 ← średnia z mul.t7/mul.t8), a bez testowanych w grupie — połowę średniego
 * przesunięcia w działaniu.
 */
export function applyCalibration(model: SkillModel, attempts: readonly Attempt[], _settings: ParentSettings): void {
  const before = new Set(model.retries);
  for (const a of attempts) recordAttempt(model, a, a.at);
  // Kalibracja nie planuje powtórek (inaczej gra zaczęłaby się serią poprawek).
  model.retries = model.retries.filter((r) => before.has(r));

  // Mediana czasu poprawnych odpowiedzi: per działanie, awaryjnie ogólna.
  const msByOp = new Map<Op, number[]>();
  const allMs: number[] = [];
  for (const a of attempts) {
    if (!isKnownCategory(a.categoryId) || !a.correct || a.timedOut || a.helped || !isValidMs(a.ms)) continue;
    const op = CATEGORIES[a.categoryId].op;
    const list = msByOp.get(op) ?? [];
    list.push(a.ms);
    msByOp.set(op, list);
    allMs.push(a.ms);
  }
  const overall = median(allMs);

  const scores = new Map<CategoryId, number[]>();
  for (const a of attempts) {
    if (!isKnownCategory(a.categoryId)) continue;
    const op = CATEGORIES[a.categoryId].op;
    const s = attemptScore(a, median(msByOp.get(op) ?? []) ?? overall);
    const cats = new Set<CategoryId>([a.categoryId]);
    for (const c of a.categories) if (isKnownCategory(c)) cats.add(c);
    for (const c of cats) {
      const list = scores.get(c) ?? [];
      list.push(s);
      scores.set(c, list);
    }
  }

  const delta = new Map<CategoryId, number>();
  for (const [c, list] of scores) {
    const mean = list.reduce((x, y) => x + y, 0) / list.length;
    const prior = clampPrior(0.5 * DEFAULT_PRIORS[c] + 0.5 * mean);
    ensureCategory(model, c).prior = prior;
    delta.set(c, prior - DEFAULT_PRIORS[c]);
  }
  if (delta.size === 0) return;

  const meanDelta = (cs: readonly CategoryId[]): number | null => {
    const ds = cs.map((c) => delta.get(c)).filter((d): d is number => d !== undefined);
    return ds.length > 0 ? ds.reduce((x, y) => x + y, 0) / ds.length : null;
  };
  for (const op of OPS) {
    const opCats = GROUPS.flat().filter((c) => CATEGORIES[c].op === op);
    const opDelta = meanDelta(opCats);
    if (opDelta === null) continue;
    for (const group of GROUPS) {
      if (CATEGORIES[group[0] as CategoryId].op !== op) continue;
      const d = meanDelta(group) ?? opDelta / 2;
      for (const c of group) {
        if (delta.has(c)) continue;
        const st = ensureCategory(model, c);
        st.prior = clampPrior(DEFAULT_PRIORS[c] + d);
        if (st.n === 0) st.m = st.prior;
      }
    }
  }
}
