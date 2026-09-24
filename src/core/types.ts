/**
 * WSPÓLNE KONTRAKTY TYPÓW — źródło prawdy dla wszystkich modułów `core/`, `content/`,
 * `game/`, `render/`, `ui/`. Opis mechanik: docs/GDD.md.
 *
 * Zasady:
 * - `core/` nie importuje niczego spoza `core/` (bez DOM, bez three.js).
 * - Czas zawsze przekazywany jawnie jako `now` (ms od epoki) — brak Date.now() w core.
 * - Losowość wyłącznie przez `Rng` (core/rng.ts).
 * - Stan zapisywany (SaveV1 i wszystko w nim) to czyste obiekty JSON (bez klas, Map, Set, undefined w tablicach).
 */

// ───────────────────────────── Matematyka ─────────────────────────────

export type Op = 'add' | 'sub' | 'mul' | 'div';

/**
 * Identyfikator faktu (konkretnej pary z tabliczki). Format (bez spacji):
 *   dodawanie:   "add:8+7"
 *   odejmowanie: "sub:15-8"
 *   mnożenie:    "mul:7x8"
 *   dzielenie:   "div:56:8"      (dzielna:dzielnik)
 *   dopełnianie: "cmp10:3"       (3 + □ = 10)
 */
export type FactId = string;

export type MulTable = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Kategorie (umiejętności). Definicje zakresów — src/core/math/categories.ts (GDD 5.1, 6.5).
 *  add.within10      a+b ≤ 10, a,b ≥ 1                                 (fakty)
 *  add.complement10  a + □ = 10, a ∈ 1..9                              (fakty cmp10:a)
 *  add.doubles       a+a, a ∈ 1..10                                     (fakty)
 *  add.within20      dodawanie do 20 BEZ przekroczenia progu 10, np. 12+5, 5+12 (fakty)
 *  add.cross10       a,b ∈ 2..9, a+b ≥ 11 (z przekroczeniem)            (fakty)
 *  add.three         trzy składniki 1..9, suma ≤ min(20, zakres)        (proceduralne)
 *  add.2d            dwucyfrowe bez przeniesienia, suma ≤ 99 (zakres 100) (proceduralne)
 *  add.2d.carry      dwucyfrowe z przeniesieniem, suma ≤ 100 (zakres 100) (proceduralne)
 *  sub.within10      m ∈ 2..10, s ∈ 1..m-1                               (fakty)
 *  sub.within20      m ∈ 11..19, s ∈ 1..9, jedności m ≥ s (17-5)         (fakty)
 *  sub.cross10       m ∈ 11..18, s ∈ 2..9, jedności m < s, wynik ≤ 9 (15-8) (fakty)
 *  sub.missing       brakująca liczba w odejmowaniu (13 − □ = 8)          (proceduralne)
 *  sub.2d            dwucyfrowe bez pożyczania (zakres 100)               (proceduralne)
 *  sub.2d.borrow     dwucyfrowe z pożyczaniem (zakres 100)                (proceduralne)
 *  mul.tK            tabliczka: fakty mul:axb, a,b ∈ 1..10, K ∈ {a,b}     (fakty)
 *  div.byK           div:p:K, p = K·q, q ∈ 1..10                          (fakty)
 */
export type CategoryId =
  | 'add.within10'
  | 'add.complement10'
  | 'add.doubles'
  | 'add.within20'
  | 'add.cross10'
  | 'add.three'
  | 'add.2d'
  | 'add.2d.carry'
  | 'sub.within10'
  | 'sub.within20'
  | 'sub.cross10'
  | 'sub.missing'
  | 'sub.2d'
  | 'sub.2d.borrow'
  | `mul.t${MulTable}`
  | `div.by${MulTable}`;

export type NumberRange = 10 | 20 | 100;

export interface CategoryDef {
  id: CategoryId;
  op: Op;
  /** Krótka polska nazwa dla panelu rodzica, np. "Dodawanie z przekroczeniem 10". */
  label: string;
  /** Najmniejszy zakres liczb, przy którym kategoria jest dostępna. */
  minRange: NumberRange;
  /** true = śledzone per fakt; false = proceduralne (śledzone tylko na poziomie kategorii). */
  factBased: boolean;
}

/** Format zadania (GDD 5.2). */
export type TaskFormat = 'choice' | 'missing' | 'typed';

