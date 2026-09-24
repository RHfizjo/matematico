import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ALL_CATEGORY_IDS } from '../math/categories';
import { defaultSettings, emptySkillModel, starterCards } from './defaults';
import { CARD_IDS, CATEGORY_IDS, STARTER_CARDS } from './ids';
import { deserializeSave, migrateSave, serializeSave } from './migrate';
import { SAVE_VERSION, createNewSave } from './save';
import { saveArb } from './testkit';
import { validateSave } from './validate';

describe('defaults', () => {
  it('defaultSettings zgodne z GDD 18.3', () => {
    expect(defaultSettings()).toEqual({
      range: 20,
      ops: { add: true, sub: true, mul: true, div: true },
      combatOps: 'themed',
      crossTenOnMeadow: true,
      timeLimit: { mode: 'none', fixedSec: { add: 10, sub: 10, mul: 12, div: 12 } },
      breakReminderMin: 0,
      quality: 'auto',
      audio: { music: 0.5, sfx: 0.8 },
      showFps: false,
    });
  });

  it('emptySkillModel', () => {
    expect(emptySkillModel()).toEqual({
      facts: {},
      categories: {},
      session: 0,
      taskCounter: 0,
      window: [],
      recent: [],
      retries: [],
      errorStreak: 0,
    });
  });

  it('każde wywołanie zwraca świeże obiekty', () => {
    const a = defaultSettings();
    a.ops.add = false;
    a.timeLimit.fixedSec.mul = 30;
    a.audio.music = 0;
    expect(defaultSettings()).toEqual(createNewSave(0, 0).settings);
    const m = emptySkillModel();
    m.window.push(true);
    expect(emptySkillModel().window).toEqual([]);
  });

  it('lista kategorii w save zgodna z core/math', () => {
    expect([...CATEGORY_IDS].sort()).toEqual([...ALL_CATEGORY_IDS].sort());
  });
});

