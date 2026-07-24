# Aurora Weather 🌌❄️

A cosmic-glass, real-time weather dashboard. Deep-space background with animated
stars and weather particles, a live sunlight arc, 24-hour temperature trend,
7-day forecast, and a full grid of atmospheric metrics.

**Live weather data from [Open-Meteo](https://open-meteo.com) — no API key required.**

> Tip: drop a screenshot at `assets/preview.png` and it will show here.

## Features

- 🌍 **Live data, any city** — search worldwide via Open-Meteo geocoding
- 🌡️ Current temperature, "feels like", precipitation probability, cloud cover
- ☀️ **Sunlight track** — animated sun position, sunrise / noon / sunset, day length & % elapsed
- 📈 **24-hour trend** — area chart with hourly temps and precipitation probability
- 📅 **7-day forecast** — min–max range bars and conditions
- 💧 Humidity · Wind (speed + compass direction) · UV index · Air quality (AQI) · Pressure · Visibility
- ⚠️ Smart advisories (wind chill, snow, heavy rain, strong wind, heat)
- 🎞️ Live cosmic background — starfield plus **snow / rain / wind / sunny** particle scenes
- 🕒 City-local clock that ticks in real time
- 🔊 Optional generated ambient sound · 🔁 refresh · °C / °F toggle
- 📱 Responsive (desktop → mobile) and respects `prefers-reduced-motion`

## Tech

Zero dependencies, zero build step — plain **HTML + CSS + vanilla JS**.
All charts and icons are hand-rendered SVG/Canvas. Deploys anywhere static.

## Run locally

```bash
# any static server works, e.g.
python3 -m http.server 5178
# then open http://localhost:5178
```

## Deploy

- **Vercel** — import the repo (framework preset: *Other*), no env vars needed.
- **GitHub Pages** — Settings → Pages → deploy from branch (root).

## Data sources

- Forecast & current: `api.open-meteo.com`
- Geocoding: `geocoding-api.open-meteo.com`
- Air quality: `air-quality-api.open-meteo.com`

All free, keyless, and called directly from the browser.

## License

MIT
