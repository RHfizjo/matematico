/**
 * Presety jakości (GDD 17.2) i sterownik dynamicznej rozdzielczości (GDD 17.2, „Dynamiczna rozdzielczość”).
 * Czysty moduł — testy w quality.test.ts.
 */
import type { QualityLevel } from '../game/contracts';

export interface QualityPreset {
  level: QualityLevel;
  /** Skala rozdzielczości renderu względem natywnej (maksimum dla dynamicznej rozdzielczości). */
  renderScale: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Bok kwadratu obszaru cieni wokół bohatera (kostki). */
  shadowArea: number;
  /** Promień rozmycia PCF (teksele). */
  shadowRadius: number;
  bloom: 'off' | 'half' | 'half+';
  /** Poziomy rozmycia mipmap bloomu. */
  bloomLevels: number;
  fog: 'linear' | 'exp';
  viewDistance: number;
  /** Gęstość trawy/kwiatów (0..1). */
  foliage: number;
  /** Wielopróbkowanie kompozytora (0 = brak / bez kompozytora). */
  msaa: number;
  /** Czy używać kompozytora (post-processing). */
  composer: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low',
    renderScale: 0.5,
    shadows: false,
    shadowMapSize: 0,
    shadowArea: 0,
    shadowRadius: 0,
    bloom: 'off',
    bloomLevels: 0,
    fog: 'linear',
    viewDistance: 48,
    foliage: 0.2,
    msaa: 0,
    composer: false,
  },
  medium: {
    level: 'medium',
    renderScale: 0.7,
    shadows: true,
    shadowMapSize: 1024,
    shadowArea: 40,
    shadowRadius: 2.5,
    bloom: 'half',
    bloomLevels: 5,
    fog: 'exp',
    viewDistance: 96,
    foliage: 0.6,
    msaa: 4,
    composer: true,
  },
  high: {
    level: 'high',
    renderScale: 0.9,
    shadows: true,
    shadowMapSize: 2048,
    shadowArea: 64,
    shadowRadius: 4,
    bloom: 'half+',
    bloomLevels: 7,
    fog: 'exp',
    viewDistance: 160,
    foliage: 1,
    msaa: 4,
    composer: true,
  },
};

export const MIN_RENDER_SCALE = 0.5;

/**
 * Dynamiczna rozdzielczość: czas klatki > 18 ms przez 2 s → skala −10% (min 50%);
 * < 12 ms przez 5 s → +5% (do maksimum presetu).
 */
export class DynamicResolution {
  scale: number;
  private slowFor = 0;
  private fastFor = 0;
  constructor(
    public maxScale: number,
    private readonly opts = { slowMs: 18, slowSec: 2, fastMs: 12, fastSec: 5, down: 0.1, up: 0.05, min: MIN_RENDER_SCALE },
  ) {
    this.scale = maxScale;
  }

  reset(maxScale: number): void {
    this.maxScale = maxScale;
    this.scale = maxScale;
    this.slowFor = 0;
    this.fastFor = 0;
  }

  /** Zwraca true, gdy skala się zmieniła. frameMs = czas pracy klatki (ms), dt = czas rzeczywisty (s). */
  sample(frameMs: number, dt: number): boolean {
    const o = this.opts;
    if (frameMs > o.slowMs) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (frameMs < o.fastMs) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    if (this.slowFor >= o.slowSec) {
      this.slowFor = 0;
      const next = Math.max(o.min, round2(this.scale - o.down));
      if (next !== this.scale) {
        this.scale = next;
        return true;
      }
    }
    if (this.fastFor >= o.fastSec) {
      this.fastFor = 0;
      const next = Math.min(this.maxScale, round2(this.scale + o.up));
      if (next !== this.scale) {
        this.scale = next;
        return true;
      }
    }
    return false;
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Limit 60 fps na ekranach 120 Hz: pomijamy wywołania rAF, które przychodzą szybciej niż ~15,5 ms
 * od ostatniej wyrenderowanej klatki.
 */
export function shouldRenderFrame(now: number, lastRendered: number, minIntervalMs = 15.5): boolean {
  return now - lastRendered >= minIntervalMs;
}

/** Wybór presetu z wyniku testu wydajności (mediana czasu pracy klatki na presecie wysokim, ms). */
export function pickQualityFromBenchmark(medianWorkMs: number): QualityLevel {
  if (medianWorkMs <= 9) return 'high';
  if (medianWorkMs <= 16) return 'medium';
  return 'low';
}
