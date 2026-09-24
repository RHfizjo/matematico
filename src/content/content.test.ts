import { describe, expect, it } from 'vitest';
import type { LandId } from '../core/types';
import {
  BOSS_ITEMS_MEADOW,
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
      attack: 15,
      isBoss: false,
    });
    expect(trzmielini).toMatchObject({
      name: 'Trzmielini Tostini',
      glamName: 'Trzmielina Brokatina',
      czar: 25,
      behavior: 'fast',
      attack: 12,
      isBoss: false,
    });
    expect(grzybello).toMatchObject({
      name: 'Grzybello Kalafiorello',
      glamName: 'Grzybella Perłella',
      czar: 40,
      behavior: 'heavy',
      attack: 15,
      strongAttack: 25,
      strongEvery: 3,
      isBoss: false,
    });
    expect(kosiarrini).toMatchObject({
      name: 'Kosiarrini Chwastorrini',
      glamName: 'Kwiatorra, Królowa Łąki',
      czar: 120,
      behavior: 'boss',
      attack: 15,
      strongAttack: 25,
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
