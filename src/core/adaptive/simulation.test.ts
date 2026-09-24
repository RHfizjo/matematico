/**
 * Symulacja „wirtualnego dziecka” (GDD 21): znane słabe fakty, 600 zadań w 6 sesjach.
 */
import { describe, expect, it } from 'vitest';
import type { CategoryId } from '../types';
import { createRng } from '../rng';
import { allFacts, categoriesOfFact } from '../math';
import { createSkillModel, recordAttempt, startSession } from './model';
import { pickTask } from './scheduler';
import { T0, attemptForTask, makeSettings, simulate, type SimStep } from './testkit';

const POOL: CategoryId[] = ['mul.t2', 'mul.t3', 'mul.t4', 'mul.t5', 'mul.t6', 'mul.t7', 'mul.t8', 'mul.t9', 'mul.t10'];
const POOL_FACTS = allFacts(makeSettings()).filter((f) => categoriesOfFact(f).some((c) => POOL.includes(c)));
const WEAK = new Set(['mul:7x8', 'mul:8x7', 'mul:6x9', 'mul:9x6']);
const SEEDS = [1, 2, 3, 4, 5];

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Średnia skuteczność w oknie kroczącym. */
function rollingAccuracy(steps: readonly SimStep[], w: number): number[] {
  const out: number[] = [];
  for (let i = w; i <= steps.length; i++) out.push(steps.slice(i - w, i).filter((s) => s.correct).length / w);
  return out;
}

function maxErrorStreak(steps: readonly SimStep[]): number {
  let best = 0;
  let cur = 0;
  for (const s of steps) {
    cur = s.correct ? 0 : cur + 1;
    best = Math.max(best, cur);
  }
  return best;
}

