/* ============================================================
   windmap.js — Leaflet basemap + animated wind particles +
   interpolated raster overlays (the Windy-style stage)
   ============================================================ */
'use strict';

import { clamp } from './util.js';
import { layerById } from './scales.js';

const RAD = Math.PI / 180;
const PAD = 96;                 // canvas overdraw so panning stays covered
const RASTER_STEP = 4;          // css px per raster sample
const TARGET_PX = 0.032;        // screen px per (km/h) per frame
const MAX_STEP_PX = 7;

/* ---------- Web Mercator (matches Leaflet's EPSG:3857) ---------- */
const worldX = (lon, scale) => scale * (lon / 360 + 0.5);
const worldY = (lat, scale) => {
  const s = Math.sin(clamp(lat, -85.0511, 85.0511) * RAD);
  return scale * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI));
};
const lonFromX = (x, scale) => (x / scale - 0.5) * 360;
const latFromY = (y, scale) => (2 * Math.atan(Math.exp((0.5 - y / scale) * 2 * Math.PI)) - Math.PI / 2) / RAD;

export class WindMap {
  constructor(containerId, opts = {}) {
    this.onBounds = opts.onBounds || (() => {});
    this.onPick = opts.onPick || (() => {});
    this.onProbe = opts.onProbe || (() => {});
    this.field = null;
    this.layer = layerById(opts.layer || 'wind');
    this.particles = [];
    this.uv = new Float32Array(2);
    this.running = false;
    this.moving = false;
    this._lastT = 0;

    const map = this.map = L.map(containerId, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 12,
      zoomSnap: 0.5,
      wheelPxPerZoomLevel: 160,
      worldCopyJump: true,
      maxBoundsViscosity: 1,
      preferCanvas: true,
    }).setView([opts.lat ?? 51.48, opts.lon ?? -3.18], opts.zoom ?? 5);

    map.attributionControl.setPrefix('');
    map.createPane('wx').style.zIndex = 250;
    map.createPane('wxlabels').style.zIndex = 280;
    map.getPane('wx').style.pointerEvents = 'none';
    map.getPane('wxlabels').style.pointerEvents = 'none';

