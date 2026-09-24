import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CardDef, Digits, TradeOffer } from '../types';
import { createRng } from '../rng';
import { countDigits, digitsFromList, emptyDigits, findForgePayment, startingDigits } from '../economy';
import {
  DAILY_SUM_MAX,
  DAILY_SUM_MIN,
  SELL_DIGITS,
  acceptOffer,
  merchantOffers,
  type MerchantOffersArgs,
} from './merchant';
import { TEST_CARDS as CARDS, TEST_CARD_IDS } from './testkit';

const STARTER = (): Record<string, number> => ({ 'cios-plusika': 5, 'tarcza-z-lisci': 3 });

const args = (over: Partial<MerchantOffersArgs> = {}): MerchantOffersArgs => ({
  owned: STARTER(),
  cards: CARDS,
  cycle: 3,
  seed: 42,
  dailyBoughtCycle: -1,
  digits: startingDigits(),
  ...over,
});

const ids = (offers: TradeOffer[]): string[] => offers.map((o) => o.id);
const daily = (offers: TradeOffer[]): Extract<TradeOffer, { kind: 'daily' }> | undefined =>
  offers.find((o): o is Extract<TradeOffer, { kind: 'daily' }> => o.kind === 'daily');
const card = (id: string): CardDef => CARDS[id] as CardDef;
const ownedArb = fc
  .dictionary(fc.constantFrom(...TEST_CARD_IDS), fc.integer({ min: 0, max: 12 }), { noNullPrototype: true })
  .map((d) => ({ ...STARTER(), ...d }));

