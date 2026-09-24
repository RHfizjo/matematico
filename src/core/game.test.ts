import { describe, expect, it } from 'vitest';
import type { CreatureDef, GateSpec, ItemDef, SaveV1, Task } from './types';
import { createRng } from './rng';
import { generateTask } from './math';
import { createCalibration } from './adaptive';
import { countDigits, digitsFromList, emptyDigits, gateTokensFromText, gateTokensOf, startingDigits } from './economy';
import { createNewSave, deserializeSave, isCardId, migrateSave, serializeSave, validateSave } from './save';
import { findForgePayment } from './economy';
import {
  FEED_RULE,
  acceptMerchant,
  answerTask,
  applyGateGift,
  backfillCards,
  beginPlaySession,
  buildAttempt,
  catchCreature,
  clearRoom,
  collectionOf,
  completeFeeding,
  currentRoomId,
  deckOf,
  defeatBoss,
  feedCreature,
  finishCalibration,
  finishDungeon,
  grantItem,
  helps,
  heroStats,
  lootChest,
  offersFor,
  openGate,
  recordBattleProgress,
  restAtCampfire,
  returnToBase,
  stageCheck,
  startDungeonRun,
  transformEnemy,
  trialStatus,
  unlockedActionsOf,
  unlockedOperatorsOf,
  type AnswerInput,
  type GameDefs,
} from './game';
import { TEST_CARDS, TEST_CARD_GRANTS, TEST_CARD_IDS } from './merchant/testkit';
import * as core from './index';

// Kopie danych z content/ (core nie importuje content/).
const creature = (c: Partial<CreatureDef> & Pick<CreatureDef, 'id' | 'production'>): CreatureDef => ({
  name: c.id,
  land: 'meadow',
  rarity: 'common',
  categories: ['add.within10'],
  catchFormat: 'choice',
  catchRule: { need: 2, of: 3 },
  description: '',
  ...c,
});
const item = (i: Partial<ItemDef> & Pick<ItemDef, 'id' | 'slot'>): ItemDef => ({
  name: i.id,
  land: 'meadow',
  rarity: 'common',
  attackBonus: 0,
  hpBonus: 0,
  description: '',
  ...i,
});
const DEFS: GameDefs = {
  creatures: {
    plusik: creature({ id: 'plusik', production: 'small', unlocksAction: 'attack', unlocksOperator: '+' }),
    dopelniak: creature({ id: 'dopelniak', production: 'pairs10', categories: ['add.complement10'], boostsDefense: 'defend' }),
    blizniak: creature({
      id: 'blizniak',
      production: 'twins',
      rarity: 'uncommon',
      categories: ['add.doubles'],
      catchRule: { need: 3, of: 4 },
      unlocksAction: 'strongAttack',
      unlocksOperator: '×',
    }),
    koniczynek: creature({ id: 'koniczynek', production: 'rare', rarity: 'rare', boostsDefense: 'strongDefend', shield: true }),
  },
  items: {
    'drewniany-miecz': item({ id: 'drewniany-miecz', slot: 'weapon' }),
    'kamizelka-z-lisci': item({ id: 'kamizelka-z-lisci', slot: 'armor' }),
    'siatka-z-trawy': item({ id: 'siatka-z-trawy', slot: 'net' }),
    'pancerz-liczydlo': item({
      id: 'pancerz-liczydlo',
      slot: 'armor',
      hpBonus: 20,
      help: { kind: 'numberLine', amount: 1, appliesTo: 'defense' },
    }),
    'zlota-siec': item({ id: 'zlota-siec', slot: 'net', help: { kind: 'extraCatchTry', amount: 1, appliesTo: 'catch' } }),
    'amulet-drugiej-szansy': item({ id: 'amulet-drugiej-szansy', slot: 'amulet', help: { kind: 'retry', amount: 1, appliesTo: 'all' } }),
  },
  cards: TEST_CARDS,
  grants: TEST_CARD_GRANTS,
};

const T0 = 1_700_000_000_000;
const newSave = (seed = 7): SaveV1 => createNewSave(T0, seed);

function task(factId = 'add:8+7', categoryId: Task['categoryId'] = 'add.cross10', seed = 1): Task {
  const s = newSave();
  return generateTask({ categoryId, factId, rng: createRng(seed), settings: s.settings, format: 'choice', id: 'x1' });
}

const input = (over: Partial<AnswerInput> = {}): AnswerInput => ({
  given: null,
  ms: 3000,
  timedOut: false,
  helped: false,
  mode: 'combat',
  limitMs: null,
  ...over,
});

const wrongOption = (t: Task): number => t.options.find((o) => o !== t.answer) as number;
const roundTrip = (s: SaveV1): SaveV1 => deserializeSave(serializeSave(s));

describe('buildAttempt', () => {
  it('poprawna odpowiedź', () => {
    const t = task();
    const a = buildAttempt(t, input({ given: t.answer }), T0);
    expect(a).toMatchObject({ taskId: 'x1', factId: 'add:8+7', categoryId: 'add.cross10', correct: true, given: 15, errorKind: null, at: T0 });
    expect(a.categories).toEqual(t.categories);
    expect(a.categories).not.toBe(t.categories);
  });

  it('dystraktor → rodzaj błędu z distractorKinds', () => {
    const t = task();
    const w = wrongOption(t);
    const a = buildAttempt(t, input({ given: w }), T0);
    expect(a.correct).toBe(false);
    expect(a.errorKind).toBe(t.distractorKinds[String(w)]);
    expect(a.errorKind).not.toBeNull();
  });

  it('brak odpowiedzi w limicie → given null, niepoprawna', () => {
    const t = task();
    const a = buildAttempt(t, input({ given: t.answer, timedOut: true }), T0);
    expect(a).toMatchObject({ correct: false, timedOut: true, given: null, errorKind: null });
  });

  it('liczba spoza opcji (wpisywanie) → errorKind null', () => {
    const t = task();
    expect(buildAttempt(t, input({ given: 999 }), T0).errorKind).toBeNull();
  });
});

