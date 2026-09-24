/**
 * Świetliki (noc, zmierzch, jaskinia): kilkadziesiąt świecących punktów wokół kamery, jedno wywołanie rysowania.
 * Kolor HDR → złapie je bloom. Pozycje liczone na CPU (tanie przy ~70 punktach).
 */
import * as THREE from 'three';
import { mulberry32 } from '../util/rng';

const VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
varying float vBlink;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vBlink = 0.55 + 0.45 * sin(uTime * (1.3 + fract(aPhase * 7.1)) + aPhase * 6.283);
  gl_PointSize = uSize * uPixelRatio * (24.0 / max(1.0, -mv.z)) * (0.7 + 0.3 * vBlink);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vBlink;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  a = a * a * uStrength * vBlink;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a * (1.0 + 2.5 * smoothstep(0.45, 0.0, r)), a);
}
`;

export class Fireflies {
  readonly points: THREE.Points;
  private readonly mat: THREE.ShaderMaterial;
  private readonly offs: Float32Array;
  private readonly pos: Float32Array;
  private readonly count: number;
  private readonly radius = 15;
  private t = 0;

  constructor(count = 72, seed = 7) {
    this.count = count;
    const rng = mulberry32(seed);
    this.offs = new Float32Array(count * 4);
    this.pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.offs[i * 4] = rng.range(-this.radius, this.radius);
      this.offs[i * 4 + 1] = rng.range(0.4, 2.6);
      this.offs[i * 4 + 2] = rng.range(-this.radius, this.radius);
      this.offs[i * 4 + 3] = rng.range(0, 100);
      phase[i] = rng.next();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: 15 },
        uColor: { value: new THREE.Color(2.4, 2.8, 0.9) },
        uStrength: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.name = 'fireflies';
  }

  /** strength 0..1 (0 = ukryte), center = punkt, wokół którego latają (np. cel kamery). */
  update(dt: number, center: THREE.Vector3, strength: number, pixelRatio: number, heightAt: (x: number, z: number) => number, color?: THREE.Color): void {
    this.points.visible = strength > 0.01;
    this.mat.uniforms.uStrength!.value = strength;
    if (!this.points.visible) return;
    this.t += dt;
    this.mat.uniforms.uTime!.value = this.t;
    this.mat.uniforms.uPixelRatio!.value = pixelRatio;
    if (color) (this.mat.uniforms.uColor!.value as THREE.Color).copy(color);
    const R = this.radius;
    const span = R * 2;
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      const ph = this.offs[o + 3] ?? 0;
      // Powolne dryfowanie, zawinięte w kwadrat wokół środka (zawsze w kadrze).
      const ox = (this.offs[o] ?? 0) + Math.sin(this.t * 0.31 + ph) * 1.6;
      const oz = (this.offs[o + 2] ?? 0) + Math.cos(this.t * 0.27 + ph * 1.3) * 1.6;
      const wx = center.x + ((((ox - center.x) % span) + span * 1.5) % span) - R;
      const wz = center.z + ((((oz - center.z) % span) + span * 1.5) % span) - R;
      let gy = heightAt(wx, wz);
      if (!Number.isFinite(gy)) gy = center.y;
      const y = gy + (this.offs[o + 1] ?? 1) + Math.sin(this.t * 1.1 + ph * 2) * 0.35;
      this.pos[i * 3] = wx;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = wz;
    }
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.points.removeFromParent();
  }
}
