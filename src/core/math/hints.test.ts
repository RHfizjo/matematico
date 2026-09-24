import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import type { CategoryId, FactId, Hint, HintStrategy, NumberRange, Task, TaskFormat } from '../types';
import { ALL_CATEGORY_IDS, isCategoryAvailable } from './categories';
import { taskEquation } from './equation';
import { factsOf } from './facts';
import { generateTask } from './generators';
import { hintFor } from './hints';
import { FORMATS, RANGES, checkArithmetic, makeSettings } from './testkit';

// Ciężkie testy właściwości: przy równoległym uruchomieniu całego zestawu 5 s (domyślnie) nie wystarcza.
const SLOW_TEST_MS = 60_000;

const COMBOS: { cat: CategoryId; range: NumberRange }[] = RANGES.flatMap((range) =>
  ALL_CATEGORY_IDS.filter((cat) => isCategoryAvailable(cat, makeSettings(range))).map((cat) => ({ cat, range })),
);

function factTask(cat: CategoryId, factId: FactId, format: TaskFormat = 'choice', seed = 1): Task {
  return generateTask({ categoryId: cat, factId, rng: createRng(seed), settings: makeSettings(100), format, id: 'h' });
}

/** Zadanie z konkretnym tekstem (do testów zadań proceduralnych). */
function manualTask(cat: CategoryId, op: Task['op'], text: string, answer: number): Task {
  return {
    id: 'm',
    factId: null,
    categoryId: cat,
    categories: [cat],
    format: text.includes('□') ? 'missing' : 'choice',
    op,
    text,
    operands: [],
    answer,
    options: [],
    distractorKinds: {},
  };
}

const escape = (n: number): RegExp => new RegExp(`=\\s*${n}(?!\\d)`);

/** Wspólne niezmienniki podpowiedzi. */
function checkHint(task: Task, hint: Hint): void {
  expect(hint.steps.length).toBeGreaterThanOrEqual(1);
  expect(hint.steps.length).toBeLessThanOrEqual(3);
  expect(hint.title.length).toBeGreaterThan(0);

  // Arytmetyka w każdym kroku, w podsumowaniu i w pierwszym kroku
  let checked = 0;
  for (const text of [...hint.steps, hint.summary, hint.firstStep]) {
    const r = checkArithmetic(text);
    expect(r.errors, `${task.text}: ${text}`).toEqual([]);
    checked += r.checked;
  }
  expect(checked, task.text).toBeGreaterThan(0);

  // Pierwszy krok nie zdradza wyniku
  expect(hint.firstStep, task.text).not.toMatch(escape(task.answer));
  expect(hint.firstStep.length).toBeGreaterThan(0);

  // Podsumowanie zawiera odpowiedź
  expect(hint.summary, task.text).toMatch(escape(task.answer));

  const e = taskEquation(task);
  const numbers = [...e.terms, e.result];
  if (task.op === 'add' || task.op === 'sub') {
    expect(hint.numberLine, task.text).toBeDefined();
    const nl = hint.numberLine!;
    let pos = nl.from;
    expect(pos).toBeGreaterThanOrEqual(0);
    for (const j of nl.jumps) {
      expect(j).not.toBe(0);
      pos += j;
      expect(pos).toBeGreaterThanOrEqual(0);
    }
    expect(numbers, `${task.text} oś kończy się na ${pos}`).toContain(pos);
  } else {
    expect(hint.blocks, task.text).toBeDefined();
    const bl = hint.blocks!;
    expect(bl.rows).toBeGreaterThanOrEqual(1);
    expect(bl.cols).toBeGreaterThanOrEqual(1);
    const product = task.op === 'mul' ? e.result : (e.terms[0] as number);
    expect(bl.rows * bl.cols, task.text).toBe(product);
    if (bl.highlightRows !== undefined) expect(bl.highlightRows).toBeLessThanOrEqual(bl.rows);
  }
}

