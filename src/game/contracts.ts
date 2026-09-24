/**
 * KONTRAKTY WARSTWY PREZENTACJI — interfejsy między:
 *   game/ (orkiestracja, logika przepływów)  ⇄  render/ (three.js)
 *   game/                                    ⇄  ui/ (DOM, panele, QTE)
 *   game/                                    ⇄  input/ (dotyk, klawiatura)
 *   game/                                    ⇄  platform/ (zapis, audio, PWA)
 *
 * render/ i ui/ są CZYSTO PREZENTACYJNE: nie znają reguł gry, dostają gotowe dane (view-modele)
 * i zwracają wybory dziecka (Promise). Reguły gry są w core/ (patrz src/core/types.ts).
 * Opis mechanik: docs/GDD.md.
 */
import type {
  AttemptMode,
  CardKind,
  CardRarity,
  CategoryId,
  Digits,
  DistractorKind,
  EquipSlot,
  GateOp,
  GateScore,
  GateToken,
  Hint,
  LandId,
  ParentSettings,
  Rarity,
  SaveV1,
  Task,
} from '../core/types';

// ───────────────────────────── Geometria ─────────────────────────────

/** Pozycja na płaszczyźnie świata (1 jednostka = 1 kostka). */
export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPos {
  x: number;
  y: number;
  /** false gdy punkt jest za kamerą lub poza ekranem. */
  visible: boolean;
}

// ───────────────────────────── Modele i animacje ─────────────────────────────

/**
 * Identyfikatory modeli. Stworki/brainroty/brainglamy przez prefiks + id z content/.
 *   'hero'
 *   'creature:plusik' | 'creature:dopelniak' | 'creature:blizniak' | 'creature:koniczynek'
 *   'enemy:slimakorro' | 'enemy:trzmielini' | 'enemy:grzybello' | 'enemy:kosiarrini'
 *   'glam:slimakorro'  | 'glam:trzmielini'  | 'glam:grzybello'  | 'glam:kosiarrini'
 *   'npc:kartonini'  (Handlarz Kartonini — kartonowe pudło z wąsem, GDD 9.5a)
 *   'prop:<PropKind>'
 */
export type ModelId =
  | 'hero'
  | `creature:${string}`
  | `enemy:${string}`
  | `glam:${string}`
  | `npc:${string}`
  | `prop:${PropKind}`;

export type PropKind =
  | 'chest'
  | 'gate'
  | 'portal'
  | 'campfire'
  | 'anvil'
  | 'treasury'
  | 'board'
  | 'podium'
  | 'vine'
  | 'lantern'
  | 'mushroom'
  | 'crystal'
  | 'den'
  | 'sign';

export type AnimName =
  | 'idle'
  | 'walk'
  | 'windup' //       zamach przed atakiem (pętla do czasu następnej animacji)
  | 'attack'
  | 'strongAttack'
  | 'hit' //          otrzymanie ciosu
  | 'block'
  | 'dance'
  | 'cheer'
  | 'hide' //         stworek chowa się (znika w ziemi/krzaku)
  | 'appear'
  | 'open' //         skrzynia/brama
  | 'sleep';

export type EntityId = number;

// ───────────────────────────── Sceny ─────────────────────────────

export type SceneKind = 'base' | 'meadow' | 'dungeon-room';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type RoomKind = 'fight' | 'chest' | 'rest' | 'boss';

export interface SceneRequest {
  kind: SceneKind;
  seed: number;
  timeOfDay?: TimeOfDay;
  /** Tylko dla 'dungeon-room'. */
  room?: { kind: RoomKind; index: number };
}

export type PoiKind =
  | 'spawn'
  | 'portal' //       portal (baza ⇄ łąka)
  | 'station' //      stacja w bazie (zagroda, skarbiec, kuźnia, galeria, tablica)
  | 'den' //          legowisko stworka
  | 'rareSpot' //     miejsce rzadkiego stworka
  | 'chest'
  | 'gate' //         brama do dungeonu
  | 'penCenter' //    środek zagrody (stworki wędrują wokół)
  | 'glamSpot' //     miejsce dla brainglama w galerii
  | 'heroSpot' //     pozycja bohatera w walce
  | 'enemySpot' //    pozycja brainrota w walce
  | 'campfire'
  | 'exit';

