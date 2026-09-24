/**
 * Dane dla panelu rodzica (GDD 18.2): słabe punkty, podsumowanie kategorii, mapy ciepła.
 */
import type { CategoryId, FactId, ParentSettings, SkillModel } from '../types';
import { ALL_CATEGORY_IDS, CATEGORIES, isCategoryAvailable, parseFact } from '../math';
import { categoryFacts, categoryMastery, factCategories, medianMs } from './model';

export interface WeakItem {
  kind: 'fact' | 'category';
  /** FactId albo CategoryId. */
  id: string;
  label: string;
  m: number;
  n: number;
}

export interface CategorySummaryRow {
  id: CategoryId;
  label: string;
  m: number;
  n: number;
  /** nOk / n; null przy braku prób. */
  accuracy: number | null;
  medianMs: number | null;
}

/** Czytelny zapis faktu: "7 × 8", "15 − 8", "56 : 8", "3 + □ = 10" (błędny identyfikator bez zmian). */
export function factLabel(f: FactId): string {
  try {
    const p = parseFact(f);
    switch (p.op) {
      case 'cmp10':
        return `${p.a} + □ = 10`;
      case 'add':
        return `${p.a} + ${p.b}`;
      case 'sub':
        return `${p.a} − ${p.b}`;
      case 'mul':
        return `${p.a} × ${p.b}`;
      case 'div':
        return `${p.a} : ${p.b}`;
    }
  } catch {
    return f;
  }
}

/** Czy fakt należy do puli przy obecnych ustawieniach. */
function factAvailable(f: FactId, settings: ParentSettings): boolean {
  return factCategories(f).some((c) => isCategoryAvailable(c, settings) && (categoryFacts(c, settings) ?? []).includes(f));
}

/**
 * Najsłabsze punkty (fakty i kategorie), tylko widziane (n > 0) i dostępne przy ustawieniach,
 * od najniższego m (remis: więcej prób wyżej). Kategorie faktowe: m = średnia faktów (z priorytetami).
 */
export function weakest(model: SkillModel, settings: ParentSettings, n: number): WeakItem[] {
  const items: WeakItem[] = [];
  for (const [f, st] of Object.entries(model.facts)) {
    if (st.n <= 0 || !factAvailable(f, settings)) continue;
    items.push({ kind: 'fact', id: f, label: factLabel(f), m: st.m, n: st.n });
  }
  for (const c of ALL_CATEGORY_IDS) {
    const st = model.categories[c];
    if (st === undefined || st.n <= 0 || !isCategoryAvailable(c, settings)) continue;
    items.push({ kind: 'category', id: c, label: CATEGORIES[c].label, m: categoryMastery(model, c, settings), n: st.n });
  }
  items.sort((a, b) => a.m - b.m || b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return items.slice(0, Math.max(0, Math.floor(n)));
}

/** Podsumowanie wszystkich dostępnych kategorii (kolejność jak ALL_CATEGORY_IDS). */
export function categorySummary(model: SkillModel, settings: ParentSettings): CategorySummaryRow[] {
  return ALL_CATEGORY_IDS.filter((c) => isCategoryAvailable(c, settings)).map((c) => {
    const st = model.categories[c];
    const n = st?.n ?? 0;
    return {
      id: c,
      label: CATEGORIES[c].label,
      m: categoryMastery(model, c, settings),
      n,
      accuracy: st !== undefined && n > 0 ? st.nOk / n : null,
      medianMs: medianMs(model, c),
    };
  });
}

/** Mapa ciepła 10×10: [a−1][b−1] = m faktu add:a+b / mul:axb, null gdy fakt nie był widziany. */
export function heatmap(model: SkillModel, kind: 'add' | 'mul'): (number | null)[][] {
  const grid: (number | null)[][] = [];
  for (let a = 1; a <= 10; a++) {
    const row: (number | null)[] = [];
    for (let b = 1; b <= 10; b++) {
      const st = model.facts[kind === 'add' ? `add:${a}+${b}` : `mul:${a}x${b}`];
      row.push(st !== undefined && st.n > 0 ? st.m : null);
    }
    grid.push(row);
  }
  return grid;
}
