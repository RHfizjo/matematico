/**
 * Dungeon Łąki „Nora pod Starym Dębem” (GDD 11): pokoje, kolejność, skalowanie brainrotów.
 */
import type { EnemyDef } from '../types';
import type { Rng } from '../rng';
import { MAX_STAGE, clampStage } from './progression';

export interface RoomDef {
  id: string;
  kind: 'fight' | 'chest' | 'rest' | 'boss';
  /** Id wrogów z content/enemies (walka po kolei). */
  enemies: string[];
}

export const MEADOW_ROOMS: RoomDef[] = [
  { id: 'entry', kind: 'fight', enemies: ['slimakorro'] },
  { id: 'vault', kind: 'chest', enemies: [] },
  { id: 'nest', kind: 'fight', enemies: ['trzmielini', 'grzybello'] },
  { id: 'campfire', kind: 'rest', enemies: [] },
  { id: 'boss', kind: 'boss', enemies: ['kosiarrini'] },
];

/** Kolejność kanoniczna (pierwsza wizyta, GDD 11). */
export const MEADOW_ROOM_ORDER: string[] = MEADOW_ROOMS.map((r) => r.id);

/** Maksymalny mnożnik Czaru bossa. */
export const BOSS_MAX_SCALE = 1.2;
/** Przyrost Czaru na etap (+10%). */
export const CZAR_SCALE_PER_STAGE = 0.1;

export function findRoom(id: string): RoomDef | undefined {
  return MEADOW_ROOMS.find((r) => r.id === id);
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Kolejność pokoi na powtórną wizytę: pokoje 1–3 (wejście, skarbiec, gniazdo) potasowane,
 * potem ognisko i boss. Z `previous` — kolejność pokoi 1–3 różna od poprzedniej („inna kolejność”).
 */
export function makeRoomOrder(rng: Rng, previous?: readonly string[]): string[] {
  const head = MEADOW_ROOMS.filter((r) => r.kind === 'fight' || r.kind === 'chest').map((r) => r.id);
  const tail = [
    ...MEADOW_ROOMS.filter((r) => r.kind === 'rest').map((r) => r.id),
    ...MEADOW_ROOMS.filter((r) => r.kind === 'boss').map((r) => r.id),
  ];
  let order = rng.shuffle(head);
  if (previous !== undefined && head.length > 1) {
    const prevHead = previous.slice(0, head.length);
    for (let tries = 0; tries < 20 && sameOrder(order, prevHead); tries++) order = rng.shuffle(head);
    // Zabezpieczenie: przesunięcie cykliczne zawsze daje inną kolejność.
    if (sameOrder(order, prevHead)) order = [...order.slice(1), ...order.slice(0, 1)];
  }
  return [...order, ...tail];
}

/** Mnożnik Czaru dla etapu: 1 + 0,1·(etap − 1); boss maks. 1,2. */
export function czarScale(enemy: EnemyDef, stage: number): number {
  const s = Math.min(MAX_STAGE, clampStage(stage));
  const factor = 1 + CZAR_SCALE_PER_STAGE * (s - 1);
  return enemy.isBoss ? Math.min(BOSS_MAX_SCALE, factor) : factor;
}

/** Czar brainrota przeskalowany do etapu (GDD 11: „brainroty skalowane do etapu”). */
export function scaledCzar(enemy: EnemyDef, stage: number): number {
  return Math.max(1, Math.round(enemy.czar * czarScale(enemy, stage) + 1e-9));
}

/** Kopia definicji wroga z przeskalowanym Czarem i progami faz (do startCombat). */
export function scaledEnemy(enemy: EnemyDef, stage: number): EnemyDef {
  const czar = scaledCzar(enemy, stage);
  const out: EnemyDef = { ...enemy, czar };
  if (enemy.phases !== undefined) {
    const first = enemy.phases[0]?.czarFrom ?? enemy.czar;
    const ratio = first > 0 ? czar / first : 1;
    out.phases = enemy.phases.map((p, i) => ({
      ...p,
      czarFrom: i === 0 ? czar : Math.round(p.czarFrom * ratio + 1e-9),
    }));
  }
  return out;
}
