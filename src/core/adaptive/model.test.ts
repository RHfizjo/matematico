import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Attempt, CategoryId, SkillModel } from '../types';
import { ALL_CATEGORY_IDS, CATEGORIES, allFacts, categoriesOfFact } from '../math';
import { createNewSave, emptySkillModel, validateSave } from '../save';
import { DEFAULT_PRIORS } from './priors';
import {
  DAY_MS,
  RETRY_DONE,
  attemptScore,
  bucketOf,
  categoryBucket,
  categoryMastery,
  createSkillModel,
  factMastery,
  isDue,
  isPendingRetry,
  learningRate,
  leitnerIntervalMs,
  medianMs,
  overdue,
  recordAttempt,
  startSession,
} from './model';
import { T0, attempt, makeSettings } from './testkit';

const S20 = makeSettings();

/** Próba dla faktu (kategorie z core/math, pierwsza = główna). */
function factAttempt(f: string, over: Partial<Attempt> = {}): Attempt {
  const cats = categoriesOfFact(f);
  return attempt({ factId: f, categoryId: cats[0] as CategoryId, categories: cats, ...over });
}

function withMedian(model: SkillModel, c: CategoryId, ms: number): void {
  model.categories[c] = { recentMs: [ms, ms, ms], n: 3, nOk: 3, m: DEFAULT_PRIORS[c], prior: DEFAULT_PRIORS[c] };
}

describe('priors', () => {
  it('pokrywają wszystkie kategorie, wartości z GDD 6.6', () => {
    for (const c of ALL_CATEGORY_IDS) {
      expect(DEFAULT_PRIORS[c]).toBeGreaterThan(0);
      expect(DEFAULT_PRIORS[c]).toBeLessThan(1);
    }
    expect(Object.keys(DEFAULT_PRIORS).sort()).toEqual([...ALL_CATEGORY_IDS].sort());
    expect(DEFAULT_PRIORS['add.within10']).toBe(0.6);
    expect(DEFAULT_PRIORS['add.cross10']).toBe(0.4);
    expect(DEFAULT_PRIORS['mul.t2']).toBe(0.6);
    expect(DEFAULT_PRIORS['mul.t10']).toBe(0.6);
    expect(DEFAULT_PRIORS['mul.t4']).toBe(0.45);
    expect(DEFAULT_PRIORS['mul.t7']).toBe(0.35);
    expect(DEFAULT_PRIORS['div.by5']).toBe(0.55);
    expect(DEFAULT_PRIORS['div.by9']).toBe(0.3);
    expect(DEFAULT_PRIORS['sub.2d.borrow']).toBe(0.3);
  });

  it('pełna tabela wartości ze specyfikacji', () => {
    expect(DEFAULT_PRIORS).toEqual({
      'add.within10': 0.6,
      'add.complement10': 0.6,
      'add.doubles': 0.6,
      'add.within20': 0.55,
      'add.cross10': 0.4,
      'add.three': 0.45,
      'add.2d': 0.45,
      'add.2d.carry': 0.35,
      'sub.within10': 0.55,
      'sub.within20': 0.5,
      'sub.cross10': 0.35,
      'sub.missing': 0.4,
      'sub.2d': 0.4,
      'sub.2d.borrow': 0.3,
      'mul.t2': 0.6,
      'mul.t3': 0.45,
      'mul.t4': 0.45,
      'mul.t5': 0.6,
      'mul.t6': 0.35,
      'mul.t7': 0.35,
      'mul.t8': 0.35,
      'mul.t9': 0.35,
      'mul.t10': 0.6,
      'div.by2': 0.55,
      'div.by3': 0.4,
      'div.by4': 0.4,
      'div.by5': 0.55,
      'div.by6': 0.3,
      'div.by7': 0.3,
      'div.by8': 0.3,
      'div.by9': 0.3,
      'div.by10': 0.55,
    });
  });
});

