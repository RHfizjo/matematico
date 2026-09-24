/**
 * Ścisła walidacja strukturalna SaveV1 — niezależna od naprawy w migrate.ts.
 * Zwraca listę problemów (ścieżka: opis); pusta lista = zapis poprawny.
 * Przydatna do testów i do komunikatu „zapis został naprawiony” przy imporcie.
 */
import {
  ATTEMPT_MODES,
  BREAK_REMINDERS,
  COMBAT_OPS,
  EQUIP_SLOTS,
  ITEM_SLOTS,
  LAND_IDS,
  NUMBER_RANGES,
  OPS,
  QUALITY_PRESETS,
  STARTER_CARDS,
  TIME_LIMIT_MODES,
  isCardId,
  isCategoryId,
  isCreatureId,
  isDistractorKind,
  isEnemyId,
  isFactId,
  isFactInCategory,
  isItemId,
  STARTER_CREATURE,
} from './ids';
import { SAVE_LIMITS as L } from './limits';
import { SAVE_VERSION } from './save';

type Obj = Record<string, unknown>;

class Checker {
  readonly problems: string[] = [];

  fail(path: string, msg: string): false {
    this.problems.push(`${path || 'save'}: ${msg}`);
    return false;
  }

  /** Zwykły obiekt z dokładnie tymi kluczami (gdy `keys` podane). */
  obj(path: string, v: unknown, keys?: readonly string[]): v is Obj {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return this.fail(path, 'oczekiwano obiektu');
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return this.fail(path, 'to nie jest zwykły obiekt');
    if (keys) {
      const actual = Object.keys(v);
      const sub = (k: string): string => (path ? `${path}.${k}` : k);
      for (const k of keys) if (!actual.includes(k)) this.fail(sub(k), 'brak pola');
      for (const k of actual) if (!keys.includes(k)) this.fail(sub(k), 'nieznane pole');
    }
    return true;
  }

  arr(path: string, v: unknown, max = Infinity): v is unknown[] {
    if (!Array.isArray(v)) return this.fail(path, 'oczekiwano tablicy');
    if (v.length > max) return this.fail(path, `za długa (${v.length} > ${max})`);
    return true;
  }

  bool(path: string, v: unknown): boolean {
    return typeof v === 'boolean' || this.fail(path, 'oczekiwano true/false');
  }

  num(path: string, v: unknown, min = -Infinity, max = Infinity): boolean {
    if (typeof v !== 'number' || !Number.isFinite(v)) return this.fail(path, 'oczekiwano skończonej liczby');
    if (Object.is(v, -0)) return this.fail(path, '−0 nie przetrwa JSON');
    if (v < min || v > max) return this.fail(path, `poza zakresem [${min}, ${max}]`);
    return true;
  }

  int(path: string, v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): boolean {
    if (!Number.isSafeInteger(v)) return this.fail(path, 'oczekiwano liczby całkowitej');
    return this.num(path, v, min, max);
  }

  oneOf(path: string, v: unknown, allowed: readonly unknown[]): boolean {
    return (allowed.includes(v) && !Object.is(v, -0)) || this.fail(path, `niedozwolona wartość ${JSON.stringify(v)}`);
  }

  test(path: string, ok: boolean, msg: string): boolean {
    return ok || this.fail(path, msg);
  }
}

