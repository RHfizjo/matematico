/**
 * Symulacja end-to-end bez grafiki (GDD 3, 7, 9.5a, 11, 22 „Definicja ukończenia MVP” pkt 1 i 7):
 * wirtualne dziecko (skuteczność 0,8, słabsze w add.cross10) przechodzi pełną pętlę
 * nowy zapis → Próba Plusika → łapanie (karty stworków) → baza → brama → dungeon z WALKAMI KARTAMI
 * (brainroty → brainglamy + ich karty, boss z fazami i pnączami) → baza → Handlarz Kartonini,
 * wyłącznie przez publiczne API core/ (fasada) i prawdziwe dane z content/.
 *
 * Strategia dziecka w walce: gdy zapowiedź to mocny cios — osłabienie/tarcza, inaczej atak
 * (najsilniejsza karta ataku); leczenie przy małym HP; gra karty, dopóki ma energię.
 * Działanie do karty: pickTask(actionCategories({ action: karta.pool })); u bossa pula fazy (GDD 13.3).
 */
import { describe, expect, it } from 'vitest';
import type {
  AnswerOutcome,
  Attempt,
  AttemptMode,
  CardBattleState,
  CardDef,
  CategoryId,
  CombatEvent,
  EnemyDef,
  GameDefs,
  HeroStats,
  ParentSettings,
  PoolAction,
  QteResult,
  Rng,
  SaveV1,
  Task,
  TaskFormat,
} from '../src/core';
import {
  DECK_MAX,
  FEED_RULE,
  HAND_SIZE,
  MAX_COPIES,
  MAX_ENERGY,
  MEADOW_ROOM_ORDER,
  acceptMerchant,
  actionCategories,
  answerTask,
  applyGateGift,
  backfillCards,
  beginPlaySession,
  catchCreature,
  classifyResult,
  clearRoom,
  completeFeeding,
  countCards,
  countDigits,
  createCalibration,
  createNewSave,
  createRng,
  createSkillModel,
  currentRoomId,
  deckOf,
  defaultDungeon,
  defeatBoss,
  deserializeSave,
  emptySkillModel,
  endPlayerTurn,
  feedCreature,
  findForgePayment,
  findRoom,
  finishCalibration,
  finishDungeon,
  gateTokensOf,
  helps,
  heroStats,
  intentView,
  isAttackCard,
  isCardHeroDown,
  levelBoostFor,
  lootChest,
  makeGate,
  offersFor,
  openGate,
  pickTask,
  playCard,
  playableUids,
  previewCard,
  recordBattleProgress,
  rescueHero,
  restAtCampfire,
  returnToBase,
  scaledEnemy,
  serializeSave,
  solveGate,
  stageCheck,
  startCardBattle,
  startDungeonRun,
  timeLimitMs,
  transformEnemy,
  trialStatus,
  unlockedActionsOf,
  unlockedOperatorsOf,
  validateSave,
  weakest,
} from '../src/core';
import {
  BOSS_ITEMS_MEADOW,
  CARDS,
  CARD_GRANTS,
  CHEST_ITEM_POOL_MEADOW,
  CREATURES,
  ENEMIES,
  ITEMS,
  MEADOW_BOSS,
  MEADOW_ENEMIES,
} from '../src/content';

const DEFS: GameDefs = { creatures: CREATURES, items: ITEMS, cards: CARDS, grants: CARD_GRANTS };
const T0 = 1_750_000_000_000;
const LAND = 'meadow';
const MAX_TASKS = 400;
const MAX_TURNS = 60;
const WEAK_CATEGORY: CategoryId = 'add.cross10';
/** Leczenie, gdy HP ≤ 40% maks. */
const HEAL_BELOW = 0.4;
/** Pełna pętla trwa ~0,1–0,3 s; zapas na obciążoną maszynę (inne testy równolegle). */
const SLOW = 60_000;

// ───────────── Wirtualne dziecko ─────────────

interface ChildProfile {
  p: number;
  pWeak: number;
  /** Szansa, że dziecko nie odpowie w limicie (tylko gdy rodzic włączył limit). */
  pTimeout?: number;
}

const CHILD: ChildProfile = { p: 0.8, pWeak: 0.45 };

/** Czas odpowiedzi: rozkład log-normalny wokół mediany (Box–Muller). */
function lognormal(rng: Rng, median: number, sigma: number): number {
  const u = Math.max(1e-12, rng.next());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  return Math.exp(Math.log(median) + sigma * z);
}

interface Stats {
  n: number;
  ok: number;
}

/** Przebieg jednej walki kartami (do raportu). */
interface BattleReport {
  enemyId: string;
  /** Tury brainrota (naciśnięcia „Koniec tury”). */
  turns: number;
  /** Zadania w tej walce (= zagrane karty). */
  tasks: number;
  rescues: number;
}

interface Sim {
  save: SaveV1;
  /** Losowania gry. */
  rng: Rng;
  /** Losowania dziecka (osobny strumień). */
  child: Rng;
  profile: ChildProfile;
  now: number;
  tasks: number;
  correct: number;
  byCategory: Map<CategoryId, Stats>;
  heroDowns: number;
  rescues: number;
  checkpoints: number;
  results: Map<QteResult, number>;
  battles: BattleReport[];
  /** Zagrane karty wg id. */
  plays: Map<string, number>;
  /** Nowe walki rozpoczęte z HP przeniesionym z poprzedniego pokoju (nie pełnym). */
  hpCarried: number;
}

function newSim(seed: number, profile: ChildProfile): Sim {
  return {
    save: createNewSave(T0, seed),
    rng: createRng(seed),
    child: createRng((seed ^ 0x5bd1e995) >>> 0),
    profile,
    now: T0,
    tasks: 0,
    correct: 0,
    byCategory: new Map(),
    heroDowns: 0,
    rescues: 0,
    checkpoints: 0,
    results: new Map(),
    battles: [],
    plays: new Map(),
    hpCarried: 0,
  };
}

/** Dziecko wybiera odpowiedź: poprawną z prawdopodobieństwem p, inaczej losowy dystraktor. */
function childAnswer(sim: Sim, task: Task, limitMs: number | null): { given: number | null; ms: number; timedOut: boolean } {
  if (limitMs !== null && sim.child.chance(sim.profile.pTimeout ?? 0)) return { given: null, ms: limitMs, timedOut: true };
  const weak = task.categoryId === WEAK_CATEGORY || task.categories.includes(WEAK_CATEGORY);
  const ok = sim.child.chance(weak ? sim.profile.pWeak : sim.profile.p);
  const wrong = task.options.filter((o) => o !== task.answer);
  const given = ok || wrong.length === 0 ? task.answer : sim.child.pick(wrong);
  const ms = Math.round(lognormal(sim.child, ok ? 3000 : 5000, 0.35));
  return { given, ms, timedOut: false };
}

