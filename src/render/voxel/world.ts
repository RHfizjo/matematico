/**
 * Świat z kostek: rzadkie przechowywanie w porcjach 16³ (tylko niepuste porcje zajmują pamięć).
 * Czysty moduł (bez three.js). Współrzędne całkowite mogą być ujemne.
 * Kostka (x, y, z) zajmuje przestrzeń [x, x+1) × [y, y+1) × [z, z+1).
 */

export const CHUNK = 16;
const CHUNK_SHIFT = 4;
const CHUNK_MASK = CHUNK - 1;
const OFF = 512;

function key(cx: number, cy: number, cz: number): number {
  return ((cx + OFF) * 1024 + (cy + OFF)) * 1024 + (cz + OFF);
}

/** Wolumen z ramką 1 kostki z każdej strony (sąsiedzi do widoczności ścian i AO). */
export interface PaddedVolume {
  /** Wymiary wnętrza (bez ramki). */
  sx: number;
  sy: number;
  sz: number;
  /** Dane (sx+2)·(sy+2)·(sz+2), indeks: (y·(sz+2) + z)·(sx+2) + x (współrzędne z ramką). */
  data: Uint8Array;
  /** Światowa pozycja kostki wnętrza (0,0,0). */
  ox: number;
  oy: number;
  oz: number;
}

export class VoxelWorld {
  private readonly chunks = new Map<number, Uint8Array>();
  minX = Infinity;
  minY = Infinity;
  minZ = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  maxZ = -Infinity;

  get(x: number, y: number, z: number): number {
    const c = this.chunks.get(key(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
    if (!c) return 0;
    return c[((y & CHUNK_MASK) * CHUNK + (z & CHUNK_MASK)) * CHUNK + (x & CHUNK_MASK)] ?? 0;
  }

  set(x: number, y: number, z: number, id: number): void {
    const k = key(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT);
    let c = this.chunks.get(k);
    if (!c) {
      if (id === 0) return;
      c = new Uint8Array(CHUNK * CHUNK * CHUNK);
      this.chunks.set(k, c);
    }
    c[((y & CHUNK_MASK) * CHUNK + (z & CHUNK_MASK)) * CHUNK + (x & CHUNK_MASK)] = id;
    if (id !== 0) {
      if (x < this.minX) this.minX = x;
      if (y < this.minY) this.minY = y;
      if (z < this.minZ) this.minZ = z;
      if (x > this.maxX) this.maxX = x;
      if (y > this.maxY) this.maxY = y;
      if (z > this.maxZ) this.maxZ = z;
    }
  }

  /** Wypełnia prostopadłościan (granice włącznie). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, id);
  }

  /** Najwyższa niepusta kostka w kolumnie (lub −Infinity). Opcjonalny filtr (np. pomiń wodę). */
  top(x: number, z: number, accept?: (id: number) => boolean): number {
    if (this.maxY === -Infinity) return -Infinity;
    for (let y = this.maxY; y >= this.minY; y--) {
      const id = this.get(x, y, z);
      if (id !== 0 && (!accept || accept(id))) return y;
    }
    return -Infinity;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  isEmpty(): boolean {
    return this.maxX === -Infinity;
  }

  /** Wycina wolumen [x0, x0+sx) × … z ramką 1 kostki (do meshera). */
  extract(x0: number, y0: number, z0: number, sx: number, sy: number, sz: number): PaddedVolume {
    const px = sx + 2;
    const py = sy + 2;
    const pz = sz + 2;
    const data = new Uint8Array(px * py * pz);
    for (let y = 0; y < py; y++) {
      const wy = y0 + y - 1;
      for (let z = 0; z < pz; z++) {
        const wz = z0 + z - 1;
        const row = (y * pz + z) * px;
        for (let x = 0; x < px; x++) data[row + x] = this.get(x0 + x - 1, wy, wz);
      }
    }
    return { sx, sy, sz, data, ox: x0, oy: y0, oz: z0 };
  }
}

/** Wolumen z gęstej tablicy (np. małe modele drzew). data: indeks (y·sz + z)·sx + x, bez ramki. */
export function paddedFromDense(sx: number, sy: number, sz: number, dense: Uint8Array, ox = 0, oy = 0, oz = 0): PaddedVolume {
  const px = sx + 2;
  const pz = sz + 2;
  const data = new Uint8Array(px * (sy + 2) * pz);
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) data[((y + 1) * pz + (z + 1)) * px + (x + 1)] = dense[(y * sz + z) * sx + x] ?? 0;
  return { sx, sy, sz, data, ox, oy, oz };
}
