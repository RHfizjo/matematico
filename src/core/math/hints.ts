/**
 * Podpowiedzi-strategie po błędzie (GDD 5.4) i pierwszy krok dla pomocy „OŚ” (GDD 12.1).
 * Każdy zapis „a op b = c” w krokach jest poprawny arytmetycznie; firstStep nie zdradza wyniku.
 */
import type { CategoryId, Hint, HintStrategy, Task } from '../types';
import { isTwoDigitCategory } from './categories';
import { MISSING_MARK, OP_SYMBOL, formatTerms, taskEquation, type TaskEquation } from './equation';

type HintCore = Omit<Hint, 'title'>;

const MINUS = OP_SYMBOL.sub;
const TIMES = OP_SYMBOL.mul;
const BOX = MISSING_MARK;

const TITLES: Record<HintStrategy, string> = {
  make10: 'Dopełnij do 10!',
  nearDouble: 'Prawie podwojenie!',
  doubles: 'Podwojenie!',
  pairs10: 'Pary do 10!',
  down10: 'Zejdź do 10!',
  countUp: 'Dolicz w górę!',
  nineTrick: 'Sztuczka z dziewiątką!',
  fiveTrick: 'Sztuczka z piątką!',
  sixTrick: 'Pięć razy i jeszcze raz!',
  doubleDouble: 'Podwajaj!',
  commute: 'Zamień liczby miejscami!',
  inverseMul: 'Pomyśl o mnożeniu!',
  tens: 'Dziesiątki i jedności!',
  direct: 'Licz krok po kroku!',
};

/** Pierwszy krok bez liczb — gdy właściwy przypadkiem zdradzałby wynik. */
const SAFE_FIRST_STEP: Record<HintStrategy, string> = {
  make10: 'Najpierw dopełnij do dziesięciu, potem dodaj resztę.',
  nearDouble: 'Najpierw podwój mniejszą liczbę, potem dodaj jeszcze jeden.',
  doubles: 'Dwa razy ta sama liczba — podwój ją!',
  pairs10: 'Pomyśl o parach liczb, które razem dają dziesięć.',
  down10: 'Najpierw odejmij tyle, żeby dojść do dziesięciu.',
  countUp: 'Doliczaj w górę małymi skokami.',
  nineTrick: 'Pomnóż przez dziesięć, a potem odejmij jeden raz.',
  fiveTrick: 'Pomnóż przez dziesięć, a potem weź połowę.',
  sixTrick: 'Policz pięć razy, a potem dodaj jeszcze jeden raz.',
  doubleDouble: 'Podwajaj po kolei.',
  commute: 'Zamień liczby miejscami — wynik się nie zmieni.',
  inverseMul: 'Pomyśl o mnożeniu.',
  tens: 'Najpierw dziesiątki, potem jedności.',
  direct: 'Licz spokojnie krok po kroku.',
};

// ───────────── Zapisy kroków ─────────────

const plus = (a: number, b: number): string => `${a} + ${b} = ${a + b}`;
const minus = (a: number, b: number): string => `${a} ${MINUS} ${b} = ${a - b}`;
const times = (a: number, b: number): string => `${a} ${TIMES} ${b} = ${a * b}`;
const ones = (n: number, sign: 1 | -1 = 1): number[] => Array.from({ length: n }, () => sign);

/** Skoki od a do 10: małe a — przez 5 (3 → 5 → 10), duże — po 1. */
function jumpsTo10(a: number): number[] {
  if (a >= 10) return [];
  return a < 5 ? [5 - a, 5] : ones(10 - a);
}

/** Skoki doliczania o x: do 5 — po 1, większe — jeden skok. */
const countJumps = (x: number): number[] => (x <= 5 ? ones(x) : [x]);

/** "lewa = środek = wynik" (środek pomijany, gdy taki sam jak lewa strona). */
function chain(left: string, middle: string, result: number): string {
  return middle === left ? `${left} = ${result}` : `${left} = ${middle} = ${result}`;
}

/** „dziesiątka / dziesiątki / dziesiątek” dla n = 1..9. */
function tensWord(n: number): string {
  if (n === 1) return 'dziesiątka';
  if (n >= 2 && n <= 4) return 'dziesiątki';
  return 'dziesiątek';
}

