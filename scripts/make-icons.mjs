// Ikony PWA w stylu pixel-art (bez zależności; PNG przez node:zlib).
// Plusik — zielony kostkowy zajączek z uszami „+” — na trawiastym bloku pod błękitnym niebem.
// Rysunek w siatce 32×32 „pikseli logicznych”, skalowany całkowitą wielokrotnością (ostre krawędzie).
//
// Użycie: node scripts/make-icons.mjs [katalog-wyjściowy=public/icons]
//   icon-192.png          — 32×32 × 6, zaokrąglony kwadrat (przezroczyste rogi)
//   icon-512.png          — 32×32 × 16
//   icon-512-maskable.png — tło na cały kwadrat, postać w bezpiecznym kole (80%) — sprawdzane w skrypcie
//   (opcjonalnie) ICON_PREVIEW=/ścieżka.png — podgląd wszystkich wariantów z maską koła i „squircle”
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] ?? 'public/icons');

// ───────────────────────────── PNG ─────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGBA (Uint8Array w×h×4) → PNG. */
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // głębia
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filtr: brak
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ───────────────────────────── Paleta ─────────────────────────────

const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
const C = {
  ink: hex('#1f2a44'),
  sky: ['#5fb6f2', '#6fc0f5', '#80c9f8', '#93d3fa', '#a8ddfc', '#bde6fd'].map(hex),
  cloud: hex('#ffffff'),
  cloudShade: hex('#d6eeff'),
  grassHi: hex('#86e36f'),
  grass: hex('#55c046'),
  grassDark: hex('#3f9e36'),
  dirt: hex('#b57a45'),
  dirtDark: hex('#94602f'),
  dirtLight: hex('#cc955c'),
  seam: hex('#83532a'),
  body: hex('#5fd35f'),
  bodyDark: hex('#3fae48'),
  bodyLight: hex('#a6f08f'),
  ear: hex('#a4f06f'),
  earShade: hex('#7fd35a'),
  nose: hex('#ff7fa8'),
  cheek: hex('#ff9fbe'),
  mouth: hex('#2f7a36'),
  white: hex('#ffffff'),
  gold: hex('#ffd23f'),
  goldLight: hex('#fff3b0'),
};

// ───────────────────────────── Scena w pikselach logicznych ─────────────────────────────
// Układ: x 0..31 w prawo, y 0..31 w dół. Horyzont (góra trawy) na y = 24.

const GRASS_Y = 24;
const DIRT_Y = 26;

