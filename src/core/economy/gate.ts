/**
 * Brama do dungeonu (GDD 10): parser i ewaluator wyrażenia `a ∘ b`, solver,
 * ocena odpowiedzi dziecka i generator celu z „darem bramy”.
 */
import type {
  Digits,
  GateOp,
  GateParse,
  GateParseError,
  GateScore,
  GateSolution,
  GateSolveResult,
  GateSpec,
  GateToken,
  LandId,
  NumberRange,
} from '../types';
import type { Rng } from '../rng';
import { digitsFromList, digitsOfNumber, emptyDigits, hasDigits, isDigit, missingDigits } from './digits';

/** Wszystkie działania bramy w stałej kolejności. */
export const ALL_GATE_OPS: readonly GateOp[] = ['+', '−', '×', ':'];

/** Największa liczba w wyrażeniu (MVP: maks. 2 cyfry). */
export const GATE_MAX_OPERAND = 99;

/** Szansa, że generator wybierze cel z `preferAnswers` (słabe fakty). */
export const GATE_PREFER_CHANCE = 0.5;

type EvalError = Extract<GateParseError, 'divByZero' | 'notInteger' | 'negative'>;
export type GateEval = { ok: true; value: number } | { ok: false; error: EvalError };

/** Oblicza `a ∘ b` w liczbach naturalnych (bez ujemnych i bez reszty). */
export function evaluateGateOp(a: number, op: GateOp, b: number): GateEval {
  switch (op) {
    case '+':
      return { ok: true, value: a + b };
    case '−':
      return a - b < 0 ? { ok: false, error: 'negative' } : { ok: true, value: a - b };
    case '×':
      return { ok: true, value: a * b };
    case ':':
      if (b === 0) return { ok: false, error: 'divByZero' };
      if (a % b !== 0) return { ok: false, error: 'notInteger' };
      return { ok: true, value: a / b };
  }
}

/** Trywialne mnożenie/dzielenie: ×1, 1×, ×0, 0×, :1, 0:b. Dla + i − zawsze false. */
export function isTrivial(a: number, op: GateOp, b: number): boolean {
  if (op === '×') return a <= 1 || b <= 1;
  if (op === ':') return b === 1 || a === 0;
  return false;
}

/** Nietrywialne × lub : (warunek „sprytne”, GDD 10.2). */
export function isSmartOp(a: number, op: GateOp, b: number): boolean {
  return (op === '×' || op === ':') && !isTrivial(a, op, b);
}

// ───────────────────────────── Parser ─────────────────────────────

function isGateOp(v: unknown): v is GateOp {
  return typeof v === 'string' && (ALL_GATE_OPS as readonly string[]).includes(v);
}

/** Wszystkie cyfry z toru (w kolejności). */
export function tokenDigits(tokens: readonly GateToken[]): number[] {
  const out: number[] = [];
  for (const tok of tokens) if (tok.t === 'd') out.push(tok.v);
  return out;
}

function operandError(ds: readonly number[]): GateParseError | null {
  if (ds.length === 0) return 'missingOperand';
  if (ds.length > 2) return 'tooLong';
  if (ds.length === 2 && ds[0] === 0) return 'leadingZero';
  return null;
}

function toNumber(ds: readonly number[]): number {
  let n = 0;
  for (const d of ds) n = n * 10 + d;
  return n;
}

