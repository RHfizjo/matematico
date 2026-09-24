/**
 * HUD: miejsce + licznik cyfr (lewy górny róg), pasek Czaru brainrota z zapowiedzią ruchu (u góry na środku),
 * serce bohatera i tarcza (lewy dolny róg), wylatujące liczby (floatText).
 * HUD nie przechwytuje dotyku (pointer-events: none) — pod nim działa gałka ruchu.
 */
import type { EnemyHud, FloatKind, IntentView, ScreenPos, UiApi } from '../game/contracts';
import type { UiContext } from './context';
import { h } from './dom';
import { icon } from './icons';
import { clamp } from './util';

export type HudApi = UiApi['hud'] & { readonly enemyVisible: boolean };

export function createHud(ctx: UiContext): HudApi {
  // Lewy górny róg
  const locText = h('span', { class: 'hud-loc-t' }, '');
  const loc = h('div', { class: 'hud-pill hud-loc is-empty' }, icon('pin'), locText);
  const digitsNum = h('span', { class: 'hud-digits-n' }, '0');
  const digits = h('div', { class: 'hud-pill hud-digits', attrs: { 'aria-label': 'cyfry' } }, icon('cube'), digitsNum);
  const tl = h('div', { class: 'hud-tl' }, loc, digits);

  // Brainrot
  const intentIcon = h('span', { class: 'hud-intent-ic' });
  const intentText = h('span', { class: 'hud-intent-t' });
  const intentTotal = h('span', { class: 'hud-intent-total' });
  const intent = h('div', { class: 'hud-intent is-hidden', attrs: { 'aria-live': 'polite' } }, intentIcon, intentText, intentTotal);
  const eName = h('div', { class: 'he-name' });
  const ePhases = h('div', { class: 'he-phases' });
  const eFill = h('div', { class: 'he-fill' });
  const eGhost = h('div', { class: 'he-ghost' });
  const eNum = h('div', { class: 'he-num' });
  const eBar = h('div', { class: 'he-bar' }, eGhost, eFill, h('div', { class: 'he-shine' }), eNum);
  const eVines = h('div', { class: 'he-vines is-hidden' });
  const enemyCard = h('div', { class: 'he-card' }, h('div', { class: 'he-row' }, h('span', { class: 'he-tag' }, 'Czar'), eName, ePhases), eBar, eVines);
  const enemy = h('div', { class: 'hud-enemy is-hidden' }, intent, enemyCard);

  // Bohater
  const hpFill = h('div', { class: 'hp-fill' });
  const hpGhost = h('div', { class: 'hp-ghost' });
  const hpNum = h('div', { class: 'hp-num' });
  const heart = icon('heart', 'hp-heart');
  const hp = h('div', { class: 'hud-hp is-hidden' }, heart, h('div', { class: 'hp-bar' }, hpGhost, hpFill, h('div', { class: 'he-shine' }), hpNum));
  const shieldNum = h('span', { class: 'hud-shield-n' }, '0');
  const shield = h('div', { class: 'hud-shield is-hidden', attrs: { 'aria-label': 'tarcza' } }, icon('shield'), shieldNum);
  const bl = h('div', { class: 'hud-bl' }, hp, shield);

  const floats = h('div', { class: 'hud-floats' });
  const root = h('div', { class: 'hud passthrough is-off' }, tl, enemy, bl, floats);
  ctx.layers.hud.append(root);
  const uiRoot = ctx.layers.hud.parentElement ?? document.documentElement;

  let digitsShown = 0;
  let digitsRaf = 0;
  let lastCzar: number | null = null;
  let lastHp: number | null = null;
  let lastShield = 0;
  let enemyVisible = false;

  const bump = (el: HTMLElement, cls = 'bump'): void => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  const api: HudApi = {
    get enemyVisible() {
      return enemyVisible && !root.classList.contains('is-off');
    },
    show(visible: boolean) {
      root.classList.toggle('is-off', !visible);
      uiRoot.classList.toggle('ui-has-enemy', api.enemyVisible);
    },
    setLocation(name: string) {
      locText.textContent = name;
      loc.classList.toggle('is-empty', !name);
    },
    setDigits(total: number) {
      const from = digitsShown;
      const to = Math.max(0, Math.round(total));
      cancelAnimationFrame(digitsRaf);
      if (to > from) bump(digits);
      const t0 = performance.now();
      const dur = clamp(Math.abs(to - from) * 60, 0, 700);
      const step = (now: number): void => {
        const p = dur === 0 ? 1 : clamp((now - t0) / dur, 0, 1);
        digitsShown = Math.round(from + (to - from) * p);
        digitsNum.textContent = String(digitsShown);
        if (p < 1) digitsRaf = requestAnimationFrame(step);
      };
      if (dur === 0) {
        digitsShown = to;
        digitsNum.textContent = String(to);
      } else digitsRaf = requestAnimationFrame(step);
    },
    setHp(value: number, max: number) {
      hp.classList.remove('is-hidden');
      const pct = max > 0 ? clamp(value / max, 0, 1) * 100 : 0;
      hpFill.style.width = `${pct}%`;
      hpGhost.style.width = `${pct}%`;
      hpNum.textContent = `${Math.max(0, Math.round(value))} / ${Math.round(max)}`;
      if (lastHp !== null && value < lastHp) bump(hp, 'hurt');
      if (lastHp !== null && value > lastHp) bump(hp, 'healed');
      hp.classList.toggle('is-low', pct <= 30);
      lastHp = value;
    },
    setEnemy(e: EnemyHud | null) {
      enemyVisible = !!e;
      enemy.classList.toggle('is-hidden', !e);
      uiRoot.classList.toggle('ui-has-enemy', api.enemyVisible);
      if (!e) {
        lastCzar = null;
        return;
      }
      eName.textContent = e.name;
      const pct = e.maxCzar > 0 ? clamp(e.czar / e.maxCzar, 0, 1) * 100 : 0;
      eFill.style.width = `${pct}%`;
      eGhost.style.width = `${pct}%`;
      eNum.textContent = `${Math.max(0, Math.round(e.czar))} / ${Math.round(e.maxCzar)}`;
      if (lastCzar !== null && e.czar < lastCzar) bump(enemyCard, 'hurt');
      lastCzar = e.czar;
      // Fazy bossa
      ePhases.textContent = '';
      const phases = e.phases ?? 0;
      if (phases > 1) {
        const cur = e.phase ?? 1;
        for (let i = 1; i <= phases; i++) ePhases.append(h('span', { class: `he-pip${i < cur ? ' is-done' : i === cur ? ' is-on' : ''}` }));
        ePhases.setAttribute('aria-label', `faza ${cur} z ${phases}`);
      }
      // Pnącza
      const vines = e.vines ?? 0;
      eVines.textContent = '';
      eVines.classList.toggle('is-hidden', vines <= 0);
      if (vines > 0) {
        for (let i = 0; i < Math.min(vines, 8); i++) eVines.append(icon('leaf', 'he-leaf'));
        eVines.append(h('span', { class: 'he-vines-t' }, vines === 1 ? 'pnącze' : vines < 5 ? 'pnącza' : 'pnączy'));
      }
    },
    setIntent(v: IntentView | null) {
      if (!v) {
        intent.classList.add('is-hidden');
        return;
      }
      const was = intent.classList.contains('is-hidden') ? '' : intentText.textContent;
      intent.className = `hud-intent intent-${v.kind}`;
      intentIcon.textContent = '';
      intentIcon.append(icon(v.kind === 'strong' ? 'burst' : 'sword'));
      intentText.textContent = v.text;
      intentTotal.textContent = v.kind === 'multi' ? `= ${v.total}` : '';
      if (was !== v.text) bump(intent, 'pop');
    },
    setShield(amount: number) {
      const a = Math.max(0, Math.round(amount));
      shield.classList.toggle('is-hidden', a <= 0);
      shieldNum.textContent = String(a);
      if (a > lastShield) bump(shield, 'pop');
      lastShield = a;
    },
    floatText(at: ScreenPos, text: string, kind: FloatKind) {
      const x = at.visible ? at.x : window.innerWidth / 2;
      const y = at.visible ? at.y : window.innerHeight * 0.42;
      let label = text;
      if (kind === 'crit' && !label.endsWith('!')) label += '!';
      const el = h('div', { class: `float float-${kind}` });
      if (kind === 'block') el.append(icon('shield', 'float-ic'));
      if (kind === 'digit') el.append(icon('cube', 'float-ic'));
      if (kind === 'heal') el.append(icon('heart', 'float-ic'));
      el.append(h('span', { class: 'float-t' }, label));
      const jitter = (Math.random() - 0.5) * 36;
      el.style.left = `${x + jitter}px`;
      el.style.top = `${y}px`;
      floats.append(el);
      setTimeout(() => el.remove(), kind === 'crit' ? 1600 : 1300);
    },
  };
  return api;
}
