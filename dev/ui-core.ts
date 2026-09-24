/**
 * Harness deweloperski rdzenia UI (src/ui): wszystkie ekrany na fałszywych danych.
 *   window.__demo(state) — 'title' | 'profile' | 'hud' | 'hud-boss' | 'cards' | 'answer' | 'answer-missing' | 'answer-typed'
 *     | 'answer-limit' | 'answer-os' | 'answer-retry' | 'answer-correct' | 'answer-wrong' | 'hint-line' | 'hint-blocks'
 *     | 'hint-tens' | 'hint-minus' | 'say' | 'say-typing' | 'celebrate' | 'celebrate-loot' | 'pause' | 'toast' | 'loading'
 *     | 'confirm' | 'break' | 'fade'
 *   window.__overflow() — lista elementów UI wystających poza okno.
 *   ?state=<nazwa> — stan startowy; ?fake — zastępcze portrety (bez WebGL).
 */
import type { AnswerRequest, CardFace, CardTurnView, ModelId } from '../src/game/contracts';
import type { Hint, Task } from '../src/core/types';
import { createUi, type UiApiExt } from '../src/ui';

// ───────────────────────────── Portrety ─────────────────────────────

const FAKE_COLORS: Record<string, [string, string]> = {
  plusik: ['#7ddc6a', '#3f9e33'],
  dopelniak: ['#ffd27a', '#c98a2c'],
  blizniak: ['#8fd3ff', '#3a8fd0'],
  trzmielini: ['#ffe066', '#d9a400'],
  grzybello: ['#f7e7ff', '#b98ad6'],
  slimakorro: ['#ffb3c7', '#d0607f'],
  kosiarrini: ['#9be07a', '#4c9a33'],
};

function fakePortrait(model: ModelId): Promise<string> {
  const id = model.split(':')[1] ?? model;
  const [a, b] = FAKE_COLORS[id] ?? ['#c9d6ff', '#7b8fd6'];
  const glam = model.startsWith('glam:');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="22" y="30" width="56" height="56" rx="10" fill="${a}" stroke="#1f2a44" stroke-width="4"/>
    <rect x="22" y="70" width="56" height="16" rx="6" fill="${b}"/>
    <rect x="36" y="46" width="8" height="12" rx="2" fill="#1f2a44"/><rect x="56" y="46" width="8" height="12" rx="2" fill="#1f2a44"/>
    <path d="M40 64 Q50 72 60 64" fill="none" stroke="#1f2a44" stroke-width="4" stroke-linecap="round"/>
    ${glam ? '<path d="M34 30 L40 16 L50 26 L60 16 L66 30 Z" fill="#ffd23f" stroke="#1f2a44" stroke-width="3"/>' : '<rect x="30" y="14" width="10" height="18" rx="4" fill="' + a + '" stroke="#1f2a44" stroke-width="3"/><rect x="60" y="14" width="10" height="18" rx="4" fill="' + a + '" stroke="#1f2a44" stroke-width="3"/>'}
  </svg>`;
  return new Promise(r => setTimeout(() => r(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`), 60));
}

/**
 * Prawdziwe portrety z render/ — renderowane RAZ na starcie, potem kontekst WebGL jest zwalniany.
 * (SwiftShader w headless Chromie wstrzymuje start animacji CSS, gdy w tle działa readPixels.)
 */
const PORTRAIT_IDS: ModelId[] = [
  'creature:plusik', 'creature:dopelniak', 'creature:blizniak', 'glam:trzmielini', 'glam:kosiarrini',
  'glam:grzybello', 'npc:kartonini',
];
async function realPortraits(): Promise<((m: ModelId) => Promise<string>) | null> {
  try {
    const THREE = await import('three');
    const { PortraitRenderer } = await import('../src/render/portrait');
    const { createModelFactory } = await import('../src/render/models');
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    const pr = new PortraitRenderer(renderer, createModelFactory());
    const cache = new Map<string, string>();
    for (const id of PORTRAIT_IDS) cache.set(id, await pr.portrait(id, 256));
    renderer.dispose();
    renderer.forceContextLoss();
    return m => {
      const hit = cache.get(m);
      return hit ? Promise.resolve(hit) : fakePortrait(m);
    };
  } catch (e) {
    console.warn('Portrety 3D niedostępne — zastępcze.', e);
    return null;
  }
}

