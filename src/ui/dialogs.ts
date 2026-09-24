/**
 * Dialogi: rozmowa z postacią (say), świętowanie (celebrate), pytanie tak/nie (confirm),
 * menu pauzy (pause) i przypomnienie o przerwie (breakReminder).
 */
import type { CelebrateRequest, ModelId, PauseAction, QualityLevel } from '../game/contracts';
import type { Rarity } from '../core/types';
import { portraitEl } from './components/portrait';
import type { UiContext } from './context';
import { button, h, hideAndRemove, onTap, show } from './dom';
import { icon } from './icons';
import { modal, onKey, plural, Timers } from './util';

// ───────────────────────────── say ─────────────────────────────

export function sayDialog(ctx: UiContext, opts: { speaker?: string; portrait?: ModelId; text: string; buttons?: string[] }): Promise<number> {
  return new Promise(resolve => {
    const labels = opts.buttons && opts.buttons.length > 0 ? opts.buttons : ['Dalej'];
    const timers = new Timers();
    const root = modal(ctx.layers.dialog, 'say-modal');
    const shown = h('span', { class: 'say-shown' });
    const rest = h('span', { class: 'say-rest', attrs: { 'aria-hidden': 'true' } }, opts.text);
    const text = h('div', { class: 'say-text', attrs: { 'aria-label': opts.text } }, shown, rest);
    const btns = h('div', { class: 'say-btns' });
    let done = false;
    let typing = true;
    const chars = [...opts.text];
    let i = 0;
    const completeText = (): void => {
      typing = false;
      timers.clear();
      shown.textContent = opts.text;
      rest.textContent = '';
      box.classList.add('is-typed');
    };
    const press = (idx: number): void => {
      if (done) return;
      if (typing) {
        completeText();
        return;
      }
      done = true;
      ctx.sfx('tap');
      keyOff();
      void hideAndRemove(root).then(() => resolve(idx));
    };
    labels.forEach((label, idx) => {
      const last = idx === labels.length - 1;
      const b = button(h('span', { class: 'btn-in' }, h('span', null, label), last ? icon('arrow') : null), () => press(idx), last ? 'btn-primary say-btn' : 'say-btn');
      btns.append(b);
    });
    const hasPortrait = !!opts.portrait;
    const side = hasPortrait || opts.speaker
      ? h('div', { class: 'say-side' },
          opts.portrait ? portraitEl(ctx, opts.portrait, 'say-portrait') : null,
          opts.speaker ? h('div', { class: 'say-name' }, opts.speaker) : null)
      : null;
    const bubble = h('div', { class: 'say-bubble' }, text, btns);
    const box = h('div', { class: `say-box${side ? '' : ' no-side'}${hasPortrait ? ' has-portrait' : ''}` }, side, bubble);
    root.append(box);
    onTap(bubble, () => {
      if (typing) completeText();
    });
    onTap(root, e => {
      if (typing && e.target === root) completeText();
    });
    const keyOff = onKey(e => {
      if (e.key === 'Enter' || e.key === ' ') {
        press(labels.length - 1);
      }
    });
    void show(box);
    const stepMs = 26;
    const tick = (): void => {
      if (!typing) return;
      i = Math.min(chars.length, i + 1);
      shown.textContent = chars.slice(0, i).join('');
      rest.textContent = chars.slice(i).join('');
      if (i >= chars.length) completeText();
      else timers.after(chars[i - 1] === ',' || chars[i - 1] === '.' ? stepMs * 5 : stepMs, tick);
    };
    timers.after(180, tick);
  });
}

// ───────────────────────────── celebrate ─────────────────────────────

const CELEBRATE_KICKER: Record<CelebrateRequest['kind'], string> = {
  catch: 'Złapany!',
  glam: 'Odczarowany!',
  loot: 'Skarb!',
  harvest: 'Zbiory!',
  levelup: 'Awans!',
  gate: 'Brama otwarta!',
  stage: 'Nowy etap!',
};

const RARITY_GEMS: Record<Rarity | 'legendary', number> = { common: 1, uncommon: 2, rare: 3, legendary: 4 };
const CONFETTI = ['#ff6b6b', '#ffd23f', '#3ccf6e', '#3fa7ff', '#b25cff', '#ff9f43', '#ff7ac6'];

