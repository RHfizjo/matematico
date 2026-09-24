/**
 * Reguły gry dla warstwy orkiestracji/UI (GDD 3, 6.5–6.6, 7.5–7.6, 8, 9.3, 9.5a, 10, 11, 13.3, 13.5).
 * Małe funkcje, które MUTUJĄ przekazany SaveV1. core/ nie importuje content/, więc definicje
 * stworków, przedmiotów i kart podaje wywołujący (`GameDefs`, np. z content/).
 */
import type { Rng } from './rng';
import type {
  ActionKind,
  Attempt,
  AttemptMode,
  CardDef,
  CardGrants,
  ChestKind,
  ChestLoot,
  CreatureDef,
  GateOp,
  GateScore,
  GateSpec,
  GateToken,
  HeroStats,
  Hint,
  ItemDef,
  LandId,
  QteResult,
  SaveV1,
  Task,
  TradeOffer,
} from './types';
import { hintFor } from './math';
import { applyCalibration, categoryMastery, classifyResult, recordAttempt, startSession } from './adaptive';
import {
  CREATURE_MAX_LEVEL,
  addDigitCounts,
  addDigits,
  canStartNewCycle,
  catchReward,
  digitsToList,
  feedBonus,
  glamGift,
  openChest,
  produce,
  removeDigits,
  scoreGate,
} from './economy';
import { computeHeroStats, helpsFor, unlockedActions, unlockedOperators } from './combat';
import type { HelpContext, HeroHelps } from './combat';
import { MAX_STAGE, MEADOW_ROOM_ORDER, makeRoomOrder, shouldStageUp, startingStageFromMastery } from './progression';
import { SAVE_LIMITS, appendHistory, beginSession, defaultDungeon, isCardId, isEnemyId, touchSession } from './save';
import { MAX_COPIES, buildDeck, deckCopies } from './cards';
import { acceptOffer, merchantOffers } from './merchant';
import type { AcceptOfferResult } from './merchant';

// ───────────── Definicje treści ─────────────

/** Dane treści potrzebne regułom (z content/: CREATURES, ITEMS, CARDS, CARD_GRANTS). */
export interface GameDefs {
  creatures: Record<string, CreatureDef>;
  items: Record<string, ItemDef>;
  cards: Record<string, CardDef>;
  grants: CardGrants;
}

// ───────────── Karty: kolekcja ─────────────

/** Otrzymane kopie karty. */
export interface CardGain {
  cardId: string;
  count: number;
}

/**
 * Dodaje kopie karty do kolekcji (maks. 99 na kartę). Tylko karty znane treści i formatowi zapisu
 * (inaczej wczytanie zapisu by je usunęło). Zwraca faktycznie dodaną liczbę kopii.
 */
function addOwnedCards(save: SaveV1, cardId: string, n: number, defs: GameDefs): number {
  if (!(n > 0) || !Object.hasOwn(defs.cards, cardId) || !isCardId(cardId)) return 0;
  const have = save.cards.owned[cardId] ?? 0;
  const next = Math.min(SAVE_LIMITS.cardMax, have + Math.floor(n));
  save.cards.owned[cardId] = next;
  return next - have;
}

/** Talia do walki (GDD 7.5): maks. 3 kopie karty, maks. 15 kart; lista id (tasuje dopiero walka). */
export function deckOf(save: SaveV1, defs: GameDefs): string[] {
  return buildDeck(save.cards.owned, defs.cards);
}

export interface CollectionEntry {
  cardId: string;
  /** Posiadane kopie (0 = jeszcze nie zdobyta — do „sylwetki” w kolekcji). */
  owned: number;
  /** Kopie w talii. */
  inDeck: number;
  /** Zapas do wymiany u handlarza: kopie ponad 3 (GDD 9.5a). */
  spare: number;
}

/** Kolekcja na Stole z kartami (GDD 9.1): wszystkie karty z treści, w kolejności definicji. */
export function collectionOf(save: SaveV1, defs: GameDefs): CollectionEntry[] {
  const inDeck = deckCopies(save.cards.owned, defs.cards);
  return Object.keys(defs.cards).map((cardId) => {
    const n = save.cards.owned[cardId];
    const owned = typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
    return { cardId, owned, inDeck: inDeck[cardId] ?? 0, spare: Math.max(0, owned - MAX_COPIES) };
  });
}

