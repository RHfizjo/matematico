/**
 * Talia do walki z posiadanych kart (GDD 7.5, 9.5a): maks. 3 kopie jednej karty, maks. 15 kart.
 * Kopie ponad limit 3 to „zapas” — tylko ten zapas można wymienić u handlarza.
 */
import type { CardDef, CardRarity } from '../types';
import { DECK_MAX, MAX_COPIES } from './constants';

/** Ranking rzadkości (wyższa = rzadsza). */
export const RARITY_RANK: Readonly<Record<CardRarity, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

/** Liczba kopii jako nieujemna liczba całkowita (śmieci z zapisu → 0). */
function copies(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Id kart posortowane: rzadkość malejąco, potem id rosnąco (kolejność niezależna od kolejności kluczy).
 * Nieznane id (brak w `cards`) są pomijane, duplikaty usuwane.
 */
export function sortCardIds(ids: readonly string[], cards: Readonly<Record<string, CardDef>>): string[] {
  const known = [...new Set(ids)].filter((id) => Object.hasOwn(cards, id) && cards[id] !== undefined);
  return known.sort((a, b) => {
    const ra = RARITY_RANK[(cards[a] as CardDef).rarity] ?? 0;
    const rb = RARITY_RANK[(cards[b] as CardDef).rarity] ?? 0;
    if (ra !== rb) return rb - ra;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Liczba kopii każdej karty w talii: najpierw limit MAX_COPIES na kartę, potem limit DECK_MAX.
 * Gdy kart jest za dużo, bierzemy je „po kolei po jednej” (rzadkość malejąco, potem id),
 * żeby talia była różnorodna. Zwraca tylko karty z dodatnią liczbą kopii.
 */
export function deckCopies(
  owned: Readonly<Record<string, number>>,
  cards: Readonly<Record<string, CardDef>>,
): Record<string, number> {
  const ids = sortCardIds(Object.keys(owned), cards).filter((id) => copies(owned[id]) > 0);
  const want = new Map(ids.map((id) => [id, Math.min(MAX_COPIES, copies(owned[id]))] as const));
  const out: Record<string, number> = {};
  let total = 0;
  for (let round = 0; round < MAX_COPIES && total < DECK_MAX; round++) {
    for (const id of ids) {
      if (total >= DECK_MAX) break;
      if ((want.get(id) ?? 0) <= round) continue;
      out[id] = (out[id] ?? 0) + 1;
      total += 1;
    }
  }
  return out;
}

/**
 * Talia do walki (lista id kart, pogrupowana: rzadkość malejąco, potem id). Deterministyczna.
 * Pomija nieznane id i niedodatnie liczby kopii. Tasuje dopiero startCardBattle.
 */
export function buildDeck(owned: Readonly<Record<string, number>>, cards: Readonly<Record<string, CardDef>>): string[] {
  const counts = deckCopies(owned, cards);
  const out: string[] = [];
  for (const id of sortCardIds(Object.keys(counts), cards)) {
    for (let i = 0; i < (counts[id] ?? 0); i++) out.push(id);
  }
  return out;
}

/**
 * Zapas do wymiany (GDD 9.5a): max(0, posiadane − MAX_COPIES) dla każdej znanej karty z `owned`
 * (także 0 — łatwo pokazać „brak zapasu”). Nieznane id są pomijane.
 */
export function spareCounts(
  owned: Readonly<Record<string, number>>,
  cards: Readonly<Record<string, CardDef>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of sortCardIds(Object.keys(owned), cards)) {
    out[id] = Math.max(0, copies(owned[id]) - MAX_COPIES);
  }
  return out;
}

/** Liczba kopii każdej karty na liście (np. talii) — do podglądu na Stole z kartami. */
export function countCards(deck: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of deck) out[id] = (out[id] ?? 0) + 1;
  return out;
}
