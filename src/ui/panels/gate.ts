/**
 * Brama do dungeonu (GDD 10): „Ułóż 54” z kafelków cyfr i znaków działań.
 * Dotknięcie kafelka na tacy = dołóż na koniec toru; dotknięcie kafelka na torze = zwróć;
 * przeciąganie (pointer events) w obie strony, także zmiana kolejności na torze.
 */
import type { GateUiRequest, GateUiResult } from '../../game/contracts';
import type { GateOp, GateScore, GateToken } from '../../core/types';
import type { UiContext } from '../context';
import { button, h, onTap, wait } from '../dom';
import { bubble, digitTile, listen, lockIcon, once, openShell, reducedMotion } from './shell';
import { keyToToken, remaining, usedDigits } from './util';
import './gate.css';

const OP_ORDER: GateOp[] = ['+', '−', '×', ':'];
/** Maks. kafelków na torze (MVP: a ∘ b, liczby ≤ 2 cyfry → 5; zapas na pomyłki). */
const MAX_TRACK = 7;
const DRAG_START_PX = 10;
const TAP_TOLERANCE_PX = 14;

/** Kamienne cegły tła bramy (SVG w data URL). */
const BRICKS = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='120'>" +
    "<rect width='240' height='120' fill='#7c859a'/>" +
    "<rect x='3' y='3' width='114' height='54' rx='8' fill='#a9b2c4'/>" +
    "<rect x='123' y='3' width='114' height='54' rx='8' fill='#a0a9bc'/>" +
    "<rect x='-57' y='63' width='114' height='54' rx='8' fill='#a4adc0'/>" +
    "<rect x='63' y='63' width='114' height='54' rx='8' fill='#adb5c7'/>" +
    "<rect x='183' y='63' width='114' height='54' rx='8' fill='#a4adc0'/>" +
    "<g fill='#ffffff' opacity='0.18'><rect x='9' y='6' width='100' height='5' rx='2.5'/><rect x='129' y='6' width='100' height='5' rx='2.5'/>" +
    "<rect x='69' y='66' width='100' height='5' rx='2.5'/><rect x='189' y='66' width='48' height='5' rx='2.5'/><rect x='3' y='66' width='48' height='5' rx='2.5'/></g>" +
    '</svg>',
)}")`;

type DragSrc = { from: 'tray'; token: GateToken; el: HTMLElement } | { from: 'track'; index: number; token: GateToken; el: HTMLElement };

interface Press {
  id: number;
  x: number;
  y: number;
  src: DragSrc;
  dragging: boolean;
  ghost: HTMLElement | null;
  offX: number;
  offY: number;
}