describe('createSkillModel / startSession', () => {
  it('ten sam kształt co emptySkillModel', () => {
    expect(createSkillModel()).toEqual(emptySkillModel());
  });

  it('startSession zwiększa numer sesji i usuwa stare powtórki', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('mul:7x8', { correct: false }), T0);
    expect(m.retries).toHaveLength(1);
    startSession(m, T0);
    expect(m.session).toBe(1);
    expect(m.retries).toHaveLength(0);
  });
});

describe('attemptScore (GDD 6.3)', () => {
  const a = (over: Partial<Attempt>): Attempt => attempt({ categoryId: 'mul.t7', ...over });

  it('błąd i brak odpowiedzi → 0', () => {
    expect(attemptScore(a({ correct: false }), 3000)).toBe(0);
    expect(attemptScore(a({ correct: true, timedOut: true }), 3000)).toBe(0);
    expect(attemptScore(a({ correct: false, helped: true }), 3000)).toBe(0);
  });

  it('poprawnie z pomocą → 0.5', () => {
    expect(attemptScore(a({ helped: true, ms: 100 }), 3000)).toBe(0.5);
  });

  it('poprawnie: 0.6 + 0.4·szybkość, progi 0.8× i 2.5× mediany', () => {
    expect(attemptScore(a({ ms: 2400 }), 3000)).toBeCloseTo(1);
    expect(attemptScore(a({ ms: 1000 }), 3000)).toBeCloseTo(1);
    expect(attemptScore(a({ ms: 7500 }), 3000)).toBeCloseTo(0.6);
    expect(attemptScore(a({ ms: 20000 }), 3000)).toBeCloseTo(0.6);
    expect(attemptScore(a({ ms: 4950 }), 3000)).toBeCloseTo(0.8);
  });

  it('bez mediany lub z nieprawidłowym czasem szybkość = 0.5', () => {
    expect(attemptScore(a({ ms: 100 }), null)).toBeCloseTo(0.8);
    expect(attemptScore(a({ ms: 0 }), 3000)).toBeCloseTo(0.8);
    expect(attemptScore(a({ ms: Number.NaN }), 3000)).toBeCloseTo(0.8);
    expect(attemptScore(a({ ms: 1000 }), 0)).toBeCloseTo(0.8);
  });

  it('zawsze w [0,1]', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.double({ min: -1e6, max: 1e7 }),
        fc.option(fc.double({ min: -10, max: 1e6 })),
        (correct, timedOut, helped, ms, med) => {
          const s = attemptScore(a({ correct, timedOut, helped, ms }), med);
          return s >= 0 && s <= 1;
        },
      ),
    );
  });
});

describe('learningRate', () => {
  it('0.5 dla pierwszych 3 prób, potem 0.35 (wpisywanie) i 0.25 (wybór, brakująca)', () => {
    expect(learningRate(0, 'choice')).toBe(0.5);
    expect(learningRate(2, 'typed')).toBe(0.5);
    expect(learningRate(3, 'typed')).toBe(0.35);
    expect(learningRate(3, 'choice')).toBe(0.25);
    expect(learningRate(10, 'missing')).toBe(0.25);
  });
});

