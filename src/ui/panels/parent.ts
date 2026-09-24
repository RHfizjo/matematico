/**
 * Panel rodzica (GDD 18): blokada (przytrzymanie + działanie do wpisania) i panel z zakładkami
 * Postępy / Ustawienia / Zapis / Informacje. Teksty dla dorosłych — gęściej, ale wciąż pod palec.
 */
import type { ParentHandlers, ParentViewModel } from '../../game/contracts';
import type { NumberRange, Op, ParentSettings, QualityPreset, TimeLimitMode } from '../../core/types';
import type { UiContext } from '../context';
import { button, h, onTap } from '../dom';
import { listen, lockIcon, once, openShell, scroller, svg } from './shell';
import { heatColor, heatInk, lockProblem, pct, plural, secs } from './util';
import './parent.css';

const HOLD_MS = 2000;

// ───────────────────────────── Blokada rodzica ─────────────────────────────

export function parentLockPanel(ctx: UiContext): Promise<boolean> {
  const done = once<boolean>();
  const shell = openShell(ctx, {
    theme: 'parent',
    title: 'Dla rodzica',
    icon: '🔒',
    size: 'dialog',
    layer: 'dialog',
    onClose: () => finish(false),
  });
  shell.sheet.classList.add('pl-sheet');
  shell.body.classList.add('pl-body');

  let raf = 0;
  let holdTimer = 0;
  let holdStart = 0;
  let problem = lockProblem();
  let typed = '';

  const finish = (v: boolean): void => {
    if (done.done) return;
    done.resolve(v);
    void shell.close();
  };
  shell.onDispose(() => {
    cancelAnimationFrame(raf);
    window.clearTimeout(holdTimer);
  });

  showHold();
  return done.promise;

  // Etap 1: przytrzymaj 2 s
  function showHold(): void {
    const R = 84;
    const C = 2 * Math.PI * R;
    const ring = svg(
      `<svg class="pl-ring" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="${R}" class="pl-ring-bg"/>` +
        `<circle cx="100" cy="100" r="${R}" class="pl-ring-fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" transform="rotate(-90 100 100)"/></svg>`,
    );
    const fg = ring.querySelector<SVGCircleElement>('.pl-ring-fg');
    const holdBtn = h('button', { class: 'pl-hold', attrs: { type: 'button', 'aria-label': 'Przytrzymaj przez 2 sekundy' } }, ring, h('span', { class: 'pl-hold-ic' }, lockIcon(64)));
    const status = h('div', { class: 'pl-status' }, 'Przytrzymaj kłódkę przez 2 sekundy');
    const setProgress = (p: number): void => {
      fg?.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, Math.min(1, p)))).toFixed(1));
    };
    const tick = (): void => {
      const p = (performance.now() - holdStart) / HOLD_MS;
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const start = (e: PointerEvent): void => {
      if (holdStart) return;
      e.preventDefault();
      try {
        holdBtn.setPointerCapture(e.pointerId);
      } catch {
        /* zdarzenie syntetyczne / nieaktywny wskaźnik */
      }
      holdStart = performance.now();
      holdBtn.classList.add('is-holding');
      status.textContent = 'Trzymaj…';
      raf = requestAnimationFrame(tick);
      holdTimer = window.setTimeout(() => {
        cancelAnimationFrame(raf);
        setProgress(1);
        ctx.sfx('correct');
        holdStart = 0;
        showMath();
      }, HOLD_MS);
    };
    const stop = (): void => {
      if (!holdStart) return;
      holdStart = 0;
      window.clearTimeout(holdTimer);
      cancelAnimationFrame(raf);
      setProgress(0);
      holdBtn.classList.remove('is-holding');
      status.textContent = 'Za krótko — przytrzymaj pełne 2 sekundy';
    };
    holdBtn.addEventListener('pointerdown', start);
    holdBtn.addEventListener('pointerup', stop);
    holdBtn.addEventListener('pointercancel', stop);
    holdBtn.addEventListener('lostpointercapture', stop);

    shell.body.replaceChildren(
      h('p', { class: 'pl-lead' }, 'Ta część jest dla dorosłych: postępy dziecka, ustawienia i zapis gry.'),
      holdBtn,
      status,
      h('div', { class: 'pl-foot' }, button('Anuluj', () => finish(false), 'btn-ghost')),
    );
  }

  // Etap 2: działanie do wpisania
  function showMath(): void {
    typed = '';
    const q = h('div', { class: 'pl-q' });
    const display = h('div', { class: 'pl-display', attrs: { 'aria-live': 'polite' } });
    const msg = h('div', { class: 'pl-msg' });
    const renderQ = (): void => {
      q.textContent = `${problem.a} × ${problem.b} = ?`;
      display.textContent = typed || ' ';
      display.classList.toggle('is-empty', !typed);
    };
    const press = (k: string): void => {
      if (k === 'back') typed = typed.slice(0, -1);
      else if (k === 'ok') return submit();
      else if (typed.length < 5) typed += k;
      ctx.sfx('tap');
      renderQ();
    };
    const submit = (): void => {
      if (!typed) return;
      if (Number(typed) === problem.answer) {
        ctx.sfx('correct');
        display.classList.add('is-ok');
        window.setTimeout(() => finish(true), 250);
        return;
      }
      ctx.sfx('wrong');
      problem = lockProblem();
      typed = '';
      msg.textContent = 'To nie ten wynik. Spróbuj z nowym działaniem.';
      display.classList.remove('pn-shake');
      void display.offsetWidth;
      display.classList.add('pn-shake');
      renderQ();
    };
    const keys = h('div', { class: 'pl-keys' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok']) {
      const label = k === 'back' ? '⌫' : k === 'ok' ? 'OK' : k;
      const b = h('button', { class: `pl-key${k === 'ok' ? ' is-ok' : ''}${k === 'back' ? ' is-back' : ''}`, attrs: { type: 'button', 'aria-label': k === 'back' ? 'Usuń' : label }, dataset: { key: k } }, label);
      shell.onDispose(onTap(b, () => press(k)));
      keys.append(b);
    }
    listen(shell, window, 'keydown', e => {
      if (e.key >= '0' && e.key <= '9' && e.key.length === 1) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('ok');
      else if (e.key === 'Escape') finish(false);
    });
    renderQ();
    shell.body.replaceChildren(
      h('p', { class: 'pl-lead' }, 'Wpisz wynik działania:'),
      h('div', { class: 'pl-math' }, h('div', { class: 'pl-left' }, q, display, msg), keys),
      h('div', { class: 'pl-foot' }, button('Anuluj', () => finish(false), 'btn-ghost')),
    );
  }
}

