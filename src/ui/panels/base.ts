/**
 * Panele bazy (GDD 9.1): Zagroda, Skarbiec, Kuźnia, Galeria Brainglamów, Tablica Wypraw.
 */
import type { CreatureCard, ForgeAction, GlamCard, ItemCard, LandCard, PenAction } from '../../game/contracts';
import type { Digits, LandId } from '../../core/types';
import type { UiContext } from '../context';
import { button, h, onTap } from '../dom';
import { digitStrip, digitTile, levelStars, lockIcon, once, openShell, portraitBox, scroller } from './shell';
import { canComposeSum, digitsWord, RARITY_LABEL, SLOT_ICON, SLOT_LABEL, SLOT_ORDER, totalDigits } from './util';
import './base.css';

// ───────────────────────────── Zagroda ─────────────────────────────

export function penPanel(ctx: UiContext, cards: CreatureCard[]): Promise<PenAction> {
  const done = once<PenAction>();
  const shell = openShell(ctx, {
    theme: 'pen',
    title: 'Zagroda',
    icon: '🐾',
    subtitle: cards.length ? `Twoje stworki: ${cards.length}` : 'Jeszcze pusto',
    onClose: () => finish({ kind: 'close' }),
  });
  const finish = (a: PenAction): void => {
    done.resolve(a);
    void shell.close();
  };

  shell.body.classList.add('pen-body');
  if (!cards.length) {
    shell.body.append(
      h('div', { class: 'pn-empty' }, h('span', { class: 'pn-empty-ic' }, '🌱'), 'Jeszcze nie masz stworków.', h('br'), 'Złap je na Łące!'),
    );
    return done.promise;
  }

  const grid = h('div', { class: 'pen-grid' });
  for (const c of cards) {
    const portrait = portraitBox(ctx, `creature:${c.id}`, { cls: 'pen-portrait', fallback: c.name.slice(0, 1) });
    const action = c.canFeed
      ? button(h('span', null, h('span', { class: 'pn-btn-ic' }, '🍎'), 'Nakarm'), () => {
          ctx.sfx('tap');
          finish({ kind: 'feed', creatureId: c.id });
        }, 'btn-good pen-feed')
      : h('div', { class: 'pen-fed' }, h('span', { attrs: { 'aria-hidden': 'true' } }, '😊'), 'Najedzony');
    grid.append(
      h(
        'article',
        { class: `pen-card r-${c.rarity}`, attrs: { 'aria-label': `${c.name}. ${c.description}` } },
        h('div', { class: `pen-rar pn-rar r-${c.rarity}` }, RARITY_LABEL[c.rarity]),
        portrait,
        h('h3', { class: 'pen-name' }, c.name),
        h('div', { class: 'pen-level' }, levelStars(c.level, 3), h('span', { class: 'pen-level-t' }, `Poziom ${c.level}`)),
        h(
          'ul',
          { class: 'pen-info' },
          h('li', null, h('span', { class: 'pen-ic', attrs: { 'aria-hidden': 'true' } }, '🔢'), h('span', null, c.productionText)),
          h('li', null, h('span', { class: 'pen-ic', attrs: { 'aria-hidden': 'true' } }, '✨'), h('span', null, c.powerText)),
        ),
        h('div', { class: 'pen-action' }, action),
      ),
    );
  }
  shell.body.append(scroller('pen-scroll', grid));
  return done.promise;
}

// ───────────────────────────── Skarbiec ─────────────────────────────

export function treasuryPanel(ctx: UiContext, digits: Digits): Promise<void> {
  const done = once<void>();
  const total = totalDigits(digits);
  const shell = openShell(ctx, {
    theme: 'treasury',
    title: 'Skarbiec',
    icon: '💰',
    subtitle: 'Cyfry do bramy i kuźni',
    onClose: () => {
      done.resolve();
      void shell.close();
    },
  });
  shell.headExtra.append(h('div', { class: 'pn-pill tr-total' }, 'Razem: ', h('b', null, digitsWord(total))));

  const group = (label: string, cls: string, list: number[], note: string): HTMLElement =>
    h(
      'section',
      { class: `tr-group ${cls}` },
      h('header', { class: 'tr-group-h' }, h('span', { class: 'tr-group-l' }, label), h('span', { class: 'tr-group-n' }, note)),
      h(
        'div',
        { class: 'tr-row' },
        ...list.map(d => {
          const n = digits[d] ?? 0;
          return h(
            'div',
            { class: `tr-cell${n === 0 ? ' is-empty' : ''}` },
            digitTile(d, { cls: `tr-tile${n === 0 ? ' is-empty' : ''}` }),
            h('div', { class: 'tr-count' }, `×${n}`),
          );
        }),
      ),
    );

  shell.body.classList.add('tr-body');
  shell.body.append(
    h('div', { class: 'tr-rows' }, group('Pospolite', 'r-common', [1, 2, 3, 4, 5], 'budulec')),
    h(
      'div',
      { class: 'tr-rows tr-rows-2' },
      group('Niezwykłe', 'r-uncommon', [6, 7, 8, 9], 'duże liczby'),
      group('Rzadkie', 'r-rare', [0], 'pełne dziesiątki'),
    ),
    h(
      'p',
      { class: 'tr-note' },
      h('span', { attrs: { 'aria-hidden': 'true' } }, '💡 '),
      'Cyfry dają stworki, skrzynie i brainglamy. Wydajesz je w bramie i w kuźni.',
    ),
  );
  return done.promise;
}

