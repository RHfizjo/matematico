import { describe, expect, it } from 'vitest';
import type { Attempt, CategoryId } from '../types';
import { ALL_CATEGORY_IDS, categoriesOfFact, isCategoryAvailable } from '../math';
import { createSkillModel, recordAttempt } from './model';
import { categorySummary, factLabel, heatmap, weakest } from './insights';
import { T0, attempt, makeSettings } from './testkit';

const S20 = makeSettings();

function fa(f: string, over: Partial<Attempt> = {}): Attempt {
  const cats = categoriesOfFact(f);
  return attempt({ factId: f, categoryId: cats[0] as CategoryId, categories: cats, ...over });
}

describe('factLabel', () => {
  it('polskie znaki działań', () => {
    expect(factLabel('add:8+7')).toBe('8 + 7');
    expect(factLabel('sub:15-8')).toBe('15 − 8');
    expect(factLabel('mul:7x8')).toBe('7 × 8');
    expect(factLabel('div:56:8')).toBe('56 : 8');
    expect(factLabel('cmp10:3')).toBe('3 + □ = 10');
    expect(factLabel('zły')).toBe('zły');
  });
});

describe('heatmap', () => {
  it('10×10, [a−1][b−1] = m, null dla niewidzianych (także partnerów tylko zaktualizowanych)', () => {
    const m = createSkillModel();
    recordAttempt(m, fa('mul:7x8', { correct: false }), T0);
    recordAttempt(m, fa('add:3+4'), T0);
    const mul = heatmap(m, 'mul');
    expect(mul).toHaveLength(10);
    for (const row of mul) expect(row).toHaveLength(10);
    expect(mul[6]?.[7]).toBeCloseTo(m.facts['mul:7x8']?.m ?? -1);
    expect(mul[7]?.[6]).toBeNull();
    expect(mul[0]?.[0]).toBeNull();
    const add = heatmap(m, 'add');
    expect(add[2]?.[3]).toBeCloseTo(m.facts['add:3+4']?.m ?? -1);
    expect(add.flat().filter((x) => x !== null)).toHaveLength(1);
  });
});

describe('weakest', () => {
  it('tylko widziane, od najniższego m, z limitem', () => {
    const m = createSkillModel();
    for (let i = 0; i < 3; i++) recordAttempt(m, fa('mul:7x8', { correct: false }), T0);
    recordAttempt(m, fa('mul:6x9', { correct: false }), T0);
    recordAttempt(m, fa('add:3+4'), T0);
    const list = weakest(m, S20, 10);
    expect(list[0]).toMatchObject({ kind: 'fact', id: 'mul:7x8', label: '7 × 8', n: 3 });
    for (let i = 1; i < list.length; i++) expect(list[i]?.m).toBeGreaterThanOrEqual(list[i - 1]?.m ?? 0);
    expect(list.some((x) => x.id === 'mul:8x7')).toBe(false); // tylko partner — nie widziany
    expect(list.filter((x) => x.kind === 'category').map((x) => x.id)).toEqual(
      expect.arrayContaining(['mul.t7', 'mul.t8', 'mul.t6', 'mul.t9', 'add.within10']),
    );
    expect(list.find((x) => x.id === 'mul.t7')?.label).toBe('Mnożenie przez 7');
    expect(weakest(m, S20, 2)).toHaveLength(2);
    expect(weakest(m, S20, 0)).toEqual([]);
  });

  it('pomija działania wyłączone w ustawieniach', () => {
    const m = createSkillModel();
    recordAttempt(m, fa('mul:7x8', { correct: false }), T0);
    recordAttempt(m, fa('add:3+4', { correct: false }), T0);
    const noMul = makeSettings({ ops: { add: true, sub: true, mul: false, div: true } });
    const list = weakest(m, noMul, 10);
    expect(list.map((x) => x.id).sort()).toEqual(['add.within10', 'add:3+4']);
  });
});

describe('categorySummary', () => {
  it('wszystkie dostępne kategorie; skuteczność i mediana', () => {
    const m = createSkillModel();
    for (const [ok, ms] of [
      [true, 2000],
      [true, 4000],
      [false, 9000],
      [true, 3000],
    ] as const) {
      recordAttempt(m, fa('mul:7x8', { correct: ok, ms }), T0);
    }
    const rows = categorySummary(m, S20);
    expect(rows.map((r) => r.id)).toEqual(ALL_CATEGORY_IDS.filter((c) => isCategoryAvailable(c, S20)));
    const t7 = rows.find((r) => r.id === 'mul.t7');
    expect(t7).toMatchObject({ label: 'Mnożenie przez 7', n: 4, accuracy: 0.75, medianMs: 3000 });
    const t3 = rows.find((r) => r.id === 'mul.t3');
    expect(t3).toMatchObject({ n: 0, accuracy: null, medianMs: null });
    expect(rows.some((r) => r.id === 'add.2d')).toBe(false);
  });
});
