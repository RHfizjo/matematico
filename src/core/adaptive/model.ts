/**
 * Model ucznia (GDD 6.2–6.4): stan faktów i kategorii, wynik próby, aktualizacje,
 * koszyki i pudełka Leitnera. Wszystkie funkcje czyste poza jawną mutacją `model`.
 */
import type {
  Attempt,
  Bucket,
  CategoryDef,
  CategoryId,
  CategoryState,
  FactId,
  FactState,
  ParentSettings,
  SkillModel,
  TaskFormat,
} from '../types';
import { CATEGORIES, categoriesOfFact, commutativePartner, factsOf } from '../math';
import { DEFAULT_PRIORS, FALLBACK_PRIOR, isKnownCategory } from './priors';

// ───────────── Stałe ─────────────

/** Okno regulatora (ostatnie wyniki). */
export const WINDOW_SIZE = 8;
/** Pamięć ostatnich zadań (reguły „nie powtarzaj”). */
export const RECENT_SIZE = 6;
/** Liczba zapamiętanych czasów poprawnych odpowiedzi na kategorię. */
export const RECENT_MS_SIZE = 30;
/** Maks. liczba wpisów powtórek (zgodnie z limitem zapisu). */
export const RETRIES_MAX = 50;
/** Powtórka po błędzie: dueAtTask = taskCounter + 3 (czyli po 2 innych zadaniach). */
export const RETRY_DELAY_TASKS = 3;
/**
 * Znacznik powtórki już podanej w tej sesji (dueAtTask): „nigdy nie wypada”. Liczba całkowita ≥ 0,
 * bo zapis (validateSave, migracja) wymaga dueAtTask ≥ 0 — wartość ujemna wracałaby po wczytaniu jako 0.
 */
export const RETRY_DONE = Number.MAX_SAFE_INTEGER;
/** Najwyższe pudełko Leitnera. */
export const MAX_BOX = 5;
/** Awans pudełka tylko przy m ≥ tej wartości (GDD 6.4). */
export const BOX_PROMOTE_MIN_M = 0.6;
/** Minimalna liczba czasów do mediany. */
export const MEDIAN_MIN_SAMPLES = 3;
export const DAY_MS = 86_400_000;

// Interwały Leitnera w ms; pudełko 1 = „następna sesja” (0 ms + warunek sesji).
const LEITNER_MS: readonly number[] = [0, 0, DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS];

// ───────────── Pamięć podręczna (czyste funkcje z core/math) ─────────────

const CACHE_LIMIT = 5000;
const factCatsCache = new Map<FactId, readonly CategoryId[]>();
const catFactsCache = new Map<string, readonly FactId[] | null>();

/** Kategorie faktu (jak categoriesOfFact, z pamięcią podręczną); [] dla błędnego/obcego faktu. */
export function factCategories(f: FactId): readonly CategoryId[] {
  let v = factCatsCache.get(f);
  if (v === undefined) {
    if (factCatsCache.size >= CACHE_LIMIT) factCatsCache.clear();
    v = categoriesOfFact(f);
    factCatsCache.set(f, v);
  }
  return v;
}

/** Fakty kategorii przy ustawieniach (jak factsOf; zależy tylko od zakresu). null = proceduralna. */
export function categoryFacts(c: CategoryId, settings: ParentSettings): readonly FactId[] | null {
  const key = `${c}|${settings.range}`;
  let v = catFactsCache.get(key);
  if (v === undefined) {
    v = isKnownCategory(c) ? factsOf(c, settings) : null;
    catFactsCache.set(key, v);
  }
  return v;
}

/** Partner przemienny bez wyjątków (null dla błędnego identyfikatora). */
export function safePartner(f: FactId): FactId | null {
  try {
    return commutativePartner(f);
  } catch {
    return null;
  }
}

// ───────────── Pomocnicze ─────────────

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const clamp01 = (x: number): number => clamp(Number.isFinite(x) ? x : 0, 0, 1);

/** Czy czas odpowiedzi nadaje się do statystyk. */
export function isValidMs(ms: number): boolean {
  return Number.isFinite(ms) && ms > 0;
}

/** Tempo uczenia α (GDD 6.3): 0.5 dla pierwszych 3 prób, potem 0.35 (wpisywanie) / 0.25 (wybór). */
export function learningRate(nBefore: number, format: TaskFormat): number {
  if (nBefore < 3) return 0.5;
  return format === 'typed' ? 0.35 : 0.25;
}

// ───────────── Tworzenie ─────────────

