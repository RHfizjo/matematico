/**
 * Wejście (GDD 14): dotyk (MVP) + klawiatura (testy deweloperskie) → akcje abstrakcyjne.
 * Implementacja InputApi z game/contracts.ts.
 *
 * Warstwa DOM `.input-layer` (z-index 15, między HUD a panelami) dokładana do `root`:
 *  - pływająca gałka w lewych 45% ekranu (pojawia się pod palcem, promień 70 px, martwa strefa 0.15),
 *  - duży okrągły przycisk akcji w prawym dolnym rogu (ikona + etykieta),
 *  - przycisk pauzy w lewym górnym rogu.
 * Wielodotyk przez Pointer Events z przechwyceniem wskaźnika (gałka i akcja jednocześnie).
 */
import './input.css';
import type { ActionIcon, InputApi } from '../game/contracts';
import { clampBase, followBase, stickVector, type Point } from './joystick';
import { isActivatableTarget, isEditableTarget, keyboardVector, mapKey, type Dir } from './keyboard';

export { stickVector, followBase, clampBase } from './joystick';
export { keyboardVector, mapKey } from './keyboard';

/** Promień podstawy gałki (px CSS, GDD 14.1). */
export const STICK_RADIUS = 70;
export const STICK_DEADZONE = 0.15;
/** Ułamek szerokości ekranu (od lewej) aktywny dla gałki. */
export const STICK_ZONE = 0.45;
/** Najkrótszy odstęp między dwiema akcjami (ms) — przeciw podwójnym stuknięciom. */
const ACTION_COOLDOWN_MS = 250;
/** Margines podstawy gałki od krawędzi ekranu (gesty systemowe Androida). */
const EDGE_MARGIN = 14;

/** Emoji dla ikon akcji (Noto Color Emoji na Androidzie). */
export const ACTION_EMOJI: Record<ActionIcon, string> = {
  catch: '🥅',
  open: '🗝️',
  enter: '🚪',
  talk: '💬',
  feed: '🍎',
  forge: '🔨',
  treasury: '💰',
  gallery: '🖼️',
  map: '🗺️',
  portal: '🌀',
  gate: '🏰',
};

const PAUSE_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
  '<rect x="12" y="8" width="15" height="48" rx="5" fill="#1f2a44"/>' +
  '<rect x="37" y="8" width="15" height="48" rx="5" fill="#1f2a44"/></svg>';

type Listener<A extends unknown[]> = (...args: A) => void;

