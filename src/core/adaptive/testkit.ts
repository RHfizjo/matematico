/**
 * Pomocnicze funkcje do testów modułu adaptive (bez zależności od vitest).
 */
import type { Rng } from '../rng';
import type { Attempt, CategoryId, ParentSettings, SkillModel, Task, TaskFormat } from '../types';
import { createRng } from '../rng';
import { DAY_MS, createSkillModel, recordAttempt, startSession } from './model';
import { pickTask } from './scheduler';

export const T0 = 1_700_000_000_000;

export function makeSettings(overrides: Partial<ParentSettings> = {}): ParentSettings {
  return {
    range: 20,
    ops: { add: true, sub: true, mul: true, div: true },
    combatOps: 'themed',
    crossTenOnMeadow: true,
    timeLimit: { mode: 'none', fixedSec: { add: 10, sub: 10, mul: 12, div: 12 } },
    breakReminderMin: 0,
    quality: 'auto',
    audio: { music: 0.5, sfx: 0.5 },
    showFps: false,
    ...overrides,
  };
}

/** Próba dla zadania / faktu (domyślnie poprawna, 3 s, wybór). */
export function attempt(over: Partial<Attempt> & Pick<Attempt, 'categoryId'>): Attempt {
  return {
    taskId: 't',
    factId: null,
    categories: [over.categoryId],
    format: 'choice',
    mode: 'combat',
    correct: true,
    timedOut: false,
    ms: 3000,
    helped: false,
    given: null,
    errorKind: null,
    at: T0,
    ...over,
  };
}

export function attemptForTask(task: Task, correct: boolean, ms: number, at: number, extra: Partial<Attempt> = {}): Attempt {
  return {
    taskId: task.id,
    factId: task.factId,
    categoryId: task.categoryId,
    categories: task.categories,
    format: task.format,
    mode: 'combat',
    correct,
    timedOut: false,
    ms,
    helped: false,
    given: correct ? task.answer : null,
    errorKind: null,
    at,
    ...extra,
  };
}

/** Rozkład log-normalny wokół mediany (Box–Muller). */
export function lognormal(rng: Rng, median: number, sigma: number): number {
  const u = Math.max(1e-12, rng.next());
  const v = rng.next();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(Math.log(median) + sigma * z);
}

export interface SimOptions {
  seed: number;
  pool: CategoryId[];
  settings?: ParentSettings;
  sessions: number;
  perSession: number;
  format?: TaskFormat;
  /** Prawdziwe prawdopodobieństwo sukcesu dziecka dla faktu (ekspozycje = ile razy już widziany). */
  trueP: (factId: string, exposures: number, session: number) => number;
  model?: SkillModel;
}

export interface SimStep {
  session: number;
  factId: string | null;
  categoryId: CategoryId;
  correct: boolean;
}

/** „Wirtualne dziecko” (GDD 21): odpowiada z prawdopodobieństwem trueP, czasy log-normalne. */
export function simulate(o: SimOptions): { model: SkillModel; steps: SimStep[] } {
  const model = o.model ?? createSkillModel();
  const rng = createRng(o.seed);
  const child = createRng((o.seed ^ 0x9e3779b9) >>> 0);
  const settings = o.settings ?? makeSettings();
  const exposures = new Map<string, number>();
  const steps: SimStep[] = [];
  let now = T0;
  for (let s = 0; s < o.sessions; s++) {
    startSession(model, now);
    for (let i = 0; i < o.perSession; i++) {
      const task = pickTask(model, { categories: o.pool, settings, mode: 'combat', format: o.format ?? 'choice' }, rng, now);
      const key = task.factId ?? task.categoryId;
      const e = exposures.get(key) ?? 0;
      const correct = child.chance(o.trueP(key, e, s));
      exposures.set(key, e + 1);
      const ms = correct ? lognormal(child, 3000, 0.3) : lognormal(child, 5000, 0.4);
      recordAttempt(model, attemptForTask(task, correct, ms, now), now);
      steps.push({ session: s, factId: task.factId, categoryId: task.categoryId, correct });
      now += Math.round(ms) + 4000;
    }
    now += DAY_MS;
  }
  return { model, steps };
}
