import { describe, expect, it } from 'vitest';
import type { CategoryId } from '../types';
import { ALL_CATEGORY_IDS, CATEGORIES, MUL_TABLES, isCategoryAvailable, isTwoDigitCategory, tableOf } from './categories';
import { makeSettings } from './testkit';

describe('CATEGORIES', () => {
  it('zawiera wszystkie 32 kategorie z types.ts, bez powtórzeń', () => {
    expect(ALL_CATEGORY_IDS).toHaveLength(14 + 9 + 9);
    expect(new Set(ALL_CATEGORY_IDS).size).toBe(ALL_CATEGORY_IDS.length);
    for (const k of MUL_TABLES) {
      expect(ALL_CATEGORY_IDS).toContain(`mul.t${k}`);
      expect(ALL_CATEGORY_IDS).toContain(`div.by${k}`);
    }
    expect(Object.keys(CATEGORIES).sort()).toEqual([...ALL_CATEGORY_IDS].sort());
  });

  it('każda definicja ma spójne id, działanie i polską etykietę', () => {
    for (const id of ALL_CATEGORY_IDS) {
      const def = CATEGORIES[id];
      expect(def.id).toBe(id);
      expect(id.startsWith(`${def.op}.`)).toBe(true);
      expect(def.label.length).toBeGreaterThan(3);
    }
    expect(CATEGORIES['add.cross10'].label).toBe('Dodawanie z przekroczeniem 10');
  });

  it('minRange i factBased zgodnie ze specyfikacją', () => {
    const expected: Partial<Record<CategoryId, [number, boolean]>> = {
      'add.within10': [10, true],
      'add.complement10': [10, true],
      'add.doubles': [10, true],
      'add.within20': [20, true],
      'add.cross10': [20, true],
      'add.three': [20, false],
      'add.2d': [100, false],
      'add.2d.carry': [100, false],
      'sub.within10': [10, true],
      'sub.within20': [20, true],
      'sub.cross10': [20, true],
      'sub.missing': [20, false],
      'sub.2d': [100, false],
      'sub.2d.borrow': [100, false],
    };
    for (const [id, [minRange, factBased]] of Object.entries(expected) as [CategoryId, [number, boolean]][]) {
      expect(CATEGORIES[id].minRange, id).toBe(minRange);
      expect(CATEGORIES[id].factBased, id).toBe(factBased);
    }
    // Tabliczki dostępne przy każdym zakresie.
    for (const k of MUL_TABLES) {
      expect(CATEGORIES[`mul.t${k}`]).toMatchObject({ op: 'mul', minRange: 10, factBased: true });
      expect(CATEGORIES[`div.by${k}`]).toMatchObject({ op: 'div', minRange: 10, factBased: true });
    }
  });
});

describe('isCategoryAvailable', () => {
  it('uwzględnia zakres', () => {
    const s10 = makeSettings(10);
    const s20 = makeSettings(20);
    const s100 = makeSettings(100);
    expect(isCategoryAvailable('add.within10', s10)).toBe(true);
    expect(isCategoryAvailable('add.cross10', s10)).toBe(false);
    expect(isCategoryAvailable('add.cross10', s20)).toBe(true);
    expect(isCategoryAvailable('add.2d', s20)).toBe(false);
    expect(isCategoryAvailable('add.2d', s100)).toBe(true);
    expect(isCategoryAvailable('mul.t7', s10)).toBe(true);
    expect(isCategoryAvailable('div.by9', s10)).toBe(true);
  });

  it('uwzględnia włączone działania', () => {
    const noMul = makeSettings(100, { ops: { add: true, sub: true, mul: false, div: true } });
    expect(isCategoryAvailable('mul.t2', noMul)).toBe(false);
    expect(isCategoryAvailable('div.by2', noMul)).toBe(true);
    const noAdd = makeSettings(100, { ops: { add: false, sub: true, mul: true, div: true } });
    expect(isCategoryAvailable('add.complement10', noAdd)).toBe(false);
    expect(isCategoryAvailable('sub.missing', noAdd)).toBe(true);
  });

  it('liczba dostępnych kategorii rośnie z zakresem', () => {
    const count = (r: 10 | 20 | 100): number =>
      ALL_CATEGORY_IDS.filter((id) => isCategoryAvailable(id, makeSettings(r))).length;
    expect(count(10)).toBe(4 + 18);
    expect(count(20)).toBe(10 + 18);
    expect(count(100)).toBe(32);
  });
});

describe('pomocnicze', () => {
  it('tableOf i isTwoDigitCategory', () => {
    expect(tableOf('mul.t7')).toBe(7);
    expect(tableOf('div.by10')).toBe(10);
    expect(tableOf('add.cross10')).toBeNull();
    expect(isTwoDigitCategory('sub.2d.borrow')).toBe(true);
    expect(isTwoDigitCategory('sub.cross10')).toBe(false);
  });
});
