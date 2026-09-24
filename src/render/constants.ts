/**
 * Stałe kamery (GDD v0.3: stała kamera z góry pod kątem ~50°, stały kierunek — jak w Minecraft Dungeons).
 * Kamera stoi na południe (+Z) od celu, lekko obrócona, patrzy na północ (−Z).
 */
export const CAMERA_YAW = 0.42; // rad; przesunięcie kamery od celu: (sin yaw, 0, cos yaw)
export const CAMERA_PITCH = (50 * Math.PI) / 180;
export const CAMERA_DISTANCE = 18;
export const CAMERA_FOV = 42;

/** Wektor „w prawo na ekranie” na płaszczyźnie świata. */
export const SCREEN_RIGHT = { x: Math.cos(CAMERA_YAW), z: -Math.sin(CAMERA_YAW) };
/** Wektor „w górę na ekranie” (w głąb sceny) na płaszczyźnie świata. */
export const SCREEN_UP = { x: -Math.sin(CAMERA_YAW), z: -Math.cos(CAMERA_YAW) };

/** Kąt obrotu Y (0 = patrzy w +Z) dla encji patrzącej w stronę kamery. */
export const FACING_CAMERA = CAMERA_YAW;
