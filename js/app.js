/* ============================================================
   Aurora WX — professional weather console
   Data: Open-Meteo (free, no API key) · Basemap: OSM / CARTO
   ============================================================ */
'use strict';

import {
  $, $$, clamp, pad, esc, parseLocalISO, WIND_UNITS,
  WEEKDAYS, WEEKDAYS_S, MONTHS, c2f,
} from './util.js';
import { LAYERS, layerById } from './scales.js';
import { geocode, fetchForecast, fetchAir, fetchField, gridSpec } from './api.js';
import { Field } from './field.js';
import { WindMap } from './windmap.js';
import { Meteogram } from './meteogram.js';
import { Sky } from './sky.js';
import * as P from './panels.js';

const HOUR = 3600e3;
const STEPS = 72;               // hours available on the timeline
const FIELD_HOURS = 96;         // hours of grid data to fetch

/* ============================================================
   STATE
   ============================================================ */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`awx_${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`awx_${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

const state = {
  place: store.get('place', { name: 'Cardiff', region: 'Wales, United Kingdom', lat: 51.4816, lon: -3.1791 }),
  unit: store.get('unit', 'C'),
  windUnit: store.get('windUnit', 'km/h'),
  layer: store.get('layer', 'wind'),
  favs: store.get('favs', []),
  w: null, air: null, field: null,
  offsetMs: 0, timesUtc: [], nowIdx: 0, t0: 0,
  ti: 0, playing: false,
};

const fmt = {
  get tempUnit() { return state.unit; },
  temp(c) { return c == null || Number.isNaN(c) ? '--' : Math.round(state.unit === 'F' ? c2f(c) : c); },
  get windUnit() { return state.windUnit; },
  wind(kmh) {
    if (kmh == null || Number.isNaN(kmh)) return '--';
    const u = WIND_UNITS[state.windUnit];
    const v = kmh * u.k;
    return u.d ? v.toFixed(u.d) : Math.round(v);
  },
};

const utcAt = (i) => state.t0 + i * HOUR;
const localAt = (i) => new Date(utcAt(i) + state.offsetMs);

/* ============================================================
   BOOT
   ============================================================ */
let map, meteo, sky, abort;

function init() {
  readHash();
  sky = new Sky($('#sky'));

  map = new WindMap('map', {
    lat: state.place.lat, lon: state.place.lon, zoom: 5, layer: state.layer,
    onBounds: (b) => queueField(b),
    onPick: (ll) => pickPoint(ll),
    onProbe: (p) => P.renderProbe(p, fmt, state.layer),
  });

  meteo = new Meteogram($('#meteoChart'), {
    fmt,
    onSeek: (ms) => setTimeIndex(Math.round((ms - state.t0) / HOUR)),
  });

  buildLayerButtons();
  buildTimeline();
  initSearch();
  initControls();
  initKeyboard();
  initTilt();
  // console handle for poking at live state while developing
  window.auroraWX = { state, map, meteo, refresh, setTimeIndex, setLayer };

  tickClock();
  setInterval(tickClock, 1000);
  setInterval(() => refresh(true), 15 * 60 * 1000);

  refresh();
}

/* ============================================================
   DATA
   ============================================================ */
async function refresh(quiet = false) {
  abort?.abort();
  abort = new AbortController();
  const sig = abort.signal;
  if (!quiet) document.body.classList.add('loading');

  try {
    const [w, air] = await Promise.all([
      fetchForecast(state.place, sig),
      fetchAir(state.place, sig),
    ]);
    state.w = w;
    state.air = air;
    state.offsetMs = (w.utc_offset_seconds || 0) * 1000;
    state.timesUtc = w.hourly.time.map((t) => parseLocalISO(t).getTime() - state.offsetMs);

    const nowUtc = Date.now();
    let idx = state.timesUtc.findIndex((t) => t + HOUR > nowUtc);
    state.nowIdx = idx < 0 ? 0 : idx;
    state.t0 = state.timesUtc[state.nowIdx];
    state.ti = clamp(state.ti, 0, STEPS - 1);

    meteo.setData({
      hourly: w.hourly, times: state.timesUtc, offsetMs: state.offsetMs,
      nowIdx: state.nowIdx, nowMs: nowUtc,
    });

    // the timeline only knows real dates once we have the city's UTC offset
    renderTimelineDays();
    setTimeIndex(state.ti, true);
    meteo.setCursor(utcAt(state.ti));

    renderAll();
    document.body.classList.remove('booting', 'loading');
    map.setPlace(state.place.lat, state.place.lon, !quiet);
    if (!state.field) queueField(mapBounds());
    else map.setTime(utcAt(state.ti));
    writeHash();
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error(e);
    document.body.classList.remove('loading');
    toast('Could not load live data — check your connection.');
  }
}

let fieldTimer, fieldAbort;
function queueField(bounds) {
  clearTimeout(fieldTimer);
  fieldTimer = setTimeout(() => loadField(bounds), 450);
}

async function loadField(bounds) {
  fieldAbort?.abort();
  fieldAbort = new AbortController();
  mapStatus('Loading wind field…', true);
  try {
    const spec = gridSpec(bounds);
    const raw = await fetchField(spec, FIELD_HOURS, fieldAbort.signal);
    state.field = new Field(raw);
    map.setField(state.field);
    map.setTime(utcAt(state.ti));
    mapStatus(null);
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error(e);
    mapStatus('Wind field unavailable — pan or zoom to retry', false);
  }
}

function mapBounds() {
  const b = map.map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

function mapStatus(msg, spinning) {
  const el = $('#mapStatus');
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `${spinning ? '<i class="spinner"></i>' : '<i class="warn"></i>'}<span>${esc(msg)}</span>`;
}

/* ============================================================
   RENDER
   ============================================================ */
function renderAll() {
  const w = state.w;
  if (!w) return;

  $('#cityName').textContent = state.place.name;
  $('#cityRegion').textContent = state.place.region || '';
  $('#cityRegion').hidden = !state.place.region;
  $('#cityCoords').textContent =
    `${Math.abs(state.place.lat).toFixed(2)}°${state.place.lat >= 0 ? 'N' : 'S'} ${Math.abs(state.place.lon).toFixed(2)}°${state.place.lon >= 0 ? 'E' : 'W'}`;
  $('#tzLabel').textContent = w.timezone_abbreviation || w.timezone || 'local';
  $('#favBtn').setAttribute('aria-pressed', String(isFav(state.place)));

  renderForTime();
  P.renderAir(state.air);
  P.renderForecast(w, fmt, (day) => {
    const noon = state.timesUtc.findIndex((t) => {
      const d = new Date(t + state.offsetMs);
      return d.getUTCDate() === parseLocalISO(w.daily.time[day]).getUTCDate() && d.getUTCHours() === 12;
    });
    if (noon >= 0) setTimeIndex(clamp(Math.round((state.timesUtc[noon] - state.t0) / HOUR), 0, STEPS - 1));
  });
  meteo.setFmt(fmt);
}

/* the whole dashboard follows the timeline — index 0 is live observation */
function renderForTime() {
  const w = state.w;
  if (!w) return;
  const i = state.ti;
  const gi = state.nowIdx + i;
  const h = w.hourly;
  const live = i === 0;

  const cur = live ? w.current : {
    temperature_2m: h.temperature_2m[gi],
    apparent_temperature: h.apparent_temperature[gi],
    relative_humidity_2m: h.relative_humidity_2m[gi],
    dew_point_2m: h.dew_point_2m[gi],
    weather_code: h.weather_code[gi],
    cloud_cover: h.cloud_cover[gi],
    pressure_msl: h.pressure_msl[gi],
    wind_speed_10m: h.wind_speed_10m[gi],
    wind_gusts_10m: h.wind_gusts_10m[gi],
    wind_direction_10m: h.wind_direction_10m[gi],
    visibility: h.visibility[gi],
    uv_index: h.uv_index[gi],
    is_day: h.is_day[gi],
    precipitation: h.precipitation[gi],
  };

  const info = P.renderHero({ ...w, current: cur }, fmt);
  sky.setScene(cur.is_day === 0 && info.scene === 'sunny' ? 'sunny' : info.scene);
  P.renderQuick({ ...w, current: cur, hourly: h }, gi, fmt);
  P.renderAlert({ ...w, current: cur }, fmt);
  P.renderStats({ ...w, current: cur }, gi, fmt);

  const stamp = localAt(i);
  $('#updatedAt').innerHTML = live
    ? `live · updated ${pad(new Date(Date.now() + state.offsetMs).getUTCHours())}:${pad(new Date(Date.now() + state.offsetMs).getUTCMinutes())}`
    : `<b class="fc-badge">forecast</b> ${WEEKDAYS_S[stamp.getUTCDay()]} ${pad(stamp.getUTCHours())}:00`;
  document.body.classList.toggle('is-forecast', !live);

  // sun arc for the day being viewed
  const dayIdx = clamp(w.daily.time.findIndex((t) => parseLocalISO(t).getUTCDate() === stamp.getUTCDate()), 0, 6);
  P.renderSun({ daily: { sunrise: [w.daily.sunrise[dayIdx]], sunset: [w.daily.sunset[dayIdx]] } }, utcAt(i) + state.offsetMs);
  P.renderMoon(utcAt(i));
}

/* ============================================================
   TIMELINE
   ============================================================ */
function buildTimeline() {
  const track = $('#tlTrack');
  const setFromEvent = (e) => {
    const r = track.getBoundingClientRect();
    const f = clamp((e.clientX - r.left) / r.width, 0, 1);
    setTimeIndex(Math.round(f * (STEPS - 1)));
  };
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId);
    track.classList.add('is-drag');
    setFromEvent(e);
  });
  track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) setFromEvent(e); });
  track.addEventListener('pointerup', (e) => { track.releasePointerCapture(e.pointerId); track.classList.remove('is-drag'); });
  track.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 6, PageDown: -6 }[e.key];
    if (d) { e.preventDefault(); setTimeIndex(state.ti + d); }
    if (e.key === 'Home') setTimeIndex(0);
    if (e.key === 'End') setTimeIndex(STEPS - 1);
  });

  $('#playBtn').addEventListener('click', togglePlay);
  $('#tlReset').addEventListener('click', () => { setTimeIndex(0); stopPlay(); });
  renderTimelineDays();
}

