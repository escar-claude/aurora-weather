# Aurora WX 🌪️

A professional-feeling weather console: an **animated wind-field map**, a
**multi-track meteogram**, a 72-hour timeline you can scrub and play, and a full
sidebar of atmospheric instrumentation — all on a deep-space glass UI.

**Live data from [Open-Meteo](https://open-meteo.com) — no API key, no signup, no secrets.**

> Tip: drop a screenshot at `assets/preview.png` and it will show here.

## Features

### Map stage
- 🌬️ **Animated wind particles** advected through a real Open-Meteo wind grid
  (96 grid points × 96 hours fetched in a single request)
- 🎨 **Six overlay layers** — wind · temperature · rain · cloud · humidity · pressure,
  smoothly interpolated and colour-ramped, with a live legend
- 🌀 **Isobars** on the pressure layer (marching squares, labelled every 20 hPa)
- 🔎 **Hover probe** — wind barb, gust, temp, rain, cloud, humidity and pressure
  wherever the cursor is
- 📍 **Click anywhere** on the map for a full forecast at that point
- 🗺️ Dark CARTO basemap with labels drawn *above* the weather so they stay readable

### Timeline
- ⏱️ **72 hours, hour by hour** — drag, click, arrow-key or press play
- 🔗 Drives the map field, the meteogram cursor **and the whole sidebar** — index 0
  is the live observation, anything later is flagged `FORECAST`

### Meteogram
- 🌡️ Temperature curve colour-ramped by value, plus apparent temperature
- 🧭 Pressure on its own right-hand axis, freezing line, night shading, day dividers
- 🌧️ Precipitation bars (snow tinted separately) with probability overlay
- 💨 Wind speed area, gust line and direction arrows
- ☁️ Low / mid / high cloud band
- 🖱️ Hover crosshair with a full hourly readout · 24H / 3D / 7D ranges

### Sidebar
- Current conditions, advisories (wind chill, storm, snow, gale, heavy rain, heat, UV)
- Wind + **Beaufort**, gusts, humidity + dew point, **3-hour pressure tendency**,
  UV index, visibility
- ☀️ Sun arc with sunrise / solar noon / sunset and 🌙 **moon phase** with illumination
- 🌫️ Air quality — European AQI plus PM2.5 / PM10 / O₃ / NO₂
- 📅 7-day outlook; click a day to jump the timeline there

### Everything else
- 🔍 City search, ⭐ saved cities, 📡 geolocation, 🔗 shareable URL hash
- 🌡️ °C / °F and km/h · m/s · mph · kt, both remembered
- 🕒 City-local clock · 🔊 optional generated ambient sound
- ⌨️ Shortcuts: `/` search · `space` play · `←/→` scrub · `1–6` layers ·
  `u` units · `w` wind units · `r` refresh · `l` locate · `s` save · `m` meteogram · `n` now
- 📱 Responsive down to phone width, respects `prefers-reduced-motion`

## Tech

No build step and no runtime CDN. Plain **HTML + CSS + ES modules**; Leaflet 1.9.4
is vendored into `vendor/`. Every chart, icon and overlay is hand-rendered
SVG or Canvas.

```
js/
  app.js        state, boot, timeline, controls, search, URL
  windmap.js    Leaflet map + particle engine + raster layers + isobars
  meteogram.js  multi-track forecast chart
  panels.js     sidebar renderers
  field.js      grid interpolation (smoothstep bilinear + time)
  scales.js     colour ramps and layer definitions
  api.js        Open-Meteo access layer
  sky.js        ambient starfield
  util.js       helpers, WMO codes, weather icons
```

`window.auroraWX` exposes `{ state, map, meteo, refresh, setTimeIndex, setLayer }`
in the console for debugging.

## Run locally

```bash
python3 devserver.py 5178
```

Then open <http://localhost:5178>. (`devserver.py` is just `http.server` with
`Cache-Control: no-store`, so edits show up on a plain reload.)

## Deploy

- **Vercel** — import the repo (framework preset: *Other*), no env vars needed.
  `vercel.json` sets sensible cache headers.
- **GitHub Pages** — Settings → Pages → deploy from branch (root).

## Data sources

- Forecast, current & wind grid: `api.open-meteo.com`
- Geocoding: `geocoding-api.open-meteo.com`
- Air quality: `air-quality-api.open-meteo.com`
- Basemap tiles: OpenStreetMap contributors, © CARTO

All free, keyless, and called directly from the browser.

## License

MIT. Leaflet is BSD-2-Clause (see `vendor/`).
