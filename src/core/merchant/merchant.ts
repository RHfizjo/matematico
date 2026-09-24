/**
 * Handlarz Kartonini (GDD 9.5a): wymiana kart z postacią w grze (offline, bez serwera).
 *
 * Oferty:
 * - „3 za 1”: 3 zapasowe kopie jednej karty → 1 losowa karta wyższej rzadkości
 *   (zwykła → niezwykła → rzadka; rzadka → inna rzadka; nigdy legendarna), najpierw nieposiadane;
 * - „oferta dnia” (jedna na cykl): „złóż sumę S z 3 cyfr” (jak w kuźni) → wskazana karta;
 * - „sprzedaż”: 1 zapasowa kopia → cyfry (zwykła 2, niezwykła 3, rzadka 4, legendarna 5).
 *
 * „Zapas” to kopie ponad limit talii (maks. 3 kopie jednej karty) — handlarz nigdy nie zabiera
 * kart z talii. Funkcje są czyste poza acceptOffer, która mutuje `owned` i `digits` tylko po sukcesie.
 */
import type { CardDef, CardRarity, Digits, ForgeCost, TradeOffer } from '../types';
import type { Rng } from '../rng';
import { createRng } from '../rng';
import { spareCounts } from '../cards';
import { addDigits, checkForgePayment, digitWord, findForgePayment, removeDigits } from '../economy';

// ───────────── Stałe ─────────────

/** Ile zapasowych kopii kosztuje wymiana „3 za 1”. */
export const TRADE_IN_COPIES = 3;
/** Cyfry za sprzedaż 1 zapasowej kopii wg rzadkości (GDD 9.5a; legendarna — 5). */
export const SELL_DIGITS: Readonly<Record<CardRarity, number>> = { common: 2, uncommon: 3, rare: 4, legendary: 5 };
/** Oferta dnia: „złóż sumę z 3 cyfr”, suma 10..20 (zawsze osiągalna cyframi 1..9). */
export const DAILY_SUM_MIN = 10;
export const DAILY_SUM_MAX = 20;
export const DAILY_DIGIT_COUNT = 3;
/** Maks. kopii jednej karty w kolekcji (jak SAVE_LIMITS.cardMax) — handlarz nie daje karty ponad limit. */
export const MERCHANT_CARD_CAP = 99;

/**
 * Rzadkość nagrody w „3 za 1”. Legendarna → brak oferty (nagroda nigdy nie jest legendarna,
 * a wymiana 3 legendarnych na rzadką byłaby stratą — legendarną można sprzedać).
 */
const TIER_UP: Readonly<Record<CardRarity, CardRarity | null>> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'rare',
  legendary: null,
};

// ───────────── Pomocnicze ─────────────