function renderTimelineDays() {
  const days = $('#tlDays');
  let html = '';
  let start = 0;
  for (let i = 1; i <= STEPS; i++) {
    const changed = i === STEPS || localAt(i).getUTCDate() !== localAt(start).getUTCDate();
    if (!changed) continue;
    const d = localAt(start);
    const left = (start / (STEPS - 1)) * 100;
    const width = ((i - start) / (STEPS - 1)) * 100;
    html += `<div class="tl__day" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%">
      <span>${start === 0 ? 'Today' : WEEKDAYS_S[d.getUTCDay()]}</span></div>`;
    start = i;
  }
  // 6-hourly ticks
  for (let i = 0; i < STEPS; i++) {
    const h = localAt(i).getUTCHours();
    if (h % 6) continue;
    html += `<i class="tl__tick${h === 0 ? ' is-mid' : ''}" style="left:${((i / (STEPS - 1)) * 100).toFixed(2)}%"></i>`;
  }
  days.innerHTML = html;
}

function setTimeIndex(i, silent = false) {
  state.ti = clamp(Math.round(i), 0, STEPS - 1);
  const pct = (state.ti / (STEPS - 1)) * 100;
  $('#tlFill').style.width = `${pct}%`;
  $('#tlKnob').style.left = `${pct}%`;
  $('#tlTrack').setAttribute('aria-valuenow', String(state.ti));
  const d = localAt(state.ti);
  $('#tlTime').textContent = `${pad(d.getUTCHours())}:00`;
  $('#tlDay').textContent = state.ti === 0 ? 'now' : `${WEEKDAYS_S[d.getUTCDay()]} ${d.getUTCDate()}`;
  $('#tlTrack').setAttribute('aria-valuetext', `${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCHours())}:00`);
  $('#timeline').classList.toggle('is-now', state.ti === 0);

  if (silent) return;
  syncMeteoRange();
  map.setTime(utcAt(state.ti));
  meteo.setCursor(utcAt(state.ti));
  renderForTime();
}

