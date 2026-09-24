/**
 * Podpowiedź po błędzie (GDD 5.4): tytuł strategii, animowana oś liczbowa ze skokami albo prostokąt z kostek,
 * kroki pojawiające się po kolei, podsumowanie. „Dalej” (wypełnia się z czasem) albo auto-zamknięcie po maxMs.
 * watchedFully = dziecko zobaczyło całą animację (auto-zamknięcie lub „Dalej” po jej końcu).
 */
import type { Hint } from '../core/types';
import { blocksGrid } from './components/blocks';
import { numberLine } from './components/numberLine';
import type { UiContext } from './context';
import { h, hideAndRemove, onTap, show } from './dom';
import { icon } from './icons';
import { clamp, modal, onKey, Timers } from './util';

export function hintPanel(ctx: UiContext, hint: Hint, opts?: { maxMs?: number; title?: string }): Promise<{ watchedFully: boolean }> {
  return new Promise(resolve => {
    const maxMs = Math.max(1500, opts?.maxMs ?? 6000);
    const animEnd = clamp(maxMs * 0.72, 1200, maxMs - 600);
    const timers = new Timers();
    const t0 = performance.now();
    let closed = false;

    const root = modal(ctx.layers.panel, 'hint-modal');
    const kind: 'line' | 'blocks' | 'text' = hint.numberLine ? 'line' : hint.blocks ? 'blocks' : 'text';
    const panel = h('div', { class: `panel hint-panel hint-${kind}` });

    let viz: { el: Element; play(ms: number): Promise<void>; finish(): void; stop(): void } | null = null;
    if (hint.numberLine) viz = numberLine(hint.numberLine, { width: 900, height: 220 });
    else if (hint.blocks) viz = blocksGrid(hint.blocks, { maxW: 470, maxH: 330 });

    const steps = h('ol', { class: 'hint-steps' });
    const stepEls = hint.steps.map((s, i) => {
      const li = h('li', { class: 'hint-step is-hidden' }, h('span', { class: 'hint-step-n' }, String(i + 1)), h('span', { class: 'hint-step-t' }, s));
      steps.append(li);
      return li;
    });
    const summary = h('div', { class: 'hint-summary is-hidden' }, icon('check', 'hint-sum-ic'), h('span', null, hint.summary));
    const fill = h('span', { class: 'hint-next-fill' });
    const next = h('button', { class: 'btn btn-primary btn-big hint-next', attrs: { type: 'button' } }, fill, h('span', { class: 'hint-next-t' }, 'Dalej'), icon('arrow'));

    const head = h(
      'div',
      { class: 'hint-head' },
      h('div', { class: 'hint-kicker' }, opts?.title ?? 'Zobacz, jak to policzyć'),
      h('div', { class: 'hint-title' }, icon('bulb', 'hint-bulb'), h('span', null, hint.title)),
    );
    const vizBox = viz ? h('div', { class: 'hint-viz' }, viz.el) : null;
    const content =
      kind === 'blocks'
        ? h('div', { class: 'hint-row' }, vizBox, h('div', { class: 'hint-col' }, steps, summary))
        : h('div', { class: 'hint-colmain' }, vizBox, steps, summary);
    panel.append(head, content, h('div', { class: 'hint-foot' }, next));
    root.append(panel);
    void show(panel);

    const finishAll = (): void => {
      viz?.finish();
      for (const li of stepEls) li.classList.remove('is-hidden');
      summary.classList.remove('is-hidden');
    };

    const close = (): void => {
      if (closed) return;
      closed = true;
      const watchedFully = performance.now() - t0 >= animEnd - 50;
      timers.clear();
      viz?.stop();
      keyOff();
      ctx.sfx('tap');
      void hideAndRemove(root).then(() => resolve({ watchedFully }));
    };

    // Harmonogram animacji
    const startDelay = 350;
    const vizMs = Math.max(600, animEnd * 0.85 - startDelay);
    if (viz) {
      const v = viz;
      timers.after(startDelay, () => void v.play(vizMs));
    }
    const n = stepEls.length;
    stepEls.forEach((li, i) => {
      const at = viz ? startDelay + (vizMs * (i + 1)) / Math.max(1, n) - 120 : startDelay + ((animEnd - startDelay) * i) / Math.max(1, n);
      timers.after(Math.max(200, at), () => li.classList.remove('is-hidden'));
    });
    timers.after(animEnd, () => {
      finishAll();
    });
    fill.style.animationDuration = `${maxMs}ms`;
    timers.after(maxMs, close);

    let armed = false;
    timers.after(400, () => (armed = true));
    onTap(next, () => {
      if (armed) close();
    });
    const keyOff = onKey(e => {
      if (armed && (e.key === 'Enter' || e.key === ' ')) close();
    });
  });
}
