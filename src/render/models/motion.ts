/**
 * Ruchy ogólne (wspólne dla wielu modeli): całe ciało ('all'), kończyny dwunożnych
 * ('armL','armR','legL','legR','head','body'), oczy ('eyes' — mruganie, sen).
 * Modele dokładają własne ruchy (uszy, skrzydła, sznurówki…) w swoich plikach.
 */
import {
  TAU,
  blink,
  bump,
  easeInCubic,
  easeOutBack,
  envelope,
  hop,
  ramp,
  squash,
  wobble,
} from './anim';
import type { AnimCtx, MotionFn, PoseWriter, RigFx } from './rig';

export type WalkKind = 'stride' | 'hop' | 'slide' | 'hover' | 'roll' | 'glide' | 'none';

export interface BodyCfg {
  /** Ogólna amplituda ruchu (brainrot > 1, brainglam < 1). */
  amp: number;
  /** Nieregularne kiwanie w spoczynku (brainroty). */
  wob: number;
  walk: WalkKind;
  /** Wysokość modelu — skaluje przesunięcia. */
  h: number;
  /** Styl: elegancki (brainglam) — łagodny taniec z obrotem. */
  elegant?: boolean;
  /** Wysokość unoszenia (latające). */
  hover?: number;
  /** Zwykła częstotliwość chodu (cykle/s). */
  gait?: number;
}

function sq(w: PoseWriter, k: number): void {
  const [sx, sy, sz] = squash(k);
  w.scale('all', sx, sy, sz);
}

