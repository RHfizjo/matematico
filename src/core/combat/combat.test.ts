import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ActionKind, CombatEvent, CombatState, EnemyDef, HeroStats, QteResult } from '../types';
import {
  applyEnemyHit,
  applyPlayerAttack,
  availableActions,
  endEnemyTurn,
  enemyIntents,
  isHeroDown,
  phaseForCzar,
  phaseThresholds,
  rescue,
  startCombat,
} from './combat';
import { ATTACK_MULT, BLOCK_PCT } from './constants';

// Kopie liczb z content/enemies.ts (core nie importuje content/).
const base = {
  name: 'x',
  glamName: 'y',
  battleCry: '',
  glamThanks: '',
  land: 'meadow' as const,
  strongAttack: 25,
  strongEvery: 0,
  isBoss: false,
};
const SLIM: EnemyDef = { ...base, id: 'slimakorro', czar: 30, behavior: 'normal', attack: 15 };
const TRZ: EnemyDef = { ...base, id: 'trzmielini', czar: 25, behavior: 'fast', attack: 12 };
const GRZ: EnemyDef = { ...base, id: 'grzybello', czar: 40, behavior: 'heavy', attack: 15, strongEvery: 3 };
const BOSS: EnemyDef = {
  ...base,
  id: 'kosiarrini',
  czar: 120,
  behavior: 'boss',
  attack: 15,
  isBoss: true,
  phases: [
    { czarFrom: 120, note: '', strongEvery: 0, vines: 0 },
    { czarFrom: 80, note: '', strongEvery: 0, vines: 2 },
    { czarFrom: 40, note: '', strongEvery: 2, vines: 0 },
  ],
};

const hero = (over: Partial<HeroStats> = {}): HeroStats => ({
  maxHp: 100,
  attackBonus: 0,
  defenseBoost: { defend: 0, strongDefend: 0 },
  shieldCharges: 0,
  ...over,
});
const HERO = hero();
const RESULTS: QteResult[] = ['fast', 'correct', 'late', 'wrong', 'timeout', 'retryCorrect'];

/** Cała tura wroga: wszystkie ciosy z tym samym wynikiem obrony; ratunek przy HP 0. */
function enemyTurn(state: CombatState, enemy: EnemyDef, result: QteResult, h: HeroStats = HERO): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const intent of enemyIntents(state, enemy)) {
    events.push(...applyEnemyHit(state, enemy, intent, result, h));
    if (state.won) break;
    if (isHeroDown(state)) {
      rescue(state);
      break;
    }
  }
  endEnemyTurn(state);
  return events;
}

function firstHit(events: CombatEvent[]): Extract<CombatEvent, { t: 'playerHit' }> {
  const ev = events.find((x) => x.t === 'playerHit');
  if (ev === undefined || ev.t !== 'playerHit') throw new Error('brak playerHit');
  return ev;
}

function firstEnemyHit(events: CombatEvent[]): Extract<CombatEvent, { t: 'enemyHit' }> {
  const ev = events.find((x) => x.t === 'enemyHit');
  if (ev === undefined || ev.t !== 'enemyHit') throw new Error('brak enemyHit');
  return ev;
}

describe('startCombat', () => {
  it('ustawia stan początkowy', () => {
    const s = startCombat(SLIM, hero({ maxHp: 120, shieldCharges: 1 }));
    expect(s).toEqual({
      enemyId: 'slimakorro',
      czar: 30,
      maxCzar: 30,
      phase: 1,
      vines: 0,
      heroHp: 120,
      heroMaxHp: 120,
      shieldCharges: 1,
      enemyTurn: 1,
      strongCooldown: 0,
      turn: 'player',
      won: false,
      log: [],
    });
  });

  it('wznawia Czar (przycięty do 1..max)', () => {
    expect(startCombat(SLIM, HERO, { czar: 12 }).czar).toBe(12);
    expect(startCombat(SLIM, HERO, { czar: 99 }).czar).toBe(30);
    expect(startCombat(SLIM, HERO, { czar: 0 }).czar).toBe(1);
    expect(startCombat(SLIM, HERO, { czar: Number.NaN }).czar).toBe(30);
  });

  it('boss: faza z Czaru i z zapisu; pnącza po wznowieniu = 0; postęp się nie cofa', () => {
    const a = startCombat(BOSS, HERO, { czar: 70, phase: 2 });
    expect([a.czar, a.phase, a.vines]).toEqual([70, 2, 0]);
    const b = startCombat(BOSS, HERO, { phase: 3 });
    expect([b.czar, b.phase]).toEqual([40, 3]);
    const c = startCombat(BOSS, HERO, { czar: 100, phase: 2 });
    expect([c.czar, c.phase]).toEqual([80, 2]);
    const d = startCombat(BOSS, HERO, { czar: 30, phase: 1 });
    expect(d.phase).toBe(3);
    const e = startCombat(BOSS, HERO, { phase: 9 });
    expect(e.phase).toBe(3);
  });
});

