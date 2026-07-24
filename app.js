/* ============================================================
   Aurora Weather — live cosmic weather dashboard
   Data: Open-Meteo (free, no API key required)
   ============================================================ */
'use strict';

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pad = (n) => String(n).padStart(2, '0');

/* ---------- WMO weather code map ---------- */
const WMO = {
  0:  { t: 'Clear sky',                 icon: 'clear',   scene: 'sunny' },
  1:  { t: 'Mainly clear',              icon: 'partly',  scene: 'sunny' },
  2:  { t: 'Partly cloudy',             icon: 'partly',  scene: 'sunny' },
  3:  { t: 'Overcast',                  icon: 'cloud',   scene: 'wind'  },
  45: { t: 'Fog',                       icon: 'fog',     scene: 'wind'  },
  48: { t: 'Depositing rime fog',       icon: 'fog',     scene: 'wind'  },
  51: { t: 'Light drizzle',             icon: 'drizzle', scene: 'rain'  },
  53: { t: 'Moderate drizzle',          icon: 'drizzle', scene: 'rain'  },
  55: { t: 'Dense drizzle',             icon: 'drizzle', scene: 'rain'  },
  56: { t: 'Freezing drizzle',          icon: 'drizzle', scene: 'rain'  },
  57: { t: 'Dense freezing drizzle',    icon: 'drizzle', scene: 'rain'  },
  61: { t: 'Slight rain',               icon: 'rain',    scene: 'rain'  },
  63: { t: 'Moderate rain',             icon: 'rain',    scene: 'rain'  },
  65: { t: 'Heavy rain',                icon: 'rain',    scene: 'rain'  },
  66: { t: 'Freezing rain',             icon: 'rain',    scene: 'rain'  },
  67: { t: 'Heavy freezing rain',       icon: 'rain',    scene: 'rain'  },
  71: { t: 'Light snow',                icon: 'snow',    scene: 'snow'  },
  73: { t: 'Moderate snow',             icon: 'snow',    scene: 'snow'  },
  75: { t: 'Snowfall and snow accumulation on the ground', icon: 'snow', scene: 'snow' },
  77: { t: 'Snow grains',               icon: 'snow',    scene: 'snow'  },
  80: { t: 'Rain showers',              icon: 'rain',    scene: 'rain'  },
  81: { t: 'Moderate rain showers',     icon: 'rain',    scene: 'rain'  },
  82: { t: 'Violent rain showers',      icon: 'rain',    scene: 'rain'  },
  85: { t: 'Snow showers',              icon: 'snow',    scene: 'snow'  },
  86: { t: 'Heavy snow showers',        icon: 'snow',    scene: 'snow'  },
  95: { t: 'Thunderstorm',              icon: 'thunder', scene: 'rain'  },
  96: { t: 'Thunderstorm with hail',    icon: 'thunder', scene: 'rain'  },
  99: { t: 'Severe thunderstorm',       icon: 'thunder', scene: 'rain'  },
};
const codeInfo = (c) => WMO[c] || { t: '—', icon: 'cloud', scene: 'wind' };
const shortCond = (c) => {
  const m = codeInfo(c).t;
  return m.length > 16 ? ({ snow: 'Snow', rain: 'Rain', drizzle: 'Drizzle', cloud: 'Cloudy', fog: 'Fog', partly: 'Partly cloudy', clear: 'Clear', thunder: 'Storm' })[codeInfo(c).icon] : m;
};

/* ---------- SVG weather icons ---------- */
function icon(key, night = false) {
  const cloud = `<path class="wc-cloud" d="M28 62c-9 0-16-7-16-16 0-8 6-15 14-16 3-9 11-15 21-15 12 0 22 9 23 21 8 1 14 7 14 15 0 9-7 16-16 16z"/>`;
  const sun = (cx, cy, r) => {
    let rays = '';
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; rays += `<line class="wc-ray" x1="${cx + Math.cos(a) * (r + 5)}" y1="${cy + Math.sin(a) * (r + 5)}" x2="${cx + Math.cos(a) * (r + 13)}" y2="${cy + Math.sin(a) * (r + 13)}"/>`; }
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
  return `<svg viewBox="0 0 100 100" class="wc wc--${key}">${body}</svg>`;
}

