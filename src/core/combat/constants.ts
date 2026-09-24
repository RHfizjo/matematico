/**
 * Liczby walki (GDD 7.3, 7.5, 12.1, 13.1).
 */
import type { QteResult } from '../types';

/** Mnożnik obrażeń ataku wg wyniku QTE (GDD 7.3; POPRAWKA = 80% wg GDD 12.1). */
export const ATTACK_MULT: Record<QteResult, number> = {
  fast: 1.2,
  correct: 1.0,
  late: 0.7,
  wrong: 0.3,
  timeout: 0.2,
  retryCorrect: 0.8,
};

/** Procent zablokowanych obrażeń wg wyniku QTE obrony (GDD 7.3). */
export const BLOCK_PCT: Record<QteResult, number> = {
  fast: 1.0,
  correct: 1.0,
  late: 0.6,
  wrong: 0.4,
  timeout: 0.3,
  retryCorrect: 0.8,
};

/** Kontra przy szybkiej obronie. */
export const COUNTER_DAMAGE = 5;
/** Atak prosty / mocny (GDD 7.5). */
export const BASE_ATTACK = 10;
export const STRONG_ATTACK = 18;
/** HP bohatera bez pancerza. */
export const HERO_BASE_HP = 100;
/** Premia do bloku od stworka (+20%, nie sumuje się w obrębie rodzaju obrony). */
export const DEFENSE_BOOST = 0.2;
/** Odnowienie ataku mocnego (tury gracza). */
export const STRONG_COOLDOWN = 1;
/** Co ile tur mocny atak u wroga 'heavy', gdy dane nie podają (GDD 13.2). */
export const HEAVY_DEFAULT_EVERY = 3;
