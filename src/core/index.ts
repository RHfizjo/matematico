/**
 * Fasada core/: publiczne API całej czystej logiki gry (bez DOM i three.js) + kontrakty typów.
 * Warstwy game/, ui/, render/ importują stąd: `import { pickTask, answerTask } from '../core'`.
 *
 * Kolizje nazw: moduły nie eksportują dwóch różnych bytów o tej samej nazwie (tsc zgłosiłby
 * niejednoznaczny `export *`). Nakładki z game.ts mają nazwy różne od funkcji modułów:
 * unlockedActionsOf/unlockedOperatorsOf (≠ combat.unlockedActions/unlockedOperators),
 * heroStats (≠ combat.computeHeroStats), helps (≠ combat.helpsFor),
 * beginPlaySession (= save.beginSession + adaptive.startSession).
 * Walka kartami (cards/) obok starej walki QTE (combat/): cards.isCardHeroDown (≠ combat.isHeroDown),
 * cards.rescueHero (≠ combat.rescue), cards.startCardBattle (≠ combat.startCombat); cards/ i merchant/
 * nie powtarzają nazw innych modułów (test tests/core-api.test.ts pilnuje fasady).
 * Handlarz (merchant/): merchantOffers/acceptOffer; nakładki na zapis z game.ts: offersFor/acceptMerchant.
 * Pliki testkit.ts modułów nie są częścią API.
 */
export type * from './types';
export { createRng } from './rng';
export type { Rng } from './rng';
export * from './math';
export * from './adaptive';
export * from './economy';
export * from './combat';
export * from './cards';
export * from './merchant';
export * from './progression';
export * from './save';
export * from './game';