export function gatePanel(ctx: UiContext, req: GateUiRequest): Promise<GateUiResult> {
  const done = once<GateUiResult>();
  const shell = openShell(ctx, { theme: 'gate', title: `Brama: ułóż ${req.target}`, bare: true });
  shell.sheet.classList.add('gate-sheet');
  shell.sheet.style.setProperty('--gate-bricks', BRICKS);

  let tokens: GateToken[] = [];
  let busy = false;
  let press: Press | null = null;
  let msgTimer = 0;

  // ─── Nagłówek: BRAMA + cel ───
  const exitBtn = button(h('span', null, h('span', { class: 'pn-btn-ic' }, '←'), 'Wyjdź'), () => finish(null), 'btn-ghost gate-exit');
  const plaque = h(
    'div',
    { class: 'gate-plaque' },
    h('div', { class: 'gate-lintel' }, 'BRAMA'),
    h('div', { class: 'gate-target' }, h('span', { class: 'gate-target-verb' }, 'Ułóż'), h('span', { class: 'gate-target-n' }, String(req.target))),
  );
  const goal =
    req.minDigits !== null
      ? h(
          'div',
          { class: 'gate-goal' },
          h('span', { class: 'gate-goal-star', attrs: { 'aria-hidden': 'true' } }, '⭐'),
          h('span', null, h('b', null, 'Sprytnie: '), `ułóż z ${req.minDigits} cyfr`),
        )
      : h('div', { class: 'gate-goal is-empty' });
  const top = h('div', { class: 'gate-top' }, h('div', { class: 'gate-top-l' }, exitBtn), plaque, h('div', { class: 'gate-top-r' }, goal));

  // ─── Dar bramy ───
  const giftChips = req.gift.map(d => h('span', { class: 'gate-gift-chip', dataset: { digit: String(d) } }, `+${d}`));
  const giftRow = req.gift.length
    ? h(
        'div',
        { class: 'gate-gift' },
        h('span', { class: 'gate-gift-ic', attrs: { 'aria-hidden': 'true' } }, '🎁'),
        h('span', { class: 'gate-gift-l' }, 'Dar bramy:'),
        ...giftChips,
      )
    : null;

  // ─── Tor ───
  const track = h('div', { class: 'gate-track', attrs: { 'aria-label': 'Tor działania' } });
  const trackHint = h(
    'div',
    { class: 'gate-track-hint' },
    h('span', { class: 'gate-track-hint-ic', attrs: { 'aria-hidden': 'true' } }, '👆'),
    'Dotknij kafelka na dole albo przeciągnij go tutaj',
  );
  const previewVal = h('span', { class: 'gate-preview-v' }, '?');
  const preview = h('div', { class: 'gate-preview', attrs: { 'aria-live': 'polite' } }, h('span', { class: 'gate-preview-eq' }, '='), previewVal);
  const clearBtn = button('Wyczyść', () => {
    if (busy || tokens.length === 0) return;
    ctx.sfx('tap');
    tokens = [];
    hideMsg();
    render();
  }, 'btn-ghost gate-clear');
  const mid = h('div', { class: 'gate-mid' }, track, h('div', { class: 'gate-side' }, preview, clearBtn));

  // ─── Komunikat ───
  const msg = h('div', { class: 'gate-msg' });

  // ─── Taca ───
  const digitTiles: HTMLElement[] = [];
  const digitsRow = h('div', { class: 'gate-digits' });
  for (let d = 0; d < 10; d++) {
    const t = digitTile(d, { count: req.inventory[d] ?? 0, cls: 'gate-tile' });
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', `cyfra ${d}`);
    bindPress(t, () => ({ from: 'tray', token: { t: 'd', v: d }, el: t }));
    digitTiles.push(t);
    digitsRow.append(t);
  }
  const opsRow = h('div', { class: 'gate-ops' });
  const lockedMap = new Map(req.lockedOps.map(l => [l.op, l.hint] as const));
  for (const op of OP_ORDER) {
    if (req.ops.includes(op)) {
      const t = opTile(op);
      bindPress(t, () => ({ from: 'tray', token: { t: 'op', v: op }, el: t }));
      opsRow.append(t);
    } else if (lockedMap.has(op)) {
      const hint = lockedMap.get(op) ?? '';
      const t = opTile(op, true);
      onTap(t, () => {
        if (busy) return;
        ctx.sfx('tap');
        t.classList.remove('pn-shake');
        void t.offsetWidth;
        t.classList.add('pn-shake');
        showMsg(hint, 'info', '🔒');
      });
      opsRow.append(t);
    }
  }
  const checkBtn = button(h('span', null, h('span', { class: 'pn-btn-ic' }, '✔'), 'Sprawdź'), () => check(), 'btn-good btn-big gate-check');
  const tray = h(
    'div',
    { class: 'gate-tray' },
    digitsRow,
    h('div', { class: 'gate-row2' }, h('div', { class: 'gate-row2-l' }, h('span', { class: 'gate-ops-label' }, 'Znaki:')), opsRow, h('div', { class: 'gate-row2-r' }, checkBtn)),
  );

  shell.body.classList.add('gate-body');
  shell.body.append(top, giftRow ?? h('div', { class: 'gate-gift is-empty' }), h('div', { class: 'gate-stage' }, mid, msg), tray);

  // ─── Klawiatura (testy deweloperskie) ───
  listen(shell, window, 'keydown', e => {
    if (busy) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (tokens.length) removeAt(tokens.length - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      check();
      return;
    }
    if (e.key === 'Escape') {
      finish(null);
      return;
    }
    const tok = keyToToken(e.key);
    if (tok) {
      if (tok.t === 'op' && !req.ops.includes(tok.v)) {
        const hint = lockedMap.get(tok.v);
        if (hint) showMsg(hint, 'info', '🔒');
        return;
      }
      add(tok, tokens.length);
    }
  });
  listen(shell, window, 'pointermove', onMove);
  listen(shell, window, 'pointerup', onUp);
  listen(shell, window, 'pointercancel', onCancel);
  shell.onDispose(() => {
    window.clearTimeout(msgTimer);
    press?.ghost?.remove();
  });

  render();
  void playGift();
  return done.promise;

  // ───────────────────────────── logika ─────────────────────────────

  function opTile(op: GateOp, locked = false): HTMLElement {
    const el = h(
      'div',
      {
        class: `gate-op${locked ? ' is-locked' : ''}`,
        dataset: { op },
        attrs: { role: 'button', 'aria-label': locked ? `znak ${op} — zablokowany` : `znak ${op}` },
      },
      h('span', { class: 'gate-op-s' }, op),
    );
    if (locked) el.append(h('span', { class: 'gate-op-lock' }, lockIcon(22)));
    return el;
  }

  function canAdd(tok: GateToken): boolean {
    if (tokens.length >= MAX_TRACK) return false;
    if (tok.t === 'op') return req.ops.includes(tok.v);
    return remaining(req.inventory, usedDigits(tokens), tok.v) > 0;
  }

  function add(tok: GateToken, index: number): void {
    if (busy) return;
    if (!canAdd(tok)) {
      if (tokens.length >= MAX_TRACK) showMsg('Tor jest pełny. Dotknij kafelka na torze, żeby go zdjąć.', 'info', '🙂');
      else if (tok.t === 'd') showMsg(`Nie masz już cyfry ${tok.v}.`, 'info', '🙂');
      nudge(track);
      return;
    }
    ctx.sfx('tap');
    tokens = [...tokens.slice(0, index), tok, ...tokens.slice(index)];
    hideMsg();
    render(index);
  }

  function removeAt(index: number): void {
    if (busy) return;
    ctx.sfx('tap');
    tokens = tokens.filter((_, i) => i !== index);
    hideMsg();
    render();
  }

  function moveTo(from: number, to: number): void {
    const tok = tokens[from];
    if (!tok) return;
    const rest = tokens.filter((_, i) => i !== from);
    const at = Math.max(0, Math.min(rest.length, to > from ? to - 1 : to));
    tokens = [...rest.slice(0, at), tok, ...rest.slice(at)];
    ctx.sfx('tap');
    hideMsg();
    render(at);
  }

  function render(poppedIndex = -1): void {
    // tor
    track.replaceChildren();
    if (tokens.length === 0) track.append(trackHint);
    tokens.forEach((tok, i) => {
      const el = tok.t === 'd' ? digitTile(tok.v, { cls: 'gate-tile on-track' }) : opTile(tok.v);
      el.classList.add('on-track');
      el.dataset.index = String(i);
      const prev = tokens[i - 1];
      if (tok.t === 'd' && prev?.t === 'd') el.classList.add('join');
      if (i === poppedIndex) el.classList.add('gate-pop-in');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', tok.t === 'd' ? `zdejmij ${tok.v}` : `zdejmij ${tok.v}`);
      bindPress(el, () => ({ from: 'track', index: i, token: tok, el }));
      track.append(el);
    });
    track.classList.toggle('is-empty', tokens.length === 0);

    // taca
    const used = usedDigits(tokens);
    digitTiles.forEach((t, d) => {
      const left = remaining(req.inventory, used, d);
      const c = t.querySelector('.pn-digit-c');
      if (c) c.textContent = `×${left}`;
      t.classList.toggle('is-disabled', left <= 0);
      t.setAttribute('aria-disabled', String(left <= 0));
    });

    // podgląd
    let score: GateScore | null = null;
    if (tokens.length > 0) {
      try {
        score = req.evaluate(tokens);
      } catch {
        score = null;
      }
    }
    const v = score?.value ?? null;
    previewVal.textContent = v === null ? '?' : String(v);
    preview.classList.toggle('is-unknown', v === null);
    preview.classList.toggle('is-hit', v === req.target);
    checkBtn.disabled = tokens.length === 0;
    clearBtn.disabled = tokens.length === 0;
  }

  function check(): void {
    if (busy || tokens.length === 0) return;
    const score = req.evaluate(tokens);
    if (!score.valid) {
      ctx.sfx('wrong');
      showMsg(score.message || 'Jeszcze nie. Spróbuj inaczej!', 'warn', '🤔', 0);
      nudge(track);
      return;
    }
    busy = true;
    ctx.sfx('gate');
    void celebrate(score);
  }

  async function celebrate(score: GateScore): Promise<void> {
    shell.sheet.classList.add('is-busy');
    track.classList.add('is-win');
    preview.classList.add('is-hit');
    const tiles = Array.from(track.children) as HTMLElement[];
    tiles.forEach((t, i) => {
      t.style.animationDelay = `${i * 70}ms`;
      t.classList.add('gate-win-hop');
    });
    showMsg(score.message || 'Brama otwarta!', 'good', score.smart ? '⭐' : '🎉', 0);
    if (score.smart) {
      shell.body.append(h('div', { class: 'gate-stamp', attrs: { 'aria-hidden': 'true' } }, h('span', null, '⭐'), 'Sprytnie!'));
    }
    confetti(track);
    await wait(reducedMotion() ? 700 : 1600);
    finish({ tokens: [...tokens], score });
  }

  function finish(result: GateUiResult): void {
    if (done.done) return;
    if (result === null) ctx.sfx('tap');
    done.resolve(result);
    void shell.close();
  }

  function showMsg(text: string, kind: 'info' | 'warn' | 'good', icon: string, autoHideMs = 4200): void {
    window.clearTimeout(msgTimer);
    msg.replaceChildren(bubble(text, kind, icon));
    if (autoHideMs > 0) msgTimer = window.setTimeout(hideMsg, autoHideMs);
  }

  function hideMsg(): void {
    window.clearTimeout(msgTimer);
    if (busy) return;
    msg.replaceChildren();
  }

  function nudge(el: HTMLElement): void {
    el.classList.remove('pn-shake');
    void el.offsetWidth;
    el.classList.add('pn-shake');
  }

  // ─── dotyk: dotknięcie i przeciąganie ───

  function bindPress(el: HTMLElement, src: () => DragSrc): void {
    el.addEventListener('pointerdown', e => {
      if (busy || press) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, src: src(), dragging: false, ghost: null, offX: e.clientX - r.left, offY: e.clientY - r.top };
      el.classList.add('is-pressed');
    });
  }

  function onMove(e: PointerEvent): void {
    const p = press;
    if (!p || p.id !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (!p.dragging) {
      if (dist < DRAG_START_PX) return;
      if (p.src.from === 'tray' && !canDragFromTray(p.src.token)) return;
      startDrag(p);
    }
    if (p.ghost) {
      p.ghost.style.transform = `translate(${e.clientX - p.offX}px, ${e.clientY - p.offY}px) scale(1.08) rotate(-4deg)`;
    }
    const over = overTrack(e.clientX, e.clientY);
    track.classList.toggle('is-drop', over);
    placeCaret(over ? dropIndex(e.clientX, e.clientY) : -1);
  }

  function onUp(e: PointerEvent): void {
    const p = press;
    if (!p || p.id !== e.pointerId) return;
    press = null;
    p.src.el.classList.remove('is-pressed', 'is-dragging');
    track.classList.remove('is-drop');
    const caretIdx = dropIndex(e.clientX, e.clientY);
    placeCaret(-1);
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_TOLERANCE_PX) return;
      if (p.src.from === 'tray') add(p.src.token, tokens.length);
      else removeAt(p.src.index);
      return;
    }
    p.ghost?.remove();
    const over = overTrack(e.clientX, e.clientY);
    if (p.src.from === 'tray') {
      if (over) add(p.src.token, caretIdx);
    } else if (over) {
      moveTo(p.src.index, caretIdx);
    } else {
      removeAt(p.src.index);
    }
  }

  function onCancel(e: PointerEvent): void {
    const p = press;
    if (!p || p.id !== e.pointerId) return;
    press = null;
    p.ghost?.remove();
    p.src.el.classList.remove('is-pressed', 'is-dragging');
    track.classList.remove('is-drop');
    placeCaret(-1);
  }

  function canDragFromTray(tok: GateToken): boolean {
    if (tok.t === 'op') return req.ops.includes(tok.v);
    return remaining(req.inventory, usedDigits(tokens), tok.v) > 0;
  }

  function startDrag(p: Press): void {
    p.dragging = true;
    const src = p.src.el;
    const r = src.getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.classList.remove('is-pressed', 'join', 'gate-pop-in', 'is-disabled');
    ghost.classList.add('gate-ghost');
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    ghost.style.transform = `translate(${r.left}px, ${r.top}px)`;
    ghost.querySelector('.pn-digit-c')?.remove();
    shell.scrim.append(ghost);
    p.ghost = ghost;
    src.classList.add('is-dragging');
  }

  function overTrack(x: number, y: number): boolean {
    const r = track.getBoundingClientRect();
    const pad = 28;
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  }

  /** Indeks wstawienia wg pozycji palca względem środków kafelków na torze. */
  function dropIndex(x: number, _y: number): number {
    const tiles = Array.from(track.querySelectorAll<HTMLElement>(':scope > [data-index]'));
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      if (x < r.left + r.width / 2) return Number(t.dataset.index);
    }
    return tokens.length;
  }

  function placeCaret(index: number): void {
    track.querySelector('.gate-caret')?.remove();
    if (index < 0) return;
    const caret = h('div', { class: 'gate-caret', attrs: { 'aria-hidden': 'true' } });
    const before = track.querySelector<HTMLElement>(`:scope > [data-index="${index}"]`);
    if (before) track.insertBefore(caret, before);
    else if (tokens.length === 0) track.prepend(caret);
    else track.append(caret);
  }

  // ─── animacje ───

  async function playGift(): Promise<void> {
    if (!giftChips.length) return;
    await wait(450);
    for (const chip of giftChips) {
      if (shell.closed) return;
      const d = Number(chip.dataset.digit);
      const target = digitTiles[d];
      if (!target) continue;
      const from = chip.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const fly = h('div', { class: 'gate-gift-fly' }, `+${d}`);
      fly.style.left = `${from.left}px`;
      fly.style.top = `${from.top}px`;
      fly.style.width = `${from.width}px`;
      fly.style.height = `${from.height}px`;
      shell.scrim.append(fly);
      chip.classList.add('is-sent');
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const anim = fly.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(1.35)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.2 },
        ],
        { duration: reducedMotion() ? 1 : 820, easing: 'cubic-bezier(.45,.05,.4,1)' },
      );
      await anim.finished.catch(() => undefined);
      fly.remove();
      if (shell.closed) return;
      ctx.sfx('digit');
      target.classList.remove('pn-bump', 'gate-gift-glow');
      void target.offsetWidth;
      target.classList.add('pn-bump', 'gate-gift-glow');
      await wait(160);
    }
  }

  function confetti(anchor: HTMLElement): void {
    if (reducedMotion()) return;
    const r = anchor.getBoundingClientRect();
    const colors = ['#ffcf40', '#3ccf6e', '#3fa7ff', '#ff6b9a', '#b25cff', '#ffffff'];
    for (let i = 0; i < 36; i++) {
      const c = h('div', { class: 'gate-confetti' });
      const x0 = r.left + r.width * (0.2 + Math.random() * 0.6);
      const y0 = r.top + r.height / 2;
      c.style.left = `${x0}px`;
      c.style.top = `${y0}px`;
      c.style.background = colors[i % colors.length] ?? '#fff';
      shell.scrim.append(c);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const dist = 160 + Math.random() * 260;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const rot = (Math.random() - 0.5) * 720;
      c.animate(
        [
          { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, easing: 'cubic-bezier(.15,.75,.35,1)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.55, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: `translate(${dx * 1.1}px, ${dy + 240}px) rotate(${rot * 1.4}deg) scale(0.7)`, opacity: 0 },
        ],
        { duration: 1400 + Math.random() * 400, easing: 'linear', fill: 'forwards' },
      ).finished.then(() => c.remove(), () => c.remove());
    }
  }
}