/* ---------- direction / descriptors ---------- */
const COMPASS = ['North', 'North-northeast', 'Northeast', 'East-northeast', 'East', 'East-southeast', 'Southeast', 'South-southeast', 'South', 'South-southwest', 'Southwest', 'West-southwest', 'West', 'West-northwest', 'Northwest', 'North-northwest'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) / 22.5)) % 16];
const uvLevel = (u) => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';
const visLevel = (km) => km < 1 ? 'Poor' : km < 4 ? 'Moderate' : km < 10 ? 'Good' : 'Excellent';
const pressureLevel = (p) => p >= 1020 ? 'High pressure and stability' : p <= 1000 ? 'Low pressure system' : 'Normal and stable';
const aqiLevel = (a) => a <= 20 ? 'excellent' : a <= 40 ? 'fair' : a <= 60 ? 'moderate' : a <= 80 ? 'poor' : a <= 100 ? 'very poor' : 'hazardous';

/* ---------- state ---------- */
const state = {
  place: { name: 'Cardiff', region: 'Wales, UK', lat: 51.4816, lon: -3.1791 },
  unit: localStorage.getItem('aw_unit') || 'C',
  offsetSec: 0,
  data: null,
  autoScene: 'snow',
  manualScene: null,
};

const toC2F = (c) => c * 9 / 5 + 32;
const showTemp = (c, withUnit = false) => {
  if (c == null || Number.isNaN(c)) return '--';
  const v = state.unit === 'F' ? toC2F(c) : c;
  return Math.round(v) + (withUnit ? `°${state.unit}` : '');
};

/* ============================================================
   DATA
   ============================================================ */
async function geocode(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('geocode');
  const j = await r.json();
  return j.results || [];
}

