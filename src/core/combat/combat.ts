/**
 * Maszyna stanów walki (GDD 7): ataki, obrona, fazy bossa, pnącza, tarcza, ratunek.
 * Funkcje MUTUJĄ przekazany stan, dopisują zdarzenia do `state.log` i zwracają nowe zdarzenia.
 * Brak losowości: zamiary wroga wynikają wyłącznie z `state.enemyTurn` i fazy.
 */
import type {
  ActionKind,
  BossPhaseDef,
  CombatEvent,
  CombatState,
  EnemyDef,
  EnemyIntent,
  HeroStats,
  QteResult,
} from '../types';
import {
  ATTACK_MULT,
  BASE_ATTACK,
  BLOCK_PCT,
  COUNTER_DAMAGE,
  HEAVY_DEFAULT_EVERY,
  STRONG_ATTACK,
  STRONG_COOLDOWN,
} from './constants';

/** Zaokrąglenie połówek w górę, odporne na błędy zmiennoprzecinkowe (10,5 → 11). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Wynik liczony jako poprawna odpowiedź (także po limicie i po POPRAWCE). */
export function isCorrectResult(result: QteResult): boolean {
  return result === 'fast' || result === 'correct' || result === 'late' || result === 'retryCorrect';
}

/** Liczba faz wroga (1 dla zwykłych). */
export function phaseCount(enemy: EnemyDef): number {
  return Math.max(1, enemy.phases?.length ?? 0);
}

/** Definicja fazy (1..n) albo undefined dla zwykłych wrogów. */
export function phaseDef(enemy: EnemyDef, phase: number): BossPhaseDef | undefined {
  return enemy.phases?.[phase - 1];
}

/**
 * Progi Czaru rozpoczynające kolejne fazy, przeskalowane do `maxCzar`
 * (np. boss 120 → [120, 80, 40]; boss przeskalowany do 144 → [144, 96, 48]).
 */
export function phaseThresholds(enemy: EnemyDef, maxCzar: number = enemy.czar): number[] {
  const phases = enemy.phases ?? [];
  const first = phases[0]?.czarFrom ?? 0;
  const scale = first > 0 ? maxCzar / first : 1;
  return phases.map((p, i) => (i === 0 ? maxCzar : roundHalfUp(p.czarFrom * scale)));
}

/** Faza wynikająca z Czaru: najwyższa faza, której próg ≥ czar (Czar 80 → faza 2). */
export function phaseForCzar(enemy: EnemyDef, czar: number, maxCzar: number = enemy.czar): number {
  let phase = 1;
  phaseThresholds(enemy, maxCzar).forEach((t, i) => {
    if (czar <= t) phase = i + 1;
  });
  return phase;
}

/**
 * Nowa walka. `resume` odtwarza przerwaną walkę (Czar i faza z zapisu, GDD 7.5):
 * Czar przycinany do 1..max (i do progu zapisanej fazy — postęp się nie cofa),
 * faza = max(zapisana, wynikająca z Czaru). Pnącza nie są zapisywane: po wznowieniu 0.
 */
export function startCombat(
  enemy: EnemyDef,
  hero: HeroStats,
  resume?: { czar?: number; phase?: number },
): CombatState {
  const maxCzar = Math.max(1, Math.round(enemy.czar));
  const nPhases = enemy.phases?.length ?? 0;
  let czar = maxCzar;
  let phase = 1;
  const resumed = resume !== undefined && (resume.czar !== undefined || resume.phase !== undefined);
  if (resume?.czar !== undefined && Number.isFinite(resume.czar)) {
    czar = clamp(Math.round(resume.czar), 1, maxCzar);
  }
  if (nPhases > 0) {
    phase = phaseForCzar(enemy, czar, maxCzar);
    if (resume?.phase !== undefined && Number.isFinite(resume.phase)) {
      const saved = clamp(Math.floor(resume.phase), 1, nPhases);
      if (saved > phase) {
        phase = saved;
        const thr = phaseThresholds(enemy, maxCzar)[saved - 1] ?? czar;
        czar = clamp(Math.min(czar, thr), 1, maxCzar);
      }
    }
  }
  const heroMaxHp = Math.max(1, Math.round(hero.maxHp));
  return {
    enemyId: enemy.id,
    czar,
    maxCzar,
    phase,
    vines: resumed ? 0 : (phaseDef(enemy, phase)?.vines ?? 0),
    heroHp: heroMaxHp,
    heroMaxHp,
    shieldCharges: Math.max(0, Math.floor(hero.shieldCharges)),
    enemyTurn: 1,
    strongCooldown: 0,
    turn: 'player',
    won: false,
    log: [],
  };
}