/** Czy tekst zawiera „= wynik”. */
function revealsAnswer(text: string, answer: number): boolean {
  return new RegExp(`=\\s*${answer}(?!\\d)`).test(text);
}

// ───────────── Dodawanie (nieznany wynik) ─────────────

function doublesAdd(a: number): HintCore {
  const s = 2 * a;
  const base = { strategy: 'doubles' as const, numberLine: { from: a, jumps: [a] } };
  if (a >= 6 && a <= 9) {
    const d = a - 5;
    return {
      ...base,
      steps: ['5 + 5 = 10', plus(d, d), plus(10, 2 * d)],
      summary: `${a} + ${a} = 5 + 5 + ${d} + ${d} = ${s}`,
      firstStep: `5 + 5 = 10, a zostaje jeszcze ${d} + ${d}.`,
    };
  }
  return {
    ...base,
    steps: [plus(a, a)],
    summary: plus(a, a),
    firstStep: `Podwój liczbę ${a}: ${a} i jeszcze raz ${a}.`,
  };
}

function pairs10Add(a: number, b: number): HintCore {
  return {
    strategy: 'pairs10',
    steps: [`${a} i ${b} to para do 10`, plus(a, b)],
    summary: plus(a, b),
    firstStep: `Zacznij od ${a} i dolicz ${b}.`,
    numberLine: { from: a, jumps: jumpsTo10(a) },
  };
}

function nearDouble(a: number, b: number): HintCore {
  const sm = Math.min(a, b);
  return {
    strategy: 'nearDouble',
    steps: [plus(sm, sm), plus(2 * sm, 1)],
    summary: `${a} + ${b} = ${sm} + ${sm} + 1 = ${a + b}`,
    firstStep: `${sm} + ${sm} = ${2 * sm}, a teraz dodaj jeszcze 1.`,
    numberLine: { from: sm, jumps: [sm, 1] },
  };
}

function make10(a: number, b: number): HintCore {
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const fill = 10 - big;
  const rest = small - fill;
  return {
    strategy: 'make10',
    steps: [plus(big, fill), plus(10, rest)],
    summary: `${a} + ${b} = ${big} + ${fill} + ${rest} = ${a + b}`,
    firstStep: `${big} + ${fill} = 10. Z liczby ${small} zostaje jeszcze ${rest}.`,
    numberLine: { from: big, jumps: [fill, rest] },
  };
}

/** Liczba ≥ 10 plus jednocyfrowa (12 + 5, 10 + 4, ogólnie też 17 + 5). */
function teenAdd(a: number, b: number): HintCore {
  const t = Math.max(a, b);
  const u = Math.min(a, b);
  const s = a + b;
  const tu = t % 10;
  const tt = t - tu;
  if (tu === 0) {
    return {
      strategy: 'tens',
      steps: [plus(t, u)],
      summary: plus(a, b),
      firstStep: `Masz ${tt === 10 ? 'pełną dziesiątkę' : `${tt}`} i jeszcze ${u}.`,
      numberLine: { from: t, jumps: [u] },
    };
  }
  if (tu + u <= 10) {
    // 12 + 5 → 2 + 5 = 7, 10 + 7 = 17; 17 + 3 → 7 + 3 = 10, 10 + 10 = 20
    return {
      strategy: 'tens',
      steps: [plus(tu, u), plus(tt, tu + u)],
      summary: `${a} + ${b} = ${tt} + ${tu} + ${u} = ${s}`,
      firstStep: `Najpierw jedności: ${plus(tu, u)}, a potem dodaj ${tt}.`,
      numberLine: { from: t, jumps: [u] },
    };
  }
  // Przekroczenie kolejnej dziesiątki: dopełnij do niej.
  const next = tt + 10;
  const fill = next - t;
  const rest = u - fill;
  return {
    strategy: 'make10',
    steps: [plus(t, fill), plus(next, rest)],
    summary: `${a} + ${b} = ${t} + ${fill} + ${rest} = ${s}`,
    firstStep: `${t} + ${fill} = ${next}. Z liczby ${u} zostaje jeszcze ${rest}.`,
    numberLine: { from: t, jumps: [fill, rest] },
  };
}

