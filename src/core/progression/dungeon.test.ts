import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { EnemyDef } from '../types';
import { createRng } from '../rng';
import {
  MEADOW_ROOMS,
  MEADOW_ROOM_ORDER,
  czarScale,
  findRoom,
  makeRoomOrder,
  scaledCzar,
  scaledEnemy,
} from './dungeon';

const enemy = (over: Partial<EnemyDef>): EnemyDef => ({
  id: 'slimakorro',
  name: 'x',
  glamName: 'y',
  battleCry: '',
  glamThanks: '',
  land: 'meadow',
  czar: 30,
  behavior: 'normal',
  attack: 15,
  strongAttack: 25,
  strongEvery: 0,
  isBoss: false,
  ...over,
});
const SLIM = enemy({});
const TRZ = enemy({ id: 'trzmielini', czar: 25, behavior: 'fast', attack: 12 });
const BOSS = enemy({
  id: 'kosiarrini',
  czar: 120,
  behavior: 'boss',
  isBoss: true,
  phases: [
    { czarFrom: 120, note: '', strongEvery: 0, vines: 0 },
    { czarFrom: 80, note: '', strongEvery: 0, vines: 2 },
    { czarFrom: 40, note: '', strongEvery: 2, vines: 0 },
  ],
});

describe('pokoje Łąki (GDD 11)', () => {
  it('5 pokoi w kolejności kanonicznej', () => {
    expect(MEADOW_ROOMS.map((r) => `${r.id}:${r.kind}:${r.enemies.join('+')}`)).toEqual([
      'entry:fight:slimakorro',
      'vault:chest:',
      'nest:fight:trzmielini+grzybello',
      'campfire:rest:',
      'boss:boss:kosiarrini',
    ]);
    expect(MEADOW_ROOM_ORDER).toEqual(['entry', 'vault', 'nest', 'campfire', 'boss']);
    expect(findRoom('nest')?.enemies).toEqual(['trzmielini', 'grzybello']);
    expect(findRoom('nie-ma')).toBeUndefined();
  });
});

describe('makeRoomOrder', () => {
  it('pokoje 1–3 potasowane, ognisko i boss na końcu; deterministycznie z ziarna', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const order = makeRoomOrder(createRng(seed));
        expect(order).toHaveLength(5);
        expect(order.slice(3)).toEqual(['campfire', 'boss']);
        expect([...order.slice(0, 3)].sort()).toEqual(['entry', 'nest', 'vault']);
        expect(makeRoomOrder(createRng(seed))).toEqual(order);
      }),
    );
  });

  it('wszystkie 6 kolejności się pojawiają', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) seen.add(makeRoomOrder(createRng(seed)).slice(0, 3).join(','));
    expect(seen.size).toBe(6);
  });

  it('z poprzednią kolejnością — pokoje 1–3 w innej kolejności', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.integer({ min: 0, max: 2 ** 31 }), (s1, s2) => {
        const prev = makeRoomOrder(createRng(s1));
        const next = makeRoomOrder(createRng(s2), prev);
        expect(next.slice(0, 3)).not.toEqual(prev.slice(0, 3));
        expect(next.slice(3)).toEqual(['campfire', 'boss']);
      }),
    );
    const next = makeRoomOrder(createRng(1), MEADOW_ROOM_ORDER);
    expect(next.slice(0, 3)).not.toEqual(['entry', 'vault', 'nest']);
  });
});

describe('skalowanie Czaru do etapu', () => {
  it('+10% na etap; boss maks. ×1,2', () => {
    expect([1, 2, 3, 4].map((s) => scaledCzar(SLIM, s))).toEqual([30, 33, 36, 39]);
    expect([1, 2, 3, 4].map((s) => scaledCzar(TRZ, s))).toEqual([25, 28, 30, 33]);
    expect([1, 2, 3, 4].map((s) => scaledCzar(BOSS, s))).toEqual([120, 132, 144, 144]);
    expect(czarScale(BOSS, 4)).toBeCloseTo(1.2);
    expect(scaledCzar(SLIM, 0)).toBe(30);
    expect(scaledCzar(SLIM, 9)).toBe(39);
  });

  it('scaledEnemy: kopia z Czarem i progami faz', () => {
    const b = scaledEnemy(BOSS, 3);
    expect(b.czar).toBe(144);
    expect(b.phases?.map((p) => p.czarFrom)).toEqual([144, 96, 48]);
    expect(b.phases?.map((p) => p.vines)).toEqual([0, 2, 0]);
    expect(BOSS.czar).toBe(120);
    expect(BOSS.phases?.[0]?.czarFrom).toBe(120);
    const s = scaledEnemy(SLIM, 2);
    expect(s.czar).toBe(33);
    expect(s.phases).toBeUndefined();
  });
});
