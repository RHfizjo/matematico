/**
 * Syntezator Web Audio: proste „klocki” (ton, szum), instrumenty muzyki i przepisy efektów (SFX).
 * Bez plików audio. Wszystkie dźwięki są krótkie, miękkie (łagodny atak, bez ostrych fal na wierzchu)
 * i kończą się same — węzły zatrzymują się i są sprzątane przez przeglądarkę.
 */
import type { SfxName } from '../game/contracts';
import type { LeadTimbre, NoteEvent, Voice } from './music';
import { midiToHz } from './music';

export interface SynthCtx {
  ctx: BaseAudioContext;
  /** Bufor białego szumu (mono, ~2 s). */
  noise: AudioBuffer;
}

const MIN = 0.0001;

// ───────────────────────────── Klocki ─────────────────────────────

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** Docelowa częstotliwość (glissando wykładnicze). */
  f2?: number;
  /** Czas glissanda (s). */
  glide?: number;
  t: number;
  /** Atak (s). */
  a?: number;
  /** Długość wybrzmienia (s): 'exp' — zanik do ciszy; 'hold' — utrzymanie. */
  d: number;
  peak: number;
  shape?: 'exp' | 'hold';
  /** Wybrzmienie po 'hold' (s). */
  r?: number;
  detune?: number;
  /** Filtr dolnoprzepustowy (Hz) i jego docelowa wartość (obwiednia filtra). */
  lp?: number;
  lp2?: number;
  lpQ?: number;
  /** Vibrato: częstotliwość (Hz) i głębokość (centy); decay = czas wygaszania vibrato. */
  vib?: { rate: number; cents: number; decay?: number };
  /** Tremolo (Hz, głębokość 0..1). */
  trem?: { rate: number; depth: number };
  dest: AudioNode;
}

export function tone(s: SynthCtx, o: ToneOpts): void {
  const { ctx } = s;
  const a = Math.max(0.001, o.a ?? 0.004);
  const shape = o.shape ?? 'exp';
  const r = o.r ?? 0.12;
  const end = shape === 'exp' ? o.t + a + o.d : o.t + a + o.d + r;

  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(Math.max(1, o.f), o.t);
  if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), o.t + (o.glide ?? o.d));
  if (o.detune) osc.detune.setValueAtTime(o.detune, o.t);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, o.t);
  g.gain.linearRampToValueAtTime(o.peak, o.t + a);
  if (shape === 'exp') {
    g.gain.exponentialRampToValueAtTime(MIN, end);
  } else {
    g.gain.setValueAtTime(o.peak, o.t + a + o.d);
    g.gain.exponentialRampToValueAtTime(MIN, end);
  }

  let head: AudioNode = osc;
  if (o.lp !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.lp, o.t);
    if (o.lp2 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lp2), o.t + a + Math.min(o.d, 0.4));
    f.Q.value = o.lpQ ?? 0.7;
    osc.connect(f);
    head = f;
  }
  head.connect(g);

  const extra: AudioScheduledSourceNode[] = [];
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vib.rate;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(o.vib.cents, o.t);
    if (o.vib.decay) lg.gain.exponentialRampToValueAtTime(0.5, o.t + o.vib.decay);
    lfo.connect(lg).connect(osc.detune);
    extra.push(lfo);
  }
  if (o.trem) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.trem.rate;
    const lg = ctx.createGain();
    lg.gain.value = o.trem.depth * 0.5;
    const tg = ctx.createGain();
    tg.gain.value = 1 - o.trem.depth * 0.5;
    lfo.connect(lg).connect(tg.gain);
    g.connect(tg);
    tg.connect(o.dest);
    extra.push(lfo);
  } else {
    g.connect(o.dest);
  }

  osc.start(o.t);
  osc.stop(end + 0.03);
  for (const x of extra) {
    x.start(o.t);
    x.stop(end + 0.03);
  }
}

export interface NoiseOpts {
  t: number;
  a?: number;
  d: number;
  peak: number;
  shape?: 'exp' | 'hold';
  r?: number;
  filter: BiquadFilterType;
  f: number;
  /** Przemiatanie filtra: kolejne wartości (Hz) w równych odstępach czasu trwania. */
  sweep?: number[];
  q?: number;
  dest: AudioNode;
}

