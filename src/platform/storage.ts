/**
 * Zapis gry (GDD 19): IndexedDB przez idb-keyval, zapis „na bieżąco” z rotującą kopią zapasową.
 *
 *  - klucz główny `key` (domyślnie 'matematico-save') + dwie kopie `key:backup1` (nowsza), `key:backup2`,
 *  - przed nadpisaniem głównego zapisu poprzedni DOBRY zapis przechodzi do backup1, backup1 → backup2,
 *  - odczyt: gdy główny zapis nie daje się odczytać (deserialize rzuca), bierzemy najnowszą dobrą kopię
 *    (console.warn), a uszkodzony zapis odkładamy pod `key:corrupt`, żeby nie zginął,
 *  - równoległe save() są szeregowane: nigdy dwa zapisy naraz, oczekujące zapisy się łączą (wygrywa ostatni).
 */
import { del as idbDel, get as idbGet, set as idbSet, setMany as idbSetMany } from 'idb-keyval';
import type { SaveV1 } from '../core/types';
import type { StorageApi } from '../game/contracts';

/** Minimalny magazyn klucz–wartość (idb-keyval albo atrapa w testach). */
export interface KvAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomowy zapis wielu kluczy (opcjonalny; bez niego — kolejne set()). */
  setMany?(entries: [string, unknown][]): Promise<void>;
}

export interface StorageOptions {
  serialize(s: SaveV1): string;
  deserialize(json: string): SaveV1;
  key?: string;
}

export const DEFAULT_SAVE_KEY = 'matematico-save';

export const idbKv: KvAdapter = {
  get: k => idbGet(k),
  set: (k, v) => idbSet(k, v),
  del: k => idbDel(k),
  setMany: entries => idbSetMany(entries),
};

