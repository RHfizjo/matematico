/**
 * Zgodność treści (src/content) z kopiami identyfikatorów i liczb w core/ (GDD 13, 13.5, 19).
 * core/ nie importuje content/, więc listy id w zapisie (core/save/ids.ts) i dane testowe modułów
 * (core/cards/testkit.ts, core/merchant/testkit.ts) są KOPIAMI — ten test pilnuje, żeby się nie rozjechały.
 * Rozjazd = ciche błędy: karta spoza CARD_IDS znika przy wczytaniu zapisu, a grant karty spoza zapisu
 * nigdy nie trafia do kolekcji (game.addOwnedCards pomija nieznane id).
 */
import { describe, expect, it } from 'vitest';
import type { CardDef, EnemyDef } from '../src/core';
import {
  CARD_IDS,
  CREATURE_IDS,
  ENEMY_IDS,
  ITEM_IDS,
  ITEM_SLOTS,
  MEADOW_ROOMS,
  STARTER_CARDS,
  STARTER_CREATURE as SAVE_STARTER_CREATURE,
  STARTER_EQUIPPED,
  buildDeck,
  createNewSave,
  isCardId,
  isCreatureId,
  isEnemyId,
  isItemId,
} from '../src/core';
import {
  BOSS_ITEMS_MEADOW,
  CARDS,
  CARD_GRANTS,
  CHEST_ITEM_POOL_MEADOW,
  CREATURES,
  ENEMIES,
  ITEMS,
  MEADOW_BOSS,
  MEADOW_ENEMIES,
  STARTER_CREATURE,
  STARTER_ITEMS,
} from '../src/content';
import { CARD_DEFS, ENEMY_FIXTURES, STARTER_OWNED } from '../src/core/cards/testkit';
import { TEST_CARDS, TEST_CARD_GRANTS, TEST_CARD_IDS } from '../src/core/merchant/testkit';

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

/** Prefiksy ModelId (game/contracts.ts), których mogą używać portrety kart. */
const ART_PREFIXES = ['creature:', 'glam:', 'npc:', 'prop:'] as const;
/** Id treści w ModelId: małe litery ASCII, cyfry i myślniki (bez dwukropka — separatora prefiksu). */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Pola karty istotne dla rozgrywki (bez opisu i portretu — kopie w testkitach ich nie powielają). */
function cardRules(c: CardDef): Omit<CardDef, 'description' | 'art'> {
  const { description: _d, art: _a, ...rest } = c;
  return rest;
}

/** Pola brainrota istotne dla walki (liczby, zachowanie, fazy; bez tekstów). */
function enemyRules(e: EnemyDef): unknown {
  return {
    id: e.id,
    land: e.land,
    czar: e.czar,
    behavior: e.behavior,
    attack: e.attack,
    strongAttack: e.strongAttack,
    strongEvery: e.strongEvery,
    isBoss: e.isBoss,
    phases: (e.phases ?? []).map((p) => ({ czarFrom: p.czarFrom, strongEvery: p.strongEvery, vines: p.vines })),
  };
}