// ───────────── Niezmienniki ─────────────

function checkInventory(save: SaveV1): void {
  const d = save.inventory.digits;
  expect(d).toHaveLength(10);
  for (const n of d) {
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  }
}

/** Kolekcja kart: całkowite ≥ 0, tylko znane karty, talia w limitach (GDD 7.5). */
function checkCards(save: SaveV1): void {
  for (const [id, n] of Object.entries(save.cards.owned)) {
    expect(Object.hasOwn(CARDS, id)).toBe(true);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  }
  // Handlarz bierze tylko zapas: karty startowe nigdy poniżej 3 kopii.
  for (const id of Object.keys(CARD_GRANTS.starter)) expect(save.cards.owned[id] ?? 0).toBeGreaterThanOrEqual(MAX_COPIES);
  const deck = deckOf(save, DEFS);
  expect(deck.length).toBeGreaterThan(0);
  expect(deck.length).toBeLessThanOrEqual(DECK_MAX);
  for (const n of Object.values(countCards(deck))) expect(n).toBeLessThanOrEqual(MAX_COPIES);
}

/** „Zamknięcie i ponowne uruchomienie”: zapis → JSON → zapis; gra toczy się dalej na kopii. */
function checkpoint(sim: Sim): void {
  const json = serializeSave(sim.save);
  const loaded = deserializeSave(json);
  expect(loaded).toEqual(sim.save);
  expect(validateSave(JSON.parse(json))).toEqual([]);
  // Po wczytaniu gra woła backfillCards (zapisy sprzed kart); poprawny zapis niczego nie dostaje.
  expect(backfillCards(loaded, DEFS)).toEqual([]);
  checkInventory(loaded);
  checkCards(loaded);
  sim.save = loaded;
  sim.checkpoints += 1;
}

// ───────────── Zadania ─────────────

function answer(sim: Sim, task: Task, mode: AttemptMode): AnswerOutcome {
  const limitMs = timeLimitMs(sim.save.model, task, sim.save.settings);
  const { given, ms, timedOut } = childAnswer(sim, task, limitMs);
  // Wynik liczony PRZED zapisem próby (mediana sprzed odpowiedzi) — answerTask musi dać to samo.
  const expected = classifyResult(sim.save.model, task, {
    correct: !timedOut && given === task.answer,
    timedOut,
    ms,
    helped: false,
    limitMs,
  });
  const out = answerTask(sim.save, task, { given, ms, timedOut, helped: false, mode, limitMs }, sim.now);
  expect(out.result).toBe(expected);
  if (timedOut) expect(out.result).toBe('timeout');
  sim.results.set(out.result, (sim.results.get(out.result) ?? 0) + 1);
  sim.now += ms + 4000;
  sim.tasks += 1;
  if (out.correct) sim.correct += 1;
  else expect(out.hint).not.toBeNull();
  const st = sim.byCategory.get(task.categoryId) ?? { n: 0, ok: 0 };
  st.n += 1;
  if (out.correct) st.ok += 1;
  sim.byCategory.set(task.categoryId, st);
  checkInventory(sim.save);
  if (sim.tasks >= MAX_TASKS) throw new Error(`pętla gry przekroczyła ${MAX_TASKS} zadań`);
  return out;
}

function stage(sim: Sim): number {
  return sim.save.progress.lands[LAND].stage;
}

function categoriesFor(sim: Sim, action: PoolAction, extra: { bossPhase?: number; creature?: string } = {}): CategoryId[] {
  const creature = extra.creature !== undefined ? CREATURES[extra.creature] : undefined;
  return actionCategories({
    land: LAND,
    stage: stage(sim),
    action,
    settings: sim.save.settings,
    ...(creature !== undefined ? { creature } : {}),
    ...(extra.bossPhase !== undefined ? { bossPhase: extra.bossPhase } : {}),
  });
}

function ask(sim: Sim, categories: CategoryId[], mode: AttemptMode, format: TaskFormat = 'choice'): AnswerOutcome {
  const task = pickTask(sim.save.model, { categories, settings: sim.save.settings, mode, format }, sim.rng, sim.now);
  expect(categories).toContain(task.categoryId);
  return answer(sim, task, mode);
}

// ───────────── Etapy pętli ─────────────

function calibrate(sim: Sim): number {
  beginPlaySession(sim.save, sim.now);
  const { tasks } = createCalibration(sim.save.settings, sim.rng);
  expect(tasks).toHaveLength(20);
  const attempts: Attempt[] = tasks.map((t) => answer(sim, t, 'calibration').attempt);
  const st = finishCalibration(sim.save, attempts);
  expect(sim.save.progress.calibrated).toBe(true);
  return st;
}

/**
 * Łapanie wg catchRule stworka; nieudana próba → stworek chowa się na minutę (GDD 8).
 * Nowy stworek daje karty (GDD 13.5: CARD_GRANTS.creatures[id].onCatch kopii jego karty).
 */
function catchByRules(sim: Sim, id: string): number {
  const def = CREATURES[id];
  const grant = CARD_GRANTS.creatures[id];
  if (def === undefined || grant === undefined) throw new Error(`brak stworka ${id}`);
  for (let tries = 1; tries <= 10; tries++) {
    const extra = helps(sim.save, 'catch', DEFS).extraCatchTries;
    const cats = categoriesFor(sim, 'catch', { creature: id });
    const results: boolean[] = [];
    let status = trialStatus(def.catchRule, results, extra);
    while (status === 'continue') {
      results.push(ask(sim, cats, 'catch', def.catchFormat).correct);
      status = trialStatus(def.catchRule, results, extra);
    }
    if (status === 'success') {
      const before = sim.save.cards.owned[grant.cardId] ?? 0;
      const r = catchCreature(sim.save, id, sim.now, sim.rng, DEFS);
      expect(r.isNew).toBe(true);
      expect(r.cardsGained).toEqual([{ cardId: grant.cardId, count: grant.onCatch }]);
      expect(sim.save.cards.owned[grant.cardId]).toBe(before + grant.onCatch);
      return tries;
    }
    sim.now += 60_000;
  }
  throw new Error(`nie udało się złapać ${id}`);
}