export function celebrateDialog(ctx: UiContext, req: CelebrateRequest): Promise<void> {
  return new Promise(resolve => {
    const timers = new Timers();
    const root = modal(ctx.layers.dialog, `cel-modal cel-${req.kind}`);
    const rays = h('div', { class: 'cel-rays passthrough' });
    const confetti = h('div', { class: 'cel-confetti passthrough' });
    for (let i = 0; i < 46; i++) {
      const p = h('i', { class: `cf cf-${i % 3}` });
      p.style.left = `${Math.random() * 100}%`;
      p.style.setProperty('--c', CONFETTI[i % CONFETTI.length] ?? '#ffd23f');
      p.style.setProperty('--d', `${2.6 + Math.random() * 2.2}s`);
      p.style.setProperty('--delay', `${-Math.random() * 3}s`);
      p.style.setProperty('--x', `${(Math.random() - 0.5) * 160}px`);
      p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      confetti.append(p);
    }

    const card = h('div', { class: `panel cel-card${req.portrait ? ' has-portrait' : ''}` });
    card.append(h('div', { class: 'cel-kicker' }, h('span', null, CELEBRATE_KICKER[req.kind])));
    if (req.portrait) card.append(h('div', { class: 'cel-portrait-wrap' }, h('div', { class: 'cel-glow' }), portraitEl(ctx, req.portrait, 'cel-portrait')));
    card.append(h('h2', { class: 'cel-title' }, req.title));
    if (req.subtitle) card.append(h('div', { class: 'cel-sub' }, req.subtitle));
    if (req.digits && req.digits.length > 0) {
      const row = h('div', { class: 'cel-digits' });
      req.digits.forEach((d, i) => {
        const cube = h('div', { class: 'dcube' }, h('span', null, String(d)));
        cube.style.animationDelay = `${500 + i * 160}ms`;
        row.append(cube);
        timers.after(560 + i * 160, () => ctx.sfx('digit'));
      });
      card.append(row);
    }
    if (req.items && req.items.length > 0) {
      const list = h('div', { class: 'cel-items' });
      req.items.forEach((it, i) => {
        const gems = h('span', { class: 'cel-gems', attrs: { 'aria-label': it.rarity } });
        for (let g = 0; g < RARITY_GEMS[it.rarity]; g++) gems.append(h('i'));
        const row = h(
          'div',
          { class: `cel-item rar-${it.rarity}` },
          h('div', { class: 'cel-item-ic' }, icon('gift')),
          h('div', { class: 'cel-item-txt' }, h('div', { class: 'cel-item-name' }, it.name, gems), h('div', { class: 'cel-item-desc' }, it.description)),
        );
        row.style.animationDelay = `${700 + (req.digits?.length ?? 0) * 160 + i * 180}ms`;
        list.append(row);
      });
      card.append(list);
    }
    const tapHint = h('div', { class: 'cel-tap' }, 'Dotknij, aby kontynuować');
    root.append(rays, confetti, card, tapHint);
    void show(card);
    ctx.sfx(req.kind === 'glam' ? 'transform' : req.kind === 'levelup' ? 'levelup' : 'correct');

    let armed = false;
    let done = false;
    timers.after(700, () => {
      armed = true;
      tapHint.classList.add('shown');
    });
    const finish = (): void => {
      if (!armed || done) return;
      done = true;
      timers.clear();
      keyOff();
      ctx.sfx('tap');
      void hideAndRemove(root).then(() => resolve());
    };
    onTap(root, finish, { tolerancePx: 30 });
    const keyOff = onKey(e => {
      if (e.key === 'Enter' || e.key === ' ') finish();
    });
  });
}

// ───────────────────────────── confirm ─────────────────────────────

