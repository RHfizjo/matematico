/**
 * Skrzynie (GDD 9.3, 10.2, 13.3–13.4): cyfry + przedmiot z gwarancją
 * (co 3. zwykła skrzynia daje przedmiot, bez „pustych” losowań).
 */
import type { ChestKind, ChestLoot } from '../types';
import type { Rng } from '../rng';

/** Co ile zwykłych skrzyń (świat/dungeon) gwarantowany przedmiot. */
export const CHEST_PITY_LIMIT = 3;

/** Wagi cyfr 0..9 (indeks = cyfra): 0 rzadkie, 6–9 niezwykłe. */
const WORLD_WEIGHTS: readonly number[] = [1, 6, 6, 6, 6, 6, 3, 3, 3, 3];
const DUNGEON_WEIGHTS: readonly number[] = [2, 5, 5, 5, 5, 5, 4, 4, 4, 4];
const NONZERO_WEIGHTS: readonly number[] = [0, 5, 5, 5, 5, 5, 4, 4, 4, 4];

function rollDigits(rng: Rng, n: number, weights: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.weightedIndex(weights));
  return out;
}

export interface OpenChestArgs {
  kind: ChestKind;
  /** Licznik gwarancji z zapisu (progress.chestPity). */
  pity: number;
  rng: Rng;
  /** Przedmioty możliwe w tej skrzyni (bez posiadanych — filtruje wywołujący). */
  itemPool: readonly string[];
}

export interface OpenChestResult {
  loot: ChestLoot;
  /** Nowa wartość licznika gwarancji. */
  pity: number;
}

/**
 * Otwiera skrzynię:
 * world 2–4 cyfry; dungeon 3–5 cyfr; bonus 4 cyfry (≥1 z 6..9) + przedmiot z puli;
 * boss 5 cyfr z dokładnie jednym 0 (przedmioty bossa daje kod gry).
 * Świat/dungeon zwiększają licznik; przy 3 i niepustej puli → przedmiot i reset do 0.
 * Bonus i boss nie zmieniają licznika.
 */
export function openChest(args: OpenChestArgs): OpenChestResult {
  const { kind, rng, itemPool } = args;
  const pity = Number.isFinite(args.pity) && args.pity > 0 ? Math.floor(args.pity) : 0;
  switch (kind) {
    case 'world':
    case 'dungeon': {
      const digits =
        kind === 'world' ? rollDigits(rng, rng.int(2, 4), WORLD_WEIGHTS) : rollDigits(rng, rng.int(3, 5), DUNGEON_WEIGHTS);
      const next = pity + 1;
      if (next >= CHEST_PITY_LIMIT && itemPool.length > 0) {
        return { loot: { digits, itemId: rng.pick(itemPool) }, pity: 0 };
      }
      // Pusta pula: licznik czeka na 3 (przedmiot przy najbliższej okazji).
      return { loot: { digits, itemId: null }, pity: Math.min(next, CHEST_PITY_LIMIT) };
    }
    case 'bonus': {
      const digits = rng.shuffle([rng.int(6, 9), ...rollDigits(rng, 3, DUNGEON_WEIGHTS)]);
      const itemId = itemPool.length > 0 ? rng.pick(itemPool) : null;
      return { loot: { digits, itemId }, pity };
    }
    case 'boss': {
      const digits = rng.shuffle([0, ...rollDigits(rng, 4, NONZERO_WEIGHTS)]);
      return { loot: { digits, itemId: null }, pity };
    }
  }
}
