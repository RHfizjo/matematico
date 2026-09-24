/**
 * Dobór zadania (GDD 6.4, 5.4, 7.3–7.4): koszyki z regulatorem, bezpiecznik frustracji,
 * powtórki po błędzie, zakaz natychmiastowych powtórek i przeplatanie kategorii.
 */
import type { Rng } from '../rng';
import type {
  Bucket,
  CategoryId,
  FactId,
  NumberRange,
  ParentSettings,
  QteResult,
  SkillModel,
  Task,
  TaskRequest,
} from '../types';
import { CATEGORIES, generateTask, isCategoryAvailable } from '../math';
import {
  RETRY_DONE,
  WINDOW_SIZE,
  bucketOf,
  categoryBucket,
  isPendingRetry,
  categoryFacts,
  categoryMastery,
  factCategories,
  factMastery,
  medianMs,
  overdue,
  safePartner,
} from './model';
import { isKnownCategory } from './priors';

// ───────────── Stałe ─────────────

/** Domyślne udziały koszyków (GDD 6.4). */
export const DEFAULT_QUOTAS: Readonly<Record<Bucket, number>> = { progress: 0.4, weak: 0.25, mastered: 0.25, new: 0.1 };
/** Przesunięcie regulatora (15 pp). */
export const REGULATOR_SHIFT = 0.15;
/** Regulator działa od tylu wyników w oknie. */
export const REGULATOR_MIN_WINDOW = 4;
/** Maks. 1 NOWE na tyle zadań. */
export const NEW_EVERY = 5;
/** Liczba ostatnich zadań, których fakty (i partnerzy przemienni) są wykluczone. */
export const NO_REPEAT_LAST = 3;
/** Seria błędów uruchamiająca bezpiecznik frustracji. */
export const FRUSTRATION_STREAK = 2;
/**
 * Waga kategorii proceduralnej względem jednego faktu (pseudo-kandydat reprezentuje
 * nieskończoną rodzinę zadań — bez mnożnika ginąłby wśród dziesiątek faktów).
 */
export const PROCEDURAL_WEIGHT = 10;
/**
 * Rozruch: gdy znanych (nie-nowych) kandydatów jest mniej niż tyle, NOWE są dozwolone
 * bez limitu 1/5 i z udziałem co najmniej STARTUP_NEW_QUOTA (inaczej dziecko krąży w kilku faktach).
 */
export const STARTUP_MIN_SEEN = 8;
export const STARTUP_NEW_QUOTA = 0.5;
/** Limit łagodny: min. 8 s; bez mediany 8 s (+ −) lub 10 s (× :). */
export const GENTLE_MIN_MS = 8000;
export const GENTLE_DEFAULT_MS_MULDIV = 10000;

const BUCKETS: readonly Bucket[] = ['progress', 'weak', 'mastered', 'new'];

/** Kolejność zastępcza, gdy wymuszony koszyk jest pusty. */
const FALLBACK_ORDER: Readonly<Record<Bucket, readonly Bucket[]>> = {
  mastered: ['mastered', 'progress', 'weak', 'new'],
  progress: ['progress', 'mastered', 'weak', 'new'],
  weak: ['weak', 'progress', 'mastered', 'new'],
  new: ['new', 'progress', 'weak', 'mastered'],
};

// ───────────── Regulator ─────────────

function shiftQuota(q: Record<Bucket, number>, from: readonly Bucket[], to: readonly Bucket[], amount: number): void {
  let fromSum = 0;
  for (const b of from) fromSum += q[b];
  let toSum = 0;
  for (const b of to) toSum += q[b];
  const amt = Math.min(amount, fromSum);
  if (amt <= 0) return;
  for (const b of from) q[b] -= (amt * q[b]) / fromSum;
  for (const b of to) q[b] += toSum > 0 ? (amt * q[b]) / toSum : amt / to.length;
}

/** Skuteczność w oknie regulatora (null, gdy mniej niż 4 wyniki). */
export function windowAccuracy(model: SkillModel): number | null {
  const w = model.window.slice(-WINDOW_SIZE);
  if (w.length < REGULATOR_MIN_WINDOW) return null;
  return w.filter((x) => x).length / w.length;
}

/**
 * Udziały koszyków po regulatorze (GDD 6.4): skuteczność < 60% → +15 pp do OPANOWANYCH
 * kosztem SŁABYCH i NOWYCH (proporcjonalnie); > 90% → +15 pp do SŁABYCH i NOWYCH
 * kosztem OPANOWANYCH i W TOKU. Suma zawsze 1.
 */
