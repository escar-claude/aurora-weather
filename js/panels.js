/* ============================================================
   panels.js — sidebar renderers (hero, stats, sun/moon, air, week)
   ============================================================ */
'use strict';

import {
  $, clamp, pad, icon, codeInfo, compass, beaufort, uvLevel, visLevel,
  aqiLevel, aqiTone, moonPhase, parseLocalISO, WEEKDAYS, MONTHS_S,
} from './util.js';
import { tempColor, windColor } from './scales.js';

const I = {
  hum:   '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/></svg>',
  wind:  '<svg viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 100-6M3 16h15a3 3 0 110 6M3 12h9"/></svg>',
  gust:  '<svg viewBox="0 0 24 24"><path d="M2 9h9a3 3 0 10-3-3M2 15h13a3.4 3.4 0 113.4 3.4"/><path d="M15 9.5h3.5a2.6 2.6 0 10-2.6-2.6"/></svg>',
  uv:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
  press: '<svg viewBox="0 0 24 24"><path d="M4 15a8 8 0 1116 0"/><path d="M12 15l4.5-4.5"/></svg>',
  vis:   '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
};

/* ---------- hero ---------- */
export function renderHero(w, fmt) {
  const cur = w.current;
  const info = codeInfo(cur.weather_code);
  $('#currentIcon').innerHTML = icon(info.icon, cur.is_day === 0);
  $('#tempNow').textContent = fmt.temp(cur.temperature_2m);
  $('#tempUnit').textContent = `°${fmt.tempUnit}`;
  $('#descNow').textContent = info.t;
  $('#feelsLike').textContent = `${fmt.temp(cur.apparent_temperature)}°`;
  document.body.dataset.scene = info.scene;
  return info;
}

export function renderQuick(w, hourNow, fmt) {
  const cur = w.current, h = w.hourly;
  const prob = h.precipitation_probability?.[hourNow] ?? 0;
  const pills = [
    ['Precip', `${prob}%`, prob >= 50 ? 'hi' : ''],
    ['Cloud', `${Math.round(cur.cloud_cover)}%`, ''],
    ['Dew pt', `${fmt.temp(cur.dew_point_2m)}°`, ''],
    ['UV', `${Math.round(cur.uv_index ?? 0)}`, (cur.uv_index ?? 0) >= 6 ? 'hi' : ''],
  ];
  $('#quick').innerHTML = pills.map(([k, v, cls]) =>
    `<div class="pill ${cls}"><span>${k}</span><b>${v}</b></div>`).join('');
}

/* ---------- advisory ---------- */
export function renderAlert(w, fmt) {
  const el = $('#alert'), txt = $('#alertText');
  const cur = w.current, d = w.daily;
  const feels = cur.apparent_temperature, gust = cur.wind_gusts_10m ?? cur.wind_speed_10m, code = cur.weather_code;
  const rain24 = (d.precipitation_sum?.[0] ?? 0);
  let msg = '';
  if (feels <= -3) msg = `Wind chill down to <b>${fmt.temp(feels)}°${fmt.tempUnit}</b> — dress in layers and watch for ice underfoot.`;
  else if ([95, 96, 99].includes(code)) msg = `Thunderstorm activity. Stay indoors and unplug sensitive equipment.`;
  else if ([71, 73, 75, 77, 85, 86].includes(code)) msg = `Snow falling now. Roads may be slippery — allow extra travel time.`;
  else if (gust >= 62) msg = `Gale-force gusts to <b>${fmt.wind(gust)} ${fmt.windUnit}</b> (Beaufort ${beaufort(gust).n}). Secure loose objects outdoors.`;
  else if ([65, 82].includes(code) || rain24 >= 25) msg = `Heavy rain — <b>${rain24.toFixed(0)} mm</b> expected today. Watch for surface flooding.`;
  else if (feels >= 32) msg = `Feels like <b>${fmt.temp(feels)}°${fmt.tempUnit}</b>. Hydrate and avoid prolonged sun exposure.`;
  else if ((cur.uv_index ?? 0) >= 8) msg = `UV index <b>${Math.round(cur.uv_index)}</b> (${uvLevel(cur.uv_index)}). Sun protection strongly advised.`;
  if (msg) { txt.innerHTML = msg; el.hidden = false; } else { el.hidden = true; }
}

