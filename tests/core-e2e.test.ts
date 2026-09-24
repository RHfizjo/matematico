/**
 * Symulacja end-to-end bez grafiki (GDD 3, 22 „Definicja ukończenia MVP” pkt 1 i 7):
 * wirtualne dziecko (skuteczność 0,8, słabsze w add.cross10) przechodzi pełną pętlę
 * nowy zapis → Próba Plusika → łapanie → baza → brama → dungeon z bossem → baza,
 * wyłącznie przez publiczne API core/ (fasada) i dane z content/.
 */
import { describe, expect, it } from 'vitest';
import type {
  ActionKind,
  AnswerOutcome,
  Attempt,
  AttemptMode,
  CategoryId,
  CombatState,
  EnemyDef,
  GameDefs,
  ParentSettings,
  PoolAction,
  QteResult,
  Rng,
  SaveV1,
  Task,
  TaskFormat,
} from '../src/core';
import {
  FEED_RULE,
  actionCategories,
  answerTask,
  applyEnemyHit,
  applyGateGift,
  applyPlayerAttack,
  availableActions,
  beginPlaySession,
  catchCreature,
  completeFeeding,
  countDigits,
  createCalibration,
  createNewSave,
  createRng,
  createSkillModel,
  defeatBoss,
  deserializeSave,
  emptySkillModel,
  endEnemyTurn,
  enemyIntents,
  feedCreature,
  findRoom,
  finishCalibration,
  gateTokensOf,
  heroStats,
  helps,
  isHeroDown,
  lootChest,
  makeGate,
  makeRoomOrder,
  openGate,
  pickTask,
  rescue,
  returnToBase,
  scaledEnemy,
  serializeSave,
  solveGate,
  stageCheck,
  startCombat,
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
  CHEST_ITEM_POOL_MEADOW,
  CREATURES,
  ENEMIES,
  ITEMS,
  MEADOW_BOSS,
  MEADOW_ENEMIES,
} from '../src/content';

const DEFS: GameDefs = { creatures: CREATURES, items: ITEMS };
const T0 = 1_750_000_000_000;
const LAND = 'meadow';
const MAX_TASKS = 400;
const WEAK_CATEGORY: CategoryId = 'add.cross10';

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

/** „Zamknięcie i ponowne uruchomienie”: zapis → JSON → zapis; gra toczy się dalej na kopii. */
function checkpoint(sim: Sim): void {
  const json = serializeSave(sim.save);
  const loaded = deserializeSave(json);
  expect(loaded).toEqual(sim.save);
  expect(validateSave(JSON.parse(json))).toEqual([]);
  checkInventory(loaded);
  sim.save = loaded;
  sim.checkpoints += 1;
}

// ───────────── Zadania ─────────────