describe('hintFor — przykłady z GDD 5.4', () => {
  const cases: [CategoryId, FactId, HintStrategy, string[]][] = [
    ['add.cross10', 'add:8+7', 'make10', ['8 + 2 = 10', '10 + 5 = 15']],
    ['add.cross10', 'add:6+7', 'nearDouble', ['6 + 6 = 12', '12 + 1 = 13']],
    ['add.doubles', 'add:6+6', 'doubles', ['5 + 5 = 10', '1 + 1 = 2', '10 + 2 = 12']],
    ['sub.cross10', 'sub:15-8', 'down10', ['15 − 5 = 10', '10 − 3 = 7']],
    ['mul.t9', 'mul:9x7', 'nineTrick', ['10 × 7 = 70', '70 − 7 = 63']],
    ['mul.t6', 'mul:6x7', 'sixTrick', ['5 × 7 = 35', '35 + 7 = 42']],
    ['mul.t4', 'mul:4x8', 'doubleDouble', ['2 × 8 = 16', '16 + 16 = 32']],
    ['mul.t5', 'mul:5x7', 'fiveTrick', ['10 × 7 = 70', '70 : 2 = 35']],
    ['mul.t3', 'mul:7x3', 'commute', ['7 × 3 = 3 × 7', '7 + 7 = 14', '14 + 7 = 21']],
  ];
  it.each(cases)('%s %s → %s', (cat, fact, strategy, steps) => {
    const task = factTask(cat, fact);
    const hint = hintFor(task);
    expect(hint.strategy).toBe(strategy);
    expect(hint.steps).toEqual(steps);
    checkHint(task, hint);
  });

  it('8 + 7: podsumowanie, oś i pierwszy krok', () => {
    const hint = hintFor(factTask('add.cross10', 'add:8+7'));
    expect(hint.summary).toBe('8 + 7 = 8 + 2 + 5 = 15');
    expect(hint.numberLine).toEqual({ from: 8, jumps: [2, 5] });
    expect(hint.firstStep).toContain('8 + 2 = 10');
    expect(hint.title).toBe('Dopełnij do 10!');
  });

  it('15 − 8: oś z ujemnymi skokami', () => {
    const hint = hintFor(factTask('sub.cross10', 'sub:15-8'));
    expect(hint.numberLine).toEqual({ from: 15, jumps: [-5, -3] });
    expect(hint.summary).toBe('15 − 8 = 15 − 5 − 3 = 7');
  });

  it('9 × 7: podsumowanie "70 − 7 = 63"', () => {
    const hint = hintFor(factTask('mul.t9', 'mul:9x7'));
    expect(hint.summary).toContain('10 × 7 − 7 = 63');
    expect(hint.blocks).toEqual({ rows: 9, cols: 7 });
  });

  it('3 + □ = 10 → pary do 10', () => {
    const task = factTask('add.complement10', 'cmp10:3');
    const hint = hintFor(task);
    expect(hint.strategy).toBe('pairs10');
    expect(hint.steps).toContain('3 + 7 = 10');
    checkHint(task, hint);
  });

  it('56 : 8 → pomyśl o mnożeniu', () => {
    const task = factTask('div.by8', 'div:56:8');
    const hint = hintFor(task);
    expect(hint.strategy).toBe('inverseMul');
    expect(hint.steps).toEqual(['Pomyśl: 8 × □ = 56', '8 × 7 = 56', '56 : 8 = 7']);
    expect(hint.blocks).toEqual({ rows: 8, cols: 7, highlightRows: 1 });
    checkHint(task, hint);
  });

  it('34 + 25 → dziesiątki i jedności', () => {
    const task = manualTask('add.2d', 'add', '34 + 25 = ?', 59);
    const hint = hintFor(task);
    expect(hint.strategy).toBe('tens');
    expect(hint.steps).toEqual(['30 + 20 = 50', '4 + 5 = 9', '50 + 9 = 59']);
    checkHint(task, hint);
  });

  it('38 + 25 (z przeniesieniem) i 52 − 27 (z pożyczaniem)', () => {
    const add = manualTask('add.2d.carry', 'add', '38 + 25 = ?', 63);
    expect(hintFor(add).steps).toEqual(['30 + 20 = 50', '8 + 5 = 13', '50 + 13 = 63']);
    checkHint(add, hintFor(add));
    const sub = manualTask('sub.2d.borrow', 'sub', '52 − 27 = ?', 25);
    expect(hintFor(sub).steps).toEqual(['52 − 20 = 32', '32 − 2 = 30', '30 − 5 = 25']);
    checkHint(sub, hintFor(sub));
  });

  it('brakująca liczba: 8 + □ = 15 i 13 − □ = 8', () => {
    const a = manualTask('add.cross10', 'add', '8 + □ = 15', 7);
    const ha = hintFor(a);
    expect(ha.strategy).toBe('make10');
    expect(ha.steps).toEqual(['8 + 2 = 10', '10 + 5 = 15', '2 + 5 = 7']);
    checkHint(a, ha);
    const s = manualTask('sub.missing', 'sub', '13 − □ = 8', 5);
    const hs = hintFor(s);
    expect(hs.strategy).toBe('countUp');
    expect(hs.steps).toEqual(['8 + 2 = 10', '10 + 3 = 13', '2 + 3 = 5']);
    checkHint(s, hs);
  });

  it('pozostałe strategie odejmowania: countUp i direct', () => {
    expect(hintFor(factTask('sub.within10', 'sub:9-7')).strategy).toBe('countUp');
    expect(hintFor(factTask('sub.within10', 'sub:9-2')).strategy).toBe('direct');
    expect(hintFor(factTask('sub.within10', 'sub:10-4')).strategy).toBe('pairs10');
  });

  it('liczby „naście”: 17 + 3, □ + 5 = 17, □ + 2 = 12', () => {
    const a = manualTask('add.within20', 'add', '17 + 3 = ?', 20);
    expect(hintFor(a).steps).toEqual(['7 + 3 = 10', '10 + 10 = 20']);
    checkHint(a, hintFor(a));
    const b = manualTask('add.within20', 'add', '\u25A1 + 5 = 17', 12);
    expect(hintFor(b)).toMatchObject({ strategy: 'tens', steps: ['7 \u2212 5 = 2', '10 + 2 = 12'] });
    checkHint(b, hintFor(b));
    const c = manualTask('add.within20', 'add', '\u25A1 + 2 = 12', 10);
    checkHint(c, hintFor(c));
  });

  it('pierwszy krok nie zdradza wyniku mimo zbiegu liczb (np. 45 − 25 = 20)', () => {
    const t = manualTask('sub.2d', 'sub', '45 − 25 = ?', 20);
    const h = hintFor(t);
    expect(h.firstStep).not.toMatch(escape(20));
    checkHint(t, h);
  });
});

