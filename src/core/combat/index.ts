// Walka: QTE, obrażenia, bossowie, statystyki bohatera (GDD 7, 12, 13).
export {
  ATTACK_MULT,
  BLOCK_PCT,
  COUNTER_DAMAGE,
  BASE_ATTACK,
  STRONG_ATTACK,
  HERO_BASE_HP,
  DEFENSE_BOOST,
  STRONG_COOLDOWN,
  HEAVY_DEFAULT_EVERY,
} from './constants';
export {
  roundHalfUp,
  isCorrectResult,
  phaseCount,
  phaseDef,
  phaseThresholds,
  phaseForCzar,
  startCombat,
  availableActions,
  enemyIntents,
  applyCzarDamage,
  applyPlayerAttack,
  applyEnemyHit,
  endEnemyTurn,
  isHeroDown,
  rescue,
} from './combat';
export {
  ITEM_MAX_LEVEL,
  itemLevel,
  equippedItems,
  computeHeroStats,
  helpsFor,
  unlockedActions,
  unlockedOperators,
} from './hero';
export type { EquipmentArgs, HeroStatsArgs, HelpContext, HeroHelps } from './hero';
