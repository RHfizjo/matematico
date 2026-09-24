import { describe, expect, it } from 'vitest';
import type { CreatureDef, EquipSlot, ItemDef, OwnedCreature, OwnedItem } from '../types';
import { computeHeroStats, helpsFor, itemLevel, unlockedActions, unlockedOperators } from './hero';

// Kopie danych z content/ (core nie importuje content/).
const item = (id: string, slot: EquipSlot, over: Partial<ItemDef> = {}): ItemDef => ({
  id,
  name: id,
  slot,
  land: 'meadow',
  rarity: 'common',
  attackBonus: 0,
  hpBonus: 0,
  description: '',
  ...over,
});
const ITEMS: Record<string, ItemDef> = {
  'drewniany-miecz': item('drewniany-miecz', 'weapon'),
  'miecz-slonecznika': item('miecz-slonecznika', 'weapon', {
    attackBonus: 3,
    help: { kind: 'time', amount: 2, appliesTo: 'attack' },
  }),
  'kamizelka-z-lisci': item('kamizelka-z-lisci', 'armor'),
  'pancerz-liczydlo': item('pancerz-liczydlo', 'armor', {
    hpBonus: 20,
    help: { kind: 'numberLine', amount: 1, appliesTo: 'defense' },
  }),
  'siatka-z-trawy': item('siatka-z-trawy', 'net'),
  'siec-pajecza': item('siec-pajecza', 'net', { help: { kind: 'extraCatchTry', amount: 1, appliesTo: 'catch' } }),
  'zlota-siec': item('zlota-siec', 'net', {
    rarity: 'legendary',
    help: { kind: 'extraCatchTry', amount: 1, appliesTo: 'catch' },
  }),
  'amulet-drugiej-szansy': item('amulet-drugiej-szansy', 'amulet', {
    help: { kind: 'retry', amount: 1, appliesTo: 'all' },
  }),
};

const creature = (id: string, over: Partial<CreatureDef> = {}): CreatureDef => ({
  id,
  name: id,
  land: 'meadow',
  rarity: 'common',
  categories: ['add.within10'],
  catchFormat: 'choice',
  catchRule: { need: 2, of: 3 },
  production: 'small',
  description: '',
  ...over,
});
const DEFS: Record<string, CreatureDef> = {
  plusik: creature('plusik', { unlocksAction: 'attack', unlocksOperator: '+' }),
  dopelniak: creature('dopelniak', { boostsDefense: 'defend', production: 'pairs10' }),
  blizniak: creature('blizniak', { unlocksAction: 'strongAttack', unlocksOperator: '×', production: 'twins' }),
  koniczynek: creature('koniczynek', { boostsDefense: 'strongDefend', shield: true, production: 'rare' }),
};

const own = (...ids: string[]): OwnedCreature[] => ids.map((id) => ({ id, level: 1, fedCycle: -1, caughtAt: 0 }));

const STARTER: Record<EquipSlot, string | null> = {
  weapon: 'drewniany-miecz',
  armor: 'kamizelka-z-lisci',
  net: 'siatka-z-trawy',
  amulet: null,
};
const STARTER_OWNED: OwnedItem[] = [
  { id: 'drewniany-miecz', level: 1 },
  { id: 'kamizelka-z-lisci', level: 1 },
  { id: 'siatka-z-trawy', level: 1 },
];

const eq = (equipped: Partial<Record<EquipSlot, string | null>>, owned: OwnedItem[] = []) => ({
  equipped: { ...STARTER, ...equipped },
  owned: [...STARTER_OWNED, ...owned],
  items: ITEMS,
});

describe('computeHeroStats', () => {
  it('bohater startowy: 100 HP, bez premii', () => {
    expect(computeHeroStats({ ...eq({}), creatures: own('plusik'), creatureDefs: DEFS })).toEqual({
      maxHp: 100,
      attackBonus: 0,
      defenseBoost: { defend: 0, strongDefend: 0 },
      shieldCharges: 0,
    });
  });

  it('sprzęt: miecz +3 atak, pancerz +20 HP (statystyki nie rosną z poziomem)', () => {
    const args = eq({ weapon: 'miecz-slonecznika', armor: 'pancerz-liczydlo' }, [
      { id: 'miecz-slonecznika', level: 3 },
      { id: 'pancerz-liczydlo', level: 2 },
    ]);
    const s = computeHeroStats({ ...args, creatures: [], creatureDefs: DEFS });
    expect(s.maxHp).toBe(120);
    expect(s.attackBonus).toBe(3);
  });

  it('stworki: +20% bloku bez sumowania, tarcza Koniczynka', () => {
    const s = computeHeroStats({
      ...eq({}),
      creatures: [...own('plusik', 'dopelniak', 'dopelniak', 'koniczynek'), { id: 'nieznany', level: 1, fedCycle: -1, caughtAt: 0 }],
      creatureDefs: DEFS,
    });
    expect(s.defenseBoost).toEqual({ defend: 0.2, strongDefend: 0.2 });
    expect(s.shieldCharges).toBe(1);
  });

  it('pomija nieznane przedmioty i przedmioty w złym slocie', () => {
    const s = computeHeroStats({
      ...eq({ weapon: 'pancerz-liczydlo', armor: 'nie-ma-takiego' }),
      creatures: [],
      creatureDefs: DEFS,
    });
    expect(s.maxHp).toBe(100);
    expect(s.attackBonus).toBe(0);
  });
});