function feedAll(sim: Sim): number {
  let fed = 0;
  for (const c of [...sim.save.creatures]) {
    if (!feedCreature(sim.save, c.id)) continue;
    const cats = categoriesFor(sim, 'feed', { creature: c.id });
    let ok = 0;
    for (let i = 0; i < FEED_RULE.of; i++) if (ask(sim, cats, 'feed').correct) ok += 1;
    if (ok >= FEED_RULE.need) {
      expect(completeFeeding(sim.save, c.id, sim.rng, DEFS)).toHaveLength(1);
      expect(feedCreature(sim.save, c.id)).toBe(false);
      fed += 1;
    }
  }
  return fed;
}

function backToBase(sim: Sim): void {
  const mode = sim.save.settings.timeLimit.mode;
  const cycle = sim.save.progress.cycle;
  const before = countDigits(sim.save.inventory.digits);
  const r = returnToBase(sim.save, sim.rng, sim.now, DEFS);
  expect(r.newCycle).toBe(true);
  expect(sim.save.progress.cycle).toBe(cycle + 1);
  expect(r.produced.map((p) => p.creatureId)).toEqual(sim.save.creatures.map((c) => c.id));
  const made = r.produced.reduce((n, p) => n + p.digits.length, 0);
  expect(made).toBeGreaterThan(0);
  expect(countDigits(sim.save.inventory.digits)).toBe(before + made);
  expect(sim.save.progress.firstExpeditionDone).toBe(true);
  // GDD 7.4 (v0.3): limit czasu włącza tylko rodzic — powrót go nie zmienia.
  expect(sim.save.settings.timeLimit.mode).toBe(mode);
  checkInventory(sim.save);
}

function gate(sim: Sim): void {
  const ops = unlockedOperatorsOf(sim.save, DEFS);
  expect(ops).toEqual(['+', '×']);
  const spec = makeGate({ rng: sim.rng, land: LAND, range: sim.save.settings.range, inventory: sim.save.inventory.digits, ops });
  applyGateGift(sim.save, spec);
  const gifted = spec.gift.some((n) => n > 0);
  const solved = solveGate(spec.target, sim.save.inventory.digits, spec.ops);
  expect(solved.solvable).toBe(true);
  const opened = sim.save.progress.lands[LAND].gatesOpened;

  // Najpierw pomyłka: nic nie znika.
  const before = [...sim.save.inventory.digits];
  const wrong = openGate(sim.save, gateTokensOf(spec.target, '+', 1), spec);
  expect(wrong.valid).toBe(false);
  expect(sim.save.inventory.digits).toEqual(before);

  const sol = sim.child.pick(solved.solutions);
  const score = openGate(sim.save, gateTokensOf(sol.a, sol.op, sol.b), spec);
  expect(score.valid).toBe(true);
  expect(score.value).toBe(spec.target);
  expect(countDigits(sim.save.inventory.digits)).toBe(countDigits(before) - sol.digitCount);
  expect(sim.save.progress.lands[LAND].gatesOpened).toBe(opened + 1);
  // GDD 10.2/10.4: sprytne rozwiązanie → bonusowa skrzynka, ale nie przy darze bramy.
  expect(sim.save.progress.pendingBonusChest).toBe(score.smart && !gifted);
  checkInventory(sim.save);
}

// ───────────── Walka kartami ─────────────

function cardOf(state: CardBattleState, uid: string): CardDef {
  const inst = state.hand.find((c) => c.uid === uid);
  const def = inst !== undefined ? CARDS[inst.cardId] : undefined;
  if (def === undefined) throw new Error(`brak karty ${uid} na ręce`);
  return def;
}

/** Łączny Czar zdejmowany kartą przy poprawnej odpowiedzi (do wyboru najsilniejszego ataku). */
function attackPower(def: CardDef, hero: HeroStats): number {
  const p = previewCard(def, hero);
  return p.damage * p.hits;
}

/** Ochrona przed mocnym ciosem: osłabienie, potem największa tarcza. */
function defensePower(def: CardDef, hero: HeroStats): number {
  if (def.kind === 'weaken') return 1000;
  return previewCard(def, hero).shield;
}

/**
 * Strategia wirtualnego dziecka (prosta, deterministyczna; remis → pierwsza karta na ręce):
 * mało HP → leczenie; zapowiedź „mocny cios” i tarcza jeszcze go nie pokrywa → osłabienie/tarcza;
 * inaczej najsilniejszy atak; gdy żadnego ataku — cokolwiek (gra, dopóki ma energię). null = „Koniec tury”.
 */
function chooseCard(state: CardBattleState, enemy: EnemyDef, hero: HeroStats): string | null {
  const playable = playableUids(state, CARDS).map((uid) => ({ uid, def: cardOf(state, uid) }));
  if (playable.length === 0) return null;
  const best = (list: typeof playable, score: (d: CardDef) => number): string | null => {
    let out: { uid: string; s: number } | null = null;
    for (const p of list) {
      const s = score(p.def);
      if (out === null || s > out.s) out = { uid: p.uid, s };
    }
    return out?.uid ?? null;
  };
  const c = state.combat;
  if (c.heroHp <= c.heroMaxHp * HEAL_BELOW) {
    const heal = best(
      playable.filter((p) => p.def.kind === 'heal'),
      (d) => d.power,
    );
    if (heal !== null) return heal;
  }
  const intent = intentView(state, enemy);
  if (intent.kind === 'strong' && state.shield < intent.total) {
    const guard = best(
      // Drugie osłabienie w tej samej turze nic nie daje (liczy się najsilniejsze).
      playable.filter((p) => (p.def.kind === 'weaken' ? state.weaken === 0 : defensePower(p.def, hero) > 0)),
      (d) => defensePower(d, hero),
    );
    if (guard !== null) return guard;
  }
  const attack = best(
    playable.filter((p) => isAttackCard(p.def.kind)),
    (d) => attackPower(d, hero),
  );
  if (attack !== null) return attack;
  return playable[0]?.uid ?? null;
}

/** Pula działań dla zagranej karty: pula karty (GDD 7.2); u bossa — pula fazy (GDD 13.3). */
function cardCategories(sim: Sim, def: CardDef, enemy: EnemyDef, phase: number): CategoryId[] {
  return enemy.isBoss ? categoriesFor(sim, 'boss', { bossPhase: phase }) : categoriesFor(sim, def.pool);
}

