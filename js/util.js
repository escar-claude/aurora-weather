/* ============================================================
   util.js — helpers, WMO code table, weather icons, formatting
   ============================================================ */
'use strict';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const pad = (n) => String(n).padStart(2, '0');

/* Open-Meteo hourly/daily strings are LOCAL wall-clock ISO with no zone.
   We parse them as UTC and always read them back with getUTC* so the
   browser's own timezone is never applied twice. */
export const parseLocalISO = (s) => new Date(s.length <= 10 ? `${s}T00:00:00Z` : `${s}:00Z`);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const hhmm = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

/* ---------- WMO weather code table ---------- */
export const WMO = {
  0:  { t: 'Clear sky',              s: 'Clear',    icon: 'clear',   scene: 'sunny' },
  1:  { t: 'Mainly clear',           s: 'Clear-ish', icon: 'partly', scene: 'sunny' },
  2:  { t: 'Partly cloudy',          s: 'Partly',   icon: 'partly',  scene: 'sunny' },
  3:  { t: 'Overcast',               s: 'Overcast', icon: 'cloud',   scene: 'wind'  },
  45: { t: 'Fog',                    s: 'Fog',      icon: 'fog',     scene: 'wind'  },
  48: { t: 'Depositing rime fog',    s: 'Rime fog', icon: 'fog',     scene: 'wind'  },
  51: { t: 'Light drizzle',          s: 'Drizzle',  icon: 'drizzle', scene: 'rain'  },
  53: { t: 'Moderate drizzle',       s: 'Drizzle',  icon: 'drizzle', scene: 'rain'  },
  55: { t: 'Dense drizzle',          s: 'Drizzle',  icon: 'drizzle', scene: 'rain'  },
  56: { t: 'Freezing drizzle',       s: 'Frz drizzle', icon: 'drizzle', scene: 'rain' },
  57: { t: 'Dense freezing drizzle', s: 'Frz drizzle', icon: 'drizzle', scene: 'rain' },
  61: { t: 'Slight rain',            s: 'Light rain', icon: 'rain',  scene: 'rain'  },
  63: { t: 'Moderate rain',          s: 'Rain',     icon: 'rain',    scene: 'rain'  },
  65: { t: 'Heavy rain',             s: 'Heavy rain', icon: 'rain',  scene: 'rain'  },
  66: { t: 'Freezing rain',          s: 'Frz rain', icon: 'rain',    scene: 'rain'  },
  67: { t: 'Heavy freezing rain',    s: 'Frz rain', icon: 'rain',    scene: 'rain'  },
  71: { t: 'Light snow',             s: 'Light snow', icon: 'snow',  scene: 'snow'  },
  73: { t: 'Moderate snow',          s: 'Snow',     icon: 'snow',    scene: 'snow'  },
  75: { t: 'Heavy snowfall',         s: 'Heavy snow', icon: 'snow',  scene: 'snow'  },
  77: { t: 'Snow grains',            s: 'Snow grains', icon: 'snow', scene: 'snow'  },
  80: { t: 'Rain showers',           s: 'Showers',  icon: 'rain',    scene: 'rain'  },
  81: { t: 'Moderate rain showers',  s: 'Showers',  icon: 'rain',    scene: 'rain'  },
  82: { t: 'Violent rain showers',   s: 'Downpour', icon: 'rain',    scene: 'rain'  },
  85: { t: 'Snow showers',           s: 'Snow showers', icon: 'snow', scene: 'snow' },
  86: { t: 'Heavy snow showers',     s: 'Snow showers', icon: 'snow', scene: 'snow' },
  95: { t: 'Thunderstorm',           s: 'Storm',    icon: 'thunder', scene: 'rain'  },
  96: { t: 'Thunderstorm with hail', s: 'Storm/hail', icon: 'thunder', scene: 'rain' },
  99: { t: 'Severe thunderstorm',    s: 'Severe storm', icon: 'thunder', scene: 'rain' },
};
export const codeInfo = (c) => WMO[c] || { t: '—', s: '—', icon: 'cloud', scene: 'wind' };