/** Rodzaj błędu reprezentowanego przez dystraktor (GDD 5.3, Propozycja 9). */
export type DistractorKind =
  | 'offByOne'
  | 'offByTwo'
  | 'offByTen'
  | 'lostCarry'
  | 'wrongOp'
  | 'tableNeighbor'
  | 'swappedDigits'
  | 'divisorInstead'
  | 'other';

export interface Task {
  /** Unikalny identyfikator instancji zadania (np. licznik z modelu). */
  id: string;
  /** Fakt, jeśli kategoria jest faktowa; null dla zadań proceduralnych. */
  factId: FactId | null;
  /** Kategoria główna (ta, z której zadanie wylosowano). */
  categoryId: CategoryId;
  /** Wszystkie kategorie, do których liczy się ta próba (np. mul:7x8 → mul.t7 i mul.t8). */
  categories: CategoryId[];
  format: TaskFormat;
  op: Op;
  /**
   * Tekst do wyświetlenia, gotowy dla dziecka, z polskimi znakami działań:
   * "8 + 7 = ?", "15 − 8 = ?", "7 × 8 = ?", "56 : 8 = ?", "3 + □ = 10", "4 + 6 + 3 = ?".
   * Znak minus to U+2212 "−", mnożenie U+00D7 "×", dzielenie ":".
   */
  text: string;
  /** Liczby występujące w zadaniu w kolejności wyświetlania (bez niewiadomej). */
  operands: number[];
  /** Poprawna odpowiedź (liczba wpisywana/wybierana przez dziecko). */
  answer: number;
  /**
   * Opcje do wyboru (format 'choice' i 'missing'): zawiera `answer`, długość 3 lub 4,
   * wartości unikalne, nieujemne, w losowej kolejności. Dla 'typed' — pusta tablica.
   */
  options: number[];
  /** Rodzaj błędu dla każdej błędnej opcji (klucz = wartość opcji jako string). */
  distractorKinds: Record<string, DistractorKind>;
}

/** Strategia podpowiedzi (GDD 5.4). */
export type HintStrategy =
  | 'make10' //        8+7 → 8+2+5
  | 'nearDouble' //    6+7 → 6+6+1
  | 'doubles' //       6+6 → podwojenie
  | 'pairs10' //       3+□=10 → para 3 i 7
  | 'down10' //        15−8 → 15−5−3
  | 'countUp' //       15−8 → 8+□=15
  | 'nineTrick' //     9×7 → 70−7
  | 'fiveTrick' //     5×7 → połowa z 10×7
  | 'sixTrick' //      6×7 → 5×7+7
  | 'doubleDouble' //  4×8 → 16 → 32
  | 'commute' //       3×8 → 8×3
  | 'inverseMul' //    56:8 → 8×□=56
  | 'tens' //          34+25 → 30+20 i 4+5
  | 'direct'; //       prosta wizualizacja bez triku

export interface Hint {
  strategy: HintStrategy;
  /** Krótki tytuł dla dziecka, np. "Dopełnij do 10!". */
  title: string;
  /** Kroki po polsku, np. ["8 + 2 = 10", "10 + 5 = 15"]. 1–3 kroki. */
  steps: string[];
  /** Podsumowanie w jednej linii, np. "8 + 7 = 8 + 2 + 5 = 15". */
  summary: string;
  /** Wizualizacja na osi liczbowej (dodawanie/odejmowanie): start i kolejne skoki (ujemne = w lewo). */
  numberLine?: { from: number; jumps: number[] };
  /** Wizualizacja prostokąta z kostek (mnożenie/dzielenie). */
  blocks?: { rows: number; cols: number; highlightRows?: number };
  /**
   * Pierwszy krok strategii — do pomocy „OŚ” ze sprzętu (GDD 12.1): pokazywany PRZED odpowiedzią,
   * nie zdradza wyniku. Np. "8 + 2 = 10, a zostało jeszcze 5".
   */
  firstStep: string;
}

// ───────────────────────────── Ustawienia rodzica ─────────────────────────────

export type TimeLimitMode = 'none' | 'gentle' | 'fixed';
export type QualityPreset = 'auto' | 'low' | 'medium' | 'high';