describe('symulacja: słabe fakty 7×8, 8×7, 6×9, 9×6 (p = 0.4), reszta p = 0.9', () => {
  const runs = SEEDS.map((seed) =>
    simulate({ seed, pool: POOL, sessions: 6, perSession: 100, trueP: (f) => (WEAK.has(f) ? 0.4 : 0.9) }),
  );

  it('pula to cała tabliczka ×2..×10 (99 faktów)', () => {
    expect(POOL_FACTS).toHaveLength(99);
    for (const r of runs) {
      expect(r.steps).toHaveLength(600);
      expect(r.steps.every((s) => s.factId !== null && POOL_FACTS.includes(s.factId))).toBe(true);
    }
  });

  it('słabe fakty pojawiają się ≥ 2× częściej (na fakt) niż średni mocny fakt', () => {
    for (const { steps } of runs) {
      const weak = steps.filter((s) => WEAK.has(s.factId as string)).length;
      const perWeak = weak / WEAK.size;
      const perStrong = (steps.length - weak) / (POOL_FACTS.length - WEAK.size);
      expect(perWeak).toBeGreaterThanOrEqual(2 * perStrong);
    }
  });

  it('skuteczność w oknie kroczącym średnio w 0.55–0.9', () => {
    for (const { steps } of runs) {
      const roll8 = mean(rollingAccuracy(steps, 8));
      expect(roll8).toBeGreaterThanOrEqual(0.55);
      expect(roll8).toBeLessThanOrEqual(0.9);
      // Każda sesja osobno też w rozsądnym zakresie.
      for (let s = 0; s < 6; s++) {
        const ss = steps.filter((x) => x.session === s);
        const acc = ss.filter((x) => x.correct).length / ss.length;
        expect(acc).toBeGreaterThanOrEqual(0.55);
        expect(acc).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('model: m słabych < 0.6, m mocnych > 0.7; zbieżność do prawdziwych p (błąd < 0.15)', () => {
    const weakMeans: number[] = [];
    const strongMeans: number[] = [];
    for (const { model } of runs) {
      const weakSeen = [...WEAK].filter((f) => (model.facts[f]?.n ?? 0) > 0).map((f) => model.facts[f]?.m as number);
      const strongSeen = Object.entries(model.facts)
        .filter(([f, st]) => !WEAK.has(f) && st.n >= 2)
        .map(([, st]) => st.m);
      expect(weakSeen.length).toBeGreaterThan(0);
      expect(strongSeen.length).toBeGreaterThan(30);
      const w = mean(weakSeen);
      const s = mean(strongSeen);
      // Pojedynczy przebieg: m jednego faktu (EWMA, α = 0.25) ma odchylenie ok. ±0.17, a widziane są
      // często tylko 2 słabe fakty — progi bezwzględne sprawdzamy na średniej z przebiegów (niżej),
      // tu tylko wyraźny rozdział słabych i mocnych.
      expect(s).toBeGreaterThan(0.7);
      expect(s - w).toBeGreaterThan(0.1);
      weakMeans.push(w);
      strongMeans.push(s);
    }
    expect(mean(weakMeans)).toBeLessThan(0.6);
    expect(mean(strongMeans)).toBeGreaterThan(0.7);
    expect(Math.abs(mean(weakMeans) - 0.4)).toBeLessThan(0.15);
    expect(Math.abs(mean(strongMeans) - 0.9)).toBeLessThan(0.15);
  });

  it('bezpiecznik: po 2 błędach z rzędu zadanie łatwe (bez słabych faktów, skuteczność ≥ 0.8)', () => {
    let after = 0;
    let ok = 0;
    for (const { steps } of runs) {
      for (let i = 2; i < steps.length; i++) {
        const a = steps[i - 2] as SimStep;
        const b = steps[i - 1] as SimStep;
        const c = steps[i] as SimStep;
        // Zadanie po (co najmniej) 2 błędach z rzędu.
        if (a.correct || b.correct) continue;
        after++;
        if (c.correct) ok++;
        expect(WEAK.has(c.factId as string)).toBe(false);
      }
    }
    expect(after).toBeGreaterThan(10);
    expect(ok / after).toBeGreaterThanOrEqual(0.8);
  });
});

describe('symulacja: dziecko uczy się słabych faktów → pojawiają się rzadziej', () => {
  /** Rozgrzewka: wszystkie fakty pokazane raz (forceBucket 'new'), potem 6 sesji po 100 zadań. */
  function run(seed: number): number[] {
    const model = createSkillModel();
    const exposures = new Map<string, number>();
    // Prawdopodobieństwo słabego faktu rośnie z każdą ekspozycją (0.3 → 0.95).
    const p = (f: string, e: number): number => (WEAK.has(f) ? Math.min(0.95, 0.3 + 0.08 * e) : 0.9);
    const rng = createRng(seed + 1000);
    const child = createRng(seed + 2000);
    startSession(model, T0);
    for (let i = 0; i < POOL_FACTS.length; i++) {
      const t = pickTask(model, { categories: POOL, settings: makeSettings(), mode: 'combat', format: 'choice', forceBucket: 'new' }, rng, T0);
      const f = t.factId as string;
      const e = exposures.get(f) ?? 0;
      exposures.set(f, e + 1);
      recordAttempt(model, attemptForTask(t, child.chance(p(f, e)), 3000, T0), T0);
    }
    expect(Object.values(model.facts).every((st) => st.n > 0)).toBe(true);
    const { steps } = simulate({
      seed,
      pool: POOL,
      model,
      sessions: 6,
      perSession: 100,
      trueP: (f, e) => p(f, e + (exposures.get(f) ?? 0)),
    });
    return [0, 1, 2, 3, 4, 5].map((s) => steps.filter((x) => x.session === s && WEAK.has(x.factId as string)).length);
  }

  it('liczba słabych faktów w sesjach 5–6 mniejsza niż w sesjach 1–2', () => {
    const early: number[] = [];
    const late: number[] = [];
    for (const seed of SEEDS) {
      const per = run(seed);
      const e = (per[0] ?? 0) + (per[1] ?? 0);
      const l = (per[4] ?? 0) + (per[5] ?? 0);
      expect(l).toBeLessThan(e);
      early.push(e);
      late.push(l);
    }
    // Średnio co najmniej o połowę rzadziej.
    expect(mean(late)).toBeLessThan(0.5 * mean(early));
  });
});

describe('symulacja: dziecko słabsze w ×6–×9 (p = 0.5), reszta p = 0.92', () => {
  const hard = (f: string): boolean => /^mul:[6-9]x|x[6-9]$/.test(f);

  it('skuteczność nie spada poniżej 0.55, bezpiecznik ogranicza serie błędów', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const { steps } = simulate({ seed, pool: POOL, sessions: 6, perSession: 100, trueP: (f) => (hard(f) ? 0.5 : 0.92) });
      expect(mean(rollingAccuracy(steps, 8))).toBeGreaterThanOrEqual(0.55);
      expect(maxErrorStreak(steps)).toBeLessThanOrEqual(5);
    }
  });
});
