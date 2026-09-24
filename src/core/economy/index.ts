// Ekonomia: cyfry, brama, produkcja, kuźnia, skrzynie (GDD 9, 10, 12.2, 13.4).
export {
  DIGIT_KINDS,
  isDigit,
  emptyDigits,
  startingDigits,
  digitsFromList,
  digitsToList,
  addDigits,
  addDigitCounts,
  missingDigits,
  hasDigits,
  removeDigits,
  countDigits,
  digitsOfNumber,
} from './digits';
export {
  ALL_GATE_OPS,
  GATE_MAX_OPERAND,
  GATE_PREFER_CHANCE,
  GATE_ERROR_MESSAGES,
  evaluateGateOp,
  isTrivial,
  isSmartOp,
  tokenDigits,
  parseGate,
  gateTokensFromText,
  gateTokensOf,
  formatGate,
  solveGate,
  gateGift,
  scoreGate,
  gateTargetRange,
  makeGate,
} from './gate';
export type { GateEval, MakeGateArgs } from './gate';
export {
  CREATURE_MAX_LEVEL,
  creatureLevel,
  productionPool,
  produce,
  feedBonus,
  catchReward,
  glamGift,
  canStartNewCycle,
  canFeed,
} from './production';
export { FORGE_MAX_LEVEL, FORGE_DIGIT_COUNT, forgeCost, digitWord, checkForgePayment, findForgePayment } from './forge';
export type { ForgePaymentCheck } from './forge';
export { CHEST_PITY_LIMIT, openChest } from './chests';
export type { OpenChestArgs, OpenChestResult } from './chests';
