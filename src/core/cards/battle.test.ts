import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import type { CardBattleState, CardDef, CombatEvent, EnemyDef, HeroStats, OwnedCreature, QteResult } from '../types';
import { enemyIntents, phaseForCzar } from '../combat/combat';
import {
  canPlay,
  cardPowerText,
  endPlayerTurn,
  isAttackCard,
  isCardHeroDown,
  levelBoostFor,
  playCard,
  playableUids,
  previewCard,
  rescueHero,
  startCardBattle,
} from './battle';
import type { CardBattleResume } from './battle';
import { HAND_SIZE, MAX_ENERGY, MAX_WEAKEN } from './constants';
import { buildDeck } from './deck';
import { intentHitDamage, intentView, weakenedHit } from './intents';
import { BOSS, CARD_DEFS, GRZ, RESULTS, SLIM, STARTER_OWNED, TRZ, deckOf, hero, totalCards, uidInHand } from './testkit';

const HERO = hero();
const STARTER_DECK = buildDeck(STARTER_OWNED, CARD_DEFS);
const STARTER_FULL = deckOf(['cios-plusika', 5], ['tarcza-z-lisci', 3]);

/** Walka z własnym Rng i skrótami do zagrań. */
interface Battle {
  s: CardBattleState;
  rng: Rng;
  play(cardId: string, result?: QteResult, opts?: { hero?: HeroStats; boost?: number }): CombatEvent[];
  end(): CombatEvent[];
}

function battle(
  enemy: EnemyDef,
  deck: readonly string[],
  opts: { seed?: number; resume?: CardBattleResume; hero?: HeroStats } = {},
): Battle {
  const rng = createRng(opts.seed ?? 1);
  const h = opts.hero ?? HERO;
  const s = startCardBattle({ enemy, hero: h, deck, rng, resume: opts.resume, cards: CARD_DEFS });
  return {
    s,
    rng,
    play(cardId, result = 'correct', o = {}) {
      const uid = uidInHand(s, cardId);
      if (uid === undefined) throw new Error(`brak ${cardId} na ręce`);
      return playCard({ state: s, uid, result, enemy, hero: o.hero ?? h, cards: CARD_DEFS, boost: o.boost });
    },
    end() {
      return endPlayerTurn({ state: s, enemy, hero: h, rng });
    },
  };
}

const hits = (ev: CombatEvent[]) => ev.filter((e) => e.t === 'playerHit');
const enemyHits = (ev: CombatEvent[]) => ev.filter((e) => e.t === 'enemyHit');
const uidsOf = (s: CardBattleState) => [...s.drawPile, ...s.hand, ...s.discard].map((c) => c.uid);

/** Obrażenia jednej karty (suma ciosów) dla każdego wyniku z RESULTS. */
function damageByResult(cardId: string, opts: { hero?: HeroStats; boost?: number } = {}): number[] {
  return RESULTS.map((r) => {
    const b = battle(SLIM, deckOf([cardId, 4]), { hero: opts.hero });
    const ev = b.play(cardId, r, opts);
    return hits(ev).reduce((a, e) => a + (e.t === 'playerHit' ? e.damage : 0), 0);
  });
}

/**
 * Dziecko z prostą strategią: najpierw karty ataku (od najsilniejszej), potem reszta, aż zabraknie energii;
 * potem „Koniec tury”; HP 0 → ratunek. Zwraca stan i liczbę ratunków.
 */
function fight(
  enemy: EnemyDef,
  deck: readonly string[],
  seed: number,
  answer: (n: number) => QteResult,
  opts: { hero?: HeroStats; resume?: CardBattleResume; maxTurns?: number } = {},
): { s: CardBattleState; rescues: number; phases: Set<number> } {
  const h = opts.hero ?? HERO;
  const rng = createRng(seed);
  const s = startCardBattle({ enemy, hero: h, deck, rng, resume: opts.resume, cards: CARD_DEFS });
  const phases = new Set<number>([s.combat.phase]);
  let n = 0;
  let rescues = 0;
  const strength = (uid: string): number => {
    const def = CARD_DEFS[s.hand.find((c) => c.uid === uid)?.cardId ?? ''] as CardDef;
    const p = previewCard(def, h);
    return isAttackCard(def.kind) ? 1000 + p.damage * p.hits : p.shield + p.heal;
  };
  while (!s.combat.won) {
    if (s.turnNo > (opts.maxTurns ?? 500)) throw new Error('walka się nie kończy');
    for (;;) {
      const uids = playableUids(s, CARD_DEFS).sort((a, b) => strength(b) - strength(a));
      const uid = uids[0];
      if (uid === undefined) break;
      playCard({ state: s, uid, result: answer(n++), enemy, hero: h, cards: CARD_DEFS });
      phases.add(s.combat.phase);
      if (s.combat.won) break;
    }
    if (s.combat.won) break;
    endPlayerTurn({ state: s, enemy, hero: h, rng });
    if (isCardHeroDown(s)) {
      rescueHero(s);
      rescues++;
    }
  }
  return { s, rescues, phases };
}

describe('startCardBattle', () => {
  it('stan początkowy: tasowanie, ręka 4, energia 2, zapowiedź', () => {
    const s = startCardBattle({ enemy: SLIM, hero: HERO, deck: STARTER_DECK, rng: createRng(7) });
    const expected = createRng(7).shuffle(STARTER_DECK.map((cardId, i) => ({ uid: `c${i + 1}`, cardId })));
    expect([...s.hand, ...s.drawPile]).toEqual(expected);
    expect(s.hand).toHaveLength(HAND_SIZE);
    expect(s.drawPile).toHaveLength(2);
    expect(s.discard).toEqual([]);
    expect([s.energy, s.maxEnergy, s.shield, s.weaken, s.turnNo, s.uidCounter]).toEqual([MAX_ENERGY, MAX_ENERGY, 0, 0, 1, 6]);
    expect(uidsOf(s).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(s.intents).toEqual([{ kind: 'normal', hits: 1 }]);
    expect(s.combat).toMatchObject({ enemyId: 'slimakorro', czar: 30, maxCzar: 30, heroHp: 100, heroMaxHp: 100, enemyTurn: 1, won: false, log: [] });
  });

  it('deterministyczna dla ziarna; inne ziarna tasują inaczej', () => {
    const run = (seed: number) => JSON.stringify(fight(GRZ, STARTER_FULL, seed, (n) => RESULTS[n % RESULTS.length] as QteResult).s);
    expect(run(42)).toBe(run(42));
    const hands = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(battle(SLIM, STARTER_FULL, { seed }).s.hand)));
    expect(hands.size).toBeGreaterThan(1);
  });

  it('pusta talia → RangeError; nieznane karty pomijane, gdy podano definicje', () => {
    expect(() => startCardBattle({ enemy: SLIM, hero: HERO, deck: [], rng: createRng(1) })).toThrow(RangeError);
    expect(() =>
      startCardBattle({ enemy: SLIM, hero: HERO, deck: ['nie-ma'], rng: createRng(1), cards: CARD_DEFS }),
    ).toThrow(RangeError);
    const s = startCardBattle({ enemy: SLIM, hero: HERO, deck: ['nie-ma', 'cios-plusika'], rng: createRng(1), cards: CARD_DEFS });
    expect(s.hand).toEqual([{ uid: 'c1', cardId: 'cios-plusika' }]);
  });

  it('nie zmienia wejść (talia, wróg, bohater)', () => {
    const deck = STARTER_FULL.slice();
    const snap = JSON.stringify([deck, BOSS, HERO]);
    fight(BOSS, deck, 3, () => 'correct');
    expect(JSON.stringify([deck, BOSS, HERO])).toBe(snap);
  });
});

