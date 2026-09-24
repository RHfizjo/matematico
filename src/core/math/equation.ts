/**
 * Wspólna reprezentacja działania (składniki + wynik) oraz zapis tekstowy dla dziecka.
 */
import type { Op, Task } from '../types';

/** Znaki działań: minus U+2212, razy U+00D7, dzielenie ":". */
export const OP_SYMBOL: Readonly<Record<Op, string>> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: ':',
};

/** Znak niewiadomej (U+25A1). */
export const MISSING_MARK = '□';

/** Pełne działanie: terms[0] op terms[1] (op terms[2]) = result. */
export interface Equation {
  op: Op;
  terms: number[];
  result: number;
}

/** Działanie odczytane z zadania; missingIndex = indeks niewiadomej w terms (null gdy nieznany jest wynik). */
export interface TaskEquation extends Equation {
  missingIndex: number | null;
}

export function applyOp(op: Op, a: number, b: number): number {
  switch (op) {
    case 'add':
      return a + b;
    case 'sub':
      return a - b;
    case 'mul':
      return a * b;
    case 'div':
      return a / b;
  }
}

/** Wartość składników liczona od lewej. */
export function evalTerms(op: Op, terms: readonly number[]): number {
  const [first, ...rest] = terms;
  if (first === undefined) throw new RangeError('evalTerms: brak składników');
  return rest.reduce((acc, t) => applyOp(op, acc, t), first);
}

/** "8 + 7", "15 − □" itd. */
export function formatTerms(op: Op, terms: readonly (number | string)[]): string {
  return terms.map(String).join(` ${OP_SYMBOL[op]} `);
}

/**
 * Odczytuje pełne działanie z tekstu zadania (np. "8 + □ = 15", "7 × 8 = ?"),
 * wstawiając `answer` w miejsce niewiadomej. Rzuca błąd dla nieznanego formatu.
 */
export function taskEquation(task: Pick<Task, 'op' | 'text' | 'answer'>): TaskEquation {
  const tokens = task.text.split(' ');
  const eqAt = tokens.indexOf('=');
  if (eqAt < 1 || eqAt !== tokens.length - 2 || eqAt % 2 === 0) {
    throw new Error(`Nieznany format zadania: ${task.text}`);
  }
  const terms: number[] = [];
  let missingIndex: number | null = null;
  for (let i = 0; i < eqAt; i++) {
    const tok = tokens[i] as string;
    if (i % 2 === 1) {
      if (tok !== OP_SYMBOL[task.op]) throw new Error(`Nieznany znak działania: ${task.text}`);
      continue;
    }
    if (tok === MISSING_MARK) {
      if (missingIndex !== null) throw new Error(`Dwie niewiadome: ${task.text}`);
      missingIndex = terms.length;
      terms.push(task.answer);
    } else if (/^\d+$/.test(tok)) {
      terms.push(Number(tok));
    } else {
      throw new Error(`Nieznany składnik "${tok}": ${task.text}`);
    }
  }
  const right = tokens[eqAt + 1] as string;
  let result: number;
  if (right === '?') {
    if (missingIndex !== null) throw new Error(`Dwie niewiadome: ${task.text}`);
    result = task.answer;
  } else if (/^\d+$/.test(right)) {
    if (missingIndex === null) throw new Error(`Brak niewiadomej: ${task.text}`);
    result = Number(right);
  } else {
    throw new Error(`Nieznany wynik "${right}": ${task.text}`);
  }
  return { op: task.op, terms, result, missingIndex };
}