/**
 * Ataki do wyboru w turze gracza: 'attack' zawsze (walka nigdy nie jest zablokowana),
 * 'strongAttack' gdy odblokowany przez stworka i bez odnowienia. Obrony nie są tu zwracane.
 */
export function availableActions(state: CombatState, unlocked: ActionKind[]): ActionKind[] {
  const out: ActionKind[] = ['attack'];
  if (unlocked.includes('strongAttack') && state.strongCooldown <= 0) out.push('strongAttack');
  return out;
}

/**
 * Ciosy wroga w bieżącej turze (jeden element = jeden cios = jedno QTE obrony).
 * `hits` w każdym elemencie = łączna liczba ciosów w tej turze (do zapowiedzi w HUD).
 * normal: 1 zwykły; fast: w parzystych turach 2 zwykłe; heavy: mocny co `strongEvery` (3) tur;
 * boss: mocny co `strongEvery` bieżącej fazy (pnącza nie wstrzymują ataków).
 */
export function enemyIntents(state: CombatState, enemy: EnemyDef): EnemyIntent[] {
  if (state.won) return [];
  const turn = Math.max(1, Math.floor(state.enemyTurn));
  let hits = 1;
  let every = 0;
  switch (enemy.behavior) {
    case 'normal':
      break;
    case 'fast':
      hits = turn % 2 === 0 ? 2 : 1;
      break;
    case 'heavy':
      every = enemy.strongEvery > 0 ? enemy.strongEvery : HEAVY_DEFAULT_EVERY;
      break;
    case 'boss':
      every = phaseDef(enemy, state.phase)?.strongEvery ?? enemy.strongEvery;
      break;
  }
  const kind: EnemyIntent['kind'] = every > 0 && turn % every === 0 ? 'strong' : 'normal';
  const out: EnemyIntent[] = [];
  for (let i = 0; i < hits; i++) out.push({ kind, hits });
  return out;
}

/** Zdejmuje Czar; obsługuje przejście faz bossa i przemianę (Czar 0). */
function dealDamage(state: CombatState, enemy: EnemyDef, amount: number, events: CombatEvent[]): void {
  if (amount <= 0 || state.won) return;
  state.czar = Math.max(0, state.czar - amount);
  if (state.czar === 0) {
    state.won = true;
    events.push({ t: 'transformed' });
    return;
  }
  if ((enemy.phases?.length ?? 0) === 0) return;
  const next = phaseForCzar(enemy, state.czar, state.maxCzar);
  if (next > state.phase) {
    // Przy przeskoku kilku faz naraz — jedno zdarzenie dla fazy docelowej.
    state.phase = next;
    state.vines = phaseDef(enemy, next)?.vines ?? 0;
    events.push({ t: 'phase', phase: next, vines: state.vines });
  }
}

/**
 * Atak gracza (GDD 7.3): obrażenia = round((10|18 + premia broni) × mnożnik wyniku), min. 1.
 * Gdy są pnącza: poprawna odpowiedź usuwa jedno pnącze (0 obrażeń), błędna — nic (pnącza osłaniają
 * bossa przed każdymi obrażeniami, także przed kontrą).
 * Po ataku mocnym odnowienie = 1, po zwykłym odnowienie maleje. Tura przechodzi na wroga.
 */
