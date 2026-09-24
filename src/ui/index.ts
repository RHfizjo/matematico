/**
 * UI (DOM) — implementacja UiApi z game/contracts.ts.
 * Składa moduły rdzenia UI (HUD, karty, odpowiedzi, podpowiedzi, dialogi) z panelami bazy z src/ui/panels/.
 */
import './theme.css';
import './styles/base.css';
import './styles/hud.css';
import './styles/combat.css';
import './styles/answer.css';
import './styles/hint.css';
import './styles/dialogs.css';
import './styles/screens.css';

import type { ModelId, SfxName, UiApi } from '../game/contracts';
import { answerPanel } from './answer';
import { createCardTurn } from './cardTurn';
import { CARD_CSS } from './components/cardFace';
import type { UiContext } from './context';
import { breakReminderDialog, celebrateDialog, confirmDialog, createPause, sayDialog } from './dialogs';
import { ensureLayers } from './dom';
import { hintPanel } from './hint';
import { createHud } from './hud';
import { createOverlay } from './overlay';
import { expeditionsPanel, forgePanel, galleryPanel, penPanel, treasuryPanel } from './panels/base';
import { cardsPanel, merchantPanel } from './panels/cards';
import { pickDigitsPanel } from './panels/digitPicker';
import { gatePanel } from './panels/gate';
import { parentLockPanel, parentPanelView } from './panels/parent';
import { profileSetupScreen, titleScreen } from './title';

/** UiApi + metody spoza kontraktu (podpięcie dźwięków). */
export type UiApiExt = UiApi & { setSfx(fn: (name: SfxName) => void): void };

function injectStyle(id: string, css: string): void {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.append(el);
}

export function createUi(root: HTMLElement): UiApiExt {
  injectStyle('ui-card-css', CARD_CSS);
  root.classList.add('ui-root');
  const layers = ensureLayers(root);

  let portraitFn: ((model: ModelId) => Promise<string>) | null = null;
  let sfxFn: (name: SfxName) => void = () => {};
  const portraitCache = new Map<string, Promise<string | null>>();

  const ctx: UiContext = {
    layers,
    portrait(model: ModelId): Promise<string | null> {
      const fn = portraitFn;
      if (!fn) return Promise.resolve(null);
      const hit = portraitCache.get(model);
      if (hit) return hit;
      const p = Promise.resolve()
        .then(() => fn(model))
        .then(url => (typeof url === 'string' && url.length > 0 ? url : null))
        .catch(() => null);
      portraitCache.set(model, p);
      // Nie zapamiętujemy porażek — kolejna próba może się udać (np. po starcie renderu).
      void p.then(url => {
        if (url === null) portraitCache.delete(model);
      });
      return p;
    },
    sfx(name: SfxName): void {
      try {
        sfxFn(name);
      } catch {
        /* dźwięk nie może zepsuć UI */
      }
    },
  };

  const overlay = createOverlay(ctx);
  const hud = createHud(ctx);
  const cards = createCardTurn(ctx, hud);
  const pause = createPause(ctx);

  const api: UiApiExt = {
    root,
    setPortraitProvider(fn) {
      portraitFn = fn;
      portraitCache.clear();
    },
    setSfx(fn) {
      sfxFn = fn;
    },

    fade: (to, ms) => overlay.fade(to, ms),
    toast: (text, kind) => overlay.toast(text, kind),
    loading: (show, text) => overlay.loading(show, text),
    setFpsVisible: (visible, read) => overlay.setFpsVisible(visible, read),

    title: vm => titleScreen(ctx, vm),
    profileSetup: defaults => profileSetupScreen(ctx, defaults),

    hud: {
      show: v => hud.show(v),
      setLocation: n => hud.setLocation(n),
      setDigits: t => hud.setDigits(t),
      setHp: (v, m) => hud.setHp(v, m),
      setEnemy: e => hud.setEnemy(e),
      setIntent: i => hud.setIntent(i),
      setShield: a => hud.setShield(a),
      floatText: (at, text, kind) => hud.floatText(at, text, kind),
    },

    cardTurn: view => cards.turn(view),
    hideCards: () => cards.hide(),
    answer: req => answerPanel(ctx, req),
    hint: (h, opts) => hintPanel(ctx, h, opts),

    say: opts => sayDialog(ctx, opts),
    celebrate: req => celebrateDialog(ctx, req),
    confirm: (text, yes, no) => confirmDialog(ctx, text, yes, no),

    // Panele zespołu ui-panels (async: wyjątek z zaślepki staje się odrzuconą obietnicą).
    gate: async req => gatePanel(ctx, req),
    pickDigits: async req => pickDigitsPanel(ctx, req),
    pen: async c => penPanel(ctx, c),
    treasury: async d => treasuryPanel(ctx, d),
    forge: async (items, digits) => forgePanel(ctx, items, digits),
    gallery: async c => galleryPanel(ctx, c),
    expeditions: async lands => expeditionsPanel(ctx, lands),
    cards: async entries => cardsPanel(ctx, entries),
    merchant: async (offers, digits) => merchantPanel(ctx, offers, digits),

    pause: vm => pause(vm),
    parentLock: async () => parentLockPanel(ctx),
    parentPanel: async (vm, handlers) => parentPanelView(ctx, vm, handlers),
    breakReminder: minutes => breakReminderDialog(ctx, minutes),
  };
  return api;
}

export type { UiContext } from './context';
