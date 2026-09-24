// Zapis: schemat, wartości domyślne, migracje, walidacja, historia (GDD 18.3, 19).
export {
  defaultSettings,
  emptySkillModel,
  starterDigits,
  starterEquipment,
  defaultLandProgress,
  defaultLands,
  defaultDungeon,
  defaultProgress,
  starterCards,
} from './defaults';
export { SAVE_VERSION, DEFAULT_PROFILE, createNewSave } from './save';
export { SaveError, migrateSave, serializeSave, deserializeSave } from './migrate';
export type { SaveErrorCode } from './migrate';
export { validateSave, isValidSave } from './validate';
export {
  HISTORY_LIMIT,
  SESSIONS_LIMIT,
  toAttemptLog,
  appendHistory,
  beginSession,
  touchSession,
  sessionStats,
} from './history';
export type { SessionStats } from './history';
export { SAVE_LIMITS } from './limits';
export {
  CARD_IDS,
  STARTER_CARDS,
  CREATURE_IDS,
  ENEMY_IDS,
  ITEM_IDS,
  ITEM_SLOTS,
  LAND_IDS,
  EQUIP_SLOTS,
  STARTER_CREATURE,
  STARTER_EQUIPPED,
  isCardId,
  isCreatureId,
  isEnemyId,
  isItemId,
  isLandId,
  isCategoryId,
  isFactId,
  isFactInCategory,
} from './ids';
export type { CardId, CreatureId, EnemyId, ItemId } from './ids';
