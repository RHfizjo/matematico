// Walka kartami: talia, tura dziecka i brainrota, zapowiedzi ruchów (GDD v0.3, sekcje 7, 9.5a, 13.5).
export {
  HAND_SIZE,
  MAX_ENERGY,
  MAX_COPIES,
  DECK_MAX,
  LEVEL3_BOOST,
  BOOST_LEVEL,
  MAX_WEAKEN,
  MULTI_HIT_FACTOR,
} from './constants';
export { RARITY_RANK, sortCardIds, deckCopies, buildDeck, spareCounts, countCards } from './deck';
export { intentHitDamage, weakenedHit, intentKindOf, intentsFor, intentView } from './intents';
export type { IntentKind, IntentPlan, IntentView } from './intents';
export {
  isAttackCard,
  startCardBattle,
  isCardHeroDown,
  canPlay,
  playableUids,
  previewCard,
  cardPowerText,
  playCard,
  endPlayerTurn,
  rescueHero,
  levelBoostFor,
} from './battle';
export type {
  CardBattleResume,
  StartCardBattleArgs,
  PlayCardArgs,
  EndPlayerTurnArgs,
  PlayBlockReason,
  PlayCheck,
  CardPreview,
} from './battle';