describe('answerTask', () => {
  it('poprawnie: model, historia, sesja, znacznik zadania; bez podpowiedzi', () => {
    const s = newSave();
    beginPlaySession(s, T0);
    const t = task();
    const out = answerTask(s, t, input({ given: t.answer }), T0 + 1000);
    expect(out.correct).toBe(true);
    expect(out.result).toBe('correct');
    expect(out.hint).toBeNull();
    expect(s.model.facts['add:8+7']?.n).toBe(1);
    expect(s.model.window).toEqual([true]);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ f: 'add:8+7', ok: true, md: 'combat', t: T0 + 1000 });
    expect(s.sessions.at(-1)).toMatchObject({ tasks: 1, correct: 1, end: T0 + 1000 });
    expect(s.progress.taskSinceReturn).toBe(true);
  });

  it('błąd → wynik "wrong", podpowiedź, rodzaj błędu w historii', () => {
    const s = newSave();
    const t = task();
    const w = wrongOption(t);
    const out = answerTask(s, t, input({ given: w }), T0);
    expect(out.result).toBe('wrong');
    expect(out.hint).not.toBeNull();
    expect(out.hint?.strategy).toBe('make10');
    expect(s.history[0]?.ek).toBe(t.distractorKinds[String(w)]);
    expect(s.model.errorStreak).toBe(1);
    expect(s.sessions.at(-1)).toMatchObject({ tasks: 1, correct: 0 });
  });

  it('brak odpowiedzi → "timeout" z podpowiedzią; pomoc → "retryCorrect"; po limicie → "late"', () => {
    const s = newSave();
    const t = task();
    expect(answerTask(s, t, input({ timedOut: true, limitMs: 8000, ms: 8000 }), T0).result).toBe('timeout');
    const t2 = task('add:6+7', 'add.cross10', 2);
    const helped = answerTask(s, t2, input({ given: t2.answer, helped: true }), T0);
    expect(helped).toMatchObject({ correct: true, result: 'retryCorrect', hint: null });
    const t3 = task('add:9+4', 'add.cross10', 3);
    expect(answerTask(s, t3, input({ given: t3.answer, ms: 9000, limitMs: 8000 }), T0).result).toBe('late');
  });

  it('zadania w bazie (karmienie, kuźnia) nie liczą się do cyklu', () => {
    const s = newSave();
    const t = task();
    answerTask(s, t, input({ given: t.answer, mode: 'feed' }), T0);
    answerTask(s, t, input({ given: t.answer, mode: 'forge' }), T0);
    expect(s.progress.taskSinceReturn).toBe(false);
    expect(s.model.facts['add:8+7']?.n).toBe(2);
    answerTask(s, t, input({ given: t.answer, mode: 'catch' }), T0);
    expect(s.progress.taskSinceReturn).toBe(true);
  });

  it('kalibracja: historia i sesja tak, model nie (robi to finishCalibration)', () => {
    const s = newSave();
    const t = task();
    const out = answerTask(s, t, input({ given: t.answer, mode: 'calibration' }), T0);
    expect(out.attempt.mode).toBe('calibration');
    expect(s.model.facts).toEqual({});
    expect(s.model.window).toEqual([]);
    expect(s.history).toHaveLength(1);
    expect(s.progress.taskSinceReturn).toBe(false);
  });
});

describe('trialStatus', () => {
  const rule = { need: 2, of: 3 };
  it('sukces od razu po need poprawnych, porażka gdy sukces niemożliwy', () => {
    expect(trialStatus(rule, [])).toBe('continue');
    expect(trialStatus(rule, [true, true])).toBe('success');
    expect(trialStatus(rule, [true, false])).toBe('continue');
    expect(trialStatus(rule, [false, false])).toBe('fail');
    expect(trialStatus(rule, [true, false, false])).toBe('fail');
    expect(trialStatus({ need: 3, of: 4 }, [true, false, true, true])).toBe('success');
    expect(trialStatus({ need: 3, of: 4 }, [false, false])).toBe('fail');
  });

  it('dodatkowe próby z sieci', () => {
    expect(trialStatus(rule, [false, false], 1)).toBe('continue');
    expect(trialStatus(rule, [false, false, true, true], 1)).toBe('success');
    expect(trialStatus(rule, [false, false, true, false], 1)).toBe('fail');
    expect(trialStatus(rule, [false, false], Number.NaN)).toBe('fail');
  });

  it('FEED_RULE = 2 z 3', () => {
    expect(FEED_RULE).toEqual({ need: 2, of: 3 });
  });
});

describe('returnToBase', () => {
  it('bez zadań od powrotu — brak nowego cyklu', () => {
    const s = newSave();
    const before = [...s.inventory.digits];
    expect(returnToBase(s, createRng(1), T0, DEFS)).toEqual({ newCycle: false, produced: [] });
    expect(s.progress.cycle).toBe(0);
    expect(s.progress.firstExpeditionDone).toBe(false);
    expect(s.inventory.digits).toEqual(before);
  });

  it('po zadaniu: cykl + 1, produkcja wszystkich stworków do skarbca, reset znacznika', () => {
    const s = newSave();
    catchCreature(s, 'dopelniak', T0, createRng(2), DEFS);
    catchCreature(s, 'blizniak', T0, createRng(3), DEFS);
    s.progress.taskSinceReturn = true;
    const before = countDigits(s.inventory.digits);
    const r = returnToBase(s, createRng(4), T0 + 5000, DEFS);
    expect(r.newCycle).toBe(true);
    expect(r.produced.map((p) => p.creatureId)).toEqual(['plusik', 'dopelniak', 'blizniak']);
    const [plus, dop, bli] = r.produced.map((p) => p.digits);
    expect(plus).toHaveLength(2);
    expect(plus?.every((d) => d >= 1 && d <= 5)).toBe(true);
    expect(dop).toHaveLength(2);
    expect((dop?.[0] ?? 0) + (dop?.[1] ?? 0)).toBe(10);
    expect(bli?.[0]).toBe(bli?.[1]);
    expect(countDigits(s.inventory.digits)).toBe(before + 6);
    expect(s.progress).toMatchObject({ cycle: 1, taskSinceReturn: false, firstExpeditionDone: true });
    expect(s.sessions.at(-1)?.end).toBe(T0 + 5000);
    // Drugi powrót bez zadań — nic.
    expect(returnToBase(s, createRng(5), T0, DEFS).newCycle).toBe(false);
  });

  it('limit czasu nie włącza się sam (GDD 7.4 v0.3)', () => {
    const s = newSave();
    s.progress.taskSinceReturn = true;
    returnToBase(s, createRng(1), T0, DEFS);
    expect(s.settings.timeLimit.mode).toBe('none');
  });

  it('stworek bez definicji jest pomijany; wynik deterministyczny', () => {
    const run = (): { r: ReturnType<typeof returnToBase>; s: SaveV1 } => {
      const s = newSave();
      s.creatures.push({ id: 'koniczynek', level: 3, fedCycle: -1, caughtAt: T0 });
      s.progress.taskSinceReturn = true;
      return { r: returnToBase(s, createRng(9), T0, { ...DEFS, creatures: { plusik: DEFS.creatures.plusik as CreatureDef } }), s };
    };
    const a = run();
    expect(a.r.produced.map((p) => p.creatureId)).toEqual(['plusik']);
    expect(run().r).toEqual(a.r);
  });
});

