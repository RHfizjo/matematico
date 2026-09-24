/**
 * Mały zestaw narzędzi DOM dla całego UI (bez frameworka).
 * Wszystkie panele budujemy przez h() i obsługujemy dotyk przez onTap().
 */

type Child = Node | string | number | null | undefined | false;
type Props = {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  text?: string;
  html?: string;
} & Partial<Omit<HTMLElement, 'style' | 'dataset'>>;

/** Tworzy element: h('div', { class: 'panel' }, 'tekst', h('span')). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    const { class: cls, style, attrs, dataset, text, html, ...rest } = props;
    if (cls) el.className = cls;
    if (typeof style === 'string') el.setAttribute('style', style);
    else if (style) Object.assign(el.style, style);
    if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (dataset) for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
    if (text !== undefined) el.textContent = text;
    if (html !== undefined) el.innerHTML = html;
    Object.assign(el, rest);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Niezawodne „dotknięcie” dla tabletu: pointerdown + pointerup w tym samym elemencie,
 * tolerancja ruchu 12 px, bez opóźnienia kliknięcia. Zwraca funkcję odpinającą.
 */
export function onTap(el: HTMLElement, cb: (ev: PointerEvent) => void, opts?: { tolerancePx?: number }): () => void {
  const tol = opts?.tolerancePx ?? 12;
  let start: { id: number; x: number; y: number } | null = null;
  const down = (e: PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    el.classList.add('is-pressed');
  };
  const up = (e: PointerEvent): void => {
    el.classList.remove('is-pressed');
    if (!start || start.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    start = null;
    if (moved > tol) return;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault();
    cb(e);
  };
  const cancel = (): void => {
    start = null;
    el.classList.remove('is-pressed');
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  // Klawiatura/dostępność: Enter/Spacja na przyciskach.
  const key = (e: KeyboardEvent): void => {
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === el) {
      e.preventDefault();
      cb(new PointerEvent('pointerup'));
    }
  };
  el.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('pointerleave', cancel);
    el.removeEventListener('keydown', key);
  };
}

/** Przycisk z etykietą; klasy: 'btn' + opcjonalne warianty ('btn-primary', 'btn-big', 'btn-ghost'). */
export function button(label: string | Node, onPress: () => void, variant = ''): HTMLButtonElement {
  const b = h('button', { class: `btn ${variant}`.trim(), attrs: { type: 'button' } }, label);
  onTap(b, () => onPress());
  return b;
}

/**
 * Warstwy nakładki UI (z-index rosnąco): hud < cards < panel < dialog < toast < fade.
 * Każda warstwa to osobny kontener w #ui; panele montujemy w odpowiedniej warstwie.
 */
export type Layer = 'hud' | 'cards' | 'panel' | 'dialog' | 'toast' | 'fade';
const LAYERS: Layer[] = ['hud', 'cards', 'panel', 'dialog', 'toast', 'fade'];

export function ensureLayers(root: HTMLElement): Record<Layer, HTMLElement> {
  const out = {} as Record<Layer, HTMLElement>;
  LAYERS.forEach((name, i) => {
    let el = root.querySelector<HTMLElement>(`:scope > .layer-${name}`);
    if (!el) {
      el = h('div', { class: `layer layer-${name}`, style: { zIndex: String(10 + i * 10) } });
      root.append(el);
    }
    out[name] = el;
  });
  return out;
}

/** Animacja wejścia/wyjścia przez klasy CSS (.enter → .shown, .leave). */
export function show(el: HTMLElement): Promise<void> {
  el.classList.add('enter');
  // wymuszenie reflow, żeby przejście zadziałało
  void el.offsetWidth;
  el.classList.add('shown');
  return wait(220);
}

export async function hideAndRemove(el: HTMLElement): Promise<void> {
  el.classList.remove('shown');
  el.classList.add('leave');
  await wait(200);
  el.remove();
}

export function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Formatowanie liczb i znaków działań dla dziecka (U+2212 minus, U+00D7 razy). */
export const SIGN = { plus: '+', minus: '−', times: '×', div: ':' } as const;
