/**
 * Reguły gry dla warstwy orkiestracji/UI (GDD 3, 6.5–6.6, 7.5–7.6, 8, 9.3, 10, 13.3).
 * Małe funkcje, które MUTUJĄ przekazany SaveV1. core/ nie importuje content/, więc definicje
 * stworków i przedmiotów podaje wywołujący (`GameDefs`, np. z content/).
 */
import type { Rng } from './rng';
import type {
  ActionKind,
  Attempt,
  AttemptMode,
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
import { MAX_STAGE, shouldStageUp, startingStageFromMastery } from './progression';
import { appendHistory, beginSession, isEnemyId, touchSession } from './save';

// ───────────── Definicje treści ─────────────

/** Dane treści potrzebne regułom (z content/: CREATURES, ITEMS). */
export interface GameDefs {
  creatures: Record<string, CreatureDef>;
  items: Record<string, ItemDef>;
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
}

/** Złapanie (GDD 8): nowy stworek (poz. 1) albo awans duplikatu (maks. 3) + 1 cyfra z puli stworka. */
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
  return { isNew, leveledUp, level: owned.level, digits };
}

/**
 * Przemiana brainrota w brainglama (GDD 7.6): wpis w Galerii (licznik), przy pierwszej
 * przemianie gatunku prezent powitalny — 3 cyfry (w tym 1 niezwykła).
 */
export function transformEnemy(save: SaveV1, enemyId: string, now: number, rng: Rng): { firstTime: boolean; gift: number[] } {
  // Zapis przechowuje tylko znane gatunki (migracja odrzuca resztę).
  if (!isEnemyId(enemyId)) throw new RangeError(`transformEnemy: nieznany brainrot ${enemyId}`);
  const entry = save.progress.glams[enemyId];
  if (entry !== undefined) {
    entry.count += 1;
    return { firstTime: false, gift: [] };
  }
  save.progress.glams[enemyId] = { enemyId, count: 1, firstAt: now };
  const gift = glamGift(rng);
  addDigits(save.inventory.digits, gift);
  return { firstTime: true, gift };
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
 */
export function openGate(save: SaveV1, tokens: readonly GateToken[], gate: GateSpec, land: LandId = 'meadow'): GateScore {
  const score = scoreGate(tokens, gate.target, save.inventory.digits, gate.ops);
  if (!score.valid) return score;
  removeDigits(save.inventory.digits, score.digitsUsed);
  save.progress.lands[land].gatesOpened += 1;
  if (score.smart) save.progress.pendingBonusChest = true;
  return score;
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
