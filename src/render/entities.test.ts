import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AnimName, ModelId } from '../game/contracts';
import type { ModelFactory, ModelRig } from './models/types';
import { EntityManager } from './entities';

/** Fabryka-atrapa: zapisuje kolejne wywołania play() każdego modelu. */
function fakeFactory(): { factory: ModelFactory; plays: AnimName[][] } {
  const plays: AnimName[][] = [];
  const factory: ModelFactory = {
    ids: [],
    create(_id: ModelId): ModelRig {
      const log: AnimName[] = [];
      plays.push(log);
      let current: AnimName = 'idle';
      let pending: (() => void) | null = null;
      return {
        root: new THREE.Group(),
        height: 1,
        radius: 0.4,
        get current() {
          return current;
        },
        update() {},
        play(anim) {
          log.push(anim);
          current = anim;
          pending?.();
          pending = null;
          if (anim === 'idle' || anim === 'walk' || anim === 'dance' || anim === 'sleep' || anim === 'windup') return Promise.resolve();
          return new Promise<void>((r) => (pending = r));
        },
        setHighlight() {},
        dispose() {
          pending?.();
          pending = null;
        },
      };
    },
  };
  return { factory, plays };
}

describe('EntityManager', () => {
  it('keeps an explicitly played loop (dance) while a wandering entity idles, drops it after walking', () => {
    const { factory, plays } = fakeFactory();
    const em = new EntityManager(factory);
    const id = em.spawn('creature:plusik', { x: 0, z: 0 });
    em.wander(id, { x: 0, z: 0 }, 3);
    void em.play(id, 'dance');
    // Faza postoju wędrowania (0,3–1,8 s) — taniec nie może zostać nadpisany przez idle.
    for (let i = 0; i < 10; i++) em.update(1 / 60, null);
    const log = plays[0] ?? [];
    expect(log[log.length - 1]).toBe('dance');
    // Po kilku sekundach stworek idzie, a potem wraca do zwykłego idle.
    let sawWalk = false;
    for (let i = 0; i < 60 * 12; i++) {
      em.update(1 / 60, null);
      if (log[log.length - 1] === 'walk') sawWalk = true;
    }
    expect(sawWalk).toBe(true);
    expect(log.slice(log.indexOf('walk')).includes('dance')).toBe(false);
    em.dispose();
  });

  it('moveTo resolves on arrival and when the entity is despawned', async () => {
    const { factory } = fakeFactory();
    const em = new EntityManager(factory);
    const a = em.spawn('creature:plusik', { x: 0, z: 0 });
    let arrived = false;
    const p = em.moveTo(a, { x: 1, z: 0 }, 2).then(() => (arrived = true));
    for (let i = 0; i < 60; i++) em.update(1 / 60, null);
    await p;
    expect(arrived).toBe(true);
    expect(em.getPosition(a).x).toBeCloseTo(1);

    const b = em.spawn('creature:plusik', { x: 0, z: 0 });
    const q = em.moveTo(b, { x: 50, z: 0 }, 1);
    em.despawn(b);
    await expect(q).resolves.toBeUndefined();
    expect(em.exists(b)).toBe(false);
    em.dispose();
  });

  it('one-shot play resolves and locomotion resumes afterwards', async () => {
    const { factory, plays } = fakeFactory();
    const em = new EntityManager(factory);
    const id = em.spawn('hero', { x: 0, z: 0 });
    const hit = em.play(id, 'hit');
    em.locomote(id, 'walk');
    expect(plays[0]?.[plays[0].length - 1]).toBe('hit'); // jednorazowa nie jest przerywana przez lokomocję
    void em.play(id, 'idle'); // nowa animacja kończy poprzednią (atrapa rozwiązuje oczekującą)
    await hit;
    em.locomote(id, 'walk');
    expect(plays[0]?.[plays[0].length - 1]).toBe('walk');
    em.dispose();
  });
});