export function regulatedQuotas(model: SkillModel): Record<Bucket, number> {
  const q: Record<Bucket, number> = { ...DEFAULT_QUOTAS };
  const acc = windowAccuracy(model);
  if (acc === null) return q;
  if (acc < 0.6) shiftQuota(q, ['weak', 'new'], ['mastered'], REGULATOR_SHIFT);
  else if (acc > 0.9) shiftQuota(q, ['mastered', 'progress'], ['weak', 'new'], REGULATOR_SHIFT);
  return q;
}

// ───────────── Kandydaci ─────────────

interface Candidate {
  factId: FactId | null;
  /** Kategorie z puli (dostępne), do których należy kandydat. */
  poolCats: CategoryId[];
  /** Wszystkie kategorie kandydata (do przeplatania). */
  allCats: readonly CategoryId[];
  bucket: Bucket;
  m: number;
  overdue: number;
  procedural: boolean;
}

function buildCandidates(model: SkillModel, cats: readonly CategoryId[], settings: ParentSettings, now: number): Candidate[] {
  const byFact = new Map<FactId, Candidate>();
  const out: Candidate[] = [];
  for (const c of cats) {
    const facts = categoryFacts(c, settings);
    if (facts === null) {
      out.push({
        factId: null,
        poolCats: [c],
        allCats: [c],
        bucket: categoryBucket(model, c),
        m: categoryMastery(model, c, settings),
        overdue: 0,
        procedural: true,
      });
      continue;
    }
    for (const f of facts) {
      const known = byFact.get(f);
      if (known !== undefined) {
        known.poolCats.push(c);
        continue;
      }
      const cand: Candidate = {
        factId: f,
        poolCats: [c],
        allCats: factCategories(f),
        bucket: bucketOf(model, f),
        m: factMastery(model, f),
        overdue: overdue(model, f, now),
        procedural: false,
      };
      byFact.set(f, cand);
      out.push(cand);
    }
  }
  return out;
}

/** Kategorie wpisu z historii ostatnich zadań. */
function entryCats(e: SkillModel['recent'][number]): CategoryId[] {
  const out = e.factId !== null ? [...factCategories(e.factId)] : [];
  if (!out.includes(e.categoryId)) out.push(e.categoryId);
  return out;
}

/** Fakty z n ostatnich zadań wraz z partnerami przemiennymi. */
function recentFacts(model: SkillModel, n: number): Set<FactId> {
  const out = new Set<FactId>();
  for (const e of model.recent.slice(-n)) {
    if (e.factId === null) continue;
    out.add(e.factId);
    const p = safePartner(e.factId);
    if (p !== null) out.add(p);
  }
  return out;
}

/** Kategorie wspólne dla 2 ostatnich zadań (trzecie z rzędu jest zabronione). */
function blockedCategories(model: SkillModel): Set<CategoryId> {
  const last = model.recent[model.recent.length - 1];
  const prev = model.recent[model.recent.length - 2];
  const out = new Set<CategoryId>();
  if (last === undefined || prev === undefined) return out;
  const a = entryCats(prev);
  for (const c of entryCats(last)) if (a.includes(c)) out.add(c);
  return out;
}

/**
 * Poziomy filtrów od najostrzejszego: (0) bez faktów z 3 ostatnich zadań i bez kategorii
 * powtórzonej 2× pod rząd; (1) bez przeplatania; (2) tylko bez ostatniego faktu; (3) wszystko.
 */
function filterLevels(model: SkillModel, cands: readonly Candidate[], blocked: Set<CategoryId>): Candidate[][] {
  const last3 = recentFacts(model, NO_REPEAT_LAST);
  const last1 = recentFacts(model, 1);
  const notRecent = (c: Candidate): boolean => c.factId === null || !last3.has(c.factId);
  const interleaved = (c: Candidate): boolean => !c.allCats.some((x) => blocked.has(x));
  return [
    cands.filter((c) => notRecent(c) && interleaved(c)),
    cands.filter(notRecent),
    cands.filter((c) => c.factId === null || !last1.has(c.factId)),
    [...cands],
  ];
}

/**
 * Czy w ostatnich 4 zadaniach było NOWE (pierwsza próba faktu/kategorii proceduralnej).
 * Wpis jest pierwszą próbą, gdy n = liczba prób od tego wpisu (także po powtórce po błędzie, gdy n = 2).
 */
function recentlyNew(model: SkillModel): boolean {
  const last = model.recent.slice(-(NEW_EVERY - 1));
  for (let i = 0; i < last.length; i++) {
    const e = last[i] as SkillModel['recent'][number];
    let since = 0;
    for (let j = i; j < last.length; j++) {
      const x = last[j] as SkillModel['recent'][number];
      if (x.factId === e.factId && (e.factId !== null || x.categoryId === e.categoryId)) since++;
    }
    const n = e.factId !== null ? model.facts[e.factId]?.n : model.categories[e.categoryId]?.n;
    if (n === since) return true;
  }
  return false;
}

