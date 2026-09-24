/**
 * Walka kartami (GDD v0.3, sekcja 7): tura dziecka (2 energii, ręka 4 kart, działanie po zagraniu karty),
 * potem zapowiedziany ruch brainrota; tarcza pochłania obrażenia i znika po turze brainrota.
 * Funkcje MUTUJĄ przekazany stan, dopisują zdarzenia do `state.combat.log` i zwracają nowe zdarzenia.
 * Losowość wyłącznie przez `Rng` (tasowanie talii).
 */
import type {
  ActionKind,
  CardBattleState,
  CardDef,
  CardInstance,
  CardKind,
  CombatEvent,
  EnemyDef,
  HeroStats,
  OwnedCreature,
  QteResult,
} from '../types';
import type { Rng } from '../rng';
import { ATTACK_MULT } from '../combat/constants';
import {
  applyCzarDamage,
  enemyIntents,
  isCorrectResult,
  phaseDef,
  rescue,
  roundHalfUp,
  startCombat,
} from '../combat/combat';
import { BOOST_LEVEL, HAND_SIZE, LEVEL3_BOOST, MAX_ENERGY, MAX_WEAKEN } from './constants';
import { intentHitDamage, weakenedHit } from './intents';

/** Wznowienie przerwanej walki z zapisu (GDD 7.5: postęp nigdy się nie cofa). */
export interface CardBattleResume {
  czar?: number;
  phase?: number;
  /** Pozostałe pnącza bossa (przycinane do liczby pnączy bieżącej fazy). */
  vines?: number;
  /** HP bohatera przeniesione z poprzedniego pokoju; null/undefined/≤ 0 = pełne. */
  heroHp?: number | null;
}

export interface StartCardBattleArgs {
  enemy: EnemyDef;
  hero: HeroStats;
  /** Id kart talii (np. z buildDeck). Niepusta. */
  deck: readonly string[];
  rng: Rng;
  resume?: CardBattleResume;
  /** Gdy podane — nieznane id kart są pomijane (nie zapychają ręki). */
  cards?: Readonly<Record<string, CardDef>>;
}

export interface PlayCardArgs {
  state: CardBattleState;
  uid: string;
  result: QteResult;
  enemy: EnemyDef;
  hero: HeroStats;
  cards: Readonly<Record<string, CardDef>>;
  /** Wzmocnienie karty (1 lub 1,25 dla kart stworka na poz. 3 — levelBoostFor). Domyślnie 1. */
  boost?: number;
}

export interface EndPlayerTurnArgs {
  state: CardBattleState;
  enemy: EnemyDef;
  hero: HeroStats;
  rng: Rng;
}

export type PlayBlockReason = 'notInHand' | 'energy' | 'over';

export interface PlayCheck {
  ok: boolean;
  reason: PlayBlockReason | null;
}

/** Podgląd siły karty przy odpowiedzi „poprawnie” (100%) — do tekstu na karcie. */
export interface CardPreview {
  /** Czar zdejmowany jednym ciosem (0 dla kart bez ataku). */
  damage: number;
  /** Liczba ciosów (multiHit: power2; atak: 1; inne: 0). */
  hits: number;
  shield: number;
  heal: number;
  /** Osłabienie następnego ruchu brainrota (0..0,9). */
  weaken: number;
}

const ATTACK_KINDS: ReadonlySet<CardKind> = new Set<CardKind>(['attack', 'strongAttack', 'multiHit', 'combo']);

