/**
 * Atmosfera: kopuła nieba (gradient + poświata słońca + gwiazdy), mgła w kolorze horyzontu,
 * światło półkuli + słońce/księżyc z cieniem podążającym za bohaterem, kostkowe chmury.
 * Płynne przejścia między porami dnia.
 */
import * as THREE from 'three';
import { PALETTES, type Palette, type PaletteId } from './palettes';
import { worldUniforms } from '../voxel/materials';
import { B, blockTable } from '../voxel/blocks';
import { greedyMesh } from '../voxel/mesher';
import { paddedFromDense } from '../voxel/world';
import { createVoxelMaterial, geometryFromMesh } from '../voxel/materials';
import { mulberry32 } from '../util/rng';

interface LivePalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  below: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunDir: THREE.Vector3;
  sunDisc: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  emissive: number;
  stars: number;
  cloudColor: THREE.Color;
  cloudShade: THREE.Color;
  exposure: number;
  bloom: number;
  saturation: number;
  gradeMul: THREE.Color;
  gradeLift: THREE.Color;
  fireflies: number;
  fireflyColor: THREE.Color;
  waterDeep: THREE.Color;
  waterShallow: THREE.Color;
  waterGlow: number;
}

function toLive(p: Palette): LivePalette {
  const c = (hex: string): THREE.Color => new THREE.Color(hex);
  const ce = Math.cos(p.sunElevation);
  return {
    zenith: c(p.zenith),
    horizon: c(p.horizon),
    below: c(p.below),
    fog: c(p.fog),
    fogDensity: p.fogDensity,
    sunColor: c(p.sunColor),
    sunIntensity: p.sunIntensity,
    sunDir: new THREE.Vector3(Math.sin(p.sunAzimuth) * ce, Math.sin(p.sunElevation), Math.cos(p.sunAzimuth) * ce).normalize(),
    sunDisc: p.sunDisc,
    hemiSky: c(p.hemiSky),
    hemiGround: c(p.hemiGround),
    hemiIntensity: p.hemiIntensity,
    emissive: p.emissive,
    stars: p.stars,
    cloudColor: c(p.cloudColor),
    cloudShade: c(p.cloudShade),
    exposure: p.exposure,
    bloom: p.bloom,
    saturation: p.saturation,
    gradeMul: new THREE.Color().setRGB(...p.grade.mul),
    gradeLift: new THREE.Color().setRGB(...p.grade.lift),
    fireflies: p.fireflies,
    fireflyColor: c(p.fireflyColor),
    waterDeep: c(p.water.deep),
    waterShallow: c(p.water.shallow),
    waterGlow: p.water.glow,
  };
}

function lerpLive(out: LivePalette, a: LivePalette, b: LivePalette, t: number): void {
  out.zenith.lerpColors(a.zenith, b.zenith, t);
  out.horizon.lerpColors(a.horizon, b.horizon, t);
  out.below.lerpColors(a.below, b.below, t);
  out.fog.lerpColors(a.fog, b.fog, t);
  out.fogDensity = a.fogDensity + (b.fogDensity - a.fogDensity) * t;
  out.sunColor.lerpColors(a.sunColor, b.sunColor, t);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  out.sunDisc = a.sunDisc + (b.sunDisc - a.sunDisc) * t;
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, t);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, t);
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t;
  out.emissive = a.emissive + (b.emissive - a.emissive) * t;
  out.stars = a.stars + (b.stars - a.stars) * t;
  out.cloudColor.lerpColors(a.cloudColor, b.cloudColor, t);
  out.cloudShade.lerpColors(a.cloudShade, b.cloudShade, t);
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
  out.bloom = a.bloom + (b.bloom - a.bloom) * t;
  out.saturation = a.saturation + (b.saturation - a.saturation) * t;
  out.gradeMul.lerpColors(a.gradeMul, b.gradeMul, t);
  out.gradeLift.lerpColors(a.gradeLift, b.gradeLift, t);
  out.fireflies = a.fireflies + (b.fireflies - a.fireflies) * t;
  out.fireflyColor.lerpColors(a.fireflyColor, b.fireflyColor, t);
  out.waterDeep.lerpColors(a.waterDeep, b.waterDeep, t);
  out.waterShallow.lerpColors(a.waterShallow, b.waterShallow, t);
  out.waterGlow = a.waterGlow + (b.waterGlow - a.waterGlow) * t;
}