/** Pusty model ucznia (ten sam kształt co emptySkillModel w module save). */
export function createSkillModel(): SkillModel {
  return { facts: {}, categories: {}, session: 0, taskCounter: 0, window: [], recent: [], retries: [], errorStreak: 0 };
}

/** Nowa sesja: numer sesji +1, stare powtórki (z poprzednich sesji) usuwane. */
export function startSession(model: SkillModel, _now: number): void {
  model.session += 1;
  model.retries = model.retries.filter((r) => r.session === model.session);
}

function newFactState(m: number): FactState {
  return { m, lt: null, n: 0, nOk: 0, box: 0, lastSeenAt: 0, lastSeenSession: 0, helped: 0, last2: [] };
}

function newCategoryState(c: CategoryId): CategoryState {
  const prior = DEFAULT_PRIORS[c];
  return { recentMs: [], n: 0, nOk: 0, m: prior, prior };
}

/** Stan kategorii (tworzony z wartościami domyślnymi, gdy brak). */
export function ensureCategory(model: SkillModel, c: CategoryId): CategoryState {
  let st = model.categories[c];
  if (st === undefined) {
    st = newCategoryState(c);
    model.categories[c] = st;
  }
  return st;
}

// ───────────── Priorytety i opanowanie ─────────────

/** Priorytet kategorii: z kalibracji (CategoryState.prior) albo DEFAULT_PRIORS. */
export function categoryPrior(model: SkillModel, c: CategoryId): number {
  const st = model.categories[c];
  if (st !== undefined) return st.prior;
  return isKnownCategory(c) ? DEFAULT_PRIORS[c] : FALLBACK_PRIOR;
}

/**
 * Kategoria faktu z największą liczbą dowodów: najpierw kategorie ze stanem (CategoryState — np. priorytet
 * z kalibracji), wśród nich największe n; remis → wcześniejsza w kolejności kategorii faktu.
 * Bez stanów (nowy model) → PIERWSZA kategoria faktu (np. mul:2x7 → mul.t2). undefined dla faktu bez kategorii.
 */
export function evidenceCategory(model: SkillModel, f: FactId): CategoryId | undefined {
  let best: CategoryId | undefined;
  let bestScore = -Infinity;
  for (const c of factCategories(f)) {
    const st = model.categories[c];
    // Stan bez prób (n = 0) wygrywa z brakiem stanu: np. priorytet ustawiony tylko przez propagację kalibracji.
    const n = st !== undefined && Number.isFinite(st.n) ? Math.max(0, st.n) : -1;
    if (n > bestScore) {
      best = c;
      bestScore = n;
    }
  }
  return best;
}

/**
 * Priorytet faktu bez prób: priorytet kategorii z największą liczbą dowodów (evidenceCategory);
 * dla nowego modelu — PIERWSZEJ kategorii faktu (mul:2x7 → mul.t2). Dzięki temu np. mul:8x2 po kalibracji
 * mul.t2 (2 × 8) bierze skalibrowany priorytet, a nie domyślny.
 */
export function factPrior(model: SkillModel, f: FactId): number {
  const c = evidenceCategory(model, f);
  return c === undefined ? FALLBACK_PRIOR : categoryPrior(model, c);
}

/** Opanowanie faktu: m ze stanu albo priorytet (factPrior), gdy fakt nie był widziany. */
export function factMastery(model: SkillModel, f: FactId): number {
  const st = model.facts[f];
  return st !== undefined ? st.m : factPrior(model, f);
}

/**
 * Opanowanie kategorii: dla faktowych średnia factMastery po factsOf(c, ustawienia),
 * dla proceduralnych m z prób (lub priorytet, gdy prób brak).
 */
export function categoryMastery(model: SkillModel, c: CategoryId, settings: ParentSettings): number {
  const def = CATEGORIES[c] as CategoryDef | undefined;
  if (def === undefined) return FALLBACK_PRIOR;
  if (def.factBased) {
    const list = categoryFacts(c, settings);
    if (list === null || list.length === 0) return categoryPrior(model, c);
    let sum = 0;
    for (const f of list) sum += factMastery(model, f);
    return sum / list.length;
  }
  const st = model.categories[c];
  return st !== undefined && st.n > 0 ? st.m : categoryPrior(model, c);
}