/**
 * Uzupełnia karty w zapisie sprzed kart (GDD v0.3): posiadany stworek bez żadnej kopii swojej karty
 * dostaje karty jak przy złapaniu (+ awans, gdy poziom ≥ 2), a brainglam z Galerii — kopię za każdą
 * przemianę. W poprawnej grze taka karta nigdy nie spada do 0 (handlarz bierze tylko zapas), więc
 * wywołanie po każdym wczytaniu jest bezpieczne i idempotentne.
 */
export function backfillCards(save: SaveV1, defs: GameDefs): CardGain[] {
  const gains: CardGain[] = [];
  const give = (cardId: string, n: number): void => {
    if ((save.cards.owned[cardId] ?? 0) > 0) return;
    const count = addOwnedCards(save, cardId, n, defs);
    if (count > 0) gains.push({ cardId, count });
  };
  for (const c of save.creatures) {
    const grant = Object.hasOwn(defs.grants.creatures, c.id) ? defs.grants.creatures[c.id] : undefined;
    if (grant !== undefined) give(grant.cardId, grant.onCatch + (c.level >= 2 ? grant.onLevelUp : 0));
  }
  for (const g of Object.values(save.progress.glams)) {
    const cardId = Object.hasOwn(defs.grants.glams, g.enemyId) ? defs.grants.glams[g.enemyId] : undefined;
    if (cardId !== undefined) give(cardId, g.count);
  }
  return gains;
}

// ───────────── Handlarz Kartonini ─────────────

/** Oferty handlarza dla zapisu (GDD 9.5a): cykl, ziarno profilu, kupiona oferta dnia, Skarbiec. */
export function offersFor(save: SaveV1, defs: GameDefs): TradeOffer[] {
  return merchantOffers({
    owned: save.cards.owned,
    cards: defs.cards,
    cycle: save.progress.cycle,
    seed: save.seed,
    dailyBoughtCycle: save.progress.merchantDailyCycle,
    digits: save.inventory.digits,
  });
}

/**
 * Przyjęcie oferty handlarza po id. Oferta jest wyliczana od nowa z zapisu (nieaktualne id → odmowa),
 * więc nie da się np. kupić drugi raz oferty dnia. Kupno oferty dnia zapamiętuje cykl.
 */
export function acceptMerchant(
  save: SaveV1,
  offerId: string,
  payment: readonly number[] | undefined,
  rng: Rng,
  defs: GameDefs,
): AcceptOfferResult {
  const offer = offersFor(save, defs).find((o) => o.id === offerId);
  if (offer === undefined) return { ok: false, message: 'Tej oferty już nie ma.', cardGained: null, digitsGained: [] };
  const result = acceptOffer({
    owned: save.cards.owned,
    digits: save.inventory.digits,
    offer,
    cards: defs.cards,
    rng,
    ...(payment !== undefined ? { payment } : {}),
  });
  if (result.ok && offer.kind === 'daily') save.progress.merchantDailyCycle = save.progress.cycle;
  return result;
}

// ───────────── Sesja ─────────────

/** Początek sesji gry: nowy wpis w dzienniku sesji i nowa sesja modelu ucznia. */
export function beginPlaySession(save: SaveV1, now: number): void {
  beginSession(save, now);
  startSession(save.model, now);
}

// ───────────── Odpowiedź na zadanie ─────────────

export interface AnswerInput {
  /** Wybrana/wpisana liczba; null = brak odpowiedzi. */
  given: number | null;
  ms: number;
  timedOut: boolean;
  /** Pomoc sprzętu (OŚ, POPRAWKA). */
  helped: boolean;
  mode: AttemptMode;
  /** Limit czasu (timeLimitMs) albo null. */
  limitMs: number | null;
}

export interface AnswerOutcome {
  correct: boolean;
  result: QteResult;
  attempt: Attempt;
  /** Podpowiedź-strategia po błędzie lub braku odpowiedzi (GDD 5.4). */
  hint: Hint | null;
}