function weightOf(c: Candidate, easy: boolean): number {
  // Bezpiecznik: preferuj najłatwiejsze; normalnie wzór GDD 6.4.
  const w = easy ? c.m + 0.05 : 1.0 * (1 - c.m) + 0.5 * c.overdue + 0.1;
  return c.procedural ? w * PROCEDURAL_WEIGHT : w;
}

function pickWeighted(list: readonly Candidate[], rng: Rng, easy: boolean): Candidate {
  const weights = list.map((c) => {
    const w = weightOf(c, easy);
    return Number.isNaN(w) ? 1e-6 : Math.max(1e-6, w);
  });
  return list[rng.weightedIndex(weights)] as Candidate;
}

function sampleBucket(model: SkillModel, list: readonly Candidate[], rng: Rng): Bucket {
  const q = regulatedQuotas(model);
  const present = BUCKETS.filter((b) => list.some((c) => c.bucket === b));
  const seen = list.filter((c) => c.bucket !== 'new').length;
  if (seen < STARTUP_MIN_SEEN) q.new = Math.max(q.new, STARTUP_NEW_QUOTA);
  else if (recentlyNew(model)) q.new = 0;
  let weights = present.map((b) => q[b]);
  if (!weights.some((w) => w > 0)) weights = present.map(() => 1);
  return present[rng.weightedIndex(weights)] as Bucket;
}

function chooseCategory(c: Candidate, blocked: Set<CategoryId>, rng: Rng, prefer?: CategoryId): CategoryId {
  if (prefer !== undefined && c.poolCats.includes(prefer)) return prefer;
  const free = c.poolCats.filter((x) => !blocked.has(x));
  return rng.pick(free.length > 0 ? free : c.poolCats);
}

/** Zadanie z pierwszej kategorii, gdy żadna nie jest dostępna przy ustawieniach (awaryjnie). */
function fallbackTask(c: CategoryId, req: TaskRequest, rng: Rng, id: string): Task {
  const def = CATEGORIES[c];
  const range = Math.max(req.settings.range, def.minRange) as NumberRange;
  const settings: ParentSettings = { ...req.settings, range, ops: { ...req.settings.ops, [def.op]: true } };
  return generateTask({ categoryId: c, factId: null, rng, settings, format: req.format, optionsCount: req.optionsCount ?? 4, id });
}

// ───────────── Dobór zadania ─────────────

/**
 * Wybiera następne zadanie (GDD 6.4). Zwiększa model.taskCounter (id = "t" + licznik).
 * Kolejność: (1) req.forceBucket albo bezpiecznik frustracji (≥ 2 błędy z rzędu → OPANOWANE,
 * najłatwiejsze; puste → W TOKU → SŁABE → NOWE; bezpiecznik nie łamie zakazu powtórek, póki są inni
 * kandydaci); (2) zaległa powtórka po błędzie z tej sesji, której fakt jest w puli i nie był
 * w poprzednim zadaniu (fakt pokazany wcześniej = powtórka podana); (3) losowanie koszyka wg udziałów
 * po regulatorze (max 1 NOWE na 5 zadań), potem losowanie ważone 1.0·(1 − m) + 0.5·zaległość + 0.1.
 * Kandydaci bez faktów z 3 ostatnich zadań i bez kategorii 2× pod rząd (w razie braku — łagodzenie).
 * Nie zapisuje próby (wywołujący woła recordAttempt). Rzuca wyjątek tylko dla pustej puli.
 */