/* keep the scrubbed hour inside the meteogram's window */
function syncMeteoRange() {
  const RANGES = [24, 72, 168];
  const need = RANGES.find((r) => r >= state.ti + 2) ?? 168;
  if (need <= meteo.range) return;
  meteo.setRange(need);
  $$('#rangeSeg button').forEach((b) => b.classList.toggle('active', +b.dataset.range === need));
}

let playTimer;
function togglePlay() { state.playing ? stopPlay() : startPlay(); }
function startPlay() {
  state.playing = true;
  $('#playBtn').setAttribute('aria-pressed', 'true');
  playTimer = setInterval(() => {
    setTimeIndex(state.ti >= STEPS - 1 ? 0 : state.ti + 1);
  }, 620);
}
function stopPlay() {
  state.playing = false;
  $('#playBtn').setAttribute('aria-pressed', 'false');
  clearInterval(playTimer);
}

/* ============================================================
   MAP LAYERS
   ============================================================ */
function buildLayerButtons() {
  $('#layers').innerHTML = LAYERS.map((l, i) => `
    <button data-layer="${l.id}" role="tab" title="${l.label} (${i + 1})"
            aria-selected="${l.id === state.layer}" class="${l.id === state.layer ? 'active' : ''}">
      ${l.ico}<span>${l.label}</span>
    </button>`).join('');
  $('#layers').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setLayer(b.dataset.layer);
  });
  renderLegend();
}