/**
 * Punkt interakcji. STAŁE identyfikatory (game/ na nich polega):
 *  base:   'spawn', 'portal-meadow', 'station-zagroda', 'station-skarbiec', 'station-kuznia',
 *          'station-galeria', 'station-tablica', 'station-karty' (stół z kartami + handlarz),
 *          'pen-center', 'glam-0' … 'glam-7'
 *  meadow: 'spawn', 'portal-base', 'den-plusik', 'den-dopelniak', 'den-blizniak',
 *          'spot-koniczynek', 'chest-1', 'chest-2', 'chest-3', 'gate-dungeon'
 *  dungeon-room: 'hero-spot', 'enemy-spot-0', 'enemy-spot-1', 'chest' (kind chest),
 *          'campfire' (kind rest), 'exit'
 */
export interface Poi {
  id: string;
  kind: PoiKind;
  pos: Vec2;
  /** Promień interakcji (kostki). */
  radius: number;
  /**
   * Encja rekwizytu postawionego przez scenę dla tego POI (np. skrzynia, brama, nora, Kartonini przy
   * 'station-karty') — do play('open'), setHighlight, despawn. Brak = scena nie stawia rekwizytu.
   */
  entity?: EntityId;
}

export interface SceneInfo {
  kind: SceneKind;
  spawn: Vec2;
  pois: Poi[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export type QualityLevel = 'low' | 'medium' | 'high';

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  /** Skala rozdzielczości renderu względem natywnej (0.5–1.0). */
  renderScale: number;
  quality: QualityLevel;
}

export type BurstKind = 'sparkle' | 'hit' | 'crit' | 'block' | 'heal' | 'catch' | 'digits' | 'poof';

// ───────────────────────────── RenderApi ─────────────────────────────

export interface RenderApi {
  readonly canvas: HTMLCanvasElement;

  /** Uruchamia pętlę renderowania (requestAnimationFrame, limit 60 fps). */
  start(): void;
  stop(): void;
  /** Subskrypcja ticku (dt w sekundach, już przeskalowane przez timeScale NIE — dt realne). Zwraca funkcję wypisania. */
  onFrame(cb: (dtReal: number) => void): () => void;

  setQuality(q: QualityLevel): void;
  getQuality(): QualityLevel;
  /** Krótki test wydajności (~3 s na bieżącej scenie) → zalecany preset. */
  autoDetectQuality(): Promise<QualityLevel>;
  getStats(): RenderStats;

  /** Czyści bieżącą scenę (encje, teren) i buduje nową. */
  loadScene(req: SceneRequest): Promise<SceneInfo>;
  setTimeOfDay(t: TimeOfDay): void;

  // Encje
  spawn(model: ModelId, pos: Vec2 | Vec3, opts?: { facing?: number; scale?: number; color?: string }): EntityId;
  despawn(id: EntityId): void;
  exists(id: EntityId): boolean;
  getPosition(id: EntityId): Vec3;
  setPosition(id: EntityId, pos: Vec2 | Vec3): void;
  /** Kąt obrotu wokół osi Y (radiany, 0 = patrzy w +Z). */
  setFacing(id: EntityId, yaw: number): void;
  faceTowards(id: EntityId, target: Vec2): void;
  /** Animacja. Pętle (idle, walk, windup, dance, sleep) rozwiązują się od razu; jednorazowe po zakończeniu. */
  play(id: EntityId, anim: AnimName, opts?: { speed?: number }): Promise<void>;
  /** Swobodne wędrowanie w promieniu (stworki, brainglamy w galerii). */
  wander(id: EntityId, center: Vec2, radius: number): void;
  stopWander(id: EntityId): void;
  moveTo(id: EntityId, target: Vec2, speed?: number): Promise<void>;
  setVisible(id: EntityId, visible: boolean): void;
  /** Podświetlenie (obrys/poświata) — np. obiekt w zasięgu interakcji. */
  setHighlight(id: EntityId, on: boolean): void;