/**
 * Czy zadanie w tym trybie liczy się do „padło zadanie od powrotu” (GDD 3: cykl = powrót po
 * wyprawie lub dungeonie z ≥1 zadaniem). Zadania w bazie (karmienie, kuźnia) i kalibracja — nie.
 */
const COUNTS_FOR_CYCLE: Readonly<Record<AttemptMode, boolean>> = {
  combat: true,
  catch: true,
  gate: true,
  chest: true,
  feed: false,
  forge: false,
  calibration: false,
};

/** Próba z odpowiedzi (czysta funkcja). Brak odpowiedzi w limicie → given = null. */
export function buildAttempt(task: Task, input: AnswerInput, now: number): Attempt {
  const given = input.timedOut ? null : input.given;
  const correct = given !== null && given === task.answer;
  const errorKind = !correct && given !== null ? (task.distractorKinds[String(given)] ?? null) : null;
  return {
    taskId: task.id,
    factId: task.factId,
    categoryId: task.categoryId,
    categories: [...task.categories],
    format: task.format,
    mode: input.mode,
    correct,
    timedOut: input.timedOut,
    ms: input.ms,
    helped: input.helped,
    given,
    errorKind,
    at: now,
  };
}

/**
 * Odpowiedź dziecka: wynik QTE (przed aktualizacją modelu), zapis próby w modelu, historii
 * i sesji, znacznik zadania od powrotu, podpowiedź po błędzie/braku odpowiedzi.
 * Tryb 'calibration': próba NIE trafia do modelu — robi to finishCalibration (applyCalibration).
 */
export function answerTask(save: SaveV1, task: Task, input: AnswerInput, now: number): AnswerOutcome {
  const attempt = buildAttempt(task, input, now);
  const { correct } = attempt;
  const result = classifyResult(save.model, task, {
    correct,
    timedOut: input.timedOut,
    ms: input.ms,
    helped: input.helped,
    limitMs: input.limitMs,
  });
  if (input.mode !== 'calibration') recordAttempt(save.model, attempt, now);
  appendHistory(save, attempt);
  touchSession(save, now, correct);
  if (COUNTS_FOR_CYCLE[input.mode]) save.progress.taskSinceReturn = true;
  return { correct, result, attempt, hint: correct ? null : hintFor(task) };
}

// ───────────── Próby łapania / karmienia ─────────────

/** Karmienie (GDD 9.3): 3 zadania z kategorii stworka, udane przy ≥ 2 poprawnych. */
export const FEED_RULE: Readonly<{ need: number; of: number }> = { need: 2, of: 3 };

export type TrialStatus = 'success' | 'fail' | 'continue';

/**
 * Stan serii prób „need z of” (łapanie GDD 8, karmienie): sukces od razu po `need` poprawnych,
 * porażka, gdy sukces jest już niemożliwy. `extraTries` — dodatkowe próby z sieci (GDD 12).
 */
export function trialStatus(rule: { need: number; of: number }, results: readonly boolean[], extraTries = 0): TrialStatus {
  const ok = results.filter((r) => r).length;
  if (ok >= rule.need) return 'success';
  const total = rule.of + (Number.isFinite(extraTries) ? Math.max(0, Math.floor(extraTries)) : 0);
  const left = Math.max(0, total - results.length);
  return ok + left < rule.need ? 'fail' : 'continue';
}

// ───────────── Baza: cykl produkcji, karmienie ─────────────

export interface ReturnResult {
  newCycle: boolean;
  produced: { creatureId: string; digits: number[] }[];
}

/**
 * Powrót do bazy (GDD 3, 9.3). Gdy od powrotu padło ≥1 zadanie: cykl + 1, produkcja każdego
 * posiadanego stworka trafia do skarbca, pierwsza wyprawa zaliczona.
 * Limit czasu NIE jest włączany automatycznie (GDD 7.4, v0.3: decyzja „Łagodny po pierwszej
 * wyprawie” uchylona — limit włącza tylko rodzic).
 */
