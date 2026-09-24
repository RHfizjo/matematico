import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Attempt, CategoryId, NumberRange, Op, Task } from '../types';
import { createRng } from '../rng';
import { CATEGORIES, categoriesOfFact, commutativePartner, isCategoryAvailable } from '../math';
import { DEFAULT_PRIORS } from './priors';
import { createSkillModel, factMastery, recordAttempt, startSession } from './model';
import { DEFAULT_QUOTAS, pickTask, regulatedQuotas } from './scheduler';
import { CALIBRATION_SIZE, applyCalibration, createCalibration } from './calibration';
import { T0, attemptForTask, makeSettings } from './testkit';

// Trudność kategorii (jak w planie kalibracji).
const RANK: Record<string, number> = {
  'add.within10': 1,
  'add.complement10': 2,
  'add.doubles': 2,
  'add.within20': 3,
  'add.cross10': 4,
  'add.2d': 5,
  'add.three': 5,
  'add.2d.carry': 6,
  'sub.within10': 1,
  'sub.within20': 3,
  'sub.cross10': 4,
  'sub.missing': 4,
  'sub.2d': 5,
  'sub.2d.borrow': 6,
};
const rank = (c: CategoryId): number => RANK[c] ?? (/t(2|5|10)$|by(2|5|10)$/.test(c) ? 1 : /t[34]$|by[34]$/.test(c) ? 2 : 3);

function answerAll(tasks: Task[], ok: (t: Task, i: number) => boolean, ms: (t: Task, i: number) => number): Attempt[] {
  return tasks.map((t, i) => ({ ...attemptForTask(t, ok(t, i), ms(t, i), T0 + i * 10000), mode: 'calibration' as const }));
}

describe('createCalibration', () => {
  it('domyślne ustawienia: 20 zadań, 5 na działanie, wybór z 4 opcji, przeplatane', () => {
    const { tasks } = createCalibration(makeSettings(), createRng(1));
    expect(tasks).toHaveLength(CALIBRATION_SIZE);
    const ops = tasks.map((t) => CATEGORIES[t.categoryId].op);
    for (const op of ['add', 'sub', 'mul', 'div'] as const) expect(ops.filter((o) => o === op)).toHaveLength(5);
    expect(ops.slice(0, 4)).toEqual(['add', 'sub', 'mul', 'div']);
    for (let i = 1; i < ops.length; i++) expect(ops[i]).not.toBe(ops[i - 1]);
    for (const t of tasks) {
      expect(['choice', 'missing']).toContain(t.format);
      expect(t.options).toHaveLength(4);
    }
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(tasks[0]?.id).toBe('cal1');
    const cats = new Set(tasks.map((t) => t.categoryId));
    for (const c of ['add.within10', 'add.cross10', 'sub.within20', 'sub.cross10', 'mul.t2', 'mul.t5', 'mul.t7', 'mul.t8', 'mul.t9', 'div.by3', 'div.by8'] as const) {
      expect(cats).toContain(c);
    }
  });

  it('w każdym działaniu od łatwych do trudnych', () => {
    for (const range of [10, 20, 100] as NumberRange[]) {
      const { tasks } = createCalibration(makeSettings({ range }), createRng(range));
      for (const op of ['add', 'sub', 'mul', 'div'] as const) {
        const ranks = tasks.filter((t) => CATEGORIES[t.categoryId].op === op).map((t) => rank(t.categoryId));
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      }
    }
  });

  it('zakres 100 zawiera dodawanie dwucyfrowe', () => {
    const { tasks } = createCalibration(makeSettings({ range: 100 }), createRng(1));
    expect(tasks.some((t) => t.categoryId === 'add.2d')).toBe(true);
  });

  it('fakty bez powtórzeń (także przemiennych) i reprezentatywne (bez ×1)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { tasks } = createCalibration(makeSettings(), createRng(seed));
      const facts = tasks.map((t) => t.factId).filter((f): f is string => f !== null);
      expect(new Set(facts).size).toBe(facts.length);
      for (const f of facts) expect(facts).not.toContain(commutativePartner(f) ?? '-');
      for (const t of tasks) if (t.op === 'mul') expect(Math.min(...t.operands)).toBeGreaterThanOrEqual(2);
    }
  });

  it('tabliczki: fakt mierzy swoją tabliczkę (drugi czynnik / iloraz 3..9, np. nie 9 × 2 dla ×9)', () => {
    const mulOnly = makeSettings({ ops: { add: false, sub: false, mul: true, div: true } });
    for (const settings of [makeSettings(), makeSettings({ range: 10 }), makeSettings({ range: 100 }), mulOnly]) {
      for (let seed = 0; seed < 40; seed++) {
        for (const t of createCalibration(settings, createRng(seed)).tasks) {
          const k = Number(/\d+$/.exec(t.categoryId)?.[0]);
          if (t.op === 'mul') {
            const [a, b] = t.operands as [number, number];
            expect([a, b]).toContain(k);
            const other = a === k ? b : a;
            expect(other).toBeGreaterThanOrEqual(3);
            expect(other).toBeLessThanOrEqual(9);
          } else if (t.op === 'div') {
            const [p, d] = t.operands as [number, number];
            expect(d).toBe(k);
            expect(p / d).toBeGreaterThanOrEqual(3);
            expect(p / d).toBeLessThanOrEqual(9);
          }
        }
      }
    }
  });

  it('jedno działanie → ok. 20 zadań (druga runda kategorii); brak działań → pusta lista', () => {
    const mulOnly = makeSettings({ ops: { add: false, sub: false, mul: true, div: false } });
    const { tasks } = createCalibration(mulOnly, createRng(1));
    expect(tasks).toHaveLength(CALIBRATION_SIZE);
    expect(tasks.every((t) => t.op === 'mul')).toBe(true);
    const none = makeSettings({ ops: { add: false, sub: false, mul: false, div: false } });
    expect(createCalibration(none, createRng(1)).tasks).toEqual([]);
  });

  it('właściwości dla dowolnych ustawień', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<NumberRange>(10, 20, 100),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 1e9 }),
        (range, add, sub, mul, div, seed) => {
          const settings = makeSettings({ range, ops: { add, sub, mul, div } });
          const { tasks } = createCalibration(settings, createRng(seed));
          const any = add || sub || mul || div;
          expect(tasks.length).toBe(any ? CALIBRATION_SIZE : 0);
          for (const t of tasks) {
            expect(isCategoryAvailable(t.categoryId, settings)).toBe(true);
            expect(t.options).toHaveLength(4);
            expect(t.options).toContain(t.answer);
          }
        },
      ),
      { numRuns: 80 },
    );
  });
});

