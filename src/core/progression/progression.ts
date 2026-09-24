/**
 * Etapy trudności krain i pule kategorii dla akcji (GDD 6.5, 7.2, 8, 13.3).
 * Pule są filtrowane przez ustawienia rodzica (działania, zakres) i NIGDY nie są puste.
 */
import type { ActionKind, CategoryId, CreatureDef, LandId, ParentSettings, TaskFormat } from '../types';
import { isCategoryAvailable } from '../math/categories';

/** Liczba etapów krainy (Ł1–Ł4). */
export const MAX_STAGE = 4;
/** Próg średniego opanowania kategorii etapu do awansu (GDD 6.5). */
export const STAGE_UP_MASTERY = 0.7;
/** Najwyższy etap startowy po kalibracji — Ł4 trzeba wygrać grą (awans przez shouldStageUp). */
export const START_STAGE_MAX = 3;
/** Minimalna liczba prób kategorii (CategoryState.n), by uznać ją za rzeczywisty dowód przy starcie. */
export const START_EVIDENCE_MIN = 2;

/** Ostatnia deska ratunku, gdy nic nie jest dostępne (np. rodzic wyłączył wszystkie działania). */
export const FINAL_FALLBACK: CategoryId[] = ['add.within10'];

export type PoolAction = ActionKind | 'boss' | 'chest' | 'feed' | 'catch';

interface StageEntry {
  c: CategoryId;
  /** Dodatkowy warunek z ustawień (poza dostępnością działania i zakresu). */
  when?: (s: ParentSettings) => boolean;
}

const e = (c: CategoryId, when?: (s: ParentSettings) => boolean): StageEntry => (when ? { c, when } : { c });

/** Nowe kategorie na każdym etapie (indeks 0 = etap 1). Pula etapu = suma etapów 1..n. */
const LAND_STAGES: Record<LandId, readonly (readonly StageEntry[])[]> = {
  // GDD 6.5; add.2d wymaga zakresu 100 (minRange), przekraczanie 10 — przełącznik rodzica.
  // ZNANE OGRANICZENIE: GDD 6.5 — Ł2 „podwajanie do 5+5”, Ł3 „do 10+10”. Przy zakresie ≥ 20 pula
  // add.doubles obejmuje od Ł2 wszystkie a + a ≤ 20 (factsOf filtruje tylko zakresem). Kategorie nie
  // wyrażą limitu etapu, a TaskRequest (types.ts) nie ma filtra faktów — potrzebna zmiana kontraktu
  // (np. TaskRequest.maxResult albo osobna kategoria podwajania do 10).
  meadow: [
    [e('add.within10')],
    [e('add.complement10'), e('add.doubles')],
    [e('add.within20')],
    [e('add.three'), e('add.cross10', (s) => s.crossTenOnMeadow), e('add.2d')],
  ],
  // Poniżej: zaślepki dla krain po MVP (GDD 4).
  cave: [[e('sub.within10')], [e('sub.missing')], [e('sub.within20')], [e('sub.cross10'), e('sub.2d')]],
  volcano: [[e('add.cross10')], [e('sub.cross10')], [e('add.2d'), e('sub.2d')], [e('add.2d.carry'), e('sub.2d.borrow')]],
  castle: [
    [e('mul.t2'), e('mul.t5'), e('mul.t10')],
    [e('mul.t3'), e('mul.t4')],
    [e('mul.t6'), e('mul.t7')],
    [e('mul.t8'), e('mul.t9')],
  ],
  ice: [
    [e('div.by2'), e('div.by5'), e('div.by10')],
    [e('div.by3'), e('div.by4')],
    [e('div.by6'), e('div.by7')],
    [e('div.by8'), e('div.by9')],
  ],
};

/** Kategorie, które naturalnie mają format „brakująca liczba”. */
const MISSING_FORMAT: ReadonlySet<CategoryId> = new Set<CategoryId>(['add.complement10', 'sub.missing']);