describe('wznowienie (GDD 7.5: postęp się nie cofa)', () => {
  it('Czar, faza, pnącza i HP z zapisu', () => {
    const b = battle(BOSS, STARTER_DECK, { resume: { czar: 70, phase: 2, vines: 1, heroHp: 42 } });
    expect([b.s.combat.czar, b.s.combat.phase, b.s.combat.vines, b.s.combat.heroHp]).toEqual([70, 2, 1, 42]);
  });

  it('pnącza przycinane do fazy; bez pnączy w zapisie = 0 (stary zapis)', () => {
    const v = (resume: CardBattleResume) => battle(BOSS, STARTER_DECK, { resume }).s.combat.vines;
    expect(v({ czar: 70, phase: 2, vines: 5 })).toBe(2);
    expect(v({ czar: 70, phase: 2, vines: -1 })).toBe(0);
    expect(v({ czar: 30, phase: 3, vines: 2 })).toBe(0);
    expect(v({ czar: 70, phase: 2 })).toBe(0);
    expect(v({ czar: 70, phase: 2, vines: Number.NaN })).toBe(0);
    // Tylko HP (nowa walka) — pnącza fazy 1 bossa = 0, Czar pełny.
    const fresh = battle(BOSS, STARTER_DECK, { resume: { heroHp: 30 } }).s.combat;
    expect([fresh.czar, fresh.phase, fresh.vines, fresh.heroHp]).toEqual([120, 1, 0, 30]);
    // Faza z zapisu wyższa niż z Czaru → Czar przycięty do progu fazy (jak startCombat).
    const up = battle(BOSS, STARTER_DECK, { resume: { czar: 100, phase: 2, vines: 2 } }).s.combat;
    expect([up.czar, up.phase, up.vines]).toEqual([80, 2, 2]);
  });

  it('HP: null/undefined/≤ 0 = pełne, inaczej 1..max', () => {
    const hp = (heroHp: number | null | undefined) => battle(SLIM, STARTER_DECK, { resume: { heroHp } }).s.combat.heroHp;
    expect([hp(null), hp(undefined), hp(0), hp(-5), hp(Number.NaN), hp(500), hp(0.3), hp(57.6)]).toEqual([
      100, 100, 100, 100, 100, 100, 1, 58,
    ]);
    // Pancerz: maks. HP z bohatera.
    expect(battle(SLIM, STARTER_DECK, { hero: hero({ maxHp: 120 }), resume: { heroHp: 110 } }).s.combat.heroHp).toBe(110);
  });
});

describe('canPlay i energia', () => {
  it('koszt, energia, brak karty, koniec walki', () => {
    const b = battle(GRZ, deckOf(['podwojny-dziob', 2], ['cios-plusika', 2]));
    const dziob = uidInHand(b.s, 'podwojny-dziob') as string;
    expect(canPlay(b.s, dziob, CARD_DEFS)).toEqual({ ok: true, reason: null });
    expect(canPlay(b.s, 'zzz', CARD_DEFS)).toEqual({ ok: false, reason: 'notInHand' });
    b.play('cios-plusika');
    expect(b.s.energy).toBe(1);
    expect(canPlay(b.s, dziob, CARD_DEFS)).toEqual({ ok: false, reason: 'energy' });
    expect(() => playCard({ state: b.s, uid: dziob, result: 'correct', enemy: GRZ, hero: HERO, cards: CARD_DEFS })).toThrow();
    expect(playableUids(b.s, CARD_DEFS)).toEqual([uidInHand(b.s, 'cios-plusika')]);
    b.play('cios-plusika');
    expect(b.s.energy).toBe(0);
    expect(playableUids(b.s, CARD_DEFS)).toEqual([]);
    b.end();
    expect(b.s.energy).toBe(2);
    b.play('podwojny-dziob');
    expect([b.s.energy, b.s.combat.czar, b.s.combat.won]).toEqual([0, 4, false]);
    // Karta z odrzuconych nie jest na ręce.
    expect(canPlay(b.s, dziob, CARD_DEFS).reason).toBe(b.s.hand.some((c) => c.uid === dziob) ? 'energy' : 'notInHand');
  });

  it('nieznana definicja karty na ręce = niedostępna', () => {
    const s = startCardBattle({ enemy: SLIM, hero: HERO, deck: ['cios-plusika', 'dziwna'], rng: createRng(1) });
    const odd = s.hand.find((c) => c.cardId === 'dziwna')?.uid as string;
    expect(canPlay(s, odd, CARD_DEFS)).toEqual({ ok: false, reason: 'notInHand' });
  });
});