describe('content ↔ core/save/ids.ts: identyfikatory', () => {
  it('stworki: CREATURES = CREATURE_IDS, klucz = id, stworek startowy ten sam', () => {
    expect(sorted(Object.keys(CREATURES))).toEqual(sorted(CREATURE_IDS));
    for (const [k, c] of Object.entries(CREATURES)) {
      expect(c.id).toBe(k);
      expect(isCreatureId(k)).toBe(true);
    }
    expect(STARTER_CREATURE).toBe(SAVE_STARTER_CREATURE);
    expect(createNewSave(0, 1).creatures.map((c) => c.id)).toEqual([STARTER_CREATURE]);
  });

  it('brainroty: ENEMIES = ENEMY_IDS = MEADOW_ENEMIES + MEADOW_BOSS, klucz = id', () => {
    expect(sorted(Object.keys(ENEMIES))).toEqual(sorted(ENEMY_IDS));
    expect(sorted([...MEADOW_ENEMIES, MEADOW_BOSS])).toEqual(sorted(ENEMY_IDS));
    for (const [k, e] of Object.entries(ENEMIES)) {
      expect(e.id).toBe(k);
      expect(isEnemyId(k)).toBe(true);
    }
    expect(ENEMIES[MEADOW_BOSS]?.isBoss).toBe(true);
    for (const id of MEADOW_ENEMIES) expect(ENEMIES[id]?.isBoss).toBe(false);
  });

  it('sprzęt: ITEMS = ITEM_IDS, sloty zgodne z ITEM_SLOTS, sprzęt startowy ten sam', () => {
    expect(sorted(Object.keys(ITEMS))).toEqual(sorted(ITEM_IDS));
    for (const [k, it] of Object.entries(ITEMS)) {
      expect(it.id).toBe(k);
      expect(isItemId(k)).toBe(true);
      expect(it.slot).toBe(ITEM_SLOTS[k as keyof typeof ITEM_SLOTS]);
    }
    const equipped = Object.values(STARTER_EQUIPPED).filter((x): x is NonNullable<typeof x> => x !== null);
    expect(sorted(equipped)).toEqual(sorted(STARTER_ITEMS));
    for (const [slot, id] of Object.entries(STARTER_EQUIPPED)) if (id !== null) expect(ITEMS[id]?.slot).toBe(slot);
    for (const id of [...BOSS_ITEMS_MEADOW, ...CHEST_ITEM_POOL_MEADOW]) expect(isItemId(id)).toBe(true);
  });

  it('karty: CARDS = CARD_IDS (ta sama kolejność — tabela 13.5), klucz = id', () => {
    expect(Object.keys(CARDS)).toEqual([...CARD_IDS]);
    for (const [k, c] of Object.entries(CARDS)) {
      expect(c.id).toBe(k);
      expect(isCardId(k)).toBe(true);
    }
  });

  it('pokoje dungeonu (core/progression) wskazują istniejących brainrotów; boss tylko w sali bossa', () => {
    const inRooms = MEADOW_ROOMS.flatMap((r) => r.enemies);
    for (const id of inRooms) expect(Object.hasOwn(ENEMIES, id)).toBe(true);
    expect(sorted(new Set(inRooms))).toEqual(sorted(ENEMY_IDS));
    for (const r of MEADOW_ROOMS) {
      const bosses = r.enemies.filter((id) => ENEMIES[id]?.isBoss === true);
      expect(bosses.length > 0).toBe(r.kind === 'boss');
    }
  });
});

describe('CARD_GRANTS ↔ CARDS, CREATURES, ENEMIES', () => {
  it('talia startowa: CARD_GRANTS.starter = STARTER_CARDS z zapisu = karty nowego zapisu', () => {
    expect(CARD_GRANTS.starter).toEqual(STARTER_CARDS);
    expect(createNewSave(0, 1).cards.owned).toEqual(CARD_GRANTS.starter);
    for (const [id, n] of Object.entries(CARD_GRANTS.starter)) {
      expect(CARDS[id]?.source).toBe('starter');
      expect(Number.isInteger(n) && n > 0).toBe(true);
    }
    // Nowy zapis ma z czego walczyć: talia niepusta, z atakiem i tarczą.
    const deck = buildDeck(createNewSave(0, 1).cards.owned, CARDS);
    expect(deck.length).toBeGreaterThan(0);
    expect(deck.some((id) => CARDS[id]?.kind === 'attack')).toBe(true);
    expect(deck.some((id) => CARDS[id]?.kind === 'shield')).toBe(true);
  });

  it('stworki: każdy ma grant, karta istnieje, jej sourceId = stworek, liczby kopii całkowite', () => {
    expect(sorted(Object.keys(CARD_GRANTS.creatures))).toEqual(sorted(Object.keys(CREATURES)));
    for (const [creatureId, g] of Object.entries(CARD_GRANTS.creatures)) {
      const card = CARDS[g.cardId];
      expect(card, `${creatureId} → ${g.cardId}`).toBeDefined();
      expect(card?.sourceId).toBe(creatureId);
      expect(card?.source === 'creature' || card?.source === 'starter').toBe(true);
      expect(Number.isInteger(g.onCatch) && g.onCatch >= 1).toBe(true);
      expect(Number.isInteger(g.onLevelUp) && g.onLevelUp >= 0).toBe(true);
    }
  });

  it('brainroty: każdy ma kartę brainglama, karta istnieje, source = glam, sourceId = brainrot', () => {
    expect(sorted(Object.keys(CARD_GRANTS.glams))).toEqual(sorted(Object.keys(ENEMIES)));
    for (const [enemyId, cardId] of Object.entries(CARD_GRANTS.glams)) {
      const card = CARDS[cardId];
      expect(card, `${enemyId} → ${cardId}`).toBeDefined();
      expect(card?.source).toBe('glam');
      expect(card?.sourceId).toBe(enemyId);
    }
    // Boss daje kartę legendarną (GDD 13.5).
    expect(CARDS[CARD_GRANTS.glams[MEADOW_BOSS] ?? '']?.rarity).toBe('legendary');
  });

  it('każda karta z source creature/glam jest przyznawana przez swój sourceId; granty nie przyznają kart spoza zapisu', () => {
    for (const c of Object.values(CARDS)) {
      if (c.source === 'creature') expect(CARD_GRANTS.creatures[c.sourceId ?? '']?.cardId).toBe(c.id);
      if (c.source === 'glam') expect(CARD_GRANTS.glams[c.sourceId ?? '']).toBe(c.id);
      if (c.sourceId !== null) {
        expect(c.source === 'glam' ? isEnemyId(c.sourceId) : isCreatureId(c.sourceId)).toBe(true);
      }
    }
    const granted = [
      ...Object.keys(CARD_GRANTS.starter),
      ...Object.values(CARD_GRANTS.creatures).map((g) => g.cardId),
      ...Object.values(CARD_GRANTS.glams),
    ];
    for (const id of granted) expect(isCardId(id)).toBe(true);
    expect(sorted(new Set(granted))).toEqual(sorted(CARD_IDS));
  });
});

