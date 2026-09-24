/**
 * Produkcja cyfr przez stworki (GDD 9.3) i inne drobne źródła cyfr.
 * Produkcja liczona na cykl (powrót do bazy), nie w czasie rzeczywistym.
 */
import type { CreatureDef, OwnedCreature, ProductionKind } from '../types';
import type { Rng } from '../rng';

/** Maksymalny poziom stworka. */
export const CREATURE_MAX_LEVEL = 3;

/** Poziom stworka przycięty do 1..3. */
export function creatureLevel(owned: OwnedCreature): 1 | 2 | 3 {
  const lvl = Math.floor(owned.level);
  if (!(lvl >= 2)) return 1;
  return lvl >= 3 ? 3 : 2;
}

/** Pula cyfr stworka (do karmienia i nagrody za złapanie). */
export function productionPool(kind: ProductionKind): number[] {
  switch (kind) {
    case 'small':
      return [1, 2, 3, 4, 5];
    case 'pairs10':
    case 'twins':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    case 'rare':
      return [6, 7, 8, 9];
  }
}

/** Liczba cyfr/par na cykl wg poziomu. */
const SMALL_COUNT: Record<1 | 2 | 3, number> = { 1: 2, 2: 3, 3: 4 };
const PAIR_COUNT: Record<1 | 2 | 3, number> = { 1: 1, 2: 1, 3: 2 };

function isEvenCycle(cycle: number): boolean {
  return ((Math.floor(cycle) % 2) + 2) % 2 === 0;
}

/**
 * Cyfry wyprodukowane przez stworka w danym cyklu (GDD 9.3, poziom 1 / 2 / 3):
 * small 2/3/4 cyfry z 1..5; pairs10 1/1/2 pary (a, 10−a); twins 1/1/2 pary (d, d);
 * rare: 1 cyfra z 6..9 + 0 w parzystych cyklach, na poz. 3 zero co cykl.
 */
export function produce(owned: OwnedCreature, def: CreatureDef, cycle: number, rng: Rng): number[] {
  const lvl = creatureLevel(owned);
  const out: number[] = [];
  switch (def.production) {
    case 'small':
      for (let i = 0; i < SMALL_COUNT[lvl]; i++) out.push(rng.int(1, 5));
      break;
    case 'pairs10':
      for (let i = 0; i < PAIR_COUNT[lvl]; i++) {
        const a = rng.int(1, 9);
        out.push(a, 10 - a);
      }
      break;
    case 'twins':
      for (let i = 0; i < PAIR_COUNT[lvl]; i++) {
        const d = rng.int(1, 9);
        out.push(d, d);
      }
      break;
    case 'rare':
      out.push(rng.int(6, 9));
      if (lvl === 3 || isEvenCycle(cycle)) out.push(0);
      break;
  }
  return out;
}

/** Premia za karmienie (3 zadania w bazie): 1 cyfra z puli stworka. */
export function feedBonus(def: CreatureDef, rng: Rng): number[] {
  return [rng.pick(productionPool(def.production))];
}

/** Nagroda za złapanie: 1 cyfra z puli stworka. */
export function catchReward(def: CreatureDef, rng: Rng): number[] {
  return [rng.pick(productionPool(def.production))];
}

/** Prezent powitalny brainglama: 3 cyfry (2 z 1..5, 1 z 6..9). */
export function glamGift(rng: Rng): number[] {
  return [rng.int(1, 5), rng.int(1, 5), rng.int(6, 9)];
}

/** Nowy cykl produkcji tylko, gdy od powrotu padło ≥1 zadanie (GDD 3). */
export function canStartNewCycle(taskSinceReturn: boolean): boolean {
  return taskSinceReturn;
}

/** Karmienie: raz na cykl na stworka. */
export function canFeed(owned: OwnedCreature, cycle: number): boolean {
  return owned.fedCycle !== cycle;
}