function emitter<A extends unknown[]>(): {
  on(cb: Listener<A>): () => void;
  emit(...args: A): void;
  clear(): void;
} {
  const set = new Set<Listener<A>>();
  return {
    on(cb) {
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
    emit(...args) {
      for (const cb of [...set]) {
        try {
          cb(...args);
        } catch (e) {
          console.error('[input] błąd w obsłudze zdarzenia', e);
        }
      }
    },
    clear() {
      set.clear();
    },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, attrs?: Record<string, string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function createInput(root: HTMLElement): InputApi {
  const actionEv = emitter<[]>();
  const pauseEv = emitter<[]>();
  const answerEv = emitter<[number]>();

  // ─────────── DOM ───────────
  const layer = el('div', 'input-layer is-ui', { 'data-mode': 'ui' });
  const zone = el('div', 'in-zone', { 'aria-hidden': 'true' });

  const stick = el('div', 'in-stick', { 'aria-hidden': 'true' });
  const ring = el('div', 'in-stick-ring');
  for (const a of ['up', 'down', 'left', 'right']) ring.append(el('span', `in-stick-arrow a-${a}`));
  const knob = el('div', 'in-stick-knob');
  const hint = el('div', 'in-stick-hint');
  const hand = el('span', 'in-stick-hint-hand');
  hand.textContent = '👆';
  hint.append(hand, document.createTextNode('Przesuń'));
  stick.append(ring, knob, hint);

  const pauseBtn = el('button', 'in-pause', { type: 'button', 'aria-label': 'Pauza' });
  pauseBtn.innerHTML = PAUSE_SVG;

  const actionWrap = el('div', 'in-action-wrap is-off');
  const actionBtn = el('button', 'in-action', { type: 'button', 'aria-label': 'Akcja' });
  const actionIc = el('span', 'in-action-ic', { 'aria-hidden': 'true' });
  const actionLabel = el('span', 'in-action-label');
  actionBtn.append(actionIc);
  actionWrap.append(actionBtn, actionLabel);

  layer.append(zone, stick, actionWrap, pauseBtn);
  root.append(layer);

  // ─────────── Stan ───────────
  let mode: 'explore' | 'ui' = 'ui';
  let disposed = false;
  let action: { icon: ActionIcon; label: string } | null = null;
  let lastActionAt = -Infinity;
  let popTimer: ReturnType<typeof setTimeout> | null = null;
  let swapTimer: ReturnType<typeof setTimeout> | null = null;

  // gałka
  let stickId: number | null = null;
  let logicalBase: Point = { x: 0, y: 0 };
  let layerRect = { left: 0, top: 0, width: 0, height: 0 };
  let stickMove = { x: 0, y: 0 };
  let usedOnce = false;

  // klawiatura
  const heldCodes = new Map<string, Dir>();

  // ─────────── Gałka ───────────
  function measure(): void {
    const r = layer.getBoundingClientRect();
    layerRect = { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function restPos(): Point {
    const w = layerRect.width || window.innerWidth;
    const hgt = layerRect.height || window.innerHeight;
    const x = Math.max(32 + STICK_RADIUS + 40, w * 0.14);
    const y = hgt - Math.max(32 + STICK_RADIUS + 60, hgt * 0.22);
    return { x, y };
  }

  function visualBase(p: Point): Point {
    const w = layerRect.width || window.innerWidth;
    const hgt = layerRect.height || window.innerHeight;
    return clampBase(p, STICK_RADIUS, { left: 0, top: 0, right: w, bottom: hgt }, EDGE_MARGIN);
  }

  function placeStick(base: Point, knobX: number, knobY: number): void {
    stick.style.transform = `translate3d(${(base.x - STICK_RADIUS).toFixed(1)}px, ${(base.y - STICK_RADIUS).toFixed(1)}px, 0)`;
    knob.style.transform = knobX === 0 && knobY === 0 ? '' : `translate3d(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px, 0)`;
  }

  function restStick(): void {
    measure();
    placeStick(restPos(), 0, 0);
  }

  function toLocal(e: PointerEvent): Point {
    return { x: e.clientX - layerRect.left, y: e.clientY - layerRect.top };
  }

  function updateStick(finger: Point): void {
    logicalBase = followBase(logicalBase, finger, STICK_RADIUS);
    const v = stickVector(finger.x - logicalBase.x, finger.y - logicalBase.y, STICK_RADIUS, { deadzone: STICK_DEADZONE });
    stickMove = { x: v.x, y: v.y };
    placeStick(visualBase(logicalBase), v.knobX, v.knobY);
  }

  function endStick(): void {
    if (stickId !== null) {
      try {
        if (zone.hasPointerCapture(stickId)) zone.releasePointerCapture(stickId);
      } catch {
        /* wskaźnik już zniknął */
      }
    }
    stickId = null;
    stickMove = { x: 0, y: 0 };
    stick.classList.remove('is-active');
    restStick();
  }

  const onZoneDown = (e: PointerEvent): void => {
    if (mode !== 'explore' || disposed) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (stickId !== null) return; // drugi palec w obszarze gałki — ignorujemy
    stickId = e.pointerId;
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      /* syntetyczne zdarzenia (harness) nie mają aktywnego wskaźnika */
    }
    measure();
    const p = toLocal(e);
    logicalBase = p;
    if (!usedOnce) {
      usedOnce = true;
      stick.classList.add('no-hint');
    }
    stick.classList.add('is-active');
    updateStick(p);
  };
  const onZoneMove = (e: PointerEvent): void => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    updateStick(toLocal(e));
  };
  const onZoneUp = (e: PointerEvent): void => {
    if (e.pointerId !== stickId) return;
    endStick();
  };

  zone.addEventListener('pointerdown', onZoneDown);
  zone.addEventListener('pointermove', onZoneMove);
  zone.addEventListener('pointerup', onZoneUp);
  zone.addEventListener('pointercancel', onZoneUp);
  zone.addEventListener('lostpointercapture', onZoneUp);

  // ─────────── Akcja ───────────
  function fireAction(): void {
    if (mode !== 'explore' || !action || disposed) return;
    const t = now();
    if (t - lastActionAt < ACTION_COOLDOWN_MS) return;
    lastActionAt = t;
    actionEv.emit();
  }

  /** Czas ostatniego zdarzenia wskaźnika na przyciskach — „click” po dotknięciu nie może wywołać akcji drugi raz. */
  let lastPointerAt = -Infinity;
  const CLICK_AFTER_POINTER_MS = 800;

  let actionPtr: number | null = null;
  const onActionDown = (e: PointerEvent): void => {
    lastPointerAt = now();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (mode !== 'explore' || !action) return;
    actionPtr = e.pointerId;
    try {
      actionBtn.setPointerCapture(e.pointerId);
    } catch {
      /* jw. */
    }
    actionBtn.classList.add('is-pressed');
    // Akcja od razu przy dotknięciu (szybka reakcja); przechwycenie wskaźnika zapobiega
    // „przebiciu” puszczenia palca do panelu, który akcja właśnie otworzyła.
    fireAction();
  };
  const onActionUp = (e: PointerEvent): void => {
    lastPointerAt = now();
    if (e.pointerId !== actionPtr) return;
    actionPtr = null;
    actionBtn.classList.remove('is-pressed');
  };
  actionBtn.addEventListener('pointerdown', onActionDown);
  actionBtn.addEventListener('pointerup', onActionUp);
  actionBtn.addEventListener('pointercancel', onActionUp);
  actionBtn.addEventListener('lostpointercapture', onActionUp);
  // Dostępność: fokus + Enter/Spacja na przycisku albo czytnik ekranu (klik bez wskaźnika).
  const onActionClick = (): void => {
    if (now() - lastPointerAt > CLICK_AFTER_POINTER_MS) fireAction();
  };
  actionBtn.addEventListener('click', onActionClick);

  function renderAction(next: { icon: ActionIcon; label: string } | null, prev: { icon: ActionIcon; label: string } | null): void {
    if (popTimer) {
      clearTimeout(popTimer);
      popTimer = null;
    }
    if (next) {
      actionIc.textContent = ACTION_EMOJI[next.icon] ?? '✋';
      actionLabel.textContent = next.label;
      actionBtn.setAttribute('aria-label', next.label);
      if (!prev || actionWrap.classList.contains('is-off') || actionWrap.classList.contains('pop-out')) {
        actionWrap.classList.remove('is-off', 'pop-out', 'swap');
        void actionWrap.offsetWidth; // restart animacji
        actionWrap.classList.add('pop-in');
      } else {
        // zmiana ikony/etykiety przy widocznym przycisku — małe „pyk”
        actionWrap.classList.remove('swap');
        void actionWrap.offsetWidth;
        actionWrap.classList.add('swap');
        if (swapTimer) clearTimeout(swapTimer);
        swapTimer = setTimeout(() => actionWrap.classList.remove('swap'), 340);
      }
    } else if (!actionWrap.classList.contains('is-off')) {
      actionWrap.classList.remove('pop-in', 'swap');
      actionWrap.classList.add('pop-out');
      actionBtn.classList.remove('is-pressed');
      popTimer = setTimeout(() => {
        popTimer = null;
        actionWrap.classList.remove('pop-out');
        actionWrap.classList.add('is-off');
      }, 210);
    }
  }

  // ─────────── Pauza (dotknięcie = wciśnij i puść na przycisku) ───────────
  let pausePtr: number | null = null;
  const onPauseDown = (e: PointerEvent): void => {
    lastPointerAt = now();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (mode !== 'explore') return;
    pausePtr = e.pointerId;
    try {
      pauseBtn.setPointerCapture(e.pointerId);
    } catch {
      /* jw. */
    }
    pauseBtn.classList.add('is-pressed');
  };
  const onPauseUp = (e: PointerEvent): void => {
    lastPointerAt = now();
    if (e.pointerId !== pausePtr) return;
    pausePtr = null;
    pauseBtn.classList.remove('is-pressed');
    if (e.type !== 'pointerup' || mode !== 'explore') return;
    const r = pauseBtn.getBoundingClientRect();
    const tol = 16;
    const inside = e.clientX >= r.left - tol && e.clientX <= r.right + tol && e.clientY >= r.top - tol && e.clientY <= r.bottom + tol;
    if (inside) pauseEv.emit();
  };
  const onPauseCancel = (e: PointerEvent): void => {
    if (e.pointerId !== pausePtr) return;
    pausePtr = null;
    pauseBtn.classList.remove('is-pressed');
  };
  pauseBtn.addEventListener('pointerdown', onPauseDown);
  pauseBtn.addEventListener('pointerup', onPauseUp);
  pauseBtn.addEventListener('pointercancel', onPauseCancel);
  const onPauseClick = (): void => {
    if (mode === 'explore' && now() - lastPointerAt > CLICK_AFTER_POINTER_MS) pauseEv.emit();
  };
  pauseBtn.addEventListener('click', onPauseClick);

  const onContextMenu = (e: Event): void => e.preventDefault();
  layer.addEventListener('contextmenu', onContextMenu);

  // ─────────── Klawiatura ───────────
  const onKeyDown = (e: KeyboardEvent): void => {
    if (disposed || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditableTarget(e.target)) return;
    const a = mapKey(e.code, e.key);
    if (!a) return;
    switch (a.kind) {
      case 'move':
        if (mode !== 'explore') return;
        e.preventDefault();
        heldCodes.set(e.code || e.key, a.dir);
        return;
      case 'action':
        if (isActivatableTarget(e.target)) return; // przycisk z fokusem sam obsłuży Enter/Spację
        if (mode !== 'explore') return;
        e.preventDefault();
        if (!e.repeat) fireAction();
        return;
      case 'pause':
        if (mode !== 'explore') return;
        e.preventDefault();
        if (!e.repeat) pauseEv.emit();
        return;
      case 'answer':
        if (e.repeat) return;
        answerEv.emit(a.index);
        return;
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    heldCodes.delete(e.code || e.key);
  };
  const releaseAll = (): void => {
    heldCodes.clear();
    if (stickId !== null) endStick();
  };
  const onVisibility = (): void => {
    if (document.hidden) releaseAll();
  };
  const onResize = (): void => {
    if (stickId === null) restStick();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  restStick();

  // ─────────── API ───────────
  const api: InputApi = {
    setMode(m) {
      if (disposed) return;
      if (m === mode) return;
      mode = m;
      layer.dataset.mode = m;
      layer.classList.toggle('is-ui', m === 'ui');
      if (m === 'ui') {
        releaseAll();
        actionBtn.classList.remove('is-pressed');
        pauseBtn.classList.remove('is-pressed');
        actionPtr = null;
        pausePtr = null;
      } else {
        restStick();
        // ponowne pokazanie przycisku akcji z animacją
        if (action) renderAction(action, null);
      }
    },

    getMove() {
      if (mode !== 'explore' || disposed) return { x: 0, y: 0 };
      if (stickId !== null && (stickMove.x !== 0 || stickMove.y !== 0)) return { x: stickMove.x, y: stickMove.y };
      if (heldCodes.size > 0) return keyboardVector(heldCodes.values());
      return { x: 0, y: 0 };
    },

    setAction(next) {
      if (disposed) return;
      const same = next === action || (next !== null && action !== null && next.icon === action.icon && next.label === action.label);
      if (same) return;
      const prev = action;
      action = next ? { icon: next.icon, label: next.label } : null;
      renderAction(action, prev);
    },

    onAction(cb) {
      return actionEv.on(cb);
    },
    onPause(cb) {
      return pauseEv.on(cb);
    },
    onAnswerKey(cb) {
      return answerEv.on(cb);
    },

    dispose() {
      if (disposed) return;
      releaseAll();
      disposed = true;
      if (popTimer) clearTimeout(popTimer);
      if (swapTimer) clearTimeout(swapTimer);
      zone.removeEventListener('pointerdown', onZoneDown);
      zone.removeEventListener('pointermove', onZoneMove);
      zone.removeEventListener('pointerup', onZoneUp);
      zone.removeEventListener('pointercancel', onZoneUp);
      zone.removeEventListener('lostpointercapture', onZoneUp);
      actionBtn.removeEventListener('pointerdown', onActionDown);
      actionBtn.removeEventListener('pointerup', onActionUp);
      actionBtn.removeEventListener('pointercancel', onActionUp);
      actionBtn.removeEventListener('lostpointercapture', onActionUp);
      actionBtn.removeEventListener('click', onActionClick);
      pauseBtn.removeEventListener('pointerdown', onPauseDown);
      pauseBtn.removeEventListener('pointerup', onPauseUp);
      pauseBtn.removeEventListener('pointercancel', onPauseCancel);
      pauseBtn.removeEventListener('click', onPauseClick);
      layer.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      actionEv.clear();
      pauseEv.clear();
      answerEv.clear();
      layer.remove();
    },
  };
  return api;
}
