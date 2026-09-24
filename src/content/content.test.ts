import { describe, expect, it } from 'vitest';
import type { ActionKind, CardKind, LandId } from '../core/types';
import {
  BOSS_ITEMS_MEADOW,
  CARDS,
  CARD_GRANTS,
  CHEST_ITEM_POOL_MEADOW,
  CREATURES,
  ENEMIES,
  ITEMS,
  ITEM_SOURCE_MEADOW,
  LANDS,
  LAND_ORDER,
  MEADOW_BOSS,
  MEADOW_ENEMIES,
  STARTER_CREATURE,
  STARTER_ITEMS,
} from './index';

const VIOLENT = /zabi|zabij|zabój|zniszcz|śmier|umrz|umier|zgi[nń]|krew|krwaw|morduj|zdych|pokonam/i;
const oneSentence = (s: string) => s.trim().length > 0 && /[.!]$/.test(s.trim()) && s.split(/[.!?]\s/).length === 1;

describe('stworki (GDD 13.1)', () => {
  it('stałe id i klucze = id', () => {
    expect(Object.keys(CREATURES)).toEqual(['plusik', 'dopelniak', 'blizniak', 'koniczynek']);
    for (const [k, c] of Object.entries(CREATURES)) expect(c.id).toBe(k);
    expect(CREATURES[STARTER_CREATURE]).toBeDefined();
  });

  it('dane zgodne z GDD', () => {
    const { plusik, dopelniak, blizniak, koniczynek } = CREATURES;
    expect(plusik).toMatchObject({
      name: 'Plusik',
      rarity: 'common',
      categories: ['add.within10', 'add.within20'],
      catchFormat: 'choice',
      catchRule: { need: 2, of: 3 },
      unlocksAction: 'attack',
      unlocksOperator: '+',
      production: 'small',
    });
    expect(dopelniak).toMatchObject({
      name: 'Dopełniak',
      rarity: 'common',
      categories: ['add.complement10'],
      catchFormat: 'missing',
      catchRule: { need: 2, of: 3 },
      boostsDefense: 'defend',
      production: 'pairs10',
    });
    expect(blizniak).toMatchObject({
      name: 'Bliźniak',
      rarity: 'uncommon',
      categories: ['add.doubles'],
      catchRule: { need: 3, of: 4 },
      unlocksAction: 'strongAttack',
      unlocksOperator: '×',
      production: 'twins',
    });
    expect(koniczynek).toMatchObject({
      name: 'Koniczynek',
      rarity: 'rare',
      categories: ['add.three', 'add.within20'],
      catchRule: { need: 3, of: 4 },
      boostsDefense: 'strongDefend',
      shield: true,
      production: 'rare',
    });
    for (const c of Object.values(CREATURES)) {
      expect(c.land).toBe('meadow');
      expect(oneSentence(c.description)).toBe(true);
      expect(c.catchRule.need).toBeLessThanOrEqual(c.catchRule.of);
    }
  });
});

describe('brainroty (GDD 13.2, 13.3)', () => {
  it('stałe id', () => {
    expect(Object.keys(ENEMIES)).toEqual(['slimakorro', 'trzmielini', 'grzybello', 'kosiarrini']);
    for (const [k, e] of Object.entries(ENEMIES)) expect(e.id).toBe(k);
    expect([...MEADOW_ENEMIES, MEADOW_BOSS].every((id) => ENEMIES[id] !== undefined)).toBe(true);
  });

  it('liczby i zachowania', () => {
    const { slimakorro, trzmielini, grzybello, kosiarrini } = ENEMIES;
    expect(slimakorro).toMatchObject({
      name: 'Ślimakorro Buciorro',
      glamName: 'Ślimakella Glamella',
      czar: 30,
      behavior: 'normal',
      attack: 10,
      isBoss: false,
    });
    expect(trzmielini).toMatchObject({
      name: 'Trzmielini Tostini',
      glamName: 'Trzmielina Brokatina',
      czar: 25,
      behavior: 'fast',
      attack: 8,
      isBoss: false,
    });
    expect(grzybello).toMatchObject({
      name: 'Grzybello Kalafiorello',
      glamName: 'Grzybella Perłella',
      czar: 40,
      behavior: 'heavy',
      attack: 10,
      strongAttack: 22,
      strongEvery: 3,
      isBoss: false,
    });
    expect(kosiarrini).toMatchObject({
      name: 'Kosiarrini Chwastorrini',
      glamName: 'Kwiatorra, Królowa Łąki',
      czar: 120,
      behavior: 'boss',
      attack: 12,
      strongAttack: 24,
      strongEvery: 0,
      isBoss: true,
    });
    expect(kosiarrini?.phases?.map((p) => [p.czarFrom, p.vines, p.strongEvery])).toEqual([
      [120, 0, 0],
      [80, 2, 0],
      [40, 0, 2],
    ]);
  });

  it('okrzyki i podziękowania: niepuste, bez słów o przemocy', () => {
    for (const e of Object.values(ENEMIES)) {
      expect(e.land).toBe('meadow');
      expect(e.battleCry.length).toBeGreaterThan(0);
      expect(e.glamThanks.length).toBeGreaterThan(0);
      expect(e.glamName).not.toBe(e.name);
      expect(e.battleCry).not.toMatch(VIOLENT);
      expect(e.glamThanks).not.toMatch(VIOLENT);
      if (!e.isBoss) expect(e.phases).toBeUndefined();
    }
  });
});