describe('merchantOffers', () => {
  it('talia startowa: oferta dnia i sprzedaż 2 zapasowych Ciosów Plusika; bez „3 za 1”', () => {
    const offers = merchantOffers(args());
    expect(ids(offers)).toEqual(['daily:3', 'sell:cios-plusika']);
    expect(offers[1]).toEqual({ id: 'sell:cios-plusika', kind: 'sell', cardId: 'cios-plusika', digits: 2 });
  });

  it('„3 za 1” od 3 zapasowych kopii (6 posiadanych); kolejność: 3 za 1, dzień, sprzedaż', () => {
    const owned = { ...STARTER(), 'cios-plusika': 6, 'podwojny-dziob': 7, 'tarcza-z-lisci': 4 };
    const offers = merchantOffers(args({ owned }));
    expect(ids(offers)).toEqual([
      '3for1:cios-plusika',
      '3for1:podwojny-dziob',
      'daily:3',
      'sell:cios-plusika',
      'sell:tarcza-z-lisci',
      'sell:podwojny-dziob',
    ]);
    expect(offers[0]).toEqual({ id: '3for1:cios-plusika', kind: 'threeForOne', cardId: 'cios-plusika' });
  });

  it('bez zapasu (≤ 3 kopie) — nic do wymiany ani sprzedaży', () => {
    const owned = { 'cios-plusika': 3, 'tarcza-z-lisci': 3, 'podwojny-dziob': 1 };
    expect(ids(merchantOffers(args({ owned })))).toEqual(['daily:3']);
  });

  it('sprzedaż: zwykła 2, niezwykła 3, rzadka 4, legendarna 5 cyfr', () => {
    expect(SELL_DIGITS).toEqual({ common: 2, uncommon: 3, rare: 4, legendary: 5 });
    const owned = { ...STARTER(), 'tarcza-dopelniaka': 4, 'lepka-kokarda': 4, 'koniczynowa-tarcza': 4, 'krolewski-bukiet': 4 };
    const sells = merchantOffers(args({ owned })).filter((o) => o.kind === 'sell');
    const byCard = Object.fromEntries(sells.map((o) => [o.cardId, o.kind === 'sell' ? o.digits : 0]));
    expect(byCard).toEqual({
      'cios-plusika': 2,
      'tarcza-dopelniaka': 2,
      'lepka-kokarda': 3,
      'koniczynowa-tarcza': 4,
      'krolewski-bukiet': 5,
    });
  });

  it('„3 za 1” nie dla legendarnej ani rzadkiej, gdy nie ma innej rzadkiej karty', () => {
    const owned = { ...STARTER(), 'koniczynowa-tarcza': 9, 'krolewski-bukiet': 9 };
    const offers = merchantOffers(args({ owned }));
    expect(offers.filter((o) => o.kind === 'threeForOne')).toEqual([]);
    expect(ids(offers)).toContain('sell:koniczynowa-tarcza');
    expect(ids(offers)).toContain('sell:krolewski-bukiet');
    // Druga rzadka karta w treści → „3 za 1” dla rzadkiej jest możliwe.
    const rare2: CardDef = { ...card('koniczynowa-tarcza'), id: 'rosa', name: 'Rosa' };
    const withRare = merchantOffers(args({ owned, cards: { ...CARDS, rosa: rare2 } }));
    expect(ids(withRare)).toContain('3for1:koniczynowa-tarcza');
    expect(ids(withRare)).not.toContain('3for1:krolewski-bukiet');
  });

  it('karty nieznane (spoza definicji) są pomijane', () => {
    const owned = { ...STARTER(), 'karta-z-kosmosu': 50 };
    expect(ids(merchantOffers(args({ owned })))).toEqual(['daily:3', 'sell:cios-plusika']);
  });

  it('oferta dnia: jedna na cykl, znika po kupnie w tym cyklu, wraca w następnym', () => {
    expect(merchantOffers(args({ dailyBoughtCycle: 3 })).filter((o) => o.kind === 'daily')).toEqual([]);
    expect(daily(merchantOffers(args({ dailyBoughtCycle: 2 })))?.id).toBe('daily:3');
    expect(daily(merchantOffers(args({ cycle: 4, dailyBoughtCycle: 3 })))?.id).toBe('daily:4');
  });

  it('oferta dnia: deterministyczna z (ziarno, cykl), zmienia się między cyklami i profilami', () => {
    expect(merchantOffers(args())).toEqual(merchantOffers(args()));
    const seen = new Set<string>();
    for (let cycle = 0; cycle < 30; cycle++) {
      const d = daily(merchantOffers(args({ cycle })));
      seen.add(`${d?.cardId}|${d?.price.sum}`);
    }
    expect(seen.size).toBeGreaterThan(5);
    const perSeed = new Set<string>();
    for (let seed = 0; seed < 30; seed++) perSeed.add(JSON.stringify(daily(merchantOffers(args({ seed })))));
    expect(perSeed.size).toBeGreaterThan(5);
  });

  it('oferta dnia: najpierw karty, których dziecko ma najmniej (nieposiadane), nigdy legendarna', () => {
    const d = daily(merchantOffers(args()));
    expect(d).toBeDefined();
    expect(['tarcza-dopelniaka', 'podwojny-dziob', 'koniczynowa-tarcza', 'lepka-kokarda', 'brokatowy-roj', 'perlowy-zdroj']).toContain(
      d?.cardId,
    );
    // Wszystkie posiadane poza jedną nielegendarną → wskazana ta jedna.
    const owned: Record<string, number> = {};
    for (const id of TEST_CARD_IDS) owned[id] = 3;
    owned['perlowy-zdroj'] = 1;
    owned['krolewski-bukiet'] = 0;
    for (let cycle = 0; cycle < 10; cycle++) expect(daily(merchantOffers(args({ owned, cycle })))?.cardId).toBe('perlowy-zdroj');
  });

  it('oferta dnia: tylko karty legendarne w treści → brak oferty dnia', () => {
    const cards = { 'krolewski-bukiet': card('krolewski-bukiet') };
    expect(merchantOffers(args({ cards, owned: { 'krolewski-bukiet': 1 } }))).toEqual([]);
  });

  it('cena: „złóż sumę 10..20 z 3 cyfr”, dobrana tak, by dało się ją złożyć ze Skarbca', () => {
    // Skarbiec z samymi jedynkami i dziewiątkami: 1+9+9 = 19 albo 9+9+9 = 27 → tylko 19 pasuje.
    const digits = digitsFromList([1, 9, 9]);
    for (let cycle = 0; cycle < 20; cycle++) {
      expect(daily(merchantOffers(args({ cycle, digits })))?.price).toEqual({ sum: 19, count: 3 });
    }
    // Pusty Skarbiec → cena bazowa z zakresu (i tak osiągalna cyframi 1..9).
    const empty = daily(merchantOffers(args({ digits: emptyDigits() })));
    expect(empty?.price.count).toBe(3);
    expect(empty?.price.sum).toBeGreaterThanOrEqual(DAILY_SUM_MIN);
    expect(empty?.price.sum).toBeLessThanOrEqual(DAILY_SUM_MAX);
  });

  it('property: oferta dnia zawsze poprawna', () => {
    fc.assert(
      fc.property(
        ownedArb,
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 10, maxLength: 10 }),
        (owned, cycle, seed, digits: Digits) => {
          const offers = merchantOffers(args({ owned, cycle, seed, digits }));
          expect(offers.filter((o) => o.kind === 'daily')).toHaveLength(1);
          const d = daily(offers);
          if (d === undefined) return;
          expect(d.id).toBe(`daily:${cycle}`);
          const c = card(d.cardId);
          expect(c.rarity).not.toBe('legendary');
          const fewest = Math.min(...TEST_CARD_IDS.filter((id) => card(id).rarity !== 'legendary').map((id) => owned[id] ?? 0));
          expect(owned[d.cardId] ?? 0).toBe(fewest);
          expect(d.price.count).toBe(3);
          expect(d.price.sum).toBeGreaterThanOrEqual(DAILY_SUM_MIN);
          expect(d.price.sum).toBeLessThanOrEqual(DAILY_SUM_MAX);
          // Gdy jakąkolwiek sumę z zakresu da się złożyć — cenę też.
          let anyPayable = false;
          for (let s = DAILY_SUM_MIN; s <= DAILY_SUM_MAX; s++) anyPayable ||= findForgePayment({ sum: s, count: 3 }, digits) !== null;
          if (anyPayable) expect(findForgePayment(d.price, digits)).not.toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });

  it('regresja: oferta dnia nie przeskakuje w cyklu po „3 za 1” lub sprzedaży INNEJ karty (GDD 9.5a)', () => {
    let checked = 0;
    for (let seed = 0; seed < 60; seed++) {
      const owned: Record<string, number> = { ...STARTER(), 'cios-plusika': 9 };
      const digits = startingDigits();
      const before = daily(merchantOffers(args({ owned, digits, seed })));
      expect(before).toBeDefined();
      const r = acceptOffer({
        owned,
        digits,
        offer: { id: '3for1:cios-plusika', kind: 'threeForOne', cardId: 'cios-plusika' },
        cards: CARDS,
        rng: createRng(seed),
      });
      expect(r.ok).toBe(true);
      // Nagroda „3 za 1” to inna karta niż oferta dnia → oferta dnia (karta i cena) bez zmian.
      if (r.cardGained !== before?.cardId) {
        expect(daily(merchantOffers(args({ owned, digits, seed }))), `seed ${seed}`).toEqual(before);
        checked++;
      }
      const sold = acceptOffer({
        owned,
        digits,
        offer: { id: 'sell:cios-plusika', kind: 'sell', cardId: 'cios-plusika', digits: 2 },
        cards: CARDS,
        rng: createRng(seed),
      });
      expect(sold.ok).toBe(true);
      if (r.cardGained !== before?.cardId) expect(daily(merchantOffers(args({ owned, digits, seed })))?.cardId).toBe(before?.cardId);
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('property: zmiana liczby kopii innej karty (na więcej niż karta dnia) nie zmienia karty dnia', () => {
    fc.assert(
      fc.property(
        ownedArb,
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.constantFrom(...TEST_CARD_IDS),
        fc.integer({ min: 0, max: 20 }),
        (owned, cycle, seed, other, extra) => {
          const before = daily(merchantOffers(args({ owned, cycle, seed })));
          if (before === undefined || other === before.cardId) return;
          const changed = { ...owned, [other]: (owned[before.cardId] ?? 0) + 1 + extra };
          expect(daily(merchantOffers(args({ owned: changed, cycle, seed })))?.cardId).toBe(before.cardId);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('property: oferty wymiany i sprzedaży tylko dla zapasu; id unikalne i stabilne', () => {
    fc.assert(
      fc.property(ownedArb, (owned) => {
        const offers = merchantOffers(args({ owned }));
        expect(new Set(ids(offers)).size).toBe(offers.length);
        for (const o of offers) {
          const spare = Math.max(0, (owned[o.cardId] ?? 0) - 3);
          if (o.kind === 'threeForOne') {
            expect(o.id).toBe(`3for1:${o.cardId}`);
            expect(spare).toBeGreaterThanOrEqual(3);
          }
          if (o.kind === 'sell') {
            expect(o.id).toBe(`sell:${o.cardId}`);
            expect(spare).toBeGreaterThanOrEqual(1);
            expect(o.digits).toBe(SELL_DIGITS[card(o.cardId).rarity]);
          }
        }
        for (const id of TEST_CARD_IDS) {
          const spare = Math.max(0, (owned[id] ?? 0) - 3);
          expect(ids(offers).includes(`sell:${id}`)).toBe(spare >= 1);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('acceptOffer', () => {
  const rng = (): ReturnType<typeof createRng> => createRng(5);

  it('„3 za 1”: −3 kopie, +1 karta niezwykła, której dziecko nie ma', () => {
    const owned: Record<string, number> = { ...STARTER(), 'cios-plusika': 7, 'podwojny-dziob': 2, 'lepka-kokarda': 1, 'brokatowy-roj': 1 };
    const digits = startingDigits();
    const offer: TradeOffer = { id: '3for1:cios-plusika', kind: 'threeForOne', cardId: 'cios-plusika' };
    const r = acceptOffer({ owned, digits, offer, cards: CARDS, rng: rng() });
    expect(r).toEqual({ ok: true, message: 'Wymiana udana! Nowa karta: Perłowy zdrój.', cardGained: 'perlowy-zdroj', digitsGained: [] });
    expect(owned['cios-plusika']).toBe(4);
    expect(owned['perlowy-zdroj']).toBe(1);
    expect(digits).toEqual(startingDigits());
  });

  it('„3 za 1”: wszystkie niezwykłe posiadane → dowolna niezwykła; niezwykła → rzadka; nigdy legendarna', () => {
    const allUncommon = { ...STARTER(), 'tarcza-dopelniaka': 6, 'podwojny-dziob': 1, 'lepka-kokarda': 1, 'brokatowy-roj': 1, 'perlowy-zdroj': 1 };
    const got = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const owned = { ...allUncommon };
      const r = acceptOffer({
        owned,
        digits: startingDigits(),
        offer: { id: '3for1:tarcza-dopelniaka', kind: 'threeForOne', cardId: 'tarcza-dopelniaka' },
        cards: CARDS,
        rng: createRng(seed),
      });
      expect(r.ok).toBe(true);
      expect(card(r.cardGained as string).rarity).toBe('uncommon');
      got.add(r.cardGained as string);
    }
    expect(got.size).toBeGreaterThan(1);

    const owned = { ...STARTER(), 'lepka-kokarda': 6 };
    const r = acceptOffer({
      owned,
      digits: startingDigits(),
      offer: { id: '3for1:lepka-kokarda', kind: 'threeForOne', cardId: 'lepka-kokarda' },
      cards: CARDS,
      rng: rng(),
    });
    expect(r.cardGained).toBe('koniczynowa-tarcza');
    expect(owned).toEqual({ ...STARTER(), 'lepka-kokarda': 3, 'koniczynowa-tarcza': 1 });
  });

  it('„3 za 1” rzadka → inna rzadka (nigdy ta sama, nigdy legendarna)', () => {
    const rare2: CardDef = { ...card('koniczynowa-tarcza'), id: 'rosa', name: 'Rosa' };
    const cards = { ...CARDS, rosa: rare2 };
    for (let seed = 0; seed < 20; seed++) {
      const owned = { ...STARTER(), 'koniczynowa-tarcza': 6, rosa: 2 };
      const r = acceptOffer({
        owned,
        digits: startingDigits(),
        offer: { id: '3for1:koniczynowa-tarcza', kind: 'threeForOne', cardId: 'koniczynowa-tarcza' },
        cards,
        rng: createRng(seed),
      });
      expect(r.cardGained).toBe('rosa');
      expect(owned).toEqual({ ...STARTER(), 'koniczynowa-tarcza': 3, rosa: 3 });
    }
    // Jedyna rzadka karta → brak nagrody, nic nie znika.
    const owned = { ...STARTER(), 'koniczynowa-tarcza': 6 };
    const r = acceptOffer({
      owned,
      digits: startingDigits(),
      offer: { id: '3for1:koniczynowa-tarcza', kind: 'threeForOne', cardId: 'koniczynowa-tarcza' },
      cards: CARDS,
      rng: rng(),
    });
    expect(r.ok).toBe(false);
    expect(owned['koniczynowa-tarcza']).toBe(6);
  });

  it('„3 za 1” bez 3 zapasowych kopii → „Za mało kart w zapasie.”, bez zmian', () => {
    const owned = STARTER();
    const r = acceptOffer({
      owned,
      digits: startingDigits(),
      offer: { id: '3for1:cios-plusika', kind: 'threeForOne', cardId: 'cios-plusika' },
      cards: CARDS,
      rng: rng(),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^Za mało kart w zapasie\./);
    expect(r.cardGained).toBeNull();
    expect(owned).toEqual(STARTER());
  });

  describe('oferta dnia', () => {
    const offer: TradeOffer = { id: 'daily:3', kind: 'daily', cardId: 'lepka-kokarda', price: { sum: 15, count: 3 } };

    it('dobra zapłata: cyfry znikają ze Skarbca, +1 karta', () => {
      const owned = STARTER();
      const digits = startingDigits();
      const r = acceptOffer({ owned, digits, offer, payment: [9, 5, 1], cards: CARDS, rng: rng() });
      expect(r).toEqual({
        ok: true,
        message: 'Wymiana udana! 9 + 5 + 1 = 15. Nowa karta: Lepka kokarda.',
        cardGained: 'lepka-kokarda',
        digitsGained: [],
      });
      expect(owned['lepka-kokarda']).toBe(1);
      expect(digits).toEqual([1, 1, 2, 2, 2, 1, 2, 2, 2, 1]);
      expect(countDigits(digits)).toBe(16);
    });

    it('zła suma, liczba cyfr, brak cyfr, brak zapłaty → komunikat, bez zmian', () => {
      const cases: [readonly number[] | undefined, RegExp][] = [
        [[9, 5, 2], /^Suma się nie zgadza… Twoje cyfry dają 16\. Za dużo o 1\.$/],
        [[1, 2, 3], /^Suma się nie zgadza… Twoje cyfry dają 6\. Brakuje 9\.$/],
        [[9, 6], /^Wybierz dokładnie 3 cyfry\.$/],
        [undefined, /^Wybierz dokładnie 3 cyfry\.$/],
        [[5, 5, 5], /^Nie masz tych cyfr w Skarbcu\.$/],
        [[7, 7, 1.5], /^Nie masz tych cyfr w Skarbcu\.$/],
      ];
      for (const [payment, msg] of cases) {
        const owned = STARTER();
        const digits = startingDigits();
        const r = acceptOffer({ owned, digits, offer, cards: CARDS, rng: rng(), ...(payment ? { payment } : {}) });
        expect(r.ok, String(payment)).toBe(false);
        expect(r.message).toMatch(msg);
        expect(owned).toEqual(STARTER());
        expect(digits).toEqual(startingDigits());
      }
    });
  });

  describe('sprzedaż', () => {
    it('−1 zapasowa kopia, + N losowych cyfr 1..9 do Skarbca', () => {
      for (const [id, n] of [
        ['cios-plusika', 2],
        ['podwojny-dziob', 3],
        ['koniczynowa-tarcza', 4],
        ['krolewski-bukiet', 5],
      ] as const) {
        const owned = { ...STARTER(), [id]: 5 };
        const digits = startingDigits();
        const r = acceptOffer({ owned, digits, offer: { id: `sell:${id}`, kind: 'sell', cardId: id, digits: n }, cards: CARDS, rng: rng() });
        expect(r.ok).toBe(true);
        expect(r.cardGained).toBeNull();
        expect(r.digitsGained).toHaveLength(n);
        expect(r.digitsGained.every((d) => d >= 1 && d <= 9)).toBe(true);
        expect(r.message).toBe(`Wymiana udana! Dostajesz ${n} ${n === 5 ? 'cyfr' : 'cyfry'}: ${r.digitsGained.join(', ')}.`);
        expect(owned[id]).toBe(4);
        expect(countDigits(digits)).toBe(19 + n);
        expect(digits).toEqual(digitsFromList([...[0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9], ...r.digitsGained]));
      }
    });

    it('bez zapasu → odmowa, bez zmian (handlarz nie zabiera kart z talii)', () => {
      const owned = { ...STARTER(), 'cios-plusika': 3 };
      const digits = startingDigits();
      const r = acceptOffer({
        owned,
        digits,
        offer: { id: 'sell:cios-plusika', kind: 'sell', cardId: 'cios-plusika', digits: 2 },
        cards: CARDS,
        rng: rng(),
      });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/^Za mało kart w zapasie\./);
      expect(owned['cios-plusika']).toBe(3);
      expect(digits).toEqual(startingDigits());
    });
  });

  it('nieznana karta → odmowa bez zmian', () => {
    const owned = { ...STARTER(), smok: 9 };
    const r = acceptOffer({
      owned,
      digits: startingDigits(),
      offer: { id: 'sell:smok', kind: 'sell', cardId: 'smok', digits: 2 },
      cards: CARDS,
      rng: rng(),
    });
    expect(r).toEqual({ ok: false, message: 'Handlarz nie zna tej karty.', cardGained: null, digitsGained: [] });
    expect(owned.smok).toBe(9);
  });

  it('property: przyjęcie dowolnej oferty z listy nigdy nie schodzi poniżej 3 kopii i nie tworzy legendarnej', () => {
    fc.assert(
      fc.property(ownedArb, fc.nat(), fc.integer({ min: 0, max: 0xffffffff }), (owned, pick, seed) => {
        const digits = startingDigits();
        const offers = merchantOffers(args({ owned, digits, seed }));
        const offer = offers[pick % offers.length] as TradeOffer;
        const before = { ...owned };
        const payment = offer.kind === 'daily' ? findForgePayment(offer.price, digits) ?? undefined : undefined;
        const r = acceptOffer({ owned, digits, offer, cards: CARDS, rng: createRng(seed), ...(payment ? { payment } : {}) });
        if (offer.kind !== 'daily' || payment !== undefined) expect(r.ok).toBe(true);
        for (const id of TEST_CARD_IDS) {
          const b = before[id] ?? 0;
          const a = owned[id] ?? 0;
          if (a < b) expect(a).toBeGreaterThanOrEqual(3);
        }
        if (r.cardGained !== null) {
          expect(card(r.cardGained).rarity).not.toBe('legendary');
          expect(owned[r.cardGained]).toBe((before[r.cardGained] ?? 0) + 1);
        }
        const lost = TEST_CARD_IDS.reduce((s, id) => s + Math.max(0, (before[id] ?? 0) - (owned[id] ?? 0)), 0);
        expect(lost).toBe(offer.kind === 'threeForOne' ? 3 : offer.kind === 'sell' ? 1 : 0);
      }),
      { numRuns: 300 },
    );
  });

  it('deterministyczne dla tego samego rng', () => {
    const run = (): unknown => {
      const owned = { ...STARTER(), 'cios-plusika': 9 };
      const digits = startingDigits();
      const offer: TradeOffer = { id: 'sell:cios-plusika', kind: 'sell', cardId: 'cios-plusika', digits: 2 };
      return [acceptOffer({ owned, digits, offer, cards: CARDS, rng: createRng(77) }), owned, digits];
    };
    expect(run()).toEqual(run());
  });
});
