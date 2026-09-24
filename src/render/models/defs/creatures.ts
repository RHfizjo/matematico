/**
 * Stworki Łąki (GDD 13.1): Plusik, Dopełniak, Bliźniak, Koniczynek.
 */
import { TAU, blink, bump, envelope, hop, ramp } from '../anim';
import { bodyMotion } from '../motion';
import { glowMaterial, solidMaterial } from '../materials';
import type { MotionFn } from '../rig';
import type { ModelDef } from './common';
import { cheeks, eyePair, INK, WHITE } from './common';

// ───────────────────────────── Plusik ─────────────────────────────
// Zielony kostkowy zajączek, uszy w kształcie „+”.

const P_GREEN = '#5fd35f';
const P_DARK = '#3fae48';
const P_LIGHT = '#a6f08f';
const P_EAR = '#8fe874';

export const plusik: ModelDef = {
  height: 1.15,
  radius: 0.4,
  build(b) {
    b.pivot('body', 'all', [0, 0.1, 0]);
    b.pivot('eyes', 'body', [0, 0.47, 0.33]);
    b.pivot('earL', 'body', [0.17, 0.66, -0.04]);
    b.pivot('earR', 'body', [-0.17, 0.66, -0.04]);
    b.pivot('tail', 'body', [0, 0.3, -0.33]);

    b.box('body', [0.7, 0.58, 0.64], [0, 0.39, 0], P_GREEN, { shade: 0.78 });
    b.box('body', [0.42, 0.26, 0.02], [0, 0.26, 0.325], P_LIGHT, { shade: 1 });
    // łapki
    b.pair('all', 'all', [0.18, 0.1, 0.24], [0.2, 0.05, 0.14], P_DARK);
    b.pair('all', 'all', [0.18, 0.1, 0.22], [0.2, 0.05, -0.17], P_DARK);
    b.pair('all', 'all', [0.14, 0.03, 0.04], [0.2, 0.08, 0.265], P_LIGHT, { shade: 1 });
    // twarz
    eyePair(b, 'eyes', { y: 0.47, z: 0.33, dx: 0.15, w: 0.11, h: 0.15 });
    b.box('body', [0.08, 0.055, 0.03], [0, 0.385, 0.335], '#ff7fa8', { shade: 1 });
    b.pair('body', 'body', [0.045, 0.065, 0.02], [0.026, 0.325, 0.33], WHITE, { shade: 1 });
    cheeks(b, 'body', { y: 0.37, z: 0.33, dx: 0.25, w: 0.1 });
    // ogonek-pompon
    b.box('tail', [0.2, 0.2, 0.14], [0, 0.3, -0.38], WHITE, { shade: 0.85 });
    // uszy „+”
    for (const [ear, x, tilt] of [['earL', 0.17, -0.22], ['earR', -0.17, 0.22]] as const) {
      b.box(ear, [0.1, 0.16, 0.1], [x, 0.74, -0.04], P_GREEN);
      b.box(ear, [0.13, 0.4, 0.11], [x + tilt * 0.3, 1.0, -0.04], P_EAR, { rot: [0, 0, tilt] });
      b.box(ear, [0.4, 0.13, 0.11], [x + tilt * 0.25, 1.0, -0.04], P_EAR, { rot: [0, 0, tilt] });
      b.box(ear, [0.07, 0.07, 0.02], [x + tilt * 0.25, 1.0, 0.02], '#ffc2d6', { rot: [0, 0, tilt], shade: 1 });
    }
  },
  motions: () => [
    bodyMotion({ amp: 1.1, wob: 0, walk: 'hop', h: 1.0, gait: 1.5 }),
    (c, w) => {
      const { time, t, seed } = c;
      // uszy: drganie + klapanie przy skokach
      let ex = 0.05 * Math.sin(time * 2.1 + seed * 5);
      let ez = 0.05 * Math.sin(time * 3.3 + seed * 3);
      const twitch = bump((time + seed * 9) % 4.2, 0, 0.25);
      if (c.anim === 'walk' || c.anim === 'dance') {
        const hp = t * (c.anim === 'walk' ? 1.5 * 1.35 : 2.2);
        ex += -0.4 * Math.cos(hp * TAU);
        ez += 0.1 * Math.sin(hp * TAU);
      } else if (c.anim === 'cheer') {
        ex += -0.35 * Math.cos(Math.min(1, c.p / 0.84) * 2 * TAU);
      } else if (c.anim === 'hit') {
        ex += -0.6 * envelope(c.p, 0, 0.1, 0.3, 1);
      } else if (c.anim === 'sleep') {
        ex += 0.7;
      } else if (c.anim === 'windup') {
        ex += -0.3;
      }
      w.rot('earL', ex, 0, ez - 0.3 * twitch);
      w.rot('earR', ex, 0, -ez + 0.1 * twitch);
      w.rot('tail', 0, 0.3 * Math.sin(time * 6), 0);
    },
  ],
};