/** Parsuje tor wyrażenia (MVP: dokładnie jedno działanie między liczbami 1–2-cyfrowymi). */
export function parseGate(tokens: readonly GateToken[]): GateParse {
  if (tokens.length === 0) return { ok: false, error: 'empty' };
  const left: number[] = [];
  const right: number[] = [];
  let op: GateOp | null = null;
  let opCount = 0;
  for (const tok of tokens) {
    if (tok.t === 'd') {
      if (!isDigit(tok.v)) throw new RangeError(`parseGate: nieprawidłowa cyfra ${String(tok.v)}`);
      (opCount === 0 ? left : right).push(tok.v);
    } else {
      if (!isGateOp(tok.v)) throw new RangeError(`parseGate: nieznane działanie ${String(tok.v)}`);
      opCount++;
      op ??= tok.v;
    }
  }
  if (op === null) return { ok: false, error: 'noOp' };
  if (opCount > 1) return { ok: false, error: 'twoOps' };
  const err = operandError(left) ?? operandError(right);
  if (err !== null) {
    // Brak argumentu ma pierwszeństwo przed błędami drugiej strony.
    const missing = left.length === 0 || right.length === 0;
    return { ok: false, error: missing ? 'missingOperand' : err };
  }
  const a = toNumber(left);
  const b = toNumber(right);
  const ev = evaluateGateOp(a, op, b);
  if (!ev.ok) return { ok: false, error: ev.error };
  return { ok: true, a, op, b, value: ev.value, digitsUsed: [...left, ...right] };
}

/** Tekst → tokeny (tryb klawiatury, testy). Akceptuje też '-', '*', 'x', '/'. Spacje pomijane. */
export function gateTokensFromText(text: string): GateToken[] {
  const out: GateToken[] = [];
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') out.push({ t: 'd', v: Number(ch) });
    else if (ch === '+') out.push({ t: 'op', v: '+' });
    else if (ch === '−' || ch === '-') out.push({ t: 'op', v: '−' });
    else if (ch === '×' || ch === '*' || ch === 'x' || ch === 'X') out.push({ t: 'op', v: '×' });
    else if (ch === ':' || ch === '/' || ch === '÷') out.push({ t: 'op', v: ':' });
    else if (ch.trim() !== '') throw new RangeError(`gateTokensFromText: nieznany znak "${ch}"`);
  }
  return out;
}

/** Tokeny dla `a ∘ b` (liczby zapisane bez zer wiodących). */
export function gateTokensOf(a: number, op: GateOp, b: number): GateToken[] {
  return [
    ...digitsOfNumber(a).map((v): GateToken => ({ t: 'd', v })),
    { t: 'op', v: op },
    ...digitsOfNumber(b).map((v): GateToken => ({ t: 'd', v })),
  ];
}

/** Zapis do wyświetlenia, np. "6 × 9". */
export function formatGate(a: number, op: GateOp, b: number): string {
  return `${a} ${op} ${b}`;
}

// ───────────────────────────── Solver ─────────────────────────────

/** Cyfry liczb 0..99 (bez zer wiodących). */
const NUMBER_DIGITS: readonly (readonly number[])[] = Array.from({ length: GATE_MAX_OPERAND + 1 }, (_, n) =>
  digitsOfNumber(n),
);

interface Candidate {
  a: number;
  op: GateOp;
  b: number;
  digits: number[];
  /** Suma kosztów rzadkości cyfr. */
  rarity: number;
}

/** Koszt rzadkości cyfry: 1–5 tanie, 6–9 droższe, 0 najdroższe (GDD 9.2). */
function rarityCost(d: number): number {
  if (d === 0) return 3;
  return d >= 6 ? 2 : 1;
}

/**
 * Ranga do sortowania: nietrywialne ×/: najpierw, potem +/−, na końcu „puste” działania
 * (trywialne ×/: oraz +0, 0+, −0).
 */
function opRank(c: { a: number; op: GateOp; b: number }): number {
  if (isSmartOp(c.a, c.op, c.b)) return 0;
  if (c.op === '+') return c.a === 0 || c.b === 0 ? 2 : 1;
  if (c.op === '−') return c.b === 0 ? 2 : 1;
  return 2;
}

/** Kolejność: mniej cyfr → ranga działania → tańsze (częstsze) cyfry → stała kolejność. */
function compareCandidates(x: Candidate, y: Candidate): number {
  return (
    x.digits.length - y.digits.length ||
    opRank(x) - opRank(y) ||
    x.rarity - y.rarity ||
    ALL_GATE_OPS.indexOf(x.op) - ALL_GATE_OPS.indexOf(y.op) ||
    x.a - y.a ||
    x.b - y.b
  );
}

