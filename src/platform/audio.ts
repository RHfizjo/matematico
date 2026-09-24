/**
 * Dźwięk (GDD 16.2): Web Audio, BEZ plików — efekty syntezowane (synth.ts) i generatywna muzyka (music.ts).
 *
 * Graf: [muzyka: utwór → gain utworu] → musicBus ─┐
 *                                  [efekty] → sfxBus ─┼→ master → kompresor (miękki limiter) → wyjście
 *                     musicBus/sfxBus → pogłos (konwolwer) ┘
 *
 * - unlock(): tworzy/wznawia AudioContext (polityka autoodtwarzania) — dodatkowo sam nasłuchuje pierwszego gestu,
 * - utwory przechodzą płynnie (przenikanie ~1,4 s), planowanie z wyprzedzeniem (nie gubi rytmu przy zacięciach),
 * - karta ukryta → kontekst wstrzymany (muzyka staje, bateria odpoczywa); powrót → wznowienie.
 */
import type { AudioApi, MusicTrack, SfxName } from '../game/contracts';
import { composeBar, TRACKS } from './music';
import { makeNoiseBuffer, makeReverbIR, playNote, SFX, type SynthCtx } from './synth';

/** Poziomy bazowe (przy suwakach = 1). Muzyka wyraźnie ciszej niż efekty. */
const MUSIC_LEVEL = 0.55;
const SFX_LEVEL = 0.9;
const FADE_IN_S = 1.4;
const FADE_OUT_S = 1.2;
const LOOKAHEAD_S = 0.8;
const TICK_MS = 100;
/** Minimalny odstęp tego samego efektu (ms) — nie „karabinujemy” np. krokami. */
const SFX_MIN_GAP_MS: Partial<Record<SfxName, number>> = { step: 90, tap: 40, digit: 45 };

export interface AudioApiExt extends AudioApi {
  /** Stan kontekstu ('none' przed pierwszym gestem). */
  readonly state: AudioContextState | 'none';
  /** Utwór, który ma grać (albo gra). */
  readonly track: MusicTrack;
  readonly volumes: { music: number; sfx: number };
  dispose(): void;
}

interface Graph {
  ctx: AudioContext;
  synth: SynthCtx;
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
}

interface Player {
  track: Exclude<MusicTrack, 'none'>;
  gain: GainNode;
  bar: number;
  nextBarTime: number;
  timer: ReturnType<typeof setInterval>;
  stopped: boolean;
}

type AudioCtor = new (opts?: AudioContextOptions) => AudioContext;

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

