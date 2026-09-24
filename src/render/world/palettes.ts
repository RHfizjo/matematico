/**
 * Palety pory dnia (GDD 16.1): niebo, mgła, słońce/księżyc, światło półkuli, emisja.
 * Kolory sRGB (hex). 'cave' — jaskinia pod Starym Dębem (dungeon).
 */
import type { TimeOfDay } from '../../game/contracts';

export type PaletteId = TimeOfDay | 'cave';

export interface Palette {
  zenith: string;
  horizon: string;
  /** Kolor „pod horyzontem” (morze chmur pod wyspą). */
  below: string;
  fog: string;
  /** Mnożnik gęstości mgły względem zasięgu widzenia. */
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  /** Kierunek DO słońca: azymut (rad, 0 = +Z/południe… patrz sky.ts) i wysokość (rad). */
  sunAzimuth: number;
  sunElevation: number;
  /** Poświata słońca/księżyca na kopule (0 = brak tarczy). */
  sunDisc: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** Wzmocnienie materiałów emisyjnych (noc > dzień). */
  emissive: number;
  stars: number;
  cloudColor: string;
  cloudShade: string;
  exposure: number;
  bloom: number;
  /** Korekta nasycenia w post-processingu (−1..1). */
  saturation: number;
  /** Korekcja barw po mapowaniu tonów: mnożnik kanałów i podniesienie cieni. */
  grade: { mul: [number, number, number]; lift: [number, number, number] };
  /** Świetliki: siła 0..1 i kolor. */
  fireflies: number;
  fireflyColor: string;
  water: { deep: string; shallow: string; glow: number };
}

export const PALETTES: Record<PaletteId, Palette> = {
  day: {
    zenith: '#4fa8ff',
    horizon: '#c9ecff',
    below: '#b3dcff',
    fog: '#c6e8ff',
    fogDensity: 0.6,
    sunColor: '#fff3de',
    sunIntensity: 2.9,
    sunAzimuth: -2.25,
    sunElevation: 0.95,
    sunDisc: 1,
    hemiSky: '#cfe8ff',
    hemiGround: '#8f8466',
    hemiIntensity: 1.45,
    emissive: 0.55,
    stars: 0,
    cloudColor: '#ffffff',
    cloudShade: '#d4e3f7',
    exposure: 1.0,
    bloom: 0.7,
    saturation: 0.08,
    grade: { mul: [1, 1, 1], lift: [0, 0, 0] },
    fireflies: 0,
    fireflyColor: '#fff3a0',
    water: { deep: '#2a8fd8', shallow: '#62d6ec', glow: 0 },
  },
  dawn: {
    zenith: '#7b98e6',
    horizon: '#ffcaa8',
    below: '#f5b9b0',
    fog: '#fcc6ad',
    fogDensity: 0.75,
    // Poranek: miodowe słońce i liliowe niebo — trawa świeża, nie oliwkowa.
    sunColor: '#ffd8aa',
    sunIntensity: 2.7,
    sunAzimuth: 1.25,
    sunElevation: 0.45,
    sunDisc: 1.2,
    hemiSky: '#e4dcf4',
    hemiGround: '#7b6c7c',
    hemiIntensity: 1.4,
    emissive: 0.8,
    stars: 0.08,
    cloudColor: '#ffe6dc',
    cloudShade: '#d7a9b8',
    exposure: 1.0,
    bloom: 0.8,
    saturation: 0.18,
    grade: { mul: [1.02, 1.0, 1.0], lift: [0.02, 0.005, 0.03] },
    fireflies: 0,
    fireflyColor: '#fff3a0',
    water: { deep: '#4f86cf', shallow: '#f0b6b0', glow: 0 },
  },
  dusk: {
    zenith: '#5a5fb8',
    horizon: '#ffb08a',
    below: '#e79bb8',
    fog: '#f6ad9e',
    fogDensity: 0.7,
    // Złota godzina: ciepłe, ale nie różowe słońce i lawendowe niebo — trawa zostaje zielona (nie oliwkowa).
    sunColor: '#ffc88f',
    sunIntensity: 2.9,
    sunAzimuth: -1.75,
    sunElevation: 0.58,
    sunDisc: 1.3,
    hemiSky: '#d9c8f0',
    hemiGround: '#5d5a7a',
    hemiIntensity: 1.45,
    emissive: 1.0,
    stars: 0.15,
    cloudColor: '#ffd6c6',
    cloudShade: '#b784b8',
    exposure: 1.0,
    bloom: 0.9,
    saturation: 0.24,
    grade: { mul: [1.04, 0.99, 1.0], lift: [0.02, 0.0, 0.035] },
    fireflies: 0.35,
    fireflyColor: '#ffe39a',
    water: { deep: '#4a64c0', shallow: '#f6a59a', glow: 0.02 },
  },
  night: {
    zenith: '#0a1233',
    horizon: '#23396e',
    below: '#1a2b5a',
    fog: '#1f3163',
    fogDensity: 0.7,
    sunColor: '#9db8ff',
    sunIntensity: 1.3,
    sunAzimuth: -2.5,
    sunElevation: 0.85,
    sunDisc: 0.6,
    hemiSky: '#4d68d0',
    hemiGround: '#221f4a',
    hemiIntensity: 1.2,
    emissive: 1.8,
    stars: 1,
    cloudColor: '#4a5e9a',
    cloudShade: '#26315c',
    exposure: 1.05,
    bloom: 1.25,
    saturation: -0.32,
    grade: { mul: [0.6, 0.76, 1.18], lift: [0.0, 0.012, 0.04] },
    fireflies: 1,
    fireflyColor: '#e8ff8a',
    water: { deep: '#14306e', shallow: '#2f6fb0', glow: 0.08 },
  },
  cave: {
    zenith: '#120d1c',
    horizon: '#1b1428',
    below: '#120d1c',
    fog: '#171126',
    fogDensity: 1.4,
    sunColor: '#ffe9c9',
    sunIntensity: 1.35,
    sunAzimuth: -1.2,
    sunElevation: 1.1,
    sunDisc: 0,
    hemiSky: '#8c93d6',
    hemiGround: '#4a3530',
    hemiIntensity: 1.35,
    emissive: 1.25,
    stars: 0,
    cloudColor: '#000000',
    cloudShade: '#000000',
    exposure: 1.1,
    bloom: 1.2,
    saturation: 0.02,
    grade: { mul: [1.0, 0.97, 1.04], lift: [0.0, 0.0, 0.015] },
    fireflies: 0.75,
    fireflyColor: '#9ff0ff',
    water: { deep: '#1d3a6a', shallow: '#3d7aa8', glow: 0.1 },
  },
};
