/**
 * Czysta matematyka pływającej gałki (bez DOM) — testowana jednostkowo.
 * Układ ekranu: dx w prawo, dy W DÓŁ (jak clientX/clientY). Wynik ruchu: x w prawo, y W GÓRĘ.
 */

export interface Point {
  x: number;
  y: number;
}

export interface StickOutput {
  /** Wektor ruchu (x w prawo, y w górę ekranu), długość 0..1. */
  x: number;
  y: number;
  /** Długość wektora ruchu (0..1) po martwej strefie. */
  magnitude: number;
  /** Przesunięcie gałki względem środka podstawy w px ekranu (dy w dół), obcięte do promienia. */
  knobX: number;
  knobY: number;
}

export interface StickOptions {
  /** Martwa strefa jako ułamek promienia (domyślnie 0.15). */
  deadzone?: number;
  /**
   * Zewnętrzna strefa: od tego ułamka promienia ruch ma pełną długość 1 (domyślnie 0.92),
   * żeby dziecko łatwo osiągało pełną prędkość bez dociskania do samej krawędzi.
   */
  outer?: number;
}

export const DEFAULT_DEADZONE = 0.15;
export const DEFAULT_OUTER = 0.92;

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Wektor ruchu z przesunięcia palca względem środka podstawy.
 * Poniżej martwej strefy → 0; powyżej długość przeskalowana liniowo (dz..outer → 0..1), kierunek zachowany.
 */
export function stickVector(dx: number, dy: number, radius: number, opts?: StickOptions): StickOutput {
  const dz = Math.min(Math.max(opts?.deadzone ?? DEFAULT_DEADZONE, 0), 0.95);
  const outer = Math.min(Math.max(opts?.outer ?? DEFAULT_OUTER, dz + 0.01), 1);
  dx = finite(dx);
  dy = finite(dy);
  const r = radius > 0 && Number.isFinite(radius) ? radius : 1;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0, magnitude: 0, knobX: 0, knobY: 0 };

  const ux = dx / dist;
  const uy = dy / dist;
  const knobDist = Math.min(dist, r);
  const knobX = ux * knobDist;
  const knobY = uy * knobDist;

  const raw = Math.min(dist / r, 1);
  if (raw <= dz) return { x: 0, y: 0, magnitude: 0, knobX, knobY };
  const magnitude = Math.min(1, (raw - dz) / (outer - dz));
  // y w górę ekranu = −dy
  return { x: ux * magnitude, y: -uy * magnitude + 0, magnitude, knobX, knobY };
}

/**
 * „Podążająca” podstawa: gdy palec wyjedzie poza promień, podstawa przesuwa się za nim
 * (tak, by palec był dokładnie na krawędzi). Dzięki temu zmiana kierunku jest natychmiastowa.
 */
export function followBase(base: Point, finger: Point, radius: number): Point {
  const dx = finger.x - base.x;
  const dy = finger.y - base.y;
  const dist = Math.hypot(dx, dy);
  if (!(dist > radius) || radius <= 0) return { x: base.x, y: base.y };
  const k = (dist - radius) / dist;
  return { x: base.x + dx * k, y: base.y + dy * k };
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Środek podstawy tak, żeby całe koło (promień + margines) zmieściło się w prostokącie. */
export function clampBase(p: Point, radius: number, rect: Rect, margin = 0): Point {
  const pad = radius + margin;
  const clamp1 = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
  return {
    x: clamp1(p.x, rect.left + pad, rect.right - pad),
    y: clamp1(p.y, rect.top + pad, rect.bottom - pad),
  };
}