export function returnToBase(save: SaveV1, rng: Rng, now: number, defs: GameDefs): ReturnResult {
  touchSession(save, now, null);
  const p = save.progress;
  if (!canStartNewCycle(p.taskSinceReturn)) return { newCycle: false, produced: [] };
  p.cycle += 1;
  p.taskSinceReturn = false;
  p.firstExpeditionDone = true;
  const produced: ReturnResult['produced'] = [];
  for (const owned of save.creatures) {
    const def = defs.creatures[owned.id];
    if (def === undefined) continue;
    const digits = produce(owned, def, p.cycle, rng);
    addDigits(save.inventory.digits, digits);
    produced.push({ creatureId: owned.id, digits });
  }
  return { newCycle: true, produced };
}

/** Czy stworka można nakarmić w tym cyklu (posiadany i nienakarmiony w bieżącym cyklu). */
export function feedCreature(save: SaveV1, creatureId: string): boolean {
  const owned = save.creatures.find((c) => c.id === creatureId);
  return owned !== undefined && owned.fedCycle < save.progress.cycle;
}

/**
 * Udane karmienie (wywołujący sprawdził FEED_RULE): +1 cyfra z puli stworka, fedCycle = cykl.
 * Karmienie niedozwolone lub nieznany stworek → [] (bez zmian).
 */
export function completeFeeding(save: SaveV1, creatureId: string, rng: Rng, defs: GameDefs): number[] {
  const owned = save.creatures.find((c) => c.id === creatureId);
  const def = defs.creatures[creatureId];
  if (owned === undefined || def === undefined || !feedCreature(save, creatureId)) return [];
  owned.fedCycle = save.progress.cycle;
  const digits = feedBonus(def, rng);
  addDigits(save.inventory.digits, digits);
  return digits;
}

// ───────────── Łapanie, przemiana, łup ─────────────

export interface CatchResult {
  /** true = pierwszy egzemplarz (nowy stworek w kolekcji). */
  isNew: boolean;
  /** Awans poziomu (duplikat, maks. 3). */
  leveledUp: boolean;
  level: number;
  digits: number[];
  /** Karty stworka: przy złapaniu i awansie na poziom 2 (GDD 8, 13.5). Poziom 3 wzmacnia karty zamiast kopii. */
  cardsGained: CardGain[];
}

/**
 * Złapanie (GDD 8): nowy stworek (poz. 1) albo awans duplikatu (maks. 3) + 1 cyfra z puli stworka.
 * Karty (GDD 13.5): nowy stworek → onCatch kopii jego karty, awans na poziom 2 → onLevelUp kopii,
 * poziom 3 → bez kopii (karty stworka są silniejsze o 25% — liczy to walka kartami).
 */
export function catchCreature(save: SaveV1, creatureId: string, now: number, rng: Rng, defs: GameDefs): CatchResult {
  const def = defs.creatures[creatureId];
  if (def === undefined) throw new RangeError(`catchCreature: nieznany stworek ${creatureId}`);
  let owned = save.creatures.find((c) => c.id === creatureId);
  const isNew = owned === undefined;
  let leveledUp = false;
  if (owned === undefined) {
    owned = { id: creatureId, level: 1, fedCycle: -1, caughtAt: now };
    save.creatures.push(owned);
  } else if (owned.level < CREATURE_MAX_LEVEL) {
    owned.level += 1;
    leveledUp = true;
  }
  const digits = catchReward(def, rng);
  addDigits(save.inventory.digits, digits);
  const cardsGained: CardGain[] = [];
  const grant = Object.hasOwn(defs.grants.creatures, creatureId) ? defs.grants.creatures[creatureId] : undefined;
  if (grant !== undefined) {
    const n = isNew ? grant.onCatch : leveledUp && owned.level === 2 ? grant.onLevelUp : 0;
    const count = addOwnedCards(save, grant.cardId, n, defs);
    if (count > 0) cardsGained.push({ cardId: grant.cardId, count });
  }
  return { isNew, leveledUp, level: owned.level, digits, cardsGained };
}

export interface TransformResult {
  firstTime: boolean;
  /** Prezent powitalny (tylko pierwsza przemiana gatunku). */
  gift: number[];
  /** Karta brainglama — kopia przy każdej przemianie (null, gdy brak karty w treści lub limit 99). */
  cardGained: string | null;
}

/**
 * Przemiana brainrota w brainglama (GDD 7.6): wpis w Galerii (licznik), przy pierwszej
 * przemianie gatunku prezent powitalny — 3 cyfry (w tym 1 niezwykła); przy każdej przemianie
 * kopia karty brainglama (GDD 13.5).
 */