export function confirmDialog(ctx: UiContext, text: string, yes = 'Tak', no = 'Nie'): Promise<boolean> {
  return new Promise(resolve => {
    const root = modal(ctx.layers.dialog, 'dim-modal');
    let done = false;
    const finish = (v: boolean): void => {
      if (done) return;
      done = true;
      ctx.sfx('tap');
      keyOff();
      void hideAndRemove(root).then(() => resolve(v));
    };
    const panel = h(
      'div',
      { class: 'panel dlg-panel confirm-panel' },
      h('div', { class: 'dlg-text' }, text),
      h('div', { class: 'dlg-btns' }, button(no, () => finish(false), 'btn-big btn-ghost dlg-no'), button(yes, () => finish(true), 'btn-big btn-good dlg-yes')),
    );
    root.append(panel);
    const keyOff = onKey(e => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    void show(panel);
  });
}

// ───────────────────────────── pause ─────────────────────────────

const QUALITY_LABEL: Record<QualityLevel | 'auto', string> = { auto: 'auto', low: 'niska', medium: 'średnia', high: 'wysoka' };

/** Menu pauzy. Po wyborze 'quality' menu zostaje chwilę na ekranie — ponowne pause() podmienia je bez mrugnięcia. */
export function createPause(ctx: UiContext) {
  let lingering: { root: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

  return function pause(vm: { canReturnToBase: boolean; quality: QualityLevel | 'auto' }): Promise<PauseAction> {
    return new Promise(resolve => {
      let root: HTMLElement;
      let reuse = false;
      if (lingering) {
        clearTimeout(lingering.timer);
        root = lingering.root;
        root.textContent = '';
        lingering = null;
        reuse = true;
      } else root = modal(ctx.layers.dialog, 'dim-modal pause-modal');
      let done = false;
      const finish = (a: PauseAction): void => {
        if (done) return;
        done = true;
        ctx.sfx('tap');
        keyOff();
        if (a === 'quality') {
          const r = root;
          lingering = { root: r, timer: setTimeout(() => { lingering = null; void hideAndRemove(r); }, 450) };
          resolve(a);
          return;
        }
        void hideAndRemove(root).then(() => resolve(a));
      };
      const row = (ic: Parameters<typeof icon>[0], label: string | Node, a: PauseAction, cls: string): HTMLButtonElement =>
        button(h('span', { class: 'btn-in' }, icon(ic), typeof label === 'string' ? h('span', null, label) : label), () => finish(a), cls);
      const panel = h(
        'div',
        { class: 'panel dlg-panel pause-panel' },
        h('div', { class: 'pause-title' }, icon('pause'), h('span', null, 'Pauza')),
        row('play', 'Wróć do gry', 'resume', 'btn-primary btn-big pause-btn'),
        vm.canReturnToBase ? row('home', 'Wróć do bazy', 'base', 'btn-big pause-btn') : null,
        row('sparkles', h('span', null, 'Jakość grafiki: ', h('b', null, QUALITY_LABEL[vm.quality])), 'quality', 'btn-big pause-btn pause-quality'),
        row('lock', 'Rodzic', 'parent', 'btn-ghost pause-btn pause-parent'),
      );
      root.append(panel);
      const keyOff = onKey(e => {
        if (e.key === 'Escape' || e.key === 'Enter') finish('resume');
      });
      if (!reuse) void show(panel);
    });
  };
}

// ───────────────────────────── breakReminder ─────────────────────────────

export function breakReminderDialog(ctx: UiContext, minutes: number): Promise<void> {
  return new Promise(resolve => {
    const root = modal(ctx.layers.dialog, 'dim-modal');
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      ctx.sfx('tap');
      void hideAndRemove(root).then(() => resolve());
    };
    const m = Math.max(1, Math.round(minutes));
    const panel = h(
      'div',
      { class: 'panel dlg-panel break-panel' },
      h('div', { class: 'break-art', attrs: { 'aria-hidden': 'true' } }, h('span', null, '🤸'), h('span', null, '🧃'), h('span', null, '🌳')),
      h('h2', { class: 'break-title' }, 'Czas na przerwę?'),
      h('div', { class: 'dlg-text' }, `Grasz już ${m} ${plural(m, 'minutę', 'minuty', 'minut')}. Wstań, przeciągnij się i napij się wody!`),
      h('div', { class: 'dlg-btns' }, button('Dobrze!', finish, 'btn-big btn-good')),
    );
    root.append(panel);
    void show(panel);
  });
}