describe('createNewSave', () => {
  const s = createNewSave(1_700_000_000_000, 42);

  it('pola startowe', () => {
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.version).toBe(1);
    expect(s.createdAt).toBe(1_700_000_000_000);
    expect(s.updatedAt).toBe(1_700_000_000_000);
    expect(s.seed).toBe(42);
    expect(s.profile).toEqual({ name: 'Bohater', color: '#3fa7ff' });
    expect(s.settings).toEqual(defaultSettings());
    expect(s.model).toEqual(emptySkillModel());
    expect(s.history).toEqual([]);
    expect(s.sessions).toEqual([]);
  });

  it('cyfry: 2× każda z 1–9 + 1× 0', () => {
    expect(s.inventory.digits).toEqual([1, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(s.inventory.digits.reduce((a, b) => a + b, 0)).toBe(19);
  });

  it('Plusik i sprzęt startowy', () => {
    expect(s.creatures).toEqual([{ id: 'plusik', level: 1, fedCycle: -1, caughtAt: 1_700_000_000_000 }]);
    expect(s.equipment.owned).toEqual([
      { id: 'drewniany-miecz', level: 1 },
      { id: 'kamizelka-z-lisci', level: 1 },
      { id: 'siatka-z-trawy', level: 1 },
    ]);
    expect(s.equipment.equipped).toEqual({
      weapon: 'drewniany-miecz',
      armor: 'kamizelka-z-lisci',
      net: 'siatka-z-trawy',
      amulet: null,
    });
  });

  it('postęp: Łąka otwarta, reszta zamknięta', () => {
    const p = s.progress;
    expect(p.cycle).toBe(0);
    expect(p.taskSinceReturn).toBe(false);
    expect(p.calibrated).toBe(false);
    expect(p.firstExpeditionDone).toBe(false);
    expect(Object.keys(p.lands)).toEqual(['meadow', 'cave', 'volcano', 'castle', 'ice']);
    for (const [id, l] of Object.entries(p.lands)) {
      expect(l).toEqual({ unlocked: id === 'meadow', stage: 1, bossDefeated: false, gatesOpened: 0, dungeonRuns: 0 });
    }
    expect(p.glams).toEqual({});
    expect(p.openedChests).toEqual([]);
    expect(p.chestPity).toBe(0);
    expect(p.dungeon).toEqual({ active: false, roomOrder: [], roomIndex: 0, enemyCzar: {}, bossPhase: 1, vines: 0, heroHp: null });
    expect(p.pendingBonusChest).toBe(false);
    expect(p.merchantDailyCycle).toBe(-1);
  });

  it('karty: talia startowa 5 × Cios Plusika + 3 × Tarcza z liści (GDD 13.5)', () => {
    expect(s.cards).toEqual({ owned: { 'cios-plusika': 5, 'tarcza-z-lisci': 3 } });
    expect(starterCards()).toEqual(s.cards);
    expect(Object.keys(STARTER_CARDS).every((id) => (CARD_IDS as readonly string[]).includes(id))).toBe(true);
  });

  it('kolejność pól zapisu jak w types.ts (karty po skarbcu)', () => {
    expect(Object.keys(s)).toEqual([
      'version',
      'createdAt',
      'updatedAt',
      'seed',
      'profile',
      'settings',
      'model',
      'inventory',
      'cards',
      'creatures',
      'equipment',
      'progress',
      'history',
      'sessions',
    ]);
  });

  it('dwa zapisy nie dzielą referencji', () => {
    const a = createNewSave(5, 1);
    const b = createNewSave(5, 1);
    a.inventory.digits[3] = 99;
    a.progress.lands.meadow.stage = 4;
    a.equipment.equipped.weapon = null;
    a.creatures.push({ id: 'blizniak', level: 1, fedCycle: -1, caughtAt: 5 });
    a.cards.owned['cios-plusika'] = 9;
    a.progress.dungeon.enemyCzar.x = 1;
    expect(b).toEqual(createNewSave(5, 1));
    const c = starterCards();
    c.owned['tarcza-z-lisci'] = 0;
    expect(starterCards().owned['tarcza-z-lisci']).toBe(3);
  });

  it('ziarno normalizowane do uint32, czas do ≥ 0', () => {
    expect(createNewSave(10, -1).seed).toBe(0xffffffff);
    expect(createNewSave(10, 3.9).seed).toBe(3);
    expect(createNewSave(NaN, NaN)).toEqual(createNewSave(0, 0));
    expect(createNewSave(-5, 0).createdAt).toBe(0);
  });

  it('jest poprawnym zapisem', () => {
    expect(validateSave(s)).toEqual([]);
  });
});

describe('round-trip i JSON', () => {
  it('createNewSave → serialize → deserialize bez zmian (property)', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), fc.double(), (now, seed) => {
        const s = createNewSave(now, seed);
        const back = deserializeSave(serializeSave(s));
        expect(back).toEqual(s);
        expect(serializeSave(back)).toBe(serializeSave(s));
      }),
    );
  });

  it('tylko JSON: JSON.parse(JSON.stringify(save)) ≡ save (nowy i dowolny poprawny)', { timeout: 60_000 }, () => {
    const fresh = createNewSave(123, 456);
    expect(JSON.parse(JSON.stringify(fresh))).toStrictEqual(fresh);
    fc.assert(
      fc.property(saveArb, (s) => {
        expect(JSON.parse(JSON.stringify(s))).toStrictEqual(s);
        const m = migrateSave(s);
        expect(JSON.parse(JSON.stringify(m))).toStrictEqual(m);
      }),
      { numRuns: 200 },
    );
  });

  it('dowolny poprawny zapis przechodzi round-trip bez zmian', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(saveArb, (s) => {
        expect(validateSave(s)).toEqual([]);
        expect(migrateSave(s)).toEqual(s);
        expect(deserializeSave(serializeSave(s))).toEqual(s);
      }),
      { numRuns: 200 },
    );
  });
});