describe('karmienie', () => {
  it('raz na cykl na stworka; +1 cyfra z puli', () => {
    const s = newSave();
    expect(feedCreature(s, 'plusik')).toBe(true);
    const before = countDigits(s.inventory.digits);
    const got = completeFeeding(s, 'plusik', createRng(1), DEFS);
    expect(got).toHaveLength(1);
    expect(got[0]).toBeGreaterThanOrEqual(1);
    expect(got[0]).toBeLessThanOrEqual(5);
    expect(countDigits(s.inventory.digits)).toBe(before + 1);
    expect(s.creatures[0]?.fedCycle).toBe(0);
    expect(feedCreature(s, 'plusik')).toBe(false);
    expect(completeFeeding(s, 'plusik', createRng(1), DEFS)).toEqual([]);
    expect(countDigits(s.inventory.digits)).toBe(before + 1);
    s.progress.taskSinceReturn = true;
    returnToBase(s, createRng(2), T0, DEFS);
    expect(feedCreature(s, 'plusik')).toBe(true);
  });

  it('nieposiadany stworek — nie można karmić', () => {
    const s = newSave();
    expect(feedCreature(s, 'dopelniak')).toBe(false);
    expect(completeFeeding(s, 'dopelniak', createRng(1), DEFS)).toEqual([]);
  });
});

describe('catchCreature', () => {
  it('nowy stworek, potem awanse do poziomu 3; zawsze 1 cyfra z puli', () => {
    const s = newSave();
    const first = catchCreature(s, 'blizniak', T0 + 1, createRng(1), DEFS);
    expect(first).toMatchObject({ isNew: true, leveledUp: false, level: 1 });
    expect(first.digits).toHaveLength(1);
    expect(s.creatures.find((c) => c.id === 'blizniak')).toEqual({ id: 'blizniak', level: 1, fedCycle: -1, caughtAt: T0 + 1 });
    expect(catchCreature(s, 'blizniak', T0 + 2, createRng(2), DEFS)).toMatchObject({ isNew: false, leveledUp: true, level: 2 });
    expect(catchCreature(s, 'blizniak', T0 + 3, createRng(3), DEFS)).toMatchObject({ leveledUp: true, level: 3 });
    const max = catchCreature(s, 'blizniak', T0 + 4, createRng(4), DEFS);
    expect(max).toMatchObject({ isNew: false, leveledUp: false, level: 3 });
    expect(max.digits).toHaveLength(1);
    expect(s.creatures.filter((c) => c.id === 'blizniak')).toHaveLength(1);
    expect(countDigits(s.inventory.digits)).toBe(19 + 4);
  });

  it('nieznany stworek → wyjątek bez zmian', () => {
    const s = newSave();
    expect(() => catchCreature(s, 'smok', T0, createRng(1), DEFS)).toThrow(RangeError);
    expect(s.creatures).toHaveLength(1);
  });
});

describe('transformEnemy', () => {
  it('pierwsza przemiana: Galeria + prezent 3 cyfr (2 z 1..5, 1 z 6..9); kolejne: licznik', () => {
    const s = newSave();
    const r = transformEnemy(s, 'slimakorro', T0 + 7, createRng(1), DEFS);
    expect(r.firstTime).toBe(true);
    expect(r.gift).toHaveLength(3);
    expect(r.gift.filter((d) => d >= 6).length).toBe(1);
    expect(s.progress.glams.slimakorro).toEqual({ enemyId: 'slimakorro', count: 1, firstAt: T0 + 7 });
    expect(countDigits(s.inventory.digits)).toBe(22);
    expect(transformEnemy(s, 'slimakorro', T0 + 9, createRng(2), DEFS)).toEqual({ firstTime: false, gift: [], cardGained: 'lepka-kokarda' });
    expect(s.progress.glams.slimakorro).toEqual({ enemyId: 'slimakorro', count: 2, firstAt: T0 + 7 });
    expect(countDigits(s.inventory.digits)).toBe(22);
  });

  it('nieznany brainrot → wyjątek', () => {
    expect(() => transformEnemy(newSave(), 'godzilla', T0, createRng(1), DEFS)).toThrow(RangeError);
  });
});

describe('brama', () => {
  const gate54: GateSpec = { target: 54, gift: emptyDigits(), ops: ['+', '×'] };

  it('błędne wyrażenie niczego nie zużywa', () => {
    const s = newSave();
    const before = [...s.inventory.digits];
    const score = openGate(s, gateTokensFromText('6×8'), gate54);
    expect(score).toMatchObject({ valid: false, error: 'wrongValue', value: 48 });
    expect(score.message).toBe('Twoje działanie daje 48. Brakuje 6.');
    expect(openGate(s, gateTokensFromText('54'), gate54).error).toBe('noOp');
    expect(openGate(s, gateTokensFromText('6×9'), { ...gate54, ops: ['+'] }).error).toBe('opLocked');
    expect(s.inventory.digits).toEqual(before);
    expect(s.progress.lands.meadow.gatesOpened).toBe(0);
    expect(s.progress.pendingBonusChest).toBe(false);
  });

  it('sprytne 6 × 9: cyfry zużyte, licznik bram, bonusowa skrzynka', () => {
    const s = newSave();
    const score = openGate(s, gateTokensOf(6, '×', 9), gate54);
    expect(score).toMatchObject({ valid: true, smart: true, digitsUsed: [6, 9] });
    expect(s.inventory.digits[6]).toBe(1);
    expect(s.inventory.digits[9]).toBe(1);
    expect(countDigits(s.inventory.digits)).toBe(17);
    expect(s.progress.lands.meadow.gatesOpened).toBe(1);
    expect(s.progress.pendingBonusChest).toBe(true);
  });

  it('poprawne, ale nie sprytne 50 + 4: bez bonusowej skrzynki; inna kraina', () => {
    const s = newSave();
    const score = openGate(s, gateTokensFromText('50+4'), gate54, 'cave');
    expect(score).toMatchObject({ valid: true, smart: false });
    expect(s.inventory.digits[0]).toBe(0);
    expect(s.progress.lands.cave.gatesOpened).toBe(1);
    expect(s.progress.lands.meadow.gatesOpened).toBe(0);
    expect(s.progress.pendingBonusChest).toBe(false);
  });

  it('dar bramy trafia do skarbca i umożliwia rozwiązanie', () => {
    const s = newSave();
    s.inventory.digits = digitsFromList([1, 2]);
    const gate: GateSpec = { target: 54, gift: digitsFromList([6, 9]), ops: ['×'] };
    expect(openGate(s, gateTokensOf(6, '×', 9), gate).error).toBe('notEnoughDigits');
    expect(applyGateGift(s, gate)).toEqual([6, 9]);
    expect(openGate(s, gateTokensOf(6, '×', 9), gate).valid).toBe(true);
    expect(s.inventory.digits).toEqual(digitsFromList([1, 2]));
  });
});

