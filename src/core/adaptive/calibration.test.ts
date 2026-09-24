import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Attempt, CategoryId, NumberRange, Op, Task } from '../types';
import { createRng } from '../rng';
import { CATEGORIES, categoriesOfFact, commutativePartner, isCategoryAvailable } from '../math';
import { DEFAULT_PRIORS } from './priors';
import { createSkillModel, factMastery } from './model';
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
    expect(m.window.length).toBeGreaterThan(0);
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

  it('prior = 0.5·domyślny + 0.5·średni wynik (szybkość względem mediany działania)', () => {
    const m = createSkillModel();
    const mk = (factId: string, ms: number, correct = true): Attempt => {
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
        ms,
        helped: false,
        given: null,
        errorKind: null,
        at: T0,
      };
    };
    // mnożenie: mediana 3000 → T_szybko 2400, T_wolno 7500
    applyCalibration(m, [mk('mul:2x3', 3000), mk('mul:5x4', 3000), mk('mul:7x3', 3000), mk('mul:9x4', 3000, false)], settings);
    const s3000 = 0.6 + 0.4 * ((7500 - 3000) / 5100);
    expect(m.categories['mul.t2']?.prior).toBeCloseTo(0.5 * 0.6 + 0.5 * s3000);
    expect(m.categories['mul.t7']?.prior).toBeCloseTo(0.5 * 0.35 + 0.5 * s3000);
    expect(m.categories['mul.t9']?.prior).toBeCloseTo(0.5 * 0.35);
    // mul.t3: mul:2x3 i mul:7x3 (s3000); mul.t4: mul:5x4 (s3000) i mul:9x4 (0)
    expect(m.categories['mul.t3']?.prior).toBeCloseTo(0.5 * 0.45 + 0.5 * s3000);
    expect(m.categories['mul.t4']?.prior).toBeCloseTo(0.5 * 0.45 + 0.5 * (s3000 / 2));
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

  it('priorytety w [0.05, 0.95], zachowuje wcześniejsze powtórki', () => {
    const m = createSkillModel();
    const pre = { factId: 'add:8+7', categoryId: 'add.cross10' as CategoryId, dueAtTask: 5, session: 0 };
    m.retries.push(pre);
    const { tasks } = createCalibration(settings, createRng(5));
    applyCalibration(m, answerAll(tasks, (_, i) => i % 3 !== 0, (_, i) => 500 + i * 700), settings);
    expect(m.retries).toEqual([pre]);
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