/** Karta zdejmująca Czar (atak, mocny atak, kilka ciosów, atak + tarcza) — blokowana przez pnącza. */
export function isAttackCard(kind: CardKind): boolean {
  return ATTACK_KINDS.has(kind);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Wzmocnienie jako dodatnia liczba skończona (inaczej 1). */
function safeBoost(boost: number | undefined): number {
  return boost !== undefined && Number.isFinite(boost) && boost > 0 ? boost : 1;
}

/** Rodzaj akcji do animacji ciosu: pula karty, gdy to pula ataku; inaczej wg rodzaju karty. */
function hitAction(def: CardDef): ActionKind {
  if (def.pool === 'attack' || def.pool === 'strongAttack') return def.pool;
  return def.kind === 'strongAttack' || def.kind === 'combo' ? 'strongAttack' : 'attack';
}

/** Dobiera karty do HAND_SIZE; pusty stos dobierania → przetasowane odrzucone; oba puste → koniec. */
function refillHand(state: CardBattleState, rng: Rng): void {
  while (state.hand.length < HAND_SIZE) {
    if (state.drawPile.length === 0) {
      if (state.discard.length === 0) return;
      state.drawPile = rng.shuffle(state.discard);
      state.discard = [];
    }
    const next = state.drawPile.shift();
    if (next === undefined) return;
    state.hand.push(next);
  }
}

/**
 * Nowa walka kartami. Walka = startCombat(enemy, hero, {czar, phase}), potem z `resume`:
 * pnącza (przycięte do 0..pnącza fazy) i HP bohatera (null/undefined/≤ 0 = pełne, inaczej 1..max).
 * Talia: kopie dostają uid 'c1', 'c2', … w kolejności `deck`, potem są tasowane do stosu dobierania
 * (wierzch = indeks 0); ręka = HAND_SIZE kart; energia = MAX_ENERGY; zapowiedź pierwszego ruchu wroga.
 * Rzuca RangeError przy pustej talii (walki nie dałoby się wygrać — błąd wołającego).
 */
export function startCardBattle(args: StartCardBattleArgs): CardBattleState {
  const { enemy, hero, rng, resume, cards } = args;
  const deck = args.deck.filter(
    (id) => typeof id === 'string' && (cards === undefined || (Object.hasOwn(cards, id) && cards[id] !== undefined)),
  );
  if (deck.length === 0) throw new RangeError('startCardBattle: pusta talia');
  const combatResume =
    resume !== undefined && (resume.czar !== undefined || resume.phase !== undefined)
      ? { czar: resume.czar, phase: resume.phase }
      : undefined;
  const combat = startCombat(enemy, hero, combatResume);
  if (resume?.vines !== undefined && Number.isFinite(resume.vines)) {
    const maxVines = phaseDef(enemy, combat.phase)?.vines ?? 0;
    combat.vines = clamp(Math.floor(resume.vines), 0, Math.max(0, maxVines));
  }
  const hp = resume?.heroHp;
  if (hp !== undefined && hp !== null && Number.isFinite(hp) && hp > 0) {
    combat.heroHp = clamp(Math.round(hp), 1, combat.heroMaxHp);
  }
  const instances: CardInstance[] = deck.map((cardId, i) => ({ uid: `c${i + 1}`, cardId }));
  const state: CardBattleState = {
    combat,
    drawPile: rng.shuffle(instances),
    hand: [],
    discard: [],
    energy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    shield: 0,
    weaken: 0,
    intents: enemyIntents(combat, enemy),
    turnNo: 1,
    uidCounter: instances.length,
  };
  refillHand(state, rng);
  return state;
}

/** Bohater leży (HP 0) — trzeba go uratować (rescueHero), zanim gra potoczy się dalej. */
export function isCardHeroDown(state: CardBattleState): boolean {
  return state.combat.heroHp <= 0;
}

/**
 * Czy kartę można zagrać: 'over' — po przemianie albo gdy bohater leży; 'notInHand' — brak takiej
 * karty na ręce (także nieznana definicja karty); 'energy' — za mało energii.
 */
export function canPlay(state: CardBattleState, uid: string, cards: Readonly<Record<string, CardDef>>): PlayCheck {
  if (state.combat.won || isCardHeroDown(state)) return { ok: false, reason: 'over' };
  const inst = state.hand.find((c) => c.uid === uid);
  const def = inst !== undefined && Object.hasOwn(cards, inst.cardId) ? cards[inst.cardId] : undefined;
  if (def === undefined) return { ok: false, reason: 'notInHand' };
  if (state.energy < def.cost) return { ok: false, reason: 'energy' };
  return { ok: true, reason: null };
}

/** Uid kart z ręki, które można teraz zagrać (pusta lista → podświetl „Koniec tury”). */
export function playableUids(state: CardBattleState, cards: Readonly<Record<string, CardDef>>): string[] {
  return state.hand.filter((c) => canPlay(state, c.uid, cards).ok).map((c) => c.uid);
}

/**
 * Siła karty przy danym mnożniku (wynik × wzmocnienie). Atak/mocny atak/combo: + premia broni raz na kartę;
 * multiHit: premia broni nie jest dodawana do ciosów. Min. 1 Czaru na cios.
 */
function cardEffect(def: CardDef, hero: HeroStats, mult: number, boost: number): CardPreview {
  const scale = mult * boost;
  const out: CardPreview = { damage: 0, hits: 0, shield: 0, heal: 0, weaken: 0 };
  switch (def.kind) {
    case 'attack':
    case 'strongAttack':
    case 'combo':
      out.damage = Math.max(1, roundHalfUp((def.power + hero.attackBonus) * scale));
      out.hits = 1;
      if (def.kind === 'combo') out.shield = Math.max(0, roundHalfUp(def.power2 * scale));
      break;
    case 'multiHit':
      out.damage = Math.max(1, roundHalfUp(def.power * scale));
      out.hits = Math.max(1, Math.floor(def.power2));
      break;
    case 'shield':
    case 'bigShield':
      out.shield = Math.max(0, roundHalfUp(def.power * scale));
      break;
    case 'heal':
      out.heal = Math.max(0, roundHalfUp(def.power * scale));
      break;
    case 'weaken':
      // Osłabienie bez wzmocnienia poziomu (karty brainglamów i tak go nie mają).
      out.weaken = clamp(Math.round((def.power / 100) * mult * 100) / 100, 0, MAX_WEAKEN);
      break;
  }
  return out;
}

/** Podgląd karty przy odpowiedzi „poprawnie” (100%), z premią broni i wzmocnieniem poziomu. */
export function previewCard(def: CardDef, hero: HeroStats, boost = 1): CardPreview {
  return cardEffect(def, hero, ATTACK_MULT.correct, safeBoost(boost));
}

/**
 * Krótki tekst siły na karcie (CardFace.powerText): "8", "3×4", "+15", "−50%", "14+10".
 * Znak mnożenia U+00D7, minus U+2212.
 */
export function cardPowerText(def: CardDef, hero: HeroStats, boost = 1): string {
  const p = previewCard(def, hero, boost);
  switch (def.kind) {
    case 'attack':
    case 'strongAttack':
      return String(p.damage);
    case 'multiHit':
      return `${p.hits}×${p.damage}`;
    case 'combo':
      return `${p.damage}+${p.shield}`;
    case 'shield':
    case 'bigShield':
      return String(p.shield);
    case 'heal':
      return `+${p.heal}`;
    case 'weaken':
      return `−${Math.round(p.weaken * 100)}%`;
  }
}

/**
 * Zagranie karty z ręki po rozwiązaniu działania (GDD 7.1 pkt 3–4, tabela 7.3).
 * Mnożnik = ATTACK_MULT[wynik] × boost. Efekty:
 * - atak / mocny atak: max(1, round((siła + premia broni) × mnożnik)) Czaru;
 * - kilka ciosów: power2 ciosów po max(1, round(siła × mnożnik)) (bez premii broni);
 * - atak + tarcza: jak atak, a do tego tarcza round(power2 × mnożnik);
 * - tarcza / wielka tarcza: tarcza += round(siła × mnożnik); leczenie: HP += round(siła × mnożnik), maks. HP max;
 * - osłabienie: weaken = min(0,9, max(weaken, siła/100 × mnożnik wyniku)).
 * Pnącza bossa: karta ataku z poprawną odpowiedzią usuwa JEDNO pnącze zamiast obrażeń; błędna — nic.
 * Tarcza z „atak + tarcza” działa zawsze. Pnącza, które pojawią się w trakcie serii ciosów, zatrzymują serię.
 * Karta idzie na stos odrzuconych, energia −= koszt; po przemianie zapowiedź znika (`intents` = []).
 * Rzuca Error, gdy !canPlay (np. po przemianie).
 */
export function playCard(args: PlayCardArgs): CombatEvent[] {
  const { state, uid, result, enemy, hero, cards } = args;
  const check = canPlay(state, uid, cards);
  if (!check.ok) throw new Error(`playCard: nie można zagrać karty ${uid} (${check.reason ?? '?'})`);
  const idx = state.hand.findIndex((c) => c.uid === uid);
  const inst = state.hand[idx] as CardInstance;
  const def = cards[inst.cardId] as CardDef;
  const combat = state.combat;
  const mult = ATTACK_MULT[result];
  const eff = cardEffect(def, hero, mult, safeBoost(args.boost));
  const crit = result === 'fast';
  const action = hitAction(def);
  const events: CombatEvent[] = [];

  if (isAttackCard(def.kind)) {
    if (combat.vines > 0) {
      const vineRemoved = isCorrectResult(result);
      if (vineRemoved) combat.vines -= 1;
      events.push({ t: 'playerHit', action, result, damage: 0, crit, vineRemoved });
    } else {
      for (let i = 0; i < eff.hits; i++) {
        if (combat.won || combat.vines > 0) break;
        events.push({ t: 'playerHit', action, result, damage: eff.damage, crit, vineRemoved: false });
        events.push(...applyCzarDamage(combat, enemy, eff.damage));
      }
    }
  }
  if (def.kind === 'shield' || def.kind === 'bigShield' || def.kind === 'combo') {
    state.shield += eff.shield;
    events.push({ t: 'shieldGain', amount: eff.shield, result });
  }
  if (def.kind === 'heal') {
    const before = combat.heroHp;
    combat.heroHp = Math.min(combat.heroMaxHp, combat.heroHp + eff.heal);
    events.push({ t: 'heal', amount: combat.heroHp - before, result });
  }
  if (def.kind === 'weaken') {
    state.weaken = Math.min(MAX_WEAKEN, Math.max(state.weaken, eff.weaken));
    // pct = osłabienie, które zadziała w turze brainrota (0..1).
    events.push({ t: 'weaken', pct: state.weaken, result });
  }

  state.hand.splice(idx, 1);
  state.discard.push(inst);
  state.energy = Math.max(0, state.energy - def.cost);
  // Po przemianie brainglam już nie atakuje — brak zapowiedzi.
  if (combat.won) state.intents = [];
  combat.log.push(...events);
  return events;
}

/**
 * „Koniec tury”: brainrot wykonuje zapowiedziany ruch (`state.intents`, po kolei):
 * cios = round(surowy × (1 − weaken)); tarcza pochłania ile może ('shieldAbsorb'), reszta zdejmuje HP
 * ('enemyHit'). HP 0 → 'heroDown' i koniec ciosów (HP zostaje 0 do rescueHero).
 * Potem: tarcza i osłabienie znikają, następna tura wroga i gracza, pełna energia, ręka do HAND_SIZE
 * (przetasowanie odrzuconych, gdy stos dobierania pusty), nowa zapowiedź.
 * Po przemianie albo gdy bohater już leży — nic (zwraca []).
 */
export function endPlayerTurn(args: EndPlayerTurnArgs): CombatEvent[] {
  const { state, enemy, rng } = args;
  const combat = state.combat;
  if (combat.won || isCardHeroDown(state)) return [];
  const events: CombatEvent[] = [];
  combat.turn = 'enemy';
  for (const intent of state.intents) {
    const raw = intentHitDamage(intent, enemy);
    const hit = weakenedHit(raw, state.weaken);
    const absorbed = Math.min(Math.max(0, state.shield), hit);
    if (absorbed > 0) {
      state.shield -= absorbed;
      events.push({ t: 'shieldAbsorb', absorbed });
    }
    const taken = hit - absorbed;
    combat.heroHp = Math.max(0, combat.heroHp - taken);
    events.push({
      t: 'enemyHit',
      intent: intent.kind,
      result: 'correct',
      raw,
      taken,
      blockedPct: hit > 0 ? absorbed / hit : 0,
      counter: 0,
      shieldUsed: false,
    });
    if (combat.heroHp === 0) {
      events.push({ t: 'heroDown' });
      break;
    }
  }
  state.shield = 0;
  state.weaken = 0;
  combat.enemyTurn += 1;
  combat.turn = 'player';
  state.turnNo += 1;
  state.energy = state.maxEnergy;
  refillHand(state, rng);
  state.intents = enemyIntents(combat, enemy);
  combat.log.push(...events);
  return events;
}

/**
 * „Stworki cię ratują” (GDD 7.5): pełne HP; Czar, faza, pnącza, karty i tura bez zmian.
 */
export function rescueHero(state: CardBattleState): CombatEvent[] {
  rescue(state.combat);
  return [{ t: 'rescued' }];
}

/**
 * Wzmocnienie karty stworka (GDD 8, 13.5): ×1,25, gdy stworek-źródło karty ma poziom ≥ 3.
 * Dotyczy kart z `sourceId` stworka (source 'creature' albo startowa karta stworka, np. Cios Plusika);
 * karty brainglamów i karty bez źródła — ×1.
 */
export function levelBoostFor(card: CardDef, creatures: readonly OwnedCreature[]): number {
  if (card.source === 'glam' || card.sourceId === null) return 1;
  const owner = creatures.find((c) => c.id === card.sourceId);
  return owner !== undefined && owner.level >= BOOST_LEVEL ? LEVEL3_BOOST : 1;
}