export function transformEnemy(save: SaveV1, enemyId: string, now: number, rng: Rng, defs: GameDefs): TransformResult {
  // Zapis przechowuje tylko znane gatunki (migracja odrzuca resztę).
  if (!isEnemyId(enemyId)) throw new RangeError(`transformEnemy: nieznany brainrot ${enemyId}`);
  const cardId = Object.hasOwn(defs.grants.glams, enemyId) ? defs.grants.glams[enemyId] : undefined;
  const cardGained = cardId !== undefined && addOwnedCards(save, cardId, 1, defs) > 0 ? cardId : null;
  const entry = save.progress.glams[enemyId];
  if (entry !== undefined) {
    entry.count += 1;
    return { firstTime: false, gift: [], cardGained };
  }
  save.progress.glams[enemyId] = { enemyId, count: 1, firstAt: now };
  const gift = glamGift(rng);
  addDigits(save.inventory.digits, gift);
  return { firstTime: true, gift, cardGained };
}

/**
 * Dodaje przedmiot do sprzętu (poziom 1). Pusty slot → od razu założony.
 * false, gdy przedmiot już był posiadany. Nieznany przedmiot → wyjątek.
 */
export function grantItem(save: SaveV1, itemId: string, defs: GameDefs): boolean {
  const def = defs.items[itemId];
  if (def === undefined) throw new RangeError(`grantItem: nieznany przedmiot ${itemId}`);
  if (save.equipment.owned.some((o) => o.id === itemId)) return false;
  save.equipment.owned.push({ id: itemId, level: 1 });
  if (save.equipment.equipped[def.slot] === null) save.equipment.equipped[def.slot] = itemId;
  return true;
}

/**
 * Otwiera skrzynię (GDD 9.3, 10.2, 13.4): cyfry do skarbca, licznik gwarancji w zapisie,
 * przedmiot z puli (posiadane i nieznane pomijane) od razu w sprzęcie.
 * Skrzynka bonusowa (sprytna brama) kasuje pendingBonusChest.
 */
export function lootChest(
  save: SaveV1,
  kind: ChestKind,
  rng: Rng,
  itemPool: readonly string[],
  defs: GameDefs,
): ChestLoot {
  const owned = new Set(save.equipment.owned.map((o) => o.id));
  const pool = itemPool.filter((id) => defs.items[id] !== undefined && !owned.has(id));
  const { loot, pity } = openChest({ kind, pity: save.progress.chestPity, rng, itemPool: pool });
  save.progress.chestPity = pity;
  addDigits(save.inventory.digits, loot.digits);
  if (loot.itemId !== null) grantItem(save, loot.itemId, defs);
  if (kind === 'bonus') save.progress.pendingBonusChest = false;
  return loot;
}

export interface BossLoot {
  /** Nowo zdobyte przedmioty (posiadane są pomijane). */
  items: string[];
  /** 5 cyfr, w tym dokładnie jedno 0 (GDD 13.3). */
  digits: number[];
  /** Etap krainy po pokonaniu bossa. */
  stage: number;
}

/**
 * Pokonanie bossa (GDD 6.5, 13.3): boss zaliczony, etap krainy + 1 (maks. 4),
 * przedmioty bossa i 5 cyfr ze skrzyni bossa. Przemianę robi osobno transformEnemy.
 */
export function defeatBoss(save: SaveV1, land: LandId, itemIds: readonly string[], rng: Rng, defs: GameDefs): BossLoot {
  const lp = save.progress.lands[land];
  lp.bossDefeated = true;
  lp.stage = Math.min(MAX_STAGE, lp.stage + 1);
  const items = itemIds.filter((id) => grantItem(save, id, defs));
  const { digits } = lootChest(save, 'boss', rng, [], defs);
  return { items, digits, stage: lp.stage };
}

// ───────────── Brama ─────────────

/** Dar bramy (GDD 10.4): brakujące cyfry trafiają do skarbca. Wołać raz, przy pokazaniu bramy. */
export function applyGateGift(save: SaveV1, gate: GateSpec): number[] {
  addDigitCounts(save.inventory.digits, gate.gift);
  return digitsToList(gate.gift);
}

