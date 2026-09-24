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
import { GradeEffect } from './grade';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  preset: QualityPreset;
  readonly dyn: DynamicResolution;
  private composer: EffectComposer | null = null;
  private bloom: BloomEffect | null = null;
  private sat: HueSaturationEffect | null = null;
  private satBase = 0.08;
  private grade: GradeEffect | null = null;
  private gradeMul = new THREE.Color(1, 1, 1);
  private gradeLift = new THREE.Color(0, 0, 0);
  private width = 1;
  private height = 1;
  private bloomBase = 1;
  private dim = 0;

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
    // Świadome odstępstwo od GDD 16.1 („AgX lub ACES”): AgX sprawdzony na zrzutach — sprana, pastelowa
    // trawa i niski kontrast; Khronos PBR Neutral zachowuje odcienie i nasycenie (żywy styl dla dziecka).
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    const sat = new HueSaturationEffect({ saturation: this.satBase });
    this.sat = sat;
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    this.grade = new GradeEffect();
    this.grade.set(this.gradeMul, this.gradeLift);
    this.grade.setDim(this.dim);
    composer.addPass(new EffectPass(this.camera, this.bloom, tone, this.grade, sat, vignette));
    this.composer = composer;
    this.setBloomStrength(this.bloomBase);
  }

  private disposeComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.sat = null;
    this.grade = null;
  }

  /** Korekcja barw (paleta pory dnia) — tylko z kompozytorem. */
  setGrade(mul: THREE.Color, lift: THREE.Color): void {
    this.gradeMul.copy(mul);
    this.gradeLift.copy(lift);
    this.grade?.set(mul, lift);
  }

  /** Czy działa kompozytor (średni/wysoki) — wtedy przyciemnienie liczy efekt korekcji barw. */
  get hasComposer(): boolean {
    return this.composer !== null;
  }

  /** Przyciemnienie tła 0..1 (tylko z kompozytorem; niski preset — filtr CSS w index.ts). */
  setDim(k: number): void {
    this.dim = k;
    this.grade?.setDim(k);
  }

  /** Korekta nasycenia (paleta pory dnia). */
  setSaturation(v: number): void {
    this.satBase = v;
    if (this.sat && Math.abs(this.sat.saturation - v) > 1e-4) this.sat.saturation = v;
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