function checkSettings(c: Checker, p: string, v: unknown): void {
  const keys = ['range', 'ops', 'combatOps', 'crossTenOnMeadow', 'timeLimit', 'breakReminderMin', 'quality', 'audio', 'showFps'];
  if (!c.obj(p, v, keys)) return;
  c.oneOf(`${p}.range`, v.range, NUMBER_RANGES);
  if (c.obj(`${p}.ops`, v.ops, OPS)) {
    const ops = v.ops;
    for (const op of OPS) c.bool(`${p}.ops.${op}`, ops[op]);
    c.test(`${p}.ops`, OPS.some((op) => ops[op] === true), 'żadne działanie nie jest włączone');
  }
  c.oneOf(`${p}.combatOps`, v.combatOps, COMBAT_OPS);
  c.bool(`${p}.crossTenOnMeadow`, v.crossTenOnMeadow);
  if (c.obj(`${p}.timeLimit`, v.timeLimit, ['mode', 'fixedSec'])) {
    c.oneOf(`${p}.timeLimit.mode`, v.timeLimit.mode, TIME_LIMIT_MODES);
    const fs = v.timeLimit.fixedSec;
    if (c.obj(`${p}.timeLimit.fixedSec`, fs, OPS)) {
      for (const op of OPS) c.num(`${p}.timeLimit.fixedSec.${op}`, fs[op], L.fixedSecMin, L.fixedSecMax);
    }
  }
  c.oneOf(`${p}.breakReminderMin`, v.breakReminderMin, BREAK_REMINDERS);
  c.oneOf(`${p}.quality`, v.quality, QUALITY_PRESETS);
  if (c.obj(`${p}.audio`, v.audio, ['music', 'sfx'])) {
    c.num(`${p}.audio.music`, v.audio.music, 0, 1);
    c.num(`${p}.audio.sfx`, v.audio.sfx, 0, 1);
  }
  c.bool(`${p}.showFps`, v.showFps);
}

function checkModel(c: Checker, p: string, v: unknown): void {
  const keys = ['facts', 'categories', 'session', 'taskCounter', 'window', 'recent', 'retries', 'errorStreak'];
  if (!c.obj(p, v, keys)) return;
  if (c.obj(`${p}.facts`, v.facts)) {
    for (const [k, f] of Object.entries(v.facts)) {
      const q = `${p}.facts[${k}]`;
      c.test(q, isFactId(k), 'zły identyfikator faktu');
      if (!c.obj(q, f, ['m', 'lt', 'n', 'nOk', 'box', 'lastSeenAt', 'lastSeenSession', 'helped', 'last2'])) continue;
      c.num(`${q}.m`, f.m, 0, 1);
      if (f.lt !== null) c.num(`${q}.lt`, f.lt);
      if (c.int(`${q}.n`, f.n)) {
        c.int(`${q}.nOk`, f.nOk, 0, f.n as number);
        c.int(`${q}.helped`, f.helped, 0, f.n as number);
      }
      c.int(`${q}.box`, f.box, 0, L.boxMax);
      c.num(`${q}.lastSeenAt`, f.lastSeenAt, 0);
      c.int(`${q}.lastSeenSession`, f.lastSeenSession);
      if (c.arr(`${q}.last2`, f.last2, L.last2)) f.last2.forEach((b, i) => c.bool(`${q}.last2[${i}]`, b));
    }
  }
  if (c.obj(`${p}.categories`, v.categories)) {
    for (const [k, s] of Object.entries(v.categories)) {
      const q = `${p}.categories[${k}]`;
      c.test(q, isCategoryId(k), 'zła kategoria');
      if (!c.obj(q, s, ['recentMs', 'n', 'nOk', 'm', 'prior'])) continue;
      if (c.arr(`${q}.recentMs`, s.recentMs, L.recentMs)) s.recentMs.forEach((x, i) => c.num(`${q}.recentMs[${i}]`, x, 0));
      if (c.int(`${q}.n`, s.n)) c.int(`${q}.nOk`, s.nOk, 0, s.n as number);
      c.num(`${q}.m`, s.m, 0, 1);
      c.num(`${q}.prior`, s.prior, 0, 1);
    }
  }
  c.int(`${p}.session`, v.session);
  c.int(`${p}.taskCounter`, v.taskCounter);
  if (c.arr(`${p}.window`, v.window, L.window)) v.window.forEach((b, i) => c.bool(`${p}.window[${i}]`, b));
  if (c.arr(`${p}.recent`, v.recent, L.recent)) {
    v.recent.forEach((r, i) => {
      const q = `${p}.recent[${i}]`;
      if (!c.obj(q, r, ['factId', 'categoryId'])) return;
      c.test(`${q}.factId`, r.factId === null || isFactId(r.factId), 'zły fakt');
      c.test(`${q}.categoryId`, isCategoryId(r.categoryId), 'zła kategoria');
    });
  }
  if (c.arr(`${p}.retries`, v.retries, L.retries)) {
    v.retries.forEach((r, i) => {
      const q = `${p}.retries[${i}]`;
      if (!c.obj(q, r, ['factId', 'categoryId', 'dueAtTask', 'session'])) return;
      c.test(`${q}.factId`, isFactId(r.factId), 'zły fakt');
      c.test(`${q}.categoryId`, isCategoryId(r.categoryId), 'zła kategoria');
      if (isFactId(r.factId) && isCategoryId(r.categoryId)) {
        c.test(`${q}.factId`, isFactInCategory(r.factId, r.categoryId), 'fakt spoza kategorii');
      }
      c.int(`${q}.dueAtTask`, r.dueAtTask);
      c.int(`${q}.session`, r.session);
    });
  }
  c.int(`${p}.errorStreak`, v.errorStreak);
}