  // Bohater (sterowanie w czasie rzeczywistym)
  setHero(id: EntityId): void;
  /**
   * Wejście ruchu bohatera: x = w prawo NA EKRANIE, y = w górę NA EKRANIE (kamera jest stała), długość 0..1.
   * Render sam porusza bohaterem (prędkość, teren, kolizje z wodą i przeszkodami, animacje walk/idle).
   */
  setHeroInput(move: { x: number; y: number }): void;
  /** Blokada ruchu bohatera (walka, panele). */
  setHeroFrozen(frozen: boolean): void;

  // Kamera (GDD v0.3: STAŁA kamera z góry pod kątem ~50°, bez obracania przez gracza)
  /** Kamera podąża za encją pod stałym kątem (płynnie). */
  cameraFollow(id: EntityId): void;
  /** Ujęcie walki: bohater i brainrot w kadrze, lekko z boku, bliżej niż w eksploracji. */
  cameraCombat(heroId: EntityId, enemyId: EntityId): void;
  cameraCloseup(id: EntityId): void;
  /** Wolna orbita wokół punktu (ekran tytułowy). */
  cameraOrbit(center: Vec3, radius: number, speed: number): void;

  /** Zwolnione tempo świata (1 = normalnie). Płynne przejście w rampMs. */
  setTimeScale(scale: number, rampMs?: number): void;
  /** Przyciemnienie tła w czasie odpowiedzi na zadanie (GDD 7.1). */
  setFocusDim(on: boolean): void;

  // Efekty
  burst(pos: Vec3, kind: BurstKind): void;
  /** Przemiana brainrota w brainglama (GDD 7.6): wir, rozpad na świecące kostki, złożenie. Zwraca id nowej encji. */
  transform(enemyEntity: EntityId, glamModel: ModelId): Promise<EntityId>;
  shake(intensity: number, ms: number): void;

  /**
   * Portret modelu jako obrazek (data URL PNG, przezroczyste tło, ujęcie 3/4 od przodu), buforowany.
   * Używany na kartach, w dialogach, galerii, zagrodzie.
   */
  portrait(model: ModelId, size?: number): Promise<string>;

  worldToScreen(pos: Vec3): ScreenPos;
  /** Pozycja ekranowa punktu nad encją (np. nad głową). */
  entityScreenPos(id: EntityId, offsetY?: number): ScreenPos;
  heightAt(x: number, z: number): number;

