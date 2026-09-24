/**
 * Harness deweloperski paneli UI (src/ui/panels): brama, wybór cyfr, panele bazy, karty, handlarz, rodzic.
 *   window.__demo('gate' | 'gate-error' | 'gate-valid' | 'digits' | 'pen' | 'treasury' | 'forge' | 'gallery'
 *                 | 'expeditions' | 'cards' | 'merchant' | 'parent-lock' | 'parent-progress'
 *                 | 'parent-settings' | 'parent-save')
 * Adres z #stanem (np. ui-panels.html#forge) otwiera dany stan od razu.
 */
import '../src/ui/theme.css';
import type {
  CardCollectionEntry,
  CardFace,
  CreatureCard,
  GlamCard,
  ItemCard,
  LandCard,
  MerchantOfferView,
  ModelId,
  ParentViewModel,
} from '../src/game/contracts';
import type { Digits, GateOp, GateScore, GateToken, ParentSettings } from '../src/core/types';
import { CARD_CSS } from '../src/ui/components/cardFace';
import type { UiContext } from '../src/ui/context';
import { ensureLayers } from '../src/ui/dom';
import { gatePanel } from '../src/ui/panels/gate';
import { pickDigitsPanel } from '../src/ui/panels/digitPicker';
import { expeditionsPanel, forgePanel, galleryPanel, penPanel, treasuryPanel } from '../src/ui/panels/base';
import { cardsPanel, merchantPanel } from '../src/ui/panels/cards';
import { parentLockPanel, parentPanelView } from '../src/ui/panels/parent';

// ───────────────────────────── kontekst UI ─────────────────────────────

const style = document.createElement('style');
style.textContent = CARD_CSS;
document.head.append(style);

const root = document.getElementById('ui') as HTMLElement;
const layers = ensureLayers(root);
const logEl = document.getElementById('dev-log') as HTMLElement;
const log = (s: string): void => {
  logEl.textContent = s;
  console.log('[ui-panels]', s);
};

