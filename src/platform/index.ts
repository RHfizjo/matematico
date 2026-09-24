/**
 * Platforma (GDD 19, 20.4): zapis (IndexedDB), dźwięk (Web Audio), pełny ekran + orientacja,
 * blokada wygaszania ekranu, service worker PWA. Implementacja PlatformApi z game/contracts.ts.
 */
import { registerSW } from 'virtual:pwa-register';
import type { SaveV1 } from '../core/types';
import type { PlatformApi } from '../game/contracts';
import { createAudio, type AudioApiExt } from './audio';
import { createStorage, type StorageApiExt } from './storage';

export { createAudio, type AudioApiExt } from './audio';
export { createStorage, exportFileName, type KvAdapter, type StorageApiExt } from './storage';

export interface PlatformOptions {
  serialize(s: SaveV1): string;
  deserialize(json: string): SaveV1;
  /** Klucz zapisu w IndexedDB (domyślnie 'matematico-save'). */
  key?: string;
}

export interface PlatformApiExt extends PlatformApi {
  storage: StorageApiExt;
  audio: AudioApiExt;
}

/** Co godzinę sprawdzamy, czy jest nowa wersja (PWA bywa otwarta cały dzień). */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

export function createPlatform(opts: PlatformOptions): PlatformApiExt {
  const storage = createStorage({ serialize: opts.serialize, deserialize: opts.deserialize, ...(opts.key ? { key: opts.key } : {}) });
  const audio = createAudio();

  // ─────────── Wake Lock ───────────
  let wantAwake = false;
  let sentinel: WakeLockSentinel | null = null;
  let acquiring: Promise<void> | null = null;

  async function acquire(): Promise<void> {
    if (!wantAwake || sentinel || document.hidden) return;
    const wl = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wl) return;
    if (acquiring) return acquiring;
    acquiring = (async () => {
      try {
        const s = await wl.request('screen');
        if (!wantAwake) {
          await s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* brak zgody / oszczędzanie baterii — gra działa dalej */
      } finally {
        acquiring = null;
      }
    })();
    return acquiring;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      // Przeglądarka zwalnia blokadę przy ukryciu karty — po powrocie bierzemy ją ponownie.
      if (!document.hidden && wantAwake) void acquire();
    });
  }

  let pwaRegistered = false;

  const api: PlatformApiExt = {
    storage,
    audio,
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',

    async enterFullscreen() {
      try {
        const de = document.documentElement;
        if (!document.fullscreenElement && typeof de.requestFullscreen === 'function') {
          await de.requestFullscreen({ navigationUI: 'hide' });
        }
      } catch {
        /* brak zgody / nieobsługiwane */
      }
      try {
        const o = screen.orientation as LockableOrientation | undefined;
        if (o && typeof o.lock === 'function') await o.lock('landscape');
      } catch {
        /* blokada orientacji działa tylko w pełnym ekranie / PWA */
      }
    },

    async keepAwake(on) {
      wantAwake = on;
      if (on) {
        await acquire();
        return;
      }
      const s = sentinel;
      sentinel = null;
      if (s) await s.release().catch(() => undefined);
    },

    registerPwa(onUpdateReady) {
      if (pwaRegistered) return;
      pwaRegistered = true;
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
      // W trybie deweloperskim nie rejestrujemy SW (stary SW psułby przeładowania na żywo).
      if (import.meta.env.DEV) return;
      try {
        const updateSW = registerSW({
          onNeedRefresh() {
            onUpdateReady(() => {
              void updateSW(true);
            });
          },
          onRegisteredSW(_url, reg) {
            if (reg) setInterval(() => void reg.update().catch(() => undefined), UPDATE_CHECK_MS);
          },
          onRegisterError(e) {
            console.warn('[pwa] rejestracja service workera nie powiodła się', e);
          },
        });
      } catch (e) {
        console.warn('[pwa] rejestracja service workera nie powiodła się', e);
      }
    },
  };
  return api;
}