export function noise(s: SynthCtx, o: NoiseOpts): void {
  const { ctx } = s;
  const a = Math.max(0.001, o.a ?? 0.002);
  const shape = o.shape ?? 'exp';
  const r = o.r ?? 0.1;
  const len = shape === 'exp' ? a + o.d : a + o.d + r;
  const end = o.t + len;

  const src = ctx.createBufferSource();
  src.buffer = s.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.f, o.t);
  if (o.sweep && o.sweep.length > 0) {
    const n = o.sweep.length;
    o.sweep.forEach((hz, i) => f.frequency.exponentialRampToValueAtTime(Math.max(20, hz), o.t + (len * (i + 1)) / n));
  }
  f.Q.value = o.q ?? 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, o.t);
  g.gain.linearRampToValueAtTime(o.peak, o.t + a);
  if (shape === 'hold') g.gain.setValueAtTime(o.peak, o.t + a + o.d);
  g.gain.exponentialRampToValueAtTime(MIN, end);
  src.connect(f).connect(g).connect(o.dest);
  const dur = s.noise.duration;
  src.start(o.t, Math.random() * Math.max(0, dur - 0.5));
  src.stop(end + 0.03);
}

/** Dzwoneczek: sinus + słabsze alikwoty. */
function bell(s: SynthCtx, dest: AudioNode, t: number, f: number, peak: number, d = 0.6): void {
  tone(s, { f, t, a: 0.003, d, peak, dest });
  tone(s, { f: f * 2, t, a: 0.002, d: d * 0.5, peak: peak * 0.22, dest });
  tone(s, { f: f * 3.01, t, a: 0.002, d: d * 0.25, peak: peak * 0.08, dest });
}

/** Miękki „dęciak” (fanfara): piła przez filtr z obwiednią. */
function brass(s: SynthCtx, dest: AudioNode, t: number, f: number, peak: number, hold: number): void {
  for (const det of [-6, 6]) {
    tone(s, { type: 'sawtooth', f, t, a: 0.025, d: hold, shape: 'hold', r: 0.18, peak: peak * 0.5, detune: det, lp: 700, lp2: 2600, lpQ: 0.6, dest });
  }
}

export function makeNoiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Odpowiedź impulsowa małego, ciepłego pogłosu (szum stereo z zanikiem, lekko przyciemniony). */
export function makeReverbIR(ctx: BaseAudioContext, seconds = 1.7): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 3.2);
      lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; // jednobiegunowy dolnoprzepustowy
      d[i] = lp * env * (i < ctx.sampleRate * 0.008 ? i / (ctx.sampleRate * 0.008) : 1);
    }
  }
  return buf;
}

// ───────────────────────────── SFX ─────────────────────────────

const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1568;
const C7 = 2093;

type Recipe = (s: SynthCtx, t: number, p: number, dest: AudioNode) => void;

