/**
 * Rekwizyty 'prop:<PropKind>': skrzynia, brama, portal, ognisko, kowadło, skarbiec, tablica, podium,
 * pnącze (faza 2 bossa), latarnia, grzyb, kryształ, legowisko, drogowskaz.
 * Większość animuje się tylko w idle/open/hit/hide; 'open' i (dla pnącza) 'hit' trzymają stan.
 */
import type { PropKind } from '../../../game/contracts';
import { TAU, bump, easeOutBack, easeOutCubic, ramp, squash } from '../anim';
import * as THREE from 'three';
import type { ModelBuilder, V3 } from '../builder';
import type { MotionFn, PoseWriter } from '../rig';
import type { ModelDef } from './common';
import { eyePair, pixelNumber, WHITE } from './common';

const STONE = '#9aa3ad';
const STONE_DARK = '#7d8691';
const STONE_LIGHT = '#b8c0c8';
const WOOD = '#b5733a';
const WOOD_DARK = '#7a4a25';
const WOOD_LIGHT = '#d19357';
const GOLD = '#ffcf40';
const MOSS = '#6cc04a';
const GRASS = '#6cc04a';
const DIRT = '#8b5e3c';

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _qq = new THREE.Quaternion();
const _ee = new THREE.Euler();

/** Łańcuch kostek wzdłuż łamanej (korzenie, pnącza); grubość maleje od t0 do t1. */
function rootPath(b: ModelBuilder, pivot: string, pts: readonly V3[], t0: number, t1: number, color: string): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    if (!a || !c) continue;
    _dir.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const len = _dir.length();
    _dir.normalize();
    _qq.setFromUnitVectors(_up, _dir);
    _ee.setFromQuaternion(_qq);
    const t = t0 + (t1 - t0) * (i / Math.max(1, pts.length - 2));
    b.box(pivot, [t, len + t * 0.6, t], [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], color, { rot: [_ee.x, _ee.y, _ee.z] });
  }
}

/** Wspólna reakcja rekwizytu na cios: krótkie „drgnięcie”. */
const propHit: MotionFn = (c, w) => {
  if (c.anim === 'hit') {
    const k = bump(c.p, 0, 1);
    const [sx, sy, sz] = squash(-0.08 * k);
    w.scale('all', sx, sy, sz);
    w.rot('all', 0, 0, 0.05 * Math.sin(c.p * 30) * (1 - c.p));
  }
};

/** Pojawianie się/chowanie rekwizytu (skala). */
const propShowHide: MotionFn = (c, w) => {
  if (c.anim === 'hide') w.scale('all', Math.max(0.0001, 1 - easeOutCubic(c.p)));
  if (c.anim === 'appear') w.scale('all', Math.max(0.0001, easeOutBack(c.p, 2)));
};

function stoneBlocks(b: ModelBuilder, pivot: string, x: number, y0: number, y1: number, w: number, d: number, seed: number): void {
  // pionowy filar z „cegieł” o lekko różnych odcieniach
  const cols = [STONE, STONE_DARK, STONE_LIGHT, STONE];
  let y = y0;
  let i = seed;
  while (y < y1 - 0.01) {
    const h = Math.min(0.5, y1 - y);
    const off = ((i * 37) % 5) * 0.012 - 0.024;
    b.box(pivot, [w + off, h - 0.02, d + off], [x, y + h / 2, 0], cols[i % cols.length] ?? STONE, { shade: 0.85 });
    y += h;
    i++;
  }
}

// ───────────────────────────── skrzynia ─────────────────────────────
const chest: ModelDef = {
  height: 0.9,
  radius: 0.55,
  holds: ['open', 'hide'],
  durations: { open: 0.8 },
  build(b) {
    b.pivot('lid', 'all', [0, 0.5, -0.35]);
    b.pivot('glowIn', 'all', [0, 0.46, 0]);
    b.box('all', [1.0, 0.5, 0.7], [0, 0.25, 0], WOOD, { shade: 0.8 });
    b.box('all', [1.01, 0.03, 0.71], [0, 0.18, 0], WOOD_DARK, { shade: 1 });
    b.box('all', [1.01, 0.03, 0.71], [0, 0.34, 0], WOOD_DARK, { shade: 1 });
    b.pair('all', 'all', [0.09, 0.52, 0.72], [0.36, 0.26, 0], GOLD, { shade: 0.85 });
    b.box('glowIn', [0.9, 0.06, 0.6], [0, 0.47, 0], '#ffd54a', { glow: 2.2 });
    // wieko
    b.box('lid', [1.02, 0.24, 0.72], [0, 0.62, 0], WOOD_LIGHT, { shade: 0.85 });
    b.box('lid', [0.92, 0.1, 0.6], [0, 0.78, 0], WOOD_LIGHT);
    b.pair('lid', 'lid', [0.09, 0.26, 0.74], [0.36, 0.62, 0], GOLD);
    b.pair('lid', 'lid', [0.09, 0.1, 0.62], [0.36, 0.78, 0], GOLD);
    b.box('lid', [0.18, 0.22, 0.07], [0, 0.52, 0.37], GOLD, { glow: 0.7 });
    b.box('lid', [0.06, 0.08, 0.02], [0, 0.5, 0.41], '#6b4a1a', { shade: 1 });
  },
  motions: () => [
    (c, w) => {
      let open = 0;
      if (c.anim === 'open') open = easeOutBack(ramp(c.p, 0.1, 0.8), 2.2);
      w.rot('lid', -1.95 * open, 0, 0);
      if (c.anim === 'open') {
        const hop = bump(c.p, 0, 0.25);
        w.pos('all', 0, 0.08 * hop, 0);
        w.scale('glowIn', 1, 1 + 0.4 * Math.sin(c.time * 6) * open, 1);
      } else {
        // zamknięta skrzynia czasem „podskoczy” (coś w środku!)
        const f = (c.time * 0.3) % 1;
        w.rot('lid', -0.08 * bump(f, 0, 0.05), 0, 0);
      }
    },
    propHit,
    propShowHide,
  ],
};

