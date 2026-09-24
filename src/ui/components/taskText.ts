/**
 * Tekst działania dla dziecka: "8 + 7 = ?", "3 + □ = 10", "15 − 8 = ?".
 * Niewiadoma (□ lub ?) staje się wyróżnionym „okienkiem” (.task-slot), do którego wpada odpowiedź.
 */
import { h } from '../dom';

export type TaskToken = { t: 'num'; v: string } | { t: 'op'; v: string } | { t: 'eq' } | { t: 'slot' };

const OP_NORMALIZE: Record<string, string> = { '-': '−', '*': '×', x: '×', '/': ':' };

/** Rozbija tekst działania na liczby, znaki, „=” i niewiadomą. */
export function tokenizeTask(text: string): TaskToken[] {
  const out: TaskToken[] = [];
  let num = '';
  const flush = (): void => {
    if (num) out.push({ t: 'num', v: num });
    num = '';
  };
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      num += ch;
      continue;
    }
    flush();
    if (ch.trim() === '') continue;
    if (ch === '=') out.push({ t: 'eq' });
    else if (ch === '?' || ch === '□') out.push({ t: 'slot' });
    else out.push({ t: 'op', v: OP_NORMALIZE[ch] ?? ch });
  }
  flush();
  return out;
}

/** Klasa rozmiaru tekstu zależnie od długości (żeby „4 + 6 + 3 = ?” zmieściło się w panelu). */
export function taskSizeClass(tokens: TaskToken[]): '' | 'long' | 'xlong' {
  const len = tokens.reduce((s, t) => s + (t.t === 'num' ? t.v.length : 1), 0);
  if (len > 11) return 'xlong';
  if (len > 8) return 'long';
  return '';
}

export interface TaskView {
  el: HTMLElement;
  /** Okienko niewiadomej (jeśli jest). */
  slot: HTMLElement | null;
  setSlot(text: string, state?: 'empty' | 'typing' | 'good' | 'bad'): void;
}

export function renderTask(text: string, extraClass = ''): TaskView {
  const tokens = tokenizeTask(text);
  let slot: HTMLElement | null = null;
  const el = h('div', { class: `task-text ${taskSizeClass(tokens)} ${extraClass}`.trim(), attrs: { 'aria-label': text } });
  for (const t of tokens) {
    if (t.t === 'num') el.append(h('span', { class: 'task-num' }, t.v));
    else if (t.t === 'op') el.append(h('span', { class: 'task-op' }, t.v));
    else if (t.t === 'eq') el.append(h('span', { class: 'task-op task-eq' }, '='));
    else {
      slot = h('span', { class: 'task-slot is-empty' }, h('span', { class: 'task-slot-v' }, '?'));
      el.append(slot);
    }
  }
  const setSlot = (v: string, state: 'empty' | 'typing' | 'good' | 'bad' = 'typing'): void => {
    if (!slot) return;
    const inner = slot.firstElementChild as HTMLElement | null;
    if (inner) inner.textContent = v === '' ? '?' : v;
    slot.className = `task-slot is-${v === '' ? 'empty' : state}`;
  };
  return { el, slot, setSlot };
}