function uniqueOps(ops: readonly GateOp[]): GateOp[] {
  return ALL_GATE_OPS.filter((op) => ops.includes(op));
}

/** Wszystkie wyrażenia `a ∘ b = target` (a, b ∈ 0..99), bez względu na skarbiec. */
function enumerateExpressions(target: number, ops: readonly GateOp[]): Candidate[] {
  const out: Candidate[] = [];
  for (const op of uniqueOps(ops)) {
    for (let a = 0; a <= GATE_MAX_OPERAND; a++) {
      for (let b = 0; b <= GATE_MAX_OPERAND; b++) {
        const ev = evaluateGateOp(a, op, b);
        if (ev.ok && ev.value === target) {
          const digits = [...(NUMBER_DIGITS[a] ?? []), ...(NUMBER_DIGITS[b] ?? [])];
          out.push({ a, op, b, digits, rarity: digits.reduce((sum, d) => sum + rarityCost(d), 0) });
        }
      }
    }
  }
  return out;
}

/**
 * Przegląd wszystkich `a ∘ b` (a, b ∈ 0..99) dających `target` z cyfr skarbca `inv`.
 * Rozwiązania: rosnąco po liczbie cyfr, przy remisie najpierw nietrywialne × / :,
 * na końcu działania z 0 lub 1 (×1, +0…); dalej te z częstszych cyfr (przy równej liczbie cyfr).
 */
export function solveGate(
  target: number,
  inv: Digits,
  ops: readonly GateOp[],
  maxSolutions = 10,
): GateSolveResult {
  const found = enumerateExpressions(target, ops).filter((c) => hasDigits(inv, c.digits));
  if (found.length === 0) return { solvable: false, minDigits: null, solutions: [] };
  found.sort(compareCandidates);
  const solutions: GateSolution[] = found
    .slice(0, Math.max(0, Math.floor(maxSolutions)))
    .map((c) => ({ a: c.a, op: c.op, b: c.b, digitCount: c.digits.length }));
  return { solvable: true, minDigits: found[0]?.digits.length ?? null, solutions };
}

/**
 * „Dar bramy” (GDD 10.4): najmniejszy zestaw cyfr, po dodaniu którego cel jest osiągalny.
 * Puste liczniki, gdy skarbiec wystarcza. Wybór: najmniej brakujących cyfr, potem najtańsze.
 */
export function gateGift(target: number, inv: Digits, ops: readonly GateOp[]): Digits {
  const all = enumerateExpressions(target, ops);
  if (all.length === 0) throw new RangeError(`gateGift: cel ${target} nieosiągalny działaniami ${ops.join(' ')}`);
  let best: { cand: Candidate; missing: number[]; cost: number } | null = null;
  for (const cand of all) {
    const missing = missingDigits(inv, cand.digits);
    if (missing.length === 0) return emptyDigits();
    const cost = missing.reduce((sum, d) => sum + rarityCost(d), 0);
    const better =
      best === null ||
      missing.length < best.missing.length ||
      (missing.length === best.missing.length &&
        (cost < best.cost || (cost === best.cost && compareCandidates(cand, best.cand) < 0)));
    if (better) best = { cand, missing, cost };
  }
  return digitsFromList(best?.missing ?? []);
}

// ───────────────────────────── Ocena ─────────────────────────────

/** Komunikaty dla dziecka dla błędów toru. */
export const GATE_ERROR_MESSAGES: Record<GateParseError | 'opLocked' | 'notEnoughDigits', string> = {
  empty: 'Ułóż działanie z kafelków.',
  noOp: 'Dodaj znak działania, np. +.',
  twoOps: 'Użyj tylko jednego znaku działania.',
  missingOperand: 'Po obu stronach znaku musi stać liczba.',
  tooLong: 'Liczby mogą mieć najwyżej 2 cyfry.',
  leadingZero: 'Liczba nie może zaczynać się od zera.',
  divByZero: 'Nie można dzielić przez zero.',
  notInteger: 'To dzielenie nie wychodzi bez reszty.',
  negative: 'Wynik byłby mniejszy od zera.',
  opLocked: 'Tego znaku jeszcze nie masz.',
  notEnoughDigits: 'Nie masz tylu cyfr w Skarbcu.',
};