export const SFX: Record<SfxName, Recipe> = {
  // krótki, cichy „pyk” interfejsu
  tap(s, t, p, dest) {
    tone(s, { f: 1250 * p, f2: 1500 * p, glide: 0.03, t, a: 0.002, d: 0.06, peak: 0.26, dest });
    tone(s, { type: 'triangle', f: 625 * p, t, a: 0.002, d: 0.05, peak: 0.09, dest });
  },

  // „ding-ding!” w górę (kwinta)
  correct(s, t, p, dest) {
    bell(s, dest, t, 784 * p, 0.3, 0.55);
    bell(s, dest, t + 0.1, 1175 * p, 0.32, 0.8);
    tone(s, { f: 2350 * p, t: t + 0.1, a: 0.01, d: 0.5, peak: 0.03, dest });
  },

  // miękkie „ojej” w dół — sinusy przez filtr, nigdy ostro
  wrong(s, t, p, dest) {
    tone(s, { f: 330 * p, f2: 318 * p, glide: 0.14, t, a: 0.012, d: 0.16, peak: 0.26, lp: 1200, dest });
    tone(s, { f: 250 * p, f2: 205 * p, glide: 0.25, t: t + 0.17, a: 0.012, d: 0.3, peak: 0.3, lp: 1000, dest });
    tone(s, { type: 'triangle', f: 125 * p, f2: 102 * p, glide: 0.25, t: t + 0.17, a: 0.015, d: 0.25, peak: 0.08, lp: 500, dest });
  },

  // cios: „tup!” szum + niski ton
  hit(s, t, p, dest) {
    noise(s, { t, a: 0.001, d: 0.09, peak: 0.6, filter: 'bandpass', f: 1400 * p, q: 0.9, dest });
    tone(s, { f: 190 * p, f2: 55 * p, glide: 0.1, t, a: 0.002, d: 0.18, peak: 0.75, dest });
    tone(s, { type: 'triangle', f: 380 * p, f2: 200 * p, glide: 0.07, t, a: 0.001, d: 0.07, peak: 0.12, dest });
  },

  // krytyk: mocniejszy cios + iskrzące arpeggio
  crit(s, t, p, dest) {
    noise(s, { t, a: 0.001, d: 0.1, peak: 0.45, filter: 'bandpass', f: 1600 * p, q: 0.9, dest });
    tone(s, { f: 210 * p, f2: 55 * p, glide: 0.11, t, a: 0.002, d: 0.2, peak: 0.6, dest });
    [C6, E6, G6, C7].forEach((f, i) => bell(s, dest, t + 0.05 + i * 0.05, f * p, 0.16, 0.35));
    noise(s, { t: t + 0.05, a: 0.05, d: 0.35, peak: 0.06, filter: 'highpass', f: 7000, dest });
  },

  // blok: metaliczne „tink” (nieharmoniczne alikwoty) + stuk
  block(s, t, p, dest) {
    [1850, 2670, 3910, 5130].forEach((f, i) => tone(s, { f: f * p, t, a: 0.001, d: 0.14 - i * 0.025, peak: 0.1, dest }));
    noise(s, { t, a: 0.001, d: 0.03, peak: 0.14, filter: 'highpass', f: 4000, dest });
    tone(s, { f: 170 * p, f2: 120 * p, glide: 0.06, t, a: 0.002, d: 0.08, peak: 0.22, dest });
  },

  // złapanie stworka: radosna melodyjka
  catch(s, t, p, dest) {
    const notes: [number, number, number][] = [
      [784, 0, 0.18],
      [C6, 0.09, 0.18],
      [E6, 0.18, 0.18],
      [G6, 0.27, 0.2],
      [C7, 0.4, 0.7],
    ];
    for (const [f, dt, d] of notes) {
      bell(s, dest, t + dt, f * p, 0.2, d);
      tone(s, { type: 'triangle', f: (f / 2) * p, t: t + dt, a: 0.004, d: d * 0.8, peak: 0.07, lp: 2500, dest });
    }
    noise(s, { t: t + 0.4, a: 0.05, d: 0.5, peak: 0.05, filter: 'highpass', f: 8000, dest });
  },

  // cyfra: „dzyń” monetki
  digit(s, t, p, dest) {
    tone(s, { type: 'square', f: 988 * p, t, a: 0.002, d: 0.06, shape: 'hold', r: 0.01, peak: 0.05, lp: 3200, dest });
    tone(s, { f: 988 * p, t, a: 0.002, d: 0.06, shape: 'hold', r: 0.01, peak: 0.12, dest });
    tone(s, { type: 'square', f: 1319 * p, t: t + 0.07, a: 0.002, d: 0.26, peak: 0.05, lp: 3600, dest });
    tone(s, { f: 1319 * p, t: t + 0.07, a: 0.002, d: 0.3, peak: 0.16, dest });
  },

  // brama: magiczny pomruk + dzwonki
  gate(s, t, p, dest) {
    noise(s, { t, a: 0.25, d: 0.9, peak: 0.3, filter: 'lowpass', f: 160, sweep: [420, 220], q: 1.2, dest });
    tone(s, { f: 55 * p, f2: 72 * p, glide: 0.9, t, a: 0.2, d: 1.0, peak: 0.28, dest });
    tone(s, { type: 'triangle', f: 110 * p, f2: 147 * p, glide: 0.9, t, a: 0.2, d: 0.9, peak: 0.08, lp: 600, dest });
    [C6, E6, G6, C7].forEach((f, i) => bell(s, dest, t + 0.55 + i * 0.07, f * p, 0.17, 0.9));
    noise(s, { t: t + 0.45, a: 0.3, d: 0.8, peak: 0.05, filter: 'highpass', f: 6000, dest });
  },

  // przemiana: migocące przemiatanie w górę + iskierki + akord
  transform(s, t, p, dest) {
    tone(s, { f: 330 * p, f2: 1760 * p, glide: 1.1, t, a: 0.15, d: 0.95, shape: 'hold', r: 0.4, peak: 0.13, vib: { rate: 7, cents: 25 }, dest });
    tone(s, { type: 'triangle', f: 165 * p, f2: 880 * p, glide: 1.1, t, a: 0.15, d: 0.95, shape: 'hold', r: 0.4, peak: 0.07, lp: 2000, dest });
    noise(s, { t, a: 0.3, d: 1.1, peak: 0.1, filter: 'bandpass', f: 800, sweep: [2500, 6000], q: 3, dest });
    const sparkle = [2349, 2637, 3136, 3520, 2794, 3951, 3136, 4186, 3520, 4699];
    sparkle.forEach((f, i) => tone(s, { f: f * p, t: t + 0.2 + i * 0.09, a: 0.002, d: 0.18, peak: 0.05, dest }));
    [C6, E6, G6].forEach(f => bell(s, dest, t + 1.25, f * p, 0.14, 1.2));
    bell(s, dest, t + 1.25, C7 * p, 0.08, 1.4);
  },

  // awans: fanfara „ta-da-da-daaa”
  levelup(s, t, p, dest) {
    const C5 = 523.25;
    const E5 = 659.25;
    const G5 = 784;
    brass(s, dest, t, C5 * p, 0.14, 0.07);
    brass(s, dest, t + 0.11, E5 * p, 0.14, 0.07);
    brass(s, dest, t + 0.22, G5 * p, 0.14, 0.08);
    for (const f of [C5, E5, G5, C6]) brass(s, dest, t + 0.36, f * p, 0.1, 0.55);
    [C7, E6 * 2, G6 * 2].forEach((f, i) => bell(s, dest, t + 0.4 + i * 0.08, f * p, 0.07, 0.6));
  },

  // „szuu” — przemiatanie szumu
  whoosh(s, t, p, dest) {
    noise(s, { t, a: 0.12, d: 0.26, peak: 0.3, filter: 'bandpass', f: 350 * p, sweep: [2200 * p, 500 * p], q: 1.2, dest });
  },

  // leczenie: wznosząca się harfa + miękka plama
  heal(s, t, p, dest) {
    [523.25, 587.33, 659.25, 784, 880, C6].forEach((f, i) => {
      tone(s, { f: f * p, t: t + i * 0.06, a: 0.004, d: 0.5, peak: 0.13, dest });
      tone(s, { f: f * 2 * p, t: t + i * 0.06, a: 0.003, d: 0.2, peak: 0.03, dest });
    });
    for (const f of [523.25, 659.25, 784]) tone(s, { f: f * p, t, a: 0.15, d: 0.3, shape: 'hold', r: 0.45, peak: 0.045, dest });
  },

  // skrzynia: skrzypnięcie wieka, stuk i iskierki
  chest(s, t, p, dest) {
    tone(s, { type: 'sawtooth', f: 95 * p, f2: 150 * p, glide: 0.22, t, a: 0.02, d: 0.2, peak: 0.1, lp: 700, lpQ: 6, vib: { rate: 11, cents: 90 }, dest });
    tone(s, { f: 150 * p, f2: 90 * p, glide: 0.08, t: t + 0.2, a: 0.002, d: 0.1, peak: 0.25, dest });
    [G6, 1975.5, 2349.3, 3136].forEach((f, i) => bell(s, dest, t + 0.28 + i * 0.05, f * p, 0.12, 0.45));
    noise(s, { t: t + 0.28, a: 0.06, d: 0.4, peak: 0.05, filter: 'highpass', f: 7500, dest });
  },

  // krok: bardzo cichy stuk (lekko losowy)
  step(s, t, p, dest) {
    const v = 0.85 + Math.random() * 0.3;
    noise(s, { t, a: 0.001, d: 0.04, peak: 0.26, filter: 'lowpass', f: 900 * v * p, q: 0.8, dest });
    tone(s, { f: 180 * v * p, t, a: 0.001, d: 0.035, peak: 0.1, dest });
  },

  // zamach brainrota: narastające napięcie (drżące)
  windup(s, t, p, dest) {
    tone(s, { type: 'triangle', f: 180 * p, f2: 520 * p, glide: 0.55, t, a: 0.05, d: 0.45, shape: 'hold', r: 0.12, peak: 0.13, trem: { rate: 14, depth: 0.6 }, lp: 1800, dest });
    noise(s, { t, a: 0.3, d: 0.25, peak: 0.04, filter: 'bandpass', f: 400, sweep: [1600], q: 2, dest });
  },

  // brainrot: śmieszne „boing” ze sprężynką
  brainrot(s, t, p, dest) {
    tone(s, { f: 320 * p, f2: 190 * p, glide: 0.4, t, a: 0.005, d: 0.45, peak: 0.42, vib: { rate: 17, cents: 260, decay: 0.45 }, dest });
    tone(s, { type: 'triangle', f: 640 * p, f2: 380 * p, glide: 0.4, t, a: 0.005, d: 0.3, peak: 0.09, vib: { rate: 17, cents: 260, decay: 0.3 }, lp: 1500, dest });
  },
};