  dispose(): void;
}

// ───────────────────────────── InputApi (dotyk + klawiatura) ─────────────────────────────

export type ActionIcon = 'catch' | 'open' | 'enter' | 'talk' | 'feed' | 'forge' | 'treasury' | 'gallery' | 'map' | 'portal' | 'gate';

export interface InputApi {
  /** Pokaż/ukryj sterowanie eksploracją (gałka, przycisk akcji, pauza). Kamera jest stała — brak obszaru obrotu. */
  setMode(mode: 'explore' | 'ui'): void;
  /** Wektor ruchu z gałki/klawiatury w układzie ekranu: x w prawo, y w górę ekranu, długość ≤ 1. */
  getMove(): { x: number; y: number };
  /** Kontekstowy przycisk akcji (null = ukryty). */
  setAction(action: { icon: ActionIcon; label: string } | null): void;
  onAction(cb: () => void): () => void;
  onPause(cb: () => void): () => void;
  /** Klawisze 1–4 (tylko testy deweloperskie) — panel odpowiedzi subskrybuje. */
  onAnswerKey(cb: (index: number) => void): () => void;
  dispose(): void;
}

// ───────────────────────────── UiApi (DOM) ─────────────────────────────

/** Kontekst zadania (wpływa na nagłówek i kolory panelu odpowiedzi). */
export type AnswerKind = 'card' | 'catch' | 'feed' | 'chest' | 'calibration';

export interface CardFace {
  uid: string;
  cardId: string;
  name: string;
  kind: CardKind;
  cost: 1 | 2;
  /** Krótki tekst siły, np. "8", "3×4", "+15". */
  powerText: string;
  description: string;
  rarity: CardRarity;
  /** Portret (ModelId), np. 'creature:plusik', 'glam:slimakorro'. */
  art: ModelId;
  /** Czy można zagrać (energia, pnącza itp.). */
  playable: boolean;
}

export interface AnswerRequest {
  task: Task;
  kind: AnswerKind;
  /** Nagłówek, np. "Cios Plusika!", "Złap Dopełniaka — 1/3", "Próba Plusika 5/20". */
  title: string;
  /** Karta, która jest zagrywana (pokazana nad działaniem), jeśli kind === 'card'. */
  card?: CardFace;
  /** Limit czasu (ms) albo null = bez limitu (domyślnie; pierścień czasu niewidoczny). */
  limitMs: number | null;
  /** Dostępne użycia pomocy OŚ (0 = przycisk ukryty). Pokazuje hint.firstStep + oś. */
  numberLineUses: number;
  /** Czy dostępna POPRAWKA: po złym wyborze krótka podpowiedź i drugi wybór. */
  retryAvailable: boolean;
  /** Podpowiedź do OŚ i POPRAWKI (liczona przez game/). */
  hint: Hint;
  /** Blokada wejścia po pokazaniu (domyślnie 300 ms). */
  inputLockMs?: number;
}

export interface AnswerResult {
  /** Ostateczna wybrana/wpisana wartość; null przy upływie czasu. */
  given: number | null;
  /** Czas od odblokowania do PIERWSZEJ odpowiedzi (ms). */
  ms: number;
  timedOut: boolean;
  usedNumberLine: boolean;
  /** true gdy użyto POPRAWKI (pierwszy wybór był błędny). */
  usedRetry: boolean;
  firstGiven: number | null;
}

export interface IntentView {
  /** Tekst zapowiedzi, np. "Cios 10", "Mocny cios 22", "2 × cios 6". */
  text: string;
  kind: 'normal' | 'strong' | 'multi';
  /** Obrażenia po uwzględnieniu osłabienia (suma wszystkich ciosów). */
  total: number;
}

export interface CardTurnView {
  hand: CardFace[];
  energy: number;
  maxEnergy: number;
  drawCount: number;
  discardCount: number;
  shield: number;
  intent: IntentView;
  /** Podpowiedź dla dziecka na tę turę (np. "Brainrot szykuje mocny cios — może tarcza?"), opcjonalnie. */
  tip?: string;
}

export type CardTurnChoice = { kind: 'play'; uid: string } | { kind: 'end' } | { kind: 'pause' };

export interface CardCollectionEntry {
  cardId: string;
  face: Omit<CardFace, 'uid' | 'playable'>;
  owned: number;
  inDeck: number;
  spare: number;
}

export interface MerchantOfferView {
  offerId: string;
  kind: 'threeForOne' | 'daily' | 'sell';
  /** Tekst oferty, np. "3 × Cios Plusika → losowa niezwykła karta". */
  text: string;
  /** Karta, której dotyczy oferta. */
  card: Omit<CardFace, 'uid' | 'playable'>;
  /** Czy dziecko może przyjąć ofertę (ma zapas / cyfry). */
  available: boolean;
  /** Dla 'daily': cena „złóż sumę”. */
  price?: { sum: number; count: number };
  /** Dla 'sell': ile cyfr za kartę. */
  digits?: number;
}

export type MerchantAction = { kind: 'accept'; offerId: string } | { kind: 'close' };

export interface EnemyHud {
  name: string;
  czar: number;
  maxCzar: number;
  phase?: number;
  phases?: number;
  vines?: number;
}

export type FloatKind = 'dmg' | 'crit' | 'block' | 'heal' | 'miss' | 'digit' | 'info';

export interface CelebrateRequest {
  kind: 'catch' | 'glam' | 'loot' | 'harvest' | 'levelup' | 'gate' | 'stage';
  title: string;
  subtitle?: string;
  /** Cyfry do pokazania (animacja „wpadają do skarbca”). */
  digits?: number[];
  items?: { name: string; description: string; rarity: Rarity | 'legendary' }[];
  /** Identyfikator postaci do portretu (np. 'glam:slimakorro', 'creature:plusik'). */
  portrait?: ModelId;
}

export interface GateUiRequest {
  target: number;
  /** Cyfry dostępne w skarbcu (po darze bramy). */
  inventory: Digits;
  ops: GateOp[];
  /** Działania jeszcze zablokowane (pokazane z kłódką i podpowiedzią, który stworek je da). */
  lockedOps: { op: GateOp; hint: string }[];
  /** Ile cyfr ma najsprytniejsze rozwiązanie (cel „gwiazdki”); null = nieznane. */
  minDigits: number | null;
  /** Ocena wyrażenia (podgląd na żywo i sprawdzenie). */
  evaluate(tokens: GateToken[]): GateScore;
  /** Czy pokazać „dar bramy” (lista cyfr dodanych przez bramę). */
  gift: number[];
}

export type GateUiResult = { tokens: GateToken[]; score: GateScore } | null;

export interface DigitPickRequest {
  title: string;
  subtitle: string;
  count: number;
  inventory: Digits;
  check(selected: number[]): { ok: boolean; message: string };
}

export interface CreatureCard {
  id: string;
  name: string;
  level: number;
  rarity: Rarity;
  description: string;
  /** Opis produkcji, np. "2 cyfry (1–5) co wyprawę". */
  productionText: string;
  /** Opis umiejętności w walce/bramie. */
  powerText: string;
  canFeed: boolean;
}

export type PenAction = { kind: 'feed'; creatureId: string } | { kind: 'close' };

export interface ItemCard {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity | 'legendary';
  level: number;
  maxLevel: number;
  description: string;
  equipped: boolean;
  /** Koszt ulepszenia (null = maks. poziom). */
  upgrade: { sum: number; count: number } | null;
}

export type ForgeAction = { kind: 'equip'; itemId: string } | { kind: 'upgrade'; itemId: string } | { kind: 'close' };

export interface GlamCard {
  enemyId: string;
  /** Imię brainglama, gdy odczarowany; null = jeszcze nie (pokazać sylwetkę „?”). */
  glamName: string | null;
  brainrotName: string;
  count: number;
  land: LandId;
}

export interface LandCard {
  id: LandId;
  name: string;
  subtitle: string;
  unlocked: boolean;
  bossDefeated: boolean;
}

export interface ParentViewModel {
  version: string;
  profileName: string;
  heatmapAdd: (number | null)[][];
  heatmapMul: (number | null)[][];
  weakest: { label: string; m: number; n: number }[];
  categories: { id: CategoryId; label: string; m: number; n: number; accuracy: number | null; medianMs: number | null }[];
  stats7: { tasks: number; correct: number; minutes: number; sessions: number };
  stats30: { tasks: number; correct: number; minutes: number; sessions: number };
  /** Skuteczność wg trybu (walka vs łapanie vs brama), GDD 18.2. */
  accuracyByMode: { mode: AttemptMode; label: string; tasks: number; accuracy: number | null }[];
  helpUsage: { helped: number; total: number };
  errorKinds: { kind: DistractorKind; label: string; count: number }[];
  settings: ParentSettings;
}

export interface ParentHandlers {
  onSettingsChange(s: ParentSettings): void;
  onExport(): void;
  onImport(file: File): Promise<{ ok: boolean; message: string }>;
  onReset(): Promise<void>;
}

export type PauseAction = 'resume' | 'base' | 'parent' | 'quality';

export interface UiApi {
  readonly root: HTMLElement;