/** Ruch całego ciała dla wszystkich animacji. */
export function bodyMotion(cfg: BodyCfg): MotionFn {
  const { amp, wob, h } = cfg;
  const hs = Math.min(1.6, Math.max(0.5, h / 1.4)); // skala przesunięć
  const lunge = 0.55 * hs;
  const gait = cfg.gait ?? 1.6;
  return (c: AnimCtx, w: PoseWriter, fx: RigFx) => {
    const { t, p, time, seed } = c;
    const s7 = seed * 7;
    // unoszenie się (latające) — zawsze
    if (cfg.hover) w.pos('all', 0, cfg.hover + 0.07 * hs * Math.sin(time * 2.4 + s7), 0);

    switch (c.anim) {
      case 'idle': {
        if (cfg.elegant) {
          w.pos('all', 0, 0.025 * hs * (1 + Math.sin(time * 1.7 + s7)), 0);
          w.rot('all', 0, 0.06 * Math.sin(time * 0.7 + s7), 0.035 * Math.sin(time * 1.3 + s7));
          sq(w, 0.015 * Math.sin(time * 1.7 + s7));
        } else {
          sq(w, 0.02 * amp * Math.sin(time * 2.2 + s7));
          if (wob > 0) {
            w.rot('all', 0.05 * wob * wobble(time * 0.9, s7 + 3), 0.06 * wob * wobble(time * 0.6, s7 + 5), 0.08 * wob * wobble(time, s7));
            sq(w, 0.045 * wob * Math.sin(time * 3.3 + s7));
          }
        }
        break;
      }
      case 'walk': {
        const ph = t * gait;
        const s = Math.sin(ph * TAU);
        switch (cfg.walk) {
          case 'stride':
            w.pos('all', 0, 0.045 * hs * Math.abs(Math.sin(ph * TAU)), 0);
            w.rot('all', 0.06, 0, 0.035 * amp * s);
            break;
          case 'hop': {
            const hp = t * gait * 1.35;
            const f = hp - Math.floor(hp);
            w.pos('all', 0, 0.2 * hs * hop(hp), 0);
            sq(w, f < 0.12 ? -0.14 * (1 - f / 0.12) : f > 0.9 ? -0.1 * ((f - 0.9) / 0.1) : 0.07 * Math.sin(f * Math.PI));
            w.rot('all', -0.12 * Math.sin(f * TAU), 0, 0);
            break;
          }
          case 'slide': {
            // ślimak: pełznięcie — rozciąganie wzdłuż Z
            const k = Math.sin(ph * TAU);
            w.scale('all', 1 - 0.04 * k, 1 - 0.05 * k, 1 + 0.1 * k);
            w.rot('all', 0, 0, 0.03 * amp * Math.sin(ph * TAU * 0.5));
            break;
          }
          case 'hover':
            w.rot('all', 0.18, 0, 0.08 * s);
            w.pos('all', 0, 0.05 * Math.sin(ph * TAU * 2), 0);
            break;
          case 'roll':
            w.pos('all', 0, 0.02 * Math.abs(Math.sin(t * 22)), 0);
            w.rot('all', 0.02 * Math.sin(t * 17), 0, 0.03 * s);
            break;
          case 'glide':
            w.pos('all', 0, 0.04 * hs * (1 + Math.sin(ph * TAU)), 0);
            w.rot('all', 0.04, 0, 0.05 * s);
            break;
          case 'none':
            break;
        }
        if (wob > 0) w.rot('all', 0, 0.08 * wob * Math.sin(ph * TAU * 0.5), 0.1 * wob * s);
        break;
      }
      case 'windup': {
        const tr = cfg.elegant ? 0.01 : 0.03 * amp;
        w.rot('all', -0.2 * Math.min(1.3, amp), 0, tr * Math.sin(t * 43));
        w.pos('all', 0.015 * amp * Math.sin(t * 37), 0, -0.08 * hs);
        sq(w, -0.08 - 0.02 * Math.sin(t * 9));
        if (wob > 0) w.rot('all', 0, 0.08 * wob * Math.sin(t * 7), 0);
        break;
      }
      case 'attack': {
        const back = bump(p, 0, 0.36);
        const go = envelope(p, 0.3, 0.42, 0.55, 0.95);
        w.pos('all', 0, 0.05 * hs * bump(p, 0.3, 0.6), -0.12 * hs * back + lunge * go);
        w.rot('all', -0.22 * back + 0.3 * go, 0, wob > 0 ? 0.18 * wob * bump(p, 0.35, 0.7) * Math.sin(p * 30) : 0);
        sq(w, -0.1 * back + 0.1 * bump(p, 0.3, 0.45) - 0.1 * bump(p, 0.45, 0.65));
        break;
      }
      case 'strongAttack': {
        const crouch = envelope(p, 0, 0.2, 0.28, 0.36);
        const air = bump(p, 0.3, 0.6);
        const fwd = ramp(p, 0.32, 0.6) * (1 - ramp(p, 0.72, 1));
        const impact = envelope(p, 0.57, 0.61, 0.68, 0.9);
        w.pos('all', 0, 0.75 * hs * air, lunge * 1.3 * fwd);
        w.rot('all', -0.25 * crouch + 0.35 * bump(p, 0.4, 0.75), 0, 0);
        sq(w, -0.22 * crouch + 0.14 * bump(p, 0.3, 0.45) - 0.3 * impact);
        break;
      }
      case 'hit': {
        const knock = envelope(p, 0, 0.08, 0.28, 1);
        w.pos('all', 0, 0, -0.28 * hs * knock);
        w.rot('all', -0.32 * knock, 0, 0.16 * Math.sin(p * 26) * (1 - p));
        sq(w, -0.14 * bump(p, 0, 0.45));
        fx.flash(0.65 * (1 - ramp(p, 0, 0.55)));
        break;
      }
      case 'block': {
        const g = envelope(p, 0, 0.15, 0.7, 1);
        w.rot('all', -0.1 * g, 0, 0);
        w.pos('all', 0, 0, -0.06 * hs * g);
        sq(w, -0.08 * g);
        break;
      }
      case 'dance': {
        if (cfg.elegant) {
          w.rot('all', 0, t * 1.5, 0.07 * Math.sin(t * 1.5));
          w.pos('all', 0, 0.09 * hs * (1 + Math.sin(t * 3)), 0);
          sq(w, 0.03 * Math.sin(t * 3));
        } else if (wob > 0) {
          const hp = t * 2.6;
          w.pos('all', 0.1 * hs * Math.sin(t * 2.6), 0.2 * hs * hop(hp), 0);
          w.rot('all', 0.1 * Math.sin(t * 5.2), 0.9 * Math.sin(t * 1.3), 0.3 * Math.sin(t * 5.2));
          const f = hp - Math.floor(hp);
          sq(w, f < 0.15 ? -0.18 : 0.08 * Math.sin(f * Math.PI));
        } else {
          const hp = t * 2.2;
          w.pos('all', 0, 0.16 * hs * hop(hp), 0);
          w.rot('all', 0, 0.6 * Math.sin(t * 2.2), 0.14 * Math.sin(t * 4.4));
          const f = hp - Math.floor(hp);
          sq(w, f < 0.12 ? -0.12 : 0.05);
        }
        break;
      }
      case 'cheer': {
        const ph = Math.min(1, p / 0.84) * 2;
        const f = ph - Math.floor(ph);
        const air = ph < 2 ? hop(ph) : 0;
        w.pos('all', 0, 0.34 * hs * air * (cfg.elegant ? 0.7 : 1), 0);
        sq(w, ph < 2 ? (f < 0.12 || f > 0.92 ? -0.14 : 0.08 * Math.sin(f * Math.PI)) : -0.1 * bump(p, 0.84, 1));
        if (cfg.elegant) w.rot('all', 0, TAU * easeOutBack(ramp(p, 0.1, 0.85), 1.2), 0);
        else w.rot('all', 0, 0, 0.12 * Math.sin(p * TAU * 2));
        break;
      }
      case 'hide': {
        sq(w, 0.12 * bump(p, 0, 0.25) - 0.1 * bump(p, 0.1, 0.3));
        const s = 1 - easeInCubic(ramp(p, 0.18, 1));
        w.scale('all', Math.max(0.0001, s));
        w.pos('all', 0, -0.35 * hs * ramp(p, 0.18, 1), 0);
        break;
      }
      case 'appear': {
        const s = Math.max(0.0001, easeOutBack(ramp(p, 0, 0.72), 2));
        w.scale('all', s);
        w.pos('all', 0, -0.3 * hs * (1 - ramp(p, 0, 0.45)) + 0.18 * hs * bump(p, 0.35, 0.75), 0);
        break;
      }
      case 'open': {
        w.rot('all', 0.18 * bump(p, 0, 0.6), 0, 0);
        break;
      }
      case 'sleep': {
        sq(w, -0.07 + 0.035 * Math.sin(time * 1.4));
        w.rot('all', 0.06, 0, 0.12);
        break;
      }
    }

    // Oczy: mruganie, sen, ciosy
    if (w.has('eyes')) {
      let e = blink(time, seed);
      if (c.anim === 'sleep') e = 0.12;
      else if (c.anim === 'hit') e = 1 - 0.8 * bump(p, 0, 0.7);
      else if (c.anim === 'windup') e = 0.6;
      w.scale('eyes', 1, Math.max(0.08, e), 1);
    }
  };
}

