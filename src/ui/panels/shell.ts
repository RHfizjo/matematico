/**
 * Wspólna „skorupa” paneli: przyciemnienie tła, arkusz z nagłówkiem, przycisk zamknięcia,
 * sprzątanie po zamknięciu, kafelki cyfr, portrety, dymki.
 */
import type { ModelId } from '../../game/contracts';
import type { Digits } from '../../core/types';
import type { UiContext } from '../context';
import { h, hideAndRemove, onTap, show, type Layer } from '../dom';
import { digitRarity } from './util';
import './panels.css';

export interface ShellOpts {
  /** Motyw (klasa pn-theme-<theme>), np. 'pen', 'gate'. */
  theme: string;
  title?: string;
  /** Emoji ikony w nagłówku. */
  icon?: string;
  subtitle?: string;
  layer?: Layer;
  /** 'full' = prawie cały ekran; 'dialog' = mniejsze okno. */
  size?: 'full' | 'dialog';
  /** Gdy podane — w nagłówku jest okrągły przycisk ✕. */
  onClose?: () => void;
  /** Bez standardowego nagłówka (panel buduje własny). */
  bare?: boolean;
}

export interface Shell {
  scrim: HTMLElement;
  sheet: HTMLElement;
  head: HTMLElement;
  /** Miejsce po prawej stronie nagłówka (przed ✕). */
  headExtra: HTMLElement;
  body: HTMLElement;
  onDispose(fn: () => void): void;
  /** Zamknięcie z animacją i sprzątaniem (idempotentne). */
  close(): Promise<void>;
  readonly closed: boolean;
}

export function openShell(ctx: UiContext, opts: ShellOpts): Shell {
  const disposers: (() => void)[] = [];
  let closed = false;
  const headExtra = h('div', { class: 'pn-head-extra' });
  const closeBtn = opts.onClose
    ? h('button', { class: 'pn-close', attrs: { type: 'button', 'aria-label': 'Zamknij' } }, closeIcon())
    : null;
  if (closeBtn && opts.onClose) {
    const cb = opts.onClose;
    disposers.push(
      onTap(closeBtn, () => {
        ctx.sfx('tap');
        cb();
      }),
    );
  }
  const head = h(
    'header',
    { class: 'pn-head' },
    opts.icon ? h('div', { class: 'pn-head-icon', attrs: { 'aria-hidden': 'true' } }, opts.icon) : null,
    h(
      'div',
      { class: 'pn-head-text' },
      h('h2', { class: 'pn-title' }, opts.title ?? ''),
      opts.subtitle ? h('div', { class: 'pn-subtitle' }, opts.subtitle) : null,
    ),
    headExtra,
    closeBtn,
  );
  const body = h('div', { class: 'pn-body' });
  const sheet = h(
    'section',
    {
      class: `pn-sheet pn-${opts.size ?? 'full'}`,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title ?? '' },
    },
    opts.bare ? null : head,
    body,
  );
  const scrim = h('div', { class: `pn-scrim pn-theme-${opts.theme}` }, sheet);
  ctx.layers[opts.layer ?? 'panel'].append(scrim);
  void show(sheet);

  return {
    scrim,
    sheet,
    head,
    headExtra,
    body,
    onDispose: fn => disposers.push(fn),
    get closed() {
      return closed;
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const d of disposers.splice(0)) {
        try {
          d();
        } catch {
          /* sprzątanie nie może przerwać zamykania */
        }
      }
      scrim.classList.add('pn-leaving');
      await hideAndRemove(sheet);
      scrim.remove();
    },
  };
}

/** Obietnica rozwiązywana dokładnie raz. */
export function once<T>(): { promise: Promise<T>; resolve: (v: T) => void; readonly done: boolean } {
  let res!: (v: T) => void;
  let done = false;
  const promise = new Promise<T>(r => (res = r));
  return {
    promise,
    get done() {
      return done;
    },
    resolve(v: T) {
      if (done) return;
      done = true;
      res(v);
    },
  };
}

export function closeIcon(): SVGSVGElement {
  return svg('<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg>');
}

