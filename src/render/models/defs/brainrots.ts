/**
 * Brainroty Łąki (GDD 13.2–13.3) i ich brainglamy (7.6). Ta sama bryła, dwie palety:
 *  - brainrot: nasycone, lekko „kwaśne” kolory, przesadne, nierówne kiwanie, zezowate oczy;
 *  - brainglam: pastel + złoto, emisyjne akcenty, drobinki brokatu, rzęsy, spokojny, elegancki taniec.
 */
import { TAU, blink, bump, envelope, ramp } from '../anim';
import type { BoxOpts, ModelBuilder, V3 } from '../builder';
import { bodyMotion } from '../motion';
import type { MotionFn } from '../rig';
import type { ModelDef } from './common';
import { cheeks, eyePair, INK, lashes, sparkleMotion, sparkles, WHITE } from './common';

type Variant = 'rot' | 'glam';
const GOLD = '#ffd35a';

// ───────────────────────────── Ślimakorro Buciorro / Ślimakella Glamella ─────────────────────────────

function buildSlimak(b: ModelBuilder, v: Variant): void {
  const glam = v === 'glam';
  // Trampek projektowany „palcami do tyłu”, odbity w Z: palce z przodu (czytelne z kamery), cholewka z tyłu.
  const MZ = (c: V3): V3 => [c[0], c[1], -c[2] - 0.38];
  const sh = (pivot: string, size: V3, c: V3, color: string, o: BoxOpts = {}): void => {
    b.box(pivot, size, MZ(c), color, o.rot ? { ...o, rot: [-o.rot[0], -o.rot[1], o.rot[2]] } : o);
  };
  const P = glam
    ? { body: '#c9b3ff', bodyDark: '#a98ff0', shoe: '#ff9fd2', shoeDark: '#ff7fc0', sole: '#fff1f8', accent: GOLD, tongue: '#ffe0f0', inner: '#b0487e' }
    : { body: '#b5e61d', bodyDark: '#86b80f', shoe: '#ff3d7f', shoeDark: '#d61f5f', sole: '#f4f4ee', accent: '#ffe14d', tongue: '#9b5de5', inner: '#4a0f2a' };

  b.pivot('body', 'all', [0, 0, 0]);
  b.pivot('head', 'body', [0, 0.2, 0.62]);
  b.pivot('stalkL', 'head', [0.14, 0.66, 0.7]);
  b.pivot('stalkR', 'head', [-0.14, 0.66, 0.7]);
  b.pivot('eyeL', 'stalkL', [0.15, 1.0, 0.72]);
  b.pivot('eyeR', 'stalkR', [-0.14, 0.99, 0.72]);
  b.pivot('shell', 'body', MZ([0, 0.22, -0.1]));

  // ślimacze ciało
  b.box('body', [0.5, 0.22, 1.42], [0, 0.11, 0.08], P.body, { shade: 0.72 });
  b.box('body', [0.3, 0.12, 0.3], [0, 0.06, -0.76], P.bodyDark);
  b.box('head', [0.46, 0.56, 0.38], [0, 0.44, 0.66], P.body, { shade: 0.78 });
  // twarz
  if (glam) {
    b.box('head', [0.16, 0.035, 0.02], [0, 0.36, 0.855], '#a0306a', { shade: 1 });
    b.pair('head', 'head', [0.035, 0.035, 0.02], [0.09, 0.375, 0.855], '#a0306a', { shade: 1 });
    cheeks(b, 'head', { y: 0.42, z: 0.855, dx: 0.15, w: 0.08 });
  } else {
    b.box('head', [0.3, 0.07, 0.02], [0, 0.36, 0.855], '#3b1030', { shade: 1 });
    b.box('head', [0.05, 0.045, 0.02], [-0.07, 0.38, 0.862], WHITE, { shade: 1 });
    b.box('head', [0.09, 0.08, 0.03], [0.08, 0.31, 0.86], '#ff5c8a', { shade: 1 });
  }
  // czułki z oczami
  b.box('stalkL', [0.07, 0.3, 0.07], [0.14, 0.8, 0.7], P.body);
  b.box('stalkR', [0.07, 0.3, 0.07], [-0.14, 0.8, 0.7], P.body);
  if (glam) {
    b.box('eyeL', [0.2, 0.2, 0.18], [0.15, 1.0, 0.72], WHITE, { shade: 0.9 });
    b.box('eyeR', [0.2, 0.2, 0.18], [-0.14, 0.99, 0.72], WHITE, { shade: 0.9 });
    b.box('eyeL', [0.1, 0.12, 0.03], [0.15, 0.99, 0.815], INK, { shade: 1 });
    b.box('eyeR', [0.1, 0.12, 0.03], [-0.14, 0.98, 0.815], INK, { shade: 1 });
    b.box('eyeL', [0.035, 0.035, 0.02], [0.13, 1.02, 0.835], WHITE, { shade: 1 });
    b.box('eyeR', [0.035, 0.035, 0.02], [-0.16, 1.01, 0.835], WHITE, { shade: 1 });
    lashes(b, 'eyeL', { x: 0.15, y: 1.1, z: 0.8, dx: 0, w: 0.12 });
    lashes(b, 'eyeR', { x: -0.14, y: 1.09, z: 0.8, dx: 0, w: 0.12 });
  } else {
    // zezowate „googly eyes” różnej wielkości
    b.box('eyeL', [0.25, 0.25, 0.2], [0.15, 1.02, 0.72], WHITE, { shade: 0.9 });
    b.box('eyeR', [0.16, 0.16, 0.15], [-0.14, 0.97, 0.72], WHITE, { shade: 0.9 });
    b.box('eyeL', [0.09, 0.09, 0.03], [0.1, 0.99, 0.825], INK, { shade: 1 });
    b.box('eyeR', [0.065, 0.065, 0.03], [-0.11, 1.0, 0.8], INK, { shade: 1 });
  }

  // muszla-trampek (palce w tył, kostka przy głowie)
  sh('shell', [0.62, 0.12, 1.16], [0, 0.28, -0.12], P.sole, { shade: 0.85 });
  sh('shell', [0.63, 0.045, 1.17], [0, 0.335, -0.12], P.accent, { shade: 1, glow: glam ? 1.2 : undefined });
  sh('shell', [0.56, 0.34, 0.98], [0, 0.52, -0.15], P.shoe, { shade: 0.8 });
  sh('shell', [0.58, 0.2, 0.2], [0, 0.44, -0.63], P.sole, { shade: 0.85 });
  sh('shell', [0.58, 0.5, 0.34], [0, 0.78, 0.2], P.shoe, { shade: 0.85 });
  sh('shell', [0.6, 0.08, 0.36], [0, 1.05, 0.2], glam ? GOLD : P.shoeDark, { shade: 1, glow: glam ? 1.3 : undefined });
  sh('shell', [0.4, 0.02, 0.2], [0, 1.1, 0.2], P.inner, { shade: 1 });
  sh('shell', [0.32, 0.3, 0.08], [0, 0.98, -0.02], P.tongue, { rot: [-0.35, 0, 0] });
  sh('shell', [0.38, 0.06, 0.5], [0, 0.7, -0.27], P.shoeDark);
  sh('shell', [0.24, 0.22, 0.04], [0, 0.94, 0.385], P.accent, { shade: 1, glow: glam ? 1.4 : undefined });

  if (glam) {
    // wielka kokarda zamiast sznurówek
    b.pivot('bow', 'shell', MZ([0, 0.8, -0.24]));
    const BOW = '#ff6fb5';
    sh('bow', [0.15, 0.15, 0.15], [0, 0.82, -0.24], '#ff4fa3');
    sh('bow', [0.3, 0.24, 0.1], [0.2, 0.88, -0.24], BOW, { rot: [0, 0, 0.35] });
    sh('bow', [0.3, 0.24, 0.1], [-0.2, 0.88, -0.24], BOW, { rot: [0, 0, -0.35] });
    sh('bow', [0.08, 0.26, 0.06], [0.1, 0.7, -0.18], BOW, { rot: [0.3, 0, -0.3] });
    sh('bow', [0.08, 0.26, 0.06], [-0.1, 0.7, -0.18], BOW, { rot: [0.3, 0, 0.3] });
    // brokat na bokach buta
    const dots: [number, number][] = [[0.6, -0.05], [0.5, -0.3], [0.62, -0.48], [0.45, 0.1], [0.4, -0.55], [0.85, 0.25], [0.7, 0.15]];
    dots.forEach(([y, z], i) => {
      const c = i % 2 ? WHITE : GOLD;
      sh('shell', [0.02, 0.045, 0.045], [0.285, y, z], c, { glow: 2.2, rot: [0.785, 0, 0] });
      sh('shell', [0.02, 0.045, 0.045], [-0.285, y + 0.03, z - 0.05], c, { glow: 2.2, rot: [0.785, 0, 0] });
    });
    // serduszko na boku
    for (const s of [1, -1]) {
      sh('shell', [0.02, 0.08, 0.08], [s * 0.29, 0.56, -0.2], '#ff4fa3', { shade: 1 });
      sh('shell', [0.02, 0.08, 0.08], [s * 0.29, 0.56, -0.29], '#ff4fa3', { shade: 1 });
      sh('shell', [0.02, 0.09, 0.09], [s * 0.29, 0.5, -0.245], '#ff4fa3', { rot: [0.785, 0, 0], shade: 1 });
    }
    b.pivot('sparkles', 'all', [0, 0, 0]);
    sparkles(b, { count: 9, radius: 0.85, y0: 0.4, y1: 1.3, seed: 11 });
  } else {
    // sznurówki na krzyż
    for (const [i, z] of [-0.1, -0.26, -0.42].entries()) {
      sh('shell', [0.42, 0.045, 0.06], [0, 0.745, z], WHITE, { rot: [0, i % 2 ? 0.35 : -0.35, 0], shade: 1 });
    }
    // zygzak na boku
    for (const s of [1, -1]) {
      sh('shell', [0.02, 0.07, 0.24], [s * 0.285, 0.56, -0.05], P.accent, { rot: [0.55, 0, 0], shade: 1 });
      sh('shell', [0.02, 0.07, 0.24], [s * 0.285, 0.5, -0.26], P.accent, { rot: [-0.55, 0, 0], shade: 1 });
      sh('shell', [0.02, 0.07, 0.2], [s * 0.285, 0.56, -0.46], P.accent, { rot: [0.55, 0, 0], shade: 1 });
    }
    // końce sznurówek (fruwają)
    b.pivot('laceL', 'shell', MZ([0.06, 0.77, -0.08]));
    b.pivot('laceR', 'shell', MZ([-0.06, 0.77, -0.08]));
    sh('laceL', [0.16, 0.09, 0.04], [0.12, 0.79, -0.08], WHITE, { rot: [0, 0, 0.4] });
    sh('laceR', [0.16, 0.09, 0.04], [-0.12, 0.79, -0.08], WHITE, { rot: [0, 0, -0.4] });
    sh('laceL', [0.04, 0.04, 0.36], [0.21, 0.78, 0.03], WHITE, { rot: [0, 0.9, -0.15] });
    sh('laceR', [0.04, 0.04, 0.36], [-0.21, 0.78, 0.03], WHITE, { rot: [0, -0.9, 0.15] });
    sh('laceL', [0.07, 0.07, 0.09], [0.35, 0.78, 0.14], P.accent, { rot: [0, 0.9, 0] });
    sh('laceR', [0.07, 0.07, 0.09], [-0.35, 0.78, 0.14], P.accent, { rot: [0, -0.9, 0] });
  }
}