/** Dwucyfrowe: dziesiątki osobno, jedności osobno (34 + 25 → 30 + 20 i 4 + 5). */
function tensAdd(a: number, b: number): HintCore {
  const ua = a % 10;
  const ub = b % 10;
  const ta = a - ua;
  const tb = b - ub;
  const T = ta + tb;
  const U = ua + ub;
  // Jedności: gdy obie niezerowe — osobne dodawanie; gdy jedna zerowa — od razu do sumy dziesiątek.
  const steps = [plus(ta, tb)];
  if (ua > 0 && ub > 0) steps.push(plus(ua, ub));
  if (U > 0) steps.push(plus(T, U));
  const parts = [ta, tb, ua, ub].filter((v) => v !== 0);
  return {
    strategy: 'tens',
    steps,
    summary: chain(`${a} + ${b}`, parts.join(' + '), a + b),
    firstStep:
      U === 0
        ? `Licz dziesiątkami: ${ta / 10} ${tensWord(ta / 10)} i ${tb / 10} ${tensWord(tb / 10)}.`
        : `Najpierw dziesiątki: ${plus(ta, tb)}.`,
    numberLine: { from: a, jumps: [tb, ub].filter((j) => j !== 0) },
  };
}

/** Doliczanie od większej liczby (małe składniki). */
function countOn(a: number, b: number): HintCore {
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const unit = small >= 1 && small <= 3;
  return {
    strategy: 'direct',
    steps: unit ? ones(small).map((_, i) => plus(big + i, 1)) : [plus(big, small)],
    summary: plus(a, b),
    firstStep: `Zacznij od większej liczby, ${big}, i dolicz ${small}.`,
    numberLine: { from: big, jumps: unit ? ones(small) : [small] },
  };
}

function addHint(cat: CategoryId, a: number, b: number): HintCore {
  const s = a + b;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  if (a >= 10 && b >= 10 && (a !== b || isTwoDigitCategory(cat))) return tensAdd(a, b);
  if (a === b) return doublesAdd(a);
  if (s === 10) return pairs10Add(a, b);
  // 8 i 9 są blisko 10 → dopełnianie (8 + 7); inne sąsiednie liczby → prawie podwojenie (6 + 7).
  if (big <= 9 && s >= 11 && big >= 8) return make10(a, b);
  if (big - small === 1 && small >= 2 && big <= 9) return nearDouble(a, b);
  if (big <= 9 && s >= 11) return make10(a, b);
  if (big >= 10) return teenAdd(a, b);
  return countOn(a, b);
}

function threeHint(terms: number[]): HintCore {
  const [x = 0, y = 0, z = 0] = terms;
  const s = x + y + z;
  const pairs: [number, number, number][] = [
    [x, y, z],
    [x, z, y],
    [y, z, x],
  ];
  const pair = pairs.find(([p, q]) => p + q === 10);
  if (pair) {
    const [p, q, rest] = pair;
    return {
      strategy: 'pairs10',
      steps: [plus(p, q), plus(10, rest)],
      summary: chain(`${x} + ${y} + ${z}`, `${p} + ${q} + ${rest}`, s),
      firstStep: `Szukaj pary do 10 — ${plus(p, q)}, a potem dodaj jeszcze ${rest}.`,
      numberLine: { from: p, jumps: [q, rest] },
    };
  }
  const xy = x + y;
  if (xy < 10 && s > 10) {
    const fill = 10 - xy;
    const rest = z - fill;
    return {
      strategy: 'make10',
      steps: [plus(x, y), plus(xy, fill), plus(10, rest)],
      summary: `${x} + ${y} + ${z} = ${xy} + ${fill} + ${rest} = ${s}`,
      firstStep: `${plus(x, y)}, a teraz dopełnij do 10.`,
      numberLine: { from: x, jumps: [y, fill, rest] },
    };
  }
  return {
    strategy: 'direct',
    steps: [plus(x, y), plus(xy, z)],
    summary: `${x} + ${y} + ${z} = ${s}`,
    firstStep: `${plus(x, y)}, a teraz dodaj jeszcze ${z}.`,
    numberLine: { from: x, jumps: [y, z] },
  };
}

// ───────────── Odejmowanie (nieznany wynik) ─────────────

function down10(m: number, s: number): HintCore {
  const um = m % 10;
  const low = m - um;
  const rest = s - um;
  return {
    strategy: 'down10',
    steps: [minus(m, um), minus(low, rest)],
    summary: `${m} ${MINUS} ${s} = ${m} ${MINUS} ${um} ${MINUS} ${rest} = ${m - s}`,
    firstStep: `${minus(m, um)}, a trzeba odjąć jeszcze ${rest}.`,
    numberLine: { from: m, jumps: [-um, -rest] },
  };
}

