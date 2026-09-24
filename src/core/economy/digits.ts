/**
 * Skarbiec cyfr (GDD 9.2–9.3): liczniki cyfr 0..9 i operacje na multizbiorach.
 * `Digits` = tablica długości 10, indeks = cyfra, wartość = liczba sztuk.
 */
import type { Digits } from '../types';

/** Liczba różnych cyfr (0..9). */
export const DIGIT_KINDS = 10;

/** Czy wartość jest pojedynczą cyfrą 0..9. */
export function isDigit(d: number): boolean {
  return Number.isInteger(d) && d >= 0 && d <= 9;
}

function assertDigit(d: number): void {
  if (!isDigit(d)) throw new RangeError(`Nieprawidłowa cyfra: ${d}`);
}

/** Pusty skarbiec (10 zer). */
export function emptyDigits(): Digits {
  return new Array<number>(DIGIT_KINDS).fill(0);
}

/** Start gry: 2× każda z 1–9 + 1× 0 (19 cyfr). */
export function startingDigits(): Digits {
  const inv = emptyDigits();
  for (let d = 1; d <= 9; d++) inv[d] = 2;
  inv[0] = 1;
  return inv;
}

/** Lista cyfr → liczniki. */
export function digitsFromList(ds: readonly number[]): Digits {
  const inv = emptyDigits();
  addDigits(inv, ds);
  return inv;
}

/** Liczniki → lista cyfr (rosnąco). */
export function digitsToList(inv: Digits): number[] {
  const out: number[] = [];
  for (let d = 0; d < DIGIT_KINDS; d++) {
    const n = inv[d] ?? 0;
    for (let i = 0; i < n; i++) out.push(d);
  }
  return out;
}

/** Dodaje cyfry do skarbca (mutuje `inv`). */
export function addDigits(inv: Digits, ds: readonly number[]): void {
  for (const d of ds) assertDigit(d);
  for (const d of ds) inv[d] = (inv[d] ?? 0) + 1;
}

/** Dodaje liczniki (np. „dar bramy”) do skarbca (mutuje `inv`). */
export function addDigitCounts(inv: Digits, counts: Digits): void {
  // Najpierw walidacja całości — przy błędzie `inv` bez zmian.
  for (let d = 0; d < DIGIT_KINDS; d++) {
    const n = counts[d] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`Nieprawidłowy licznik cyfry ${d}: ${n}`);
  }
  for (let d = 0; d < DIGIT_KINDS; d++) inv[d] = (inv[d] ?? 0) + (counts[d] ?? 0);
}

/** Cyfry z `ds`, których brakuje w `inv` (multizbiór, rosnąco). Niepoprawne cyfry zawsze „brakują”. */
export function missingDigits(inv: Digits, ds: readonly number[]): number[] {
  const need = new Map<number, number>();
  for (const d of ds) need.set(d, (need.get(d) ?? 0) + 1);
  const out: number[] = [];
  for (const [d, n] of [...need.entries()].sort((x, y) => x[0] - y[0])) {
    const have = isDigit(d) ? (inv[d] ?? 0) : 0;
    for (let i = have; i < n; i++) out.push(d);
  }
  return out;
}

/** Czy skarbiec zawiera wszystkie cyfry z `ds` (z krotnościami). */
export function hasDigits(inv: Digits, ds: readonly number[]): boolean {
  return missingDigits(inv, ds).length === 0;
}

/** Zabiera cyfry ze skarbca; rzuca wyjątek (bez zmian w `inv`), gdy czegoś brakuje. */
export function removeDigits(inv: Digits, ds: readonly number[]): void {
  for (const d of ds) assertDigit(d);
  const missing = missingDigits(inv, ds);
  if (missing.length > 0) throw new RangeError(`Brak cyfr w skarbcu: ${missing.join(', ')}`);
  for (const d of ds) inv[d] = (inv[d] ?? 0) - 1;
}

/** Łączna liczba cyfr w skarbcu. */
export function countDigits(inv: Digits): number {
  let sum = 0;
  for (let d = 0; d < DIGIT_KINDS; d++) sum += inv[d] ?? 0;
  return sum;
}

/** Cyfry liczby naturalnej w kolejności zapisu (54 → [5, 4], 0 → [0]). */
export function digitsOfNumber(n: number): number[] {
  // Tylko bezpieczne liczby całkowite: od 1e21 String() daje zapis wykładniczy.
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`digitsOfNumber: oczekiwano liczby naturalnej, jest ${n}`);
  return String(n).split('').map(Number);
}
