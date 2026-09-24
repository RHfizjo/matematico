/**
 * Czy odcinek przechodzi przez niepustą kostkę małego wolumenu (np. drzewa)? — DDA (Amanatides & Woo).
 * Używane do zanikania drzew między kamerą a bohaterem (dokładniej niż prostopadłościan otaczający).
 * Wolumen: indeks (y·sz + z)·sx + x; współrzędne odcinka w jednostkach kostek wolumenu.
 */
export function segmentHitsVoxels(
  dense: Uint8Array,
  sx: number,
  sy: number,
  sz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let ix = Math.floor(ax);
  let iy = Math.floor(ay);
  let iz = Math.floor(az);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const ez = Math.floor(bz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDX = stepX !== 0 ? 1 / Math.abs(dx) : Infinity;
  const tDY = stepY !== 0 ? 1 / Math.abs(dy) : Infinity;
  const tDZ = stepZ !== 0 ? 1 / Math.abs(dz) : Infinity;
  let tMX = stepX > 0 ? (ix + 1 - ax) * tDX : stepX < 0 ? (ax - ix) * tDX : Infinity;
  let tMY = stepY > 0 ? (iy + 1 - ay) * tDY : stepY < 0 ? (ay - iy) * tDY : Infinity;
  let tMZ = stepZ > 0 ? (iz + 1 - az) * tDZ : stepZ < 0 ? (az - iz) * tDZ : Infinity;
  const maxSteps = Math.abs(ex - ix) + Math.abs(ey - iy) + Math.abs(ez - iz) + 2;
  for (let n = 0; n <= maxSteps; n++) {
    if (ix >= 0 && iy >= 0 && iz >= 0 && ix < sx && iy < sy && iz < sz && (dense[(iy * sz + iz) * sx + ix] ?? 0) !== 0) return true;
    if (ix === ex && iy === ey && iz === ez) return false;
    if (tMX < tMY && tMX < tMZ) {
      if (tMX > 1) return false;
      ix += stepX;
      tMX += tDX;
    } else if (tMY < tMZ) {
      if (tMY > 1) return false;
      iy += stepY;
      tMY += tDY;
    } else {
      if (tMZ > 1) return false;
      iz += stepZ;
      tMZ += tDZ;
    }
  }
  return false;
}