/** Liczba posiadanych kopii (śmieci → 0). */
function ownedOf(owned: Readonly<Record<string, number>>, cardId: string): number {
  const n = Object.hasOwn(owned, cardId) ? owned[cardId] : undefined;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Zapas karty: kopie ponad MAX_COPIES (0 dla nieznanych). */
function spareOf(owned: Readonly<Record<string, number>>, cards: Readonly<Record<string, CardDef>>, cardId: string): number {
  return spareCounts(owned, cards)[cardId] ?? 0;
}

/** Znane karty w kolejności z `cards` (kolejność definicji treści). */
function cardList(cards: Readonly<Record<string, CardDef>>): CardDef[] {
  return Object.keys(cards)
    .filter((id) => Object.hasOwn(cards, id))
    .map((id) => cards[id])
    .filter((c): c is CardDef => c !== undefined);
}

/** Możliwe nagrody „3 za 1” za kartę (bez niej samej i bez kart na limicie kolekcji). */
function tradeUpPool(
  card: CardDef,
  owned: Readonly<Record<string, number>>,
  cards: Readonly<Record<string, CardDef>>,
): CardDef[] {
  const tier = TIER_UP[card.rarity];
  if (tier === null) return [];
  return cardList(cards).filter(
    (c) => c.rarity === tier && c.rarity !== 'legendary' && c.id !== card.id && ownedOf(owned, c.id) < MERCHANT_CARD_CAP,
  );
}

/** Ziarno oferty dnia: stałe dla (ziarno profilu, cykl). */
function dailyRng(seed: number, cycle: number): Rng {
  const s = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  const c = Number.isFinite(cycle) ? Math.floor(cycle) : 0;
  return createRng((s ^ Math.imul((c + 0x632be5ab) | 0, 0x9e3779b1)) >>> 0);
}

/**
 * Cena oferty dnia: suma bazowa z (ziarno, cykl); gdy dziecko nie może jej złożyć ze Skarbca,
 * najbliższa suma z zakresu, którą może (bliższa w dół przy remisie). Nic nie pasuje → suma bazowa.
 */
function dailyPrice(base: number, digits: Digits): ForgeCost {
  const payable = (sum: number): boolean => findForgePayment({ sum, count: DAILY_DIGIT_COUNT }, digits) !== null;
  for (let d = 0; d <= DAILY_SUM_MAX - DAILY_SUM_MIN; d++) {
    for (const sum of [base - d, base + d]) {
      if (sum >= DAILY_SUM_MIN && sum <= DAILY_SUM_MAX && payable(sum)) return { sum, count: DAILY_DIGIT_COUNT };
    }
  }
  return { sum: base, count: DAILY_DIGIT_COUNT };
}

/**
 * Stały „los” karty w danym cyklu: skrót (sól z (ziarno, cykl), id karty) — FNV-1a + mieszanie fmix32.
 * Nie zależy od innych kart, więc zmiana liczby kopii innej karty nie przestawia wyboru.
 */
function cardKey(salt: number, cardId: string): number {
  let h = (0x811c9dc5 ^ salt) >>> 0;
  for (let i = 0; i < cardId.length; i++) {
    h ^= cardId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Karta oferty dnia: nielegendarna, spośród tych, których dziecko ma najmniej; remis rozstrzyga stały
 * „los” karty w cyklu (cardKey). Dzięki temu wymiana „3 za 1” czy sprzedaż INNEJ karty w tym samym
 * cyklu nie zmienia oferty dnia (GDD 9.5a: oferta zmienia się co cykl) — wcześniej wybór był indeksem
 * `pick % liczba_remisów` i przeskakiwał po każdej zmianie tej liczby.
 */
function dailyCard(
  owned: Readonly<Record<string, number>>,
  cards: Readonly<Record<string, CardDef>>,
  salt: number,
): CardDef | null {
  let best: CardDef | null = null;
  let bestOwned = Infinity;
  let bestKey = Infinity;
  for (const c of cardList(cards)) {
    if (c.rarity === 'legendary') continue;
    const n = ownedOf(owned, c.id);
    if (n >= MERCHANT_CARD_CAP) continue;
    const key = cardKey(salt, c.id);
    // Ścisłe „<”: przy identycznym skrócie wygrywa wcześniejsza karta (kolejność treści).
    if (n < bestOwned || (n === bestOwned && key < bestKey)) {
      best = c;
      bestOwned = n;
      bestKey = key;
    }
  }
  return best;
}

// ───────────── Oferty ─────────────

export interface MerchantOffersArgs {
  /** Posiadane karty (SaveV1.cards.owned). */
  owned: Readonly<Record<string, number>>;
  cards: Readonly<Record<string, CardDef>>;
  /** Bieżący cykl (oferta dnia zmienia się co cykl). */
  cycle: number;
  /** Ziarno profilu (SaveV1.seed). */
  seed: number;
  /** Cykl, w którym kupiono ofertę dnia (−1 = nigdy). */
  dailyBoughtCycle: number;
  /** Skarbiec — cena oferty dnia jest dobierana tak, by dało się ją złożyć. */
  digits: Digits;
}

/**
 * Oferty handlarza (GDD 9.5a), kolejno: „3 za 1” (karty z zapasem ≥ 3), oferta dnia (gdy jeszcze
 * nie kupiona w tym cyklu), sprzedaż (karty z zapasem ≥ 1). Id ofert stałe:
 * '3for1:<cardId>', 'daily:<cycle>', 'sell:<cardId>'. Czysta funkcja.
 */
export function merchantOffers(args: MerchantOffersArgs): TradeOffer[] {
  const { owned, cards, cycle } = args;
  const list = cardList(cards);
  const out: TradeOffer[] = [];

  for (const card of list) {
    if (spareOf(owned, cards, card.id) >= TRADE_IN_COPIES && tradeUpPool(card, owned, cards).length > 0) {
      out.push({ id: `3for1:${card.id}`, kind: 'threeForOne', cardId: card.id });
    }
  }

  if (args.dailyBoughtCycle !== cycle) {
    const rng = dailyRng(args.seed, cycle);
    const base = rng.int(DAILY_SUM_MIN, DAILY_SUM_MAX);
    const salt = rng.int(0, 0xffffffff);
    const card = dailyCard(owned, cards, salt);
    if (card !== null) {
      out.push({ id: `daily:${cycle}`, kind: 'daily', cardId: card.id, price: dailyPrice(base, args.digits) });
    }
  }

  for (const card of list) {
    if (spareOf(owned, cards, card.id) >= 1) {
      out.push({ id: `sell:${card.id}`, kind: 'sell', cardId: card.id, digits: SELL_DIGITS[card.rarity] });
    }
  }
  return out;
}

// ───────────── Przyjęcie oferty ─────────────

export interface AcceptOfferArgs {
  /** Posiadane karty — mutowane tylko po udanej wymianie. */
  owned: Record<string, number>;
  /** Skarbiec — mutowany tylko po udanej wymianie. */
  digits: Digits;
  offer: TradeOffer;
  /** Wybrane cyfry (tylko oferta dnia). */
  payment?: readonly number[];
  cards: Readonly<Record<string, CardDef>>;
  rng: Rng;
}

export interface AcceptOfferResult {
  ok: boolean;
  /** Komunikat dla dziecka (po polsku). */
  message: string;
  /** Otrzymana karta (null przy sprzedaży i porażce). */
  cardGained: string | null;
  /** Otrzymane cyfry (sprzedaż). */
  digitsGained: number[];
}

function fail(message: string): AcceptOfferResult {
  return { ok: false, message, cardGained: null, digitsGained: [] };
}

function addCopies(owned: Record<string, number>, cardId: string, n: number): void {
  owned[cardId] = Math.min(MERCHANT_CARD_CAP, ownedOf(owned, cardId) + n);
}

/**
 * Przyjęcie oferty (GDD 9.5a). Najpierw wszystkie sprawdzenia, potem zmiany — przy porażce
 * `owned` i `digits` zostają nietknięte.
 * - „3 za 1”: −3 kopie karty, +1 losowa karta wyższej rzadkości (najpierw nieposiadane);
 * - oferta dnia: zapłata musi przejść checkForgePayment (liczba cyfr, suma, Skarbiec) → cyfry
 *   znikają ze Skarbca, +1 wskazana karta;
 * - sprzedaż: −1 kopia, + N losowych cyfr z 1..9 (N wg rzadkości karty).
 */
export function acceptOffer(args: AcceptOfferArgs): AcceptOfferResult {
  const { owned, digits, offer, cards, rng } = args;
  const card = Object.hasOwn(cards, offer.cardId) ? cards[offer.cardId] : undefined;
  if (card === undefined) return fail('Handlarz nie zna tej karty.');

  switch (offer.kind) {
    case 'threeForOne': {
      if (spareOf(owned, cards, card.id) < TRADE_IN_COPIES) {
        return fail(`Za mało kart w zapasie. Potrzebujesz ${TRADE_IN_COPIES} zapasowych kopii.`);
      }
      const pool = tradeUpPool(card, owned, cards);
      if (pool.length === 0) return fail('Handlarz nie ma teraz karty na wymianę.');
      const fresh = pool.filter((c) => ownedOf(owned, c.id) === 0);
      const gained = rng.pick(fresh.length > 0 ? fresh : pool);
      owned[card.id] = ownedOf(owned, card.id) - TRADE_IN_COPIES;
      addCopies(owned, gained.id, 1);
      return { ok: true, message: `Wymiana udana! Nowa karta: ${gained.name}.`, cardGained: gained.id, digitsGained: [] };
    }

    case 'daily': {
      if (ownedOf(owned, card.id) >= MERCHANT_CARD_CAP) return fail('Masz już bardzo dużo tych kart.');
      const payment = [...(args.payment ?? [])];
      const check = checkForgePayment(payment, offer.price, digits);
      if (!check.ok) return fail(check.reason === 'sum' ? `Suma się nie zgadza… ${check.message}` : check.message);
      removeDigits(digits, payment);
      addCopies(owned, card.id, 1);
      return {
        ok: true,
        message: `Wymiana udana! ${payment.join(' + ')} = ${offer.price.sum}. Nowa karta: ${card.name}.`,
        cardGained: card.id,
        digitsGained: [],
      };
    }

    case 'sell': {
      if (spareOf(owned, cards, card.id) < 1) return fail('Za mało kart w zapasie. Handlarz kupuje tylko zapasowe kopie.');
      const n = SELL_DIGITS[card.rarity];
      const gained: number[] = [];
      for (let i = 0; i < n; i++) gained.push(rng.int(1, 9));
      owned[card.id] = ownedOf(owned, card.id) - 1;
      addDigits(digits, gained);
      return {
        ok: true,
        message: `Wymiana udana! Dostajesz ${n} ${digitWord(n)}: ${gained.join(', ')}.`,
        cardGained: null,
        digitsGained: gained,
      };
    }
  }
}

