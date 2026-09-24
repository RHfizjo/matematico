/**
 * Wczytywanie zapisu: łańcuch migracji (legacy → v1), głęboka walidacja i naprawa (GDD 19, 21).
 * Zasada: nieznane pola są pomijane, brakujące uzupełniane domyślnymi, złe wartości przycinane.
 * SaveError tylko dla wejścia nie do uratowania (nie obiekt, nowsza/nieznana wersja, zły JSON).
 */
import type {
  AttemptLog,
  CategoryId,
  CategoryState,
  Digits,
  EquipSlot,
  FactId,
  FactState,
  GlamEntry,
  LandId,
  LandProgress,
  Op,
  OwnedCreature,
  OwnedItem,
  ParentSettings,
  SaveV1,
  SessionLog,
  SkillModel,
} from '../types';
import {
  defaultDungeon,
  defaultLandProgress,
  defaultSettings,
  starterDigits,
  starterEquipment,
} from './defaults';
import {
  BREAK_REMINDERS,
  COMBAT_OPS,
  EQUIP_SLOTS,
  ITEM_SLOTS,
  LAND_IDS,
  NUMBER_RANGES,
  OPS,
  QUALITY_PRESETS,
  STARTER_CREATURE,
  STARTER_EQUIPPED,
  TIME_LIMIT_MODES,
  isAttemptMode,
  isCategoryId,
  isCreatureId,
  isDistractorKind,
  isEnemyId,
  isFactId,
  isFactInCategory,
  isItemId,
} from './ids';
import { SAVE_LIMITS as L } from './limits';
import { DEFAULT_PROFILE, SAVE_VERSION } from './save';

// ───────────────────────────── Błąd ─────────────────────────────

export type SaveErrorCode = 'notObject' | 'notSave' | 'newerVersion' | 'unknownVersion' | 'badJson' | 'corrupt';

/** Zapis nie do wczytania; `message` po polsku, gotowy do pokazania rodzicowi. */
export class SaveError extends Error {
  readonly code: SaveErrorCode;
  constructor(message: string, code: SaveErrorCode = 'corrupt', options?: ErrorOptions) {
    super(message, options);
    this.name = 'SaveError';
    this.code = code;
  }
}

