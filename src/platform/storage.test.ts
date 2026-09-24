import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveV1 } from '../core/types';
import { createStorage, exportFileName, type KvAdapter } from './storage';

// Uproszczony „zapis” — w testach wystarczy obiekt z numerem.
type Fake = { version: 1; n: number };
const mk = (n: number): SaveV1 => ({ version: 1, n }) as unknown as SaveV1;
const num = (s: SaveV1 | null): number | null => (s ? (s as unknown as Fake).n : null);

const serialize = (s: SaveV1): string => JSON.stringify(s);
const deserialize = (json: string): SaveV1 => {
  const o = JSON.parse(json) as Partial<Fake>;
  if (o.version !== 1 || typeof o.n !== 'number') throw new Error('Zły format zapisu');
  return o as unknown as SaveV1;
};

interface FakeKv extends KvAdapter {
  data: Map<string, unknown>;
  log: string[];
  maxActive: number;
}

/** Atrapa idb-keyval w pamięci; każda operacja trwa „chwilę”, liczymy równoległość. */
function memKv(opts?: { withSetMany?: boolean; delayMs?: number }): FakeKv {
  const data = new Map<string, unknown>();
  const log: string[] = [];
  let active = 0;
  const kv: FakeKv = {
    data,
    log,
    maxActive: 0,
    async get(k) {
      return run(`get ${k}`, () => data.get(k));
    },
    async set(k, v) {
      await run(`set ${k}`, () => void data.set(k, v));
    },
    async del(k) {
      await run(`del ${k}`, () => void data.delete(k));
    },
  };
  async function run<T>(name: string, fn: () => T): Promise<T> {
    active++;
    kv.maxActive = Math.max(kv.maxActive, active);
    log.push(name);
    await new Promise(r => setTimeout(r, opts?.delayMs ?? 1));
    const out = fn();
    active--;
    return out;
  }
  if (opts?.withSetMany !== false) {
    kv.setMany = async entries => {
      await run(`setMany ${entries.map(e => e[0]).join(',')}`, () => {
        for (const [k, v] of entries) data.set(k, v);
      });
    };
  }
  return kv;
}

const KEY = 'test-save';

