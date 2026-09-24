import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Attempt } from '../types';
import { HISTORY_LIMIT, SESSIONS_LIMIT, appendHistory, beginSession, sessionStats, touchSession } from './history';
import { migrateSave } from './migrate';
import { createNewSave } from './save';
import { validateSave } from './validate';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = 1_700_000_000_000;

function attempt(i: number, over: Partial<Attempt> = {}): Attempt {
  return {
    taskId: `t${i}`,
    factId: 'mul:7x8',
    categoryId: 'mul.t7',
    categories: ['mul.t7', 'mul.t8'],
    format: 'choice',
    mode: 'combat',
    correct: i % 3 !== 0,
    timedOut: false,
    ms: 1500.4,
    helped: false,
    given: 56,
    errorKind: null,
    at: NOW + i,
    ...over,
  };
}

describe('appendHistory', () => {
  it('zapisuje zwięzły wpis', () => {
    const s = createNewSave(NOW, 1);
    appendHistory(s, attempt(1, { correct: false, timedOut: true, helped: true, errorKind: 'tableNeighbor', mode: 'catch' }));
    expect(s.history).toEqual([
      { f: 'mul:7x8', c: 'mul.t7', ok: false, to: true, ms: 1500, h: true, md: 'catch', ek: 'tableNeighbor', t: NOW + 1 },
    ]);
    expect(validateSave(s)).toEqual([]);
  });

  it('zadanie proceduralne (factId null) i złe liczby', () => {
    const s = createNewSave(NOW, 1);
    appendHistory(s, attempt(2, { factId: null, categoryId: 'add.three', ms: NaN, at: -5 }));
    expect(s.history[0]).toMatchObject({ f: null, c: 'add.three', ms: 0, t: 0 });
    expect(validateSave(s)).toEqual([]);
  });

  it('ring buffer: zostaje ostatnie 2000 prób', () => {
    expect(HISTORY_LIMIT).toBe(2000);
    const s = createNewSave(NOW, 1);
    for (let i = 0; i < HISTORY_LIMIT + 137; i++) appendHistory(s, attempt(i));
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(s.history[0]?.t).toBe(NOW + 137);
    expect(s.history[HISTORY_LIMIT - 1]?.t).toBe(NOW + HISTORY_LIMIT + 136);
    expect(validateSave(s)).toEqual([]);
  });

  it('przycina też historię przekraczającą limit z zewnątrz', () => {
    const s = createNewSave(NOW, 1);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s.history.push({ f: null, c: 'add.2d', ok: true, to: false, ms: 1, h: false, md: 'gate', ek: null, t: i });
    appendHistory(s, attempt(0));
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(s.history[0]?.t).toBe(11);
  });

  it('property: długość = min(n, limit), kolejność zachowana', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2300 }), (n) => {
        const s = createNewSave(NOW, 1);
        for (let i = 0; i < n; i++) appendHistory(s, attempt(i));
        expect(s.history).toHaveLength(Math.min(n, HISTORY_LIMIT));
        for (let i = 1; i < s.history.length; i++) expect((s.history[i]?.t ?? 0) > (s.history[i - 1]?.t ?? 0)).toBe(true);
      }),
      { numRuns: 15 },
    );
  });
});

describe('sesje', () => {
  it('beginSession / touchSession', () => {
    const s = createNewSave(NOW, 1);
    beginSession(s, NOW);
    expect(s.sessions).toEqual([{ start: NOW, end: NOW, tasks: 0, correct: 0 }]);
    touchSession(s, NOW + 1000, true);
    touchSession(s, NOW + 2000, false);
    touchSession(s, NOW + 3000, null);
    expect(s.sessions).toEqual([{ start: NOW, end: NOW + 3000, tasks: 2, correct: 1 }]);
    // Zegar cofnięty — koniec się nie cofa.
    touchSession(s, NOW - 5000, true);
    expect(s.sessions[0]).toEqual({ start: NOW, end: NOW + 3000, tasks: 3, correct: 2 });
    beginSession(s, NOW + DAY);
    touchSession(s, NOW + DAY + 10, true);
    expect(s.sessions).toHaveLength(2);
    expect(s.sessions[1]).toEqual({ start: NOW + DAY, end: NOW + DAY + 10, tasks: 1, correct: 1 });
    expect(validateSave(s)).toEqual([]);
    expect(migrateSave(s)).toEqual(s);
  });

  it('touchSession bez sesji zaczyna nową', () => {
    const s = createNewSave(NOW, 1);
    touchSession(s, NOW + 7, true);
    expect(s.sessions).toEqual([{ start: NOW + 7, end: NOW + 7, tasks: 1, correct: 1 }]);
  });

  it('limit liczby sesji', () => {
    const s = createNewSave(NOW, 1);
    for (let i = 0; i < SESSIONS_LIMIT + 5; i++) beginSession(s, NOW + i * MIN);
    expect(s.sessions).toHaveLength(SESSIONS_LIMIT);
    expect(s.sessions[0]?.start).toBe(NOW + 5 * MIN);
  });

  it('sessionStats: okno dni, przycinanie czasu, Infinity = wszystko', () => {
    const s = createNewSave(NOW, 1);
    s.sessions = [
      { start: NOW - 40 * DAY, end: NOW - 40 * DAY + 30 * MIN, tasks: 50, correct: 40 },
      { start: NOW - 3 * DAY, end: NOW - 3 * DAY + 20 * MIN, tasks: 30, correct: 25 },
      // Sesja na granicy okna 7 dni: liczy się tylko część w oknie.
      { start: NOW - 7 * DAY - 10 * MIN, end: NOW - 7 * DAY + 5 * MIN, tasks: 10, correct: 5 },
      { start: NOW - 15 * MIN, end: NOW, tasks: 12, correct: 12 },
    ];
    expect(sessionStats(s, 7, NOW)).toEqual({ tasks: 52, correct: 42, minutes: 40, sessions: 3 });
    expect(sessionStats(s, 1, NOW)).toEqual({ tasks: 12, correct: 12, minutes: 15, sessions: 1 });
    expect(sessionStats(s, Infinity, NOW)).toEqual({ tasks: 102, correct: 82, minutes: 80, sessions: 4 });
    expect(sessionStats(s, 0, NOW)).toEqual({ tasks: 0, correct: 0, minutes: 0, sessions: 0 });
    expect(sessionStats(s, NaN, NOW)).toEqual({ tasks: 0, correct: 0, minutes: 0, sessions: 0 });
    expect(sessionStats(createNewSave(NOW, 1), 30, NOW)).toEqual({ tasks: 0, correct: 0, minutes: 0, sessions: 0 });
  });

  it('sessionStats pomija sesje z przyszłości', () => {
    const s = createNewSave(NOW, 1);
    s.sessions = [{ start: NOW + DAY, end: NOW + DAY + MIN, tasks: 5, correct: 5 }];
    expect(sessionStats(s, 7, NOW).sessions).toBe(0);
  });
});
