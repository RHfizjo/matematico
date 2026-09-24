/**
 * Warstwy globalne: zaciemnienie (fade), dymki (toast), ekran ładowania, licznik FPS.
 */
import type { QualityLevel } from '../game/contracts';
import type { UiContext } from './context';
import { h, wait } from './dom';
import { icon } from './icons';

const QUALITY_LABEL: Record<QualityLevel, string> = { low: 'niska', medium: 'średnia', high: 'wysoka' };

export function createOverlay(ctx: UiContext) {
  const fadeEl = h('div', { class: 'ui-fade passthrough' });
  ctx.layers.fade.append(fadeEl);
  let fadeToken = 0;

  const toastBox = h('div', { class: 'ui-toasts passthrough', attrs: { 'aria-live': 'polite' } });
  ctx.layers.toast.append(toastBox);

  let loadingEl: HTMLElement | null = null;
  let fpsEl: HTMLElement | null = null;
  let fpsTimer: ReturnType<typeof setInterval> | null = null;

  return {
    async fade(to: 'black' | 'clear', ms = 400): Promise<void> {
      const token = ++fadeToken;
      fadeEl.style.transitionDuration = `${Math.max(0, ms)}ms`;
      if (to === 'black') {
        fadeEl.classList.remove('passthrough');
        void fadeEl.offsetWidth;
        fadeEl.classList.add('is-black');
      } else {
        fadeEl.classList.remove('is-black');
      }
      await wait(Math.max(0, ms) + 20);
      if (token === fadeToken && to === 'clear') fadeEl.classList.add('passthrough');
    },

    toast(text: string, kind: 'info' | 'good' | 'warn' = 'info'): void {
      const ic = kind === 'good' ? icon('check') : kind === 'warn' ? icon('bulb') : icon('sparkles');
      const el = h('div', { class: `ui-toast toast-${kind}` }, ic, h('span', { class: 'ui-toast-t' }, text));
      toastBox.append(el);
      while (toastBox.children.length > 4) toastBox.firstElementChild?.remove();
      requestAnimationFrame(() => el.classList.add('shown'));
      const life = 2400 + Math.min(2400, text.length * 40);
      setTimeout(() => {
        el.classList.remove('shown');
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 320);
      }, life);
    },

    loading(show: boolean, text?: string): void {
      if (!show) {
        const el = loadingEl;
        loadingEl = null;
        if (el) {
          el.classList.remove('shown');
          setTimeout(() => el.remove(), 250);
        }
        return;
      }
      const label = text ?? 'Wczytywanie…';
      if (loadingEl) {
        const t = loadingEl.querySelector('.ui-loading-t');
        if (t) t.textContent = label;
        return;
      }
      loadingEl = h(
        'div',
        { class: 'ui-loading', attrs: { role: 'status' } },
        h('div', { class: 'ui-loading-card' },
          h('div', { class: 'ui-spinner', attrs: { 'aria-hidden': 'true' } }, h('i'), h('i'), h('i')),
          h('div', { class: 'ui-loading-t' }, label),
        ),
      );
      ctx.layers.fade.append(loadingEl);
      requestAnimationFrame(() => loadingEl?.classList.add('shown'));
    },

    setFpsVisible(visible: boolean, read?: () => { fps: number; renderScale: number; quality: QualityLevel }): void {
      if (fpsTimer) clearInterval(fpsTimer);
      fpsTimer = null;
      if (!visible) {
        fpsEl?.remove();
        fpsEl = null;
        return;
      }
      if (!fpsEl) {
        fpsEl = h('div', { class: 'ui-fps passthrough' });
        ctx.layers.toast.append(fpsEl);
      }
      const el = fpsEl;
      const update = (): void => {
        if (!read) {
          el.textContent = '— fps';
          return;
        }
        try {
          const s = read();
          el.textContent = `${Math.round(s.fps)} fps · ${Math.round(s.renderScale * 100)}% · ${QUALITY_LABEL[s.quality]}`;
          el.classList.toggle('is-low', s.fps < 45);
        } catch {
          el.textContent = '— fps';
        }
      };
      update();
      fpsTimer = setInterval(update, 500);
    },
  };
}

export type Overlay = ReturnType<typeof createOverlay>;
