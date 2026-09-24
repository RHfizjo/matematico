/**
 * Wynik generatora sceny (czyste dane) — render/ zamienia go na obiekty three.js.
 */
import type { ModelId, Poi, SceneKind, Vec2 } from '../../game/contracts';
import type { VoxelWorld } from '../voxel/world';
import type { TreeKind } from '../world/trees';
import type { PaletteId } from '../world/palettes';

export interface PropSpec {
  model: ModelId;
  x: number;
  z: number;
  /** Wysokość (domyślnie teren). */
  y?: number;
  facing?: number;
  scale?: number;
  /** POI, do którego należy rekwizyt (Poi.entity). */
  poi?: string;
  /** Promień kolizji (false = bez kolizji; domyślnie promień modelu). */
  collider?: number | false;
}

export interface TreeSpec {
  kind: TreeKind;
  seed: number;
  /** Środek pnia (świat). */
  x: number;
  z: number;
  /** Wysokość podstawy pnia. */
  y: number;
  /** Obrót o wielokrotność 90°. */
  rot: number;
}

export type FoliageType = 'tuft' | 'flower' | 'tallGrass' | 'mushroom' | 'pebble' | 'crystal';

export interface FoliageSpec {
  type: FoliageType;
  x: number;
  y: number;
  z: number;
  /** Kolor instancji (sRGB hex). */
  color: string;
  scale: number;
  rot: number;
}

/** Prostopadłościan dekoracji (płoty, stół, karty) — scalany w jedną siatkę z materiałem kostek. */
export interface DecorBox {
  min: [number, number, number];
  max: [number, number, number];
  block: number;
  /** Bez cienia (drobiazgi). */
  noShadow?: boolean;
}

export interface LightSpec {
  x: number;
  y: number;
  z: number;
  color: string;
  intensity: number;
  distance: number;
  flicker?: boolean;
}

export interface SceneBuild {
  kind: SceneKind;
  world: VoxelWorld;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: Vec2;
  spawnFacing: number;
  pois: Poi[];
  props: PropSpec[];
  trees: TreeSpec[];
  foliage: FoliageSpec[];
  decor: DecorBox[];
  lights: LightSpec[];
  /** Dodatkowo zablokowane kolumny (płoty, stoły). */
  blocked: [number, number][];
  outdoor: boolean;
  /** Wyspa (chmury, orbita kamery tytułowej). */
  island: { cx: number; cz: number; radius: number; bottomY: number; surfaceY: number };
  palette?: PaletteId;
  /** Snop światła z góry (jaskinia). */
  lightShafts?: { x: number; z: number; y: number; radius: number }[];
}
