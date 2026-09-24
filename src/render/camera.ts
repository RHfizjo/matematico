/**
 * Kamera (GDD v0.3): stała, z góry pod kątem ~50°, płynnie podąża za bohaterem. Ujęcia: walka, zbliżenie,
 * orbita (ekran tytułowy). Wstrząsy. Gracz nie obraca kamery.
 */
import * as THREE from 'three';
import { CAMERA_DISTANCE, CAMERA_FOV, CAMERA_PITCH, CAMERA_YAW } from './constants';
import { angleDelta, damp } from './util/rng';

export type CameraMode =
  | { kind: 'follow'; id: number }
  | { kind: 'combat'; a: number; b: number }
  | { kind: 'closeup'; id: number }
  | { kind: 'orbit'; center: THREE.Vector3; radius: number; speed: number; angle: number }
  | { kind: 'static' };

export interface EntityLookup {
  position(id: number): THREE.Vector3 | null;
  height(id: number): number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = { kind: 'static' };
  /** Bieżące (wygładzone) parametry. */
  readonly target = new THREE.Vector3();
  yaw = CAMERA_YAW;
  pitch = CAMERA_PITCH;
  distance = CAMERA_DISTANCE;
  private readonly desiredTarget = new THREE.Vector3();
  private desiredYaw = CAMERA_YAW;
  private desiredPitch = CAMERA_PITCH;
  private desiredDistance = CAMERA_DISTANCE;
  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeDur = 0;
  private snapNext = true;
  private readonly offset = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.3, 260);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** Następna aktualizacja ustawi kamerę od razu (bez najazdu) — np. po wczytaniu sceny. */
  snap(): void {
    this.snapNext = true;
  }

  lookAtPoint(p: THREE.Vector3): void {
    this.mode = { kind: 'static' };
    this.desiredTarget.copy(p);
    this.desiredYaw = CAMERA_YAW;
    this.desiredPitch = CAMERA_PITCH;
    this.desiredDistance = CAMERA_DISTANCE;
  }

  shake(intensity: number, ms: number): void {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeDur > 0 ? this.shakeTime / this.shakeDur : 0), intensity);
    this.shakeDur = Math.max(0.05, ms / 1000);
    this.shakeTime = this.shakeDur;
  }

  /** Kierunek „w prawo na ekranie” i „w górę ekranu” na płaszczyźnie XZ (bieżące yaw). */
  screenAxes(): { right: THREE.Vector2; up: THREE.Vector2 } {
    return {
      right: new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw)),
      up: new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw)),
    };
  }

  update(dt: number, ents: EntityLookup): void {
    const m = this.mode;
    let k = 5; // szybkość podążania
    switch (m.kind) {
      case 'follow': {
        const p = ents.position(m.id);
        if (p) this.desiredTarget.set(p.x, p.y + 1.0, p.z);
        this.desiredYaw = CAMERA_YAW;
        this.desiredPitch = CAMERA_PITCH;
        this.desiredDistance = CAMERA_DISTANCE;
        k = 4.5;
        break;
      }
      case 'combat': {
        const a = ents.position(m.a);
        const b = ents.position(m.b);
        if (a && b) {
          const mid = a.clone().add(b).multiplyScalar(0.5);
          const sep = Math.hypot(a.x - b.x, a.z - b.z);
          const hb = Math.max(ents.height(m.a), ents.height(m.b));
          // Postacie w górnej-środkowej części kadru (na dole ekranu jest ręka kart).
          const pitch = (44 * Math.PI) / 180;
          const dist = Math.max(10.5, sep * 1.25 + hb * 2 + 3.5);
          const down = dist * 0.16;
          this.desiredTarget.set(mid.x + Math.sin(CAMERA_YAW) * down, mid.y + hb * 0.35, mid.z + Math.cos(CAMERA_YAW) * down);
          this.desiredPitch = pitch;
          this.desiredDistance = dist;
          this.desiredYaw = CAMERA_YAW;
        }
        k = 3;
        break;
      }
      case 'closeup': {
        const p = ents.position(m.id);
        if (p) {
          const h = ents.height(m.id);
          this.desiredTarget.set(p.x, p.y + h * 0.6, p.z);
          this.desiredDistance = Math.max(4.5, h * 3.2);
          this.desiredPitch = (24 * Math.PI) / 180;
          this.desiredYaw = CAMERA_YAW;
        }
        k = 3.2;
        break;
      }
      case 'orbit': {
        m.angle += m.speed * dt;
        this.desiredTarget.copy(m.center);
        this.desiredYaw = m.angle;
        this.desiredPitch = (27 * Math.PI) / 180;
        this.desiredDistance = m.radius;
        k = 2;
        break;
      }
      case 'static':
        break;
    }
    if (this.snapNext) {
      this.target.copy(this.desiredTarget);
      this.yaw = this.desiredYaw;
      this.pitch = this.desiredPitch;
      this.distance = this.desiredDistance;
      this.snapNext = false;
    } else {
      const f = damp(k, dt);
      this.target.lerp(this.desiredTarget, f);
      this.yaw += angleDelta(this.yaw, this.desiredYaw) * (m.kind === 'orbit' ? 1 : f);
      this.pitch += (this.desiredPitch - this.pitch) * f;
      this.distance += (this.desiredDistance - this.distance) * f;
    }
    const cp = Math.cos(this.pitch);
    this.offset.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const s = this.shakeAmp * (this.shakeTime / this.shakeDur) * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.updateMatrixWorld();
  }
}