describe('atak gracza', () => {
  it('same poprawne odpowiedzi: Ślimakorro odczarowany w 3 atakach', () => {
    const s = startCombat(SLIM, HERO);
    for (let i = 1; i <= 3; i++) {
      const ev = applyPlayerAttack(s, SLIM, 'attack', 'correct', HERO);
      expect(firstHit(ev).damage).toBe(10);
      if (i < 3) {
        expect(s.turn).toBe('enemy');
        enemyTurn(s, SLIM, 'correct');
        expect(s.heroHp).toBe(100);
      }
    }
    expect(s.czar).toBe(0);
    expect(s.won).toBe(true);
    expect(s.turn).toBe('player');
    expect(s.log.filter((x) => x.t === 'transformed')).toHaveLength(1);
    expect(s.log.at(-1)).toEqual({ t: 'transformed' });
    // Po przemianie nic się już nie dzieje.
    expect(applyPlayerAttack(s, SLIM, 'attack', 'correct', HERO)).toEqual([]);
    expect(enemyIntents(s, SLIM)).toEqual([]);
  });

  it('obrażenia wg wyniku (atak prosty i mocny, premia broni)', () => {
    const dmg = (action: ActionKind, result: QteResult, h: HeroStats = HERO): number =>
      firstHit(applyPlayerAttack(startCombat(BOSS, HERO), BOSS, action, result, h)).damage;
    expect(RESULTS.map((r) => dmg('attack', r))).toEqual([12, 10, 7, 3, 2, 8]);
    expect(RESULTS.map((r) => dmg('strongAttack', r))).toEqual([22, 18, 13, 5, 4, 14]);
    const sword = hero({ attackBonus: 3 });
    expect(RESULTS.map((r) => dmg('attack', r, sword))).toEqual([16, 13, 9, 4, 3, 10]);
    // Minimum 1.
    expect(dmg('attack', 'timeout', hero({ attackBonus: -9 }))).toBe(1);
  });

  it('błędna odpowiedź wciąż zdejmuje 3 Czaru; krytyk tylko przy „szybko”', () => {
    const s = startCombat(SLIM, HERO);
    const ev = firstHit(applyPlayerAttack(s, SLIM, 'attack', 'wrong', HERO));
    expect(ev).toEqual({ t: 'playerHit', action: 'attack', result: 'wrong', damage: 3, crit: false, vineRemoved: false });
    expect(s.czar).toBe(27);
    const s2 = startCombat(SLIM, HERO);
    expect(firstHit(applyPlayerAttack(s2, SLIM, 'attack', 'fast', HERO)).crit).toBe(true);
  });

  it('zgadywanie opłaca się mniej niż spokojne liczenie (GDD 7.3)', () => {
    expect(0.25 * ATTACK_MULT.fast + 0.75 * ATTACK_MULT.wrong).toBeLessThan(ATTACK_MULT.correct);
  });

  it('obrona nie jest atakiem', () => {
    expect(() => applyPlayerAttack(startCombat(SLIM, HERO), SLIM, 'defend', 'correct', HERO)).toThrow(RangeError);
  });

  it('atak mocny: odnowienie 1 tury', () => {
    const s = startCombat(GRZ, HERO);
    const unlocked: ActionKind[] = ['attack', 'strongAttack'];
    expect(availableActions(s, unlocked)).toEqual(['attack', 'strongAttack']);
    expect(availableActions(s, ['attack'])).toEqual(['attack']);
    expect(availableActions(s, [])).toEqual(['attack']);
    applyPlayerAttack(s, GRZ, 'strongAttack', 'correct', HERO);
    expect(s.strongCooldown).toBe(1);
    enemyTurn(s, GRZ, 'correct');
    expect(availableActions(s, unlocked)).toEqual(['attack']);
    applyPlayerAttack(s, GRZ, 'attack', 'correct', HERO);
    expect(s.strongCooldown).toBe(0);
    enemyTurn(s, GRZ, 'correct');
    expect(availableActions(s, unlocked)).toEqual(['attack', 'strongAttack']);
    // 18 + 10 = 28 zdjętego Czaru.
    expect(s.czar).toBe(12);
  });
});