/* ---------- stat cards ---------- */
function card({ ico, label, value, unit, sub, pct, tone = '' }) {
  return `<div class="card ${tone}">
    <div class="card__head">${ico}<span class="card__label">${label}</span></div>
    <div class="card__val"><b>${value}</b>${unit ? `<small>${unit}</small>` : ''}</div>
    <div class="card__sub">${sub}</div>
    <div class="card__bar"><i style="width:${clamp(pct * 100, 2, 100).toFixed(1)}%"></i></div>
  </div>`;
}

export function renderStats(w, hourNow, fmt) {
  const cur = w.current, h = w.hourly, d = w.daily;
  const hum = Math.round(cur.relative_humidity_2m);
  const wind = cur.wind_speed_10m;
  const gust = cur.wind_gusts_10m ?? wind;
  const uv = cur.uv_index ?? 0;
  const press = cur.pressure_msl;
  const visKm = (cur.visibility ?? 0) / 1000;
  const bf = beaufort(wind);

  // 3-hour pressure tendency — the classic synoptic indicator
  const p3 = h.pressure_msl?.[Math.max(0, hourNow - 3)];
  const dP = p3 != null ? press - p3 : 0;
  const trend = Math.abs(dP) < 0.4 ? 'steady' : dP > 0 ? 'rising' : 'falling';
  const arrow = trend === 'steady' ? '→' : trend === 'rising' ? '↑' : '↓';

  const cards = [
    card({ ico: I.wind, label: 'Wind', value: fmt.wind(wind), unit: fmt.windUnit,
      sub: `${compass(cur.wind_direction_10m)} ${Math.round(cur.wind_direction_10m)}° · Bft ${bf.n} ${bf.name}`, pct: wind / 90 }),
    card({ ico: I.gust, label: 'Gusts', value: fmt.wind(gust), unit: fmt.windUnit,
      sub: `Peak today ${fmt.wind(d.wind_gusts_10m_max?.[0] ?? gust)} ${fmt.windUnit}`, pct: gust / 120,
      tone: gust >= 62 ? 'is-warn' : '' }),
    card({ ico: I.hum, label: 'Humidity', value: hum, unit: '%',
      sub: `Dew point ${fmt.temp(cur.dew_point_2m)}°${fmt.tempUnit}`, pct: hum / 100 }),
    card({ ico: I.press, label: 'Pressure', value: Math.round(press), unit: 'hPa',
      sub: `${arrow} ${trend} ${dP ? `${dP > 0 ? '+' : ''}${dP.toFixed(1)} / 3h` : ''}`, pct: clamp((press - 975) / 70, 0, 1) }),
    card({ ico: I.uv, label: 'UV index', value: Math.round(uv), unit: uvLevel(uv),
      sub: `Peak today ${Math.round(d.uv_index_max?.[0] ?? uv)}`, pct: uv / 11, tone: uv >= 8 ? 'is-warn' : '' }),
    card({ ico: I.vis, label: 'Visibility', value: visKm >= 10 ? Math.round(visKm) : visKm.toFixed(1), unit: 'km',
      sub: visLevel(visKm), pct: clamp(visKm / 25, 0, 1) }),
  ];
  $('#stats').innerHTML = cards.join('');
  requestAnimationFrame(() => document.querySelectorAll('.card__bar i').forEach((el) => {
    const wv = el.style.width; el.style.width = '0'; requestAnimationFrame(() => { el.style.width = wv; });
  }));
}

