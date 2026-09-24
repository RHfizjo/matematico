import { it, expect } from 'vitest';
import fc from 'fast-check';
import { migrateSave, SaveError } from './migrate';
import { allPaths, applyMutation, mutationArb, saveArb } from './testkit';
import type { Path } from './testkit';
import { validateSave } from './validate';

it('heavy fuzz', { timeout: 600_000 }, () => {
  fc.assert(
    fc.property(saveArb, fc.array(fc.tuple(fc.nat(), mutationArb), { minLength: 1, maxLength: 6 }), (s, muts) => {
      let raw: unknown = s;
      for (const [pick, m] of muts) {
        if (typeof raw !== 'object' || raw === null) break;
        const paths = allPaths(raw).filter((p) => p.length > 0);
        const path = paths[pick % Math.max(1, paths.length)] as Path | undefined;
        if (!path) break;
        raw = applyMutation(raw, path, m);
      }
      try {
        const out = migrateSave(raw);
        expect(validateSave(out)).toEqual([]);
        expect(migrateSave(out)).toStrictEqual(out);
        expect(JSON.parse(JSON.stringify(out))).toStrictEqual(out);
      } catch (e) {
        expect(e).toBeInstanceOf(SaveError);
      }
    }),
    { numRuns: 8000 },
  );
});
