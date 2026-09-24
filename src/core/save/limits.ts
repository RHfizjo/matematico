/** Granice wartości w zapisie — wspólne dla migracji (przycinanie) i walidacji. */
export const SAVE_LIMITS = {
  /** Ring buffer historii prób (GDD 19). */
  history: 2000,
  /** Maks. liczba zapamiętanych sesji (ok. roku grania). */
  sessions: 1000,
  nameMaxLength: 24,
  /** Maks. liczba sztuk jednej cyfry w skarbcu. */
  digitMax: 9999,
  maxStage: 4,
  creatureMaxLevel: 3,
  itemMaxLevel: 3,
  bossPhaseMax: 10,
  /** Pudełka Leitnera 0..5 (GDD 6.4). */
  boxMax: 5,
  /** SkillModel.window — okno regulatora. */
  window: 8,
  /** SkillModel.recent — reguły „nie powtarzaj”. */
  recent: 6,
  retries: 50,
  /** CategoryState.recentMs. */
  recentMs: 30,
  last2: 2,
  /** Limit stały w sekundach (tryb 'fixed'). */
  fixedSecMin: 3,
  fixedSecMax: 60,
  /** Maks. liczba kopii jednej karty w kolekcji. */
  cardMax: 99,
  /**
   * Minimalna liczba kopii karty startowej: handlarz zabiera tylko zapas ponad 3 kopie w talii
   * (GDD 9.5a), więc poprawna gra nigdy nie schodzi poniżej — a bez tych kart nie da się walczyć.
   */
  starterCardMin: 3,
  /** Pnącza bossa (faza 2) zachowane w przerwanej walce. */
  vinesMax: 10,
  /** HP bohatera przenoszone między pokojami dungeonu. */
  heroHpMax: 999,
  /** Długość identyfikatorów tekstowych (pokoje, skrzynie). */
  idMaxLength: 100,
} as const;
