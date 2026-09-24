/** Historia prób (ring buffer) i dziennik sesji (GDD 18.2, 19). Funkcje mutują `save`. */
import type { Attempt, AttemptLog, SaveV1, SessionLog } from '../types';
import { SAVE_LIMITS } from './limits';

/** Maks. liczba prób w historii. */
export const HISTORY_LIMIT: number = SAVE_LIMITS.history;
/** Maks. liczba sesji w dzienniku. */
export const SESSIONS_LIMIT: number = SAVE_LIMITS.sessions;

const DAY_MS = 24 * 60 * 60 * 1000;

function nonNeg(x: number): number {
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/** Usuwa najstarsze elementy ponad limit. */
function trimFront<T>(xs: T[], limit: number): void {
  if (xs.length > limit) xs.splice(0, xs.length - limit);
}

/** Zwięzły wpis historii z próby. */
export function toAttemptLog(a: Attempt): AttemptLog {
  return {
    f: a.factId,
    c: a.categoryId,
    ok: a.correct,
    to: a.timedOut,
    ms: Math.round(nonNeg(a.ms)),
    h: a.helped,
    md: a.mode,
    ek: a.errorKind,
    t: nonNeg(a.at),
  };
}

/** Dopisuje próbę do historii, zachowując ostatnie HISTORY_LIMIT wpisów. */
export function appendHistory(save: SaveV1, a: Attempt): void {
  save.history.push(toAttemptLog(a));
  trimFront(save.history, HISTORY_LIMIT);
}

/** Rozpoczyna nową sesję (start = end = now, 0 zadań). */
export function beginSession(save: SaveV1, now: number): void {
  const t = nonNeg(now);
  save.sessions.push({ start: t, end: t, tasks: 0, correct: 0 });
  trimFront(save.sessions, SESSIONS_LIMIT);
}

/**
 * Aktualizuje bieżącą (ostatnią) sesję: przesuwa koniec na `now`;
 * `correct` ≠ null liczy zadanie (i poprawną odpowiedź). Bez sesji — zaczyna nową.
 */
export function touchSession(save: SaveV1, now: number, correct: boolean | null): void {
  let last: SessionLog | undefined = save.sessions[save.sessions.length - 1];
  if (!last) {
    beginSession(save, now);
    last = save.sessions[save.sessions.length - 1];
    if (!last) return;
  }
  // Koniec nie cofa się (np. po zmianie zegara).
  last.end = Math.max(last.end, last.start, nonNeg(now));
  if (correct !== null) {
    last.tasks += 1;
    if (correct) last.correct += 1;
  }
}

export interface SessionStats {
  tasks: number;
  correct: number;
  /** Łączny czas sesji w oknie, zaokrąglony do pełnych minut. */
  minutes: number;
  sessions: number;
}

/**
 * Statystyki sesji z ostatnich `days` dni (Infinity = wszystkie). Liczą się sesje, które
 * nachodzą na okno [now − days, now]; czas przycinany do okna, zadania liczone w całości.
 */
export function sessionStats(save: SaveV1, days: number, now: number): SessionStats {
  const out: SessionStats = { tasks: 0, correct: 0, minutes: 0, sessions: 0 };
  if (!(days > 0) || Number.isNaN(now)) return out;
  const from = days === Infinity ? -Infinity : now - days * DAY_MS;
  let ms = 0;
  for (const s of save.sessions) {
    if (s.end < from || s.start > now) continue;
    out.sessions += 1;
    out.tasks += s.tasks;
    out.correct += s.correct;
    const a = Math.max(s.start, from);
    const b = Math.min(s.end, now);
    if (b > a) ms += b - a;
  }
  out.minutes = Math.round(ms / 60_000);
  return out;
}