describe('portrety (ModelId z game/contracts.ts)', () => {
  it('karty: prefiks creature:/glam:/npc:/prop:, a id po prefiksie istnieje w treści', () => {
    for (const c of Object.values(CARDS)) {
      const prefix = ART_PREFIXES.find((p) => c.art.startsWith(p));
      expect(prefix, `${c.id}: ${c.art}`).toBeDefined();
      const rest = c.art.slice((prefix ?? '').length);
      expect(rest).toMatch(SLUG);
      if (prefix === 'creature:') expect(isCreatureId(rest)).toBe(true);
      if (prefix === 'glam:') expect(isEnemyId(rest)).toBe(true);
    }
  });

  it('karty stworków i brainglamów pokazują swoje źródło', () => {
    for (const c of Object.values(CARDS)) {
      if (c.source === 'creature') expect(c.art).toBe(`creature:${c.sourceId}`);
      if (c.source === 'glam') expect(c.art).toBe(`glam:${c.sourceId}`);
    }
  });

  it('stworki i brainroty dają poprawne ModelId (creature:<id>, enemy:<id>, glam:<id>)', () => {
    for (const id of Object.keys(CREATURES)) expect(`creature:${id}`).toMatch(/^creature:[a-z0-9-]+$/);
    for (const id of Object.keys(ENEMIES)) {
      expect(id).toMatch(SLUG);
      expect(`enemy:${id}`).toMatch(/^enemy:[a-z0-9-]+$/);
      expect(`glam:${id}`).toMatch(/^glam:[a-z0-9-]+$/);
    }
    for (const id of Object.keys(CREATURES)) expect(id).toMatch(SLUG);
  });
});

describe('kopie treści w testkitach core/ (core nie importuje content/)', () => {
  it('core/cards/testkit.ts: CARD_DEFS = CARDS (reguły), STARTER_OWNED = CARD_GRANTS.starter', () => {
    expect(Object.keys(CARD_DEFS)).toEqual(Object.keys(CARDS));
    for (const [id, c] of Object.entries(CARDS)) expect(cardRules(CARD_DEFS[id] as CardDef), id).toEqual(cardRules(c));
    expect(STARTER_OWNED).toEqual(CARD_GRANTS.starter);
  });

  it('core/cards/testkit.ts: brainroty testowe = ENEMIES (liczby, zachowania, fazy)', () => {
    expect(sorted(ENEMY_FIXTURES.map((e) => e.id))).toEqual(sorted(Object.keys(ENEMIES)));
    for (const f of ENEMY_FIXTURES) {
      const real = ENEMIES[f.id];
      expect(real, f.id).toBeDefined();
      expect(enemyRules(f), f.id).toEqual(enemyRules(real as EnemyDef));
    }
  });

  it('core/merchant/testkit.ts: TEST_CARDS = CARDS (także portrety), TEST_CARD_GRANTS = CARD_GRANTS', () => {
    expect([...TEST_CARD_IDS]).toEqual(Object.keys(CARDS));
    for (const [id, c] of Object.entries(CARDS)) {
      const t = TEST_CARDS[id] as CardDef;
      expect(cardRules(t), id).toEqual(cardRules(c));
      expect(t.art, id).toBe(c.art);
    }
    expect(TEST_CARD_GRANTS).toEqual(CARD_GRANTS);
  });
});
