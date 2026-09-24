/**
 * Panel odpowiedzi na zadanie (walka, łapanie, karmienie, skrzynia, kalibracja).
 *  - działanie OGROMNĄ czcionką, niewiadoma jako wyróżnione okienko, do którego „wpada” odpowiedź,
 *  - 3–4 duże przyciski (format choice/missing) albo klawiatura numeryczna (typed),
 *  - blokada wejścia (domyślnie 300 ms), czas mierzony od odblokowania do PIERWSZEJ odpowiedzi,
 *  - opcjonalny pierścień czasu (bez liczb): domyka się w limitMs; później odpowiedź nadal jest przyjmowana
 *    (wynik „po limicie”), a po 2 × limitMs panel zamyka się z timedOut = true,
 *  - pomoc „Oś” (pierwszy krok + mini oś), POPRAWKA po pierwszym błędzie (krótka podpowiedź, drugi wybór).
 */
import type { AnswerRequest, AnswerResult } from '../game/contracts';
import type { Hint } from '../core/types';
import { blocksGrid } from './components/blocks';
import { cardFace } from './components/cardFace';
import { numberLine } from './components/numberLine';
import { renderTask } from './components/taskText';
import type { UiContext } from './context';
import { h, hideAndRemove, onTap, show } from './dom';
import { icon } from './icons';
import { modal, onKey, Timers } from './util';

/** Krótka wizualizacja do pomocy „Oś” i POPRAWKI — nie zdradza wyniku (tylko pierwszy skok). */
export function miniHintViz(hint: Hint): { el: Element; play(): void; stop(): void } | null {
  if (hint.numberLine && hint.numberLine.jumps.length > 0) {
    const shown = hint.numberLine.jumps.length > 1 ? 1 : 0;
    const v = numberLine(hint.numberLine, { compact: true, shown });
    return { el: v.el, play: () => void v.play(900), stop: v.stop };
  }
  if (hint.blocks) {
    const v = blocksGrid(hint.blocks, { maxW: 460, maxH: 130 });
    return { el: v.el, play: () => void v.play(700), stop: v.stop };
  }
  return null;
}

export function sparkle(layer: HTMLElement, at: HTMLElement, colors = ['#ffd23f', '#3ccf6e', '#ffffff', '#58c4ff']): void {
  const r = at.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const box = h('div', { class: 'sparkles passthrough' });
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = 70 + Math.random() * 60;
    const sp = h('i', { class: 'spk' });
    sp.style.left = `${cx}px`;
    sp.style.top = `${cy}px`;
    sp.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    sp.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    sp.style.setProperty('--c', colors[i % colors.length] ?? '#ffd23f');
    sp.style.animationDelay = `${Math.random() * 60}ms`;
    box.append(sp);
  }
  layer.append(box);
  setTimeout(() => box.remove(), 900);
}