/** Deterministyczny „szum” do faktury ziemi (działa też poza 0..31 — dla ikony maskable). */
function h2(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function background(x, y) {
  if (y < GRASS_Y) {
    // niebo: pasy od ciemniejszego u góry do jasnego przy horyzoncie
    const band = Math.max(0, Math.min(C.sky.length - 1, Math.floor((y + 1) / 4)));
    return C.sky[band];
  }
  if (y === GRASS_Y) return C.grassHi;
  if (y < DIRT_Y) return C.grass;
  // ziemia: bloki 8 px ze szczeliną, cętki; trawa „kapie” na krawędź bloku
  const bx = ((x % 8) + 8) % 8;
  if (y === DIRT_Y && h2(x, 7) < 0.35) return C.grass;
  if (y === DIRT_Y + 1 && h2(x, 7) < 0.12) return C.grassDark;
  if (bx === 7) return C.seam;
  const r = h2(x, y);
  if (r < 0.14) return C.dirtDark;
  if (r > 0.9) return C.dirtLight;
  return C.dirt;
}

/** Ozdoby tła (chmurki, iskierki) — rysowane na tle, pod postacią. */
function decorations() {
  const px = new Map();
  const put = (x, y, c) => px.set(`${x},${y}`, c);
  // chmurka lewa
  for (const [x, y] of [[3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]]) put(x, y, C.cloud);
  for (const x of [2, 3, 4, 5, 6, 7]) put(x, 6, C.cloudShade);
  // chmurka prawa (niżej, mniejsza)
  for (const [x, y] of [[26, 14], [27, 14], [25, 15], [26, 15], [27, 15], [28, 15], [24, 16], [25, 16], [26, 16], [27, 16], [28, 16], [29, 16]]) put(x, y, C.cloud);
  for (const x of [25, 26, 27, 28]) put(x, 17, C.cloudShade);
  // iskierki (4-ramienne)
  const spark = (cx, cy) => {
    put(cx, cy, C.white);
    put(cx - 1, cy, C.gold);
    put(cx + 1, cy, C.gold);
    put(cx, cy - 1, C.gold);
    put(cx, cy + 1, C.gold);
  };
  spark(27, 5);
  spark(4, 14);
  put(29, 9, C.goldLight);
  put(7, 10, C.goldLight);
  return px;
}

/** Postać (Plusik) jako mapa pikseli wypełnienia; obrys dodawany automatycznie. */
function plusik() {
  const px = new Map();
  const rect = (x0, y0, w, hh, c) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) px.set(`${x},${y}`, c);
  };
  // uszy-plusy (ramię 2 px), lekko na zewnątrz
  const plus = (cx, cy) => {
    rect(cx, cy - 2, 2, 6, C.ear); // pion
    rect(cx - 2, cy, 6, 2, C.ear); // poziom
    // błysk na górnym ramieniu i cień na prawym — plus wygląda jak mała kostka
    px.set(`${cx},${cy - 2}`, C.white);
    px.set(`${cx + 1},${cy + 3}`, C.earShade);
    px.set(`${cx + 3},${cy + 1}`, C.earShade);
  };
  plus(9, 6);
  plus(21, 6);
  // „szypułki” uszu
  rect(10, 10, 2, 3, C.body);
  rect(20, 10, 2, 3, C.body);
  // ciało-kostka: górna ściana jaśniejsza, bok i spód ciemniejsze
  rect(8, 13, 16, 11, C.body);
  rect(8, 13, 16, 2, C.bodyLight);
  rect(23, 15, 1, 9, C.bodyDark);
  rect(8, 22, 16, 2, C.bodyDark);
  // oczy z błyskiem
  rect(11, 16, 2, 3, C.ink);
  rect(19, 16, 2, 3, C.ink);
  px.set('11,16', C.white);
  px.set('19,16', C.white);
  // pyszczek: nosek, uśmiech „w”, ząbki
  rect(15, 18, 2, 1, C.nose);
  px.set('14,19', C.mouth);
  px.set('15,20', C.mouth);
  px.set('16,20', C.mouth);
  px.set('17,19', C.mouth);
  // rumieńce
  rect(9, 19, 2, 1, C.cheek);
  rect(21, 19, 2, 1, C.cheek);
  // łapki
  rect(9, 23, 3, 1, C.bodyDark);
  rect(20, 23, 3, 1, C.bodyDark);
  return px;
}

/** Obrys 1 px (4-sąsiedztwo) wokół wypełnienia. */
function withOutline(fill) {
  const out = new Map(fill);
  for (const key of fill.keys()) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!fill.has(k)) out.set(k, C.ink);
    }
  }
  return out;
}

const CHARACTER = withOutline(plusik());
const DECOR = decorations();

/** Cień pod postacią na trawie. */
function shadowAt(x, y) {
  return (y === GRASS_Y + 1 || y === GRASS_Y) && x >= 7 && x <= 25;
}

function sceneColor(x, y) {
  const ch = CHARACTER.get(`${x},${y}`);
  if (ch) return ch;
  const d = DECOR.get(`${x},${y}`);
  if (d) return d;
  if (shadowAt(x, y)) return y === GRASS_Y ? C.grass : C.grassDark;
  return background(x, y);
}

// ───────────────────────────── Rasteryzacja ─────────────────────────────

/** Ikona „any”: 32×32 × scale, zaokrąglone rogi (promień w pikselach logicznych). */
function renderRounded(scale, radius = 5) {
  const size = 32 * scale;
  const rgba = new Uint8Array(size * size * 4);
  const inside = (x, y) => {
    // test zaokrąglenia w pikselach logicznych (ostre „schodki” pasują do pixel-artu)
    const cx = x < radius ? radius - 0.5 : x > 31 - radius ? 31 - radius + 0.5 : x;
    const cy = y < radius ? radius - 0.5 : y > 31 - radius ? 31 - radius + 0.5 : y;
    return Math.hypot(x - cx, y - cy) <= radius - 0.1;
  };
  for (let Y = 0; Y < size; Y++) {
    for (let X = 0; X < size; X++) {
      const x = Math.floor(X / scale);
      const y = Math.floor(Y / scale);
      if (!inside(x, y)) continue;
      // obwódka ikony: ciemna linia 1 px logiczny przy krawędzi zaokrąglonego kwadratu
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const c = edge ? C.ink : sceneColor(x, y);
      rgba.set(c, (Y * size + X) * 4);
    }
  }
  return { size, rgba };
}

/**
 * Ikona maskable 512: tło na cały kwadrat (niebo/ziemia przedłużone), postać większa i w środku.
 * Zwraca też największą odległość piksela postaci od środka (sprawdzenie bezpiecznego koła 40%).
 */
