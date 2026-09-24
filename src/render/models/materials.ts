/**
 * Współdzielone materiały modeli (buforowane). Modele kostkowe łączą statyczne kostki części w jedną siatkę
 * z kolorami w wierzchołkach — dlatego większość siatek używa JEDNEGO materiału bazowego.
 * Materiały świecące (emisja → bloom) są buforowane per kolor i intensywność.
 * Te materiały NIE są zwalniane przez ModelRig.dispose() (są wspólne); własne kopie rigów — tak.
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.MeshLambertMaterial>();

function cached(key: string, make: () => THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  let m = cache.get(key);
  if (!m) {
    m = make();
    m.name = `models:${key}`;
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

/** Materiał bazowy: kolory z wierzchołków, płaskie cieniowanie. */
export function baseMaterial(): THREE.MeshLambertMaterial {
  return cached('base', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** Materiał bazowy brainglamów: jak bazowy + delikatna, ciepło-różowa poświata (pastelowy „blask”). */
export function glamBaseMaterial(): THREE.MeshLambertMaterial {
  return cached(
    'glam-base',
    () =>
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        emissive: new THREE.Color('#ffd9f0'),
        emissiveIntensity: 0.14,
      }),
  );
}

/** Jednolity kolor (bez kolorów wierzchołków) — dla części przełączanych (np. segmenty muszli). */
export function solidMaterial(color: string): THREE.MeshLambertMaterial {
  return cached(`solid:${color}`, () => new THREE.MeshLambertMaterial({ color, flatShading: true }));
}

/** Materiał świecący — jasna emisja, łapie go bloom. intensity ~1 subtelnie, 2–3 mocno. */
export function glowMaterial(color: string, intensity = 2): THREE.MeshLambertMaterial {
  const k = Math.round(intensity * 100) / 100;
  return cached(
    `glow:${color}:${k}`,
    () => new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: k, flatShading: true }),
  );
}

/**
 * Własna (niewspółdzielona) kopia materiału — do animowania emisji/koloru pojedynczego modelu.
 * Zwalniana przez rig. Zapamiętuje domyślną emisję i kolor w userData.
 */
export function ownedClone(src: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  const m = src.clone();
  m.userData = { shared: false, emissive0: src.emissive.clone().multiplyScalar(src.emissiveIntensity), color0: src.color.clone() };
  m.emissiveIntensity = 1;
  m.emissive.copy(m.userData.emissive0 as THREE.Color);
  return m;
}

export function isShared(m: THREE.Material): boolean {
  return m.userData.shared === true;
}

/** Liczba buforowanych materiałów (diagnostyka/testy). */
export function sharedMaterialCount(): number {
  return cache.size;
}
