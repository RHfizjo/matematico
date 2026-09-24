/**
 * Deterministyczny generator liczb pseudolosowych (mulberry32) z ziarnem.
 * Cała logika gry losuje wyłącznie przez Rng — dzięki temu testy są powtarzalne.
 */
export interface Rng {
  /** Liczba z przedziału [0, 1). */
  next(): number;
  /** Liczba całkowita z przedziału [min, max] (włącznie). */
  int(min: number, max: number): number;
  /** Losowy element niepustej tablicy. */
  pick<T>(items: readonly T[]): T;
  /** Nowa tablica z elementami w losowej kolejności (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Losowanie ważone: zwraca indeks; wagi ujemne traktowane jak 0. Wymaga sumy wag > 0. */
  weightedIndex(weights: readonly number[]): number;
  /** Prawda z prawdopodobieństwem p. */
  chance(p: number): boolean;
  /** Aktualny stan (do zapisu/wznowienia). */
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new RangeError(`Rng.int: nieprawidłowy zakres [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('Rng.pick: pusta tablica');
      return items[int(0, items.length - 1)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
    weightedIndex(weights: readonly number[]): number {
      let total = 0;
      for (const w of weights) total += w > 0 ? w : 0;
      if (!(total > 0)) throw new RangeError('Rng.weightedIndex: suma wag musi być > 0');
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i] as number;
        if (w <= 0) continue;
        if (r < w) return i;
        r -= w;
      }
      // Zabezpieczenie przed błędem zaokrągleń: ostatni indeks z dodatnią wagą.
      for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] as number) > 0) return i;
      return 0;
    },
    chance(p: number): boolean {
      return next() < p;
    },
    state(): number {
      return a;
    },
  };
}
