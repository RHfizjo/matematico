/**
 * Harness deweloperski: sterowanie dotykiem (src/input) + platforma (src/platform).
 *   window.__demo(state):
 *     'explore'   — gałka spoczynkowa + przycisk akcji „Złap” + pauza (bohater stoi przy Plusiku)
 *     'drag'      — jak explore + symulowany palec na gałce (wektor w górę-prawo)
 *     'ui'        — tryb UI: całe sterowanie ukryte, ruch = 0
 *     'noaction'  — explore bez przycisku akcji
 *     'action:<ikona>' — np. 'action:open' (etykieta z listy poniżej)
 *     'lab'       — laboratorium dźwięku: wszystkie efekty i utwory renderowane offline (fale + poziomy)
 *     'storage'   — automatyczny test zapisu w prawdziwej IndexedDB (kopie, uszkodzenie, odczyt kopii)
 *     'layout'    — zwraca wymiary elementów sterowania (do sprawdzania rozmiarów)
 *   ?state=<nazwa> — stan startowy.
 */
import '../src/ui/theme.css';
import type { ActionIcon, MusicTrack, SfxName } from '../src/game/contracts';
import type { SaveV1 } from '../src/core/types';
import { ACTION_EMOJI, ACTION_SVG, createInput } from '../src/input';
import { createPlatform } from '../src/platform';
import { measure, renderMusicOffline, renderSfxOffline } from '../src/platform/audio';

const uiRoot = document.getElementById('ui')!;
const dev = document.getElementById('dev')!;
const lab = document.getElementById('lab')!;

// ───────────────────────────── HUD (prawdziwy, jeśli się da) ─────────────────────────────

async function mountHud(): Promise<void> {
  try {
    const { createUi } = await import('../src/ui');
    const ui = createUi(uiRoot);
    ui.hud.show(true);
    ui.hud.setLocation('Łąka');
    ui.hud.setDigits(27);
  } catch (e) {
    console.warn('HUD niedostępny — pomijam.', e);
  }
}

// ───────────────────────────── Wejście ─────────────────────────────

const input = createInput(uiRoot);

const ACTION_LABELS: Record<ActionIcon, string> = {
  catch: 'Złap',
  open: 'Otwórz',
  enter: 'Wejdź',
  talk: 'Handluj',
  feed: 'Nakarm',
  forge: 'Kuźnia',
  treasury: 'Skarbiec',
  gallery: 'Galeria',
  map: 'Wyprawy',
  portal: 'Portal',
  gate: 'Brama',
};

// ───────────────────────────── Platforma (zapis na atrapie, audio prawdziwe) ─────────────────────────────

type Fake = { version: 1; n: number; note: string };
const serialize = (s: SaveV1): string => JSON.stringify(s);
const deserialize = (json: string): SaveV1 => {
  const o = JSON.parse(json) as Partial<Fake>;
  if (o.version !== 1 || typeof o.n !== 'number') throw new Error('Zły format zapisu');
  return o as unknown as SaveV1;
};
const platform = createPlatform({ serialize, deserialize, key: 'matematico-dev-input' });
const audio = platform.audio;

// ───────────────────────────── Scena: bohater chodzi wg getMove() ─────────────────────────────

const heroEl = document.getElementById('hero')!;
const plusikEl = document.getElementById('plusik')!;
const hero = { x: 0.52 * innerWidth, y: 0.64 * innerHeight };
const PLUSIK = (): { x: number; y: number } => ({ x: 0.63 * innerWidth, y: 0.66 * innerHeight });
let autoAction = true;
let stepAcc = 0;

function inRange(): boolean {
  const p = PLUSIK();
  return Math.hypot((hero.x - p.x) / 120, (hero.y - p.y) / 55) < 1.15;
}

let last = performance.now();
function frame(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const m = input.getMove();
  hero.x = Math.min(innerWidth - 40, Math.max(40, hero.x + m.x * 300 * dt));
  hero.y = Math.min(innerHeight - 10, Math.max(0.3 * innerHeight, hero.y - m.y * 220 * dt));
  heroEl.style.left = `${hero.x}px`;
  heroEl.style.top = `${hero.y}px`;
  const speed = Math.hypot(m.x, m.y);
  if (speed > 0.05) {
    stepAcc += dt * (2 + speed * 4);
    if (stepAcc > 1) {
      stepAcc = 0;
      audio.sfx('step', { volume: 0.7 });
    }
  }
  if (autoAction) input.setAction(inRange() ? { icon: 'catch', label: 'Złap' } : null);
  drawVector(m);
  requestAnimationFrame(frame);
}

// ───────────────────────────── Panel deweloperski ─────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { cls, ...rest } = props;
  if (cls) e.className = cls;
  Object.assign(e, rest);
  e.append(...kids);
  return e;
}
function btn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { cls, type: 'button' }, label);
  b.addEventListener('click', () => {
    audio.unlock();
    fn();
  });
  return b;
}

