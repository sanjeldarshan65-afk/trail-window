// Responsive and runtime check for Trail Window.
//
//   node scripts/responsive-check.mjs [--out screenshots]
//
// Serves the site locally, stubs Open-Meteo, map tiles and fonts with a
// deterministic fixture, then at 390, 768 and 1280 px: loads the page, switches
// presets, activities and day cards, asserts there is no horizontal page scroll,
// no console errors and 44 px tap targets on phones, and saves screenshots.
// It also checks the briefing card in template mode, with a stubbed Worker,
// with a failing Worker and with a Worker that times out.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const outIndex = process.argv.indexOf("--out");
const outDir = resolve(
  root,
  outIndex > -1 ? process.argv[outIndex + 1] : "screenshots",
);
const WIDTHS = [390, 768, 1280];
const WORKER = "https://briefing.test.invalid/";
const failures = [];
const fail = (message) => {
  failures.push(message);
  console.error("  ✗ " + message);
};
const pass = (message) => console.log("  ✓ " + message);

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
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---- Forecast fixture -------------------------------------------------------
const timezone = "America/Denver";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
  new Date(),
);
const addDays = (date, days) => {
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
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

async function stubNetwork(context, worker) {
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
    if (worker && url.href === WORKER) return worker.handle(route);
    fail(`Unexpected request to ${url.origin}`);
    return route.abort();
  });
}

async function openPage(browser, width, worker) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: width < 800 ? 2 : 1,
  });
  await stubNetwork(context, worker);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/");
  await page.locator("#results").waitFor({ state: "visible" });
  return { context, page, errors };
}

const briefingSettled = (page) =>
  page.waitForFunction(
    () =>
      document.querySelector("#briefing").getAttribute("aria-busy") ===
        "false" && document.querySelector("#briefing-text").textContent.trim(),
    null,
    { timeout: 12000 },
  );

async function noHorizontalScroll(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (scrollWidth <= innerWidth)
    pass(`${label}: no horizontal scroll (${scrollWidth} <= ${innerWidth})`);
  else
    fail(
      `${label}: page scrolls horizontally (${scrollWidth} > ${innerWidth})`,
    );
}

async function smallTapTargets(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        !el.closest("[hidden], details:not([open]) > :not(summary)")
      );
    };
    const targets = [
      ...document.querySelectorAll(
        "button, a[href], summary, select, input:not([type=checkbox]):not([type=file]), label.pack-item, label.upload-button",
      ),
    ].filter(
      (el) =>
        visible(el) &&
        !el.closest(".leaflet-control-attribution, .leaflet-marker-pane"),
    );
    return targets
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          name: (
            el.getAttribute("aria-label") ||
            el.textContent ||
            el.id ||
            el.className
          )
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((t) => t.height < 44 || t.width < 44);
  });
}