describe('zamiary wroga', () => {
  const intentsOver = (enemy: EnemyDef, turns: number, phase = 1): string[] => {
    const s = startCombat(enemy, HERO);
    s.phase = phase;
    const out: string[] = [];
    for (let t = 1; t <= turns; t++) {
      s.enemyTurn = t;
      out.push(
        enemyIntents(s, enemy)
          .map((i) => `${i.kind[0]}${i.hits}`)
          .join(','),
      );
    }
    return out;
  };

  it('zwykły: zawsze 1 zwykły cios', () => {
    expect(intentsOver(SLIM, 4)).toEqual(['n1', 'n1', 'n1', 'n1']);
  });

  it('szybki: 2 ciosy w każdej parzystej turze', () => {
    expect(intentsOver(TRZ, 6)).toEqual(['n1', 'n2,n2', 'n1', 'n2,n2', 'n1', 'n2,n2']);
  });

  it('ciężki: mocny cios w turach 3, 6, 9…', () => {
    const got = intentsOver(GRZ, 12);
    got.forEach((x, i) => expect(x).toBe((i + 1) % 3 === 0 ? 's1' : 'n1'));
  });

  it('boss: faza 1–2 bez mocnych, faza 3 mocny co 2. turę', () => {
    expect(intentsOver(BOSS, 4, 1)).toEqual(['n1', 'n1', 'n1', 'n1']);
    expect(intentsOver(BOSS, 4, 2)).toEqual(['n1', 'n1', 'n1', 'n1']);
    expect(intentsOver(BOSS, 4, 3)).toEqual(['n1', 's1', 'n1', 's1']);
  });

  it('szybki wróg w pełnej walce: 2 obrony po kolei w turze 2', () => {
    const s = startCombat(TRZ, HERO);
    applyPlayerAttack(s, TRZ, 'attack', 'correct', HERO);
    const t1 = enemyTurn(s, TRZ, 'wrong');
    expect(t1.filter((x) => x.t === 'enemyHit')).toHaveLength(1);
    applyPlayerAttack(s, TRZ, 'attack', 'correct', HERO);
    const t2 = enemyTurn(s, TRZ, 'wrong');
    expect(t2.filter((x) => x.t === 'enemyHit')).toHaveLength(2);
    // 12 × 0,6 = 7,2 → 7 za cios; 3 ciosy.
    expect(s.heroHp).toBe(100 - 3 * 7);
    expect(s.enemyTurn).toBe(3);
  });
});

