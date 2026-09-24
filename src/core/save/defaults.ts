/** Wartości domyślne zapisu (GDD 18.3, 19). Każde wywołanie zwraca świeży obiekt. */
import type { Digits, EquipSlot, LandId, LandProgress, OwnedItem, ParentSettings, SaveV1, SkillModel } from '../types';
import { LAND_IDS, STARTER_EQUIPPED } from './ids';

/** Domyślne ustawienia rodzica (GDD 18.3). */
export function defaultSettings(): ParentSettings {
  return {
    range: 20,
    ops: { add: true, sub: true, mul: true, div: true },
    combatOps: 'themed',
    crossTenOnMeadow: true,
    timeLimit: { mode: 'none', fixedSec: { add: 10, sub: 10, mul: 12, div: 12 } },
    breakReminderMin: 0,
    quality: 'auto',
    audio: { music: 0.5, sfx: 0.8 },
    showFps: false,
  };
}

/** Pusty model ucznia. */
export function emptySkillModel(): SkillModel {
  return { facts: {}, categories: {}, session: 0, taskCounter: 0, window: [], recent: [], retries: [], errorStreak: 0 };
}

/** Cyfry na start: 2× każda z 1–9 + 1× 0 (lokalnie, bez importu z economy). */
export function starterDigits(): Digits {
  const d: Digits = [1];
  for (let i = 1; i <= 9; i++) d.push(2);
  return d;
}

/** Postęp krainy na start: Łąka odblokowana, reszta zamknięta. */
export function defaultLandProgress(land: LandId): LandProgress {
  return { unlocked: land === 'meadow', stage: 1, bossDefeated: false, gatesOpened: 0, dungeonRuns: 0 };
}

export function defaultLands(): Record<LandId, LandProgress> {
  const out = {} as Record<LandId, LandProgress>;
  for (const id of LAND_IDS) out[id] = defaultLandProgress(id);
  return out;
}

export function defaultDungeon(): SaveV1['progress']['dungeon'] {
  return { active: false, roomOrder: [], roomIndex: 0, enemyCzar: {}, bossPhase: 1 };
}

export function defaultProgress(): SaveV1['progress'] {
  return {
    cycle: 0,
    taskSinceReturn: false,
    calibrated: false,
    firstExpeditionDone: false,
    lands: defaultLands(),
    glams: {},
    openedChests: [],
    chestPity: 0,
    dungeon: defaultDungeon(),
    pendingBonusChest: false,
  };
}

/** Sprzęt startowy: miecz, kamizelka i siatka na poziomie 1, bez amuletu. */
export function starterEquipment(): SaveV1['equipment'] {
  const owned: OwnedItem[] = [];
  const equipped: Record<EquipSlot, string | null> = { ...STARTER_EQUIPPED };
  for (const id of Object.values(STARTER_EQUIPPED)) if (id !== null) owned.push({ id, level: 1 });
  return { owned, equipped };
}
