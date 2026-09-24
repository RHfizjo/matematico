/**
 * Statystyki bohatera ze sprzętu i stworków (GDD 7.2, 12, 13.1, 13.4).
 */
import type {
  ActionKind,
  CreatureDef,
  EquipSlot,
  GateOp,
  HeroStats,
  ItemDef,
  OwnedCreature,
  OwnedItem,
} from '../types';
import { DEFENSE_BOOST, HERO_BASE_HP } from './constants';

/** Maksymalny poziom przedmiotu (kuźnia, GDD 12.2). */
export const ITEM_MAX_LEVEL = 3;

const SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'net', 'amulet'];
const ACTION_ORDER: readonly ActionKind[] = ['attack', 'strongAttack', 'defend', 'strongDefend'];
const OP_ORDER: readonly GateOp[] = ['+', '−', '×', ':'];

export interface EquipmentArgs {
  equipped: Record<EquipSlot, string | null>;
  owned: OwnedItem[];
  items: Record<string, ItemDef>;
}

export interface HeroStatsArgs extends EquipmentArgs {
  creatures: OwnedCreature[];
  creatureDefs: Record<string, CreatureDef>;
}

export type HelpContext = 'attack' | 'defense' | 'catch';

/** Pomoce sprzętu na jedną walkę/łapanie (GDD 12.1). */
export interface HeroHelps {
  /** Dodatkowe sekundy limitu (przy limicie „Brak” — obniżenie progu „szybko”). */
  timeBonusSec: number;
  /** Użycia OŚ. */
  numberLineUses: number;
  /** Użycia POPRAWKI. */
  retryUses: number;
  /** Dodatkowe próby przy łapaniu. */
  extraCatchTries: number;
}

/** Poziom przedmiotu przycięty do 1..3. */
export function itemLevel(level: number | undefined): number {
  const l = Math.floor(level ?? 1);
  if (!(l >= 1)) return 1;
  return Math.min(ITEM_MAX_LEVEL, l);
}

/**
 * Założone przedmioty z poziomami. Pomija nieznane id i przedmioty w złym slocie;
 * przedmiot założony, a nieobecny w `owned`, liczy się jako poziom 1.
 */
export function equippedItems(args: EquipmentArgs): { def: ItemDef; level: number }[] {
  const out: { def: ItemDef; level: number }[] = [];
  for (const slot of SLOTS) {
    const id = args.equipped[slot];
    if (id === null || id === undefined) continue;
    const def = args.items[id];
    if (def === undefined || def.slot !== slot) continue;
    const own = args.owned.find((o) => o.id === id);
    out.push({ def, level: itemLevel(own?.level) });
  }
  return out;
}

/**
 * HP = 100 + premie HP założonego sprzętu, atak = suma premii ataku (w praktyce: broń).
 * Stworki: +20% bloku dla swojego rodzaju obrony (bez sumowania), Koniczynek → 1 ładunek tarczy.
 */
export function computeHeroStats(args: HeroStatsArgs): HeroStats {
  let hpBonus = 0;
  let attackBonus = 0;
  for (const { def } of equippedItems(args)) {
    hpBonus += def.hpBonus;
    attackBonus += def.attackBonus;
  }
  const defenseBoost = { defend: 0, strongDefend: 0 };
  let shieldCharges = 0;
  for (const c of args.creatures) {
    const def = args.creatureDefs[c.id];
    if (def === undefined) continue;
    if (def.boostsDefense !== undefined) defenseBoost[def.boostsDefense] = DEFENSE_BOOST;
    if (def.shield === true) shieldCharges = 1;
  }
  return {
    maxHp: Math.max(1, HERO_BASE_HP + hpBonus),
    attackBonus,
    defenseBoost,
    shieldCharges,
  };
}

/**
 * Pomoce założonego sprzętu w danym kontekście (appliesTo = kontekst lub 'all').
 * Wartość = amount z poziomu 1 + 1 za każdy kolejny poziom (sekunda lub użycie, GDD 12.2).
 */
export function helpsFor(args: EquipmentArgs, context: HelpContext): HeroHelps {
  const out: HeroHelps = { timeBonusSec: 0, numberLineUses: 0, retryUses: 0, extraCatchTries: 0 };
  for (const { def, level } of equippedItems(args)) {
    const help = def.help;
    if (help === undefined) continue;
    if (help.appliesTo !== context && help.appliesTo !== 'all') continue;
    const amount = Math.max(0, help.amount + (level - 1));
    switch (help.kind) {
      case 'time':
        out.timeBonusSec += amount;
        break;
      case 'numberLine':
        out.numberLineUses += amount;
        break;
      case 'retry':
        out.retryUses += amount;
        break;
      case 'extraCatchTry':
        out.extraCatchTries += amount;
        break;
    }
  }
  return out;
}

/**
 * Akcje odblokowane przez stworki (GDD 7.2). 'attack' zawsze — walka nigdy się nie blokuje,
 * nawet gdy (wbrew zapisowi) brak Plusika. Obron nie zwracamy: są dostępne zawsze.
 */
export function unlockedActions(creatures: OwnedCreature[], defs: Record<string, CreatureDef>): ActionKind[] {
  const set = new Set<ActionKind>(['attack']);
  for (const c of creatures) {
    const a = defs[c.id]?.unlocksAction;
    if (a !== undefined) set.add(a);
  }
  return ACTION_ORDER.filter((a) => set.has(a));
}

/** Działania bramy odblokowane przez stworki (GDD 9.2); '+' zawsze. */
export function unlockedOperators(creatures: OwnedCreature[], defs: Record<string, CreatureDef>): GateOp[] {
  const set = new Set<GateOp>(['+']);
  for (const c of creatures) {
    const op = defs[c.id]?.unlocksOperator;
    if (op !== undefined) set.add(op);
  }
  return OP_ORDER.filter((op) => set.has(op));
}
