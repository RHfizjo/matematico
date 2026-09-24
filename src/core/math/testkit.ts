/**
 * Pomocnicze funkcje do testów modułu math (bez zależności od vitest).
 */
import type { NumberRange, ParentSettings, TaskFormat } from '../types';

export const RANGES: readonly NumberRange[] = [10, 20, 100];
export const FORMATS: readonly TaskFormat[] = ['choice', 'missing', 'typed'];

export function makeSettings(range: NumberRange = 20, overrides: Partial<ParentSettings> = {}): ParentSettings {
  return {
    range,
    ops: { add: true, sub: true, mul: true, div: true },
    combatOps: 'themed',
    crossTenOnMeadow: true,
    timeLimit: { mode: 'none', fixedSec: { add: 10, sub: 10, mul: 10, div: 10 } },
    breakReminderMin: 0,
    quality: 'auto',
    audio: { music: 0.5, sfx: 0.5 },
    showFps: false,
    ...overrides,
  };
}

/** Wartość wyrażenia z liczb i znaków + − × : (× i : przed + i −, od lewej). */
export function evalExpr(expr: string): number {
  const tokens = expr.trim().split(/\s+/);
  // Najpierw × i :
  const additive: (number | string)[] = [];
  let acc = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as string;
    const v = Number(tokens[i + 1]);
    if (Number.isNaN(v)) throw new Error(`Zły składnik w "${expr}"`);
    if (op === '×') acc *= v;
    else if (op === ':') acc /= v;
    else if (op === '+' || op === '−') {
      additive.push(acc, op);
      acc = v;
    } else throw new Error(`Nieznany znak "${op}" w "${expr}"`);
  }
  additive.push(acc);
  let res = additive[0] as number;
  for (let i = 1; i < additive.length; i += 2) {
    const op = additive[i] as string;
    const v = additive[i + 1] as number;
    res = op === '+' ? res + v : res - v;
  }
  return res;
}

const TERM = '(?:\\d+|□)';
const EXPR = `${TERM}(?: [+−×:] ${TERM})*`;
const CHAIN = new RegExp(`${EXPR}(?: = ${EXPR})+`, 'g');

/**
 * Znajduje w tekście wszystkie łańcuchy "wyr = wyr (= wyr…)" i zwraca te niepoprawne
 * arytmetycznie (łańcuchy z □ są pomijane). Zwraca też liczbę sprawdzonych łańcuchów.
 */
export function checkArithmetic(text: string): { checked: number; errors: string[] } {
  const errors: string[] = [];
  let checked = 0;
  for (const m of text.matchAll(CHAIN)) {
    const chain = m[0];
    if (chain.includes('□')) continue;
    const values = chain.split(' = ').map(evalExpr);
    checked++;
    const first = values[0] as number;
    if (!values.every((v) => v === first) || !Number.isInteger(first)) errors.push(chain);
  }
  return { checked, errors };
}