function countUpSub(m: number, s: number): HintCore {
  const r = m - s;
  return {
    strategy: 'countUp',
    steps: [`Pomyśl: ${s} + ${BOX} = ${m}`, plus(s, r), minus(m, s)],
    summary: `${minus(m, s)}, bo ${plus(s, r)}`,
    firstStep: `Zacznij od ${s} i doliczaj do ${m}.`,
    numberLine: { from: s, jumps: countJumps(r) },
  };
}

function countBack(m: number, s: number): HintCore {
  const word = s === 1 ? 'krok' : 'kroki';
  return {
    strategy: 'direct',
    steps: ones(s).map((_, i) => minus(m - i, 1)),
    summary: minus(m, s),
    firstStep: `Zacznij od ${m} i zrób ${s} ${word} w tył.`,
    numberLine: { from: m, jumps: ones(s, -1) },
  };
}

function pairs10Sub(s: number): HintCore {
  const r = 10 - s;
  return {
    strategy: 'pairs10',
    steps: [`${s} i ${r} to para do 10`, plus(s, r), minus(10, s)],
    summary: `${minus(10, s)}, bo ${plus(s, r)}`,
    firstStep: `Jaka liczba tworzy parę do 10 z liczbą ${s}?`,
    numberLine: { from: s, jumps: jumpsTo10(s) },
  };
}

/** Odejmowanie z liczbą ≥ 10 w odjemniku: najpierw dziesiątki, potem jedności (przez pełną dziesiątkę). */
function tensSub(m: number, s: number): HintCore {
  const r = m - s;
  const us = s % 10;
  const ts = s - us;
  const um = m % 10;
  const tm = m - um;
  if (us === 0) {
    const T = tm - ts;
    return {
      strategy: 'tens',
      steps: um > 0 ? [minus(tm, ts), plus(T, um)] : [minus(m, s)],
      summary: um > 0 ? `${m} ${MINUS} ${s} = ${T} + ${um} = ${r}` : minus(m, s),
      firstStep:
        um === 0
          ? `Licz dziesiątkami: ${tm / 10} ${tensWord(tm / 10)} odjąć ${ts / 10} ${tensWord(ts / 10)}.`
          : `Najpierw dziesiątki: ${minus(tm, ts)}.`,
      numberLine: { from: m, jumps: [-ts] },
    };
  }
  const x = m - ts;
  const ux = x % 10;
  const base = {
    strategy: 'tens' as const,
    summary: `${m} ${MINUS} ${s} = ${m} ${MINUS} ${ts} ${MINUS} ${us} = ${r}`,
    firstStep: `${minus(m, ts)}, a teraz odejmij jeszcze ${us}.`,
  };
  if (ux >= us || ux === 0) {
    return { ...base, steps: [minus(m, ts), minus(x, us)], numberLine: { from: m, jumps: [-ts, -us] } };
  }
  return {
    ...base,
    steps: [minus(m, ts), minus(x, ux), minus(x - ux, us - ux)],
    numberLine: { from: m, jumps: [-ts, -ux, -(us - ux)] },
  };
}

function subHint(m: number, s: number): HintCore {
  if (m >= 10 && s >= 10) return tensSub(m, s);
  if (m === 10) return pairs10Sub(s);
  if (m > 10) {
    const um = m % 10;
    if (s > um && um > 0 && s - um <= 10) return down10(m, s);
    if (s <= um) {
      const tm = m - um;
      return {
        strategy: 'tens',
        steps: [minus(um, s), plus(tm, um - s)],
        summary: `${m} ${MINUS} ${s} = ${tm} + ${um - s} = ${m - s}`,
        // Przy s = jedności (15 − 5) „a 10 zostaje” zdradzałoby wynik.
        firstStep:
          s === um
            ? `Najpierw jedności: ${minus(um, s)}. Co zostaje z liczby ${m}?`
            : `Najpierw jedności: ${minus(um, s)}, a ${tm} zostaje.`,
        numberLine: { from: m, jumps: [-s] },
      };
    }
    return countUpSub(m, s);
  }
  if (s <= 3) return countBack(m, s);
  return countUpSub(m, s);
}

