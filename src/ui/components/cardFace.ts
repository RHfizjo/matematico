/**
 * Wygląd karty (ręka w walce, kolekcja, handlarz). Wspólny komponent dla całego UI.
 * Karta: ramka w kolorze rzadkości, klejnot kosztu (gwiazdki energii), portret, nazwa, znaczek siły, opis.
 */
import type { CardFace } from '../../game/contracts';
import type { UiContext } from '../context';
import { h } from '../dom';

const KIND_ICON: Record<CardFace['kind'], string> = {
  attack: '⚔️',
  strongAttack: '💥',
  shield: '🛡️',
  bigShield: '🛡️',
  heal: '💖',
  weaken: '🎀',
  multiHit: '✨',
  combo: '💐',
};

const KIND_LABEL: Record<CardFace['kind'], string> = {
  attack: 'Atak',
  strongAttack: 'Mocny atak',
  shield: 'Tarcza',
  bigShield: 'Wielka tarcza',
  heal: 'Leczenie',
  weaken: 'Osłabienie',
  multiHit: 'Seria',
  combo: 'Atak + tarcza',
};

export type CardFaceData = Omit<CardFace, 'uid' | 'playable'> & { uid?: string; playable?: boolean };

export function cardFace(ctx: UiContext, face: CardFaceData, opts?: { size?: 'hand' | 'small' | 'big' }): HTMLElement {
  const size = opts?.size ?? 'hand';
  const img = h('img', { class: 'card-art', attrs: { alt: '', draggable: 'false' } });
  const artBox = h('div', { class: 'card-art-box' }, img);
  artBox.dataset.fallback = face.name.slice(0, 1);
  ctx
    .portrait(face.art)
    .then(url => {
      if (url) img.src = url;
      else artBox.classList.add('no-art');
    })
    .catch(() => artBox.classList.add('no-art'));

  const el = h(
    'div',
    {
      class: `card card-${size} rarity-${face.rarity} kind-${face.kind}${face.playable === false ? ' unplayable' : ''}`,
      dataset: { cardId: face.cardId, ...(face.uid ? { uid: face.uid } : {}) },
      attrs: { role: 'button', 'aria-label': `${face.name}: ${face.description}` },
    },
    h('div', { class: 'card-cost', attrs: { 'aria-label': `koszt ${face.cost}` } }, '★'.repeat(face.cost)),
    artBox,
    h('div', { class: 'card-name' }, face.name),
    h('div', { class: 'card-power' }, h('span', { class: 'card-kind-icon' }, KIND_ICON[face.kind]), face.powerText),
    h('div', { class: 'card-kind' }, KIND_LABEL[face.kind]),
    size !== 'small' ? h('div', { class: 'card-desc' }, face.description) : null,
  );
  return el;
}

export const CARD_CSS = `
.card { position: relative; width: 170px; height: 238px; border-radius: 18px; background: var(--paper);
  border: 5px solid var(--ink); box-shadow: var(--shadow); display: flex; flex-direction: column; align-items: center;
  padding: 8px 8px 10px; transition: transform 160ms cubic-bezier(.2,1.3,.4,1), filter 160ms; }
.card.card-small { width: 120px; height: 168px; border-width: 4px; }
.card.card-big { width: 250px; height: 350px; }
.card.rarity-common { background: linear-gradient(#fffaf0, #f3ead2); }
.card.rarity-uncommon { background: linear-gradient(#eafff1, #c9f2d8); border-color: #1d7a45; }
.card.rarity-rare { background: linear-gradient(#efeaff, #d5cbff); border-color: var(--rare); }
.card.rarity-legendary { background: linear-gradient(#fff4d6, #ffd98a); border-color: var(--legendary);
  box-shadow: 0 0 0 3px #fff5, 0 0 24px #ffb84d, var(--shadow); }
.card.unplayable { filter: grayscale(0.7) brightness(0.9); }
.card-cost { position: absolute; top: -14px; left: -12px; background: var(--energy); border: 4px solid var(--ink);
  border-radius: 999px; padding: 2px 9px; font: 900 20px/1.2 var(--font); color: var(--ink); box-shadow: var(--shadow-sm); }
.card-art-box { width: 100%; flex: 1 1 auto; min-height: 0; border-radius: 12px; background: radial-gradient(circle at 50% 40%, #ffffffcc, #ffffff00 70%), #bfe6ff;
  display: flex; align-items: center; justify-content: center; overflow: hidden; }
.card-art { width: 100%; height: 100%; object-fit: contain; }
.card.kind-attack .card-art-box, .card.kind-strongAttack .card-art-box, .card.kind-multiHit .card-art-box {
  background: radial-gradient(circle at 50% 40%, #ffffffcc, #ffffff00 70%), #ffd6c2; }
.card.kind-shield .card-art-box, .card.kind-bigShield .card-art-box { background: radial-gradient(circle at 50% 40%, #ffffffcc, #ffffff00 70%), #bfe2ff; }
.card.kind-heal .card-art-box { background: radial-gradient(circle at 50% 40%, #ffffffcc, #ffffff00 70%), #c9f3d3; }
.card.kind-weaken .card-art-box { background: radial-gradient(circle at 50% 40%, #ffffffcc, #ffffff00 70%), #f1d6ff; }
.card.kind-combo .card-art-box { background: radial-gradient(circle at 50% 40%, #ffffffcc, #ffffff00 70%), #ffe9a8; }
.card-art-box.no-art::after { content: attr(data-fallback); font: 900 64px/1 var(--font); color: #ffffffcc; }
.card-art-box.no-art .card-art { display: none; }
.card-name { font: 900 18px/1.1 var(--font); text-align: center; margin-top: 6px; }
.card-small .card-name { font-size: 14px; }
.card-big .card-name { font-size: 24px; }
.card-power { position: absolute; right: -12px; top: 36%; background: #fff; border: 4px solid var(--ink); border-radius: 14px;
  font: 900 24px/1 var(--font); padding: 6px 8px; box-shadow: var(--shadow-sm); display: flex; gap: 2px; align-items: center; }
.card-kind { font: 800 13px/1.2 var(--font); color: var(--ink-soft); text-transform: uppercase; letter-spacing: .04em; }
.card-desc { font: 700 14px/1.2 var(--font); text-align: center; color: var(--ink-soft); margin-top: 2px; }
.card-big .card-desc { font-size: 18px; }
`;