function setLayer(id) {
  state.layer = id;
  store.set('layer', id);
  $$('#layers button').forEach((b) => {
    const on = b.dataset.layer === id;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  map.setLayer(id);
  renderLegend();
  writeHash();
}

function renderLegend() {
  const L = layerById(state.layer);
  const isTemp = L.id === 'temp';
  const isWind = L.id === 'wind';
  const conv = (v) => isTemp ? fmt.temp(v) : isWind ? fmt.wind(v) : (v % 1 ? v : Math.round(v));
  const unit = isTemp ? `°${fmt.tempUnit}` : isWind ? fmt.windUnit : L.unit;
  const stops = L.ticks.map((v) => {
    const p = L.norm(v) * 100;
    return `<span style="left:${clamp(p, 0, 100).toFixed(1)}%">${conv(v)}</span>`;
  }).join('');
  const grad = L.log
    ? L.ticks.map((v) => `${colorAt(L, v)} ${(L.norm(v) * 100).toFixed(1)}%`).join(',')
    : L.gradient();
  $('#legend').innerHTML = `
    <p class="legend__label">${L.label}<b>${unit}</b></p>
    <div class="legend__bar" style="background:linear-gradient(90deg, ${grad})"></div>
    <div class="legend__ticks">${stops}</div>`;
}
function colorAt(L, v) {
  const lut = L.lut, i = Math.round(L.norm(v) * 511) * 4;
  return `rgba(${lut[i]},${lut[i + 1]},${lut[i + 2]},${(lut[i + 3] / 255).toFixed(3)})`;
}

/* ============================================================
   PLACES — search, favourites, geolocation, map picking
   ============================================================ */
function setPlace(p, fly = true) {
  state.place = p;
  store.set('place', p);
  state.ti = 0;
  setTimeIndex(0, true);
  refresh();
  if (fly) map.setPlace(p.lat, p.lon, true);
}

function pickPoint(ll) {
  const ns = ll.lat >= 0 ? 'N' : 'S', ew = ll.lng >= 0 ? 'E' : 'W';
  setPlace({
    name: 'Pinned point',
    region: `${Math.abs(ll.lat).toFixed(3)}°${ns} ${Math.abs(ll.lng).toFixed(3)}°${ew}`,
    lat: +ll.lat.toFixed(4), lon: +ll.lng.toFixed(4),
  }, false);
  map.setPlace(ll.lat, ll.lng, false);
  toast('Forecast for the picked point');
}

const favKey = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
const isFav = (p) => state.favs.some((f) => favKey(f) === favKey(p));

function toggleFav() {
  const p = state.place;
  state.favs = isFav(p) ? state.favs.filter((f) => favKey(f) !== favKey(p)) : [{ ...p }, ...state.favs].slice(0, 8);
  store.set('favs', state.favs);
  $('#favBtn').setAttribute('aria-pressed', String(isFav(p)));
  renderFavs();
  toast(isFav(p) ? `Saved ${p.name}` : `Removed ${p.name}`);
}

function renderFavs() {
  const wrap = $('#favGroup');
  if (!state.favs.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  $('#favChips').innerHTML = state.favs.map((f, i) =>
    `<button class="chip" data-fav="${i}">${esc(f.name)}<i data-del="${i}" title="Remove">×</i></button>`).join('');
}

function initSearch() {
  const input = $('#searchInput'), panel = $('#omniPanel'), results = $('#searchResults'), omni = $('#omni');
  let timer, list = [], active = -1;

  const open = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); renderFavs(); };
  const close = () => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };

  input.addEventListener('focus', open);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; $('#omniHint').hidden = false; return; }
    $('#omniHint').hidden = true;
    timer = setTimeout(async () => {
      try {
        list = await geocode(q);
        active = -1;
        results.innerHTML = list.length ? list.map((r, i) => `
          <li role="option" data-i="${i}" id="opt${i}">
            <b>${esc(r.name)}</b>
            <span>${esc([r.admin1, r.country].filter(Boolean).join(', '))}</span>
            <i>${r.latitude.toFixed(1)}, ${r.longitude.toFixed(1)}</i>
          </li>`).join('') : '<li class="is-empty">No match</li>';
      } catch { results.innerHTML = '<li class="is-empty">Search unavailable</li>'; }
    }, 240);
  });

  const choose = (i) => {
    const r = list[i];
    if (!r) return;
    setPlace({
      name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude, lon: r.longitude,
    });
    input.value = '';
    results.innerHTML = '';
    input.blur();
    close();
  };

  results.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) choose(+li.dataset.i);
  });

  $('#favChips').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      state.favs.splice(+del.dataset.del, 1);
      store.set('favs', state.favs);
      renderFavs();
      $('#favBtn').setAttribute('aria-pressed', String(isFav(state.place)));
      return;
    }
    const chip = e.target.closest('[data-fav]');
    if (chip) { setPlace({ ...state.favs[+chip.dataset.fav] }); close(); $('#searchInput').blur(); }
  });

  input.addEventListener('keydown', (e) => {
    const items = $$('li[data-i]', results);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = clamp(active + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
      items.forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      items[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      choose(active >= 0 ? active : 0);
    } else if (e.key === 'Escape') {
      input.value = ''; close(); input.blur();
    }
  });

  document.addEventListener('click', (e) => { if (!omni.contains(e.target)) close(); });
  renderFavs();
}