// ───────────────────────────── Dane ─────────────────────────────

const CARDS: CardFace[] = [
  { uid: 'c1', cardId: 'cios-plusika', name: 'Cios Plusika', kind: 'attack', cost: 1, powerText: '8', description: 'Zdejmij 8 Czaru.', rarity: 'common', art: 'creature:plusik', playable: true },
  { uid: 'c2', cardId: 'tarcza-dopelniaka', name: 'Tarcza Dopełniaka', kind: 'shield', cost: 1, powerText: '12', description: 'Tarcza 12 na ruch brainrota.', rarity: 'common', art: 'creature:dopelniak', playable: true },
  { uid: 'c3', cardId: 'podwojny-dziob', name: 'Podwójny dziób', kind: 'strongAttack', cost: 2, powerText: '20', description: 'Zdejmij 20 Czaru.', rarity: 'uncommon', art: 'creature:blizniak', playable: false },
  { uid: 'c4', cardId: 'brokatowy-roj', name: 'Brokatowy rój', kind: 'multiHit', cost: 1, powerText: '3×4', description: '3 ciosy po 4 Czaru.', rarity: 'uncommon', art: 'glam:trzmielini', playable: true },
];
const EXTRA_CARD: CardFace = { uid: 'c5', cardId: 'krolewski-bukiet', name: 'Królewski bukiet', kind: 'combo', cost: 2, powerText: '14', description: '14 Czaru i 10 tarczy.', rarity: 'legendary', art: 'glam:kosiarrini', playable: false };

function task(p: Partial<Task> & Pick<Task, 'text' | 'answer'>): Task {
  return {
    id: `t${Math.random().toString(36).slice(2, 7)}`,
    factId: null,
    categoryId: 'add.within20',
    categories: ['add.within20'],
    format: 'choice',
    op: 'add',
    operands: [],
    options: [],
    distractorKinds: {},
    ...p,
  };
}

const T_ADD = task({ text: '8 + 7 = ?', answer: 15, options: [14, 15, 5, 16], operands: [8, 7], factId: 'add:8+7', categoryId: 'add.cross10', categories: ['add.cross10'] });
const T_MISSING = task({ text: '6 + □ = 10', answer: 4, options: [3, 4, 16, 5], format: 'missing', operands: [6, 10], factId: 'cmp10:6', categoryId: 'add.complement10', categories: ['add.complement10'] });
const T_TYPED = task({ text: '7 × 8 = ?', answer: 56, format: 'typed', op: 'mul', operands: [7, 8], factId: 'mul:7x8', categoryId: 'mul.t7', categories: ['mul.t7', 'mul.t8'] });
const T_SUB = task({ text: '15 − 8 = ?', answer: 7, options: [6, 7, 8, 13], op: 'sub', operands: [15, 8], factId: 'sub:15-8', categoryId: 'sub.cross10', categories: ['sub.cross10'] });
const T_THREE = task({ text: '4 + 6 + 3 = ?', answer: 13, options: [12, 13, 14], operands: [4, 6, 3], categoryId: 'add.three', categories: ['add.three'] });

