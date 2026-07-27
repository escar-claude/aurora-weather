/* ============================================================
   api.js — Open-Meteo access layer (free, no API key)
   ============================================================ */
'use strict';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE  = 'https://geocoding-api.open-meteo.com/v1/search';
const AIRQ     = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const HOURLY = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'dew_point_2m',
  'precipitation', 'precipitation_probability', 'snowfall', 'weather_code',
  'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
  'pressure_msl', 'visibility', 'uv_index', 'is_day',
  'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
].join(',');

const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
  'precipitation', 'rain', 'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl',
  'surface_pressure', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  'visibility', 'dew_point_2m', 'uv_index',
].join(',');

const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'apparent_temperature_max', 'apparent_temperature_min',
  'sunrise', 'sunset', 'daylight_duration', 'sunshine_duration', 'uv_index_max',
  'precipitation_sum', 'precipitation_hours', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
].join(',');

async function getJSON(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

/* ---------- city search ---------- */
export async function geocode(name, signal) {
  const url = `${GEOCODE}?name=${encodeURIComponent(name)}&count=8&language=en&format=json`;
  const j = await getJSON(url, signal);
  return j.results || [];
}

/* ---------- point forecast for the selected city ---------- */
export async function fetchForecast({ lat, lon }, signal) {
  const p = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: CURRENT, hourly: HOURLY, daily: DAILY,
    timezone: 'auto', forecast_days: '7', past_hours: '3',
    wind_speed_unit: 'kmh', timeformat: 'iso8601',
  });
  return getJSON(`${FORECAST}?${p}`, signal);
}

/* ---------- air quality ---------- */
export async function fetchAir({ lat, lon }, signal) {
  const p = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone',
    hourly: 'european_aqi', forecast_days: '2', timezone: 'auto',
  });
  try { return await getJSON(`${AIRQ}?${p}`, signal); } catch { return null; }
}

/* ============================================================
   GRID FIELD — the data behind the animated map
   Multiple coordinates in a single request; times forced to UTC
   so every grid point shares one time axis.
   ============================================================ */
export const GRID_NX = 12;
export const GRID_NY = 8;
const FIELD_VARS = [
  'temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  'precipitation', 'cloud_cover', 'pressure_msl', 'relative_humidity_2m',
];

export function gridSpec(bounds) {
  // bounds: {north, south, east, west} — padded a little so particles that
  // drift off-screen still have data to follow.
  const padY = (bounds.north - bounds.south) * 0.12;
  const padX = (bounds.east - bounds.west) * 0.12;
  let north = Math.min(bounds.north + padY, 84);
  let south = Math.max(bounds.south - padY, -84);
  let west = bounds.west - padX;
  let east = bounds.east + padX;
  // keep the request sane at world zoom
  if (east - west > 300) { const c = (east + west) / 2; west = c - 150; east = c + 150; }
  if (north - south < 2) { const c = (north + south) / 2; north = c + 1; south = c - 1; }
  if (east - west < 2) { const c = (east + west) / 2; east = c + 1; west = c - 1; }
  const dLat = (north - south) / (GRID_NY - 1);
  const dLon = (east - west) / (GRID_NX - 1);
  return { north, south, east, west, dLat, dLon, nx: GRID_NX, ny: GRID_NY };
}

export async function fetchField(spec, hours, signal) {
  const lats = [], lons = [];
  for (let j = 0; j < spec.ny; j++) {
    for (let i = 0; i < spec.nx; i++) {
      lats.push((spec.south + j * spec.dLat).toFixed(3));
      lons.push((spec.west + i * spec.dLon).toFixed(3));
    }
  }
  const p = new URLSearchParams({
    latitude: lats.join(','), longitude: lons.join(','),
    hourly: FIELD_VARS.join(','),
    forecast_days: String(Math.ceil(hours / 24)),
    timezone: 'UTC', wind_speed_unit: 'kmh', cell_selection: 'nearest',
  });
  const raw = await getJSON(`${FORECAST}?${p}`, signal);
  const list = Array.isArray(raw) ? raw : [raw];
  if (!list.length || !list[0].hourly) throw new Error('empty field response');

  const nt = list[0].hourly.time.length;
  const n = spec.nx * spec.ny;
  const times = list[0].hourly.time.map((t) => Date.parse(`${t}:00Z`));

  const mk = () => new Float32Array(n * nt);
  const out = { u: mk(), v: mk(), spd: mk(), gust: mk(), temp: mk(), rain: mk(), cloud: mk(), press: mk(), rh: mk() };

  for (let k = 0; k < n; k++) {
    const h = list[k]?.hourly;
    if (!h) continue;
    for (let t = 0; t < nt; t++) {
      const idx = t * n + k;
      const spd = h.wind_speed_10m[t] ?? 0;             // km/h
      const dir = h.wind_direction_10m[t] ?? 0;         // direction the wind comes FROM
      const rad = (dir * Math.PI) / 180;
      out.spd[idx]   = spd;
      out.u[idx]     = -spd * Math.sin(rad);            // eastward component, km/h
      out.v[idx]     = -spd * Math.cos(rad);            // northward component, km/h
      out.gust[idx]  = h.wind_gusts_10m[t] ?? spd;
      out.temp[idx]  = h.temperature_2m[t] ?? 0;
      out.rain[idx]  = h.precipitation[t] ?? 0;
      out.cloud[idx] = h.cloud_cover[t] ?? 0;
      out.press[idx] = h.pressure_msl[t] ?? 1013;
      out.rh[idx]    = h.relative_humidity_2m[t] ?? 0;
    }
  }
  return { spec, times, nt, n, data: out };
}
