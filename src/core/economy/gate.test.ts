import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Digits, GateOp, GateToken, LandId, NumberRange } from '../types';
import { createRng } from '../rng';
import { addDigitCounts, countDigits, digitsFromList, emptyDigits, hasDigits, startingDigits } from './digits';
import {
  ALL_GATE_OPS,
  evaluateGateOp,
  gateGift,
  gateTargetRange,
  gateTokensFromText,
  gateTokensOf,
  isTrivial,
  makeGate,
  parseGate,
  scoreGate,
  solveGate,
} from './gate';

const T = gateTokensFromText;
const LANDS: LandId[] = ['meadow', 'cave', 'volcano', 'castle', 'ice'];
const RANGES: NumberRange[] = [10, 20, 100];

const opsArb = fc.subarray([...ALL_GATE_OPS], { minLength: 1 });
const invArb = fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 10, maxLength: 10 });
const tokenArb: fc.Arbitrary<GateToken> = fc.oneof(
  fc.integer({ min: 0, max: 9 }).map((v): GateToken => ({ t: 'd', v })),
  fc.constantFrom(...ALL_GATE_OPS).map((v): GateToken => ({ t: 'op', v })),
);

describe('parseGate', () => {
  it('sąsiednie cyfry tworzą liczbę dwucyfrową', () => {
    const p = parseGate(T('54+3'));
    expect(p).toEqual({ ok: true, a: 54, op: '+', b: 3, value: 57, digitsUsed: [5, 4, 3] });
  });

  it('działania: + − × :', () => {
    expect(parseGate(T('6×9'))).toMatchObject({ ok: true, value: 54 });
    expect(parseGate(T('60−6'))).toMatchObject({ ok: true, value: 54 });
    expect(parseGate(T('56:8'))).toMatchObject({ ok: true, value: 7 });
    expect(parseGate(T('0+7'))).toMatchObject({ ok: true, value: 7 });
    expect(parseGate(T('7−7'))).toMatchObject({ ok: true, value: 0 });
  });

  it('błędy', () => {
    const err = (s: string) => {
      const p = parseGate(T(s));
      return p.ok ? null : p.error;
    };
    expect(parseGate([])).toEqual({ ok: false, error: 'empty' });
    expect(err('54')).toBe('noOp');
    expect(err('5+4+1')).toBe('twoOps');
    expect(err('5++4')).toBe('twoOps');
    expect(err('+4')).toBe('missingOperand');
    expect(err('54×')).toBe('missingOperand');
    expect(err('×')).toBe('missingOperand');
    expect(err('05+')).toBe('missingOperand');
    expect(err('123+4')).toBe('tooLong');
    expect(err('4+123')).toBe('tooLong');
    expect(err('05+4')).toBe('leadingZero');
    expect(err('5+04')).toBe('leadingZero');
    expect(err('5:0')).toBe('divByZero');
    expect(err('7:2')).toBe('notInteger');
    expect(err('3−5')).toBe('negative');
  });

  it('"0" sam jest poprawny', () => {
    expect(parseGate(T('0×5'))).toMatchObject({ ok: true, value: 0, digitsUsed: [0, 5] });
    expect(parseGate(T('50+0'))).toMatchObject({ ok: true, value: 50 });
  });

  it('rzuca wyjątek dla niepoprawnego tokenu', () => {
    expect(() => parseGate([{ t: 'd', v: 12 }])).toThrow(RangeError);
  });

  it('gateTokensFromText akceptuje zamienniki ASCII', () => {
    expect(T('6 x 9')).toEqual(T('6×9'));
    expect(T('6*9')).toEqual(T('6×9'));
    expect(T('9-3')).toEqual(T('9−3'));
    expect(T('8/2')).toEqual(T('8:2'));
    expect(() => T('6?9')).toThrow(RangeError);
  });

  it('właściwość: parseGate(gateTokensOf(a, op, b)) zgodne z evaluateGateOp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), fc.constantFrom(...ALL_GATE_OPS), fc.integer({ min: 0, max: 99 }), (a, op, b) => {
        const p = parseGate(gateTokensOf(a, op, b));
        const ev = evaluateGateOp(a, op, b);
        if (ev.ok) {
          expect(p).toEqual({ ok: true, a, op, b, value: ev.value, digitsUsed: [...String(a), ...String(b)].map(Number) });
        } else {
          expect(p).toEqual({ ok: false, error: ev.error });
        }
      }),
    );
  });

  it('właściwość: dowolny tor — parse nie rzuca; sukces ⇒ tor kanoniczny i poprawna wartość', () => {
    fc.assert(
      fc.property(fc.array(tokenArb, { maxLength: 7 }), (tokens) => {
        const p = parseGate(tokens);
        if (!p.ok) return;
        expect(gateTokensOf(p.a, p.op, p.b)).toEqual(tokens);
        const ev = evaluateGateOp(p.a, p.op, p.b);
        expect(ev).toEqual({ ok: true, value: p.value });
        expect(p.value).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(p.value)).toBe(true);
        expect(p.digitsUsed).toEqual(tokens.filter((t) => t.t === 'd').map((t) => t.v));
      }),
    );
  });
});