const INTENT_TEXT = /^(?:Cios \d+|Mocny cios \d+|\d+ × (?:cios|mocny cios) \d+)$/;

interface FightOptions {
  /** Klucz walki w zapisie dungeonu (np. 'nest:trzmielini'). */
  roomKey: string;
  /** Zamknięcie i wznowienie aplikacji po tej turze brainrota (wznowienie z zapisu). */
  restartAfterTurn?: number;
  /** Boss: zamknięcie i wznowienie zaraz po pojawieniu się pnączy (faza 2). */
  restartOnVines?: boolean;
  /** Oczekiwana pierwsza przemiana gatunku (prezent powitalny). */
  firstTime?: boolean;
}

interface FightResult {
  state: CardBattleState;
  restarted: boolean;
  phases: number[];
}

/**
 * Walka kartami do przemiany (GDD 7): tura dziecka (karty, działanie po zagraniu), „Koniec tury”,
 * ruch brainrota, ratunek. Po każdym ruchu recordBattleProgress (Czar, faza, pnącza, HP bohatera);
 * wejście do walki (także po ratunku i wczytaniu) — startCardBattle z zapisu.
 */
function fight(sim: Sim, enemyId: string, opts: FightOptions): FightResult {
  const base = ENEMIES[enemyId];
  if (base === undefined) throw new Error(`brak wroga ${enemyId}`);
  const enemy: EnemyDef = scaledEnemy(base, stage(sim));
  const hero = heroStats(sim.save, DEFS);
  const key = opts.roomKey;
  const dungeon = (): SaveV1['progress']['dungeon'] => sim.save.progress.dungeon;
  const report: BattleReport = { enemyId, turns: 0, tasks: 0, rescues: 0 };

  /** Wejście do walki: nowa albo wznowiona z zapisu (Czar, faza, pnącza, HP). */
  const enter = (): CardBattleState => {
    const d = dungeon();
    const saved = Object.hasOwn(d.enemyCzar, key) ? d.enemyCzar[key] : undefined;
    expect(saved).not.toBe(0); // odczarowanego brainrota się nie wznawia
    const deck = deckOf(sim.save, DEFS);
    if (saved === undefined && d.heroHp !== null) sim.hpCarried += 1;
    const st = startCardBattle({
      enemy,
      hero,
      deck,
      rng: sim.rng,
      cards: CARDS,
      resume: {
        heroHp: d.heroHp,
        ...(saved !== undefined ? { czar: saved, phase: d.bossPhase, vines: d.vines } : {}),
      },
    });
    expect(st.hand).toHaveLength(Math.min(HAND_SIZE, deck.length));
    expect(st.energy).toBe(MAX_ENERGY);
    expect(st.drawPile.length + st.hand.length + st.discard.length).toBe(deck.length);
    expect(st.combat.heroHp).toBe(d.heroHp ?? st.combat.heroMaxHp);
    if (saved !== undefined) {
      expect(st.combat.czar).toBe(saved);
      if (enemy.isBoss) {
        expect(st.combat.phase).toBe(d.bossPhase);
        expect(st.combat.vines).toBe(d.vines);
      }
    } else {
      expect(st.combat.czar).toBe(enemy.czar);
    }
    expect(intentView(st, enemy).text).toMatch(INTENT_TEXT);
    return st;
  };

  let state = enter();
  const deckSize = state.drawPile.length + state.hand.length + state.discard.length;
  const persist = (): void => {
    const c = state.combat;
    recordBattleProgress(sim.save, key, { czar: c.czar, phase: c.phase, vines: c.vines, heroHp: c.heroHp, heroMaxHp: c.heroMaxHp });
    expect(dungeon().enemyCzar[key]).toBe(c.czar);
  };
  /** Zamknięcie aplikacji w trakcie walki i wznowienie z zapisu: Czar, faza, pnącza i HP zostają. */
  const restart = (): void => {
    const { czar, phase, vines, heroHp } = state.combat;
    checkpoint(sim);
    state = enter();
    expect(state.combat.czar).toBe(czar);
    expect(state.combat.phase).toBe(phase);
    expect(state.combat.vines).toBe(vines);
    expect(state.combat.heroHp).toBe(heroHp);
  };

  let restarted = false;
  const phases = new Set<number>([state.combat.phase]);
  let lastCzar = state.combat.czar;
  let lastPhase = state.combat.phase;
  while (!state.combat.won) {
    if (report.turns >= MAX_TURNS) throw new Error(`walka z ${enemyId} się nie kończy`);

    // ── Tura dziecka: karty, dopóki jest energia (albo dziecko kończy turę).
    for (let uid = chooseCard(state, enemy, hero); uid !== null; uid = chooseCard(state, enemy, hero)) {
      const def = cardOf(state, uid);
      const energy = state.energy;
      const out = ask(sim, cardCategories(sim, def, enemy, state.combat.phase), 'combat');
      report.tasks += 1;
      sim.plays.set(def.id, (sim.plays.get(def.id) ?? 0) + 1);
      const events = playCard({
        state,
        uid,
        result: out.result,
        enemy,
        hero,
        cards: CARDS,
        boost: levelBoostFor(def, sim.save.creatures),
      });
      expect(events.length).toBeGreaterThan(0);
      expect(state.energy).toBe(energy - def.cost);
      expect(state.energy).toBeGreaterThanOrEqual(0);
      expect(state.hand.length).toBeLessThanOrEqual(HAND_SIZE);
      expect(state.drawPile.length + state.hand.length + state.discard.length).toBe(deckSize);
      // Postęp nigdy się nie cofa (GDD 7.5).
      expect(state.combat.czar).toBeLessThanOrEqual(lastCzar);
      expect(state.combat.phase).toBeGreaterThanOrEqual(lastPhase);
      lastCzar = state.combat.czar;
      lastPhase = state.combat.phase;
      phases.add(state.combat.phase);
      persist();
      if (state.combat.won) break;
      if (opts.restartOnVines === true && !restarted && state.combat.vines > 0) {
        restarted = true;
        restart();
      }
    }
    if (state.combat.won) break;

    // ── „Koniec tury”: zapowiedziany ruch brainrota; tarcza pochłania, potem znika.
    const view = intentView(state, enemy);
    expect(view.text).toMatch(INTENT_TEXT);
    const hpBefore = state.combat.heroHp;
    const events: CombatEvent[] = endPlayerTurn({ state, enemy, hero, rng: sim.rng });
    report.turns += 1;
    let taken = 0;
    let dealt = 0;
    for (const e of events) {
      if (e.t === 'enemyHit') {
        taken += e.taken;
        dealt += e.taken;
      }
      if (e.t === 'shieldAbsorb') dealt += e.absorbed;
    }
    expect(state.combat.heroHp).toBe(Math.max(0, hpBefore - taken));
    expect(dealt).toBeLessThanOrEqual(view.total);
    if (!isCardHeroDown(state)) expect(dealt).toBe(view.total);
    expect(state.shield).toBe(0);
    expect(state.weaken).toBe(0);
    expect(state.energy).toBe(MAX_ENERGY);
    expect(state.hand).toHaveLength(Math.min(HAND_SIZE, deckSize));
    persist();

    if (isCardHeroDown(state)) {
      // „Stworki cię ratują” (GDD 7.5): pełne HP, Czar/faza/pnącza zostają, powrót na początek pokoju.
      expect(events.some((e) => e.t === 'heroDown')).toBe(true);
      sim.heroDowns += 1;
      const { czar, phase, vines } = state.combat;
      expect(rescueHero(state)).toEqual([{ t: 'rescued' }]);
      sim.rescues += 1;
      report.rescues += 1;
      expect(state.combat.heroHp).toBe(state.combat.heroMaxHp);
      persist();
      expect(dungeon().heroHp).toBeNull();
      state = enter();
      expect(state.combat.czar).toBe(czar);
      expect(state.combat.phase).toBe(phase);
      expect(state.combat.vines).toBe(vines);
      expect(state.combat.heroHp).toBe(state.combat.heroMaxHp);
    } else if (opts.restartAfterTurn !== undefined && !restarted && report.turns >= opts.restartAfterTurn) {
      restarted = true;
      restart();
    }
  }

  // ── Przemiana w brainglama (GDD 7.6) i jego karta (GDD 13.5).
  expect(state.combat.won).toBe(true);
  expect(state.combat.czar).toBe(0);
  expect(state.intents).toEqual([]);
  expect(intentView(state, enemy).text).toBe('');
  expect(dungeon().enemyCzar[key]).toBe(0);
  if (opts.restartOnVines === true) expect(restarted).toBe(true);
  if (opts.restartAfterTurn !== undefined && report.turns > opts.restartAfterTurn) expect(restarted).toBe(true);

  const cardId = CARD_GRANTS.glams[enemyId];
  const before = cardId !== undefined ? (sim.save.cards.owned[cardId] ?? 0) : 0;
  const t = transformEnemy(sim.save, enemyId, sim.now, sim.rng, DEFS);
  expect(t.cardGained).toBe(cardId);
  if (cardId !== undefined) expect(sim.save.cards.owned[cardId]).toBe(before + 1);
  if (opts.firstTime !== undefined) {
    expect(t.firstTime).toBe(opts.firstTime);
    expect(t.gift).toHaveLength(opts.firstTime ? 3 : 0);
  }
  checkInventory(sim.save);
  sim.battles.push(report);
  return { state, restarted, phases: [...phases].sort() };
}