/** Pule trybu „wszystkie działania w walce” (GDD 7.2, kolumna „Docelowo”); tylko format 'choice'. */
const ALL_OPS_POOLS: Record<ActionKind, readonly CategoryId[]> = {
  attack: [
    'add.within10',
    'add.doubles',
    'add.within20',
    'add.cross10',
    'add.three',
    'add.2d',
    'add.2d.carry',
    'sub.within10',
    'sub.within20',
    'sub.cross10',
    'sub.2d',
    'sub.2d.borrow',
  ],
  strongAttack: ['mul.t2', 'mul.t3', 'mul.t4', 'mul.t5', 'mul.t6', 'mul.t7', 'mul.t8', 'mul.t9', 'mul.t10'],
  defend: ['sub.within10', 'sub.within20', 'sub.cross10', 'sub.2d', 'sub.2d.borrow'],
  strongDefend: ['div.by2', 'div.by3', 'div.by4', 'div.by5', 'div.by6', 'div.by7', 'div.by8', 'div.by9', 'div.by10'],
};

/** Najprostsze kategorie każdego działania — zapas, gdy pula krainy jest pusta. */
const BASIC_CATEGORIES: readonly CategoryId[] = [
  'add.within10',
  'sub.within10',
  'mul.t2',
  'mul.t5',
  'mul.t10',
  'div.by2',
  'div.by5',
  'div.by10',
];

/** Kategorie ataku na Łące nie obejmują „specjalności” innych akcji. */
const MEADOW_NON_ATTACK: ReadonlySet<CategoryId> = new Set<CategoryId>([
  'add.complement10',
  'add.doubles',
  'add.three',
]);

/** Etap przycięty do 1..MAX_STAGE (NaN → 1). */
export function clampStage(stage: number): number {
  const s = Math.floor(stage);
  if (!(s >= 1)) return 1;
  return Math.min(MAX_STAGE, s);
}

function available(cats: readonly CategoryId[], settings: ParentSettings): CategoryId[] {
  const out: CategoryId[] = [];
  for (const c of cats) if (!out.includes(c) && isCategoryAvailable(c, settings)) out.push(c);
  return out;
}

/**
 * Pula kategorii etapu krainy (łącznie z wcześniejszymi etapami), przefiltrowana przez ustawienia.
 * Może być pusta (np. wyłączone dodawanie na Łące) — `actionCategories` ma zapasy.
 */
export function stageCategories(land: LandId, stage: number, settings: ParentSettings): CategoryId[] {
  const s = clampStage(stage);
  const stages = LAND_STAGES[land];
  const out: CategoryId[] = [];
  for (let i = 0; i < s; i++) {
    for (const entry of stages[i] ?? []) {
      if (entry.when !== undefined && !entry.when(settings)) continue;
      if (!out.includes(entry.c) && isCategoryAvailable(entry.c, settings)) out.push(entry.c);
    }
  }
  return out;
}

/** Pierwszy etap krainy, na którym pojawia się kategoria (bez warunków ustawień); null gdy nie należy. */
export function firstStageOf(land: LandId, categoryId: CategoryId): number | null {
  const stages = LAND_STAGES[land];
  for (let i = 0; i < stages.length; i++) {
    if ((stages[i] ?? []).some((entry) => entry.c === categoryId)) return i + 1;
  }
  return null;
}

/** Pula tematyczna walki (GDD 7.2, kolumna „W MVP”). */
function themedCombatPool(land: LandId, stage: number, action: ActionKind, settings: ParentSettings): CategoryId[] {
  const stagePool = stageCategories(land, stage, settings);
  if (land !== 'meadow') {
    // Zaślepka: wszystkie akcje z puli etapu (bez kategorii „brakująca liczba”, jeśli się da).
    const choice = stagePool.filter((c) => !MISSING_FORMAT.has(c));
    return choice.length > 0 ? choice : stagePool;
  }
  switch (action) {
    case 'attack':
      return stagePool.filter((c) => !MEADOW_NON_ATTACK.has(c));
    case 'strongAttack':
      return available(['add.doubles'], settings);
    case 'defend':
      return available(['add.complement10'], settings);
    case 'strongDefend': {
      // Ł4: trzy składniki; Ł3: do 20; wcześniej (lub zakres 10): do 10.
      const candidates: CategoryId[] = [];
      if (stage >= 4) candidates.push('add.three');
      if (stage >= 3) candidates.push('add.within20');
      candidates.push('add.within10');
      return available(candidates, settings).slice(0, 1);
    }
  }
}