describe('isTrivial', () => {
  it('×1, 1×, ×0, 0×, :1 są trywialne', () => {
    expect(isTrivial(54, '×', 1)).toBe(true);
    expect(isTrivial(1, '×', 54)).toBe(true);
    expect(isTrivial(54, '×', 0)).toBe(true);
    expect(isTrivial(0, '×', 7)).toBe(true);
    expect(isTrivial(54, ':', 1)).toBe(true);
    expect(isTrivial(0, ':', 5)).toBe(true);
  });
  it('nietrywialne i + / −', () => {
    expect(isTrivial(6, '×', 9)).toBe(false);
    expect(isTrivial(10, '×', 5)).toBe(false);
    expect(isTrivial(56, ':', 8)).toBe(false);
    expect(isTrivial(54, '+', 0)).toBe(false);
    expect(isTrivial(54, '−', 0)).toBe(false);
  });
});

describe('solveGate i scoreGate — przykład z GDD (54, działania + i ×)', () => {
  const ops: GateOp[] = ['+', '×'];
  const inv = startingDigits();

  it('solver: minimum 2 cyfry, pierwsze rozwiązanie 6 × 9', () => {
    const r = solveGate(54, inv, ops);
    expect(r.solvable).toBe(true);
    expect(r.minDigits).toBe(2);
    expect(r.solutions[0]).toEqual({ a: 6, op: '×', b: 9, digitCount: 2 });
    expect(r.solutions.length).toBeLessThanOrEqual(10);
  });

  it('6 × 9 — 2 cyfry, sprytne', () => {
    const s = scoreGate(T('6×9'), 54, inv, ops);
    expect(s).toMatchObject({ valid: true, value: 54, error: null, digitsUsed: [6, 9], smart: true });
    expect(s.message).toBe('Brama otwarta! Sprytnie!');
  });

  it('50 + 4 — 3 cyfry, poprawne', () => {
    const s = scoreGate(T('50+4'), 54, inv, ops);
    expect(s).toMatchObject({ valid: true, smart: false, digitsUsed: [5, 0, 4] });
    expect(s.message).toBe('Brama otwarta!');
  });

  it('54 × 1 — 3 cyfry, poprawne, ×1 nie jest sprytne', () => {
    const s = scoreGate(T('54×1'), 54, inv, ops);
    expect(s).toMatchObject({ valid: true, smart: false });
    expect(s.digitsUsed).toHaveLength(3);
  });

  it('27 + 27 — 4 cyfry, poprawne', () => {
    const s = scoreGate(T('27+27'), 54, inv, ops);
    expect(s).toMatchObject({ valid: true, smart: false });
    expect(s.digitsUsed).toHaveLength(4);
  });

  it('27 × 2 — 3 cyfry, ale nietrywialne mnożenie → sprytne', () => {
    expect(scoreGate(T('27×2'), 54, inv, ops).smart).toBe(true);
  });

  it('bez 6, 7, 8, 9 minimum rośnie do 3 i 50 + 4 staje się sprytne', () => {
    const poor = digitsFromList([0, 1, 2, 3, 4, 5, 5, 4]);
    expect(solveGate(54, poor, ops).minDigits).toBe(3);
    expect(scoreGate(T('50+4'), 54, poor, ops).smart).toBe(true);
    expect(scoreGate(T('54×1'), 54, poor, ops).smart).toBe(true);
  });

  it('błędny wynik: brakuje / za dużo', () => {
    expect(scoreGate(T('6×8'), 54, inv, ops)).toMatchObject({
      valid: false,
      value: 48,
      error: 'wrongValue',
      message: 'Twoje działanie daje 48. Brakuje 6.',
    });
    expect(scoreGate(T('6×10'), 54, inv, ops)).toMatchObject({
      valid: false,
      value: 60,
      error: 'wrongValue',
      message: 'Twoje działanie daje 60. Za dużo o 6.',
    });
  });

  it('zablokowane działanie, brak cyfr, błąd parsowania', () => {
    expect(scoreGate(T('60−6'), 54, inv, ops)).toMatchObject({ valid: false, error: 'opLocked' });
    expect(scoreGate(T('6×9'), 54, digitsFromList([6]), ops)).toMatchObject({ valid: false, error: 'notEnoughDigits' });
    expect(scoreGate(T('66−12'), 54, inv, ['−'])).toMatchObject({ valid: true, error: null });
    const p = scoreGate(T('05+4'), 54, inv, ops);
    expect(p).toMatchObject({ valid: false, error: 'leadingZero', value: null, smart: false });
    expect(p.message.length).toBeGreaterThan(0);
    expect(scoreGate([], 54, inv, ops).error).toBe('empty');
    expect(scoreGate(T('54'), 54, inv, ops).error).toBe('noOp');
  });

  it('solver: brak rozwiązania', () => {
    expect(solveGate(54, emptyDigits(), ops)).toEqual({ solvable: false, minDigits: null, solutions: [] });
    expect(solveGate(54, digitsFromList([6, 9]), ['+'])).toMatchObject({ solvable: false });
  });

  it('solver: sortowanie po liczbie cyfr, przy remisie nietrywialne × najpierw', () => {
    const r = solveGate(54, inv, ops, 50);
    const counts = r.solutions.map((s) => s.digitCount);
    expect(counts).toEqual([...counts].sort((x, y) => x - y));
    const three = r.solutions.filter((s) => s.digitCount === 3);
    const firstTrivialOrPlus = three.findIndex((s) => s.op === '+' || isTrivial(s.a, s.op, s.b));
    const lastSmart = three.map((s) => s.op === '×' && !isTrivial(s.a, s.op, s.b)).lastIndexOf(true);
    expect(lastSmart).toBeLessThan(firstTrivialOrPlus);
  });

  it('solver: przy równej liczbie cyfr +0, 0+ i ×1 na końcu, częstsze cyfry wcześniej', () => {
    const r = solveGate(54, inv, ops, 1000);
    const three = r.solutions.filter((s) => s.digitCount === 3);
    const idx = (a: number, op: GateOp, b: number) => three.findIndex((s) => s.a === a && s.op === op && s.b === b);
    expect(idx(0, '+', 54)).toBeGreaterThan(idx(50, '+', 4));
    expect(idx(54, '×', 1)).toBeGreaterThan(idx(50, '+', 4));
    expect(idx(4, '+', 50)).toBeGreaterThan(idx(5, '+', 49));
  });

  it('solver: liczby bez zer wiodących (np. 05 nie występuje)', () => {
    const r = solveGate(9, digitsFromList([0, 5, 4, 9, 1]), ['+'], 100);
    for (const s of r.solutions) expect(s.digitCount).toBe(String(s.a).length + String(s.b).length);
  });
});