function slimakMotion(v: Variant): MotionFn[] {
  const glam = v === 'glam';
  const extra: MotionFn = (c, w) => {
    const { time, t, p, seed } = c;
    const k = glam ? 0.4 : 1;
    w.rot('stalkL', 0.1 * k * Math.sin(time * 2.1 + seed), 0, 0.22 * k * Math.sin(time * 1.7 + seed));
    w.rot('stalkR', 0.12 * k * Math.sin(time * 2.9 + 2), 0, -0.2 * k * Math.sin(time * 2.3 + 1));
    // oczy mrugają osobno (brainrot) / razem (glam)
    const bl = blink(time, seed);
    const br = glam ? bl : blink(time + 1.3, seed + 0.4);
    let eL = bl;
    let eR = br;
    if (c.anim === 'sleep') eL = eR = 0.1;
    if (c.anim === 'hit') {
      eL = 1 + 0.4 * bump(p, 0, 0.5);
      eR = 1 + 0.5 * bump(p, 0.1, 0.6);
    }
    w.scale('eyeL', 1, Math.max(0.08, eL), 1);
    w.scale('eyeR', 1, Math.max(0.08, eR), 1);
    // trampek się kiwa
    w.rot('shell', 0.04 * k * Math.sin(time * 1.9), 0, 0.07 * k * Math.sin(time * 1.3 + seed));
    if (!glam) {
      // sznurówki fruwają
      const f = c.anim === 'walk' || c.anim === 'dance' ? 1.6 : 1;
      w.rot('laceL', 0.35 * Math.sin(time * 6.3 * f), 0.4 * Math.sin(time * 4.1 * f), 0.3 * Math.sin(time * 8.7 * f));
      w.rot('laceR', 0.35 * Math.sin(time * 5.7 * f + 1), -0.4 * Math.sin(time * 4.6 * f + 2), -0.3 * Math.sin(time * 7.9 * f));
      if (c.anim === 'attack' || c.anim === 'strongAttack') {
        // „Kopniak ze sznurówki” — sznurówka strzela do przodu
        const whip = envelope(p, 0.25, 0.4, 0.5, 0.8);
        w.rot('laceL', -0.8 * whip, -1.2 * whip, 0);
        w.rot('laceR', -0.8 * whip, 1.2 * whip, 0);
      }
    } else {
      w.rot('bow', 0, 0, 0.06 * Math.sin(time * 2.2));
      w.scale('bow', 1 + 0.04 * Math.sin(time * 3), 1, 1);
    }
    if (c.anim === 'windup') w.rot('shell', -0.15, 0, 0.05 * Math.sin(t * 30));
    if (c.anim === 'attack') w.rot('shell', 0.35 * bump(p, 0.3, 0.7), 0, 0);
    if (c.anim === 'hide') w.pos('head', 0, -0.1 * ramp(p, 0, 0.4), -0.35 * ramp(p, 0, 0.4));
  };
  return glam
    ? [bodyMotion({ amp: 0.8, wob: 0, walk: 'glide', h: 1.45, elegant: true, gait: 1.1 }), extra, sparkleMotion]
    : [bodyMotion({ amp: 1.35, wob: 1, walk: 'slide', h: 1.45, gait: 1.2 }), extra];
}