describe('siła kart wg wyniku (tabela 7.3)', () => {
  // RESULTS = fast, correct, late, wrong, timeout, retryCorrect
  it('atak i mocny atak; premia broni raz na kartę; min. 1', () => {
    expect(damageByResult('cios-plusika')).toEqual([10, 8, 6, 2, 2, 6]);
    expect(damageByResult('podwojny-dziob')).toEqual([24, 20, 14, 6, 4, 16]);
    expect(damageByResult('cios-plusika', { hero: hero({ attackBonus: 3 }) })).toEqual([13, 11, 8, 3, 2, 9]);
    const weak: CardDef = { ...(CARD_DEFS['cios-plusika'] as CardDef), id: 'slaby', power: 1 };
    const cards = { ...CARD_DEFS, slaby: weak };
    for (const r of RESULTS) {
      const s = startCardBattle({ enemy: SLIM, hero: HERO, deck: ['slaby'], rng: createRng(1) });
      const ev = playCard({ state: s, uid: 'c1', result: r, enemy: SLIM, hero: HERO, cards });
      expect(hits(ev)[0]).toMatchObject({ damage: 1 });
      expect(s.combat.czar).toBe(29);
    }
  });

  it('wzmocnienie poziomu 3 (×1,25)', () => {
    expect(damageByResult('cios-plusika', { boost: 1.25 })).toEqual([12, 10, 7, 3, 2, 8]);
    // Zła wartość wzmocnienia → 1.
    expect(damageByResult('cios-plusika', { boost: Number.NaN })).toEqual([10, 8, 6, 2, 2, 6]);
    expect(damageByResult('cios-plusika', { boost: -2 })).toEqual([10, 8, 6, 2, 2, 6]);
  });

  it('zdarzenie ciosu: akcja z puli karty, krytyk tylko przy „szybko”', () => {
    const b = battle(SLIM, deckOf(['cios-plusika', 2], ['podwojny-dziob', 2]));
    expect(b.play('cios-plusika', 'fast')).toEqual([
      { t: 'playerHit', action: 'attack', result: 'fast', damage: 10, crit: true, vineRemoved: false },
    ]);
    b.end();
    expect(hits(b.play('podwojny-dziob', 'correct'))).toEqual([
      { t: 'playerHit', action: 'strongAttack', result: 'correct', damage: 20, crit: false, vineRemoved: false },
    ]);
  });

  it('tarcze, leczenie, osłabienie, atak + tarcza', () => {
    const shieldOf = (id: string) =>
      RESULTS.map((r) => {
        const b = battle(SLIM, deckOf([id, 4]));
        b.play(id, r);
        return b.s.shield;
      });
    expect(shieldOf('tarcza-z-lisci')).toEqual([10, 8, 6, 2, 2, 6]);
    expect(shieldOf('tarcza-dopelniaka')).toEqual([14, 12, 8, 4, 2, 10]);
    expect(shieldOf('koniczynowa-tarcza')).toEqual([26, 22, 15, 7, 4, 18]);
    const healOf = RESULTS.map((r) => {
      const b = battle(SLIM, deckOf(['perlowy-zdroj', 4]), { resume: { heroHp: 50 } });
      b.play('perlowy-zdroj', r);
      return b.s.combat.heroHp - 50;
    });
    expect(healOf).toEqual([18, 15, 11, 5, 3, 12]);
    const weakenOf = RESULTS.map((r) => {
      const b = battle(SLIM, deckOf(['lepka-kokarda', 4]));
      b.play('lepka-kokarda', r);
      return b.s.weaken;
    });
    expect(weakenOf).toEqual([0.6, 0.5, 0.35, 0.15, 0.1, 0.4]);
    const combo = RESULTS.map((r) => {
      const b = battle(SLIM, deckOf(['krolewski-bukiet', 4]));
      b.play('krolewski-bukiet', r);
      return [30 - b.s.combat.czar, b.s.shield];
    });
    expect(combo).toEqual([
      [17, 12],
      [14, 10],
      [10, 7],
      [4, 3],
      [3, 2],
      [11, 8],
    ]);
  });
});