const H_MAKE10: Hint = {
  strategy: 'make10',
  title: 'Dopełnij do 10!',
  steps: ['8 + 2 = 10', '10 + 5 = 15'],
  summary: '8 + 7 = 8 + 2 + 5 = 15',
  numberLine: { from: 8, jumps: [2, 5] },
  firstStep: '8 + 2 = 10. Z liczby 7 zostaje jeszcze 5.',
};
const H_PAIRS: Hint = {
  strategy: 'pairs10',
  title: 'Pary do 10!',
  steps: ['6 i 4 to para do 10', '6 + 4 = 10'],
  summary: '6 + 4 = 10',
  numberLine: { from: 6, jumps: [4] },
  firstStep: 'Zacznij od 6 i dolicz do 10.',
};
const H_SIX: Hint = {
  strategy: 'sixTrick',
  title: 'Pięć razy i jeszcze raz!',
  steps: ['5 × 7 = 35', '35 + 7 = 42'],
  summary: '6 × 7 = 5 × 7 + 7 = 42',
  blocks: { rows: 6, cols: 7, highlightRows: 5 },
  firstStep: '5 × 7 = 35, a potem dodaj jeszcze jedną siódemkę.',
};
const H_DOUBLE: Hint = {
  strategy: 'doubleDouble',
  title: 'Podwajaj!',
  steps: ['4 × 7 = 28', '28 + 28 = 56'],
  summary: '8 × 7 = 28 + 28 = 56',
  blocks: { rows: 8, cols: 7, highlightRows: 4 },
  firstStep: '4 × 7 = 28, a 8 to dwa razy 4.',
};
const H_DOWN10: Hint = {
  strategy: 'down10',
  title: 'Zejdź do 10!',
  steps: ['15 − 5 = 10', '10 − 3 = 7'],
  summary: '15 − 8 = 15 − 5 − 3 = 7',
  numberLine: { from: 15, jumps: [-5, -3] },
  firstStep: '15 − 5 = 10, a trzeba odjąć jeszcze 3.',
};
const H_TENS: Hint = {
  strategy: 'tens',
  title: 'Dziesiątki i jedności!',
  steps: ['30 + 20 = 50', '4 + 5 = 9', '50 + 9 = 59'],
  summary: '34 + 25 = 30 + 20 + 4 + 5 = 59',
  numberLine: { from: 34, jumps: [20, 5] },
  firstStep: 'Najpierw dziesiątki: 30 + 20 = 50.',
};
const H_THREE: Hint = {
  strategy: 'make10',
  title: 'Dopełnij do 10!',
  steps: ['4 + 6 = 10', '10 + 3 = 13'],
  summary: '4 + 6 + 3 = 10 + 3 = 13',
  numberLine: { from: 4, jumps: [6, 3] },
  firstStep: 'Szukaj pary do 10 — 4 + 6 = 10, a potem dodaj jeszcze 3.',
};

const CARD_VIEW: CardTurnView = {
  hand: CARDS,
  energy: 1,
  maxEnergy: 2,
  drawCount: 5,
  discardCount: 3,
  shield: 12,
  intent: { text: 'Mocny cios 22', kind: 'strong', total: 22 },
  tip: 'Brainrot szykuje mocny cios — może tarcza?',
};

// ───────────────────────────── Harness ─────────────────────────────

const rootEl = document.getElementById('ui') as HTMLElement;
let ui: UiApiExt;
let portraitFn: ((m: ModelId) => Promise<string>) | null = null;
const params = new URLSearchParams(location.search);
const portraitsReady = (params.has('fake') ? Promise.resolve(null) : realPortraits()).then(fn => {
  portraitFn = fn ?? fakePortrait;
});

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const log = (label: string, v: unknown): void => {
  console.log(`[ui-core] ${label}:`, JSON.stringify(v));
  (window as unknown as { __last: unknown }).__last = { label, v };
};

/** Symulowane dotknięcie (pointerdown + pointerup) — do scenariuszy w zrzutach. */
function tap(sel: string | Element | null): void {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, pointerId: 7, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'touch' };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
}

let demoTimer: ReturnType<typeof setInterval> | null = null;

function fresh(combat = false): UiApiExt {
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
  rootEl.textContent = '';
  rootEl.className = '';
  document.body.classList.toggle('combat', combat);
  ui = createUi(rootEl);
  ui.setSfx(n => console.debug('[sfx]', n));
  if (portraitFn) ui.setPortraitProvider(portraitFn);
  return ui;
}

function combatHud(u: UiApiExt, opts?: { boss?: boolean }): void {
  u.hud.show(true);
  u.hud.setLocation('Nora pod Starym Dębem');
  u.hud.setDigits(27);
  u.hud.setHp(72, 100);
  if (opts?.boss) {
    u.hud.setEnemy({ name: 'Kosiarrini Chwastorrini', czar: 64, maxCzar: 120, phase: 2, phases: 3, vines: 2 });
    u.hud.setIntent({ text: '2 × cios 6', kind: 'multi', total: 12 });
  } else {
    u.hud.setEnemy({ name: 'Grzybello Kalafiorello', czar: 26, maxCzar: 40 });
    u.hud.setIntent({ text: 'Mocny cios 22', kind: 'strong', total: 22 });
  }
  u.hud.setShield(12);
}