// ───────────────────────────── Kuźnia ─────────────────────────────

export function forgePanel(ctx: UiContext, items: ItemCard[], digits: Digits): Promise<ForgeAction> {
  const done = once<ForgeAction>();
  const shell = openShell(ctx, {
    theme: 'forge',
    title: 'Kuźnia',
    icon: '⚒️',
    subtitle: 'Załóż i ulepszaj sprzęt',
    onClose: () => finish({ kind: 'close' }),
  });
  const finish = (a: ForgeAction): void => {
    done.resolve(a);
    void shell.close();
  };
  shell.headExtra.append(digitStrip(digits, 'Masz:'));

  const cols = h('div', { class: 'fg-cols' });
  for (const slot of SLOT_ORDER) {
    const list = items.filter(i => i.slot === slot).sort((a, b) => Number(b.equipped) - Number(a.equipped));
    const col = h(
      'section',
      { class: 'fg-col' },
      h('header', { class: 'fg-col-h' }, h('span', { class: 'fg-col-ic', attrs: { 'aria-hidden': 'true' } }, SLOT_ICON[slot]), SLOT_LABEL[slot]),
    );
    if (!list.length) col.append(h('div', { class: 'fg-none' }, 'Jeszcze nic tu nie masz.'));
    for (const it of list) col.append(itemCard(it));
    cols.append(col);
  }
  shell.body.classList.add('fg-body');
  shell.body.append(scroller('fg-scroll', cols));
  return done.promise;

  function itemCard(it: ItemCard): HTMLElement {
    const pips = h('span', { class: 'fg-pips', attrs: { 'aria-label': `poziom ${it.level} z ${it.maxLevel}` } });
    for (let i = 1; i <= it.maxLevel; i++) pips.append(h('span', { class: i <= it.level ? 'on' : 'off' }));
    const actions = h('div', { class: 'fg-actions' });
    if (!it.equipped) {
      actions.append(button('Załóż', () => finish({ kind: 'equip', itemId: it.id }), 'btn-primary fg-btn'));
    }
    if (it.upgrade) {
      const { sum, count } = it.upgrade;
      const can = canComposeSum(digits, sum, count);
      const up = button(
        h('span', null, h('span', { class: 'pn-btn-ic' }, '🔨'), `Ulepsz (złóż ${sum} z ${count})`),
        () => finish({ kind: 'upgrade', itemId: it.id }),
        'btn-good fg-btn fg-up',
      );
      up.disabled = !can;
      actions.append(up);
      if (!can) actions.append(h('div', { class: 'fg-lack' }, 'Za mało cyfr w Skarbcu'));
    } else {
      actions.append(h('div', { class: 'fg-max' }, '⭐ Maks. poziom'));
    }
    return h(
      'article',
      { class: `fg-item r-${it.rarity}${it.equipped ? ' is-equipped' : ''}` },
      it.equipped ? h('div', { class: 'fg-badge' }, '✔ Założone') : null,
      h('h3', { class: 'fg-name' }, it.name),
      h('div', { class: 'fg-meta' }, h('span', { class: `pn-rar r-${it.rarity}` }, RARITY_LABEL[it.rarity]), pips),
      h('p', { class: 'fg-desc' }, it.description),
      actions,
    );
  }
}

// ───────────────────────────── Galeria Brainglamów ─────────────────────────────

const LAND_NAME: Record<LandId, string> = {
  meadow: 'Łąka',
  cave: 'Jaskinia',
  volcano: 'Wulkan',
  castle: 'Zamek',
  ice: 'Lodowa Kraina',
};
const LAND_ICON: Record<LandId, string> = { meadow: '🌼', cave: '🪨', volcano: '🌋', castle: '🏰', ice: '❄️' };