function combatPool(land: LandId, stage: number, action: ActionKind, settings: ParentSettings): CategoryId[] {
  if (settings.combatOps === 'all') {
    const pool = available(ALL_OPS_POOLS[action], settings);
    if (pool.length > 0) return pool;
  }
  return themedCombatPool(land, stage, action, settings);
}

/** Boss (GDD 13.3): faza 1 — pula ataku; faza 2 — podwajanie + dopełnianie; faza 3 — cała kraina. */
function bossPool(land: LandId, stage: number, phase: number, settings: ParentSettings): CategoryId[] {
  if (land !== 'meadow') return stageCategories(land, stage, settings);
  if (phase <= 1) return combatPool(land, stage, 'attack', settings);
  if (phase === 2) return available(['add.doubles', 'add.complement10'], settings);
  return stageCategories(land, stage, settings);
}

/**
 * Łapanie i karmienie (GDD 8, 13.1): kategorie stworka. Stworki pospolite/niezwykłe dostają tylko
 * kategorie z etapów ≤ bieżącego (Plusik: do 10, od Ł3 także do 20), o ile coś zostaje;
 * rzadkie — zawsze pełne kategorie („górny etap”). Zapas: add.within10.
 */
function creaturePool(
  land: LandId,
  stage: number,
  settings: ParentSettings,
  creature: CreatureDef | undefined,
): CategoryId[] {
  if (creature === undefined) return [];
  let cats = available(creature.categories, settings);
  if (creature.rarity !== 'rare') {
    const staged = cats.filter((c) => (firstStageOf(land, c) ?? 0) <= stage);
    if (staged.length > 0) cats = staged;
  }
  if (cats.length === 0) cats = available(['add.within10'], settings);
  return cats;
}

export interface ActionCategoriesArgs {
  land: LandId;
  stage: number;
  action: PoolAction;
  settings: ParentSettings;
  /** Stworek — dla 'catch' i 'feed'. */
  creature?: CreatureDef;
  /** Faza bossa (1..3) — dla 'boss'; domyślnie 1. */
  bossPhase?: number;
}

/**
 * Pula kategorii zadań dla akcji. Tryb 'all' (rodzic): atak = + i −, atak mocny = ×,
 * obrona = −, obrona przed mocnym = : (każda pusta pula → tematyczna). Boss, skrzynia,
 * łapanie i karmienie są zawsze tematyczne (boss w fazie 1 bierze pulę ataku).
 * Zapasy: pula etapu → najprostsze dostępne kategorie → ['add.within10'] (także gdy
 * rodzic wyłączył wszystkie działania — tego nie da się spełnić inaczej). Nigdy pusta.
 */
export function actionCategories(args: ActionCategoriesArgs): CategoryId[] {
  const { land, settings } = args;
  const stage = clampStage(args.stage);
  let primary: CategoryId[];
  switch (args.action) {
    case 'attack':
    case 'strongAttack':
    case 'defend':
    case 'strongDefend':
      primary = combatPool(land, stage, args.action, settings);
      break;
    case 'boss': {
      const phase = Number.isFinite(args.bossPhase) ? Math.floor(args.bossPhase as number) : 1;
      primary = bossPool(land, stage, phase, settings);
      break;
    }
    case 'chest':
      primary = stageCategories(land, stage, settings);
      break;
    case 'catch':
    case 'feed':
      primary = creaturePool(land, stage, settings, args.creature);
      break;
  }
  if (primary.length > 0) return primary;
  const stagePool = stageCategories(land, stage, settings);
  if (stagePool.length > 0) return stagePool;
  const basics = available(BASIC_CATEGORIES, settings);
  if (basics.length > 0) return basics;
  return FINAL_FALLBACK.slice();
}