export function applyPlayerAttack(
  state: CombatState,
  enemy: EnemyDef,
  action: ActionKind,
  result: QteResult,
  hero: HeroStats,
): CombatEvent[] {
  if (action !== 'attack' && action !== 'strongAttack') {
    throw new RangeError(`applyPlayerAttack: akcja ${action} nie jest atakiem`);
  }
  if (state.won) return [];
  const events: CombatEvent[] = [];
  const base = action === 'strongAttack' ? STRONG_ATTACK : BASE_ATTACK;
  let damage = 0;
  let vineRemoved = false;
  if (state.vines > 0) {
    if (isCorrectResult(result)) {
      state.vines -= 1;
      vineRemoved = true;
    }
  } else {
    damage = Math.max(1, roundHalfUp((base + hero.attackBonus) * ATTACK_MULT[result]));
  }
  events.push({ t: 'playerHit', action, result, damage, crit: result === 'fast', vineRemoved });
  dealDamage(state, enemy, damage, events);
  state.strongCooldown = action === 'strongAttack' ? STRONG_COOLDOWN : Math.max(0, state.strongCooldown - 1);
  if (!state.won) state.turn = 'enemy';
  state.log.push(...events);
  return events;
}

/**
 * Jeden cios wroga i wynik QTE obrony (GDD 7.3, 13.1).
 * blok = min(1, BLOCK_PCT + premia stworka dla rodzaju obrony); przyjęte = round(surowe × (1 − blok)).
 * Tarcza Koniczynka pochłania mocny cios, który zadałby obrażenia (nie marnuje się przy pełnym bloku).
 * Szybka obrona = kontra 5 (może zakończyć walkę). Pnącza blokują obrażenia bossa (types.ts),
 * więc przy pnączach kontra = 0 — inaczej kontry przeskakiwały fazę i pnącza znikały bez usunięcia.
 */
export function applyEnemyHit(
  state: CombatState,
  enemy: EnemyDef,
  intent: EnemyIntent,
  result: QteResult,
  hero: HeroStats,
): CombatEvent[] {
  if (state.won) return [];
  const events: CombatEvent[] = [];
  const strong = intent.kind === 'strong';
  const raw = strong ? enemy.strongAttack : enemy.attack;
  const boost = strong ? hero.defenseBoost.strongDefend : hero.defenseBoost.defend;
  let blockedPct = Math.round(clamp(BLOCK_PCT[result] + (boost > 0 ? boost : 0), 0, 1) * 100) / 100;
  let taken = Math.max(0, roundHalfUp(raw * (1 - blockedPct)));
  let shieldUsed = false;
  if (strong && taken > 0 && state.shieldCharges > 0) {
    state.shieldCharges -= 1;
    shieldUsed = true;
    taken = 0;
    blockedPct = 1;
  }
  const counter = result === 'fast' && state.vines <= 0 ? COUNTER_DAMAGE : 0;
  const hpBefore = state.heroHp;
  state.heroHp = Math.max(0, state.heroHp - taken);
  events.push({ t: 'enemyHit', intent: intent.kind, result, raw, taken, blockedPct, counter, shieldUsed });
  if (counter > 0) dealDamage(state, enemy, counter, events);
  if (hpBefore > 0 && state.heroHp === 0) events.push({ t: 'heroDown' });
  state.log.push(...events);
  return events;
}

/** Koniec tury wroga: następny numer tury, ruch gracza. */
export function endEnemyTurn(state: CombatState): void {
  state.enemyTurn += 1;
  if (!state.won) state.turn = 'player';
}

export function isHeroDown(state: CombatState): boolean {
  return state.heroHp <= 0;
}

/**
 * „Stworki cię ratują” (GDD 7.5): pełne HP, Czar/faza/pnącza/tarcza bez zmian,
 * tura gracza, atak mocny od razu gotowy. Porażka nie istnieje.
 */
export function rescue(state: CombatState): void {
  state.heroHp = state.heroMaxHp;
  state.strongCooldown = 0;
  if (!state.won) state.turn = 'player';
  state.log.push({ t: 'rescued' });
}