/** Mediana czasów poprawnych odpowiedzi w kategorii (osobista norma); null przy < 3 próbach. */
export function medianMs(model: SkillModel, c: CategoryId): number | null {
  const list = model.categories[c]?.recentMs;
  if (list === undefined || list.length < MEDIAN_MIN_SAMPLES) return null;
  const s = [...list].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

// ───────────── Wynik próby (GDD 6.3) ─────────────

/**
 * Wynik próby s ∈ [0,1]: błąd/brak odpowiedzi → 0; poprawnie z pomocą → 0.5;
 * poprawnie → 0.6 + 0.4·szybkość, szybkość = clamp((T_wolno − t)/(T_wolno − T_szybko), 0, 1),
 * T_szybko = 0.8·mediana, T_wolno = 2.5·mediana. Bez mediany (lub bez ważnego czasu) szybkość = 0.5.
 */
export function attemptScore(a: Attempt, median: number | null): number {
  if (a.timedOut || !a.correct) return 0;
  if (a.helped) return 0.5;
  let speed = 0.5;
  if (median !== null && Number.isFinite(median) && median > 0 && isValidMs(a.ms)) {
    const fast = 0.8 * median;
    const slow = 2.5 * median;
    speed = clamp((slow - a.ms) / (slow - fast), 0, 1);
  }
  return 0.6 + 0.4 * speed;
}

// ───────────── Leitner ─────────────

/** Interwał pudełka w ms: 0 → 0 (ta sama sesja), 1 → 0 (+ wymóg następnej sesji), 2 → 1 dzień, 3 → 3, 4 → 7, 5 → 14 dni. */
export function leitnerIntervalMs(box: number): number {
  const b = clamp(Math.round(Number.isFinite(box) ? box : 0), 0, MAX_BOX);
  return LEITNER_MS[b] as number;
}

function isDueState(st: FactState | undefined, session: number, now: number): boolean {
  if (st === undefined || st.n === 0 || st.box <= 0) return true;
  if (st.box === 1) return session > st.lastSeenSession;
  return now - st.lastSeenAt >= leitnerIntervalMs(st.box);
}

function overdueState(st: FactState | undefined, session: number, now: number): number {
  if (st === undefined || st.n === 0) return 0;
  // Pudełko 0: powtórka „w tej samej sesji” — zawsze zaległy (granica wzoru przy interwale → 0).
  if (st.box <= 0) return 2;
  if (st.box === 1) return clamp(session - st.lastSeenSession - 1, 0, 2);
  const interval = leitnerIntervalMs(st.box);
  const v = (now - st.lastSeenAt) / interval - 1;
  // Nieprawidłowy czas (NaN) — brak zaległości (wynik zawsze w [0,2]).
  return Number.isNaN(v) ? 0 : clamp(v, 0, 2);
}

/** Czy fakt jest „do powtórki” wg pudełka (nowy i pudełko 0 — zawsze). */
export function isDue(model: SkillModel, f: FactId, now: number): boolean {
  return isDueState(model.facts[f], model.session, now);
}

/**
 * Zaległość ∈ [0,2]: clamp((teraz − lastSeen)/interwał(box) − 1, 0, 2).
 * Pudełko 1 liczone w sesjach; pudełko 0 → 2; fakt niewidziany → 0.
 */
export function overdue(model: SkillModel, f: FactId, now: number): number {
  return overdueState(model.facts[f], model.session, now);
}

// ───────────── Koszyki (GDD 6.4) ─────────────

/** Koszyk faktu: NOWE (n = 0), OPANOWANE (m ≥ 0.8, n ≥ 4, 2 ostatnie poprawne), SŁABE (m < 0.5), W TOKU. */
export function bucketOf(model: SkillModel, f: FactId): Bucket {
  const st = model.facts[f];
  if (st === undefined || st.n === 0) return 'new';
  if (st.m >= 0.8 && st.n >= 4 && st.last2.length >= 2 && st.last2.every((x) => x)) return 'mastered';
  if (st.m < 0.5) return 'weak';
  return 'progress';
}

/** Koszyk kategorii proceduralnej (bez faktów): jak bucketOf, ale z m i n kategorii (bez warunku last2). */
export function categoryBucket(model: SkillModel, c: CategoryId): Bucket {
  const st = model.categories[c];
  if (st === undefined || st.n === 0) return 'new';
  if (st.m >= 0.8 && st.n >= 4) return 'mastered';
  if (st.m < 0.5) return 'weak';
  return 'progress';
}

// ───────────── Zapis próby ─────────────

/** Czy powtórka czeka na podanie (podane mają dueAtTask = RETRY_DONE). */
export function isPendingRetry(r: SkillModel['retries'][number]): boolean {
  return r.dueAtTask >= 0 && r.dueAtTask < RETRY_DONE;
}

function scheduleRetry(model: SkillModel, f: FactId, hint: CategoryId): void {
  const cats = factCategories(f);
  const categoryId = cats.includes(hint) ? hint : cats[0];
  if (categoryId === undefined) return;
  model.retries = model.retries.filter((r) => r.session === model.session);
  // Raz na fakt na sesję (także gdy powtórka została już podana).
  if (model.retries.some((r) => r.factId === f)) return;
  model.retries.push({ factId: f, categoryId, dueAtTask: model.taskCounter + RETRY_DELAY_TASKS, session: model.session });
  while (model.retries.length > RETRIES_MAX) {
    const done = model.retries.findIndex((r) => !isPendingRetry(r));
    model.retries.splice(done >= 0 ? done : 0, 1);
  }
}

/**
 * Zapisuje próbę w modelu (GDD 6.2–6.4, 5.4):
 * - fakt: m (EWMA wyniku), lt (EWMA ln ms poprawnych bez pomocy), n/nOk/helped, last2 (poprawnie BEZ pomocy),
 *   pudełko (błąd → −2; poprawnie bez pomocy, m ≥ 0.6 i fakt „do powtórki” → +1), lastSeen;
 *   partner przemienny: m z połową α;
 * - wszystkie kategorie próby: n, nOk, m (EWMA), recentMs (poprawne bez pomocy, max 30);
 * - okno regulatora, ostatnie zadania, seria błędów, powtórka po błędzie (raz na fakt w sesji).
 * Nieprawidłowy czas (≤ 0, NaN, ∞) — pomijany w statystykach czasu, poprawność liczona.
 * Wynik próby liczony z mediany kategorii głównej sprzed tej próby.
 */
export function recordAttempt(model: SkillModel, a: Attempt, now: number): void {
  const ok = a.correct && !a.timedOut;
  const clean = ok && !a.helped;
  const validMs = isValidMs(a.ms);
  const t = Number.isFinite(now) ? Math.max(0, now) : 0;
  const primary = isKnownCategory(a.categoryId) ? a.categoryId : null;
  const s = attemptScore(a, primary !== null ? medianMs(model, primary) : null);

  // Fakt
  const f = a.factId !== null && factCategories(a.factId).length > 0 ? a.factId : null;
  if (f !== null) {
    const st = model.facts[f] ?? newFactState(factPrior(model, f));
    const due = isDueState(st, model.session, t);
    const alpha = learningRate(st.n, a.format);
    st.m = clamp01(st.m + alpha * (s - st.m));
    if (clean && validMs) {
      const ln = Math.log(a.ms);
      st.lt = st.lt === null ? ln : st.lt + alpha * (ln - st.lt);
    }
    if (!ok) st.box = Math.max(0, st.box - 2);
    else if (clean && due && st.m >= BOX_PROMOTE_MIN_M) st.box = Math.min(MAX_BOX, st.box + 1);
    st.n += 1;
    if (ok) st.nOk += 1;
    if (a.helped) st.helped += 1;
    st.last2 = [...st.last2, clean].slice(-2);
    st.lastSeenAt = t;
    st.lastSeenSession = model.session;
    model.facts[f] = st;

    // Przemienność (GDD 5.1): partner z wagą 50%.
    const p = safePartner(f);
    if (p !== null && factCategories(p).length > 0) {
      const ps = model.facts[p] ?? newFactState(factPrior(model, p));
      ps.m = clamp01(ps.m + (alpha / 2) * (s - ps.m));
      model.facts[p] = ps;
    }
    if (!ok && primary !== null) scheduleRetry(model, f, primary);
  }

  // Kategorie
  const cats = new Set<CategoryId>();
  for (const c of a.categories) if (isKnownCategory(c)) cats.add(c);
  if (primary !== null) cats.add(primary);
  for (const c of cats) {
    const cs = ensureCategory(model, c);
    const alpha = learningRate(cs.n, a.format);
    cs.m = clamp01(cs.m + alpha * (s - cs.m));
    cs.n += 1;
    if (ok) cs.nOk += 1;
    if (clean && validMs) {
      cs.recentMs.push(a.ms);
      if (cs.recentMs.length > RECENT_MS_SIZE) cs.recentMs.splice(0, cs.recentMs.length - RECENT_MS_SIZE);
    }
  }

  // Okno, ostatnie zadania, seria błędów
  model.window.push(ok);
  if (model.window.length > WINDOW_SIZE) model.window.splice(0, model.window.length - WINDOW_SIZE);
  if (primary !== null) {
    model.recent.push({ factId: f, categoryId: primary });
    if (model.recent.length > RECENT_SIZE) model.recent.splice(0, model.recent.length - RECENT_SIZE);
  }
  model.errorStreak = ok ? 0 : model.errorStreak + 1;
}