describe('efekty kart', () => {
  it('tarcza pochłania dokładnie i znika po turze brainrota', () => {
    const b = battle(SLIM, deckOf(['tarcza-z-lisci', 4]));
    expect(b.play('tarcza-z-lisci')).toEqual([{ t: 'shieldGain', amount: 8, result: 'correct' }]);
    expect(b.end()).toEqual([
      { t: 'shieldAbsorb', absorbed: 8 },
      { t: 'enemyHit', intent: 'normal', result: 'correct', raw: 10, taken: 2, blockedPct: 0.8, counter: 0, shieldUsed: false },
    ]);
    expect([b.s.combat.heroHp, b.s.shield]).toEqual([98, 0]);
    // Dwie tarcze (16) na cios 10: nic nie przechodzi, nadmiar nie przechodzi na następną turę.
    b.play('tarcza-z-lisci');
    b.play('tarcza-z-lisci');
    expect(b.s.shield).toBe(16);
    const ev = b.end();
    expect(enemyHits(ev)).toEqual([
      { t: 'enemyHit', intent: 'normal', result: 'correct', raw: 10, taken: 0, blockedPct: 1, counter: 0, shieldUsed: false },
    ]);
    expect([b.s.combat.heroHp, b.s.shield]).toEqual([98, 0]);
    // Bez tarczy: brak zdarzenia pochłonięcia.
    expect(b.end().map((e) => e.t)).toEqual(['enemyHit']);
    expect(b.s.combat.heroHp).toBe(88);
  });

  it('tarcza na podwójny cios: pochłania po kolei', () => {
    const b = battle(TRZ, deckOf(['tarcza-z-lisci', 4]));
    b.end(); // tura 1: Cios 8
    b.play('tarcza-z-lisci');
    const ev = b.end(); // tura 2: 2 × cios 6
    expect(ev).toEqual([
      { t: 'shieldAbsorb', absorbed: 6 },
      { t: 'enemyHit', intent: 'normal', result: 'correct', raw: 6, taken: 0, blockedPct: 1, counter: 0, shieldUsed: false },
      { t: 'shieldAbsorb', absorbed: 2 },
      { t: 'enemyHit', intent: 'normal', result: 'correct', raw: 6, taken: 4, blockedPct: 2 / 6, counter: 0, shieldUsed: false },
    ]);
    expect(b.s.combat.heroHp).toBe(100 - 8 - 4);
  });

  it('osłabienie: −50% następnego ruchu, potem znika; nie sumuje się (liczy się silniejsze)', () => {
    const b = battle(SLIM, deckOf(['lepka-kokarda', 4]));
    expect(b.play('lepka-kokarda')).toEqual([{ t: 'weaken', pct: 0.5, result: 'correct' }]);
    expect(intentView(b.s, SLIM).text).toBe('Cios 5');
    expect(enemyHits(b.end())[0]).toMatchObject({ raw: 10, taken: 5 });
    expect(b.s.weaken).toBe(0);
    expect(intentView(b.s, SLIM).text).toBe('Cios 10');
    // Błędna odpowiedź: 15% → 8,5 → 9.
    b.play('lepka-kokarda', 'wrong');
    expect(enemyHits(b.end())[0]).toMatchObject({ raw: 10, taken: 9 });
    // Dwie karty: silniejsze osłabienie zostaje.
    b.play('lepka-kokarda', 'fast');
    expect(b.play('lepka-kokarda', 'wrong')).toEqual([{ t: 'weaken', pct: 0.6, result: 'wrong' }]);
    expect(b.s.weaken).toBe(0.6);
    expect(enemyHits(b.end())[0]).toMatchObject({ taken: 4 });
  });

  it('osłabienie + tarcza; osłabienie maks. 90%', () => {
    const b = battle(SLIM, ['lepka-kokarda', 'tarcza-z-lisci']);
    b.play('lepka-kokarda');
    b.play('tarcza-z-lisci');
    expect(b.end()).toEqual([
      { t: 'shieldAbsorb', absorbed: 5 },
      { t: 'enemyHit', intent: 'normal', result: 'correct', raw: 10, taken: 0, blockedPct: 1, counter: 0, shieldUsed: false },
    ]);
    const huge: CardDef = { ...(CARD_DEFS['lepka-kokarda'] as CardDef), id: 'mega', power: 100 };
    const s = startCardBattle({ enemy: SLIM, hero: HERO, deck: ['mega'], rng: createRng(1) });
    playCard({ state: s, uid: 'c1', result: 'fast', enemy: SLIM, hero: HERO, cards: { mega: huge } });
    expect(s.weaken).toBe(MAX_WEAKEN);
    expect(intentView(s, SLIM).text).toBe('Cios 1');
  });

  it('leczenie do maks. HP; zdarzenie = faktycznie dodane HP', () => {
    const b = battle(SLIM, deckOf(['perlowy-zdroj', 4]), { resume: { heroHp: 90 } });
    expect(b.play('perlowy-zdroj')).toEqual([{ t: 'heal', amount: 10, result: 'correct' }]);
    expect(b.s.combat.heroHp).toBe(100);
    expect(b.play('perlowy-zdroj')).toEqual([{ t: 'heal', amount: 0, result: 'correct' }]);
    expect(b.s.combat.heroHp).toBe(100);
  });

  it('kilka ciosów: 3 × 4 bez premii broni; seria kończy się przy przemianie', () => {
    const b = battle(SLIM, deckOf(['brokatowy-roj', 4]), { hero: hero({ attackBonus: 3 }) });
    const ev = b.play('brokatowy-roj');
    expect(hits(ev)).toHaveLength(3);
    expect(hits(ev).every((e) => e.t === 'playerHit' && e.damage === 4 && e.action === 'attack')).toBe(true);
    expect(b.s.combat.czar).toBe(18);
    expect(hits(b.play('brokatowy-roj', 'wrong')).map((e) => (e.t === 'playerHit' ? e.damage : -1))).toEqual([1, 1, 1]);
    expect(b.s.combat.czar).toBe(15);

    const k = battle(SLIM, deckOf(['brokatowy-roj', 4]), { resume: { czar: 5 } });
    const kill = k.play('brokatowy-roj');
    expect(kill.map((e) => e.t)).toEqual(['playerHit', 'playerHit', 'transformed']);
    expect([k.s.combat.czar, k.s.combat.won]).toEqual([0, true]);
    expect(k.s.intents).toEqual([]);
  });

  it('kilka ciosów: pnącza, które pojawią się w trakcie serii, zatrzymują ją', () => {
    const b = battle(BOSS, deckOf(['brokatowy-roj', 4]), { resume: { czar: 84 } });
    const ev = b.play('brokatowy-roj');
    expect(ev).toEqual([
      { t: 'playerHit', action: 'attack', result: 'correct', damage: 4, crit: false, vineRemoved: false },
      { t: 'phase', phase: 2, vines: 2 },
    ]);
    expect([b.s.combat.czar, b.s.combat.phase, b.s.combat.vines]).toEqual([80, 2, 2]);
  });

  it('atak + tarcza: Czar i tarcza z jednej karty (koszt 2)', () => {
    const b = battle(SLIM, deckOf(['krolewski-bukiet', 2], ['cios-plusika', 2]), { hero: hero({ attackBonus: 3 }) });
    expect(b.play('krolewski-bukiet')).toEqual([
      { t: 'playerHit', action: 'strongAttack', result: 'correct', damage: 17, crit: false, vineRemoved: false },
      { t: 'shieldGain', amount: 10, result: 'correct' },
    ]);
    expect([b.s.combat.czar, b.s.shield, b.s.energy]).toEqual([13, 10, 0]);
    expect(canPlay(b.s, uidInHand(b.s, 'cios-plusika') as string, CARD_DEFS).reason).toBe('energy');
  });

  it('zdarzenia trafiają do logu walki w kolejności', () => {
    const b = battle(TRZ, STARTER_FULL, { seed: 5 });
    const all: CombatEvent[] = [];
    for (let t = 0; t < 4; t++) {
      const uid = playableUids(b.s, CARD_DEFS)[0];
      if (uid !== undefined) all.push(...playCard({ state: b.s, uid, result: 'correct', enemy: TRZ, hero: HERO, cards: CARD_DEFS }));
      all.push(...b.end());
    }
    expect(b.s.combat.log).toEqual(all);
  });
});