function renderMaskable(size = 512, scale = 12) {
  const rgba = new Uint8Array(size * size * 4);
  // środek postaci w pikselach logicznych
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const k of CHARACTER.keys()) {
    const [x, y] = k.split(',').map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x + 1);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y + 1);
  }
  const cxL = (minX + maxX) / 2;
  const cyL = (minY + maxY) / 2 + 1.5; // odrobinę niżej: widać więcej nieba nad uszami
  const offX = Math.round(size / 2 - cxL * scale);
  const offY = Math.round(size / 2 - cyL * scale);
  let maxDist = 0;
  for (let Y = 0; Y < size; Y++) {
    for (let X = 0; X < size; X++) {
      const x = Math.floor((X - offX) / scale);
      const y = Math.floor((Y - offY) / scale);
      const c = sceneColor(x, y);
      rgba.set(c, (Y * size + X) * 4);
      if (CHARACTER.has(`${x},${y}`)) {
        // najdalszy róg tego piksela fizycznego od środka
        const d = Math.hypot(Math.max(Math.abs(X - size / 2), Math.abs(X + 1 - size / 2)), Math.max(Math.abs(Y - size / 2), Math.abs(Y + 1 - size / 2)));
        maxDist = Math.max(maxDist, d);
      }
    }
  }
  return { size, rgba, maxDist };
}

/** Podgląd: ikony + maskable przycięta do koła i do „squircle”, na jasnym i ciemnym tle. */
function renderPreview(icons, mask) {
  const W = 1180, H = 560;
  const rgba = new Uint8Array(W * H * 4);
  const fill = (x0, y0, w, h, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < W && y < H) rgba.set(c, (y * W + x) * 4);
  };
  fill(0, 0, W / 2, H, hex('#f4f4f4'));
  fill(W / 2, 0, W / 2, H, hex('#202124'));
  const blit = (img, x0, y0, maskFn) => {
    for (let y = 0; y < img.size; y++) {
      for (let x = 0; x < img.size; x++) {
        if (maskFn && !maskFn(x, y, img.size)) continue;
        const i = (y * img.size + x) * 4;
        if (img.rgba[i + 3] === 0) continue;
        const o = ((y0 + y) * W + (x0 + x)) * 4;
        rgba[o] = img.rgba[i]; rgba[o + 1] = img.rgba[i + 1]; rgba[o + 2] = img.rgba[i + 2]; rgba[o + 3] = 255;
      }
    }
  };
  const circle = (x, y, s) => Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2) <= s / 2;
  const squircle = (x, y, s) => Math.pow(Math.abs((x + 0.5 - s / 2) / (s / 2)), 4) + Math.pow(Math.abs((y + 0.5 - s / 2) / (s / 2)), 4) <= 1;
  const safe = (x, y, s) => Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2) <= s * 0.4;
  const half = downscale(mask, 2); // 256
  const small = downscale(icons.i512, 2);
  blit(small, 20, 20);
  blit(icons.i192, 300, 20);
  blit(half, 20, 290, circle);
  blit(half, 300, 290, squircle);
  blit(small, 610, 20);
  blit(half, 890, 20, safe);
  blit(half, 610, 290, circle);
  blit(half, 890, 290, squircle);
  return { w: W, h: H, rgba };
}

function downscale(img, k) {
  const s = img.size / k;
  const rgba = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = ((y * k) * img.size + x * k) * 4;
    rgba.set(img.rgba.subarray(i, i + 4), (y * s + x) * 4);
  }
  return { size: s, rgba };
}

// ───────────────────────────── Zapis ─────────────────────────────

mkdirSync(OUT, { recursive: true });
const i192 = renderRounded(6);
const i512 = renderRounded(16);
const mask = renderMaskable(512, 12);
const safeR = 512 * 0.4;
if (mask.maxDist > safeR) {
  console.error(`BŁĄD: postać wystaje poza bezpieczne koło maskable (${mask.maxDist.toFixed(1)} > ${safeR})`);
  process.exit(1);
}
writeFileSync(join(OUT, 'icon-192.png'), encodePng(i192.size, i192.size, i192.rgba));
writeFileSync(join(OUT, 'icon-512.png'), encodePng(i512.size, i512.size, i512.rgba));
writeFileSync(join(OUT, 'icon-512-maskable.png'), encodePng(mask.size, mask.size, mask.rgba));
if (process.env.ICON_PREVIEW) {
  const prev = renderPreview({ i192, i512 }, mask);
  writeFileSync(resolve(process.env.ICON_PREVIEW), encodePng(prev.w, prev.h, prev.rgba));
}
console.log(`ikony zapisane w ${OUT} (maskable: postać do ${mask.maxDist.toFixed(0)} px od środka, limit ${safeR} px)`);
