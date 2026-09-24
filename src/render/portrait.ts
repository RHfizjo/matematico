/**
 * Portrety modeli (karty, dialogi, galeria): render poza ekranem do WebGLRenderTarget (HDR, MSAA),
 * mapowanie tonów + sRGB w małym przejściu, readPixels → canvas → data URL (PNG, przezroczyste tło).
 * Ujęcie 3/4 od przodu, małe „studio” świateł. Wyniki w pamięci podręcznej (model + rozmiar).
 */
import * as THREE from 'three';
import type { ModelId } from '../game/contracts';
import type { ModelFactory } from './models/types';

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D tMap;
varying vec2 vUv;
${THREE.ShaderChunk.tonemapping_pars_fragment}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec4 t = texture2D(tMap, vUv);
  float a = clamp(t.a, 0.0, 1.0);
  vec3 c = a > 0.001 ? t.rgb / a : vec3(0.0);
  c = AgXToneMapping(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.18);
  gl_FragColor = vec4(toSRGB(c), a);
}
`;

export class PortraitRenderer {
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  private readonly cache = new Map<string, Promise<string>>();
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quadMat: THREE.ShaderMaterial;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly models: ModelFactory,
  ) {
    const hemi = new THREE.HemisphereLight(0xfff3e4, 0x7c86b0, 2.2);
    const key = new THREE.DirectionalLight(0xfff0dc, 3.2);
    key.position.set(-3, 5, 6);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 1.2);
    fill.position.set(5, 2, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 2.4);
    rim.position.set(1, 4, -6);
    this.scene.add(hemi, key, fill, rim);
    this.quadMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, toneMappingExposure: { value: 1.15 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  portrait(model: ModelId, size = 256): Promise<string> {
    const key = `${model}|${size}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    // Kolejka — jeden portret naraz (wspólne cele renderowania).
    const p = this.queue.then(() => this.renderPortrait(model, size));
    this.queue = p.catch(() => undefined);
    this.cache.set(key, p);
    p.catch(() => this.cache.delete(key));
    return p;
  }

  private async renderPortrait(model: ModelId, size: number): Promise<string> {
    const rig = this.models.create(model);
    this.scene.add(rig.root);
    try {
      rig.update(0);
      rig.update(0.3);
      rig.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.root);
      if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, Math.max(0.5, rig.height), 0.5));
      const center = box.getCenter(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const r = Math.max(0.3, sphere.radius);
      const yaw = 0.62;
      const pitch = 0.2;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const dist = (r / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2))) * 0.94;
      this.cam.position.copy(center).addScaledVector(dir, dist);
      this.cam.near = Math.max(0.01, dist - r * 3);
      this.cam.far = dist + r * 3;
      this.cam.lookAt(center.x, center.y - r * 0.02, center.z);
      this.cam.updateProjectionMatrix();
      return this.draw(size);
    } finally {
      rig.root.removeFromParent();
      try {
        rig.dispose();
      } catch {
        /* ignore */
      }
    }
  }

  private draw(size: number): string {
    const r = this.renderer;
    const hdr = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    const out = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, depthBuffer: false });
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    try {
      r.autoClear = true;
      r.setClearColor(0x000000, 0);
      r.setRenderTarget(hdr);
      r.clear(true, true, true);
      r.render(this.scene, this.cam);
      this.quadMat.uniforms.tMap!.value = hdr.texture;
      r.setRenderTarget(out);
      r.clear(true, true, true);
      r.render(this.quadScene, this.quadCam);
      const buf = new Uint8Array(size * size * 4);
      r.readRenderTargetPixels(out, 0, 0, size, size, buf);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        const src = (size - 1 - y) * size * 4;
        img.data.set(buf.subarray(src, src + size * 4), y * size * 4);
      }
      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL('image/png');
    } finally {
      r.setRenderTarget(prevTarget);
      r.setClearColor(prevClear, prevAlpha);
      r.autoClear = prevAuto;
      hdr.dispose();
      out.dispose();
    }
  }

  dispose(): void {
    this.quadMat.dispose();
    this.cache.clear();
  }
}
