import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { startCombat } from '../combat/combat';
import type { CardBattleState, CombatState, EnemyDef } from '../types';
import { endPlayerTurn, startCardBattle } from './battle';
import { intentHitDamage, intentKindOf, intentView, intentsFor, weakenedHit } from './intents';
import { BOSS, GRZ, SLIM, TRZ, deckOf, hero } from './testkit';

const HERO = hero();

/** Plany dla kolejnych tur wroga 1..n (bez walki — sam numer tury). */
function plans(enemy: EnemyDef, n: number, over: Partial<CombatState> = {}): string[] {
  const s = { ...startCombat(enemy, HERO), ...over };
  const out: string[] = [];
  for (let t = 1; t <= n; t++) {
    s.enemyTurn = t;
    const p = intentsFor(s, enemy);
    out.push(`${p.kind}:${p.hits.join(',')}`);
  }
  return out;
}

function battle(enemy: EnemyDef): CardBattleState {
  return startCardBattle({ enemy, hero: HERO, deck: deckOf(['tarcza-z-lisci', 4]), rng: createRng(1) });
}

describe('intentsFor (GDD 13.3, walka kartami)', () => {
  it('Ślimakorro: „Cios 10” co turę', () => {
    expect(plans(SLIM, 4)).toEqual(['normal:10', 'normal:10', 'normal:10', 'normal:10']);
  });

  it('Trzmielini: na zmianę „Cios 8” i „2 × cios 6” (6 = round(8 · 0,75))', () => {
    expect(plans(TRZ, 4)).toEqual(['normal:8', 'multi:6,6', 'normal:8', 'multi:6,6']);
    // Zaokrąglenie połówek w górę: 10 · 0,75 = 7,5 → 8.
    expect(plans({ ...TRZ, attack: 10 }, 2)).toEqual(['normal:10', 'multi:8,8']);
  });

  it('Grzybello: „Mocny cios 22” co 3. turę', () => {
    expect(plans(GRZ, 6)).toEqual(['normal:10', 'normal:10', 'strong:22', 'normal:10', 'normal:10', 'strong:22']);
  });

  it('Kosiarrini: fazy 1–2 bez mocnych, faza 3 „Mocny cios 24” co 2. turę', () => {
    expect(plans(BOSS, 4, { phase: 1 })).toEqual(['normal:12', 'normal:12', 'normal:12', 'normal:12']);
    expect(plans(BOSS, 4, { phase: 2 })).toEqual(['normal:12', 'normal:12', 'normal:12', 'normal:12']);
    expect(plans(BOSS, 4, { phase: 3 })).toEqual(['normal:12', 'strong:24', 'normal:12', 'strong:24']);
  });

  it('po przemianie — brak ruchu', () => {
    const s = startCombat(SLIM, HERO);
    s.won = true;
    expect(intentsFor(s, SLIM)).toEqual({ hits: [], kind: 'normal' });
  });

  it('pomocnicze: siła ciosu z zapowiedzi, osłabienie, rodzaj', () => {
    expect(intentHitDamage({ kind: 'normal', hits: 1 }, SLIM)).toBe(10);
    expect(intentHitDamage({ kind: 'normal', hits: 2 }, TRZ)).toBe(6);
    expect(intentHitDamage({ kind: 'strong', hits: 1 }, GRZ)).toBe(22);
    expect(weakenedHit(10, 0.5)).toBe(5);
    expect(weakenedHit(10, 0.15)).toBe(9); // 8,5 → 9
    expect(weakenedHit(10, 5)).toBe(1); // maks. osłabienie 0,9
    expect(weakenedHit(10, -1)).toBe(10);
    expect(weakenedHit(10, Number.NaN)).toBe(10);
    expect(intentKindOf([])).toBe('normal');
    expect(intentKindOf([{ kind: 'normal', hits: 2 }, { kind: 'normal', hits: 2 }])).toBe('multi');
    expect(intentKindOf([{ kind: 'strong', hits: 1 }])).toBe('strong');
  });
});

describe('intentView (zapowiedź w HUD)', () => {
  it('teksty: „Cios 10”, „2 × cios 6” (znak U+00D7), „Mocny cios 22”', () => {
    const s = battle(SLIM);
    expect(intentView(s, SLIM)).toEqual({ text: 'Cios 10', kind: 'normal', total: 10 });

    const t = battle(TRZ);
    expect(intentView(t, TRZ)).toEqual({ text: 'Cios 8', kind: 'normal', total: 8 });
    endPlayerTurn({ state: t, enemy: TRZ, hero: HERO, rng: createRng(2) });
    expect(intentView(t, TRZ)).toEqual({ text: '2 × cios 6', kind: 'multi', total: 12 });

    const g = battle(GRZ);
    endPlayerTurn({ state: g, enemy: GRZ, hero: HERO, rng: createRng(2) });
    endPlayerTurn({ state: g, enemy: GRZ, hero: HERO, rng: createRng(2) });
    expect(intentView(g, GRZ)).toEqual({ text: 'Mocny cios 22', kind: 'strong', total: 22 });
  });

  it('pokazuje ciosy po osłabieniu („Cios 5” przy −50%)', () => {
    const s = battle(SLIM);
    s.weaken = 0.5;
    expect(intentView(s, SLIM)).toEqual({ text: 'Cios 5', kind: 'normal', total: 5 });
    const t = battle(TRZ);
    endPlayerTurn({ state: t, enemy: TRZ, hero: HERO, rng: createRng(2) });
    t.weaken = 0.5;
    expect(intentView(t, TRZ)).toEqual({ text: '2 × cios 3', kind: 'multi', total: 6 });
    const g = battle(GRZ);
    g.intents = [{ kind: 'strong', hits: 1 }];
    g.weaken = 0.5;
    expect(intentView(g, GRZ)).toEqual({ text: 'Mocny cios 11', kind: 'strong', total: 11 });
  });

  it('brak zapowiedzi → pusty tekst', () => {
    const s = battle(SLIM);
    s.intents = [];
    expect(intentView(s, SLIM)).toEqual({ text: '', kind: 'normal', total: 0 });
  });
});
