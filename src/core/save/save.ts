/** Nowy zapis gry (GDD 19). */
import type { SaveV1 } from '../types';
import {
  defaultProgress,
  defaultSettings,
  emptySkillModel,
  starterCards,
  starterDigits,
  starterEquipment,
} from './defaults';
import { STARTER_CREATURE } from './ids';

/** Aktualna wersja schematu zapisu. */
export const SAVE_VERSION = 1;

/** Domyślny profil bohatera. */
export const DEFAULT_PROFILE: Readonly<SaveV1['profile']> = { name: 'Bohater', color: '#3fa7ff' };

/** Znacznik czasu: skończony i ≥ 0 (inaczej 0). */
export function safeTime(t: number): number {
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/** Ziarno jako uint32 (tak samo normalizuje je migracja). */
export function safeSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

/** Świeży zapis: Plusik, talia startowa, sprzęt startowy, 19 cyfr, Łąka odblokowana. */
export function createNewSave(now: number, seed: number): SaveV1 {
  const t = safeTime(now);
  return {
    version: SAVE_VERSION,
    createdAt: t,
    updatedAt: t,
    seed: safeSeed(seed),
    profile: { ...DEFAULT_PROFILE },
    settings: defaultSettings(),
    model: emptySkillModel(),
    inventory: { digits: starterDigits() },
    cards: starterCards(),
    creatures: [{ id: STARTER_CREATURE, level: 1, fedCycle: -1, caughtAt: t }],
    equipment: starterEquipment(),
    progress: defaultProgress(),
    history: [],
    sessions: [],
  };
}
