/**
 * Stół z kartami (kolekcja i talia) oraz Handlarz Kartonini (wymiana kart) — GDD 7.5, 9.5a, 13.5.
 */
import type { CardCollectionEntry, MerchantAction, MerchantOfferView } from '../../game/contracts';
import type { Digits } from '../../core/types';
import { CARD_CSS, cardFace } from '../components/cardFace';
import type { UiContext } from '../context';
import { button, h, onTap } from '../dom';
import { bubble, digitStrip, once, openShell, portraitBox, scroller } from './shell';
import { plural } from './util';
import './cards.css';

/** Maks. liczba kart w talii (GDD 7.5) — tylko do wyświetlenia „15/15”. */
const DECK_MAX = 15;

/** Style kart (CARD_CSS) wstrzykiwane raz — na wypadek, gdyby nikt inny tego nie zrobił. */
function ensureCardCss(): void {
  if (document.querySelector('style[data-card-css]')) return;
  const st = document.createElement('style');
  st.dataset.cardCss = '1';
  st.textContent = CARD_CSS;
  document.head.append(st);
}

const kartWord = (n: number): string => `${n} ${plural(n, 'karta', 'karty', 'kart')}`;

// ───────────────────────────── Stół z kartami ─────────────────────────────

export function cardsPanel(ctx: UiContext, entries: CardCollectionEntry[]): Promise<void> {
  ensureCardCss();
  const done = once<void>();
  const inDeck = entries.reduce((s, e) => s + e.inDeck, 0);
  const spare = entries.reduce((s, e) => s + e.spare, 0);
  const owned = entries.filter(e => e.owned > 0).length;
  const shell = openShell(ctx, {
    theme: 'cards',
    title: 'Stół z kartami',
    icon: '🃏',
    subtitle: `Masz ${owned} z ${entries.length} rodzajów kart`,
    onClose: () => {
      done.resolve();
      void shell.close();
    },
  });
  shell.headExtra.append(
    h('div', { class: 'pn-pill cc-pill cc-pill-deck' }, 'Talia: ', h('b', null, `${inDeck}/${DECK_MAX}`)),
    h('div', { class: 'pn-pill cc-pill cc-pill-spare' }, 'Zapas: ', h('b', null, String(spare))),
  );

  const sorted = [...entries].sort((a, b) => Number(b.owned > 0) - Number(a.owned > 0));
  const grid = h('div', { class: 'cc-grid' });
  for (const e of sorted) {
    const card = cardFace(ctx, { ...e.face, playable: e.owned > 0 }, { size: 'small' });
    const badges = h('div', { class: 'cc-badges' });
    if (e.owned === 0) badges.append(h('span', { class: 'cc-badge cc-none' }, 'Jeszcze nie masz'));
    else {
      badges.append(h('span', { class: `cc-badge cc-deck${e.inDeck === 0 ? ' is-zero' : ''}` }, `w talii ×${e.inDeck}`));
      if (e.spare > 0) badges.append(h('span', { class: 'cc-badge cc-spare' }, `zapas ×${e.spare}`));
    }
    const cell = h('div', { class: `cc-cell${e.owned === 0 ? ' is-missing' : ''}`, dataset: { cardId: e.cardId } }, h('div', { class: 'cc-card-wrap' }, card), badges);
    shell.onDispose(onTap(card, () => zoom(e)));
    grid.append(cell);
  }

  shell.body.classList.add('cc-body');
  shell.body.append(
    scroller('cc-scroll', grid),
    h(
      'footer',
      { class: 'cc-foot' },
      h('span', { attrs: { 'aria-hidden': 'true' } }, '💡'),
      spare > 0 ? ` Masz ${kartWord(spare)} w zapasie. Wymienisz je u Handlarza Kartoniniego!` : ' Dotknij karty, żeby ją obejrzeć.',
    ),
  );
  return done.promise;

  function zoom(e: CardCollectionEntry): void {
    ctx.sfx('tap');
    const big = cardFace(ctx, { ...e.face, playable: e.owned > 0 }, { size: 'big' });
    const facts =
      e.owned === 0
        ? h('div', { class: 'cc-zoom-facts' }, h('span', { class: 'cc-badge cc-none' }, 'Jeszcze nie masz tej karty'))
        : h(
            'div',
            { class: 'cc-zoom-facts' },
            h('span', { class: 'cc-badge cc-own' }, `masz ×${e.owned}`),
            h('span', { class: 'cc-badge cc-deck' }, `w talii ×${e.inDeck}`),
            e.spare > 0 ? h('span', { class: 'cc-badge cc-spare' }, `zapas ×${e.spare}`) : null,
          );
    const layer = h(
      'div',
      { class: 'cc-zoom', attrs: { role: 'dialog', 'aria-label': e.face.name } },
      h('div', { class: 'cc-zoom-card' }, big),
      facts,
      h('div', { class: 'cc-zoom-hint' }, 'Dotknij, żeby zamknąć'),
    );
    const off = onTap(layer, () => {
      off();
      layer.classList.add('is-out');
      window.setTimeout(() => layer.remove(), 160);
    });
    shell.sheet.append(layer);
  }
}

