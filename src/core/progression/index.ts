// Postęp: etapy krain, pule kategorii dla akcji, dungeon (GDD 6.5, 7.2, 11).
export {
  MAX_STAGE,
  STAGE_UP_MASTERY,
  START_STAGE_MAX,
  START_EVIDENCE_MIN,
  FINAL_FALLBACK,
  clampStage,
  stageCategories,
  firstStageOf,
  actionCategories,
  preferredFormat,
  stageMastery,
  shouldStageUp,
  startingStageFromMastery,
  stageOwnCategories,
} from './progression';
export type { PoolAction, ActionCategoriesArgs, StageMasteryArgs, StartingStageArgs } from './progression';
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