// ───────────────────────────── brama ─────────────────────────────
const gate: ModelDef = {
  height: 3.9,
  radius: 1.9,
  holds: ['open', 'hide'],
  durations: { open: 1.6 },
  receiveShadow: true,
  build(b) {
    b.pivot('doorL', 'all', [0.95, 0, 0.05]);
    b.pivot('doorR', 'all', [-0.95, 0, 0.05]);
    stoneBlocks(b, 'all', 1.4, 0, 3.0, 0.9, 0.9, 0);
    stoneBlocks(b, 'all', -1.4, 0, 3.0, 0.9, 0.9, 2);
    b.box('all', [3.9, 0.8, 1.0], [0, 3.4, 0], STONE, { shade: 0.85 });
    b.box('all', [0.6, 0.95, 1.08], [0, 3.45, 0], STONE_LIGHT);
    b.box('all', [3.6, 0.12, 1.1], [0, 2.95, 0], STONE_DARK);
    // mech
    b.box('all', [0.7, 0.1, 0.5], [-1.1, 3.83, 0.1], MOSS);
    b.box('all', [0.4, 0.08, 0.4], [1.3, 3.83, -0.1], MOSS);
    b.box('all', [0.3, 0.3, 0.06], [1.62, 0.6, 0.46], MOSS);
    // korzenie starego dębu oplatające kamień (łańcuchy kostek wzdłuż krzywych)
    const R = '#7a5230';
    const R2 = '#8f6a3f';
    rootPath(b, 'all', [[2.05, 0, 0.52], [1.8, 0.8, 0.52], [1.58, 1.6, 0.53], [1.72, 2.4, 0.54], [1.55, 3.1, 0.56], [1.0, 3.62, 0.56], [0.45, 3.78, 0.52]], 0.3, 0.1, R);
    rootPath(b, 'all', [[-2.05, 0, 0.48], [-1.75, 0.9, 0.52], [-1.25, 1.7, 0.53], [-1.52, 2.5, 0.54], [-1.3, 3.2, 0.56], [-0.72, 3.78, 0.52]], 0.3, 0.1, R2);
    rootPath(b, 'all', [[-2.0, 3.86, -0.05], [-1.0, 3.96, 0.12], [0, 3.9, 0.22], [1.0, 3.96, 0.1], [2.0, 3.84, -0.1]], 0.26, 0.2, R);
    rootPath(b, 'all', [[1.58, 1.6, 0.53], [1.2, 1.3, 0.55], [1.0, 1.0, 0.55]], 0.12, 0.06, R2);
    rootPath(b, 'all', [[-1.25, 1.7, 0.53], [-1.05, 2.2, 0.55], [-1.1, 2.6, 0.55]], 0.12, 0.06, R);
    rootPath(b, 'all', [[1.95, 0.2, -0.3], [2.25, 0.05, -0.5]], 0.22, 0.14, R2);
    rootPath(b, 'all', [[-1.95, 0.2, -0.3], [-2.3, 0.05, -0.55]], 0.22, 0.14, R);
    // liście dębu na szczycie
    for (const [x, z, k] of [[-1.3, 0.1, 0.5], [-0.5, -0.2, 0.42], [0.9, 0.05, 0.55], [1.6, -0.25, 0.4]] as const) {
      b.box('all', [k, k * 0.55, k], [x, 4.05, z], x < 0 ? '#5cb85c' : '#4fa84f', { rot: [0, x * 0.7, 0] });
    }
    // gniazda run (świecą; mocniej przy otwarciu)
    // gniazda run z symbolami działań: + − × =
    const RUNE = '#2fc6ff';
    const slots: [number, 'plus' | 'minus' | 'times' | 'eq'][] = [[-1.2, 'plus'], [-0.64, 'minus'], [0.64, 'times'], [1.2, 'eq']];
    for (const [x, sym] of slots) {
      b.box('all', [0.42, 0.42, 0.04], [x, 3.4, 0.51], '#3a4150', { shade: 1 });
      const rb = (w: number, h: number, dy: number, rz = 0): void => {
        b.box('all', [w, h, 0.05], [x, 3.4 + dy, 0.53], RUNE, { group: 'runes', shade: 1, rot: [0, 0, rz] });
      };
      if (sym === 'plus') {
        rb(0.26, 0.06, 0);
        rb(0.06, 0.26, 0);
      } else if (sym === 'minus') {
        rb(0.26, 0.06, 0);
      } else if (sym === 'times') {
        rb(0.28, 0.06, 0, 0.785);
        rb(0.28, 0.06, 0, -0.785);
      } else {
        rb(0.26, 0.06, 0.06);
        rb(0.26, 0.06, -0.06);
      }
    }
    // ciemność za bramą
    b.box('all', [1.9, 2.95, 0.05], [0, 1.475, -0.3], '#2a1454', { glow: 0.5 });
    // wrota
    for (const [door, s] of [['doorL', 1], ['doorR', -1]] as const) {
      b.box(door, [0.94, 2.92, 0.14], [s * 0.48, 1.46, 0.05], '#6e4a2e', { shade: 0.8 });
      for (const y of [0.5, 1.5, 2.5]) b.box(door, [0.96, 0.08, 0.16], [s * 0.48, y, 0.05], '#4a4f5a', { shade: 1 });
      b.box(door, [0.08, 0.2, 0.08], [s * 0.12, 1.4, 0.15], GOLD);
      // pierścień run przecięty szparą między wrotami (każde skrzydło ma swoją połowę)
      for (let k = 0; k < 10; k++) {
        const an = (k / 10) * TAU + Math.PI / 10;
        const x = Math.cos(an) * 0.42;
        if (Math.sign(x) !== s) continue;
        b.box(door, [0.1, 0.1, 0.03], [x, 1.85 + Math.sin(an) * 0.42, 0.135], '#2fc6ff', { group: 'runes', shade: 1, rot: [0, 0, an] });
      }
    }
  },
  motions: () => [
    (c, w, fx) => {
      let open = 0;
      if (c.anim === 'open') open = easeOutCubic(ramp(c.p, 0.3, 1));
      w.rot('doorL', 0, -1.7 * open, 0);
      w.rot('doorR', 0, 1.7 * open, 0);
      const pulse = 1.1 + 0.35 * Math.sin(c.time * 2.2);
      const burst = c.anim === 'open' ? 2.2 * bump(c.p, 0, 0.5) + 0.8 * ramp(c.p, 0.3, 1) : 0;
      fx.glowGroup('runes', '#2fc6ff', pulse + burst);
      if (c.anim === 'open') w.pos('all', 0.02 * Math.sin(c.p * 60) * bump(c.p, 0.25, 0.6), 0, 0);
    },
    propShowHide,
  ],
};