function cloneLive(p: LivePalette): LivePalette {
  return {
    ...p,
    zenith: p.zenith.clone(),
    horizon: p.horizon.clone(),
    below: p.below.clone(),
    fog: p.fog.clone(),
    sunColor: p.sunColor.clone(),
    sunDir: p.sunDir.clone(),
    hemiSky: p.hemiSky.clone(),
    hemiGround: p.hemiGround.clone(),
    cloudColor: p.cloudColor.clone(),
    cloudShade: p.cloudShade.clone(),
    gradeMul: p.gradeMul.clone(),
    gradeLift: p.gradeLift.clone(),
    fireflyColor: p.fireflyColor.clone(),
    waterDeep: p.waterDeep.clone(),
    waterShallow: p.waterShallow.clone(),
  };
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uBelow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDisc;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
float shash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  else col = mix(uHorizon, uBelow, smoothstep(0.0, 0.35, -h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.45) * uSunDisc;
  col += uSunColor * smoothstep(0.9985, 0.9992, sd) * 3.0 * uSunDisc;
  if (uStars > 0.0 && h > 0.02) {
    vec3 cell = floor(d * 160.0);
    float s = shash(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 80.0);
    col += vec3(0.95, 0.97, 1.0) * step(0.9965, s) * uStars * tw * smoothstep(0.02, 0.25, h) * 1.6;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type FogMode = 'linear' | 'exp';

interface CloudInstance {
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  /** Chmury krążą powoli wokół wyspy (nie przelatują przez nią). */
  angle: number;
  radius: number;
  scale: number;
  speed: number;
}

export class Atmosphere {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: THREE.Mesh;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly live: LivePalette;
  private from: LivePalette;
  private to: LivePalette;
  private t = 1;
  private dur = 1;
  paletteId: PaletteId = 'day';
  private viewDistance = 96;
  private fogMode: FogMode = 'exp';
  private fogLinear = new THREE.Fog(0xffffff, 20, 96);
  private fogExp = new THREE.FogExp2(0xffffff, 0.02);
  private shadowArea = 40;
  private shadowMapSize = 1024;
  private clouds: CloudInstance[] = [];
  private cloudGroup = new THREE.Group();
  private cloudMat: THREE.MeshLambertMaterial;
  private cloudCenter = new THREE.Vector3();
  private readonly tmp = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly axisZ = new THREE.Vector3(0, 0, 1);
  private readonly sRight = new THREE.Vector3();
  private readonly sUp = new THREE.Vector3();
  private readonly sPos = new THREE.Vector3();
  /** Czy scena ma niebo (false w jaskini). */
  outdoor = true;

  constructor(private readonly scene: THREE.Scene) {
    this.live = toLive(PALETTES.day);
    this.from = cloneLive(this.live);
    this.to = cloneLive(this.live);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.group.add(this.hemi, this.sun, this.sun.target);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uZenith: { value: this.live.zenith },
        uHorizon: { value: this.live.horizon },
        uBelow: { value: this.live.below },
        uSunDir: { value: this.live.sunDir },
        uSunColor: { value: this.live.sunColor },
        uSunDisc: { value: 1 },
        uStars: { value: 0 },
        uTime: worldUniforms.uTime,
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.cloudMat = createVoxelMaterial();
    this.cloudMat.fog = false;
    this.group.add(this.cloudGroup);
    scene.add(this.group);
    this.apply();
  }

  setPalette(id: PaletteId, ms = 1500): void {
    this.paletteId = id;
    this.from = cloneLive(this.live);
    this.to = toLive(PALETTES[id]);
    this.dur = Math.max(0.001, ms / 1000);
    this.t = ms <= 0 ? 1 : 0;
    if (ms <= 0) {
      lerpLive(this.live, this.from, this.to, 1);
      this.apply();
    }
  }

  configure(opts: { viewDistance: number; fog: FogMode; shadowMapSize: number; shadowArea: number; shadowRadius: number; shadows: boolean }): void {
    this.viewDistance = opts.viewDistance;
    this.fogMode = opts.fog;
    this.shadowArea = opts.shadowArea;
    this.sun.castShadow = opts.shadows;
    if (opts.shadows && opts.shadowMapSize !== this.shadowMapSize) {
      this.shadowMapSize = opts.shadowMapSize;
      this.sun.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.radius = opts.shadowRadius;
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowArea / 2;
    cam.right = this.shadowArea / 2;
    cam.top = this.shadowArea / 2;
    cam.bottom = -this.shadowArea / 2;
    cam.updateProjectionMatrix();
    this.apply();
  }

  /**
   * Kostkowe chmury wokół wyspy: warstwa pod krawędzią (widać ją z góry przy brzegach), warstwa na wysokości
   * wyspy (ekran tytułowy) i kilka wysoko. radius = promień wyspy, surfaceY = wierzch wyspy.
   */
  buildClouds(center: THREE.Vector3, radius: number, surfaceY: number, seed: number): void {
    for (const c of this.cloudGroup.children) {
      if (c instanceof THREE.InstancedMesh) c.geometry.dispose();
    }
    this.cloudGroup.clear();
    this.clouds = [];
    this.cloudCenter.copy(center);
    const rng = mulberry32(seed ^ 0xc10d);
    const table = blockTable();
    const shapes: THREE.BufferGeometry[] = [];
    for (let s = 0; s < 3; s++) {
      const sx = 9 + s * 3;
      const sy = 3 + (s % 2);
      const sz = 6 + s * 2;
      const dense = new Uint8Array(sx * sy * sz);
      // Kilka nakładających się „kłębów” (spłaszczonych elipsoid).
      const blobs = 3 + s;
      for (let b = 0; b < blobs; b++) {
        const cx = rng.range(2, sx - 3);
        const cz = rng.range(1.5, sz - 2.5);
        const rx = rng.range(2, 3.6);
        const rz = rng.range(1.5, 2.6);
        const ry = rng.range(1.2, sy - 0.2);
        for (let y = 0; y < sy; y++)
          for (let z = 0; z < sz; z++)
            for (let x = 0; x < sx; x++) {
              const dx = (x + 0.5 - cx) / rx;
              const dz = (z + 0.5 - cz) / rz;
              const dy = (y + 0.5) / ry;
              if (dx * dx + dz * dz + dy * dy * 0.6 < 1) dense[(y * sz + z) * sx + x] = B.cloud;
            }
      }
      const m = greedyMesh(paddedFromDense(sx, sy, sz, dense, -sx / 2, 0, -sz / 2), table, { jitter: () => 0 });
      shapes.push(geometryFromMesh(m));
    }
    const perShape = 14;
    shapes.forEach((geo) => {
      const mesh = new THREE.InstancedMesh(geo, this.cloudMat, perShape);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      for (let i = 0; i < perShape; i++) {
        const ang = rng.range(0, Math.PI * 2);
        const layer = rng.next();
        let rr: number;
        let y: number;
        let scale: number;
        if (layer < 0.5) {
          // Pod krawędzią wyspy.
          rr = rng.range(radius * 0.95, radius * 1.6);
          y = surfaceY - rng.range(6, 16);
          scale = rng.range(1.3, 2.3);
        } else if (layer < 0.8) {
          // Na wysokości wyspy, dalej.
          rr = rng.range(radius * 1.3, radius * 2.1);
          y = surfaceY + rng.range(-4, 6);
          scale = rng.range(1.6, 2.8);
        } else {
          rr = rng.range(radius * 0.4, radius * 1.8);
          y = surfaceY + rng.range(20, 32);
          scale = rng.range(2, 3.2);
        }
        this.clouds.push({
          mesh,
          index: i,
          pos: new THREE.Vector3(center.x + Math.cos(ang) * rr, y, center.z + Math.sin(ang) * rr),
          angle: ang,
          radius: rr,
          scale,
          speed: rng.range(0.3, 0.7),
        });
      }
      this.cloudGroup.add(mesh);
    });
    this.updateClouds(0);
  }

  clearClouds(): void {
    for (const c of this.cloudGroup.children) if (c instanceof THREE.InstancedMesh) c.geometry.dispose();
    this.cloudGroup.clear();
    this.clouds = [];
  }

  private updateClouds(dt: number): void {
    for (const c of this.clouds) {
      c.angle += (c.speed / c.radius) * dt;
      c.pos.x = this.cloudCenter.x + Math.cos(c.angle) * c.radius;
      c.pos.z = this.cloudCenter.z + Math.sin(c.angle) * c.radius;
      this.tmpQ.setFromAxisAngle(this.up, -c.angle);
      this.tmpS.set(c.scale, c.scale * 0.8, c.scale);
      this.tmp.compose(c.pos, this.tmpQ, this.tmpS);
      c.mesh.setMatrixAt(c.index, this.tmp);
    }
    for (const ch of this.cloudGroup.children) if (ch instanceof THREE.InstancedMesh) ch.instanceMatrix.needsUpdate = true;
  }

  /** Aktualizacja: przejście palety, słońce za celem (bohater), kopuła za kamerą, chmury. */
  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const e = this.t * this.t * (3 - 2 * this.t);
      lerpLive(this.live, this.from, this.to, e);
      this.apply();
    }
    this.sky.position.copy(camera.position);
    this.sky.visible = this.outdoor;
    this.cloudGroup.visible = this.outdoor;
    if (this.outdoor && this.clouds.length) this.updateClouds(dt);

    // Słońce: pozycja za celem wzdłuż kierunku do słońca, z przyciąganiem do tekseli mapy cieni (brak migotania).
    const sd = this.live.sunDir;
    const texel = this.shadowArea / Math.max(256, this.shadowMapSize);
    const fwd = this.tmpV.copy(sd).negate();
    const up = Math.abs(fwd.y) > 0.99 ? this.axisZ : this.up;
    const right = this.sRight.crossVectors(up, fwd).normalize();
    const up2 = this.sUp.crossVectors(fwd, right).normalize();
    const pr = Math.round(focus.dot(right) / texel) * texel;
    const pu = Math.round(focus.dot(up2) / texel) * texel;
    const pf = focus.dot(fwd);
    const snapped = this.sPos.set(0, 0, 0).addScaledVector(right, pr).addScaledVector(up2, pu).addScaledVector(fwd, pf);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(sd, 70);
    this.sun.target.updateMatrixWorld();
  }

  private apply(): void {
    const L = this.live;
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiIntensity;
    this.sun.color.copy(L.sunColor);
    this.sun.intensity = L.sunIntensity;
    this.skyMat.uniforms.uSunDisc!.value = L.sunDisc;
    this.skyMat.uniforms.uStars!.value = L.stars;
    worldUniforms.uEmissiveBoost.value = L.emissive;
    worldUniforms.uWaterDeep.value.copy(L.waterDeep);
    worldUniforms.uWaterShallow.value.copy(L.waterShallow);
    worldUniforms.uWaterGlow.value = L.waterGlow;
    this.cloudMat.color.copy(L.cloudColor);
    this.cloudMat.emissive.copy(L.cloudShade).multiplyScalar(0.35);
    if (this.fogMode === 'linear') {
      this.fogLinear.color.copy(L.fog);
      this.fogLinear.near = this.viewDistance * (this.outdoor ? 0.4 : 0.25);
      this.fogLinear.far = this.viewDistance * (this.outdoor ? 1 : 0.7);
      this.scene.fog = this.fogLinear;
    } else {
      this.fogExp.color.copy(L.fog);
      this.fogExp.density = (L.fogDensity * 1.3) / this.viewDistance;
      this.scene.fog = this.fogExp;
    }
    this.scene.background = this.outdoor ? null : L.fog.clone();
  }

  get exposure(): number {
    return this.live.exposure;
  }
  get bloomStrength(): number {
    return this.live.bloom;
  }
  get saturation(): number {
    return this.live.saturation;
  }
  get fireflies(): { strength: number; color: THREE.Color } {
    return { strength: this.live.fireflies, color: this.live.fireflyColor };
  }
  get grade(): { mul: THREE.Color; lift: THREE.Color } {
    return { mul: this.live.gradeMul, lift: this.live.gradeLift };
  }
  get fogColor(): THREE.Color {
    return this.live.fog;
  }

  dispose(): void {
    this.clearClouds();
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.cloudMat.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.remove(this.group);
  }
}
