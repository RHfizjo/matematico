/**
 * Dane testowe walki kartami: KOPIE liczb z content/cards.ts i content/enemies.ts
 * (core/ nie importuje content/ — zgodność pilnuje test integracyjny). Nie jest częścią API.
 */
import type { CardBattleState, CardDef, EnemyDef, HeroStats, QteResult } from '../types';

const card = (c: Omit<CardDef, 'description' | 'art'> & Partial<Pick<CardDef, 'description' | 'art'>>): CardDef => ({
  description: '',
  art: 'creature:plusik',
  ...c,
});

export const CARD_DEFS: Record<string, CardDef> = {
  'cios-plusika': card({ id: 'cios-plusika', name: 'Cios Plusika', source: 'starter', sourceId: 'plusik', rarity: 'common', kind: 'attack', cost: 1, power: 8, power2: 0, pool: 'attack' }),
  'tarcza-z-lisci': card({ id: 'tarcza-z-lisci', name: 'Tarcza z liści', source: 'starter', sourceId: null, rarity: 'common', kind: 'shield', cost: 1, power: 8, power2: 0, pool: 'defend' }),
  'tarcza-dopelniaka': card({ id: 'tarcza-dopelniaka', name: 'Tarcza Dopełniaka', source: 'creature', sourceId: 'dopelniak', rarity: 'common', kind: 'shield', cost: 1, power: 12, power2: 0, pool: 'defend' }),
  'podwojny-dziob': card({ id: 'podwojny-dziob', name: 'Podwójny dziób', source: 'creature', sourceId: 'blizniak', rarity: 'uncommon', kind: 'strongAttack', cost: 2, power: 20, power2: 0, pool: 'strongAttack' }),
  'koniczynowa-tarcza': card({ id: 'koniczynowa-tarcza', name: 'Koniczynowa tarcza', source: 'creature', sourceId: 'koniczynek', rarity: 'rare', kind: 'bigShield', cost: 1, power: 22, power2: 0, pool: 'strongDefend' }),
  'lepka-kokarda': card({ id: 'lepka-kokarda', name: 'Lepka kokarda', source: 'glam', sourceId: 'slimakorro', rarity: 'uncommon', kind: 'weaken', cost: 1, power: 50, power2: 0, pool: 'defend' }),
  'brokatowy-roj': card({ id: 'brokatowy-roj', name: 'Brokatowy rój', source: 'glam', sourceId: 'trzmielini', rarity: 'uncommon', kind: 'multiHit', cost: 1, power: 4, power2: 3, pool: 'attack' }),
  'perlowy-zdroj': card({ id: 'perlowy-zdroj', name: 'Perłowy zdrój', source: 'glam', sourceId: 'grzybello', rarity: 'uncommon', kind: 'heal', cost: 1, power: 15, power2: 0, pool: 'defend' }),
  'krolewski-bukiet': card({ id: 'krolewski-bukiet', name: 'Królewski bukiet', source: 'glam', sourceId: 'kosiarrini', rarity: 'legendary', kind: 'combo', cost: 2, power: 14, power2: 10, pool: 'strongAttack' }),
};

/** Talia startowa (CARD_GRANTS.starter). */
export const STARTER_OWNED: Record<string, number> = { 'cios-plusika': 5, 'tarcza-z-lisci': 3 };

const enemyBase = {
  name: 'x',
  glamName: 'y',
  battleCry: '',
  glamThanks: '',
  land: 'meadow' as const,
  strongAttack: 25,
  strongEvery: 0,
  isBoss: false,
};

export const SLIM: EnemyDef = { ...enemyBase, id: 'slimakorro', czar: 30, behavior: 'normal', attack: 10 };
export const TRZ: EnemyDef = { ...enemyBase, id: 'trzmielini', czar: 25, behavior: 'fast', attack: 8 };
export const GRZ: EnemyDef = { ...enemyBase, id: 'grzybello', czar: 40, behavior: 'heavy', attack: 10, strongAttack: 22, strongEvery: 3 };
export const BOSS: EnemyDef = {
  ...enemyBase,
  id: 'kosiarrini',
  czar: 120,
  behavior: 'boss',
  attack: 12,
  strongAttack: 24,
  isBoss: true,
  phases: [
    { czarFrom: 120, note: '', strongEvery: 0, vines: 0 },
    { czarFrom: 80, note: '', strongEvery: 0, vines: 2 },
    { czarFrom: 40, note: '', strongEvery: 2, vines: 0 },
  ],
};
export const ENEMY_FIXTURES: EnemyDef[] = [SLIM, TRZ, GRZ, BOSS];

export const hero = (over: Partial<HeroStats> = {}): HeroStats => ({
  maxHp: 100,
  attackBonus: 0,
  defenseBoost: { defend: 0, strongDefend: 0 },
  shieldCharges: 0,
  ...over,
});

export const RESULTS: QteResult[] = ['fast', 'correct', 'late', 'wrong', 'timeout', 'retryCorrect'];

/** Talia z listy par [id, kopie]. */
export function deckOf(...parts: [string, number][]): string[] {
  const out: string[] = [];
  for (const [id, n] of parts) for (let i = 0; i < n; i++) out.push(id);
  return out;
}

/** Uid pierwszej karty o danym id na ręce (lub undefined). */
export function uidInHand(state: CardBattleState, cardId: string): string | undefined {
  return state.hand.find((c) => c.cardId === cardId)?.uid;
}

/** Łączna liczba kart w stosach (dobieranie + ręka + odrzucone). */
export function totalCards(state: CardBattleState): number {
  return state.drawPile.length + state.hand.length + state.discard.length;
}
