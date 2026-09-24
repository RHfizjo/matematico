/**
 * Drobne narzędzia wspólne dla modułów UI (bez zależności od DOM tam, gdzie to możliwe — testowalne).
 */
import { h } from './dom';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Polska odmiana liczebnika: plural(1,'minuta','minuty','minut') → 'minuta',
 * 2–4 (poza 12–14) → forma „few”, reszta → „many”.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.trunc(n));
  if (a === 1) return one;
  const d = a % 10;
  const dd = a % 100;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

/** Znak liczby dla dziecka: +3 / −3 (U+2212). */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/** Pełnoekranowe tło modalne (przechwytuje dotyk). Zawartość dokładamy do zwróconego elementu. */
export function modal(layer: HTMLElement, cls: string): HTMLDivElement {
  const el = h('div', { class: `ui-modal ${cls}` });
  layer.append(el);
  return el;
}

/** Nasłuch klawiatury na oknie (tylko testy deweloperskie). Zwraca funkcję odpinającą. */
export function onKey(cb: (e: KeyboardEvent) => void): () => void {
  const fn = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    cb(e);
  };
  window.addEventListener('keydown', fn);
  return () => window.removeEventListener('keydown', fn);
}

/** Opóźnienie z możliwością anulowania wszystkich naraz (przy zamykaniu panelu). */
export class Timers {
  private ids = new Set<ReturnType<typeof setTimeout>>();
  private raf = new Set<number>();
  after(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.ids.delete(id);
      fn();
    }, ms);
    this.ids.add(id);
  }
  frame(fn: (t: number) => void): void {
    const id = requestAnimationFrame(t => {
      this.raf.delete(id);
      fn(t);
    });
    this.raf.add(id);
  }
  clear(): void {
    for (const id of this.ids) clearTimeout(id);
    for (const id of this.raf) cancelAnimationFrame(id);
    this.ids.clear();
    this.raf.clear();
  }
}

/** Ogranicza „prefers-reduced-motion” do jednego miejsca. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
