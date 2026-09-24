// Silnik zadań: kategorie, fakty, generatory, dystraktory, podpowiedzi (GDD 5.1–5.4, 6.5).
export { ALL_CATEGORY_IDS, CATEGORIES, MUL_TABLES, isCategoryAvailable, isTwoDigitCategory, tableOf } from './categories';
export {
  allFacts,
  categoriesOfFact,
  commutativePartner,
  factAnswer,
  factsOf,
  formatFact,
  parseFact,
  type ParsedFact,
} from './facts';
export { generateTask, type GenerateTaskArgs } from './generators';
export { makeDistractors, type Distractor, type DistractorInput } from './distractors';
export { hintFor } from './hints';
export {
  MISSING_MARK,
  OP_SYMBOL,
  applyOp,
  evalTerms,
  formatTerms,
  taskEquation,
  type Equation,
  type TaskEquation,
} from './equation';
