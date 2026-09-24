/**
 * Przemiana brainrot → brainglam (GDD 7.6), ok. 2,6 s:
 *  0,00–0,85  brainrot wiruje coraz szybciej i unosi się, zaczyna świecić
 *  0,85–1,05  błysk + „nadmuchanie”
 *  1,05       rozpad na świecące kostki (wir cząstek), brainrot znika
 *  1,05–2,00  kostki wirują i zbiegają się do środka
 *  1,70–2,20  brainglam wskakuje ze sprężystym „boing” i dokręca obrót
 *  2,00       wybuch brokatu + gwiazdki, brainglam cieszy się (cheer)
 *  2,60       koniec (obietnica rozwiązana; cheer trwa dalej)
 * Zegar: update() modelu `to` (czas świata, z timeScale). Jeśli render go nie aktualizuje — zapas na rAF.
 */
import * as THREE from 'three';
import type { TransformContext } from './types';
import { easeInCubic, easeOutBack, easeOutCubic, ramp } from './anim';
import { Particles } from './particles';
import { Rig } from './rig';

export const TRANSFORM_DURATION = 2.6;

const _v = new THREE.Vector3();

export function playTransform(ctx: TransformContext): Promise<void> {
  const { from, to, particles } = ctx;
  const fr = from instanceof Rig ? from : null;
  const tr = to instanceof Rig ? to : null;
  const fromFx: THREE.Object3D = fr ? fr.fx : from.root;
  const toFx: THREE.Object3D = tr ? tr.fx : to.root;

  // pozycja i skala świata brainrota
  from.root.updateWorldMatrix(true, false);
  const base = from.root.getWorldPosition(new THREE.Vector3());
  const ws = from.root.getWorldScale(new THREE.Vector3());
  const sc = Math.max(0.001, ws.y);
  const mid = from.height * 0.5 * sc;
  const center = base.clone().add(new THREE.Vector3(0, mid, 0));

  // docelowy model: jeśli render ustawił skalę 0 na korzeniu, przywracamy ją (animujemy warstwę fx)
  if (tr && to.root.scale.lengthSq() < 1e-8) {
    to.root.scale.copy(from.root.scale.lengthSq() > 1e-8 ? from.root.scale : new THREE.Vector3(1, 1, 1));
  }
  toFx.scale.setScalar(0.0001);
  const fromYaw0 = fromFx.rotation.y;
  const fromY0 = fromFx.position.y;
  const fromScale0 = fromFx.scale.x || 1;
  const toScale0 = 1;

  const part = particles instanceof Particles ? particles : null;
  // Cząstki leżą w układzie rodzica obiektu cząstek — przeliczamy środek do tego układu.
  const toLocal = (p: THREE.Vector3): THREE.Vector3 => {
    const parent = particles.object.parent;
    if (!parent) return p.clone();
    parent.updateWorldMatrix(true, false);
    return parent.worldToLocal(p.clone());
  };

  let t = 0;
  let spin = 0;
  let broke = false;
  let popped = false;
  let sparkled = 0;
  let finished = false;
  let resolveFn: () => void = () => {};
  const done = new Promise<void>(res => {
    resolveFn = res;
  });

  const step = (dt: number): void => {
    if (finished) return;
    t += dt;
    // A: wir i unoszenie
    if (!broke) {
      const a = ramp(t, 0, 0.85);
      const w = 2 + 24 * a * a;
      spin += w * dt;
      fromFx.rotation.y = fromYaw0 + spin;
      fromFx.position.y = fromY0 + (0.7 * easeOutCubic(a) + 0.05 * Math.sin(t * 20) * a) / sc;
      const puff = 1 + 0.15 * ramp(t, 0.85, 1.02);
      const sq = 1 - 0.1 * ramp(t, 0.6, 0.85) * (1 - ramp(t, 0.85, 1.0));
      fromFx.scale.set(fromScale0 * puff / Math.sqrt(sq), fromScale0 * puff * sq, fromScale0 * puff / Math.sqrt(sq));
      if (fr) fr.externalFlash = 0.25 * a + 0.55 * ramp(t, 0.8, 1.0);
      if (sparkled === 0 && t > 0.25) {
        sparkled = 1;
        particles.burst(toLocal(_v.copy(center).setY(center.y + 0.3)), 'sparkle');
      }
      if (sparkled === 1 && t > 0.65) {
        sparkled = 2;
        particles.burst(toLocal(_v.copy(center).setY(center.y + 0.5)), 'sparkle');
      }
    }
    // C: rozpad
    if (!broke && t >= 1.05) {
      broke = true;
      const c = toLocal(_v.copy(center).setY(center.y + 0.45));
      if (part) {
        part.vortex(c, { count: 70, radius: Math.max(0.6, from.radius * 1.4) * sc, height: from.height * sc * 0.9, duration: 0.95, size: 0.14 * Math.max(0.7, sc) });
      } else {
        particles.burst(c, 'sparkle');
      }
      particles.burst(c, 'poof');
    }
    if (broke) {
      const k = 1 - easeInCubic(ramp(t, 1.05, 1.17));
      fromFx.scale.setScalar(Math.max(0.0001, fromScale0 * 1.15 * k));
      if (fr) fr.externalFlash = 0.8 * k;
    }
    // E: brainglam wskakuje
    if (t >= 1.7) {
      const e = ramp(t, 1.7, 2.2);
      const s = Math.max(0.0001, easeOutBack(e, 2.4) * toScale0);
      toFx.scale.setScalar(s);
      toFx.rotation.y = (1 - easeOutCubic(e)) * Math.PI * 2.5;
      toFx.position.y = 0.25 * Math.sin(e * Math.PI) / sc;
      if (tr) tr.externalFlash = 0.45 * (1 - e);
    }
    // F: brokat i radość
    if (!popped && t >= 2.0) {
      popped = true;
      const c = toLocal(_v.copy(center).setY(center.y + 0.3));
      particles.burst(c, 'sparkle');
      particles.burst(c, 'catch');
      particles.burst(toLocal(_v.copy(center).setY(center.y + 0.9)), 'sparkle');
      void to.play('cheer');
    }
    if (t >= TRANSFORM_DURATION) finish();
  };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    toFx.scale.setScalar(toScale0);
    toFx.rotation.y = 0;
    toFx.position.y = 0;
    if (tr) tr.externalFlash = 0;
    fromFx.scale.setScalar(0.0001);
    if (fr) fr.externalFlash = 0;
    unsub();
    clearTimeout(watchdog);
    clearTimeout(safety);
    if (raf !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
    resolveFn();
  };

  // Zegar główny: update() modelu docelowego.
  let ticked = false;
  const unsub = tr
    ? tr.addDriver(dt => {
        ticked = true;
        step(dt);
      })
    : () => {};
  // Zapas: jeśli nikt nie aktualizuje `to`, liczymy czas sami.
  let raf: number | null = null;
  const fallback = (): void => {
    let last = performance.now();
    const loop = (): void => {
      if (finished) return;
      const now = performance.now();
      step(Math.min(0.1, (now - last) / 1000));
      last = now;
      if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(loop);
      else setTimeout(loop, 16);
    };
    loop();
  };
  const watchdog = setTimeout(() => {
    if (!ticked && !finished) fallback();
  }, 400);
  // Bezpiecznik: gra nigdy nie czeka w nieskończoność.
  const safety = setTimeout(() => finish(), 9000);

  return done;
}
