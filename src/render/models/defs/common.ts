/**
 * Wspólne elementy definicji modeli: typ ModelDef, oczy, brokat (drobinki), cyfry z pikseli.
 */
import type { AnimName } from '../../../game/contracts';
import type { ModelBuilder, V3 } from '../builder';
import type { MotionFn } from '../rig';

export interface BuildOpts {
  color?: string;
}

export interface ModelDef {
  height: number;
  radius: number;
  /** Materiał bazowy brainglama (delikatna poświata). */
  glam?: boolean;
  build(b: ModelBuilder, opts: BuildOpts): void;
  /** Ruchy — tworzone dla każdej instancji (mogą mieć stan). */
  motions(): MotionFn[];
  holds?: AnimName[];
  durations?: Partial<Record<AnimName, number>>;
  receiveShadow?: boolean;
  /** Skala całego modelu przy budowie (wymiary w build() podane „przed skalą”). height/radius — PO skali. */
  scale?: number;
}

export const INK = '#1f2233';
export const WHITE = '#ffffff';
export const BLUSH = '#ff9eb5';

/**
 * Para oczu na płaszczyźnie z = z (przód), środek pary w (0, y), rozstaw ±dx.
 * Oko: ciemny prostokąt + biały błysk (lewy górny róg). Dodawane do części `pivot`.
 */
export function eyePair(
  b: ModelBuilder,
  pivot: string,
  o: { x?: number; y: number; z: number; dx: number; w: number; h: number; color?: string; shine?: boolean },
): void {
  const cx = o.x ?? 0;
  const col = o.color ?? INK;
  for (const s of [1, -1]) {
    const x = cx + s * o.dx;
    b.box(pivot, [o.w, o.h, 0.03], [x, o.y, o.z], col, { shade: 1 });
    if (o.shine !== false) {
      const sw = Math.max(0.025, o.w * 0.38);
      b.box(pivot, [sw, sw, 0.02], [x - o.w * 0.22, o.y + o.h * 0.22, o.z + 0.02], WHITE, { shade: 1 });
    }
  }
}

/** Rzęsy nad parą oczu (brainglamy) — trzy kreski na oko. */
export function lashes(b: ModelBuilder, pivot: string, o: { x?: number; y: number; z: number; dx: number; w: number }): void {
  const cx = o.x ?? 0;
  for (const s of [1, -1]) {
    const x = cx + s * o.dx;
    const l = 0.035 + o.w * 0.12;
    b.box(pivot, [0.025, l, 0.02], [x + s * o.w * 0.55, o.y + 0.01, o.z], INK, { rot: [0, 0, -s * 0.9] });
    b.box(pivot, [0.025, l, 0.02], [x + s * o.w * 0.25, o.y + 0.03, o.z], INK, { rot: [0, 0, -s * 0.45] });
    b.box(pivot, [0.025, l, 0.02], [x - s * o.w * 0.1, o.y + 0.035, o.z], INK, { rot: [0, 0, -s * 0.15] });
  }
}

/** Rumieńce. */
export function cheeks(b: ModelBuilder, pivot: string, o: { y: number; z: number; dx: number; w?: number; color?: string }): void {
  const w = o.w ?? 0.09;
  b.pair(pivot, pivot, [w, w * 0.55, 0.02], [o.dx, o.y, o.z], o.color ?? BLUSH, { shade: 1 });
}

/**
 * Drobinki brokatu wokół modelu (świecące kostki na orbicie). Dodawane do części 'sparkles'
 * (musi istnieć). Deterministyczne rozmieszczenie.
 */
export function sparkles(
  b: ModelBuilder,
  o: { count: number; radius: number; y0: number; y1: number; size?: number; colors?: string[]; seed?: number },
): void {
  const colors = o.colors ?? ['#ffe27a', '#ffb3e6', '#ffffff'];
  const size = o.size ?? 0.055;
  let s = o.seed ?? 7;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < o.count; i++) {
    const a = (i / o.count) * Math.PI * 2 + rnd() * 0.5;
    const r = o.radius * (0.85 + rnd() * 0.3);
    const y = o.y0 + (o.y1 - o.y0) * rnd();
    const c = colors[i % colors.length] ?? '#ffffff';
    const k = size * (0.7 + rnd() * 0.6);
    b.box('sparkles', [k, k, k], [Math.cos(a) * r, y, Math.sin(a) * r], c, { glow: 2.0, rot: [0.6, 0.8, 0.3] });
  }
}

/** Cyfry 3×5 (wiersze od góry). „1” z podstawą, „7” bez — łatwe do odróżnienia (GDD 15). */
export const DIGIT_FONT: readonly (readonly string[])[] = [
  ['111', '101', '101', '101', '111'],
  ['010', '110', '010', '010', '111'],
  ['111', '001', '111', '100', '111'],
  ['111', '001', '011', '001', '111'],
  ['101', '101', '111', '001', '001'],
  ['111', '100', '111', '001', '111'],
  ['111', '100', '111', '101', '111'],
  ['111', '001', '001', '010', '010'],
  ['111', '101', '111', '101', '111'],
  ['111', '101', '111', '001', '111'],
];

/** Liczba z kostek pikselowych na płaszczyźnie XY (przód +Z), wyśrodkowana w `center`. */
export function pixelNumber(
  b: ModelBuilder,
  pivot: string,
  text: string,
  center: V3,
  px: number,
  color: string,
  opts: { glow?: number; depth?: number } = {},
): void {
  const digits = [...text].map(ch => DIGIT_FONT[Number(ch)]).filter((g): g is readonly string[] => !!g);
  const width = digits.length * 3 + (digits.length - 1);
  const x0 = center[0] - (width * px) / 2 + px / 2;
  const y0 = center[1] + (5 * px) / 2 - px / 2;
  digits.forEach((g, di) => {
    g.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '1') return;
        const x = x0 + (di * 4 + rx) * px;
        const y = y0 - ry * px;
        b.box(pivot, [px, px, opts.depth ?? px * 0.6], [x, y, center[2]], color, { glow: opts.glow, shade: 1 });
      });
    });
  });
}

/** Wahadłowy ruch drobinek brokatu (obrót części 'sparkles'). */
export const sparkleMotion: MotionFn = (c, w) => {
  w.rot('sparkles', 0, c.time * 0.9, 0);
  const tw = 1 + 0.12 * Math.sin(c.time * 5);
  w.scale('sparkles', tw, 1, tw);
  w.pos('sparkles', 0, 0.05 * Math.sin(c.time * 1.9), 0);
};