async function loadWeather() {
  const { lat, lon } = state.place;
  const base = 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,visibility,dew_point_2m,uv_index',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
    timezone: 'auto', forecast_days: '7', wind_speed_unit: 'kmh',
  });
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi&timezone=auto`;

  const [wRes, aRes] = await Promise.allSettled([
    fetch(`${base}?${params}`).then(r => r.json()),
    fetch(aqUrl).then(r => r.json()),
  ]);
  if (wRes.status !== 'fulfilled') throw new Error('weather fetch failed');
  const w = wRes.value;
  w.aqi = aRes.status === 'fulfilled' ? aRes.value?.current?.european_aqi : null;
  state.data = w;
  state.offsetSec = w.utc_offset_seconds || 0;
  return w;
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  const w = state.data;
  if (!w) return;
  const cur = w.current, d = w.daily, h = w.hourly;
  const info = codeInfo(cur.weather_code);
  const night = cur.is_day === 0;

  // header / place
  $('#cityName').textContent = state.place.name;
  $('#cityRegion').textContent = state.place.region;

  // current
  $('#currentIcon').innerHTML = icon(info.icon, night);
  $('#tempNow').textContent = showTemp(cur.temperature_2m);
  $('.temp sup').textContent = `°${state.unit}`;
  $('#descNow').textContent = info.t;
  $('#feelsLike').textContent = showTemp(cur.apparent_temperature, true);
  $('#precipProb').textContent = (h.precipitation_probability?.[nowHourIndex()] ?? d.precipitation_probability_max?.[0] ?? 0) + '%';
  $('#cloudCover').textContent = Math.round(cur.cloud_cover) + '%';

  // alert
  renderAlert(cur);

  // stat cards
  renderStats(cur, w.aqi);

  // sun track
  renderSun(d.sunrise[0], d.sunset[0]);

  // trend + forecast
  renderTrend(h, cur);
  renderForecast(d);

  // scene
  state.autoScene = info.scene;
  applyScene(state.manualScene || info.scene);

  document.body.classList.remove('loading');
}

function nowHourIndex() {
  const h = state.data?.hourly;
  if (!h) return 0;
  const nowMs = Date.now() + state.offsetSec * 1000;
  const nowHour = new Date(nowMs).setUTCMinutes(0, 0, 0);
  let idx = h.time.findIndex(t => {
    // hourly times are local wall-clock ISO (no Z); compare as UTC
    return new Date(t + ':00Z').getTime() >= nowHour;
  });
  return idx < 0 ? 0 : idx;
}

function renderAlert(cur) {
  const el = $('#alert'), txt = $('#alertText');
  const feels = cur.apparent_temperature, wind = cur.wind_speed_10m, code = cur.weather_code;
  let msg = '';
  if (feels <= -3) msg = `The wind chill is as low as <b>${showTemp(feels, true)}</b>, so please dress warmly. Road surfaces may be icy — wear non-slip shoes.`;
  else if ([71, 73, 75, 77, 85, 86].includes(code)) msg = `Snowfall in progress. Roads may be slippery — allow extra travel time.`;
  else if ([65, 82, 95, 96, 99].includes(code)) msg = `Heavy precipitation expected. Carry an umbrella and avoid low-lying areas.`;
  else if (wind >= 40) msg = `Strong winds up to <b>${Math.round(wind)} km/h</b>. Secure loose objects outdoors.`;
  else if (feels >= 32) msg = `Feels like <b>${showTemp(feels, true)}</b>. Stay hydrated and avoid prolonged sun exposure.`;
  if (msg) { txt.innerHTML = msg; el.hidden = false; } else { el.hidden = true; }
}

function statCard({ ico, label, value, unit, sub, pct }) {
  return `<div class="card">
    <div class="card__head">${ico}<span class="card__label">${label}</span></div>
    <div class="card__val"><b>${value}</b>${unit ? `<small>${unit}</small>` : ''}</div>
    <div class="card__sub">${sub}</div>
    <div class="card__bar"><i style="width:${clamp(pct * 100, 3, 100)}%"></i></div>
  </div>`;
}
const I = {
  hum: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/></svg>',
  wind: '<svg viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 100-6M3 16h15a3 3 0 110 6M3 12h9"/></svg>',
  uv: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
  aqi: '<svg viewBox="0 0 24 24"><path d="M3 12h6a3 3 0 100-6M3 17h11a3 3 0 110 6M14 7h2a3 3 0 100-4"/></svg>',
  press: '<svg viewBox="0 0 24 24"><path d="M4 14a8 8 0 1116 0"/><path d="M12 14l4-4"/></svg>',
  vis: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
};
function renderStats(cur, aqi) {
  const hum = Math.round(cur.relative_humidity_2m);
  const wind = Math.round(cur.wind_speed_10m);
  const uv = cur.uv_index ?? 0;
  const press = Math.round(cur.pressure_msl);
  const visKm = (cur.visibility ?? 0) / 1000;
  const cards = [
    statCard({ ico: I.hum, label: 'Humidity', value: hum, unit: '%', sub: `Dew point ${showTemp(cur.dew_point_2m, true)}`, pct: hum / 100 }),
    statCard({ ico: I.wind, label: 'Wind speed', value: wind, unit: 'km/h', sub: `${compass(cur.wind_direction_10m)} wind, ${Math.round(cur.wind_direction_10m)}°`, pct: wind / 60 }),
    statCard({ ico: I.uv, label: 'Ultraviolet rays', value: Math.round(uv), unit: 'UVI', sub: uvLevel(uv), pct: uv / 11 }),
    statCard({ ico: I.aqi, label: 'Air quality', value: aqi ?? '—', unit: 'AQI', sub: aqi != null ? aqiLevel(aqi) : 'unavailable', pct: (aqi ?? 0) / 100 }),
    statCard({ ico: I.press, label: 'Air pressure', value: press, unit: 'hPa', sub: pressureLevel(press), pct: clamp((press - 980) / 60, 0, 1) }),
    statCard({ ico: I.vis, label: 'Visibility', value: Math.round(visKm), unit: 'km', sub: visLevel(visKm), pct: visKm / 20 }),
  ];
  $('#stats').innerHTML = cards.join('');
  // animate bars in
  requestAnimationFrame(() => $$('.card__bar i').forEach(el => { const w = el.style.width; el.style.width = '0'; requestAnimationFrame(() => el.style.width = w); }));
}

/* ---------- sun track ---------- */
function fmtTime(iso) {
  const d = new Date(iso + ':00Z');
  const ms = d.getTime();
  const local = new Date(ms); // iso already local wall-clock
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}
function renderSun(sunriseISO, sunsetISO) {
  const rise = new Date(sunriseISO + ':00Z').getTime();
  const set = new Date(sunsetISO + ':00Z').getTime();
  const nowLocal = Date.now() + state.offsetSec * 1000;
  const frac = clamp((nowLocal - rise) / (set - rise), 0, 1);

  const W = 320, H = 150, mx = 18, baseY = H - 18, amp = H - 40;
  const pt = (t) => [mx + t * (W - 2 * mx), baseY - Math.sin(Math.PI * t) * amp];
  const sample = (a, b) => { let p = ''; for (let i = 0; i <= 40; i++) { const t = a + (b - a) * i / 40; const [x, y] = pt(t); p += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); } return p; };
  const [sx, sy] = pt(frac);

  $('#sunArc').innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="sunGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff9a5a"/><stop offset="0.5" stop-color="#ffd18a"/><stop offset="1" stop-color="#6fa8ff"/>
    </linearGradient>
    <radialGradient id="sunGlow"><stop offset="0" stop-color="#ffe4bd"/><stop offset="1" stop-color="#ff9a5a" stop-opacity="0"/></radialGradient></defs>
    <line x1="${mx}" y1="${baseY}" x2="${W - mx}" y2="${baseY}" stroke="rgba(150,175,220,.14)" stroke-width="1"/>
    <path d="${sample(0, 1)}" fill="none" stroke="rgba(150,175,220,.16)" stroke-width="2" stroke-dasharray="3 5"/>
    <path d="${sample(0, frac)}" fill="none" stroke="url(#sunGrad)" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="${sx}" cy="${sy}" r="26" fill="url(#sunGlow)"/>
    <circle cx="${sx}" cy="${sy}" r="7" fill="#ffe1b0"/>
    <circle cx="${sx}" cy="${sy}" r="7" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>
  </svg>`;

  $('#sunrise').textContent = fmtTime(sunriseISO);
  $('#sunset').textContent = fmtTime(sunsetISO);
  const noonMs = (rise + set) / 2;
  $('#noon').textContent = `${pad(new Date(noonMs).getUTCHours())}:${pad(new Date(noonMs).getUTCMinutes())}`;

  const mins = Math.round((set - rise) / 60000);
  $('#dayLen').textContent = `Total length ${Math.floor(mins / 60)} hours ${mins % 60} min`;
  $('#dayPct').textContent = `${Math.round(frac * 100)}% complete`;
}

