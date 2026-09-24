import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Bucket, CategoryId, FactState, NumberRange, Op, ParentSettings, SkillModel, Task, TaskFormat, TaskRequest } from '../types';
import { createRng } from '../rng';
import { ALL_CATEGORY_IDS, CATEGORIES, allFacts, categoriesOfFact, commutativePartner, factsOf, isCategoryAvailable } from '../math';
import { createNewSave, deserializeSave, serializeSave, validateSave } from '../save';
import { DEFAULT_PRIORS } from './priors';
import { RETRY_DONE, bucketOf, createSkillModel, isPendingRetry, recordAttempt, startSession } from './model';
import { DEFAULT_QUOTAS, FALLBACK_ORDER, GUARD_ORDER_NEW_CAPPED, classifyResult, pickTask, regulatedQuotas, timeLimitMs } from './scheduler';
import { applyCalibration, createCalibration } from './calibration';
import { T0, attemptForTask, makeSettings } from './testkit';

const S20 = makeSettings();
const MUL_POOL: CategoryId[] = ['mul.t2', 'mul.t3', 'mul.t4', 'mul.t5', 'mul.t6', 'mul.t7', 'mul.t8', 'mul.t9', 'mul.t10'];
const MIXED_POOL: CategoryId[] = ['add.within10', 'add.cross10', 'sub.within10', 'sub.cross10', 'mul.t3', 'mul.t7', 'div.by4'];

const req = (categories: CategoryId[], over: Partial<TaskRequest> = {}): TaskRequest => ({
  categories,
  settings: S20,
  mode: 'combat',
  format: 'choice',
  ...over,
});

function fact(over: Partial<FactState>): FactState {
  return { m: 0.7, lt: null, n: 3, nOk: 2, box: 1, lastSeenAt: T0, lastSeenSession: 0, helped: 0, last2: [true, true], ...over };
}
const MASTERED = (): FactState => fact({ m: 0.9, n: 6, nOk: 6, box: 2, last2: [true, true] });
const WEAK = (): FactState => fact({ m: 0.3, n: 4, nOk: 1, box: 0, last2: [false, false] });
const PROGRESS = (): FactState => fact({ m: 0.65, n: 3, nOk: 2, box: 1, last2: [true, false] });

/** Kategorie faktu lub kategorii proceduralnej zadania. */
const catsOf = (t: Task): CategoryId[] => (t.factId !== null ? categoriesOfFact(t.factId) : [t.categoryId]);

/** Przebieg z dzieckiem, które zawsze odpowiada poprawnie (bez powtórek i bezpiecznika). */
function runCorrect(model: SkillModel, r: TaskRequest, seed: number, count: number): Task[] {
  const rng = createRng(seed);
  const out: Task[] = [];
  let now = T0;
  for (let i = 0; i < count; i++) {
    const t = pickTask(model, r, rng, now);
    recordAttempt(model, attemptForTask(t, true, 3000, now), now);
    out.push(t);
    now += 7000;
  }
  return out;
}

describe('regulatedQuotas (GDD 6.4)', () => {
  const withWindow = (w: boolean[]): SkillModel => ({ ...createSkillModel(), window: w });
  const sum = (q: Record<Bucket, number>): number => q.progress + q.weak + q.mastered + q.new;

  it('domyślne udziały sumują się do 1', () => {
    expect(DEFAULT_QUOTAS).toEqual({ progress: 0.4, weak: 0.25, mastered: 0.25, new: 0.1 });
    expect(sum({ ...DEFAULT_QUOTAS })).toBeCloseTo(1);
  });

  it('okno < 4 wyniki → bez zmian', () => {
    expect(regulatedQuotas(withWindow([false, false, false]))).toEqual(DEFAULT_QUOTAS);
  });

  it('skuteczność < 60% → +15 pp do OPANOWANYCH kosztem SŁABYCH i NOWYCH (proporcjonalnie)', () => {
    const q = regulatedQuotas(withWindow([true, false, false, true, false, true, false, false]));
    expect(q.mastered).toBeCloseTo(0.4);
    expect(q.progress).toBeCloseTo(0.4);
    expect(q.weak).toBeCloseTo(0.25 - (0.15 * 0.25) / 0.35);
    expect(q.new).toBeCloseTo(0.1 - (0.15 * 0.1) / 0.35);
    expect(sum(q)).toBeCloseTo(1);
  });

  it('skuteczność > 90% → +15 pp do SŁABYCH i NOWYCH kosztem OPANOWANYCH i W TOKU', () => {
    const q = regulatedQuotas(withWindow([true, true, true, true, true, true, true, true]));
    expect(q.weak).toBeCloseTo(0.25 + (0.15 * 0.25) / 0.35);
    expect(q.new).toBeCloseTo(0.1 + (0.15 * 0.1) / 0.35);
    expect(q.mastered).toBeCloseTo(0.25 - (0.15 * 0.25) / 0.65);
    expect(q.progress).toBeCloseTo(0.4 - (0.15 * 0.4) / 0.65);
    expect(q.weak + q.new).toBeCloseTo(0.5);
    expect(sum(q)).toBeCloseTo(1);
  });

  it('60–90% (włącznie z granicami) → bez zmian; liczy się tylko 8 ostatnich', () => {
    expect(regulatedQuotas(withWindow([true, true, true, false, false]))).toEqual(DEFAULT_QUOTAS); // 0.6
    expect(regulatedQuotas(withWindow([true, true, true, true, true, true, true, true, true, false]))).toEqual(DEFAULT_QUOTAS);
    expect(regulatedQuotas(withWindow([false, false, false, false, true, true, true, true, true, true, true, true])).weak).toBeGreaterThan(0.25);
  });
});

