import { describe, expect, it } from 'vitest';
import { composeBar, keyRoot, melodyLadder, midiToHz, TRACKS } from './music';

const TRACK_IDS = Object.keys(TRACKS) as (keyof typeof TRACKS)[];

describe('music composer', () => {
  it('midiToHz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });

  for (const t of TRACK_IDS) {
    describe(t, () => {
      const spec = TRACKS[t];
      const kr = keyRoot(t);
      const pc = (m: number): number => (((m - kr) % 12) + 12) % 12;

      it('is deterministic for the same seed', () => {
        for (let bar = 0; bar < 20; bar++) expect(composeBar(t, bar, 5)).toEqual(composeBar(t, bar, 5));
      });

      it('events stay inside the bar with positive durations', () => {
        for (let bar = 0; bar < 64; bar++) {
          for (const e of composeBar(t, bar, 3)) {
            expect(e.beat).toBeGreaterThanOrEqual(0);
            expect(e.beat).toBeLessThan(spec.beatsPerBar);
            expect(e.dur).toBeGreaterThan(0);
            expect(e.vel).toBeGreaterThan(0);
            expect(e.vel).toBeLessThanOrEqual(1);
          }
        }
      });

      it('melody only uses the pentatonic scale in a comfortable range', () => {
        const ladder = melodyLadder(t);
        expect(ladder.length).toBeGreaterThanOrEqual(8);
        for (let bar = 0; bar < 64; bar++) {
          for (const e of composeBar(t, bar, 11).filter(n => n.voice === 'lead')) {
            expect(spec.scale).toContain(pc(e.midi));
            expect(e.midi).toBeGreaterThanOrEqual(spec.leadRoot - 5);
            expect(e.midi).toBeLessThanOrEqual(spec.leadRoot + 14);
          }
        }
      });

      it('melody has some notes in most bars (after the intro bar)', () => {
        let withMelody = 0;
        for (let bar = 1; bar < 33; bar++) if (composeBar(t, bar, 2).some(e => e.voice === 'lead')) withMelody++;
        expect(withMelody).toBeGreaterThanOrEqual(28);
      });

      it('bass plays the chord root on beat 0, in a low register', () => {
        for (let bar = 0; bar < 16; bar++) {
          const chord = spec.progression[bar % spec.progression.length]!;
          const b0 = composeBar(t, bar, 1).find(e => e.voice === 'bass' && e.beat === 0);
          expect(b0).toBeDefined();
          expect(pc(b0!.midi)).toBe(((chord[0]! % 12) + 12) % 12);
          expect(b0!.midi).toBeGreaterThanOrEqual(33);
          expect(b0!.midi).toBeLessThanOrEqual(60);
        }
      });

      it('the section motif repeats (A … A) so the tune is memorable', () => {
        const lead = (bar: number): string =>
          JSON.stringify(composeBar(t, bar, 9).filter(e => e.voice === 'lead').map(e => [e.beat, e.midi]));
        // sekcja 0 i sekcja 2 używają tego samego motywu (kolejność 0,1,0,2)
        expect(lead(1)).toBe(lead(17));
        expect(lead(4)).toBe(lead(20));
      });
    });
  }

  it('different seeds give different tunes', () => {
    const a = JSON.stringify([1, 2, 3, 4].map(b => composeBar('base', b, 1)));
    const b = JSON.stringify([1, 2, 3, 4].map(b => composeBar('base', b, 2)));
    expect(a).not.toBe(b);
  });

  it('title has no drums; boss has a steady kick', () => {
    for (let bar = 0; bar < 8; bar++) {
      expect(composeBar('title', bar).some(e => ['kick', 'snare', 'hat', 'tom'].includes(e.voice))).toBe(false);
      expect(composeBar('boss', bar).filter(e => e.voice === 'kick').length).toBe(4);
    }
  });
});