// ───────────────────────────── Dopełniak ─────────────────────────────
// Ślimak; muszla ze spirali 10 segmentów, które zapalają się po kolei (liczenie do 10).

const D_BODY = '#8fe3c0';
const D_BODY_DARK = '#63c9a2';
const D_SEG_A = '#ffb46b';
const D_SEG_B = '#ff9448';
const D_CORE = '#e2742f';
const D_LIT = '#ffe56b';

export const dopelniak: ModelDef = {
  height: 1.05,
  radius: 0.45,
  build(b) {
    b.pivot('body', 'all', [0, 0, 0]);
    b.pivot('head', 'body', [0, 0.2, 0.42]);
    b.pivot('stalkL', 'head', [0.1, 0.52, 0.47]);
    b.pivot('stalkR', 'head', [-0.1, 0.52, 0.47]);
    b.pivot('shell', 'body', [0, 0.2, -0.05]);

    // stopa i szyja
    b.box('body', [0.42, 0.18, 0.9], [0, 0.09, 0.06], D_BODY, { shade: 0.75 });
    b.box('body', [0.3, 0.1, 0.24], [0, 0.05, -0.48], D_BODY_DARK);
    b.box('head', [0.36, 0.4, 0.3], [0, 0.34, 0.42], D_BODY, { shade: 0.8 });
    b.box('head', [0.14, 0.035, 0.02], [0, 0.3, 0.575], '#2f6b58', { shade: 1 });
    b.pair('head', 'head', [0.03, 0.03, 0.02], [0.075, 0.315, 0.575], '#2f6b58', { shade: 1 });
    cheeks(b, 'head', { y: 0.34, z: 0.575, dx: 0.12, w: 0.07 });
    // czułki z oczami
    for (const [st, x] of [['stalkL', 0.1], ['stalkR', -0.1]] as const) {
      b.box(st, [0.06, 0.24, 0.06], [x, 0.62, 0.47], D_BODY);
      b.box(st, [0.15, 0.15, 0.15], [x, 0.78, 0.48], WHITE, { shade: 0.9 });
      b.box(st, [0.08, 0.09, 0.03], [x, 0.78, 0.56], INK, { shade: 1 });
      b.box(st, [0.03, 0.03, 0.02], [x - 0.02, 0.8, 0.58], WHITE, { shade: 1 });
    }
    // muszla: rdzeń + spirala 10 segmentów (od środka na zewnątrz)
    const cy = 0.62;
    const cz = -0.1;
    b.box('shell', [0.34, 0.52, 0.52], [0, cy, cz], D_CORE);
    for (let i = 0; i < 10; i++) {
      const phi = ((150 - (9 - i) * 44) * Math.PI) / 180;
      const r = 0.1 + i * 0.031;
      const th = 0.1 + i * 0.012;
      const len = r * 0.768 * 1.12 + 0.02;
      const wx = 0.3 + i * 0.016;
      const y = cy + r * Math.cos(phi);
      const z = cz + r * Math.sin(phi);
      const col = i % 2 === 0 ? D_SEG_A : D_SEG_B;
      b.box('shell', [wx, th, len], [0, y, z], col, { rot: [phi, 0, 0], name: `seg${i}`, mat: solidMaterial(col) });
    }
    // żeby kolejność segmentów była czytelna, środek spirali — mała jasna kropka
    b.box('shell', [0.36, 0.06, 0.06], [0, cy, cz], '#fff1c9', { shade: 1 });
  },
  motions: () => {
    const segCol = [D_SEG_A, D_SEG_B];
    const lit = glowMaterial(D_LIT, 1.7);
    const litAll = glowMaterial('#fff6b0', 2.6);
    const cycle: MotionFn = (c, _w, fx) => {
      // 10 × 0,32 s zapalania, 0,9 s pełna „dziesiątka”, 0,4 s przerwy
      const period = 10 * 0.32 + 0.9 + 0.4;
      const f = (c.time * (c.anim === 'dance' ? 1.8 : 1)) % period;
      const n = Math.min(10, Math.floor(f / 0.32) + 1);
      const full = f >= 3.2 && f < 4.1;
      const off = f >= 4.1;
      for (let i = 0; i < 10; i++) {
        const m = fx.named(`seg${i}`);
        if (!m) continue;
        const on = !off && i < n;
        m.material = full ? (Math.floor((f - 3.2) / 0.15) % 2 === 0 ? litAll : lit) : on ? lit : solidMaterial(segCol[i % 2] ?? D_SEG_A);
      }
    };
    return [
      bodyMotion({ amp: 1, wob: 0, walk: 'slide', h: 1.0, gait: 1.1 }),
      cycle,
      (c, w) => {
        const { time, seed } = c;
        const a = 0.12 * Math.sin(time * 2.4 + seed * 4);
        const bl = blink(time, seed);
        w.rot('stalkL', 0.05 * Math.sin(time * 1.7), 0, a);
        w.rot('stalkR', 0.05 * Math.sin(time * 1.9 + 1), 0, -a * 0.8);
        w.scale('stalkL', 1, 0.6 + 0.4 * bl, 1);
        w.scale('stalkR', 1, 0.6 + 0.4 * bl, 1);
        w.rot('shell', 0.03 * Math.sin(time * 1.3), 0, 0.02 * Math.sin(time * 1.1));
        if (c.anim === 'hide') {
          // chowa się do muszli: głowa w tył
          w.pos('head', 0, -0.1 * ramp(c.p, 0, 0.4), -0.3 * ramp(c.p, 0, 0.4));
        }
        if (c.anim === 'sleep') {
          w.pos('head', 0, -0.08, -0.12);
          w.scale('stalkL', 1, 0.35, 1);
          w.scale('stalkR', 1, 0.35, 1);
        }
        if (c.anim === 'cheer' || c.anim === 'dance') {
          w.rot('stalkL', 0, 0, 0.3 * Math.sin(time * 9));
          w.rot('stalkR', 0, 0, -0.3 * Math.sin(time * 9));
        }
      },
    ];
  },
};

