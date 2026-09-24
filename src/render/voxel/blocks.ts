/**
 * Paleta bloków świata z kostek. Czyste dane (bez three.js) — używane przez mesher i generatory scen.
 * Kolory w sRGB (hex) → w tabeli liniowe (three.js traktuje kolory wierzchołków jako liniowe).
 */

export const B = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  water: 5,
  path: 6,
  planks: 7,
  log: 8,
  leaves: 9,
  leavesLight: 10,
  leavesPink: 11,
  leavesAutumn: 12,
  moss: 13,
  root: 14,
  glowMushroom: 15,
  crystal: 16,
  brick: 17,
  hay: 18,
  stoneBrick: 19,
  cobble: 20,
  caveFloor: 21,
  embers: 22,
  cloud: 23,
  birchLog: 24,
  roof: 25,
  gold: 26,
  lanternGlow: 27,
  mossyStone: 28,
  quartz: 29,
  darkPlanks: 30,
  cloth: 31,
  clothPink: 32,
  leavesDark: 33,
  flowerBed: 34,
  mushroomCap: 35,
  pinkCrystal: 36,
  gravel: 37,
  clover: 38,
  snowCloud: 39,
  caveMoss: 40,
} as const;

export type BlockId = (typeof B)[keyof typeof B];

/** Kody materiału — wzór proceduralny w shaderze (terrainMaterial.ts). */
export const MAT = {
  plain: 0,
  grassSide: 1,
  planks: 2,
  brick: 3,
  logSide: 4,
  logTop: 5,
  leaves: 6,
  glow: 7,
  stone: 8,
  sand: 9,
  path: 10,
  hay: 11,
  crystal: 12,
  birch: 13,
  roof: 14,
  grassTop: 15,
  cloud: 16,
  cloth: 17,
} as const;

interface FaceDef {
  color: string;
  alt: string;
  mat: number;
}

interface BlockDef {
  id: number;
  name: string;
  top: FaceDef;
  side: FaceDef;
  bottom: FaceDef;
  /** Świeci (siła emisji, 0 = nie). Ściany emisyjne nie są przyciemniane przez AO. */
  emissive?: number;
  /** false = nie jest nieprzezroczystą kostką (woda, powietrze). */
  opaque?: boolean;
  /** Blokuje chodzenie nawet na wysokości 1 (np. płot). Nieużywane przez mesher. */
  solid?: boolean;
}

function face(color: string, alt: string, mat: number): FaceDef {
  return { color, alt, mat };
}
function all(name: string, id: number, color: string, alt: string, mat: number, extra?: Partial<BlockDef>): BlockDef {
  const f = face(color, alt, mat);
  return { id, name, top: f, side: f, bottom: f, ...extra };
}

