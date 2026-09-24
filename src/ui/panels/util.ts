/**
 * Czyste pomocniki paneli (bez DOM) — testowane w util.test.ts.
 */
import type { Digits, EquipSlot, GateOp, GateToken, Rarity } from '../../core/types';

export type DigitRarity = Rarity;

/** Rzadkość cyfry (GDD 9.2): 1–5 pospolite, 6–9 niezwykłe, 0 rzadkie. */
export function digitRarity(d: number): DigitRarity {
  if (d === 0) return 'rare';
  return d >= 6 ? 'uncommon' : 'common';
}

/**
 * Polska odmiana liczebnika: plural(1,'cyfra','cyfry','cyfr') → 'cyfra';
 * 2–4 (poza 12–14) → forma „few”; reszta → „many”.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const d10 = abs % 10;
  const d100 = abs % 100;
  if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return few;
  return many;
}

/** "3 cyfry", "5 cyfr", "1 cyfra". */
export function digitsWord(n: number): string {
  return `${n} ${plural(n, 'cyfra', 'cyfry', 'cyfr')}`;
}

/** Liczba cyfr każdego rodzaju użyta na torze (tablica długości 10). */
export function usedDigits(tokens: readonly GateToken[]): number[] {
  const out = new Array<number>(10).fill(0);
  for (const t of tokens) if (t.t === 'd') out[t.v] = (out[t.v] ?? 0) + 1;
  return out;
}

/** Ile sztuk cyfry `d` zostało po odjęciu użytych. */
export function remaining(inv: Digits, used: readonly number[], d: number): number {
  return Math.max(0, (inv[d] ?? 0) - (used[d] ?? 0));
}

export function totalDigits(inv: Digits): number {
  let s = 0;
  for (let d = 0; d < 10; d++) s += inv[d] ?? 0;
  return s;
}

/**
 * Czy da się wybrać dokładnie `count` cyfr ze skarbca o sumie `sum` (koszt kuźni / oferty dnia).
 * Programowanie dynamiczne po cyfrach: reach[k] = zbiór osiągalnych sum przy k wybranych.
 */
export function canComposeSum(inv: Digits, sum: number, count: number): boolean {
  if (count < 0 || sum < 0) return false;
  if (count === 0) return sum === 0;
  if (sum > 9 * count) return false;
  // reach[k][s]
  let reach: boolean[][] = Array.from({ length: count + 1 }, () => new Array<boolean>(sum + 1).fill(false));
  (reach[0] as boolean[])[0] = true;
  for (let d = 0; d < 10; d++) {
    const have = Math.min(inv[d] ?? 0, count);
    if (have === 0) continue;
    const next = reach.map(row => row.slice());
    for (let k = 0; k <= count; k++) {
      const row = reach[k] as boolean[];
      for (let s = 0; s <= sum; s++) {
        if (!row[s]) continue;
        for (let take = 1; take <= have && k + take <= count; take++) {
          const ns = s + take * d;
          if (ns > sum) break;
          (next[k + take] as boolean[])[ns] = true;
        }
      }
    }
    reach = next;
  }
  return (reach[count] as boolean[])[sum] === true;
}

/** Tokeny toru → tekst, np. "54 + 6". Sąsiednie cyfry tworzą liczbę. */
export function tokensText(tokens: readonly GateToken[]): string {
  let out = '';
  let prevDigit = false;
  for (const t of tokens) {
    if (t.t === 'd') {
      out += prevDigit ? String(t.v) : (out ? ' ' : '') + String(t.v);
      prevDigit = true;
    } else {
      out += (out ? ' ' : '') + t.v;
      prevDigit = false;
    }
  }
  return out;
}

/** Znak klawisza → token (tryb klawiatury deweloperskiej w bramie). */
export function keyToToken(key: string): GateToken | null {
  if (key.length === 1 && key >= '0' && key <= '9') return { t: 'd', v: Number(key) };
  const ops: Record<string, GateOp> = { '+': '+', '-': '−', '−': '−', '*': '×', x: '×', X: '×', '×': '×', ':': ':', '/': ':' };
  const op = ops[key];
  return op ? { t: 'op', v: op } : null;
}

// ───────────────────────────── Panel rodzica ─────────────────────────────

type Rgb = [number, number, number];
const HEAT_STOPS: { at: number; c: Rgb }[] = [
  { at: 0, c: [226, 84, 76] }, //    czerwony
  { at: 0.5, c: [242, 196, 70] }, // żółty
  { at: 1, c: [52, 176, 96] }, //    zielony
];

/** Kolor mapy ciepła dla opanowania m ∈ [0,1]; null = brak danych (szary). */
export function heatColor(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return '#d9dde5';
  const x = Math.min(1, Math.max(0, m));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const a = HEAT_STOPS[i - 1];
    const b = HEAT_STOPS[i];
    if (!a || !b) continue;
    if (x <= b.at) {
      const t = (x - a.at) / (b.at - a.at);
      const mix = (j: 0 | 1 | 2): number => Math.round(a.c[j] + (b.c[j] - a.c[j]) * t);
      return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
    }
  }
  return 'rgb(52, 176, 96)';
}

/** Kolor tekstu czytelny na komórce mapy ciepła. */
export function heatInk(m: number | null): string {
  return m === null ? '#7a8499' : '#1f2a44';
}

/** 0.734 → "73%"; null → "—". */
export function pct(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return `${Math.round(x * 100)}%`;
}

/** ms → "3,4 s" (polski przecinek); null → "—". */
export function secs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(1).replace('.', ',') : Math.round(s)} s`;
}

/** Losowe działanie blokady rodzica: dwucyfrowe × dwucyfrowe, bez wielokrotności 10. */
export function lockProblem(rand: () => number = Math.random): { a: number; b: number; answer: number } {
  const pick = (lo: number, hi: number): number => {
    for (;;) {
      const v = lo + Math.floor(rand() * (hi - lo + 1));
      if (v % 10 !== 0 && v !== 11) return v;
    }
  };
  const a = pick(12, 39);
  const b = pick(12, 29);
  return { a, b, answer: a * b };
}

export const RARITY_LABEL: Record<Rarity | 'legendary', string> = {
  common: 'Pospolity',
  uncommon: 'Niezwykły',
  rare: 'Rzadki',
  legendary: 'Legendarny',
};

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: 'Broń',
  armor: 'Pancerz',
  net: 'Sieć',
  amulet: 'Amulet',
};

export const SLOT_ICON: Record<EquipSlot, string> = {
  weapon: '🗡️',
  armor: '🛡️',
  net: '🥅',
  amulet: '📿',
};

export const SLOT_ORDER: EquipSlot[] = ['weapon', 'armor', 'net', 'amulet'];