// ───────────────────────────── Trzmielini Tostini / Trzmielina Brokatina ─────────────────────────────

function buildTrzmiel(b: ModelBuilder, v: Variant): void {
  const glam = v === 'glam';
  const P = glam
    ? { crust: '#f0ac2e', bread: '#ffd98a', stripe: '#ff9ecf', legs: '#b07a3a', mouth: '#a0306a' }
    : { crust: '#b8651f', bread: '#f6c46a', stripe: '#4a2a12', legs: '#2a1d14', mouth: '#5a1a10' };

  b.pivot('body', 'all', [0, 0.75, 0]);
  b.pivot('eyes', 'body', [0, 1.0, 0.11]);
  b.pivot('antennae', 'body', [0, 1.36, 0]);
  b.pivot('legs', 'body', [0, 0.42, 0.03]);
  b.pivot('stinger', 'body', [0, 0.4, -0.02]);
  b.pivot('wingL', 'body', [0.3, 1.02, -0.12]);
  b.pivot('wingR', 'body', [-0.3, 1.02, -0.12]);

  // kromka tosta
  b.box('body', [0.9, 0.72, 0.18], [0, 0.74, 0], P.crust, { shade: 0.8 });
  b.box('body', [0.76, 0.6, 0.2], [0, 0.76, 0], P.bread, { shade: 0.92 });
  b.box('body', [1.0, 0.26, 0.18], [0, 1.18, 0], P.crust, { shade: 0.9 });
  b.box('body', [0.86, 0.18, 0.2], [0, 1.16, 0], P.bread, { shade: 1 });
  b.pair('body', 'body', [0.38, 0.1, 0.18], [0.24, 1.33, 0], P.crust);
  // paski pszczoły (przypalone / różowe)
  b.box('body', [0.765, 0.085, 0.205], [0, 0.66, 0], P.stripe, { shade: 1 });
  b.box('body', [0.765, 0.085, 0.205], [0, 0.51, 0], P.stripe, { shade: 1 });
  if (glam) {
    // złote obramowanie świeci
    b.box('body', [0.92, 0.04, 0.2], [0, 0.39, 0], GOLD, { glow: 1.3 });
    b.box('body', [0.04, 0.04, 0.04], [0.3, 0.9, 0.105], WHITE, { glow: 2.2, rot: [0, 0, 0.785] });
    b.box('body', [0.03, 0.03, 0.04], [-0.32, 0.72, 0.105], WHITE, { glow: 2.2, rot: [0, 0, 0.785] });
  } else {
    // masło zsuwające się z tosta
    b.box('body', [0.28, 0.08, 0.22], [0.18, 1.39, 0.01], '#fff1a8', { rot: [0, 0.35, -0.12] });
    b.box('body', [0.1, 0.03, 0.08], [0.14, 1.435, 0.04], WHITE, { rot: [0, 0.35, -0.12], shade: 1 });
    // okruszki
    b.box('body', [0.05, 0.05, 0.02], [-0.25, 0.9, 0.105], P.crust, { shade: 1 });
    b.box('body', [0.04, 0.04, 0.02], [0.3, 0.8, 0.105], P.crust, { shade: 1 });
  }
  // twarz
  eyePair(b, 'eyes', { y: 1.0, z: 0.11, dx: 0.17, w: 0.13, h: 0.17 });
  if (glam) {
    lashes(b, 'eyes', { y: 1.1, z: 0.11, dx: 0.17, w: 0.13 });
    b.box('body', [0.14, 0.035, 0.02], [0, 0.86, 0.11], P.mouth, { shade: 1 });
    b.pair('body', 'body', [0.035, 0.035, 0.02], [0.08, 0.875, 0.11], P.mouth, { shade: 1 });
    cheeks(b, 'body', { y: 0.9, z: 0.11, dx: 0.28, w: 0.1 });
    // tiara
    b.pivot('crown', 'body', [0, 1.38, 0]);
    b.box('crown', [0.36, 0.06, 0.1], [0, 1.41, 0.02], GOLD, { glow: 1.5 });
    b.box('crown', [0.06, 0.12, 0.06], [0, 1.49, 0.02], GOLD, { glow: 1.5 });
    b.pair('crown', 'crown', [0.05, 0.09, 0.05], [0.13, 1.47, 0.02], GOLD, { glow: 1.5 });
    b.box('crown', [0.07, 0.07, 0.07], [0, 1.58, 0.02], '#ff7fd0', { glow: 2.4, rot: [0, 0, 0.785] });
  } else {
    b.box('body', [0.16, 0.045, 0.02], [0.17, 1.12, 0.11], P.stripe, { rot: [0, 0, 0.32], shade: 1 });
    b.box('body', [0.16, 0.045, 0.02], [-0.17, 1.12, 0.11], P.stripe, { rot: [0, 0, -0.32], shade: 1 });
    b.box('body', [0.24, 0.1, 0.02], [0, 0.85, 0.105], P.mouth, { shade: 1 });
    b.box('body', [0.1, 0.04, 0.02], [0.03, 0.815, 0.112], '#ff6b6b', { shade: 1 });
    b.box('body', [0.05, 0.04, 0.02], [-0.06, 0.885, 0.112], WHITE, { shade: 1 });
  }
  // czułki
  const tip = glam ? '#ff7fd0' : '#2a1d14';
  b.box('antennae', [0.04, 0.26, 0.04], [0.13, 1.48, 0], P.legs, { rot: [0, 0, -0.35] });
  b.box('antennae', [0.04, 0.26, 0.04], [-0.13, 1.48, 0], P.legs, { rot: [0, 0, 0.35] });
  b.box('antennae', [0.1, 0.1, 0.1], [0.18, 1.61, 0], tip, glam ? { glow: 2 } : {});
  b.box('antennae', [0.1, 0.1, 0.1], [-0.18, 1.61, 0], tip, glam ? { glow: 2 } : {});
  // żądło i nóżki
  b.box('stinger', [0.12, 0.16, 0.12], [0, 0.32, -0.02], P.stripe, { rot: [0.3, 0, 0] });
  b.box('stinger', [0.05, 0.12, 0.05], [0, 0.2, -0.06], glam ? GOLD : '#f0e6d8', { rot: [0.3, 0, 0], glow: glam ? 1.5 : undefined });
  b.pair('legs', 'legs', [0.04, 0.16, 0.04], [0.16, 0.32, 0.04], P.legs);
  b.pair('legs', 'legs', [0.04, 0.14, 0.04], [0.32, 0.34, 0.04], P.legs);
  b.pair('legs', 'legs', [0.07, 0.04, 0.08], [0.16, 0.24, 0.06], P.legs);
  b.pair('legs', 'legs', [0.07, 0.04, 0.08], [0.32, 0.27, 0.06], P.legs);

  // skrzydła: liść sałaty / witraż
  for (const [wing, s] of [['wingL', 1], ['wingR', -1]] as const) {
    const rz = s * 0.45;
    const at = (lx: number, ly: number, z = -0.14): [number, number, number] => {
      const x = lx * Math.cos(rz) - ly * Math.sin(rz);
      const y = lx * Math.sin(rz) + ly * Math.cos(rz);
      return [s * 0.3 + x, 1.02 + y, z];
    };
    if (glam) {
      // złota rama + kolorowe szybki
      b.box(wing, [0.62, 0.44, 0.04], at(s * 0.34, 0.15), GOLD, { rot: [0, 0, rz], glow: 0.9 });
      const panes = ['#ff6fc0', '#4fd2ff', '#a97cff', '#56e8a0', '#ffd23f', '#ff8aa8'];
      let i = 0;
      for (const py of [0.05, 0.25]) {
        for (const px of [0.14, 0.34, 0.54]) {
          b.box(wing, [0.17, 0.16, 0.05], at(s * px, py), panes[i++ % panes.length] ?? WHITE, { rot: [0, 0, rz], glow: 1.1 });
        }
      }
    } else {
      b.box(wing, [0.56, 0.36, 0.05], at(s * 0.33, 0.16), '#9be15d', { rot: [0, 0, rz] });
      b.box(wing, [0.5, 0.035, 0.06], at(s * 0.33, 0.16, -0.13), '#e6ffc2', { rot: [0, 0, rz], shade: 1 });
      for (const [px, py] of [[0.12, 0.36], [0.33, 0.38], [0.54, 0.35], [0.64, 0.18], [0.54, -0.03], [0.3, -0.04]] as const) {
        b.box(wing, [0.17, 0.11, 0.055], at(s * px, py), '#78c43c', { rot: [0, 0, rz + s * 0.3] });
      }
    }
  }
  if (glam) {
    b.pivot('sparkles', 'all', [0, 0, 0]);
    sparkles(b, { count: 9, radius: 0.8, y0: 0.6, y1: 1.9, seed: 23 });
  }
}