// ───────────────────────────── portal ─────────────────────────────
const portal: ModelDef = {
  height: 3.8,
  radius: 1.5,
  receiveShadow: true,
  build(b) {
    b.pivot('swirl', 'all', [0, 1.5, 0]);
    b.pivot('swirl2', 'all', [0, 1.5, 0]);
    b.box('all', [3.0, 0.2, 1.1], [0, 0.1, 0], STONE_DARK);
    stoneBlocks(b, 'all', 1.15, 0.2, 2.8, 0.55, 0.6, 1);
    stoneBlocks(b, 'all', -1.15, 0.2, 2.8, 0.55, 0.6, 3);
    b.box('all', [2.9, 0.45, 0.66], [0, 3.0, 0], STONE);
    b.box('all', [1.9, 0.35, 0.62], [0, 3.38, 0], STONE_LIGHT);
    b.box('all', [0.3, 0.4, 0.3], [0, 3.62, 0.1], '#7fe8ff', { glow: 2.4, rot: [0, 0.785, 0] });
    b.pair('all', 'all', [0.14, 0.14, 0.14], [0.6, 3.6, 0.2], '#b48cff', { glow: 2.2, rot: [0.6, 0.785, 0] });
    b.box('all', [0.5, 0.1, 0.4], [0.9, 2.8, 0.2], MOSS);
    b.box('all', [0.3, 0.3, 0.06], [-1.2, 0.7, 0.32], MOSS);
    // rdzeń
    b.box('all', [1.76, 2.62, 0.06], [0, 1.5, 0], '#5a44d8', { glow: 0.9 });
    b.box('all', [1.2, 2.0, 0.08], [0, 1.5, 0], '#8a74ff', { glow: 1.1 });
    const cols = ['#6ff3ff', '#ffffff', '#ff8ff5', '#b8a4ff'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r = 0.35 + (i % 3) * 0.17;
      b.box('swirl', [0.16, 0.16, 0.16], [Math.cos(a) * r, 1.5 + Math.sin(a) * r * 1.3, 0.08], cols[i % cols.length] ?? WHITE, {
        glow: 2.4,
        rot: [0, 0, a],
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.3;
      const r = 0.22 + (i % 2) * 0.35;
      b.box('swirl2', [0.1, 0.1, 0.1], [Math.cos(a) * r, 1.5 + Math.sin(a) * r * 1.3, 0.12], cols[(i + 1) % cols.length] ?? WHITE, { glow: 2.8 });
    }
  },
  motions: () => [
    (c, w) => {
      w.rot('swirl', 0, 0, -c.time * 1.4);
      w.rot('swirl2', 0, 0, c.time * 2.3);
      const k = 1 + 0.06 * Math.sin(c.time * 3);
      w.scale('swirl', k, k, 1);
    },
    propHit,
    propShowHide,
  ],
};

// ───────────────────────────── ognisko ─────────────────────────────
const campfire: ModelDef = {
  height: 0.9,
  radius: 0.65,
  build(b) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const col = i % 3 === 0 ? STONE_DARK : i % 3 === 1 ? STONE : STONE_LIGHT;
      b.box('all', [0.24, 0.16, 0.22], [Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5], col, { rot: [0, -a, 0] });
    }
    b.box('all', [0.14, 0.14, 0.8], [0, 0.1, 0], WOOD_DARK, { rot: [0, 0.6, 0] });
    b.box('all', [0.14, 0.14, 0.8], [0, 0.12, 0], '#8a5a30', { rot: [0, -0.6, 0] });
    b.box('all', [0.13, 0.13, 0.7], [0, 0.2, 0], WOOD_DARK, { rot: [0, 1.57, 0] });
    b.box('all', [0.3, 0.05, 0.3], [0, 0.03, 0], '#ff6a2a', { glow: 1.6 });
    // języki ognia: [nazwa, x, z, [podstawa w,h], [czubek w,h], kolor, kolor czubka]
    const flames: [string, number, number, number, number, number, number, string, string][] = [
      ['f0', 0, 0, 0.3, 0.26, 0.18, 0.22, '#ff6a00', '#ff8a00'],
      ['f1', -0.13, -0.07, 0.2, 0.2, 0.12, 0.14, '#ff3d00', '#ff6a00'],
      ['f2', 0.13, 0.08, 0.2, 0.22, 0.11, 0.15, '#ff3d00', '#ff6a00'],
      ['f3', 0.01, 0.04, 0.16, 0.3, 0.08, 0.14, '#ffb000', '#ffe27a'],
    ];
    for (const [name, x, z, bw, bh, tw, th, c1, c2] of flames) {
      b.pivot(name, 'all', [x, 0.16, z]);
      const glowK = name === 'f3' ? 1.5 : 1.25;
      b.box(name, [bw, bh, bw], [x, 0.16 + bh / 2, z], c1, { glow: glowK, rot: [0, 0.785, 0] });
      b.box(name, [tw, th, tw], [x, 0.16 + bh + th / 2 - 0.02, z], c2, { glow: glowK + 0.2, rot: [0, 0.785, 0] });
    }
    b.pivot('f4', 'all', [0.04, 0.6, 0]);
    b.box('f4', [0.06, 0.06, 0.06], [0.04, 0.66, 0], '#ffd23f', { glow: 2, rot: [0.6, 0.785, 0] });
  },
  motions: () => [
    (c, w) => {
      const t = c.time;
      ['f0', 'f1', 'f2', 'f3', 'f4'].forEach((f, i) => {
        const n = Math.sin(t * (9 + i * 2.3) + i * 1.7) * 0.5 + Math.sin(t * (14 + i) + i) * 0.5;
        w.scale(f, 1 + 0.1 * n, 1 + 0.28 * n, 1 + 0.1 * n);
        w.rot(f, 0, t * (1 + i * 0.3), 0.06 * n);
        if (i === 4) w.pos(f, 0.05 * Math.sin(t * 5), 0.35 * ((t * 1.1) % 1), 0.03 * Math.cos(t * 4));
      });
      if (c.anim === 'sleep' || c.anim === 'hide') {
        const k = c.anim === 'hide' ? Math.max(0.0001, 1 - c.p) : 0.4;
        for (const f of ['f0', 'f1', 'f2', 'f3', 'f4']) w.scale(f, k, k, k);
      }
    },
    propHit,
  ],
};