describe('bohater', () => {
  it('statystyki i odblokowania z posiadanych stworków', () => {
    const s = newSave();
    expect(heroStats(s, DEFS)).toEqual({ maxHp: 100, attackBonus: 0, defenseBoost: { defend: 0, strongDefend: 0 }, shieldCharges: 0 });
    expect(unlockedActionsOf(s, DEFS)).toEqual(['attack']);
    expect(unlockedOperatorsOf(s, DEFS)).toEqual(['+']);
    catchCreature(s, 'dopelniak', T0, createRng(1), DEFS);
    catchCreature(s, 'blizniak', T0, createRng(1), DEFS);
    expect(heroStats(s, DEFS).defenseBoost).toEqual({ defend: 0.2, strongDefend: 0 });
    expect(unlockedActionsOf(s, DEFS)).toEqual(['attack', 'strongAttack']);
    expect(unlockedOperatorsOf(s, DEFS)).toEqual(['+', '×']);
  });

  it('sprzęt: HP i pomoce wg kontekstu', () => {
    const s = newSave();
    expect(grantItem(s, 'pancerz-liczydlo', DEFS)).toBe(true);
    // Slot pancerza zajęty — przedmiot tylko w posiadaniu.
    expect(s.equipment.equipped.armor).toBe('kamizelka-z-lisci');
    s.equipment.equipped.armor = 'pancerz-liczydlo';
    expect(heroStats(s, DEFS).maxHp).toBe(120);
    expect(helps(s, 'defense', DEFS)).toEqual({ timeBonusSec: 0, numberLineUses: 1, retryUses: 0, extraCatchTries: 0 });
    expect(helps(s, 'attack', DEFS).numberLineUses).toBe(0);
  });
});

describe('grantItem / defeatBoss', () => {
  it('grantItem: pusty slot → założony; duplikat → false; nieznany → wyjątek', () => {
    const s = newSave();
    expect(grantItem(s, 'amulet-drugiej-szansy', DEFS)).toBe(true);
    expect(s.equipment.equipped.amulet).toBe('amulet-drugiej-szansy');
    expect(grantItem(s, 'amulet-drugiej-szansy', DEFS)).toBe(false);
    expect(s.equipment.owned.filter((o) => o.id === 'amulet-drugiej-szansy')).toHaveLength(1);
    expect(() => grantItem(s, 'miecz-swietlny', DEFS)).toThrow(RangeError);
  });

  it('lootChest: cyfry do skarbca, gwarancja przedmiotu co 3. skrzynię, bez duplikatów', () => {
    const s = newSave();
    const rng = createRng(8);
    const pool = ['pancerz-liczydlo', 'nieznany-przedmiot'];
    const loots = [1, 2, 3].map(() => lootChest(s, 'dungeon', rng, pool, DEFS));
    expect(loots.map((l) => l.itemId)).toEqual([null, null, 'pancerz-liczydlo']);
    expect(s.progress.chestPity).toBe(0);
    expect(s.equipment.owned.some((o) => o.id === 'pancerz-liczydlo')).toBe(true);
    const got = loots.reduce((n, l) => n + l.digits.length, 0);
    expect(countDigits(s.inventory.digits)).toBe(19 + got);
    // Posiadany przedmiot nie wypada ponownie; pusta pula → licznik czeka na 3.
    for (let i = 0; i < 3; i++) expect(lootChest(s, 'world', rng, pool, DEFS).itemId).toBeNull();
    expect(s.progress.chestPity).toBe(3);
  });

  it('lootChest bonus: przedmiot z puli i skasowana bonusowa skrzynka', () => {
    const s = newSave();
    s.progress.pendingBonusChest = true;
    const loot = lootChest(s, 'bonus', createRng(2), ['pancerz-liczydlo'], DEFS);
    expect(loot.itemId).toBe('pancerz-liczydlo');
    expect(loot.digits).toHaveLength(4);
    expect(s.progress.pendingBonusChest).toBe(false);
    expect(s.progress.chestPity).toBe(0);
  });

  it('boss: zaliczony, etap + 1 (maks. 4), przedmioty raz, 5 cyfr z jednym 0', () => {
    const s = newSave();
    const items = ['zlota-siec', 'amulet-drugiej-szansy'];
    const loot = defeatBoss(s, 'meadow', items, createRng(3), DEFS);
    expect(loot.items).toEqual(items);
    expect(loot.digits).toHaveLength(5);
    expect(loot.digits.filter((d) => d === 0)).toHaveLength(1);
    expect(loot.stage).toBe(2);
    expect(s.progress.lands.meadow).toMatchObject({ bossDefeated: true, stage: 2 });
    expect(countDigits(s.inventory.digits)).toBe(24);
    expect(helps(s, 'attack', DEFS).retryUses).toBe(1);
    s.progress.lands.meadow.stage = 4;
    const again = defeatBoss(s, 'meadow', items, createRng(4), DEFS);
    expect(again.items).toEqual([]);
    expect(again.stage).toBe(4);
  });
});

describe('stageCheck', () => {
  it('awans przy średnim m puli etapu ≥ 0,7; jeden etap na wywołanie', () => {
    const s = newSave();
    expect(stageCheck(s, 'meadow')).toBe(false);
    expect(s.progress.lands.meadow.stage).toBe(1);
    s.model.categories['add.within10'] = { recentMs: [], n: 0, nOk: 0, m: 0.9, prior: 0.9 };
    s.model.categories['add.complement10'] = { recentMs: [], n: 0, nOk: 0, m: 0.2, prior: 0.2 };
    expect(stageCheck(s, 'meadow')).toBe(true);
    expect(s.progress.lands.meadow.stage).toBe(2);
    // Etap 2: słabe dopełnianie zaniża średnią puli.
    expect(stageCheck(s, 'meadow')).toBe(false);
    expect(s.progress.lands.meadow.stage).toBe(2);
    s.progress.lands.meadow.stage = 4;
    expect(stageCheck(s, 'meadow')).toBe(false);
  });
});

describe('finishCalibration', () => {
  function calibrate(s: SaveV1, correct: boolean): number {
    const { tasks } = createCalibration(s.settings, createRng(11));
    expect(tasks).toHaveLength(20);
    const attempts = tasks.map((t, i) => {
      const given = correct ? t.answer : wrongOption(t);
      return answerTask(s, t, input({ given, ms: 2000, mode: 'calibration' }), T0 + i * 5000).attempt;
    });
    expect(s.model.facts).toEqual({});
    return finishCalibration(s, attempts);
  }

  it('same poprawne → wyższy etap startowy; same błędy → etap 1', () => {
    const good = newSave();
    const stage = calibrate(good, true);
    expect(stage).toBeGreaterThanOrEqual(2);
    expect(good.progress.lands.meadow.stage).toBe(stage);
    expect(good.progress.calibrated).toBe(true);
    expect(Object.keys(good.model.facts).length).toBeGreaterThan(0);
    expect(good.model.retries).toEqual([]);
    expect(good.history).toHaveLength(20);

    const bad = newSave();
    expect(calibrate(bad, false)).toBe(1);
    expect(bad.progress.calibrated).toBe(true);
  });

  it('etap nigdy się nie cofa', () => {
    const s = newSave();
    s.progress.lands.meadow.stage = 3;
    expect(calibrate(s, false)).toBe(3);
  });
});