const vecCanvas = el('canvas', { width: 96, height: 96 });
const vecText = el('div', { cls: 'vec' }, 'x 0.00  y 0.00');
const logEl = el('div', { cls: 'log' });
const logLines: string[] = [];
function log(s: string): void {
  const time = new Date().toLocaleTimeString('pl-PL', { hour12: false });
  logLines.unshift(`${time}  ${s}`);
  logLines.length = Math.min(logLines.length, 6);
  logEl.textContent = logLines.join('\n');
}

function drawVector(m: { x: number; y: number }): void {
  const c = vecCanvas.getContext('2d');
  if (!c) return;
  const w = vecCanvas.width;
  const r = w / 2 - 8;
  c.clearRect(0, 0, w, w);
  c.strokeStyle = 'rgba(31,42,68,.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(w / 2, w / 2, r, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(w / 2, w / 2, r * 0.15, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = '#1e78c8';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(w / 2, w / 2);
  c.lineTo(w / 2 + m.x * r, w / 2 - m.y * r);
  c.stroke();
  c.fillStyle = '#3fa7ff';
  c.beginPath();
  c.arc(w / 2 + m.x * r, w / 2 - m.y * r, 7, 0, Math.PI * 2);
  c.fill();
  const f = (v: number): string => (v < 0 ? '−' : ' ') + Math.abs(v).toFixed(2);
  vecText.textContent = `x ${f(m.x)}  y ${f(m.y)}\n|v| ${Math.hypot(m.x, m.y).toFixed(2)}`;
}

const SFX_NAMES: SfxName[] = ['tap', 'correct', 'wrong', 'hit', 'crit', 'block', 'catch', 'digit', 'gate', 'transform', 'levelup', 'whoosh', 'heal', 'chest', 'step', 'windup', 'brainrot'];
const TRACKS: MusicTrack[] = ['none', 'title', 'base', 'meadow', 'dungeon', 'boss'];
const TRACK_PL: Record<MusicTrack, string> = { none: 'cisza', title: 'tytuł', base: 'baza', meadow: 'łąka', dungeon: 'loch', boss: 'boss' };

const musicBtns = TRACKS.map(t =>
  btn(TRACK_PL[t], () => {
    audio.music(t);
    musicBtns.forEach((b, i) => b.classList.toggle('on', TRACKS[i] === t));
    log(`Muzyka: ${TRACK_PL[t]}`);
  }),
);
musicBtns[0]?.classList.add('on');

function slider(label: string, value: number, on: (v: number) => void): HTMLLabelElement {
  const i = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(value) });
  i.style.width = '110px';
  i.addEventListener('input', () => on(Number(i.value)));
  return el('label', {}, label, ' ', i);
}
const volumes = { music: 0.5, sfx: 0.8 };

const modeBtns: Record<string, HTMLButtonElement> = {};
function stateBtn(name: string, label: string): HTMLButtonElement {
  const b = btn(label, () => void demo(name));
  modeBtns[name] = b;
  return b;
}

const emojiStrip = el(
  'div',
  { cls: 'emoji-strip' },
  ...(Object.keys(ACTION_EMOJI) as ActionIcon[]).map(k => {
    const svg = ACTION_SVG[k];
    const ic = el('i', { style: 'font-style:normal;display:block;width:30px;height:30px;line-height:30px' } as Partial<HTMLElement>);
    if (svg) ic.innerHTML = svg;
    else ic.textContent = ACTION_EMOJI[k];
    const s = el('span', { title: k }, ic, el('small', {}, k));
    s.style.cursor = 'pointer';
    s.addEventListener('click', () => void demo(`action:${k}`));
    return s;
  }),
);