    const tileOpts = { subdomains: 'abcd', maxZoom: 19, detectRetina: true, updateWhenIdle: false };
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      ...tileOpts, attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      ...tileOpts, pane: 'wxlabels', opacity: 0.85,
    }).addTo(map);

    /* two canvases inside the weather pane: raster below, particles above */
    const pane = map.getPane('wx');
    this.rasterCv = this._mkCanvas(pane, 'wx-raster');
    this.partCv = this._mkCanvas(pane, 'wx-particles');
    this.rctx = this.rasterCv.getContext('2d');
    this.pctx = this.partCv.getContext('2d');

    this.marker = L.marker([opts.lat ?? 51.48, opts.lon ?? -3.18], {
      icon: L.divIcon({ className: 'wx-pin', html: '<i></i><b></b>', iconSize: [22, 22] }),
      interactive: false, keyboard: false, pane: 'wxlabels',
    }).addTo(map);

    map.on('movestart zoomstart', () => { this.moving = true; });
    map.on('moveend', () => { this.moving = false; this._reset(); this._maybeRefetch(); });
    map.on('zoomend', () => { this.moving = false; this._reset(); });
    map.on('resize', () => this._reset());
    map.on('zoomanim', (e) => this._animZoom(e));
    map.on('click', (e) => { if (!this._suppressClick) this.onPick(e.latlng); });
    map.on('mousemove', (e) => this._probe(e));
    map.on('mouseout', () => this.onProbe(null));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else if (this.layer.particles) this.start();
    });

    this._reset();
    this.start();
    // the grid row hosting the map settles after first paint — re-measure once
    requestAnimationFrame(() => { map.invalidateSize({ animate: false }); this._reset(); });
  }

  _mkCanvas(pane, cls) {
    const c = document.createElement('canvas');
    // `leaflet-zoom-animated` lets Leaflet's own transition drive our transform
    c.className = `wx-canvas leaflet-zoom-animated ${cls}`;
    pane.appendChild(c);
    return c;
  }

  /* ---------- geometry ---------- */
  _reset() {
    const map = this.map;
    const size = map.getSize();
    const w = this.w = size.x + PAD * 2;
    const h = this.h = size.y + PAD * 2;
    const dpr = this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tl = L.point(-PAD, -PAD);

    for (const cv of [this.rasterCv, this.partCv]) {
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.transform = '';
      L.DomUtil.setPosition(cv, map.containerPointToLayerPoint(tl));
    }
    this.rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.zoom = map.getZoom();
    this.scale = 256 * 2 ** this.zoom;
    const nw = map.containerPointToLatLng(tl);
    this.ox = worldX(nw.lng, this.scale);
    this.oy = worldY(nw.lat, this.scale);
    this.cosC = Math.max(Math.cos(map.getCenter().lat * RAD), 0.15);
    // seconds of simulated time advanced per animation frame
    this.simDt = TARGET_PX * 3600 * 111.32 * 360 * this.cosC / this.scale;

    this.drawRaster();
    this.spawnAll();
  }

  _animZoom(e) {
    const map = this.map;
    const scale = map.getZoomScale(e.zoom, this.zoom);
    const origin = map._latLngToNewLayerPoint(map.containerPointToLatLng(L.point(-PAD, -PAD)), e.zoom, e.center);
    for (const cv of [this.rasterCv, this.partCv]) L.DomUtil.setTransform(cv, origin, scale);
  }

  lonAt(x) { return lonFromX(this.ox + x, this.scale); }
  latAt(y) { return latFromY(this.oy + y, this.scale); }
  xOf(lon) { return worldX(lon, this.scale) - this.ox; }
  yOf(lat) { return worldY(lat, this.scale) - this.oy; }

  /* ---------- data ---------- */
  setField(field) {
    this.field = field;
    this.drawRaster();
    this.spawnAll();
  }

  setTime(ms) {
    if (!this.field) return;
    this.field.setTime(this.field.indexFor(ms));
    this.drawRaster();
  }

  setLayer(id) {
    this.layer = layerById(id);
    this.drawRaster();
    if (!this.layer.particles) {
      this.stop();                       // nothing to animate — give the CPU back
      this.pctx.clearRect(0, 0, this.w, this.h);
    } else {
      this.spawnAll();
      this.start();
    }
  }

  setPlace(lat, lon, fly = true) {
    this.marker.setLatLng([lat, lon]);
    if (!fly) return;
    const zoom = Math.max(this.map.getZoom(), 5);
    const size = this.map.getSize();
    // flyTo divides by the viewport size; a pane that has not been laid out yet
    // yields NaN centres, so fall back to a plain jump in that case.
    if (!size.x || !size.y) this.map.setView([lat, lon], zoom, { animate: false });
    else this.map.flyTo([lat, lon], zoom, { duration: 0.9 });
  }

  recenter(lat, lon) { this.map.flyTo([lat, lon], 6, { duration: 0.8 }); }

  _maybeRefetch() {
    const b = this.map.getBounds();
    const f = this.field?.spec;
    const need = !f
      || b.getWest() < f.west || b.getEast() > f.east
      || b.getSouth() < f.south || b.getNorth() > f.north
      || (f.east - f.west) > (b.getEast() - b.getWest()) * 4.5;
    if (need) this.onBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
  }

  /* ---------- raster overlay ---------- */
  drawRaster() {
    const ctx = this.rctx;
    if (!this.w) return;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.field) return;

    const L_ = this.layer;
    const step = RASTER_STEP;
    const cols = Math.ceil(this.w / step) + 1;
    const rows = Math.ceil(this.h / step) + 1;

    if (!this._img || this._img.width !== cols || this._img.height !== rows) {
      this._small = document.createElement('canvas');
      this._small.width = cols; this._small.height = rows;
      this._sctx = this._small.getContext('2d');
      this._img = this._sctx.createImageData(cols, rows);
      this._scalar = new Float32Array(cols * rows);
    }
    const img = this._img.data;
    const lut = L_.lut;
    const scalar = this._scalar;

    // longitude is linear in x, so precompute the column longitudes
    const lons = new Float64Array(cols);
    for (let c = 0; c < cols; c++) lons[c] = this.lonAt(c * step);

    for (let r = 0; r < rows; r++) {
      const lat = this.latAt(r * step);
      for (let c = 0; c < cols; c++) {
        const v = this.field.sample(L_.field, lons[c], lat);
        const i = r * cols + c;
        scalar[i] = v;
        const li = (Math.round(L_.norm(v) * 511) << 2);
        const o = i << 2;
        img[o] = lut[li]; img[o + 1] = lut[li + 1]; img[o + 2] = lut[li + 2]; img[o + 3] = lut[li + 3];
      }
    }
    this._sctx.putImageData(this._img, 0, 0);

    ctx.save();
    ctx.globalAlpha = L_.alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this._small, 0, 0, cols, rows, 0, 0, cols * step, rows * step);
    ctx.restore();

    if (L_.isobars) this._drawIsobars(scalar, cols, rows, step);
  }

  /* marching-squares isobars — the classic synoptic-chart look */
  _drawIsobars(scalar, cols, rows, step) {
    const ctx = this.rctx;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < scalar.length; i++) { const v = scalar[i]; if (v < min) min = v; if (v > max) max = v; }
    const INTERVAL = 4;
    const first = Math.ceil(min / INTERVAL) * INTERVAL;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'center';
    for (let level = first; level <= max; level += INTERVAL) {
      const major = level % 20 === 0;
      ctx.strokeStyle = major ? 'rgba(235,244,255,.55)' : 'rgba(200,220,255,.26)';
      ctx.lineWidth = major ? 1.4 : 0.9;
      ctx.beginPath();
      let labelAt = null;
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = scalar[r * cols + c], b = scalar[r * cols + c + 1];
          const d = scalar[(r + 1) * cols + c + 1], e = scalar[(r + 1) * cols + c];
          const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (d > level ? 2 : 0) | (e > level ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x0 = c * step, y0 = r * step;
          const top    = () => [x0 + step * (level - a) / (b - a), y0];
          const right  = () => [x0 + step, y0 + step * (level - b) / (d - b)];
          const bottom = () => [x0 + step * (level - e) / (d - e), y0 + step];
          const left   = () => [x0, y0 + step * (level - a) / (e - a)];
          const seg = {
            1: [left, bottom], 2: [bottom, right], 3: [left, right], 4: [top, right],
            5: [top, left, bottom, right], 6: [top, bottom], 7: [top, left],
            8: [top, left], 9: [top, bottom], 10: [top, right, bottom, left], 11: [top, right],
            12: [left, right], 13: [bottom, right], 14: [left, bottom],
          }[idx];
          for (let s = 0; s < seg.length; s += 2) {
            const p1 = seg[s](), p2 = seg[s + 1]();
            ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
            if (!labelAt && major && p1[0] > PAD + 40 && p1[0] < this.w - PAD - 40 && p1[1] > PAD + 20) labelAt = p1;
          }
        }
      }
      ctx.stroke();
      if (labelAt) {
        ctx.fillStyle = 'rgba(10,16,32,.85)';
        ctx.fillRect(labelAt[0] - 15, labelAt[1] - 7, 30, 14);
        ctx.fillStyle = 'rgba(235,244,255,.85)';
        ctx.fillText(String(level), labelAt[0], labelAt[1] + 4);
      }
    }
    ctx.restore();
  }

  /* ---------- particles ---------- */
  spawnAll() {
    if (!this.layer.particles || !this.field) { this.particles = []; return; }
    const area = this.w * this.h;
    const n = clamp(Math.round(area / 950), 400, 4200);
    this.particles = new Array(n);
    for (let i = 0; i < n; i++) this.particles[i] = this._spawn({}, true);
    this.pctx.clearRect(0, 0, this.w, this.h);
  }

  _spawn(p, fresh) {
    const x = Math.random() * this.w;
    const y = Math.random() * this.h;
    p.lon = this.lonAt(x);
    p.lat = this.latAt(y);
    p.x = x; p.y = y;
    p.age = fresh ? Math.random() * 90 : 0;
    p.life = 55 + Math.random() * 75;
    return p;
  }

  step(dtScale) {
    const f = this.field;
    if (!f || !this.layer.particles) return;
    const ctx = this.pctx;
    const w = this.w, h = this.h;

    // fade the trails
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.94)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.lineCap = 'round';
    const dt = this.simDt * dtScale;

    for (const p of this.particles) {
      const px = p.x, py = p.y;
      f.sampleUV(p.lon, p.lat, this.uv);
      const u = this.uv[0], v = this.uv[1];               // km/h
      const spd = Math.hypot(u, v);

      const cosLat = Math.max(Math.cos(p.lat * RAD), 0.05);
      p.lon += (u / 3.6) * dt / (111320 * cosLat);
      p.lat += (v / 3.6) * dt / 110540;
      p.x = this.xOf(p.lon);
      p.y = this.yOf(p.lat);
      p.age++;

      const dx = p.x - px, dy = p.y - py;
      const out = p.x < 0 || p.x > w || p.y < 0 || p.y > h;
      if (out || p.age > p.life || Math.hypot(dx, dy) > MAX_STEP_PX) { this._spawn(p, false); continue; }
      if (spd < 0.6) { if (Math.random() < 0.02) this._spawn(p, false); continue; }

      // white streaks read cleanly over any colour ramp — the raster already
      // carries the speed information
      const fade = clamp(1 - p.age / p.life, 0, 1);
      ctx.strokeStyle = spd > 55 ? '#ffffff' : '#dbe8ff';
      ctx.globalAlpha = 0.22 + 0.62 * fade;
      ctx.lineWidth = spd > 55 ? 1.6 : 1.1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      const dt = this._lastT ? clamp((t - this._lastT) / 16.67, 0.2, 2.5) : 1;
      this._lastT = t;
      this.step(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); this._lastT = 0; }

  /* ---------- probe readout ---------- */
  _probe(e) {
    if (!this.field) return;
    const { lat, lng } = e.latlng;
    const f = this.field;
    const spd = f.sample('spd', lng, lat);
    const u = f.sample('u', lng, lat), v = f.sample('v', lng, lat);
    let dir = (Math.atan2(-u, -v) / RAD + 360) % 360;
    this.onProbe({
      lat, lon: lng, point: e.containerPoint,
      spd, dir, gust: f.sample('gust', lng, lat),
      temp: f.sample('temp', lng, lat),
      rain: f.sample('rain', lng, lat),
      cloud: f.sample('cloud', lng, lat),
      press: f.sample('press', lng, lat),
      rh: f.sample('rh', lng, lat),
    });
  }
}