// ───────────────────────────── Instrumenty muzyki ─────────────────────────────

export function playNote(s: SynthCtx, e: NoteEvent, t: number, dur: number, dest: AudioNode, lead: LeadTimbre, padCutoff: number): void {
  const f = midiToHz(e.midi);
  const v = e.vel;
  switch (e.voice as Voice) {
    case 'lead':
      playLead(s, lead, f, t, dur, v, dest);
      return;
    case 'bell':
      tone(s, { f, t, a: 0.003, d: 0.7, peak: 0.06 * v, dest });
      tone(s, { f: f * 3, t, a: 0.002, d: 0.2, peak: 0.01 * v, dest });
      return;
    case 'pad':
      for (const det of [-7, 7]) {
        tone(s, { type: 'sawtooth', f, t, a: 0.4, d: Math.max(0.1, dur - 0.4), shape: 'hold', r: 0.7, peak: 0.022 * v, detune: det, lp: padCutoff, lpQ: 0.3, dest });
      }
      return;
    case 'bass':
      tone(s, { type: 'triangle', f, t, a: 0.006, d: Math.max(0.05, dur - 0.05), shape: 'hold', r: 0.09, peak: 0.2 * v, lp: 900, dest });
      tone(s, { f: f * 2, t, a: 0.006, d: Math.max(0.05, dur * 0.6), peak: 0.05 * v, dest }); // słyszalność na małych głośnikach
      return;
    case 'kick':
      tone(s, { f: 140, f2: 48, glide: 0.09, t, a: 0.002, d: 0.22, peak: 0.42 * v, dest });
      return;
    case 'snare':
      noise(s, { t, a: 0.002, d: 0.11, peak: 0.16 * v, filter: 'bandpass', f: 1700, q: 0.7, dest });
      tone(s, { type: 'triangle', f: 220, f2: 180, glide: 0.05, t, a: 0.002, d: 0.06, peak: 0.07 * v, dest });
      return;
    case 'hat':
      noise(s, { t, a: 0.001, d: 0.035, peak: 0.07 * v, filter: 'highpass', f: 7500, dest });
      return;
    case 'shaker':
      noise(s, { t, a: 0.012, d: 0.06, peak: 0.06 * v, filter: 'bandpass', f: 6000, q: 1, dest });
      return;
    case 'tom':
      tone(s, { f: 130, f2: 85, glide: 0.2, t, a: 0.003, d: 0.3, peak: 0.28 * v, dest });
      noise(s, { t, a: 0.002, d: 0.08, peak: 0.05 * v, filter: 'lowpass', f: 500, dest });
      return;
  }
}

