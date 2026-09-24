/**
 * Silnik: WebGLRenderer + (średni/wysoki) kompozytor pmndrs postprocessing (MSAA 4×, bloom mipmap tylko
 * na jasnych/emisyjnych elementach, mapowanie tonów, lekka saturacja i winieta w JEDNYM przejściu efektów).
 * Niski preset: bezpośrednie renderowanie z mapowaniem tonów w rendererze.
 */
import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { QualityLevel } from '../game/contracts';
import { DynamicResolution, QUALITY_PRESETS, type QualityPreset } from './quality';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  preset: QualityPreset;
  readonly dyn: DynamicResolution;
  private composer: EffectComposer | null = null;
  private bloom: BloomEffect | null = null;
  private width = 1;
  private height = 1;
  private bloomBase = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    quality: QualityLevel,
    private readonly dprOverride?: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x9fd8ff, 1);
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.preset = QUALITY_PRESETS[quality];
    this.dyn = new DynamicResolution(this.preset.renderScale);
    this.applyPreset();
  }

  get dpr(): number {
    return this.dprOverride ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  }

  get renderScale(): number {
    return this.dyn.scale;
  }

  setQuality(q: QualityLevel): void {
    this.preset = QUALITY_PRESETS[q];
    this.dyn.reset(this.preset.renderScale);
    this.applyPreset();
  }

  private applyPreset(): void {
    const p = this.preset;
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    if (p.composer) {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.buildComposer();
    } else {
      this.disposeComposer();
      this.renderer.toneMapping = THREE.NeutralToneMapping;
      this.renderer.toneMappingExposure = 1.0;
    }
    this.applyScale();
  }

  private buildComposer(): void {
    this.disposeComposer();
    const p = this.preset;
    const composer = new EffectComposer(this.renderer, { multisampling: p.msaa, frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 1.0,
      luminanceSmoothing: 0.25,
      intensity: 1,
      radius: p.bloom === 'half+' ? 0.8 : 0.7,
      levels: p.bloomLevels,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    const sat = new HueSaturationEffect({ saturation: 0.08 });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    composer.addPass(new EffectPass(this.camera, this.bloom, tone, sat, vignette));
    this.composer = composer;
    this.setBloomStrength(this.bloomBase);
  }

  private disposeComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
  }

  setBloomStrength(v: number): void {
    this.bloomBase = v;
    if (this.bloom) this.bloom.intensity = v * (this.preset.bloom === 'half+' ? 1.15 : 1);
  }

  /** Ustawia rozmiar w pikselach CSS. */
  resize(w: number, h: number): void {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.applyScale();
  }

  applyScale(): void {
    this.renderer.setPixelRatio(this.dpr * this.dyn.scale);
    this.renderer.setSize(this.width, this.height, false);
    this.composer?.setSize(this.width, this.height, false);
  }

  get cssSize(): { w: number; h: number } {
    return { w: this.width, h: this.height };
  }

  render(dt: number): void {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposeComposer();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