describe('hintFor — właściwości', { timeout: SLOW_TEST_MS }, () => {
  it('wszystkie kategorie, zakresy i formaty: poprawna arytmetyka, 1–3 kroki, firstStep bez wyniku', () => {
    fc.assert(
      fc.property(fc.constantFrom(...COMBOS), fc.constantFrom(...FORMATS), fc.integer(), ({ cat, range }, format, seed) => {
        const task = generateTask({
          categoryId: cat,
          factId: null,
          rng: createRng(seed),
          settings: makeSettings(range),
          format,
          id: 'p',
        });
        checkHint(task, hintFor(task));
      }),
      { numRuns: 4000 },
    );
  });

  it('każdy fakt z uniwersum w obu formatach (wybór i brakująca liczba, obie pozycje □)', () => {
    const settings = makeSettings(100);
    for (const cat of ALL_CATEGORY_IDS) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const format of ['choice', 'missing'] as const) {
          const task = generateTask({ categoryId: cat, factId: null, rng: createRng(seed * 131 + cat.length), settings, format, id: 'u' });
          checkHint(task, hintFor(task));
        }
      }
    }
  });

  it('pierwszy krok jest konkretny (z liczbami, bez awaryjnego tekstu) dla całego uniwersum faktów', () => {
    const settings = makeSettings(20);
    for (const cat of ALL_CATEGORY_IDS) {
      for (const f of factsOf(cat, settings) ?? []) {
        for (let seed = 1; seed <= 8; seed++) {
          for (const format of ['choice', 'missing'] as const) {
            const task = generateTask({ categoryId: cat, factId: f, rng: createRng(seed), settings, format, id: 'f' });
            const hint = hintFor(task);
            expect(hint.firstStep, task.text).toMatch(/\d/);
            checkHint(task, hint);
          }
        }
      }
    }
  });

  it('strategie dla mnożenia są zgodne z tabelą GDD', () => {
    const strategyOf = (a: number, b: number): HintStrategy => {
      const cat = `mul.t${Math.max(a, b) >= 2 ? Math.max(a, b) : 2}` as CategoryId;
      return hintFor(factTask(cat, `mul:${a}x${b}`)).strategy;
    };
    expect(strategyOf(9, 7)).toBe('nineTrick');
    expect(strategyOf(7, 9)).toBe('nineTrick');
    expect(strategyOf(6, 8)).toBe('sixTrick');
    expect(strategyOf(4, 7)).toBe('doubleDouble');
    expect(strategyOf(5, 8)).toBe('fiveTrick');
    expect(strategyOf(2, 9)).toBe('doubles');
    expect(strategyOf(8, 3)).toBe('commute');
    expect(strategyOf(10, 7)).toBe('direct');
  });
});