// ───────────────────────────── Bliźniak ─────────────────────────────
// Dwa identyczne ptaszki-kostki obok siebie; skaczą równo.

const B_BLUE = '#6ec6ff';
const B_BLUE_DARK = '#3d9be0';
const B_BELLY = '#eaf7ff';
const B_BEAK = '#ffa94d';

export const blizniak: ModelDef = {
  height: 0.75,
  radius: 0.5,
  build(b) {
    for (const [bird, x] of [['birdL', 0.27], ['birdR', -0.27]] as const) {
      b.pivot(bird, 'all', [x, 0, 0]);
      b.pivot(`${bird}_eyes`, bird, [x, 0.4, 0.19]);
      b.pivot(`${bird}_wL`, bird, [x + 0.19, 0.4, 0]);
      b.pivot(`${bird}_wR`, bird, [x - 0.19, 0.4, 0]);
      b.box(bird, [0.36, 0.36, 0.36], [x, 0.32, 0], B_BLUE, { shade: 0.78 });
      b.box(bird, [0.26, 0.2, 0.02], [x, 0.25, 0.185], B_BELLY, { shade: 1 });
      b.box(bird, [0.07, 0.11, 0.07], [x, 0.54, 0.03], B_BLUE_DARK, { rot: [0.3, 0, 0.2] });
      b.box(bird, [0.05, 0.08, 0.05], [x + 0.045, 0.52, -0.02], B_BLUE_DARK, { rot: [-0.2, 0, -0.35] });
      b.box(bird, [0.1, 0.07, 0.1], [x, 0.34, 0.22], B_BEAK, { shade: 0.85 });
      b.box(bird, [0.08, 0.03, 0.06], [x, 0.3, 0.21], '#e07b2a', { shade: 1 });
      b.box(bird, [0.22, 0.07, 0.14], [x, 0.36, -0.22], B_BLUE_DARK, { rot: [0.45, 0, 0] });
      eyePair(b, `${bird}_eyes`, { x, y: 0.41, z: 0.185, dx: 0.085, w: 0.065, h: 0.09 });
      b.box(bird, [0.06, 0.035, 0.02], [x + 0.12, 0.33, 0.185], '#ff9eb5', { shade: 1 });
      b.box(bird, [0.06, 0.035, 0.02], [x - 0.12, 0.33, 0.185], '#ff9eb5', { shade: 1 });
      // nóżki
      b.box(bird, [0.03, 0.14, 0.03], [x + 0.07, 0.08, 0], B_BEAK);
      b.box(bird, [0.03, 0.14, 0.03], [x - 0.07, 0.08, 0], B_BEAK);
      b.box(bird, [0.08, 0.025, 0.1], [x + 0.07, 0.012, 0.02], B_BEAK, { shade: 1 });
      b.box(bird, [0.08, 0.025, 0.1], [x - 0.07, 0.012, 0.02], B_BEAK, { shade: 1 });
      // skrzydełka
      b.box(`${bird}_wL`, [0.05, 0.2, 0.24], [x + 0.205, 0.31, -0.02], B_BLUE_DARK);
      b.box(`${bird}_wR`, [0.05, 0.2, 0.24], [x - 0.205, 0.31, -0.02], B_BLUE_DARK);
    }
  },
  motions: () => [
    bodyMotion({ amp: 0.8, wob: 0, walk: 'none', h: 0.9 }),
    (c, w) => {
      const { time, t, p, seed } = c;
      // wspólna faza skoków (bliźniaki skaczą RÓWNO)
      let y = 0;
      let flap = 0;
      let lean = 0;
      switch (c.anim) {
        case 'idle': {
          const f = (time * 0.7 + seed) % 1;
          const ph = f < 0.35 ? f / 0.35 : 0;
          y = 0.13 * hop(ph) * (ph > 0 ? 1 : 0);
          flap = ph > 0 ? Math.sin(ph * TAU * 3) : 0.1 * Math.sin(time * 3);
          break;
        }
        case 'walk': {
          const ph = t * 3;
          y = 0.12 * hop(ph);
          flap = Math.sin(ph * TAU);
          lean = 0.15;
          break;
        }
        case 'dance': {
          const ph = t * 2.4;
          y = 0.18 * hop(ph);
          flap = Math.sin(ph * TAU * 2);
          w.rot('birdL', 0, TAU * (ph % 1), 0);
          w.rot('birdR', 0, -TAU * (ph % 1), 0);
          break;
        }
        case 'cheer': {
          const ph = Math.min(1, p / 0.84) * 2;
          y = ph < 2 ? 0.28 * hop(ph) : 0;
          flap = Math.sin(p * TAU * 6);
          break;
        }
        case 'attack':
        case 'strongAttack': {
          lean = 0.5 * bump(p, 0.25, 0.7);
          flap = Math.sin(p * TAU * 5) * bump(p, 0, 1);
          w.pos('birdL', -0.06 * bump(p, 0.3, 0.7), 0, 0);
          w.pos('birdR', 0.06 * bump(p, 0.3, 0.7), 0, 0);
          break;
        }
        case 'windup':
          lean = -0.25;
          flap = 0.3 * Math.sin(t * 20);
          break;
        case 'sleep':
          lean = 0.25;
          break;
        default:
          flap = 0.1 * Math.sin(time * 3);
      }
      for (const bird of ['birdL', 'birdR']) {
        w.pos(bird, 0, y, 0);
        w.rot(bird, lean, 0, 0);
        w.rot(`${bird}_wL`, 0, 0, 0.9 * Math.max(0, flap));
        w.rot(`${bird}_wR`, 0, 0, -0.9 * Math.max(0, flap));
        let e = blink(time, seed);
        if (c.anim === 'sleep') e = 0.12;
        w.scale(`${bird}_eyes`, 1, Math.max(0.08, e), 1);
      }
    },
  ],
};