describe('obrona', () => {
  const hit = (
    enemy: EnemyDef,
    kind: 'normal' | 'strong',
    result: QteResult,
    h: HeroStats = HERO,
    state: CombatState = startCombat(enemy, h),
  ) => firstEnemyHit(applyEnemyHit(state, enemy, { kind, hits: 1 }, result, h));

  it('przyjęte obrażenia wg wyniku (zwykły 15, mocny 25)', () => {
    expect(RESULTS.map((r) => hit(SLIM, 'normal', r).taken)).toEqual([0, 0, 6, 9, 11, 3]);
    expect(RESULTS.map((r) => hit(GRZ, 'strong', r).taken)).toEqual([0, 0, 10, 15, 18, 5]);
    expect(RESULTS.map((r) => hit(SLIM, 'normal', r).blockedPct)).toEqual(RESULTS.map((r) => BLOCK_PCT[r]));
  });

  it('premia stworka +20% dla właściwego rodzaju obrony, blok maks. 100%', () => {
    const dop = hero({ defenseBoost: { defend: 0.2, strongDefend: 0 } });
    expect(hit(SLIM, 'normal', 'wrong', dop)).toMatchObject({ taken: 6, blockedPct: 0.6 });
    expect(hit(SLIM, 'normal', 'retryCorrect', dop)).toMatchObject({ taken: 0, blockedPct: 1 });
    expect(hit(GRZ, 'strong', 'wrong', dop).taken).toBe(15);
    const kon = hero({ defenseBoost: { defend: 0, strongDefend: 0.2 } });
    expect(hit(GRZ, 'strong', 'late', kon)).toMatchObject({ taken: 5, blockedPct: 0.8 });
  });

  it('szybka obrona: kontra 5 zdejmuje Czar', () => {
    const s = startCombat(SLIM, HERO);
    const ev = hit(SLIM, 'normal', 'fast', HERO, s);
    expect(ev).toMatchObject({ taken: 0, counter: 5, blockedPct: 1 });
    expect(s.czar).toBe(25);
    expect(hit(SLIM, 'normal', 'correct').counter).toBe(0);
  });

  it('kontra może zakończyć walkę', () => {
    const s = startCombat(SLIM, HERO, { czar: 5 });
    applyPlayerAttack(s, SLIM, 'attack', 'wrong', HERO); // 5 − 3 = 2
    expect(s.czar).toBe(2);
    const ev = applyEnemyHit(s, SLIM, { kind: 'normal', hits: 1 }, 'fast', HERO);
    expect(ev.map((x) => x.t)).toEqual(['enemyHit', 'transformed']);
    expect(s.czar).toBe(0);
    expect(s.won).toBe(true);
    // Kolejny cios w tej samej turze już nie pada.
    expect(applyEnemyHit(s, SLIM, { kind: 'normal', hits: 1 }, 'wrong', HERO)).toEqual([]);
  });

  it('tarcza Koniczynka pochłania pierwszy mocny cios, którego nie zablokowano w pełni', () => {
    const kon = hero({ defenseBoost: { defend: 0, strongDefend: 0.2 }, shieldCharges: 1 });
    const s = startCombat(GRZ, kon);
    expect(s.shieldCharges).toBe(1);
    // Tury 1–2: zwykłe ciosy — tarcza nieużywana nawet przy błędzie.
    for (let t = 1; t <= 2; t++) {
      applyPlayerAttack(s, GRZ, 'attack', 'wrong', kon);
      const ev = firstEnemyHit(enemyTurn(s, GRZ, 'wrong', kon));
      expect(ev.shieldUsed).toBe(false);
    }
    expect(s.shieldCharges).toBe(1);
    expect(s.heroHp).toBe(100 - 9 - 9);
    // Tura 3: mocny cios, poprawna obrona — pełny blok, tarcza się nie marnuje.
    applyPlayerAttack(s, GRZ, 'attack', 'wrong', kon);
    expect(firstEnemyHit(enemyTurn(s, GRZ, 'correct', kon)).shieldUsed).toBe(false);
    expect(s.shieldCharges).toBe(1);
    // Tura 6: mocny cios, błąd — tarcza.
    for (let t = 4; t <= 5; t++) {
      applyPlayerAttack(s, GRZ, 'attack', 'wrong', kon);
      enemyTurn(s, GRZ, 'correct', kon);
    }
    applyPlayerAttack(s, GRZ, 'attack', 'wrong', kon);
    const hp = s.heroHp;
    const shield = firstEnemyHit(enemyTurn(s, GRZ, 'wrong', kon));
    expect(shield).toMatchObject({ intent: 'strong', taken: 0, shieldUsed: true, blockedPct: 1 });
    expect(s.shieldCharges).toBe(0);
    expect(s.heroHp).toBe(hp);
    // Tura 9: bez tarczy — 25 × (1 − 0,6) = 10.
    for (let t = 7; t <= 8; t++) {
      applyPlayerAttack(s, GRZ, 'attack', 'wrong', kon);
      enemyTurn(s, GRZ, 'correct', kon);
    }
    applyPlayerAttack(s, GRZ, 'attack', 'wrong', kon);
    const after = firstEnemyHit(enemyTurn(s, GRZ, 'wrong', kon));
    expect(after).toMatchObject({ intent: 'strong', taken: 10, shieldUsed: false });
  });

  it('HP 0 → heroDown, ratunek przywraca HP i zachowuje Czar (porażka nie istnieje)', () => {
    const s = startCombat(SLIM, HERO);
    applyPlayerAttack(s, SLIM, 'attack', 'correct', HERO); // 20
    applyPlayerAttack(s, SLIM, 'attack', 'wrong', HERO); // 17
    let downs = 0;
    for (let i = 0; i < 20 && !isHeroDown(s); i++) {
      const ev = applyEnemyHit(s, SLIM, { kind: 'normal', hits: 1 }, 'timeout', HERO);
      downs += ev.filter((x) => x.t === 'heroDown').length;
    }
    // 11 obrażeń na cios → 10 ciosów do zera.
    expect(s.heroHp).toBe(0);
    expect(downs).toBe(1);
    expect(isHeroDown(s)).toBe(true);
    rescue(s);
    expect(s.heroHp).toBe(100);
    expect(s.czar).toBe(17);
    expect(s.turn).toBe('player');
    expect(s.log.at(-1)).toEqual({ t: 'rescued' });
    // Walkę da się dokończyć.
    applyPlayerAttack(s, SLIM, 'attack', 'fast', HERO); // 5
    endEnemyTurn(s);
    applyPlayerAttack(s, SLIM, 'attack', 'correct', HERO);
    expect(s.won).toBe(true);
  });
});