dev.append(
  el('h3', {}, `Sterowanie · v${platform.version}`),
  el('div', { cls: 'row' }, stateBtn('explore', 'eksploracja'), stateBtn('drag', 'palec na gałce'), stateBtn('noaction', 'bez akcji'), stateBtn('ui', 'tryb UI'), btn('pełny ekran', () => void platform.enterFullscreen()), btn('nie gaś ekranu', () => void platform.keepAwake(true).then(() => log('Wake Lock: poproszono')))),
  el('div', { cls: 'readout', style: 'margin-top:6px' } as Partial<HTMLDivElement>, vecCanvas, el('div', {}, vecText, logEl)),
  el('h3', {}, 'Ikony akcji (dotknij)'),
  emojiStrip,
  el('h3', {}, 'Efekty dźwiękowe'),
  el('div', { cls: 'row' }, ...SFX_NAMES.map(n => btn(n, () => audio.sfx(n)))),
  el('h3', {}, 'Muzyka'),
  el('div', { cls: 'row' }, ...musicBtns),
  el(
    'div',
    { cls: 'row', style: 'margin-top:4px; gap: 12px' } as Partial<HTMLDivElement>,
    slider('muzyka', volumes.music, v => {
      volumes.music = v;
      audio.setVolumes(volumes.music, volumes.sfx);
    }),
    slider('efekty', volumes.sfx, v => {
      volumes.sfx = v;
      audio.setVolumes(volumes.music, volumes.sfx);
    }),
  ),
  el('h3', {}, 'Laboratorium i zapis'),
  el('div', { cls: 'row' }, stateBtn('lab', 'fale dźwięków (offline)'), stateBtn('storage', 'test zapisu (IndexedDB)'), btn('eksport pliku', () => platform.storage.exportFile({ version: 1, n: 7, note: 'dev' } as unknown as SaveV1))),
);
(dev.querySelector('.readout > div') as HTMLElement).style.whiteSpace = 'pre';
vecText.style.whiteSpace = 'pre';

/** Zdarzenia do testów automatycznych (Playwright). */
const events: string[] = [];
(window as unknown as { __input: typeof input; __events: string[] }).__input = input;
(window as unknown as { __events: string[] }).__events = events;
(window as unknown as { __audio: typeof audio }).__audio = audio;
input.onAction(() => events.push('action'));
input.onPause(() => events.push('pause'));
input.onAnswerKey(i => events.push(`answer:${i}`));

input.onAction(() => {
  log('Akcja! (onAction)');
  audio.sfx('catch');
  plusikEl.animate([{ transform: 'translate(-50%, -100%)' }, { transform: 'translate(-50%, -140%)' }, { transform: 'translate(-50%, -100%)' }], { duration: 380, easing: 'ease-out' });
});
input.onPause(() => {
  log('Pauza (onPause)');
  audio.sfx('tap');
});
input.onAnswerKey(i => log(`Klawisz odpowiedzi → indeks ${i}`));

// ───────────────────────────── Laboratorium dźwięku ─────────────────────────────