export function lockIcon(size = 22): SVGSVGElement {
  return svg(
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" class="pn-lock-ic">` +
      '<path d="M7 10 V7.5 a5 5 0 0 1 10 0 V10" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>' +
      '<rect x="4" y="10" width="16" height="11" rx="3" fill="currentColor"/>' +
      '<circle cx="12" cy="15.5" r="1.8" fill="#fff"/></svg>',
  );
}

export function svg(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGSVGElement;
}

/** Kafelek cyfry w kolorze rzadkości. */
export function digitTile(d: number, opts?: { count?: number; cls?: string }): HTMLElement {
  const el = h(
    'div',
    {
      class: `pn-digit r-${digitRarity(d)}${opts?.cls ? ' ' + opts.cls : ''}`,
      dataset: { digit: String(d) },
    },
    h('span', { class: 'pn-digit-n' }, String(d)),
  );
  if (opts?.count !== undefined) el.append(h('span', { class: 'pn-digit-c' }, `×${opts.count}`));
  return el;
}

/** Kompaktowy pasek skarbca (tylko do podglądu), np. w kuźni i u handlarza. */
export function digitStrip(digits: Digits, label = 'Twoje cyfry'): HTMLElement {
  const row = h('div', { class: 'pn-strip-row' });
  for (let d = 0; d < 10; d++) {
    const n = digits[d] ?? 0;
    const t = digitTile(d, { cls: `pn-digit-mini${n === 0 ? ' is-empty' : ''}` });
    t.append(h('span', { class: 'pn-mini-c' }, String(n)));
    row.append(t);
  }
  return h('div', { class: 'pn-strip' }, h('span', { class: 'pn-strip-label' }, label), row);
}

/** Portret w ramce; gdy brak obrazka — zastępcza sylwetka z literą. */
export function portraitBox(
  ctx: UiContext,
  model: ModelId,
  opts: { cls?: string; fallback: string; silhouette?: boolean },
): HTMLElement {
  const img = h('img', { class: 'pn-portrait-img', attrs: { alt: '', draggable: 'false' } });
  const box = h('div', { class: `pn-portrait${opts.silhouette ? ' is-silhouette' : ''} ${opts.cls ?? ''}`.trim() }, img);
  box.dataset.fallback = opts.fallback;
  ctx
    .portrait(model)
    .then(url => {
      if (url) {
        img.src = url;
        box.classList.add('has-art');
      } else box.classList.add('no-art');
    })
    .catch(() => box.classList.add('no-art'));
  return box;
}

/** Gwiazdki poziomu, np. ★★☆. */
export function levelStars(level: number, max = 3): HTMLElement {
  const el = h('span', { class: 'pn-stars', attrs: { 'aria-label': `poziom ${level} z ${max}` } });
  for (let i = 1; i <= max; i++) el.append(h('span', { class: i <= level ? 'on' : 'off' }, '★'));
  return el;
}

/** Dymek z tekstem (styl: info / warn / good). */
export function bubble(text: string, kind: 'info' | 'warn' | 'good' = 'info', icon?: string): HTMLElement {
  return h(
    'div',
    { class: `pn-bubble pn-bubble-${kind}`, attrs: { role: 'status' } },
    icon ? h('span', { class: 'pn-bubble-ic', attrs: { 'aria-hidden': 'true' } }, icon) : null,
    h('span', { class: 'pn-bubble-t' }, text),
  );
}

/** Nasłuch zdarzenia z automatycznym odpięciem przy zamknięciu. */
export function listen<K extends keyof WindowEventMap>(
  shell: Shell,
  target: Window,
  type: K,
  fn: (e: WindowEventMap[K]) => void,
): void {
  target.addEventListener(type, fn);
  shell.onDispose(() => target.removeEventListener(type, fn));
}

/** Pole przewijane dotykiem (html ma touch-action: none). */
export function scroller(cls: string, ...children: (Node | null)[]): HTMLElement {
  return h('div', { class: `pn-scroll ${cls}` }, ...children);
}

/** Czy użytkownik prosi o mniej ruchu. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