function trzmielMotion(v: Variant): MotionFn[] {
  const glam = v === 'glam';
  const extra: MotionFn = (c, w) => {
    const { time, t, p } = c;
    // skrzydła: brzęczenie / spokojne trzepotanie
    const fast = c.anim === 'sleep' ? 0 : glam ? 0.35 * Math.sin(time * 9) : 0.55 * Math.sin(time * 53);
    const slow = glam ? 0.1 * Math.sin(time * 4.5) : 0.2 * Math.sin(time * 31);
    w.rot('wingL', 0, 0.3 + slow, fast);
    w.rot('wingR', 0, -0.3 - slow, -fast);
    // nóżki dyndają, czułki sprężynują
    w.rot('legs', 0.25 * Math.sin(time * 3.1), 0, 0.1 * Math.sin(time * 2.3));
    w.rot('antennae', 0.12 * Math.sin(time * 4.3), 0, (glam ? 0.04 : 0.1) * Math.sin(time * 5.7));
    w.rot('stinger', 0, 0, (glam ? 0.05 : 0.2) * Math.sin(time * 6));
    if (c.anim === 'attack' || c.anim === 'strongAttack') {
      // pikowanie żądłem
      w.rot('stinger', -0.9 * bump(p, 0.3, 0.7), 0, 0);
      w.rot('body', 0.5 * bump(p, 0.3, 0.7), 0, 0);
    }
    if (c.anim === 'windup') w.rot('body', -0.25, 0, 0.05 * Math.sin(t * 40));
    if (c.anim === 'sleep') w.pos('all', 0, -0.35, 0);
  };
  return glam
    ? [bodyMotion({ amp: 0.8, wob: 0, walk: 'hover', h: 1.6, elegant: true, hover: 0.06 }), extra, sparkleMotion]
    : [bodyMotion({ amp: 1.3, wob: 0.8, walk: 'hover', h: 1.6, hover: 0.08 }), extra];
}

// ───────────────────────────── Grzybello Kalafiorello / Grzybella Perłella ─────────────────────────────