// ───────────────────────────── kowadło ─────────────────────────────
const anvil: ModelDef = {
  height: 1.0,
  radius: 0.5,
  build(b) {
    b.box('all', [0.7, 0.45, 0.7], [0, 0.225, 0], '#8b5a2b', { shade: 0.8 });
    b.box('all', [0.62, 0.02, 0.62], [0, 0.455, 0], '#c69a63', { shade: 1 });
    b.box('all', [0.3, 0.02, 0.3], [0, 0.467, 0], '#a87a45', { shade: 1 });
    const IRON = '#565d6b';
    b.box('all', [0.44, 0.12, 0.32], [0, 0.52, 0], '#474d59');
    b.box('all', [0.24, 0.16, 0.2], [0, 0.66, 0], IRON);
    b.box('all', [0.82, 0.18, 0.34], [0, 0.83, 0], '#5b6270', { shade: 0.85 });
    b.box('all', [0.22, 0.13, 0.22], [0.5, 0.85, 0], '#5b6270');
    b.box('all', [0.14, 0.09, 0.14], [0.64, 0.86, 0], '#5b6270');
    b.box('all', [0.78, 0.02, 0.3], [0, 0.925, 0], '#9aa4b5', { shade: 1 });
    // młotek oparty o pień
    b.box('all', [0.06, 0.5, 0.06], [-0.42, 0.26, 0.3], WOOD_LIGHT, { rot: [0, 0, 0.3] });
    b.box('all', [0.2, 0.12, 0.12], [-0.48, 0.5, 0.3], '#474d59', { rot: [0, 0, 0.3] });
    // żarzący się pręt
    b.box('all', [0.36, 0.05, 0.05], [0.05, 0.955, 0.05], '#ff7a2a', { glow: 2, rot: [0, 0.4, 0] });
  },
  motions: () => [
    (c, w) => {
      if (c.anim === 'hit' || c.anim === 'attack') {
        w.pos('all', 0, 0.05 * bump(c.p, 0, 0.4), 0);
      }
    },
    propHit,
    propShowHide,
  ],
};

