/**
 * Ikony interfejsu: małe, „kostkowe” SVG z grubym obrysem (spójne na każdym urządzeniu),
 * plus kilka emoji dla ozdobników. Wszystkie SVG mają viewBox 0 0 64 64.
 */

const INK = '#1f2a44';
const S = `stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;

const STAR_PTS = '32,5 39.6,22.5 58.6,24.4 44.4,37 48.5,55.7 32,46 15.5,55.7 19.6,37 5.4,24.4 24.4,22.5';

const SVG: Record<string, string> = {
  heart: `<path d="M32 56C12 42 5 32 5 21C5 12 12 6 20 6c5 0 9 3 12 7c3-4 7-7 12-7c8 0 15 6 15 15c0 11-7 21-27 35Z" fill="#ff5d7a" ${S}/><path d="M16 17c2-3 5-4 8-3" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="4" stroke-linecap="round"/>`,
  shield: `<path d="M32 5l23 8v17c0 15-10 25-23 30C19 55 9 45 9 30V13Z" fill="#58c4ff" ${S}/><path d="M32 12v41" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>`,
  star: `<polygon points="${STAR_PTS}" fill="#ffd23f" ${S}/><path d="M24 24l5-1" stroke="#fff" stroke-opacity=".85" stroke-width="4" stroke-linecap="round"/>`,
  starEmpty: `<polygon points="${STAR_PTS}" fill="#fff" fill-opacity=".45" stroke="${INK}" stroke-opacity=".45" stroke-width="4" stroke-dasharray="6 5" stroke-linejoin="round"/>`,
  pause: `<rect x="13" y="9" width="14" height="46" rx="5" fill="${INK}"/><rect x="37" y="9" width="14" height="46" rx="5" fill="${INK}"/>`,
  lock: `<path d="M21 29v-8a11 11 0 0 1 22 0v8" fill="none" ${S}/><rect x="12" y="28" width="40" height="30" rx="7" fill="#ffd23f" ${S}/><circle cx="32" cy="41" r="4" fill="${INK}"/><path d="M32 44v6" ${S}/>`,
  home: `<path d="M7 31L32 9l25 22" fill="none" ${S}/><path d="M13 27v29h38V27" fill="#ffb86b" ${S}/><rect x="26" y="37" width="12" height="19" rx="3" fill="#8a5a3c" ${S}/>`,
  sparkles: `<path d="M26 8c2 10 6 14 16 16c-10 2-14 6-16 16c-2-10-6-14-16-16c10-2 14-6 16-16Z" fill="#b9a2ff" ${S}/><path d="M46 34c1.5 7 4 9.5 11 11c-7 1.5-9.5 4-11 11c-1.5-7-4-9.5-11-11c7-1.5 9.5-4 11-11Z" fill="#ffd23f" ${S}/>`,
  play: `<path d="M20 10l32 22l-32 22Z" fill="#fff" ${S}/>`,
  leaf: `<path d="M9 55C9 27 27 9 56 8c0 29-18 47-47 47Z" fill="#5cc96b" ${S}/><path d="M12 52L42 22" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  pin: `<path d="M32 59S12 38 12 24a20 20 0 0 1 40 0c0 14-20 35-20 35Z" fill="#ff6b6b" ${S}/><circle cx="32" cy="24" r="7" fill="#fff" ${S}/>`,
  cube: `<path d="M32 6l24 12l-24 12L8 18Z" fill="#ffe27a" ${S}/><path d="M8 18l24 12v28L8 46Z" fill="#ffc21f" ${S}/><path d="M56 18L32 30v28l24-12Z" fill="#e59a00" ${S}/>`,
  ruler: `<path d="M5 46h54" ${S}/><path d="M9 40v12M20 42v8M31 40v12M42 42v8M53 40v12" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M9 36C12 14 28 14 31 36" fill="none" stroke="#3fa7ff" stroke-width="6" stroke-linecap="round"/><path d="M31 36c3-14 19-14 22 0" fill="none" stroke="#3ccf6e" stroke-width="6" stroke-linecap="round"/>`,
  deck: `<rect x="18" y="6" width="34" height="46" rx="6" fill="#9fd8ff" ${S}/><rect x="10" y="12" width="34" height="46" rx="6" fill="#3fa7ff" ${S}/><path d="M20 26l7 9l7-9l-7-9Z" fill="#fff" stroke="none"/>`,
  discard: `<rect x="14" y="10" width="34" height="46" rx="6" fill="#d7c9a6" ${S} transform="rotate(-12 31 33)"/><rect x="16" y="10" width="34" height="46" rx="6" fill="#f3ead2" ${S} transform="rotate(8 33 33)"/>`,
  sword: `<path d="M50 6h8v8L28 44l-8-8Z" fill="#dfe8f5" ${S}/><path d="M15 33l16 16" ${S}/><path d="M22 42l-12 12" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M22 42l-12 12" stroke="#b77b45" stroke-width="3" stroke-linecap="round"/>`,
  burst: `<path d="M32 3l6 15l14-8l-4 16l15 3l-13 9l10 12l-16-1l-1 15l-11-11l-11 11l-1-15l-16 1l10-12L2 29l15-3l-4-16l14 8Z" fill="#ffd23f" ${S}/>`,
  check: `<path d="M12 34l13 13l27-30" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 34l13 13l27-30" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrow: `<path d="M8 32h42M34 15l18 17l-18 17" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  back: `<path d="M22 12h32v40H22L6 32Z" fill="#fff" ${S}/><path d="M29 24l16 16M45 24L29 40" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  bulb: `<path d="M32 5a18 18 0 0 0-11 32c3 3 4 6 4 9h14c0-3 1-6 4-9A18 18 0 0 0 32 5Z" fill="#ffe27a" ${S}/><path d="M25 52h14M27 58h10" ${S}/><path d="M24 20c1-4 4-6 8-7" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  hourglass: `<path d="M16 6h32M16 58h32" ${S}/><path d="M19 6c0 14 11 18 11 26S19 44 19 58h26c0-14-11-18-11-26S45 20 45 6Z" fill="#fff" ${S}/><path d="M24 54c2-6 6-8 8-8s6 2 8 8Z" fill="#ffd23f"/>`,
  close: `<path d="M16 16l32 32M48 16L16 48" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`,
  gift: `<rect x="8" y="24" width="48" height="14" rx="3" fill="#ff8fb8" ${S}/><rect x="12" y="38" width="40" height="20" rx="3" fill="#ff5d7a" ${S}/><path d="M32 24v34" ${S}/><path d="M32 24c-6-12-18-12-16-3c1 4 9 3 16 3c7 0 15 1 16-3c2-9-10-9-16 3Z" fill="#ffd23f" ${S}/>`,
  drop: `<path d="M32 6C24 20 14 30 14 41a18 18 0 0 0 36 0C50 30 40 20 32 6Z" fill="#7fd6ff" ${S}/>`,
  sprout: `<path d="M32 58V32" ${S}/><path d="M32 34C32 20 22 14 10 14c0 12 8 20 22 20Z" fill="#5cc96b" ${S}/><path d="M32 30c0-12 9-18 22-18c0 12-9 18-22 18Z" fill="#8ee07a" ${S}/>`,
};

export type IconName = keyof typeof SVG;

/** Ikona SVG w elemencie <span class="icon icon-NAME">. Rozmiar ustawia CSS (domyślnie 1em). */
export function icon(name: IconName, cls = ''): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `icon icon-${name}${cls ? ` ${cls}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 64 64" width="100%" height="100%" focusable="false">${SVG[name] ?? ''}</svg>`;
  return el;
}

/** Emoji ozdobne (nie niosą samodzielnie informacji). */
export const EMOJI = {
  party: '🎉',
  sparkle: '✨',
  juice: '🧃',
  stretch: '🤸',
  wave: '👋',
  heartEyes: '😍',
} as const;