function locateMe() {
  if (!navigator.geolocation) return toast('Geolocation not supported');
  toast('Locating…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setPlace({
        name: 'My location',
        region: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
        lat: +lat.toFixed(4), lon: +lon.toFixed(4),
      });
    },
    () => toast('Location permission denied'),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  );
}

/* ============================================================
   CONTROLS
   ============================================================ */
function initControls() {
  $('#unitBtn').addEventListener('click', () => {
    state.unit = state.unit === 'C' ? 'F' : 'C';
    store.set('unit', state.unit);
    $('#unitBtn').textContent = `°${state.unit}`;
    renderAll(); renderLegend(); meteo.render();
  });
  $('#unitBtn').textContent = `°${state.unit}`;

  const units = Object.keys(WIND_UNITS);
  $('#windUnitBtn').addEventListener('click', () => {
    state.windUnit = units[(units.indexOf(state.windUnit) + 1) % units.length];
    store.set('windUnit', state.windUnit);
    $('#windUnitBtn').textContent = state.windUnit;
    renderAll(); renderLegend(); meteo.render();
  });
  $('#windUnitBtn').textContent = state.windUnit;

  $('#refreshBtn').addEventListener('click', (e) => {
    e.currentTarget.classList.add('spin');
    setTimeout(() => e.currentTarget.classList.remove('spin'), 800);
    state.field = null;
    refresh();
    loadField(mapBounds());
  });
  $('#favBtn').addEventListener('click', toggleFav);
  $('#geoBtn').addEventListener('click', locateMe);
  $('#soundBtn').addEventListener('click', (e) => toggleSound(e.currentTarget));
  $('#zoomIn').addEventListener('click', () => map.map.zoomIn());
  $('#zoomOut').addEventListener('click', () => map.map.zoomOut());
  $('#recenterBtn').addEventListener('click', () => map.recenter(state.place.lat, state.place.lon));

  $('#rangeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('#rangeSeg button').forEach((x) => x.classList.toggle('active', x === b));
    meteo.setRange(+b.dataset.range);
  });

  $('#meteoToggle').addEventListener('click', toggleMeteo);
  P.renderProbe(null, fmt, state.layer);
}

