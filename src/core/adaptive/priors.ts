/**
 * Wartości domyślne opanowania kategorii przed kalibracją (GDD 6.6).
 */
import type { CategoryId } from '../types';

/** Startowe `m` kategorii (priorytet) — [ZAŁOŻENIE] z GDD 6.6, rozszerzone na wszystkie kategorie. */
export const DEFAULT_PRIORS: Readonly<Record<CategoryId, number>> = {
  'add.within10': 0.6,
  'add.complement10': 0.6,
  'add.doubles': 0.6,
  'add.within20': 0.55,
  'add.cross10': 0.4,
  'add.three': 0.45,
  'add.2d': 0.45,
  'add.2d.carry': 0.35,
  'sub.within10': 0.55,
  'sub.within20': 0.5,
  'sub.cross10': 0.35,
  'sub.missing': 0.4,
  'sub.2d': 0.4,
  'sub.2d.borrow': 0.3,
  'mul.t2': 0.6,
  'mul.t3': 0.45,
  'mul.t4': 0.45,
  'mul.t5': 0.6,
  'mul.t6': 0.35,
  'mul.t7': 0.35,
  'mul.t8': 0.35,
  'mul.t9': 0.35,
  'mul.t10': 0.6,
  'div.by2': 0.55,
  'div.by3': 0.4,
  'div.by4': 0.4,
  'div.by5': 0.55,
  'div.by6': 0.3,
  'div.by7': 0.3,
  'div.by8': 0.3,
  'div.by9': 0.3,
  'div.by10': 0.55,
};

/** Priorytet dla faktu spoza wszystkich kategorii (np. mul:1x1). */
export const FALLBACK_PRIOR = 0.5;

/** Czy wartość jest znaną kategorią (odporność na uszkodzone dane). */
export function isKnownCategory(c: unknown): c is CategoryId {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_PRIORS, c);
}
