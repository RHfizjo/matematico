/**
 * Kuźnia (GDD 9.4, 12.2): ulepszenie sprzętu kosztuje „złóż sumę z N cyfr”.
 * Koszt jest stały dla przedmiotu i poziomu (skrót z id), więc nie zmienia się między wizytami.
 */
import type { Digits, ForgeCost, ItemDef } from '../types';
import { hasDigits, isDigit } from './digits';

/** Maksymalny poziom przedmiotu. */
export const FORGE_MAX_LEVEL = 3;
/** Liczba cyfr w zapłacie. */
export const FORGE_DIGIT_COUNT = 3;

/** Zakres sumy wg bieżącego poziomu (1→2, 2→3). */
const SUM_RANGE: Record<1 | 2, { min: number; max: number }> = {
  1: { min: 10, max: 15 },
  2: { min: 15, max: 24 },
};

/** FNV-1a 32-bit — stabilny skrót tekstu. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Koszt ulepszenia z `currentLevel` na następny; null gdy poziom maksymalny. */
export function forgeCost(item: ItemDef, currentLevel: number): ForgeCost | null {
  const lvl = Math.floor(currentLevel);
  if (lvl >= FORGE_MAX_LEVEL) return null;
  const from: 1 | 2 = lvl >= 2 ? 2 : 1;
  const { min, max } = SUM_RANGE[from];
  const sum = min + (hashString(`${item.id}:${from}`) % (max - min + 1));
  return { sum, count: FORGE_DIGIT_COUNT };
}

/** Odmiana słowa „cyfra” w bierniku: 1 cyfrę, 2–4 cyfry, 5+ cyfr. */
export function digitWord(n: number): string {
  if (n === 1) return 'cyfrę';
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return 'cyfry';
  return 'cyfr';
}

export interface ForgePaymentCheck {
  ok: boolean;
  reason: 'count' | 'sum' | 'digits' | null;
  message: string;
}

/**
 * Sprawdza zapłatę w kuźni. Kolejność: liczba cyfr → suma → dostępność w skarbcu.
 * Nie zmienia skarbca (zużycie: removeDigits po ok).
 */
export function checkForgePayment(selected: readonly number[], cost: ForgeCost, inv: Digits): ForgePaymentCheck {
  if (selected.length !== cost.count) {
    return { ok: false, reason: 'count', message: `Wybierz dokładnie ${cost.count} ${digitWord(cost.count)}.` };
  }
  if (!selected.every(isDigit)) {
    return { ok: false, reason: 'digits', message: 'Nie masz tych cyfr w Skarbcu.' };
  }
  const sum = selected.reduce((s, d) => s + d, 0);
  if (sum !== cost.sum) {
    const diff = Math.abs(cost.sum - sum);
    const tail = sum < cost.sum ? `Brakuje ${diff}.` : `Za dużo o ${diff}.`;
    return { ok: false, reason: 'sum', message: `Twoje cyfry dają ${sum}. ${tail}` };
  }
  if (!hasDigits(inv, selected)) {
    return { ok: false, reason: 'digits', message: 'Nie masz tych cyfr w Skarbcu.' };
  }
  return { ok: true, reason: null, message: `${selected.join(' + ')} = ${sum}. Ulepszone!` };
}

/** Koszt rzadkości przy podpowiadaniu zapłaty: oszczędzamy 6–9 i zwłaszcza 0. */
function payRarityCost(d: number): number {
  if (d === 0) return 5;
  return d >= 6 ? 2 : 1;
}

/**
 * Przykładowa zapłata ze skarbca (najtańsza pod względem rzadkości) albo null, gdy się nie da.
 * Do podpowiedzi i wyszarzania przycisku „Ulepsz”.
 */
export function findForgePayment(cost: ForgeCost, inv: Digits): number[] | null {
  let best: number[] | null = null;
  let bestCost = Infinity;
  const pick: number[] = [];
  const left = inv.slice();
  // Kombinacje z powtórzeniami, cyfry niemalejąco.
  const walk = (minDigit: number, remaining: number, sum: number): void => {
    if (remaining === 0) {
      if (sum !== cost.sum) return;
      const c = pick.reduce((s, d) => s + payRarityCost(d), 0);
      if (c < bestCost) {
        bestCost = c;
        best = pick.slice();
      }
      return;
    }
    for (let d = minDigit; d <= 9; d++) {
      if (sum + d > cost.sum) break;
      if ((left[d] ?? 0) <= 0) continue;
      left[d] = (left[d] ?? 0) - 1;
      pick.push(d);
      walk(d, remaining - 1, sum + d);
      pick.pop();
      left[d] = (left[d] ?? 0) + 1;
    }
  };
  walk(0, cost.count, 0);
  return best;
}