describe('recordAttempt — fakt', () => {
  it('pierwsza próba: m z priorytetu kategorii, α = 0.5, liczniki, lastSeen', () => {
    const m = createSkillModel();
    m.session = 3;
    recordAttempt(m, factAttempt('mul:7x8'), T0 + 5);
    const st = m.facts['mul:7x8'];
    // prior mul.t7 = 0.35; s = 0.8 (brak mediany) → 0.35 + 0.5·0.45
    expect(st?.m).toBeCloseTo(0.575);
    expect(st).toMatchObject({ n: 1, nOk: 1, helped: 0, last2: [true], lastSeenAt: T0 + 5, lastSeenSession: 3, box: 0 });
    expect(st?.lt).toBeCloseTo(Math.log(3000));
  });

  it('EWMA: α = 0.5 ×3, potem 0.25 (wybór) lub 0.35 (wpisywanie)', () => {
    for (const [format, alpha] of [
      ['choice', 0.25],
      ['typed', 0.35],
    ] as const) {
      const m = createSkillModel();
      let expected = 0.35;
      for (let i = 0; i < 3; i++) {
        recordAttempt(m, factAttempt('mul:7x8', { format, correct: false }), T0);
        expected += 0.5 * (0 - expected);
      }
      expect(m.facts['mul:7x8']?.m).toBeCloseTo(expected);
      recordAttempt(m, factAttempt('mul:7x8', { format }), T0);
      // Mediana: po 1 poprawnej próbie jeszcze brak (min. 3 czasy) → s = 0.8
      expected += alpha * (0.8 - expected);
      expect(m.facts['mul:7x8']?.m).toBeCloseTo(expected);
    }
  });

  it('wynik liczony z mediany kategorii głównej sprzed próby', () => {
    const m = createSkillModel();
    withMedian(m, 'mul.t7', 3000);
    recordAttempt(m, factAttempt('mul:7x8', { ms: 2000 }), T0);
    // s = 1 → 0.35 + 0.5·0.65
    expect(m.facts['mul:7x8']?.m).toBeCloseTo(0.675);
  });

  it('lt: EWMA ln(ms) tylko poprawnych bez pomocy z ważnym czasem', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('add:8+7', { ms: 3000 }), T0);
    recordAttempt(m, factAttempt('add:8+7', { ms: 6000 }), T0);
    const lt = Math.log(3000) + 0.5 * (Math.log(6000) - Math.log(3000));
    expect(m.facts['add:8+7']?.lt).toBeCloseTo(lt);
    recordAttempt(m, factAttempt('add:8+7', { ms: 20000, correct: false }), T0);
    recordAttempt(m, factAttempt('add:8+7', { ms: 20000, helped: true }), T0);
    recordAttempt(m, factAttempt('add:8+7', { ms: 0 }), T0);
    expect(m.facts['add:8+7']?.lt).toBeCloseTo(lt);
  });

  it('pomoc: nOk i helped rosną, last2 = false (tylko samodzielne poprawne), pudełko bez zmian', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('mul:2x3', { helped: true }), T0);
    expect(m.facts['mul:2x3']).toMatchObject({ n: 1, nOk: 1, helped: 1, last2: [false], box: 0 });
    expect(m.facts['mul:2x3']?.m).toBeCloseTo(0.6 + 0.5 * (0.5 - 0.6));
  });

  it('last2 trzyma 2 ostatnie wyniki', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('mul:2x3'), T0);
    recordAttempt(m, factAttempt('mul:2x3', { correct: false }), T0);
    recordAttempt(m, factAttempt('mul:2x3'), T0);
    expect(m.facts['mul:2x3']?.last2).toEqual([false, true]);
  });

  it('nieprawidłowy czas: poprawność liczona, statystyki czasu pominięte', () => {
    for (const ms of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = createSkillModel();
      recordAttempt(m, factAttempt('mul:7x8', { ms }), T0);
      expect(m.facts['mul:7x8']).toMatchObject({ n: 1, nOk: 1, lt: null });
      expect(m.categories['mul.t7']?.recentMs).toEqual([]);
      expect(m.categories['mul.t7']?.nOk).toBe(1);
    }
  });

  it('partner przemienny: m z połową α, bez zmiany n (dalej NOWY)', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('mul:7x8'), T0);
    const p = m.facts['mul:8x7'];
    // prior mul:8x7 = mul.t7 (pierwsza kategoria) = 0.35; α/2 = 0.25; s = 0.8
    expect(p?.m).toBeCloseTo(0.35 + 0.25 * 0.45);
    expect(p?.n).toBe(0);
    expect(bucketOf(m, 'mul:8x7')).toBe('new');
    const before = p?.m ?? 1;
    recordAttempt(m, factAttempt('mul:7x8', { correct: false }), T0);
    expect(m.facts['mul:8x7']?.m).toBeCloseTo(before - 0.25 * before);
  });

  it('brak partnera dla a = b, odejmowania i dzielenia', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('mul:7x7'), T0);
    recordAttempt(m, factAttempt('sub:15-8'), T0);
    recordAttempt(m, factAttempt('div:56:8'), T0);
    expect(Object.keys(m.facts).sort()).toEqual(['div:56:8', 'mul:7x7', 'sub:15-8']);
  });

  it('dodawanie ma partnera (add:8+7 → add:7+8)', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('add:8+7'), T0);
    expect(m.facts['add:7+8']?.n).toBe(0);
    expect(m.facts['add:7+8']?.m).toBeGreaterThan(DEFAULT_PRIORS['add.cross10']);
  });

  it('fakt spoza uniwersum/błędny: tylko poziom kategorii', () => {
    const m = createSkillModel();
    recordAttempt(m, attempt({ factId: 'mul:1x1', categoryId: 'mul.t2', correct: false }), T0);
    recordAttempt(m, attempt({ factId: 'bzdura', categoryId: 'mul.t2', correct: false }), T0);
    expect(m.facts).toEqual({});
    expect(m.retries).toEqual([]);
    expect(m.categories['mul.t2']?.n).toBe(2);
  });
});