function chestRoom(sim: Sim): void {
  // Skrzynia zamknięta zadaniem „brakująca liczba”; pomyłka = podpowiedź i kolejna próba.
  const cats = categoriesFor(sim, 'chest');
  let opened = false;
  for (let i = 0; i < 10 && !opened; i++) opened = ask(sim, cats, 'chest', 'missing').correct;
  expect(opened).toBe(true);
  lootChest(sim.save, 'dungeon', sim.rng, CHEST_ITEM_POOL_MEADOW, DEFS);
  if (sim.save.progress.pendingBonusChest) {
    lootChest(sim.save, 'bonus', sim.rng, CHEST_ITEM_POOL_MEADOW, DEFS);
    expect(sim.save.progress.pendingBonusChest).toBe(false);
  }
  checkInventory(sim.save);
}

/**
 * Wyprawa do dungeonu (GDD 11): startDungeonRun → pokoje po kolei (currentRoomId/clearRoom),
 * HP przechodzi między pokojami, ognisko leczy, boss z wznowieniem przy pnączach → finishDungeon.
 */
function dungeonRun(sim: Sim, firstTime = true): string[] {
  const runs = sim.save.progress.lands[LAND].dungeonRuns;
  const previous = [...sim.save.progress.dungeon.roomOrder];
  const order = startDungeonRun(sim.save, sim.rng);
  expect(order).toHaveLength(5);
  expect(order.slice(3)).toEqual(['campfire', 'boss']);
  if (runs === 0) expect(order).toEqual(MEADOW_ROOM_ORDER);
  else expect(order.slice(0, 3)).not.toEqual(previous.slice(0, 3));
  expect(sim.save.progress.dungeon.heroHp).toBeNull();
  checkpoint(sim);

  let fights = 0;
  for (let room = currentRoomId(sim.save); room !== null; room = currentRoomId(sim.save)) {
    const def = findRoom(room);
    if (def === undefined) throw new Error(`nieznany pokój ${room}`);
    switch (def.kind) {
      case 'fight':
        for (const id of def.enemies) {
          // HP przechodzi z poprzedniej walki (null = pełne).
          fight(sim, id, { roomKey: `${room}:${id}`, firstTime, ...(fights === 0 ? { restartAfterTurn: 1 } : {}) });
          fights += 1;
        }
        break;
      case 'chest':
        chestRoom(sim);
        break;
      case 'rest': {
        // Ognisko: pełne HP i „lekcja stworka” dla najsłabszego punktu.
        restAtCampfire(sim.save);
        expect(sim.save.progress.dungeon.heroHp).toBeNull();
        expect(weakest(sim.save.model, sim.save.settings, 1).length).toBeLessThanOrEqual(1);
        break;
      }
      case 'boss': {
        const id = def.enemies[0] as string;
        expect(id).toBe(MEADOW_BOSS);
        expect(sim.save.progress.dungeon.heroHp).toBeNull(); // po ognisku
        const stageBefore = stage(sim);
        const r = fight(sim, id, { roomKey: `${room}:${id}`, restartOnVines: true, firstTime });
        expect(r.phases).toEqual([1, 2, 3]);
        const loot = defeatBoss(sim.save, LAND, BOSS_ITEMS_MEADOW, sim.rng, DEFS);
        if (firstTime) expect(loot.items).toEqual(BOSS_ITEMS_MEADOW);
        expect(loot.digits).toHaveLength(5);
        expect(loot.digits.filter((x) => x === 0)).toHaveLength(1);
        expect(loot.stage).toBe(Math.min(4, stageBefore + 1));
        for (const it of BOSS_ITEMS_MEADOW) expect(sim.save.equipment.owned.some((o) => o.id === it)).toBe(true);
        expect(sim.save.equipment.equipped.amulet).toBe('amulet-drugiej-szansy');
        expect(helps(sim.save, 'attack', DEFS).retryUses).toBe(1);
        break;
      }
    }
    const next = clearRoom(sim.save);
    expect(next).toBe(currentRoomId(sim.save));
    expect(sim.save.progress.dungeon.bossPhase).toBe(1);
    expect(sim.save.progress.dungeon.vines).toBe(0);
    checkpoint(sim);
  }
  expect(fights).toBe(3);
  expect(finishDungeon(sim.save)).toBe(true);
  expect(finishDungeon(sim.save)).toBe(false); // licznik nie rośnie dwa razy
  const d = sim.save.progress.dungeon;
  expect(d.active).toBe(false);
  expect(d.enemyCzar).toEqual({});
  expect(d.heroHp).toBeNull();
  expect(d.roomOrder).toEqual(order); // „poprzednia” kolejność na następną wizytę
  expect(sim.save.progress.lands[LAND].dungeonRuns).toBe(runs + 1);
  return order;
}

