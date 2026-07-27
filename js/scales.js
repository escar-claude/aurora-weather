/* ============================================================
   scales.js — colour ramps + layer definitions for the map
   ============================================================ */
'use strict';

import { clamp } from './util.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* stops: [value, '#rrggbb', alpha?] — alpha defaults to 1 */
const TEMP = [
  [-40, '#5b21a8'], [-30, '#3f3fc0'], [-20, '#2f6fd0'], [-10, '#3fa9e0'], [-5, '#63c8dc'],
  [0, '#a8e4dc'], [5, '#7fd08a'], [10, '#b8de6f'], [15, '#ecd964'], [20, '#f5b94b'],
  [25, '#f2903a'], [30, '#e8622c'], [35, '#d43a2a'], [40, '#a3243c'], [45, '#7a1a4e'],
];
const WIND = [
  [0, '#0d1730'], [6, '#17356e'], [14, '#245ba8'], [24, '#2e8cc4'], [34, '#37b4a8'],
  [46, '#6ed07a'], [60, '#d6d45e'], [78, '#f2903a'], [98, '#e0442f'], [120, '#b8317e'],
  [140, '#7d2ba3'],
];
const RAIN = [
  [0, '#3a6bd0', 0], [0.06, '#3a6bd0', 0.12], [0.4, '#2f8fd0', 0.34], [1, '#35b7c8', 0.5],
  [2.5, '#45c86a', 0.6], [5, '#ecd964', 0.68], [10, '#f2712f', 0.76], [20, '#d42a2a', 0.82],
  [40, '#b8317e', 0.88],
];
const CLOUD = [
  [0, '#dbe7ff', 0], [15, '#dbe7ff', 0.04], [40, '#e2ecff', 0.18], [65, '#eaf2ff', 0.34],
  [85, '#f2f7ff', 0.5], [100, '#ffffff', 0.62],
];
const RH = [
  [0, '#8a5a2b'], [25, '#c8a25a'], [45, '#b8c86a'], [60, '#6fc890'], [75, '#3fa9c8'],
  [88, '#2f6fd0'], [100, '#2a3fa0'],
];
const PRESS = [
  [970, '#7d2ba3'], [990, '#2f6fd0'], [1002, '#4fc8d0'], [1013, '#cfdcf0'], [1020, '#ecd964'],
  [1032, '#f2903a'], [1050, '#d42a2a'],
];

/* build a 512-entry RGBA lookup table across [min,max] */
function buildLUT(stops, min, max, size = 512) {
  const lut = new Uint8ClampedArray(size * 4);
  const pts = stops.map(([v, h, a]) => ({ v, c: hex(h), a: a == null ? 1 : a }));
  for (let i = 0; i < size; i++) {
    const v = min + (max - min) * (i / (size - 1));
    let k = 0;
    while (k < pts.length - 2 && v > pts[k + 1].v) k++;
    const a = pts[k], b = pts[k + 1] || pts[k];
    const t = b.v === a.v ? 0 : clamp((v - a.v) / (b.v - a.v), 0, 1);
    lut[i * 4]     = a.c[0] + (b.c[0] - a.c[0]) * t;
    lut[i * 4 + 1] = a.c[1] + (b.c[1] - a.c[1]) * t;
    lut[i * 4 + 2] = a.c[2] + (b.c[2] - a.c[2]) * t;
    lut[i * 4 + 3] = (a.a + (b.a - a.a) * t) * 255;
  }
  return lut;
}

export function cssGradient(stops, min, max) {
  return stops.map(([v, h, a]) => {
    const p = clamp(((v - min) / (max - min)) * 100, 0, 100);
    const [r, g, b] = hex(h);
    return `rgba(${r},${g},${b},${a == null ? 1 : a}) ${p.toFixed(1)}%`;
  }).join(', ');
}