export function createAudio(opts?: { seed?: number }): AudioApiExt {
  const seed = opts?.seed ?? 1;
  let graph: Graph | null = null;
  let unlocked = false;
  let disposed = false;
  let desired: MusicTrack = 'none';
  let current: Player | null = null;
  const vol = { music: 0.5, sfx: 0.8 };
  const lastSfxAt = new Map<SfxName, number>();

  function ensureGraph(): Graph | null {
    if (graph) return graph;
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);

    const musicBus = ctx.createGain();
    musicBus.gain.value = vol.music * MUSIC_LEVEL;
    const sfxBus = ctx.createGain();
    sfxBus.gain.value = vol.sfx * SFX_LEVEL;
    musicBus.connect(master);
    sfxBus.connect(master);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeReverbIR(ctx);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.32;
    const musicSend = ctx.createGain();
    musicSend.gain.value = 0.35;
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.18;
    musicBus.connect(musicSend).connect(reverb);
    sfxBus.connect(sfxSend).connect(reverb);
    reverb.connect(verbOut).connect(master);

    graph = { ctx, synth: { ctx, noise: makeNoiseBuffer(ctx) }, master, musicBus, sfxBus };
    ctx.addEventListener('statechange', syncMusic);
    return graph;
  }

  // ─────────── Muzyka ───────────
  function tick(p: Player): void {
    const g = graph;
    if (!g || p.stopped || g.ctx.state !== 'running') return;
    const spec = TRACKS[p.track];
    const spb = 60 / spec.bpm;
    const barDur = spb * spec.beatsPerBar;
    const now = g.ctx.currentTime;
    // Zostaliśmy w tyle (zacięcie, uśpiony timer) — zaczynamy od najbliższej chwili zamiast „nadrabiać” nuty.
    if (p.nextBarTime < now - 0.05) p.nextBarTime = now + 0.05;
    let guard = 0;
    while (p.nextBarTime < now + LOOKAHEAD_S && guard++ < 4) {
      for (const e of composeBar(p.track, p.bar, seed)) {
        try {
          playNote(g.synth, e, p.nextBarTime + e.beat * spb, e.dur * spb, p.gain, spec.lead, spec.padCutoff);
        } catch {
          /* pojedyncza nuta nie może zatrzymać muzyki */
        }
      }
      p.bar++;
      p.nextBarTime += barDur;
    }
  }

  function startPlayer(g: Graph, track: Exclude<MusicTrack, 'none'>): Player {
    const t = g.ctx.currentTime;
    const gain = g.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(TRACKS[track].gain, t + FADE_IN_S);
    gain.connect(g.musicBus);
    const p: Player = { track, gain, bar: 0, nextBarTime: t + 0.12, stopped: false, timer: setInterval(() => tick(p), TICK_MS) };
    tick(p);
    return p;
  }

  function stopPlayer(g: Graph, p: Player): void {
    p.stopped = true;
    clearInterval(p.timer);
    const t = g.ctx.currentTime;
    const gp = p.gain.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(gp.value, t);
    gp.linearRampToValueAtTime(0, t + FADE_OUT_S);
    setTimeout(() => {
      try {
        p.gain.disconnect();
      } catch {
        /* już odłączony */
      }
    }, (FADE_OUT_S + LOOKAHEAD_S + 1.5) * 1000);
  }

  function syncMusic(): void {
    const g = graph;
    if (!g || disposed || g.ctx.state !== 'running') return;
    if ((current?.track ?? 'none') === desired) return;
    if (current) {
      stopPlayer(g, current);
      current = null;
    }
    if (desired !== 'none') current = startPlayer(g, desired);
  }

  // ─────────── Odblokowanie i widoczność ───────────
  function resume(): void {
    const g = graph;
    if (!g || disposed || document.hidden) return;
    if (g.ctx.state !== 'running') {
      g.ctx.resume().then(syncMusic, () => undefined);
    } else syncMusic();
  }

  const onGesture = (): void => {
    api.unlock();
  };
  const gestureEvents = ['pointerdown', 'keydown', 'touchend'] as const;
  function removeGestureListeners(): void {
    for (const ev of gestureEvents) window.removeEventListener(ev, onGesture, true);
  }
  if (typeof window !== 'undefined') {
    for (const ev of gestureEvents) window.addEventListener(ev, onGesture, { capture: true, passive: true });
  }

  const onVisibility = (): void => {
    const g = graph;
    if (!g || disposed) return;
    if (document.hidden) {
      if (g.ctx.state === 'running') g.ctx.suspend().catch(() => undefined);
    } else if (unlocked) resume();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  const api: AudioApiExt = {
    get state() {
      return graph ? graph.ctx.state : 'none';
    },
    get track() {
      return desired;
    },
    get volumes() {
      return { ...vol };
    },

    unlock() {
      if (disposed) return;
      unlocked = true;
      const g = ensureGraph();
      if (!g) return;
      // „Pusty” dźwięk w obsłudze gestu — niektóre przeglądarki odblokowują dopiero po odtworzeniu czegokolwiek.
      try {
        const b = g.ctx.createBuffer(1, 1, g.ctx.sampleRate);
        const src = g.ctx.createBufferSource();
        src.buffer = b;
        src.connect(g.ctx.destination);
        src.start();
      } catch {
        /* nieistotne */
      }
      resume();
      if (g.ctx.state === 'running') removeGestureListeners();
      else
        g.ctx.addEventListener(
          'statechange',
          () => {
            if (g.ctx.state === 'running') removeGestureListeners();
          },
          { once: true },
        );
    },

    sfx(name, o) {
      const g = graph;
      if (!g || disposed || g.ctx.state !== 'running') return;
      const recipe = SFX[name];
      if (!recipe) return;
      const nowMs = performance.now();
      const gap = SFX_MIN_GAP_MS[name] ?? 25;
      const last = lastSfxAt.get(name) ?? -Infinity;
      if (nowMs - last < gap) return;
      lastSfxAt.set(name, nowMs);

      const pitch = Math.min(4, Math.max(0.25, o?.pitch ?? 1));
      const volume = Math.min(2, Math.max(0, o?.volume ?? 1));
      if (volume <= 0) return;
      const out = g.ctx.createGain();
      out.gain.value = volume;
      out.connect(g.sfxBus);
      try {
        recipe(g.synth, g.ctx.currentTime + 0.005, pitch, out);
      } catch (e) {
        console.warn('[audio] efekt nie zagrał', name, e);
      }
      setTimeout(() => {
        try {
          out.disconnect();
        } catch {
          /* jw. */
        }
      }, 3000);
    },

    music(track) {
      if (disposed) return;
      desired = track;
      syncMusic();
    },

    setVolumes(music, sfx) {
      vol.music = clamp01(music);
      vol.sfx = clamp01(sfx);
      const g = graph;
      if (!g) return;
      const t = g.ctx.currentTime;
      g.musicBus.gain.setTargetAtTime(vol.music * MUSIC_LEVEL, t, 0.05);
      g.sfxBus.gain.setTargetAtTime(vol.sfx * SFX_LEVEL, t, 0.05);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      removeGestureListeners();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      if (current) {
        current.stopped = true;
        clearInterval(current.timer);
        current = null;
      }
      const g = graph;
      graph = null;
      if (g) g.ctx.close().catch(() => undefined);
    },
  };
  return api;
}