describe('boss Kosiarrini', () => {
  it('pełna walka: fazy, pnącza, mocne ciosy w fazie 3', () => {
    const s = startCombat(BOSS, HERO);
    const phases: CombatEvent[] = [];
    let attacks = 0;
    let strongSeen = 0;
    while (!s.won && attacks < 50) {
      const ev = applyPlayerAttack(s, BOSS, 'attack', 'correct', HERO);
      attacks++;
      phases.push(...ev.filter((x) => x.t === 'phase'));
      if (attacks === 4) {
        expect(s.czar).toBe(80);
        expect([s.phase, s.vines]).toEqual([2, 2]);
      }
      if (attacks === 5 || attacks === 6) {
        expect(firstHit(ev)).toMatchObject({ damage: 0, vineRemoved: true });
        expect(s.czar).toBe(80);
      }
      if (s.won) break;
      for (const intent of enemyIntents(s, BOSS)) if (intent.kind === 'strong') strongSeen++;
      enemyTurn(s, BOSS, 'correct');
    }
    expect(phases).toEqual([
      { t: 'phase', phase: 2, vines: 2 },
      { t: 'phase', phase: 3, vines: 0 },
    ]);
    // 12 ataków po 10 + 2 pnącza.
    expect(attacks).toBe(14);
    expect(s.won).toBe(true);
    expect(strongSeen).toBeGreaterThan(0);
    expect(s.heroHp).toBe(100);
  });

  it('pnącza: błędny atak ich nie usuwa i nie rani bossa; poprawny po limicie i po POPRAWCE usuwa', () => {
    const s = startCombat(BOSS, HERO, { czar: 81 });
    applyPlayerAttack(s, BOSS, 'attack', 'wrong', HERO); // 78 → faza 2
    expect([s.czar, s.phase, s.vines]).toEqual([78, 2, 2]);
    s.turn = 'player';
    for (const r of ['wrong', 'timeout'] as QteResult[]) {
      const ev = firstHit(applyPlayerAttack(s, BOSS, 'attack', r, HERO));
      expect(ev).toMatchObject({ damage: 0, vineRemoved: false });
    }
    expect([s.czar, s.vines]).toEqual([78, 2]);
    expect(firstHit(applyPlayerAttack(s, BOSS, 'attack', 'late', HERO)).vineRemoved).toBe(true);
    expect(firstHit(applyPlayerAttack(s, BOSS, 'strongAttack', 'retryCorrect', HERO)).vineRemoved).toBe(true);
    expect(s.vines).toBe(0);
    expect(firstHit(applyPlayerAttack(s, BOSS, 'attack', 'correct', HERO)).damage).toBe(10);
    expect(s.czar).toBe(68);
  });

  it('pnącza nie wstrzymują ataków bossa; kontra może zmienić fazę', () => {
    const s = startCombat(BOSS, HERO, { czar: 83 });
    const ev = applyEnemyHit(s, BOSS, { kind: 'normal', hits: 1 }, 'fast', HERO);
    expect(ev).toContainEqual({ t: 'phase', phase: 2, vines: 2 });
    expect(enemyIntents(s, BOSS)).toHaveLength(1);
  });

  it('pnącza blokują też kontrę: kontry nie przeskakują fazy 2, pnącza nie znikają same', () => {
    const s = startCombat(BOSS, HERO, { czar: 81 });
    applyPlayerAttack(s, BOSS, 'attack', 'wrong', HERO); // 78 → faza 2, 2 pnącza
    for (let i = 0; i < 10; i++) {
      const ev = applyEnemyHit(s, BOSS, { kind: 'normal', hits: 1 }, 'fast', HERO);
      expect(firstEnemyHit(ev)).toMatchObject({ taken: 0, counter: 0 });
      expect(ev.some((x) => x.t === 'phase')).toBe(false);
    }
    // Wcześniej: 8 kontr → Czar 38, faza 3, pnącza 0 bez żadnego usunięcia.
    expect([s.czar, s.phase, s.vines]).toEqual([78, 2, 2]);
    applyPlayerAttack(s, BOSS, 'attack', 'correct', HERO);
    applyPlayerAttack(s, BOSS, 'attack', 'correct', HERO);
    expect(s.vines).toBe(0);
    // Bez pnączy kontra znów działa.
    expect(firstEnemyHit(applyEnemyHit(s, BOSS, { kind: 'normal', hits: 1 }, 'fast', HERO)).counter).toBe(5);
    expect(s.czar).toBe(73);
  });

  it('ratunek zachowuje fazę i pnącza', () => {
    const s = startCombat(BOSS, HERO, { czar: 81 });
    applyPlayerAttack(s, BOSS, 'attack', 'correct', HERO);
    s.heroHp = 0;
    rescue(s);
    expect([s.czar, s.phase, s.vines, s.heroHp]).toEqual([71, 2, 2, 100]);
  });

  it('progi faz skalują się z Czarem', () => {
    expect(phaseThresholds(BOSS)).toEqual([120, 80, 40]);
    const big: EnemyDef = { ...BOSS, czar: 144 };
    expect(phaseThresholds(big)).toEqual([144, 96, 48]);
    expect(phaseForCzar(big, 97)).toBe(1);
    expect(phaseForCzar(big, 96)).toBe(2);
    expect(phaseForCzar(big, 48)).toBe(3);
    expect(phaseThresholds(SLIM)).toEqual([]);
    expect(phaseForCzar(SLIM, 1)).toBe(1);
  });
});