// ───────────────────────────── Handlarz Kartonini ─────────────────────────────

const OFFER_KIND: Record<MerchantOfferView['kind'], { label: string; icon: string; verb: string; lack: string }> = {
  threeForOne: { label: 'Wymiana 3 za 1', icon: '🔁', verb: 'Wymień', lack: 'Potrzebujesz 3 zapasowych kopii' },
  daily: { label: 'Oferta dnia', icon: '🌟', verb: 'Kup', lack: 'Za mało cyfr na tę sumę' },
  sell: { label: 'Sprzedaż', icon: '🪙', verb: 'Sprzedaj', lack: 'Nie masz zapasowej kopii' },
};

export function merchantPanel(ctx: UiContext, offers: MerchantOfferView[], digits: Digits): Promise<MerchantAction> {
  ensureCardCss();
  const done = once<MerchantAction>();
  const shell = openShell(ctx, {
    theme: 'merchant',
    title: 'Handlarz Kartonini',
    icon: '📦',
    subtitle: 'Wymiana kart',
    onClose: () => finish({ kind: 'close' }),
  });
  const finish = (a: MerchantAction): void => {
    done.resolve(a);
    void shell.close();
  };
  shell.headExtra.append(digitStrip(digits, 'Masz:'));

  // Lewa kolumna: Kartonini + dymek
  const npc = h(
    'aside',
    { class: 'mc-npc' },
    h('div', { class: 'mc-speech' }, bubble('Dzień dobry! Pohandlujemy?', 'info')),
    portraitBox(ctx, 'npc:kartonini', { cls: 'mc-portrait', fallback: '📦' }),
    h(
      'ul',
      { class: 'mc-rules' },
      h('li', null, h('b', null, '3 zapasowe'), ' → 1 lepsza karta'),
      h('li', null, h('b', null, 'Oferta dnia'), ' → za złożoną sumę'),
      h('li', null, h('b', null, 'Zapasową kartę'), ' sprzedasz za cyfry'),
    ),
  );

  // Prawa kolumna: oferty
  const order: MerchantOfferView['kind'][] = ['daily', 'threeForOne', 'sell'];
  const sorted = [...offers].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const list = h('div', { class: 'mc-offers' });
  for (const o of sorted) list.append(offerRow(o));
  if (!offers.length) list.append(h('div', { class: 'pn-empty' }, h('span', { class: 'pn-empty-ic' }, '📦'), 'Dziś nic nie mam. Wróć po wyprawie!'));

  shell.body.classList.add('mc-body');
  shell.body.append(h('div', { class: 'mc-layout' }, npc, scroller('mc-scroll', list)));
  return done.promise;

  function offerRow(o: MerchantOfferView): HTMLElement {
    const k = OFFER_KIND[o.kind];
    const chips = h('div', { class: 'mc-chips' });
    if (o.kind === 'threeForOne') chips.append(h('span', { class: 'mc-chip mc-chip-pay' }, '🃏 Oddajesz 3 zapasowe'));
    if (o.kind === 'daily' && o.price) chips.append(h('span', { class: 'mc-chip mc-chip-pay' }, `🔢 Złóż ${o.price.sum} z ${o.price.count} cyfr`));
    if (o.kind === 'sell' && o.digits !== undefined)
      chips.append(h('span', { class: 'mc-chip mc-chip-get' }, `Dostajesz +${o.digits} ${plural(o.digits, 'cyfrę', 'cyfry', 'cyfr')}`));
    const btn = button(k.verb, () => finish({ kind: 'accept', offerId: o.offerId }), `${o.kind === 'sell' ? 'btn-primary' : 'btn-good'} mc-btn`);
    btn.disabled = !o.available;
    return h(
      'article',
      { class: `mc-offer mc-${o.kind}${o.available ? '' : ' is-unavailable'}`, dataset: { offerId: o.offerId } },
      h('div', { class: 'mc-kind' }, h('span', { attrs: { 'aria-hidden': 'true' } }, k.icon), ` ${k.label}`),
      h('div', { class: 'mc-card' }, cardFace(ctx, { ...o.card, playable: true }, { size: 'small' })),
      h(
        'div',
        { class: 'mc-info' },
        h('div', { class: 'mc-text' }, o.text),
        chips,
        h('div', { class: 'mc-act' }, btn, o.available ? null : h('span', { class: 'mc-lack' }, k.lack)),
      ),
    );
  }
}