function answerReq(p: Partial<AnswerRequest>): AnswerRequest {
  return { task: T_ADD, kind: 'card', title: 'Cios Plusika!', limitMs: null, numberLineUses: 0, retryAvailable: false, hint: H_MAKE10, ...p };
}

const STATES: Record<string, () => Promise<unknown> | void> = {
  title: () => {
    const u = fresh();
    void u.title({ hasProgress: true, name: 'Ola' }).then(v => log('title', v));
  },
  'title-new': () => {
    const u = fresh();
    void u.title({ hasProgress: false, name: '' }).then(v => log('title', v));
  },
  profile: () => {
    const u = fresh();
    void u.profileSetup({ name: 'Ola', color: '#3fa7ff' }).then(v => log('profile', v));
  },
  hud: () => {
    const u = fresh(true);
    combatHud(u);
    u.setFpsVisible(true, () => ({ fps: 59.7, renderScale: 0.85, quality: 'medium' }));
    let czar = 26;
    const kinds = [
      ['8', 'dmg', 0.62, 0.46],
      ['12', 'crit', 0.7, 0.36],
      ['10', 'block', 0.36, 0.42],
      ['+15', 'heal', 0.3, 0.52],
      ['pudło', 'miss', 0.76, 0.56],
      ['+3', 'digit', 0.5, 0.3],
    ] as const;
    const spawn = (): void => {
      for (const [t, k, fx, fy] of kinds) u.hud.floatText({ x: innerWidth * fx, y: innerHeight * fy, visible: true }, t, k);
      czar = czar <= 8 ? 26 : czar - 6;
      u.hud.setEnemy({ name: 'Grzybello Kalafiorello', czar, maxCzar: 40 });
    };
    spawn();
    demoTimer = setInterval(spawn, 1100);
  },
  floats: () => {
    const u = fresh(true);
    combatHud(u);
    const kinds = [
      ['8', 'dmg', 0.64, 0.44],
      ['12', 'crit', 0.7, 0.36],
      ['10', 'block', 0.36, 0.4],
      ['+15', 'heal', 0.3, 0.5],
      ['pudło', 'miss', 0.74, 0.55],
      ['+3', 'digit', 0.5, 0.3],
    ] as const;
    const spawn = (): void => {
      for (const [t, k, fx, fy] of kinds) u.hud.floatText({ x: innerWidth * fx, y: innerHeight * fy, visible: true }, t, k);
    };
    spawn();
    demoTimer = setInterval(spawn, 1000);
  },
  'hud-explore': () => {
    const u = fresh();
    u.hud.show(true);
    u.hud.setLocation('Łąka');
    u.hud.setDigits(12);
    u.hud.setHp(100, 100);
  },
  'hud-boss': () => {
    const u = fresh(true);
    combatHud(u, { boss: true });
  },
  cards: () => {
    const u = fresh(true);
    combatHud(u);
    void u.cardTurn(CARD_VIEW).then(v => log('cardTurn', v));
  },
  'cards-5': () => {
    const u = fresh(true);
    combatHud(u);
    void u.cardTurn({ ...CARD_VIEW, hand: [...CARDS, EXTRA_CARD], energy: 0, tip: undefined }).then(v => log('cardTurn', v));
  },
  'cards-play': async () => {
    const u = fresh(true);
    combatHud(u);
    const choice = u.cardTurn({ ...CARD_VIEW, energy: 2, hand: CARDS.map(c => ({ ...c, playable: true })) });
    await sleep(700);
    tap('.ct-slot:nth-child(1)');
    log('cardTurn', await choice);
    const res = u.answer(answerReq({ card: CARDS[0] }));
    void res.then(r => log('answer', r));
  },
  answer: () => {
    const u = fresh(true);
    combatHud(u);
    void u.cardTurn(CARD_VIEW);
    void u.answer(answerReq({ card: CARDS[0], numberLineUses: 1 })).then(r => log('answer', r));
  },
  'answer-missing': () => {
    const u = fresh(true);
    void u.answer(answerReq({ task: T_MISSING, kind: 'catch', title: 'Złap Dopełniaka — 1/3', hint: H_PAIRS, numberLineUses: 2, retryAvailable: true })).then(r => log('answer', r));
  },
  'answer-typed': () => {
    const u = fresh();
    void u.answer(answerReq({ task: T_TYPED, kind: 'chest', title: 'Otwórz skrzynię!', hint: H_DOUBLE, numberLineUses: 1 })).then(r => log('answer', r));
  },
  'answer-typed-input': async () => {
    const u = fresh();
    void u.answer(answerReq({ task: T_TYPED, kind: 'feed', title: 'Nakarm Bliźniaka', hint: H_DOUBLE })).then(r => log('answer', r));
    await sleep(500);
    tap('.key-5');
    tap('.key-6');
  },
  'answer-limit': () => {
    const u = fresh(true);
    combatHud(u);
    void u.cardTurn(CARD_VIEW);
    void u.answer(answerReq({ task: T_SUB, card: CARDS[1], title: 'Tarcza Dopełniaka!', hint: H_DOWN10, limitMs: 8000, numberLineUses: 1 })).then(r => log('answer', r));
  },
  'answer-three': () => {
    const u = fresh();
    void u.answer(answerReq({ task: T_THREE, kind: 'calibration', title: 'Próba Plusika 5/20', hint: H_THREE })).then(r => log('answer', r));
  },
  'answer-os': async () => {
    const u = fresh(true);
    combatHud(u);
    void u.cardTurn(CARD_VIEW);
    void u.answer(answerReq({ card: CARDS[0], numberLineUses: 1 })).then(r => log('answer', r));
    await sleep(500);
    tap('.ans-os');
  },
  'answer-os-blocks': async () => {
    const u = fresh();
    void u.answer(answerReq({ task: task({ text: '6 × 7 = ?', answer: 42, options: [36, 42, 48, 35], op: 'mul' }), kind: 'card', title: 'Podwójny dziób!', card: CARDS[2], hint: H_SIX, numberLineUses: 1 })).then(r => log('answer', r));
    await sleep(500);
    tap('.ans-os');
  },
  'answer-retry': async () => {
    const u = fresh();
    void u.answer(answerReq({ task: T_MISSING, kind: 'catch', title: 'Złap Dopełniaka — 2/3', hint: H_PAIRS, retryAvailable: true, numberLineUses: 1 })).then(r => log('answer', r));
    await sleep(500);
    tap('.ans-opt:nth-child(1)');
  },
  'answer-correct': async () => {
    const u = fresh(true);
    combatHud(u);
    void u.cardTurn(CARD_VIEW);
    void u.answer(answerReq({ card: CARDS[0] })).then(r => log('answer', r));
    setTimeout(() => tap('.ans-opt:nth-child(2)'), 600);
  },
  'answer-wrong': async () => {
    const u = fresh();
    void u.answer(answerReq({ card: CARDS[0] })).then(r => log('answer', r));
    setTimeout(() => tap('.ans-opt:nth-child(3)'), 800);
  },
  'hint-line': () => {
    const u = fresh();
    void u.hint(H_MAKE10, { maxMs: 6000, title: 'Prawie! Zobacz, jak to policzyć' }).then(r => log('hint', r));
  },
  'hint-blocks': () => {
    const u = fresh();
    void u.hint(H_SIX, { maxMs: 6000 }).then(r => log('hint', r));
  },
  'hint-tens': () => {
    const u = fresh();
    void u.hint(H_TENS, { maxMs: 6000 }).then(r => log('hint', r));
  },
  'hint-minus': () => {
    const u = fresh();
    void u.hint(H_DOWN10, { maxMs: 6000 }).then(r => log('hint', r));
  },
  say: async () => {
    const u = fresh();
    void u
      .say({ speaker: 'Plusik', portrait: 'creature:plusik', text: 'Cześć! Jestem Plusik. Pomożesz mi odczarować brainroty? Każde dobre liczenie zdejmuje z nich trochę Czaru!', buttons: ['Później', 'Jasne!'] })
      .then(v => log('say', v));
    await sleep(600);
    tap('.say-bubble');
  },
  'say-typing': () => {
    const u = fresh();
    void u.say({ speaker: 'Handlarz Kartonini', portrait: 'npc:kartonini', text: 'Witaj, mały liczmistrzu! Masz trzy takie same karty? Wymienię je na coś rzadszego!' }).then(v => log('say', v));
  },
  celebrate: () => {
    const u = fresh();
    void u
      .celebrate({
        kind: 'glam',
        title: 'Grzybella Perłella',
        subtitle: 'Grzybello Kalafiorello jest znowu miły!',
        digits: [3, 7, 0],
        items: [{ name: 'Perłowy zdrój', description: 'Nowa karta: +15 serduszek', rarity: 'uncommon' }],
        portrait: 'glam:grzybello',
      })
      .then(() => log('celebrate', 'done'));
  },
  'celebrate-loot': () => {
    const u = fresh();
    void u
      .celebrate({
        kind: 'loot',
        title: 'Skrzynia otwarta!',
        digits: [2, 5, 9, 1, 0],
        items: [
          { name: 'Złota Sieć', description: '+1 próba i OŚ przy łapaniu', rarity: 'legendary' },
          { name: 'Miecz Słonecznika', description: 'Atak +3 · CZAS +2 s', rarity: 'rare' },
        ],
      })
      .then(() => log('celebrate', 'done'));
  },
  pause: () => {
    const u = fresh(true);
    combatHud(u);
    void u.cardTurn(CARD_VIEW);
    const loop = (q: 'auto' | 'low' | 'medium' | 'high'): void => {
      void u.pause({ canReturnToBase: true, quality: q }).then(a => {
        log('pause', a);
        if (a === 'quality') loop(q === 'auto' ? 'low' : q === 'low' ? 'medium' : q === 'medium' ? 'high' : 'auto');
      });
    };
    loop('auto');
  },
  toast: () => {
    const u = fresh(true);
    combatHud(u);
    const burst = (): void => {
      u.toast('Zapisano grę', 'good');
      setTimeout(() => u.toast('Nowa karta w talii: Brokatowy rój!', 'info'), 150);
      setTimeout(() => u.toast('Za mało cyfr na ulepszenie', 'warn'), 300);
    };
    burst();
    demoTimer = setInterval(burst, 2400);
  },
  loading: async () => {
    const u = fresh();
    await u.fade('black', 200);
    u.loading(true, 'Budujemy Łąkę…');
  },
  confirm: () => {
    const u = fresh();
    void u.confirm('Wrócić do bazy? Brainrot poczeka na ciebie.', 'Tak, wracam', 'Zostaję').then(v => log('confirm', v));
  },
  break: () => {
    const u = fresh();
    void u.breakReminder(20).then(() => log('break', 'ok'));
  },
  fade: async () => {
    const u = fresh();
    await u.fade('black', 300);
    await sleep(300);
    await u.fade('clear', 300);
    u.toast('Fade działa', 'good');
  },
};

async function demo(state: string): Promise<void> {
  await portraitsReady;
  const fn = STATES[state];
  if (!fn) {
    console.warn(`Nieznany stan: ${state}. Dostępne: ${Object.keys(STATES).join(', ')}`);
    return;
  }
  await fn();
  await sleep(700);
}

/** Elementy UI wystające poza okno (dla testu 1280×800). */
function overflow(): string[] {
  const out: string[] = [];
  const W = innerWidth;
  const H = innerHeight;
  rootEl.querySelectorAll<HTMLElement>('*').forEach(el => {
    if (el.closest('.cel-rays, .cel-confetti, .hud-floats, .sparkles, .ct-slot.is-flying, .ui-fade')) return;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) {
      out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  });
  return out;
}

Object.assign(window, { __demo: demo, __overflow: overflow, __tap: tap, __ui: () => ui });

// Pasek wyboru stanu (ukryty w zrzutach automatycznych).
if (!navigator.webdriver) {
  const bar = document.getElementById('devbar');
  if (bar) {
    const sel = document.createElement('select');
    for (const k of Object.keys(STATES)) sel.append(new Option(k, k));
    sel.addEventListener('change', () => void demo(sel.value));
    bar.append(sel);
  }
}

void demo(params.get('state') ?? 'title');
