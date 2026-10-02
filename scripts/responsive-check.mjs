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
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import {
  addDays,
  root,
  startSite,
  stubNetwork,
  today,
} from "./site-fixture.mjs";
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

const { origin, close } = await startSite();

async function openPage(browser, width, worker, path = "/") {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: width < 800 ? 2 : 1,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await stubNetwork(context, worker, (host) =>
    fail(`Unexpected request to ${host}`),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + path);
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
    if (/[?&]lat=40\.76080&lon=-111\.89100/.test(page.url()))
      pass("address bar holds the current plan");
    else fail(`address bar not synced: ${page.url()}`);

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
    const label = await page.locator("#briefing-label-text").textContent();
    const badge = await page.locator("#briefing-source").isVisible();
    if (!badge && !/AI/.test(label))
      pass(`no AI claim with no Worker configured: "${label.trim()}"`);
    else fail(`card claims AI with no Worker configured: "${label.trim()}"`);

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
    if (width === 1280)
      await page.screenshot({
        path: join(outDir, "trail-window-1280-plan.png"),
        fullPage: true,
        clip: await page.evaluate(() => {
          const top = document.querySelector(".forecast-heading");
          const bottom = document.querySelector(".briefing");
          const a = top.getBoundingClientRect();
          const b = bottom.getBoundingClientRect();
          return {
            x: a.left - 24,
            y: a.top + scrollY - 24,
            width: a.width + 48,
            height: b.bottom - a.top + 48,
          };
        }),
      });
    if (errors.length) fail(`console errors: ${errors.join(" | ")}`);
    else pass("no console errors");
    await context.close();
  }

  console.log("\nAir quality and avalanche link");
  {
    const { context, page, errors } = await openPage(browser, 1280);
    const airMetric = page.locator(".metric", { hasText: "Air quality" });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".metric")].some(
        (m) =>
          /Air quality/.test(m.textContent) && !/Loading/.test(m.textContent),
      ),
    );
    await page.locator("#days .day").nth(1).click();
    const clean = await airMetric.textContent();
    if (/\d+Good/.test(clean)) pass(`clean day: "${clean}"`);
    else fail(`clean day air metric: "${clean}"`);
    if (
      !/Air quality reaches/.test(
        await page.locator("#window-reason").textContent(),
      )
    )
      pass("no air quality alert on a clean day");
    else fail("air quality alert on a clean day");
    await page.locator("#days .day").nth(2).click();
    const smoky = await airMetric.textContent();
    const reason = await page.locator("#window-reason").textContent();
    if (
      /1\d\dSensitive groups/.test(smoky) &&
      /Air quality reaches AQI 1\d\d \(unhealthy for sensitive groups\)/.test(
        reason,
      )
    )
      pass(`smoky day: "${smoky}" and the window card warns`);
    else fail(`smoky day metric "${smoky}", reason "${reason}"`);
    await page.getByRole("button", { name: "Brighton" }).click();
    await page.locator("#results").waitFor({ state: "visible" });
    const month = Number(today.slice(5, 7));
    const inSeason = month >= 11 || month <= 5;
    const avalanche = await page.locator("#avalanche-note").isVisible();
    if (avalanche === inSeason)
      pass(
        `avalanche link ${inSeason ? "shown" : "hidden"} for Brighton in month ${month}`,
      );
    else fail(`avalanche link visible=${avalanche} in month ${month}`);
    if (errors.length) fail(`console errors: ${errors.join(" | ")}`);
    await context.close();
  }
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await stubNetwork(context, null);
    await context.route("https://air-quality-api.open-meteo.com/**", (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(origin + "/");
    await page.locator("#results").waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".metric")].some((m) =>
        /Unavailable/.test(m.textContent),
      ),
    );
    const status = await page.locator("#status").textContent();
    if (!status && !pageErrors.length)
      pass("air quality failure shows Unavailable and nothing else breaks");
    else
      fail(`air failure: status "${status}", errors ${pageErrors.join(" | ")}`);
    await context.close();
  }

  console.log("\nOffline and retry");
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await stubNetwork(context, null, (host) =>
      fail(`Unexpected request to ${host}`),
    );
    let offline = true;
    await context.route("https://api.open-meteo.com/**", (route) =>
      offline ? route.abort("internetdisconnected") : route.fallback(),
    );
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(origin + "/");
    await page.locator("#retry").waitFor({ state: "visible" });
    const message = await page.locator("#status").textContent();
    if (/Can't reach the weather service/.test(message))
      pass(`offline shows a friendly message: "${message}"`);
    else fail(`offline message: "${message}"`);
    offline = false;
    await page.click("#retry");
    await page.locator("#results").waitFor({ state: "visible" });
    if (await page.locator("#retry").isHidden())
      pass("Try again loads the forecast and hides itself");
    else fail("retry button still visible after a successful retry");
    if (pageErrors.length) fail(`page errors: ${pageErrors.join(" | ")}`);
    await context.close();
  }

  console.log("\nDay chosen on first load");
  for (const [clock, expectJump] of [
    ["21:00", true],
    ["07:00", false],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await context.clock.install({
      time: new Date(`${today}T${clock}:00-06:00`),
    });
    await stubNetwork(context, null);
    const page = await context.newPage();
    await page.goto(origin + "/");
    await page.locator("#results").waitFor({ state: "visible" });
    const note = page.locator("#day-note");
    const shown = await note.isVisible();
    const day = await page.evaluate(() =>
      [...document.querySelectorAll("#days .day")].findIndex((d) =>
        d.classList.contains("active"),
      ),
    );
    if (expectJump && shown && day > 0)
      pass(
        `at ${clock} today is skipped with a note: "${await note.textContent()}"`,
      );
    else if (!expectJump && !shown && day === 0)
      pass(`at ${clock} today opens with no note`);
    else fail(`at ${clock}: day ${day}, note shown ${shown}`);
    const fold = await page.evaluate(
      () =>
        document.querySelector(".recommendation").getBoundingClientRect()
          .bottom,
    );
    if (fold <= 800)
      pass(
        `best window fits above the fold at 1280×800 (${Math.round(fold)}px)`,
      );
    else
      fail(
        `best window ends below the fold at 1280×800 (${Math.round(fold)}px)`,
      );
    if (shown) {
      await page.locator("#days .day").first().click();
      if (await note.isHidden()) pass("note clears when you pick a day");
      else fail("day note stays after picking a day");
    }
    await context.close();
  }

  console.log("\nShared plan link");
  const tomorrow = addDays(today, 1);
  const shared = await openPage(
    browser,
    390,
    null,
    `/?place=Brighton%20forecast%20point&lat=40.6&lon=-111.58333&elev=2679&region=Utah&country=United%20States&date=${tomorrow}&activity=biking&hours=3&rain=40&gust=25`,
  );
  await briefingSettled(shared.page);
  const restored = await shared.page.evaluate(() => ({
    heading: document.querySelector("#place-heading").textContent,
    ride: document
      .querySelector('[data-activity="biking"]')
      .getAttribute("aria-pressed"),
    hours: document.querySelector("#duration").value,
    rain: document.querySelector("#rain-limit").value,
    gust: document.querySelector("#gust-limit").value,
    day: [...document.querySelectorAll("#days .day")].findIndex(
      (d) => d.getAttribute("aria-pressed") === "true",
    ),
  }));
  const expected = {
    heading: "Brighton forecast point",
    ride: "true",
    hours: "3",
    rain: "40",
    gust: "25",
    day: 1,
  };
  if (JSON.stringify(restored) === JSON.stringify(expected))
    pass("link restores place, day, activity, duration and limits");
  else fail(`link restored ${JSON.stringify(restored)}`);
  await shared.page.locator("#days .day").nth(2).click();
  await shared.page.click("#share-plan");
  const copied = await shared.page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  if (
    copied.includes(`date=${addDays(today, 2)}`) &&
    copied.includes("activity=biking") &&
    (await shared.page.locator("#share-plan").textContent()).includes(
      "Link copied",
    )
  )
    pass("Copy link copies the plan on screen");
  else fail(`Copy link copied: ${copied}`);
  await noHorizontalScroll(shared.page, "shared plan with two buttons");
  if (shared.errors.length)
    fail(`console errors: ${shared.errors.join(" | ")}`);
  await shared.context.close();

  const expired = await openPage(
    browser,
    1280,
    null,
    "/?place=Old%20plan&lat=40.6&lon=-111.58&date=2020-01-01",
  );
  const note = await expired.page.locator("#status").textContent();
  if (/no longer in the forecast/.test(note))
    pass("expired link explains it shows the current forecast");
  else fail(`expired link status: "${note}"`);
  await expired.context.close();

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
  if (
    /^AI briefing/.test(
      await ai.page.locator("#briefing-label-text").textContent(),
    )
  )
    pass("card is labelled as an AI briefing");
  else fail("AI briefing not labelled as AI");
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
  close();
}

console.log(`\nScreenshots saved to ${outDir}`);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("All responsive checks passed.");