// ───────────────────────────── skarbiec ─────────────────────────────
const treasury: ModelDef = {
  height: 2.7,
  radius: 1.3,
  receiveShadow: true,
  build(b) {
    b.pivot('sign', 'all', [0, 1.33, 0.96]);
    b.box('all', [2.3, 0.2, 2.1], [0, 0.1, 0], STONE_DARK);
    b.box('all', [2.0, 1.3, 1.8], [0, 0.85, 0], '#f3e2c0', { shade: 0.85 });
    for (const x of [-0.95, 0.95]) for (const z of [-0.85, 0.85]) b.box('all', [0.16, 1.32, 0.16], [x, 0.86, z], WOOD_DARK);
    b.box('all', [2.04, 0.12, 1.84], [0, 1.46, 0], WOOD_DARK);
    // dach schodkowy
    const ROOF = '#e0584f';
    const ROOF2 = '#c8453d';
    b.box('all', [2.5, 0.24, 2.3], [0, 1.64, 0], ROOF);
    b.box('all', [1.96, 0.24, 2.3], [0, 1.88, 0], ROOF2);
    b.box('all', [1.42, 0.24, 2.3], [0, 2.12, 0], ROOF);
    b.box('all', [0.88, 0.24, 2.3], [0, 2.36, 0], ROOF2);
    b.box('all', [0.4, 0.16, 2.36], [0, 2.56, 0], GOLD);
    // drzwi, okna
    b.box('all', [0.62, 0.95, 0.05], [0, 0.68, 0.91], '#6b4226');
    b.box('all', [0.5, 0.06, 0.06], [0, 0.95, 0.94], '#4a2d18', { shade: 1 });
    b.box('all', [0.07, 0.07, 0.05], [0.18, 0.66, 0.95], GOLD, { glow: 0.8 });
    for (const x of [-0.66, 0.66]) {
      b.box('all', [0.38, 0.38, 0.04], [x, 0.9, 0.91], WOOD_DARK);
      b.box('all', [0.28, 0.28, 0.05], [x, 0.9, 0.915], '#ffd978', { glow: 0.9 });
      b.box('all', [0.04, 0.3, 0.06], [x, 0.9, 0.93], WOOD_DARK, { shade: 1 });
    }
    // złoty szyld z cyframi
    b.box('sign', [1.25, 0.42, 0.07], [0, 1.33, 0.96], '#5a3a22');
    b.box('sign', [1.31, 0.05, 0.08], [0, 1.555, 0.96], GOLD, { glow: 0.7 });
    b.box('sign', [1.31, 0.05, 0.08], [0, 1.105, 0.96], GOLD, { glow: 0.7 });
    pixelNumber(b, 'sign', '123', [0, 1.33, 1.005], 0.058, '#ffd54a', { glow: 1.8 });
    // stosik złotych kostek-cyfr przed wejściem
    b.box('all', [0.2, 0.2, 0.2], [0.72, 0.3, 1.2], GOLD, { glow: 0.5, rot: [0, 0.3, 0] });
    b.box('all', [0.2, 0.2, 0.2], [0.94, 0.3, 1.25], GOLD, { glow: 0.5, rot: [0, -0.2, 0] });
    b.box('all', [0.2, 0.2, 0.2], [0.82, 0.5, 1.22], GOLD, { glow: 0.5, rot: [0, 0.6, 0] });
  },
  motions: () => [
    (c, w) => {
      w.rot('sign', 0, 0, 0.015 * Math.sin(c.time * 1.5));
      if (c.anim === 'open' || c.anim === 'cheer') {
        const k = bump(c.p, 0, 1);
        w.scale('sign', 1 + 0.12 * k);
      }
    },
    propHit,
    propShowHide,
  ],
};

// ───────────────────────────── tablica wypraw ─────────────────────────────
const board: ModelDef = {
  height: 2.3,
  radius: 1.1,
  build(b) {
    b.pair('all', 'all', [0.14, 2.05, 0.14], [0.95, 1.02, 0], WOOD_DARK);
    b.box('all', [2.1, 1.35, 0.1], [0, 1.45, 0], WOOD, { shade: 0.85 });
    b.box('all', [1.86, 1.12, 0.03], [0, 1.45, 0.06], '#f6e7c1', { shade: 1 });
    b.box('all', [2.3, 0.12, 0.34], [0, 2.18, 0.04], '#e0584f');
    b.box('all', [2.1, 0.1, 0.3], [0, 2.1, 0.04], '#c8453d');
    // mapa
    const z = 0.08;
    const M = (w: number, h: number, x: number, y: number, col: string, o: { rot?: number; glow?: number } = {}): void => {
      b.box('all', [w, h, 0.012], [x, 1.45 + y, z], col, { shade: 1, rot: [0, 0, o.rot ?? 0], glow: o.glow });
    };
    M(1.7, 1.0, 0, 0, '#8fd3f5');
    M(0.8, 0.5, -0.35, 0.15, '#7ccf5a');
    M(0.5, 0.35, -0.2, -0.22, '#7ccf5a');
    M(0.45, 0.4, 0.45, 0.18, '#a9dc6a');
    M(0.3, 0.2, 0.55, -0.25, '#7ccf5a');
    M(0.18, 0.16, -0.45, 0.22, '#5aa845');
    M(0.14, 0.14, 0.48, 0.25, '#8a8f99', { rot: 0.785 });
    M(0.08, 0.08, 0.48, 0.3, WHITE, { rot: 0.785 });
    for (const [px, py] of [[-0.55, -0.05], [-0.4, 0.0], [-0.25, 0.04], [-0.1, 0.02], [0.05, -0.05], [0.2, -0.1], [0.34, -0.05]] as const) {
      M(0.045, 0.045, px, py, '#e0584f');
    }
    M(0.14, 0.035, 0.52, -0.02, '#e0584f', { rot: 0.785 });
    M(0.14, 0.035, 0.52, -0.02, '#e0584f', { rot: -0.785 });
    M(0.12, 0.12, -0.62, -0.1, GOLD, { rot: 0.785, glow: 1.2 });
    // pinezki
    for (const [px, py] of [[-0.85, 0.5], [0.85, 0.5], [-0.85, -0.5], [0.85, -0.5]] as const) {
      b.box('all', [0.06, 0.06, 0.04], [px, 1.45 + py, 0.1], '#ff5d7a');
    }
  },
  motions: () => [propHit, propShowHide],
};