function checkProgress(c: Checker, p: string, v: unknown): number | null {
  const keys = [
    'cycle',
    'taskSinceReturn',
    'calibrated',
    'firstExpeditionDone',
    'lands',
    'glams',
    'openedChests',
    'chestPity',
    'dungeon',
    'pendingBonusChest',
    'merchantDailyCycle',
  ];
  if (!c.obj(p, v, keys)) return null;
  c.int(`${p}.cycle`, v.cycle);
  const cycle = typeof v.cycle === 'number' ? v.cycle : Number.MAX_SAFE_INTEGER;
  c.bool(`${p}.taskSinceReturn`, v.taskSinceReturn);
  c.bool(`${p}.calibrated`, v.calibrated);
  c.bool(`${p}.firstExpeditionDone`, v.firstExpeditionDone);
  if (c.obj(`${p}.lands`, v.lands, LAND_IDS)) {
    for (const id of LAND_IDS) {
      const q = `${p}.lands.${id}`;
      const l = v.lands[id];
      if (!c.obj(q, l, ['unlocked', 'stage', 'bossDefeated', 'gatesOpened', 'dungeonRuns'])) continue;
      c.bool(`${q}.unlocked`, l.unlocked);
      if (id === 'meadow') c.test(`${q}.unlocked`, l.unlocked === true, 'Łąka musi być odblokowana');
      c.int(`${q}.stage`, l.stage, 1, L.maxStage);
      c.bool(`${q}.bossDefeated`, l.bossDefeated);
      c.int(`${q}.gatesOpened`, l.gatesOpened);
      c.int(`${q}.dungeonRuns`, l.dungeonRuns);
    }
  }
  if (c.obj(`${p}.glams`, v.glams)) {
    for (const [k, g] of Object.entries(v.glams)) {
      const q = `${p}.glams[${k}]`;
      c.test(q, isEnemyId(k), 'nieznany brainrot');
      if (!c.obj(q, g, ['enemyId', 'count', 'firstAt'])) continue;
      c.test(`${q}.enemyId`, g.enemyId === k, 'enemyId ≠ klucz');
      c.int(`${q}.count`, g.count, 1);
      c.num(`${q}.firstAt`, g.firstAt, 0);
    }
  }
  if (c.arr(`${p}.openedChests`, v.openedChests)) {
    const chests = v.openedChests;
    chests.forEach((x, i) => {
      c.test(`${p}.openedChests[${i}]`, typeof x === 'string' && x.length > 0 && x.length <= L.idMaxLength, 'zły identyfikator');
    });
    c.test(`${p}.openedChests`, new Set(chests).size === chests.length, 'duplikaty');
  }
  c.int(`${p}.chestPity`, v.chestPity);
  const d = v.dungeon;
  if (c.obj(`${p}.dungeon`, d, ['active', 'roomOrder', 'roomIndex', 'enemyCzar', 'bossPhase', 'vines', 'heroHp'])) {
    c.bool(`${p}.dungeon.active`, d.active);
    let rooms = 0;
    if (c.arr(`${p}.dungeon.roomOrder`, d.roomOrder)) {
      rooms = d.roomOrder.length;
      d.roomOrder.forEach((x, i) => {
        c.test(`${p}.dungeon.roomOrder[${i}]`, typeof x === 'string' && x.length > 0 && x.length <= L.idMaxLength, 'zły pokój');
      });
    }
    c.int(`${p}.dungeon.roomIndex`, d.roomIndex, 0, rooms);
    if (c.obj(`${p}.dungeon.enemyCzar`, d.enemyCzar)) {
      for (const [k, x] of Object.entries(d.enemyCzar)) {
        c.test(`${p}.dungeon.enemyCzar`, k.length > 0 && k.length <= L.idMaxLength, 'zły klucz');
        c.num(`${p}.dungeon.enemyCzar[${k}]`, x, 0);
      }
    }
    c.int(`${p}.dungeon.bossPhase`, d.bossPhase, 1, L.bossPhaseMax);
    c.int(`${p}.dungeon.vines`, d.vines, 0, L.vinesMax);
    if (d.heroHp !== null) c.int(`${p}.dungeon.heroHp`, d.heroHp, 1, L.heroHpMax);
  }
  c.bool(`${p}.pendingBonusChest`, v.pendingBonusChest);
  c.int(`${p}.merchantDailyCycle`, v.merchantDailyCycle, -1, cycle);
  return typeof v.cycle === 'number' ? v.cycle : null;
}

