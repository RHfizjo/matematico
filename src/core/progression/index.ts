// Postęp: etapy krain, pule kategorii dla akcji, dungeon (GDD 6.5, 7.2, 11).
export {
  MAX_STAGE,
  STAGE_UP_MASTERY,
  FINAL_FALLBACK,
  clampStage,
  stageCategories,
  firstStageOf,
  actionCategories,
  preferredFormat,
  stageMastery,
  shouldStageUp,
  startingStageFromMastery,
} from './progression';
export type { PoolAction, ActionCategoriesArgs, StageMasteryArgs } from './progression';
export {
  MEADOW_ROOMS,
  MEADOW_ROOM_ORDER,
  BOSS_MAX_SCALE,
  CZAR_SCALE_PER_STAGE,
  findRoom,
  makeRoomOrder,
  czarScale,
  scaledCzar,
  scaledEnemy,
} from './dungeon';
export type { RoomDef } from './dungeon';