export interface ParentSettings {
  range: NumberRange;
  ops: Record<Op, boolean>;
  /** 'themed' = działania krainy; 'all' = wszystkie włączone działania w walce. */
  combatOps: 'themed' | 'all';
  crossTenOnMeadow: boolean;
  timeLimit: {
    mode: TimeLimitMode;
    /** Sekundy dla trybu 'fixed'. */
    fixedSec: Record<Op, number>;
  };
  /** 0 = brak przypomnienia. */
  breakReminderMin: 0 | 15 | 20 | 30;
  quality: QualityPreset;
  audio: { music: number; sfx: number };
  /** Pokazuj licznik FPS (do pomiaru wydajności przez rodzica). */
  showFps: boolean;
}

// ───────────────────────────── Model ucznia / adaptacja ─────────────────────────────

/** Tryb, w którym padła próba. */
export type AttemptMode = 'combat' | 'catch' | 'gate' | 'feed' | 'calibration' | 'chest' | 'forge';

export interface Attempt {
  taskId: string;
  factId: FactId | null;
  categoryId: CategoryId;
  categories: CategoryId[];
  format: TaskFormat;
  mode: AttemptMode;
  correct: boolean;
  /** Upłynął limit czasu bez odpowiedzi. */
  timedOut: boolean;
  /** Czas odpowiedzi w ms (od odblokowania wejścia). */
  ms: number;
  /** Rozwiązane z pomocą sprzętu (OŚ, POPRAWKA) — GDD 6.3, 12.1. */
  helped: boolean;
  /** Wybrana/wpisana wartość (null przy braku odpowiedzi). */
  given: number | null;
  /** Rodzaj błędu, jeśli wybrano dystraktor. */
  errorKind: DistractorKind | null;
  at: number;
}

export interface FactState {
  /** Opanowanie 0..1 (EWMA wyników prób). */
  m: number;
  /** EWMA ln(ms) poprawnych odpowiedzi; null gdy brak. */
  lt: number | null;
  n: number;
  nOk: number;
  /** Pudełko Leitnera 0..5. */
  box: number;
  lastSeenAt: number;
  lastSeenSession: number;
  helped: number;
  /** Wyniki (true/false) 2 ostatnich prób — do warunku OPANOWANE. */
  last2: boolean[];
}

export interface CategoryState {
  /** Ostatnie czasy poprawnych odpowiedzi (ms), max 30 — do mediany. */
  recentMs: number[];
  n: number;
  nOk: number;
  /** Opanowanie kategorii dla kategorii proceduralnych (EWMA); dla faktowych liczone z faktów. */
  m: number;
  /** Wstępna wartość z kalibracji/priorytetu, używana dla faktów bez prób. */
  prior: number;
}

export type Bucket = 'progress' | 'weak' | 'mastered' | 'new';

export interface SkillModel {
  facts: Record<FactId, FactState>;
  categories: Partial<Record<CategoryId, CategoryState>>;
  /** Numer bieżącej sesji (rośnie przy startSession). */
  session: number;
  /** Globalny licznik zadań (do identyfikatorów i planowania powtórek). */
  taskCounter: number;
  /** Okno ostatnich wyników (true/false), max 8 — regulator (GDD 6.4). */
  window: boolean[];
  /** Ostatnie fakty/kategorie (max 6), do reguł „nie powtarzaj”. */
  recent: { factId: FactId | null; categoryId: CategoryId }[];
  /** Zaplanowane powtórki po błędzie (GDD 5.4): fakt wraca po 2–4 innych zadaniach, raz w sesji. */
  retries: { factId: FactId; categoryId: CategoryId; dueAtTask: number; session: number }[];
  /** Liczba błędów z rzędu (bezpiecznik frustracji). */
  errorStreak: number;
}

/** Zapytanie o zadanie. */
export interface TaskRequest {
  /** Pula kategorii (już przefiltrowana przez etap krainy i ustawienia). Niepusta. */
  categories: CategoryId[];
  settings: ParentSettings;
  mode: AttemptMode;
  format: TaskFormat;
  /** Liczba opcji dla 'choice'/'missing' (domyślnie 4). */
  optionsCount?: 3 | 4;
  /** Wymuszenie koszyka (np. bezpiecznik, testy). */
  forceBucket?: Bucket;
}

// ───────────────────────────── Walka ─────────────────────────────

export type ActionKind = 'attack' | 'strongAttack' | 'defend' | 'strongDefend';