describe('hintFor — regresje z przeglądu', { timeout: SLOW_TEST_MS }, () => {
  /** Wynik jako osobna liczba w tekście (nie tylko po „=”). */
  const mentions = (text: string, n: number): boolean => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(text);

  it('sub.within20: pierwszy krok nie podaje wyniku słownie (15 − 5 → nie „a 10 zostaje”)', () => {
    const settings = makeSettings(20);
    for (const f of factsOf('sub.within20', settings) ?? []) {
      const task = generateTask({ categoryId: 'sub.within20', factId: f, rng: createRng(1), settings, format: 'choice', id: 'r' });
      const hint = hintFor(task);
      expect(mentions(hint.firstStep, task.answer), `${task.text}: ${hint.firstStep}`).toBe(false);
      checkHint(task, hint);
    }
  });

  it('20 − □ = 15: brakuje mniej niż 10, więc bez skoków „o pełne dziesiątki”', () => {
    const task = manualTask('sub.missing', 'sub', '20 − □ = 15', 5);
    const hint = hintFor(task);
    expect(hint.firstStep).not.toMatch(/dziesiątk/);
    expect(hint.strategy).not.toBe('tens');
    checkHint(task, hint);
  });

  it('właściwość: „pełne dziesiątki” w pierwszym kroku tylko, gdy niewiadoma ≥ 10', () => {
    fc.assert(
      fc.property(fc.constantFrom(...COMBOS), fc.integer(), ({ cat, range }, seed) => {
        const task = generateTask({ categoryId: cat, factId: null, rng: createRng(seed), settings: makeSettings(range), format: 'missing', id: 'p' });
        const hint = hintFor(task);
        if (hint.firstStep.includes('pełne dziesiątki')) expect(task.answer, `${task.text}: ${hint.firstStep}`).toBeGreaterThanOrEqual(10);
      }),
      { numRuns: 3000 },
    );
    // Wszystkie przypadki „20 − □ = r” z odjemnikiem < 10.
    for (let x = 1; x <= 9; x++) {
      const hint = hintFor(manualTask('sub.missing', 'sub', `20 − □ = ${20 - x}`, x));
      expect(hint.firstStep, `20 − □ = ${20 - x}`).not.toContain('pełne dziesiątki');
    }
  });
});