/**
 * Próba otwarcia bramy (GDD 10.2–10.3). Błędne wyrażenie niczego nie zużywa.
 * Poprawne: zużyte cyfry znikają ze skarbca, licznik bram krainy + 1, sprytne → bonusowa skrzynka.
 * Brama z darem (GDD 10.4) nigdy nie daje bonusowej skrzynki — inaczej dar + sprytne rozwiązanie
 * dawałyby darmowe skrzynki (`score.smart` zostaje, żeby pochwalić pomysł).
 */
export function openGate(save: SaveV1, tokens: readonly GateToken[], gate: GateSpec, land: LandId = 'meadow'): GateScore {
  const score = scoreGate(tokens, gate.target, save.inventory.digits, gate.ops);
  if (!score.valid) return score;
  removeDigits(save.inventory.digits, score.digitsUsed);
  save.progress.lands[land].gatesOpened += 1;
  const gifted = gate.gift.some((n) => n > 0);
  if (score.smart && !gifted) save.progress.pendingBonusChest = true;
  return score;
}

// ───────────── Dungeon: przebieg wyprawy ─────────────

/**
 * Początek wyprawy do dungeonu (GDD 11), pełne HP, bez zapisanych walk. Zwraca kolejność pokoi.
 * Pierwsza wyprawa krainy: kolejność z tabeli GDD 11 (wejście, skarbiec, gniazdo, ognisko, boss).
 * Powtórna wizyta: pokoje 1–3 w INNEJ kolejności niż poprzednio (makeRoomOrder z `previous` —
 * poprzednią kolejność zostawia w zapisie finishDungeon albo przerwana wyprawa).
 */
export function startDungeonRun(save: SaveV1, rng: Rng, land: LandId = 'meadow'): string[] {
  const previous = save.progress.dungeon.roomOrder;
  const firstVisit = save.progress.lands[land].dungeonRuns === 0 && previous.length === 0;
  const roomOrder = firstVisit ? [...MEADOW_ROOM_ORDER] : makeRoomOrder(rng, previous.length > 0 ? previous : undefined);
  save.progress.dungeon = { ...defaultDungeon(), active: true, roomOrder };
  return [...roomOrder];
}

/** Id bieżącego pokoju albo null (brak wyprawy lub wszystkie pokoje zaliczone). */
export function currentRoomId(save: SaveV1): string | null {
  const d = save.progress.dungeon;
  if (!d.active) return null;
  return d.roomOrder[d.roomIndex] ?? null;
}

/** Stan walki do zapamiętania (GDD 7.5: po powrocie brainrot zachowuje zdjęty Czar, boss fazę). */
export interface BattleProgress {
  czar: number;
  phase: number;
  vines: number;
  heroHp: number;
  heroMaxHp: number;
}

/**
 * Zapis postępu walki w dungeonie (po każdym ruchu): Czar wroga pod kluczem `roomKey`
 * (np. 'nest:trzmielini'), faza i pnącza bossa, HP bohatera (null = pełne; HP ≤ 0 → null,
 * bo „Stworki cię ratują” przywracają pełne HP). Czar 0 = brainrot odczarowany (nie wznawiać).
 */
export function recordBattleProgress(save: SaveV1, roomKey: string, state: BattleProgress): void {
  if (roomKey.length === 0 || roomKey.length > SAVE_LIMITS.idMaxLength || roomKey === '__proto__') {
    throw new RangeError(`recordBattleProgress: zły klucz pokoju ${JSON.stringify(roomKey)}`);
  }
  if (!Number.isFinite(state.czar)) throw new RangeError(`recordBattleProgress: zły Czar ${state.czar}`);
  const d = save.progress.dungeon;
  const clampInt = (v: number, def: number, min: number, max: number): number =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def;
  d.enemyCzar[roomKey] = Math.max(0, state.czar) || 0;
  d.bossPhase = clampInt(state.phase, 1, 1, SAVE_LIMITS.bossPhaseMax);
  d.vines = clampInt(state.vines, 0, 0, SAVE_LIMITS.vinesMax);
  const full = !(state.heroHp < state.heroMaxHp) || !(state.heroHp > 0);
  d.heroHp = full ? null : clampInt(Math.round(state.heroHp), 1, 1, SAVE_LIMITS.heroHpMax);
}

