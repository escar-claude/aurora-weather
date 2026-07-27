/* ============================================================
   meteogram.js — multi-track forecast chart
   temperature · pressure · precipitation · wind · cloud layers
   ============================================================ */
'use strict';

import { clamp, pad, parseLocalISO, WEEKDAYS_S, MONTHS_S, esc } from './util.js';
import { tempColor, windColor } from './scales.js';

const PAD_L = 42, PAD_R = 44, PAD_T = 20, PAD_B = 4;
const H_AXIS = 18, H_ARROW = 14, GAP = 6;
/* track heights are a share of whatever vertical room the dock has */
const SHARE = { temp: 0.42, precip: 0.19, wind: 0.26, cloud: 0.13 };
const MIN = { temp: 54, precip: 26, wind: 30, cloud: 10 };

export class Meteogram {
  constructor(container, opts = {}) {
    this.el = container;
    this.onSeek = opts.onSeek || (() => {});
    this.range = 24;
    this.data = null;
    this.fmt = opts.fmt;
    this.cursorMs = null;

    this.svgWrap = document.createElement('div');
    this.svgWrap.className = 'mg';
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'mg__cross';
    this.tip = document.createElement('div');
    this.tip.className = 'mg__tip';
    this.tip.hidden = true;
    container.append(this.svgWrap, this.crosshair, this.tip);

    container.addEventListener('pointermove', (e) => this._hover(e));
    container.addEventListener('pointerleave', () => this._hover(null));
    container.addEventListener('click', (e) => {
      const i = this._indexAt(e);
      if (i != null) this.onSeek(this.data.times[i]);
    });

    this._ro = new ResizeObserver(() => this.render());
    this._ro.observe(container);
  }

  setData(d) { this.data = d; this.render(); }
  setRange(h) { this.range = h; this.render(); }
  setFmt(fmt) { this.fmt = fmt; this.render(); }

  setCursor(ms) {
    this.cursorMs = ms;
    const line = this.svgWrap.querySelector('.mg-cursor');
    if (!line || !this.data) return;
    const x = this._xOfMs(ms);
    const inView = x >= this.geo.x0 - 1 && x <= this.geo.x1 + 1;
    line.style.display = inView ? '' : 'none';
    if (inView) line.setAttribute('transform', `translate(${x.toFixed(1)},0)`);
  }

  /* ---------- geometry helpers ---------- */
  _slice() {
    const d = this.data;
    const start = Math.max(0, d.nowIdx - 2);
    const end = Math.min(d.times.length, start + this.range + 2);
    return { start, end, n: end - start };
  }

  _xOfMs(ms) {
    const { start, n } = this._slice();
    const d = this.data;
    const step = d.times[1] - d.times[0];
    const f = (ms - d.times[start]) / (step * (n - 1));
    return this.geo.x0 + f * (this.geo.x1 - this.geo.x0);
  }

  _indexAt(evt) {
    if (!this.data || !this.geo) return null;
    const r = this.el.getBoundingClientRect();
    const x = evt.clientX - r.left;
    const { start, n } = this._slice();
    const f = (x - this.geo.x0) / (this.geo.x1 - this.geo.x0);
    if (f < -0.02 || f > 1.02) return null;
    return start + clamp(Math.round(f * (n - 1)), 0, n - 1);
  }

