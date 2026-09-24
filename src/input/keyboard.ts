/**
 * Klawiatura (tylko testy deweloperskie, GDD 14.2): czyste mapowanie klawiszy → akcje abstrakcyjne.
 * Używamy KeyboardEvent.code (niezależne od układu klawiatury), z zapasem na KeyboardEvent.key.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

export type KeyAction =
  | { kind: 'move'; dir: Dir }
  | { kind: 'action' }
  | { kind: 'pause' }
  | { kind: 'answer'; index: number };

const CODE_MAP: Record<string, KeyAction> = {
  KeyW: { kind: 'move', dir: 'up' },
  KeyS: { kind: 'move', dir: 'down' },
  KeyA: { kind: 'move', dir: 'left' },
  KeyD: { kind: 'move', dir: 'right' },
  ArrowUp: { kind: 'move', dir: 'up' },
  ArrowDown: { kind: 'move', dir: 'down' },
  ArrowLeft: { kind: 'move', dir: 'left' },
  ArrowRight: { kind: 'move', dir: 'right' },
  Space: { kind: 'action' },
  Enter: { kind: 'action' },
  NumpadEnter: { kind: 'action' },
  Escape: { kind: 'pause' },
  KeyP: { kind: 'pause' },
  Digit1: { kind: 'answer', index: 0 },
  Digit2: { kind: 'answer', index: 1 },
  Digit3: { kind: 'answer', index: 2 },
  Digit4: { kind: 'answer', index: 3 },
  Numpad1: { kind: 'answer', index: 0 },
  Numpad2: { kind: 'answer', index: 1 },
  Numpad3: { kind: 'answer', index: 2 },
  Numpad4: { kind: 'answer', index: 3 },
};

const KEY_MAP: Record<string, KeyAction> = {
  w: { kind: 'move', dir: 'up' },
  s: { kind: 'move', dir: 'down' },
  a: { kind: 'move', dir: 'left' },
  d: { kind: 'move', dir: 'right' },
  ArrowUp: { kind: 'move', dir: 'up' },
  ArrowDown: { kind: 'move', dir: 'down' },
  ArrowLeft: { kind: 'move', dir: 'left' },
  ArrowRight: { kind: 'move', dir: 'right' },
  ' ': { kind: 'action' },
  Spacebar: { kind: 'action' },
  Enter: { kind: 'action' },
  Escape: { kind: 'pause' },
  Esc: { kind: 'pause' },
  p: { kind: 'pause' },
  '1': { kind: 'answer', index: 0 },
  '2': { kind: 'answer', index: 1 },
  '3': { kind: 'answer', index: 2 },
  '4': { kind: 'answer', index: 3 },
};

/** Akcja dla klawisza albo null (klawisz nieobsługiwany). */
export function mapKey(code: string, key: string): KeyAction | null {
  const byCode = code ? CODE_MAP[code] : undefined;
  if (byCode) return byCode;
  if (code && code !== 'Unidentified') {
    // Znany fizyczny klawisz spoza mapy — nie zgadujemy po `key` (np. Digit5 z key '4' w innym układzie).
    if (/^(Key[A-Z]|Digit\d|Numpad\d|Arrow)/.test(code)) return null;
  }
  const k = key.length === 1 ? key.toLowerCase() : key;
  return KEY_MAP[k] ?? null;
}

/** Wektor ruchu z wciśniętych kierunków (x w prawo, y w górę), znormalizowany do długości ≤ 1. */
export function keyboardVector(held: Iterable<Dir>): { x: number; y: number } {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  for (const d of held) {
    if (d === 'up') up = true;
    else if (d === 'down') down = true;
    else if (d === 'left') left = true;
    else if (d === 'right') right = true;
  }
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (up ? 1 : 0) - (down ? 1 : 0);
  if (x !== 0 && y !== 0) {
    const k = Math.SQRT1_2;
    return { x: x * k, y: y * k };
  }
  return { x: x + 0, y: y + 0 };
}

/** Czy zdarzenie klawiatury pochodzi z pola edycji (wtedy nie przechwytujemy klawiszy). */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as { tagName?: unknown }).tagName !== 'string') return false;
  const el = t as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(type);
  }
  return el.isContentEditable === true;
}

/** Czy element sam obsługuje Enter/Spację (przycisk z fokusem) — wtedy nie wywołujemy akcji. */
export function isActivatableTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as { tagName?: unknown }).tagName !== 'string') return false;
  const el = t as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true;
  if (tag === 'INPUT') return true;
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  return role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab';
}