describe('recordAttempt — pudełka Leitnera', () => {
  const DAY = DAY_MS;

  it('awans tylko przy m ≥ 0.6 i gdy fakt jest „do powtórki”; błąd → −2', () => {
    const m = createSkillModel();
    m.session = 1;
    const f = 'mul:2x3'; // prior 0.6
    recordAttempt(m, factAttempt(f), T0); // m = 0.7 → pudełko 0 → 1
    expect(m.facts[f]?.box).toBe(1);
    recordAttempt(m, factAttempt(f), T0 + 1000); // ta sama sesja: pudełko 1 nie jest do powtórki
    expect(m.facts[f]?.box).toBe(1);
    expect(isDue(m, f, T0 + 1000)).toBe(false);
    startSession(m, T0 + DAY);
    expect(isDue(m, f, T0 + DAY)).toBe(true);
    recordAttempt(m, factAttempt(f), T0 + DAY); // → 2
    expect(m.facts[f]?.box).toBe(2);
    recordAttempt(m, factAttempt(f), T0 + DAY + 1000); // 1 dzień nie minął
    expect(m.facts[f]?.box).toBe(2);
    recordAttempt(m, factAttempt(f), T0 + 2 * DAY + 1000); // → 3
    expect(m.facts[f]?.box).toBe(3);
    recordAttempt(m, factAttempt(f), T0 + 5 * DAY + 1000); // 3 dni → 4
    expect(m.facts[f]?.box).toBe(4);
    recordAttempt(m, factAttempt(f), T0 + 12 * DAY + 1000); // 7 dni → 5
    expect(m.facts[f]?.box).toBe(5);
    recordAttempt(m, factAttempt(f), T0 + 40 * DAY); // max 5
    expect(m.facts[f]?.box).toBe(5);
    recordAttempt(m, factAttempt(f, { correct: false }), T0 + 40 * DAY);
    expect(m.facts[f]?.box).toBe(3);
    recordAttempt(m, factAttempt(f, { timedOut: true, correct: false }), T0 + 40 * DAY);
    expect(m.facts[f]?.box).toBe(1);
    recordAttempt(m, factAttempt(f, { correct: false }), T0 + 40 * DAY);
    expect(m.facts[f]?.box).toBe(0);
  });

  it('brak awansu przy m < 0.6', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('mul:7x8'), T0); // m = 0.575
    expect(m.facts['mul:7x8']?.box).toBe(0);
    recordAttempt(m, factAttempt('mul:7x8'), T0); // m ≈ 0.69
    expect(m.facts['mul:7x8']?.box).toBe(1);
  });

  it('interwały: 0, 0 (następna sesja), 1, 3, 7, 14 dni', () => {
    expect([0, 1, 2, 3, 4, 5].map(leitnerIntervalMs)).toEqual([0, 0, DAY, 3 * DAY, 7 * DAY, 14 * DAY]);
    expect(leitnerIntervalMs(-3)).toBe(0);
    expect(leitnerIntervalMs(99)).toBe(14 * DAY);
  });

  it('zaległość ∈ [0,2]', () => {
    const m = createSkillModel();
    expect(overdue(m, 'mul:7x8', T0)).toBe(0); // niewidziany
    const st = (box: number, lastSeenAt: number, lastSeenSession: number): void => {
      m.facts['mul:7x8'] = { m: 0.7, lt: null, n: 3, nOk: 2, box, lastSeenAt, lastSeenSession, helped: 0, last2: [true, true] };
    };
    m.session = 5;
    st(0, T0, 5);
    expect(overdue(m, 'mul:7x8', T0)).toBe(2);
    st(1, T0, 5);
    expect(overdue(m, 'mul:7x8', T0)).toBe(0);
    st(1, T0, 4);
    expect(overdue(m, 'mul:7x8', T0)).toBe(0);
    st(1, T0, 3);
    expect(overdue(m, 'mul:7x8', T0)).toBe(1);
    st(1, T0, 0);
    expect(overdue(m, 'mul:7x8', T0)).toBe(2);
    st(2, T0, 4);
    expect(overdue(m, 'mul:7x8', T0 + DAY / 2)).toBe(0);
    expect(overdue(m, 'mul:7x8', T0 + 2 * DAY)).toBeCloseTo(1);
    expect(overdue(m, 'mul:7x8', T0 + 10 * DAY)).toBe(2);
    st(5, T0, 4);
    expect(overdue(m, 'mul:7x8', T0 + 21 * DAY)).toBeCloseTo(0.5);
  });

  it('zaległość w [0,2] także dla nieprawidłowego czasu (NaN, ±∞)', () => {
    const m = createSkillModel();
    m.facts['mul:7x8'] = { m: 0.9, lt: null, n: 6, nOk: 6, box: 3, lastSeenAt: T0, lastSeenSession: 0, helped: 0, last2: [true, true] };
    expect(overdue(m, 'mul:7x8', Number.NaN)).toBe(0);
    expect(overdue(m, 'mul:7x8', Number.POSITIVE_INFINITY)).toBe(2);
    expect(overdue(m, 'mul:7x8', Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('recordAttempt — kategorie, okno, powtórki', () => {
  it('wszystkie kategorie próby: n, nOk, recentMs (max 30), m', () => {
    const m = createSkillModel();
    recordAttempt(m, factAttempt('mul:7x8', { ms: 2500 }), T0);
    for (const c of ['mul.t7', 'mul.t8'] as const) {
      expect(m.categories[c]).toMatchObject({ n: 1, nOk: 1, recentMs: [2500], prior: DEFAULT_PRIORS[c] });
    }
    recordAttempt(m, factAttempt('mul:7x8', { helped: true, ms: 9000 }), T0);
    expect(m.categories['mul.t7']?.recentMs).toEqual([2500]);
    for (let i = 0; i < 40; i++) recordAttempt(m, factAttempt('mul:7x8', { ms: 1000 + i }), T0);
    expect(m.categories['mul.t7']?.recentMs).toHaveLength(30);
    expect(m.categories['mul.t7']?.recentMs.at(-1)).toBe(1039);
  });

  it('kategoria proceduralna: m jako EWMA, categoryMastery = m', () => {
    const m = createSkillModel();
    expect(categoryMastery(m, 'add.three', S20)).toBe(DEFAULT_PRIORS['add.three']);
    recordAttempt(m, attempt({ categoryId: 'add.three', correct: false }), T0);
    expect(m.categories['add.three']?.m).toBeCloseTo(0.45 * 0.5);
    expect(categoryMastery(m, 'add.three', S20)).toBeCloseTo(0.225);
    expect(categoryBucket(m, 'add.three')).toBe('weak');
    expect(m.retries).toEqual([]); // proceduralne — bez powtórek faktu
  });

  it('okno max 8, ostatnie max 6, seria błędów', () => {
    const m = createSkillModel();
    for (let i = 0; i < 10; i++) recordAttempt(m, factAttempt('mul:2x3'), T0);
    expect(m.window).toHaveLength(8);
    expect(m.recent).toHaveLength(6);
    expect(m.recent.at(-1)).toEqual({ factId: 'mul:2x3', categoryId: 'mul.t2' });
    recordAttempt(m, factAttempt('mul:2x4', { correct: false }), T0);
    recordAttempt(m, factAttempt('mul:2x5', { timedOut: true, correct: false }), T0);
    expect(m.errorStreak).toBe(2);
    expect(m.window.slice(-2)).toEqual([false, false]);
    recordAttempt(m, factAttempt('mul:2x6', { helped: true }), T0);
    expect(m.errorStreak).toBe(0);
  });

  it('błąd → powtórka po 2 zadaniach (dueAtTask = licznik + 3), raz na fakt w sesji', () => {
    const m = createSkillModel();
    m.taskCounter = 10;
    recordAttempt(m, factAttempt('mul:7x8', { categoryId: 'mul.t8' }), T0);
    expect(m.retries).toEqual([]);
    recordAttempt(m, factAttempt('mul:7x8', { categoryId: 'mul.t8', correct: false }), T0);
    expect(m.retries).toEqual([{ factId: 'mul:7x8', categoryId: 'mul.t8', dueAtTask: 13, session: 0 }]);
    m.taskCounter = 20;
    recordAttempt(m, factAttempt('mul:7x8', { timedOut: true, correct: false }), T0);
    expect(m.retries).toHaveLength(1);
    // Podana powtórka też blokuje kolejną w tej sesji.
    (m.retries[0] as { dueAtTask: number }).dueAtTask = RETRY_DONE;
    recordAttempt(m, factAttempt('mul:7x8', { correct: false }), T0);
    expect(m.retries).toHaveLength(1);
    startSession(m, T0);
    recordAttempt(m, factAttempt('mul:7x8', { correct: false }), T0);
    expect(m.retries).toEqual([{ factId: 'mul:7x8', categoryId: 'mul.t7', dueAtTask: 23, session: 1 }]);
  });

  it('najwyżej 50 wpisów: najpierw usuwane podane, potem najstarsze', () => {
    const m = createSkillModel();
    const facts = allFacts(S20).filter((f) => categoriesOfFact(f).length > 0).slice(0, 60);
    recordAttempt(m, factAttempt(facts[0] as string, { correct: false }), T0);
    (m.retries[0] as { dueAtTask: number }).dueAtTask = RETRY_DONE;
    for (const f of facts.slice(1)) recordAttempt(m, factAttempt(f, { correct: false }), T0);
    expect(m.retries).toHaveLength(50);
    expect(m.retries.some((r) => r.factId === facts[0])).toBe(false);
    expect(m.retries.at(-1)?.factId).toBe(facts[59]);
    expect(m.retries[0]?.factId).toBe(facts[10]);
    expect(m.retries.every(isPendingRetry)).toBe(true);
  });

  it('powtórka z kategorią, do której fakt należy (nawet przy błędnej kategorii głównej)', () => {
    const m = createSkillModel();
    recordAttempt(m, attempt({ factId: 'add:8+7', categoryId: 'mul.t2', categories: ['add.cross10'], correct: false }), T0);
    expect(m.retries[0]?.categoryId).toBe('add.cross10');
  });
});

describe('opanowanie, mediana, koszyki', () => {
  it('factMastery: priorytet PIERWSZEJ kategorii faktu, potem m', () => {
    const m = createSkillModel();
    expect(factMastery(m, 'mul:2x7')).toBe(0.6);
    expect(factMastery(m, 'mul:7x2')).toBe(0.6);
    expect(factMastery(m, 'mul:7x8')).toBe(0.35);
    expect(factMastery(m, 'add:6+6')).toBe(0.6); // add.doubles przed add.cross10
    expect(factMastery(m, 'mul:1x1')).toBe(0.5);
    m.categories['mul.t7'] = { recentMs: [], n: 0, nOk: 0, m: 0.9, prior: 0.9 };
    expect(factMastery(m, 'mul:7x8')).toBe(0.9);
    recordAttempt(m, factAttempt('mul:7x8', { correct: false }), T0);
    expect(factMastery(m, 'mul:7x8')).toBeCloseTo(0.45);
  });

  it('factMastery nieoglądanego faktu: priorytet kategorii z największą liczbą dowodów (n), stan przed brakiem stanu', () => {
    const m = createSkillModel();
    const cs = (n: number, prior: number) => ({ recentMs: [], n, nOk: 0, m: prior, prior });
    // Tylko mul.t8 ma stan (np. priorytet z kalibracji, n = 0) → wygrywa z mul.t7 bez stanu.
    m.categories['mul.t8'] = cs(0, 0.8);
    expect(factMastery(m, 'mul:7x8')).toBe(0.8);
    expect(factMastery(m, 'mul:8x7')).toBe(0.8);
    // Obie ze stanem: większe n wygrywa.
    m.categories['mul.t7'] = cs(1, 0.2);
    expect(factMastery(m, 'mul:7x8')).toBe(0.2);
    m.categories['mul.t8'] = cs(5, 0.8);
    expect(factMastery(m, 'mul:7x8')).toBe(0.8);
    // Remis → pierwsza kategoria faktu (mul.t7).
    m.categories['mul.t7'] = cs(5, 0.2);
    expect(factMastery(m, 'mul:8x7')).toBe(0.2);
    // Fakt ze stanem — zawsze własne m.
    m.facts['mul:7x8'] = { m: 0.42, lt: null, n: 0, nOk: 0, box: 0, lastSeenAt: 0, lastSeenSession: 0, helped: 0, last2: [] };
    expect(factMastery(m, 'mul:7x8')).toBe(0.42);
    // Pierwsza próba nieoglądanego faktu startuje z tego samego priorytetu.
    const fresh = createSkillModel();
    fresh.categories['mul.t9'] = cs(3, 0.1);
    recordAttempt(fresh, factAttempt('mul:6x9', { correct: false }), T0);
    expect(fresh.facts['mul:6x9']?.m).toBeCloseTo(0.1 * 0.5);
  });

  it('categoryMastery faktowej = średnia faktów (z priorytetami)', () => {
    const m = createSkillModel();
    expect(categoryMastery(m, 'mul.t7', S20)).toBeCloseTo(
      // 19 faktów: mul:1x7..10x7 i 7x1..7x10; pierwsza kategoria decyduje o priorytecie
      (() => {
        let sum = 0;
        const facts = allFacts(S20).filter((f) => categoriesOfFact(f).includes('mul.t7'));
        for (const f of facts) sum += DEFAULT_PRIORS[categoriesOfFact(f)[0] as CategoryId];
        return sum / facts.length;
      })(),
    );
    m.facts['mul:7x8'] = { m: 1, lt: null, n: 5, nOk: 5, box: 2, lastSeenAt: T0, lastSeenSession: 0, helped: 0, last2: [true, true] };
    const before = categoryMastery(createSkillModel(), 'mul.t7', S20);
    expect(categoryMastery(m, 'mul.t7', S20)).toBeCloseTo(before + (1 - 0.35) / 19);
  });

  it('medianMs: null przy < 3, mediana nieparzysta i parzysta', () => {
    const m = createSkillModel();
    expect(medianMs(m, 'mul.t7')).toBeNull();
    m.categories['mul.t7'] = { recentMs: [5000, 1000], n: 2, nOk: 2, m: 0.5, prior: 0.35 };
    expect(medianMs(m, 'mul.t7')).toBeNull();
    m.categories['mul.t7'].recentMs = [5000, 1000, 3000];
    expect(medianMs(m, 'mul.t7')).toBe(3000);
    m.categories['mul.t7'].recentMs = [5000, 1000, 3000, 2000];
    expect(medianMs(m, 'mul.t7')).toBe(2500);
  });

  it('bucketOf: NOWE / SŁABE / W TOKU / OPANOWANE (GDD 6.4)', () => {
    const m = createSkillModel();
    const set = (mm: number, n: number, last2: boolean[]): void => {
      m.facts['add:3+4'] = { m: mm, lt: null, n, nOk: n, box: 0, lastSeenAt: T0, lastSeenSession: 0, helped: 0, last2 };
    };
    expect(bucketOf(m, 'add:3+4')).toBe('new');
    set(0.9, 0, []);
    expect(bucketOf(m, 'add:3+4')).toBe('new');
    set(0.49, 1, [false]);
    expect(bucketOf(m, 'add:3+4')).toBe('weak');
    set(0.5, 1, [true]);
    expect(bucketOf(m, 'add:3+4')).toBe('progress');
    set(0.8, 4, [true, true]);
    expect(bucketOf(m, 'add:3+4')).toBe('mastered');
    set(0.95, 3, [true, true]);
    expect(bucketOf(m, 'add:3+4')).toBe('progress');
    set(0.95, 6, [false, true]);
    expect(bucketOf(m, 'add:3+4')).toBe('progress');
    set(0.79, 6, [true, true]);
    expect(bucketOf(m, 'add:3+4')).toBe('progress');
  });

  it('categoryBucket dla kategorii proceduralnej', () => {
    const m = createSkillModel();
    expect(categoryBucket(m, 'add.three')).toBe('new');
    m.categories['add.three'] = { recentMs: [], n: 4, nOk: 4, m: 0.85, prior: 0.45 };
    expect(categoryBucket(m, 'add.three')).toBe('mastered');
    m.categories['add.three'].m = 0.6;
    expect(categoryBucket(m, 'add.three')).toBe('progress');
  });
});

describe('model po dowolnych próbach przechodzi walidację zapisu', () => {
  const FACTS = allFacts(makeSettings({ range: 100 }));
  const cats = ALL_CATEGORY_IDS.filter((c) => !CATEGORIES[c].factBased);
  const attemptArb = fc.record({
    kind: fc.integer({ min: 0, max: 9 }),
    fact: fc.constantFrom(...FACTS),
    proc: fc.constantFrom(...cats),
    correct: fc.boolean(),
    timedOut: fc.boolean(),
    helped: fc.boolean(),
    ms: fc.oneof(fc.integer({ min: 1, max: 60000 }), fc.constantFrom(0, -1, Number.NaN, Number.POSITIVE_INFINITY)),
    format: fc.constantFrom('choice', 'missing', 'typed') as fc.Arbitrary<Attempt['format']>,
    dt: fc.integer({ min: 0, max: 3 * DAY_MS }),
    newSession: fc.boolean(),
  });

  it('fast-check', () => {
    fc.assert(
      fc.property(fc.array(attemptArb, { maxLength: 80 }), (list) => {
        const save = createNewSave(T0, 1);
        const m = save.model;
        let now = T0;
        for (const x of list) {
          now += x.dt;
          if (x.newSession && x.kind === 0) startSession(m, now);
          m.taskCounter += 1;
          const a =
            x.kind < 8
              ? factAttempt(x.fact, { correct: x.correct, timedOut: x.timedOut, helped: x.helped, ms: x.ms, format: x.format })
              : attempt({ categoryId: x.proc, correct: x.correct, timedOut: x.timedOut, helped: x.helped, ms: x.ms, format: x.format });
          recordAttempt(m, a, now);
        }
        const errors = validateSave(JSON.parse(JSON.stringify(save)));
        expect(errors).toEqual([]);
        for (const st of Object.values(m.facts)) {
          expect(st.m).toBeGreaterThanOrEqual(0);
          expect(st.m).toBeLessThanOrEqual(1);
          expect(st.box).toBeGreaterThanOrEqual(0);
          expect(st.box).toBeLessThanOrEqual(5);
        }
      }),
      { numRuns: 150 },
    );
  });
});