/* ---------- 24-hour trend ---------- */
function renderTrend(h, cur) {
  const start = nowHourIndex();
  const N = 24;
  const idx = Array.from({ length: N }, (_, i) => Math.min(start + i, h.time.length - 1));
  const temps = idx.map(i => h.temperature_2m[i]);
  const probs = idx.map(i => h.precipitation_probability?.[i] ?? 0);
  const times = idx.map(i => h.time[i].slice(11, 16));

  const W = 640, H = 200, padX = 8, padT = 26, padB = 34;
  const min = Math.min(...temps), max = Math.max(...temps);
  const span = (max - min) || 1;
  const x = (i) => padX + i * (W - 2 * padX) / (N - 1);
  const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);

  let line = '', area = '', dots = '', bars = '', labels = '';
  temps.forEach((v, i) => {
    const px = x(i), py = y(v);
    line += (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
    if (i === 0) area = `M${px} ${H - padB} L${px} ${py.toFixed(1)}`; else area += `L${px.toFixed(1)} ${py.toFixed(1)}`;
    // precipitation bar
    const bh = (probs[i] / 100) * (H - padT - padB);
    if (probs[i] > 4) bars += `<rect x="${(px - 3).toFixed(1)}" y="${(H - padB - bh).toFixed(1)}" width="6" height="${bh.toFixed(1)}" rx="2" fill="rgba(127,178,255,.16)"/>`;
    if (i % 3 === 0 || i === N - 1) {
      dots += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="#0a1020" stroke="#a9c8ff" stroke-width="1.6"/>`;
      labels += `<text x="${px.toFixed(1)}" y="${py - 11}" text-anchor="middle" class="tr-temp">${showTemp(v)}°</text>`;
      labels += `<text x="${px.toFixed(1)}" y="${H - 16}" text-anchor="middle" class="tr-time">${times[i]}</text>`;
      labels += `<text x="${px.toFixed(1)}" y="${H - 4}" text-anchor="middle" class="tr-prob">${probs[i]}%</text>`;
    }
  });
  area += `L${x(N - 1)} ${H - padB} Z`;

  $('#trendChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="trGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fb2ff" stop-opacity=".35"/><stop offset="1" stop-color="#7fb2ff" stop-opacity="0"/>
    </linearGradient></defs>
    <style>.tr-temp{fill:#eaf0ff;font-size:12px;font-weight:600}.tr-time{fill:#6b7a99;font-size:10px}.tr-prob{fill:#5f6f90;font-size:9px}</style>
    ${bars}
    <path d="${area}" fill="url(#trGrad)"/>
    <path d="${line}" fill="none" stroke="#a9c8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg>`;
  $('#trendRange').textContent = `Highest ${showTemp(max)}° · Lowest ${showTemp(min)}°`;
}

/* ---------- 7-day forecast ---------- */
function renderForecast(d) {
  const weekMin = Math.min(...d.temperature_2m_min);
  const weekMax = Math.max(...d.temperature_2m_max);
  const wspan = (weekMax - weekMin) || 1;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let html = '';
  d.time.forEach((t, i) => {
    const dt = new Date(t + 'T00:00:00Z');
    const label = i === 0 ? 'today' : days[dt.getUTCDay()];
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i];
    const left = ((lo - weekMin) / wspan) * 100;
    const width = Math.max(((hi - lo) / wspan) * 100, 6);
    html += `<li class="frow ${i === 0 ? 'today' : ''}">
      <span class="fday">${label}</span>
      <span class="fico">${icon(codeInfo(d.weather_code[i]).icon)}</span>
      <span class="fbar" title="${showTemp(lo)}° – ${showTemp(hi)}°"><i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></span>
      <span class="fmax">${showTemp(hi)}°<span class="fmin"> / ${showTemp(lo)}°</span></span>
      <span class="fcond">${shortCond(d.weather_code[i])}</span>
    </li>`;
  });
  $('#forecastList').innerHTML = html;
  $('#weekRange').textContent = `Range ${showTemp(weekMin)}° ~ ${showTemp(weekMax)}°`;
}

/* ============================================================
   CLOCK
   ============================================================ */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function tickClock() {
  const d = new Date(Date.now() + state.offsetSec * 1000);
  $('#clock').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  $('#date').textContent = `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/* ============================================================
   BACKGROUND — starfield + weather particles
   ============================================================ */
const sky = $('#sky');
const ctx = sky.getContext('2d');
let stars = [], parts = [], scene = 'snow', W = 0, H = 0, dpr = 1;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = sky.width = innerWidth * dpr; H = sky.height = innerHeight * dpr;
  sky.style.width = innerWidth + 'px'; sky.style.height = innerHeight + 'px';
  buildStars(); buildParts();
}
function buildStars() {
  const n = Math.round((innerWidth * innerHeight) / 9000);
  stars = Array.from({ length: n }, () => ({
    x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 1.1 + 0.3) * dpr,
    a: Math.random() * 0.6 + 0.2, tw: Math.random() * 0.02 + 0.004, ph: Math.random() * 6,
  }));
}
const SCENE_CFG = {
  snow:  { n: 130, color: 'rgba(255,255,255,', vy: [0.4, 1.3], vx: [-0.3, 0.3], size: [1.4, 3.2], shape: 'flake', drift: 0.7 },
  rain:  { n: 200, color: 'rgba(150,190,255,', vy: [6, 11], vx: [-1.6, -0.8], size: [7, 14], shape: 'streak', drift: 0 },
  wind:  { n: 90, color: 'rgba(200,215,245,', vy: [-0.2, 0.2], vx: [3, 7], size: [10, 26], shape: 'gust', drift: 0 },
  sunny: { n: 46, color: 'rgba(255,225,170,', vy: [-0.5, -0.1], vx: [-0.2, 0.2], size: [1.2, 2.6], shape: 'mote', drift: 0.4 },
};
function rand([a, b]) { return a + Math.random() * (b - a); }
function buildParts() {
  const c = SCENE_CFG[scene];
  parts = Array.from({ length: reduced ? Math.round(c.n / 3) : c.n }, () => spawn(c, true));
}
function spawn(c, anywhere) {
  return {
    x: Math.random() * W,
    y: anywhere ? Math.random() * H : (c.shape === 'mote' ? H + 10 : -20 * dpr),
    vx: rand(c.vx) * dpr, vy: rand(c.vy) * dpr, s: rand(c.size) * dpr,
    a: Math.random() * 0.5 + 0.35, ph: Math.random() * 6,
  };
}
function draw() {
  ctx.clearRect(0, 0, W, H);
  const t = performance.now() / 1000;
  // stars
  for (const s of stars) {
    const a = s.a * (0.6 + 0.4 * Math.sin(t * s.tw * 60 + s.ph));
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fillStyle = `rgba(210,225,255,${a})`; ctx.fill();
  }
  const c = SCENE_CFG[scene];
  for (const p of parts) {
    p.x += p.vx + (c.drift ? Math.sin(t + p.ph) * c.drift * dpr : 0);
    p.y += p.vy;
    if (c.shape === 'streak') {
      ctx.strokeStyle = c.color + p.a + ')'; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.4, p.y - p.s); ctx.stroke();
    } else if (c.shape === 'gust') {
      ctx.strokeStyle = c.color + (p.a * 0.5) + ')'; ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.s, p.y - p.s * 0.15); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 0.5, 0, 7);
      ctx.fillStyle = c.color + p.a + ')'; ctx.fill();
    }
    // recycle
    const off = p.y > H + 20 || p.x < -30 || p.x > W + 30 || (c.shape === 'mote' && p.y < -20);
    if (off) Object.assign(p, spawn(c, false));
  }
  raf = requestAnimationFrame(draw);
}
let raf;
function applyScene(name) {
  if (!SCENE_CFG[name]) name = 'snow';
  scene = name;
  document.body.dataset.scene = name;
  $$('#scenes button').forEach(b => b.classList.toggle('active', b.dataset.scene === name));
  buildParts();
}

/* ============================================================
   SEARCH
   ============================================================ */
let searchTimer;
function initSearch() {
  const btn = $('#cityBtn'), box = $('#searchBox'), input = $('#searchInput'), results = $('#searchResults');
  const open = () => { box.hidden = false; btn.setAttribute('aria-expanded', 'true'); input.focus(); };
  const close = () => { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); results.innerHTML = ''; input.value = ''; };
  btn.addEventListener('click', () => box.hidden ? open() : close());
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
      try {
        const list = await geocode(q);
        results.innerHTML = list.map((r, i) =>
          `<li role="option" data-i="${i}"><b>${r.name}</b> <span>${[r.admin1, r.country].filter(Boolean).join(', ')}</span></li>`
        ).join('');
        results._list = list;
      } catch { results.innerHTML = ''; }
    }, 260);
  });
  results.addEventListener('click', (e) => {
    const li = e.target.closest('li'); if (!li) return;
    const r = results._list[+li.dataset.i];
    state.place = { name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude };
    state.manualScene = null; // let the new city show its real-weather ambiance
    close();
    refresh();
  });
  document.addEventListener('click', (e) => { if (!box.hidden && !box.contains(e.target) && !btn.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ============================================================
   CONTROLS
   ============================================================ */
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(el._t); el._t = setTimeout(() => el.hidden = true, 2200);
}
function initControls() {
  $('#scenes').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.manualScene = b.dataset.scene;
    applyScene(b.dataset.scene);
  });
  $('#refreshBtn').addEventListener('click', (e) => {
    e.currentTarget.classList.add('spin');
    setTimeout(() => e.currentTarget.classList.remove('spin'), 800);
    refresh();
  });
  $('#settingsBtn').addEventListener('click', () => {
    state.unit = state.unit === 'C' ? 'F' : 'C';
    localStorage.setItem('aw_unit', state.unit);
    render();
    toast(`Units: °${state.unit}`);
  });
  $('#soundBtn').addEventListener('click', (e) => toggleSound(e.currentTarget));
}

/* ---------- ambient sound (WebAudio, generated) ---------- */
let audio;
function toggleSound(btn) {
  if (!audio) audio = { ctx: null, src: null, gain: null, on: false };
  if (audio.on) { audio.gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + 0.4); audio.on = false; btn.setAttribute('aria-pressed', 'false'); btn.style.color = ''; toast('Ambient sound off'); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audio.ctx = audio.ctx || new AC();
    const c = audio.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = c.createBiquadFilter();
    filt.type = scene === 'rain' ? 'bandpass' : 'lowpass';
    filt.frequency.value = scene === 'rain' ? 1400 : scene === 'wind' ? 500 : 320;
    const gain = c.createGain(); gain.gain.value = 0.0001;
    src.connect(filt); filt.connect(gain); gain.connect(c.destination);
    src.start();
    gain.gain.exponentialRampToValueAtTime(scene === 'rain' ? 0.06 : 0.04, c.currentTime + 0.6);
    audio.src = src; audio.gain = gain; audio.on = true;
    btn.setAttribute('aria-pressed', 'true'); btn.style.color = 'var(--accent-2)';
    toast('Ambient sound on');
  } catch { toast('Audio unavailable'); }
}

/* ============================================================
   BOOT
   ============================================================ */
async function refresh() {
  try {
    document.body.classList.add('loading');
    await loadWeather();
    render();
  } catch (e) {
    console.error(e);
    document.body.classList.remove('loading');
    toast('Could not load live data — check your connection.');
  }
}

function init() {
  resize();
  addEventListener('resize', resize, { passive: true });
  if (!reduced) draw(); else { buildParts(); ctx.clearRect(0, 0, W, H); }
  applyScene('snow');
  tickClock(); setInterval(tickClock, 1000);
  initSearch(); initControls();
  document.body.classList.add('loading');
  refresh();
  // hourly auto-refresh
  setInterval(refresh, 15 * 60 * 1000);
}
init();