function toggleMeteo() {
  const on = document.body.classList.toggle('meteo-collapsed');
  $('#meteoToggle').setAttribute('aria-expanded', String(!on));
  setTimeout(() => { map.map.invalidateSize(); meteo.render(); }, 320);
}

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('#searchInput').focus(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    const n = Number(e.key);
    if (n >= 1 && n <= LAYERS.length) { setLayer(LAYERS[n - 1].id); return; }
    switch (e.key.toLowerCase()) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'arrowright': e.preventDefault(); setTimeIndex(state.ti + 1); break;
      case 'arrowleft': e.preventDefault(); setTimeIndex(state.ti - 1); break;
      case 'n': setTimeIndex(0); stopPlay(); break;
      case 'u': $('#unitBtn').click(); break;
      case 'w': $('#windUnitBtn').click(); break;
      case 'r': $('#refreshBtn').click(); break;
      case 'l': locateMe(); break;
      case 's': toggleFav(); break;
      case 'm': toggleMeteo(); break;
      default: break;
    }
  });
}

/* ============================================================
   3D GLASS TILT — pointer-reactive parallax on the sidebar surfaces.
   Delegated from .side so it also covers the JS-injected stat cards.
   ============================================================ */
function initTilt() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const zone = $('#side');
  const MAX = 5;                                   // max tilt, degrees
  let active = null;
  const reset = (el) => {
    if (!el) return;
    el.classList.remove('tilting');
    for (const p of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(p);
  };
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest('[data-tilt]');
    if (el !== active) { reset(active); active = el; }
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = clamp((e.clientY - r.top) / r.height, 0, 1);
    el.classList.add('tilting');
    el.style.setProperty('--rx', `${((px - 0.5) * MAX * 2).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((0.5 - py) * MAX * 2).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  }, { passive: true });
  zone.addEventListener('pointerleave', () => { reset(active); active = null; });
}

/* ---------- clock ---------- */
function tickClock() {
  const d = new Date(Date.now() + state.offsetMs);
  $('#clock').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  $('#dateLabel').textContent = `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/* ---------- ambient sound ---------- */
let audio;
function toggleSound(btn) {
  audio ||= { ctx: null, src: null, gain: null, on: false };
  if (audio.on) {
    audio.gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + 0.4);
    audio.on = false;
    btn.setAttribute('aria-pressed', 'false');
    toast('Ambient sound off');
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audio.ctx ||= new AC();
    const c = audio.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const scene = document.body.dataset.scene;
    const filt = c.createBiquadFilter();
    filt.type = scene === 'rain' ? 'bandpass' : 'lowpass';
    filt.frequency.value = scene === 'rain' ? 1400 : scene === 'wind' ? 500 : 320;
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    src.connect(filt); filt.connect(gain); gain.connect(c.destination);
    src.start();
    gain.gain.exponentialRampToValueAtTime(scene === 'rain' ? 0.06 : 0.04, c.currentTime + 0.6);
    audio.src = src; audio.gain = gain; audio.on = true;
    btn.setAttribute('aria-pressed', 'true');
    toast('Ambient sound on');
  } catch { toast('Audio unavailable'); }
}

/* ---------- toast ---------- */
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------- shareable URL ---------- */
function readHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h) return;
  const [lat, lon, layer, ...name] = h.split(',');
  if (!Number.isNaN(+lat) && !Number.isNaN(+lon) && lat !== '') {
    const saved = state.place;
    const same = Math.abs(saved.lat - +lat) < 0.01 && Math.abs(saved.lon - +lon) < 0.01;
    state.place = same
      ? saved                                   // keep the richer stored record
      : { name: name.join(',') || 'Pinned point', region: '', lat: +lat, lon: +lon };
  }
  if (LAYERS.some((l) => l.id === layer)) state.layer = layer;
}
function writeHash() {
  const p = state.place;
  const h = `#${p.lat.toFixed(3)},${p.lon.toFixed(3)},${state.layer},${p.name}`;
  history.replaceState(null, '', h);
}

init();