/**
 * Handlarz Kartonini (GDD 9.5a): sprzedaż zapasowej karty i oferta dnia z zapłatą ze Skarbca.
 * Handlarz nigdy nie rusza talii (bierze tylko zapas ponad 3 kopie).
 */
function merchant(sim: Sim): { sold: string; bought: string } {
  const cycle = sim.save.progress.cycle;
  const offers = offersFor(sim.save, DEFS);
  expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);

  // Sprzedaż zapasowej kopii → cyfry; talia bez zmian.
  const sell = offers.find((o) => o.kind === 'sell');
  if (sell === undefined || sell.kind !== 'sell') throw new Error('brak oferty sprzedaży');
  const deckBefore = deckOf(sim.save, DEFS);
  const ownedBefore = sim.save.cards.owned[sell.cardId] ?? 0;
  expect(ownedBefore).toBeGreaterThan(MAX_COPIES);
  const digitsBefore = countDigits(sim.save.inventory.digits);
  const sold = acceptMerchant(sim.save, sell.id, undefined, sim.rng, DEFS);
  expect(sold.ok).toBe(true);
  expect(sold.cardGained).toBeNull();
  expect(sold.digitsGained).toHaveLength(sell.digits);
  expect(sim.save.cards.owned[sell.cardId]).toBe(ownedBefore - 1);
  expect(countDigits(sim.save.inventory.digits)).toBe(digitsBefore + sell.digits);
  expect(deckOf(sim.save, DEFS)).toEqual(deckBefore);

  // Oferta dnia: „złóż sumę S z N cyfr” — zapłata złożona ze Skarbca.
  const daily = offersFor(sim.save, DEFS).find((o) => o.kind === 'daily');
  if (daily === undefined || daily.kind !== 'daily') throw new Error('brak oferty dnia');
  expect(daily.id).toBe(`daily:${cycle}`);
  expect(CARDS[daily.cardId]?.rarity).not.toBe('legendary');
  const payment = findForgePayment(daily.price, sim.save.inventory.digits);
  if (payment === null) throw new Error(`nie da się złożyć ${daily.price.sum} z ${daily.price.count} cyfr`);
  expect(payment).toHaveLength(daily.price.count);
  expect(payment.reduce((a, b) => a + b, 0)).toBe(daily.price.sum);

  // Najpierw zła zapłata: nic nie znika.
  const snapshot = { digits: [...sim.save.inventory.digits], owned: { ...sim.save.cards.owned } };
  const bad = acceptMerchant(sim.save, daily.id, payment.slice(1), sim.rng, DEFS);
  expect(bad.ok).toBe(false);
  expect(bad.message.length).toBeGreaterThan(0);
  expect(sim.save.inventory.digits).toEqual(snapshot.digits);
  expect(sim.save.cards.owned).toEqual(snapshot.owned);

  const ownedDaily = sim.save.cards.owned[daily.cardId] ?? 0;
  const paidBefore = countDigits(sim.save.inventory.digits);
  const bought = acceptMerchant(sim.save, daily.id, payment, sim.rng, DEFS);
  expect(bought.ok).toBe(true);
  expect(bought.cardGained).toBe(daily.cardId);
  expect(sim.save.cards.owned[daily.cardId]).toBe(ownedDaily + 1);
  expect(countDigits(sim.save.inventory.digits)).toBe(paidBefore - daily.price.count);
  expect(sim.save.progress.merchantDailyCycle).toBe(cycle);
  // Jedna oferta dnia na cykl.
  expect(offersFor(sim.save, DEFS).some((o) => o.kind === 'daily')).toBe(false);
  expect(acceptMerchant(sim.save, daily.id, payment, sim.rng, DEFS).ok).toBe(false);
  checkInventory(sim.save);
  checkCards(sim.save);
  return { sold: sell.cardId, bought: daily.cardId };
}

// ───────────── Scenariusz ─────────────

interface RunReport {
  tasks: number;
  accuracy: number;
  weakAccuracy: number | null;
  startStage: number;
  finalStage: number;
  catchTries: { dopelniak: number; blizniak: number };
  rescues: number;
  checkpoints: number;
  results: Partial<Record<QteResult, number>>;
  battles: BattleReport[];
  plays: Record<string, number>;
  hpCarried: number;
  deck: string[];
  owned: Record<string, number>;
  merchant: { sold: string; bought: string };
}

type SettingsPatch = Partial<Omit<ParentSettings, 'timeLimit'>> & { timeLimit?: ParentSettings['timeLimit']['mode'] };

function setup(seed: number, patch: SettingsPatch, profile: ChildProfile): Sim {
  const sim = newSim(seed, profile);
  // Rodzic ustawia opcje przed pierwszą grą (panel rodzica, GDD 18.3).
  const { timeLimit, ...rest } = patch;
  Object.assign(sim.save.settings, rest);
  if (timeLimit !== undefined) sim.save.settings.timeLimit.mode = timeLimit;
  return sim;
}

