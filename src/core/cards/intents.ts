/**
 * Zapowiedzi ruchu brainrota w walce kartami (GDD 7.1 pkt 2, 13.2, 13.3).
 * Kolejność ruchów bierzemy z combat.enemyIntents (numer tury wroga + faza), a siłę ciosów liczymy
 * wg GDD v0.3: zwykły = `attack`, mocny = `strongAttack`, podwójny (szybki wróg) = 2 × round(attack · 0,75).
 */
import type { CardBattleState, CombatState, EnemyDef, EnemyIntent } from '../types';
import { enemyIntents, roundHalfUp } from '../combat/combat';
import { MAX_WEAKEN, MULTI_HIT_FACTOR } from './constants';

export type IntentKind = 'normal' | 'strong' | 'multi';

/** Plan ruchu: siła każdego ciosu (przed osłabieniem) i rodzaj zapowiedzi. */
export interface IntentPlan {
  hits: number[];
  kind: IntentKind;
}

/** Zapowiedź do HUD: tekst („Cios 10”, „Mocny cios 22”, „2 × cios 6”) i suma obrażeń po osłabieniu. */
export interface IntentView {
  text: string;
  kind: IntentKind;
  total: number;
}

/** Surowa siła jednego ciosu z zapowiedzi (przed osłabieniem i tarczą). */
export function intentHitDamage(intent: EnemyIntent, enemy: EnemyDef): number {
  const raw =
    intent.kind === 'strong'
      ? enemy.strongAttack
      : intent.hits > 1
        ? roundHalfUp(enemy.attack * MULTI_HIT_FACTOR)
        : enemy.attack;
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
}

/** Cios po osłabieniu (weaken 0..0,9): round(surowy × (1 − weaken)). */
export function weakenedHit(raw: number, weaken: number): number {
  const w = Number.isFinite(weaken) ? Math.min(MAX_WEAKEN, Math.max(0, weaken)) : 0;
  return Math.max(0, roundHalfUp(raw * (1 - w)));
}

/** Rodzaj zapowiedzi z listy ciosów (pusta lista = brak ruchu, np. po przemianie). */
export function intentKindOf(intents: readonly EnemyIntent[]): IntentKind {
  if (intents.some((i) => i.kind === 'strong')) return 'strong';
  return intents.length > 1 ? 'multi' : 'normal';
}

/** Plan najbliższego ruchu wroga dla stanu walki (surowe siły ciosów). */
export function intentsFor(state: CombatState, enemy: EnemyDef): IntentPlan {
  const intents = enemyIntents(state, enemy);
  return { hits: intents.map((i) => intentHitDamage(i, enemy)), kind: intentKindOf(intents) };
}

/**
 * Zapowiedź zapisanego ruchu (`state.intents`) z uwzględnieniem osłabienia z tej tury.
 * Znak mnożenia „×” (U+00D7). Po przemianie (brak ruchu): tekst pusty, suma 0.
 */
export function intentView(state: CardBattleState, enemy: EnemyDef): IntentView {
  const intents = state.intents;
  const kind = intentKindOf(intents);
  const hits = intents.map((i) => weakenedHit(intentHitDamage(i, enemy), state.weaken));
  const total = hits.reduce((a, b) => a + b, 0);
  const first = hits[0];
  if (first === undefined) return { text: '', kind, total: 0 };
  const label = kind === 'strong' ? 'Mocny cios' : 'Cios';
  const text = hits.length > 1 ? `${hits.length} × ${label.toLowerCase()} ${first}` : `${label} ${first}`;
  return { text, kind, total };
}
