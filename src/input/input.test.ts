import { describe, expect, it } from 'vitest';
import { clampBase, followBase, stickVector } from './joystick';
import { isActivatableTarget, isEditableTarget, keyboardVector, mapKey } from './keyboard';

const R = 70;

describe('stickVector', () => {
  it('zero at the center', () => {
    const v = stickVector(0, 0, R);
    expect(v).toEqual({ x: 0, y: 0, magnitude: 0, knobX: 0, knobY: 0 });
  });

  it('deadzone 0.15 swallows small movements but the knob still follows the finger', () => {
    const v = stickVector(0.14 * R, 0, R);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.magnitude).toBe(0);
    expect(v.knobX).toBeCloseTo(0.14 * R);
  });

  it('just past the deadzone gives a small but non-zero vector', () => {
    const v = stickVector(0.2 * R, 0, R);
    expect(v.magnitude).toBeGreaterThan(0);
    expect(v.magnitude).toBeLessThan(0.1);
    expect(v.x).toBeGreaterThan(0);
  });

  it('screen down (dy > 0) means y < 0 (y is UP)', () => {
    const v = stickVector(0, R, R);
    expect(v.y).toBeCloseTo(-1);
    expect(v.x).toBeCloseTo(0);
    const up = stickVector(0, -R, R);
    expect(up.y).toBeCloseTo(1);
  });

  it('full length at the outer zone and beyond, knob clamped to radius', () => {
    const v = stickVector(3 * R, 4 * R, R);
    expect(v.magnitude).toBe(1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(-0.8);
    expect(Math.hypot(v.knobX, v.knobY)).toBeCloseTo(R);
    const edge = stickVector(0.93 * R, 0, R);
    expect(edge.magnitude).toBe(1);
  });

  it('magnitude is monotonic and never exceeds 1', () => {
    let prev = 0;
    for (let d = 0; d <= 2 * R; d += 1) {
      const v = stickVector(d * 0.6, -d * 0.8, R);
      expect(v.magnitude).toBeGreaterThanOrEqual(prev);
      expect(v.magnitude).toBeLessThanOrEqual(1);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(v.magnitude);
      prev = v.magnitude;
    }
  });

  it('custom deadzone and garbage input', () => {
    expect(stickVector(0.3 * R, 0, R, { deadzone: 0.4 }).magnitude).toBe(0);
    const bad = stickVector(Number.NaN, Number.POSITIVE_INFINITY, R);
    expect(bad.magnitude).toBe(0);
    expect(stickVector(10, 0, 0).magnitude).toBe(1);
  });
});

describe('followBase', () => {
  it('stays put while the finger is inside the radius', () => {
    expect(followBase({ x: 100, y: 100 }, { x: 150, y: 100 }, R)).toEqual({ x: 100, y: 100 });
  });
  it('drags the base so the finger sits on the rim', () => {
    const b = followBase({ x: 100, y: 100 }, { x: 300, y: 100 }, R);
    expect(b.x).toBeCloseTo(230);
    expect(b.y).toBeCloseTo(100);
    const b2 = followBase({ x: 0, y: 0 }, { x: 300, y: 400 }, R);
    expect(Math.hypot(300 - b2.x, 400 - b2.y)).toBeCloseTo(R);
  });
});

describe('clampBase', () => {
  const rect = { left: 0, top: 0, right: 600, bottom: 900 };
  it('keeps the whole ring on screen', () => {
    expect(clampBase({ x: 5, y: 895 }, R, rect, 10)).toEqual({ x: 80, y: 820 });
    expect(clampBase({ x: 300, y: 400 }, R, rect, 10)).toEqual({ x: 300, y: 400 });
  });
  it('centers when the rect is too small', () => {
    expect(clampBase({ x: 0, y: 0 }, R, { left: 0, top: 0, right: 100, bottom: 100 })).toEqual({ x: 50, y: 50 });
  });
});

describe('mapKey', () => {
  it('WASD and arrows move', () => {
    expect(mapKey('KeyW', 'w')).toEqual({ kind: 'move', dir: 'up' });
    expect(mapKey('KeyA', 'q')).toEqual({ kind: 'move', dir: 'left' }); // AZERTY: fizyczny klawisz A
    expect(mapKey('ArrowDown', 'ArrowDown')).toEqual({ kind: 'move', dir: 'down' });
    expect(mapKey('KeyD', 'D')).toEqual({ kind: 'move', dir: 'right' });
  });
  it('action, pause, answers', () => {
    expect(mapKey('Space', ' ')).toEqual({ kind: 'action' });
    expect(mapKey('Enter', 'Enter')).toEqual({ kind: 'action' });
    expect(mapKey('Escape', 'Escape')).toEqual({ kind: 'pause' });
    expect(mapKey('KeyP', 'p')).toEqual({ kind: 'pause' });
    expect(mapKey('Digit1', '1')).toEqual({ kind: 'answer', index: 0 });
    expect(mapKey('Numpad4', '4')).toEqual({ kind: 'answer', index: 3 });
    expect(mapKey('Digit5', '5')).toBeNull();
    expect(mapKey('KeyQ', 'q')).toBeNull();
  });
  it('falls back to key when code is missing', () => {
    expect(mapKey('', 'w')).toEqual({ kind: 'move', dir: 'up' });
    expect(mapKey('Unidentified', '3')).toEqual({ kind: 'answer', index: 2 });
    expect(mapKey('', 'Escape')).toEqual({ kind: 'pause' });
    expect(mapKey('', 'x')).toBeNull();
  });
});

describe('keyboardVector', () => {
  it('single directions', () => {
    expect(keyboardVector(['up'])).toEqual({ x: 0, y: 1 });
    expect(keyboardVector(['down'])).toEqual({ x: 0, y: -1 });
    expect(keyboardVector(['left'])).toEqual({ x: -1, y: 0 });
    expect(keyboardVector(['right'])).toEqual({ x: 1, y: 0 });
  });
  it('diagonals are normalized', () => {
    const v = keyboardVector(['up', 'right']);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(v.y).toBeCloseTo(Math.SQRT1_2);
  });
  it('opposites cancel', () => {
    expect(keyboardVector(['up', 'down'])).toEqual({ x: 0, y: 0 });
    expect(keyboardVector(['left', 'right', 'up'])).toEqual({ x: 0, y: 1 });
    expect(keyboardVector([])).toEqual({ x: 0, y: 0 });
  });
});

describe('target filters', () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}): EventTarget =>
    ({ tagName, getAttribute: (n: string) => (extra[`attr:${n}`] as string | undefined) ?? null, ...extra }) as unknown as EventTarget;
  it('editable', () => {
    expect(isEditableTarget(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isEditableTarget(el('INPUT', { type: 'number' }))).toBe(true);
    expect(isEditableTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isEditableTarget(el('TEXTAREA'))).toBe(true);
    expect(isEditableTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isEditableTarget(el('DIV'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
  it('activatable', () => {
    expect(isActivatableTarget(el('BUTTON'))).toBe(true);
    expect(isActivatableTarget(el('DIV', { 'attr:role': 'button' }))).toBe(true);
    expect(isActivatableTarget(el('DIV'))).toBe(false);
  });
});