describe('boss: fazy i pnącza', () => {
  it('pnącza blokują obrażenia; poprawna karta ataku usuwa jedno, błędna — nic', () => {
    const b = battle(BOSS, ['cios-plusika', 'cios-plusika', 'brokatowy-roj', 'krolewski-bukiet'], { resume: { czar: 85 } });
    expect(b.play('cios-plusika')).toEqual([
      { t: 'playerHit', action: 'attack', result: 'correct', damage: 8, crit: false, vineRemoved: false },
      { t: 'phase', phase: 2, vines: 2 },
    ]);
    expect(b.play('cios-plusika', 'wrong')).toEqual([
      { t: 'playerHit', action: 'attack', result: 'wrong', damage: 0, crit: false, vineRemoved: false },
    ]);
    expect([b.s.combat.czar, b.s.combat.vines]).toEqual([77, 2]);
    b.end();
    // Kilka ciosów usuwa tylko JEDNO pnącze i nie rani bossa.
    expect(b.play('brokatowy-roj')).toEqual([
      { t: 'playerHit', action: 'attack', result: 'correct', damage: 0, crit: false, vineRemoved: true },
    ]);
    expect(b.play('cios-plusika', 'late')).toEqual([
      { t: 'playerHit', action: 'attack', result: 'late', damage: 0, crit: false, vineRemoved: true },
    ]);
    expect([b.s.combat.czar, b.s.combat.vines]).toEqual([77, 0]);
    b.end();
    b.play('krolewski-bukiet');
    expect([b.s.combat.czar, b.s.shield]).toEqual([63, 10]);
  });

  it('atak + tarcza przy pnączach: usuwa pnącze i daje tarczę; tarcza nie rusza pnączy', () => {
    const b = battle(BOSS, ['krolewski-bukiet', 'tarcza-z-lisci'], { resume: { czar: 70, phase: 2, vines: 2 } });
    b.play('tarcza-z-lisci');
    expect(b.s.combat.vines).toBe(2);
    b.end();
    expect(b.play('krolewski-bukiet', 'retryCorrect')).toEqual([
      { t: 'playerHit', action: 'strongAttack', result: 'retryCorrect', damage: 0, crit: false, vineRemoved: true },
      { t: 'shieldGain', amount: 8, result: 'retryCorrect' },
    ]);
    expect([b.s.combat.czar, b.s.combat.vines]).toEqual([70, 1]);
    // Błędna odpowiedź przy pnączach: tarcza z bukietu i tak jest (30%).
    b.end();
    expect(b.play('krolewski-bukiet', 'timeout')).toEqual([
      { t: 'playerHit', action: 'strongAttack', result: 'timeout', damage: 0, crit: false, vineRemoved: false },
      { t: 'shieldGain', amount: 2, result: 'timeout' },
    ]);
  });

  it('wznowienie z pnączami: najpierw pnącza, potem obrażenia', () => {
    const b = battle(BOSS, deckOf(['cios-plusika', 4]), { resume: { czar: 70, phase: 2, vines: 1 } });
    expect(hits(b.play('cios-plusika'))[0]).toMatchObject({ damage: 0, vineRemoved: true });
    expect(hits(b.play('cios-plusika'))[0]).toMatchObject({ damage: 8, vineRemoved: false });
    expect(b.s.combat.czar).toBe(62);
  });

  it('pełna walka: fazy 1 → 2 → 3, pnącza, mocne ciosy w fazie 3', () => {
    const deck = buildDeck({ 'cios-plusika': 3, 'podwojny-dziob': 2, 'tarcza-z-lisci': 3, 'tarcza-dopelniaka': 2 }, CARD_DEFS);
    const { s, phases } = fight(BOSS, deck, 11, () => 'correct');
    expect(s.combat.won).toBe(true);
    expect([...phases].sort()).toEqual([1, 2, 3]);
    const log = s.combat.log;
    expect(log.filter((e) => e.t === 'phase').map((e) => (e.t === 'phase' ? e.phase : 0))).toEqual([2, 3]);
    expect(log.filter((e) => e.t === 'playerHit' && e.vineRemoved)).toHaveLength(2);
    expect(log.filter((e) => e.t === 'transformed')).toHaveLength(1);
  });

  it('faza 3: „Mocny cios 24” w parzystych turach', () => {
    const b = battle(BOSS, deckOf(['tarcza-z-lisci', 4]), { resume: { czar: 40, phase: 3 } });
    expect(enemyHits(b.end())[0]).toMatchObject({ intent: 'normal', raw: 12, taken: 12 });
    expect(intentView(b.s, BOSS).text).toBe('Mocny cios 24');
    expect(enemyHits(b.end())[0]).toMatchObject({ intent: 'strong', raw: 24, taken: 24 });
  });
});

describe('tury, ręka, tasowanie', () => {
  it('ręka uzupełnia się do 4, energia wraca do 2, numer tury rośnie', () => {
    const b = battle(SLIM, STARTER_FULL);
    const first = playableUids(b.s, CARD_DEFS);
    for (const uid of first.slice(0, 2)) playCard({ state: b.s, uid, result: 'correct', enemy: SLIM, hero: HERO, cards: CARD_DEFS });
    expect([b.s.hand.length, b.s.drawPile.length, b.s.discard.length, b.s.energy]).toEqual([2, 4, 2, 0]);
    b.end();
    expect([b.s.hand.length, b.s.drawPile.length, b.s.discard.length, b.s.energy, b.s.turnNo]).toEqual([4, 2, 2, 2, 2]);
    expect(b.s.combat.enemyTurn).toBe(2);
    // Ręka zostaje (bez odrzucania na koniec tury).
    const kept = b.s.hand.slice(0, 2);
    b.end();
    expect(b.s.hand.slice(0, 2)).toEqual(kept);
  });

  it('pusty stos dobierania → przetasowanie odrzuconych', () => {
    const b = battle(SLIM, STARTER_DECK, { seed: 9 });
    const playTwo = () => {
      for (const uid of playableUids(b.s, CARD_DEFS).slice(0, 2)) {
        playCard({ state: b.s, uid, result: 'wrong', enemy: SLIM, hero: HERO, cards: CARD_DEFS });
      }
    };
    playTwo();
    b.end(); // 2 z dobierania
    expect([b.s.hand.length, b.s.drawPile.length, b.s.discard.length]).toEqual([4, 0, 2]);
    playTwo();
    expect(b.s.discard).toHaveLength(4);
    const discarded = b.s.discard.map((c) => c.uid).sort();
    b.end(); // dobieranie puste → tasujemy 4 odrzucone, dobieramy 2
    expect([b.s.hand.length, b.s.drawPile.length, b.s.discard.length]).toEqual([4, 2, 0]);
    expect([...b.s.drawPile, ...b.s.hand.slice(2)].map((c) => c.uid).sort()).toEqual(discarded);
    expect(new Set(uidsOf(b.s)).size).toBe(6);
  });

  it('mała talia: gdy oba stosy puste — ręka niepełna, bez błędu', () => {
    const b = battle(SLIM, ['cios-plusika', 'tarcza-z-lisci']);
    expect([b.s.hand.length, b.s.drawPile.length]).toEqual([2, 0]);
    b.play('cios-plusika');
    b.end();
    expect([b.s.hand.length, b.s.drawPile.length, b.s.discard.length]).toEqual([2, 0, 0]);
    b.end();
    expect(b.s.hand).toHaveLength(2);
  });
});