/* ---------- layer definitions ---------- */
export const LAYERS = [
  {
    id: 'wind', label: 'Wind', field: 'spd', unit: 'km/h', min: 0, max: 140,
    stops: WIND, ticks: [0, 20, 40, 60, 80, 100, 120, 140], particles: true, alpha: 0.55,
    ico: '<svg viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 100-6M3 16h15a3 3 0 110 6M3 12h9"/></svg>',
  },
  {
    id: 'temp', label: 'Temp', field: 'temp', unit: '°C', min: -40, max: 45,
    stops: TEMP, ticks: [-40, -20, -10, 0, 10, 20, 30, 45], particles: false, alpha: 0.72,
    ico: '<svg viewBox="0 0 24 24"><path d="M14 14V5a2 2 0 10-4 0v9a4 4 0 104 0z"/></svg>',
  },
  {
    id: 'rain', label: 'Rain', field: 'rain', unit: 'mm/h', min: 0, max: 40,
    stops: RAIN, ticks: [0, 0.5, 2, 5, 10, 20, 40], particles: false, alpha: 1, log: true,
    ico: '<svg viewBox="0 0 24 24"><path d="M7 15c-2.8 0-5-2.2-5-5s2.2-5 5-5c.8-2.9 3.4-5 6.5-5C17.6 0 21 3.4 21 7.5c0 4.1-3.4 7.5-7.5 7.5z" transform="translate(0 3)"/><path d="M8 19l-1 3M13 19l-1 3M18 19l-1 3"/></svg>',
  },
  {
    id: 'cloud', label: 'Cloud', field: 'cloud', unit: '%', min: 0, max: 100,
    stops: CLOUD, ticks: [0, 25, 50, 75, 100], particles: false, alpha: 1,
    ico: '<svg viewBox="0 0 24 24"><path d="M7 19c-2.8 0-5-2.2-5-5s2.2-5 5-5c.8-2.9 3.4-5 6.5-5C17.6 4 21 7.4 21 11.5S17.6 19 13.5 19z"/></svg>',
  },
  {
    id: 'rh', label: 'Humid', field: 'rh', unit: '%', min: 0, max: 100,
    stops: RH, ticks: [0, 25, 50, 75, 100], particles: false, alpha: 0.6,
    ico: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/></svg>',
  },
  {
    id: 'press', label: 'Press', field: 'press', unit: 'hPa', min: 970, max: 1050,
    stops: PRESS, ticks: [970, 990, 1010, 1030, 1050], particles: false, alpha: 0.62, isobars: true,
    ico: '<svg viewBox="0 0 24 24"><path d="M4 15a8 8 0 1116 0"/><path d="M12 15l4.5-4.5"/></svg>',
  },
];

/* attach lazily-built LUTs */
for (const L of LAYERS) {
  let lut = null;
  Object.defineProperty(L, 'lut', { get() { return (lut ||= buildLUT(L.stops, L.min, L.max)); } });
  L.gradient = () => cssGradient(L.stops, L.min, L.max);
  /* rain is perceptually log-ish: spread the low end over more of the bar */
  L.norm = L.log
    ? (v) => clamp(Math.log10(1 + Math.max(v, 0) * 9) / Math.log10(1 + L.max * 9), 0, 1)
    : (v) => clamp((v - L.min) / (L.max - L.min), 0, 1);
}

export const layerById = (id) => LAYERS.find((l) => l.id === id) || LAYERS[0];

/* colour for a single value → 'rgba(...)' (used by legends, probes, meteogram) */
export function colorOf(layer, v) {
  const lut = layer.lut;
  const i = Math.round(layer.norm(v) * 511) * 4;
  return `rgba(${lut[i]},${lut[i + 1]},${lut[i + 2]},${(lut[i + 3] / 255).toFixed(3)})`;
}

/* standalone temperature colour — used by the meteogram curve */
const TEMP_LUT = buildLUT(TEMP, -40, 45);
export function tempColor(c) {
  const i = Math.round(clamp((c + 40) / 85, 0, 1) * 511) * 4;
  return `rgb(${TEMP_LUT[i]},${TEMP_LUT[i + 1]},${TEMP_LUT[i + 2]})`;
}
const WIND_LUT = buildLUT(WIND, 0, 140);
export function windColor(kmh) {
  const i = Math.round(clamp(kmh / 140, 0, 1) * 511) * 4;
  return `rgb(${WIND_LUT[i]},${WIND_LUT[i + 1]},${WIND_LUT[i + 2]})`;
}
