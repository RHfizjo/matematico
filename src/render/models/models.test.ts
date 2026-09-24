import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { AnimName } from '../../game/contracts';
import { ONE_SHOT_DURATION, bump, easeOutBack, envelope, hop, isLoop, ramp, squash } from './anim';
import { ModelBuilder, mergeBoxes } from './builder';
import { baseMaterial } from './materials';
import { DIGIT_FONT } from './defs/common';
import { MODEL_IDS, Rig, createFx, createModelFactory } from './index';
import { Particles } from './particles';

const ALL_ANIMS: AnimName[] = ['idle', 'walk', 'windup', 'attack', 'strongAttack', 'hit', 'block', 'dance', 'cheer', 'hide', 'appear', 'open', 'sleep'];

describe('krzywe animacji', () => {
  it('ramp/bump/envelope mają poprawne krańce', () => {
    expect(ramp(0, 0.2, 0.6)).toBe(0);
    expect(ramp(1, 0.2, 0.6)).toBe(1);
    expect(ramp(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(bump(0.5, 0, 1)).toBeCloseTo(1);
    expect(bump(1.2, 0, 1)).toBe(0);
    expect(envelope(0.5, 0, 0.2, 0.8, 1)).toBe(1);
    expect(envelope(0, 0, 0.2, 0.8, 1)).toBe(0);
    expect(hop(0.5)).toBeCloseTo(1);
    expect(hop(1)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(easeOutBack(0.6)).toBeGreaterThan(1); // przestrzał
  });
  it('squash zachowuje objętość', () => {
    for (const k of [-0.3, -0.1, 0, 0.2]) {
      const [sx, sy, sz] = squash(k);
      expect(sx * sy * sz).toBeCloseTo(1, 5);
    }
  });
  it('pętle vs jednorazowe', () => {
    for (const a of ALL_ANIMS) {
      if (isLoop(a)) expect(ONE_SHOT_DURATION[a]).toBe(0);
      else expect(ONE_SHOT_DURATION[a]).toBeGreaterThan(0.2);
    }
  });
  it('czcionka cyfr: 10 znaków 3×5, „1” różni się od „7”', () => {
    expect(DIGIT_FONT).toHaveLength(10);
    for (const g of DIGIT_FONT) {
      expect(g).toHaveLength(5);
      for (const row of g) expect(row).toMatch(/^[01]{3}$/);
    }
    expect(DIGIT_FONT[1]?.join('')).not.toBe(DIGIT_FONT[7]?.join(''));
  });
});

describe('builder', () => {
  it('łączy kostki w jedną geometrię z kolorami i normalnymi', () => {
    const c = new THREE.Color('#ff0000');
    const g = mergeBoxes(
      [
        { size: [1, 1, 1], center: [0, 0.5, 0], color: c, opts: {} },
        { size: [0.5, 2, 0.5], center: [2, 1, 0], color: c, opts: { rot: [0, 0.5, 0] } },
      ],
      [0, 0, 0],
    );
    expect(g.getAttribute('position').count).toBe(48);
    expect(g.getIndex()?.count).toBe(72);
    g.computeBoundingBox();
    expect(g.boundingBox?.min.y).toBeCloseTo(0);
    expect(g.boundingBox?.max.y).toBeCloseTo(2);
    // dół kostki ciemniejszy niż góra
    const col = g.getAttribute('color');
    const pos = g.getAttribute('position');
    let top = 0;
    let bottom = 1;
    for (let i = 0; i < 24; i++) {
      if (pos.getY(i) > 0.9) top = Math.max(top, col.getX(i));
      if (pos.getY(i) < 0.1) bottom = Math.min(bottom, col.getX(i));
    }
    expect(top).toBeGreaterThan(bottom);
  });
});

describe('builder: lokalne przekształcenie i łączenie świecących kostek', () => {
  it('transformed() skaluje rozmiary i przesuwa środki', () => {
    const b = new ModelBuilder(baseMaterial());
    b.transformed({ from: [0, 1, 0], to: [0, 2, 0], scale: 2 }, () => {
      b.box('all', [1, 1, 1], [0, 1, 0], '#ff0000');
    });
    const built = b.build();
    const box = new THREE.Box3().setFromObject(built.all);
    expect(box.min.y).toBeCloseTo(1);
    expect(box.max.y).toBeCloseTo(3);
    expect(box.max.x).toBeCloseTo(1);
  });
  it('świecące kostki jednej części w różnych kolorach to jedna siatka (budżet wywołań rysowania)', () => {
    const b = new ModelBuilder(baseMaterial());
    for (const c of ['#ff0000', '#00ff00', '#0000ff', '#ffffff']) b.box('all', [0.1, 0.1, 0.1], [0, 0.5, 0], c, { glow: 1.5 });
    b.box('all', [1, 1, 1], [0, 0.5, 0], '#888888');
    expect(b.build().meshes).toHaveLength(2);
  });
});

describe('fabryka modeli', () => {
  const factory = createModelFactory();

  it('brainglamy mieszczą się w budżecie siatek (Galeria ma do 8 naraz)', () => {
    for (const id of MODEL_IDS.filter(i => i.startsWith('glam:'))) {
      const rig = factory.create(id) as Rig;
      expect(rig.meshCount, id).toBeLessThanOrEqual(22);
      rig.dispose();
    }
  });

  it('zna wszystkie identyfikatory z kontraktu (w tym każdy PropKind)', () => {
    expect(factory.ids).toContain('hero');
    expect(factory.ids).toContain('npc:kartonini');
    expect(factory.ids).toContain('prop:vine');
    expect(factory.ids.filter(i => i.startsWith('prop:'))).toHaveLength(14);
    expect(new Set(factory.ids).size).toBe(factory.ids.length);
  });

  for (const id of MODEL_IDS) {
    it(`${id}: buduje się, ≤ 30 siatek, wysokość zgodna z bryłą, stopy na ziemi`, () => {
      const rig = factory.create(id) as Rig;
      rig.update(0.016);
      expect(rig.meshCount).toBeGreaterThan(0);
      expect(rig.meshCount).toBeLessThanOrEqual(30);
      const box = new THREE.Box3().setFromObject(rig.root);
      expect(box.min.y).toBeGreaterThan(-0.15);
      expect(box.min.y).toBeLessThan(0.45);
      // zadeklarowana wysokość w granicach ±30% rzeczywistej bryły
      const h = box.max.y;
      expect(rig.height).toBeGreaterThan(h * 0.7);
      expect(rig.height).toBeLessThan(h * 1.3);
      rig.dispose();
    });
  }

  it('każda animacja na każdym modelu działa bez NaN; jednorazowe kończą się i wracają do idle', async () => {
    for (const id of MODEL_IDS) {
      const rig = factory.create(id) as Rig;
      for (const a of ALL_ANIMS) {
        const pr = rig.play(a);
        let resolved = false;
        void pr.then(() => {
          resolved = true;
        });
        for (let i = 0; i < 120; i++) rig.update(1 / 60);
        await Promise.resolve();
        await Promise.resolve();
        expect(resolved, `${id} ${a}`).toBe(true);
        rig.root.traverse(o => {
          expect(Number.isFinite(o.position.x + o.position.y + o.position.z), `${id} ${a} ${o.name}`).toBe(true);
          expect(Number.isFinite(o.scale.x + o.scale.y + o.scale.z)).toBe(true);
        });
        if (!isLoop(a) && a !== 'hide' && !(id.startsWith('prop:') && (a === 'open' || (id === 'prop:vine' && a === 'hit')))) {
          expect(rig.current, `${id} ${a}`).toBe('idle');
        }
      }
      rig.dispose();
    }
  });

  it('przerwana animacja jednorazowa rozwiązuje obietnicę', async () => {
    const rig = factory.create('hero');
    let done = false;
    void rig.play('cheer').then(() => {
      done = true;
    });
    rig.update(0.1);
    void rig.play('hit');
    await Promise.resolve();
    expect(done).toBe(true);
    expect(rig.current).toBe('hit');
  });

  it('podświetlenie i błysk nie psują materiałów wspólnych', () => {
    const a = factory.create('creature:plusik') as Rig;
    const b = factory.create('creature:plusik') as Rig;
    a.setHighlight(true);
    a.update(0.05);
    b.update(0.05);
    const matsA = new Set<THREE.Material>();
    const matsB = new Set<THREE.Material>();
    a.root.traverse(o => o instanceof THREE.Mesh && matsA.add(o.material as THREE.Material));
    b.root.traverse(o => o instanceof THREE.Mesh && matsB.add(o.material as THREE.Material));
    const shared = [...matsB].find(m => m.userData.shared === true && (m as THREE.MeshLambertMaterial).vertexColors);
    expect(shared).toBeDefined();
    expect((shared as THREE.MeshLambertMaterial).emissive.getHex()).toBe(0);
    a.setHighlight(false);
    a.update(0.05);
    const after = new Set<THREE.Material>();
    a.root.traverse(o => o instanceof THREE.Mesh && after.add(o.material as THREE.Material));
    expect([...after].some(m => m === shared)).toBe(true);
    a.dispose();
    b.dispose();
  });

  it('opts.color zmienia koszulkę bohatera', () => {
    const r1 = factory.create('hero', { color: '#ff0000' });
    const r2 = factory.create('hero', { color: '#00ff00' });
    const colorsOf = (r: ModelLike): number => {
      let sum = 0;
      r.root.traverse(o => {
        if (o instanceof THREE.Mesh && o.name === 'body:base') {
          const c = o.geometry.getAttribute('color');
          for (let i = 0; i < c.count; i++) sum += c.getX(i);
        }
      });
      return sum;
    };
    expect(colorsOf(r1)).toBeGreaterThan(colorsOf(r2));
  });

  it('nieznany identyfikator daje model zastępczy', () => {
    const r = factory.create('creature:minusiak');
    expect(r.height).toBeGreaterThan(0.5);
    r.dispose();
  });
});

type ModelLike = { root: THREE.Object3D };

describe('efekty', () => {
  it('cząsteczki: wybuchy każdego rodzaju, zanik, limit puli', () => {
    const fx = createFx();
    const ps = fx.createParticles() as Particles;
    const kinds = ['sparkle', 'hit', 'crit', 'block', 'heal', 'catch', 'digits', 'poof'] as const;
    for (const k of kinds) ps.burst(new THREE.Vector3(0, 1, 0), k);
    ps.update(0.016);
    expect(ps.active).toBeGreaterThan(100);
    for (let i = 0; i < 60; i++) for (const k of kinds) ps.burst(new THREE.Vector3(), k);
    ps.update(0.016);
    expect(ps.active).toBeLessThanOrEqual(512);
    for (let i = 0; i < 200; i++) ps.update(0.05);
    expect(ps.active).toBe(0);
    ps.dispose();
  });

  it('pełna pula: nowy wybuch nadpisuje kolejne sloty (nie znika w jednej cząstce)', () => {
    const ps = createFx().createParticles() as Particles;
    for (let i = 0; i < 40; i++) ps.burst(new THREE.Vector3(), 'sparkle'); // 40 × 28 > 512 — pula pełna
    ps.update(0.001);
    expect(ps.active).toBe(512);
    const tiles = ps.object.geometry.getAttribute('aTile');
    const digitTiles = (): number => {
      let n = 0;
      for (let i = 0; i < tiles.count; i++) if (tiles.getX(i) < 10) n++;
      return n;
    };
    expect(digitTiles()).toBe(0);
    ps.burst(new THREE.Vector3(), 'digits'); // 7 kostek z cyframi
    expect(digitTiles()).toBe(7);
    ps.dispose();
  });

  it('przemiana kończy się po ~2,6 s czasu świata i pokazuje brainglama', async () => {
    const factory = createModelFactory();
    const fx = createFx();
    const scene = new THREE.Scene();
    const particles = fx.createParticles();
    scene.add(particles.object);
    const from = factory.create('enemy:slimakorro');
    const to = factory.create('glam:slimakorro');
    scene.add(from.root, to.root);
    to.root.scale.setScalar(0);
    let done = false;
    const p = fx.playTransform({ scene, particles, from, to }).then(() => {
      done = true;
    });
    for (let i = 0; i < 150; i++) {
      from.update(1 / 60);
      to.update(1 / 60);
      particles.update(1 / 60);
      await Promise.resolve();
    }
    expect(done).toBe(false);
    for (let i = 0; i < 20; i++) {
      from.update(1 / 60);
      to.update(1 / 60);
      await Promise.resolve();
    }
    await p;
    expect(done).toBe(true);
    expect(to.root.scale.x).toBeCloseTo(1);
    expect((to as Rig).fx.scale.x).toBeCloseTo(1);
    expect((from as Rig).fx.scale.x).toBeLessThan(0.01);
    expect(to.current).toBe('cheer');
  });
});