describe('karty (GDD 13.5)', () => {
  const IDS = [
    'cios-plusika',
    'tarcza-z-lisci',
    'tarcza-dopelniaka',
    'podwojny-dziob',
    'koniczynowa-tarcza',
    'lepka-kokarda',
    'brokatowy-roj',
    'perlowy-zdroj',
    'krolewski-bukiet',
  ];
  const ATTACK_KINDS: CardKind[] = ['attack', 'strongAttack', 'multiHit', 'combo'];
  const ACTIONS: ActionKind[] = ['attack', 'strongAttack', 'defend', 'strongDefend'];

  it('stałe id i klucze = id', () => {
    expect(Object.keys(CARDS)).toEqual(IDS);
    for (const [k, c] of Object.entries(CARDS)) expect(c.id).toBe(k);
  });

  it('liczby zgodne z tabelą 13.5', () => {
    // [id, nazwa, rodzaj, koszt, siła, siła2, rzadkość, pula, źródło, id źródła]
    const rows = IDS.map((id) => {
      const c = CARDS[id];
      return [id, c?.name, c?.kind, c?.cost, c?.power, c?.power2, c?.rarity, c?.pool, c?.source, c?.sourceId];
    });
    expect(rows).toEqual([
      ['cios-plusika', 'Cios Plusika', 'attack', 1, 8, 0, 'common', 'attack', 'starter', 'plusik'],
      ['tarcza-z-lisci', 'Tarcza z liści', 'shield', 1, 8, 0, 'common', 'defend', 'starter', null],
      ['tarcza-dopelniaka', 'Tarcza Dopełniaka', 'shield', 1, 12, 0, 'common', 'defend', 'creature', 'dopelniak'],
      ['podwojny-dziob', 'Podwójny dziób', 'strongAttack', 2, 20, 0, 'uncommon', 'strongAttack', 'creature', 'blizniak'],
      ['koniczynowa-tarcza', 'Koniczynowa tarcza', 'bigShield', 1, 22, 0, 'rare', 'strongDefend', 'creature', 'koniczynek'],
      ['lepka-kokarda', 'Lepka kokarda', 'weaken', 1, 50, 0, 'uncommon', 'defend', 'glam', 'slimakorro'],
      ['brokatowy-roj', 'Brokatowy rój', 'multiHit', 1, 4, 3, 'uncommon', 'attack', 'glam', 'trzmielini'],
      ['perlowy-zdroj', 'Perłowy zdrój', 'heal', 1, 15, 0, 'uncommon', 'defend', 'glam', 'grzybello'],
      ['krolewski-bukiet', 'Królewski bukiet', 'combo', 2, 14, 10, 'legendary', 'strongAttack', 'glam', 'kosiarrini'],
    ]);
  });

  it('pola poprawne: źródło, portret, pula, opis', () => {
    for (const c of Object.values(CARDS)) {
      expect(c.name.length).toBeGreaterThan(0);
      expect([1, 2]).toContain(c.cost);
      expect(Number.isInteger(c.power) && c.power > 0).toBe(true);
      expect(Number.isInteger(c.power2) && c.power2 >= 0).toBe(true);
      // power2 tylko dla kilku ciosów (liczba ciosów) i ataku z tarczą (tarcza).
      expect(c.power2 > 0).toBe(c.kind === 'multiHit' || c.kind === 'combo');
      if (c.kind === 'weaken') expect(c.power).toBeLessThanOrEqual(100);
      expect(ACTIONS).toContain(c.pool);
      // Karty ataku losują zadania z puli ataku, pozostałe — z puli obrony.
      const attackPool = c.pool === 'attack' || c.pool === 'strongAttack';
      expect(attackPool).toBe(ATTACK_KINDS.includes(c.kind));
      // Źródło i portret.
      if (c.source === 'creature') {
        expect(CREATURES[c.sourceId ?? '']).toBeDefined();
        expect(c.art).toBe(`creature:${c.sourceId}`);
      } else if (c.source === 'glam') {
        expect(ENEMIES[c.sourceId ?? '']).toBeDefined();
        expect(c.art).toBe(`glam:${c.sourceId}`);
      } else {
        expect(c.sourceId === null || CREATURES[c.sourceId] !== undefined).toBe(true);
      }
      expect(c.art).toMatch(/^(creature|glam|prop):[a-z-]+$/);
      // Opis: jedno krótkie zdanie po polsku, bez ASCII minusa i „x” zamiast mnożenia.
      expect(oneSentence(c.description)).toBe(true);
      expect(c.description.length).toBeLessThanOrEqual(45);
      expect(c.description).not.toMatch(/\d\s*-\s*\d|\d\s*x\s*\d/);
      expect(`${c.name} ${c.description}`).not.toMatch(VIOLENT);
      // Liczby w opisie = siła karty (osłabienie opisane słownie: „o połowę”).
      if (c.kind === 'weaken') expect(c.description).toMatch(/połowę/);
      else expect(c.description).toContain(String(c.power));
      if (c.power2 > 0) expect(c.description).toContain(String(c.power2));
    }
    expect(CARDS['brokatowy-roj']?.description).toBe('3 ciosy po 4 Czaru.');
    expect(CARDS['krolewski-bukiet']?.description).toBe('14 Czaru i tarcza 10.');
    expect(CARDS['perlowy-zdroj']?.description).toBe('Ulecz 15 serduszek.');
    expect(CARDS['lepka-kokarda']?.description).toBe('Następny ruch brainrota słabszy o połowę.');
  });

  it('talia startowa: 5 × Cios Plusika + 3 × Tarcza z liści', () => {
    expect(CARD_GRANTS.starter).toEqual({ 'cios-plusika': 5, 'tarcza-z-lisci': 3 });
    for (const [id, n] of Object.entries(CARD_GRANTS.starter)) {
      expect(CARDS[id]?.source).toBe('starter');
      expect(Number.isInteger(n) && n > 0).toBe(true);
    }
  });

  it('każdy stworek ma kartę; karta istnieje i należy do stworka', () => {
    expect(Object.keys(CARD_GRANTS.creatures).sort()).toEqual(Object.keys(CREATURES).sort());
    for (const [creatureId, g] of Object.entries(CARD_GRANTS.creatures)) {
      const card = CARDS[g.cardId];
      expect(card).toBeDefined();
      expect(card?.sourceId).toBe(creatureId);
      expect(card?.source).not.toBe('glam');
      expect(Number.isInteger(g.onCatch) && g.onCatch >= 1).toBe(true);
      expect(Number.isInteger(g.onLevelUp) && g.onLevelUp >= 1).toBe(true);
    }
    expect(CARD_GRANTS.creatures).toEqual({
      plusik: { cardId: 'cios-plusika', onCatch: 1, onLevelUp: 1 },
      dopelniak: { cardId: 'tarcza-dopelniaka', onCatch: 2, onLevelUp: 1 },
      blizniak: { cardId: 'podwojny-dziob', onCatch: 2, onLevelUp: 1 },
      koniczynek: { cardId: 'koniczynowa-tarcza', onCatch: 1, onLevelUp: 1 },
    });
  });

  it('każdy brainrot ma kartę brainglama; karta istnieje i należy do niego', () => {
    expect(Object.keys(CARD_GRANTS.glams).sort()).toEqual(Object.keys(ENEMIES).sort());
    for (const [enemyId, cardId] of Object.entries(CARD_GRANTS.glams)) {
      const card = CARDS[cardId];
      expect(card).toBeDefined();
      expect(card?.source).toBe('glam');
      expect(card?.sourceId).toBe(enemyId);
      // Boss daje kartę legendarną, zwykłe brainroty — niezwykłe.
      expect(card?.rarity).toBe(ENEMIES[enemyId]?.isBoss === true ? 'legendary' : 'uncommon');
    }
  });

  it('każdą kartę da się zdobyć (start, stworek albo brainglam), każdą dokładnie z jednego stworka/brainrota', () => {
    const granted = [
      ...Object.keys(CARD_GRANTS.starter),
      ...Object.values(CARD_GRANTS.creatures).map((g) => g.cardId),
      ...Object.values(CARD_GRANTS.glams),
    ];
    expect([...new Set(granted)].sort()).toEqual(Object.keys(CARDS).sort());
    const owners = [...Object.values(CARD_GRANTS.creatures).map((g) => g.cardId), ...Object.values(CARD_GRANTS.glams)];
    expect(new Set(owners).size).toBe(owners.length);
  });
});