describe('createStorage', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('load returns null on an empty store', async () => {
    const st = createStorage({ serialize, deserialize, key: KEY }, memKv());
    expect(await st.load()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('save → load round trip', async () => {
    const kv = memKv();
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    await st.save(mk(1));
    expect(num(await st.load())).toBe(1);
    // nowa instancja (restart aplikacji) czyta to samo
    const st2 = createStorage({ serialize, deserialize, key: KEY }, kv);
    expect(num(await st2.load())).toBe(1);
  });

  for (const withSetMany of [true, false]) {
    it(`keeps the previous 2 good saves as rolling backups (setMany: ${withSetMany})`, async () => {
      const kv = memKv({ withSetMany });
      const st = createStorage({ serialize, deserialize, key: KEY }, kv);
      for (let i = 1; i <= 5; i++) await st.save(mk(i));
      expect(JSON.parse(kv.data.get(KEY) as string).n).toBe(5);
      expect(JSON.parse(kv.data.get(`${KEY}:backup1`) as string).n).toBe(4);
      expect(JSON.parse(kv.data.get(`${KEY}:backup2`) as string).n).toBe(3);
    });
  }

  it('identical save does not rotate backups', async () => {
    const kv = memKv();
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    await st.save(mk(1));
    await st.save(mk(2));
    await st.save(mk(2));
    await st.save(mk(2));
    expect(JSON.parse(kv.data.get(`${KEY}:backup1`) as string).n).toBe(1);
    expect(kv.data.has(`${KEY}:backup2`)).toBe(false);
  });

  it('rotates an existing good main save even when load() was not called first', async () => {
    const kv = memKv();
    kv.data.set(KEY, serialize(mk(7)));
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    await st.save(mk(8));
    expect(JSON.parse(kv.data.get(`${KEY}:backup1`) as string).n).toBe(7);
  });

  it('falls back to the newest good backup when the main save is corrupt (and warns)', async () => {
    const kv = memKv();
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    for (let i = 1; i <= 3; i++) await st.save(mk(i));
    kv.data.set(KEY, '{"version":1,"n":'); // ucięty JSON

    const st2 = createStorage({ serialize, deserialize, key: KEY }, kv);
    expect(num(await st2.load())).toBe(2);
    expect(warn).toHaveBeenCalled();
    // uszkodzony zapis odłożony, a nie zgubiony
    expect(kv.data.get(`${KEY}:corrupt`)).toBe('{"version":1,"n":');
  });

  it('falls back to the older backup when main and backup1 are both corrupt', async () => {
    const kv = memKv();
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    for (let i = 1; i <= 3; i++) await st.save(mk(i));
    kv.data.set(KEY, 'śmieci');
    kv.data.set(`${KEY}:backup1`, '{"version":2}');
    const st2 = createStorage({ serialize, deserialize, key: KEY }, kv);
    expect(num(await st2.load())).toBe(1);
  });

  it('returns null (and warns) when nothing is readable', async () => {
    const kv = memKv();
    kv.data.set(KEY, 'x');
    kv.data.set(`${KEY}:backup1`, 'y');
    kv.data.set(`${KEY}:backup2`, 'z');
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    expect(await st.load()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('after a fallback, the next saves never push a corrupt copy into backup2', async () => {
    const kv = memKv();
    kv.data.set(KEY, 'x');
    kv.data.set(`${KEY}:backup1`, 'y'); // uszkodzona
    kv.data.set(`${KEY}:backup2`, serialize(mk(1)));
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    expect(num(await st.load())).toBe(1);
    await st.save(mk(2));
    expect(JSON.parse(kv.data.get(KEY) as string).n).toBe(2);
    expect(JSON.parse(kv.data.get(`${KEY}:backup1`) as string).n).toBe(1);
    expect(JSON.parse(kv.data.get(`${KEY}:backup2`) as string).n).toBe(1);
    await st.save(mk(3));
    expect(JSON.parse(kv.data.get(`${KEY}:backup1`) as string).n).toBe(2);
    expect(JSON.parse(kv.data.get(`${KEY}:backup2`) as string).n).toBe(1);
  });

  it('a save loaded from backup1 keeps backup2 intact on the next save', async () => {
    const kv = memKv();
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    for (let i = 1; i <= 3; i++) await st.save(mk(i)); // main 3, b1 2, b2 1
    kv.data.set(KEY, '???');
    const st2 = createStorage({ serialize, deserialize, key: KEY }, kv);
    expect(num(await st2.load())).toBe(2);
    await st2.save(mk(4));
    expect(JSON.parse(kv.data.get(KEY) as string).n).toBe(4);
    expect(JSON.parse(kv.data.get(`${KEY}:backup1`) as string).n).toBe(2);
    expect(JSON.parse(kv.data.get(`${KEY}:backup2`) as string).n).toBe(1);
  });

  it('concurrent saves never interleave and the last one wins', async () => {
    for (const withSetMany of [true, false]) {
      const kv = memKv({ withSetMany, delayMs: 3 });
      const st = createStorage({ serialize, deserialize, key: KEY }, kv);
      const ps = [st.save(mk(1)), st.save(mk(2)), st.save(mk(3))];
      // w trakcie pierwszego zapisu przychodzą kolejne
      await new Promise(r => setTimeout(r, 2));
      ps.push(st.save(mk(4)), st.save(mk(5)));
      await Promise.all(ps);
      expect(kv.maxActive).toBe(1);
      expect(JSON.parse(kv.data.get(KEY) as string).n).toBe(5);
      // zapisy oczekujące połączone: nie 5 zapisów głównego klucza
      const mainWrites = kv.log.filter(l => (l.startsWith('set ') && l === `set ${KEY}`) || (l.startsWith('setMany') && l.split(' ')[1]!.split(',').includes(KEY)));
      expect(mainWrites.length).toBeLessThan(5);
      expect(mainWrites.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('save serializes the newest state of a mutated object (coalescing)', async () => {
    const kv = memKv({ delayMs: 3 });
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    const s = { version: 1, n: 1 } as Fake;
    const p1 = st.save(s as unknown as SaveV1);
    s.n = 2;
    const p2 = st.save(s as unknown as SaveV1);
    await Promise.all([p1, p2]);
    expect(JSON.parse(kv.data.get(KEY) as string).n).toBe(2);
  });

  it('save rejects when serialize throws, and the queue keeps working', async () => {
    const kv = memKv();
    let fail = true;
    const st = createStorage(
      {
        serialize: s => {
          if (fail) throw new Error('boom');
          return serialize(s);
        },
        deserialize,
        key: KEY,
      },
      kv,
    );
    await expect(st.save(mk(1))).rejects.toThrow('boom');
    fail = false;
    await st.save(mk(2));
    expect(num(await st.load())).toBe(2);
  });

  it('clear() removes the save and its backups, and drops a pending save', async () => {
    const kv = memKv({ delayMs: 2 });
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    for (let i = 1; i <= 3; i++) await st.save(mk(i));
    const p = st.save(mk(99));
    const pc = st.clear();
    await Promise.all([p, pc]);
    expect(kv.data.has(KEY)).toBe(false);
    expect(kv.data.has(`${KEY}:backup1`)).toBe(false);
    expect(kv.data.has(`${KEY}:backup2`)).toBe(false);
    expect(await st.load()).toBeNull();
    // po wyczyszczeniu nowy zapis nie tworzy kopii ze starych danych
    await st.save(mk(1));
    expect(kv.data.has(`${KEY}:backup1`)).toBe(false);
  });

  it('a save() called AFTER clear() survives, even when an older save was still queued', async () => {
    const kv = memKv({ delayMs: 2 });
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    await st.save(mk(1));
    const p1 = st.save(mk(2)); // queued, not started yet
    const pc = st.clear(); // e.g. parent's "Reset"
    const p2 = st.save(mk(7)); // fresh profile saved right after the reset
    await Promise.all([p1, pc, p2]);
    expect(num(await st.load())).toBe(7);
    expect(kv.data.has(`${KEY}:backup1`)).toBe(false);
  });

  it('clear() also removes the set-aside corrupt copy', async () => {
    const kv = memKv();
    kv.data.set(KEY, '{"version":1,"n":');
    const st = createStorage({ serialize, deserialize, key: KEY }, kv);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await st.load()).toBeNull();
    warn.mockRestore();
    expect(kv.data.has(`${KEY}:corrupt`)).toBe(true);
    await st.clear();
    expect(kv.data.has(`${KEY}:corrupt`)).toBe(false);
  });

  it('importFile deserializes the text and propagates the deserializer error', async () => {
    const st = createStorage({ serialize, deserialize, key: KEY }, memKv());
    const file = (text: string): File => ({ text: async () => text }) as unknown as File;
    expect(num(await st.importFile(file(serialize(mk(42)))))).toBe(42);
    await expect(st.importFile(file('{"version":1}'))).rejects.toThrow('Zły format zapisu');
    await expect(st.importFile(file('nie json'))).rejects.toThrow();
  });

  it('requestPersist returns false when unsupported', async () => {
    const st = createStorage({ serialize, deserialize, key: KEY }, memKv());
    expect(await st.requestPersist()).toBe(false);
  });
});

describe('exportFileName', () => {
  it('uses the local date', () => {
    expect(exportFileName(new Date(2026, 8, 4, 23, 59))).toBe('matematico-zapis-2026-09-04.json');
    expect(exportFileName(new Date(2027, 0, 31))).toBe('matematico-zapis-2027-01-31.json');
  });
});