function buildGrzyb(b: ModelBuilder, v: Variant): void {
  const glam = v === 'glam';
  const P = glam
    ? { wood: '#ffc93d', woodDark: '#f0ad1c', foot: '#fff0b0', stem: '#ffc8dc', stemDark: '#ffadc9', flor: ['#fff0f7', '#f1dbff', '#ffd6ea'], leaf: '#9fe8c4', leafDark: '#7fd8ad' }
    : { wood: '#c77d3a', woodDark: '#9c5a24', foot: '#6e3d17', stem: '#eef3b8', stemDark: '#cfd78c', flor: ['#f4f1dc', '#e6e2bf', '#dfe8b2'], leaf: '#7ac943', leafDark: '#5ea832' };

  // nogi od krzesła (chodzą po przekątnych)
  const legPos: [string, number, number][] = [
    ['leg0', 0.3, 0.3],
    ['leg1', -0.3, 0.3],
    ['leg2', 0.3, -0.3],
    ['leg3', -0.3, -0.3],
  ];
  for (const [name, x, z] of legPos) {
    b.pivot(name, 'all', [x, 0.6, z]);
    b.box(name, [0.1, 0.58, 0.1], [x, 0.31, z], P.woodDark, glam ? { glow: 0.25 } : {});
    b.box(name, [0.12, 0.05, 0.12], [x, 0.025, z], P.foot, glam ? { glow: 1.3 } : {});
    b.box(name, [0.12, 0.06, 0.12], [x, 0.45, z], P.wood);
  }
  b.box('all', [0.82, 0.12, 0.82], [0, 0.66, 0], P.wood, { shade: 0.85 });
  b.box('all', [0.84, 0.04, 0.84], [0, 0.6, 0], P.woodDark, glam ? { glow: 0.6 } : {});
  // oparcie krzesła
  b.pair('all', 'all', [0.08, 0.62, 0.08], [0.35, 1.0, -0.37], P.woodDark);
  b.box('all', [0.78, 0.1, 0.08], [0, 1.26, -0.37], P.wood);
  b.box('all', [0.7, 0.08, 0.06], [0, 1.04, -0.37], P.wood);

  b.pivot('body', 'all', [0, 0.72, 0]);
  b.pivot('eyes', 'body', [0, 1.07, 0.24]);
  b.pivot('armL', 'body', [0.25, 1.05, 0.02]);
  b.pivot('armR', 'body', [-0.25, 1.05, 0.02]);
  b.pivot('cap', 'body', [0, 1.28, 0]);

  // trzon z twarzą
  b.box('body', [0.5, 0.56, 0.46], [0, 1.0, 0], P.stem, { shade: 0.82 });
  if (glam) {
    eyePair(b, 'eyes', { y: 1.07, z: 0.235, dx: 0.12, w: 0.11, h: 0.14 });
    lashes(b, 'eyes', { y: 1.15, z: 0.235, dx: 0.12, w: 0.11 });
    b.box('body', [0.14, 0.035, 0.02], [0, 0.9, 0.235], '#b0487e', { shade: 1 });
    b.pair('body', 'body', [0.035, 0.035, 0.02], [0.08, 0.915, 0.235], '#b0487e', { shade: 1 });
    cheeks(b, 'body', { y: 0.97, z: 0.235, dx: 0.18, w: 0.08 });
    // naszyjnik z pereł
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI - Math.PI;
      b.box('body', [0.06, 0.06, 0.06], [Math.cos(a) * 0.26, 1.2 + Math.sin(a) * 0.05, 0.2 + Math.sin(-a) * 0.05], WHITE, { glow: 1.4 });
    }
  } else {
    b.box('eyes', [0.13, 0.16, 0.03], [0.12, 1.08, 0.235], INK, { shade: 1 });
    b.box('eyes', [0.045, 0.045, 0.02], [0.1, 1.11, 0.255], WHITE, { shade: 1 });
    b.box('eyes', [0.09, 0.06, 0.03], [-0.12, 1.06, 0.235], INK, { shade: 1 });
    b.box('body', [0.36, 0.05, 0.02], [0, 1.19, 0.24], '#4a3a20', { rot: [0, 0, 0.12], shade: 1 });
    b.box('body', [0.2, 0.1, 0.02], [0, 0.88, 0.235], '#4a2a20', { shade: 1 });
    b.box('body', [0.05, 0.05, 0.02], [0.04, 0.91, 0.242], WHITE, { shade: 1 });
    b.box('body', [0.62, 0.07, 0.58], [0, 1.24, 0], P.stemDark);
  }
  // rączki
  b.box('armL', [0.1, 0.24, 0.1], [0.3, 0.95, 0.02], P.stem);
  b.box('armR', [0.1, 0.24, 0.1], [-0.3, 0.95, 0.02], P.stem);
  b.box('armL', [0.12, 0.1, 0.12], [0.3, 0.8, 0.02], P.stemDark);
  b.box('armR', [0.12, 0.1, 0.12], [-0.3, 0.8, 0.02], P.stemDark);

  // kalafior / perłowy kapelusz (grupa 'cap' — może świecić)
  const fl = P.flor;
  let i = 0;
  const floret = (s: number, x: number, y: number, z: number): void => {
    b.box('cap', [s, s, s], [x, y, z], fl[i++ % fl.length] ?? WHITE, { group: 'cap', shade: 0.78 });
  };
  for (const x of [-0.3, 0, 0.3]) for (const z of [-0.3, 0, 0.3]) floret(0.32, x, 1.42 + ((x * 7 + z * 13) % 0.05), z);
  for (const x of [-0.15, 0.15]) for (const z of [-0.15, 0.15]) floret(0.32, x, 1.64, z);
  floret(0.28, 0, 1.82, 0);
  // „różyczki” kalafiora — drobne guzki na wierzchu
  const curd = glam ? '#fff8fc' : '#faf6e0';
  for (const x of [-0.33, 0.33]) for (const z of [-0.33, 0.33]) b.box('cap', [0.14, 0.1, 0.14], [x, 1.6, z], curd, { group: 'cap', rot: [0, 0.785, 0] });
  for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) b.box('cap', [0.12, 0.08, 0.12], [x, 1.81, z], curd, { group: 'cap', rot: [0, 0.785, 0] });
  b.box('cap', [0.12, 0.08, 0.12], [0, 1.97, 0], curd, { group: 'cap', rot: [0, 0.785, 0] });
  floret(0.18, 0.48, 1.4, 0.05);
  floret(0.18, -0.48, 1.42, -0.05);
  floret(0.18, 0.02, 1.4, 0.48);
  floret(0.18, -0.05, 1.42, -0.48);
  if (glam) {
    const pearls: [number, number, number][] = [[0.2, 1.8, 0.2], [-0.25, 1.62, 0.3], [0.38, 1.6, -0.1], [-0.1, 1.95, -0.05], [0.05, 1.62, 0.33]];
    for (const pp of pearls) b.box('cap', [0.08, 0.08, 0.08], pp, WHITE, { glow: 1.8 });
    b.pivot('sparkles', 'all', [0, 0, 0]);
    sparkles(b, { count: 9, radius: 0.8, y0: 0.5, y1: 2.0, seed: 5 });
  }
  // liście kalafiora
  b.box('cap', [0.3, 0.06, 0.36], [0.3, 1.3, 0.3], P.leaf, { rot: [0.5, 0.785, 0] });
  b.box('cap', [0.3, 0.06, 0.36], [-0.3, 1.3, 0.3], P.leafDark, { rot: [0.5, -0.785, 0] });
  b.box('cap', [0.36, 0.06, 0.4], [0, 1.3, -0.42], P.leafDark, { rot: [-0.55, 0, 0] });
  b.box('cap', [0.4, 0.06, 0.36], [0.42, 1.3, 0], P.leaf, { rot: [0, 0, -0.55] });
  b.box('cap', [0.4, 0.06, 0.36], [-0.42, 1.3, 0], P.leafDark, { rot: [0, 0, 0.55] });
}