describe('sprzęt (GDD 13.4)', () => {
  it('stałe id, sloty i statystyki', () => {
    expect(Object.keys(ITEMS)).toEqual([
      'drewniany-miecz',
      'miecz-slonecznika',
      'kamizelka-z-lisci',
      'pancerz-liczydlo',
      'siatka-z-trawy',
      'siec-pajecza',
      'zlota-siec',
      'amulet-drugiej-szansy',
    ]);
    for (const [k, it] of Object.entries(ITEMS)) {
      expect(it.id).toBe(k);
      expect(it.land).toBe('meadow');
      expect(it.name.length).toBeGreaterThan(0);
      expect(oneSentence(it.description)).toBe(true);
    }
    const slot = (id: string) => ITEMS[id]?.slot;
    expect(['drewniany-miecz', 'miecz-slonecznika'].map(slot)).toEqual(['weapon', 'weapon']);
    expect(['kamizelka-z-lisci', 'pancerz-liczydlo'].map(slot)).toEqual(['armor', 'armor']);
    expect(['siatka-z-trawy', 'siec-pajecza', 'zlota-siec'].map(slot)).toEqual(['net', 'net', 'net']);
    expect(slot('amulet-drugiej-szansy')).toBe('amulet');
    expect(ITEMS['miecz-slonecznika']).toMatchObject({ attackBonus: 3, help: { kind: 'time', amount: 2, appliesTo: 'attack' } });
    expect(ITEMS['pancerz-liczydlo']).toMatchObject({ hpBonus: 20, help: { kind: 'numberLine', amount: 1, appliesTo: 'defense' } });
    expect(ITEMS['siec-pajecza']?.help).toEqual({ kind: 'extraCatchTry', amount: 1, appliesTo: 'catch' });
    expect(ITEMS['zlota-siec']).toMatchObject({ rarity: 'legendary', help: { kind: 'extraCatchTry', amount: 1, appliesTo: 'catch' } });
    expect(ITEMS['zlota-siec']?.description).toMatch(/oś/i);
    expect(ITEMS['amulet-drugiej-szansy']?.help).toEqual({ kind: 'retry', amount: 1, appliesTo: 'all' });
    for (const id of ['drewniany-miecz', 'kamizelka-z-lisci', 'siatka-z-trawy']) {
      expect(ITEMS[id]).toMatchObject({ attackBonus: 0, hpBonus: 0 });
      expect(ITEMS[id]?.help).toBeUndefined();
    }
  });

  it('pule: start / boss / skrzynie dzielą wszystkie przedmioty', () => {
    expect(STARTER_ITEMS).toEqual(['drewniany-miecz', 'kamizelka-z-lisci', 'siatka-z-trawy']);
    expect(BOSS_ITEMS_MEADOW).toEqual(['zlota-siec', 'amulet-drugiej-szansy']);
    expect(CHEST_ITEM_POOL_MEADOW).toEqual(['miecz-slonecznika', 'pancerz-liczydlo', 'siec-pajecza']);
    const all = [...STARTER_ITEMS, ...BOSS_ITEMS_MEADOW, ...CHEST_ITEM_POOL_MEADOW].sort();
    expect(all).toEqual(Object.keys(ITEMS).sort());
    expect(Object.keys(ITEM_SOURCE_MEADOW).sort()).toEqual(Object.keys(ITEMS).sort());
    for (const id of STARTER_ITEMS) expect(ITEM_SOURCE_MEADOW[id]).toBe('start');
    for (const id of BOSS_ITEMS_MEADOW) expect(ITEM_SOURCE_MEADOW[id]).toBe('boss');
    // Startowy zestaw obsadza broń, pancerz i sieć.
    expect(STARTER_ITEMS.map((id) => ITEMS[id]?.slot)).toEqual(['weapon', 'armor', 'net']);
  });
});

describe('krainy (GDD 4)', () => {
  it('5 krain, tylko Łąka w MVP', () => {
    const ids: LandId[] = ['meadow', 'cave', 'volcano', 'castle', 'ice'];
    expect(Object.keys(LANDS).sort()).toEqual([...ids].sort());
    expect(LAND_ORDER).toEqual(ids);
    expect(ids.map((id) => LANDS[id].name)).toEqual(['Łąka', 'Jaskinia', 'Wulkan', 'Zamek', 'Lodowa Kraina']);
    expect(ids.filter((id) => LANDS[id].inMvp)).toEqual(['meadow']);
    for (const id of ids) expect(LANDS[id].id).toBe(id);
    expect([LANDS.meadow.op, LANDS.cave.op, LANDS.castle.op, LANDS.ice.op]).toEqual(['add', 'sub', 'mul', 'div']);
  });
});