/** Kończyny dwunożnych (bohater, handlarz): ręce, nogi, głowa, tułów. */
export function bipedMotion(opts: { armSwing?: number; legSwing?: number; gait?: number; weapon?: boolean } = {}): MotionFn {
  const aSw = opts.armSwing ?? 0.6;
  const lSw = opts.legSwing ?? 0.65;
  const gait = opts.gait ?? 1.6;
  return (c: AnimCtx, w: PoseWriter) => {
    const { t, p, time, seed } = c;
    const s7 = seed * 7;
    switch (c.anim) {
      case 'idle': {
        w.rot('armL', 0, 0, 0.05 + 0.03 * Math.sin(time * 2.2 + s7));
        w.rot('armR', 0, 0, -0.05 - 0.03 * Math.sin(time * 2.2 + s7));
        w.rot('head', 0.03 * Math.sin(time * 1.1 + s7), 0.18 * Math.sin(time * 0.45 + s7) ** 3, 0);
        break;
      }
      case 'walk': {
        const s = Math.sin(t * gait * TAU);
        w.rot('legL', lSw * s, 0, 0);
        w.rot('legR', -lSw * s, 0, 0);
        w.rot('armL', -aSw * s, 0, 0.06);
        w.rot('armR', aSw * s, 0, -0.06);
        w.rot('head', 0.03, 0, 0);
        break;
      }
      case 'windup': {
        w.rot('armR', -2.5 + 0.08 * Math.sin(t * 20), 0, -0.25);
        w.rot('armL', -0.7, 0, 0.3);
        w.rot('body', 0, -0.35, 0);
        w.rot('legL', -0.25, 0, 0);
        w.rot('legR', 0.25, 0, 0);
        break;
      }
      case 'attack': {
        const up = ramp(p, 0, 0.3);
        const swing = ramp(p, 0.3, 0.45);
        const back = ramp(p, 0.55, 1);
        const armRx = (-2.6 * up + 2.25 * swing) * (1 - back);
        w.rot('armR', armRx, 0, -0.2 * (1 - back));
        w.rot('armL', -0.5 * bump(p, 0.2, 0.8), 0, 0.3 * bump(p, 0.2, 0.8));
        w.rot('body', 0, -0.4 * up * (1 - swing) + 0.35 * swing * (1 - back), 0);
        w.rot('legL', -0.5 * envelope(p, 0.3, 0.42, 0.55, 0.95), 0, 0);
        w.rot('legR', 0.4 * envelope(p, 0.3, 0.42, 0.55, 0.95), 0, 0);
        break;
      }
      case 'strongAttack': {
        const up = ramp(p, 0, 0.3) * (1 - ramp(p, 0.52, 0.6));
        const down = ramp(p, 0.52, 0.62) * (1 - ramp(p, 0.75, 1));
        w.rot('armR', -2.9 * up - 0.6 * down, 0, -0.1);
        w.rot('armL', -2.9 * up - 0.6 * down, 0, 0.1);
        const air = bump(p, 0.3, 0.6);
        w.rot('legL', -0.6 * air, 0, 0);
        w.rot('legR', 0.3 * air, 0, 0);
        w.rot('head', -0.2 * up + 0.15 * down, 0, 0);
        break;
      }
      case 'hit': {
        const k = envelope(p, 0, 0.08, 0.3, 1);
        w.rot('armL', -0.4 * k, 0, 0.8 * k);
        w.rot('armR', -0.4 * k, 0, -0.8 * k);
        w.rot('head', -0.35 * k, 0, 0);
        break;
      }
      case 'block': {
        const g = envelope(p, 0, 0.15, 0.7, 1);
        w.rot('armL', -1.25 * g, 0, -0.42 * g);
        w.rot('armR', -1.25 * g, 0, 0.42 * g);
        w.rot('head', 0.12 * g, 0, 0);
        w.rot('legL', -0.2 * g, 0, 0);
        w.rot('legR', 0.2 * g, 0, 0);
        break;
      }
      case 'dance': {
        const s = Math.sin(t * 4.4);
        w.rot('armL', 0, 0, 2.2 + 0.5 * s);
        w.rot('armR', 0, 0, -2.2 + 0.5 * s);
        w.rot('legL', 0.35 * Math.max(0, s), 0, 0.15 * Math.max(0, s));
        w.rot('legR', 0.35 * Math.max(0, -s), 0, -0.15 * Math.max(0, -s));
        w.rot('head', 0, 0, 0.15 * Math.sin(t * 2.2));
        break;
      }
      case 'cheer': {
        const up = envelope(p, 0, 0.12, 0.85, 1);
        const wave = 0.3 * Math.sin(p * TAU * 3);
        w.rot('armL', 0, 0, (2.75 + wave) * up);
        w.rot('armR', 0, 0, (-2.75 + wave) * up);
        w.rot('head', -0.2 * up, 0, 0);
        const ph = Math.min(1, p / 0.84) * 2;
        const f = ph - Math.floor(ph);
        const air = ph < 2 ? Math.sin(f * Math.PI) : 0;
        w.rot('legL', -0.35 * air, 0, 0);
        w.rot('legR', -0.35 * air, 0, 0);
        break;
      }
      case 'sleep': {
        w.rot('head', 0.35, 0, 0.1);
        w.rot('armL', 0.1, 0, 0.12);
        w.rot('armR', 0.1, 0, -0.12);
        break;
      }
      case 'open': {
        const g = bump(p, 0, 1);
        w.rot('armR', -1.3 * g, 0, 0);
        w.rot('armL', -1.3 * g, 0, 0);
        break;
      }
      default:
        break;
    }
  };
}

/** Pomocnicze: wahadło z tłumieniem (np. uszy po podskoku). */
export function flop(time: number, freq: number, seed = 0): number {
  return Math.sin(time * freq + seed) * 0.5 + Math.sin(time * freq * 1.7 + seed * 2) * 0.25;
}
