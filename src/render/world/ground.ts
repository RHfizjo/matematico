/**
 * Zapytania o teren (wysokość, woda, przeszkody) i kolizje bohatera — czyste funkcje, bez three.js.
 * Siatka kolumn liczona raz po wygenerowaniu świata.
 */
import { B } from '../voxel/blocks';
import type { VoxelWorld } from '../voxel/world';

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
  /** Identyfikator właściciela (np. encji) — do usuwania. */
  owner?: number;
}

export class Ground {
  readonly minX: number;
  readonly minZ: number;
  readonly w: number;
  readonly d: number;
  /** Wysokość stania (y górnej ściany najwyższej kostki stałej); NaN = brak ziemi. */
  readonly height: Float32Array;
  /** 1 = woda na wierzchu kolumny. */
  readonly water: Uint8Array;
  /** 1 = zablokowane (płot, stół, ściana itp.). */
  readonly blocked: Uint8Array;
  colliders: CircleCollider[] = [];

  constructor(world: VoxelWorld, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    this.minX = Math.floor(bounds.minX) - 1;
    this.minZ = Math.floor(bounds.minZ) - 1;
    this.w = Math.ceil(bounds.maxX) - this.minX + 2;
    this.d = Math.ceil(bounds.maxZ) - this.minZ + 2;
    this.height = new Float32Array(this.w * this.d).fill(NaN);
    this.water = new Uint8Array(this.w * this.d);
    this.blocked = new Uint8Array(this.w * this.d);
    for (let z = 0; z < this.d; z++)
      for (let x = 0; x < this.w; x++) {
        const wx = this.minX + x;
        const wz = this.minZ + z;
        const top = world.top(wx, wz);
        if (top === -Infinity) continue;
        const id = world.get(wx, top, wz);
        const i = z * this.w + x;
        if (id === B.water) {
          this.water[i] = 1;
          this.height[i] = top + 0.82;
        } else {
          this.height[i] = top + 1;
        }
      }
  }

  private idx(x: number, z: number): number {
    const ix = Math.floor(x) - this.minX;
    const iz = Math.floor(z) - this.minZ;
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.d) return -1;
    return iz * this.w + ix;
  }

  /** Wysokość stania w punkcie (górna ściana kolumny). Poza terenem: NaN. */
  heightAt(x: number, z: number): number {
    const i = this.idx(x, z);
    return i < 0 ? NaN : (this.height[i] ?? NaN);
  }

  isWater(x: number, z: number): boolean {
    const i = this.idx(x, z);
    return i >= 0 && this.water[i] === 1;
  }

  block(x: number, z: number): void {
    const i = this.idx(x, z);
    if (i >= 0) this.blocked[i] = 1;
  }

  isBlocked(x: number, z: number): boolean {
    const i = this.idx(x, z);
    return i < 0 || this.blocked[i] === 1;
  }

  /**
   * Czy można stanąć w (x, z), przychodząc z wysokości fromY: nie woda, nie przeszkoda,
   * wejście najwyżej o 1 kostkę (zejście dowolne, ale nie w przepaść > 3).
   */
  canStand(x: number, z: number, fromY: number): boolean {
    const i = this.idx(x, z);
    if (i < 0) return false;
    if (this.water[i] || this.blocked[i]) return false;
    const h = this.height[i] ?? NaN;
    if (Number.isNaN(h)) return false;
    if (h - fromY > 1.05) return false;
    if (fromY - h > 3.05) return false;
    return true;
  }

  /** Test okręgu (bohatera) — próbkuje środek i 4 punkty na obwodzie oraz kolizje okrągłe. */
  canOccupy(x: number, z: number, radius: number, fromY: number, ignoreOwner?: number): boolean {
    if (!this.canStand(x, z, fromY)) return false;
    const r = radius * 0.8;
    const pts = [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ] as const;
    for (const [dx, dz] of pts) if (!this.canStand(x + dx, z + dz, fromY)) return false;
    for (const c of this.colliders) {
      if (ignoreOwner !== undefined && c.owner === ignoreOwner) continue;
      const ddx = x - c.x;
      const ddz = z - c.z;
      const rr = c.r + radius;
      if (ddx * ddx + ddz * ddz < rr * rr) return false;
    }
    return true;
  }

  /** Wysokość, na której stanie bohater (maksimum z próbek wokół — żeby nie wchodzić w stopnie). */
  standHeight(x: number, z: number, radius: number): number {
    let h = this.heightAt(x, z);
    const r = radius * 0.6;
    for (const [dx, dz] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ] as const) {
      const hh = this.heightAt(x + dx, z + dz);
      if (!Number.isNaN(hh) && !this.isWater(x + dx, z + dz) && hh - h <= 1.05 && hh > h) h = hh;
    }
    return h;
  }

  /**
   * Ruch z poślizgiem wzdłuż przeszkód: najpierw pełny krok, potem osobno x i z.
   * Zwraca nową pozycję (może być równa starej).
   */
  slide(x: number, z: number, dx: number, dz: number, radius: number, fromY: number, ignoreOwner?: number): { x: number; z: number } {
    if (this.canOccupy(x + dx, z + dz, radius, fromY, ignoreOwner)) return { x: x + dx, z: z + dz };
    if (Math.abs(dx) > 1e-5 && this.canOccupy(x + dx, z, radius, fromY, ignoreOwner)) return { x: x + dx, z };
    if (Math.abs(dz) > 1e-5 && this.canOccupy(x, z + dz, radius, fromY, ignoreOwner)) return { x, z: z + dz };
    return { x, z };
  }
}