describe('pickTask — udziały koszyków po regulatorze', () => {
  /**
   * 12 faktów w każdym koszyku poza NOWYMI (6 par przemiennych — obie orientacje w tym samym koszyku,
   * więc wybór orientacji bliźniaka nie zmienia koszyka); historia pusta (bez filtrów i limitu NOWYCH).
   */
  function shares(window: boolean[]): Record<Bucket, number> {
    const m = createSkillModel();
    const pairs = createRng(5).shuffle(
      allFacts(S20).filter((f) => {
        const p = commutativePartner(f);
        return p !== null && f < p && categoriesOfFact(f).some((c) => MUL_POOL.includes(c));
      }),
    );
    const both = (from: number, to: number): string[] =>
      pairs.slice(from, to).flatMap((f) => [f, commutativePartner(f) as string]);
    both(0, 6).forEach((f) => (m.facts[f] = MASTERED()));
    both(6, 12).forEach((f) => (m.facts[f] = WEAK()));
    both(12, 18).forEach((f) => (m.facts[f] = PROGRESS()));
    m.window = window;
    const count: Record<Bucket, number> = { progress: 0, weak: 0, mastered: 0, new: 0 };
    const rng = createRng(77);
    const N = 4000;
    for (let i = 0; i < N; i++) count[bucketOf(m, pickTask(m, req(MUL_POOL), rng, T0).factId as string)] += 1;
    return { progress: count.progress / N, weak: count.weak / N, mastered: count.mastered / N, new: count.new / N };
  }
  const near = (got: Record<Bucket, number>, want: Record<Bucket, number>): void => {
    for (const b of ['progress', 'weak', 'mastered', 'new'] as const) expect(Math.abs(got[b] - want[b])).toBeLessThan(0.03);
  };

  it('okno < 4 → domyślne 40/25/25/10', () => {
    near(shares([]), { progress: 0.4, weak: 0.25, mastered: 0.25, new: 0.1 });
  });

  it('skuteczność < 60% → więcej OPANOWANYCH (regulator działa w doborze)', () => {
    near(shares([false, false, false, false, false, true]), regulatedQuotas({ ...createSkillModel(), window: [false, false, false, false, false, true] }));
    expect(shares([false, false, false, false, false, true]).mastered).toBeGreaterThan(0.36);
  });

  it('skuteczność > 90% → więcej SŁABYCH i NOWYCH', () => {
    const w = [true, true, true, true, true, true, true, true];
    near(shares(w), regulatedQuotas({ ...createSkillModel(), window: w }));
    expect(shares(w).weak).toBeGreaterThan(0.32);
  });
});

describe('pickTask — podstawy', () => {
  it('zwiększa taskCounter, id = "t" + licznik, nie zapisuje próby', () => {
    const m = createSkillModel();
    m.taskCounter = 41;
    const t = pickTask(m, req(MUL_POOL), createRng(1), T0);
    expect(m.taskCounter).toBe(42);
    expect(t.id).toBe('t42');
    expect(MUL_POOL).toContain(t.categoryId);
    expect(m.facts).toEqual({});
    expect(m.recent).toEqual([]);
    expect(m.window).toEqual([]);
  });

  it('deterministyczny dla tego samego ziarna i modelu', () => {
    const a = pickTask(createSkillModel(), req(MIXED_POOL), createRng(7), T0);
    const b = pickTask(createSkillModel(), req(MIXED_POOL), createRng(7), T0);
    expect(a).toEqual(b);
  });

  it('format i liczba opcji z zapytania', () => {
    const t = pickTask(createSkillModel(), req(['mul.t7'], { format: 'choice', optionsCount: 3 }), createRng(3), T0);
    expect(t.options).toHaveLength(3);
    const typed = pickTask(createSkillModel(), req(['mul.t7'], { format: 'typed' }), createRng(3), T0);
    expect(typed.format).toBe('typed');
    expect(typed.options).toEqual([]);
  });

  it('pusta pula → wyjątek (kontrakt: niepusta)', () => {
    expect(() => pickTask(createSkillModel(), req([]), createRng(1), T0)).toThrow();
  });

  it('niedostępne kategorie → zadanie z pierwszej kategorii puli', () => {
    const t1 = pickTask(createSkillModel(), req(['add.2d', 'sub.2d']), createRng(1), T0);
    expect(t1.categoryId).toBe('add.2d');
    const noMul = makeSettings({ ops: { add: true, sub: true, mul: false, div: true } });
    const t2 = pickTask(createSkillModel(), req(['mul.t7'], { settings: noMul }), createRng(1), T0);
    expect(t2.categoryId).toBe('mul.t7');
    expect(t2.factId).not.toBeNull();
  });

  it('pomija niedostępne kategorie, jeśli są dostępne', () => {
    for (let seed = 0; seed < 30; seed++) {
      const t = pickTask(createSkillModel(), req(['add.2d', 'add.within10']), createRng(seed), T0);
      expect(t.categoryId).toBe('add.within10');
    }
  });

  it('kategorie proceduralne biorą udział (factId = null)', () => {
    const m = createSkillModel();
    const tasks = runCorrect(m, req(['add.within10', 'add.three']), 5, 60);
    const proc = tasks.filter((t) => t.categoryId === 'add.three');
    expect(proc.length).toBeGreaterThan(3);
    expect(proc.every((t) => t.factId === null)).toBe(true);
  });

  it('forceBucket wymusza koszyk', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = WEAK();
    m.facts['mul:2x3'] = MASTERED();
    for (let seed = 0; seed < 20; seed++) {
      expect(pickTask(m, req(MUL_POOL, { forceBucket: 'weak' }), createRng(seed), T0).factId).toBe('mul:7x8');
      expect(pickTask(m, req(MUL_POOL, { forceBucket: 'mastered' }), createRng(seed), T0).factId).toBe('mul:2x3');
    }
  });

  it('wagi: słabszy fakt w koszyku wybierany częściej', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = fact({ m: 0.1, n: 4, box: 1, lastSeenSession: 0 });
    m.facts['mul:6x9'] = fact({ m: 0.45, n: 4, box: 1, lastSeenSession: 0 });
    const rng = createRng(11);
    let low = 0;
    for (let i = 0; i < 400; i++) if (pickTask(m, req(MUL_POOL, { forceBucket: 'weak' }), rng, T0).factId === 'mul:7x8') low++;
    // 1.0·(1−m)+0.1: 1.0 vs 0.65 → ok. 60%
    expect(low / 400).toBeGreaterThan(0.52);
    expect(low / 400).toBeLessThan(0.69);
  });

  it('zaległość podnosi wagę', () => {
    const m = createSkillModel();
    m.session = 5;
    m.facts['mul:7x8'] = fact({ m: 0.4, n: 4, box: 1, lastSeenSession: 4 }); // zaległość 0
    m.facts['mul:6x9'] = fact({ m: 0.4, n: 4, box: 1, lastSeenSession: 0 }); // zaległość 2
    const rng = createRng(12);
    let od = 0;
    for (let i = 0; i < 400; i++) if (pickTask(m, req(MUL_POOL, { forceBucket: 'weak' }), rng, T0).factId === 'mul:6x9') od++;
    // 1.7 vs 0.7 → ok. 71%
    expect(od / 400).toBeGreaterThan(0.63);
    expect(od / 400).toBeLessThan(0.79);
  });
});