describe('sesja i zapis', () => {
  it('beginPlaySession: wpis sesji i numer sesji modelu', () => {
    const s = newSave();
    beginPlaySession(s, T0);
    beginPlaySession(s, T0 + 10);
    expect(s.sessions).toHaveLength(2);
    expect(s.model.session).toBe(2);
  });

  it('stan po regułach gry przechodzi serializację bez zmian', () => {
    const s = newSave(3);
    const rng = createRng(5);
    beginPlaySession(s, T0);
    for (let i = 0; i < 6; i++) {
      const t = task('add:8+7', 'add.cross10', i);
      answerTask(s, t, input({ given: i % 2 === 0 ? t.answer : wrongOption(t) }), T0 + i * 1000);
    }
    catchCreature(s, 'dopelniak', T0, rng, DEFS);
    completeFeeding(s, 'plusik', rng, DEFS);
    returnToBase(s, rng, T0 + 9000, DEFS);
    transformEnemy(s, 'trzmielini', T0, rng, DEFS);
    openGate(s, gateTokensOf(6, '×', 9), { target: 54, gift: emptyDigits(), ops: ['+', '×'] });
    defeatBoss(s, 'meadow', ['zlota-siec'], rng, DEFS);
    catchCreature(s, 'blizniak', T0, rng, DEFS);
    acceptMerchant(s, 'sell:cios-plusika', undefined, rng, DEFS);
    startDungeonRun(s, rng);
    recordBattleProgress(s, 'entry:slimakorro', { czar: 11, phase: 1, vines: 0, heroHp: 77, heroMaxHp: 100 });
    clearRoom(s);
    expect(validateSave(s)).toEqual([]);
    expect(roundTrip(s)).toEqual(s);
  });
});

describe('karty: łapanie i przemiana (GDD 8, 7.6, 13.5)', () => {
  const owned = (s: SaveV1, id: string): number => s.cards.owned[id] ?? 0;

  it('nowy stworek → onCatch kopii; awans na poz. 2 → onLevelUp; poz. 3 i dalej → bez kopii', () => {
    const s = newSave();
    expect(catchCreature(s, 'dopelniak', T0, createRng(1), DEFS).cardsGained).toEqual([{ cardId: 'tarcza-dopelniaka', count: 2 }]);
    expect(owned(s, 'tarcza-dopelniaka')).toBe(2);
    expect(catchCreature(s, 'dopelniak', T0, createRng(2), DEFS)).toMatchObject({
      level: 2,
      cardsGained: [{ cardId: 'tarcza-dopelniaka', count: 1 }],
    });
    expect(owned(s, 'tarcza-dopelniaka')).toBe(3);
    expect(catchCreature(s, 'dopelniak', T0, createRng(3), DEFS)).toMatchObject({ level: 3, leveledUp: true, cardsGained: [] });
    expect(catchCreature(s, 'dopelniak', T0, createRng(4), DEFS)).toMatchObject({ level: 3, leveledUp: false, cardsGained: [] });
    expect(owned(s, 'tarcza-dopelniaka')).toBe(3);
  });

  it('Bliźniak 2 kopie Podwójnego dzioba, Koniczynek 1 Koniczynowej tarczy; Plusik (start) awansuje: +1 Cios', () => {
    const s = newSave();
    expect(catchCreature(s, 'blizniak', T0, createRng(1), DEFS).cardsGained).toEqual([{ cardId: 'podwojny-dziob', count: 2 }]);
    expect(catchCreature(s, 'koniczynek', T0, createRng(1), DEFS).cardsGained).toEqual([{ cardId: 'koniczynowa-tarcza', count: 1 }]);
    expect(catchCreature(s, 'plusik', T0, createRng(1), DEFS)).toMatchObject({
      isNew: false,
      level: 2,
      cardsGained: [{ cardId: 'cios-plusika', count: 1 }],
    });
    expect(s.cards.owned).toEqual({ 'cios-plusika': 6, 'tarcza-z-lisci': 3, 'podwojny-dziob': 2, 'koniczynowa-tarcza': 1 });
    expect(validateSave(s)).toEqual([]);
  });

  it('stworek bez karty w treści → brak kart; karta spoza treści → brak kart', () => {
    const s = newSave();
    const noGrants: GameDefs = { ...DEFS, grants: { ...TEST_CARD_GRANTS, creatures: {} } };
    expect(catchCreature(s, 'dopelniak', T0, createRng(1), noGrants).cardsGained).toEqual([]);
    const unknownCard: GameDefs = {
      ...DEFS,
      grants: { ...TEST_CARD_GRANTS, creatures: { blizniak: { cardId: 'smocza-karta', onCatch: 2, onLevelUp: 1 } } },
    };
    expect(catchCreature(s, 'blizniak', T0, createRng(1), unknownCard).cardsGained).toEqual([]);
    expect(s.cards.owned).toEqual({ 'cios-plusika': 5, 'tarcza-z-lisci': 3 });
  });

  it('limit 99 kopii jednej karty', () => {
    const s = newSave();
    s.cards.owned['tarcza-dopelniaka'] = 98;
    expect(catchCreature(s, 'dopelniak', T0, createRng(1), DEFS).cardsGained).toEqual([{ cardId: 'tarcza-dopelniaka', count: 1 }]);
    expect(owned(s, 'tarcza-dopelniaka')).toBe(99);
    s.cards.owned['lepka-kokarda'] = 99;
    expect(transformEnemy(s, 'slimakorro', T0, createRng(1), DEFS).cardGained).toBeNull();
    expect(owned(s, 'lepka-kokarda')).toBe(99);
    expect(validateSave(s)).toEqual([]);
  });

  it('przemiana: kopia karty brainglama przy KAŻDEJ przemianie (także boss → legendarna)', () => {
    const s = newSave();
    const pairs: [string, string][] = [
      ['slimakorro', 'lepka-kokarda'],
      ['trzmielini', 'brokatowy-roj'],
      ['grzybello', 'perlowy-zdroj'],
      ['kosiarrini', 'krolewski-bukiet'],
    ];
    for (const [enemy, cardId] of pairs) {
      expect(transformEnemy(s, enemy, T0, createRng(1), DEFS)).toMatchObject({ firstTime: true, cardGained: cardId });
      expect(transformEnemy(s, enemy, T0, createRng(2), DEFS)).toEqual({ firstTime: false, gift: [], cardGained: cardId });
      expect(owned(s, cardId)).toBe(2);
    }
    const noGlams: GameDefs = { ...DEFS, grants: { ...TEST_CARD_GRANTS, glams: {} } };
    expect(transformEnemy(s, 'slimakorro', T0, createRng(3), noGlams).cardGained).toBeNull();
    expect(owned(s, 'lepka-kokarda')).toBe(2);
    expect(s.progress.glams.slimakorro?.count).toBe(3);
  });

  it('wszystkie karty z danych testowych (kopia content/cards.ts) są znane formatowi zapisu', () => {
    expect(TEST_CARD_IDS.filter((id) => !isCardId(id))).toEqual([]);
    for (const g of Object.values(TEST_CARD_GRANTS.creatures)) expect(isCardId(g.cardId)).toBe(true);
    for (const id of Object.values(TEST_CARD_GRANTS.glams)) expect(isCardId(id)).toBe(true);
    expect(TEST_CARD_GRANTS.starter).toEqual(newSave().cards.owned);
  });
});