/** Nazwa pliku eksportu: matematico-zapis-RRRR-MM-DD.json (data lokalna). */
export function exportFileName(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `matematico-zapis-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export interface StorageApiExt extends StorageApi {
  /** Klucze używane w magazynie (do testów i diagnostyki). */
  readonly keys: { main: string; backup1: string; backup2: string; corrupt: string };
  /** Czeka, aż wszystkie zlecone operacje zapisu się zakończą. */
  flush(): Promise<void>;
}

export function createStorage(opts: StorageOptions, kv: KvAdapter = idbKv): StorageApiExt {
  const main = opts.key ?? DEFAULT_SAVE_KEY;
  const keys = { main, backup1: `${main}:backup1`, backup2: `${main}:backup2`, corrupt: `${main}:corrupt` };

  /**
   * JSON ostatniego zapisu, o którym WIEMY, że jest dobry (odczytany bez błędu albo właśnie przez nas zapisany).
   * undefined = jeszcze nie sprawdzaliśmy stanu magazynu w tej sesji.
   */
  let lastGood: string | null | undefined;
  /** Zawartość kopii backup1 (undefined = nie wiemy) i czy jest dobra (tylko dobre kopie przechodzą do backup2). */
  let b1: { json: string | null; good: boolean } | undefined;

  // ── Kolejka operacji wyłącznych (bez przeplatania) ──
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = tail.then(fn, fn);
    tail = p.catch(() => undefined);
    return p;
  }

  function asJson(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw); // starszy format (obiekt zamiast tekstu)
    } catch {
      return null;
    }
  }

  function tryParse(json: string | null): SaveV1 | null {
    if (json === null) return null;
    try {
      return opts.deserialize(json);
    } catch {
      return null;
    }
  }

  async function writeMany(entries: [string, unknown][]): Promise<void> {
    if (entries.length === 0) return;
    if (kv.setMany) await kv.setMany(entries);
    else for (const [k, v] of entries) await kv.set(k, v);
  }

  /** Jednorazowo w sesji: czy obecny zapis główny jest dobry (żeby wiedzieć, czy wolno go przenieść do kopii). */
  async function ensureLastGood(): Promise<void> {
    if (lastGood !== undefined) return;
    const json = asJson(await kv.get(keys.main));
    lastGood = json !== null && tryParse(json) !== null ? json : null;
  }

  async function ensureB1(): Promise<void> {
    if (b1 !== undefined) return;
    const json = asJson(await kv.get(keys.backup1));
    b1 = { json, good: json !== null && tryParse(json) !== null };
  }

  async function doLoad(): Promise<SaveV1 | null> {
    const rawMain = await kv.get(keys.main);
    const mainJson = asJson(rawMain);
    let mainError: unknown = null;
    if (mainJson !== null) {
      try {
        const s = opts.deserialize(mainJson);
        lastGood = mainJson;
        return s;
      } catch (e) {
        mainError = e;
        console.warn('[zapis] Główny zapis jest uszkodzony — szukam kopii zapasowej.', e);
        try {
          await kv.set(keys.corrupt, rawMain);
        } catch {
          /* nie blokujemy odczytu */
        }
      }
    }
    for (const k of [keys.backup1, keys.backup2]) {
      const json = asJson(await kv.get(k));
      if (k === keys.backup1) b1 = { json, good: false };
      if (json === null) continue;
      try {
        const s = opts.deserialize(json);
        if (k === keys.backup1) b1 = { json, good: true };
        lastGood = json;
        console.warn(`[zapis] Wczytano kopię zapasową (${k === keys.backup1 ? 'najnowszą' : 'starszą'}).`, mainError ?? 'brak głównego zapisu');
        return s;
      } catch (e) {
        console.warn(`[zapis] Kopia ${k} też jest uszkodzona.`, e);
      }
    }
    lastGood = null;
    if (mainJson !== null) console.warn('[zapis] Nie udało się odczytać żadnego zapisu — zaczynamy od nowa (uszkodzony zapis odłożony).');
    return null;
  }

  // ── Zapis z łączeniem oczekujących ──
  let pending: SaveV1 | null = null;
  let scheduled: Promise<void> | null = null;

  async function writeNow(s: SaveV1): Promise<void> {
    const json = opts.serialize(s);
    await ensureLastGood();
    if (lastGood === json) return; // nic się nie zmieniło — główny zapis już to zawiera
    const entries: [string, unknown][] = [];
    let nextB1: typeof b1;
    if (lastGood) {
      // rotacja: dobra backup1 → backup2, dotychczasowy główny (dobry) → backup1
      await ensureB1();
      if (b1 && b1.good && b1.json !== null && b1.json !== lastGood) entries.push([keys.backup2, b1.json]);
      entries.push([keys.backup1, lastGood]);
      nextB1 = { json: lastGood, good: true };
    }
    entries.push([keys.main, json]);
    await writeMany(entries);
    lastGood = json;
    if (nextB1) b1 = nextB1;
  }

  const api: StorageApiExt = {
    keys,

    load() {
      return exclusive(doLoad);
    },

    save(s) {
      pending = s;
      if (!scheduled) {
        scheduled = exclusive(async () => {
          scheduled = null;
          const cur = pending;
          pending = null;
          if (cur) await writeNow(cur);
        });
      }
      return scheduled;
    },

    exportFile(s) {
      const json = opts.serialize(s);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName();
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },

    async importFile(file) {
      const text = await file.text();
      return opts.deserialize(text);
    },

    clear() {
      pending = null; // oczekujący zapis traci ważność
      return exclusive(async () => {
        await kv.del(keys.main);
        await kv.del(keys.backup1);
        await kv.del(keys.backup2);
        lastGood = null;
        b1 = { json: null, good: false };
      });
    },

    async requestPersist() {
      try {
        const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
        if (!st || typeof st.persist !== 'function') return false;
        if (typeof st.persisted === 'function' && (await st.persisted())) return true;
        return await st.persist();
      } catch {
        return false;
      }
    },

    flush() {
      return exclusive(async () => undefined);
    },
  };
  return api;
}
