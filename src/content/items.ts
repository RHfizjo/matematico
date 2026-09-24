/**
 * Sprzęt Łąki (GDD 12, 13.4). Sprzęt pomaga liczyć (czas, oś, poprawka), nigdy nie podaje wyniku.
 */
import type { ItemDef } from '../core/types';

export const ITEMS: Record<string, ItemDef> = {
  'drewniany-miecz': {
    id: 'drewniany-miecz',
    name: 'Drewniany Miecz',
    slot: 'weapon',
    land: 'meadow',
    rarity: 'common',
    attackBonus: 0,
    hpBonus: 0,
    description: 'Prosty miecz na dobry początek przygody.',
  },
  'miecz-slonecznika': {
    id: 'miecz-slonecznika',
    name: 'Miecz Słonecznika',
    slot: 'weapon',
    land: 'meadow',
    rarity: 'uncommon',
    attackBonus: 3,
    hpBonus: 0,
    help: { kind: 'time', amount: 2, appliesTo: 'attack' },
    description: 'Świeci jak słonecznik: mocniejszy atak i 2 sekundy więcej na liczenie przy ataku.',
  },
  'kamizelka-z-lisci': {
    id: 'kamizelka-z-lisci',
    name: 'Kamizelka z Liści',
    slot: 'armor',
    land: 'meadow',
    rarity: 'common',
    attackBonus: 0,
    hpBonus: 0,
    description: 'Lekka kamizelka uszyta z zielonych liści.',
  },
  'pancerz-liczydlo': {
    id: 'pancerz-liczydlo',
    name: 'Pancerz Liczydło',
    slot: 'armor',
    land: 'meadow',
    rarity: 'rare',
    attackBonus: 0,
    hpBonus: 20,
    help: { kind: 'numberLine', amount: 1, appliesTo: 'defense' },
    description: 'Pancerz z koralików liczydła: więcej życia i raz na walkę oś liczbowa przy obronie.',
  },
  'siatka-z-trawy': {
    id: 'siatka-z-trawy',
    name: 'Siatka z Trawy',
    slot: 'net',
    land: 'meadow',
    rarity: 'common',
    attackBonus: 0,
    hpBonus: 0,
    description: 'Zwykła trawiasta siatka do łapania stworków.',
  },
  'siec-pajecza': {
    id: 'siec-pajecza',
    name: 'Sieć Pajęcza',
    slot: 'net',
    land: 'meadow',
    rarity: 'uncommon',
    attackBonus: 0,
    hpBonus: 0,
    help: { kind: 'extraCatchTry', amount: 1, appliesTo: 'catch' },
    description: 'Mocna i lepka sieć: jedna próba więcej przy łapaniu stworka.',
  },
  'zlota-siec': {
    id: 'zlota-siec',
    name: 'Złota Sieć',
    slot: 'net',
    land: 'meadow',
    rarity: 'legendary',
    attackBonus: 0,
    hpBonus: 0,
    // Kontrakt ItemDef ma jedno pole `help`, więc zapisujemy dodatkową próbę; oś tylko w opisie.
    help: { kind: 'extraCatchTry', amount: 1, appliesTo: 'catch' },
    description: 'Legendarna sieć: jedna próba więcej i oś liczbowa przy łapaniu stworka.',
  },
  'amulet-drugiej-szansy': {
    id: 'amulet-drugiej-szansy',
    name: 'Amulet Drugiej Szansy',
    slot: 'amulet',
    land: 'meadow',
    rarity: 'rare',
    attackBonus: 0,
    hpBonus: 0,
    help: { kind: 'retry', amount: 1, appliesTo: 'all' },
    description: 'Po pomyłce możesz raz na walkę spokojnie wybrać odpowiedź jeszcze raz.',
  },
};

/** Sprzęt startowy (GDD 13.4: „start”). */
export const STARTER_ITEMS: string[] = ['drewniany-miecz', 'kamizelka-z-lisci', 'siatka-z-trawy'];

/** Łup z bossa Łąki (GDD 13.3). */
export const BOSS_ITEMS_MEADOW: string[] = ['zlota-siec', 'amulet-drugiej-szansy'];

/** Przedmioty ze skrzyń Łąki: wszystko poza startowym i bossowym. */
export const CHEST_ITEM_POOL_MEADOW: string[] = Object.keys(ITEMS).filter(
  (id) => !STARTER_ITEMS.includes(id) && !BOSS_ITEMS_MEADOW.includes(id),
);

/** Skąd pochodzi przedmiot (kolumna „Skąd” w GDD 13.4) — pomocniczo dla gry. */
export type ItemSource = 'start' | 'dungeonChest' | 'worldChest' | 'bonusChest' | 'boss';

export const ITEM_SOURCE_MEADOW: Record<string, ItemSource> = {
  'drewniany-miecz': 'start',
  'miecz-slonecznika': 'dungeonChest',
  'kamizelka-z-lisci': 'start',
  'pancerz-liczydlo': 'bonusChest',
  'siatka-z-trawy': 'start',
  'siec-pajecza': 'worldChest',
  'zlota-siec': 'boss',
  'amulet-drugiej-szansy': 'boss',
};
