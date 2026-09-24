import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SaveV1 } from '../types';
import { generateTask } from '../math/generators';
import { createRng } from '../rng';
import { defaultSettings } from './defaults';
import { HISTORY_LIMIT } from './history';
import { SaveError, deserializeSave, migrateSave, serializeSave } from './migrate';
import { createNewSave } from './save';
import { allPaths, applyMutation, categoryArb, deepFreeze, factIdArb, mutationArb, saveArb } from './testkit';
import type { Path } from './testkit';
import { validateSave } from './validate';

const NOW = 1_700_000_000_000;
const fresh = (): SaveV1 => createNewSave(NOW, 42);
/** Kopia JSON jako luźny obiekt do psucia w testach. */
const loose = (s: unknown): Record<string, any> => JSON.parse(JSON.stringify(s)) as Record<string, any>;

function expectSaveError(raw: unknown, code?: string): SaveError {
  let err: unknown = null;
  try {
    migrateSave(raw);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(SaveError);
  const se = err as SaveError;
  expect(se.name).toBe('SaveError');
  expect(se.message.length).toBeGreaterThan(0);
  if (code) expect(se.code).toBe(code);
  return se;
}

describe('migrateSave: odrzucanie', () => {
  it('nie-obiekty', () => {
    for (const raw of [null, undefined, [], [fresh()], 'zapis', '', 0, 1, NaN, true, Symbol('x'), () => 1]) {
      expectSaveError(raw, 'notObject');
    }
  });

  it('nowsza wersja → komunikat po polsku', () => {
    for (const version of [2, 3, 999]) {
      const se = expectSaveError({ ...fresh(), version }, 'newerVersion');
      expect(se.message).toContain('Zapis pochodzi z nowszej wersji gry');
    }
  });

  it('nieznana wersja', () => {
    for (const version of ['1', 1.5, -1, null, NaN, Infinity, {}, [1], true]) {
      expectSaveError({ ...fresh(), version }, 'unknownVersion');
    }
  });

  it('obiekt bez wersji i bez pól zapisu to nie zapis gry', () => {
    expectSaveError({}, 'notSave');
    expectSaveError({ foo: 1, bar: [2] }, 'notSave');
  });

  it('deserializeSave: zły JSON i BOM', () => {
    for (const bad of ['', '{', 'nie json', '{"version":1,}', 'undefined']) {
      let err: unknown = null;
      try {
        deserializeSave(bad);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(SaveError);
      expect((err as SaveError).code).toBe('badJson');
    }
    expect(() => deserializeSave('null')).toThrow(SaveError);
    expect(() => deserializeSave('[1,2]')).toThrow(SaveError);
    expect(() => deserializeSave('"tekst"')).toThrow(SaveError);
    expect(() => deserializeSave(JSON.stringify({ ...fresh(), version: 2 }))).toThrow(/nowszej wersji/);
    expect(deserializeSave('﻿' + serializeSave(fresh()))).toEqual(fresh());
  });
});

describe('migrateSave: naprawa', () => {
  it('{ version: 1 } → pełny zapis domyślny', () => {
    expect(migrateSave({ version: 1 })).toEqual(createNewSave(0, 0));
  });

  it('usunięcie dowolnego pola świeżego zapisu → odtworzenie wartości domyślnej', () => {
    const base = fresh();
    for (const path of allPaths(base)) {
      if (path.length === 0) continue;
      const key = path[path.length - 1];
      if (path.join('.') === 'seed' || key === 'id' || typeof key === 'number') continue;
      const broken = applyMutation(base, path, { kind: 'delete' });
      expect(migrateSave(broken), `ścieżka ${path.join('.')}`).toEqual(base);
    }
  });

  it('brak ziarna → wyprowadzone z createdAt; brak createdAt → z updatedAt', () => {
    const a = loose(fresh());
    delete a.seed;
    expect(migrateSave(a).seed).toBe(NOW >>> 0);
    const b = loose(fresh());
    delete b.createdAt;
    b.updatedAt = 5000;
    const m = migrateSave(b);
    expect(m.createdAt).toBe(5000);
    expect(m.updatedAt).toBe(5000);
  });

  it('nieznane pola są pomijane', () => {
    const raw = loose(fresh());
    raw.cheat = true;
    raw.settings.turbo = 1;
    raw.progress.lands.meadow.extra = 'x';
    raw.progress.lands.atlantis = { unlocked: true };
    raw.creatures[0].shiny = true;
    raw.model.facts['add:2+3'] = { m: 0.7, n: 3, nOk: 2, junk: 1 };
    expect(validateSave(raw).length).toBeGreaterThan(0);
    const m = migrateSave(raw);
    expect(validateSave(m)).toEqual([]);
    expect(m).not.toHaveProperty('cheat');
    expect(m.settings).not.toHaveProperty('turbo');
    expect(m.progress.lands).not.toHaveProperty('atlantis');
    expect(m.progress.lands.meadow).not.toHaveProperty('extra');
    expect(m.creatures[0]).not.toHaveProperty('shiny');
    expect(m.model.facts['add:2+3']).toEqual({
      m: 0.7,
      lt: null,
      n: 3,
      nOk: 2,
      box: 0,
      lastSeenAt: 0,
      lastSeenSession: 0,
      helped: 0,
      last2: [],
    });
  });

  it('przycina ewidentnie złe wartości', () => {
    const raw = loose(fresh());
    raw.createdAt = -5;
    raw.updatedAt = Infinity;
    raw.seed = -1;
    raw.profile = { name: '   ', color: 'red' };
    raw.settings.range = 50;
    raw.settings.ops = { add: false, sub: false, mul: false, div: false };
    raw.settings.combatOps = 'some';
    raw.settings.timeLimit = { mode: 'strict', fixedSec: { add: 0, sub: 1000, mul: 'x', div: 7.5 } };
    raw.settings.breakReminderMin = 17;
    raw.settings.quality = 'ultra';
    raw.settings.audio = { music: 5, sfx: -1 };
    raw.inventory.digits = [-3, 2.7, 1e9, 'x', null, 4, 4, 4, 4, 4, 9, 9];
    raw.creatures = [
      { id: 'plusik', level: 9, fedCycle: 99, caughtAt: -1 },
      { id: 'nieznany', level: 1 },
      { id: 'plusik', level: 2, fedCycle: 0, caughtAt: 5 },
      { id: 'blizniak', level: 0, fedCycle: -7 },
      'śmieć',
    ];
    raw.equipment = {
      owned: [
        { id: 'drewniany-miecz', level: 7 },
        { id: 'drewniany-miecz', level: 2 },
        { id: 'miecz-z-kosmosu', level: 1 },
        { id: 'zlota-siec', level: 0.5 },
      ],
      equipped: { weapon: 'miecz-slonecznika', armor: 'zlota-siec', net: 'zlota-siec', amulet: 42 },
    };
    raw.progress.cycle = 3;
    raw.progress.lands.meadow = { unlocked: false, stage: 7, bossDefeated: 'tak', gatesOpened: -2, dungeonRuns: 1.9 };
    raw.progress.lands.cave.stage = 0;
    raw.progress.glams = { slimakorro: { enemyId: 'inny', count: 0, firstAt: 10 }, zzz: { count: 1 } };
    raw.progress.openedChests = ['a', 'a', '', 5, 'b'];
    raw.progress.dungeon = { active: true, roomOrder: ['entry', 3, 'boss'], roomIndex: 9, enemyCzar: { entry: -4, boss: 'x' }, bossPhase: 0 };
    raw.model = {
      facts: { 'mul:7x8': { m: 1.7, n: 3, nOk: 10, helped: 5, box: 9, last2: [true, 1, false, true] }, 'zły klucz': { m: 0.5 } },
      categories: { 'mul.t7': { recentMs: [100, -5, 'x', 200], n: -1, nOk: 1, m: -1, prior: 2 }, 'mul.t11': { n: 1 } },
      session: -3,
      taskCounter: 2.5,
      window: [true, false, true, true, true, true, true, true, false, false, 'x'],
      recent: [{ factId: 'zły', categoryId: 'add.within10' }, { factId: 'add:1+1', categoryId: 'nope' }],
      retries: [{ factId: 'add:8+7', categoryId: 'add.cross10', dueAtTask: -3 }, { factId: 5, categoryId: 'add.cross10' }],
      errorStreak: NaN,
    };
    raw.sessions = [{ start: 100, end: 50, tasks: 3, correct: 9 }, { start: 'x' }];

    const m = migrateSave(raw);
    expect(validateSave(m)).toEqual([]);
    expect(m.createdAt).toBe(0);
    expect(m.updatedAt).toBe(0);
    expect(m.seed).toBe(0xffffffff);
    expect(m.profile).toEqual({ name: 'Bohater', color: '#3fa7ff' });
    expect(m.settings.range).toBe(20);
    expect(m.settings.ops).toEqual({ add: true, sub: false, mul: false, div: false });
    expect(m.settings.combatOps).toBe('themed');
    expect(m.settings.timeLimit).toEqual({ mode: 'none', fixedSec: { add: 3, sub: 60, mul: 12, div: 7.5 } });
    expect(m.settings.breakReminderMin).toBe(0);
    expect(m.settings.quality).toBe('auto');
    expect(m.settings.audio).toEqual({ music: 1, sfx: 0 });
    expect(m.inventory.digits).toEqual([0, 2, 9999, 0, 0, 4, 4, 4, 4, 4]);
    expect(m.creatures).toEqual([
      { id: 'plusik', level: 3, fedCycle: 3, caughtAt: 0 },
      { id: 'blizniak', level: 1, fedCycle: -1, caughtAt: 0 },
    ]);
    expect(m.equipment.owned).toEqual([
      { id: 'drewniany-miecz', level: 3 },
      { id: 'zlota-siec', level: 1 },
    ]);
    // Broń nieposiadana → starter; pancerz z innego slotu → brak (starter nieposiadany).
    expect(m.equipment.equipped).toEqual({ weapon: 'drewniany-miecz', armor: null, net: 'zlota-siec', amulet: null });
    expect(m.progress.lands.meadow).toEqual({ unlocked: true, stage: 4, bossDefeated: false, gatesOpened: 0, dungeonRuns: 1 });
    expect(m.progress.lands.cave.stage).toBe(1);
    expect(m.progress.glams).toEqual({ slimakorro: { enemyId: 'slimakorro', count: 1, firstAt: 10 } });
    expect(m.progress.openedChests).toEqual(['a', 'b']);
    expect(m.progress.dungeon).toEqual({ active: true, roomOrder: ['entry', 'boss'], roomIndex: 2, enemyCzar: { entry: 0 }, bossPhase: 1 });
    expect(m.model.facts).toEqual({
      'mul:7x8': { m: 1, lt: null, n: 3, nOk: 3, box: 5, lastSeenAt: 0, lastSeenSession: 0, helped: 3, last2: [false, true] },
    });
    expect(m.model.categories).toEqual({ 'mul.t7': { recentMs: [100, 0, 200], n: 0, nOk: 0, m: 0, prior: 1 } });
    expect(m.model.session).toBe(0);
    expect(m.model.taskCounter).toBe(2);
    expect(m.model.window).toEqual([true, true, true, true, true, true, false, false]);
    expect(m.model.recent).toEqual([{ factId: null, categoryId: 'add.within10' }]);
    expect(m.model.retries).toEqual([{ factId: 'add:8+7', categoryId: 'add.cross10', dueAtTask: 0, session: 0 }]);
    expect(m.model.errorStreak).toBe(0);
    expect(m.sessions).toEqual([{ start: 100, end: 100, tasks: 3, correct: 3 }]);
  });

  it('cyfry: brak skarbca → startowe; krótka tablica dopełniona zerami', () => {
    const a = loose(fresh());
    a.inventory = 'zgubione';
    expect(migrateSave(a).inventory.digits).toEqual([1, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    const b = loose(fresh());
    b.inventory.digits = [5, 6];
    expect(migrateSave(b).inventory.digits).toEqual([5, 6, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('jawne null w slocie zostaje (zdjęty sprzęt)', () => {
    const raw = loose(fresh());
    raw.equipment.equipped.weapon = null;
    expect(migrateSave(raw).equipment.equipped.weapon).toBeNull();
  });

  it('historia: złe wpisy odrzucone, fakt/rodzaj błędu zerowane, limit 2000', () => {
    const raw = loose(fresh());
    const ok = { f: 'add:2+2', c: 'add.within10', ok: true, to: false, ms: 900, h: false, md: 'combat', ek: null, t: 1 };
    raw.history = [
      ok,
      { ...ok, c: 'zła' },
      { ...ok, md: 'dance' },
      { ...ok, ms: NaN },
      { ...ok, f: 'zły', ek: 'nope', to: 'x', h: 1 },
      null,
    ];
    expect(migrateSave(raw).history).toEqual([ok, { ...ok, f: null, ek: null, to: false, h: false }]);

    raw.history = Array.from({ length: HISTORY_LIMIT + 50 }, (_, i) => ({ ...ok, t: i }));
    const h = migrateSave(raw).history;
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(h[0]?.t).toBe(50);
    expect(h[h.length - 1]?.t).toBe(HISTORY_LIMIT + 49);
  });

  it('−0 zamieniane na 0', () => {
    const raw = JSON.parse(
      '{"version":1,"createdAt":-0,"model":{"facts":{"add:1+1":{"m":-0,"lt":-0,"n":-0}}},"settings":{"breakReminderMin":-0}}',
    ) as unknown;
    const m = migrateSave(raw);
    expect(validateSave(m)).toEqual([]);
    expect(Object.is(m.createdAt, 0)).toBe(true);
    expect(Object.is(m.model.facts['add:1+1']?.lt, 0)).toBe(true);
    expect(Object.is(m.settings.breakReminderMin, 0)).toBe(true);
  });

  it('klucze __proto__ nie zatruwają prototypów', () => {
    const raw = JSON.parse(
      '{"version":1,"__proto__":{"polluted":1},"model":{"facts":{"__proto__":{"m":1}}},"progress":{"glams":{"__proto__":{"count":1}},"dungeon":{"enemyCzar":{"__proto__":5}}}}',
    ) as unknown;
    const m = migrateSave(raw);
    expect(validateSave(m)).toEqual([]);
    expect(Object.getPrototypeOf(m.model.facts)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(m.progress.glams)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(m.progress.dungeon.enemyCzar)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(m).not.toHaveProperty('polluted');
  });

  it('nie zmienia wejścia i nie współdzieli z nim referencji', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(saveArb, (s) => {
        const input = deepFreeze(loose(s));
        const m = migrateSave(input);
        expect(m).toEqual(s);
        m.inventory.digits[0] = 12345;
        m.progress.dungeon.roomOrder.push('x');
        m.model.window.push(true);
        expect(input).toEqual(loose(s));
      }),
      { numRuns: 50 },
    );
  });
});

describe('migrateSave: zapis sprzed v1 (bez version)', () => {
  it('kształt z GDD 19 migrowany best-effort', () => {
    const legacy = {
      createdAt: 1000,
      updatedAt: 2000,
      profile: { name: 'Ola', avatarColors: ['#ff0000', '#00ff00'] },
      settings: { range: 100, ops: { add: true, sub: true, mul: false, div: false }, breakReminder: 15, quality: 'low' },
      model: {
        facts: [
          ['add:8+7', { m: 0.6, lt: 7.2, n: 4, nOk: 3, box: 2, lastSeenAt: 1500, lastSeenSession: 2, helped: 0, last2: [true, true] }],
          ['zły', {}],
        ],
        categories: [['add.cross10', { recentMs: [2000], n: 4, nOk: 3, m: 0.6, prior: 0.4 }]],
      },
      inventory: { digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      creatures: [{ id: 'plusik', level: 2, fedCycle: 1 }],
      equipment: { owned: [{ id: 'drewniany-miecz', level: 2 }], equipped: { weapon: 'drewniany-miecz', armor: null, net: null, amulet: null } },
      progress: { lands: { meadow: { stage: 2, bossDefeated: false, gatesOpened: 3 } }, cycle: 4 },
      history: [
        { factId: 'add:8+7', categoryId: 'add.cross10', ok: true, ms: 2100, helped: false, mode: 'combat', t: 1500 },
        { factId: 'add:8+7', ok: false, ms: 3000, helped: true, mode: 'catch', t: 1600 },
      ],
    };
    const m = migrateSave(legacy);
    expect(validateSave(m)).toEqual([]);
    expect(m.version).toBe(1);
    expect(m.createdAt).toBe(1000);
    expect(m.seed).toBe(1000);
    expect(m.profile).toEqual({ name: 'Ola', color: '#ff0000' });
    expect(m.settings.range).toBe(100);
    expect(m.settings.ops).toEqual({ add: true, sub: true, mul: false, div: false });
    expect(m.settings.breakReminderMin).toBe(15);
    expect(m.settings.quality).toBe('low');
    expect(Object.keys(m.model.facts)).toEqual(['add:8+7']);
    expect(m.model.facts['add:8+7']?.box).toBe(2);
    expect(m.model.categories['add.cross10']?.prior).toBe(0.4);
    expect(m.inventory.digits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(m.creatures).toEqual([{ id: 'plusik', level: 2, fedCycle: 1, caughtAt: 1000 }]);
    expect(m.equipment.equipped.weapon).toBe('drewniany-miecz');
    expect(m.progress.cycle).toBe(4);
    expect(m.progress.lands.meadow).toEqual({ unlocked: true, stage: 2, bossDefeated: false, gatesOpened: 3, dungeonRuns: 0 });
    expect(m.progress.lands.cave.unlocked).toBe(false);
    // Kto już grał, nie przechodzi ponownie kalibracji.
    expect(m.progress.calibrated).toBe(true);
    expect(m.progress.firstExpeditionDone).toBe(true);
    // Wpis bez kategorii nie da się odtworzyć bez core/math — pominięty.
    expect(m.history).toEqual([
      { f: 'add:8+7', c: 'add.cross10', ok: true, to: false, ms: 2100, h: false, md: 'combat', ek: null, t: 1500 },
    ]);
  });

  it('version 0 traktowane jak legacy; pusty legacy bez gry → niekalibrowany', () => {
    const m = migrateSave({ version: 0, settings: {} });
    expect(m).toEqual(createNewSave(0, 0));
  });

  it('usunięcie pola version z poprawnego zapisu nadal daje poprawny zapis', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(saveArb, (s) => {
        const raw = loose(s);
        delete raw.version;
        const m = migrateSave(raw);
        expect(validateSave(m)).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });
});

describe('migrateSave: fuzz (fast-check)', () => {
  const touchesVersion = (path: Path): boolean => path.length === 0 || (path.length === 1 && path[0] === 'version');

  it('mutacje poprawnego zapisu: tylko SaveError i zawsze poprawny wynik', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(saveArb, fc.nat(), mutationArb, (s, pick, mutation) => {
        const paths = allPaths(s);
        const path = paths[pick % paths.length] as Path;
        const raw = applyMutation(s, path, mutation);
        let out: SaveV1;
        try {
          out = migrateSave(raw);
        } catch (e) {
          expect(e).toBeInstanceOf(SaveError);
          // Rzucać wolno tylko przy zepsutym korzeniu lub wersji.
          expect(touchesVersion(path) && mutation.kind !== 'addKey').toBe(true);
          return;
        }
        expect(validateSave(out)).toEqual([]);
        expect(migrateSave(out)).toEqual(out);
        expect(JSON.parse(JSON.stringify(out))).toStrictEqual(out);
      }),
      { numRuns: 1500 },
    );
  });

  it('wielokrotne mutacje naraz', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(saveArb, fc.array(fc.tuple(fc.nat(), mutationArb), { minLength: 2, maxLength: 12 }), (s, muts) => {
        let raw: unknown = s;
        let risky = false;
        for (const [pick, mutation] of muts) {
          if (typeof raw !== 'object' || raw === null) break;
          const paths = allPaths(raw).filter((p) => p.length > 0);
          const path = paths[pick % Math.max(1, paths.length)];
          if (!path) break;
          if (path.length === 1 && path[0] === 'version') risky = true;
          raw = applyMutation(raw, path, mutation);
        }
        try {
          const out = migrateSave(raw);
          expect(validateSave(out)).toEqual([]);
          expect(migrateSave(out)).toEqual(out);
        } catch (e) {
          expect(e).toBeInstanceOf(SaveError);
          expect(risky || typeof raw !== 'object' || raw === null || Array.isArray(raw)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('dowolne wartości: tylko SaveError albo poprawny zapis', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        try {
          expect(validateSave(migrateSave(raw))).toEqual([]);
        } catch (e) {
          expect(e).toBeInstanceOf(SaveError);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('losowe wartości pod znanymi kluczami (version 1) nigdy nie rzucają', { timeout: 60_000 }, () => {
    const key = fc.constantFrom(
      'createdAt',
      'updatedAt',
      'seed',
      'profile',
      'settings',
      'model',
      'inventory',
      'creatures',
      'equipment',
      'progress',
      'history',
      'sessions',
    );
    fc.assert(
      fc.property(fc.dictionary(key, fc.anything({ maxDepth: 3 }), { noNullPrototype: true }), (rest) => {
        const out = migrateSave({ ...rest, version: 1 });
        expect(validateSave(out)).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it('deserializeSave na losowym tekście: tylko SaveError', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json()), (text) => {
        try {
          expect(validateSave(deserializeSave(text))).toEqual([]);
        } catch (e) {
          expect(e).toBeInstanceOf(SaveError);
        }
      }),
      { numRuns: 300 },
    );
  });
});


describe('migrateSave: regresje z przeglądu', () => {
  const ALL_OPS_100 = { ...defaultSettings(), range: 100 as const };
  const emptyFact = { m: 0.5, lt: null, n: 0, nOk: 0, box: 0, lastSeenAt: 0, lastSeenSession: 0, helped: 0, last2: [] };

  it('fakty, których core/math nie rozbierze, nie przechodzą migracji', () => {
    const bad = ['sub:3-5', 'div:7:2', 'div:5:0', 'cmp10:11', 'add:01+2'];
    const raw = loose(fresh());
    for (const f of bad) raw.model.facts[f] = emptyFact;
    raw.model.facts['add:2+3'] = emptyFact;
    raw.model.recent = bad.map((f) => ({ factId: f, categoryId: 'add.within10' }));
    raw.history = bad.map((f) => ({ f, c: 'add.within10', ok: true, to: false, ms: 1, h: false, md: 'combat', ek: null, t: 1 }));
    const m = migrateSave(raw);
    expect(Object.keys(m.model.facts)).toEqual(['add:2+3']);
    expect(m.model.recent.every((r) => r.factId === null)).toBe(true);
    expect(m.history.every((h) => h.f === null)).toBe(true);
  });

  it('powtórka z faktem spoza kategorii jest usuwana (generateTask by rzucił)', () => {
    const raw = loose(fresh());
    raw.model.retries = [
      { factId: 'add:2+3', categoryId: 'mul.t7', dueAtTask: 1, session: 0 },
      { factId: 'div:7:0', categoryId: 'div.by2', dueAtTask: 1, session: 0 },
      { factId: 'mul:7x8', categoryId: 'mul.t8', dueAtTask: 2, session: 0 },
    ];
    const m = migrateSave(raw);
    expect(m.model.retries).toEqual([{ factId: 'mul:7x8', categoryId: 'mul.t8', dueAtTask: 2, session: 0 }]);
  });

  it('property: każda powtórka po migracji daje się wygenerować', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ factId: factIdArb, categoryId: categoryArb, dueAtTask: fc.nat(50), session: fc.nat(5) }), {
          maxLength: 8,
        }),
        (retries) => {
          const raw = loose(fresh());
          raw.model.retries = retries;
          for (const r of migrateSave(raw).model.retries) {
            expect(() =>
              generateTask({
                categoryId: r.categoryId,
                factId: r.factId,
                rng: createRng(1),
                settings: ALL_OPS_100,
                format: 'choice',
                id: 't',
              }),
            ).not.toThrow();
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('przycięcie imienia nie rozcina emoji (pary surogatów)', () => {
    const name = migrateSave({ version: 1, profile: { name: 'a'.repeat(23) + '😀' } }).profile.name;
    expect(name).toBe('a'.repeat(23));
    const spaced = migrateSave({ version: 1, profile: { name: 'a'.repeat(22) + ' 😀' } }).profile.name;
    expect(spaced).toBe('a'.repeat(22));
    // Emoji mieszczące się w limicie zostaje.
    expect(migrateSave({ version: 1, profile: { name: 'Ola 😀' } }).profile.name).toBe('Ola 😀');
  });

  it('Plusik (prezent na start) zawsze jest w zapisie', () => {
    for (const creatures of [[], ['śmieć'], [{ id: 'Plusik', level: 2 }], [{ id: 'blizniak', level: 2, fedCycle: -1, caughtAt: 5 }]]) {
      const raw = loose(fresh());
      raw.creatures = creatures;
      const m = migrateSave(raw);
      expect(m.creatures[0]).toEqual({ id: 'plusik', level: 1, fedCycle: -1, caughtAt: NOW });
      expect(validateSave(m)).toEqual([]);
    }
  });

  it('openedChests: ogromna lista przetwarzana liniowo', () => {
    const raw = loose(fresh());
    raw.progress.openedChests = Array.from({ length: 100_000 }, (_, i) => `c${i % 90_000}`);
    const t0 = performance.now();
    const m = migrateSave(raw);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(m.progress.openedChests).toHaveLength(90_000);
  });
});