describe('karty: talia i kolekcja', () => {
  it('talia startowa: 3 × Cios Plusika + 3 × Tarcza z liści (maks. 3 kopie karty)', () => {
    const s = newSave();
    expect(deckOf(s, DEFS)).toEqual(['cios-plusika', 'cios-plusika', 'cios-plusika', 'tarcza-z-lisci', 'tarcza-z-lisci', 'tarcza-z-lisci']);
  });

  it('talia maks. 15 kart, maks. 3 kopie; kolekcja: posiadane, w talii, zapas', () => {
    const s = newSave();
    for (const id of TEST_CARD_IDS) s.cards.owned[id] = 5;
    const deck = deckOf(s, DEFS);
    expect(deck).toHaveLength(15);
    for (const id of TEST_CARD_IDS) expect(deck.filter((d) => d === id).length).toBeLessThanOrEqual(3);
    const col = collectionOf(s, DEFS);
    expect(col.map((c) => c.cardId)).toEqual(TEST_CARD_IDS);
    expect(col.reduce((n, c) => n + c.inDeck, 0)).toBe(15);
    for (const c of col) {
      expect(c.owned).toBe(5);
      expect(c.spare).toBe(2);
      expect(c.inDeck).toBe(deck.filter((d) => d === c.cardId).length);
    }
  });

  it('kolekcja świeżego zapisu: brakujące karty z owned = 0', () => {
    const col = collectionOf(newSave(), DEFS);
    expect(col).toHaveLength(9);
    expect(col[0]).toEqual({ cardId: 'cios-plusika', owned: 5, inDeck: 3, spare: 2 });
    expect(col[1]).toEqual({ cardId: 'tarcza-z-lisci', owned: 3, inDeck: 3, spare: 0 });
    expect(col.slice(2).every((c) => c.owned === 0 && c.inDeck === 0 && c.spare === 0)).toBe(true);
  });

  it('backfillCards: zapis sprzed kart dostaje karty złapanych stworków i brainglamów; idempotentne', () => {
    const raw = JSON.parse(serializeSave(newSave())) as Record<string, any>;
    delete raw.cards;
    raw.creatures.push({ id: 'dopelniak', level: 2, fedCycle: -1, caughtAt: T0 }, { id: 'blizniak', level: 1, fedCycle: -1, caughtAt: T0 });
    raw.progress.glams = { slimakorro: { enemyId: 'slimakorro', count: 2, firstAt: T0 } };
    const s = migrateSave(raw);
    expect(s.cards.owned).toEqual({ 'cios-plusika': 5, 'tarcza-z-lisci': 3 });
    expect(backfillCards(s, DEFS)).toEqual([
      { cardId: 'tarcza-dopelniaka', count: 3 },
      { cardId: 'podwojny-dziob', count: 2 },
      { cardId: 'lepka-kokarda', count: 2 },
    ]);
    expect(s.cards.owned).toMatchObject({ 'cios-plusika': 5, 'tarcza-dopelniaka': 3, 'podwojny-dziob': 2, 'lepka-kokarda': 2 });
    expect(backfillCards(s, DEFS)).toEqual([]);
    expect(validateSave(s)).toEqual([]);
    // Zwykła gra: karty już są — nic się nie zmienia.
    const g = newSave();
    catchCreature(g, 'blizniak', T0, createRng(1), DEFS);
    transformEnemy(g, 'trzmielini', T0, createRng(1), DEFS);
    const before = { ...g.cards.owned };
    expect(backfillCards(g, DEFS)).toEqual([]);
    expect(g.cards.owned).toEqual(before);
  });
});

describe('handlarz Kartonini w zapisie (GDD 9.5a)', () => {
  it('świeży zapis: oferta dnia i sprzedaż 2 zapasowych Ciosów; sprzedaż do 3 kopii, potem oferty brak', () => {
    const s = newSave();
    expect(offersFor(s, DEFS).map((o) => o.id)).toEqual(['daily:0', 'sell:cios-plusika']);
    const rng = createRng(4);
    const a = acceptMerchant(s, 'sell:cios-plusika', undefined, rng, DEFS);
    expect(a.ok).toBe(true);
    expect(a.digitsGained).toHaveLength(2);
    expect(countDigits(s.inventory.digits)).toBe(21);
    expect(acceptMerchant(s, 'sell:cios-plusika', undefined, rng, DEFS).ok).toBe(true);
    expect(s.cards.owned['cios-plusika']).toBe(3);
    const none = acceptMerchant(s, 'sell:cios-plusika', undefined, rng, DEFS);
    expect(none).toEqual({ ok: false, message: 'Tej oferty już nie ma.', cardGained: null, digitsGained: [] });
    expect(s.cards.owned['cios-plusika']).toBe(3);
    expect(countDigits(s.inventory.digits)).toBe(23);
    expect(validateSave(s)).toEqual([]);
  });

  it('oferta dnia: raz na cykl; zapamiętany cykl; wraca w następnym cyklu', () => {
    const s = newSave(11);
    const offer = offersFor(s, DEFS).find((o) => o.kind === 'daily');
    if (offer?.kind !== 'daily') throw new Error('brak oferty dnia');
    const payment = findForgePayment(offer.price, s.inventory.digits);
    expect(payment).not.toBeNull();
    // Zła zapłata: nic się nie zmienia.
    const bad = acceptMerchant(s, offer.id, [1, 1, 1], createRng(1), DEFS);
    expect(bad.ok).toBe(false);
    expect(s.progress.merchantDailyCycle).toBe(-1);
    const ok = acceptMerchant(s, offer.id, payment ?? [], createRng(1), DEFS);
    expect(ok).toMatchObject({ ok: true, cardGained: offer.cardId });
    expect(s.cards.owned[offer.cardId]).toBe(1);
    expect(countDigits(s.inventory.digits)).toBe(16);
    expect(s.progress.merchantDailyCycle).toBe(0);
    expect(offersFor(s, DEFS).some((o) => o.kind === 'daily')).toBe(false);
    expect(acceptMerchant(s, offer.id, payment ?? [], createRng(1), DEFS).ok).toBe(false);
    expect(validateSave(s)).toEqual([]);
    expect(roundTrip(s)).toEqual(s);
    // Nowy cykl → nowa oferta dnia.
    s.progress.taskSinceReturn = true;
    returnToBase(s, createRng(2), T0, DEFS);
    expect(offersFor(s, DEFS).find((o) => o.kind === 'daily')?.id).toBe('daily:1');
  });

  it('„3 za 1” przez zapis: −3 kopie, +1 karta wyższej rzadkości', () => {
    const s = newSave();
    s.cards.owned['cios-plusika'] = 8;
    const r = acceptMerchant(s, '3for1:cios-plusika', undefined, createRng(3), DEFS);
    expect(r.ok).toBe(true);
    expect(TEST_CARDS[r.cardGained as string]?.rarity).toBe('uncommon');
    expect(s.cards.owned['cios-plusika']).toBe(5);
    expect(s.cards.owned[r.cardGained as string]).toBe(1);
    expect(validateSave(s)).toEqual([]);
  });

  it('nieznane id oferty → odmowa bez zmian', () => {
    const s = newSave();
    const before = serializeSave(s);
    expect(acceptMerchant(s, 'daily:7', [9, 5, 1], createRng(1), DEFS).ok).toBe(false);
    expect(acceptMerchant(s, 'sell:tarcza-z-lisci', undefined, createRng(1), DEFS).ok).toBe(false);
    expect(serializeSave(s)).toBe(before);
  });
});

