/**
 * Wybór cyfr ze Skarbca („złóż 15 z 3 cyfr”) — kuźnia i oferta dnia handlarza (GDD 9.4, 9.5a).
 * Dotknięcie cyfry na tacy wkłada ją do pierwszego wolnego miejsca; dotknięcie miejsca — zwraca.
 */
import type { DigitPickRequest } from '../../game/contracts';
import type { UiContext } from '../context';
import { button, h, onTap, wait } from '../dom';
import { bubble, digitTile, listen, once, openShell } from './shell';
import './digitPicker.css';

export function pickDigitsPanel(ctx: UiContext, req: DigitPickRequest): Promise<number[] | null> {
  const done = once<number[] | null>();
  const count = Math.max(1, Math.floor(req.count));
  const slots: (number | null)[] = new Array<number | null>(count).fill(null);
  let busy = false;

  const shell = openShell(ctx, { theme: 'digits', title: req.title, icon: '🔢', size: 'dialog', onClose: () => finish(null) });
  shell.sheet.classList.add('dp-sheet');

  // Cel
  const goal = h('div', { class: 'dp-goal' }, req.subtitle);

  // Równanie: [ ] + [ ] + [ ] = suma
  const slotEls: HTMLElement[] = [];
  const eq = h('div', { class: 'dp-eq' });
  for (let i = 0; i < count; i++) {
    if (i > 0) eq.append(h('span', { class: 'dp-plus', attrs: { 'aria-hidden': 'true' } }, '+'));
    const s = h('div', { class: 'dp-slot', attrs: { role: 'button', 'aria-label': `miejsce ${i + 1}` } });
    shell.onDispose(
      onTap(s, () => {
        if (busy || slots[i] === null) return;
        ctx.sfx('tap');
        slots[i] = null;
        hideMsg();
        render();
      }),
    );
    slotEls.push(s);
    eq.append(s);
  }
  const sumVal = h('span', { class: 'dp-sum-v' }, '0');
  eq.append(h('span', { class: 'dp-eqsign', attrs: { 'aria-hidden': 'true' } }, '='), h('div', { class: 'dp-sum', attrs: { 'aria-live': 'polite' } }, sumVal));

  const msg = h('div', { class: 'dp-msg' });

  // Taca
  const tray = h('div', { class: 'dp-tray' });
  const trayTiles: HTMLElement[] = [];
  for (let d = 0; d < 10; d++) {
    const t = digitTile(d, { count: req.inventory[d] ?? 0, cls: 'dp-tile' });
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', `cyfra ${d}`);
    shell.onDispose(onTap(t, () => pick(d)));
    trayTiles.push(t);
    tray.append(t);
  }

  const cancelBtn = button('Anuluj', () => finish(null), 'btn-ghost dp-cancel');
  const okBtn = button(h('span', null, h('span', { class: 'pn-btn-ic' }, '✔'), 'Gotowe'), () => submit(), 'btn-good btn-big dp-ok');
  const foot = h('div', { class: 'dp-foot' }, cancelBtn, okBtn);

  shell.body.classList.add('dp-body');
  shell.body.append(goal, eq, msg, h('div', { class: 'dp-tray-wrap' }, h('div', { class: 'dp-tray-label' }, 'Twoje cyfry'), tray), foot);

  listen(shell, window, 'keydown', e => {
    if (busy) return;
    if (e.key >= '0' && e.key <= '9' && e.key.length === 1) pick(Number(e.key));
    else if (e.key === 'Backspace') {
      for (let i = count - 1; i >= 0; i--)
        if (slots[i] !== null) {
          slots[i] = null;
          render();
          break;
        }
    } else if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') finish(null);
  });

  render();
  return done.promise;

  function used(d: number): number {
    return slots.filter(s => s === d).length;
  }

  function pick(d: number): void {
    if (busy) return;
    const free = slots.indexOf(null);
    const left = (req.inventory[d] ?? 0) - used(d);
    if (left <= 0) {
      showMsg(`Nie masz już cyfry ${d}.`, 'info', '🙂');
      return;
    }
    if (free < 0) {
      showMsg('Wszystkie miejsca są zajęte. Dotknij cyfry na górze, żeby ją zdjąć.', 'info', '🙂');
      nudge(eq);
      return;
    }
    ctx.sfx('tap');
    slots[free] = d;
    hideMsg();
    render(free);
  }

  function render(popped = -1): void {
    slotEls.forEach((el, i) => {
      const v = slots[i] ?? null;
      el.replaceChildren();
      el.classList.toggle('is-filled', v !== null);
      if (v !== null) {
        const t = digitTile(v, { cls: `dp-in${i === popped ? ' dp-pop' : ''}` });
        el.append(t);
      } else if (i === slots.indexOf(null)) {
        el.append(h('span', { class: 'dp-slot-next', attrs: { 'aria-hidden': 'true' } }, '?'));
      }
      el.classList.toggle('is-next', v === null && i === slots.indexOf(null));
    });
    const sum = slots.reduce<number>((a, v) => a + (v ?? 0), 0);
    sumVal.textContent = String(sum);
    const full = slots.every(v => v !== null);
    okBtn.disabled = !full;
    trayTiles.forEach((t, d) => {
      const left = (req.inventory[d] ?? 0) - used(d);
      const c = t.querySelector('.pn-digit-c');
      if (c) c.textContent = `×${Math.max(0, left)}`;
      t.classList.toggle('is-disabled', left <= 0);
    });
  }

  function submit(): void {
    if (busy) return;
    if (slots.some(v => v === null)) {
      showMsg(`Wybierz ${count} ${count === 1 ? 'cyfrę' : count < 5 ? 'cyfry' : 'cyfr'}.`, 'info', '🙂');
      return;
    }
    const selected = slots.map(v => v ?? 0);
    const res = req.check(selected);
    if (!res.ok) {
      ctx.sfx('wrong');
      showMsg(res.message || 'Jeszcze nie. Spróbuj inaczej!', 'warn', '🤔');
      nudge(eq);
      return;
    }
    busy = true;
    ctx.sfx('correct');
    eq.classList.add('is-win');
    if (res.message) showMsg(res.message, 'good', '🎉');
    void wait(650).then(() => finish(selected));
  }

  function finish(v: number[] | null): void {
    if (done.done) return;
    done.resolve(v);
    void shell.close();
  }

  function showMsg(text: string, kind: 'info' | 'warn' | 'good', icon: string): void {
    msg.replaceChildren(bubble(text, kind, icon));
  }
  function hideMsg(): void {
    if (!busy) msg.replaceChildren();
  }
  function nudge(el: HTMLElement): void {
    el.classList.remove('pn-shake');
    void el.offsetWidth;
    el.classList.add('pn-shake');
  }
}