describe('zachowania brainrotów (GDD 13.3)', () => {
  it('Trzmielini: na zmianę „Cios 8” i „2 × cios 6”', () => {
    const b = battle(TRZ, deckOf(['tarcza-z-lisci', 4]));
    const taken = () => enemyHits(b.end()).map((e) => (e.t === 'enemyHit' ? e.taken : -1));
    expect([taken(), taken(), taken(), taken()]).toEqual([[8], [6, 6], [8], [6, 6]]);
    expect(b.s.combat.heroHp).toBe(100 - 8 - 12 - 8 - 12);
  });

  it('Grzybello: „Mocny cios 22” co 3. turę', () => {
    const b = battle(GRZ, deckOf(['tarcza-z-lisci', 4]));
    const ev = [b.end(), b.end(), b.end()].map((e) => enemyHits(e)[0]);
    expect(ev.map((e) => (e?.t === 'enemyHit' ? [e.intent, e.raw] : null))).toEqual([
      ['normal', 10],
      ['normal', 10],
      ['strong', 22],
    ]);
  });

  it('HP 0 → heroDown i koniec ciosów w tej turze; ratunek zachowuje postęp', () => {
    const b = battle(TRZ, deckOf(['cios-plusika', 8]));
    b.play('cios-plusika');
    b.end(); // tura 1: Cios 8
    b.s.combat.heroHp = 5;
    const czar = b.s.combat.czar;
    const ev = b.end(); // tura 2: 2 × cios 6 — pierwszy powala
    expect(ev).toEqual([
      { t: 'enemyHit', intent: 'normal', result: 'correct', raw: 6, taken: 6, blockedPct: 0, counter: 0, shieldUsed: false },
      { t: 'heroDown' },
    ]);
    expect(isCardHeroDown(b.s)).toBe(true);
    expect(b.s.combat.heroHp).toBe(0);
    // Tura i tak się zamyka: pełna energia i ręka, nowa zapowiedź.
    expect([b.s.energy, b.s.hand.length, b.s.turnNo]).toEqual([2, 4, 3]);
    // Leżący bohater nie gra kart, koniec tury nic nie robi.
    const uid = b.s.hand[0]?.uid as string;
    expect(canPlay(b.s, uid, CARD_DEFS)).toEqual({ ok: false, reason: 'over' });
    expect(() => b.play('cios-plusika')).toThrow();
    expect(b.end()).toEqual([]);
    expect(b.s.turnNo).toBe(3);
    // „Stworki cię ratują”.
    expect(rescueHero(b.s)).toEqual([{ t: 'rescued' }]);
    expect([b.s.combat.heroHp, b.s.combat.czar]).toEqual([100, czar]);
    expect(b.s.combat.log.at(-1)).toEqual({ t: 'rescued' });
    expect(canPlay(b.s, uid, CARD_DEFS).ok).toBe(true);
  });

  it('ratunek u bossa zachowuje Czar, fazę i pnącza', () => {
    const b = battle(BOSS, deckOf(['cios-plusika', 4]), { resume: { czar: 70, phase: 2, vines: 2, heroHp: 3 } });
    b.play('cios-plusika');
    b.end();
    expect(isCardHeroDown(b.s)).toBe(true);
    rescueHero(b.s);
    expect([b.s.combat.czar, b.s.combat.phase, b.s.combat.vines, b.s.combat.heroHp]).toEqual([70, 2, 1, 100]);
  });

  it('po przemianie: brak zagrań, koniec tury nic nie robi, brak zapowiedzi', () => {
    const b = battle(SLIM, deckOf(['podwojny-dziob', 4]), { resume: { czar: 20 } });
    expect(b.play('podwojny-dziob').map((e) => e.t)).toEqual(['playerHit', 'transformed']);
    expect(b.s.combat.won).toBe(true);
    expect(canPlay(b.s, b.s.hand[0]?.uid as string, CARD_DEFS)).toEqual({ ok: false, reason: 'over' });
    expect(() => b.play('podwojny-dziob')).toThrow();
    const snap = JSON.stringify(b.s);
    expect(b.end()).toEqual([]);
    expect(JSON.stringify(b.s)).toBe(snap);
    expect(intentView(b.s, SLIM)).toEqual({ text: '', kind: 'normal', total: 0 });
  });
});

describe('pełne walki (GDD 7.5: 3–5 tur)', () => {
  it('same poprawne odpowiedzi: Ślimakorro odczarowany w ≤ 3 turach talią startową (każde ziarno)', () => {
    for (const deck of [STARTER_DECK, STARTER_FULL]) {
      for (let seed = 1; seed <= 300; seed++) {
        const { s, rescues } = fight(SLIM, deck, seed, () => 'correct');
        expect(s.combat.won).toBe(true);
        expect(s.turnNo).toBeLessThanOrEqual(3);
        expect(rescues).toBe(0);
      }
    }
  });

  it('same błędne odpowiedzi też posuwają walkę (min. 1 Czaru na cios); ratunek, gdy trzeba', () => {
    for (const enemy of [SLIM, TRZ, GRZ]) {
      const { s } = fight(enemy, STARTER_DECK, 4, () => 'wrong');
      expect(s.combat.won).toBe(true);
    }
    // Boss: błędne odpowiedzi nie usuwają pnączy — co 3. odpowiedź poprawna wystarcza.
    const { s } = fight(BOSS, STARTER_DECK, 4, (n) => (n % 3 === 2 ? 'correct' : 'wrong'));
    expect(s.combat.won).toBe(true);
  });

  it('zwykła walka trwa kilka tur (poprawnie + czasem błąd)', () => {
    const turns = [SLIM, TRZ, GRZ].map((e) => fight(e, STARTER_DECK, 21, (n) => (n % 4 === 3 ? 'wrong' : 'correct')).s.turnNo);
    for (const t of turns) {
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThanOrEqual(6);
    }
  });
});