/* ---------- SVG weather icons ---------- */
export function icon(key, night = false) {
  const cloud = `<path class="wc-cloud" d="M28 62c-9 0-16-7-16-16 0-8 6-15 14-16 3-9 11-15 21-15 12 0 22 9 23 21 8 1 14 7 14 15 0 9-7 16-16 16z"/>`;
  const sun = (cx, cy, r) => {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      rays += `<line class="wc-ray" x1="${cx + Math.cos(a) * (r + 5)}" y1="${cy + Math.sin(a) * (r + 5)}" x2="${cx + Math.cos(a) * (r + 13)}" y2="${cy + Math.sin(a) * (r + 13)}"/>`;
    }
    return `<circle class="wc-sun" cx="${cx}" cy="${cy}" r="${r}"/>${rays}`;
  };
  const moon = (cx, cy, r) => `<path class="wc-moon" d="M${cx + r} ${cy}a${r} ${r} 0 1 1-${r * 1.15}-${r * 0.95}a${r * 0.8} ${r * 0.8} 0 0 0 ${r * 1.15} ${r * 0.95}z"/>`;
  const flake = (x, y) => `<g class="wc-flake" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="3.2"/></g>`;
  const drop = (x, y) => `<line class="wc-drop" x1="${x}" y1="${y}" x2="${x - 4}" y2="${y + 12}"/>`;

  let body = '';
  switch (key) {
    case 'clear':   body = night ? moon(50, 44, 24) : sun(50, 44, 20); break;
    case 'partly':  body = (night ? moon(38, 34, 16) : sun(38, 34, 15)) + cloud; break;
    case 'cloud':   body = cloud; break;
    case 'fog':     body = cloud + `<line class="wc-fog" x1="18" y1="74" x2="82" y2="74"/><line class="wc-fog" x1="26" y1="84" x2="74" y2="84"/>`; break;
    case 'drizzle': body = cloud + drop(38, 70) + drop(58, 70); break;
    case 'rain':    body = cloud + drop(34, 70) + drop(48, 70) + drop(62, 70); break;
    case 'snow':    body = cloud + flake(36, 76) + flake(50, 82) + flake(64, 76); break;
    case 'thunder': body = cloud + `<path class="wc-bolt" d="M50 66l-10 16h8l-4 14 16-20h-9l6-10z"/>`; break;
    default:        body = cloud;
  }
  return `<svg viewBox="0 0 100 100" class="wc wc--${key}" aria-hidden="true">${body}</svg>`;
}

/* ---------- dimensional hero icon ----------
   Same geometry and animation classes as icon(), but emits gradient <defs>,
   a ground-shadow ellipse and a specular gloss on the sun. Used only for the
   large current-conditions icon; forecast rows keep the flat icon(). */