  /** Źródło portretów (np. render.portrait). Bez niego UI rysuje zastępcze sylwetki. */
  setPortraitProvider(fn: (model: ModelId) => Promise<string>): void;

  // Globalne
  fade(to: 'black' | 'clear', ms?: number): Promise<void>;
  toast(text: string, kind?: 'info' | 'good' | 'warn'): void;
  loading(show: boolean, text?: string): void;
  setFpsVisible(visible: boolean, read?: () => { fps: number; renderScale: number; quality: QualityLevel }): void;

  // Ekrany startowe
  title(vm: { hasProgress: boolean; name: string }): Promise<'play' | 'parent'>;
  profileSetup(defaults: { name: string; color: string }): Promise<{ name: string; color: string }>;

  // HUD
  hud: {
    show(visible: boolean): void;
    setLocation(name: string): void;
    setDigits(total: number): void;
    setHp(hp: number, max: number): void;
    setEnemy(e: EnemyHud | null): void;
    /** Zapowiedź ruchu brainrota (nad paskiem Czaru), null = ukryj. */
    setIntent(intent: IntentView | null): void;
    /** Aktualna tarcza bohatera (0 = ukryj). */
    setShield(amount: number): void;
    floatText(at: ScreenPos, text: string, kind: FloatKind): void;
  };