function grzybMotion(v: Variant): MotionFn[] {
  const glam = v === 'glam';
  const legs: MotionFn = (c, w, fx) => {
    const { time, t, p } = c;
    // sztywny, „stukający” chód nóg krzesła
    let s = 0;
    if (c.anim === 'walk') {
      const x = Math.sin(t * (glam ? 1.3 : 1.7) * TAU);
      s = Math.sign(x) * Math.sqrt(Math.abs(x)) * (glam ? 0.25 : 0.38);
    } else if (c.anim === 'dance') {
      s = (glam ? 0.15 : 0.35) * Math.sin(t * 5.2);
    }
    w.rot('leg0', s, 0, 0);
    w.rot('leg3', s, 0, 0);
    w.rot('leg1', -s, 0, 0);
    w.rot('leg2', -s, 0, 0);
    // kapelusz się trzęsie
    const k = glam ? 0.35 : 1;
    w.rot('cap', 0.05 * k * Math.sin(time * 2.7), 0.1 * k * Math.sin(time * 1.1), 0.07 * k * Math.sin(time * 3.3 + 1));
    w.rot('armL', 0, 0, 0.15 * Math.sin(time * 2.5));
    w.rot('armR', 0, 0, -0.15 * Math.sin(time * 2.5 + 1));
    if (c.anim === 'windup' && !glam) {
      // świecący kalafior przed mocnym ciosem
      fx.glowGroup('cap', '#e8ff6a', 0.55 + 0.35 * Math.sin(t * 12));
      w.rot('armL', 0, 0, 1.2);
      w.rot('armR', 0, 0, -1.2);
    }
    if (c.anim === 'strongAttack' && !glam) {
      fx.glowGroup('cap', '#e8ff6a', 0.9 * (1 - ramp(p, 0.5, 0.9)));
      w.rot('cap', 0.5 * bump(p, 0.4, 0.8), 0, 0);
    }
    if (c.anim === 'attack') {
      w.rot('cap', 0.4 * bump(p, 0.3, 0.7), 0, 0);
      w.rot('armL', -1.2 * bump(p, 0.2, 0.7), 0, 0);
      w.rot('armR', -1.2 * bump(p, 0.2, 0.7), 0, 0);
    }
    if (c.anim === 'dance' || c.anim === 'cheer') {
      w.rot('armL', 0, 0, 1.8 + 0.4 * Math.sin(time * 8));
      w.rot('armR', 0, 0, -1.8 - 0.4 * Math.sin(time * 8));
    }
    if (glam) fx.glowGroup('cap', '#fff0fa', 0.12 + 0.06 * Math.sin(time * 2));
  };
  return glam
    ? [bodyMotion({ amp: 0.8, wob: 0, walk: 'glide', h: 1.9, elegant: true }), legs, sparkleMotion]
    : [bodyMotion({ amp: 1.3, wob: 1, walk: 'stride', h: 1.9, gait: 1.7 }), legs];
}

// ───────────────────────────── Kosiarrini Chwastorrini / Kwiatorra, Królowa Łąki ─────────────────────────────