/** Wynik QTE (GDD 7.3). 'retryCorrect' = poprawnie po użyciu POPRAWKI. 'late' = poprawnie po limicie. */
export type QteResult = 'fast' | 'correct' | 'late' | 'wrong' | 'timeout' | 'retryCorrect';

export type EnemyBehavior = 'normal' | 'fast' | 'heavy' | 'boss';

export interface BossPhaseDef {
  /** Faza trwa, dopóki Czar > czarBelow poprzedniej fazy (fazy po kolei, od 1). */
  czarFrom: number;
  /** Kategorie zadań w tej fazie, klucz = ActionKind (co dziecko liczy przy danej akcji). */
  note: string;
  /** Mocny atak co N tur (0 = nigdy). */
  strongEvery: number;
  /** Liczba pnączy przywoływanych na początku fazy (każde znika po 1 poprawnym ataku, blokuje obrażenia bossa). */
  vines: number;
}

export interface EnemyDef {
  id: string;
  /** Imię brainrota, np. "Ślimakorro Buciorro". */
  name: string;
  /** Imię po przemianie (brainglam), np. "Ślimakella Glamella". */
  glamName: string;
  /** Okrzyk przy ataku. */
  battleCry: string;
  /** Podziękowanie brainglama. */
  glamThanks: string;
  land: LandId;
  czar: number;
  behavior: EnemyBehavior;
  attack: number;
  strongAttack: number;
  /** Co ile tur mocny atak (heavy: 3). 0 = nigdy. */
  strongEvery: number;
  /** Dla 'fast': co drugą turę 2 ataki. */
  isBoss: boolean;
  phases?: BossPhaseDef[];
}

export interface HeroStats {
  maxHp: number;
  attackBonus: number;
  /** Premie do bloku z posiadanych stworków (0..1), klucz = rodzaj obrony. */
  defenseBoost: { defend: number; strongDefend: number };
  /** Liczba ładunków tarczy Koniczynka (pochłania 1 cios na walkę). */
  shieldCharges: number;
}

export interface EnemyIntent {
  kind: 'normal' | 'strong';
  /** Liczba kolejnych ciosów w tej turze (fast: 2 co drugą turę). */
  hits: number;
}

export type CombatEvent =
  | { t: 'playerHit'; action: ActionKind; result: QteResult; damage: number; crit: boolean; vineRemoved: boolean }
  | { t: 'enemyHit'; intent: EnemyIntent['kind']; result: QteResult; raw: number; taken: number; blockedPct: number; counter: number; shieldUsed: boolean }
  | { t: 'phase'; phase: number; vines: number }
  | { t: 'heroDown' }
  | { t: 'rescued' }
  | { t: 'transformed' }
  | { t: 'shieldGain'; amount: number; result: QteResult }
  | { t: 'heal'; amount: number; result: QteResult }
  | { t: 'weaken'; pct: number; result: QteResult }
  | { t: 'shieldAbsorb'; absorbed: number };

export interface CombatState {
  enemyId: string;
  czar: number;
  maxCzar: number;
  /** Faza bossa (1..n); dla zwykłych = 1. */
  phase: number;
  vines: number;
  heroHp: number;
  heroMaxHp: number;
  shieldCharges: number;
  /** Numer tury wroga (od 1) — deterministycznie wyznacza zamiary. */
  enemyTurn: number;
  /** Tury do odnowienia ataku mocnego (0 = dostępny). */
  strongCooldown: number;
  turn: 'player' | 'enemy';
  /** true gdy Czar = 0 → przemiana w brainglama. */
  won: boolean;
  log: CombatEvent[];
}

// ───────────────────────────── Karty (GDD v0.3, sekcja 7 i 13.5) ─────────────────────────────

export type CardKind =
  | 'attack' //      zdejmuje Czar
  | 'strongAttack' // dużo Czaru (koszt 2)
  | 'shield' //      tarcza na turę brainrota
  | 'bigShield' //   duża tarcza
  | 'heal' //        leczenie bohatera
  | 'weaken' //      osłabia następny ruch brainrota (power = procent 0..100)
  | 'multiHit' //    power2 ciosów po power
  | 'combo'; //      power Czaru + power2 tarczy

export type CardRarity = Rarity | 'legendary';