// ---- Run --------------------------------------------------------------------
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    console.log(`\n${width}px`);
    const { context, page, errors } = await openPage(browser, width);
    await briefingSettled(page);
    await noHorizontalScroll(page, "initial load");

    const days = page.locator("#days .day");
    const count = await days.count();
    for (let i = 0; i < count; i++) {
      await days.nth(i).click();
      await briefingSettled(page);
      await noHorizontalScroll(page, `day ${i + 1}`);
    }
    const flatDay = days.nth(3);
    await flatDay.click();
    const tie = await page.locator(".tie-note").textContent();
    if (/^\d+ windows tie/.test(tie || ""))
      pass(`tie note: "${tie.slice(0, 22)}…"`);
    else fail(`tie note missing or wrong on flat day: ${tie}`);
    const tieStyle = await page.evaluate(() => {
      const a = getComputedStyle(document.querySelector(".tie-note"));
      const b = getComputedStyle(document.querySelector("#forecast-context"));
      return a.fontSize === b.fontSize && a.color === b.color;
    });
    if (tieStyle) pass("tie note matches the Fetched caption style");
    else fail("tie note style differs from the Fetched caption");

    for (const activity of ["biking", "running", "hiking"]) {
      await page.click(`[data-activity="${activity}"]`);
      await briefingSettled(page);
    }
    for (const preset of ["Brighton", "Trial Lake", "Salt Lake City"]) {
      const loaded = page.waitForResponse((r) =>
        r.url().startsWith("https://api.open-meteo.com/"),
      );
      await page.getByRole("button", { name: preset }).click();
      await loaded;
      await page.locator("#results").waitFor({ state: "visible" });
      await briefingSettled(page);
      await noHorizontalScroll(page, `preset ${preset}`);
    }
    const badge = await page.locator("#briefing-source").isVisible();
    if (badge) pass("briefing shows template badge with no Worker configured");
    else fail("template badge hidden with no Worker configured");

    if (width === 390) {
      const small = await smallTapTargets(page);
      if (small.length)
        fail(`tap targets under 44px: ${JSON.stringify(small)}`);
      else pass("all visible tap targets are at least 44px");
      const sidebarAbove = await page.evaluate(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().bottom <=
          document.querySelector("main").getBoundingClientRect().top + 1,
      );
      if (sidebarAbove) pass("sidebar stacks above main content");
      else fail("sidebar does not stack above main content");
    }

    // Tomorrow always has daylight windows, whatever time the check runs.
    await page.locator("#days .day").nth(1).click();
    await briefingSettled(page);
    await page.screenshot({
      path: join(outDir, `trail-window-${width}.png`),
      fullPage: true,
    });
    if (errors.length) fail(`console errors: ${errors.join(" | ")}`);
    else pass("no console errors");
    await context.close();
  }

  console.log("\nBriefing with a configured Worker");
  let workerCalls = 0;
  const ai = await openPage(browser, 1280, {
    url: WORKER,
    handle: (route) => {
      workerCalls++;
      const body = JSON.parse(route.request().postData());
      return route.fulfill({
        json: { briefing: `AI briefing for ${body.window.start}.` },
        headers: { "Access-Control-Allow-Origin": origin },
      });
    },
  });
  await briefingSettled(ai.page);
  const days = ai.page.locator("#days .day");
  await days.nth(2).click();
  await briefingSettled(ai.page);
  const callsAfterTwoDays = workerCalls;
  await days.nth(0).click();
  await days.nth(2).click();
  await briefingSettled(ai.page);
  const text = await ai.page.locator("#briefing-text").textContent();
  if (/^AI briefing for /.test(text)) pass(`shows Worker text: "${text}"`);
  else fail(`Worker text not shown: ${text}`);
  if (!(await ai.page.locator("#briefing-source").isVisible()))
    pass("no template badge on AI briefing");
  else fail("template badge visible on AI briefing");
  if (workerCalls === callsAfterTwoDays)
    pass(`cached: ${workerCalls} Worker calls after revisiting days`);
  else fail(`revisiting days called the Worker again (${workerCalls})`);
  await ai.page.screenshot({ path: join(outDir, "briefing-ai.png") });
  if (ai.errors.length) fail(`console errors: ${ai.errors.join(" | ")}`);
  await ai.context.close();

  console.log("\nBriefing with a failing Worker");
  const broken = await openPage(browser, 390, {
    url: WORKER,
    handle: (route) =>
      route.fulfill({
        status: 502,
        json: { error: "Briefing unavailable." },
        headers: { "Access-Control-Allow-Origin": origin },
      }),
  });
  await briefingSettled(broken.page);
  if (await broken.page.locator("#briefing-source").isVisible())
    pass("502 falls back to the template");
  else fail("502 did not fall back to the template");
  // The failed request itself logs a resource error; anything else is a bug.
  const unexpected = broken.errors.filter((e) => !/status of 502/.test(e));
  if (unexpected.length) fail(`console errors: ${unexpected.join(" | ")}`);
  await broken.context.close();

  console.log("\nBriefing with a Worker that never answers");
  const slow = await openPage(browser, 768, {
    url: WORKER,
    handle: () => new Promise(() => {}),
  });
  const skeleton = await slow.page.locator(".briefing-skeleton").isVisible();
  if (skeleton) pass("skeleton shows while loading");
  else fail("no skeleton while loading");
  const started = Date.now();
  await briefingSettled(slow.page);
  const waited = Date.now() - started;
  if (await slow.page.locator("#briefing-source").isVisible())
    pass(
      `timeout falls back to the template after ~${Math.round(waited / 1000)} s`,
    );
  else fail("timeout did not fall back to the template");
  if (slow.errors.length) fail(`console errors: ${slow.errors.join(" | ")}`);
  await slow.context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(`\nScreenshots saved to ${outDir}`);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("All responsive checks passed.");
