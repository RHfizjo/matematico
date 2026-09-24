/**
 * Handlarz Kartonini (GDD 9.5a): przyjazne kartonowe pudło z wielkim wąsem,
 * w malutkiej rączce trzyma wachlarz kart; z pudła wystają kolejne karty.
 */
import { TAU, bump, envelope } from '../anim';
import { bodyMotion } from '../motion';
import type { ModelDef } from './common';
import { cheeks, eyePair, WHITE } from './common';

const CARD = '#c8965a';
const CARD_DARK = '#a8743f';
const CARD_EDGE = '#b5824b';
const TAPE = '#e8cf9f';
const INSIDE = '#6e4a2a';
const STACHE = '#3b2314';

export const kartonini: ModelDef = {
  height: 1.45,
  radius: 0.5,
  build(b) {
    b.pivot('legL', 'all', [0.2, 0.3, 0]);
    b.pivot('legR', 'all', [-0.2, 0.3, 0]);
    b.pivot('body', 'all', [0, 0.3, 0]);
    b.pivot('eyes', 'body', [0, 0.92, 0.36]);
    b.pivot('mustache', 'body', [0, 0.79, 0.37]);
    b.pivot('armL', 'body', [0.45, 0.85, 0.05]);
    b.pivot('armR', 'body', [-0.45, 0.85, 0.05]);
    b.pivot('cards', 'armR', [-0.3, 0.56, 0.44]);
    b.pivot('flapF', 'body', [0, 1.1, 0.35]);
    b.pivot('flapB', 'body', [0, 1.1, -0.35]);
    b.pivot('flapL', 'body', [0.45, 1.1, 0]);
    b.pivot('flapR', 'body', [-0.45, 1.1, 0]);

    // nóżki w butach
    for (const [leg, x] of [['legL', 0.2], ['legR', -0.2]] as const) {
      b.box(leg, [0.15, 0.26, 0.15], [x, 0.19, 0], CARD_DARK);
      b.box(leg, [0.2, 0.09, 0.28], [x, 0.045, 0.04], '#5a3a22');
    }
    // pudło
    b.box('body', [0.9, 0.8, 0.7], [0, 0.7, 0], CARD, { shade: 0.82 });
    b.box('body', [0.84, 0.02, 0.64], [0, 1.095, 0], INSIDE, { shade: 1 });
    b.pair('body', 'body', [0.02, 0.8, 0.16], [0.455, 0.7, 0], TAPE, { shade: 1 });
    b.box('body', [0.91, 0.03, 0.71], [0, 0.315, 0], CARD_EDGE, { shade: 1 });
    // strzałki „tą stroną do góry” na bokach
    for (const s of [1, -1]) {
      for (const z of [-0.08, 0.12]) {
        b.box('body', [0.02, 0.16, 0.035], [s * 0.456, 0.62, z], '#6b4428', { shade: 1 });
        b.box('body', [0.02, 0.07, 0.035], [s * 0.456, 0.7, z - 0.035], '#6b4428', { rot: [-0.7, 0, 0], shade: 1 });
        b.box('body', [0.02, 0.07, 0.035], [s * 0.456, 0.7, z + 0.035], '#6b4428', { rot: [0.7, 0, 0], shade: 1 });
      }
    }
    // karty wystające z pudła
    b.box('body', [0.22, 0.3, 0.025], [-0.16, 1.15, -0.1], '#7b61ff', { rot: [0, 0.2, 0.22] });
    b.box('body', [0.22, 0.3, 0.025], [0.12, 1.17, -0.02], '#ff9f1c', { rot: [0, -0.2, -0.16] });
    b.box('body', [0.22, 0.3, 0.025], [0.0, 1.13, -0.2], '#3ccf6e', { rot: [0, 0, 0.05] });
    // klapki (otwarte, jak kapelusz)
    b.box('flapF', [0.88, 0.34, 0.03], [0, 1.25, 0.435], CARD_EDGE, { rot: [0.52, 0, 0] });
    b.box('flapB', [0.88, 0.34, 0.03], [0, 1.25, -0.435], CARD_EDGE, { rot: [-0.52, 0, 0] });
    b.box('flapL', [0.03, 0.34, 0.68], [0.535, 1.25, 0], CARD, { rot: [0, 0, -0.52] });
    b.box('flapR', [0.03, 0.34, 0.68], [-0.535, 1.25, 0], CARD, { rot: [0, 0, 0.52] });

    // twarz: oczy, krzaczaste brwi, nosek, wielki wąs, muszka
    eyePair(b, 'eyes', { y: 0.92, z: 0.355, dx: 0.17, w: 0.1, h: 0.13 });
    b.pair('body', 'body', [0.17, 0.05, 0.03], [0.17, 1.02, 0.36], STACHE, { rot: [0, 0, -0.15], shade: 1 });
    b.box('body', [0.12, 0.09, 0.07], [0, 0.85, 0.385], CARD_DARK);
    cheeks(b, 'body', { y: 0.84, z: 0.355, dx: 0.28, w: 0.1 });
    b.box('mustache', [0.36, 0.1, 0.06], [0, 0.79, 0.385], STACHE);
    b.pair('mustache', 'mustache', [0.17, 0.09, 0.06], [0.25, 0.77, 0.385], STACHE, { rot: [0, 0, -0.35] });
    b.pair('mustache', 'mustache', [0.08, 0.13, 0.06], [0.35, 0.82, 0.385], STACHE, { rot: [0, 0, -0.2] });
    b.pair('mustache', 'mustache', [0.06, 0.06, 0.06], [0.33, 0.89, 0.385], STACHE);
    b.box('body', [0.1, 0.1, 0.05], [0, 0.6, 0.37], '#e63946');
    b.pair('body', 'body', [0.13, 0.15, 0.04], [0.1, 0.6, 0.365], '#ff5a67');

    // rączki: lewa macha, prawa trzyma wachlarz kart
    b.box('armL', [0.12, 0.3, 0.12], [0.51, 0.72, 0.05], CARD_DARK);
    b.box('armL', [0.15, 0.13, 0.15], [0.51, 0.53, 0.05], WHITE, { shade: 0.85 });
    b.box('armR', [0.12, 0.38, 0.12], [-0.41, 0.72, 0.21], CARD_DARK, { rot: [-0.89, 0, 0] });
    b.box('armR', [0.15, 0.13, 0.15], [-0.36, 0.58, 0.38], WHITE, { shade: 0.85 });
    const cols = ['#58c4ff', '#3ccf6e', '#b25cff', '#ff9f1c', '#ff5d7a'];
    for (let k = 0; k < 5; k++) {
      const a = (2 - k) * 0.3;
      const cx = -0.3 - Math.sin(a) * 0.15;
      const cy = 0.55 + Math.cos(a) * 0.15;
      const z = 0.44 + k * 0.014;
      const c = cols[k] ?? WHITE;
      b.box('cards', [0.2, 0.28, 0.012], [cx, cy, z], c, { rot: [0, 0, a], shade: 1 });
      b.box('cards', [0.15, 0.22, 0.012], [cx, cy, z + 0.004], '#fffaf0', { rot: [0, 0, a], shade: 1 });
      b.box('cards', [0.06, 0.06, 0.012], [cx - Math.sin(a) * 0.02, cy + Math.cos(a) * 0.02, z + 0.008], c, { rot: [0, 0, a + 0.785], shade: 1 });
    }
  },
  motions: () => [
    bodyMotion({ amp: 1, wob: 0, walk: 'stride', h: 1.45, gait: 1.8 }),
    (c, w) => {
      const { time, t, p } = c;
      // wąs podskakuje, wachlarz kart „oddycha”
      const twitch = bump((time * 0.5) % 1, 0, 0.08);
      w.rot('mustache', 0, 0, 0.06 * Math.sin(time * 2) + 0.12 * twitch * Math.sin(time * 40));
      w.pos('mustache', 0, 0.015 * twitch, 0);
      w.rot('cards', 0, 0, 0.06 * Math.sin(time * 1.3));
      w.scale('cards', 1 + 0.05 * Math.sin(time * 1.7), 1, 1);
      w.rot('armL', 0, 0, 0.08 + 0.05 * Math.sin(time * 2));
      const flap = 0.05 * Math.sin(time * 2.4);
      w.rot('flapF', flap, 0, 0);
      w.rot('flapB', -flap, 0, 0);
      w.rot('flapL', 0, 0, -flap);
      w.rot('flapR', 0, 0, flap);
      switch (c.anim) {
        case 'walk': {
          const s = Math.sin(t * 1.8 * TAU);
          w.rot('legL', 0.6 * s, 0, 0);
          w.rot('legR', -0.6 * s, 0, 0);
          w.rot('armL', -0.4 * s, 0, 0);
          break;
        }
        case 'cheer':
        case 'dance':
        case 'open': {
          // „Witaj, handlujemy?” — macha rączką, klapki fruwają, karty się rozkładają
          const k = c.anim === 'dance' ? 1 : envelope(p, 0, 0.1, 0.85, 1);
          w.rot('armL', 0, 0, (2.4 + 0.35 * Math.sin(time * 12)) * k);
          const f = 0.35 * Math.sin(time * 14) * k;
          w.rot('flapF', f, 0, 0);
          w.rot('flapB', -f, 0, 0);
          w.rot('flapL', 0, 0, -f);
          w.rot('flapR', 0, 0, f);
          w.scale('cards', 1 + 0.2 * k, 1 + 0.1 * k, 1);
          w.rot('mustache', 0, 0, 0.12 * Math.sin(time * 10) * k);
          break;
        }
        case 'sleep':
          w.rot('flapF', 0.5, 0, 0);
          w.rot('mustache', 0, 0, 0.05 * Math.sin(time * 1.4));
          break;
        default:
          break;
      }
    },
  ],
};