describe('bezpiecznik frustracji (2 błędy → OPANOWANE)', () => {
  function modelWithBuckets(): SkillModel {
    const m = createSkillModel();
    for (const f of ['mul:2x3', 'mul:5x5', 'mul:10x4', 'mul:2x9']) m.facts[f] = MASTERED();
    for (const f of ['mul:7x8', 'mul:6x9', 'mul:8x7']) m.facts[f] = WEAK();
    for (const f of ['mul:3x4', 'mul:4x6', 'mul:9x3']) m.facts[f] = PROGRESS();
    return m;
  }

  it('po 2 błędach z rzędu następne zadanie jest z OPANOWANYCH', () => {
    for (let seed = 0; seed < 50; seed++) {
      const m = modelWithBuckets();
      const rng = createRng(seed);
      for (let i = 0; i < 2; i++) {
        const t = pickTask(m, req(MUL_POOL), rng, T0);
        recordAttempt(m, attemptForTask(t, false, 5000, T0), T0);
      }
      expect(m.errorStreak).toBe(2);
      const t = pickTask(m, req(MUL_POOL), rng, T0);
      expect(t.factId).not.toBeNull();
      expect(bucketOf(m, t.factId as string)).toBe('mastered');
    }
  });

  it('bezpiecznik ma pierwszeństwo przed zaległą powtórką; powtórka przychodzi zaraz potem', () => {
    const m = modelWithBuckets();
    const rng = createRng(2);
    const wrong: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = pickTask(m, req(MUL_POOL), rng, T0);
      recordAttempt(m, attemptForTask(t, false, 5000, T0), T0);
      wrong.push(t.factId as string);
    }
    // Zadanie 4: powtórka pierwszego błędu jest zaległa, ale seria = 3 → OPANOWANE.
    const t4 = pickTask(m, req(MUL_POOL), rng, T0);
    expect(bucketOf(m, t4.factId as string)).toBe('mastered');
    recordAttempt(m, attemptForTask(t4, true, 3000, T0), T0);
    const t5 = pickTask(m, req(MUL_POOL), rng, T0);
    expect(t5.factId).toBe(wrong[0]);
  });

  it('bez opanowanych → W TOKU, potem NOWE, na końcu SŁABE (NOWE przed SŁABYMI)', () => {
    const m = createSkillModel();
    m.facts['mul:3x4'] = PROGRESS();
    m.facts['mul:4x3'] = PROGRESS();
    m.facts['mul:7x8'] = WEAK();
    m.errorStreak = 2;
    for (let seed = 0; seed < 20; seed++) expect(['mul:3x4', 'mul:4x3']).toContain(pickTask(m, req(MUL_POOL), createRng(seed), T0).factId);
    delete m.facts['mul:3x4'];
    delete m.facts['mul:4x3'];
    // Są NOWE fakty → bezpiecznik bierze NOWY, nie znany słaby 7 × 8.
    for (let seed = 0; seed < 20; seed++) {
      const t = pickTask(m, req(MUL_POOL), createRng(seed), T0);
      expect(bucketOf(m, t.factId as string)).toBe('new');
    }
    // Tylko słabe w puli (wszystkie fakty tabliczki ×7 słabe) → SŁABE.
    const onlyWeak = createSkillModel();
    const t7 = factsOf('mul.t7', S20) ?? [];
    for (const f of t7) onlyWeak.facts[f] = WEAK();
    onlyWeak.errorStreak = 2;
    for (let seed = 0; seed < 20; seed++) {
      const t = pickTask(onlyWeak, req(['mul.t7']), createRng(seed), T0);
      expect(bucketOf(onlyWeak, t.factId as string)).toBe('weak');
    }
  });

  it('kolejność zastępcza bezpiecznika: OPANOWANE → W TOKU → NOWE → SŁABE', () => {
    expect(FALLBACK_ORDER.mastered).toEqual(['mastered', 'progress', 'new', 'weak']);
    // Gdy limit 1 NOWE na 5 zadań blokuje NOWE — SŁABE przed NOWYMI.
    expect(GUARD_ORDER_NEW_CAPPED).toEqual(['mastered', 'progress', 'weak', 'new']);
  });

  it('bezpiecznik nie łamie limitu 1 NOWE na 5 zadań: przy kolejnych błędach SŁABE, nie seria NOWYCH', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = createSkillModel();
      const facts = allFacts(S20).filter((f) => categoriesOfFact(f).some((c) => MUL_POOL.includes(c)));
      // 20 znanych słabych faktów (bez rozruchu), brak OPANOWANYCH i W TOKU; dziecko myli się stale.
      for (const f of createRng(seed).shuffle(facts).slice(0, 20)) m.facts[f] = WEAK();
      const rng = createRng(seed);
      const wasNew: boolean[] = [];
      for (let i = 0; i < 30; i++) {
        const t = pickTask(m, req(MUL_POOL), rng, T0);
        wasNew.push(bucketOf(m, t.factId as string) === 'new');
        recordAttempt(m, attemptForTask(t, false, 5000, T0), T0);
      }
      // Dawniej: po 2 błędach bezpiecznik podawał NOWE w każdym zadaniu (28 NOWYCH pod rząd).
      for (let i = 0; i + 5 <= wasNew.length; i++) {
        expect(wasNew.slice(i, i + 5).filter((x) => x).length, wasNew.map((x) => (x ? 'N' : '.')).join('')).toBeLessThanOrEqual(1);
      }
    }
  });

  it('poprawna odpowiedź wyłącza bezpiecznik', () => {
    const m = modelWithBuckets();
    m.errorStreak = 2;
    const t = pickTask(m, req(MUL_POOL), createRng(1), T0);
    recordAttempt(m, attemptForTask(t, true, 3000, T0), T0);
    expect(m.errorStreak).toBe(0);
  });
});

