/**
 * Ekran tytułowy (logo z kostek, „Graj”, „Rodzic”) i tworzenie bohatera (imię + kolor koszulki).
 * Tło przezroczyste — za UI kręci się orbita 3D.
 */
import type { UiContext } from './context';
import { button, h, hideAndRemove, onTap, show } from './dom';
import { icon } from './icons';

const LOGO = 'Matematico';
const LOGO_COLORS = ['#ff6b6b', '#ff9f43', '#ffd23f', '#3ccf6e', '#2ec4d6', '#3fa7ff', '#8f7bff', '#ff7ac6', '#ff9f43', '#3ccf6e'];

export function logoEl(): HTMLElement {
  const el = h('h1', { class: 'logo', attrs: { 'aria-label': LOGO } });
  [...LOGO].forEach((ch, i) => {
    const tile = h('span', { class: 'logo-tile', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'logo-ch' }, ch));
    tile.style.setProperty('--c', LOGO_COLORS[i % LOGO_COLORS.length] ?? '#3fa7ff');
    tile.style.setProperty('--i', String(i));
    tile.style.setProperty('--r', `${[-5, 3, -2, 4, -4, 2, -3, 5, -2, 3][i] ?? 0}deg`);
    el.append(tile);
  });
  return el;
}

export function titleScreen(ctx: UiContext, vm: { hasProgress: boolean; name: string }): Promise<'play' | 'parent'> {
  return new Promise(resolve => {
    const name = vm.name.trim();
    let done = false;
    const finish = (v: 'play' | 'parent'): void => {
      if (done) return;
      done = true;
      ctx.sfx('tap');
      window.removeEventListener('keydown', onKeyDown);
      void hideAndRemove(root).then(() => resolve(v));
    };
    const play = button(h('span', { class: 'title-play-in' }, icon('play'), h('span', null, 'Graj')), () => finish('play'), 'btn-primary title-play');
    const parent = button(h('span', { class: 'title-parent-in' }, icon('lock'), h('span', null, 'Rodzic')), () => finish('parent'), 'btn-ghost title-parent');
    const root = h(
      'div',
      { class: 'title-screen' },
      h('div', { class: 'title-center' },
        logoEl(),
        h('div', { class: 'title-tagline' }, 'Przygoda z liczbami'),
        name ? h('div', { class: 'title-hello' }, `Cześć, ${name}!`) : h('div', { class: 'title-hello is-empty' }),
        play,
        vm.hasProgress ? h('div', { class: 'title-sub' }, 'Twoje stworki czekają w bazie') : null,
      ),
      parent,
    );
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') finish('play');
    };
    window.addEventListener('keydown', onKeyDown);
    ctx.layers.panel.append(root);
    void show(root);
  });
}

export const SHIRT_COLORS = ['#e84a5f', '#3fa7ff', '#3ccf6e', '#ffc93c', '#9b6bff', '#ff8c42'];
const SHIRT_NAMES = ['czerwona', 'niebieska', 'zielona', 'żółta', 'fioletowa', 'pomarańczowa'];

function heroPreview(color: string): HTMLElement {
  const el = h(
    'div',
    { class: 'hero-prev', attrs: { 'aria-hidden': 'true' } },
    h('div', { class: 'hp-head' }, h('div', { class: 'hp-hair' }), h('div', { class: 'hp-eye l' }), h('div', { class: 'hp-eye r' }), h('div', { class: 'hp-smile' })),
    h('div', { class: 'hp-body' }, h('div', { class: 'hp-arm l' }), h('div', { class: 'hp-shirt' }), h('div', { class: 'hp-arm r' })),
    h('div', { class: 'hp-legs' }, h('div', { class: 'hp-leg' }), h('div', { class: 'hp-leg' })),
    h('div', { class: 'hp-shadow' }),
  );
  el.style.setProperty('--shirt', color);
  return el;
}

export function profileSetupScreen(ctx: UiContext, defaults: { name: string; color: string }): Promise<{ name: string; color: string }> {
  return new Promise(resolve => {
    const def = defaults.color.toLowerCase();
    let color = SHIRT_COLORS.find(c => c.toLowerCase() === def) ?? SHIRT_COLORS[0] ?? '#3fa7ff';
    const preview = heroPreview(color);

    const input = h('input', {
      class: 'prof-input',
      attrs: {
        type: 'text',
        maxlength: '12',
        placeholder: 'Twoje imię',
        autocomplete: 'off',
        autocapitalize: 'words',
        spellcheck: 'false',
        enterkeyhint: 'done',
        'aria-label': 'Imię',
      },
    });
    input.value = defaults.name.slice(0, 12);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('input', () => {
      if (input.value.length > 12) input.value = input.value.slice(0, 12);
    });

    const swatches = h('div', { class: 'prof-swatches', attrs: { role: 'radiogroup', 'aria-label': 'Kolor koszulki' } });
    const swEls: HTMLElement[] = SHIRT_COLORS.map((c, i) => {
      const sw = h('button', {
        class: `prof-swatch${c === color ? ' is-on' : ''}`,
        attrs: { type: 'button', role: 'radio', 'aria-label': `koszulka ${SHIRT_NAMES[i] ?? ''}`, 'aria-checked': String(c === color) },
      }, icon('check', 'prof-check'));
      sw.style.setProperty('--sw', c);
      onTap(sw, () => {
        color = c;
        ctx.sfx('tap');
        for (const o of swEls) {
          const on = o === sw;
          o.classList.toggle('is-on', on);
          o.setAttribute('aria-checked', String(on));
        }
        preview.style.setProperty('--shirt', c);
        preview.classList.remove('hop');
        void preview.offsetWidth;
        preview.classList.add('hop');
      });
      swatches.append(sw);
      return sw;
    });

    let done = false;
    const ok = button(h('span', { class: 'btn-in' }, h('span', null, 'Gotowe!'), icon('arrow')), () => {
      if (done) return;
      done = true;
      ctx.sfx('tap');
      input.blur();
      const name = input.value.trim().slice(0, 12);
      void hideAndRemove(root).then(() => resolve({ name, color }));
    }, 'btn-good btn-big prof-ok');

    const root = h(
      'div',
      { class: 'ui-modal prof-modal' },
      h('div', { class: 'panel prof-panel' },
        h('div', { class: 'prof-stage' }, preview),
        h('div', { class: 'prof-form' },
          h('h2', { class: 'prof-title' }, 'Kim jesteś?'),
          h('label', { class: 'prof-label' }, 'Imię ', h('span', { class: 'muted' }, '(możesz pominąć)')),
          input,
          h('div', { class: 'prof-label' }, 'Kolor koszulki'),
          swatches,
          ok,
        ),
      ),
    );
    ctx.layers.panel.append(root);
    void show(root);
  });
}
