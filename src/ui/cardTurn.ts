/**
 * Tura dziecka w walce kartami: ręka kart (lekki wachlarz), gwiazdki energii, talia i odrzucone,
 * „Koniec tury”, pauza, dymek z podpowiedzią. Dotknięcie grywalnej karty → karta wylatuje w górę
 * i obietnica zwraca { kind: 'play', uid }. Niegrywalna karta się trzęsie.
 * Ręka zostaje na ekranie między wywołaniami (karty dopasowują się po uid), aż do hideCards().
 */
import type { CardFace, CardTurnChoice, CardTurnView } from '../game/contracts';
import { cardFace } from './components/cardFace';
import type { UiContext } from './context';
import { h, onTap } from './dom';
import type { HudApi } from './hud';
import { icon } from './icons';
import { clamp, onKey } from './util';

interface Slot {
  uid: string;
  key: string;
  wrap: HTMLElement;
  face: CardFace;
  flying: boolean;
}

const CARD_W = 170;
const SIDE_LEFT = 350;
const SIDE_RIGHT = 300;

/** Pozycje kart w wachlarzu (czysta funkcja — testowana). x względem środka ręki, y w dół, r w stopniach. */
export function fanLayout(n: number, viewportW: number): { x: number; y: number; r: number }[] {
  if (n <= 0) return [];
  const avail = Math.max(CARD_W, viewportW - 2 * Math.max(SIDE_LEFT, SIDE_RIGHT));
  const spacing = n === 1 ? 0 : clamp((avail - CARD_W) / (n - 1), 92, 178);
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const c = i - (n - 1) / 2;
    out.push({ x: Math.round(c * spacing), y: Math.round(c * c * 7), r: +(c * 3.5).toFixed(2) });
  }
  return out;
}