// ───────────────────────────── Pomocnicze ─────────────────────────────

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Własne pole obiektu (bez dziedziczonych). */
function own(o: unknown, k: string): unknown {
  return isObj(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

/** Własne pary klucz–wartość; pomija `__proto__` (ochrona prototypu). */
function ownEntries(o: unknown): [string, unknown][] {
  if (!isObj(o)) return [];
  return Object.keys(o)
    .filter((k) => k !== '__proto__')
    .map((k) => [k, o[k]]);
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function takeLast<T>(xs: T[], n: number): T[] {
  return xs.length > n ? xs.slice(xs.length - n) : xs;
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Usuwa −0 (JSON zamienia je na 0). */
function z(x: number): number {
  return x === 0 ? 0 : x;
}

/** Liczba skończona przycięta do [min, max]; inaczej `def`. */
function num(v: unknown, def: number, min = -Infinity, max = Infinity): number {
  return isNum(v) ? z(Math.min(max, Math.max(min, v))) : def;
}

/** Liczba całkowita (podłoga) w [min, max]; inaczej `def`. */
function int(v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return isNum(v) ? z(Math.min(max, Math.max(min, Math.floor(v)))) : def;
}

/** Znacznik czasu ≥ 0. */
function time(v: unknown, def: number): number {
  return num(v, def, 0);
}

/** Wartość z listy (zwracamy element listy, więc −0 staje się 0). */
function oneOf<T>(v: unknown, allowed: readonly T[], def: T): T {
  for (const a of allowed) if (a === v) return a;
  return def;
}

function idStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= L.idMaxLength ? v : null;
}

// ───────────────────────────── Migracje ─────────────────────────────

/** Klucze, po których rozpoznajemy zapis sprzed v1. */
const LEGACY_KEYS = ['profile', 'settings', 'model', 'inventory', 'creatures', 'equipment', 'progress', 'history'];

/** Lista par [klucz, wartość] (serializowana Map) → obiekt. */
function entriesToObj(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  const out: Obj = {};
  for (const e of v) {
    if (Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && e[0] !== '__proto__') out[e[0]] = e[1];
  }
  return out;
}

/** Wpis historii w długim formacie (GDD 19: factId, ok, ms, helped, mode, t) → AttemptLog. */
function legacyAttempt(v: unknown): unknown {
  if (!isObj(v) || own(v, 'c') !== undefined) return v;
  return {
    f: own(v, 'factId') ?? null,
    c: own(v, 'categoryId'),
    ok: own(v, 'ok') ?? own(v, 'correct'),
    to: own(v, 'timedOut') ?? false,
    ms: own(v, 'ms'),
    h: own(v, 'helped') ?? false,
    md: own(v, 'mode'),
    ek: own(v, 'errorKind') ?? null,
    t: own(v, 't') ?? own(v, 'at'),
  };
}

/** Zapis sprzed v1 (bez pola `version`) → kształt v1 (best effort; resztę naprawia normalizacja). */
function migrateLegacy(o: Obj): Obj {
  if (!LEGACY_KEYS.some((k) => own(o, k) !== undefined)) {
    throw new SaveError('To nie jest zapis gry Matematico.', 'notSave');
  }
  const out: Obj = { ...o, version: 1 };

  const profile = own(o, 'profile');
  if (isObj(profile) && own(profile, 'color') === undefined) {
    const av = own(profile, 'avatarColors');
    out.profile = { ...profile, color: Array.isArray(av) ? av[0] : av };
  }

  const settings = own(o, 'settings');
  if (isObj(settings) && own(settings, 'breakReminderMin') === undefined) {
    out.settings = { ...settings, breakReminderMin: own(settings, 'breakReminder') };
  }

  const model = own(o, 'model');
  if (isObj(model)) {
    out.model = { ...model, facts: entriesToObj(own(model, 'facts')), categories: entriesToObj(own(model, 'categories')) };
  }

  const history = own(o, 'history');
  if (Array.isArray(history)) out.history = history.map(legacyAttempt);

  // Gracz, który już grał, nie przechodzi ponownie kalibracji ani samouczka.
  const played = list(history).length > 0 || ownEntries(own(out.model, 'facts')).length > 0;
  const progress = own(o, 'progress');
  if (played) {
    const p = isObj(progress) ? progress : {};
    out.progress = {
      ...p,
      calibrated: own(p, 'calibrated') ?? true,
      firstExpeditionDone: own(p, 'firstExpeditionDone') ?? true,
    };
  }
  return out;
}

/** MIGRATIONS[v] przenosi zapis z wersji v do v+1. */
const MIGRATIONS: readonly ((o: Obj) => Obj)[] = [migrateLegacy];

function readVersion(o: Obj): number {
  const v = own(o, 'version');
  if (v === undefined || v === 0) return 0;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) {
    if (v > SAVE_VERSION) {
      throw new SaveError('Zapis pochodzi z nowszej wersji gry. Zaktualizuj grę i spróbuj ponownie.', 'newerVersion');
    }
    return v;
  }
  throw new SaveError('Nieznana wersja zapisu.', 'unknownVersion');
}

// ───────────────────────────── Normalizacja v1 ─────────────────────────────

/** Przycina imię do limitu, nie rozcinając pary surogatów (emoji). */
function cutName(raw: string): string {
  let s = raw.trim().slice(0, L.nameMaxLength);
  const last = s.charCodeAt(s.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1);
  return s.trim();
}

function normProfile(v: unknown): SaveV1['profile'] {
  const rawName = own(v, 'name');
  const name = typeof rawName === 'string' ? cutName(rawName) : '';
  const rawColor = own(v, 'color');
  const color =
    typeof rawColor === 'string' && /^#(?:[0-9a-f]{3}){1,2}$/i.test(rawColor) ? rawColor : DEFAULT_PROFILE.color;
  return { name: name || DEFAULT_PROFILE.name, color };
}

function normSettings(v: unknown): ParentSettings {
  const d = defaultSettings();
  const opsRaw = own(v, 'ops');
  const ops = {} as Record<Op, boolean>;
  for (const op of OPS) ops[op] = bool(own(opsRaw, op), d.ops[op]);
  // Bez żadnego działania nie da się losować zadań.
  if (!OPS.some((op) => ops[op])) ops.add = true;

  const tl = own(v, 'timeLimit');
  const fsRaw = own(tl, 'fixedSec');
  const fixedSec = {} as Record<Op, number>;
  for (const op of OPS) fixedSec[op] = num(own(fsRaw, op), d.timeLimit.fixedSec[op], L.fixedSecMin, L.fixedSecMax);

  const audio = own(v, 'audio');
  return {
    range: oneOf(own(v, 'range'), NUMBER_RANGES, d.range),
    ops,
    combatOps: oneOf(own(v, 'combatOps'), COMBAT_OPS, d.combatOps),
    crossTenOnMeadow: bool(own(v, 'crossTenOnMeadow'), d.crossTenOnMeadow),
    timeLimit: { mode: oneOf(own(tl, 'mode'), TIME_LIMIT_MODES, d.timeLimit.mode), fixedSec },
    breakReminderMin: oneOf(own(v, 'breakReminderMin'), BREAK_REMINDERS, d.breakReminderMin),
    quality: oneOf(own(v, 'quality'), QUALITY_PRESETS, d.quality),
    audio: { music: num(own(audio, 'music'), d.audio.music, 0, 1), sfx: num(own(audio, 'sfx'), d.audio.sfx, 0, 1) },
    showFps: bool(own(v, 'showFps'), d.showFps),
  };
}

function normFact(v: unknown): FactState | null {
  if (!isObj(v)) return null;
  const n = int(own(v, 'n'), 0);
  const lt = own(v, 'lt');
  return {
    m: num(own(v, 'm'), 0.5, 0, 1),
    lt: isNum(lt) ? z(lt) : null,
    n,
    nOk: int(own(v, 'nOk'), 0, 0, n),
    box: int(own(v, 'box'), 0, 0, L.boxMax),
    lastSeenAt: time(own(v, 'lastSeenAt'), 0),
    lastSeenSession: int(own(v, 'lastSeenSession'), 0),
    helped: int(own(v, 'helped'), 0, 0, n),
    last2: takeLast(list(own(v, 'last2')).filter((b): b is boolean => typeof b === 'boolean'), L.last2),
  };
}

function normCategory(v: unknown): CategoryState | null {
  if (!isObj(v)) return null;
  const n = int(own(v, 'n'), 0);
  return {
    recentMs: takeLast(
      list(own(v, 'recentMs'))
        .filter(isNum)
        .map((x) => z(Math.max(0, x))),
      L.recentMs,
    ),
    n,
    nOk: int(own(v, 'nOk'), 0, 0, n),
    m: num(own(v, 'm'), 0.5, 0, 1),
    prior: num(own(v, 'prior'), 0.5, 0, 1),
  };
}

function normModel(v: unknown): SkillModel {
  const facts: Record<FactId, FactState> = {};
  for (const [k, fv] of ownEntries(own(v, 'facts'))) {
    if (!isFactId(k)) continue;
    const f = normFact(fv);
    if (f) facts[k] = f;
  }
  const categories: Partial<Record<CategoryId, CategoryState>> = {};
  for (const [k, cv] of ownEntries(own(v, 'categories'))) {
    if (!isCategoryId(k)) continue;
    const c = normCategory(cv);
    if (c) categories[k] = c;
  }
  const recent: SkillModel['recent'] = [];
  for (const r of list(own(v, 'recent'))) {
    const categoryId = own(r, 'categoryId');
    if (!isCategoryId(categoryId)) continue;
    const factId = own(r, 'factId');
    recent.push({ factId: isFactId(factId) ? factId : null, categoryId });
  }
  const retries: SkillModel['retries'] = [];
  for (const r of list(own(v, 'retries'))) {
    const factId = own(r, 'factId');
    const categoryId = own(r, 'categoryId');
    // Fakt musi należeć do kategorii — inaczej generateTask rzuci wyjątek.
    if (!isFactId(factId) || !isCategoryId(categoryId) || !isFactInCategory(factId, categoryId)) continue;
    retries.push({ factId, categoryId, dueAtTask: int(own(r, 'dueAtTask'), 0), session: int(own(r, 'session'), 0) });
  }
  return {
    facts,
    categories,
    session: int(own(v, 'session'), 0),
    taskCounter: int(own(v, 'taskCounter'), 0),
    window: takeLast(list(own(v, 'window')).filter((b): b is boolean => typeof b === 'boolean'), L.window),
    recent: takeLast(recent, L.recent),
    retries: takeLast(retries, L.retries),
    errorStreak: int(own(v, 'errorStreak'), 0),
  };
}

function normDigits(v: unknown): Digits {
  const raw = own(v, 'digits');
  if (!Array.isArray(raw)) return starterDigits();
  const out: Digits = [];
  for (let d = 0; d < 10; d++) out.push(int(raw[d], 0, 0, L.digitMax));
  return out;
}

function normCreatures(v: unknown, cycle: number, createdAt: number): OwnedCreature[] {
  if (!Array.isArray(v)) return [{ id: STARTER_CREATURE, level: 1, fedCycle: -1, caughtAt: createdAt }];
  const out: OwnedCreature[] = [];
  for (const c of v) {
    const id = own(c, 'id');
    if (!isCreatureId(id)) continue;
    const next: OwnedCreature = {
      id,
      level: int(own(c, 'level'), 1, 1, L.creatureMaxLevel),
      fedCycle: int(own(c, 'fedCycle'), -1, -1, cycle),
      caughtAt: time(own(c, 'caughtAt'), createdAt),
    };
    // Duplikat: scalamy (najwyższy poziom, najpóźniejsze karmienie, najwcześniejsze złapanie).
    const prev = out.find((x) => x.id === id);
    if (prev) {
      prev.level = Math.max(prev.level, next.level);
      prev.fedCycle = Math.max(prev.fedCycle, next.fedCycle);
      prev.caughtAt = Math.min(prev.caughtAt, next.caughtAt);
    } else out.push(next);
  }
  // Plusik jest prezentem na start (GDD 9.3) i nie da się go stracić.
  if (!out.some((c) => c.id === STARTER_CREATURE)) {
    out.unshift({ id: STARTER_CREATURE, level: 1, fedCycle: -1, caughtAt: createdAt });
  }
  return out;
}

function normEquipment(v: unknown): SaveV1['equipment'] {
  if (!isObj(v)) return starterEquipment();
  const ownedRaw = own(v, 'owned');
  const owned: OwnedItem[] = [];
  if (!Array.isArray(ownedRaw)) owned.push(...starterEquipment().owned);
  else {
    for (const it of ownedRaw) {
      const id = own(it, 'id');
      if (!isItemId(id)) continue;
      const level = int(own(it, 'level'), 1, 1, L.itemMaxLevel);
      const prev = owned.find((x) => x.id === id);
      if (prev) prev.level = Math.max(prev.level, level);
      else owned.push({ id, level });
    }
  }
  const eqRaw = own(v, 'equipped');
  const equipped = {} as Record<EquipSlot, string | null>;
  const fits = (id: unknown, slot: EquipSlot): id is string =>
    isItemId(id) && ITEM_SLOTS[id] === slot && owned.some((o) => o.id === id);
  for (const slot of EQUIP_SLOTS) {
    const e = own(eqRaw, slot);
    const starter = STARTER_EQUIPPED[slot];
    // Jawne null = zdjęty; zły/brakujący wpis → sprzęt startowy, jeśli posiadany.
    if (e === null) equipped[slot] = null;
    else if (fits(e, slot)) equipped[slot] = e;
    else equipped[slot] = fits(starter, slot) ? starter : null;
  }
  return { owned, equipped };
}

function normLand(v: unknown, id: LandId): LandProgress {
  const d = defaultLandProgress(id);
  return {
    // Łąka jest zawsze otwarta.
    unlocked: id === 'meadow' ? true : bool(own(v, 'unlocked'), d.unlocked),
    stage: int(own(v, 'stage'), d.stage, 1, L.maxStage),
    bossDefeated: bool(own(v, 'bossDefeated'), d.bossDefeated),
    gatesOpened: int(own(v, 'gatesOpened'), 0),
    dungeonRuns: int(own(v, 'dungeonRuns'), 0),
  };
}

function normDungeon(v: unknown): SaveV1['progress']['dungeon'] {
  if (!isObj(v)) return defaultDungeon();
  const roomOrder: string[] = [];
  for (const r of list(own(v, 'roomOrder'))) {
    const id = idStr(r);
    if (id !== null) roomOrder.push(id);
  }
  const enemyCzar: Record<string, number> = {};
  for (const [k, c] of ownEntries(own(v, 'enemyCzar'))) {
    if (idStr(k) !== null && isNum(c)) enemyCzar[k] = z(Math.max(0, c));
  }
  return {
    active: bool(own(v, 'active'), false),
    roomOrder,
    roomIndex: int(own(v, 'roomIndex'), 0, 0, roomOrder.length),
    enemyCzar,
    bossPhase: int(own(v, 'bossPhase'), 1, 1, L.bossPhaseMax),
  };
}

function normProgress(v: unknown, createdAt: number): SaveV1['progress'] {
  const landsRaw = own(v, 'lands');
  const lands = {} as Record<LandId, LandProgress>;
  for (const id of LAND_IDS) lands[id] = normLand(own(landsRaw, id), id);

  const glams: Record<string, GlamEntry> = {};
  for (const [k, g] of ownEntries(own(v, 'glams'))) {
    if (!isEnemyId(k) || !isObj(g)) continue;
    glams[k] = { enemyId: k, count: int(own(g, 'count'), 1, 1), firstAt: time(own(g, 'firstAt'), createdAt) };
  }

  // Set: liniowo także dla ogromnych (uszkodzonych) list.
  const chestSet = new Set<string>();
  for (const c of list(own(v, 'openedChests'))) {
    const id = idStr(c);
    if (id !== null) chestSet.add(id);
  }
  const openedChests = [...chestSet];

  return {
    cycle: int(own(v, 'cycle'), 0),
    taskSinceReturn: bool(own(v, 'taskSinceReturn'), false),
    calibrated: bool(own(v, 'calibrated'), false),
    firstExpeditionDone: bool(own(v, 'firstExpeditionDone'), false),
    lands,
    glams,
    openedChests,
    chestPity: int(own(v, 'chestPity'), 0),
    dungeon: normDungeon(own(v, 'dungeon')),
    pendingBonusChest: bool(own(v, 'pendingBonusChest'), false),
  };
}

function normAttempt(v: unknown): AttemptLog | null {
  const c = own(v, 'c');
  const ok = own(v, 'ok');
  const md = own(v, 'md');
  const ms = own(v, 'ms');
  const t = own(v, 't');
  if (!isCategoryId(c) || typeof ok !== 'boolean' || !isAttemptMode(md) || !isNum(ms) || !isNum(t)) return null;
  const f = own(v, 'f');
  const ek = own(v, 'ek');
  return {
    f: isFactId(f) ? f : null,
    c,
    ok,
    to: bool(own(v, 'to'), false),
    ms: z(Math.max(0, ms)),
    h: bool(own(v, 'h'), false),
    md,
    ek: isDistractorKind(ek) ? ek : null,
    t: z(Math.max(0, t)),
  };
}

function normSession(v: unknown): SessionLog | null {
  const start = own(v, 'start');
  if (!isNum(start)) return null;
  const s = z(Math.max(0, start));
  const tasks = int(own(v, 'tasks'), 0);
  return {
    start: s,
    end: num(own(v, 'end'), s, s),
    tasks,
    correct: int(own(v, 'correct'), 0, 0, tasks),
  };
}

function normalizeV1(o: Obj): SaveV1 {
  const createdAt = time(own(o, 'createdAt'), time(own(o, 'updatedAt'), 0));
  const updatedAt = time(own(o, 'updatedAt'), createdAt);
  const seedRaw = own(o, 'seed');
  const seed = isNum(seedRaw) ? Math.trunc(seedRaw) >>> 0 : Math.floor(createdAt) >>> 0;
  const progress = normProgress(own(o, 'progress'), createdAt);

  const history: AttemptLog[] = [];
  for (const a of list(own(o, 'history'))) {
    const x = normAttempt(a);
    if (x) history.push(x);
  }
  const sessions: SessionLog[] = [];
  for (const s of list(own(o, 'sessions'))) {
    const x = normSession(s);
    if (x) sessions.push(x);
  }

  return {
    version: SAVE_VERSION,
    createdAt,
    updatedAt,
    seed,
    profile: normProfile(own(o, 'profile')),
    settings: normSettings(own(o, 'settings')),
    model: normModel(own(o, 'model')),
    inventory: { digits: normDigits(own(o, 'inventory')) },
    creatures: normCreatures(own(o, 'creatures'), progress.cycle, createdAt),
    equipment: normEquipment(own(o, 'equipment')),
    progress,
    history: takeLast(history, L.history),
    sessions: takeLast(sessions, L.sessions),
  };
}

// ───────────────────────────── API ─────────────────────────────

function migrateUnchecked(raw: unknown): SaveV1 {
  if (!isObj(raw)) throw new SaveError('Zapis jest uszkodzony: to nie jest obiekt zapisu gry.', 'notObject');
  let o: Obj = raw;
  for (let v = readVersion(raw); v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError('Brak migracji dla tej wersji zapisu.', 'unknownVersion');
    o = step(o);
  }
  return normalizeV1(o);
}

/**
 * Dowolne dane → poprawny SaveV1 (nowy obiekt; wejście nie jest zmieniane).
 * Rzuca wyłącznie SaveError.
 */
export function migrateSave(raw: unknown): SaveV1 {
  try {
    return migrateUnchecked(raw);
  } catch (e) {
    if (e instanceof SaveError) throw e;
    // Bezpiecznik: nieprzewidziany wyjątek (np. getter rzucający błąd) jako SaveError.
    throw new SaveError('Zapis jest uszkodzony i nie da się go wczytać.', 'corrupt', { cause: e });
  }
}

/** Zapis → tekst JSON (do IndexedDB lub pliku kopii zapasowej). */
export function serializeSave(save: SaveV1): string {
  return JSON.stringify(save);
}

/** Tekst JSON → poprawny SaveV1 (parsowanie + migracja). */
export function deserializeSave(json: string): SaveV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(typeof json === 'string' ? json.replace(/^﻿/, '') : String(json));
  } catch (e) {
    throw new SaveError('Plik zapisu jest uszkodzony (to nie jest poprawny JSON).', 'badJson', { cause: e });
  }
  return migrateSave(raw);
}
