import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CategoryId, CreatureDef, LandId, NumberRange, ParentSettings } from '../types';
import { ALL_CATEGORY_IDS, isCategoryAvailable } from '../math/categories';
import {
  MAX_STAGE,
  actionCategories,
  clampStage,
  firstStageOf,
  preferredFormat,
  shouldStageUp,
  stageCategories,
  stageMastery,
  START_STAGE_MAX,
  stageOwnCategories,
  startingStageFromMastery,
} from './progression';
import type { PoolAction } from './progression';

const settings = (over: Partial<ParentSettings> = {}): ParentSettings => ({
  range: 20,
  ops: { add: true, sub: true, mul: true, div: true },
  combatOps: 'themed',
  crossTenOnMeadow: true,
  timeLimit: { mode: 'none', fixedSec: { add: 10, sub: 10, mul: 10, div: 10 } },
  breakReminderMin: 0,
  quality: 'auto',
  audio: { music: 0.5, sfx: 0.5 },
  showFps: false,
  ...over,
});
const DEF = settings();
const ops = (add: boolean, sub: boolean, mul: boolean, div: boolean) => ({ add, sub, mul, div });

// Kopie stworków z content/creatures.ts (core nie importuje content/).
const creature = (id: string, over: Partial<CreatureDef>): CreatureDef => ({
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
const PLUSIK = creature('plusik', { categories: ['add.within10', 'add.within20'] });
const DOPELNIAK = creature('dopelniak', { categories: ['add.complement10'], catchFormat: 'missing' });
const BLIZNIAK = creature('blizniak', { rarity: 'uncommon', categories: ['add.doubles'] });
const KONICZYNEK = creature('koniczynek', { rarity: 'rare', categories: ['add.three', 'add.within20'] });
const CREATURES = [PLUSIK, DOPELNIAK, BLIZNIAK, KONICZYNEK];

const LANDS: LandId[] = ['meadow', 'cave', 'volcano', 'castle', 'ice'];
const ACTIONS: PoolAction[] = ['attack', 'strongAttack', 'defend', 'strongDefend', 'boss', 'chest', 'feed', 'catch'];

describe('stageCategories — Łąka (GDD 6.5)', () => {
  it('etapy przy ustawieniach domyślnych (zakres 20, przekraczanie 10 włączone)', () => {
    expect(stageCategories('meadow', 1, DEF)).toEqual(['add.within10']);
    expect(stageCategories('meadow', 2, DEF)).toEqual(['add.within10', 'add.complement10', 'add.doubles']);
    expect(stageCategories('meadow', 3, DEF)).toEqual([
      'add.within10',
      'add.complement10',
      'add.doubles',
      'add.within20',
    ]);
    expect(stageCategories('meadow', 4, DEF)).toEqual([
      'add.within10',
      'add.complement10',
      'add.doubles',
      'add.within20',
      'add.three',
      'add.cross10',
    ]);
  });

  it('Ł4: dwucyfrowe tylko przy zakresie 100, przekraczanie 10 tylko gdy włączone', () => {
    expect(stageCategories('meadow', 4, settings({ range: 100 }))).toContain('add.2d');
    expect(stageCategories('meadow', 4, DEF)).not.toContain('add.2d');
    expect(stageCategories('meadow', 4, settings({ crossTenOnMeadow: false }))).not.toContain('add.cross10');
  });

  it('zakres 10 odfiltrowuje kategorie do 20 (trzy składniki zostają — suma ≤ 10)', () => {
    const s = settings({ range: 10 });
    expect(stageCategories('meadow', 4, s)).toEqual(['add.within10', 'add.complement10', 'add.doubles', 'add.three']);
    expect(stageCategories('meadow', 3, s)).toEqual(['add.within10', 'add.complement10', 'add.doubles']);
  });

  it('etap przycięty do 1..4', () => {
    expect(clampStage(0)).toBe(1);
    expect(clampStage(Number.NaN)).toBe(1);
    expect(clampStage(2.9)).toBe(2);
    expect(clampStage(99)).toBe(MAX_STAGE);
    expect(stageCategories('meadow', 0, DEF)).toEqual(stageCategories('meadow', 1, DEF));
    expect(stageCategories('meadow', 7, DEF)).toEqual(stageCategories('meadow', 4, DEF));
  });

  it('wyłączone dodawanie → pusta pula etapu', () => {
    expect(stageCategories('meadow', 4, settings({ ops: ops(false, true, true, true) }))).toEqual([]);
  });

  it('pozostałe krainy (zaślepki)', () => {
    expect(stageCategories('castle', 1, DEF)).toEqual(['mul.t2', 'mul.t5', 'mul.t10']);
    expect(stageCategories('ice', 4, DEF)).toHaveLength(9);
    expect(stageCategories('cave', 1, DEF)).toEqual(['sub.within10']);
    expect(stageCategories('volcano', 2, DEF)).toEqual(['add.cross10', 'sub.cross10']);
  });

  it('pule etapów rosną (każdy etap zawiera poprzedni)', () => {
    for (const land of LANDS) {
      for (let s = 2; s <= MAX_STAGE; s++) {
        const prev = stageCategories(land, s - 1, DEF);
        const cur = stageCategories(land, s, DEF);
        for (const c of prev) expect(cur).toContain(c);
      }
    }
  });

  it('firstStageOf', () => {
    expect(firstStageOf('meadow', 'add.within10')).toBe(1);
    expect(firstStageOf('meadow', 'add.doubles')).toBe(2);
    expect(firstStageOf('meadow', 'add.within20')).toBe(3);
    expect(firstStageOf('meadow', 'add.cross10')).toBe(4);
    expect(firstStageOf('meadow', 'mul.t7')).toBeNull();
  });
});

describe('actionCategories — Łąka tematycznie (GDD 7.2)', () => {
  const pool = (action: PoolAction, stage: number, s: ParentSettings = DEF, extra = {}) =>
    actionCategories({ land: 'meadow', stage, action, settings: s, ...extra });

  it('atak prosty: dodawanie do 10/20 (+ przekraczanie 10, dwucyfrowe w Ł4)', () => {
    expect(pool('attack', 1)).toEqual(['add.within10']);
    expect(pool('attack', 2)).toEqual(['add.within10']);
    expect(pool('attack', 3)).toEqual(['add.within10', 'add.within20']);
    expect(pool('attack', 4)).toEqual(['add.within10', 'add.within20', 'add.cross10']);
    expect(pool('attack', 4, settings({ range: 100 }))).toEqual([
      'add.within10',
      'add.within20',
      'add.cross10',
      'add.2d',
    ]);
  });

  it('atak mocny = podwajanie, obrona = dopełnianie do 10', () => {
    for (let st = 1; st <= 4; st++) {
      expect(pool('strongAttack', st)).toEqual(['add.doubles']);
      expect(pool('defend', st)).toEqual(['add.complement10']);
    }
  });

  it('obrona przed mocnym: Ł4 trzy składniki, Ł3 do 20, wcześniej lub przy zakresie 10 — do 10', () => {
    expect(pool('strongDefend', 1)).toEqual(['add.within10']);
    expect(pool('strongDefend', 2)).toEqual(['add.within10']);
    expect(pool('strongDefend', 3)).toEqual(['add.within20']);
    expect(pool('strongDefend', 4)).toEqual(['add.three']);
    // Zakres 10: trzy składniki z sumą ≤ 10 (add.three dostępne od zakresu 10); Ł3 bez do 20 → do 10.
    expect(pool('strongDefend', 4, settings({ range: 10 }))).toEqual(['add.three']);
    expect(pool('strongDefend', 3, settings({ range: 10 }))).toEqual(['add.within10']);
  });

  it('boss: faza 1 pula ataku, faza 2 podwajanie + dopełnianie, faza 3 cała Łąka', () => {
    expect(pool('boss', 4, DEF, { bossPhase: 1 })).toEqual(pool('attack', 4));
    expect(pool('boss', 4)).toEqual(pool('attack', 4));
    expect(pool('boss', 4, DEF, { bossPhase: 2 })).toEqual(['add.doubles', 'add.complement10']);
    expect(pool('boss', 4, DEF, { bossPhase: 3 })).toEqual(stageCategories('meadow', 4, DEF));
    expect(pool('boss', 1, DEF, { bossPhase: 3 })).toEqual(['add.within10']);
  });

  it('skrzynia: pula etapu', () => {
    expect(pool('chest', 2)).toEqual(stageCategories('meadow', 2, DEF));
  });

  it('łapanie/karmienie: kategorie stworka (pospolite wg etapu, rzadkie — pełne)', () => {
    expect(pool('catch', 1, DEF, { creature: PLUSIK })).toEqual(['add.within10']);
    expect(pool('catch', 3, DEF, { creature: PLUSIK })).toEqual(['add.within10', 'add.within20']);
    expect(pool('feed', 3, settings({ range: 10 }), { creature: PLUSIK })).toEqual(['add.within10']);
    expect(pool('catch', 1, DEF, { creature: DOPELNIAK })).toEqual(['add.complement10']);
    expect(pool('catch', 1, DEF, { creature: BLIZNIAK })).toEqual(['add.doubles']);
    expect(pool('catch', 1, DEF, { creature: KONICZYNEK })).toEqual(['add.three', 'add.within20']);
    expect(pool('catch', 4, settings({ range: 10 }), { creature: KONICZYNEK })).toEqual(['add.three']);
    expect(pool('catch', 2, DEF)).toEqual(stageCategories('meadow', 2, DEF));
  });
});

describe('actionCategories — tryb „wszystkie działania” i zapasy', () => {
  const all = settings({ combatOps: 'all' });
  const pool = (action: PoolAction, s: ParentSettings, land: LandId = 'meadow') =>
    actionCategories({ land, stage: 2, action, settings: s });

  it('atak = + i −, mocny = ×, obrona = −, obrona przed mocnym = :', () => {
    const atk = pool('attack', all);
    expect(atk.some((c) => c.startsWith('add.'))).toBe(true);
    expect(atk.some((c) => c.startsWith('sub.'))).toBe(true);
    expect(atk.every((c) => c.startsWith('add.') || c.startsWith('sub.'))).toBe(true);
    expect(pool('strongAttack', all)).toHaveLength(9);
    expect(pool('strongAttack', all).every((c) => c.startsWith('mul.'))).toBe(true);
    expect(pool('defend', all)).toEqual(['sub.within10', 'sub.within20', 'sub.cross10']);
    expect(pool('strongDefend', all).every((c) => c.startsWith('div.'))).toBe(true);
    // Poza walką tryb nie ma znaczenia.
    expect(pool('chest', all)).toEqual(pool('chest', DEF));
  });

  it('wyłączone działanie → pula tematyczna', () => {
    const noMul = settings({ combatOps: 'all', ops: ops(true, true, false, true) });
    expect(pool('strongAttack', noMul)).toEqual(['add.doubles']);
    const noSub = settings({ combatOps: 'all', ops: ops(true, false, true, true) });
    expect(pool('defend', noSub)).toEqual(['add.complement10']);
  });

  it('bez dodawania na Łące → najprostsze kategorie innych działań', () => {
    const s = settings({ ops: ops(false, true, true, false) });
    expect(pool('attack', s)).toEqual(['sub.within10', 'mul.t2', 'mul.t5', 'mul.t10']);
    expect(pool('catch', s)).toEqual(['sub.within10', 'mul.t2', 'mul.t5', 'mul.t10']);
  });

  it('wszystko wyłączone → add.within10 (jedyna możliwość)', () => {
    const s = settings({ ops: ops(false, false, false, false) });
    for (const a of ACTIONS) expect(pool(a, s)).toEqual(['add.within10']);
  });

  it('inne krainy: pula etapu', () => {
    expect(pool('attack', DEF, 'castle')).toEqual(stageCategories('castle', 2, DEF));
    expect(pool('defend', DEF, 'cave')).toEqual(['sub.within10']);
    expect(pool('boss', DEF, 'ice')).toEqual(stageCategories('ice', 2, DEF));
  });
});

describe('właściwości pul (fast-check, wszystkie kombinacje ustawień)', () => {
  const settingsArb = fc
    .record({
      range: fc.constantFrom<NumberRange>(10, 20, 100),
      add: fc.boolean(),
      sub: fc.boolean(),
      mul: fc.boolean(),
      div: fc.boolean(),
      combatOps: fc.constantFrom<'themed' | 'all'>('themed', 'all'),
      crossTenOnMeadow: fc.boolean(),
    })
    .map((r) =>
      settings({
        range: r.range,
        ops: ops(r.add, r.sub, r.mul, r.div),
        combatOps: r.combatOps,
        crossTenOnMeadow: r.crossTenOnMeadow,
      }),
    );
  const argsArb = fc.record({
    land: fc.constantFrom(...LANDS),
    stage: fc.integer({ min: -1, max: 6 }),
    action: fc.constantFrom(...ACTIONS),
    settings: settingsArb,
    creature: fc.option(fc.constantFrom(...CREATURES), { nil: undefined }),
    bossPhase: fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined }),
  });

  it('pula nigdy nie jest pusta, bez duplikatów, z poprawnych id; przy włączonym działaniu — dostępna', () => {
    fc.assert(
      fc.property(argsArb, (args) => {
        const pool = actionCategories(args);
        expect(pool.length).toBeGreaterThan(0);
        expect(new Set(pool).size).toBe(pool.length);
        for (const c of pool) expect(ALL_CATEGORY_IDS).toContain(c);
        const anyOp = Object.values(args.settings.ops).some(Boolean);
        if (anyOp) for (const c of pool) expect(isCategoryAvailable(c, args.settings)).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });

  it('pule akcji walki mają jednolity format', () => {
    const combat = argsArb.filter((a) => ['attack', 'strongAttack', 'defend', 'strongDefend'].includes(a.action));
    fc.assert(
      fc.property(combat, (args) => {
        const pool = actionCategories(args);
        const formats = new Set(pool.map((c) => preferredFormat(args.action, c)));
        expect(formats.size).toBe(1);
      }),
      { numRuns: 2000 },
    );
  });

  it('wyczerpująco: każda kombinacja ustawień × kraina × etap × akcja', () => {
    let count = 0;
    for (const range of [10, 20, 100] as NumberRange[]) {
      for (let mask = 0; mask < 16; mask++) {
        for (const combatOps of ['themed', 'all'] as const) {
          for (const crossTenOnMeadow of [true, false]) {
            const s = settings({
              range,
              ops: ops(!!(mask & 1), !!(mask & 2), !!(mask & 4), !!(mask & 8)),
              combatOps,
              crossTenOnMeadow,
            });
            for (const land of LANDS) {
              for (let stage = 1; stage <= MAX_STAGE; stage++) {
                for (const action of ACTIONS) {
                  for (const creature of [undefined, ...CREATURES]) {
                    for (const bossPhase of [1, 2, 3]) {
                      const pool = actionCategories({ land, stage, action, settings: s, creature, bossPhase });
                      if (pool.length === 0) throw new Error(`pusta pula: ${land} ${stage} ${action}`);
                      count++;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(count).toBe(3 * 16 * 2 * 2 * 5 * 4 * 8 * 5 * 3);
  });
});

describe('preferredFormat', () => {
  it('dopełnianie i brakujący odjemnik → missing, reszta → choice', () => {
    expect(preferredFormat('defend', 'add.complement10')).toBe('missing');
    expect(preferredFormat('catch', 'add.complement10')).toBe('missing');
    expect(preferredFormat('defend', 'sub.missing')).toBe('missing');
    expect(preferredFormat('attack', 'add.within10')).toBe('choice');
    expect(preferredFormat('strongAttack', 'mul.t7')).toBe('choice');
  });
});

describe('etapy: awans i start po kalibracji', () => {
  const m =
    (values: Partial<Record<CategoryId, number>>, rest = 0) =>
    (c: CategoryId) =>
      values[c] ?? rest;

  it('awans przy średnim opanowaniu puli etapu ≥ 0,7', () => {
    const base = { land: 'meadow' as const, settings: DEF };
    expect(shouldStageUp({ ...base, stage: 1, mastery: m({}, 0.7) })).toBe(true);
    expect(shouldStageUp({ ...base, stage: 3, mastery: m({}, 0.7) })).toBe(true);
    expect(shouldStageUp({ ...base, stage: 1, mastery: m({}, 0.69) })).toBe(false);
    expect(shouldStageUp({ ...base, stage: 4, mastery: m({}, 1) })).toBe(false);
    // Średnia (0,9 + 0,5 + 0,7) / 3 = 0,7.
    const mix = m({ 'add.within10': 0.9, 'add.complement10': 0.5, 'add.doubles': 0.7 });
    expect(stageMastery({ ...base, stage: 2, mastery: mix })).toBeCloseTo(0.7);
    expect(shouldStageUp({ ...base, stage: 2, mastery: mix })).toBe(true);
    // Kategorie spoza etapu się nie liczą.
    expect(shouldStageUp({ ...base, stage: 1, mastery: m({ 'add.within10': 0.8 }, 0) })).toBe(true);
    // Śmieciowe wartości = 0.
    expect(shouldStageUp({ ...base, stage: 1, mastery: () => Number.NaN })).toBe(false);
    // Pusta pula (wyłączone dodawanie) — brak awansu.
    expect(shouldStageUp({ land: 'meadow', settings: settings({ ops: ops(false, true, true, true) }), stage: 1, mastery: () => 1 })).toBe(false);
  });

  it('etap startowy: najwyższy, którego wcześniejsze etapy są opanowane (maks. 3)', () => {
    const base = { land: 'meadow' as const, settings: DEF };
    // Ł4 tylko grą (shouldStageUp), nie z kalibracji.
    expect(START_STAGE_MAX).toBe(3);
    expect(startingStageFromMastery({ ...base, mastery: () => 1 })).toBe(3);
    expect(startingStageFromMastery({ ...base, mastery: () => 0 })).toBe(1);
    expect(startingStageFromMastery({ ...base, mastery: m({ 'add.within10': 0.9 }, 0.3) })).toBe(2);
    expect(
      startingStageFromMastery({
        ...base,
        mastery: m({ 'add.within10': 0.9, 'add.complement10': 0.8, 'add.doubles': 0.8 }, 0.2),
      }),
    ).toBe(3);
  });

  it('dowody (evidence): awans ponad etap tylko, gdy własna kategoria etapu ma ≥ 2 próby', () => {
    const base = { land: 'meadow' as const, settings: DEF, mastery: () => 1 };
    const ev =
      (counts: Partial<Record<CategoryId, number>>) =>
      (c: CategoryId): number =>
        counts[c] ?? 0;
    // Same priorytety (0 prób) → start na Ł1 mimo wysokiego opanowania.
    expect(startingStageFromMastery({ ...base, evidence: ev({}) })).toBe(1);
    // add.within10 z 1 próbą — za mało.
    expect(startingStageFromMastery({ ...base, evidence: ev({ 'add.within10': 1 }) })).toBe(1);
    // Ł1 potwierdzony; Ł2 (dopełnianie, podwajanie) bez prób → Ł2.
    expect(startingStageFromMastery({ ...base, evidence: ev({ 'add.within10': 2 }) })).toBe(2);
    // Próby tylko w kategorii z Ł1 nie potwierdzają Ł2 (liczą się własne kategorie etapu).
    expect(startingStageFromMastery({ ...base, evidence: ev({ 'add.within10': 9, 'add.within20': 9 }) })).toBe(2);
    // Jedna własna kategoria Ł2 wystarczy.
    expect(startingStageFromMastery({ ...base, evidence: ev({ 'add.within10': 2, 'add.doubles': 2 }) })).toBe(3);
    // Nawet z dowodami dla wszystkich etapów — maks. 3.
    const all = ev(Object.fromEntries(stageCategories('meadow', 4, DEF).map((c) => [c, 5])));
    expect(startingStageFromMastery({ ...base, evidence: all })).toBe(3);
    // Dowody bez opanowania nic nie dają; śmieciowe liczby = brak dowodu.
    expect(startingStageFromMastery({ ...base, mastery: () => 0.5, evidence: all })).toBe(1);
    expect(startingStageFromMastery({ ...base, evidence: () => Number.NaN })).toBe(1);
    // Stary podpis (bez evidence) działa jak wcześniej, z limitem 3.
    expect(startingStageFromMastery({ land: 'meadow', settings: DEF, mastery: () => 1 })).toBe(3);
  });

  it('własne kategorie etapu: filtrowane ustawieniami; brak dostępnych → cała pula etapu', () => {
    expect(stageOwnCategories('meadow', 2, DEF)).toEqual(['add.complement10', 'add.doubles']);
    expect(stageOwnCategories('meadow', 4, settings({ crossTenOnMeadow: false }))).toEqual(['add.three']);
    // Zakres 10: Ł3 (do 20) niedostępny → pula etapu 3.
    const s10 = settings({ range: 10 });
    expect(stageOwnCategories('meadow', 3, s10)).toEqual(stageCategories('meadow', 3, s10));
  });

  it('właściwości: wynik 1..3, monotoniczny względem opanowania i dowodów, zgodny z shouldStageUp', () => {
    const cats = stageCategories('meadow', 4, DEF);
    const masteryArb = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: cats.length,
      maxLength: cats.length,
    });
    fc.assert(
      fc.property(masteryArb, fc.double({ min: 0, max: 0.5, noNaN: true }), (vals, bump) => {
        const lookup = (arr: number[]) => (c: CategoryId) => arr[cats.indexOf(c)] ?? 0;
        const args = { land: 'meadow' as const, settings: DEF };
        const s = startingStageFromMastery({ ...args, mastery: lookup(vals) });
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(START_STAGE_MAX);
        for (let k = 1; k < s; k++) expect(shouldStageUp({ ...args, stage: k, mastery: lookup(vals) })).toBe(true);
        if (s < START_STAGE_MAX) expect(shouldStageUp({ ...args, stage: s, mastery: lookup(vals) })).toBe(false);
        const higher = vals.map((v) => Math.min(1, v + bump));
        expect(startingStageFromMastery({ ...args, mastery: lookup(higher) })).toBeGreaterThanOrEqual(s);
        // Dowody tylko ograniczają; więcej dowodów nie obniża etapu.
        const evid = (n: number) => (c: CategoryId) => (cats.indexOf(c) % 2 === 0 ? n : 0);
        const withFew = startingStageFromMastery({ ...args, mastery: lookup(vals), evidence: evid(1) });
        const withMany = startingStageFromMastery({ ...args, mastery: lookup(vals), evidence: evid(3) });
        expect(withFew).toBeLessThanOrEqual(withMany);
        expect(withMany).toBeLessThanOrEqual(s);
        expect(withFew).toBe(1);
      }),
      { numRuns: 500 },
    );
  });
});
