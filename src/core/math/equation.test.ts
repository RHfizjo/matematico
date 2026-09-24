import { describe, expect, it } from 'vitest';
import { MISSING_MARK, OP_SYMBOL, applyOp, evalTerms, formatTerms, taskEquation } from './equation';
import { checkArithmetic, evalExpr } from './testkit';

describe('equation', () => {
  it('znaki działań', () => {
    expect(OP_SYMBOL).toEqual({ add: '+', sub: '−', mul: '×', div: ':' });
    expect(MISSING_MARK).toBe('□');
  });

  it('applyOp, evalTerms, formatTerms', () => {
    expect(applyOp('div', 56, 8)).toBe(7);
    expect(evalTerms('add', [4, 6, 3])).toBe(13);
    expect(evalTerms('sub', [15, 8])).toBe(7);
    expect(() => evalTerms('add', [])).toThrow();
    expect(formatTerms('sub', [15, MISSING_MARK])).toBe('15 − □');
  });

  it('taskEquation odczytuje pełne działanie', () => {
    expect(taskEquation({ op: 'add', text: '8 + 7 = ?', answer: 15 })).toEqual({
      op: 'add',
      terms: [8, 7],
      result: 15,
      missingIndex: null,
    });
    expect(taskEquation({ op: 'add', text: '8 + □ = 15', answer: 7 })).toEqual({
      op: 'add',
      terms: [8, 7],
      result: 15,
      missingIndex: 1,
    });
    expect(taskEquation({ op: 'div', text: '□ : 8 = 7', answer: 56 })).toMatchObject({
      terms: [56, 8],
      missingIndex: 0,
    });
    expect(taskEquation({ op: 'add', text: '4 + □ + 3 = 13', answer: 6 })).toMatchObject({
      terms: [4, 6, 3],
      missingIndex: 1,
    });
  });

  it('taskEquation odrzuca zły format', () => {
    expect(() => taskEquation({ op: 'add', text: '8 + 7', answer: 15 })).toThrow();
    expect(() => taskEquation({ op: 'add', text: '8 - 7 = ?', answer: 1 })).toThrow();
    expect(() => taskEquation({ op: 'add', text: '8 + 7 = 15', answer: 15 })).toThrow();
    expect(() => taskEquation({ op: 'add', text: '□ + 7 = ?', answer: 15 })).toThrow();
  });
});

describe('testkit.checkArithmetic', () => {
  it('liczy z kolejnością działań i wykrywa błędy', () => {
    expect(evalExpr('10 × 7 − 7')).toBe(63);
    expect(evalExpr('10 × 7 : 2')).toBe(35);
    expect(checkArithmetic('8 + 7 = 8 + 2 + 5 = 15')).toEqual({ checked: 1, errors: [] });
    expect(checkArithmetic('8 + 2 = 10, a zostało 5. 10 + 5 = 15')).toEqual({ checked: 2, errors: [] });
    expect(checkArithmetic('8 + 2 = 11').errors).toEqual(['8 + 2 = 11']);
    expect(checkArithmetic('Pomyśl: 8 × □ = 56').checked).toBe(0);
    expect(checkArithmetic('□ : 8 = 7').checked).toBe(0);
  });
});