// ───────────────────────────── podium ─────────────────────────────
const podium: ModelDef = {
  height: 0.5,
  radius: 0.75,
  receiveShadow: true,
  build(b) {
    const LILAC = '#d9c6ff';
    const LILAC2 = '#c4acf5';
    const CREAM = '#ffeef6';
    b.box('all', [1.5, 0.22, 1.0], [0, 0.11, 0], LILAC, { shade: 0.8 });
    b.box('all', [1.0, 0.22, 1.5], [0, 0.11, 0], LILAC, { shade: 0.8 });
    b.box('all', [1.3, 0.22, 1.3], [0, 0.11, 0], LILAC2, { shade: 0.8, rot: [0, 0.785, 0] });
    b.box('all', [1.06, 0.2, 0.74], [0, 0.32, 0], CREAM, { shade: 0.85 });
    b.box('all', [0.74, 0.2, 1.06], [0, 0.32, 0], CREAM, { shade: 0.85 });
    b.box('all', [0.92, 0.2, 0.92], [0, 0.32, 0], CREAM, { shade: 0.85, rot: [0, 0.785, 0] });
    b.box('all', [1.1, 0.05, 0.78], [0, 0.235, 0], GOLD, { glow: 0.5 });
    b.box('all', [0.78, 0.05, 1.1], [0, 0.235, 0], GOLD, { glow: 0.5 });
    b.box('all', [0.96, 0.05, 0.96], [0, 0.235, 0], GOLD, { glow: 0.5, rot: [0, 0.785, 0] });
    // klejnoty na bokach
    const gems: [number, number, string][] = [[0, 0.76, '#ff6fb5'], [0.76, 0, '#4fd2ff'], [-0.76, 0, '#a97cff'], [0, -0.76, '#56e8a0']];
    for (const [x, z, c] of gems) b.box('all', [0.12, 0.12, 0.12], [x, 0.12, z], c, { glow: 1.1, rot: [0, 0.785, 0.785] });
  },
  motions: () => [propHit, propShowHide],
};

// ───────────────────────────── pnącze (boss, faza 2) ─────────────────────────────
const vine: ModelDef = {
  height: 1.8,
  radius: 0.4,
  holds: ['hit', 'hide'],
  durations: { hit: 0.9, hide: 0.9, appear: 0.8 },
  build(b) {
    const V = '#2f8f3a';
    const V2 = '#256f2e';
    const THORN = '#b8325a';
    b.box('all', [0.7, 0.12, 0.6], [0, 0.06, 0], DIRT);
    b.box('all', [0.3, 0.1, 0.24], [0.2, 0.1, 0.1], '#7a5236');
    b.pivot('v1', 'all', [0, 0.1, 0]);
    b.pivot('v2', 'v1', [0, 0.62, 0.05]);
    b.pivot('v3', 'v2', [0, 1.1, 0.12]);
    b.box('v1', [0.24, 0.56, 0.24], [0, 0.37, 0.02], V, { group: 'vine' });
    b.box('v2', [0.2, 0.52, 0.2], [0, 0.86, 0.08], V2, { group: 'vine' });
    b.box('v3', [0.17, 0.3, 0.17], [0, 1.25, 0.14], V, { group: 'vine' });
    // kolce
    const thorns: [string, number, number, number, number][] = [
      ['v1', 0.14, 0.3, 0.02, -1],
      ['v1', -0.14, 0.5, 0.02, 1],
      ['v2', 0.12, 0.8, 0.08, -1],
      ['v2', -0.12, 0.98, 0.08, 1],
      ['v1', 0, 0.42, 0.15, 0],
    ];
    for (const [pv, x, y, z, s] of thorns) {
      b.box(pv, [0.08, 0.08, 0.08], [x, y, z], THORN, { rot: [0.785, s * 0.4, 0.785], group: 'vine' });
    }
    // liście
    b.box('v1', [0.34, 0.05, 0.16], [0.26, 0.55, 0.02], '#5cc24a', { rot: [0, 0, 0.35], group: 'vine' });
    b.box('v2', [0.3, 0.05, 0.15], [-0.24, 0.9, 0.08], '#5cc24a', { rot: [0, 0, -0.35], group: 'vine' });
    // pąk z oczkami
    b.pivot('bud', 'v3', [0, 1.4, 0.14]);
    b.box('bud', [0.32, 0.34, 0.3], [0, 1.55, 0.16], '#8e3bd6', { group: 'vine', shade: 0.8 });
    b.box('bud', [0.22, 0.12, 0.22], [0, 1.76, 0.16], '#b56bff', { group: 'vine' });
    b.pair('bud', 'bud', [0.1, 0.1, 0.12], [0.16, 1.4, 0.18], '#5cc24a', { rot: [0, 0, 0.6], group: 'vine' });
    eyePair(b, 'bud', { y: 1.56, z: 0.315, dx: 0.075, w: 0.07, h: 0.08, color: '#ffe14d' });
    b.pair('bud', 'bud', [0.09, 0.03, 0.02], [0.075, 1.625, 0.315], '#2a0f3a', { rot: [0, 0, 0.35], shade: 1 });
  },
  motions: () => [
    (c, w, fx) => {
      const { time, p } = c;
      w.rot('v1', 0, 0, 0.06 * Math.sin(time * 1.4));
      w.rot('v2', 0.05 * Math.sin(time * 1.1), 0, 0.1 * Math.sin(time * 1.4 - 0.6));
      w.rot('v3', 0.06 * Math.sin(time * 1.3), 0, 0.14 * Math.sin(time * 1.4 - 1.2));
      w.rot('bud', 0, 0.3 * Math.sin(time * 0.7), 0);
      let wilt = 0;
      if (c.anim === 'hit') wilt = easeOutCubic(ramp(p, 0, 0.8));
      if (c.anim === 'hide') wilt = easeOutCubic(ramp(p, 0, 0.5));
      if (c.anim === 'windup' || c.anim === 'attack') w.rot('v3', -0.3 - 0.4 * bump(p, 0.3, 0.7), 0, 0);
      if (wilt > 0) {
        w.rot('v2', 0.55 * wilt, 0, 0.2 * wilt);
        w.rot('v3', 0.7 * wilt, 0, 0.25 * wilt);
        w.rot('bud', 0.6 * wilt, 0, 0);
        w.scale('bud', 1 - 0.3 * wilt);
        fx.tintGroup('vine', 1 - 0.15 * wilt, 1 - 0.45 * wilt, 1 - 0.7 * wilt);
        fx.glowGroup('vine', '#6b4212', 0.45 * wilt);
        fx.flash(c.anim === 'hit' ? 0.6 * (1 - ramp(p, 0, 0.35)) : 0);
      }
      if (c.anim === 'hide') {
        const s = Math.max(0.0001, 1 - easeOutCubic(ramp(p, 0.35, 1)));
        w.scale('v1', s);
      }
      if (c.anim === 'appear') {
        w.scale('v1', Math.max(0.0001, easeOutBack(ramp(p, 0, 0.8), 2.2)));
      }
    },
  ],
};

