/**
 * Krainy (GDD 4). W MVP tylko Łąka.
 */
import type { LandId, Op } from '../core/types';

export interface LandDef {
  id: LandId;
  name: string;
  /** Główne działanie krainy (Wulkan łączy + i −, tu: +). */
  op: Op;
  inMvp: boolean;
}

export const LANDS: Record<LandId, LandDef> = {
  meadow: { id: 'meadow', name: 'Łąka', op: 'add', inMvp: true },
  cave: { id: 'cave', name: 'Jaskinia', op: 'sub', inMvp: false },
  volcano: { id: 'volcano', name: 'Wulkan', op: 'add', inMvp: false },
  castle: { id: 'castle', name: 'Zamek', op: 'mul', inMvp: false },
  ice: { id: 'ice', name: 'Lodowa Kraina', op: 'div', inMvp: false },
};

/** Kolejność krain na Tablicy Wypraw. */
export const LAND_ORDER: LandId[] = ['meadow', 'cave', 'volcano', 'castle', 'ice'];
