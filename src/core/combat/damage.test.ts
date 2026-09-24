import { describe, expect, it } from 'vitest';
import type { EnemyDef, HeroStats } from '../types';
import { applyCzarDamage, applyPlayerAttack, startCombat } from './combat';

// Kopie liczb z content/enemies.ts (core nie importuje content/).
const base = {
  name: 'x',
  glamName: 'y',
  battleCry: '',
  glamThanks: '',
  land: 'meadow' as const,
  strongAttack: 24,
  strongEvery: 0,
  isBoss: false,
};
const SLIM: EnemyDef = { ...base, id: 'slimakorro', czar: 30, behavior: 'normal', attack: 10 };
const BOSS: EnemyDef = {
  ...base,
  id: 'kosiarrini',
  czar: 120,
  behavior: 'boss',
  attack: 12,
  isBoss: true,
  phases: [
    { czarFrom: 120, note: '', strongEvery: 0, vines: 0 },
    { czarFrom: 80, note: '', strongEvery: 0, vines: 2 },
    { czarFrom: 40, note: '', strongEvery: 2, vines: 0 },
  ],
};
const HERO: HeroStats = { maxHp: 100, attackBonus: 0, defenseBoost: { defend: 0, strongDefend: 0 }, shieldCharges: 0 };

describe('applyCzarDamage (pomocnik dla walki kartami)', () => {
  it('zdejmuje Czar bez dopisywania do logu', () => {
    const s = startCombat(SLIM, HERO);
    expect(applyCzarDamage(s, SLIM, 8)).toEqual([]);
    expect(s.czar).toBe(22);
    expect(s.log).toEqual([]);
  });

  it('przemiana przy Czarze 0 (także przy nadmiarze)', () => {
    const s = startCombat(SLIM, HERO, { czar: 5 });
    expect(applyCzarDamage(s, SLIM, 50)).toEqual([{ t: 'transformed' }]);
    expect([s.czar, s.won]).toEqual([0, true]);
    // Po przemianie — nic.
    expect(applyCzarDamage(s, SLIM, 5)).toEqual([]);
  });

  it('fazy bossa i pnącza — identycznie jak atak gracza', () => {
    const a = startCombat(BOSS, HERO, { czar: 85 });
    const b = startCombat(BOSS, HERO, { czar: 85 });
    const evA = applyCzarDamage(a, BOSS, 10);
    applyPlayerAttack(b, BOSS, 'attack', 'correct', HERO);
    expect(evA).toEqual([{ t: 'phase', phase: 2, vines: 2 }]);
    expect([a.czar, a.phase, a.vines]).toEqual([b.czar, b.phase, b.vines]);
    // Przeskok kilku faz naraz — jedno zdarzenie fazy docelowej.
    const c = startCombat(BOSS, HERO);
    expect(applyCzarDamage(c, BOSS, 90)).toEqual([{ t: 'phase', phase: 3, vines: 0 }]);
  });

  it('kwota ≤ 0, NaN i nieskończoność nie psują stanu; ułamki zaokrąglane', () => {
    const s = startCombat(SLIM, HERO);
    for (const x of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyCzarDamage(s, SLIM, x)).toEqual([]);
      expect(s.czar).toBe(30);
    }
    applyCzarDamage(s, SLIM, 2.6);
    expect(s.czar).toBe(27);
  });
});