describe('dungeon: przebieg wyprawy (GDD 7.5, 11)', () => {
  it('startDungeonRun: nowa kolejność pokoi, reszta wyzerowana', () => {
    const s = newSave();
    s.progress.dungeon = { active: true, roomOrder: ['boss'], roomIndex: 1, enemyCzar: { boss: 3 }, bossPhase: 3, vines: 2, heroHp: 10 };
    const order = startDungeonRun(s, createRng(1));
    expect(order).toHaveLength(5);
    expect([...order.slice(0, 3)].sort()).toEqual(['entry', 'nest', 'vault']);
    expect(order.slice(3)).toEqual(['campfire', 'boss']);
    expect(s.progress.dungeon).toEqual({ active: true, roomOrder: order, roomIndex: 0, enemyCzar: {}, bossPhase: 1, vines: 0, heroHp: null });
    expect(currentRoomId(s)).toBe(order[0]);
    order.push('x');
    expect(s.progress.dungeon.roomOrder).toHaveLength(5);
    // Powtórne wizyty (po ukończonej wyprawie): różne kolejności pokoi 1–3.
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const r = newSave();
      r.progress.lands.meadow.dungeonRuns = 1;
      orders.add(startDungeonRun(r, createRng(seed)).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('regresja: pierwsza wyprawa zawsze w kolejności z tabeli GDD 11 (wejście, skarbiec, gniazdo)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = newSave();
      expect(startDungeonRun(s, createRng(seed))).toEqual(['entry', 'vault', 'nest', 'campfire', 'boss']);
      expect(currentRoomId(s)).toBe('entry');
    }
  });

  it('regresja: powtórna wyprawa ma INNĄ kolejność pokoi 1–3 niż poprzednia (GDD 11)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = newSave();
      let prev = startDungeonRun(s, createRng(seed));
      for (let run = 0; run < 4; run++) {
        expect(finishDungeon(s)).toBe(true);
        // Ten sam stan rng co poprzednio — bez `previous` makeRoomOrder dałby tę samą kolejność.
        const next = startDungeonRun(s, createRng(seed));
        expect(next.slice(0, 3), `seed ${seed}, wyprawa ${run + 2}`).not.toEqual(prev.slice(0, 3));
        expect(next.slice(3)).toEqual(['campfire', 'boss']);
        prev = next;
      }
      expect(s.progress.lands.meadow.dungeonRuns).toBe(4);
    }
    // Przerwana (nieukończona) wyprawa: nowe wejście też zmienia kolejność.
    const s = newSave();
    const first = startDungeonRun(s, createRng(1));
    clearRoom(s);
    expect(startDungeonRun(s, createRng(1)).slice(0, 3)).not.toEqual(first.slice(0, 3));
    expect(validateSave(s)).toEqual([]);
    expect(roundTrip(s)).toEqual(s);
  });

  it('recordBattleProgress: Czar, faza, pnącza i HP (null = pełne) przetrwają zapis', () => {
    const s = newSave();
    startDungeonRun(s, createRng(1));
    recordBattleProgress(s, 'boss:kosiarrini', { czar: 57, phase: 2, vines: 1, heroHp: 64, heroMaxHp: 100 });
    expect(s.progress.dungeon).toMatchObject({ enemyCzar: { 'boss:kosiarrini': 57 }, bossPhase: 2, vines: 1, heroHp: 64 });
    expect(validateSave(s)).toEqual([]);
    expect(roundTrip(s).progress.dungeon).toEqual(s.progress.dungeon);
    recordBattleProgress(s, 'boss:kosiarrini', { czar: 40, phase: 3, vines: 0, heroHp: 120, heroMaxHp: 120 });
    expect(s.progress.dungeon).toMatchObject({ enemyCzar: { 'boss:kosiarrini': 40 }, bossPhase: 3, vines: 0, heroHp: null });
    // HP 0 → „Stworki cię ratują” (pełne HP); ułamki i śmieci przycinane do poprawnego zapisu.
    recordBattleProgress(s, 'nest:trzmielini', { czar: -0, phase: 0, vines: 99, heroHp: 0, heroMaxHp: 100 });
    expect(Object.is(s.progress.dungeon.enemyCzar['nest:trzmielini'], 0)).toBe(true);
    expect(s.progress.dungeon).toMatchObject({ bossPhase: 1, vines: 10, heroHp: null });
    recordBattleProgress(s, 'entry:slimakorro', { czar: 12, phase: NaN, vines: NaN, heroHp: 33.6, heroMaxHp: 100 });
    expect(s.progress.dungeon).toMatchObject({ bossPhase: 1, vines: 0, heroHp: 34 });
    recordBattleProgress(s, 'entry:slimakorro', { czar: 12, phase: 1, vines: 0, heroHp: 0.4, heroMaxHp: 100 });
    expect(s.progress.dungeon.heroHp).toBe(1);
    expect(validateSave(s)).toEqual([]);
  });

  it('recordBattleProgress: zły klucz lub Czar → wyjątek bez zmian', () => {
    const s = newSave();
    startDungeonRun(s, createRng(1));
    const st = { czar: 5, phase: 1, vines: 0, heroHp: 50, heroMaxHp: 100 };
    expect(() => recordBattleProgress(s, '', st)).toThrow(RangeError);
    expect(() => recordBattleProgress(s, 'x'.repeat(101), st)).toThrow(RangeError);
    expect(() => recordBattleProgress(s, '__proto__', st)).toThrow(RangeError);
    expect(() => recordBattleProgress(s, 'entry', { ...st, czar: NaN })).toThrow(RangeError);
    expect(s.progress.dungeon.enemyCzar).toEqual({});
    expect(s.progress.dungeon.heroHp).toBeNull();
  });

  it('clearRoom: następny pokój, HP zostaje, stan bossa zerowany; ognisko przywraca HP; finishDungeon', () => {
    const s = newSave();
    const order = startDungeonRun(s, createRng(2));
    recordBattleProgress(s, 'a', { czar: 0, phase: 2, vines: 1, heroHp: 70, heroMaxHp: 100 });
    expect(clearRoom(s)).toBe(order[1]);
    expect(s.progress.dungeon).toMatchObject({ roomIndex: 1, heroHp: 70, bossPhase: 1, vines: 0 });
    expect(clearRoom(s)).toBe(order[2]);
    expect(clearRoom(s)).toBe('campfire');
    restAtCampfire(s);
    expect(s.progress.dungeon.heroHp).toBeNull();
    expect(clearRoom(s)).toBe('boss');
    expect(clearRoom(s)).toBeNull();
    expect(s.progress.dungeon.roomIndex).toBe(5);
    expect(currentRoomId(s)).toBeNull();
    expect(clearRoom(s)).toBeNull();
    expect(s.progress.dungeon.roomIndex).toBe(5);
    expect(validateSave(s)).toEqual([]);

    expect(finishDungeon(s)).toBe(true);
    expect(s.progress.lands.meadow.dungeonRuns).toBe(1);
    // Kolejność pokoi zostaje jako „poprzednia” (następna wyprawa dostanie inną); reszta wyzerowana.
    expect(s.progress.dungeon).toEqual({ active: false, roomOrder: order, roomIndex: 0, enemyCzar: {}, bossPhase: 1, vines: 0, heroHp: null });
    expect(validateSave(s)).toEqual([]);
    expect(roundTrip(s)).toEqual(s);
    expect(finishDungeon(s)).toBe(false);
    expect(s.progress.lands.meadow.dungeonRuns).toBe(1);
    expect(currentRoomId(s)).toBeNull();
    expect(clearRoom(s)).toBeNull();
    expect(s.progress.dungeon.roomIndex).toBe(0);
    startDungeonRun(s, createRng(3));
    expect(finishDungeon(s, 'cave')).toBe(true);
    expect(s.progress.lands.cave.dungeonRuns).toBe(1);
    expect(validateSave(s)).toEqual([]);
  });

  it('regresja: HP ≤ 0 w zapisie → po wczytaniu pełne HP (null), tak jak w recordBattleProgress (GDD 7.5)', () => {
    const s = newSave();
    startDungeonRun(s, createRng(1));
    recordBattleProgress(s, 'entry', { czar: 5, phase: 1, vines: 0, heroHp: 0, heroMaxHp: 100 });
    expect(s.progress.dungeon.heroHp).toBeNull();
    // Warstwa gry wpisała HP wprost (np. combat.heroHp po upadku) — wczytanie nie może dać 1 HP.
    for (const hp of [0, -3]) {
      s.progress.dungeon.heroHp = hp;
      expect(roundTrip(s).progress.dungeon.heroHp, String(hp)).toBeNull();
    }
  });

  it('przerwana wyprawa wznawia się po wczytaniu zapisu (ten sam pokój, Czar, HP)', () => {
    const s = newSave();
    startDungeonRun(s, createRng(5));
    clearRoom(s);
    recordBattleProgress(s, 'room2', { czar: 9, phase: 1, vines: 0, heroHp: 41, heroMaxHp: 100 });
    const back = roundTrip(s);
    expect(currentRoomId(back)).toBe(currentRoomId(s));
    expect(back.progress.dungeon.enemyCzar.room2).toBe(9);
    expect(back.progress.dungeon.heroHp).toBe(41);
  });
});