describe('właściwości walki (fast-check)', () => {
  const resultArb = fc.constantFrom(...RESULTS);
  const enemyArb = fc.constantFrom(SLIM, TRZ, GRZ, BOSS);
  const heroArb = fc.record({
    maxHp: fc.constantFrom(100, 120),
    attackBonus: fc.constantFrom(0, 3),
    defenseBoost: fc.record({ defend: fc.constantFrom(0, 0.2), strongDefend: fc.constantFrom(0, 0.2) }),
    shieldCharges: fc.constantFrom(0, 1),
  });

  it('niezmienniki i zawsze koniec walki, gdy co 4. atak jest poprawny', () => {
    fc.assert(
      fc.property(
        enemyArb,
        heroArb,
        fc.array(resultArb, { minLength: 1, maxLength: 40 }),
        fc.array(resultArb, { minLength: 1, maxLength: 40 }),
        fc.boolean(),
        (enemy, h, atk, def, useStrong) => {
          const s = startCombat(enemy, h);
          let turns = 0;
          let prevCzar = s.czar;
          let prevPhase = s.phase;
          while (!s.won && turns < 300) {
            turns++;
            const r = turns % 4 === 0 ? 'correct' : (atk[turns % atk.length] as QteResult);
            const action: ActionKind =
              useStrong && availableActions(s, ['attack', 'strongAttack']).includes('strongAttack')
                ? 'strongAttack'
                : 'attack';
            applyPlayerAttack(s, enemy, action, r, h);
            if (!s.won) enemyTurn(s, enemy, def[turns % def.length] as QteResult, h);
            expect(s.czar).toBeLessThanOrEqual(prevCzar);
            expect(s.czar).toBeGreaterThanOrEqual(0);
            expect(s.phase).toBeGreaterThanOrEqual(prevPhase);
            expect(s.vines).toBeGreaterThanOrEqual(0);
            expect(s.heroHp).toBeGreaterThan(0);
            expect(s.heroHp).toBeLessThanOrEqual(s.heroMaxHp);
            expect(s.shieldCharges).toBeGreaterThanOrEqual(0);
            expect(s.won).toBe(s.czar === 0);
            prevCzar = s.czar;
            prevPhase = s.phase;
          }
          expect(s.won).toBe(true);
          expect(s.log.filter((x) => x.t === 'transformed')).toHaveLength(1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('spójność stanu przy dowolnej kolejności wywołań (faza z Czaru, pnącza chronią bossa, log, brak mutacji wejść)', () => {
    // Boss przeskalowany jak scaledEnemy(…, 3).
    const BIG: EnemyDef = {
      ...BOSS,
      czar: 144,
      phases: (BOSS.phases ?? []).map((p, i) => ({ ...p, czarFrom: [144, 96, 48][i] ?? p.czarFrom })),
    };
    const opArb = fc.tuple(fc.constantFrom('atk', 'strong', 'enemy', 'end', 'rescue'), resultArb);
    const resumeArb = fc.option(
      fc.record({
        czar: fc.option(fc.integer({ min: -5, max: 200 }), { nil: undefined }),
        phase: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
      }),
      { nil: undefined },
    );
    fc.assert(
      fc.property(
        fc.constantFrom(SLIM, TRZ, GRZ, BOSS, BIG),
        heroArb,
        resumeArb,
        fc.array(opArb, { maxLength: 80 }),
        (enemy, h, resume, ops) => {
          const enemySnap = JSON.stringify(enemy);
          const heroSnap = JSON.stringify(h);
          const s = startCombat(enemy, h, resume);
          expect(s.phase).toBe(phaseForCzar(enemy, s.czar, s.maxCzar));
          let returned = 0;
          for (const [op, r] of ops) {
            const before = { czar: s.czar, phase: s.phase, vines: s.vines };
            if (op === 'atk' || op === 'strong') {
              returned += applyPlayerAttack(s, enemy, op === 'atk' ? 'attack' : 'strongAttack', r, h).length;
            } else if (op === 'enemy') {
              for (const intent of enemyIntents(s, enemy)) returned += applyEnemyHit(s, enemy, intent, r, h).length;
            } else if (op === 'end') {
              endEnemyTurn(s);
            } else {
              rescue(s);
              returned += 1; // 'rescued' trafia tylko do logu
            }
            expect(s.czar).toBeLessThanOrEqual(before.czar);
            expect(s.won).toBe(s.czar === 0);
            if (!s.won) expect(s.phase).toBe(phaseForCzar(enemy, s.czar, s.maxCzar));
            // Pnącza blokują KAŻDE obrażenia bossa (types.ts: BossPhaseDef.vines).
            if (before.vines > 0) expect(s.czar).toBe(before.czar);
            expect(s.vines).toBeLessThanOrEqual(Math.max(before.vines, ...(enemy.phases ?? []).map((p) => p.vines)));
            expect(Number.isInteger(s.heroHp) && s.heroHp >= 0 && s.heroHp <= s.heroMaxHp).toBe(true);
          }
          expect(s.log).toHaveLength(returned);
          expect(JSON.stringify(enemy)).toBe(enemySnap);
          expect(JSON.stringify(h)).toBe(heroSnap);
        },
      ),
      { numRuns: 1500 },
    );
  });
});