// ───────────────────────────── Koniczynek ─────────────────────────────
// Czterolistna koniczyna na nóżkach, lekko świeci.

const K_LEAF = '#3ecf5a';
const K_LEAF_LIGHT = '#8af07c';
const K_STEM = '#3a9a3f';

export const koniczynek: ModelDef = {
  height: 1.15,
  radius: 0.4,
  build(b) {
    b.pivot('legL', 'all', [0.1, 0.28, 0]);
    b.pivot('legR', 'all', [-0.1, 0.28, 0]);
    b.pivot('body', 'all', [0, 0.28, 0]);
    b.pivot('head', 'body', [0, 0.6, 0]);
    b.pivot('eyes', 'head', [0, 0.8, 0.09]);
    b.pivot('armL', 'body', [0.08, 0.48, 0]);
    b.pivot('armR', 'body', [-0.08, 0.48, 0]);
    b.pivot('sparkles', 'all', [0, 0, 0]);

    for (const [leg, x] of [['legL', 0.1], ['legR', -0.1]] as const) {
      b.box(leg, [0.07, 0.24, 0.07], [x, 0.16, 0], K_STEM);
      b.box(leg, [0.13, 0.06, 0.17], [x, 0.03, 0.03], '#2d7a33');
    }
    b.box('body', [0.13, 0.36, 0.13], [0, 0.44, 0], K_STEM);
    // listki-rączki
    b.box('armL', [0.16, 0.06, 0.08], [0.15, 0.48, 0], K_LEAF_LIGHT, { group: 'leaf' });
    b.box('armR', [0.16, 0.06, 0.08], [-0.15, 0.48, 0], K_LEAF_LIGHT, { group: 'leaf' });
    // główka: środek + 4 serduszkowe listki (na ukos)
    const cy = 0.8;
    b.box('head', [0.26, 0.26, 0.13], [0, cy, 0.02], K_LEAF_LIGHT, { group: 'leaf', shade: 0.9 });
    for (let i = 0; i < 4; i++) {
      const al = Math.PI / 4 + (i * Math.PI) / 2;
      const rz = al - Math.PI / 2;
      const put = (lx: number, ly: number): [number, number, number] => {
        const x = lx * Math.cos(rz) - ly * Math.sin(rz);
        const y = lx * Math.sin(rz) + ly * Math.cos(rz);
        return [x, cy + y, 0];
      };
      b.box('head', [0.14, 0.14, 0.09], put(0, 0.15), K_LEAF, { rot: [0, 0, rz], group: 'leaf' });
      b.box('head', [0.16, 0.17, 0.09], put(0.08, 0.26), K_LEAF, { rot: [0, 0, rz], group: 'leaf' });
      b.box('head', [0.16, 0.17, 0.09], put(-0.08, 0.26), K_LEAF, { rot: [0, 0, rz], group: 'leaf' });
      b.box('head', [0.03, 0.2, 0.02], [...put(0, 0.2)].map((v, j) => (j === 2 ? 0.05 : v)) as [number, number, number], K_LEAF_LIGHT, {
        rot: [0, 0, rz],
        group: 'leaf',
        shade: 1,
      });
    }
    eyePair(b, 'eyes', { y: cy + 0.02, z: 0.09, dx: 0.06, w: 0.055, h: 0.075 });
    b.box('head', [0.07, 0.022, 0.02], [0, cy - 0.065, 0.09], '#1d5e2a', { shade: 1 });
    cheeks(b, 'head', { y: cy - 0.04, z: 0.09, dx: 0.1, w: 0.045 });
    // szczęśliwa iskierka
    b.box('sparkles', [0.07, 0.07, 0.07], [0.32, 1.1, 0.1], '#fff3a0', { glow: 2.8, rot: [0.7, 0.7, 0] });
    b.box('sparkles', [0.05, 0.05, 0.05], [-0.34, 0.95, -0.05], '#d6ffb0', { glow: 2.4, rot: [0.7, 0.7, 0] });
  },
  motions: () => [
    bodyMotion({ amp: 1, wob: 0, walk: 'stride', h: 1.0, gait: 2 }),
    (c, w, fx) => {
      const { time, t, seed } = c;
      w.rot('head', -0.3, 0, 0.1 * Math.sin(time * 1.3 + seed * 4));
      fx.glowGroup('leaf', '#6dff8a', 0.18 + 0.08 * Math.sin(time * 2.2 + seed * 3));
      w.rot('sparkles', 0, time * 1.2, 0);
      if (c.anim === 'walk') {
        const s = Math.sin(t * 2 * TAU);
        w.rot('legL', 0.6 * s, 0, 0);
        w.rot('legR', -0.6 * s, 0, 0);
        w.rot('armL', 0, 0, 0.4 * s);
        w.rot('armR', 0, 0, 0.4 * s);
      } else if (c.anim === 'dance' || c.anim === 'cheer') {
        w.rot('head', 0, 0, c.anim === 'dance' ? t * 3 : TAU * ramp(c.p, 0.1, 0.8));
        w.rot('armL', 0, 0, 0.9 + 0.3 * Math.sin(time * 8));
        w.rot('armR', 0, 0, -0.9 - 0.3 * Math.sin(time * 8));
      } else if (c.anim === 'block') {
        fx.glowGroup('leaf', '#b4ffc0', 0.8 * envelope(c.p, 0, 0.15, 0.7, 1));
      } else if (c.anim === 'sleep') {
        w.rot('head', 0.35, 0, 0.1);
      } else {
        w.rot('armL', 0, 0, 0.1 * Math.sin(time * 2));
        w.rot('armR', 0, 0, -0.1 * Math.sin(time * 2));
      }
    },
  ],
};