// ───────────── Mnożenie i dzielenie (nieznany wynik) ─────────────

function mulHint(a: number, b: number): HintCore {
  const p = a * b;
  const has = (k: number): boolean => a === k || b === k;
  const other = (k: number): number => (a === k ? b : a);
  const lhs = `${a} ${TIMES} ${b}`;

  if (has(1)) {
    return {
      strategy: 'direct',
      steps: [times(a, b)],
      summary: times(a, b),
      firstStep: 'Razy 1 — liczba się nie zmienia.',
      blocks: { rows: a, cols: b },
    };
  }
  if (has(10)) {
    return {
      strategy: 'direct',
      steps: [times(a, b)],
      summary: times(a, b),
      firstStep: `Razy 10 — dopisz zero na końcu liczby ${other(10)}.`,
      blocks: { rows: a, cols: b },
    };
  }
  if (has(2)) {
    const k = other(2);
    return {
      strategy: 'doubles',
      steps: [plus(k, k)],
      summary: `${lhs} = ${k} + ${k} = ${p}`,
      firstStep: `2 ${TIMES} ${k} to podwojenie: ${k} + ${k}.`,
      blocks: { rows: 2, cols: k },
    };
  }
  if (has(9)) {
    const k = other(9);
    return {
      strategy: 'nineTrick',
      steps: [times(10, k), minus(10 * k, k)],
      summary: `${lhs} = 10 ${TIMES} ${k} ${MINUS} ${k} = ${p}`,
      firstStep: `${times(10, k)}, a teraz odejmij ${k}.`,
      blocks: { rows: 9, cols: k },
    };
  }
  if (has(5)) {
    const k = other(5);
    return {
      strategy: 'fiveTrick',
      steps: [times(10, k), `${10 * k} : 2 = ${5 * k}`],
      summary: `${lhs} = 10 ${TIMES} ${k} : 2 = ${p}`,
      firstStep: `${times(10, k)}, a teraz weź połowę.`,
      blocks: { rows: 5, cols: k },
    };
  }
  if (has(6)) {
    const k = other(6);
    return {
      strategy: 'sixTrick',
      steps: [times(5, k), plus(5 * k, k)],
      summary: `${lhs} = 5 ${TIMES} ${k} + ${k} = ${p}`,
      firstStep: `${times(5, k)}, a teraz dodaj jeszcze ${k}.`,
      blocks: { rows: 6, cols: k, highlightRows: 5 },
    };
  }
  if (has(4)) {
    const k = other(4);
    return {
      strategy: 'doubleDouble',
      steps: [times(2, k), plus(2 * k, 2 * k)],
      summary: `${lhs} = 2 ${TIMES} ${k} + 2 ${TIMES} ${k} = ${p}`,
      firstStep: `${times(2, k)}, a teraz podwój jeszcze raz.`,
      blocks: { rows: 4, cols: k, highlightRows: 2 },
    };
  }
  if (has(3)) {
    if (a !== 3) {
      // 7 × 3 → 3 × 7 = 7 + 7 + 7 (mniej dodawań)
      return {
        strategy: 'commute',
        steps: [`${a} ${TIMES} 3 = 3 ${TIMES} ${a}`, plus(a, a), plus(2 * a, a)],
        summary: `${lhs} = 3 ${TIMES} ${a} = ${a} + ${a} + ${a} = ${p}`,
        firstStep: `Zamień: ${a} ${TIMES} 3 to tyle samo co 3 ${TIMES} ${a}, czyli ${a} + ${a} + ${a}.`,
        blocks: { rows: 3, cols: a },
      };
    }
    return {
      strategy: 'direct',
      steps: [plus(b, b), plus(2 * b, b)],
      summary: `${lhs} = ${b} + ${b} + ${b} = ${p}`,
      firstStep: `3 ${TIMES} ${b} to ${b} + ${b} + ${b}.`,
      blocks: { rows: 3, cols: b },
    };
  }
  if (has(8)) {
    const k = other(8);
    return {
      strategy: 'doubleDouble',
      steps: [times(2, k), plus(2 * k, 2 * k), plus(4 * k, 4 * k)],
      summary: `${lhs} = 4 ${TIMES} ${k} + 4 ${TIMES} ${k} = ${p}`,
      firstStep: `${times(2, k)}, a teraz podwajaj jeszcze dwa razy.`,
      blocks: { rows: 8, cols: k, highlightRows: 4 },
    };
  }
  if (a > 5) {
    // np. 7 × 7 = 5 × 7 + 2 × 7
    const d = a - 5;
    return {
      strategy: 'direct',
      steps: [times(5, b), times(d, b), plus(5 * b, d * b)],
      summary: `${lhs} = 5 ${TIMES} ${b} + ${d} ${TIMES} ${b} = ${p}`,
      firstStep: `${times(5, b)}, a do tego jeszcze ${d} ${TIMES} ${b}.`,
      blocks: { rows: a, cols: b, highlightRows: 5 },
    };
  }
  return {
    strategy: 'direct',
    steps: [times(a, b)],
    summary: times(a, b),
    firstStep: `${a} razy po ${b} — policz kostki.`,
    blocks: { rows: a, cols: b },
  };
}

