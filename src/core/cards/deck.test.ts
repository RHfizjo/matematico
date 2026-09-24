import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DECK_MAX, MAX_COPIES } from './constants';
import { buildDeck, countCards, deckCopies, sortCardIds, spareCounts } from './deck';
import { CARD_DEFS, STARTER_OWNED } from './testkit';

const IDS = Object.keys(CARD_DEFS);

describe('buildDeck (GDD 7.5)', () => {
  it('talia startowa: maks. 3 kopie — 3 × Cios Plusika + 3 × Tarcza z liści', () => {
    expect(buildDeck(STARTER_OWNED, CARD_DEFS)).toEqual([
      'cios-plusika',
      'cios-plusika',
      'cios-plusika',
      'tarcza-z-lisci',
      'tarcza-z-lisci',
      'tarcza-z-lisci',
    ]);
  });

  it('pomija nieznane id, zero, liczby ujemne i śmieci; ułamki w dół', () => {
    // Zapis z JSON może mieć własny klucz "__proto__" — nie jest kartą.
    const owned = JSON.parse('{"__proto__": 3, "nie-ma-takiej": 3, "tarcza-z-lisci": 0}') as Record<string, number>;
    owned['cios-plusika'] = 2.7;
    owned['podwojny-dziob'] = -2;
    owned['perlowy-zdroj'] = Number.NaN;
    owned['krolewski-bukiet'] = Number.POSITIVE_INFINITY;
    expect(buildDeck(owned, CARD_DEFS)).toEqual(['cios-plusika', 'cios-plusika']);
    expect(buildDeck({}, CARD_DEFS)).toEqual([]);
  });

  it('grupuje wg rzadkości (malejąco), potem id — niezależnie od kolejności kluczy', () => {
    const a = buildDeck({ 'tarcza-z-lisci': 1, 'krolewski-bukiet': 1, 'cios-plusika': 2, 'koniczynowa-tarcza': 1 }, CARD_DEFS);
    const b = buildDeck({ 'koniczynowa-tarcza': 1, 'cios-plusika': 2, 'krolewski-bukiet': 1, 'tarcza-z-lisci': 1 }, CARD_DEFS);
    expect(a).toEqual(['krolewski-bukiet', 'koniczynowa-tarcza', 'cios-plusika', 'cios-plusika', 'tarcza-z-lisci']);
    expect(b).toEqual(a);
  });

  it('ponad 15 kart: różnorodność — każda karta co najmniej raz, dalej po kolei od najrzadszych', () => {
    const owned = Object.fromEntries(IDS.map((id) => [id, 5]));
    const deck = buildDeck(owned, CARD_DEFS);
    expect(deck).toHaveLength(DECK_MAX);
    const counts = countCards(deck);
    expect(Object.keys(counts).sort()).toEqual([...IDS].sort());
    // 9 kart w 1. rundzie + 6 w 2. (legendarna, rzadka, 4 niezwykłe); zwykłe po 1.
    expect(counts).toEqual({
      'krolewski-bukiet': 2,
      'koniczynowa-tarcza': 2,
      'brokatowy-roj': 2,
      'lepka-kokarda': 2,
      'perlowy-zdroj': 2,
      'podwojny-dziob': 2,
      'cios-plusika': 1,
      'tarcza-dopelniaka': 1,
      'tarcza-z-lisci': 1,
    });
  });

  it('dokładnie 15 kart po limicie 3 kopii — bez obcinania', () => {
    const owned = { 'cios-plusika': 9, 'tarcza-z-lisci': 3, 'tarcza-dopelniaka': 3, 'podwojny-dziob': 3, 'perlowy-zdroj': 3 };
    const deck = buildDeck(owned, CARD_DEFS);
    expect(deck).toHaveLength(15);
    expect(Object.values(countCards(deck))).toEqual([3, 3, 3, 3, 3]);
  });

  it('właściwości: ≤ 3 kopie, ≤ 15 kart, suma = min(15, Σ min(3, n)), różnorodność, determinizm', () => {
    const ownedArb = fc.dictionary(
      fc.constantFrom(...IDS, 'obca-karta'),
      fc.oneof(fc.integer({ min: -3, max: 12 }), fc.double({ noNaN: false })),
    );
    fc.assert(
      fc.property(ownedArb, (owned) => {
        const deck = buildDeck(owned, CARD_DEFS);
        const counts = countCards(deck);
        const want = Object.entries(owned)
          .filter(([id]) => CARD_DEFS[id] !== undefined)
          .map(([, n]) => (Number.isFinite(n) && n > 0 ? Math.min(MAX_COPIES, Math.floor(n)) : 0));
        expect(deck.length).toBe(Math.min(DECK_MAX, want.reduce((a, b) => a + b, 0)));
        expect(Object.keys(counts).length).toBe(Math.min(DECK_MAX, want.filter((n) => n > 0).length));
        for (const [id, n] of Object.entries(counts)) {
          expect(CARD_DEFS[id]).toBeDefined();
          expect(n).toBeLessThanOrEqual(MAX_COPIES);
          expect(n).toBeLessThanOrEqual(Math.floor(owned[id] ?? 0));
        }
        expect(countCards(deck)).toEqual(deckCopies(owned, CARD_DEFS));
        const reversed = Object.fromEntries(Object.entries(owned).reverse());
        expect(buildDeck(reversed, CARD_DEFS)).toEqual(deck);
      }),
      { numRuns: 300 },
    );
  });
});

describe('spareCounts (GDD 9.5a)', () => {
  it('zapas = kopie ponad 3; znane karty z zapisu (także 0), nieznane pominięte', () => {
    expect(spareCounts({ ...STARTER_OWNED, 'podwojny-dziob': 4, 'nie-ma': 9, 'perlowy-zdroj': -1 }, CARD_DEFS)).toEqual({
      'podwojny-dziob': 1,
      'perlowy-zdroj': 0,
      'cios-plusika': 2,
      'tarcza-z-lisci': 0,
    });
    expect(spareCounts({}, CARD_DEFS)).toEqual({});
  });

  it('talia + zapas = posiadane (gdy talia nie przekracza 15)', () => {
    const owned = { 'cios-plusika': 7, 'tarcza-z-lisci': 3, 'brokatowy-roj': 1 };
    const deck = countCards(buildDeck(owned, CARD_DEFS));
    const spare = spareCounts(owned, CARD_DEFS);
    for (const [id, n] of Object.entries(owned)) expect((deck[id] ?? 0) + (spare[id] ?? 0)).toBe(n);
  });
});

describe('pomocnicze', () => {
  it('sortCardIds: rzadkość malejąco, potem id; bez duplikatów i nieznanych', () => {
    expect(sortCardIds(['tarcza-z-lisci', 'x', 'krolewski-bukiet', 'cios-plusika', 'cios-plusika', 'podwojny-dziob'], CARD_DEFS)).toEqual([
      'krolewski-bukiet',
      'podwojny-dziob',
      'cios-plusika',
      'tarcza-z-lisci',
    ]);
  });

  it('countCards', () => {
    expect(countCards(['a', 'b', 'a'])).toEqual({ a: 2, b: 1 });
    expect(countCards([])).toEqual({});
  });
});
