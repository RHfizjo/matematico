/**
 * Bohater: kostkowy dzieciak z dużą głową, czupryną, koszulką w kolorze z profilu (opts.color),
 * spodenkami i trampkami. Drewniany Miecz w prawej ręce (część 'weapon' — render może ją ukryć).
 */
import * as THREE from 'three';
import { bodyMotion, bipedMotion } from '../motion';
import type { ModelDef } from './common';
import { cheeks, eyePair } from './common';

const SKIN = '#f5cda6';
const SKIN_DARK = '#e9b48a';
const HAIR = '#6b3f22';
const HAIR_DARK = '#57321a';
const SHORTS = '#34466e';
const SHOE = '#f7f7f2';
const SHOE_ACCENT = '#ff5d5d';
const WOOD = '#d9a066';
const WOOD_DARK = '#8a5a2b';

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return `#${c.getHexString()}`;
}

export const hero: ModelDef = {
  height: 1.8,
  radius: 0.35,
  build(b, opts) {
    const shirt = opts.color ?? '#3fa7ff';
    const shirtDark = shade(shirt, 0.78);

    b.pivot('legL', 'all', [0.12, 0.55, 0]);
    b.pivot('legR', 'all', [-0.12, 0.55, 0]);
    b.pivot('body', 'all', [0, 0.55, 0]);
    b.pivot('head', 'body', [0, 1.1, 0]);
    b.pivot('eyes', 'head', [0, 1.38, 0.28]);
    b.pivot('armL', 'body', [0.33, 1.04, 0]);
    b.pivot('armR', 'body', [-0.33, 1.04, 0]);
    b.pivot('weapon', 'armR', [-0.34, 0.6, 0.06]);

    // Nogi: spodenki, łydki, trampki
    for (const [leg, x] of [['legL', 0.12], ['legR', -0.12]] as const) {
      b.box(leg, [0.23, 0.22, 0.27], [x, 0.44, 0], SHORTS);
      b.box(leg, [0.17, 0.22, 0.19], [x, 0.23, 0], SKIN);
      b.box(leg, [0.2, 0.05, 0.21], [x, 0.135, 0], SHOE, { shade: 1 }); // skarpetka
      b.box(leg, [0.21, 0.1, 0.3], [x, 0.065, 0.035], SHOE, { shade: 0.9 });
      b.box(leg, [0.22, 0.035, 0.31], [x, 0.018, 0.035], SHOE_ACCENT, { shade: 1 });
      b.box(leg, [0.12, 0.03, 0.08], [x, 0.115, 0.15], SHOE_ACCENT, { shade: 1 });
    }

    // Tułów
    b.box('body', [0.5, 0.52, 0.3], [0, 0.84, 0], shirt);
    b.box('body', [0.52, 0.07, 0.32], [0, 0.6, 0], shirtDark, { shade: 1 });
    b.box('body', [0.24, 0.05, 0.05], [0, 1.08, 0.14], shirtDark, { shade: 1 });
    // „+” na koszulce — znak małego matematyka
    b.box('body', [0.14, 0.045, 0.02], [0.1, 0.9, 0.155], '#ffe066', { shade: 1 });
    b.box('body', [0.045, 0.14, 0.02], [0.1, 0.9, 0.155], '#ffe066', { shade: 1 });

    // Ręce: rękaw + skóra
    for (const [arm, x] of [['armL', 0.33], ['armR', -0.33]] as const) {
      b.box(arm, [0.17, 0.2, 0.21], [x, 0.97, 0], shirt);
      b.box(arm, [0.14, 0.34, 0.17], [x, 0.71, 0], SKIN);
    }

    // Drewniany miecz (skierowany do przodu i lekko w górę)
    const a = 0.55;
    const d = [0, Math.sin(a), Math.cos(a)] as const;
    const hx = -0.34;
    const hy = 0.6;
    const hz = 0.06;
    const at = (s: number): [number, number, number] => [hx, hy + d[1] * s, hz + d[2] * s];
    b.box('weapon', [0.06, 0.06, 0.16], at(0.02), WOOD_DARK, { rot: [-a, 0, 0] });
    b.box('weapon', [0.22, 0.06, 0.06], at(0.12), WOOD_DARK, { rot: [-a, 0, 0] });
    b.box('weapon', [0.07, 0.1, 0.5], at(0.4), WOOD, { rot: [-a, 0, 0] });
    b.box('weapon', [0.05, 0.07, 0.08], at(0.68), WOOD, { rot: [-a, 0, 0] });

    // Głowa
    b.box('head', [0.62, 0.58, 0.56], [0, 1.4, 0], SKIN, { shade: 0.88 });
    b.pair('head', 'head', [0.06, 0.13, 0.11], [0.33, 1.38, 0], SKIN_DARK);
    // Włosy: czapka, tył, boki, grzywka, sterczący kosmyk
    b.box('head', [0.66, 0.14, 0.6], [0, 1.72, -0.01], HAIR, { shade: 0.9 });
    b.box('head', [0.66, 0.5, 0.12], [0, 1.45, -0.25], HAIR_DARK);
    b.pair('head', 'head', [0.06, 0.26, 0.5], [0.33, 1.56, -0.03], HAIR);
    b.box('head', [0.66, 0.1, 0.1], [0, 1.64, 0.26], HAIR);
    b.box('head', [0.22, 0.09, 0.08], [0.17, 1.56, 0.27], HAIR);
    b.box('head', [0.14, 0.06, 0.08], [-0.2, 1.575, 0.27], HAIR);
    b.box('head', [0.09, 0.13, 0.09], [0.06, 1.83, 0.03], HAIR, { rot: [0.2, 0, -0.35] });
    b.box('head', [0.07, 0.09, 0.07], [-0.04, 1.81, -0.05], HAIR_DARK, { rot: [-0.2, 0, 0.4] });
    // Twarz
    eyePair(b, 'eyes', { y: 1.39, z: 0.285, dx: 0.14, w: 0.1, h: 0.14 });
    b.pair('head', 'head', [0.11, 0.03, 0.02], [0.14, 1.495, 0.285], HAIR_DARK, { shade: 1 });
    cheeks(b, 'head', { y: 1.28, z: 0.285, dx: 0.22 });
    b.box('head', [0.12, 0.035, 0.02], [0, 1.25, 0.285], '#b5484f', { shade: 1 });
    b.pair('head', 'head', [0.03, 0.03, 0.02], [0.07, 1.265, 0.285], '#b5484f', { shade: 1 });
    b.box('head', [0.05, 0.04, 0.03], [0, 1.32, 0.29], SKIN_DARK, { shade: 1 });
  },
  motions: () => [bodyMotion({ amp: 1, wob: 0, walk: 'stride', h: 1.8, gait: 1.7 }), bipedMotion({ gait: 1.7 })],
};