export function pickTask(model: SkillModel, req: TaskRequest, rng: Rng, now: number): Task {
  const pool: CategoryId[] = [];
  for (const c of req.categories) if (isKnownCategory(c) && !pool.includes(c)) pool.push(c);
  const first = pool[0];
  if (first === undefined) throw new Error('pickTask: pula kategorii jest pusta');

  model.taskCounter += 1;
  const counter = model.taskCounter;
  const id = `t${counter}`;
  const { settings } = req;
  const available = pool.filter((c) => {
    if (!isCategoryAvailable(c, settings)) return false;
    const facts = categoryFacts(c, settings);
    return facts === null || facts.length > 0;
  });
  if (available.length === 0) return fallbackTask(first, req, rng, id);

  const cands = buildCandidates(model, available, settings, now);
  const blocked = blockedCategories(model);
  const make = (c: Candidate, categoryId: CategoryId): Task => {
    if (c.factId !== null) {
      // Fakt wrócił — powtórka z tej sesji uznana za podaną, także gdy wrócił przed terminem
      // (łagodzenie reguł); inaczej powtórka pokazałaby go drugi raz, np. zaraz po sobie.
      for (const r of model.retries) {
        if (r.factId === c.factId && r.session === model.session && isPendingRetry(r)) r.dueAtTask = RETRY_DONE;
      }
    }
    return generateTask({
      categoryId,
      factId: c.factId,
      rng,
      settings,
      format: req.format,
      optionsCount: req.optionsCount ?? 4,
      id,
    });
  };

  const forced: Bucket | null = req.forceBucket ?? (model.errorStreak >= FRUSTRATION_STREAK ? 'mastered' : null);
  const easy = req.forceBucket === undefined && forced !== null;

  if (forced === null) {
    // Powtórka po błędzie (poza regułami „nie powtarzaj” i przeplatania).
    const due = model.retries
      .filter((r) => r.session === model.session && isPendingRetry(r) && r.dueAtTask <= counter)
      .sort((x, y) => x.dueAtTask - y.dueAtTask);
    // Nigdy dwa razy pod rząd (ten sam fakt lub partner przemienny) — wtedy powtórka czeka.
    const justShown = recentFacts(model, 1);
    for (const r of due) {
      if (justShown.has(r.factId)) continue;
      const c = cands.find((x) => x.factId === r.factId);
      if (c !== undefined) return make(c, chooseCategory(c, new Set(), rng, r.categoryId));
    }
  }

  const levels = filterLevels(model, cands, blocked);
  if (forced !== null) {
    // Wymuszony koszyk (req.forceBucket) ważniejszy niż wszystkie filtry. Bezpiecznik: koszyk ważniejszy
    // niż przeplatanie (raczej opanowany fakt bez przeplatania), ale nie niż zakaz powtórek z 3 ostatnich
    // zadań (poziomy 0–1) — inaczej krążyłby po świeżo pomylonych faktach, choć są inne.
    const groups = easy ? [levels.slice(0, 2), levels.slice(2)] : [levels];
    for (const group of groups) {
      for (const b of FALLBACK_ORDER[forced]) {
        for (const level of group) {
          const list = level.filter((c) => c.bucket === b);
          if (list.length > 0) {
            const c = pickWeighted(list, rng, easy);
            return make(c, chooseCategory(c, blocked, rng));
          }
        }
      }
    }
  }
  for (const level of levels) {
    if (level.length === 0) continue;
    const bucket = sampleBucket(model, level, rng);
    const c = pickWeighted(
      level.filter((x) => x.bucket === bucket),
      rng,
      false,
    );
    return make(c, chooseCategory(c, blocked, rng));
  }
  // Nieosiągalne (ostatni poziom = wszyscy kandydaci, niepusty), ale bez wyjątku.
  return fallbackTask(first, req, rng, id);
}

// ───────────── Limit czasu i wynik QTE (GDD 7.3–7.4) ─────────────

/**
 * Limit czasu w ms: 'none' → null; 'gentle' → max(8 s, 2.5 × mediana kategorii)
 * (bez mediany 8 s, dla × i : 10 s); 'fixed' → fixedSec[op]. extraSec (sprzęt) dodawane, gdy limit jest.
 */
export function timeLimitMs(model: SkillModel, task: Task, settings: ParentSettings, extraSec = 0): number | null {
  const extra = Number.isFinite(extraSec) ? Math.max(0, extraSec) * 1000 : 0;
  switch (settings.timeLimit.mode) {
    case 'none':
      return null;
    case 'gentle': {
      const med = medianMs(model, task.categoryId);
      const base =
        med === null
          ? task.op === 'mul' || task.op === 'div'
            ? GENTLE_DEFAULT_MS_MULDIV
            : GENTLE_MIN_MS
          : Math.max(GENTLE_MIN_MS, Math.round(2.5 * med));
      return base + extra;
    }
    case 'fixed':
      return settings.timeLimit.fixedSec[task.op] * 1000 + extra;
    default:
      return null;
  }
}

/**
 * Klasyfikacja odpowiedzi (GDD 7.3). Wołać PRZED recordAttempt (mediana sprzed próby).
 * timeout → wrong → retryCorrect (z pomocą) → late (po limicie) → fast (szybciej niż mediana) → correct.
 */
export function classifyResult(
  model: SkillModel,
  task: Task,
  input: { correct: boolean; timedOut: boolean; ms: number; helped: boolean; limitMs: number | null },
): QteResult {
  if (input.timedOut) return 'timeout';
  if (!input.correct) return 'wrong';
  if (input.helped) return 'retryCorrect';
  if (input.limitMs !== null && input.ms > input.limitMs) return 'late';
  const med = medianMs(model, task.categoryId);
  if (med !== null && Number.isFinite(input.ms) && input.ms > 0 && input.ms < med) return 'fast';
  return 'correct';
}