function answer(sim: Sim, task: Task, mode: AttemptMode): AnswerOutcome {
  const limitMs = timeLimitMs(sim.save.model, task, sim.save.settings);
  const { given, ms, timedOut } = childAnswer(sim, task, limitMs);
  const out = answerTask(sim.save, task, { given, ms, timedOut, helped: false, mode, limitMs }, sim.now);
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

/** Łapanie wg catchRule stworka; nieudana próba → stworek chowa się na minutę (GDD 8). */
function catchByRules(sim: Sim, id: string): number {
  const def = CREATURES[id];
  if (def === undefined) throw new Error(`brak stworka ${id}`);
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
      const r = catchCreature(sim.save, id, sim.now, sim.rng, DEFS);
      expect(r.isNew).toBe(true);
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
  const solved = solveGate(spec.target, sim.save.inventory.digits, spec.ops);
  expect(solved.solvable).toBe(true);

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
  expect(sim.save.progress.lands[LAND].gatesOpened).toBe(1);
  expect(sim.save.progress.pendingBonusChest).toBe(score.smart);
  checkInventory(sim.save);
}

interface FightOptions {
  /** Symulacja restartu aplikacji po wejściu bossa w tę fazę (wznowienie z zapisu). */
  restartAtPhase?: number;
}

/** Walka do przemiany; zamiary wroga, obrona, ratunek (GDD 7). Czar i faza zapisywane po każdym ruchu. */
function fight(sim: Sim, enemyId: string, opts: FightOptions = {}): CombatState {
  const base = ENEMIES[enemyId];
  if (base === undefined) throw new Error(`brak wroga ${enemyId}`);
  const enemy: EnemyDef = scaledEnemy(base, stage(sim));
  const boss = enemy.isBoss;
  const hero = heroStats(sim.save, DEFS);
  const dungeon = (): SaveV1['progress']['dungeon'] => sim.save.progress.dungeon;
  const saved = dungeon().enemyCzar[enemyId];
  let state = startCombat(enemy, hero, saved !== undefined ? { czar: saved, phase: dungeon().bossPhase } : undefined);
  let restarted = false;
  const persist = (): void => {
    dungeon().enemyCzar[enemyId] = state.czar;
    if (boss) dungeon().bossPhase = state.phase;
  };
  const cats = (action: ActionKind): CategoryId[] =>
    boss ? categoriesFor(sim, 'boss', { bossPhase: state.phase }) : categoriesFor(sim, action);

  let lastCzar = state.czar;
  const seenPhases = new Set<number>([state.phase]);
  for (let turn = 0; !state.won; turn++) {
    if (turn > 80) throw new Error(`walka z ${enemyId} się nie kończy`);
    // Tura dziecka: atak mocny, gdy dostępny.
    const actions = availableActions(state, unlockedActionsOf(sim.save, DEFS));
    const action: ActionKind = actions.includes('strongAttack') ? 'strongAttack' : 'attack';
    const out = ask(sim, cats(action), 'combat');
    applyPlayerAttack(state, enemy, action, out.result, hero);
    expect(state.czar).toBeLessThanOrEqual(lastCzar);
    lastCzar = state.czar;
    persist();
    seenPhases.add(state.phase);
    if (state.won) break;

    if (boss && opts.restartAtPhase !== undefined && !restarted && state.phase >= opts.restartAtPhase) {
      restarted = true;
      const { czar, phase } = state;
      checkpoint(sim);
      state = startCombat(enemy, heroStats(sim.save, DEFS), { czar: dungeon().enemyCzar[enemyId], phase: dungeon().bossPhase });
      expect(state.czar).toBe(czar);
      expect(state.phase).toBe(phase);
      state.turn = 'enemy';
    }

    // Tura brainrota: każdy cios = jedno zadanie obrony.
    for (const intent of enemyIntents(state, enemy)) {
      const defAction: ActionKind = intent.kind === 'strong' ? 'strongDefend' : 'defend';
      const res = ask(sim, cats(defAction), 'combat');
      applyEnemyHit(state, enemy, intent, res.result, hero);
      expect(state.czar).toBeLessThanOrEqual(lastCzar);
      lastCzar = state.czar;
      persist();
      if (state.won) break;
      if (isHeroDown(state)) {
        // „Stworki cię ratują”: pełne HP, Czar i faza zostają.
        sim.heroDowns += 1;
        const { czar, phase } = state;
        rescue(state);
        sim.rescues += 1;
        expect(state.heroHp).toBe(state.heroMaxHp);
        expect(state.czar).toBe(czar);
        expect(state.phase).toBe(phase);
        break;
      }
    }
    if (state.won) break;
    endEnemyTurn(state);
  }
  expect(state.won).toBe(true);
  expect(state.czar).toBe(0);
  if (boss) {
    expect([...seenPhases].sort()).toEqual([1, 2, 3]);
    if (opts.restartAtPhase !== undefined) expect(restarted).toBe(true);
  }
  delete dungeon().enemyCzar[enemyId];
  if (boss) dungeon().bossPhase = 1;

  const t = transformEnemy(sim.save, enemyId, sim.now, sim.rng);
  expect(t.firstTime).toBe(true);
  expect(t.gift).toHaveLength(3);
  checkInventory(sim.save);
  return state;
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

function dungeonRun(sim: Sim): void {
  const order = makeRoomOrder(sim.rng);
  expect(order).toHaveLength(5);
  expect(order.slice(3)).toEqual(['campfire', 'boss']);
  sim.save.progress.dungeon = { active: true, roomOrder: order, roomIndex: 0, enemyCzar: {}, bossPhase: 1 };
  checkpoint(sim);

  while (sim.save.progress.dungeon.roomIndex < sim.save.progress.dungeon.roomOrder.length) {
    const d = sim.save.progress.dungeon;
    const room = findRoom(d.roomOrder[d.roomIndex] as string);
    if (room === undefined) throw new Error('nieznany pokój');
    switch (room.kind) {
      case 'fight':
        for (const id of room.enemies) fight(sim, id);
        break;
      case 'chest':
        chestRoom(sim);
        break;
      case 'rest': {
        // Ognisko: „lekcja stworka” dla najsłabszego punktu.
        const weak = weakest(sim.save.model, sim.save.settings, 1);
        expect(weak.length).toBeLessThanOrEqual(1);
        break;
      }
      case 'boss': {
        const id = room.enemies[0] as string;
        expect(id).toBe(MEADOW_BOSS);
        const stageBefore = stage(sim);
        fight(sim, id, { restartAtPhase: 3 });
        const loot = defeatBoss(sim.save, LAND, BOSS_ITEMS_MEADOW, sim.rng, DEFS);
        expect(loot.items).toEqual(BOSS_ITEMS_MEADOW);
        expect(loot.digits).toHaveLength(5);
        expect(loot.digits.filter((x) => x === 0)).toHaveLength(1);
        expect(loot.stage).toBe(Math.min(4, stageBefore + 1));
        for (const it of BOSS_ITEMS_MEADOW) expect(sim.save.equipment.owned.some((o) => o.id === it)).toBe(true);
        expect(sim.save.equipment.equipped.amulet).toBe('amulet-drugiej-szansy');
        expect(helps(sim.save, 'attack', DEFS).retryUses).toBe(1);
        break;
      }
    }
    sim.save.progress.dungeon.roomIndex += 1;
    checkpoint(sim);
  }
  sim.save.progress.dungeon.active = false;
  sim.save.progress.lands[LAND].dungeonRuns += 1;
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
}

type SettingsPatch = Partial<Omit<ParentSettings, 'timeLimit'>> & { timeLimit?: ParentSettings['timeLimit']['mode'] };

function fullLoop(seed: number, patch: SettingsPatch = {}, profile: ChildProfile = CHILD): RunReport {
  const sim = newSim(seed, profile);
  // Rodzic ustawia opcje przed pierwszą grą (panel rodzica, GDD 18.3).
  const { timeLimit, ...rest } = patch;
  Object.assign(sim.save.settings, rest);
  if (timeLimit !== undefined) sim.save.settings.timeLimit.mode = timeLimit;
  const limitMode = sim.save.settings.timeLimit.mode;

  const startStage = calibrate(sim);
  checkpoint(sim);

  // Wyprawa na Łąkę: Dopełniak (2 z 3, „brakująca liczba”) i Bliźniak (3 z 4).
  const dopelniak = catchByRules(sim, 'dopelniak');
  const blizniak = catchByRules(sim, 'blizniak');
  expect(sim.save.creatures.map((c) => c.id)).toEqual(['plusik', 'dopelniak', 'blizniak']);
  expect(unlockedActionsOf(sim.save, DEFS)).toEqual(['attack', 'strongAttack']);
  expect(heroStats(sim.save, DEFS).defenseBoost.defend).toBeGreaterThan(0);
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

  // Powrót z łupem.
  backToBase(sim);
  checkpoint(sim);

  const glams = sim.save.progress.glams;
  expect(Object.keys(glams).sort()).toEqual([...MEADOW_ENEMIES, MEADOW_BOSS].sort());
  for (const g of Object.values(glams)) expect(g.count).toBe(1);
  expect(sim.save.progress.lands[LAND].bossDefeated).toBe(true);
  expect(sim.save.progress.dungeon.enemyCzar).toEqual({});
  expect(sim.heroDowns).toBe(sim.rescues);
  expect(sim.save.history).toHaveLength(sim.tasks);
  expect(sim.save.sessions.at(-1)?.tasks).toBe(sim.tasks);
  expect(sim.save.sessions.at(-1)?.correct).toBe(sim.correct);
  expect(sim.save.settings.timeLimit.mode).toBe(limitMode);

  const weak = sim.byCategory.get(WEAK_CATEGORY);
  return {
    tasks: sim.tasks,
    accuracy: sim.correct / sim.tasks,
    weakAccuracy: weak !== undefined && weak.n > 0 ? weak.ok / weak.n : null,
    startStage,
    finalStage: stage(sim),
    catchTries: { dopelniak, blizniak },
    rescues: sim.rescues,
    checkpoints: sim.checkpoints,
    results: Object.fromEntries(sim.results),
  };
}

describe('core e2e: pełna pętla MVP bez grafiki', () => {
  const SEEDS = [1, 2, 3, 20260924];
  const reports = new Map<number, RunReport>();

  it.each(SEEDS)('ziarno %i: nowy zapis → kalibracja → łapanie → baza → brama → dungeon → boss → baza', (seed) => {
    const r = fullLoop(seed);
    reports.set(seed, r);
    expect(r.tasks).toBeLessThan(MAX_TASKS);
    expect(r.tasks).toBeGreaterThan(40);
    expect(r.accuracy).toBeGreaterThan(0.6);
    expect(r.accuracy).toBeLessThan(0.95);
    expect(r.finalStage).toBeGreaterThanOrEqual(r.startStage);
    expect(r.checkpoints).toBeGreaterThanOrEqual(10);
  });

  const VARIANTS: [string, SettingsPatch, ChildProfile][] = [
    ['wszystkie działania w walce', { combatOps: 'all' }, CHILD],
    ['łagodny limit czasu + brak odpowiedzi', { timeLimit: 'gentle' }, { ...CHILD, pTimeout: 0.05 }],
    ['stały limit czasu', { timeLimit: 'fixed' }, { ...CHILD, pTimeout: 0.05 }],
    ['zakres do 100', { range: 100 }, CHILD],
    ['zakres do 10, bez przekraczania 10', { range: 10, crossTenOnMeadow: false }, CHILD],
  ];

  it.each(VARIANTS)('ustawienia rodzica: %s', (_name, patch, profile) => {
    for (const seed of [5, 6]) {
      const r = fullLoop(seed, patch, profile);
      reports.set(1000 + seed, r);
      expect(r.tasks).toBeLessThan(MAX_TASKS);
      expect(r.accuracy).toBeGreaterThan(0.5);
      if (profile.pTimeout !== undefined) expect(r.results.timeout ?? 0).toBeGreaterThan(0);
    }
  });

  it('pętla jest deterministyczna dla ziarna', () => {
    expect(fullLoop(1)).toEqual(reports.get(1) ?? fullLoop(1));
  });

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

  it('bardzo słabe dziecko (p = 0,25): bohater pada, stworki ratują, boss i tak zostaje odczarowany', () => {
    const sim = newSim(77, { p: 0.25, pWeak: 0.2 });
    beginPlaySession(sim.save, sim.now);
    catchCreature(sim.save, 'blizniak', sim.now, sim.rng, DEFS);
    sim.save.progress.dungeon = { active: true, roomOrder: ['boss'], roomIndex: 0, enemyCzar: {}, bossPhase: 1 };
    fight(sim, MEADOW_BOSS);
    expect(sim.rescues).toBeGreaterThan(0);
    expect(sim.heroDowns).toBe(sim.rescues);
    expect(sim.tasks).toBeLessThan(MAX_TASKS);
    expect(sim.save.progress.glams[MEADOW_BOSS]?.count).toBe(1);
    checkpoint(sim);
  });

  it('createSkillModel() i emptySkillModel() dają ten sam pusty model', () => {
    expect(createSkillModel()).toEqual(emptySkillModel());
  });
});
