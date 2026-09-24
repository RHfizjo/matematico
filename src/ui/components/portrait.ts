/**
 * Portret postaci w kółku/ramce: obrazek z ctx.portrait (render), a bez niego zastępcza sylwetka.
 */
import type { ModelId } from '../../game/contracts';
import type { UiContext } from '../context';
import { h } from '../dom';

const FALLBACK: Record<string, string> = {
  hero: '🙂',
  creature: '🐰',
  enemy: '👾',
  glam: '✨',
  npc: '📦',
  prop: '🎁',
};

export function fallbackGlyph(model: ModelId): string {
  const prefix = model.includes(':') ? model.slice(0, model.indexOf(':')) : model;
  return FALLBACK[prefix] ?? '⭐';
}

/** Element .portrait z <img>; klasa .is-fallback gdy brak obrazka. */
export function portraitEl(ctx: UiContext, model: ModelId, cls = ''): HTMLElement {
  const img = h('img', { class: 'portrait-img', attrs: { alt: '', draggable: 'false' } });
  const el = h('div', { class: `portrait is-loading ${cls}`.trim() }, img, h('span', { class: 'portrait-fb', attrs: { 'aria-hidden': 'true' } }, fallbackGlyph(model)));
  const kind = model.split(':')[0] ?? 'hero';
  el.dataset.kind = kind;
  ctx
    .portrait(model)
    .then(url => {
      el.classList.remove('is-loading');
      if (url) {
        img.src = url;
      } else el.classList.add('is-fallback');
    })
    .catch(() => {
      el.classList.remove('is-loading');
      el.classList.add('is-fallback');
    });
  return el;
}