describe('bliźniaki przemienne: orientacja z mniejszą liczbą prób', () => {
  const count = (m: SkillModel, r: TaskRequest, seeds: number): Map<string, number> => {
    const out = new Map<string, number>();
    for (let seed = 0; seed < seeds; seed++) {
      const f = pickTask(structuredClone(m), r, createRng(seed), T0).factId as string;
      out.set(f, (out.get(f) ?? 0) + 1);
    }
    return out;
  };

  it('słaba para 7 × 8 (n = 10) / 8 × 7 (n = 2): zawsze 8 × 7', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = fact({ m: 0.3, n: 10, nOk: 3, box: 0, last2: [false, false] });
    m.facts['mul:8x7'] = fact({ m: 0.3, n: 2, nOk: 1, box: 0, last2: [false, true] });
    const forced = count(m, req(MUL_POOL, { forceBucket: 'weak' }), 200);
    expect([...forced.keys()]).toEqual(['mul:8x7']);
    // Zwykły dobór: para bywa wybrana, ale zawsze w rzadziej ćwiczonej orientacji.
    const normal = count(m, req(MUL_POOL), 400);
    expect(normal.get('mul:8x7') ?? 0).toBeGreaterThan(20);
    expect(normal.get('mul:7x8')).toBeUndefined();
  });

  it('remis liczby prób → 50/50', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = WEAK();
    m.facts['mul:8x7'] = WEAK();
    const c = count(m, req(MUL_POOL, { forceBucket: 'weak' }), 600);
    const a = c.get('mul:7x8') ?? 0;
    expect(a + (c.get('mul:8x7') ?? 0)).toBe(600);
    expect(a / 600).toBeGreaterThan(0.43);
    expect(a / 600).toBeLessThan(0.57);
  });

  it('bezpiecznik i wymuszony koszyk: bez zmiany koszyka (opanowany 7 × 8 nie zamienia się na 8 × 7 W TOKU)', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = MASTERED();
    m.facts['mul:8x7'] = PROGRESS();
    m.errorStreak = 2;
    expect([...count(m, req(MUL_POOL), 100).keys()]).toEqual(['mul:7x8']);
    m.errorStreak = 0;
    expect([...count(m, req(MUL_POOL, { forceBucket: 'mastered' }), 100).keys()]).toEqual(['mul:7x8']);
  });

  it('powtórka po błędzie pokazuje ten sam fakt (bez zamiany na rzadziej ćwiczonego bliźniaka)', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = fact({ m: 0.3, n: 10, nOk: 3, box: 0, last2: [false, false] });
    m.facts['mul:8x7'] = fact({ m: 0.3, n: 1, nOk: 1, box: 0, last2: [true] });
    m.taskCounter = 10;
    m.retries.push({ factId: 'mul:7x8', categoryId: 'mul.t7', dueAtTask: 11, session: 0 });
    expect(pickTask(m, req(MUL_POOL), createRng(1), T0).factId).toBe('mul:7x8');
  });

  it('słaby 7 × 8 (n = 10) z opanowanym bliźniakiem 8 × 7 (n = 5): słaby fakt nadal ćwiczony (bez zamiany koszyka)', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = fact({ m: 0.3, n: 10, nOk: 3, box: 0, last2: [false, false] });
    m.facts['mul:8x7'] = MASTERED();
    const c = count(m, req(MUL_POOL), 400);
    // Dawniej każde wylosowanie 7 × 8 zamieniało się na opanowany 8 × 7 — słaby fakt nie wracał nigdy.
    expect(c.get('mul:7x8') ?? 0).toBeGreaterThan(40);
    // Odwrotnie: opanowany 7 × 8 (n = 10) nie oddaje miejsca słabemu 8 × 7 (n = 3) — udział OPANOWANYCH bez zmian.
    const r = createSkillModel();
    r.facts['mul:7x8'] = fact({ m: 0.9, n: 10, nOk: 10, box: 2, last2: [true, true] });
    r.facts['mul:8x7'] = fact({ m: 0.3, n: 3, nOk: 1, box: 0, last2: [false, false] });
    const f = count(r, req(MUL_POOL, { forceBucket: 'mastered' }), 50);
    expect([...f.keys()]).toEqual(['mul:7x8']);
    const n = count(r, req(MUL_POOL), 400);
    expect(n.get('mul:7x8') ?? 0).toBeGreaterThan(40);
  });

  it('regulator < 60%: nieoglądany bliźniak nie zabiera udziału OPANOWANYCH (GDD 6.4)', () => {
    const m = createSkillModel();
    const pairs = createRng(5).shuffle(
      allFacts(S20).filter((f) => {
        const p = commutativePartner(f);
        return p !== null && f < p && categoriesOfFact(f).some((c) => MUL_POOL.includes(c));
      }),
    );
    // 12 opanowanych faktów, których bliźniaki znane są tylko z aktualizacji partnera (n = 0 → NOWE),
    // i 12 słabych par.
    for (const f of pairs.slice(0, 12)) {
      m.facts[f] = MASTERED();
      m.facts[commutativePartner(f) as string] = fact({ m: 0.8, n: 0, nOk: 0, box: 0, last2: [] });
    }
    for (const f of pairs.slice(12, 24)) {
      m.facts[f] = WEAK();
      m.facts[commutativePartner(f) as string] = WEAK();
    }
    m.window = [false, false, false, false, false, true];
    const q = regulatedQuotas(m);
    const rng = createRng(3);
    const got: Record<Bucket, number> = { progress: 0, weak: 0, mastered: 0, new: 0 };
    const N = 2000;
    for (let i = 0; i < N; i++) got[bucketOf(m, pickTask(m, req(MUL_POOL), rng, T0).factId as string)] += 1;
    // Brak W TOKU → udziały pozostałych koszyków proporcjonalnie (jak sampleBucket).
    const present = q.mastered + q.weak + q.new;
    expect(Math.abs(got.mastered / N - q.mastered / present)).toBeLessThan(0.04);
    expect(Math.abs(got.new / N - q.new / present)).toBeLessThan(0.04);
    // Bez regulatora (puste okno) nieoglądany bliźniak nadal wchodzi za znanego (limit 1 NOWE na 5).
    m.window = [];
    const free = count(m, req(MUL_POOL), 300);
    const twins = pairs.slice(0, 12).map((f) => commutativePartner(f) as string);
    expect(twins.some((t) => (free.get(t) ?? 0) > 0)).toBe(true);
    expect(pairs.slice(0, 12).every((f) => free.get(f) === undefined)).toBe(true);
  });

  it('limit NOWYCH: nieoglądany bliźniak nie wchodzi, gdy NOWE było w ostatnich 4 zadaniach', () => {
    const m = createSkillModel();
    const facts = allFacts(S20).filter((f) => categoriesOfFact(f).some((c) => MUL_POOL.includes(c)));
    // 30 znanych faktów (bez rozruchu), 7 × 8 opanowany, 8 × 7 nieoglądany (NOWY).
    for (const f of facts.filter((x) => x !== 'mul:8x7').slice(0, 30)) m.facts[f] = fact({ m: 0.3, n: 5, box: 0, last2: [false, false] });
    m.facts['mul:7x8'] = fact({ m: 0.3, n: 5, box: 0, last2: [false, false] });
    // Ostatnie zadanie: pierwsza próba nowego faktu (n = 1).
    m.facts['mul:10x10'] = fact({ m: 0.6, n: 1, box: 0, last2: [true] });
    m.recent = [{ factId: 'mul:10x10', categoryId: 'mul.t10' }];
    const c = count(m, req(MUL_POOL, { forceBucket: 'weak' }), 200);
    expect(c.get('mul:8x7')).toBeUndefined();
    const normal = count(m, req(MUL_POOL), 300);
    expect(normal.get('mul:8x7')).toBeUndefined();
    expect(normal.get('mul:7x8') ?? 0).toBeGreaterThan(0);
    // Bez niedawnego NOWEGO — bliźniak (n = 0 < 5) wchodzi zamiast 7 × 8.
    m.recent = [];
    const free = count(m, req(MUL_POOL), 300);
    expect(free.get('mul:7x8')).toBeUndefined();
    expect(free.get('mul:8x7') ?? 0).toBeGreaterThan(0);
  });
});

