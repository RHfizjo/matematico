import { describe, expect, it } from 'vitest';
import { fanLayout, handCenter, SIDE_LEFT, SIDE_RIGHT } from './cardTurn';
import { numberLineLayout } from './components/numberLine';
import { taskSizeClass, tokenizeTask } from './components/taskText';
import { clamp, plural, signed } from './util';

describe('tokenizeTask', () => {
  it('rozbija proste działanie z niewiadomą ?', () => {
    expect(tokenizeTask('8 + 7 = ?')).toEqual([
      { t: 'num', v: '8' },
      { t: 'op', v: '+' },
      { t: 'num', v: '7' },
      { t: 'eq' },
      { t: 'slot' },
    ]);
  });
  it('rozpoznaje □ w środku i liczby wielocyfrowe', () => {
    expect(tokenizeTask('13 − □ = 8')).toEqual([
      { t: 'num', v: '13' },
      { t: 'op', v: '−' },
      { t: 'slot' },
      { t: 'eq' },
      { t: 'num', v: '8' },
    ]);
  });
  it('normalizuje znaki ASCII do znaków dla dziecka', () => {
    const ops = tokenizeTask('6-2*3/1').filter(t => t.t === 'op').map(t => (t.t === 'op' ? t.v : ''));
    expect(ops).toEqual(['−', '×', ':']);
  });
  it('dobiera rozmiar do długości', () => {
    expect(taskSizeClass(tokenizeTask('8 + 7 = ?'))).toBe('');
    expect(taskSizeClass(tokenizeTask('34 + 25 = ?'))).toBe('');
    expect(taskSizeClass(tokenizeTask('14 + 16 + 23 = ?'))).toBe('long');
    expect(taskSizeClass(tokenizeTask('14 + 16 + 23 + 5 = ?'))).toBe('xlong');
  });
});

describe('numberLineLayout', () => {
  it('zakres do 20 pokazuje oś 0–20 z etykietą co 1', () => {
    const L = numberLineLayout(8, [2, 5]);
    expect(L).toMatchObject({ min: 0, max: 20, tickStep: 1, labelStep: 1, stops: [8, 10, 15] });
  });
  it('zakres do 10 pokazuje oś 0–10', () => {
    expect(numberLineLayout(3, [4])).toMatchObject({ min: 0, max: 10 });
  });
  it('odejmowanie: skoki w lewo', () => {
    const L = numberLineLayout(15, [-5, -3]);
    expect(L.stops).toEqual([15, 10, 7]);
    expect(L.min).toBe(0);
    expect(L.max).toBe(20);
  });
  it('dwucyfrowe: okno od dziesiątki, rzadsze etykiety', () => {
    const L = numberLineLayout(34, [20, 5]);
    expect(L.min).toBe(30);
    expect(L.max).toBe(70);
    expect(L.labelStep).toBe(5);
    expect(L.stops).toEqual([34, 54, 59]);
  });
  it('duży zakres: kreski co 5, etykiety co 10', () => {
    const L = numberLineLayout(12, [80]);
    expect(L.tickStep).toBe(5);
    expect(L.labelStep).toBe(10);
    expect(L.min).toBeLessThanOrEqual(12);
    expect(L.max).toBeGreaterThanOrEqual(92);
  });
  it('wszystkie punkty mieszczą się w zakresie', () => {
    for (const [from, jumps] of [[95, [-40, -3]], [58, [30, 7]], [0, [1, 1, 1]], [19, [1]]] as [number, number[]][]) {
      const L = numberLineLayout(from, jumps);
      for (const s of L.stops) {
        expect(s).toBeGreaterThanOrEqual(L.min);
        expect(s).toBeLessThanOrEqual(L.max);
      }
    }
  });
});

describe('fanLayout', () => {
  it('karty symetryczne względem środka, skrajne niżej i obrócone', () => {
    const p = fanLayout(4, 1480);
    expect(p).toHaveLength(4);
    expect((p[0]?.x ?? 0) + (p[3]?.x ?? 0)).toBe(0);
    expect(p[0]?.y).toBeGreaterThan(p[1]?.y ?? 0);
    expect(p[0]?.r).toBeLessThan(0);
    expect(p[3]?.r).toBeGreaterThan(0);
  });
  it('ręka mieści się między kolumnami bocznymi (1480 i 1280 px)', () => {
    for (const W of [1480, 1280]) {
      for (const n of [1, 2, 3, 4, 5]) {
        const p = fanLayout(n, W);
        const cx = handCenter(W);
        const left = cx + Math.min(...p.map(q => q.x)) - 85;
        const right = cx + Math.max(...p.map(q => q.x)) + 85;
        if (n <= 4) {
          expect(left).toBeGreaterThanOrEqual(SIDE_LEFT - 1);
          expect(right).toBeLessThanOrEqual(W - SIDE_RIGHT + 1);
        }
        expect(left).toBeGreaterThan(0);
        expect(right).toBeLessThan(W);
      }
    }
  });
  it('pusta ręka', () => {
    expect(fanLayout(0, 1480)).toEqual([]);
  });
});

describe('util', () => {
  it('polska odmiana', () => {
    expect(plural(1, 'minutę', 'minuty', 'minut')).toBe('minutę');
    expect(plural(3, 'minutę', 'minuty', 'minut')).toBe('minuty');
    expect(plural(5, 'minutę', 'minuty', 'minut')).toBe('minut');
    expect(plural(12, 'minutę', 'minuty', 'minut')).toBe('minut');
    expect(plural(22, 'minutę', 'minuty', 'minut')).toBe('minuty');
    expect(plural(20, 'minutę', 'minuty', 'minut')).toBe('minut');
  });
  it('znak skoku z prawdziwym minusem', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(-4)).toBe('−4');
  });
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