describe('levelBoostFor, podgląd karty', () => {
  const owned = (id: string, level: number): OwnedCreature => ({ id, level, fedCycle: -1, caughtAt: 0 });
  const def = (id: string) => CARD_DEFS[id] as CardDef;

  it('×1,25 dla kart stworka na poziomie 3 (także startowa karta Plusika)', () => {
    expect(levelBoostFor(def('cios-plusika'), [owned('plusik', 3)])).toBe(1.25);
    expect(levelBoostFor(def('cios-plusika'), [owned('plusik', 2)])).toBe(1);
    expect(levelBoostFor(def('cios-plusika'), [])).toBe(1);
    expect(levelBoostFor(def('tarcza-dopelniaka'), [owned('plusik', 3), owned('dopelniak', 3)])).toBe(1.25);
    expect(levelBoostFor(def('tarcza-z-lisci'), [owned('plusik', 3)])).toBe(1);
    // Karta brainglama nigdy (nawet gdy id brainrota = id stworka).
    expect(levelBoostFor(def('lepka-kokarda'), [owned('slimakorro', 3)])).toBe(1);
  });

  it('podgląd i tekst siły (100%)', () => {
    const texts = Object.values(CARD_DEFS).map((c) => [c.id, cardPowerText(c, HERO)]);
    expect(Object.fromEntries(texts)).toEqual({
      'cios-plusika': '8',
      'tarcza-z-lisci': '8',
      'tarcza-dopelniaka': '12',
      'podwojny-dziob': '20',
      'koniczynowa-tarcza': '22',
      'lepka-kokarda': '−50%',
      'brokatowy-roj': '3×4',
      'perlowy-zdroj': '+15',
      'krolewski-bukiet': '14+10',
    });
    expect(cardPowerText(def('cios-plusika'), hero({ attackBonus: 3 }), 1.25)).toBe('14');
    expect(cardPowerText(def('tarcza-dopelniaka'), HERO, 1.25)).toBe('15');
    expect(previewCard(def('krolewski-bukiet'), HERO)).toEqual({ damage: 14, hits: 1, shield: 10, heal: 0, weaken: 0 });
  });
});