describe('applyCalibration', () => {
  const settings = makeSettings();

  it('zapisuje próby (n = 1), bez planowania powtórek', () => {
    const { tasks } = createCalibration(settings, createRng(3));
    const m = createSkillModel();
    applyCalibration(m, answerAll(tasks, (_, i) => i % 2 === 0, () => 3000), settings);
    for (const t of tasks) if (t.factId !== null) expect(m.facts[t.factId]?.n).toBe(1);
    expect(m.retries).toEqual([]);
  });

  it('regulator bez śladów kalibracji: okno, seria błędów, ostatnie zadania i powtórki puste', () => {
    const { tasks } = createCalibration(settings, createRng(6));
    const m = createSkillModel();
    // Same błędy: bez czyszczenia gra zaczęłaby się bezpiecznikiem (seria 20) i regulatorem < 60%.
    applyCalibration(m, answerAll(tasks, () => false, () => 6000), settings);
    expect(m.window).toEqual([]);
    expect(m.errorStreak).toBe(0);
    expect(m.recent).toEqual([]);
    expect(m.retries).toEqual([]);
    expect(regulatedQuotas(m)).toEqual({ ...DEFAULT_QUOTAS });
    // Pierwsze zadania gry nie są powtórkami błędów z kalibracji (bez zakazu powtórek z kalibracji).
    const calFacts = new Set(tasks.map((t) => t.factId).filter((f): f is string => f !== null));
    const pool = [...new Set(tasks.map((t) => t.categoryId))];
    startSession(m, T0);
    const rng = createRng(1);
    let now = T0;
    for (let i = 0; i < 6; i++) {
      const t = pickTask(m, { categories: pool, settings, mode: 'combat', format: 'choice' }, rng, now);
      recordAttempt(m, attemptForTask(t, true, 3000, now), now);
      now += 5000;
    }
    expect(m.retries.filter((r) => calFacts.has(r.factId))).toEqual([]);
  });

  it('wszystko poprawnie i szybko → priorytety testowanych rosną; błędnie → spadają', () => {
    const { tasks } = createCalibration(settings, createRng(4));
    const good = createSkillModel();
    applyCalibration(good, answerAll(tasks, () => true, () => 2000), settings);
    const bad = createSkillModel();
    applyCalibration(bad, answerAll(tasks, () => false, () => 9000), settings);
    for (const t of tasks) {
      const c = t.categoryId;
      expect(good.categories[c]?.prior).toBeGreaterThan(DEFAULT_PRIORS[c]);
      expect(bad.categories[c]?.prior).toBeLessThan(DEFAULT_PRIORS[c]);
      expect(bad.categories[c]?.prior).toBeCloseTo(Math.max(0.05, 0.5 * DEFAULT_PRIORS[c]));
    }
  });

  /** Próba kalibracji faktu wylosowanego dla kategorii `slot` (domyślnie pierwsza kategoria faktu). */
  const calAttempt = (factId: string, over: Partial<Attempt> = {}): Attempt => {
    const cats = categoriesOfFact(factId);
    return {
      taskId: factId,
      factId,
      categoryId: cats[0] as CategoryId,
      categories: cats,
      format: 'choice',
      mode: 'calibration',
      correct: true,
      timedOut: false,
      ms: 3000,
      helped: false,
      given: null,
      errorKind: null,
      at: T0,
      ...over,
    };
  };

  it('prior = 0.5·domyślny + 0.5·średni wynik (szybkość względem mediany działania)', () => {
    const m = createSkillModel();
    // mnożenie: mediana 3000 → T_szybko 2400, T_wolno 7500
    applyCalibration(
      m,
      [
        calAttempt('mul:2x3', { categoryId: 'mul.t2' }),
        calAttempt('mul:5x4', { categoryId: 'mul.t5' }),
        calAttempt('mul:7x3', { categoryId: 'mul.t7' }),
        calAttempt('mul:9x4', { categoryId: 'mul.t9', correct: false }),
      ],
      settings,
    );
    const s3000 = 0.6 + 0.4 * ((7500 - 3000) / 5100);
    const p2 = 0.5 * 0.6 + 0.5 * s3000;
    const p5 = 0.5 * 0.6 + 0.5 * s3000;
    const p7 = 0.5 * 0.35 + 0.5 * s3000;
    const p9 = 0.5 * 0.35;
    expect(m.categories['mul.t2']?.prior).toBeCloseTo(p2);
    expect(m.categories['mul.t5']?.prior).toBeCloseTo(p5);
    expect(m.categories['mul.t7']?.prior).toBeCloseTo(p7);
    expect(m.categories['mul.t9']?.prior).toBeCloseTo(p9);
    // mul.t3/mul.t4 — tylko „przy okazji” (2 × 3, 7 × 3, 5 × 4, 9 × 4): nietestowane → połowa średniego
    // przesunięcia w działaniu (grupa [mul.t3, mul.t4] bez testowanych).
    const opDelta = (p2 - 0.6 + (p5 - 0.6) + (p7 - 0.35) + (p9 - 0.35)) / 4;
    expect(m.categories['mul.t3']?.prior).toBeCloseTo(0.45 + opDelta / 2);
    expect(m.categories['mul.t4']?.prior).toBeCloseTo(0.45 + opDelta / 2);
  });

  it('próba liczy się tylko do kategorii, dla której ją wylosowano (2 × 8 z mul.t2 nie podnosi mul.t8)', () => {
    const m = createSkillModel();
    applyCalibration(
      m,
      [calAttempt('mul:2x8', { categoryId: 'mul.t2', ms: 1500 }), calAttempt('mul:8x8', { categoryId: 'mul.t8', correct: false })],
      settings,
    );
    // mul.t8: tylko 8 × 8 (błąd, s = 0) — 2 × 8 nie wchodzi do średniej.
    expect(m.categories['mul.t8']?.prior).toBeCloseTo(0.5 * 0.35);
    expect(m.categories['mul.t2']?.prior).toBeGreaterThan(0.6);
    // recordAttempt bez zmian: fakt i obie jego kategorie zapisane normalnie.
    expect(m.facts['mul:2x8']?.n).toBe(1);
    expect(m.categories['mul.t8']?.n).toBe(2);
    expect(m.categories['mul.t2']?.n).toBe(1);
  });

  it('bliźniak kalibrowanego faktu (n = 0) startuje z priorytetu po kalibracji, nie z domyślnego', () => {
    const m = createSkillModel();
    // 2 × 8 wylosowane dla mul.t2, błąd; mediana brak → s = 0 (błąd).
    applyCalibration(m, [calAttempt('mul:2x8', { categoryId: 'mul.t2', correct: false })], settings);
    const p2 = m.categories['mul.t2']?.prior as number;
    expect(p2).toBeCloseTo(0.3);
    // 8 × 2: kategorie [mul.t2, mul.t8], obie z n = 1 → pierwsza (mul.t2); aktualizacja od partnera α/2 = 0.25.
    const twin = m.facts['mul:8x2'];
    expect(twin?.n).toBe(0);
    expect(twin?.m).toBeCloseTo(p2 + 0.25 * (0 - p2));
    // Dawniej start z domyślnego 0.6 → 0.45; teraz niżej, zgodnie z wynikiem kalibracji.
    expect(twin?.m).toBeLessThan(0.3);
    // Sam kalibrowany fakt bez zmian (start z domyślnego priorytetu, α = 0.5).
    expect(m.facts['mul:2x8']?.m).toBeCloseTo(0.6 * 0.5);
    // Nieoglądany fakt tej samej tabliczki: priorytet kategorii z największą liczbą dowodów (mul.t2, n = 1).
    expect(factMastery(m, 'mul:2x9')).toBeCloseTo(p2);
    expect(factMastery(m, 'mul:9x2')).toBeCloseTo(p2);
  });

  it('bliźniak aktualizowany wielokrotnie: wkład partnera zachowany dokładnie', () => {
    const m = createSkillModel();
    applyCalibration(
      m,
      [
        calAttempt('mul:7x8', { categoryId: 'mul.t7', correct: true, ms: 3000 }),
        calAttempt('mul:7x8', { categoryId: 'mul.t7', correct: false, ms: 3000 }),
      ],
      settings,
    );
    const p = factMastery({ ...m, facts: {} }, 'mul:8x7');
    // Oczekiwane: start = priorytet po kalibracji, potem 2 aktualizacje z α/2 = 0.25 (s = 0.8, potem 0).
    let expected = p;
    expected += 0.25 * (0.8 - expected);
    expected += 0.25 * (0 - expected);
    expect(m.facts['mul:8x7']?.m).toBeCloseTo(expected);
  });

  it('istniejący przed kalibracją fakt-bliźniak nie jest przeliczany', () => {
    const m = createSkillModel();
    m.facts['mul:8x2'] = { m: 0.9, lt: null, n: 0, nOk: 0, box: 0, lastSeenAt: 0, lastSeenSession: 0, helped: 0, last2: [] };
    applyCalibration(m, [calAttempt('mul:2x8', { categoryId: 'mul.t2', correct: false })], settings);
    expect(m.facts['mul:8x2']?.m).toBeCloseTo(0.9 - 0.25 * 0.9);
  });

  it('propagacja: nietestowane kategorie z grupy (mul.t6 ← średnia z mul.t7/mul.t8)', () => {
    const m = createSkillModel();
    const mk = (factId: string, correct: boolean): Attempt => {
      const cats = categoriesOfFact(factId);
      return {
        taskId: factId,
        factId,
        categoryId: cats[0] as CategoryId,
        categories: cats,
        format: 'choice',
        mode: 'calibration',
        correct,
        timedOut: false,
        ms: 3000,
        helped: false,
        given: null,
        errorKind: null,
        at: T0,
      };
    };
    applyCalibration(m, [mk('mul:7x7', true), mk('mul:8x8', false), mk('mul:2x2', true)], settings);
    const d7 = (m.categories['mul.t7']?.prior ?? 0) - 0.35;
    const d8 = (m.categories['mul.t8']?.prior ?? 0) - 0.35;
    expect(d7).toBeGreaterThan(0);
    expect(d8).toBeLessThan(0);
    const avg = (d7 + d8) / 2;
    expect(m.categories['mul.t6']?.prior).toBeCloseTo(0.35 + avg);
    expect(m.categories['mul.t9']?.prior).toBeCloseTo(0.35 + avg);
    // mul.t5/t10 w grupie z testowanym mul.t2
    const d2 = (m.categories['mul.t2']?.prior ?? 0) - 0.6;
    expect(m.categories['mul.t5']?.prior).toBeCloseTo(0.6 + d2);
    // mul.t3/t4 (grupa bez testów) → połowa średniego przesunięcia w działaniu
    expect(m.categories['mul.t3']?.prior).toBeCloseTo(0.45 + (d7 + d8 + d2) / 3 / 2);
    // Inne działania bez zmian
    expect(m.categories['add.within10']).toBeUndefined();
    expect(m.categories['div.by7']).toBeUndefined();
    // Nieoglądane fakty dziedziczą priorytet pierwszej kategorii
    expect(factMastery(m, 'mul:6x9')).toBeCloseTo(m.categories['mul.t6']?.prior ?? -1);
    // m kategorii bez prób = priorytet
    expect(m.categories['mul.t6']?.m).toBeCloseTo(m.categories['mul.t6']?.prior ?? -1);
  });

  it('priorytety w [0.05, 0.95]; wcześniejsze powtórki usunięte (regulator czysty)', () => {
    const m = createSkillModel();
    const pre = { factId: 'add:8+7', categoryId: 'add.cross10' as CategoryId, dueAtTask: 5, session: 0 };
    m.retries.push(pre);
    const { tasks } = createCalibration(settings, createRng(5));
    applyCalibration(m, answerAll(tasks, (_, i) => i % 3 !== 0, (_, i) => 500 + i * 700), settings);
    expect(m.retries).toEqual([]);
    for (const st of Object.values(m.categories)) {
      expect(st.prior).toBeGreaterThanOrEqual(0.05);
      expect(st.prior).toBeLessThanOrEqual(0.95);
    }
  });

  it('pusta lista prób nic nie zmienia', () => {
    const m = createSkillModel();
    applyCalibration(m, [], settings);
    expect(m).toEqual(createSkillModel());
  });
});