/** Lista problemów strukturalnych zapisu; [] = poprawny SaveV1. */
export function validateSave(raw: unknown): string[] {
  const c = new Checker();
  const keys = [
    'version',
    'createdAt',
    'updatedAt',
    'seed',
    'profile',
    'settings',
    'model',
    'inventory',
    'cards',
    'creatures',
    'equipment',
    'progress',
    'history',
    'sessions',
  ];
  if (!c.obj('', raw, keys)) return c.problems;
  const s = raw;
  c.test('version', s.version === SAVE_VERSION, `oczekiwano ${SAVE_VERSION}`);
  c.num('createdAt', s.createdAt, 0);
  c.num('updatedAt', s.updatedAt, 0);
  c.int('seed', s.seed, 0, 0xffffffff);

  if (c.obj('profile', s.profile, ['name', 'color'])) {
    const { name, color } = s.profile;
    c.test(
      'profile.name',
      typeof name === 'string' &&
        name.length > 0 &&
        name.length <= L.nameMaxLength &&
        name.trim() === name &&
        !/[\ud800-\udbff]$/.test(name),
      'zła nazwa',
    );
    c.test('profile.color', typeof color === 'string' && /^#(?:[0-9a-f]{3}){1,2}$/i.test(color), 'zły kolor');
  }

  checkSettings(c, 'settings', s.settings);
  checkModel(c, 'model', s.model);

  if (c.obj('inventory', s.inventory, ['digits']) && c.arr('inventory.digits', s.inventory.digits)) {
    const digits = s.inventory.digits;
    c.test('inventory.digits', digits.length === 10, 'długość ≠ 10');
    digits.forEach((x, i) => c.int(`inventory.digits[${i}]`, x, 0, L.digitMax));
  }

  if (c.obj('cards', s.cards, ['owned']) && c.obj('cards.owned', s.cards.owned)) {
    const owned = s.cards.owned;
    for (const [k, n] of Object.entries(owned)) {
      const q = `cards.owned[${k}]`;
      c.test(q, isCardId(k), 'nieznana karta');
      c.int(q, n, 0, L.cardMax);
    }
    for (const [id, start] of Object.entries(STARTER_CARDS)) {
      const n = owned[id];
      c.test(`cards.owned[${id}]`, typeof n === 'number' && n >= Math.min(start, L.starterCardMin), 'za mało kart startowych');
    }
  }

  const cycle = checkProgress(c, 'progress', s.progress);

  if (c.arr('creatures', s.creatures)) {
    const seen = new Set<unknown>();
    s.creatures.forEach((cr, i) => {
      const q = `creatures[${i}]`;
      if (!c.obj(q, cr, ['id', 'level', 'fedCycle', 'caughtAt'])) return;
      c.test(`${q}.id`, isCreatureId(cr.id), 'nieznany stworek');
      c.test(`${q}.id`, !seen.has(cr.id), 'duplikat');
      seen.add(cr.id);
      c.int(`${q}.level`, cr.level, 1, L.creatureMaxLevel);
      c.int(`${q}.fedCycle`, cr.fedCycle, -1, cycle ?? Number.MAX_SAFE_INTEGER);
      c.num(`${q}.caughtAt`, cr.caughtAt, 0);
    });
    c.test('creatures', seen.has(STARTER_CREATURE), 'brak Plusika (prezent na start)');
  }

  if (c.obj('equipment', s.equipment, ['owned', 'equipped'])) {
    const ownedIds = new Set<unknown>();
    if (c.arr('equipment.owned', s.equipment.owned)) {
      s.equipment.owned.forEach((it, i) => {
        const q = `equipment.owned[${i}]`;
        if (!c.obj(q, it, ['id', 'level'])) return;
        c.test(`${q}.id`, isItemId(it.id), 'nieznany przedmiot');
        c.test(`${q}.id`, !ownedIds.has(it.id), 'duplikat');
        ownedIds.add(it.id);
        c.int(`${q}.level`, it.level, 1, L.itemMaxLevel);
      });
    }
    const eq = s.equipment.equipped;
    if (c.obj('equipment.equipped', eq, EQUIP_SLOTS)) {
      for (const slot of EQUIP_SLOTS) {
        const id = eq[slot];
        if (id === null) continue;
        c.test(
          `equipment.equipped.${slot}`,
          isItemId(id) && ITEM_SLOTS[id] === slot && ownedIds.has(id),
          'przedmiot nieposiadany lub z innego slotu',
        );
      }
    }
  }

  if (c.arr('history', s.history, L.history)) {
    s.history.forEach((a, i) => {
      const q = `history[${i}]`;
      if (!c.obj(q, a, ['f', 'c', 'ok', 'to', 'ms', 'h', 'md', 'ek', 't'])) return;
      c.test(`${q}.f`, a.f === null || isFactId(a.f), 'zły fakt');
      c.test(`${q}.c`, isCategoryId(a.c), 'zła kategoria');
      c.bool(`${q}.ok`, a.ok);
      c.bool(`${q}.to`, a.to);
      c.num(`${q}.ms`, a.ms, 0);
      c.bool(`${q}.h`, a.h);
      c.oneOf(`${q}.md`, a.md, ATTEMPT_MODES);
      c.test(`${q}.ek`, a.ek === null || isDistractorKind(a.ek), 'zły rodzaj błędu');
      c.num(`${q}.t`, a.t, 0);
    });
  }

  if (c.arr('sessions', s.sessions, L.sessions)) {
    s.sessions.forEach((x, i) => {
      const q = `sessions[${i}]`;
      if (!c.obj(q, x, ['start', 'end', 'tasks', 'correct'])) return;
      if (c.num(`${q}.start`, x.start, 0)) c.num(`${q}.end`, x.end, x.start as number);
      if (c.int(`${q}.tasks`, x.tasks)) c.int(`${q}.correct`, x.correct, 0, x.tasks as number);
    });
  }
  return c.problems;
}

/** Czy wartość jest poprawnym SaveV1. */
export function isValidSave(raw: unknown): boolean {
  return validateSave(raw).length === 0;
}