describe('powtórka po błędzie (GDD 5.4)', () => {
  const FACT_CATS = ALL_CATEGORY_IDS.filter((c) => CATEGORIES[c].factBased && CATEGORIES[c].minRange <= 20);

  it('błędny fakt wraca po dokładnie 2 innych zadaniach (w oknie 2–4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e9 }),
        fc.uniqueArray(fc.constantFrom(...FACT_CATS), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 30 }),
        (seed, pool, warmup) => {
          const m = createSkillModel();
          const r = req(pool);
          runCorrect(m, r, seed, warmup);
          const rng = createRng(seed + 1);
          const first = pickTask(m, r, rng, T0);
          recordAttempt(m, attemptForTask(first, false, 5000, T0), T0);
          const next: Task[] = [];
          for (let i = 0; i < 3; i++) {
            const t = pickTask(m, r, rng, T0);
            recordAttempt(m, attemptForTask(t, true, 3000, T0), T0);
            next.push(t);
          }
          expect(next[2]?.factId).toBe(first.factId);
          expect(pool).toContain(next[2]?.categoryId);
          // Pula ≥ 9 faktów: przed powtórką fakt się nie pojawia.
          expect(next[0]?.factId).not.toBe(first.factId);
          expect(next[1]?.factId).not.toBe(first.factId);
          expect(m.retries.find((x) => x.factId === first.factId)?.dueAtTask).toBe(RETRY_DONE);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('raz w sesji: kolejny błąd tego faktu nie planuje nowej powtórki; w nowej sesji — znowu', () => {
    const m = createSkillModel();
    const r = req(MUL_POOL);
    const rng = createRng(9);
    runCorrect(m, r, 1, 20);
    const first = pickTask(m, r, rng, T0);
    const f = first.factId as string;
    recordAttempt(m, attemptForTask(first, false, 5000, T0), T0);
    let served = 0;
    for (let i = 0; i < 40; i++) {
      const pending = m.retries.some((x) => x.factId === f && x.dueAtTask !== RETRY_DONE && x.dueAtTask <= m.taskCounter + 1);
      const t = pickTask(m, r, rng, T0);
      if (pending) {
        expect(t.factId).toBe(f);
        served++;
      }
      // Dziecko myli się na tym fakcie za każdym razem.
      recordAttempt(m, attemptForTask(t, t.factId !== f, 3000, T0), T0);
    }
    expect(served).toBe(1);
    expect(m.retries.filter((x) => x.factId === f)).toHaveLength(1);
    startSession(m, T0);
    const t = { ...first, id: 'x' };
    recordAttempt(m, attemptForTask(t, false, 5000, T0), T0);
    expect(m.retries.filter((x) => x.factId === f && x.dueAtTask !== RETRY_DONE)).toHaveLength(1);
  });

  it('podana powtórka przetrwa zapis (validateSave, deserializeSave) i nie wraca drugi raz w sesji', () => {
    const save = createNewSave(T0, 1);
    const m = save.model;
    const r = req(MUL_POOL);
    runCorrect(m, r, 3, 10);
    const rng = createRng(5);
    const first = pickTask(m, r, rng, T0);
    recordAttempt(m, attemptForTask(first, false, 5000, T0), T0);
    for (let i = 0; i < 3; i++) {
      const t = pickTask(m, r, rng, T0);
      recordAttempt(m, attemptForTask(t, true, 3000, T0), T0);
    }
    expect(m.recent.at(-1)?.factId).toBe(first.factId);
    expect(m.retries.filter((x) => x.factId === first.factId && !isPendingRetry(x))).toHaveLength(1);
    expect(validateSave(JSON.parse(serializeSave(save)))).toEqual([]);
    const loaded = deserializeSave(serializeSave(save)).model;
    expect(loaded.retries).toEqual(m.retries);
    // Powtórka traktowana jako zaległa wróciłaby już w 2. zadaniu (poza regułą „nie powtarzaj”);
    // później fakt może wrócić tylko zwykłym losowaniem.
    for (let i = 0; i < 5; i++) {
      const t = pickTask(loaded, r, rng, T0);
      if (i < 3) expect(t.factId).not.toBe(first.factId);
      expect(loaded.retries.filter((x) => x.factId === first.factId && isPendingRetry(x))).toEqual([]);
      recordAttempt(loaded, attemptForTask(t, true, 3000, T0), T0);
    }
  });

  it('powtórka tylko, gdy fakt jest w puli zapytania', () => {
    const m = createSkillModel();
    m.retries.push({ factId: 'mul:7x8', categoryId: 'mul.t7', dueAtTask: 1, session: 0 });
    for (let seed = 0; seed < 20; seed++) {
      const t = pickTask(m, req(['add.within10']), createRng(seed), T0);
      expect(t.categoryId).toBe('add.within10');
    }
    expect(m.retries[0]?.dueAtTask).toBe(1);
    // Fakt dostępny przez inną kategorię z puli (mul.t8).
    const t = pickTask(m, req(['add.within10', 'mul.t8']), createRng(1), T0);
    expect(t.factId).toBe('mul:7x8');
    expect(t.categoryId).toBe('mul.t8');
    expect(m.retries[0]?.dueAtTask).toBe(RETRY_DONE);
  });

  it('powtórki z poprzedniej sesji są ignorowane', () => {
    const m = createSkillModel();
    m.session = 2;
    m.retries.push({ factId: 'mul:7x8', categoryId: 'mul.t7', dueAtTask: 1, session: 1 });
    let hits = 0;
    for (let seed = 0; seed < 30; seed++) if (pickTask(m, req(MUL_POOL), createRng(seed), T0).factId === 'mul:7x8') hits++;
    expect(hits).toBeLessThan(5);
  });
});

describe('reguły „nie powtarzaj” i przeplatanie', () => {
  it('fakt (ani partner przemienny) nie wraca w 3 kolejnych zadaniach', () => {
    for (const pool of [MUL_POOL, MIXED_POOL, ['add.within10', 'add.doubles'] as CategoryId[]]) {
      const tasks = runCorrect(createSkillModel(), req(pool), 3, 300);
      for (let i = 1; i < tasks.length; i++) {
        const f = tasks[i]?.factId;
        if (f === null || f === undefined) continue;
        for (let j = Math.max(0, i - 3); j < i; j++) {
          const g = tasks[j]?.factId;
          expect(g).not.toBe(f);
          expect(g).not.toBe(commutativePartner(f));
        }
      }
    }
  });

  it('bezpiecznik nie łamie zakazu powtórek: woli nowy fakt niż słaby z 3 ostatnich zadań', () => {
    const s10 = makeSettings({ range: 10 });
    const seen = ['add:1+1', 'add:6+1', 'add:7+2'];
    for (let seed = 0; seed < 30; seed++) {
      const m = createSkillModel();
      for (const f of seen) m.facts[f] = WEAK();
      m.recent = seen.map((f) => ({ factId: f, categoryId: 'add.within10' as CategoryId }));
      m.errorStreak = 2;
      const t = pickTask(m, req(['add.within10'], { settings: s10 }), createRng(seed), T0);
      expect(seen).not.toContain(t.factId);
      expect(seen).not.toContain(commutativePartner(t.factId as string));
      expect(bucketOf(m, t.factId as string)).toBe('new');
    }
  });

  it('dowolne odpowiedzi: nigdy 2× pod rząd; w 3 zadaniach fakt (lub partner) wraca tylko jako powtórka po błędzie', () => {
    const FACT_CATS = ALL_CATEGORY_IDS.filter((c) => CATEGORIES[c].factBased);
    fc.assert(
      fc.property(
        fc.constantFrom<NumberRange>(10, 20, 100),
        fc.uniqueArray(fc.constantFrom(...FACT_CATS), { minLength: 1, maxLength: 4 }),
        fc.array(fc.boolean(), { minLength: 20, maxLength: 60 }),
        fc.integer({ min: 0, max: 1e9 }),
        (range, pool, answers, seed) => {
          const settings = makeSettings({ range });
          const avail = pool.filter((c) => isCategoryAvailable(c, settings));
          const poolFacts = new Set(avail.flatMap((c) => factsOf(c, settings) ?? []));
          if (poolFacts.size < 9) return; // mała pula: reguły muszą być łagodzone
          const m = createSkillModel();
          const rng = createRng(seed);
          const tasks: Task[] = [];
          answers.forEach((ok, i) => {
            const t = pickTask(m, req(pool, { settings }), rng, T0 + i * 5000);
            const f = t.factId as string;
            for (let d = 1; d <= 3; d++) {
              const g = tasks[tasks.length - d];
              if (g === undefined || (g.factId !== f && g.factId !== commutativePartner(f))) continue;
              expect(d).toBeGreaterThan(1);
              // Jedyny wyjątek (GDD 6.4: „poza zaplanowaną powtórką”): pierwszy powrót faktu po jego
              // pierwszym błędzie w sesji.
              const k = tasks.findIndex((x, j) => x.factId === f && answers[j] === false);
              expect(k).toBeGreaterThanOrEqual(0);
              expect(tasks.slice(k + 1).some((x) => x.factId === f)).toBe(false);
            }
            recordAttempt(m, attemptForTask(t, ok, 3000, T0 + i * 5000), T0 + i * 5000);
            tasks.push(t);
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('powtórka nie pokazuje faktu drugi raz, jeśli wrócił już wcześniej (łagodzenie reguł)', () => {
    const m = createSkillModel();
    m.taskCounter = 10;
    // Błąd przy zadaniu 10 → powtórka w zadaniu 13; fakt wrócił wcześniej (zadanie 12).
    m.retries.push({ factId: 'add:7+2', categoryId: 'add.within10', dueAtTask: 13, session: 0 });
    m.facts['add:7+2'] = WEAK();
    m.recent = [
      { factId: 'add:1+1', categoryId: 'add.within10' },
      { factId: 'add:6+1', categoryId: 'add.within10' },
    ];
    // Wymuszony koszyk SŁABE bierze jedyny słaby fakt w zadaniu 11 — przed terminem powtórki.
    const t11 = pickTask(m, req(['add.within10'], { settings: makeSettings({ range: 10 }), forceBucket: 'weak' }), createRng(1), T0);
    expect(t11.factId).toBe('add:7+2');
    expect(m.retries[0]?.dueAtTask).toBe(RETRY_DONE);
    recordAttempt(m, attemptForTask(t11, true, 3000, T0), T0);
    for (let i = 0; i < 3; i++) {
      const t = pickTask(m, req(['add.within10'], { settings: makeSettings({ range: 10 }) }), createRng(i), T0);
      expect(t.factId).not.toBe('add:7+2');
      recordAttempt(m, attemptForTask(t, true, 3000, T0), T0);
    }
  });

  it('zaległa powtórka czeka, gdy jej fakt (lub partner) był w poprzednim zadaniu', () => {
    const m = createSkillModel();
    m.taskCounter = 20;
    m.retries.push({ factId: 'mul:7x8', categoryId: 'mul.t7', dueAtTask: 21, session: 0 });
    m.recent = [{ factId: 'mul:8x7', categoryId: 'mul.t8' }];
    const t = pickTask(m, req(MUL_POOL), createRng(1), T0);
    expect(t.factId).not.toBe('mul:7x8');
    expect(m.retries[0]?.dueAtTask).toBe(21);
    recordAttempt(m, attemptForTask(t, true, 3000, T0), T0);
    expect(pickTask(m, req(MUL_POOL), createRng(2), T0).factId).toBe('mul:7x8');
  });

  it('żadna kategoria nie występuje 3 razy pod rząd (pula z wieloma kategoriami)', () => {
    for (const seed of [1, 2, 3]) {
      const tasks = runCorrect(createSkillModel(), req(MIXED_POOL), seed, 300);
      for (let i = 2; i < tasks.length; i++) {
        const a = catsOf(tasks[i] as Task);
        const b = catsOf(tasks[i - 1] as Task);
        const c = catsOf(tasks[i - 2] as Task);
        expect(a.filter((x) => b.includes(x) && c.includes(x))).toEqual([]);
      }
    }
  });

  it('pula jednej małej kategorii: reguły łagodzone, bez wyjątków', () => {
    const tasks = runCorrect(createSkillModel(), req(['add.complement10']), 4, 50);
    expect(tasks.every((t) => t.categoryId === 'add.complement10')).toBe(true);
    const tiny = runCorrect(createSkillModel(), req(['add.doubles'], { settings: makeSettings({ range: 10 }) }), 4, 30);
    expect(new Set(tiny.map((t) => t.factId)).size).toBe(5);
  });

  it('max 1 NOWE na 5 zadań (po rozruchu)', () => {
    for (const seed of [1, 2, 3, 4]) {
      const m = createSkillModel();
      const facts = allFacts(S20).filter((f) => categoriesOfFact(f).some((c) => MUL_POOL.includes(c)));
      for (const f of createRng(seed).shuffle(facts).slice(0, 25)) m.facts[f] = fact({ m: 0.85, n: 5, box: 1 });
      const rng = createRng(seed);
      const wasNew: boolean[] = [];
      for (let i = 0; i < 200; i++) {
        const t = pickTask(m, req(MUL_POOL), rng, T0);
        wasNew.push(bucketOf(m, t.factId as string) === 'new');
        recordAttempt(m, attemptForTask(t, true, 3000, T0), T0);
      }
      for (let i = 0; i + 5 <= wasNew.length; i++) {
        expect(wasNew.slice(i, i + 5).filter((x) => x).length).toBeLessThanOrEqual(1);
      }
      expect(wasNew.filter((x) => x).length).toBeGreaterThan(5);
    }
  });

  it('max 1 NOWE na 5 zadań także, gdy nowy fakt był błędny i wrócił jako powtórka (n = 2)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const m = createSkillModel();
      const facts = allFacts(S20).filter((f) => categoriesOfFact(f).some((c) => MUL_POOL.includes(c)));
      for (const f of createRng(seed).shuffle(facts).slice(0, 25)) m.facts[f] = fact({ m: 0.85, n: 5, box: 1 });
      const rng = createRng(seed);
      const wasNew: boolean[] = [];
      for (let i = 0; i < 200; i++) {
        const t = pickTask(m, req(MUL_POOL), rng, T0);
        const isNew = bucketOf(m, t.factId as string) === 'new';
        wasNew.push(isNew);
        // Dziecko myli się na każdym nowym fakcie → powtórka po 2 zadaniach.
        recordAttempt(m, attemptForTask(t, !isNew, 3000, T0), T0);
      }
      for (let i = 0; i + 5 <= wasNew.length; i++) {
        expect(wasNew.slice(i, i + 5).filter((x) => x).length).toBeLessThanOrEqual(1);
      }
      expect(wasNew.filter((x) => x).length).toBeGreaterThan(5);
    }
  });

  it('rozruch: bez znanych faktów NOWE nie są blokowane', () => {
    const m = createSkillModel();
    const tasks = runCorrect(m, req(['add.within10']), 1, 12);
    expect(new Set(tasks.map((t) => t.factId)).size).toBeGreaterThanOrEqual(8);
  });
});

describe('pickTask — właściwości (fast-check)', () => {
  const settingsArb: fc.Arbitrary<ParentSettings> = fc
    .record({
      range: fc.constantFrom<NumberRange>(10, 20, 100),
      add: fc.boolean(),
      sub: fc.boolean(),
      mul: fc.boolean(),
      div: fc.boolean(),
    })
    .map((r) => makeSettings({ range: r.range, ops: { add: r.add, sub: r.sub, mul: r.mul, div: r.div } as Record<Op, boolean> }));

  it('nigdy nie rzuca; kategoria zawsze z puli; fakt należy do kategorii', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.uniqueArray(fc.constantFrom(...ALL_CATEGORY_IDS), { minLength: 1, maxLength: 8 }),
        fc.constantFrom<TaskFormat>('choice', 'missing', 'typed'),
        fc.option(fc.constantFrom<Bucket>('progress', 'weak', 'mastered', 'new'), { nil: undefined }),
        fc.array(fc.tuple(fc.boolean(), fc.integer({ min: 0, max: 20000 })), { maxLength: 25 }),
        fc.integer({ min: 0, max: 1e9 }),
        (settings, pool, format, forceBucket, answers, seed) => {
          const m = createSkillModel();
          const rng = createRng(seed);
          const r = req(pool, { settings, format, ...(forceBucket !== undefined ? { forceBucket } : {}) });
          let now = T0;
          for (const [ok, ms] of [...answers, [true, 3000] as [boolean, number]]) {
            const before = m.taskCounter;
            const t = pickTask(m, r, rng, now);
            expect(m.taskCounter).toBe(before + 1);
            expect(t.id).toBe(`t${before + 1}`);
            expect(pool).toContain(t.categoryId);
            if (t.factId !== null) expect(categoriesOfFact(t.factId)).toContain(t.categoryId);
            recordAttempt(m, attemptForTask(t, ok, ms, now), now);
            now += 5000;
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('nie rzuca dla nieprawidłowego czasu teraz (NaN), gdy koszyk ma tylko fakty z pudełek ≥ 2', () => {
    const m = createSkillModel();
    m.facts['mul:2x3'] = MASTERED();
    m.facts['mul:5x5'] = MASTERED();
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const t = pickTask(m, req(MUL_POOL, { forceBucket: 'mastered' }), createRng(1), now);
      expect(['mul:2x3', 'mul:5x5']).toContain(t.factId);
    }
  });

  it('pełna pętla (kalibracja, sesje, dobór, próby): zapis poprawny i stabilny po wczytaniu', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.uniqueArray(fc.constantFrom(...ALL_CATEGORY_IDS), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.integer({ min: 0, max: 20 })), { minLength: 5, maxLength: 60 }),
        fc.integer({ min: 0, max: 1e9 }),
        (settings, pool, steps, seed) => {
          const save = createNewSave(T0, seed);
          const m = save.model;
          const rng = createRng(seed);
          startSession(m, T0);
          const cal = createCalibration(settings, rng).tasks;
          applyCalibration(
            m,
            cal.map((t, i) => ({ ...attemptForTask(t, (i + seed) % 3 !== 0, 2500, T0 + i), mode: 'calibration' as const })),
            settings,
          );
          let now = T0 + 1e6;
          for (const [ok, helped, timedOut, k] of steps) {
            if (k === 0) startSession(m, now);
            const t = pickTask(m, req(pool, { settings }), rng, now);
            recordAttempt(m, attemptForTask(t, ok && !timedOut, 1000 + k * 300, now, { helped, timedOut }), now);
            now += 3_600_000 * k;
          }
          expect(validateSave(JSON.parse(serializeSave(save)))).toEqual([]);
          expect(deserializeSave(serializeSave(save)).model).toEqual(m);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fakt zadania należy do puli przy danym zakresie (np. podwajanie do 5+5 przy zakresie 10)', () => {
    const s10 = makeSettings({ range: 10 });
    const allowed = factsOf('add.doubles', s10) ?? [];
    const tasks = runCorrect(createSkillModel(), req(['add.doubles'], { settings: s10 }), 8, 40);
    for (const t of tasks) expect(allowed).toContain(t.factId);
  });
});

describe('timeLimitMs (GDD 7.4)', () => {
  const task = (op: Op, categoryId: CategoryId): Task => ({
    id: 't1',
    factId: null,
    categoryId,
    categories: [categoryId],
    format: 'choice',
    op,
    text: '',
    operands: [],
    answer: 0,
    options: [],
    distractorKinds: {},
  });
  const mode = (m: 'none' | 'gentle' | 'fixed'): ParentSettings =>
    makeSettings({ timeLimit: { mode: m, fixedSec: { add: 10, sub: 11, mul: 12, div: 13 } } });

  it('brak → null (także z dodatkiem sprzętu)', () => {
    expect(timeLimitMs(createSkillModel(), task('add', 'add.within10'), mode('none'), 3)).toBeNull();
  });

  it('łagodny: max(8 s, 2.5 × mediana); bez mediany 8 s (+ −) / 10 s (× :)', () => {
    const m = createSkillModel();
    expect(timeLimitMs(m, task('add', 'add.within10'), mode('gentle'))).toBe(8000);
    expect(timeLimitMs(m, task('sub', 'sub.within10'), mode('gentle'))).toBe(8000);
    expect(timeLimitMs(m, task('mul', 'mul.t7'), mode('gentle'))).toBe(10000);
    expect(timeLimitMs(m, task('div', 'div.by7'), mode('gentle'))).toBe(10000);
    m.categories['mul.t7'] = { recentMs: [2000, 2000, 2000], n: 3, nOk: 3, m: 0.5, prior: DEFAULT_PRIORS['mul.t7'] };
    expect(timeLimitMs(m, task('mul', 'mul.t7'), mode('gentle'))).toBe(8000);
    m.categories['mul.t7'].recentMs = [5001, 5001, 5001];
    expect(timeLimitMs(m, task('mul', 'mul.t7'), mode('gentle'))).toBe(12503);
    expect(timeLimitMs(m, task('mul', 'mul.t7'), mode('gentle'), 2)).toBe(14503);
  });

  it('stały: fixedSec[op] · 1000 (+ dodatek)', () => {
    const m = createSkillModel();
    expect(timeLimitMs(m, task('add', 'add.within10'), mode('fixed'))).toBe(10000);
    expect(timeLimitMs(m, task('div', 'div.by7'), mode('fixed'))).toBe(13000);
    expect(timeLimitMs(m, task('sub', 'sub.within10'), mode('fixed'), 1.5)).toBe(12500);
  });
});

describe('classifyResult (GDD 7.3)', () => {
  const t: Task = pickTask(createSkillModel(), req(['mul.t7']), createRng(1), T0);
  const base = { correct: true, timedOut: false, ms: 3000, helped: false, limitMs: null };

  it('kolejność: timeout → wrong → retryCorrect → late → fast → correct', () => {
    const m = createSkillModel();
    m.categories['mul.t7'] = { recentMs: [4000, 4000, 4000], n: 3, nOk: 3, m: 0.5, prior: 0.35 };
    expect(classifyResult(m, t, { ...base, timedOut: true, correct: true })).toBe('timeout');
    expect(classifyResult(m, t, { ...base, correct: false })).toBe('wrong');
    expect(classifyResult(m, t, { ...base, correct: false, helped: true })).toBe('wrong');
    expect(classifyResult(m, t, { ...base, helped: true, ms: 100 })).toBe('retryCorrect');
    expect(classifyResult(m, t, { ...base, ms: 9000, limitMs: 8000 })).toBe('late');
    expect(classifyResult(m, t, { ...base, ms: 3000, limitMs: 8000 })).toBe('fast');
    expect(classifyResult(m, t, { ...base, ms: 4000 })).toBe('correct');
    expect(classifyResult(m, t, { ...base, ms: 5000 })).toBe('correct');
  });

  it('bez mediany nie ma „fast”', () => {
    expect(classifyResult(createSkillModel(), t, { ...base, ms: 10 })).toBe('correct');
  });
});
