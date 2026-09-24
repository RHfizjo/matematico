/**
 * Symulacja ekonomii (GDD 21): 20 cykli — brak blokady, skarbiec nie rośnie bez końca.
 */
import { describe, expect, it } from 'vitest';
import type { CreatureDef, Digits, GateOp, ItemDef, OwnedCreature, OwnedItem, ProductionKind } from '../types';
import { createRng } from '../rng';
import { addDigitCounts, addDigits, countDigits, removeDigits, startingDigits } from './digits';
import { gateTokensOf, makeGate, scoreGate, solveGate } from './gate';
import { feedBonus, produce } from './production';
import { checkForgePayment, findForgePayment, forgeCost } from './forge';
import { openChest } from './chests';

const creature = (id: string, production: ProductionKind): CreatureDef => ({
  id,
  name: id,
  land: 'meadow',
  rarity: 'common',
  categories: ['add.within10'],
  catchFormat: 'choice',
  catchRule: { need: 2, of: 3 },
  production,
  description: '',
});

const item = (id: string): ItemDef => ({
  id,
  name: id,
  slot: 'weapon',
  land: 'meadow',
  rarity: 'common',
  attackBonus: 0,
  hpBonus: 0,
  description: '',
});

const DEFS: Record<string, CreatureDef> = {
  plusik: creature('plusik', 'small'),
  dopelniak: creature('dopelniak', 'pairs10'),
  blizniak: creature('blizniak', 'twins'),
};

interface SimResult {
  totals: number[];
  gifts: number;
  forges: number;
}

interface SimOptions {
  /** Łapanie Dopełniaka i Bliźniaka w cyklach 1–2. */
  catchMore: boolean;
  /** Skrzynia w świecie (pierwsze 6 cykli) i w dungeonie (co cykl). */
  chests: boolean;
}

function simulate(seed: number, cycles: number, opts: SimOptions): SimResult {
  const rng = createRng(seed);
  const inv: Digits = startingDigits();
  const creatures: OwnedCreature[] = [{ id: 'plusik', level: 1, fedCycle: -1, caughtAt: 0 }];
  const items: OwnedItem[] = [
    { id: 'drewniany-miecz', level: 1 },
    { id: 'kamizelka-z-lisci', level: 1 },
    { id: 'siatka-z-trawy', level: 1 },
  ];
  const ops: GateOp[] = ['+'];
  let pity = 0;
  let gifts = 0;
  let forges = 0;
  const totals: number[] = [];

  for (let cycle = 0; cycle < cycles; cycle++) {
    // Wyprawa: łapanie stworków w pierwszych cyklach, 1 skrzynia w świecie.
    if (opts.catchMore && cycle === 1) creatures.push({ id: 'dopelniak', level: 1, fedCycle: -1, caughtAt: 1 });
    if (opts.catchMore && cycle === 2) {
      creatures.push({ id: 'blizniak', level: 1, fedCycle: -1, caughtAt: 2 });
      ops.push('×');
    }
    if (opts.chests && cycle < 6) {
      const world = openChest({ kind: 'world', pity, rng, itemPool: [] });
      pity = world.pity;
      addDigits(inv, world.loot.digits);
    }

    // Baza: produkcja + karmienie.
    for (const c of creatures) {
      const def = DEFS[c.id]!;
      addDigits(inv, produce(c, def, cycle, rng));
      addDigits(inv, feedBonus(def, rng));
      c.fedCycle = cycle;
    }

    // Brama: dziecko płaci rozwiązaniem o minimalnej liczbie cyfr.
    const gate = makeGate({ rng, land: 'meadow', range: 20, inventory: inv, ops });
    if (countDigits(gate.gift) > 0) gifts++;
    addDigitCounts(inv, gate.gift);
    const sol = solveGate(gate.target, inv, gate.ops, 1).solutions[0];
    expect(sol).toBeDefined();
    const score = scoreGate(gateTokensOf(sol!.a, sol!.op, sol!.b), gate.target, inv, gate.ops);
    expect(score.valid).toBe(true);
    removeDigits(inv, score.digitsUsed);

    // Dungeon: 1 skrzynia (bez przedmiotów w puli — liczymy tylko cyfry).
    if (opts.chests) {
      const chest = openChest({ kind: 'dungeon', pity, rng, itemPool: [] });
      pity = chest.pity;
      addDigits(inv, chest.loot.digits);
    }

    // Kuźnia: najwyżej 2 ulepszenia na cykl.
    let done = 0;
    for (const it of items) {
      if (done >= 2) break;
      const cost = forgeCost(item(it.id), it.level);
      if (!cost) continue;
      const pay = findForgePayment(cost, inv);
      if (!pay) continue;
      expect(checkForgePayment(pay, cost, inv).ok).toBe(true);
      removeDigits(inv, pay);
      it.level++;
      forges++;
      done++;
    }

    expect(inv.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
    totals.push(countDigits(inv));
  }
  return { totals, gifts, forges };
}

describe('symulacja ekonomii — 20 cykli', () => {
  it('pełna gra: brak blokady, kuźnia wykorzystana, skarbiec rośnie najwyżej liniowo', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { totals, gifts, forges } = simulate(seed, 20, { catchMore: true, chests: true });
      expect(totals).toHaveLength(20);
      // 3 przedmioty × 2 ulepszenia.
      expect(forges).toBe(6);
      // Przy takim przychodzie dar bramy jest wyjątkiem.
      expect(gifts).toBeLessThanOrEqual(3);
      // [ZAŁOŻENIE] Bilans do strojenia (GDD 9.5): średni przyrost ≤ 15 cyfr/cykl.
      const last = totals[totals.length - 1]!;
      expect((last - 19) / 20).toBeLessThanOrEqual(15);
    }
  });

  it('skromna gra (tylko Plusik, bez skrzyń): brama zawsze do otwarcia dzięki darowi', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { totals } = simulate(seed, 20, { catchMore: false, chests: false });
      expect(totals).toHaveLength(20);
      // Skarbiec nie rośnie: przychód 3 cyfry/cykl ≈ koszt bramy + kuźnia.
      expect(totals[totals.length - 1]!).toBeLessThanOrEqual(40);
    }
  });
});