function playLead(s: SynthCtx, timbre: LeadTimbre, f: number, t: number, dur: number, v: number, dest: AudioNode): void {
  switch (timbre) {
    case 'musicbox':
      tone(s, { f, t, a: 0.002, d: 1.1, peak: 0.14 * v, dest });
      tone(s, { f: f * 2, t, a: 0.002, d: 0.45, peak: 0.035 * v, dest });
      tone(s, { f: f * 4.02, t, a: 0.001, d: 0.12, peak: 0.012 * v, dest });
      return;
    case 'mallet':
      tone(s, { f, t, a: 0.003, d: Math.min(0.6, dur + 0.25), peak: 0.17 * v, dest });
      tone(s, { f: f * 3.99, t, a: 0.001, d: 0.06, peak: 0.04 * v, dest });
      tone(s, { type: 'triangle', f, t, a: 0.003, d: 0.25, peak: 0.05 * v, dest });
      return;
    case 'pluck':
      tone(s, { type: 'triangle', f, t, a: 0.003, d: Math.min(0.5, dur * 1.2 + 0.1), peak: 0.16 * v, lp: 3200, lp2: 900, dest });
      tone(s, { f: f * 2, t, a: 0.002, d: 0.12, peak: 0.025 * v, dest });
      return;
    case 'glass':
      tone(s, { f, t, a: 0.012, d: 1.4, peak: 0.1 * v, vib: { rate: 5, cents: 6 }, dest });
      tone(s, { f: f * 2.76, t, a: 0.006, d: 0.5, peak: 0.018 * v, dest });
      return;
    case 'softsquare':
      tone(s, { type: 'square', f, t, a: 0.01, d: Math.max(0.03, dur * 0.8), shape: 'hold', r: 0.08, peak: 0.045 * v, lp: 1700, lpQ: 0.5, dest });
      tone(s, { f, t, a: 0.01, d: Math.max(0.03, dur * 0.8), shape: 'hold', r: 0.1, peak: 0.07 * v, dest });
      return;
  }
}