/**
 * Format zadania dla kategorii: dopełnianie do 10 i brakujący odjemnik → 'missing', reszta → 'choice'.
 * `action` na razie nie zmienia wyniku (obrona w formacie 'missing' dla innych kategorii — decyzja gry).
 */
export function preferredFormat(action: PoolAction, categoryId: CategoryId): TaskFormat {
  void action;
  return MISSING_FORMAT.has(categoryId) ? 'missing' : 'choice';
}

export interface StageMasteryArgs {
  land: LandId;
  settings: ParentSettings;
  /** Opanowanie kategorii 0..1 (np. z modelu ucznia). */
  mastery: (c: CategoryId) => number;
}

/** Średnie opanowanie puli etapu; null gdy pula pusta. */
export function stageMastery(args: StageMasteryArgs & { stage: number }): number | null {
  const cats = stageCategories(args.land, args.stage, args.settings);
  if (cats.length === 0) return null;
  let sum = 0;
  for (const c of cats) {
    const m = args.mastery(c);
    sum += Number.isFinite(m) ? Math.min(1, Math.max(0, m)) : 0;
  }
  return sum / cats.length;
}

function isMastered(args: StageMasteryArgs & { stage: number }): boolean {
  const m = stageMastery(args);
  // Tolerancja na błędy zaokrągleń średniej (np. 3 × 0,7).
  return m !== null && m >= STAGE_UP_MASTERY - 1e-9;
}

/** Awans etapu: etap < MAX i średnie opanowanie puli bieżącego etapu ≥ 0,7 (GDD 6.5). */
export function shouldStageUp(args: StageMasteryArgs & { stage: number }): boolean {
  const stage = clampStage(args.stage);
  if (stage >= MAX_STAGE) return false;
  return isMastered({ ...args, stage });
}

/**
 * Kategorie „własne” etapu (nowe na tym etapie), przefiltrowane przez ustawienia; gdy żadna nie jest
 * dostępna — cała pula etapu (żeby dowód nie był niemożliwy z powodu ustawień).
 */
export function stageOwnCategories(land: LandId, stage: number, settings: ParentSettings): CategoryId[] {
  const s = clampStage(stage);
  const own: CategoryId[] = [];
  for (const entry of LAND_STAGES[land][s - 1] ?? []) {
    if (entry.when !== undefined && !entry.when(settings)) continue;
    if (!own.includes(entry.c) && isCategoryAvailable(entry.c, settings)) own.push(entry.c);
  }
  return own.length > 0 ? own : stageCategories(land, s, settings);
}

export interface StartingStageArgs extends StageMasteryArgs {
  /**
   * Liczba prób kategorii (np. CategoryState.n z modelu ucznia). Gdy podana, awans ponad etap wymaga,
   * by co najmniej jedna własna kategoria etapu miała ≥ START_EVIDENCE_MIN prób (opanowanie z samych
   * priorytetów to nie dowód). Bez niej — tylko próg opanowania (zgodność wstecz).
   */
  evidence?: (c: CategoryId) => number;
}

function hasEvidence(args: StartingStageArgs, stage: number): boolean {
  const { evidence } = args;
  if (evidence === undefined) return true;
  return stageOwnCategories(args.land, stage, args.settings).some((c) => {
    const n = evidence(c);
    return Number.isFinite(n) && n >= START_EVIDENCE_MIN;
  });
}

/**
 * Etap startowy po kalibracji (ostrożnie): awans ponad etap k, gdy pula etapu k ma opanowanie ≥ 0,7
 * ORAZ (przy podanym `evidence`) co najmniej jedna własna kategoria etapu k ma ≥ 2 próby.
 * Nigdy powyżej START_STAGE_MAX (3) — etap 4 zdobywa się grą.
 */
export function startingStageFromMastery(args: StartingStageArgs): number {
  let stage = 1;
  while (stage < START_STAGE_MAX && isMastered({ ...args, stage }) && hasEvidence(args, stage)) stage++;
  return stage;
}
