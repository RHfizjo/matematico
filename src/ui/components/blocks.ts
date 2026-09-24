/**
 * Prostokąt z kostek (podpowiedzi do mnożenia i dzielenia): rows × cols kostek,
 * pierwsze `highlightRows` rzędów złote. Rzędy pojawiają się po kolei.
 */
import { h } from '../dom';
import { plural } from '../util';

export interface BlocksView {
  el: HTMLElement;
  play(ms: number): Promise<void>;
  finish(): void;
  stop(): void;
}

export function blocksGrid(
  spec: { rows: number; cols: number; highlightRows?: number },
  opts: { maxW?: number; maxH?: number } = {},
): BlocksView {
  const rows = Math.max(1, Math.min(12, Math.round(spec.rows)));
  const cols = Math.max(1, Math.min(12, Math.round(spec.cols)));
  const hl = Math.max(0, Math.min(rows, spec.highlightRows ?? 0));
  const maxW = opts.maxW ?? 560;
  const maxH = opts.maxH ?? 300;
  const gap = 5;
  const size = Math.floor(Math.max(14, Math.min(50, (maxW - gap * (cols - 1)) / cols, (maxH - gap * (rows - 1)) / rows)));
  const grid = h('div', {
    class: 'blocks',
    style: { gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: `${gap}px` },
    attrs: { role: 'img', 'aria-label': `${rows} ${plural(rows, 'rząd', 'rzędy', 'rzędów')} po ${cols} ${plural(cols, 'kostce', 'kostki', 'kostek')}` },
  });
  grid.style.setProperty('--cube', `${size}px`);
  const rowEls: HTMLElement[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: HTMLElement[] = [];
    for (let c = 0; c < cols; c++) {
      const cube = h('div', { class: `cube${r < hl ? ' cube-hl' : ''} cube-hidden` });
      grid.append(cube);
      row.push(cube);
    }
    rowEls.push(row);
  }
  const wrap = h('div', { class: 'blocks-wrap' }, grid);

  let timers: ReturnType<typeof setTimeout>[] = [];
  let done: (() => void) | null = null;
  const showRow = (r: number): void => {
    for (const c of rowEls[r] ?? []) c.classList.remove('cube-hidden');
  };
  const finish = (): void => {
    for (const t of timers) clearTimeout(t);
    timers = [];
    for (let r = 0; r < rows; r++) showRow(r);
    done?.();
    done = null;
  };
  return {
    el: wrap,
    play(ms: number) {
      return new Promise<void>(resolve => {
        done = resolve;
        const per = ms / rows;
        for (let r = 0; r < rows; r++) timers.push(setTimeout(() => showRow(r), r * per));
        timers.push(setTimeout(finish, ms + 50));
      });
    },
    finish,
    stop() {
      for (const t of timers) clearTimeout(t);
      timers = [];
      done = null;
    },
  };
}
