/* ============================================================
   field.js — bilinear + time interpolation over the grid
   ============================================================ */
'use strict';

import { clamp } from './util.js';

export class Field {
  constructor(raw) {
    this.spec = raw.spec;
    this.times = raw.times;      // UTC ms per hourly step
    this.nt = raw.nt;
    this.n = raw.n;
    this.d = raw.data;
    this.setTime(0);
  }

  /* fractional step index for a UTC timestamp */
  indexFor(ms) {
    const t = this.times;
    if (ms <= t[0]) return 0;
    if (ms >= t[t.length - 1]) return t.length - 1;
    const step = t[1] - t[0];
    return clamp((ms - t[0]) / step, 0, t.length - 1);
  }

  setTime(ti) {
    this.t0 = clamp(Math.floor(ti), 0, this.nt - 1);
    this.t1 = Math.min(this.t0 + 1, this.nt - 1);
    this.ft = clamp(ti - this.t0, 0, 1);
    this.b0 = this.t0 * this.n;
    this.b1 = this.t1 * this.n;
  }

  /* Grid cell + weights for a lon/lat (clamped to the grid edges).
     Weights are smoothstepped: plain bilinear on a coarse grid leaves visible
     diamond facets at the cell corners, smoothstep is C1 across boundaries. */
  locate(lon, lat) {
    const s = this.spec;
    const fx = clamp((lon - s.west) / s.dLon, 0, s.nx - 1.0001);
    const fy = clamp((lat - s.south) / s.dLat, 0, s.ny - 1.0001);
    const i0 = fx | 0, j0 = fy | 0;
    const tx = fx - i0, ty = fy - j0;
    return { k: j0 * s.nx + i0, tx: tx * tx * (3 - 2 * tx), ty: ty * ty * (3 - 2 * ty) };
  }

  _bilinear(arr, base, k, tx, ty) {
    const nx = this.spec.nx;
    const a = arr[base + k], b = arr[base + k + 1];
    const c = arr[base + k + nx], d = arr[base + k + nx + 1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }

  /* sample one variable at lon/lat, at the currently-set time */
  sample(key, lon, lat) {
    const arr = this.d[key];
    if (!arr) return 0;
    const { k, tx, ty } = this.locate(lon, lat);
    const v0 = this._bilinear(arr, this.b0, k, tx, ty);
    if (this.ft === 0 || this.t0 === this.t1) return v0;
    const v1 = this._bilinear(arr, this.b1, k, tx, ty);
    return v0 + (v1 - v0) * this.ft;
  }

  /* wind components in km/h — written into `out` to avoid allocation */
  sampleUV(lon, lat, out) {
    const { k, tx, ty } = this.locate(lon, lat);
    const u0 = this._bilinear(this.d.u, this.b0, k, tx, ty);
    const v0 = this._bilinear(this.d.v, this.b0, k, tx, ty);
    if (this.ft === 0 || this.t0 === this.t1) { out[0] = u0; out[1] = v0; return out; }
    const u1 = this._bilinear(this.d.u, this.b1, k, tx, ty);
    const v1 = this._bilinear(this.d.v, this.b1, k, tx, ty);
    out[0] = u0 + (u1 - u0) * this.ft;
    out[1] = v0 + (v1 - v0) * this.ft;
    return out;
  }

  covers(lon, lat) {
    const s = this.spec;
    return lon >= s.west && lon <= s.east && lat >= s.south && lat <= s.north;
  }
}