// ───────────────────────────── Panel rodzica ─────────────────────────────

type Tab = 'progress' | 'settings' | 'save' | 'info';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'progress', label: 'Postępy', icon: '📈' },
  { id: 'settings', label: 'Ustawienia', icon: '⚙️' },
  { id: 'save', label: 'Zapis', icon: '💾' },
  { id: 'info', label: 'Informacje', icon: 'ℹ️' },
];

const OP_SIGN: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: ':' };
const OP_NAME: Record<Op, string> = { add: 'dodawanie', sub: 'odejmowanie', mul: 'mnożenie', div: 'dzielenie' };
const OPS: Op[] = ['add', 'sub', 'mul', 'div'];

function cloneSettings(s: ParentSettings): ParentSettings {
  return {
    ...s,
    ops: { ...s.ops },
    timeLimit: { mode: s.timeLimit.mode, fixedSec: { ...s.timeLimit.fixedSec } },
    audio: { ...s.audio },
  };
}

export function parentPanelView(ctx: UiContext, vm: ParentViewModel, handlers: ParentHandlers): Promise<void> {
  const done = once<void>();
  let settings = cloneSettings(vm.settings);
  let tab: Tab = 'progress';

  const shell = openShell(ctx, {
    theme: 'parent',
    title: 'Panel rodzica',
    icon: '👪',
    subtitle: `Profil: ${vm.profileName}`,
    onClose: () => {
      done.resolve();
      void shell.close();
    },
  });
  shell.sheet.classList.add('pp-sheet');

  const tabBtns = new Map<Tab, HTMLElement>();
  const tabBar = h('nav', { class: 'pp-tabs', attrs: { role: 'tablist' } });
  for (const t of TABS) {
    const b = h(
      'button',
      { class: 'pp-tab', attrs: { type: 'button', role: 'tab' }, dataset: { tab: t.id } },
      h('span', { class: 'pp-tab-ic', attrs: { 'aria-hidden': 'true' } }, t.icon),
      t.label,
    );
    shell.onDispose(
      onTap(b, () => {
        if (tab === t.id) return;
        ctx.sfx('tap');
        tab = t.id;
        render();
      }),
    );
    tabBtns.set(t.id, b);
    tabBar.append(b);
  }
  const content = scroller('pp-content');
  shell.body.classList.add('pp-body');
  shell.body.append(tabBar, content);
  /** Odpięcia dotyku dla bieżącej zawartości zakładki — czyszczone przy każdym przerysowaniu. */
  let tabDisposers: (() => void)[] = [];
  const flushTab = (): void => {
    for (const d of tabDisposers) d();
    tabDisposers = [];
  };
  const tap = (el: HTMLElement, cb: () => void): void => {
    tabDisposers.push(onTap(el, cb));
  };
  shell.onDispose(flushTab);
  render();
  return done.promise;

  function render(): void {
    flushTab();
    for (const [id, b] of tabBtns) {
      b.classList.toggle('is-active', id === tab);
      b.setAttribute('aria-selected', String(id === tab));
    }
    const keepScroll = content.dataset.tab === tab ? content.scrollTop : 0;
    content.dataset.tab = tab;
    content.replaceChildren(tab === 'progress' ? progressTab() : tab === 'settings' ? settingsTab() : tab === 'save' ? saveTab() : infoTab());
    content.scrollTop = keepScroll;
  }

  // ─── Postępy ───

  function progressTab(): HTMLElement {
    const acc7 = vm.stats7.tasks ? vm.stats7.correct / vm.stats7.tasks : null;
    const acc30 = vm.stats30.tasks ? vm.stats30.correct / vm.stats30.tasks : null;
    const statRow = (label: string, s: ParentViewModel['stats7'], acc: number | null): HTMLElement =>
      h(
        'tr',
        null,
        h('th', { attrs: { scope: 'row' } }, label),
        h('td', null, String(s.tasks)),
        h('td', null, String(s.correct)),
        h('td', null, pct(acc)),
        h('td', null, `${s.minutes} min`),
        h('td', null, String(s.sessions)),
      );
    const stats = card(
      'Aktywność',
      h(
        'table',
        { class: 'pp-table pp-stats' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Zadania'), h('th', null, 'Poprawne'), h('th', null, 'Skuteczność'), h('th', null, 'Czas gry'), h('th', null, 'Sesje'))),
        h('tbody', null, statRow('Ostatnie 7 dni', vm.stats7, acc7), statRow('Ostatnie 30 dni', vm.stats30, acc30)),
      ),
    );

    const helpShare = vm.helpUsage.total ? vm.helpUsage.helped / vm.helpUsage.total : null;
    const help = card(
      'Pomoc sprzętu',
      h('div', { class: 'pp-hero' }, h('span', { class: 'pp-hero-n' }, pct(helpShare)), h('span', { class: 'pp-hero-l' }, `zadań z pomocą (${vm.helpUsage.helped} z ${vm.helpUsage.total})`)),
      h('p', { class: 'pp-note' }, 'Oś liczbowa i poprawka pomagają liczyć, ale nie ukrywają słabych punktów — takie próby liczą się w modelu jako „z pomocą”.'),
    );

    const heat = card(
      'Opanowanie faktów',
      h('div', { class: 'pp-heats' }, heatmap('add', vm.heatmapAdd), heatmap('mul', vm.heatmapMul)),
      heatLegend(),
    );

    const weak = card(
      'Słabe punkty',
      vm.weakest.length
        ? h(
            'ol',
            { class: 'pp-weak' },
            ...vm.weakest.slice(0, 10).map((w, i) =>
              h(
                'li',
                null,
                h('span', { class: 'pp-weak-i' }, String(i + 1)),
                h('span', { class: 'pp-weak-l' }, w.label),
                barEl(w.m, 'pp-bar-weak'),
                h('span', { class: 'pp-weak-v' }, pct(w.m)),
                h('span', { class: 'pp-weak-n' }, `${w.n} ${plural(w.n, 'próba', 'próby', 'prób')}`),
              ),
            ),
          )
        : h('p', { class: 'pp-note' }, 'Za mało danych — pojawią się po kilku sesjach.'),
    );

    const cats = card(
      'Kategorie',
      h(
        'table',
        { class: 'pp-table pp-cats' },
        h(
          'thead',
          null,
          h('tr', null, h('th', null, 'Kategoria'), h('th', { class: 'pp-col-m' }, 'Opanowanie'), h('th', null, 'Próby'), h('th', null, 'Skuteczność'), h('th', null, 'Mediana czasu')),
        ),
        h(
          'tbody',
          null,
          ...vm.categories.map(c =>
            h(
              'tr',
              { class: c.n === 0 ? 'is-empty' : '' },
              h('th', { attrs: { scope: 'row' } }, c.label),
              // Bez prób opanowanie to tylko wartość startowa modelu — nie pokazujemy jej jako wyniku.
              h(
                'td',
                { class: 'pp-col-m' },
                h('div', { class: 'pp-mcell' }, barEl(c.n > 0 ? c.m : 0, c.n > 0 ? '' : 'is-null'), h('span', null, c.n > 0 ? pct(c.m) : '—')),
              ),
              h('td', null, String(c.n)),
              h('td', null, pct(c.accuracy)),
              h('td', null, secs(c.medianMs)),
            ),
          ),
        ),
      ),
    );

    const modes = card(
      'Skuteczność według trybu',
      h(
        'ul',
        { class: 'pp-bars' },
        ...vm.accuracyByMode.map(m =>
          h(
            'li',
            null,
            h('span', { class: 'pp-bars-l' }, m.label),
            barEl(m.accuracy ?? 0, m.accuracy === null ? 'is-null' : ''),
            h('span', { class: 'pp-bars-v' }, pct(m.accuracy)),
            h('span', { class: 'pp-bars-n' }, `${m.tasks} zad.`),
          ),
        ),
      ),
      h(
        'p',
        { class: 'pp-callout' },
        h('b', null, 'Uwaga: '),
        'Skuteczność w walce może być niższa przy przeplataniu zadań — to normalne. Przeplatanie utrudnia grę, ale lepiej utrwala wiedzę; dlatego obok walki pokazujemy łapanie i bramę.',
      ),
    );

    const maxErr = Math.max(1, ...vm.errorKinds.map(e => e.count));
    const errors = card(
      'Rodzaje błędów',
      vm.errorKinds.length
        ? h(
            'ul',
            { class: 'pp-bars pp-bars-3' },
            ...vm.errorKinds.map(e =>
              h('li', null, h('span', { class: 'pp-bars-l' }, e.label), barEl(e.count / maxErr, 'pp-bar-err'), h('span', { class: 'pp-bars-v' }, String(e.count))),
            ),
          )
        : h('p', { class: 'pp-note' }, 'Brak błędów do pokazania.'),
    );

    return h(
      'div',
      { class: 'pp-grid' },
      h('div', { class: 'pp-span2 pp-row' }, heat, weak),
      h('div', { class: 'pp-span2 pp-row pp-row-b' }, stats, help),
      h('div', { class: 'pp-span2' }, cats),
      modes,
      errors,
    );
  }

  function heatmap(kind: 'add' | 'mul', data: (number | null)[][]): HTMLElement {
    const sign = kind === 'add' ? '+' : '×';
    const title = kind === 'add' ? 'Dodawanie a + b' : 'Tabliczka mnożenia a × b';
    const grid = h('div', { class: 'pp-heat', attrs: { role: 'grid', 'aria-label': title } });
    grid.append(h('div', { class: 'pp-heat-corner' }, sign));
    for (let b = 1; b <= 10; b++) grid.append(h('div', { class: 'pp-heat-lab is-top' }, String(b)));
    for (let a = 1; a <= 10; a++) {
      grid.append(h('div', { class: 'pp-heat-lab is-left' }, String(a)));
      for (let b = 1; b <= 10; b++) {
        const m = data[a - 1]?.[b - 1] ?? null;
        const cell = h('div', {
          class: `pp-cell${m === null ? ' is-null' : ''}`,
          dataset: { a: String(a), b: String(b) },
          attrs: { role: 'gridcell', 'aria-label': `${a} ${sign} ${b}: ${m === null ? 'brak prób' : pct(m)}` },
        });
        cell.style.background = heatColor(m);
        grid.append(cell);
      }
    }
    const readout = h('div', { class: 'pp-readout' }, 'Dotknij pola, żeby zobaczyć wynik.');
    let sel: HTMLElement | null = null;
    const pick = (e: PointerEvent): void => {
      const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('.pp-cell');
      if (!t || t === sel) return;
      sel?.classList.remove('is-sel');
      sel = t;
      t.classList.add('is-sel');
      const a = Number(t.dataset.a);
      const b = Number(t.dataset.b);
      const m = data[a - 1]?.[b - 1] ?? null;
      const res = kind === 'add' ? a + b : a * b;
      readout.replaceChildren(
        h('span', { class: 'pp-readout-sw', style: { background: heatColor(m), color: heatInk(m) } }),
        h('b', null, m === null ? 'brak prób' : pct(m)),
        ` ${a} ${sign} ${b} = ${res}`,
      );
    };
    grid.addEventListener('pointerdown', pick);
    grid.addEventListener('pointermove', pick);
    return h('figure', { class: 'pp-heat-fig' }, h('figcaption', { class: 'pp-heat-t' }, title), grid, readout);
  }

  function heatLegend(): HTMLElement {
    const stops = [0, 0.25, 0.5, 0.75, 1].map(v => `${heatColor(v)} ${v * 100}%`).join(', ');
    return h(
      'div',
      { class: 'pp-legend' },
      h('span', { class: 'pp-legend-l' }, 'Opanowanie:'),
      h('span', { class: 'pp-legend-v' }, '0%'),
      h('span', { class: 'pp-legend-bar', style: { background: `linear-gradient(90deg, ${stops})` } }),
      h('span', { class: 'pp-legend-v' }, '100%'),
      h('span', { class: 'pp-legend-null' }, h('span', { class: 'pp-legend-sw', style: { background: heatColor(null) } }), 'brak prób'),
      h('span', { class: 'pp-legend-hint' }, 'wiersz = a, kolumna = b'),
    );
  }

  // ─── Ustawienia ───

  function settingsTab(): HTMLElement {
    const s = settings;
    const rows: HTMLElement[] = [];
    rows.push(
      row(
        'Zakres liczb',
        'Największe liczby w zadaniach.',
        seg<NumberRange>('range', [
          { v: 10, label: 'do 10' },
          { v: 20, label: 'do 20' },
          { v: 100, label: 'do 100' },
        ], s.range, v => change(n => (n.range = v))),
      ),
    );
    const opsEl = h('div', { class: 'pp-seg pp-multi', dataset: { seg: 'ops' } });
    for (const op of OPS) {
      const on = s.ops[op];
      const b = h(
        'button',
        { class: `pp-seg-b pp-op${on ? ' is-on' : ''}`, attrs: { type: 'button', 'aria-pressed': String(on), 'aria-label': OP_NAME[op] }, dataset: { val: op } },
        h('span', { class: 'pp-op-s' }, OP_SIGN[op]),
      );
      tap(b, () => {
        const count = OPS.filter(o => settings.ops[o]).length;
        if (settings.ops[op] && count <= 1) {
          flash(b);
          return;
        }
        change(n => (n.ops[op] = !n.ops[op]));
      });
      opsEl.append(b);
    }
    rows.push(row('Działania włączone', 'Co najmniej jedno musi zostać włączone.', opsEl));
    rows.push(
      row(
        'Działania w walce',
        'Tematyczne: działanie krainy (Łąka = dodawanie). Wszystkie: każde włączone działanie.',
        seg<'themed' | 'all'>('combatOps', [
          { v: 'themed', label: 'Tematyczne' },
          { v: 'all', label: 'Wszystkie' },
        ], s.combatOps, v => change(n => (n.combatOps = v))),
      ),
    );
    rows.push(
      row(
        'Przekraczanie 10 na Łące',
        'Zadania typu 8 + 7 w ostatnim etapie Łąki.',
        seg<boolean>('crossTenOnMeadow', [
          { v: true, label: 'Tak' },
          { v: false, label: 'Nie' },
        ], s.crossTenOnMeadow, v => change(n => (n.crossTenOnMeadow = v))),
      ),
    );
    const tl = h(
      'div',
      { class: 'pp-tl' },
      seg<TimeLimitMode>('timeLimit.mode', [
        { v: 'none', label: 'Brak' },
        { v: 'gentle', label: 'Łagodny' },
        { v: 'fixed', label: 'Stały' },
      ], s.timeLimit.mode, v => change(n => (n.timeLimit.mode = v))),
    );
    if (s.timeLimit.mode === 'fixed') {
      const steppers = h('div', { class: 'pp-steppers' });
      for (const op of OPS) {
        steppers.append(
          stepper(`fixedSec.${op}`, OP_SIGN[op], s.timeLimit.fixedSec[op], 3, 60, v => change(n => (n.timeLimit.fixedSec[op] = v))),
        );
      }
      tl.append(steppers);
    }
    rows.push(
      row(
        'Limit czasu odpowiedzi',
        s.timeLimit.mode === 'none'
          ? 'Domyślnie: walka turowa bez licznika. Szybkie odpowiedzi dają tylko cichą premię.'
          : s.timeLimit.mode === 'gentle'
            ? 'Limit = 2,5 × osobista mediana dziecka (co najmniej 8 s), pokazany jako powolny pierścień.'
            : 'Sekundy osobno dla każdego działania.',
        tl,
        'pp-row-wide',
      ),
    );
    rows.push(
      row(
        'Przypomnienie o przerwie',
        'Łagodna prośba o przerwę po tylu minutach gry.',
        seg<ParentSettings['breakReminderMin']>('breakReminderMin', [
          { v: 0, label: 'Brak' },
          { v: 15, label: '15 min' },
          { v: 20, label: '20 min' },
          { v: 30, label: '30 min' },
        ], s.breakReminderMin, v => change(n => (n.breakReminderMin = v))),
      ),
    );
    rows.push(
      row(
        'Jakość grafiki',
        'Auto dobiera jakość po krótkim teście wydajności.',
        seg<QualityPreset>('quality', [
          { v: 'auto', label: 'Auto' },
          { v: 'low', label: 'Niska' },
          { v: 'medium', label: 'Średnia' },
          { v: 'high', label: 'Wysoka' },
        ], s.quality, v => change(n => (n.quality = v))),
      ),
    );
    rows.push(row('Głośność muzyki', '', slider('audio.music', s.audio.music, v => change(n => (n.audio.music = v)))));
    rows.push(row('Głośność efektów', '', slider('audio.sfx', s.audio.sfx, v => change(n => (n.audio.sfx = v)))));
    rows.push(
      row(
        'Licznik FPS',
        'Do sprawdzania płynności gry na tablecie.',
        seg<boolean>('showFps', [
          { v: false, label: 'Ukryj' },
          { v: true, label: 'Pokaż' },
        ], s.showFps, v => change(n => (n.showFps = v))),
      ),
    );
    return h('div', { class: 'pp-settings' }, ...rows);
  }

  function change(mut: (n: ParentSettings) => void): void {
    const next = cloneSettings(settings);
    mut(next);
    settings = next;
    ctx.sfx('tap');
    handlers.onSettingsChange(cloneSettings(next));
    render();
  }

  function row(label: string, hint: string, control: HTMLElement, cls = ''): HTMLElement {
    return h(
      'div',
      { class: `pp-set ${cls}`.trim() },
      h('div', { class: 'pp-set-t' }, h('div', { class: 'pp-set-l' }, label), hint ? h('div', { class: 'pp-set-h' }, hint) : null),
      h('div', { class: 'pp-set-c' }, control),
    );
  }

  function seg<T extends string | number | boolean>(key: string, opts: { v: T; label: string }[], value: T, pick: (v: T) => void): HTMLElement {
    const el = h('div', { class: 'pp-seg', dataset: { seg: key }, attrs: { role: 'radiogroup' } });
    for (const o of opts) {
      const on = o.v === value;
      const b = h('button', { class: `pp-seg-b${on ? ' is-on' : ''}`, attrs: { type: 'button', role: 'radio', 'aria-checked': String(on) }, dataset: { val: String(o.v) } }, o.label);
      tap(b, () => {
        if (o.v !== value) pick(o.v);
      });
      el.append(b);
    }
    return el;
  }

  function stepper(key: string, sign: string, value: number, min: number, max: number, set: (v: number) => void): HTMLElement {
    const minus = h('button', { class: 'pp-step-b', attrs: { type: 'button', 'aria-label': `${sign}: mniej sekund` } }, '−');
    const plus = h('button', { class: 'pp-step-b', attrs: { type: 'button', 'aria-label': `${sign}: więcej sekund` } }, '+');
    minus.disabled = value <= min;
    plus.disabled = value >= max;
    tap(minus, () => set(Math.max(min, value - 1)));
    tap(plus, () => set(Math.min(max, value + 1)));
    return h(
      'div',
      { class: 'pp-step', dataset: { step: key } },
      h('span', { class: 'pp-step-op' }, sign),
      minus,
      h('span', { class: 'pp-step-v' }, `${value} s`),
      plus,
    );
  }

  function slider(key: string, value: number, set: (v: number) => void): HTMLElement {
    const input = h('input', { class: 'pp-range', attrs: { type: 'range', min: '0', max: '100', step: '5', 'aria-label': key } });
    input.value = String(Math.round(value * 100));
    const out = h('span', { class: 'pp-range-v' }, `${Math.round(value * 100)}%`);
    const paint = (): void => {
      input.style.setProperty('--val', `${input.value}%`);
      out.textContent = `${input.value}%`;
    };
    input.addEventListener('input', paint);
    input.addEventListener('change', () => set(Number(input.value) / 100));
    paint();
    return h('div', { class: 'pp-slider', dataset: { slider: key } }, input, out);
  }

  function flash(el: HTMLElement): void {
    el.classList.remove('pn-shake');
    void el.offsetWidth;
    el.classList.add('pn-shake');
  }

  // ─── Zapis ───

  function saveTab(): HTMLElement {
    const exportCard = card(
      'Kopia zapasowa',
      h('p', { class: 'pp-note' }, 'Zapis gry jest tylko na tym urządzeniu. Wyczyszczenie danych przeglądarki go usuwa — co jakiś czas pobierz kopię do pliku.'),
      h('div', { class: 'pp-actions' }, button(h('span', null, h('span', { class: 'pn-btn-ic' }, '⬇️'), 'Pobierz plik z zapisem'), () => handlers.onExport(), 'btn-primary pp-export')),
    );

    const file = h('input', { class: 'pp-file', attrs: { type: 'file', accept: '.json,application/json' } });
    const importMsg = h('div', { class: 'pp-msg', attrs: { 'aria-live': 'polite' } });
    const importBtn = button(h('span', null, h('span', { class: 'pn-btn-ic' }, '📂'), 'Wczytaj zapis z pliku…'), () => file.click(), 'pp-import');
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      importMsg.className = 'pp-msg is-busy';
      importMsg.textContent = 'Wczytywanie…';
      importBtn.disabled = true;
      handlers
        .onImport(f)
        .then(r => {
          importMsg.className = `pp-msg ${r.ok ? 'is-ok' : 'is-bad'}`;
          importMsg.textContent = r.message;
        })
        .catch((e: unknown) => {
          importMsg.className = 'pp-msg is-bad';
          importMsg.textContent = `Nie udało się wczytać pliku. ${e instanceof Error ? e.message : ''}`.trim();
        })
        .finally(() => {
          importBtn.disabled = false;
        });
    });
    const importCard = card(
      'Wczytanie zapisu',
      h('p', { class: 'pp-note' }, 'Zastępuje bieżący postęp zapisem z pliku .json (np. po zmianie tabletu).'),
      h('div', { class: 'pp-actions' }, importBtn, file),
      importMsg,
    );

    const resetBox = h('div', { class: 'pp-reset-box' });
    const resetMsg = h('div', { class: 'pp-msg', attrs: { 'aria-live': 'polite' } });
    const step0 = (): void => {
      resetBox.replaceChildren(button(h('span', null, h('span', { class: 'pn-btn-ic' }, '🗑️'), 'Usuń wszystkie postępy…'), step1, 'pp-danger ps-reset'));
    };
    const step1 = (): void => {
      ctx.sfx('tap');
      resetBox.replaceChildren(
        h('p', { class: 'pp-warn' }, 'Na pewno? Zniknie cały postęp: stworki, karty, cyfry, sprzęt i historia nauki.'),
        h('div', { class: 'pp-actions' }, button('Tak, dalej', step2, 'pp-danger ps-reset-1'), button('Nie, zostaw', step0, 'btn-ghost')),
      );
    };
    const step2 = (): void => {
      ctx.sfx('tap');
      resetBox.replaceChildren(
        h('p', { class: 'pp-warn is-strong' }, 'Ostatnie ostrzeżenie: tego nie da się cofnąć. Najpierw pobierz kopię zapasową.'),
        h(
          'div',
          { class: 'pp-actions' },
          button('Usuń na zawsze', () => {
            resetBox.replaceChildren(h('p', { class: 'pp-note' }, 'Usuwanie…'));
            handlers
              .onReset()
              .then(() => {
                resetMsg.className = 'pp-msg is-ok';
                resetMsg.textContent = 'Postępy usunięte. Gra zacznie się od nowa.';
              })
              .catch((e: unknown) => {
                resetMsg.className = 'pp-msg is-bad';
                resetMsg.textContent = `Nie udało się usunąć zapisu. ${e instanceof Error ? e.message : ''}`.trim();
              })
              .finally(step0);
          }, 'pp-danger is-final ps-reset-2'),
          button('Anuluj', step0, 'btn-ghost'),
        ),
      );
    };
    step0();
    const resetCard = card('Zacznij od nowa', h('p', { class: 'pp-note' }, 'Usuwa zapis z tego urządzenia. Wymaga dwóch potwierdzeń.'), resetBox, resetMsg);
    resetCard.classList.add('is-danger');

    return h('div', { class: 'pp-save' }, exportCard, importCard, resetCard);
  }

  // ─── Informacje ───

  function infoTab(): HTMLElement {
    return h(
      'div',
      { class: 'pp-info' },
      card(
        'Jak gra dobiera zadania',
        h(
          'p',
          { class: 'pp-p' },
          'Matematico śledzi osobno każdy fakt (np. 7 + 8 albo 6 × 7): poprawność i czas odpowiedzi, zawsze względem osobistego tempa dziecka, a nie norm z tabel. ' +
            'Zadania dobiera tak, żeby dziecko odpowiadało dobrze mniej więcej w 3 na 4 przypadkach — słabsze fakty wracają częściej, a opanowane rzadziej, jako powtórki rozłożone w czasie. ' +
            'Po dwóch błędach z rzędu gra daje łatwiejsze zadanie.',
        ),
      ),
      card(
        'Jak czytać postępy',
        h(
          'ul',
          { class: 'pp-ul' },
          h('li', null, 'Mapa ciepła: kolor pola to opanowanie faktu — czerwony słabo, żółty w toku, zielony dobrze, szary jeszcze bez prób.'),
          h('li', null, 'Słabe punkty to fakty z najniższym opanowaniem; wracają w grze częściej, aż się poprawią.'),
          h('li', null, 'Próby z pomocą sprzętu (oś, poprawka) liczą się jako „z pomocą” — nie zawyżają wyniku.'),
        ),
      ),
      card(
        'O aplikacji',
        h(
          'dl',
          { class: 'pp-dl' },
          h('dt', null, 'Wersja'),
          h('dd', null, vm.version),
          h('dt', null, 'Profil'),
          h('dd', null, vm.profileName),
          h('dt', null, 'Dane'),
          h('dd', null, 'Tylko na tym urządzeniu. Bez reklam, bez zakupów, bez konta.'),
        ),
      ),
    );
  }

  // ─── wspólne ───

  function card(title: string, ...children: (Node | null)[]): HTMLElement {
    return h('section', { class: 'pp-card' }, h('h3', { class: 'pp-card-t' }, title), ...children);
  }

  function barEl(v: number, cls: string): HTMLElement {
    const w = Math.max(0, Math.min(1, v));
    return h('span', { class: `pp-bar ${cls}`.trim() }, h('span', { class: 'pp-bar-f', style: { width: `${(w * 100).toFixed(1)}%` } }));
  }
}