/**
 * Pokój zaliczony: następny pokój (HP bohatera przechodzi dalej), stan bossa wyzerowany.
 * Zwraca id następnego pokoju albo null (koniec dungeonu / brak wyprawy).
 */
export function clearRoom(save: SaveV1): string | null {
  const d = save.progress.dungeon;
  if (!d.active) return null;
  d.roomIndex = Math.min(d.roomOrder.length, d.roomIndex + 1);
  d.bossPhase = 1;
  d.vines = 0;
  return currentRoomId(save);
}

/** Ognisko (GDD 11, pokój 4): pełne HP. */
export function restAtCampfire(save: SaveV1): void {
  save.progress.dungeon.heroHp = null;
}

/**
 * Koniec wyprawy (po bossie): licznik wypraw krainy + 1, stan dungeonu wyzerowany — poza kolejnością
 * pokoi, która zostaje (przy active = false) jako „poprzednia”, żeby następna wyprawa miała inną
 * (GDD 11). false (bez zmian), gdy żadna wyprawa nie trwa — licznik nie rośnie dwa razy.
 */
export function finishDungeon(save: SaveV1, land: LandId = 'meadow'): boolean {
  const d = save.progress.dungeon;
  if (!d.active) return false;
  save.progress.lands[land].dungeonRuns += 1;
  save.progress.dungeon = { ...defaultDungeon(), roomOrder: [...d.roomOrder] };
  return true;
}

// ───────────── Bohater ─────────────

/** Statystyki bohatera z założonego sprzętu i posiadanych stworków. */
export function heroStats(save: SaveV1, defs: GameDefs): HeroStats {
  return computeHeroStats({
    equipped: save.equipment.equipped,
    owned: save.equipment.owned,
    items: defs.items,
    creatures: save.creatures,
    creatureDefs: defs.creatures,
  });
}

/** Pomoce sprzętu w kontekście (atak, obrona, łapanie). */
export function helps(save: SaveV1, context: HelpContext, defs: GameDefs): HeroHelps {
  return helpsFor({ equipped: save.equipment.equipped, owned: save.equipment.owned, items: defs.items }, context);
}

/** Akcje walki odblokowane przez posiadane stworki (nazwa ≠ combat.unlockedActions). */
export function unlockedActionsOf(save: SaveV1, defs: GameDefs): ActionKind[] {
  return unlockedActions(save.creatures, defs.creatures);
}

/** Działania bramy odblokowane przez posiadane stworki (nazwa ≠ combat.unlockedOperators). */
export function unlockedOperatorsOf(save: SaveV1, defs: GameDefs): GateOp[] {
  return unlockedOperators(save.creatures, defs.creatures);
}

// ───────────── Etapy i kalibracja ─────────────

/** Awans etapu krainy (GDD 6.5): średnie opanowanie puli bieżącego etapu ≥ 0,7 → etap + 1. */
export function stageCheck(save: SaveV1, land: LandId): boolean {
  const lp = save.progress.lands[land];
  const { model, settings } = save;
  const up = shouldStageUp({ land, settings, stage: lp.stage, mastery: (c) => categoryMastery(model, c, settings) });
  if (up) lp.stage = Math.min(MAX_STAGE, lp.stage + 1);
  return up;
}

/**
 * Koniec „Próby Plusika” (GDD 6.6): wyniki trafiają do modelu (applyCalibration), etap Łąki
 * ze startowego opanowania (nigdy niższy niż obecny), kalibracja zaliczona. Zwraca etap Łąki.
 * Próby z answerTask w trybie 'calibration' są już w historii, ale jeszcze nie w modelu.
 */
export function finishCalibration(save: SaveV1, attempts: readonly Attempt[]): number {
  const { model, settings } = save;
  applyCalibration(model, attempts, settings);
  const meadow = save.progress.lands.meadow;
  const start = startingStageFromMastery({ land: 'meadow', settings, mastery: (c) => categoryMastery(model, c, settings) });
  meadow.stage = Math.min(MAX_STAGE, Math.max(meadow.stage, start));
  save.progress.calibrated = true;
  return meadow.stage;
}
