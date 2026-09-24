/**
 * Czyste funkcje pomocnicze animacji proceduralnej (bez three.js) — krzywe, obwiednie, czasy trwania.
 * Testowane w anim.test.ts.
 */
import type { AnimName } from '../../game/contracts';

/** Animacje zapętlone — play() rozwiązuje się od razu. */
export const LOOP_ANIMS: ReadonlySet<AnimName> = new Set<AnimName>(['idle', 'walk', 'windup', 'dance', 'sleep']);

export function isLoop(anim: AnimName): boolean {
  return LOOP_ANIMS.has(anim);
}

/** Domyślne czasy animacji jednorazowych (s, przy speed = 1). */
export const ONE_SHOT_DURATION: Readonly<Record<AnimName, number>> = {
  idle: 0,
  walk: 0,
  windup: 0,
  dance: 0,
  sleep: 0,
  attack: 0.62,
  strongAttack: 1.15,
  hit: 0.5,
  block: 0.75,
  cheer: 1.25,
  hide: 0.6,
  appear: 0.7,
  open: 0.9,
};

/** Czas przenikania między animacjami (s). */
export const CROSSFADE = 0.16;

export const TAU = Math.PI * 2;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

/** 0 przed a, 1 po b, gładko pomiędzy. */
export function ramp(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return smoothstep((p - a) / (b - a));
}

/** Garb 0 → 1 → 0 na przedziale [a, b] (półokres sinusa). */
export function bump(p: number, a: number, b: number): number {
  if (p <= a || p >= b || b <= a) return 0;
  return Math.sin(((p - a) / (b - a)) * Math.PI);
}

/** Obwiednia „atak–utrzymanie–zwolnienie”: 0→1 na [a,b], 1 na [b,c], 1→0 na [c,d]. */
export function envelope(p: number, a: number, b: number, c: number, d: number): number {
  if (p <= a || p >= d) return 0;
  if (p < b) return smoothstep((p - a) / (b - a));
  if (p <= c) return 1;
  return 1 - smoothstep((p - c) / (d - c));
}

export function easeOutCubic(x: number): number {
  const t = clamp01(x);
  return 1 - (1 - t) ** 3;
}

export function easeInCubic(x: number): number {
  const t = clamp01(x);
  return t * t * t;
}

export function easeInOutSine(x: number): number {
  const t = clamp01(x);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Przestrzał na końcu (do „wyskoczenia”). */
export function easeOutBack(x: number, s = 1.70158): number {
  const t = clamp01(x) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

/** Sprężyste dojście do 1. */
export function easeOutElastic(x: number): number {
  const t = clamp01(x);
  if (t === 0 || t === 1) return t;
  const c4 = TAU / 3;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/** Podskok o wysokości 1 na fazie 0..1 (parabola). */
export function hop(phase: number): number {
  const f = phase - Math.floor(phase);
  return 4 * f * (1 - f);
}

/** Nieregularne „kiwanie” (suma niesynchronicznych sinusów), zakres ok. [-1, 1]. */
export function wobble(t: number, seed = 0): number {
  return (
    0.55 * Math.sin(t * 2.3 + seed) +
    0.3 * Math.sin(t * 3.7 + seed * 1.7 + 1.1) +
    0.15 * Math.sin(t * 6.1 + seed * 2.3 + 2.4)
  );
}

/**
 * Zgniecenie z zachowaniem objętości: sy = 1 + k, sx = sz = 1 / sqrt(sy).
 * Zwraca [sx, sy, sz].
 */
export function squash(k: number): [number, number, number] {
  const sy = Math.max(0.05, 1 + k);
  const sxz = 1 / Math.sqrt(sy);
  return [sxz, sy, sxz];
}

/** Mrugnięcie: 1 = oczy otwarte, bliskie 0 = zamknięte. Co ~3,5 s krótkie mrugnięcie. */
export function blink(time: number, seed = 0): number {
  const period = 3.4 + (seed % 1) * 1.5;
  const f = (time + seed * 7.3) % period;
  if (f < 0.07) return 1 - f / 0.07;
  if (f < 0.14) return (f - 0.07) / 0.07;
  return 1;
}

/** Deterministyczne liczby pseudolosowe (mulberry32) — dla rozkładu drobinek i faz. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Prosty hash tekstu → liczba (np. faza z identyfikatora modelu). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