/* ---------- sun arc + moon ---------- */
export function renderSun(w, nowLocalMs) {
  const d = w.daily;
  const rise = parseLocalISO(d.sunrise[0]).getTime();
  const set = parseLocalISO(d.sunset[0]).getTime();
  const frac = clamp((nowLocalMs - rise) / (set - rise), 0, 1);
  const isDay = nowLocalMs >= rise && nowLocalMs <= set;

  const W = 320, H = 116, mx = 16, baseY = H - 20, amp = H - 44;
  const pt = (t) => [mx + t * (W - 2 * mx), baseY - Math.sin(Math.PI * t) * amp];
  const sample = (a, b) => {
    let p = '';
    for (let i = 0; i <= 44; i++) { const t = a + (b - a) * i / 44; const [x, y] = pt(t); p += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    return p;
  };
  const [sx, sy] = pt(frac);

  $('#sunArc').innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sunGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff9a5a"/><stop offset=".5" stop-color="#ffd18a"/><stop offset="1" stop-color="#6fa8ff"/>
      </linearGradient>
      <radialGradient id="sunGlow"><stop offset="0" stop-color="#ffe4bd"/><stop offset="1" stop-color="#ff9a5a" stop-opacity="0"/></radialGradient>
      <linearGradient id="dayFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffcf87" stop-opacity=".14"/><stop offset="1" stop-color="#ffcf87" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${sample(0, 1)}L${W - mx} ${baseY}L${mx} ${baseY}Z" fill="url(#dayFill)"/>
    <line x1="${mx}" y1="${baseY}" x2="${W - mx}" y2="${baseY}" stroke="rgba(150,175,220,.2)" stroke-width="1"/>
    <path d="${sample(0, 1)}" fill="none" stroke="rgba(150,175,220,.18)" stroke-width="2" stroke-dasharray="3 5"/>
    <path d="${sample(0, frac)}" fill="none" stroke="url(#sunGrad)" stroke-width="2.6" stroke-linecap="round"/>
    ${isDay ? `<circle cx="${sx}" cy="${sy}" r="24" fill="url(#sunGlow)"/>
      <circle cx="${sx}" cy="${sy}" r="6.5" fill="#ffe1b0"/>
      <circle cx="${sx}" cy="${sy}" r="6.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>`
      : `<circle cx="${sx}" cy="${sy}" r="5" fill="#33406a" stroke="rgba(180,200,240,.5)"/>`}
  </svg>`;

  const fmtT = (ms) => { const dd = new Date(ms); return `${pad(dd.getUTCHours())}:${pad(dd.getUTCMinutes())}`; };
  $('#sunrise').textContent = fmtT(rise);
  $('#sunset').textContent = fmtT(set);
  $('#noon').textContent = fmtT((rise + set) / 2);

  const mins = Math.round((set - rise) / 60000);
  $('#dayLen').textContent = `${Math.floor(mins / 60)}h ${pad(mins % 60)}m daylight`;
  $('#dayPct').textContent = isDay ? `${Math.round(frac * 100)}% elapsed` : 'night';
}

export function renderMoon(nowUtcMs) {
  const m = moonPhase(new Date(nowUtcMs));
  const r = 20;
  const sweep = m.frac < 0.5 ? 1 : 0;
  const k = Math.cos(2 * Math.PI * m.frac);
  const inner = k > 0 ? 1 - sweep : sweep;
  const rx = Math.abs(k) * r;
  const lit = `M0,${-r} A ${r},${r} 0 1 ${sweep} 0,${r} A ${rx.toFixed(2)},${r} 0 1 ${inner} 0,${-r}`;
  $('#moon').innerHTML = `
    <svg viewBox="-24 -24 48 48" class="moon__svg" aria-hidden="true">
      <circle r="${r}" fill="#141c33" stroke="rgba(160,185,235,.22)"/>
      <path d="${lit}" fill="#e8eeff"/>
    </svg>
    <div class="moon__txt">
      <b>${m.name}</b>
      <span>${Math.round(m.illum * 100)}% illuminated · moon age ${m.age.toFixed(1)}d</span>
    </div>`;
}

/* ---------- air quality ---------- */
export function renderAir(air) {
  const el = $('#aqPanel');
  const cur = air?.current;
  if (!cur || cur.european_aqi == null) {
    el.innerHTML = `<p class="aq__none">Air-quality data unavailable for this location.</p>`;
    return;
  }
  const aqi = Math.round(cur.european_aqi);
  const tone = aqiTone(aqi);
  const poll = [
    ['PM2.5', cur.pm2_5, 'µg/m³', 25],
    ['PM10', cur.pm10, 'µg/m³', 50],
    ['O₃', cur.ozone, 'µg/m³', 120],
    ['NO₂', cur.nitrogen_dioxide, 'µg/m³', 40],
  ];
  el.innerHTML = `
    <div class="aq__top">
      <div class="aq__num is-${tone}"><b>${aqi}</b><span>EAQI</span></div>
      <div class="aq__desc">
        <b>${aqiLevel(aqi)}</b>
        <div class="aq__scale"><i style="left:${clamp(aqi / 120 * 100, 0, 99).toFixed(1)}%"></i></div>
        <span>0 good — 100+ very poor</span>
      </div>
    </div>
    <div class="aq__grid">
      ${poll.map(([k, v, u, lim]) => `<div class="aq__cell">
        <span>${k}</span>
        <b>${v == null ? '—' : Math.round(v)}<small>${u}</small></b>
        <i class="aq__bar"><u style="width:${v == null ? 0 : clamp(v / lim * 100, 2, 100).toFixed(0)}%"></u></i>
      </div>`).join('')}
    </div>`;
}

/* ---------- 7-day outlook ---------- */
export function renderForecast(w, fmt, onPickDay) {
  const d = w.daily;
  const weekMin = Math.min(...d.temperature_2m_min);
  const weekMax = Math.max(...d.temperature_2m_max);
  const span = (weekMax - weekMin) || 1;

  const rows = d.time.map((t, i) => {
    const dt = parseLocalISO(t);
    const label = i === 0 ? 'Today' : WEEKDAYS[dt.getUTCDay()];
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i];
    const left = ((lo - weekMin) / span) * 100;
    const width = Math.max(((hi - lo) / span) * 100, 5);
    const prob = d.precipitation_probability_max?.[i] ?? 0;
    const mm = d.precipitation_sum?.[i] ?? 0;
    return `<li class="frow ${i === 0 ? 'is-today' : ''}" data-day="${i}" tabindex="0" role="button">
      <span class="fday">${label}<small>${dt.getUTCDate()} ${MONTHS_S[dt.getUTCMonth()]}</small></span>
      <span class="fico">${icon(codeInfo(d.weather_code[i]).icon)}</span>
      <span class="fwet ${prob >= 40 ? 'is-wet' : ''}">${prob}%${mm >= 0.2 ? `<small>${mm.toFixed(1)}mm</small>` : ''}</span>
      <span class="fbar" title="${fmt.temp(lo)}° – ${fmt.temp(hi)}°">
        <i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%;background:linear-gradient(90deg,${tempColor(lo)},${tempColor(hi)})"></i>
      </span>
      <span class="ftemp"><b>${fmt.temp(hi)}°</b><small>${fmt.temp(lo)}°</small></span>
    </li>`;
  }).join('');

  const list = $('#forecastList');
  list.innerHTML = rows;
  $('#weekRange').textContent = `${fmt.temp(weekMin)}° ~ ${fmt.temp(weekMax)}°${fmt.tempUnit}`;
  list.onclick = (e) => {
    const li = e.target.closest('.frow');
    if (li) onPickDay(+li.dataset.day);
  };
  list.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = e.target.closest('.frow');
    if (li) { e.preventDefault(); onPickDay(+li.dataset.day); }
  };
}

/* ---------- map probe card ---------- */
export function renderProbe(p, fmt, layerId) {
  const el = $('#probe');
  if (!p) { el.hidden = true; return; }
  const ns = p.lat >= 0 ? 'N' : 'S', ew = p.lon >= 0 ? 'E' : 'W';
  el.innerHTML = `
    <p class="probe__coord">${Math.abs(p.lat).toFixed(2)}°${ns} ${Math.abs(p.lon).toFixed(2)}°${ew}</p>
    <div class="probe__wind">
      <svg viewBox="-12 -12 24 24" style="transform:rotate(${(p.dir + 180).toFixed(0)}deg);color:${windColor(p.spd)}">
        <path d="M0 -9L5.4 7.4L0 4.2L-5.4 7.4Z" fill="currentColor"/>
      </svg>
      <b>${fmt.wind(p.spd)}</b><span>${fmt.windUnit} ${compass(p.dir)}</span>
    </div>
    <div class="probe__grid">
      <span>Gust</span><b>${fmt.wind(p.gust)}</b>
      <span>Temp</span><b style="color:${tempColor(p.temp)}">${fmt.temp(p.temp)}°</b>
      <span>Rain</span><b>${p.rain.toFixed(1)} mm</b>
      <span>Cloud</span><b>${Math.round(p.cloud)}%</b>
      <span>Humid</span><b>${Math.round(p.rh)}%</b>
      <span>Press</span><b>${Math.round(p.press)}</b>
    </div>`;
  el.hidden = false;
}