function buildKosiarka(b: ModelBuilder, v: Variant): void {
  const glam = v === 'glam';
  const P = glam
    ? {
        deck: '#ffe3ef', deckDark: '#ffc6de', engine: '#ffb3d1', metal: GOLD, wheel: '#ffcc4d', hub: '#ff8fc0',
        stalk: '#7fd6a0', stalkDark: '#5fc486', leaf: '#a6ecc0', leafDark: '#86dca6',
        petal1: '#ff9cc8', petal2: '#ff72b1', disc: '#ffe07a',
      }
    : {
        deck: '#ff5a1f', deckDark: '#c93e0c', engine: '#3d3d46', metal: '#b9c2cc', wheel: '#1f1f24', hub: '#e3e3e3',
        stalk: '#3f8f2a', stalkDark: '#2f6e1f', leaf: '#7ed321', leafDark: '#5aa81c',
        petal1: '#ffd21f', petal2: '#ffb81f', disc: '#ffa600',
      };

  b.pivot('deck', 'all', [0, 0.35, 0]);
  // kosiarka / kareta
  b.box('deck', [1.7, 0.45, 1.5], [0, 0.64, 0], P.deck, { shade: 0.8 });
  b.box('deck', [1.74, 0.1, 1.54], [0, 0.44, 0], P.deckDark);
  b.box('deck', [1.4, 0.1, 1.2], [0, 0.9, 0], P.deckDark);
  b.box('deck', [1.5, 0.12, 0.12], [0, 0.55, 0.8], P.metal, glam ? { glow: 1.2 } : {});
  // silnik / tron z tyłu
  b.box('deck', [0.72, 0.42, 0.5], [0, 1.12, -0.46], P.engine);
  b.box('deck', [0.52, 0.1, 0.36], [0, 1.37, -0.46], P.metal, glam ? { glow: 1.2 } : {});
  // rączka kosiarki
  const a = 0.6;
  const dy = Math.sin(a);
  const dz = -Math.cos(a);
  for (const x of [0.6, -0.6]) b.box('deck', [0.08, 0.08, 1.1], [x, 0.9 + 0.55 * dy, -0.7 + 0.55 * dz], P.metal, { rot: [a, 0, 0], glow: glam ? 1.2 : undefined });
  b.box('deck', [1.36, 0.1, 0.1], [0, 0.9 + 1.1 * dy, -0.7 + 1.1 * dz], P.metal, glam ? { glow: 1.2 } : {});
  b.box('deck', [0.9, 0.14, 0.14], [0, 0.9 + 1.1 * dy, -0.7 + 1.1 * dz], glam ? '#ff8fc0' : '#1a1a1a');
  if (glam) {
    // girlandy kwiatów na karecie
    const flowers = ['#ff8fc0', '#c8a8ff', '#ffc49b', '#9fe6ff'];
    let k = 0;
    for (const s of [1, -1]) {
      for (const z of [-0.5, -0.17, 0.17, 0.5]) {
        const c = flowers[k++ % flowers.length] ?? WHITE;
        b.box('deck', [0.06, 0.18, 0.18], [s * 0.87, 0.7, z], c, { rot: [0.785, 0, 0] });
        b.box('deck', [0.07, 0.07, 0.07], [s * 0.89, 0.7, z], '#fff3a0', { glow: 1.8 });
      }
    }
    for (const x of [-0.5, 0, 0.5]) {
      const c = flowers[k++ % flowers.length] ?? WHITE;
      b.box('deck', [0.18, 0.18, 0.06], [x, 0.72, 0.77], c, { rot: [0, 0, 0.785] });
      b.box('deck', [0.07, 0.07, 0.07], [x, 0.72, 0.79], '#fff3a0', { glow: 1.8 });
    }
    b.box('deck', [1.72, 0.05, 1.52], [0, 0.88, 0], GOLD, { glow: 1.2 });
  } else {
    // rura wydechowa i linka rozrusznika
    b.box('deck', [0.1, 0.28, 0.1], [0.28, 1.44, -0.3], P.metal);
    b.box('deck', [0.2, 0.06, 0.06], [0.3, 1.2, -0.74], '#e02b2b');
    // skoszona trawa wystaje spod kosiarki
    for (const [x, z] of [[0.7, 0.78], [-0.5, 0.8], [0.1, 0.82], [-0.8, 0.5]] as const) {
      b.box('deck', [0.06, 0.16, 0.06], [x, 0.4, z], '#7ed321', { rot: [0.4, 0, (x * 7) % 0.6] });
    }
  }
  // koła (dwa kwadraty = ośmiokąt; brainrot jeździ na „kanciastych” kołach)
  const wy = 0.43;
  for (const [name, x, z] of [['wheelFL', 0.92, 0.5], ['wheelFR', -0.92, 0.5], ['wheelBL', 0.92, -0.5], ['wheelBR', -0.92, -0.5]] as const) {
    b.pivot(name, 'deck', [x, wy, z]);
    b.box(name, [0.2, 0.6, 0.6], [x, wy, z], P.wheel);
    b.box(name, [0.2, 0.6, 0.6], [x, wy, z], P.wheel, { rot: [0.785, 0, 0] });
    b.box(name, [0.22, 0.28, 0.28], [x, wy, z], P.hub);
    b.box(name, [0.24, 0.1, 0.1], [x, wy, z], glam ? WHITE : '#555');
  }

  // łodyga (3 segmenty — wygina się)
  b.pivot('stalk1', 'deck', [0, 0.95, 0]);
  b.pivot('stalk2', 'stalk1', [0, 1.9, 0]);
  b.pivot('stalk3', 'stalk2', [0.04, 2.75, 0]);
  b.box('stalk1', [0.38, 0.97, 0.38], [0, 1.43, 0], P.stalk);
  b.box('stalk1', [0.44, 0.1, 0.44], [0, 1.9, 0], P.stalkDark);
  b.box('stalk2', [0.34, 0.86, 0.34], [0.04, 2.33, 0], P.stalk);
  b.box('stalk2', [0.4, 0.1, 0.4], [0.04, 2.75, 0], P.stalkDark);
  b.box('stalk3', [0.3, 0.45, 0.3], [0.04, 2.97, 0], P.stalk);
  if (glam) {
    b.box('stalk1', [0.46, 0.06, 0.46], [0, 1.9, 0], GOLD, { glow: 1.3 });
    b.box('stalk2', [0.42, 0.06, 0.42], [0.04, 2.75, 0], GOLD, { glow: 1.3 });
  }

  // liście (ząbkowane u brainrota, gładkie u brainglama)
  const leaves: [string, string, number, number, number][] = [
    ['leaf1', 'stalk1', 1, 1.3, 0.8],
    ['leaf2', 'stalk1', -1, 1.62, 0.75],
    ['leaf3', 'stalk2', 1, 2.22, 0.62],
    ['leaf4', 'stalk2', -1, 2.45, 0.55],
  ];
  for (const [name, parent, s, y, len] of leaves) {
    const px = s * 0.17 + (parent === 'stalk2' ? 0.04 : 0);
    b.pivot(name, parent, [px, y, 0]);
    const rz = s * 0.3;
    const along = (d: number, off = 0): [number, number, number] => [px + s * d * Math.cos(0.3), y + d * Math.sin(0.3), off];
    b.box(name, [len, 0.06, 0.28], along(len / 2), P.leaf, { rot: [0, 0, rz] });
    b.box(name, [len * 0.9, 0.07, 0.04], along(len / 2), P.leafDark, { rot: [0, 0, rz] });
    if (glam) {
      b.box(name, [0.2, 0.06, 0.2], along(len), P.leaf, { rot: [0, 0.785, rz] });
    } else {
      for (let k = 1; k <= 3; k++) {
        const d = (k / 4) * len;
        b.box(name, [0.14, 0.06, 0.14], along(d, 0.15), P.leafDark, { rot: [0, 0.785, rz] });
        b.box(name, [0.14, 0.06, 0.14], along(d + 0.05, -0.15), P.leafDark, { rot: [0, 0.785, rz] });
      }
      b.box(name, [0.18, 0.06, 0.12], along(len + 0.04), P.leafDark, { rot: [0, 0, rz + s * 0.3] });
    }
  }

  // ręce-liście (klaszczą)
  for (const [hand, s] of [['handL', 1], ['handR', -1]] as const) {
    const px = 0.04 + s * 0.16;
    b.pivot(hand, 'stalk3', [px, 2.95, 0.05]);
    b.box(hand, [0.6, 0.1, 0.12], [px + s * 0.3, 2.95, 0.05], P.leafDark);
    b.box(hand, [0.1, 0.36, 0.3], [px + s * 0.62, 2.97, 0.05], P.leaf);
    b.box(hand, [0.1, 0.14, 0.1], [px + s * 0.62, 3.2, 0.12], P.leaf, { rot: [0.3, 0, 0] });
  }

  // głowa: mlecz / kwiat
  b.pivot('head', 'stalk3', [0.04, 3.1, 0]);
  b.pivot('eyes', 'head', [0.04, 3.56, 0.22]);
  const hc: [number, number] = [0.04, 3.5];
  for (let k = 0; k < 12; k++) {
    const an = (k * Math.PI) / 6;
    b.box('head', [0.36, 0.16, 0.12], [hc[0] + Math.cos(an) * 0.52, hc[1] + Math.sin(an) * 0.52, -0.04], k % 2 ? P.petal1 : P.petal2, { rot: [0, 0, an] });
  }
  for (let k = 0; k < 12; k++) {
    const an = (k * Math.PI) / 6 + Math.PI / 12;
    b.box('head', [0.3, 0.15, 0.12], [hc[0] + Math.cos(an) * 0.42, hc[1] + Math.sin(an) * 0.42, 0.03], k % 2 ? P.petal2 : P.petal1, { rot: [0, 0, an] });
  }
  b.box('head', [0.62, 0.62, 0.26], [hc[0], hc[1], 0.08], P.disc, { shade: 0.85 });
  if (glam) {
    eyePair(b, 'eyes', { x: hc[0], y: 3.56, z: 0.215, dx: 0.13, w: 0.1, h: 0.13 });
    lashes(b, 'eyes', { x: hc[0], y: 3.64, z: 0.215, dx: 0.13, w: 0.1 });
    b.box('head', [0.16, 0.035, 0.02], [hc[0], 3.38, 0.215], '#b0487e', { shade: 1 });
    b.pair('head', 'head', [0.035, 0.035, 0.02], [0.13, 3.395, 0.215], '#b0487e', { shade: 1 });
    cheeks(b, 'head', { y: 3.45, z: 0.215, dx: 0.21, w: 0.09 });
    // korona
    b.pivot('crown', 'head', [0.04, 3.95, 0]);
    b.box('crown', [0.56, 0.1, 0.3], [hc[0], 3.97, 0.02], GOLD, { glow: 1.6 });
    for (const x of [-0.21, 0, 0.21]) b.box('crown', [0.1, x === 0 ? 0.24 : 0.17, 0.1], [hc[0] + x, x === 0 ? 4.12 : 4.08, 0.02], GOLD, { glow: 1.6 });
    b.box('crown', [0.1, 0.1, 0.1], [hc[0], 4.26, 0.02], '#ff7fd0', { glow: 2.6, rot: [0, 0, 0.785] });
    b.pair('crown', 'crown', [0.07, 0.07, 0.07], [0.25, 4.19, 0.02], '#8fe7ff', { glow: 2.4, rot: [0, 0, 0.785] });
    b.pivot('sparkles', 'all', [0, 0, 0]);
    sparkles(b, { count: 14, radius: 1.5, y0: 0.8, y1: 4.0, size: 0.11, seed: 31 });
  } else {
    b.box('eyes', [0.12, 0.13, 0.03], [hc[0] + 0.14, 3.56, 0.215], INK, { shade: 1 });
    b.box('eyes', [0.12, 0.13, 0.03], [hc[0] - 0.14, 3.56, 0.215], INK, { shade: 1 });
    b.box('eyes', [0.04, 0.04, 0.02], [hc[0] + 0.12, 3.59, 0.235], WHITE, { shade: 1 });
    b.box('eyes', [0.04, 0.04, 0.02], [hc[0] - 0.16, 3.59, 0.235], WHITE, { shade: 1 });
    b.box('head', [0.18, 0.05, 0.02], [hc[0] + 0.14, 3.67, 0.215], '#5a2a00', { rot: [0, 0, 0.4], shade: 1 });
    b.box('head', [0.18, 0.05, 0.02], [hc[0] - 0.14, 3.67, 0.215], '#5a2a00', { rot: [0, 0, -0.4], shade: 1 });
    b.box('head', [0.36, 0.1, 0.02], [hc[0], 3.36, 0.215], '#5a1a00', { shade: 1 });
    for (const x of [-0.1, 0, 0.1]) b.box('head', [0.06, 0.05, 0.02], [hc[0] + x, 3.385, 0.222], WHITE, { shade: 1 });
  }
}