export function createCardTurn(ctx: UiContext, hud: HudApi) {
  const slots = new Map<string, Slot>();
  let order: string[] = [];
  let pending: ((c: CardTurnChoice) => void) | null = null;
  let view: CardTurnView | null = null;
  let keyOff: (() => void) | null = null;
  let msgTimer: ReturnType<typeof setTimeout> | null = null;

  const pauseBtn = h('button', { class: 'btn ct-pause', attrs: { type: 'button', 'aria-label': 'Pauza' } }, icon('pause'));
  const energyStars = h('div', { class: 'ct-stars' });
  const energy = h('div', { class: 'ct-energy', attrs: { 'aria-label': 'energia' } }, h('div', { class: 'ct-cap' }, 'Energia'), energyStars);
  const drawN = h('span', { class: 'ct-pile-n' }, '0');
  const draw = h('div', { class: 'ct-pile ct-draw', attrs: { 'aria-label': 'talia' } }, icon('deck'), drawN, h('div', { class: 'ct-cap' }, 'Talia'));
  const left = h('div', { class: 'ct-left' }, energy, draw);
  const discardN = h('span', { class: 'ct-pile-n' }, '0');
  const discard = h('div', { class: 'ct-pile ct-discard', attrs: { 'aria-label': 'odrzucone' } }, icon('discard'), discardN, h('div', { class: 'ct-cap' }, 'Zagrane'));
  const endBtn = h('button', { class: 'btn ct-end', attrs: { type: 'button' } }, h('span', { class: 'ct-end-t' }, 'Koniec', h('br'), 'tury'), icon('hourglass'));
  const right = h('div', { class: 'ct-right' }, discard, endBtn);
  const tipText = h('span', { class: 'ct-tip-t' });
  const tip = h('div', { class: 'ct-tip is-hidden' }, icon('bulb'), tipText);
  const msg = h('div', { class: 'ct-msg is-hidden' });
  const hand = h('div', { class: 'ct-hand' });
  const root = h('div', { class: 'ct passthrough is-hidden is-busy' }, pauseBtn, left, tip, msg, hand, right);
  ctx.layers.cards.append(root);

  const choose = (c: CardTurnChoice): void => {
    if (!pending) return;
    const r = pending;
    pending = null;
    keyOff?.();
    keyOff = null;
    root.classList.add('is-busy');
    tip.classList.add('is-hidden');
    r(c);
  };

  onTap(pauseBtn, () => {
    if (!pending) return;
    ctx.sfx('tap');
    choose({ kind: 'pause' });
  });
  onTap(endBtn, () => {
    if (!pending) return;
    ctx.sfx('tap');
    choose({ kind: 'end' });
  });

  const say = (text: string, anchor: HTMLElement): void => {
    msg.textContent = text;
    const r = anchor.getBoundingClientRect();
    msg.style.left = `${clamp(r.left + r.width / 2, 160, window.innerWidth - 160)}px`;
    msg.style.top = `${Math.max(80, r.top - 20)}px`;
    msg.classList.remove('is-hidden');
    msg.classList.remove('pop');
    void msg.offsetWidth;
    msg.classList.add('pop');
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => msg.classList.add('is-hidden'), 1700);
  };

  const shake = (el: HTMLElement): void => {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  };

  const tapCard = (slot: Slot): void => {
    if (!pending || slot.flying || !view) return;
    if (!slot.face.playable) {
      ctx.sfx('wrong');
      shake(slot.wrap);
      if (slot.face.cost > view.energy) {
        shake(energy);
        say('Za mało energii!', slot.wrap);
      } else say('Tej karty nie możesz teraz zagrać.', slot.wrap);
      return;
    }
    ctx.sfx('whoosh');
    slot.flying = true;
    const r = slot.wrap.getBoundingClientRect();
    const dx = window.innerWidth / 2 - (r.left + r.width / 2);
    const dy = window.innerHeight * 0.3 - (r.top + r.height / 2);
    slot.wrap.style.setProperty('--fx', `${dx}px`);
    slot.wrap.style.setProperty('--fy', `${dy}px`);
    slot.wrap.classList.add('is-flying');
    order = order.filter(u => u !== slot.uid);
    layout();
    setTimeout(() => choose({ kind: 'play', uid: slot.uid }), 260);
    setTimeout(() => {
      slot.wrap.remove();
      if (slots.get(slot.uid) === slot) slots.delete(slot.uid);
    }, 520);
  };

  const makeSlot = (face: CardFace): Slot => {
    const wrap = h('div', { class: 'ct-slot is-entering' }, cardFace(ctx, face, { size: 'hand' }));
    const slot: Slot = { uid: face.uid, key: JSON.stringify(face), wrap, face, flying: false };
    onTap(wrap, () => tapCard(slot), { tolerancePx: 24 });
    return slot;
  };

  function layout(): void {
    const pos = fanLayout(order.length, window.innerWidth);
    order.forEach((uid, i) => {
      const s = slots.get(uid);
      const p = pos[i];
      if (!s || !p) return;
      s.wrap.style.setProperty('--x', `${p.x}px`);
      s.wrap.style.setProperty('--y', `${p.y}px`);
      s.wrap.style.setProperty('--r', `${p.r}deg`);
      s.wrap.style.zIndex = String(10 + i);
    });
  }
  window.addEventListener('resize', layout);

  const syncHand = (cards: CardFace[]): void => {
    const keep = new Set(cards.map(c => c.uid));
    for (const [uid, s] of slots) {
      if (keep.has(uid) || s.flying) continue;
      slots.delete(uid);
      s.wrap.classList.add('is-leaving');
      setTimeout(() => s.wrap.remove(), 260);
    }
    let entering = 0;
    cards.forEach(face => {
      const existing = slots.get(face.uid);
      const key = JSON.stringify(face);
      if (existing && !existing.flying) {
        if (existing.key !== key) {
          const card = cardFace(ctx, face, { size: 'hand' });
          existing.wrap.replaceChildren(card);
          existing.key = key;
        }
        existing.face = face;
        return;
      }
      const s = makeSlot(face);
      s.wrap.style.transitionDelay = `${entering * 90}ms`;
      entering++;
      slots.set(face.uid, s);
      hand.append(s.wrap);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          s.wrap.classList.remove('is-entering');
          setTimeout(() => (s.wrap.style.transitionDelay = ''), 500);
        }),
      );
    });
    order = cards.map(c => c.uid);
    layout();
  };

  const renderStats = (v: CardTurnView): void => {
    energyStars.textContent = '';
    for (let i = 0; i < v.maxEnergy; i++) energyStars.append(icon(i < v.energy ? 'star' : 'starEmpty', 'ct-star'));
    energy.setAttribute('aria-label', `energia ${v.energy} z ${v.maxEnergy}`);
    drawN.textContent = String(v.drawCount);
    discardN.textContent = String(v.discardCount);
    const nothing = v.hand.every(c => !c.playable);
    endBtn.classList.toggle('is-suggested', nothing);
    if (v.tip) {
      tipText.textContent = v.tip;
      tip.classList.remove('is-hidden');
    } else tip.classList.add('is-hidden');
  };

  return {
    turn(v: CardTurnView): Promise<CardTurnChoice> {
      view = v;
      pending = null;
      root.classList.remove('is-hidden');
      hud.setShield(v.shield);
      hud.setIntent(v.intent);
      renderStats(v);
      syncHand(v.hand);
      return new Promise(resolve => {
        pending = resolve;
        root.classList.remove('is-busy');
        keyOff?.();
        keyOff = onKey(e => {
          if (!pending) return;
          const n = Number(e.key);
          if (Number.isInteger(n) && n >= 1 && n <= order.length) {
            const s = slots.get(order[n - 1] ?? '');
            if (s) tapCard(s);
          } else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') choose({ kind: 'end' });
          else if (e.key === 'Escape') choose({ kind: 'pause' });
        });
      });
    },
    hide(): void {
      root.classList.add('is-hidden', 'is-busy');
      tip.classList.add('is-hidden');
      msg.classList.add('is-hidden');
    },
  };
}
