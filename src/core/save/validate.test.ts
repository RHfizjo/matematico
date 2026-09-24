import { describe, expect, it } from 'vitest';
import { createNewSave } from './save';
import { isValidSave, validateSave } from './validate';

const loose = (): Record<string, any> => JSON.parse(JSON.stringify(createNewSave(1000, 7))) as Record<string, any>;

function problemsAfter(edit: (s: Record<string, any>) => void): string[] {
  const s = loose();
  edit(s);
  return validateSave(s);
}

describe('validateSave', () => {
  it('świeży zapis jest poprawny', () => {
    expect(validateSave(createNewSave(1000, 7))).toEqual([]);
    expect(isValidSave(createNewSave(1000, 7))).toBe(true);
  });

  it('akceptuje zera kopii kart spoza startu, HP w dungeonie i kupioną ofertę dnia', () => {
    const s = loose();
    s.cards.owned['podwojny-dziob'] = 0;
    s.cards.owned['krolewski-bukiet'] = 99;
    s.progress.dungeon.heroHp = 999;
    s.progress.dungeon.vines = 2;
    s.progress.cycle = 3;
    s.progress.merchantDailyCycle = 3;
    expect(validateSave(s)).toEqual([]);
  });

  it('nie-obiekty', () => {
    for (const v of [null, undefined, 5, 'x', []]) expect(validateSave(v).length).toBeGreaterThan(0);
  });

  it('wykrywa typowe problemy', () => {
    const cases: [string, (s: Record<string, any>) => void][] = [
      ['version', (s) => (s.version = 2)],
      ['seed', (s) => (s.seed = -1)],
      ['createdAt', (s) => (s.createdAt = -0)],
      ['updatedAt', (s) => (s.updatedAt = NaN)],
      ['cheat', (s) => (s.cheat = 1)],
      ['settings.audio', (s) => delete s.settings.audio],
      ['settings.ops', (s) => (s.settings.ops = { add: false, sub: false, mul: false, div: false })],
      ['settings.range', (s) => (s.settings.range = 50)],
      ['inventory.digits', (s) => s.inventory.digits.pop()],
      ['inventory.digits[2]', (s) => (s.inventory.digits[2] = 1.5)],
      ['creatures[1].id', (s) => s.creatures.push({ ...s.creatures[0] })],
      ['creatures[0].fedCycle', (s) => (s.creatures[0].fedCycle = 5)],
      ['equipment.equipped.amulet', (s) => (s.equipment.equipped.amulet = 'amulet-drugiej-szansy')],
      ['equipment.equipped.weapon', (s) => (s.equipment.equipped.weapon = 'kamizelka-z-lisci')],
      ['progress.lands.meadow.unlocked', (s) => (s.progress.lands.meadow.unlocked = false)],
      ['progress.lands.cave.stage', (s) => (s.progress.lands.cave.stage = 5)],
      ['progress.dungeon.roomIndex', (s) => (s.progress.dungeon.roomIndex = 1)],
      ['progress.openedChests', (s) => (s.progress.openedChests = ['a', 'a'])],
      ['model.facts[add:1+1].nOk', (s) => (s.model.facts['add:1+1'] = { m: 0.5, lt: null, n: 1, nOk: 2, box: 0, lastSeenAt: 0, lastSeenSession: 0, helped: 0, last2: [] })],
      ['model.facts[1+1]', (s) => (s.model.facts['1+1'] = { m: 0.5, lt: null, n: 1, nOk: 1, box: 0, lastSeenAt: 0, lastSeenSession: 0, helped: 0, last2: [] })],
      ['model.window', (s) => (s.model.window = new Array(9).fill(true))],
      ['history[0].md', (s) => s.history.push({ f: null, c: 'add.2d', ok: true, to: false, ms: 1, h: false, md: 'x', ek: null, t: 0 })],
      ['sessions[0].end', (s) => s.sessions.push({ start: 10, end: 5, tasks: 0, correct: 0 })],
      // Regresje z przeglądu:
      ['model.retries[0].factId', (s) => s.model.retries.push({ factId: 'add:2+3', categoryId: 'mul.t7', dueAtTask: 0, session: 0 })],
      ['model.retries[0].factId', (s) => s.model.retries.push({ factId: 'div:7:0', categoryId: 'div.by2', dueAtTask: 0, session: 0 })],
      ['model.facts[sub:3-5]', (s) => (s.model.facts['sub:3-5'] = { m: 0.5, lt: null, n: 0, nOk: 0, box: 0, lastSeenAt: 0, lastSeenSession: 0, helped: 0, last2: [] })],
      ['model.recent[0].factId', (s) => s.model.recent.push({ factId: 'add:01+2', categoryId: 'add.within10' })],
      ['profile.name', (s) => (s.profile.name = 'Ola\ud83d')],
      ['creatures', (s) => (s.creatures = [])],
      // Karty i nowe pola postępu (GDD v0.3):
      ['cards', (s) => delete s.cards],
      ['cards.owned', (s) => (s.cards.owned = [])],
      ['cards.x', (s) => (s.cards.x = 1)],
      ['cards.owned[karta-z-kosmosu]', (s) => (s.cards.owned['karta-z-kosmosu'] = 1)],
      ['cards.owned[podwojny-dziob]', (s) => (s.cards.owned['podwojny-dziob'] = 1.5)],
      ['cards.owned[podwojny-dziob]', (s) => (s.cards.owned['podwojny-dziob'] = 100)],
      ['cards.owned[podwojny-dziob]', (s) => (s.cards.owned['podwojny-dziob'] = -1)],
      ['cards.owned[cios-plusika]', (s) => (s.cards.owned['cios-plusika'] = 2)],
      ['cards.owned[tarcza-z-lisci]', (s) => delete s.cards.owned['tarcza-z-lisci']],
      ['progress.merchantDailyCycle', (s) => delete s.progress.merchantDailyCycle],
      ['progress.merchantDailyCycle', (s) => (s.progress.merchantDailyCycle = 1)],
      ['progress.merchantDailyCycle', (s) => (s.progress.merchantDailyCycle = -2)],
      ['progress.dungeon.vines', (s) => (s.progress.dungeon.vines = -1)],
      ['progress.dungeon.vines', (s) => delete s.progress.dungeon.vines],
      ['progress.dungeon.heroHp', (s) => (s.progress.dungeon.heroHp = 0)],
      ['progress.dungeon.heroHp', (s) => (s.progress.dungeon.heroHp = 12.5)],
      ['progress.dungeon.heroHp', (s) => delete s.progress.dungeon.heroHp],
    ];
    for (const [path, edit] of cases) {
      const problems = problemsAfter(edit);
      expect(problems.some((p) => p.startsWith(path)), `${path}: ${problems.join(' | ')}`).toBe(true);
    }
  });
});