/**
 * Ocena ułożonego wyrażenia (GDD 10.2–10.3). `inv` = skarbiec z już dodanym darem bramy.
 * Kolejność błędów: opLocked → notEnoughDigits → błąd parsowania → wrongValue.
 */
export function scoreGate(
  tokens: readonly GateToken[],
  target: number,
  inv: Digits,
  ops: readonly GateOp[],
): GateScore {
  const digitsUsed = tokenDigits(tokens);
  const parsed = parseGate(tokens);
  const value = parsed.ok ? parsed.value : null;
  const fail = (error: NonNullable<GateScore['error']>, message: string): GateScore => ({
    valid: false,
    value,
    error,
    digitsUsed,
    smart: false,
    message,
  });

  const locked = tokens.find((tok) => tok.t === 'op' && !ops.includes(tok.v));
  if (locked) return fail('opLocked', `Znak ${locked.v} jeszcze nie jest odblokowany.`);
  if (!hasDigits(inv, digitsUsed)) return fail('notEnoughDigits', GATE_ERROR_MESSAGES.notEnoughDigits);
  if (!parsed.ok) return fail(parsed.error, GATE_ERROR_MESSAGES[parsed.error]);
  if (parsed.value !== target) {
    const diff = Math.abs(target - parsed.value);
    const tail = parsed.value < target ? `Brakuje ${diff}.` : `Za dużo o ${diff}.`;
    return fail('wrongValue', `Twoje działanie daje ${parsed.value}. ${tail}`);
  }
  const { minDigits } = solveGate(target, inv, ops, 0);
  const smart = digitsUsed.length === minDigits || isSmartOp(parsed.a, parsed.op, parsed.b);
  return {
    valid: true,
    value: parsed.value,
    error: null,
    digitsUsed,
    smart,
    message: smart ? 'Brama otwarta! Sprytnie!' : 'Brama otwarta!',
  };
}

// ───────────────────────────── Generator ─────────────────────────────

/** Zakres celu bramy (GDD 10.4). Zakres 10 → 10..20; Łąka → 10..40 (zakres 100: 10..99); reszta → 10..99. */
export function gateTargetRange(land: LandId, range: NumberRange): { min: number; max: number } {
  if (range === 10) return { min: 10, max: 20 };
  if (land === 'meadow' && range !== 100) return { min: 10, max: 40 };
  return { min: 10, max: 99 };
}

export interface MakeGateArgs {
  rng: Rng;
  land: LandId;
  range: NumberRange;
  inventory: Digits;
  ops: readonly GateOp[];
  /** Wyniki słabych faktów dziecka — preferowane cele (GDD 10.4 pkt 2). */
  preferAnswers?: readonly number[];
}

/**
 * Losuje bramę: cel z zakresu krainy (z preferencją słabych faktów) i dar bramy,
 * gdy skarbiec nie wystarcza. Nigdy nie zwraca bramy bez rozwiązania.
 */
export function makeGate(args: MakeGateArgs): GateSpec {
  const ops = uniqueOps(args.ops);
  if (ops.length === 0) throw new RangeError('makeGate: brak odblokowanych działań');
  const { min, max } = gateTargetRange(args.land, args.range);
  const preferred = (args.preferAnswers ?? []).filter((n) => Number.isInteger(n) && n >= min && n <= max);
  const target =
    preferred.length > 0 && args.rng.chance(GATE_PREFER_CHANCE) ? args.rng.pick(preferred) : args.rng.int(min, max);
  return { target, gift: gateGift(target, args.inventory, ops), ops };
}
