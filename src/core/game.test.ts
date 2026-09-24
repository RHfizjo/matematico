import { describe, expect, it } from 'vitest';
import type { CreatureDef, GateSpec, ItemDef, SaveV1, Task } from './types';
import { createRng } from './rng';
import { generateTask } from './math';
import { createCalibration } from './adaptive';
import { countDigits, digitsFromList, emptyDigits, gateTokensFromText, gateTokensOf, startingDigits } from './economy';
import { createNewSave, deserializeSave, serializeSave } from './save';
import {
  FEED_RULE,
  answerTask,
  applyGateGift,
  beginPlaySession,
  buildAttempt,
  catchCreature,
  completeFeeding,
  defeatBoss,
  feedCreature,
  finishCalibration,
  grantItem,
  helps,
  heroStats,
  lootChest,
  openGate,
  returnToBase,
  stageCheck,
  transformEnemy,
  trialStatus,
  unlockedActionsOf,
  unlockedOperatorsOf,
  type AnswerInput,
  type GameDefs,
} from './game';
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
    const r = transformEnemy(s, 'slimakorro', T0 + 7, createRng(1));
    expect(r.firstTime).toBe(true);
    expect(r.gift).toHaveLength(3);
    expect(r.gift.filter((d) => d >= 6).length).toBe(1);
    expect(s.progress.glams.slimakorro).toEqual({ enemyId: 'slimakorro', count: 1, firstAt: T0 + 7 });
    expect(countDigits(s.inventory.digits)).toBe(22);
    expect(transformEnemy(s, 'slimakorro', T0 + 9, createRng(2))).toEqual({ firstTime: false, gift: [] });
    expect(s.progress.glams.slimakorro).toEqual({ enemyId: 'slimakorro', count: 2, firstAt: T0 + 7 });
    expect(countDigits(s.inventory.digits)).toBe(22);
  });

  it('nieznany brainrot → wyjątek', () => {
    expect(() => transformEnemy(newSave(), 'godzilla', T0, createRng(1))).toThrow(RangeError);
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
    transformEnemy(s, 'trzmielini', T0, rng);
    openGate(s, gateTokensOf(6, '×', 9), { target: 54, gift: emptyDigits(), ops: ['+', '×'] });
    defeatBoss(s, 'meadow', ['zlota-siec'], rng, DEFS);
    expect(roundTrip(s)).toEqual(s);
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
    ]) {
      expect(typeof (core as Record<string, unknown>)[name], name).toBe('function');
    }
    expect(core.startingDigits()).toEqual(startingDigits());
  });
});
