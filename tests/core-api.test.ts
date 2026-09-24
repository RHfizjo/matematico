/**
 * Fasada src/core/index.ts: każdy eksport modułów jest osiągalny przez `import … from '../core'`
 * i wskazuje ten sam byt. `export *` z dwóch modułów z tą samą nazwą wg ES po cichu POMIJA tę nazwę —
 * tsc to zgłasza, ale test pilnuje tego także w czasie wykonania (np. po zmianie tsconfig).
 */
import { describe, expect, it } from 'vitest';
import * as core from '../src/core';
import * as math from '../src/core/math';
import * as adaptive from '../src/core/adaptive';
import * as economy from '../src/core/economy';
import * as combat from '../src/core/combat';
import * as cards from '../src/core/cards';
import * as merchant from '../src/core/merchant';
import * as progression from '../src/core/progression';
import * as save from '../src/core/save';
import * as game from '../src/core/game';
import * as rng from '../src/core/rng';

const MODULES: Record<string, Record<string, unknown>> = {
  math,
  adaptive,
  economy,
  combat,
  cards,
  merchant,
  progression,
  save,
  game,
};

describe('fasada core/', () => {
  it.each(Object.keys(MODULES))('moduł %s: każdy eksport jest w fasadzie (ten sam obiekt)', (name) => {
    const mod = MODULES[name] as Record<string, unknown>;
    const facade = core as unknown as Record<string, unknown>;
    const missing = Object.keys(mod).filter((k) => facade[k] !== mod[k]);
    expect(missing).toEqual([]);
  });

  it('nazwy eksportów nie powtarzają się między modułami (brak niejednoznacznych `export *`)', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [name, mod] of Object.entries(MODULES)) {
      for (const k of Object.keys(mod)) {
        const prev = owner.get(k);
        // Ten sam byt re-eksportowany przez dwa moduły nie jest kolizją.
        if (prev !== undefined && MODULES[prev]?.[k] !== mod[k]) clashes.push(`${k}: ${prev} / ${name}`);
        owner.set(k, name);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('walka kartami i handlarz są w fasadzie obok starej walki (różne nazwy)', () => {
    expect(core.createRng).toBe(rng.createRng);
    expect(core.startCardBattle).toBe(cards.startCardBattle);
    expect(core.playCard).toBe(cards.playCard);
    expect(core.endPlayerTurn).toBe(cards.endPlayerTurn);
    expect(core.rescueHero).toBe(cards.rescueHero);
    expect(core.isCardHeroDown).toBe(cards.isCardHeroDown);
    expect(core.isHeroDown).toBe(combat.isHeroDown);
    expect(core.rescue).toBe(combat.rescue);
    expect(core.merchantOffers).toBe(merchant.merchantOffers);
    expect(core.acceptOffer).toBe(merchant.acceptOffer);
    expect(core.offersFor).toBe(game.offersFor);
    expect(core.acceptMerchant).toBe(game.acceptMerchant);
    expect(core.deckOf).toBe(game.deckOf);
    expect(core.buildDeck).toBe(cards.buildDeck);
  });
});