function kosiarkaMotion(v: Variant): MotionFn[] {
  const glam = v === 'glam';
  const extra: MotionFn = (c, w) => {
    const { time, t, p, seed } = c;
    const k = glam ? 0.5 : 1;
    // łodyga wygina się jak bicz
    const sway = (d: number): number => Math.sin(time * 1.6 - d + seed * 4) * 0.06 * k + Math.sin(time * 2.7 - d * 1.3) * 0.03 * k;
    w.rot('stalk1', 0.02 * Math.sin(time * 1.1), 0, sway(0));
    w.rot('stalk2', 0.03 * Math.sin(time * 1.3 - 0.5), 0, sway(0.6) * 1.3);
    w.rot('stalk3', 0.04 * Math.sin(time * 1.5 - 1), 0, sway(1.2) * 1.5);
    w.rot('head', 0, 0.12 * Math.sin(time * 0.8), 0.08 * k * Math.sin(time * 2.1));
    for (const [leaf, s, ph] of [['leaf1', 1, 0], ['leaf2', -1, 1], ['leaf3', 1, 2], ['leaf4', -1, 3]] as const) {
      w.rot(leaf, 0.1 * Math.sin(time * 2.3 + ph), 0, s * 0.12 * k * Math.sin(time * 3.1 + ph));
    }
    // koła
    let roll = 0;
    if (c.anim === 'walk') roll = t * 4;
    else if (c.anim === 'dance') roll = Math.sin(t * 2) * 1.2;
    else if (c.anim === 'attack' || c.anim === 'strongAttack') roll = 3 * ramp(p, 0.3, 0.5) - 3 * ramp(p, 0.55, 1);
    for (const wh of ['wheelFL', 'wheelFR', 'wheelBL', 'wheelBR']) w.rot(wh, roll, 0, 0);
    // silnik warczy
    if (!glam && c.anim !== 'sleep') w.pos('deck', 0, 0.012 * Math.sin(time * 47), 0);

    // klaskanie (brainrot) / machanie (brainglam)
    let clap = 0;
    if (glam) {
      const wave = 0.25 * Math.sin(time * 1.5);
      w.rot('handL', 0, -0.4, 0.3 + wave);
      w.rot('handR', 0, 0.4, -0.3 - wave);
      if (c.anim === 'cheer' || c.anim === 'dance') {
        w.rot('handL', 0, 0, 0.9 + 0.3 * Math.sin(time * 4));
        w.rot('handR', 0, 0, -0.9 - 0.3 * Math.sin(time * 4));
      }
    } else {
      switch (c.anim) {
        case 'idle': {
          const f = (time * 0.6 + seed) % 1;
          clap = f < 0.3 ? bump(f, 0, 0.15) + bump(f, 0.15, 0.3) : 0;
          break;
        }
        case 'attack':
          clap = bump(p, 0.2, 0.4) + bump(p, 0.4, 0.6) + bump(p, 0.6, 0.8);
          break;
        case 'strongAttack':
          clap = envelope(p, 0.45, 0.58, 0.7, 0.85);
          w.rot('handL', 0, 0, 1.4 * envelope(p, 0, 0.25, 0.45, 0.58));
          w.rot('handR', 0, 0, -1.4 * envelope(p, 0, 0.25, 0.45, 0.58));
          break;
        case 'dance':
        case 'cheer':
          clap = 0.5 + 0.5 * Math.sin(time * 12);
          break;
        case 'windup':
          w.rot('handL', 0, 0, 1.1 + 0.1 * Math.sin(t * 25));
          w.rot('handR', 0, 0, -1.1 - 0.1 * Math.sin(t * 25));
          break;
        default:
          break;
      }
      w.rot('handL', 0, -1.75 * clap, 0.1 * clap);
      w.rot('handR', 0, 1.75 * clap, -0.1 * clap);
    }
    if (c.anim === 'windup') w.rot('head', -0.3, 0, 0);
    if (c.anim === 'strongAttack') w.rot('stalk3', 0.5 * bump(p, 0.45, 0.8), 0, 0);
    if (c.anim === 'hit') w.rot('stalk2', -0.25 * envelope(p, 0, 0.1, 0.3, 1), 0, 0);
    if (c.anim === 'sleep') {
      w.rot('stalk2', 0.35, 0, 0.2);
      w.rot('head', 0.4, 0, 0);
      w.rot('handL', 0, 0, -0.6);
      w.rot('handR', 0, 0, 0.6);
    }
  };
  return glam
    ? [bodyMotion({ amp: 0.6, wob: 0, walk: 'roll', h: 4.2, elegant: true }), extra, sparkleMotion]
    : [bodyMotion({ amp: 0.8, wob: 0.45, walk: 'roll', h: 4.2 }), extra];
}

// ───────────────────────────── Eksport definicji ─────────────────────────────

const SLIMAK_K = 1.2;
const TRZMIEL_K = 1.0;
const GRZYB_K = 1.0;
const BOSS_K = 1.0;

function def(
  v: Variant,
  build: (b: ModelBuilder, v: Variant) => void,
  motions: (v: Variant) => MotionFn[],
  height: number,
  radius: number,
  scale: number,
): ModelDef & { scale: number } {
  return {
    height,
    radius,
    glam: v === 'glam',
    scale,
    build: b => build(b, v),
    motions: () => motions(v),
  };
}

export const brainrots: Record<string, ModelDef & { scale: number }> = {
  'enemy:slimakorro': def('rot', buildSlimak, slimakMotion, 1.35, 0.75, SLIMAK_K),
  'glam:slimakorro': def('glam', buildSlimak, slimakMotion, 1.35, 0.75, SLIMAK_K),
  'enemy:trzmielini': def('rot', buildTrzmiel, trzmielMotion, 1.7, 0.6, TRZMIEL_K),
  'glam:trzmielini': def('glam', buildTrzmiel, trzmielMotion, 1.7, 0.6, TRZMIEL_K),
  'enemy:grzybello': def('rot', buildGrzyb, grzybMotion, 1.95, 0.55, GRZYB_K),
  'glam:grzybello': def('glam', buildGrzyb, grzybMotion, 1.95, 0.55, GRZYB_K),
  'enemy:kosiarrini': def('rot', buildKosiarka, kosiarkaMotion, 4.1, 1.3, BOSS_K),
  'glam:kosiarrini': def('glam', buildKosiarka, kosiarkaMotion, 4.3, 1.3, BOSS_K),
};
