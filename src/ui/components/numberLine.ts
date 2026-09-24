/**
 * Oś liczbowa ze skokami (podpowiedzi do dodawania i odejmowania).
 * SVG: kreski co 1 (lub co 5), etykiety co 1 / 5 / 10 zależnie od zakresu, łuki skoków rysowane po kolei
 * z etykietami „+2”, „−3” i skaczącym „ludzikiem” (kulką).
 */
import { signed } from '../util';

export interface NumberLineLayout {
  min: number;
  max: number;
  tickStep: number;
  labelStep: number;
  /** Punkty: start i miejsca lądowania po kolejnych skokach. */
  stops: number[];
}

/** Czysta geometria osi (testowalna): zakres, gęstość kresek i etykiet. */
export function numberLineLayout(from: number, jumps: number[]): NumberLineLayout {
  const stops = [from];
  let p = from;
  for (const j of jumps) {
    p += j;
    stops.push(p);
  }
  const lo = Math.min(...stops);
  const hi = Math.max(...stops);
  if (lo >= 0 && hi <= 20) {
    return { min: 0, max: hi <= 10 ? 10 : 20, tickStep: 1, labelStep: 1, stops };
  }
  const min = lo < 0 ? lo : Math.max(0, Math.floor((lo - 2) / 10) * 10);
  const max = Math.ceil((hi + 2) / 10) * 10;
  const span = max - min;
  if (span <= 20) return { min, max, tickStep: 1, labelStep: 1, stops };
  if (span <= 40) return { min, max, tickStep: 1, labelStep: 5, stops };
  if (span <= 60) return { min, max, tickStep: 1, labelStep: 10, stops };
  return { min, max, tickStep: 5, labelStep: 10, stops };
}

export interface NumberLineOpts {
  width?: number;
  height?: number;
  /** Ile skoków pokazać (domyślnie wszystkie). 0 = tylko punkt startu. */
  shown?: number;
  compact?: boolean;
}

export interface NumberLineView {
  el: SVGSVGElement;
  /** Animacja skoków po kolei w czasie ms. */
  play(ms: number): Promise<void>;
  /** Stan końcowy od razu (bez animacji). */
  finish(): void;
  stop(): void;
}