/** Zastępczy portret: kostkowa postać w kolorze modelu (SVG data URL). */
function placeholderPortrait(model: ModelId): string {
  const [kind = '', id = ''] = model.split(':');
  const palette: Record<string, [string, string]> = {
    plusik: ['#7ed957', '#4a9f2e'],
    dopelniak: ['#ffb35c', '#c8742a'],
    blizniak: ['#6cc4ff', '#2f84c4'],
    koniczynek: ['#5fdc8c', '#2a9a55'],
    slimakorro: ['#c7e24a', '#7b8f1c'],
    trzmielini: ['#ffd23f', '#b98a00'],
    grzybello: ['#f2efe0', '#a89f7c'],
    kosiarrini: ['#8fcf4a', '#4f7f20'],
    kartonini: ['#d9a86c', '#8a5a2b'],
    vine: ['#6fcf5a', '#3a8a2a'],
  };
  let [body, dark] = palette[id] ?? ['#9fb3d9', '#5a6f99'];
  const glam = kind === 'glam';
  if (glam) {
    body = mix(body, '#ffd6f5', 0.55);
    dark = mix(dark, '#c86fb0', 0.5);
  }
  const eyes = `<rect x="44" y="52" width="12" height="14" fill="#1f2a44"/><rect x="72" y="52" width="12" height="14" fill="#1f2a44"/>` +
    `<rect x="46" y="54" width="5" height="5" fill="#fff"/><rect x="74" y="54" width="5" height="5" fill="#fff"/>`;
  let extra = '';
  if (kind === 'creature' && id === 'plusik')
    extra = `<rect x="38" y="6" width="10" height="30" fill="${dark}"/><rect x="28" y="16" width="30" height="10" fill="${dark}"/>` +
      `<rect x="80" y="6" width="10" height="30" fill="${dark}"/><rect x="70" y="16" width="30" height="10" fill="${dark}"/>`;
  if (glam)
    extra = `<path d="M40 30 L48 12 L56 26 L64 8 L72 26 L80 12 L88 30 Z" fill="#ffcf40" stroke="#b8860b" stroke-width="3"/>` +
      `<circle cx="30" cy="40" r="3" fill="#fff"/><circle cx="100" cy="60" r="4" fill="#fff"/><circle cx="96" cy="30" r="2.5" fill="#fff"/>`;
  if (kind === 'enemy')
    extra = `<rect x="26" y="20" width="16" height="16" fill="#b25cff"/><rect x="86" y="24" width="12" height="12" fill="#ff6b6b"/>`;
  if (kind === 'npc')
    extra = `<path d="M40 82 q12 -10 24 0 q12 -10 24 0 q-12 10 -24 2 q-12 8 -24 -2z" fill="#3b2a1a"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
    `<ellipse cx="64" cy="118" rx="36" ry="7" fill="#1f2a4433"/>` +
    `<rect x="30" y="30" width="68" height="62" rx="6" fill="${body}" stroke="${dark}" stroke-width="4"/>` +
    `<rect x="40" y="90" width="16" height="22" fill="${dark}"/><rect x="72" y="90" width="16" height="22" fill="${dark}"/>` +
    `<rect x="30" y="30" width="68" height="12" fill="#ffffff44"/>` +
    eyes +
    `<rect x="56" y="74" width="16" height="6" rx="3" fill="#1f2a44aa"/>` +
    extra +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function mix(a: string, b: string, t: number): string {
  const p = (s: string, i: number): number => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

const ctx: UiContext = {
  layers,
  portrait: async model => {
    await new Promise(r => setTimeout(r, 60));
    return placeholderPortrait(model);
  },
  sfx: name => console.debug('[sfx]', name),
};

// ───────────────────────────── brama: mały parser ─────────────────────────────

const INV_GATE: Digits = [1, 2, 2, 3, 2, 2, 2, 3, 2, 2]; // start 2× 1–9 + 1× 0, plus dar bramy 3 i 7
const GATE_OPS: GateOp[] = ['+', '×'];

function evaluateGate(tokens: GateToken[], target: number, inv: Digits, ops: GateOp[]): GateScore {
  const digitsUsed = tokens.flatMap(t => (t.t === 'd' ? [t.v] : []));
  const fail = (error: GateScore['error'], message: string, value: number | null = null): GateScore => ({
    valid: false,
    value,
    error,
    digitsUsed,
    smart: false,
    message,
  });
  const locked = tokens.find(t => t.t === 'op' && !ops.includes(t.v));
  const count = new Array<number>(10).fill(0);
  for (const d of digitsUsed) count[d] = (count[d] ?? 0) + 1;
  const left: number[] = [];
  const right: number[] = [];
  let op: GateOp | null = null;
  let nOps = 0;
  for (const t of tokens) {
    if (t.t === 'op') {
      nOps++;
      op ??= t.v;
    } else (nOps === 0 ? left : right).push(t.v);
  }
  const num = (ds: number[]): number => ds.reduce((a, d) => a * 10 + d, 0);
  let value: number | null = null;
  let perr: string | null = null;
  if (!tokens.length) perr = 'Ułóż działanie z kafelków.';
  else if (op === null) perr = 'Dodaj znak działania, np. +.';
  else if (nOps > 1) perr = 'Użyj tylko jednego znaku działania.';
  else if (!left.length || !right.length) perr = 'Po obu stronach znaku musi stać liczba.';
  else if (left.length > 2 || right.length > 2) perr = 'Liczby mogą mieć najwyżej 2 cyfry.';
  else if ((left.length === 2 && left[0] === 0) || (right.length === 2 && right[0] === 0)) perr = 'Liczba nie może zaczynać się od zera.';
  else {
    const a = num(left);
    const b = num(right);
    if (op === '+') value = a + b;
    else if (op === '×') value = a * b;
    else if (op === '−') value = a - b >= 0 ? a - b : null;
    else value = b !== 0 && a % b === 0 ? a / b : null;
    if (value === null) perr = 'To działanie nie wychodzi.';
  }
  if (locked && locked.t === 'op') return fail('opLocked', `Znak ${locked.v} jeszcze nie jest odblokowany.`, value);
  if (count.some((c, d) => c > (inv[d] ?? 0))) return fail('notEnoughDigits', 'Nie masz tylu cyfr w Skarbcu.', value);
  if (perr !== null || value === null) return fail('noOp', perr ?? '');
  if (value !== target) {
    const diff = Math.abs(target - value);
    return fail('wrongValue', `Twoje działanie daje ${value}. ${value < target ? `Brakuje ${diff}.` : `Za dużo o ${diff}.`}`, value);
  }
  const smart = digitsUsed.length === 2 || ((op === '×' || op === ':') && num(left) > 1 && num(right) > 1);
  return { valid: true, value, error: null, digitsUsed, smart, message: smart ? 'Brama otwarta! Sprytnie!' : 'Brama otwarta!' };
}

// ───────────────────────────── dane testowe ─────────────────────────────

const DIGITS: Digits = [1, 4, 3, 5, 2, 3, 2, 1, 2, 1];

const CREATURES: CreatureCard[] = [
  { id: 'plusik', name: 'Plusik', level: 2, rarity: 'common', description: 'Zielony zajączek z uszami jak plusy.', productionText: '3 cyfry (1–5) co wyprawę', powerText: 'Karta „Cios Plusika” i znak + w bramie', canFeed: true },
  { id: 'dopelniak', name: 'Dopełniak', level: 1, rarity: 'common', description: 'Ślimak, który wie, ile brakuje do 10.', productionText: '1 para do 10 co wyprawę', powerText: 'Karta „Tarcza Dopełniaka”, obrona +20%', canFeed: false },
  { id: 'blizniak', name: 'Bliźniak', level: 1, rarity: 'uncommon', description: 'Dwa ptaszki, które wszystko robią podwójnie.', productionText: '1 para bliźniaków co wyprawę', powerText: 'Karta „Podwójny dziób” i znak × w bramie', canFeed: true },
  { id: 'koniczynek', name: 'Koniczynek', level: 3, rarity: 'rare', description: 'Świecąca koniczynka, która przynosi szczęście.', productionText: '1 cyfra (6–9) i 0 co wyprawę', powerText: 'Karta „Koniczynowa tarcza”, tarcza na 1 cios', canFeed: false },
];

const ITEMS: ItemCard[] = [
  { id: 'drewniany-miecz', name: 'Drewniany Miecz', slot: 'weapon', rarity: 'common', level: 1, maxLevel: 3, description: 'Zwykły miecz na start.', equipped: false, upgrade: { sum: 12, count: 2 } },
  { id: 'miecz-slonecznika', name: 'Miecz Słonecznika', slot: 'weapon', rarity: 'uncommon', level: 2, maxLevel: 3, description: 'Atak +3. Więcej czasu przy atakach.', equipped: true, upgrade: { sum: 15, count: 3 } },
  { id: 'kamizelka-z-lisci', name: 'Kamizelka z Liści', slot: 'armor', rarity: 'common', level: 1, maxLevel: 3, description: 'Lekka i zielona.', equipped: false, upgrade: { sum: 10, count: 2 } },
  { id: 'pancerz-liczydlo', name: 'Pancerz Liczydło', slot: 'armor', rarity: 'rare', level: 1, maxLevel: 3, description: 'HP +20. Oś liczbowa raz na walkę.', equipped: true, upgrade: { sum: 20, count: 3 } },
  { id: 'siatka-z-trawy', name: 'Siatka z Trawy', slot: 'net', rarity: 'common', level: 1, maxLevel: 3, description: 'Do łapania stworków.', equipped: false, upgrade: { sum: 8, count: 2 } },
  { id: 'siec-pajecza', name: 'Sieć Pajęcza', slot: 'net', rarity: 'uncommon', level: 3, maxLevel: 3, description: '+1 próba przy łapaniu.', equipped: true, upgrade: null },
  { id: 'amulet-drugiej-szansy', name: 'Amulet Drugiej Szansy', slot: 'amulet', rarity: 'legendary', level: 1, maxLevel: 3, description: 'Poprawka raz na walkę.', equipped: true, upgrade: { sum: 27, count: 3 } },
];

const GLAMS: GlamCard[] = [
  { enemyId: 'slimakorro', glamName: 'Ślimakella Glamella', brainrotName: 'Ślimakorro Buciorro', count: 3, land: 'meadow' },
  { enemyId: 'trzmielini', glamName: 'Trzmielina Brokatina', brainrotName: 'Trzmielini Tostini', count: 1, land: 'meadow' },
  { enemyId: 'grzybello', glamName: null, brainrotName: 'Grzybello Kalafiorello', count: 0, land: 'meadow' },
  { enemyId: 'kosiarrini', glamName: null, brainrotName: 'Kosiarrini Chwastorrini', count: 0, land: 'meadow' },
];

const LANDS: LandCard[] = [
  { id: 'meadow', name: 'Łąka', subtitle: 'Dodawanie', unlocked: true, bossDefeated: false },
  { id: 'cave', name: 'Jaskinia', subtitle: 'Odejmowanie', unlocked: false, bossDefeated: false },
  { id: 'volcano', name: 'Wulkan', subtitle: 'Przekraczanie 10', unlocked: false, bossDefeated: false },
  { id: 'castle', name: 'Zamek', subtitle: 'Mnożenie', unlocked: false, bossDefeated: false },
  { id: 'ice', name: 'Lodowa Kraina', subtitle: 'Dzielenie', unlocked: false, bossDefeated: false },
];

type Face = Omit<CardFace, 'uid' | 'playable'>;
const F: Record<string, Face> = {
  cios: { cardId: 'cios-plusika', name: 'Cios Plusika', kind: 'attack', cost: 1, powerText: '8', description: 'Zdejmij 8 Czaru.', rarity: 'common', art: 'creature:plusik' },
  liscie: { cardId: 'tarcza-z-lisci', name: 'Tarcza z liści', kind: 'shield', cost: 1, powerText: '8', description: 'Tarcza 8 na turę brainrota.', rarity: 'common', art: 'prop:vine' },
  dopel: { cardId: 'tarcza-dopelniaka', name: 'Tarcza Dopełniaka', kind: 'shield', cost: 1, powerText: '12', description: 'Tarcza 12.', rarity: 'common', art: 'creature:dopelniak' },
  dziob: { cardId: 'podwojny-dziob', name: 'Podwójny dziób', kind: 'strongAttack', cost: 2, powerText: '20', description: 'Zdejmij 20 Czaru.', rarity: 'uncommon', art: 'creature:blizniak' },
  konicz: { cardId: 'koniczynowa-tarcza', name: 'Koniczynowa tarcza', kind: 'bigShield', cost: 1, powerText: '22', description: 'Wielka tarcza 22.', rarity: 'rare', art: 'creature:koniczynek' },
  kokarda: { cardId: 'lepka-kokarda', name: 'Lepka kokarda', kind: 'weaken', cost: 1, powerText: '−50%', description: 'Następny ruch brainrota o połowę słabszy.', rarity: 'uncommon', art: 'glam:slimakorro' },
  roj: { cardId: 'brokatowy-roj', name: 'Brokatowy rój', kind: 'multiHit', cost: 1, powerText: '3×4', description: 'Trzy ciosy po 4 Czaru.', rarity: 'uncommon', art: 'glam:trzmielini' },
  zdroj: { cardId: 'perlowy-zdroj', name: 'Perłowy zdrój', kind: 'heal', cost: 1, powerText: '+15', description: 'Ulecz 15 HP.', rarity: 'uncommon', art: 'glam:grzybello' },
  bukiet: { cardId: 'krolewski-bukiet', name: 'Królewski bukiet', kind: 'combo', cost: 2, powerText: '14+10', description: '14 Czaru i 10 tarczy.', rarity: 'legendary', art: 'glam:kosiarrini' },
};
const face = (k: string): Face => {
  const f = F[k];
  if (!f) throw new Error(k);
  return f;
};

const ENTRIES: CardCollectionEntry[] = [
  { cardId: 'cios-plusika', face: face('cios'), owned: 6, inDeck: 3, spare: 3 },
  { cardId: 'tarcza-z-lisci', face: face('liscie'), owned: 3, inDeck: 3, spare: 0 },
  { cardId: 'tarcza-dopelniaka', face: face('dopel'), owned: 2, inDeck: 2, spare: 0 },
  { cardId: 'podwojny-dziob', face: face('dziob'), owned: 2, inDeck: 2, spare: 0 },
  { cardId: 'koniczynowa-tarcza', face: face('konicz'), owned: 1, inDeck: 1, spare: 0 },
  { cardId: 'lepka-kokarda', face: face('kokarda'), owned: 4, inDeck: 3, spare: 1 },
  { cardId: 'brokatowy-roj', face: face('roj'), owned: 1, inDeck: 1, spare: 0 },
  { cardId: 'perlowy-zdroj', face: face('zdroj'), owned: 0, inDeck: 0, spare: 0 },
  { cardId: 'krolewski-bukiet', face: face('bukiet'), owned: 0, inDeck: 0, spare: 0 },
];

const OFFERS: MerchantOfferView[] = [
  { offerId: 'o1', kind: 'threeForOne', text: '3 × Cios Plusika → losowa niezwykła karta', card: face('cios'), available: true },
  { offerId: 'o2', kind: 'threeForOne', text: '3 × Lepka kokarda → losowa rzadka karta', card: face('kokarda'), available: false },
  { offerId: 'o3', kind: 'daily', text: 'Perłowy zdrój — leczy 15 HP', card: face('zdroj'), available: true, price: { sum: 15, count: 3 } },
  { offerId: 'o4', kind: 'sell', text: 'Sprzedaj 1 × Cios Plusika', card: face('cios'), available: true, digits: 2 },
  { offerId: 'o5', kind: 'sell', text: 'Sprzedaj 1 × Lepka kokarda', card: face('kokarda'), available: true, digits: 3 },
];

const SETTINGS: ParentSettings = {
  range: 20,
  ops: { add: true, sub: true, mul: true, div: true },
  combatOps: 'themed',
  crossTenOnMeadow: true,
  timeLimit: { mode: 'none', fixedSec: { add: 10, sub: 10, mul: 12, div: 15 } },
  breakReminderMin: 0,
  quality: 'auto',
  audio: { music: 0.6, sfx: 0.8 },
  showFps: false,
};

function heat(fn: (a: number, b: number) => number | null): (number | null)[][] {
  return Array.from({ length: 10 }, (_, i) => Array.from({ length: 10 }, (_, j) => fn(i + 1, j + 1)));
}
// deterministyczny „szum”
const noise = (a: number, b: number): number => ((Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1 + 1) % 1;

const PARENT_VM: ParentViewModel = {
  version: '0.1.0',
  profileName: 'Staś',
  heatmapAdd: heat((a, b) => {
    if (a + b > 18 && noise(a, b) > 0.4) return null;
    const cross = a + b > 10 && a < 10 && b < 10;
    const base = a + b <= 10 ? 0.86 : cross ? 0.42 : 0.7;
    return Math.max(0, Math.min(1, base + (noise(a, b) - 0.5) * 0.4));
  }),
  heatmapMul: heat((a, b) => {
    const easy = a === 1 || b === 1 || a === 2 || b === 2 || a === 5 || b === 5 || a === 10 || b === 10;
    if (!easy && noise(b, a) > 0.45) return null;
    const base = easy ? 0.8 : 0.35;
    return Math.max(0, Math.min(1, base + (noise(a, b) - 0.5) * 0.45));
  }),
  weakest: [
    { label: '8 + 7', m: 0.21, n: 9 },
    { label: '7 × 8', m: 0.24, n: 5 },
    { label: '9 + 6', m: 0.31, n: 11 },
    { label: '15 − 8', m: 0.33, n: 7 },
    { label: '6 × 7', m: 0.38, n: 4 },
    { label: '6 + □ = 10', m: 0.44, n: 12 },
    { label: '13 − 5', m: 0.47, n: 6 },
    { label: '8 + 5', m: 0.5, n: 10 },
    { label: '4 × 6', m: 0.52, n: 3 },
    { label: '7 + 7', m: 0.55, n: 8 },
  ],
  categories: [
    { id: 'add.within10', label: 'Dodawanie do 10', m: 0.91, n: 164, accuracy: 0.94, medianMs: 2400 },
    { id: 'add.complement10', label: 'Dopełnianie do 10', m: 0.72, n: 88, accuracy: 0.81, medianMs: 3300 },
    { id: 'add.doubles', label: 'Podwajanie', m: 0.78, n: 71, accuracy: 0.85, medianMs: 2900 },
    { id: 'add.within20', label: 'Dodawanie do 20 bez przekroczenia', m: 0.69, n: 96, accuracy: 0.8, medianMs: 3800 },
    { id: 'add.cross10', label: 'Dodawanie z przekroczeniem 10', m: 0.41, n: 74, accuracy: 0.58, medianMs: 6200 },
    { id: 'add.three', label: 'Trzy składniki', m: 0.55, n: 31, accuracy: 0.68, medianMs: 7100 },
    { id: 'sub.within10', label: 'Odejmowanie do 10', m: 0.83, n: 57, accuracy: 0.88, medianMs: 3100 },
    { id: 'sub.cross10', label: 'Odejmowanie z przekroczeniem 10', m: 0.36, n: 22, accuracy: 0.55, medianMs: 7900 },
    { id: 'mul.t2', label: 'Mnożenie ×2', m: 0.8, n: 40, accuracy: 0.9, medianMs: 2800 },
    { id: 'mul.t5', label: 'Mnożenie ×5', m: 0.74, n: 35, accuracy: 0.83, medianMs: 3500 },
    { id: 'mul.t7', label: 'Mnożenie ×7', m: 0.29, n: 12, accuracy: 0.5, medianMs: 9400 },
    { id: 'div.by2', label: 'Dzielenie przez 2', m: 0.62, n: 9, accuracy: 0.78, medianMs: 4600 },
    { id: 'div.by9', label: 'Dzielenie przez 9', m: 0.5, n: 0, accuracy: null, medianMs: null },
  ],
  stats7: { tasks: 214, correct: 168, minutes: 96, sessions: 6 },
  stats30: { tasks: 802, correct: 611, minutes: 355, sessions: 22 },
  accuracyByMode: [
    { mode: 'combat', label: 'Walka kartami', tasks: 512, accuracy: 0.72 },
    { mode: 'catch', label: 'Łapanie stworków', tasks: 148, accuracy: 0.83 },
    { mode: 'gate', label: 'Brama', tasks: 21, accuracy: 0.9 },
    { mode: 'feed', label: 'Karmienie', tasks: 66, accuracy: 0.86 },
    { mode: 'chest', label: 'Skrzynie', tasks: 35, accuracy: 0.8 },
    { mode: 'calibration', label: 'Próba Plusika', tasks: 20, accuracy: 0.7 },
  ],
  helpUsage: { helped: 23, total: 802 },
  errorKinds: [
    { kind: 'offByOne', label: 'Pomyłka o 1', count: 41 },
    { kind: 'tableNeighbor', label: 'Sąsiedni wynik z tabliczki', count: 14 },
    { kind: 'offByTen', label: 'Pomyłka o 10', count: 12 },
    { kind: 'lostCarry', label: 'Zgubione przeniesienie', count: 9 },
    { kind: 'wrongOp', label: 'Złe działanie', count: 6 },
    { kind: 'offByTwo', label: 'Pomyłka o 2', count: 5 },
    { kind: 'swappedDigits', label: 'Przestawione cyfry', count: 3 },
  ],
  settings: SETTINGS,
};

// ───────────────────────────── symulacja dotyku ─────────────────────────────

function tapEl(el: Element | null | undefined): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
}
const q = (sel: string): Element | null => document.querySelector(sel);
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function tapGateTiles(seq: string[]): Promise<void> {
  for (const s of seq) {
    const sel = /\d/.test(s) ? `.gate-digits [data-digit="${s}"]` : `.gate-ops [data-op="${s}"]`;
    tapEl(q(sel));
    await sleep(40);
  }
}

// ───────────────────────────── stany ─────────────────────────────

/** Otwarty panel: wynik (Promise panelu) + opcjonalny skrypt przygotowania (symulowane dotknięcia). */
interface Demo {
  result: Promise<unknown>;
  setup?: Promise<void>;
}
const demo = (result: Promise<unknown>, script?: () => Promise<void>): Demo => ({ result, setup: script ? script() : undefined });

const PICK_REQ = {
  title: 'Ulepsz Miecz Słonecznika',
  subtitle: 'Złóż 15 z 3 cyfr',
  count: 3,
  inventory: DIGITS,
  check: (sel: number[]) => {
    const s = sel.reduce((a, b) => a + b, 0);
    return s === 15 ? { ok: true, message: 'Super! Miecz ulepszony.' } : { ok: false, message: `Twoje cyfry dają ${s}. ${s < 15 ? `Brakuje ${15 - s}.` : `Za dużo o ${s - 15}.`}` };
  },
};

const STATES: Record<string, () => Demo> = {
  gate: () => openGate([]),
  'gate-error': () => openGate(['4', '0', '+', '8'], true),
  'gate-valid': () => openGate(['6', '×', '9'], true),
  'gate-nogift': () => openGate(['5', '4'], false, false),
  digits: () =>
    demo(pickDigitsPanel(ctx, PICK_REQ), async () => {
      await sleep(400);
      tapEl(q('.dp-tray [data-digit="9"]'));
      await sleep(60);
      tapEl(q('.dp-tray [data-digit="3"]'));
      await sleep(400);
    }),
  'digits-error': () =>
    demo(pickDigitsPanel(ctx, PICK_REQ), async () => {
      await sleep(400);
      for (const d of ['9', '3', '1']) {
        tapEl(q(`.dp-tray [data-digit="${d}"]`));
        await sleep(60);
      }
      await sleep(300);
      tapEl(q('.dp-ok'));
      await sleep(400);
    }),
  pen: () => demo(penPanel(ctx, CREATURES)),
  'pen-one': () => demo(penPanel(ctx, CREATURES.slice(0, 1))),
  treasury: () => demo(treasuryPanel(ctx, DIGITS)),
  forge: () => demo(forgePanel(ctx, ITEMS, DIGITS)),
  gallery: () => demo(galleryPanel(ctx, GLAMS)),
  expeditions: () => demo(expeditionsPanel(ctx, LANDS)),
  'expeditions-locked-tap': () =>
    demo(expeditionsPanel(ctx, LANDS), async () => {
      await sleep(300);
      tapEl(q('.ex-card.is-locked'));
      await sleep(200);
    }),
  cards: () => demo(cardsPanel(ctx, ENTRIES)),
  'cards-zoom': () =>
    demo(cardsPanel(ctx, ENTRIES), async () => {
      await sleep(400);
      tapEl(q('.cc-cell[data-card-id="lepka-kokarda"] .card'));
      await sleep(300);
    }),
  merchant: () => demo(merchantPanel(ctx, OFFERS, DIGITS)),
  'parent-lock': () =>
    demo(parentLockPanel(ctx), async () => {
      await sleep(300);
      const btn = q('.pl-hold');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const o = { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      btn.dispatchEvent(new PointerEvent('pointerdown', o));
      await sleep(450); // w trakcie przytrzymania (zrzut ~1,25 s z 2 s)
    }),
  'parent-lock-math': () =>
    demo(parentLockPanel(ctx), async () => {
      await sleep(300);
      const btn = q('.pl-hold');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const o = { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      btn.dispatchEvent(new PointerEvent('pointerdown', o));
      await sleep(2200);
      btn.dispatchEvent(new PointerEvent('pointerup', o));
      await sleep(400);
      for (const k of ['3', '9']) {
        tapEl(q(`.pl-key[data-key="${k}"]`));
        await sleep(50);
      }
    }),
  'parent-progress': () => openParent('progress'),
  'parent-progress-bottom': () =>
    openParent('progress', async () => {
      const c = q('.pp-content');
      if (c) c.scrollTop = c.scrollHeight;
      const cell = q('.pp-heat [data-a="7"][data-b="8"]');
      if (cell) cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5 }));
      await sleep(100);
    }),
  'parent-progress-mid': () =>
    openParent('progress', async () => {
      const cell = q('.pp-heat [data-a="7"][data-b="8"]');
      if (cell) cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5 }));
      const c = q('.pp-content');
      if (c) c.scrollTop = 520;
      await sleep(100);
    }),
  'parent-settings': () => openParent('settings'),
  'parent-settings-bottom': () =>
    openParent('settings', async () => {
      const c = q('.pp-content');
      if (c) c.scrollTop = c.scrollHeight;
      await sleep(100);
    }),
  'parent-settings-fixed': () =>
    openParent('settings', async () => {
      tapEl(q('[data-seg="timeLimit.mode"] [data-val="fixed"]'));
      await sleep(200);
    }),
  'parent-save': () => openParent('save'),
  'parent-save-reset': () =>
    openParent('save', async () => {
      tapEl(q('.ps-reset'));
      await sleep(200);
    }),
  'parent-info': () => openParent('info'),
};

function openGate(seq: string[], check = false, gift = true): Demo {
  const result = gatePanel(ctx, {
    target: 54,
    inventory: INV_GATE,
    ops: GATE_OPS,
    lockedOps: [
      { op: '−', hint: 'Znak − da ci Minusiak z Jaskini.' },
      { op: ':', hint: 'Znak : da ci Dzielnik z Lodowej Krainy.' },
    ],
    minDigits: 2,
    evaluate: tokens => evaluateGate(tokens, 54, INV_GATE, GATE_OPS),
    gift: gift ? [3, 7] : [],
  });
  return demo(result, async () => {
    if (seq.length) {
      await sleep(check ? 120 : 300);
      await tapGateTiles(seq);
    }
    if (check) {
      await sleep(60);
      tapEl(q('.gate-check'));
      await sleep(seq.includes('×') ? 0 : 300);
    } else if (!seq.length) await sleep(gift ? 2400 : 300); // dar bramy doleciał
  });
}

function openParent(tab: string, more?: () => Promise<void>): Demo {
  const result = parentPanelView(ctx, PARENT_VM, {
    onSettingsChange: s => log(`ustawienia: ${JSON.stringify(s)}`),
    onExport: () => log('eksport'),
    onImport: async f => {
      await sleep(300);
      return f.name.endsWith('.json') ? { ok: true, message: `Wczytano zapis z pliku ${f.name}.` } : { ok: false, message: 'To nie jest plik zapisu.' };
    },
    onReset: async () => {
      await sleep(300);
      log('reset');
    },
  });
  return demo(result, async () => {
    await sleep(250);
    tapEl(q(`.pp-tab[data-tab="${tab}"]`));
    await sleep(150);
    if (more) await more();
  });
}

async function run(state: string, ready: () => void): Promise<void> {
  const fn = STATES[state];
  if (!fn) {
    log(`nieznany stan: ${state}`);
    ready();
    return;
  }
  log(`stan: ${state}`);
  try {
    const d = fn();
    await (d.setup ?? sleep(300));
    ready();
    const result = await d.result;
    log(`${state} → ${JSON.stringify(result)}`);
  } catch (e) {
    ready();
    log(`${state} → błąd: ${String(e)}`);
    console.error(e);
  }
}

// ───────────────────────────── start ─────────────────────────────

if (new URLSearchParams(location.search).has('shot')) document.body.classList.add('shot');
const select = document.getElementById('dev-state') as HTMLSelectElement;
for (const name of Object.keys(STATES)) select.append(new Option(name, name));
const initial = location.hash.slice(1);
select.value = initial || 'gate';
select.addEventListener('change', () => {
  location.hash = select.value;
  location.reload();
});

declare global {
  interface Window {
    /** Otwiera stan; Promise rozwiązuje się, gdy skrypt przygotowania skończył (do zrzutów ekranu). */
    __demo?: (state: string) => Promise<void>;
  }
}
window.__demo = state =>
  new Promise<void>(resolve => {
    document.body.classList.add('shot');
    for (const l of Object.values(layers)) l.replaceChildren();
    void run(state, resolve);
  });
// Ręczne oglądanie: stan z adresu (#stan) albo 'gate'. Zrzuty ekranu: ?shot bez #stanu, potem __demo(stan).
if (initial || !document.body.classList.contains('shot')) void run(initial || 'gate', () => undefined);