  // Walka kartami i zadania
  /** Tura dziecka: ręka kart, energia, zapowiedź. Zwraca wybór (zagraj kartę / koniec tury / pauza). */
  cardTurn(view: CardTurnView): Promise<CardTurnChoice>;
  /** Schowaj rękę kart (np. w czasie tury brainrota). */
  hideCards(): void;
  /** Panel odpowiedzi na zadanie (walka, łapanie, karmienie, skrzynia, kalibracja). */
  answer(req: AnswerRequest): Promise<AnswerResult>;
  /** Podpowiedź po błędzie (≤ maxMs, do pominięcia). */
  hint(h: Hint, opts?: { maxMs?: number; title?: string }): Promise<{ watchedFully: boolean }>;

  // Dialogi
  say(opts: { speaker?: string; portrait?: ModelId; text: string; buttons?: string[] }): Promise<number>;
  celebrate(req: CelebrateRequest): Promise<void>;
  confirm(text: string, yes?: string, no?: string): Promise<boolean>;

  // Brama i kuźnia
  gate(req: GateUiRequest): Promise<GateUiResult>;
  pickDigits(req: DigitPickRequest): Promise<number[] | null>;

  // Panele bazy
  pen(cards: CreatureCard[]): Promise<PenAction>;
  treasury(digits: Digits): Promise<void>;
  forge(items: ItemCard[], digits: Digits): Promise<ForgeAction>;
  gallery(cards: GlamCard[]): Promise<void>;
  expeditions(lands: LandCard[]): Promise<LandId | null>;
  /** Stół z kartami: kolekcja i talia (tylko podgląd w MVP). */
  cards(entries: CardCollectionEntry[]): Promise<void>;
  /** Handlarz Kartonini: oferty wymiany. */
  merchant(offers: MerchantOfferView[], digits: Digits): Promise<MerchantAction>;

  // Pauza i rodzic
  pause(vm: { canReturnToBase: boolean; quality: QualityLevel | 'auto' }): Promise<PauseAction>;
  /** Blokada rodzica (przytrzymanie + działanie do wpisania). true = odblokowano. */
  parentLock(): Promise<boolean>;
  parentPanel(vm: ParentViewModel, handlers: ParentHandlers): Promise<void>;
  /** Przypomnienie o przerwie (GDD 18.3). */
  breakReminder(minutes: number): Promise<void>;
}

// ───────────────────────────── Platforma ─────────────────────────────

export type SfxName =
  | 'tap'
  | 'correct'
  | 'wrong'
  | 'hit'
  | 'crit'
  | 'block'
  | 'catch'
  | 'digit'
  | 'gate'
  | 'transform'
  | 'levelup'
  | 'whoosh'
  | 'heal'
  | 'chest'
  | 'step'
  | 'windup'
  | 'brainrot';

export type MusicTrack = 'none' | 'title' | 'base' | 'meadow' | 'dungeon' | 'boss';

export interface AudioApi {
  /** Wywołać w obsłudze pierwszego gestu (polityka autoodtwarzania). */
  unlock(): void;
  sfx(name: SfxName, opts?: { pitch?: number; volume?: number }): void;
  music(track: MusicTrack): void;
  setVolumes(music: number, sfx: number): void;
}

export interface StorageApi {
  load(): Promise<SaveV1 | null>;
  save(s: SaveV1): Promise<void>;
  /** Pobranie pliku JSON z zapisem (kopia zapasowa). */
  exportFile(s: SaveV1): void;
  importFile(file: File): Promise<SaveV1>;
  clear(): Promise<void>;
  requestPersist(): Promise<boolean>;
}

export interface PlatformApi {
  storage: StorageApi;
  audio: AudioApi;
  /** Pełny ekran + blokada orientacji poziomej (po geście użytkownika). */
  enterFullscreen(): Promise<void>;
  /** Blokada wygaszania ekranu w trakcie gry. */
  keepAwake(on: boolean): Promise<void>;
  /** Rejestracja service workera; callback gdy nowa wersja gotowa (pokazać w bazie, nie w trakcie sesji). */
  registerPwa(onUpdateReady: (apply: () => void) => void): void;
  /** Wersja aplikacji (z package.json przez Vite define lub stała). */
  version: string;
}