function restartClass(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export function answerPanel(ctx: UiContext, req: AnswerRequest): Promise<AnswerResult> {
  return new Promise(resolve => {
    const { task, hint } = req;
    const lockMs = Math.max(0, req.inputLockMs ?? 300);
    const typed = task.format === 'typed' || task.options.length === 0;
    const limit = req.limitMs !== null && req.limitMs > 0 ? req.limitMs : null;
    const timers = new Timers();

    let locked = true;
    let finished = false;
    let unlockT = performance.now() + lockMs;
    let firstMs: number | null = null;
    let firstGiven: number | null = null;
    let usedNumberLine = false;
    let usedRetry = false;
    let typedValue = '';
    let viz: { stop(): void } | null = null;
    let keyOff: (() => void) | null = null;

    // ── DOM ──
    const root = modal(ctx.layers.panel, `ans-modal ans-kind-${req.kind}`);
    const panel = h('div', { class: `panel ans-panel is-locked${typed ? ' is-typed' : ''}${req.card ? ' has-card' : ''}${limit !== null ? ' has-ring' : ''}` });
    const titleEl = h('div', { class: 'ans-title' }, h('span', null, req.title));
    const taskView = renderTask(task.text, 'ans-task');
    const help = h('div', { class: 'ans-help is-hidden' });
    const taskCol = h('div', { class: 'ans-taskcol' }, taskView.el, typed ? h('div', { class: 'ans-typed-hint' }, 'Wpisz wynik') : null, help);

    let osBtn: HTMLButtonElement | null = null;
    if (req.numberLineUses > 0) {
      osBtn = h(
        'button',
        { class: 'btn ans-os', attrs: { type: 'button', 'aria-label': 'Pomoc: oś liczbowa' } },
        icon('ruler', 'ans-os-ic'),
        h('span', { class: 'ans-os-t' }, 'Oś'),
        h('span', { class: 'ans-os-n' }, `×${req.numberLineUses}`),
      );
      onTap(osBtn, () => {
        if (locked || finished || usedNumberLine || !osBtn) return;
        usedNumberLine = true;
        ctx.sfx('tap');
        osBtn.disabled = true;
        osBtn.classList.add('is-used');
        showHelp('os');
      });
    }

    let ring: HTMLElement | null = null;
    let ringFg: SVGCircleElement | null = null;
    if (limit !== null) {
      ring = h('div', { class: 'ans-ring', attrs: { 'aria-hidden': 'true' } });
      ring.innerHTML =
        '<svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="38"/><circle class="ring-fg" cx="50" cy="50" r="38" pathLength="1"/><circle class="ring-core" cx="50" cy="50" r="15"/></svg>';
      ringFg = ring.querySelector<SVGCircleElement>('.ring-fg');
    }

    const optionBtns: { value: number; el: HTMLButtonElement }[] = [];
    let controls: HTMLElement;
    let okKey: HTMLButtonElement | null = null;
    if (!typed) {
      controls = h('div', { class: `ans-options n${task.options.length}` });
      task.options.forEach(v => {
        const b = h('button', { class: 'btn ans-opt', attrs: { type: 'button' } }, h('span', null, String(v)));
        onTap(b, () => answer(v, b));
        optionBtns.push({ value: v, el: b });
        controls.append(b);
      });
    } else {
      controls = h('div', { class: 'ans-keypad' });
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
      for (const k of keys) {
        const label: Node | string = k === 'back' ? icon('back') : k === 'ok' ? icon('check') : k;
        const b = h('button', { class: `btn ans-key key-${k}`, attrs: { type: 'button', 'aria-label': k === 'back' ? 'usuń' : k === 'ok' ? 'sprawdź' : k } }, label);
        onTap(b, () => key(k));
        if (k === 'ok') okKey = b;
        controls.append(b);
      }
    }

    const cardMini = req.card ? h('div', { class: 'ans-card' }, cardFace(ctx, req.card, { size: 'small' })) : null;
    const body = h('div', { class: 'ans-body' }, taskCol, typed ? controls : null);
    panel.append(...[cardMini, titleEl, ring, osBtn, body, typed ? null : controls].filter((x): x is HTMLElement => !!x));
    root.append(panel);
    const refreshOk = (): void => {
      if (okKey) okKey.disabled = typedValue === '';
    };
    refreshOk();
    void show(panel);

    // ── Pomoc ──
    function showHelp(kind: 'os' | 'retry'): void {
      viz?.stop();
      viz = null;
      help.textContent = '';
      help.className = `ans-help help-${kind}`;
      const head =
        kind === 'retry'
          ? h('div', { class: 'ans-help-title' }, icon('bulb'), h('span', null, 'Prawie! ', hint.title))
          : h('div', { class: 'ans-help-title' }, icon('ruler'), h('span', null, hint.title));
      help.append(head, h('div', { class: 'ans-help-step' }, hint.firstStep));
      if (kind === 'os' || usedNumberLine) {
        const v = miniHintViz(hint);
        if (v) {
          help.append(h('div', { class: 'ans-help-viz' }, v.el));
          viz = v;
          timers.after(200, () => v.play());
        }
      }
      if (kind === 'retry') help.append(h('div', { class: 'ans-help-again' }, 'Wybierz jeszcze raz!'));
      restartClass(help, 'pop');
    }

    // ── Odpowiedź ──
    function answer(value: number, btn: HTMLElement | null): void {
      if (locked || finished) return;
      if (firstMs === null) firstMs = Math.max(0, Math.round(performance.now() - unlockT));
      if (firstGiven === null) firstGiven = value;
      locked = true;
      if (value === task.answer) {
        ctx.sfx('correct');
        taskView.setSlot(String(value), 'good');
        panel.classList.add('is-good');
        if (btn) {
          btn.classList.add('is-correct');
          sparkle(ctx.layers.panel, btn);
        }
        if (taskView.slot) sparkle(ctx.layers.panel, taskView.slot, ['#ffd23f', '#ffffff', '#3ccf6e']);
        timers.after(780, () => close(value, false));
        return;
      }
      ctx.sfx('wrong');
      taskView.setSlot(String(value), 'bad');
      if (btn) {
        btn.classList.add('is-wrong');
        restartClass(btn, 'shake');
      }
      if (taskView.slot) restartClass(taskView.slot, 'shake');
      if (req.retryAvailable && !usedRetry) {
        usedRetry = true;
        timers.after(650, () => {
          if (btn && btn !== okKey) {
            btn.classList.add('is-out');
            (btn as HTMLButtonElement).disabled = true;
          }
          btn?.classList.remove('is-wrong');
          typedValue = '';
          refreshOk();
          taskView.setSlot('', 'empty');
          showHelp('retry');
          locked = false;
        });
        return;
      }
      panel.classList.add('is-bad');
      timers.after(520, () => {
        taskView.setSlot(String(task.answer), 'good');
        for (const o of optionBtns) if (o.value === task.answer) o.el.classList.add('is-reveal');
      });
      timers.after(1650, () => close(value, false));
    }

    function key(k: string): void {
      if (locked || finished) return;
      if (k === 'ok') {
        if (typedValue !== '') answer(Number(typedValue), okKey);
        return;
      }
      ctx.sfx('tap');
      if (k === 'back') typedValue = typedValue.slice(0, -1);
      else if (typedValue.length < 3) typedValue = typedValue === '0' ? k : typedValue + k;
      taskView.setSlot(typedValue, typedValue === '' ? 'empty' : 'typing');
      refreshOk();
    }

    function close(given: number | null, timedOut: boolean): void {
      if (finished) return;
      finished = true;
      locked = true;
      timers.clear();
      viz?.stop();
      keyOff?.();
      const ms = firstMs ?? Math.max(0, Math.round(performance.now() - unlockT));
      const result: AnswerResult = { given, ms, timedOut, usedNumberLine, usedRetry, firstGiven };
      void hideAndRemove(root).then(() => resolve(result));
    }

    // ── Blokada, pierścień czasu, klawiatura ──
    timers.after(lockMs, () => {
      locked = false;
      unlockT = performance.now();
      panel.classList.remove('is-locked');
      if (limit !== null && ring && ringFg) {
        const fg = ringFg;
        fg.style.transition = 'none';
        fg.style.strokeDashoffset = '0';
        void fg.getBoundingClientRect();
        fg.style.transition = `stroke-dashoffset ${limit}ms linear`;
        fg.style.strokeDashoffset = '1';
        const r = ring;
        timers.after(limit, () => r.classList.add('is-closed'));
        timers.after(limit * 2, () => {
          if (!finished && !locked) close(null, true);
          else if (!finished) timers.after(1800, () => close(null, true));
        });
      }
    });

    keyOff = onKey(e => {
      if (typed) {
        if (e.key >= '0' && e.key <= '9' && e.key.length === 1) key(e.key);
        else if (e.key === 'Backspace') key('back');
        else if (e.key === 'Enter') key('ok');
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= optionBtns.length) {
        const o = optionBtns[n - 1];
        if (o && !o.el.disabled) answer(o.value, o.el);
      }
    });
  });
}