function fullLoop(seed: number, patch: SettingsPatch = {}, profile: ChildProfile = CHILD): { report: RunReport; sim: Sim } {
  const sim = setup(seed, patch, profile);
  const limitMode = sim.save.settings.timeLimit.mode;
  // Nowy zapis: talia startowa (GDD 13.5).
  expect(sim.save.cards.owned).toEqual(CARD_GRANTS.starter);

  const startStage = calibrate(sim);
  checkpoint(sim);

  // Wyprawa na Łąkę: Dopełniak (2 z 3, „brakująca liczba”) i Bliźniak (3 z 4) — z kartami.
  const dopelniak = catchByRules(sim, 'dopelniak');
  const blizniak = catchByRules(sim, 'blizniak');
  expect(sim.save.creatures.map((c) => c.id)).toEqual(['plusik', 'dopelniak', 'blizniak']);
  expect(unlockedActionsOf(sim.save, DEFS)).toEqual(['attack', 'strongAttack']);
  // Talia: maks. 3 kopie karty, rzadsze pierwsze (5 Ciosów Plusika → 3 w talii, 2 w zapasie).
  expect(countCards(deckOf(sim.save, DEFS))).toEqual({
    'podwojny-dziob': 2,
    'cios-plusika': 3,
    'tarcza-dopelniaka': 2,
    'tarcza-z-lisci': 3,
  });
  checkpoint(sim);

  // Baza: cykl produkcji, karmienie, sprawdzenie etapu.
  backToBase(sim);
  feedAll(sim);
  stageCheck(sim.save, LAND);
  checkpoint(sim);

  // Brama i dungeon.
  gate(sim);
  checkpoint(sim);
  dungeonRun(sim);

  // Powrót z łupem i handlarz.
  backToBase(sim);
  checkpoint(sim);
  const trade = merchant(sim);
  checkpoint(sim);

  const glams = sim.save.progress.glams;
  expect(Object.keys(glams).sort()).toEqual([...MEADOW_ENEMIES, MEADOW_BOSS].sort());
  for (const g of Object.values(glams)) expect(g.count).toBe(1);
  // Każdy brainglam dał swoją kartę; w talii jest po jednej.
  const deck = deckOf(sim.save, DEFS);
  for (const id of Object.values(CARD_GRANTS.glams)) {
    expect(sim.save.cards.owned[id]).toBeGreaterThanOrEqual(1);
    expect(deck).toContain(id);
  }
  expect(sim.save.progress.lands[LAND].bossDefeated).toBe(true);
  expect(sim.heroDowns).toBe(sim.rescues);
  expect(sim.battles).toHaveLength(4);
  expect(sim.save.history).toHaveLength(sim.tasks);
  expect(sim.save.sessions.at(-1)?.tasks).toBe(sim.tasks);
  expect(sim.save.sessions.at(-1)?.correct).toBe(sim.correct);
  expect(sim.save.settings.timeLimit.mode).toBe(limitMode);
  checkCards(sim.save);

  const weak = sim.byCategory.get(WEAK_CATEGORY);
  const report: RunReport = {
    tasks: sim.tasks,
    accuracy: sim.correct / sim.tasks,
    weakAccuracy: weak !== undefined && weak.n > 0 ? weak.ok / weak.n : null,
    startStage,
    finalStage: stage(sim),
    catchTries: { dopelniak, blizniak },
    rescues: sim.rescues,
    checkpoints: sim.checkpoints,
    results: Object.fromEntries(sim.results),
    battles: sim.battles,
    plays: Object.fromEntries(sim.plays),
    hpCarried: sim.hpCarried,
    deck,
    owned: { ...sim.save.cards.owned },
    merchant: trade,
  };
  return { report, sim };
}