export interface CardDef {
  id: string;
  name: string;
  source: 'starter' | 'creature' | 'glam';
  /** Id stworka (source 'creature') lub brainrota (source 'glam'); null dla startowych. */
  sourceId: string | null;
  rarity: CardRarity;
  kind: CardKind;
  cost: 1 | 2;
  /** Siła przy poprawnej odpowiedzi (patrz CardKind). */
  power: number;
  /** multiHit: liczba ciosów; combo: tarcza; inaczej 0. */
  power2: number;
  /** Z jakiej puli działań losowane jest zadanie przy zagraniu (progression.actionCategories). */
  pool: ActionKind;
  /** Opis efektu dla dziecka, np. "Zdejmij 8 Czaru." */
  description: string;
  /** Portret na karcie (ModelId z game/contracts), np. 'creature:plusik', 'glam:slimakorro'. */
  art: string;
}

/** Konkretna kopia karty w walce. */
export interface CardInstance {
  uid: string;
  cardId: string;
}

export interface CardBattleState {
  combat: CombatState;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  energy: number;
  maxEnergy: number;
  /** Tarcza zebrana w tej turze (pochłania obrażenia w turze brainrota, potem znika). */
  shield: number;
  /** Osłabienie następnego ruchu brainrota (0..1). */
  weaken: number;
  /** Zapowiedziany ruch brainrota na jego najbliższą turę. */
  intents: EnemyIntent[];
  turnNo: number;
  uidCounter: number;
}

export type TradeOffer =
  | { id: string; kind: 'threeForOne'; cardId: string }
  | { id: string; kind: 'daily'; cardId: string; price: ForgeCost }
  | { id: string; kind: 'sell'; cardId: string; digits: number };

// ───────────────────────────── Stworki, cyfry, brama, sprzęt ─────────────────────────────

export type Rarity = 'common' | 'uncommon' | 'rare';
export type GateOp = '+' | '−' | '×' | ':';

/** Liczba sztuk każdej cyfry 0..9 (indeks = cyfra). Długość zawsze 10. */
export type Digits = number[];

export type ProductionKind =
  | 'small' //   Plusik: cyfry z {1..5}
  | 'pairs10' // Dopełniak: pary do 10 (a, 10−a)
  | 'twins' //   Bliźniak: dwie takie same cyfry
  | 'rare'; //   Koniczynek: cyfra z {6..9} + 0 co drugi cykl (poz. 3: co cykl)

export interface CreatureDef {
  id: string;
  name: string;
  land: LandId;
  rarity: Rarity;
  /** Kategorie zadań przy łapaniu i karmieniu. */
  categories: CategoryId[];
  /** Format zadań przy łapaniu. */
  catchFormat: TaskFormat;
  /** Złapanie: `need` poprawnych z `of` prób (GDD 8). */
  catchRule: { need: number; of: number };
  unlocksAction?: ActionKind;
  unlocksOperator?: GateOp;
  /** Wzmacnia obronę (+20% bloku). */
  boostsDefense?: 'defend' | 'strongDefend';
  /** Tarcza pochłaniająca 1 cios na walkę (Koniczynek). */
  shield?: boolean;
  production: ProductionKind;
  /** Opis dla dziecka (1 zdanie). */
  description: string;
}

export interface OwnedCreature {
  id: string;
  /** 1..3 (duplikat = +1 poziom, max 3). */
  level: number;
  /** Cykl, w którym ostatnio nakarmiony (−1 = nigdy). */
  fedCycle: number;
  caughtAt: number;
}

/** Token toru wyrażenia w bramie. */
export type GateToken = { t: 'd'; v: number } | { t: 'op'; v: GateOp };

export type GateParseError =
  | 'empty'
  | 'noOp'
  | 'twoOps'
  | 'missingOperand'
  | 'tooLong' //       liczba > 2 cyfry
  | 'leadingZero' //   np. "05"
  | 'divByZero'
  | 'notInteger'
  | 'negative';

export type GateParse =
  | { ok: true; a: number; op: GateOp; b: number; value: number; digitsUsed: number[] }
  | { ok: false; error: GateParseError };

export interface GateSolution {
  a: number;
  op: GateOp;
  b: number;
  /** Liczba zużytych cyfr. */
  digitCount: number;
}

export interface GateSolveResult {
  solvable: boolean;
  /** Minimalna liczba cyfr spośród rozwiązań możliwych z danych cyfr (null gdy brak). */
  minDigits: number | null;
  /** Do N przykładowych rozwiązań, posortowanych rosnąco po digitCount. */
  solutions: GateSolution[];
}