describe('właściwości walki kartami (fast-check)', () => {
  const BIG: EnemyDef = {
    ...BOSS,
    czar: 144,
    phases: (BOSS.phases ?? []).map((p, i) => ({ ...p, czarFrom: [144, 96, 48][i] ?? p.czarFrom })),
  };
  const enemyArb = fc.constantFrom(SLIM, TRZ, GRZ, BOSS, BIG);
  const resultArb = fc.constantFrom(...RESULTS);
  const heroArb = fc.record({
    maxHp: fc.constantFrom(100, 120),
    attackBonus: fc.constantFrom(0, 3),
    defenseBoost: fc.constant({ defend: 0, strongDefend: 0 }),
    shieldCharges: fc.constantFrom(0, 1),
  });
  const ownedArb = fc.dictionary(fc.constantFrom(...Object.keys(CARD_DEFS)), fc.integer({ min: 0, max: 6 }));
  const resumeArb = fc.option(
    fc.record({
      czar: fc.option(fc.integer({ min: -5, max: 200 }), { nil: undefined }),
      phase: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
      vines: fc.option(fc.integer({ min: -2, max: 5 }), { nil: undefined }),
      heroHp: fc.option(fc.integer({ min: -5, max: 200 }), { nil: null }),
    }),
    { nil: undefined },
  );
  const opArb = fc.oneof(
    { weight: 6, arbitrary: fc.record({ t: fc.constant('play' as const), i: fc.nat(5), r: resultArb, boost: fc.constantFrom(1, 1.25) }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('end' as const) }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('rescue' as const) }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('bogus' as const), r: resultArb }) },
  );

  it('dowolne zagrania: brak nieoczekiwanych błędów i niezmienniki stanu', () => {
    fc.assert(
      fc.property(enemyArb, heroArb, ownedArb, resumeArb, fc.integer(), fc.array(opArb, { maxLength: 60 }), (enemy, h, owned, resume, seed, ops) => {
        const deck = buildDeck({ ...owned, 'cios-plusika': 1 + (owned['cios-plusika'] ?? 0) }, CARD_DEFS);
        const rng = createRng(seed);
        const s = startCardBattle({ enemy, hero: h, deck, rng, resume, cards: CARD_DEFS });
        let prevCzar = s.combat.czar;
        let prevPhase = s.combat.phase;
        const check = () => {
          const c = s.combat;
          expect(s.energy).toBeGreaterThanOrEqual(0);
          expect(s.energy).toBeLessThanOrEqual(s.maxEnergy);
          expect(s.hand.length).toBeLessThanOrEqual(HAND_SIZE);
          expect(totalCards(s)).toBe(deck.length);
          expect(new Set(uidsOf(s)).size).toBe(deck.length);
          expect(c.czar).toBeGreaterThanOrEqual(0);
          expect(c.czar).toBeLessThanOrEqual(c.maxCzar);
          expect(c.czar).toBeLessThanOrEqual(prevCzar);
          expect(c.phase).toBeGreaterThanOrEqual(prevPhase);
          expect(c.phase).toBe(c.won ? c.phase : phaseForCzar(enemy, c.czar, c.maxCzar));
          expect(c.won).toBe(c.czar === 0);
          expect(c.vines).toBeGreaterThanOrEqual(0);
          expect(c.vines).toBeLessThanOrEqual(enemy.phases?.[c.phase - 1]?.vines ?? 0);
          expect(c.heroHp).toBeGreaterThanOrEqual(0);
          expect(c.heroHp).toBeLessThanOrEqual(c.heroMaxHp);
          expect(s.shield).toBeGreaterThanOrEqual(0);
          expect(s.weaken).toBeGreaterThanOrEqual(0);
          expect(s.weaken).toBeLessThanOrEqual(MAX_WEAKEN);
          if (c.won) expect(s.intents).toEqual([]);
          prevCzar = c.czar;
          prevPhase = c.phase;
        };
        check();
        for (const op of ops) {
          if (op.t === 'play') {
            const uid = s.hand[op.i % Math.max(1, s.hand.length)]?.uid ?? 'brak';
            const ok = canPlay(s, uid, CARD_DEFS).ok;
            const call = () => playCard({ state: s, uid, result: op.r, enemy, hero: h, cards: CARD_DEFS, boost: op.boost });
            if (ok) {
              const energy = s.energy;
              const cost = CARD_DEFS[s.hand.find((c) => c.uid === uid)?.cardId ?? '']?.cost ?? 0;
              call();
              expect(s.energy).toBe(energy - cost);
              expect(s.discard.at(-1)?.uid).toBe(uid);
            } else {
              const snap = JSON.stringify(s);
              expect(call).toThrow();
              expect(JSON.stringify(s)).toBe(snap);
            }
          } else if (op.t === 'end') {
            const wasOver = s.combat.won || isCardHeroDown(s);
            const turn = s.turnNo;
            endPlayerTurn({ state: s, enemy, hero: h, rng });
            expect(s.turnNo).toBe(wasOver ? turn : turn + 1);
            if (!wasOver) {
              expect(s.energy).toBe(MAX_ENERGY);
              expect(s.shield).toBe(0);
              expect(s.weaken).toBe(0);
              expect(s.hand.length).toBe(Math.min(HAND_SIZE, deck.length));
            }
          } else if (op.t === 'rescue') {
            if (isCardHeroDown(s)) {
              rescueHero(s);
              expect(s.combat.heroHp).toBe(s.combat.heroMaxHp);
            }
          } else {
            expect(() => playCard({ state: s, uid: 'nie-ma', result: op.r, enemy, hero: h, cards: CARD_DEFS })).toThrow();
          }
          check();
        }
      }),
      { numRuns: 300 },
    );
  });

  it('walka zawsze się kończy, gdy co 3. odpowiedź jest poprawna', () => {
    fc.assert(
      fc.property(enemyArb, heroArb, ownedArb, fc.integer(), fc.array(resultArb, { minLength: 1, maxLength: 20 }), (enemy, h, owned, seed, answers) => {
        const deck = buildDeck({ ...owned, 'cios-plusika': 1 + (owned['cios-plusika'] ?? 0) }, CARD_DEFS);
        const { s } = fight(enemy, deck, seed, (n) => (n % 3 === 2 ? 'correct' : (answers[n % answers.length] as QteResult)), {
          hero: h,
          maxTurns: 400,
        });
        expect(s.combat.won).toBe(true);
        expect(s.combat.log.filter((e) => e.t === 'transformed')).toHaveLength(1);
      }),
      { numRuns: 150 },
    );
  });

  it('zdarzenia zgadzają się ze zmianami stanu (UI animuje zdarzenia): log, Czar, pnącza, HP, tarcza, zapowiedź', () => {
    fc.assert(
      fc.property(enemyArb, heroArb, ownedArb, resumeArb, fc.integer(), fc.array(opArb, { maxLength: 80 }), (enemy, h, owned, resume, seed, ops) => {
        const deck = buildDeck({ ...owned, 'cios-plusika': 1 + (owned['cios-plusika'] ?? 0) }, CARD_DEFS);
        const rng = createRng(seed);
        const s = startCardBattle({ enemy, hero: h, deck, rng, resume, cards: CARD_DEFS });
        const all: CombatEvent[] = [];
        const sum = (ev: CombatEvent[], pick: (e: CombatEvent) => number) => ev.reduce((a, e) => a + pick(e), 0);
        for (const op of ops) {
          const before = structuredClone(s);
          if (op.t === 'play') {
            const uid = s.hand[op.i % Math.max(1, s.hand.length)]?.uid ?? 'brak';
            if (!canPlay(s, uid, CARD_DEFS).ok) continue;
            const ev = playCard({ state: s, uid, result: op.r, enemy, hero: h, cards: CARD_DEFS, boost: op.boost });
            all.push(...ev);
            // Czar: zdjęty dokładnie o sumę obrażeń z ciosów (poza nadmiarem przy przemianie).
            const dmg = sum(ev, (e) => (e.t === 'playerHit' ? e.damage : 0));
            if (s.combat.won) expect(dmg).toBeGreaterThanOrEqual(before.combat.czar);
            else expect(before.combat.czar - s.combat.czar).toBe(dmg);
            // Pnącza: ubywa ich dokładnie tyle, ile zdarzeń vineRemoved (gdy nie było zmiany fazy).
            if (!ev.some((e) => e.t === 'phase')) {
              expect(before.combat.vines - s.combat.vines).toBe(ev.filter((e) => e.t === 'playerHit' && e.vineRemoved).length);
            }
            expect(s.combat.heroHp - before.combat.heroHp).toBe(sum(ev, (e) => (e.t === 'heal' ? e.amount : 0)));
            expect(s.shield - before.shield).toBe(sum(ev, (e) => (e.t === 'shieldGain' ? e.amount : 0)));
          } else if (op.t === 'end') {
            const ev = endPlayerTurn({ state: s, enemy, hero: h, rng });
            all.push(...ev);
            if (before.combat.won || before.combat.heroHp <= 0) {
              expect(ev).toEqual([]);
              continue;
            }
            // Wykonany dokładnie zapowiedziany ruch: osłabienie → tarcza → HP; HP 0 przerywa serię.
            let shield = before.shield;
            let hp = before.combat.heroHp;
            let n = 0;
            for (const intent of before.intents) {
              const hit = weakenedHit(intentHitDamage(intent, enemy), before.weaken);
              const absorbed = Math.min(shield, hit);
              shield -= absorbed;
              hp = Math.max(0, hp - (hit - absorbed));
              n++;
              if (hp === 0) break;
            }
            expect(s.combat.heroHp).toBe(hp);
            expect(ev.filter((e) => e.t === 'enemyHit')).toHaveLength(n);
            // taken = cios po tarczy (jak w combat — nieprzycięty do HP); przycięcie tylko przy powaleniu.
            const taken = sum(ev, (e) => (e.t === 'enemyHit' ? e.taken : 0));
            if (hp > 0) expect(taken).toBe(before.combat.heroHp - hp);
            else expect(taken).toBeGreaterThanOrEqual(before.combat.heroHp);
            expect(sum(ev, (e) => (e.t === 'shieldAbsorb' ? e.absorbed : 0))).toBe(before.shield - shield);
            expect(ev.filter((e) => e.t === 'heroDown')).toHaveLength(hp === 0 ? 1 : 0);
            // Nowa zapowiedź = ruch wroga na jego następną turę.
            expect(s.intents).toEqual(enemyIntents(s.combat, enemy));
          } else if (op.t === 'rescue' && isCardHeroDown(s)) {
            all.push(...rescueHero(s));
          }
          for (const x of [s.combat.czar, s.combat.heroHp, s.combat.vines, s.shield, s.energy]) expect(Number.isInteger(x)).toBe(true);
        }
        // Log walki = wszystkie zwrócone zdarzenia, w tej samej kolejności; przemiana najwyżej raz.
        expect(s.combat.log).toEqual(all);
        expect(all.filter((e) => e.t === 'transformed')).toHaveLength(s.combat.won ? 1 : 0);
      }),
      { numRuns: 300 },
    );
  });
});