describe('core e2e: pełna pętla MVP z walką kartami, bez grafiki', () => {
  const SEEDS = [1, 2, 3, 20260924];
  const reports = new Map<number, RunReport>();

  it.each(SEEDS)(
    'ziarno %i: nowy zapis → kalibracja → łapanie → baza → brama → dungeon (karty) → boss → baza → handlarz',
    (seed) => {
      const { report: r } = fullLoop(seed);
      reports.set(seed, r);
      expect(r.tasks).toBeLessThan(MAX_TASKS);
      expect(r.tasks).toBeGreaterThan(40);
      expect(r.accuracy).toBeGreaterThan(0.6);
      expect(r.accuracy).toBeLessThan(0.95);
      expect(r.finalStage).toBeGreaterThanOrEqual(r.startStage);
      expect(r.checkpoints).toBeGreaterThanOrEqual(14);
      expect(r.deck.length).toBeLessThanOrEqual(DECK_MAX);
      // Zwykłe brainroty: krótkie walki (GDD 7.5: 3–5 tur, średnio); boss dłużej, ale zawsze do końca.
      const regular = r.battles.filter((b) => b.enemyId !== MEADOW_BOSS);
      expect(regular).toHaveLength(3);
      for (const b of r.battles) {
        expect(b.turns).toBeLessThan(MAX_TURNS);
        expect(b.tasks).toBeGreaterThan(0);
      }
      for (const b of regular) expect(b.turns).toBeLessThanOrEqual(12);
      expect(regular.reduce((n, b) => n + b.turns, 0) / regular.length).toBeLessThanOrEqual(6);
      // Dziecko gra kartami stworków (atak mocny, tarcza Dopełniaka) i kartami startowymi.
      expect(r.plays['cios-plusika'] ?? 0).toBeGreaterThan(0);
      expect(r.plays['podwojny-dziob'] ?? 0).toBeGreaterThan(0);
      // HP przechodzi między pokojami (GDD 7.5, 11): po wejściu walka w gnieździe startuje z niepełnym HP.
      expect(r.hpCarried).toBeGreaterThan(0);
    },
    SLOW,
  );

  const VARIANTS: [string, SettingsPatch, ChildProfile][] = [
    ['wszystkie działania w walce', { combatOps: 'all' }, CHILD],
    ['łagodny limit czasu + brak odpowiedzi', { timeLimit: 'gentle' }, { ...CHILD, pTimeout: 0.05 }],
    ['stały limit czasu', { timeLimit: 'fixed' }, { ...CHILD, pTimeout: 0.05 }],
    ['zakres do 100', { range: 100 }, CHILD],
    ['zakres do 10, bez przekraczania 10', { range: 10, crossTenOnMeadow: false }, CHILD],
  ];

  it.each(VARIANTS)(
    'ustawienia rodzica: %s',
    (_name, patch, profile) => {
      for (const seed of [5, 6]) {
        const { report: r, sim } = fullLoop(seed, patch, profile);
        reports.set(1000 + seed, r);
        expect(r.tasks).toBeLessThan(MAX_TASKS);
        expect(r.accuracy).toBeGreaterThan(0.5);
        if (profile.pTimeout !== undefined) expect(r.results.timeout ?? 0).toBeGreaterThan(0);
        // Zadania w walce tylko z kategorii dopuszczonych ustawieniami rodzica.
        for (const c of sim.byCategory.keys()) {
          if (patch.range === 10) expect(c.includes('2d')).toBe(false);
          if (patch.crossTenOnMeadow === false) expect(c).not.toBe('add.cross10');
        }
        if (patch.combatOps === 'all') {
          const ops = new Set([...sim.byCategory.keys()].map((c) => c.split('.')[0]));
          expect(ops.has('sub') || ops.has('mul') || ops.has('div')).toBe(true);
        }
      }
    },
    SLOW,
  );

  it(
    'pętla jest deterministyczna dla ziarna',
    () => {
      expect(fullLoop(1).report).toEqual(reports.get(1) ?? fullLoop(1).report);
    },
    SLOW,
  );

  it(
    'druga wyprawa: inna kolejność pokoi 1–3, kolejne kopie kart brainglamów, nowa oferta dnia',
    () => {
      const { sim } = fullLoop(2);
      const firstOrder = [...sim.save.progress.dungeon.roomOrder];
      const glamCards = Object.values(CARD_GRANTS.glams);
      const before = Object.fromEntries(glamCards.map((id) => [id, sim.save.cards.owned[id] ?? 0]));
      sim.battles = [];
      gate(sim);
      const order = dungeonRun(sim, false);
      expect(order.slice(0, 3)).not.toEqual(firstOrder.slice(0, 3));
      for (const id of glamCards) expect(sim.save.cards.owned[id]).toBe((before[id] ?? 0) + 1);
      for (const g of Object.values(sim.save.progress.glams)) expect(g.count).toBe(2);
      expect(sim.save.progress.lands[LAND].dungeonRuns).toBe(2);
      backToBase(sim);
      checkpoint(sim);
      merchant(sim);
      checkpoint(sim);
      expect(sim.tasks).toBeLessThan(MAX_TASKS);
      expect(sim.battles).toHaveLength(4);
    },
    SLOW,
  );

  it(
    'zapis sprzed kart (v0.2): wczytanie → talia startowa, backfillCards z kart stworków i brainglamów → walka kartami',
    () => {
      const { sim } = fullLoop(3);
      const old = JSON.parse(serializeSave(sim.save)) as Record<string, unknown> & {
        progress: Record<string, unknown> & { dungeon: Record<string, unknown> };
      };
      delete old.cards;
      delete old.progress.merchantDailyCycle;
      delete old.progress.dungeon.vines;
      delete old.progress.dungeon.heroHp;
      const loaded = deserializeSave(JSON.stringify(old));
      expect(validateSave(loaded)).toEqual([]);
      expect(loaded.cards.owned).toEqual(CARD_GRANTS.starter);
      expect(loaded.progress.merchantDailyCycle).toBe(-1);
      // Karty za posiadane stworki (Plusik ma już Cios z talii startowej) i za każdą przemianę.
      const gains = backfillCards(loaded, DEFS);
      const expected = [
        ...['dopelniak', 'blizniak'].map((id) => {
          const g = CARD_GRANTS.creatures[id];
          return { cardId: g?.cardId ?? '', count: g?.onCatch ?? 0 };
        }),
        ...Object.values(CARD_GRANTS.glams).map((cardId) => ({ cardId, count: 1 })),
      ];
      const byId = (a: { cardId: string }, b: { cardId: string }): number => (a.cardId < b.cardId ? -1 : 1);
      expect([...gains].sort(byId)).toEqual(expected.sort(byId));
      expect(backfillCards(loaded, DEFS)).toEqual([]); // idempotentne
      sim.save = loaded;
      checkpoint(sim);
      expect(deckOf(sim.save, DEFS)).toHaveLength(14);
      // Walka talią z uzupełnionymi kartami (kolejna przemiana: +1 kopia karty brainglama).
      sim.save.progress.dungeon = { ...defaultDungeon(), active: true, roomOrder: ['entry'] };
      fight(sim, 'slimakorro', { roomKey: 'entry:slimakorro', firstTime: false });
      expect(sim.save.cards.owned['lepka-kokarda']).toBe(2);
      checkpoint(sim);
    },
    SLOW,
  );

  it('słabsza kategoria (add.cross10) wypada gorzej niż średnia', () => {
    let n = 0;
    let ok = 0;
    let all = 0;
    let allOk = 0;
    for (const seed of SEEDS) {
      const sim = newSim(seed, { p: 0.8, pWeak: 0.45 });
      calibrate(sim);
      for (const [c, st] of sim.byCategory) {
        all += st.n;
        allOk += st.ok;
        if (c === WEAK_CATEGORY) {
          n += st.n;
          ok += st.ok;
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(4);
    expect(ok / n).toBeLessThan(allOk / all);
  });

  it(
    'bardzo słabe dziecko (p = 0,25): bohater pada, stworki ratują, boss i tak zostaje odczarowany',
    () => {
      const sim = newSim(77, { p: 0.25, pWeak: 0.2 });
      beginPlaySession(sim.save, sim.now);
      catchCreature(sim.save, 'blizniak', sim.now, sim.rng, DEFS);
      sim.save.progress.dungeon = { ...defaultDungeon(), active: true, roomOrder: ['boss'] };
      const r = fight(sim, MEADOW_BOSS, { roomKey: 'boss:kosiarrini', restartOnVines: true, firstTime: true });
      expect(r.phases).toEqual([1, 2, 3]);
      expect(sim.rescues).toBeGreaterThan(0);
      expect(sim.heroDowns).toBe(sim.rescues);
      expect(sim.tasks).toBeLessThan(MAX_TASKS);
      expect(sim.save.progress.glams[MEADOW_BOSS]?.count).toBe(1);
      expect(sim.save.cards.owned['krolewski-bukiet']).toBe(1);
      checkpoint(sim);
    },
    SLOW,
  );

  it('createSkillModel() i emptySkillModel() dają ten sam pusty model', () => {
    expect(createSkillModel()).toEqual(emptySkillModel());
  });
});