describe('helpsFor', () => {
  it('bez pomocy na starcie', () => {
    for (const ctx of ['attack', 'defense', 'catch'] as const) {
      expect(helpsFor(eq({}), ctx)).toEqual({ timeBonusSec: 0, numberLineUses: 0, retryUses: 0, extraCatchTries: 0 });
    }
  });

  it('Miecz Słonecznika: +2 s przy ataku na poz. 1, +1 s za każdy kolejny poziom', () => {
    const at = (level: number) =>
      helpsFor(eq({ weapon: 'miecz-slonecznika' }, [{ id: 'miecz-slonecznika', level }]), 'attack').timeBonusSec;
    expect([at(1), at(2), at(3)]).toEqual([2, 3, 4]);
    expect(helpsFor(eq({ weapon: 'miecz-slonecznika' }, [{ id: 'miecz-slonecznika', level: 3 }]), 'defense').timeBonusSec).toBe(0);
  });

  it('Pancerz Liczydło: OŚ przy obronie, rośnie z poziomem', () => {
    const args = eq({ armor: 'pancerz-liczydlo' }, [{ id: 'pancerz-liczydlo', level: 2 }]);
    expect(helpsFor(args, 'defense').numberLineUses).toBe(2);
    expect(helpsFor(args, 'attack').numberLineUses).toBe(0);
  });

  it('Amulet: POPRAWKA wszędzie (appliesTo all)', () => {
    const args = eq({ amulet: 'amulet-drugiej-szansy' }, [{ id: 'amulet-drugiej-szansy', level: 1 }]);
    for (const ctx of ['attack', 'defense', 'catch'] as const) expect(helpsFor(args, ctx).retryUses).toBe(1);
  });

  it('sieci: dodatkowe próby tylko przy łapaniu', () => {
    const paj = eq({ net: 'siec-pajecza' }, [{ id: 'siec-pajecza', level: 3 }]);
    expect(helpsFor(paj, 'catch').extraCatchTries).toBe(3);
    expect(helpsFor(paj, 'attack').extraCatchTries).toBe(0);
    const zlota = eq({ net: 'zlota-siec' }, [{ id: 'zlota-siec', level: 1 }]);
    expect(helpsFor(zlota, 'catch').extraCatchTries).toBe(1);
  });

  it('poziom przycięty do 1..3; brak w owned = poziom 1', () => {
    expect([itemLevel(0), itemLevel(1), itemLevel(2.7), itemLevel(9), itemLevel(Number.NaN), itemLevel(undefined)]).toEqual([
      1, 1, 2, 3, 1, 1,
    ]);
    const notOwned = { equipped: { ...STARTER, weapon: 'miecz-slonecznika' }, owned: [], items: ITEMS };
    expect(helpsFor(notOwned, 'attack').timeBonusSec).toBe(2);
    const tooHigh = eq({ weapon: 'miecz-slonecznika' }, [{ id: 'miecz-slonecznika', level: 99 }]);
    expect(helpsFor(tooHigh, 'attack').timeBonusSec).toBe(4);
  });
});

describe('odblokowania', () => {
  it('akcje: atak zawsze, atak mocny od Bliźniaka', () => {
    expect(unlockedActions([], DEFS)).toEqual(['attack']);
    expect(unlockedActions(own('plusik', 'dopelniak'), DEFS)).toEqual(['attack']);
    expect(unlockedActions(own('blizniak'), DEFS)).toEqual(['attack', 'strongAttack']);
    expect(unlockedActions(own('blizniak', 'plusik', 'blizniak', 'koniczynek'), DEFS)).toEqual(['attack', 'strongAttack']);
  });

  it('działania bramy: + zawsze, × od Bliźniaka, w stałej kolejności', () => {
    expect(unlockedOperators([], DEFS)).toEqual(['+']);
    expect(unlockedOperators(own('blizniak', 'plusik'), DEFS)).toEqual(['+', '×']);
    expect(unlockedOperators(own('nieznany'), DEFS)).toEqual(['+']);
  });
});