// ───────────────────────────── latarnia ─────────────────────────────
const lantern: ModelDef = {
  height: 1.75,
  radius: 0.3,
  build(b) {
    b.box('all', [0.32, 0.1, 0.32], [0, 0.05, 0], STONE_DARK);
    b.box('all', [0.12, 1.6, 0.12], [0, 0.85, 0], '#5a3a22');
    b.box('all', [0.52, 0.08, 0.08], [0.2, 1.6, 0], '#5a3a22');
    b.pivot('lamp', 'all', [0.4, 1.56, 0]);
    const M = '#3a3a44';
    b.box('lamp', [0.03, 0.12, 0.03], [0.4, 1.5, 0], M);
    b.box('lamp', [0.28, 0.06, 0.28], [0.4, 1.42, 0], M);
    b.box('lamp', [0.16, 0.06, 0.16], [0.4, 1.47, 0], M);
    b.box('lamp', [0.2, 0.26, 0.2], [0.4, 1.25, 0], '#ffcf6b', { group: 'light', shade: 1 });
    b.box('lamp', [0.26, 0.05, 0.26], [0.4, 1.1, 0], M);
    for (const [dx, dz] of [[0.11, 0.11], [-0.11, 0.11], [0.11, -0.11], [-0.11, -0.11]] as const) {
      b.box('lamp', [0.035, 0.28, 0.035], [0.4 + dx, 1.25, dz], M);
    }
  },
  motions: () => [
    (c, w, fx) => {
      const t = c.time;
      w.rot('lamp', 0.04 * Math.sin(t * 1.3), 0, 0.07 * Math.sin(t * 1.7));
      const fl = 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 23 + 1) + 0.04 * Math.sin(t * 7);
      fx.glowGroup('light', '#ffb347', c.anim === 'sleep' ? 0.3 : 2.1 + fl * 3);
    },
    propHit,
    propShowHide,
  ],
};

// ───────────────────────────── grzyb (świecący) ─────────────────────────────
const mushroom: ModelDef = {
  height: 0.65,
  radius: 0.35,
  build(b) {
    b.box('all', [0.18, 0.36, 0.18], [0, 0.18, 0], '#f3ead2');
    b.box('all', [0.58, 0.18, 0.58], [0, 0.43, 0], '#2f9bff', { group: 'cap', shade: 0.75 });
    b.box('all', [0.38, 0.1, 0.38], [0, 0.56, 0], '#4fb4ff', { group: 'cap' });
    b.box('all', [0.5, 0.03, 0.5], [0, 0.33, 0], '#bfe8ff', { glow: 1.2 });
    for (const [x, z] of [[0.18, 0.1], [-0.12, -0.16], [0.02, 0.22], [-0.2, 0.12]] as const) {
      b.box('all', [0.08, 0.02, 0.08], [x, 0.525, z], '#e8fbff', { glow: 1.6 });
    }
    // mniejszy obok
    b.box('all', [0.1, 0.2, 0.1], [0.3, 0.1, 0.15], '#f3ead2');
    b.box('all', [0.3, 0.1, 0.3], [0.3, 0.24, 0.15], '#9a6bff', { group: 'cap' });
  },
  motions: () => [
    (c, w, fx) => {
      fx.glowGroup('cap', '#3aa0ff', 0.55 + 0.25 * Math.sin(c.time * 1.8));
      w.scale('all', 1, 1 + 0.02 * Math.sin(c.time * 1.8), 1);
    },
    propHit,
    propShowHide,
  ],
};

