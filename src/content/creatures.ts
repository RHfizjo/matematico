/**
 * Stworki Łąki (GDD 8, 9.3, 13.1). Imiona i opisy w jednym miejscu — łatwo je zmienić.
 */
import type { CreatureDef } from '../core/types';

export const CREATURES: Record<string, CreatureDef> = {
  plusik: {
    id: 'plusik',
    name: 'Plusik',
    land: 'meadow',
    rarity: 'common',
    categories: ['add.within10', 'add.within20'],
    catchFormat: 'choice',
    catchRule: { need: 2, of: 3 },
    unlocksAction: 'attack',
    unlocksOperator: '+',
    production: 'small',
    description: 'Zielony zajączek z uszami jak plusy, który uwielbia dodawać.',
  },
  dopelniak: {
    id: 'dopelniak',
    name: 'Dopełniak',
    land: 'meadow',
    rarity: 'common',
    categories: ['add.complement10'],
    catchFormat: 'missing',
    catchRule: { need: 2, of: 3 },
    boostsDefense: 'defend',
    production: 'pairs10',
    description: 'Ślimak ze świecącą muszlą z dziesięciu kawałków, który zawsze wie, ile brakuje do 10.',
  },
  blizniak: {
    id: 'blizniak',
    name: 'Bliźniak',
    land: 'meadow',
    rarity: 'uncommon',
    categories: ['add.doubles'],
    catchFormat: 'choice',
    catchRule: { need: 3, of: 4 },
    unlocksAction: 'strongAttack',
    unlocksOperator: '×',
    production: 'twins',
    description: 'Dwa identyczne ptaszki, które wszystko robią podwójnie.',
  },
  koniczynek: {
    id: 'koniczynek',
    name: 'Koniczynek',
    land: 'meadow',
    rarity: 'rare',
    categories: ['add.three', 'add.within20'],
    catchFormat: 'choice',
    catchRule: { need: 3, of: 4 },
    boostsDefense: 'strongDefend',
    shield: true,
    production: 'rare',
    description: 'Świecąca czterolistna koniczynka na nóżkach, która przynosi szczęście i tarczę.',
  },
};

/** Stworek na start gry (GDD 9.3: Plusik w prezencie). */
export const STARTER_CREATURE = 'plusik';