export function heroIcon(key, night = false) {
  const defs = `<defs>
    <radialGradient id="hg-sun" cx="40%" cy="34%" r="72%">
      <stop offset="0" stop-color="#fff7db"/><stop offset="52%" stop-color="#ffd166"/><stop offset="100%" stop-color="#ff9c3e"/>
    </radialGradient>
    <linearGradient id="hg-cloud" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f7ff"/><stop offset="55%" stop-color="#cfd9f1"/><stop offset="100%" stop-color="#9db0d4"/>
    </linearGradient>
    <radialGradient id="hg-moon" cx="38%" cy="33%" r="74%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="58%" stop-color="#dde5fc"/><stop offset="100%" stop-color="#aebbe2"/>
    </radialGradient>
    <radialGradient id="hg-ground" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset="68%" stop-color="#000" stop-opacity=".16"/><stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
  const ground = `<ellipse class="wc-ground" cx="50" cy="91" rx="30" ry="6"/>`;
  const cloud = `<path class="wc-cloud" d="M28 62c-9 0-16-7-16-16 0-8 6-15 14-16 3-9 11-15 21-15 12 0 22 9 23 21 8 1 14 7 14 15 0 9-7 16-16 16z"/>`;
  const sun = (cx, cy, r) => {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      rays += `<line class="wc-ray" x1="${cx + Math.cos(a) * (r + 5)}" y1="${cy + Math.sin(a) * (r + 5)}" x2="${cx + Math.cos(a) * (r + 14)}" y2="${cy + Math.sin(a) * (r + 14)}"/>`;
    }
    return `${rays}<circle class="wc-sun" cx="${cx}" cy="${cy}" r="${r}"/><circle class="wc-gloss" cx="${(cx - r * 0.34).toFixed(1)}" cy="${(cy - r * 0.36).toFixed(1)}" r="${(r * 0.34).toFixed(1)}"/>`;
  };
  const moon = (cx, cy, r) => `<path class="wc-moon" d="M${cx + r} ${cy}a${r} ${r} 0 1 1-${r * 1.15}-${r * 0.95}a${r * 0.8} ${r * 0.8} 0 0 0 ${r * 1.15} ${r * 0.95}z"/>`;
  const flake = (x, y) => `<g class="wc-flake" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="3.4"/></g>`;
  const drop = (x, y) => `<line class="wc-drop" x1="${x}" y1="${y}" x2="${x - 4}" y2="${y + 12}"/>`;

  let body = '';
  switch (key) {
    case 'clear':   body = night ? moon(50, 44, 23) : sun(50, 44, 20); break;
    case 'partly':  body = (night ? moon(38, 34, 15) : sun(38, 34, 15)) + cloud; break;
    case 'cloud':   body = cloud; break;
    case 'fog':     body = cloud + `<line class="wc-fog" x1="18" y1="74" x2="82" y2="74"/><line class="wc-fog" x1="26" y1="84" x2="74" y2="84"/>`; break;
    case 'drizzle': body = cloud + drop(38, 70) + drop(58, 70); break;
    case 'rain':    body = cloud + drop(34, 70) + drop(48, 70) + drop(62, 70); break;
    case 'snow':    body = cloud + flake(36, 76) + flake(50, 82) + flake(64, 76); break;
    case 'thunder': body = cloud + `<path class="wc-bolt" d="M50 66l-10 16h8l-4 14 16-20h-9l6-10z"/>`; break;
    default:        body = cloud;
  }
  return `<svg viewBox="0 0 100 100" class="wc wc--${key} wc--hero" aria-hidden="true">${defs}${ground}${body}</svg>`;
}

/* ---------- descriptors ---------- */
const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => COMPASS16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

export const uvLevel = (u) => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';
export const visLevel = (km) => km < 1 ? 'Poor' : km < 4 ? 'Moderate' : km < 10 ? 'Good' : 'Excellent';
export const aqiLevel = (a) => a == null ? 'unavailable' : a <= 20 ? 'Good' : a <= 40 ? 'Fair' : a <= 60 ? 'Moderate' : a <= 80 ? 'Poor' : a <= 100 ? 'Very poor' : 'Extremely poor';
export const aqiTone = (a) => a == null ? 'na' : a <= 20 ? 'good' : a <= 40 ? 'fair' : a <= 60 ? 'mod' : a <= 80 ? 'poor' : 'bad';

/* Beaufort — the descriptor pros actually use */
const BEAUFORT = [
  [1, 0, 'Calm'], [6, 1, 'Light air'], [12, 2, 'Light breeze'], [20, 3, 'Gentle breeze'],
  [29, 4, 'Moderate breeze'], [39, 5, 'Fresh breeze'], [50, 6, 'Strong breeze'], [62, 7, 'Near gale'],
  [75, 8, 'Gale'], [89, 9, 'Strong gale'], [103, 10, 'Storm'], [118, 11, 'Violent storm'],
];
export function beaufort(kmh) {
  for (const [max, n, name] of BEAUFORT) if (kmh < max) return { n, name };
  return { n: 12, name: 'Hurricane force' };
}

/* ---------- moon phase (Conway-style approximation, good to ~1 day) ---------- */
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const known = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
  const days = (date.getTime() - known) / 86400000;
  const age = ((days % synodic) + synodic) % synodic;
  const frac = age / synodic;                       // 0 = new, .5 = full
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
                 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const i = Math.floor((frac + 1 / 16) * 8) % 8;
  return { age, frac, illum, name: names[i], waxing: frac < 0.5 };
}

/* ---------- unit conversion ---------- */
export const c2f = (c) => c * 9 / 5 + 32;
export const WIND_UNITS = {
  'km/h': { k: 1,        d: 0 },
  'm/s':  { k: 1 / 3.6,  d: 1 },
  'mph':  { k: 0.621371, d: 0 },
  'kt':   { k: 0.539957, d: 0 },
};

/* ---------- DOM ---------- */
export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (m) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