// ───────────────────────────── kryształ ─────────────────────────────
const crystal: ModelDef = {
  height: 1.1,
  radius: 0.4,
  build(b) {
    b.box('all', [0.7, 0.2, 0.6], [0, 0.1, 0], '#6f7682', { shade: 0.8 });
    b.box('all', [0.4, 0.12, 0.3], [0.2, 0.2, -0.1], '#838a96');
    const C1 = '#a77bff';
    const C2 = '#5fd8ff';
    b.box('all', [0.22, 0.78, 0.22], [0, 0.56, 0], C1, { rot: [0.08, 0.4, 0.12], group: 'crystal' });
    b.box('all', [0.16, 0.16, 0.16], [-0.05, 0.98, 0.03], C1, { rot: [0.785, 0.4, 0.785], group: 'crystal' });
    b.box('all', [0.16, 0.55, 0.16], [0.22, 0.42, 0.06], C2, { rot: [0, 0.2, -0.45], group: 'crystal' });
    b.box('all', [0.12, 0.12, 0.12], [0.35, 0.66, 0.06], C2, { rot: [0.785, 0.2, 0.785], group: 'crystal' });
    b.box('all', [0.14, 0.45, 0.14], [-0.2, 0.36, -0.06], C2, { rot: [0.1, -0.3, 0.5], group: 'crystal' });
    b.box('all', [0.12, 0.3, 0.12], [0.05, 0.28, 0.22], C1, { rot: [0.5, 0, 0.1], group: 'crystal' });
  },
  motions: () => [
    (c, _w: PoseWriter, fx) => {
      fx.glowGroup('crystal', '#8a6bff', 0.75 + 0.3 * Math.sin(c.time * 2.1));
    },
    propHit,
    propShowHide,
  ],
};

// ───────────────────────────── legowisko ─────────────────────────────
const den: ModelDef = {
  height: 0.7,
  radius: 0.9,
  build(b) {
    b.box('all', [1.6, 0.22, 1.4], [0, 0.11, 0], DIRT, { shade: 0.8 });
    b.box('all', [1.62, 0.06, 1.42], [0, 0.24, 0], GRASS);
    b.box('all', [1.1, 0.2, 1.0], [0, 0.37, -0.05], DIRT, { shade: 0.8 });
    b.box('all', [1.12, 0.06, 1.02], [0, 0.48, -0.05], GRASS);
    b.box('all', [0.6, 0.14, 0.52], [0.05, 0.58, -0.1], DIRT);
    b.box('all', [0.62, 0.05, 0.54], [0.05, 0.66, -0.1], '#7dd058');
    // wejście do nory
    b.box('all', [0.46, 0.34, 0.06], [0, 0.26, 0.71], '#2a1a10', { shade: 1 });
    b.box('all', [0.3, 0.12, 0.06], [0, 0.46, 0.71], '#2a1a10', { shade: 1 });
    for (const [x, y] of [[-0.3, 0.12], [-0.3, 0.3], [-0.2, 0.46], [0, 0.55], [0.2, 0.46], [0.3, 0.3], [0.3, 0.12]] as const) {
      b.box('all', [0.13, 0.12, 0.1], [x, y, 0.73], y > 0.4 ? STONE_LIGHT : STONE, { rot: [0, 0, x * 2] });
    }
    // kępki trawy i kwiatki
    for (const [x, z] of [[0.6, 0.5], [-0.62, 0.3], [0.5, -0.5], [-0.4, -0.55], [0.35, 0.1]] as const) {
      b.box('all', [0.05, 0.16, 0.05], [x, 0.33, z], '#9be86b', { rot: [0.2, 0, 0.3] });
      b.box('all', [0.05, 0.12, 0.05], [x + 0.05, 0.31, z], '#5cc24a', { rot: [-0.2, 0, -0.3] });
    }
    b.box('all', [0.08, 0.08, 0.08], [-0.35, 0.56, 0.2], '#ff8fc0');
    b.box('all', [0.08, 0.08, 0.08], [0.3, 0.72, -0.05], '#fff3a0');
  },
  motions: () => [propHit, propShowHide],
};

// ───────────────────────────── drogowskaz ─────────────────────────────
const sign: ModelDef = {
  height: 1.35,
  radius: 0.3,
  build(b) {
    b.box('all', [0.13, 1.25, 0.13], [0, 0.62, 0], WOOD_DARK);
    b.pivot('board', 'all', [0, 1.05, 0.08]);
    b.box('board', [0.78, 0.3, 0.06], [0.12, 1.05, 0.08], WOOD_LIGHT, { shade: 0.85 });
    b.box('board', [0.22, 0.22, 0.06], [0.51, 1.05, 0.08], WOOD_LIGHT, { rot: [0, 0, 0.785] });
    b.box('board', [0.5, 0.05, 0.02], [0.08, 1.05, 0.115], '#6b4226', { shade: 1 });
    b.box('board', [0.12, 0.05, 0.02], [0.3, 1.09, 0.115], '#6b4226', { rot: [0, 0, -0.7], shade: 1 });
    b.box('board', [0.12, 0.05, 0.02], [0.3, 1.01, 0.115], '#6b4226', { rot: [0, 0, 0.7], shade: 1 });
    b.box('all', [0.2, 0.2, 0.2], [0, 0.1, 0], STONE);
  },
  motions: () => [
    (c, w) => {
      w.rot('board', 0, 0, 0.02 * Math.sin(c.time * 1.2));
    },
    propHit,
    propShowHide,
  ],
};

export const props: Record<PropKind, ModelDef> = {
  chest,
  gate,
  portal,
  campfire,
  anvil,
  treasury,
  board,
  podium,
  vine,
  lantern,
  mushroom,
  crystal,
  den,
  sign,
};