export interface GateScore {
  valid: boolean;
  /** Wartość wyrażenia (gdy sparsowane). */
  value: number | null;
  error: GateParseError | 'wrongValue' | 'notEnoughDigits' | 'opLocked' | null;
  digitsUsed: number[];
  /** Sprytne: min. liczba cyfr LUB nietrywialne × / : (nie ×1, nie :1) — GDD 10.2. */
  smart: boolean;
  /** Tekst dla dziecka, np. "Twoje działanie daje 48. Brakuje 6." */
  message: string;
}

export interface GateSpec {
  target: number;
  /** Cyfry „daru bramy” dodawane, gdy bez nich brak rozwiązania (GDD 10.4). */
  gift: Digits;
  ops: GateOp[];
}

export type EquipSlot = 'weapon' | 'armor' | 'net' | 'amulet';
export type HelpKind = 'time' | 'numberLine' | 'retry' | 'extraCatchTry';

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  land: LandId;
  rarity: Rarity | 'legendary';
  attackBonus: number;
  hpBonus: number;
  /** Pomoc na poziomie 1; każdy kolejny poziom: +1 użycie lub +1 s (GDD 12.2). */
  help?: {
    kind: HelpKind;
    /** Sekundy (time) lub liczba użyć na walkę/łapanie (pozostałe). */
    amount: number;
    /** Kiedy działa. */
    appliesTo: 'attack' | 'defense' | 'catch' | 'all';
  };
  description: string;
}

export interface OwnedItem {
  id: string;
  level: number;
}

export interface ForgeCost {
  /** „Złóż `sum` z `count` cyfr”. */
  sum: number;
  count: number;
}

export type ChestKind = 'world' | 'dungeon' | 'bonus' | 'boss';

export interface ChestLoot {
  digits: number[];
  itemId: string | null;
}

// ───────────────────────────── Krainy, postęp ─────────────────────────────

export type LandId = 'meadow' | 'cave' | 'volcano' | 'castle' | 'ice';

export interface LandProgress {
  unlocked: boolean;
  /** Etap trudności 1..4 (Ł1–Ł4). */
  stage: number;
  bossDefeated: boolean;
  gatesOpened: number;
  dungeonRuns: number;
}

export interface GlamEntry {
  enemyId: string;
  count: number;
  firstAt: number;
}

// ───────────────────────────── Zapis ─────────────────────────────

export interface AttemptLog {
  f: FactId | null;
  c: CategoryId;
  ok: boolean;
  to: boolean;
  ms: number;
  h: boolean;
  md: AttemptMode;
  ek: DistractorKind | null;
  t: number;
}

export interface SessionLog {
  start: number;
  end: number;
  tasks: number;
  correct: number;
}

export interface SaveV1 {
  version: 1;
  createdAt: number;
  updatedAt: number;
  /** Ziarno świata / losowań (stałe dla profilu). */
  seed: number;
  profile: { name: string; color: string };
  settings: ParentSettings;
  model: SkillModel;
  inventory: { digits: Digits };
  creatures: OwnedCreature[];
  equipment: {
    owned: OwnedItem[];
    equipped: Record<EquipSlot, string | null>;
  };
  progress: {
    /** Numer cyklu produkcji (GDD 3). */
    cycle: number;
    /** Czy od ostatniego powrotu do bazy padło ≥1 zadanie (warunek nowego cyklu). */
    taskSinceReturn: boolean;
    calibrated: boolean;
    firstExpeditionDone: boolean;
    lands: Record<LandId, LandProgress>;
    glams: Record<string, GlamEntry>;
    /** Otwarte skrzynie w świecie (id POI). */
    openedChests: string[];
    /** Licznik „gwarancji” skrzyń (co 3. zwykła daje przedmiot). */
    chestPity: number;
    /** Czar zachowany w przerwanej walce (klucz = id pokoju/wroga). */
    dungeon: {
      active: boolean;
      roomOrder: string[];
      roomIndex: number;
      enemyCzar: Record<string, number>;
      bossPhase: number;
    };
    /** Bonusowa skrzynka czeka na otwarcie w dungeonie (sprytna brama). */
    pendingBonusChest: boolean;
  };
  history: AttemptLog[];
  sessions: SessionLog[];
}