// ─────────── Renderowanie offline (diagnostyka: poziomy, kształt fali, testy w harnessie) ───────────

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineChain(ctx: OfflineAudioContext, level: number): GainNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const bus = ctx.createGain();
  bus.gain.value = level;
  bus.connect(master).connect(comp).connect(ctx.destination);
  return bus;
}

function offlineCtx(seconds: number, sampleRate: number): OfflineAudioContext | null {
  const w = globalThis as unknown as { OfflineAudioContext?: OfflineCtor };
  if (!w.OfflineAudioContext) return null;
  return new w.OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
}

/** Renderuje efekt tak, jak zabrzmi na żywo (poziom efektów, master, kompresor). */
export async function renderSfxOffline(
  name: SfxName,
  o?: { pitch?: number; volume?: number; sfxVolume?: number; seconds?: number; sampleRate?: number },
): Promise<AudioBuffer | null> {
  const sr = o?.sampleRate ?? 22050;
  const ctx = offlineCtx(o?.seconds ?? 2.2, sr);
  if (!ctx) return null;
  const bus = offlineChain(ctx, (o?.sfxVolume ?? 0.8) * SFX_LEVEL);
  const out = ctx.createGain();
  out.gain.value = o?.volume ?? 1;
  out.connect(bus);
  SFX[name]({ ctx, noise: makeNoiseBuffer(ctx) }, 0.01, o?.pitch ?? 1, out);
  return ctx.startRendering();
}

/** Renderuje kilka taktów utworu (poziom muzyki, gain utworu, master, kompresor). */
export async function renderMusicOffline(
  track: Exclude<MusicTrack, 'none'>,
  o?: { bars?: number; fromBar?: number; musicVolume?: number; seed?: number; sampleRate?: number },
): Promise<AudioBuffer | null> {
  const spec = TRACKS[track];
  const bars = o?.bars ?? 4;
  const spb = 60 / spec.bpm;
  const barDur = spb * spec.beatsPerBar;
  const sr = o?.sampleRate ?? 22050;
  const ctx = offlineCtx(bars * barDur + 1.5, sr);
  if (!ctx) return null;
  const bus = offlineChain(ctx, (o?.musicVolume ?? 0.5) * MUSIC_LEVEL);
  const tg = ctx.createGain();
  tg.gain.value = spec.gain;
  tg.connect(bus);
  const synth = { ctx, noise: makeNoiseBuffer(ctx) };
  const from = o?.fromBar ?? 1;
  for (let b = 0; b < bars; b++) {
    for (const e of composeBar(track, from + b, o?.seed ?? 1)) {
      playNote(synth, e, 0.02 + b * barDur + e.beat * spb, e.dur * spb, tg, spec.lead, spec.padCutoff);
    }
  }
  return ctx.startRendering();
}

/** Szczyt i RMS (dBFS) bufora — do sprawdzania, że nic nie jest ciche ani przesterowane. */
export function measure(buf: AudioBuffer): { peak: number; rms: number; peakDb: number; rmsDb: number; audibleS: number } {
  const d = buf.getChannelData(0);
  let peak = 0;
  let sum = 0;
  let lastLoud = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i] ?? 0);
    if (a > peak) peak = a;
    sum += a * a;
    if (a > 0.003) lastLoud = i;
  }
  const rms = Math.sqrt(sum / Math.max(1, d.length));
  const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peak, rms, peakDb: db(peak), rmsDb: db(rms), audibleS: lastLoud / buf.sampleRate };
}
