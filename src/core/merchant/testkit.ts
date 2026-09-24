/**
 * Dane kart do testów core/ (kopia content/cards.ts — core/ nie importuje content/).
 * Nie jest częścią API.
 */
import type { CardDef, CardGrants } from '../types';

const card = (c: Omit<CardDef, 'description' | 'power2'> & Partial<Pick<CardDef, 'power2'>>): CardDef => ({
  power2: 0,
  description: c.name,
  ...c,
});

/** Karty Łąki (GDD 13.5). */
export const TEST_CARDS: Record<string, CardDef> = {
  'cios-plusika': card({
    id: 'cios-plusika',
    name: 'Cios Plusika',
    source: 'starter',
    sourceId: 'plusik',
    rarity: 'common',
    kind: 'attack',
    cost: 1,
    power: 8,
    pool: 'attack',
    art: 'creature:plusik',
  }),
  'tarcza-z-lisci': card({
    id: 'tarcza-z-lisci',
    name: 'Tarcza z liści',
    source: 'starter',
    sourceId: null,
    rarity: 'common',
    kind: 'shield',
    cost: 1,
    power: 8,
    pool: 'defend',
    art: 'creature:plusik',
  }),
  'tarcza-dopelniaka': card({
    id: 'tarcza-dopelniaka',
    name: 'Tarcza Dopełniaka',
    source: 'creature',
    sourceId: 'dopelniak',
    rarity: 'common',
    kind: 'shield',
    cost: 1,
    power: 12,
    pool: 'defend',
    art: 'creature:dopelniak',
  }),
  'podwojny-dziob': card({
    id: 'podwojny-dziob',
    name: 'Podwójny dziób',
    source: 'creature',
    sourceId: 'blizniak',
    rarity: 'uncommon',
    kind: 'strongAttack',
    cost: 2,
    power: 20,
    pool: 'strongAttack',
    art: 'creature:blizniak',
  }),
  'koniczynowa-tarcza': card({
    id: 'koniczynowa-tarcza',
    name: 'Koniczynowa tarcza',
    source: 'creature',
    sourceId: 'koniczynek',
    rarity: 'rare',
    kind: 'bigShield',
    cost: 1,
    power: 22,
    pool: 'strongDefend',
    art: 'creature:koniczynek',
  }),
  'lepka-kokarda': card({
    id: 'lepka-kokarda',
    name: 'Lepka kokarda',
    source: 'glam',
    sourceId: 'slimakorro',
    rarity: 'uncommon',
    kind: 'weaken',
    cost: 1,
    power: 50,
    pool: 'defend',
    art: 'glam:slimakorro',
  }),
  'brokatowy-roj': card({
    id: 'brokatowy-roj',
    name: 'Brokatowy rój',
    source: 'glam',
    sourceId: 'trzmielini',
    rarity: 'uncommon',
    kind: 'multiHit',
    cost: 1,
    power: 4,
    power2: 3,
    pool: 'attack',
    art: 'glam:trzmielini',
  }),
  'perlowy-zdroj': card({
    id: 'perlowy-zdroj',
    name: 'Perłowy zdrój',
    source: 'glam',
    sourceId: 'grzybello',
    rarity: 'uncommon',
    kind: 'heal',
    cost: 1,
    power: 15,
    pool: 'defend',
    art: 'glam:grzybello',
  }),
  'krolewski-bukiet': card({
    id: 'krolewski-bukiet',
    name: 'Królewski bukiet',
    source: 'glam',
    sourceId: 'kosiarrini',
    rarity: 'legendary',
    kind: 'combo',
    cost: 2,
    power: 14,
    power2: 10,
    pool: 'strongAttack',
    art: 'glam:kosiarrini',
  }),
};

/** Skąd dziecko dostaje karty (GDD 13.5). */
export const TEST_CARD_GRANTS: CardGrants = {
  starter: { 'cios-plusika': 5, 'tarcza-z-lisci': 3 },
  creatures: {
    plusik: { cardId: 'cios-plusika', onCatch: 1, onLevelUp: 1 },
    dopelniak: { cardId: 'tarcza-dopelniaka', onCatch: 2, onLevelUp: 1 },
    blizniak: { cardId: 'podwojny-dziob', onCatch: 2, onLevelUp: 1 },
    koniczynek: { cardId: 'koniczynowa-tarcza', onCatch: 1, onLevelUp: 1 },
  },
  glams: {
    slimakorro: 'lepka-kokarda',
    trzmielini: 'brokatowy-roj',
    grzybello: 'perlowy-zdroj',
    kosiarrini: 'krolewski-bukiet',
  },
};

/** Id kart w kolejności tabeli 13.5. */
export const TEST_CARD_IDS: readonly string[] = Object.keys(TEST_CARDS);