function drawWave(canvas: HTMLCanvasElement, buf: AudioBuffer, color: string): void {
  const w = (canvas.width = 300);
  const hgt = (canvas.height = 54);
  const c = canvas.getContext('2d');
  if (!c) return;
  const all = buf.getChannelData(0);
  // przycięcie do słyszalnej części (+10%), żeby krótkie efekty były czytelne
  const audible = Math.min(all.length, Math.max(Math.floor(buf.sampleRate * 0.25), Math.floor(measure(buf).audibleS * buf.sampleRate * 1.1)));
  const d = all.subarray(0, audible);
  c.fillStyle = '#f4f8ff';
  c.fillRect(0, 0, w, hgt);
  c.strokeStyle = 'rgba(31,42,68,.2)';
  c.beginPath();
  c.moveTo(0, hgt / 2);
  c.lineTo(w, hgt / 2);
  c.stroke();
  c.fillStyle = color;
  const step = Math.max(1, Math.floor(d.length / w));
  for (let x = 0; x < w; x++) {
    let mn = 0;
    let mx = 0;
    for (let i = x * step; i < Math.min(d.length, (x + 1) * step); i++) {
      const v = d[i] ?? 0;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    c.fillRect(x, hgt / 2 - mx * (hgt / 2), 1, Math.max(1, (mx - mn) * (hgt / 2)));
  }
}

async function runLab(): Promise<{ name: string; peakDb: number; rmsDb: number; len: number; ok: boolean }[]> {
  lab.innerHTML = '';
  lab.classList.add('show');
  const grid = el('div', { cls: 'grid' });
  lab.append(el('h2', {}, 'Laboratorium dźwięku — efekty i muzyka renderowane offline (poziomy jak na żywo, efekty 0.8, muzyka 0.5)'), grid);
  const rows: { name: string; peakDb: number; rmsDb: number; len: number; ok: boolean }[] = [];
  const items: { name: string; render: () => Promise<AudioBuffer | null>; color: string; music?: boolean }[] = [
    ...SFX_NAMES.map(n => ({ name: n, render: () => renderSfxOffline(n, { seconds: n === 'transform' ? 3 : 2.2 }), color: '#3fa7ff' })),
    ...(['title', 'base', 'meadow', 'dungeon', 'boss'] as const).map(t => ({ name: `muzyka: ${TRACK_PL[t]}`, render: () => renderMusicOffline(t, { bars: 4 }), color: '#b25cff', music: true })),
  ];
  for (const it of items) {
    const cell = el('div', { cls: 'cell' });
    const cv = el('canvas');
    grid.append(cell);
    const buf = await it.render();
    if (!buf) {
      cell.append(el('b', {}, it.name), el('div', { cls: 'm' }, 'OfflineAudioContext niedostępny'));
      continue;
    }
    const m = measure(buf);
    // Kryteria: bez przesteru, słyszalne; efekty krótkie (≤ 2,5 s), muzyka wyraźnie ciszej niż efekty.
    const ok = m.peak < 0.99 && m.peak > (it.music ? 0.04 : 0.05) && (it.music || m.audibleS < 2.6);
    rows.push({ name: it.name, peakDb: +m.peakDb.toFixed(1), rmsDb: +m.rmsDb.toFixed(1), len: +m.audibleS.toFixed(2), ok });
    if (!ok) cell.classList.add('bad');
    cell.append(el('b', {}, it.name), el('div', { cls: 'm' }, `szczyt ${m.peakDb.toFixed(1)} dB · RMS ${m.rmsDb.toFixed(1)} dB · ${m.audibleS.toFixed(2)} s`), cv);
    drawWave(cv, buf, it.color);
  }
  return rows;
}

// ───────────────────────────── Test zapisu w prawdziwej IndexedDB ─────────────────────────────

async function storageTest(): Promise<string[]> {
  const st = platform.storage;
  const out: string[] = [];
  const mk = (n: number): SaveV1 => ({ version: 1, n, note: 'dev' }) as unknown as SaveV1;
  const n = (s: SaveV1 | null): number | null => (s ? (s as unknown as Fake).n : null);
  await st.clear();
  out.push(`pusty odczyt: ${String(await st.load())}`);
  // równoległe zapisy (bez await) — wygrywa ostatni
  await Promise.all([st.save(mk(1)), st.save(mk(2)), st.save(mk(3))]);
  out.push(`po 3 równoległych: ${n(await st.load())}`);
  await st.save(mk(4));
  await st.save(mk(5));
  const { set } = await import('idb-keyval');
  await set(st.keys.main, '{"version":1,"n":'); // uszkodzenie
  const fresh = (await import('../src/platform/storage')).createStorage({ serialize, deserialize, key: 'matematico-dev-input' });
  out.push(`uszkodzony główny → kopia: ${n(await fresh.load())} (oczekiwane 4)`);
  await fresh.save(mk(6));
  out.push(`po zapisie 6: ${n(await fresh.load())}`);
  out.push(`trwałość (persist): ${await st.requestPersist()}`);
  for (const l of out) log(l);
  return out;
}

// ───────────────────────────── Stany demo ─────────────────────────────

function layout(): Record<string, { x: number; y: number; w: number; h: number }> {
  const q = (sel: string): { x: number; y: number; w: number; h: number } => {
    const r = uiRoot.querySelector(sel)?.getBoundingClientRect();
    return r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : { x: -1, y: -1, w: 0, h: 0 };
  };
  return { pause: q('.in-pause'), action: q('.in-action'), label: q('.in-action-label'), stick: q('.in-stick'), knob: q('.in-stick-knob'), zone: q('.in-zone') };
}

function simulateDrag(): void {
  const zone = uiRoot.querySelector<HTMLElement>('.in-zone');
  if (!zone) return;
  const opts = (x: number, y: number): PointerEventInit => ({ pointerId: 41, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 });
  zone.dispatchEvent(new PointerEvent('pointerdown', opts(250, 650)));
  zone.dispatchEvent(new PointerEvent('pointermove', opts(290, 628)));
  zone.dispatchEvent(new PointerEvent('pointermove', opts(302, 604)));
}

async function demo(state: string): Promise<unknown> {
  lab.classList.remove('show');
  Object.entries(modeBtns).forEach(([k, b]) => b.classList.toggle('on', k === state));
  autoAction = false;
  if (state === 'ui') {
    input.setMode('ui');
    log('setMode("ui") — sterowanie ukryte');
    return layout();
  }
  if (state === 'lab') return runLab();
  if (state === 'storage') return storageTest();
  if (state === 'layout') return layout();

  input.setMode('explore');
  hero.x = 0.56 * innerWidth;
  hero.y = 0.68 * innerHeight;
  if (state === 'explore' || state === 'drag') {
    autoAction = state === 'explore';
    input.setAction({ icon: 'catch', label: 'Złap' });
  } else if (state === 'noaction') {
    input.setAction(null);
    hero.x = 0.3 * innerWidth;
  } else if (state.startsWith('action:')) {
    const icon = state.slice(7) as ActionIcon;
    input.setAction({ icon, label: ACTION_LABELS[icon] ?? icon });
  }
  if (state === 'drag') simulateDrag();
  log(`stan: ${state}`);
  return layout();
}

declare global {
  interface Window {
    __demo: (state: string) => Promise<unknown>;
  }
}
window.__demo = demo;

void mountHud();
requestAnimationFrame(frame);
const initial = new URLSearchParams(location.search).get('state') ?? 'explore';
void demo(initial);