function divHint(p: number, k: number): HintCore {
  const q = p / k;
  return {
    strategy: 'inverseMul',
    steps: [`Pomyśl: ${k} ${TIMES} ${BOX} = ${p}`, times(k, q), `${p} : ${k} = ${q}`],
    summary: `${p} : ${k} = ${q}, bo ${times(k, q)}`,
    firstStep: `Pomyśl o mnożeniu: ${k} razy ile daje ${p}?`,
    blocks: { rows: k, cols: q, highlightRows: 1 },
  };
}

// ───────────── Brakująca liczba ─────────────

/** k + □ = s (x = s − k). */
function addMissing(cat: CategoryId, k: number, s: number, x: number): HintCore {
  if (s === 10 || cat === 'add.complement10') {
    return {
      strategy: 'pairs10',
      steps: [`${k} i ${x} to para do 10`, plus(k, x)],
      summary: plus(k, x),
      firstStep:
        k < 5
          ? `${plus(k, 5 - k)}, a do 10 brakuje jeszcze 5.`
          : `Zacznij od ${k} i doliczaj po 1 do 10. Ile skoków?`,
      numberLine: { from: k, jumps: jumpsTo10(k) },
    };
  }
  if (x === k) {
    return {
      strategy: 'doubles',
      steps: [plus(k, k)],
      summary: plus(k, k),
      firstStep: `Jaka liczba dodana do samej siebie daje ${s}?`,
      numberLine: { from: k, jumps: [k] },
    };
  }
  // Skoki o pełne dziesiątki tylko, gdy niewiadoma ma dziesiątki (20 − □ = 15 → doliczanie).
  if (x >= 10 && (isTwoDigitCategory(cat) || (k >= 10 && s >= 20))) {
    const U = x % 10;
    const T = x - U;
    const steps: string[] = [];
    if (T > 0) steps.push(plus(k, T));
    if (U > 0) steps.push(plus(k + T, U));
    if (T > 0 && U > 0) steps.push(plus(T, U));
    return {
      strategy: 'tens',
      steps,
      summary: plus(k, x),
      firstStep:
        T > 0 && U > 0
          ? `${plus(k, T)}, a do ${s} brakuje jeszcze ${U}.`
          : `Skacz od ${k} do ${s} — najpierw o pełne dziesiątki.`,
      numberLine: { from: k, jumps: [T, U].filter((j) => j !== 0) },
    };
  }
  if (k <= 9 && s >= 11 && s <= 19 && s % 10 >= k) {
    // □ + 5 = 17 → 7 − 5 = 2, 10 + 2 = 12
    const d = (s % 10) - k;
    return {
      strategy: 'tens',
      steps: d > 0 ? [minus(s % 10, k), plus(10, d)] : [plus(k, 10)],
      summary: plus(k, x),
      firstStep:
        d > 0
          ? `Najpierw jedności: ${minus(s % 10, k)}, a potem dodaj 10.`
          : `Porównaj jedności w liczbach ${k} i ${s}. Co jeszcze trzeba dodać?`,
      numberLine: { from: k, jumps: d > 0 ? [10, d] : [10] },
    };
  }
  if (k <= 9 && s >= 11 && s <= 19) {
    const f = 10 - k;
    const u = s - 10;
    return {
      strategy: 'make10',
      steps: [plus(k, f), plus(10, u), plus(f, u)],
      summary: plus(k, x),
      firstStep: `${plus(k, f)}, a do ${s} brakuje jeszcze ${u}.`,
      numberLine: { from: k, jumps: [f, u] },
    };
  }
  return {
    strategy: 'countUp',
    steps: [plus(k, x)],
    summary: plus(k, x),
    firstStep: `Zacznij od ${k} i doliczaj do ${s}.`,
    numberLine: { from: k, jumps: countJumps(x) },
  };
}