export const BLOCK_DEFS: readonly BlockDef[] = [
  {
    id: B.grass,
    name: 'grass',
    top: face('#78c257', '#94d062', MAT.grassTop),
    side: face('#78c257', '#8ac95c', MAT.grassSide),
    bottom: face('#8e5d3b', '#9b6b44', MAT.plain),
  },
  all('dirt', B.dirt, '#8e5d3b', '#a06c45', MAT.plain),
  all('stone', B.stone, '#9da3ad', '#8c929d', MAT.stone),
  all('sand', B.sand, '#f3dea4', '#ead08e', MAT.sand),
  all('water', B.water, '#3aa7e0', '#48b6ea', MAT.plain, { opaque: false }),
  {
    id: B.path,
    name: 'path',
    top: face('#d9b27a', '#c9a06a', MAT.path),
    side: face('#b98a58', '#a97b4c', MAT.path),
    bottom: face('#8e5d3b', '#9b6b44', MAT.plain),
  },
  all('planks', B.planks, '#d39a57', '#c48a4a', MAT.planks),
  {
    id: B.log,
    name: 'log',
    top: face('#c29560', '#b8895a', MAT.logTop),
    side: face('#7c5331', '#6d472a', MAT.logSide),
    bottom: face('#c29560', '#b8895a', MAT.logTop),
  },
  all('leaves', B.leaves, '#4fb041', '#66c24c', MAT.leaves),
  all('leavesLight', B.leavesLight, '#8fd65a', '#a8e46c', MAT.leaves),
  all('leavesPink', B.leavesPink, '#ffb0d0', '#ff97c1', MAT.leaves),
  all('leavesAutumn', B.leavesAutumn, '#ffb347', '#f7953a', MAT.leaves),
  all('moss', B.moss, '#5f9f3b', '#72b347', MAT.grassTop),
  {
    id: B.root,
    name: 'root',
    top: face('#80573a', '#744d33', MAT.logSide),
    side: face('#6b4a33', '#5c3e2a', MAT.logSide),
    bottom: face('#6b4a33', '#5c3e2a', MAT.logSide),
  },
  all('glowMushroom', B.glowMushroom, '#7cf0ff', '#b99bff', MAT.glow, { emissive: 1.3 }),
  all('crystal', B.crystal, '#a58dff', '#7fe3ff', MAT.crystal, { emissive: 0.9 }),
  all('brick', B.brick, '#cd6a50', '#bb5d46', MAT.brick),
  {
    id: B.hay,
    name: 'hay',
    top: face('#f4d160', '#ebc34f', MAT.hay),
    side: face('#eec455', '#e2b645', MAT.hay),
    bottom: face('#eec455', '#e2b645', MAT.hay),
  },
  all('stoneBrick', B.stoneBrick, '#aeb1bb', '#9fa2ad', MAT.brick),
  all('cobble', B.cobble, '#8e929b', '#7f848e', MAT.stone),
  all('caveFloor', B.caveFloor, '#75604f', '#685444', MAT.path),
  all('embers', B.embers, '#ff9442', '#ffb94d', MAT.glow, { emissive: 2.2 }),
  all('cloud', B.cloud, '#ffffff', '#f2f6ff', MAT.cloud),
  {
    id: B.birchLog,
    name: 'birchLog',
    top: face('#e6d8b8', '#dccda9', MAT.logTop),
    side: face('#f2efe6', '#e8e4d8', MAT.birch),
    bottom: face('#e6d8b8', '#dccda9', MAT.logTop),
  },
  all('roof', B.roof, '#e0584a', '#cf4c40', MAT.roof),
  all('gold', B.gold, '#ffd44d', '#ffc738', MAT.plain, { emissive: 0.25 }),
  all('lanternGlow', B.lanternGlow, '#ffd27a', '#ffc15c', MAT.glow, { emissive: 2.0 }),
  all('mossyStone', B.mossyStone, '#86a071', '#7a9466', MAT.stone),
  all('quartz', B.quartz, '#f6f0e4', '#ece3d3', MAT.brick),
  all('darkPlanks', B.darkPlanks, '#8a5f3a', '#7b5333', MAT.planks),
  all('cloth', B.cloth, '#3f86e0', '#3a7bd0', MAT.cloth),
  all('clothPink', B.clothPink, '#ff7fb0', '#f06ea2', MAT.cloth),
  all('leavesDark', B.leavesDark, '#2f8f4e', '#3a9d57', MAT.leaves),
  all('flowerBed', B.flowerBed, '#6bbd45', '#7fcb4f', MAT.grassTop),
  all('mushroomCap', B.mushroomCap, '#ef4f4f', '#e24545', MAT.plain),
  all('pinkCrystal', B.pinkCrystal, '#ff8fd8', '#ffb3e6', MAT.crystal, { emissive: 0.9 }),
  all('gravel', B.gravel, '#b3aba3', '#a39b94', MAT.path),
  all('clover', B.clover, '#3fae55', '#52c46a', MAT.grassTop),
  all('snowCloud', B.snowCloud, '#eef4ff', '#e2ebff', MAT.cloud),
  all('caveMoss', B.caveMoss, '#3f7f45', '#4b8f4c', MAT.leaves),
];

/** Faces: 0 = góra (+Y), 1 = bok, 2 = dół (−Y). */
export const FACE_TOP = 0;
export const FACE_SIDE = 1;
export const FACE_BOTTOM = 2;

/** Liczba poziomów zróżnicowania koloru (jitter) — twarze o różnym poziomie się nie łączą. */
export const JITTER_LEVELS = 4;

export interface BlockTable {
  /** 1 = nieprzezroczysta kostka (zasłania sąsiada, liczona do AO). */
  opaque: Uint8Array;
  /** Kolor liniowy: [(id*3 + face)*JITTER_LEVELS + level]*3 + c. */
  color: Float32Array;
  /** Kod materiału: id*3 + face. */
  mat: Uint8Array;
  emissive: Float32Array;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinear(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((v >> 16) & 255) / 255), srgbToLinear(((v >> 8) & 255) / 255), srgbToLinear((v & 255) / 255)];
}

let cached: BlockTable | null = null;

export function blockTable(): BlockTable {
  if (cached) return cached;
  const opaque = new Uint8Array(256);
  const color = new Float32Array(256 * 3 * JITTER_LEVELS * 3);
  const mat = new Uint8Array(256 * 3);
  const emissive = new Float32Array(256);
  for (const def of BLOCK_DEFS) {
    opaque[def.id] = def.opaque === false ? 0 : 1;
    emissive[def.id] = def.emissive ?? 0;
    const faces = [def.top, def.side, def.bottom];
    faces.forEach((f, fi) => {
      mat[def.id * 3 + fi] = f.mat;
      const a = hexToLinear(f.color);
      const b = hexToLinear(f.alt);
      for (let l = 0; l < JITTER_LEVELS; l++) {
        const t = l / (JITTER_LEVELS - 1);
        // Lekka zmiana jasności między poziomami (ożywia płaszczyzny).
        const bright = 1 + (l % 2 === 0 ? -0.025 : 0.025);
        for (let c = 0; c < 3; c++) {
          const av = a[c] ?? 0;
          const bv = b[c] ?? 0;
          color[((def.id * 3 + fi) * JITTER_LEVELS + l) * 3 + c] = (av + (bv - av) * t) * bright;
        }
      }
    });
  }
  cached = { opaque, color, mat, emissive };
  return cached;
}

export function isOpaque(id: number): boolean {
  return blockTable().opaque[id] === 1;
}
