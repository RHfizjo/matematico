/**
 * Liczby walki kartami (GDD 7.1, 7.5, 13.5).
 */

/** Liczba kart na ręce (uzupełniana na początku tury). */
export const HAND_SIZE = 4;
/** Energia (gwiazdki) na turę. */
export const MAX_ENERGY = 2;
/** Maks. kopii jednej karty w talii (nadmiar = zapas do wymiany u handlarza). */
export const MAX_COPIES = 3;
/** Maks. kart w talii. */
export const DECK_MAX = 15;
/** Wzmocnienie kart stworka na poziomie 3 (+25%). */
export const LEVEL3_BOOST = 1.25;
/** Poziom stworka, od którego jego karty są wzmocnione. */
export const BOOST_LEVEL = 3;
/** Maks. osłabienie ruchu brainrota (0..1) — cios nigdy nie znika całkiem. */
export const MAX_WEAKEN = 0.9;
/** Siła jednego ciosu w podwójnym ataku szybkiego brainrota (× zwykły atak, GDD 13.3). */
export const MULTI_HIT_FACTOR = 0.75;