describe('brama z darem (GDD 10.4)', () => {
  it('sprytne rozwiązanie bramy z darem nie daje bonusowej skrzynki (bez farmienia), pochwała zostaje', () => {
    const s = newSave();
    s.inventory.digits = digitsFromList([1, 2]);
    const gate: GateSpec = { target: 54, gift: digitsFromList([6, 9]), ops: ['×'] };
    applyGateGift(s, gate);
    const score = openGate(s, gateTokensOf(6, '×', 9), gate);
    expect(score).toMatchObject({ valid: true, smart: true });
    expect(s.progress.pendingBonusChest).toBe(false);
    expect(s.progress.lands.meadow.gatesOpened).toBe(1);
  });

  it('dar z samych zer liczników to brak daru → sprytne nadal daje skrzynkę', () => {
    const s = newSave();
    const score = openGate(s, gateTokensOf(6, '×', 9), { target: 54, gift: emptyDigits(), ops: ['×'] });
    expect(score.smart).toBe(true);
    expect(s.progress.pendingBonusChest).toBe(true);
  });

  it('brama z darem: wcześniejsza bonusowa skrzynka nie znika', () => {
    const s = newSave();
    s.progress.pendingBonusChest = true;
    openGate(s, gateTokensOf(6, '×', 9), { target: 54, gift: digitsFromList([0]), ops: ['×'] });
    expect(s.progress.pendingBonusChest).toBe(true);
  });
});

describe('fasada core/index', () => {
  it('eksportuje API modułów i reguły gry', () => {
    for (const name of [
      'createRng',
      'generateTask',
      'hintFor',
      'pickTask',
      'recordAttempt',
      'createSkillModel',
      'applyCalibration',
      'makeGate',
      'solveGate',
      'openChest',
      'startCombat',
      'applyPlayerAttack',
      'computeHeroStats',
      'unlockedActions',
      'actionCategories',
      'makeRoomOrder',
      'createNewSave',
      'deserializeSave',
      'answerTask',
      'returnToBase',
      'unlockedActionsOf',
      'finishCalibration',
      'deckOf',
      'collectionOf',
      'offersFor',
      'acceptMerchant',
      'backfillCards',
      'startDungeonRun',
      'currentRoomId',
      'recordBattleProgress',
      'clearRoom',
      'restAtCampfire',
      'finishDungeon',
    ]) {
      expect(typeof (core as Record<string, unknown>)[name], name).toBe('function');
    }
    expect(core.startingDigits()).toEqual(startingDigits());
  });
});