describe('właściwości solvera', () => {
  it('każde rozwiązanie jest poprawne wg parseGate i scoreGate; minDigits = pierwsze', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 120 }), invArb, opsArb, (target, inv, ops) => {
        const r = solveGate(target, inv, ops, 15);
        expect(r.solvable).toBe(r.solutions.length > 0);
        if (!r.solvable) {
          expect(r.minDigits).toBeNull();
          return;
        }
        expect(r.minDigits).toBe(r.solutions[0]?.digitCount);
        let prev = 0;
        for (const s of r.solutions) {
          const tokens = gateTokensOf(s.a, s.op, s.b);
          const p = parseGate(tokens);
          expect(p.ok && p.value === target).toBe(true);
          expect(p.ok && p.digitsUsed.length).toBe(s.digitCount);
          expect(ops).toContain(s.op);
          expect(s.digitCount).toBeGreaterThanOrEqual(prev);
          prev = s.digitCount;
          const sc = scoreGate(tokens, target, inv, ops);
          expect(sc.valid).toBe(true);
          if (s.digitCount === r.minDigits) expect(sc.smart).toBe(true);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('poprawne wyrażenie nigdy nie zużywa mniej cyfr niż minDigits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99 }),
        fc.constantFrom(...ALL_GATE_OPS),
        fc.integer({ min: 0, max: 99 }),
        invArb,
        (a, op, b, inv) => {
          const ev = evaluateGateOp(a, op, b);
          if (!ev.ok) return;
          const tokens = gateTokensOf(a, op, b);
          const sc = scoreGate(tokens, ev.value, inv, ALL_GATE_OPS);
          const r = solveGate(ev.value, inv, ALL_GATE_OPS, 0);
          if (hasDigits(inv, sc.digitsUsed)) {
            expect(sc.valid).toBe(true);
            expect(r.solvable).toBe(true);
            expect(sc.digitsUsed.length).toBeGreaterThanOrEqual(r.minDigits ?? Infinity);
          } else {
            expect(sc.error).toBe('notEnoughDigits');
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('gateTargetRange', () => {
  it('zakresy krain (GDD 10.4)', () => {
    expect(gateTargetRange('meadow', 20)).toEqual({ min: 10, max: 40 });
    expect(gateTargetRange('meadow', 100)).toEqual({ min: 10, max: 99 });
    expect(gateTargetRange('meadow', 10)).toEqual({ min: 10, max: 20 });
    expect(gateTargetRange('castle', 20)).toEqual({ min: 10, max: 99 });
    expect(gateTargetRange('ice', 100)).toEqual({ min: 10, max: 99 });
    expect(gateTargetRange('cave', 10)).toEqual({ min: 10, max: 20 });
  });
});

describe('gateGift i makeGate', () => {
  it('dar pusty, gdy skarbiec wystarcza', () => {
    expect(gateGift(54, startingDigits(), ['+', '×'])).toEqual(emptyDigits());
  });

  it('pusty skarbiec: dar to brakujące cyfry najtańszego rozwiązania', () => {
    const gift = gateGift(15, emptyDigits(), ['+']);
    expect(countDigits(gift)).toBe(2);
    expect(solveGate(15, gift, ['+']).solvable).toBe(true);
    // 54 z × : 2 cyfry (6 i 9)
    expect(gateGift(54, emptyDigits(), ['×'])).toEqual(digitsFromList([6, 9]));
    // brakuje tylko jednej cyfry
    expect(gateGift(54, digitsFromList([6]), ['×'])).toEqual(digitsFromList([9]));
  });

  it('dar oszczędza rzadkie cyfry (0 tylko gdy trzeba)', () => {
    // 20 z +: 11+9 / 19+1 (3 cyfry bez zera) zamiast 20+0 czy 10+10
    const gift = gateGift(20, emptyDigits(), ['+']);
    expect(countDigits(gift)).toBe(3);
    expect(gift[0]).toBe(0);
  });

  it('makeGate: deterministyczny dla tego samego ziarna', () => {
    const args = (seed: number) => ({
      rng: createRng(seed),
      land: 'meadow' as const,
      range: 20 as const,
      inventory: startingDigits(),
      ops: ['+', '×'] as GateOp[],
      preferAnswers: [15, 24],
    });
    for (let seed = 1; seed < 20; seed++) expect(makeGate(args(seed))).toEqual(makeGate(args(seed)));
  });

  it('makeGate: preferuje wyniki słabych faktów z zakresu (~50%)', () => {
    let hits = 0;
    const N = 600;
    for (let seed = 0; seed < N; seed++) {
      const g = makeGate({
        rng: createRng(seed),
        land: 'meadow',
        range: 20,
        inventory: startingDigits(),
        ops: ['+'],
        preferAnswers: [23, 56],
      });
      if (g.target === 23) hits++;
      expect(g.target).not.toBe(56);
    }
    expect(hits / N).toBeGreaterThan(0.4);
    expect(hits / N).toBeLessThan(0.65);
  });

  it('makeGate: cele pokrywają cały zakres (oba końce)', () => {
    for (const [land, range] of [['meadow', 20], ['meadow', 10], ['castle', 100]] as const) {
      const { min, max } = gateTargetRange(land, range);
      const seen = new Set<number>();
      for (let seed = 0; seed < 3000; seed++) {
        seen.add(makeGate({ rng: createRng(seed), land, range, inventory: startingDigits(), ops: ['+'] }).target);
      }
      expect(Math.min(...seen)).toBe(min);
      expect(Math.max(...seen)).toBe(max);
      expect(seen.size).toBe(max - min + 1);
    }
  });

  it('makeGate: bez działań rzuca wyjątek', () => {
    expect(() =>
      makeGate({ rng: createRng(1), land: 'meadow', range: 20, inventory: startingDigits(), ops: [] }),
    ).toThrow(RangeError);
  });

  it('właściwość: brama po dodaniu daru zawsze ma rozwiązanie; dar pusty, gdy niepotrzebny', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.constantFrom(...LANDS),
        fc.constantFrom(...RANGES),
        invArb,
        opsArb,
        fc.array(fc.integer({ min: 0, max: 120 }), { maxLength: 4 }),
        (seed, land, range, inventory, ops, preferAnswers) => {
          const inv: Digits = inventory.slice();
          const g = makeGate({ rng: createRng(seed), land, range, inventory: inv, ops, preferAnswers });
          expect(inv).toEqual(inventory);
          const { min, max } = gateTargetRange(land, range);
          expect(g.target).toBeGreaterThanOrEqual(min);
          expect(g.target).toBeLessThanOrEqual(max);
          expect(g.gift).toHaveLength(10);
          expect(countDigits(g.gift)).toBeLessThanOrEqual(3);
          const aloneSolvable = solveGate(g.target, inv, g.ops, 0).solvable;
          if (aloneSolvable) expect(countDigits(g.gift)).toBe(0);
          else expect(countDigits(g.gift)).toBeGreaterThan(0);
          const withGift = inv.slice();
          addDigitCounts(withGift, g.gift);
          expect(solveGate(g.target, withGift, g.ops, 1).solvable).toBe(true);
        },
      ),
      { numRuns: 80 },
    );
  });
});