  /* ---------- render ---------- */
  render() {
    const d = this.data;
    const W = this.el.clientWidth;
    if (!d || W < 260) return;
    const H = this.el.clientHeight || 240;

    const { start, end, n } = this._slice();
    const idx = Array.from({ length: n }, (_, i) => start + i);
    const x0 = PAD_L, x1 = W - PAD_R;
    const span = x1 - x0;
    this.geo = { x0, x1, W, H };
    const X = (i) => x0 + (i * span) / (n - 1);

    // vertical bands — proportional so every track fits the dock height
    const room = Math.max(H - PAD_T - PAD_B - H_AXIS - H_ARROW - GAP * 3, 130);
    const H_TEMP = Math.max(room * SHARE.temp, MIN.temp);
    const H_PRECIP = Math.max(room * SHARE.precip, MIN.precip);
    const H_WIND = Math.max(room * SHARE.wind, MIN.wind);
    const H_CLOUD = Math.max(room * SHARE.cloud, MIN.cloud);

    let y = PAD_T;
    const yTemp = y; y += H_TEMP + GAP;
    const yPrecip = y; y += H_PRECIP + GAP;
    const yWind = y; y += H_WIND;
    const yArrow = y + H_ARROW / 2; y += H_ARROW + GAP;
    const yCloud = y; y += H_CLOUD;
    const chartBottom = y;
    const yAxis = chartBottom;

    const h = d.hourly;
    const temps = idx.map((i) => h.temperature_2m[i]);
    const feels = idx.map((i) => h.apparent_temperature[i]);
    const press = idx.map((i) => h.pressure_msl[i]);
    const rain = idx.map((i) => h.precipitation[i] ?? 0);
    const snow = idx.map((i) => h.snowfall[i] ?? 0);
    const prob = idx.map((i) => h.precipitation_probability[i] ?? 0);
    const wind = idx.map((i) => h.wind_speed_10m[i] ?? 0);
    const gust = idx.map((i) => h.wind_gusts_10m[i] ?? 0);
    const wdir = idx.map((i) => h.wind_direction_10m[i] ?? 0);
    const isDay = idx.map((i) => h.is_day[i]);

    /* ---- scales ---- */
    const tMin = Math.min(...temps, ...feels), tMax = Math.max(...temps, ...feels);
    const tPadV = Math.max((tMax - tMin) * 0.18, 1.2);
    const tLo = tMin - tPadV, tHi = tMax + tPadV;
    const Yt = (v) => yTemp + H_TEMP * (1 - (v - tLo) / (tHi - tLo));

    const pMin = Math.min(...press), pMax = Math.max(...press);
    const pMid = (pMin + pMax) / 2, pHalf = Math.max((pMax - pMin) / 2, 2);
    const Yp = (v) => yTemp + H_TEMP * (1 - (v - (pMid - pHalf * 1.8)) / (pHalf * 3.6));

    const rMax = Math.max(2, Math.ceil(Math.max(...rain, ...snow.map((s) => s * 7)) * 1.15));
    const Yr = (v) => yPrecip + H_PRECIP * (1 - clamp(v / rMax, 0, 1));

    const wMax = Math.max(20, Math.ceil(Math.max(...gust) / 10) * 10);
    const Yw = (v) => yWind + H_WIND * (1 - clamp(v / wMax, 0, 1));

    const barW = Math.max(2, Math.min(span / n - 1.5, 16));

    /* ---- night shading + day separators ---- */
    let bands = '', seps = '', dayLabels = '';
    for (let i = 0; i < n; i++) {
      if (!isDay[i]) {
        const xa = X(i) - span / (n - 1) / 2, xb = X(i) + span / (n - 1) / 2;
        bands += `<rect x="${Math.max(xa, x0).toFixed(1)}" y="${PAD_T - 8}" width="${Math.max(0, Math.min(xb, x1) - Math.max(xa, x0)).toFixed(1)}" height="${(chartBottom - PAD_T + 8).toFixed(1)}"/>`;
      }
      const dt = new Date(d.times[start + i] + d.offsetMs);
      if (dt.getUTCHours() === 0 && i > 0) {
        seps += `<line x1="${X(i).toFixed(1)}" y1="${PAD_T - 10}" x2="${X(i).toFixed(1)}" y2="${chartBottom}"/>`;
      }
    }
    // day headers: place at the middle of each visible day
    let dStart = 0;
    for (let i = 1; i <= n; i++) {
      const cur = i < n ? new Date(d.times[start + i] + d.offsetMs).getUTCDate() : -1;
      const prev = new Date(d.times[start + dStart] + d.offsetMs).getUTCDate();
      if (cur !== prev) {
        const mid = (X(dStart) + X(i - 1)) / 2;
        const dt = new Date(d.times[start + dStart] + d.offsetMs);
        const today = new Date(d.nowMs + d.offsetMs).getUTCDate() === dt.getUTCDate();
        if (X(i - 1) - X(dStart) > 34) {
          dayLabels += `<text class="mg-day${today ? ' is-today' : ''}" x="${mid.toFixed(1)}" y="${PAD_T - 8}" text-anchor="middle">${WEEKDAYS_S[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS_S[dt.getUTCMonth()]}</text>`;
        }
        dStart = i;
      }
    }

    /* ---- temperature ---- */
    let tLine = '', tArea = '';
    temps.forEach((v, i) => {
      const px = X(i).toFixed(1), py = Yt(v).toFixed(1);
      tLine += (i ? 'L' : 'M') + px + ' ' + py;
      tArea += (i ? 'L' : `M${px} ${yTemp + H_TEMP}L`) + px + ' ' + py;
    });
    tArea += `L${X(n - 1).toFixed(1)} ${yTemp + H_TEMP}Z`;

    let fLine = '';
    feels.forEach((v, i) => { fLine += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yt(v).toFixed(1); });

    // temperature gradient stops (top = hottest in view)
    let gStops = '';
    for (let s = 0; s <= 6; s++) {
      const v = tHi - (tHi - tLo) * (s / 6);
      gStops += `<stop offset="${(s / 6 * 100).toFixed(0)}%" stop-color="${tempColor(v)}"/>`;
    }

    // freezing line
    let freeze = '';
    if (tLo < 0 && tHi > 0) {
      const yz = Yt(0).toFixed(1);
      freeze = `<line class="mg-freeze" x1="${x0}" y1="${yz}" x2="${x1}" y2="${yz}"/>
                <text class="mg-ylab" x="${x0 - 6}" y="${(+yz + 3).toFixed(1)}" text-anchor="end">0°</text>`;
    }

    // temp value labels
    const everyT = this.range <= 24 ? 2 : this.range <= 72 ? 4 : 12;
    let tLabels = '';
    temps.forEach((v, i) => {
      if (i % everyT) return;
      tLabels += `<text class="mg-tval" x="${X(i).toFixed(1)}" y="${(Yt(v) - 9).toFixed(1)}" text-anchor="middle">${this.fmt.temp(v)}°</text>`;
    });
    // hi/lo markers
    const iMax = temps.indexOf(Math.max(...temps)), iMin = temps.indexOf(Math.min(...temps));
    let tExtremes = '';
    for (const [i, cls] of [[iMax, 'hi'], [iMin, 'lo']]) {
      tExtremes += `<circle class="mg-ext mg-ext--${cls}" cx="${X(i).toFixed(1)}" cy="${Yt(temps[i]).toFixed(1)}" r="3.2"/>`;
    }

    /* ---- pressure ---- */
    let pLine = '';
    press.forEach((v, i) => { pLine += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yp(v).toFixed(1); });
    const pAxis = `<text class="mg-ylab mg-ylab--r" x="${x1 + 6}" y="${(Yp(pMid) + 3).toFixed(1)}">${Math.round(pMid)}</text>
                   <text class="mg-unit mg-ylab--r" x="${x1 + 6}" y="${(yTemp + 10)}">hPa</text>`;

    /* ---- precipitation ---- */
    let bars = '';
    rain.forEach((v, i) => {
      const total = v;
      if (total < 0.02) return;
      const isSnow = snow[i] > 0.05;
      const yb = Yr(total);
      bars += `<rect class="mg-bar${isSnow ? ' is-snow' : ''}" x="${(X(i) - barW / 2).toFixed(1)}" y="${yb.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1.5, yPrecip + H_PRECIP - yb).toFixed(1)}" rx="1.5"/>`;
    });
    let probLine = '';
    prob.forEach((v, i) => {
      probLine += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + (yPrecip + H_PRECIP * (1 - v / 100)).toFixed(1);
    });
    const rAxis = `<text class="mg-ylab" x="${x0 - 6}" y="${(yPrecip + 9)}" text-anchor="end">${rMax}</text>
                   <text class="mg-unit" x="${x0 - 6}" y="${(yPrecip + H_PRECIP)}" text-anchor="end">mm</text>`;

    /* ---- wind ---- */
    let wArea = '', gLine = '', arrows = '';
    wind.forEach((v, i) => {
      const px = X(i).toFixed(1), py = Yw(v).toFixed(1);
      wArea += (i ? 'L' : `M${px} ${yWind + H_WIND}L`) + px + ' ' + py;
    });
    wArea += `L${X(n - 1).toFixed(1)} ${yWind + H_WIND}Z`;
    gust.forEach((v, i) => { gLine += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yw(v).toFixed(1); });

    const everyA = Math.max(1, Math.round(n / Math.max(1, Math.floor(span / 34))));
    for (let i = 0; i < n; i += everyA) {
      arrows += `<g class="mg-arrow" transform="translate(${X(i).toFixed(1)},${yArrow.toFixed(1)}) rotate(${(wdir[i] + 180).toFixed(0)})" style="color:${windColor(wind[i])}">
        <path d="M0 -5.4L3.3 4.4L0 2.2L-3.3 4.4Z"/></g>`;
    }
    const wAxis = `<text class="mg-ylab" x="${x0 - 6}" y="${(yWind + 9)}" text-anchor="end">${wMax}</text>
                   <text class="mg-unit" x="${x0 - 6}" y="${(yWind + H_WIND)}" text-anchor="end">${this.fmt.windUnit}</text>`;

    /* ---- cloud layers (high / mid / low) ---- */
    let clouds = '';
    const rowH = H_CLOUD / 3;
    const cw = span / (n - 1) + 0.6;
    ['cloud_cover_high', 'cloud_cover_mid', 'cloud_cover_low'].forEach((key, row) => {
      idx.forEach((gi, i) => {
        const c = h[key]?.[gi] ?? 0;
        if (c < 3) return;
        clouds += `<rect x="${(X(i) - cw / 2).toFixed(1)}" y="${(yCloud + row * rowH).toFixed(1)}" width="${cw.toFixed(1)}" height="${rowH.toFixed(1)}" fill="rgba(226,238,255,${(c / 100 * 0.72).toFixed(3)})"/>`;
      });
    });
    const cAxis = `<text class="mg-unit" x="${x0 - 6}" y="${(yCloud + H_CLOUD - 3)}" text-anchor="end">cloud</text>`;

    /* ---- time axis ---- */
    const everyH = this.range <= 24 ? 2 : this.range <= 72 ? 6 : 12;
    let ticks = '';
    for (let i = 0; i < n; i++) {
      const dt = new Date(d.times[start + i] + d.offsetMs);
      if (dt.getUTCHours() % everyH) continue;
      ticks += `<text class="mg-time" x="${X(i).toFixed(1)}" y="${yAxis + 13}" text-anchor="middle">${pad(dt.getUTCHours())}</text>`;
      ticks += `<line class="mg-tick" x1="${X(i).toFixed(1)}" y1="${chartBottom}" x2="${X(i).toFixed(1)}" y2="${chartBottom + 3}"/>`;
    }

    this.svgWrap.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Forecast meteogram">
  <defs>
    <linearGradient id="mgTemp" x1="0" y1="0" x2="0" y2="1">${gStops}</linearGradient>
    <linearGradient id="mgTempFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8fc0ff" stop-opacity=".26"/><stop offset="100%" stop-color="#8fc0ff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="mgWind" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7fe0c8" stop-opacity=".38"/><stop offset="100%" stop-color="#7fe0c8" stop-opacity=".02"/>
    </linearGradient>
  </defs>
  <g class="mg-night">${bands}</g>
  <g class="mg-sep">${seps}</g>
  ${dayLabels}
  <path class="mg-tempfill" d="${tArea}"/>
  ${freeze}
  <path class="mg-press" d="${pLine}"/>${pAxis}
  <path class="mg-feels" d="${fLine}"/>
  <path class="mg-templine" d="${tLine}" stroke="url(#mgTemp)"/>
  ${tExtremes}${tLabels}
  <g class="mg-bars">${bars}</g>
  <path class="mg-prob" d="${probLine}"/>${rAxis}
  <path class="mg-windfill" d="${wArea}"/>
  <path class="mg-gust" d="${gLine}"/>
  <g class="mg-arrows">${arrows}</g>${wAxis}
  <g class="mg-clouds">${clouds}</g>${cAxis}
  <g class="mg-axis">${ticks}</g>
  <g class="mg-cursor"><line y1="${PAD_T - 12}" y2="${chartBottom + 4}"/><circle cy="${PAD_T - 14}" r="3"/></g>
</svg>`;

    this.crosshair.style.setProperty('--top', `${PAD_T - 12}px`);
    this.crosshair.style.setProperty('--h', `${chartBottom - PAD_T + 16}px`);
    if (this.cursorMs != null) this.setCursor(this.cursorMs);
  }

  /* ---------- hover ---------- */
  _hover(e) {
    if (!e) { this.crosshair.style.opacity = '0'; this.tip.hidden = true; return; }
    const i = this._indexAt(e);
    if (i == null || !this.data) { this.crosshair.style.opacity = '0'; this.tip.hidden = true; return; }
    const d = this.data, h = d.hourly;
    const { start } = this._slice();
    const x = this.geo.x0 + ((i - start) * (this.geo.x1 - this.geo.x0)) / (this._slice().n - 1);
    this.crosshair.style.opacity = '1';
    this.crosshair.style.transform = `translateX(${x}px)`;

    const dt = new Date(d.times[i] + d.offsetMs);
    const f = this.fmt;
    const rows = [
      ['Temp', `${f.temp(h.temperature_2m[i])}°`],
      ['Feels', `${f.temp(h.apparent_temperature[i])}°`],
      ['Wind', `${f.wind(h.wind_speed_10m[i])} ${f.windUnit}`],
      ['Gust', `${f.wind(h.wind_gusts_10m[i])} ${f.windUnit}`],
      ['Rain', `${(h.precipitation[i] ?? 0).toFixed(1)} mm · ${h.precipitation_probability[i] ?? 0}%`],
      ['Cloud', `${h.cloud_cover[i] ?? 0}%`],
      ['Humidity', `${h.relative_humidity_2m[i] ?? 0}%`],
      ['Pressure', `${Math.round(h.pressure_msl[i])} hPa`],
    ];
    this.tip.innerHTML =
      `<p class="mg__tiptime">${WEEKDAYS_S[dt.getUTCDay()]} ${pad(dt.getUTCHours())}:00</p>` +
      rows.map(([k, v]) => `<p><span>${esc(k)}</span><b>${esc(v)}</b></p>`).join('');
    this.tip.hidden = false;
    const w = this.tip.offsetWidth || 150;
    const left = clamp(x + 14, 6, this.geo.W - w - 6);
    this.tip.style.transform = `translateX(${left}px)`;
  }
}
