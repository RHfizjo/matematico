/**
 * Generatywna muzyka — CZYSTA kompozycja (bez Web Audio), testowana jednostkowo.
 * Każdy utwór to specyfikacja (tempo, tonacja, akordy, instrumenty, rytmy). composeBar() zwraca
 * nuty jednego taktu; audio.ts tylko je planuje w czasie. Deterministyczne z ziarna.
 *
 * Budowa frazy: sekcje po 8 taktów; motyw 4-taktowy (A) + powtórka z kadencją (A'). Motywy sekcji
 * krążą w kolejności 0,1,0,2 — melodia wraca, więc da się ją zapamiętać, ale nie nudzi.
 */
import type { MusicTrack } from '../game/contracts';

export type Voice = 'lead' | 'bell' | 'pad' | 'bass' | 'kick' | 'snare' | 'hat' | 'shaker' | 'tom';

export type LeadTimbre = 'musicbox' | 'mallet' | 'pluck' | 'glass' | 'softsquare';

export interface NoteEvent {
  voice: Voice;
  /** Początek w miarach taktu (0 ≤ beat < beatsPerBar). */
  beat: number;
  /** Długość w miarach (> 0). */
  dur: number;
  /** Wysokość MIDI (perkusja: 0). */
  midi: number;
  /** Głośność 0..1. */
  vel: number;
}

export interface TrackSpec {
  bpm: number;
  beatsPerBar: 3 | 4;
  /** Tonika melodii (MIDI). */
  leadRoot: number;
  /** Skala melodii (półtony od toniki) — pentatonika: zawsze konsonansowo. */
  scale: readonly number[];
  /** Akordy (półtony od toniki), po jednym na takt, zapętlone. */
  progression: readonly (readonly number[])[];
  lead: LeadTimbre;
  /** Rytmy melodii: listy [początek, długość] w miarach. */
  rhythms: readonly (readonly (readonly [number, number])[])[];
  /** Szansa pauzy zamiast nuty (poza mocnymi miarami). */
  restProb: number;
  bass: 'long' | 'rootFifth' | 'walk' | 'eighths' | 'waltz';
  pad: boolean;
  /** Filtr pada (Hz) — ciemniejszy w lochach. */
  padCutoff: number;
  drums: {
    kick: readonly number[];
    snare: readonly number[];
    hat: readonly number[];
    shaker: readonly number[];
    tom: readonly number[];
  };
  /** Dzwoneczki-ozdobniki: szansa na takt. */
  bellProb: number;
  /** Głośność utworu względem innych (0..1). */
  gain: number;
}

// Akordy względem toniki
const I = [0, 4, 7];
const IV = [5, 9, 12];
const V = [7, 11, 14];
const vi = [-3, 0, 4];
const ii = [2, 5, 9];
const im = [0, 3, 7];
const IIIm = [3, 7, 10];
const VIm = [-4, 0, 3];
const VIIm = [-2, 2, 5];
const IVd = [5, 9, 12]; // dorycka IV (durowa)
const Vmaj = [-5, -1, 2]; // V durowa w molu (napięcie do toniki)

const MAJ_PENTA = [0, 2, 4, 7, 9];
const MIN_PENTA = [0, 3, 5, 7, 10];

const NO_DRUMS = { kick: [], snare: [], hat: [], shaker: [], tom: [] } as const;