export function galleryPanel(ctx: UiContext, cards: GlamCard[]): Promise<void> {
  const done = once<void>();
  const got = cards.filter(c => c.glamName !== null).length;
  const shell = openShell(ctx, {
    theme: 'gallery',
    title: 'Galeria Brainglamów',
    icon: '✨',
    subtitle: 'Odczarowane brainroty — twoi przyjaciele',
    onClose: () => {
      done.resolve();
      void shell.close();
    },
  });
  shell.headExtra.append(h('div', { class: 'pn-pill gl-total' }, '💖 ', h('b', null, `${got}/${cards.length}`)));

  const lands: LandId[] = [];
  for (const c of cards) if (!lands.includes(c.land)) lands.push(c.land);
  const wrap = h('div', { class: 'gl-wrap' });
  for (const land of lands) {
    const list = cards.filter(c => c.land === land);
    const have = list.filter(c => c.glamName !== null).length;
    const grid = h('div', { class: 'gl-grid' });
    for (const c of list) grid.append(glamCard(c));
    wrap.append(
      h(
        'section',
        { class: 'gl-land' },
        h('h3', { class: 'gl-land-h' }, h('span', { attrs: { 'aria-hidden': 'true' } }, LAND_ICON[land]), ` ${LAND_NAME[land]} `, h('span', { class: 'gl-land-n' }, `${have}/${list.length}`)),
        grid,
      ),
    );
  }
  if (!cards.length) wrap.append(h('div', { class: 'pn-empty' }, h('span', { class: 'pn-empty-ic' }, '🪄'), 'Odczaruj pierwszego brainrota!'));
  shell.body.classList.add('gl-body');
  shell.body.append(scroller('gl-scroll', wrap));
  return done.promise;

  function glamCard(c: GlamCard): HTMLElement {
    const known = c.glamName !== null;
    const portrait = known
      ? portraitBox(ctx, `glam:${c.enemyId}`, { cls: 'gl-portrait', fallback: (c.glamName ?? '?').slice(0, 1) })
      : portraitBox(ctx, `enemy:${c.enemyId}`, { cls: 'gl-portrait', fallback: '', silhouette: true });
    if (!known) portrait.append(h('span', { class: 'gl-q', attrs: { 'aria-hidden': 'true' } }, '?'));
    const el = h(
      'article',
      { class: `gl-card${known ? ' is-known' : ' is-unknown'}`, attrs: { role: known ? 'button' : 'img' } },
      known && c.count > 0 ? h('div', { class: 'gl-count', attrs: { 'aria-label': `odczarowany ${c.count} razy` } }, `×${c.count}`) : null,
      portrait,
      h('h4', { class: 'gl-name' }, known ? (c.glamName ?? '') : '???'),
      h('div', { class: 'gl-sub' }, known ? `dawniej: ${c.brainrotName}` : `Odczaruj: ${c.brainrotName}`),
    );
    if (known) {
      shell.onDispose(
        onTap(el, () => {
          ctx.sfx('tap');
          el.classList.remove('gl-dance');
          void el.offsetWidth;
          el.classList.add('gl-dance');
        }),
      );
    }
    return el;
  }
}

// ───────────────────────────── Tablica Wypraw ─────────────────────────────

export function expeditionsPanel(ctx: UiContext, lands: LandCard[]): Promise<LandId | null> {
  const done = once<LandId | null>();
  const shell = openShell(ctx, {
    theme: 'expeditions',
    title: 'Tablica Wypraw',
    icon: '🗺️',
    subtitle: 'Dokąd wyruszamy?',
    onClose: () => finish(null),
  });
  const finish = (v: LandId | null): void => {
    done.resolve(v);
    void shell.close();
  };

  const row = h('div', { class: 'ex-row' });
  for (const l of lands) {
    const scene = h(
      'div',
      { class: `ex-scene ex-scene-${l.id}` },
      h('span', { class: 'ex-scene-ic', attrs: { 'aria-hidden': 'true' } }, LAND_ICON[l.id]),
      l.bossDefeated ? h('div', { class: 'ex-boss' }, '👑 Boss pokonany') : null,
      l.unlocked ? null : h('div', { class: 'ex-lock' }, lockIcon(38)),
    );
    const card = h(
      'article',
      { class: `ex-card${l.unlocked ? ' is-open' : ' is-locked'}`, attrs: { role: 'button', 'aria-disabled': String(!l.unlocked) } },
      scene,
      h('h3', { class: 'ex-name' }, l.name),
      h('div', { class: 'ex-sub' }, l.subtitle),
      l.unlocked
        ? h('div', { class: 'btn btn-good btn-big ex-go' }, 'Wyrusz!')
        : h('div', { class: 'ex-soon' }, 'Wkrótce'),
    );
    if (l.unlocked) {
      shell.onDispose(
        onTap(card, () => {
          ctx.sfx('whoosh');
          finish(l.id);
        }),
      );
    }
    row.append(card);
  }
  shell.body.classList.add('ex-body');
  shell.body.append(scroller('ex-scroll', row));
  return done.promise;
}
