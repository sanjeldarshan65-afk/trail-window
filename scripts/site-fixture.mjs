// Local server and stubbed network for browser checks. Open-Meteo, map tiles
// and fonts are replaced with a deterministic fixture so runs work offline.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(fileURLToPath(import.meta.url), "../..");

// ---- Static server ----------------------------------------------------------
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".gpx": "application/gpx+xml",
};
const server = createServer(async (request, response) => {
  const path = normalize(
    decodeURIComponent(new URL(request.url, "http://x").pathname),
  );
  const file = join(root, path.endsWith("/") ? path + "index.html" : path);
  if (!file.startsWith(root)) return response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
let origin;
export async function startSite() {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => server.close() };
}

// ---- Forecast fixture -------------------------------------------------------
const timezone = "America/Denver";
export const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone,
}).format(new Date());
export const addDays = (date, days) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// Each day exercises a different tradeoff: cold start, heat, wind, flat (ties), rain.
const profiles = [
  { low: 33, high: 58, rain: () => 5, wind: 6, gust: 14, code: 1 },
  { low: 52, high: 86, rain: () => 0, wind: 5, gust: 12, code: 0 },
  { low: 48, high: 64, rain: () => 10, wind: 16, gust: 29, code: 2 },
  { low: 60, high: 60, rain: () => 0, wind: 4, gust: 9, code: 0 },
  {
    low: 44,
    high: 62,
    rain: (h) => (h >= 12 && h <= 16 ? 60 : 15),
    wind: 8,
    gust: 18,
    code: 61,
  },
];
function forecastFor(url) {
  const dates = profiles.map((_, i) => addDays(today, i));
  const hourly = {
    time: [],
    apparent_temperature: [],
    precipitation_probability: [],
    wind_speed_10m: [],
    wind_gusts_10m: [],
    weather_code: [],
  };
  dates.forEach((date, d) => {
    const p = profiles[d];
    for (let h = 0; h < 24; h++) {
      const warm = h >= 6 && h <= 20 ? Math.sin((Math.PI * (h - 6)) / 14) : 0;
      hourly.time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      hourly.apparent_temperature.push(
        +(p.low + (p.high - p.low) * warm).toFixed(1),
      );
      hourly.precipitation_probability.push(p.rain(h));
      hourly.wind_speed_10m.push(p.wind);
      hourly.wind_gusts_10m.push(p.gust);
      hourly.weather_code.push(p.code);
    }
  });
  const elevation = Number(url.searchParams.get("elevation"));
  return {
    latitude: Number(url.searchParams.get("latitude")),
    longitude: Number(url.searchParams.get("longitude")),
    elevation: Number.isFinite(elevation) && elevation ? elevation : 1288,
    timezone,
    hourly,
    daily: {
      time: dates,
      weather_code: profiles.map((p) => p.code),
      temperature_2m_max: profiles.map((p) => p.high + 2),
      temperature_2m_min: profiles.map((p) => p.low + 2),
      precipitation_probability_max: profiles.map((p) =>
        Math.max(...Array.from({ length: 24 }, (_, h) => p.rain(h))),
      ),
      sunrise: dates.map((date) => `${date}T07:25`),
      sunset: dates.map((date) => `${date}T19:00`),
      uv_index_max: [4.2, 6.8, 5.1, 5.5, 3.3],
      wind_gusts_10m_max: profiles.map((p) => p.gust),
    },
  };
}
// Clean air except a smoky midday on day 3, which crosses AQI 100.
function airFor() {
  const time = [];
  const us_aqi = [];
  profiles.forEach((_, d) => {
    const date = addDays(today, d);
    for (let h = 0; h < 24; h++) {
      time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      us_aqi.push(
        d === 2 && h >= 8 && h <= 16 ? 128 + h : 28 + d * 6 + (h % 5),
      );
    }
  });
  return { timezone, hourly: { time, us_aqi } };
}
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

// worker: { url, handle(route) } for a stubbed briefing Worker, or null.
// onUnexpected is called with any other outside origin, which is aborted.
export async function stubNetwork(context, worker, onUnexpected = () => {}) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      // Pin the briefing URL so runs never reach a real Worker.
      if (url.pathname === "/briefing.js") {
        const source = await readFile(join(root, "briefing.js"), "utf8");
        return route.fulfill({
          contentType: "text/javascript",
          body: source.replace(
            /const BRIEFING_URL = ".*?";/,
            `const BRIEFING_URL = ${JSON.stringify(worker?.url ?? "")};`,
          ),
        });
      }
      return route.continue();
    }
    if (url.hostname === "api.open-meteo.com")
      return route.fulfill({ json: forecastFor(url) });
    if (url.hostname === "air-quality-api.open-meteo.com")
      return route.fulfill({ json: airFor() });
    if (url.hostname === "geocoding-api.open-meteo.com")
      return route.fulfill({
        json: {
          results: [
            {
              name: "Salt Lake City",
              latitude: 40.76078,
              longitude: -111.89105,
              elevation: 1288,
              admin1: "Utah",
              country: "United States",
            },
          ],
        },
      });
    if (url.hostname === "tile.openstreetmap.org")
      return route.fulfill({ contentType: "image/png", body: PNG });
    if (url.hostname === "fonts.googleapis.com")
      return route.fulfill({ contentType: "text/css", body: "" });
    if (worker && url.href === worker.url) return worker.handle(route);
    onUnexpected(url.origin);
    return route.abort();
  });
}