function missingHint(cat: CategoryId, e: TaskEquation, idx: number): HintCore {
  const { op, terms, result } = e;
  const x = terms[idx] as number;
  const boxed = `${formatTerms(op, terms.map((t, i) => (i === idx ? BOX : t)))} = ${result}`;
  const summary = `${BOX} = ${x}, bo ${formatTerms(op, terms)} = ${result}`;

  if (op === 'add' && terms.length === 3) {
    const known = terms.filter((_, i) => i !== idx);
    const [k1 = 0, k2 = 0] = known;
    return {
      strategy: 'countUp',
      steps: [plus(k1, k2), plus(k1 + k2, x)],
      summary,
      firstStep: `Dodaj znane liczby: ${plus(k1, k2)}, a potem dolicz do ${result}.`,
      numberLine: { from: k1 + k2, jumps: countJumps(x) },
    };
  }
  const k = terms[1 - idx] as number;
  switch (op) {
    case 'add':
      return { ...addMissing(cat, k, result, x), summary };
    case 'sub': {
      if (idx === 1) {
        // m − □ = r  →  r + □ = m
        const inner = addMissing(cat, result, k, x);
        return {
          ...inner,
          strategy: inner.strategy === 'make10' ? 'countUp' : inner.strategy,
          summary,
          firstStep: `Pomyśl: ${result} + ${BOX} = ${k}. ${inner.firstStep}`,
        };
      }
      // □ − s = r  →  r + s
      const inner = addHint(cat, result, k);
      return { ...inner, summary, firstStep: `Dodaj z powrotem: ${result} + ${k}. ${inner.firstStep}` };
    }
    case 'mul':
      return {
        strategy: 'inverseMul',
        steps: [`Szukamy: ${boxed}`, `${formatTerms(op, terms)} = ${result}`, `${result} : ${k} = ${x}`],
        summary,
        firstStep: `Pomyśl: ${k} razy ile daje ${result}?`,
        blocks: { rows: k, cols: x },
      };
    case 'div': {
      if (idx === 1) {
        // p : □ = q
        return {
          strategy: 'inverseMul',
          steps: [`Szukamy: ${boxed}`, times(result, x), `${k} : ${x} = ${result}`],
          summary,
          firstStep: `Pomyśl: ${result} razy ile daje ${k}?`,
          blocks: { rows: x, cols: result, highlightRows: 1 },
        };
      }
      // □ : k = q
      return {
        strategy: 'inverseMul',
        steps: [`Szukamy: ${boxed}`, times(result, k), `${x} : ${k} = ${result}`],
        summary,
        firstStep: `Pomnóż: ${result} razy ${k}.`,
        blocks: { rows: k, cols: result, highlightRows: 1 },
      };
    }
  }
}

function resultHint(cat: CategoryId, e: TaskEquation): HintCore {
  const [a = 0, b = 0] = e.terms;
  switch (e.op) {
    case 'add':
      return e.terms.length === 3 ? threeHint(e.terms) : addHint(cat, a, b);
    case 'sub':
      return subHint(a, b);
    case 'mul':
      return mulHint(a, b);
    case 'div':
      return divHint(a, b);
  }
}

/**
 * Podpowiedź-strategia dla zadania (GDD 5.4): tytuł, 1–3 kroki, podsumowanie,
 * wizualizacja (oś liczbowa dla + i −, kostki dla × i :) oraz pierwszy krok bez wyniku.
 */
export function hintFor(task: Task): Hint {
  const e = taskEquation(task);
  const core = e.missingIndex === null ? resultHint(task.categoryId, e) : missingHint(task.categoryId, e, e.missingIndex);
  const firstStep = revealsAnswer(core.firstStep, task.answer) ? SAFE_FIRST_STEP[core.strategy] : core.firstStep;
  return { ...core, title: TITLES[core.strategy], firstStep };
}