const NS = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function numberLine(spec: { from: number; jumps: number[] }, opts: NumberLineOpts = {}): NumberLineView {
  const compact = opts.compact ?? false;
  const W = opts.width ?? (compact ? 640 : 900);
  const H = opts.height ?? (compact ? 150 : 230);
  const shown = Math.max(0, Math.min(spec.jumps.length, opts.shown ?? spec.jumps.length));
  const L = numberLineLayout(spec.from, spec.jumps);
  const padX = compact ? 30 : 40;
  const lineY = H - (compact ? 52 : 66);
  const x = (v: number): number => padX + ((v - L.min) / (L.max - L.min)) * (W - 2 * padX);
  const unitPx = (W - 2 * padX) / (L.max - L.min);
  const fsLabel = compact ? 16 : 20;
  const pillH = compact ? 28 : 34;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: `nl${compact ? ' nl-compact' : ''}`, role: 'img' });
  svg.setAttribute('aria-label', `Oś liczbowa od ${L.min} do ${L.max}`);

  // Linia i kreski
  svg.append(s('line', { x1: padX - 16, y1: lineY, x2: W - padX + 16, y2: lineY, class: 'nl-axis' }));
  svg.append(s('path', { d: `M${W - padX + 10} ${lineY - 9} L${W - padX + 22} ${lineY} L${W - padX + 10} ${lineY + 9}`, class: 'nl-arrowhead' }));
  const shownStops = L.stops.slice(0, shown + 1);
  const stopXs = shownStops.map(x);
  for (let v = L.min; v <= L.max; v += L.tickStep) {
    const big = v % 10 === 0;
    const mid = v % 5 === 0;
    const th = big ? 24 : mid ? 17 : 11;
    svg.append(s('line', { x1: x(v), y1: lineY - th / 2, x2: x(v), y2: lineY + th / 2, class: `nl-tick${big ? ' nl-tick-10' : ''}` }));
  }
  for (let v = L.min; v <= L.max; v += L.labelStep) {
    const vx = x(v);
    // Etykiety punktów skoków rysujemy osobno (pastylki) — zwykłe etykiety pod nimi pomijamy.
    if (stopXs.some(sx => Math.abs(sx - vx) < (compact ? 22 : 28))) continue;
    svg.append(s('text', { x: vx, y: lineY + (compact ? 28 : 36), class: `nl-label${v % 10 === 0 ? ' nl-label-10' : ''}`, 'font-size': fsLabel }, String(v)));
  }

  // Łuki skoków
  interface Jump { path: SVGPathElement; tag: SVGGElement; pill: SVGGElement; p0: [number, number]; c: [number, number]; p1: [number, number] }
  const jumpsEls: Jump[] = [];
  const arcLayer = s('g', { class: 'nl-arcs' });
  const pillLayer = s('g', { class: 'nl-pills' });
  svg.append(arcLayer, pillLayer);

  const makePill = (v: number, cls: string): SVGGElement => {
    const txt = String(v);
    const w = txt.length * (compact ? 12 : 15) + (compact ? 18 : 22);
    const g = s('g', { class: `nl-pill ${cls}`, transform: `translate(${x(v)} ${lineY})` });
    g.append(s('circle', { cx: 0, cy: 0, r: compact ? 6 : 8, class: 'nl-dot' }));
    g.append(s('rect', { x: -w / 2, y: compact ? 11 : 14, width: w, height: pillH, rx: pillH / 2, class: 'nl-pill-bg' }));
    g.append(s('text', { x: 0, y: (compact ? 11 : 14) + pillH / 2 + 1, class: 'nl-pill-t', 'font-size': compact ? 18 : 22 }, txt));
    return g;
  };

  pillLayer.append(makePill(spec.from, 'nl-start'));
  for (let i = 0; i < shown; i++) {
    const a = L.stops[i] ?? 0;
    const b = L.stops[i + 1] ?? 0;
    const j = spec.jumps[i] ?? 0;
    const x1 = x(a);
    const x2 = x(b);
    const y0 = lineY - 6;
    const maxArc = lineY - (compact ? 40 : 52);
    const hgt = Math.max(compact ? 20 : 26, Math.min(maxArc, Math.abs(x2 - x1) * 0.42 + unitPx * 0.3));
    const cx = (x1 + x2) / 2;
    const cy = y0 - 2 * hgt;
    const path = s('path', {
      d: `M${x1} ${y0} Q${cx} ${cy} ${x2} ${y0}`,
      class: `nl-arc ${j < 0 ? 'nl-arc-minus' : 'nl-arc-plus'}`,
      pathLength: 1,
    });
    arcLayer.append(path);
    const label = signed(j);
    const tw = label.length * (compact ? 11 : 14) + (compact ? 14 : 18);
    const peakY = y0 - hgt;
    const tag = s('g', { class: `nl-jumptag nl-hidden ${j < 0 ? 'minus' : 'plus'}`, transform: `translate(${cx} ${peakY - (compact ? 14 : 18)})` });
    tag.append(s('rect', { x: -tw / 2, y: compact ? -13 : -16, width: tw, height: compact ? 26 : 32, rx: compact ? 13 : 16 }));
    tag.append(s('text', { x: 0, y: 1, 'font-size': compact ? 17 : 22 }, label));
    arcLayer.append(tag);
    const last = i === spec.jumps.length - 1;
    const pill = makePill(b, `${last ? 'nl-end' : 'nl-mid'} nl-hidden`);
    pillLayer.append(pill);
    jumpsEls.push({ path, tag, pill, p0: [x1, y0], c: [cx, cy], p1: [x2, y0] });
  }

  // „Skoczek”
  const hopR = compact ? 10 : 13;
  const hopper = s('g', { class: 'nl-hopper' });
  hopper.append(s('circle', { cx: 0, cy: 0, r: hopR, class: 'nl-hopper-body' }));
  hopper.append(s('circle', { cx: -hopR * 0.35, cy: -hopR * 0.15, r: hopR * 0.16, class: 'nl-hopper-eye' }));
  hopper.append(s('circle', { cx: hopR * 0.35, cy: -hopR * 0.15, r: hopR * 0.16, class: 'nl-hopper-eye' }));
  svg.append(hopper);
  const setHopper = (px: number, py: number): void => hopper.setAttribute('transform', `translate(${px} ${py - hopR - 4})`);
  setHopper(x(spec.from), lineY);

  const setArc = (jmp: Jump, p: number): void => {
    jmp.path.style.strokeDashoffset = String(1 - p);
  };
  for (const j of jumpsEls) setArc(j, 0);

  let rafId = 0;
  let resolvePlay: (() => void) | null = null;
  const finish = (): void => {
    cancelAnimationFrame(rafId);
    for (const j of jumpsEls) {
      setArc(j, 1);
      j.tag.classList.remove('nl-hidden');
      j.pill.classList.remove('nl-hidden');
    }
    const lastJ = jumpsEls[jumpsEls.length - 1];
    if (lastJ) setHopper(lastJ.p1[0], lineY);
    resolvePlay?.();
    resolvePlay = null;
  };

  const play = (ms: number): Promise<void> => {
    if (jumpsEls.length === 0) return Promise.resolve();
    return new Promise(resolve => {
      resolvePlay = resolve;
      const per = ms / jumpsEls.length;
      const t0 = performance.now();
      const shownFlags = jumpsEls.map(() => false);
      const tick = (now: number): void => {
        const t = now - t0;
        const idx = Math.min(jumpsEls.length - 1, Math.floor(t / per));
        for (let i = 0; i < jumpsEls.length; i++) {
          const j = jumpsEls[i];
          if (!j) continue;
          const local = (t - i * per) / (per * 0.78);
          const p = Math.max(0, Math.min(1, local));
          setArc(j, ease(p));
          if (p >= 1 && !shownFlags[i]) {
            shownFlags[i] = true;
            j.tag.classList.remove('nl-hidden');
            j.pill.classList.remove('nl-hidden');
          }
        }
        const cur = jumpsEls[idx];
        if (cur) {
          const p = ease(Math.max(0, Math.min(1, (t - idx * per) / (per * 0.78))));
          const u = 1 - p;
          const px = u * u * cur.p0[0] + 2 * u * p * cur.c[0] + p * p * cur.p1[0];
          const py = u * u * cur.p0[1] + 2 * u * p * cur.c[1] + p * p * cur.p1[1];
          setHopper(px, py + 6);
        }
        if (t >= ms) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    });
  };

  return {
    el: svg,
    play,
    finish,
    stop: () => {
      cancelAnimationFrame(rafId);
      resolvePlay = null;
    },
  };
}