export const TRACKS: Record<Exclude<MusicTrack, 'none'>, TrackSpec> = {
  // Kołysankowa pozytywka na 3/4 (F-dur)
  title: {
    bpm: 84,
    beatsPerBar: 3,
    leadRoot: 77, // F5
    scale: MAJ_PENTA,
    progression: [I, vi, IV, V],
    lead: 'musicbox',
    rhythms: [
      [[0, 1], [1, 1], [2, 1]],
      [[0, 2], [2, 1]],
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1]],
    ],
    restProb: 0.08,
    bass: 'waltz',
    pad: true,
    padCutoff: 1400,
    drums: NO_DRUMS,
    bellProb: 0.35,
    gain: 0.9,
  },
  // Przytulna baza: marimba, spokojny bit (C-dur)
  base: {
    bpm: 96,
    beatsPerBar: 4,
    leadRoot: 72, // C5
    scale: MAJ_PENTA,
    progression: [I, V, vi, IV],
    lead: 'mallet',
    rhythms: [
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 2]],
      [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]],
      [[0, 1], [1, 1], [2, 1.5], [3.5, 0.5]],
    ],
    restProb: 0.15,
    bass: 'rootFifth',
    pad: true,
    padCutoff: 1200,
    drums: { kick: [0, 2], snare: [], hat: [0.5, 1.5, 2.5, 3.5], shaker: [1, 3], tom: [] },
    bellProb: 0.15,
    gain: 0.85,
  },
  // Skoczna łąka: szarpane struny, chodzący bas (G-dur)
  meadow: {
    bpm: 116,
    beatsPerBar: 4,
    leadRoot: 74, // D5 — dominanta G daje jaśniejszą melodię; akordy liczone od G (patrz keyShift)
    scale: MAJ_PENTA,
    progression: [I, IV, I, V, vi, IV, ii, V],
    lead: 'pluck',
    rhythms: [
      [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
      [[0, 0.75], [0.75, 0.25], [1, 1], [2, 0.75], [2.75, 0.25], [3, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
    ],
    restProb: 0.12,
    bass: 'walk',
    pad: false,
    padCutoff: 1600,
    drums: { kick: [0, 2], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5], shaker: [0, 1, 2, 3], tom: [] },
    bellProb: 0.2,
    gain: 0.8,
  },
  // Tajemniczy loch: szklane dzwonki, ciemny pad, bębenki (d-moll, dorycka)
  dungeon: {
    bpm: 84,
    beatsPerBar: 4,
    leadRoot: 74, // D5
    scale: MIN_PENTA,
    progression: [im, IVd, im, VIIm],
    lead: 'glass',
    rhythms: [
      [[0, 2], [2, 1], [3, 1]],
      [[0, 1], [1, 1], [2, 2]],
      [[0, 1.5], [1.5, 0.5], [2, 2]],
      [[0, 3], [3, 1]],
    ],
    restProb: 0.25,
    bass: 'long',
    pad: true,
    padCutoff: 700,
    drums: { kick: [], snare: [], hat: [1.5, 3.5], shaker: [], tom: [0, 2.5] },
    bellProb: 0.3,
    gain: 0.9,
  },
  // Boss: szybciej, motoryczny bas ósemkowy — napięcie, ale nadal wesoło (e-moll)
  boss: {
    bpm: 132,
    beatsPerBar: 4,
    leadRoot: 76, // E5
    scale: MIN_PENTA,
    progression: [im, VIm, VIIm, Vmaj, im, IIIm, VIIm, Vmaj],
    lead: 'softsquare',
    rhythms: [
      [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
      [[0, 0.75], [0.75, 0.75], [1.5, 0.5], [2, 1], [3, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
    ],
    restProb: 0.1,
    bass: 'eighths',
    pad: true,
    padCutoff: 1000,
    drums: { kick: [0, 1, 2, 3], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5], shaker: [], tom: [3.5] },
    bellProb: 0.1,
    gain: 0.75,
  },
};

/**
 * Przesunięcie toniki akordów względem toniki melodii. Łąka: melodia od D5, akordy od G (G-dur),
 * więc skala melodii to pentatonika G liczona od D — dla prostoty wszystkie inne utwory mają 0.
 */
const KEY_SHIFT: Partial<Record<Exclude<MusicTrack, 'none'>, number>> = { meadow: -7 };

/** Tonika akordów/basu danego utworu (MIDI, oktawa melodii). */
export function keyRoot(track: Exclude<MusicTrack, 'none'>): number {
  return TRACKS[track].leadRoot + (KEY_SHIFT[track] ?? 0);
}

// ───────────────────────────── RNG ─────────────────────────────

function hash(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= x | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const v = arr[Math.floor(rng() * arr.length) % arr.length];
  if (v === undefined) throw new Error('pusta lista');
  return v;
}

// ───────────────────────────── Melodia ─────────────────────────────

/** Nuty skali melodii w zakresie ~1,5 oktawy (MIDI), rosnąco. */
export function melodyLadder(track: Exclude<MusicTrack, 'none'>): number[] {
  const spec = TRACKS[track];
  const kr = keyRoot(track);
  const out: number[] = [];
  // pentatonika tonacji akordów, w oknie [leadRoot − 5, leadRoot + 14]
  for (let m = spec.leadRoot - 5; m <= spec.leadRoot + 14; m++) {
    const pc = (((m - kr) % 12) + 12) % 12;
    if (spec.scale.includes(pc)) out.push(m);
  }
  return out;
}

function chordAt(spec: TrackSpec, bar: number): readonly number[] {
  const n = spec.progression.length;
  const c = spec.progression[((bar % n) + n) % n];
  if (!c) throw new Error('brak akordu');
  return c;
}

function isChordTone(midi: number, kr: number, chord: readonly number[]): boolean {
  const pc = (((midi - kr) % 12) + 12) % 12;
  return chord.some(c => ((c % 12) + 12) % 12 === pc);
}

const SECTION_BARS = 8;
const MOTIF_ORDER = [0, 1, 0, 2];

/** Motyw: 4 takty melodii (każdy takt = lista nut 'lead'). */
function motif(track: Exclude<MusicTrack, 'none'>, seed: number, motifId: number, sectionStartBar: number): NoteEvent[][] {
  const spec = TRACKS[track];
  const kr = keyRoot(track);
  const ladder = melodyLadder(track);
  const rng = mulberry32(hash(seed, motifId, 7919));
  const top = ladder.length - 1;
  const clampIdx = (i: number): number => Math.min(Math.max(i, 1), top - 1);
  // start blisko toniki melodii
  const home = Math.max(0, ladder.findIndex(m => m >= spec.leadRoot));
  let idx = home;
  // Kontur frazy: wznosi się, szczyt w 2. takcie, opada do domu (cele w krokach skali, z lekkim losowym odchyleniem)
  const CONTOUR = [1, 3, 2, 0];
  let lastWasRepeat = false;
  const bars: NoteEvent[][] = [];
  for (let b = 0; b < 4; b++) {
    const chord = chordAt(spec, sectionStartBar + b);
    const rhythm = pick(rng, spec.rhythms);
    const target = clampIdx(home + (CONTOUR[b] ?? 0) + Math.floor(rng() * 3) - 1);
    const notes: NoteEvent[] = [];
    for (let i = 0; i < rhythm.length; i++) {
      const step = rhythm[i];
      if (!step) continue;
      const [beat, dur] = step;
      const strong = beat === 0 || (spec.beatsPerBar === 4 && beat === 2);
      if (!strong && i > 0 && rng() < spec.restProb) continue;
      if (strong) {
        // dźwięk akordu blisko bieżącego, ciągnący do celu konturu; powtórzenie dźwięku lekko karane
        let best = idx;
        let bestScore = Infinity;
        for (let j = Math.max(0, idx - 3); j <= Math.min(top, idx + 3); j++) {
          const m = ladder[j];
          if (m === undefined || !isChordTone(m, kr, chord)) continue;
          const score = Math.abs(j - target) * 0.7 + Math.abs(j - idx) * 0.3 + (j === idx ? 1.5 : 0) + rng() * 0.8;
          if (score < bestScore) {
            bestScore = score;
            best = j;
          }
        }
        idx = best;
      } else {
        const toward = Math.sign(target - idx);
        const r = rng();
        let delta: number;
        if (toward !== 0 && r < 0.55) delta = toward * (rng() < 0.75 ? 1 : 2);
        else if (r < 0.96 || lastWasRepeat) delta = rng() < 0.5 ? 1 : -1;
        else delta = 0;
        lastWasRepeat = delta === 0;
        idx = clampIdx(idx + delta);
      }
      idx = Math.min(Math.max(idx, 0), top);
      const midi = ladder[idx] ?? spec.leadRoot;
      const vel = (strong ? 0.85 : 0.68) + (rng() - 0.5) * 0.12;
      notes.push({ voice: 'lead', beat, dur: dur * 0.92, midi, vel });
    }
    bars.push(notes);
  }
  return bars;
}

/** Takt kadencji (koniec sekcji): krótkie przejście i długa tonika. */
function cadence(track: Exclude<MusicTrack, 'none'>, seed: number, motifId: number): NoteEvent[] {
  const spec = TRACKS[track];
  const ladder = melodyLadder(track);
  const rng = mulberry32(hash(seed, motifId, 104729));
  const kr = keyRoot(track);
  // tonika w zakresie melodii najbliżej leadRoot
  let tonic = spec.leadRoot;
  for (const m of ladder) if ((((m - kr) % 12) + 12) % 12 === 0 && Math.abs(m - spec.leadRoot) <= 6) tonic = m;
  const ti = ladder.indexOf(tonic);
  const above = ladder[Math.min(ti + 1, ladder.length - 1)] ?? tonic;
  const above2 = ladder[Math.min(ti + 2, ladder.length - 1)] ?? tonic;
  const bpb = spec.beatsPerBar;
  if (rng() < 0.5) {
    return [
      { voice: 'lead', beat: 0, dur: 0.9, midi: above2, vel: 0.8 },
      { voice: 'lead', beat: 1, dur: 0.9, midi: above, vel: 0.7 },
      { voice: 'lead', beat: 2, dur: (bpb - 2) * 0.95, midi: tonic, vel: 0.85 },
    ];
  }
  return [
    { voice: 'lead', beat: 0, dur: 0.45, midi: above, vel: 0.75 },
    { voice: 'lead', beat: 0.5, dur: bpb - 0.5 - 0.1, midi: tonic, vel: 0.85 },
  ];
}

// ───────────────────────────── Takt ─────────────────────────────

/** Nuty jednego taktu utworu (wszystkie głosy). Deterministyczne dla (track, bar, seed). */
export function composeBar(track: Exclude<MusicTrack, 'none'>, bar: number, seed = 1): NoteEvent[] {
  const spec = TRACKS[track];
  const kr = keyRoot(track);
  const bpb = spec.beatsPerBar;
  const section = Math.floor(bar / SECTION_BARS);
  const inSection = ((bar % SECTION_BARS) + SECTION_BARS) % SECTION_BARS;
  const motifId = MOTIF_ORDER[((section % MOTIF_ORDER.length) + MOTIF_ORDER.length) % MOTIF_ORDER.length] ?? 0;
  const sectionStart = section * SECTION_BARS;
  const chord = chordAt(spec, bar);
  const rng = mulberry32(hash(seed, bar, 31337));
  const out: NoteEvent[] = [];

  // Melodia: A (takty 0–3), A' (4–6) + kadencja (7). Pierwszy takt utworu (bar 0) — łagodne wejście bez melodii.
  if (bar > 0) {
    if (inSection === SECTION_BARS - 1) out.push(...cadence(track, seed, motifId));
    else {
      const m = motif(track, seed, motifId, sectionStart);
      out.push(...(m[inSection % 4] ?? []));
    }
  }

  // Bas: dwie oktawy pod toniką akordów, w stałym rejestrze (−5..+6 półtonów od toniki)
  const c0 = chord[0] ?? 0;
  const pc0 = ((c0 % 12) + 12) % 12;
  const root = kr - 24 + (pc0 > 6 ? pc0 - 12 : pc0);
  const fifth = root + 7;
  const third = root + ((((chord[1] ?? c0 + 4) - c0) % 12) + 12) % 12;
  switch (spec.bass) {
    case 'long':
      out.push({ voice: 'bass', beat: 0, dur: bpb * 0.95, midi: root, vel: 0.7 });
      break;
    case 'waltz':
      out.push({ voice: 'bass', beat: 0, dur: 0.9, midi: root, vel: 0.75 });
      out.push({ voice: 'bass', beat: 1, dur: 0.5, midi: fifth, vel: 0.4 });
      out.push({ voice: 'bass', beat: 2, dur: 0.5, midi: root + 12, vel: 0.4 });
      break;
    case 'rootFifth':
      out.push({ voice: 'bass', beat: 0, dur: 1.4, midi: root, vel: 0.8 });
      out.push({ voice: 'bass', beat: 2, dur: 1.4, midi: rng() < 0.5 ? fifth : root, vel: 0.65 });
      break;
    case 'walk':
      out.push({ voice: 'bass', beat: 0, dur: 0.8, midi: root, vel: 0.8 });
      out.push({ voice: 'bass', beat: 1, dur: 0.8, midi: third, vel: 0.6 });
      out.push({ voice: 'bass', beat: 2, dur: 0.8, midi: fifth, vel: 0.7 });
      out.push({ voice: 'bass', beat: 3, dur: 0.8, midi: rng() < 0.5 ? root + 12 : third, vel: 0.6 });
      break;
    case 'eighths':
      for (let i = 0; i < bpb * 2; i++) {
        const oct = i === 3 || i === 7 ? 12 : 0;
        out.push({ voice: 'bass', beat: i * 0.5, dur: 0.4, midi: root + oct, vel: i % 2 === 0 ? 0.75 : 0.55 });
      }
      break;
  }

  // Pad: akord na cały takt (oktawa pod melodią)
  if (spec.pad) {
    for (const c of chord) out.push({ voice: 'pad', beat: 0, dur: bpb, midi: kr - 12 + c, vel: 0.5 });
  }

  // Perkusja
  const d = spec.drums;
  for (const b of d.kick) if (b < bpb) out.push({ voice: 'kick', beat: b, dur: 0.25, midi: 0, vel: b === 0 ? 0.9 : 0.7 });
  for (const b of d.snare) if (b < bpb) out.push({ voice: 'snare', beat: b, dur: 0.25, midi: 0, vel: 0.6 });
  for (const b of d.hat) if (b < bpb) out.push({ voice: 'hat', beat: b, dur: 0.1, midi: 0, vel: 0.35 + rng() * 0.15 });
  for (const b of d.shaker) if (b < bpb) out.push({ voice: 'shaker', beat: b, dur: 0.2, midi: 0, vel: 0.3 + rng() * 0.12 });
  for (const b of d.tom) if (b < bpb) out.push({ voice: 'tom', beat: b, dur: 0.4, midi: 0, vel: 0.6 });
  // Przejście perkusyjne co 8 taktów (bez utworów „bez bębnów”)
  if (inSection === SECTION_BARS - 1 && (d.snare.length > 0 || d.tom.length > 0)) {
    out.push({ voice: d.snare.length > 0 ? 'snare' : 'tom', beat: bpb - 0.5, dur: 0.2, midi: 0, vel: 0.45 });
    out.push({ voice: d.snare.length > 0 ? 'snare' : 'tom', beat: bpb - 0.25, dur: 0.2, midi: 0, vel: 0.55 });
  }

  // Dzwoneczki: 2–3 wysokie dźwięki akordu w drugiej połowie taktu
  if (bar > 0 && rng() < spec.bellProb) {
    const count = 2 + Math.floor(rng() * 2);
    const start = bpb / 2;
    const tones = chord.map(c => kr + 12 + c);
    for (let i = 0; i < count; i++) {
      const midi = tones[(i + Math.floor(rng() * tones.length)) % tones.length] ?? kr + 12;
      out.push({ voice: 'bell', beat: start + i * 0.5, dur: 0.5, midi, vel: 0.35 });
    }
  }

  return out.filter(e => e.beat >= 0 && e.beat < bpb && e.dur > 0);
}

export function secondsPerBeat(track: Exclude<MusicTrack, 'none'>): number {
  return 60 / TRACKS[track].bpm;
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
