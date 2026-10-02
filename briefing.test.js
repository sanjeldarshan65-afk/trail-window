const assert = require("node:assert/strict");
const { rankWindows } = require("./planner");
const briefing = require("./briefing");

const day = "2026-10-02";
const clockTime = (time) => {
  const hour = Number(time.slice(11, 13));
  const minute = time.slice(14, 16);
  return `${hour % 12 || 12}${minute === "00" ? "" : ":" + minute} ${hour >= 12 ? "PM" : "AM"}`;
};
const hours = Array.from({ length: 24 }, (_, hour) => ({
  time: `${day}T${String(hour).padStart(2, "0")}:00`,
  feels: 30 + hour * 2,
  rain: hour > 14 ? 30 : 0,
  wind: 6,
  gust: 14,
  code: 0,
}));
const ranked = rankWindows(
  hours,
  2,
  "hiking",
  `${day}T07:10`,
  `${day}T19:05`,
  `${day}T00:00`,
);
const input = (overrides = {}) => ({
  location: "Brighton forecast point",
  activity: "hiking",
  duration: 2,
  window: ranked[0],
  compared: ranked.slice(0, 3),
  sunset: `${day}T19:05`,
  elevation: 2679.4,
  uvIndexMax: 6.2,
  clockTime,
  ...overrides,
});

const payload = briefing.buildPayload(input());
assert.deepEqual(Object.keys(payload).sort(), [
  "activity",
  "durationHours",
  "elevationM",
  "feelsLikeF",
  "location",
  "maxRainPct",
  "penalties",
  "sunset",
  "uvIndexMax",
  "windMph",
  "window",
]);
assert.equal(payload.window.start, clockTime(ranked[0].start));
assert.equal(payload.penalties[0].start, payload.window.start);
assert.ok(payload.penalties.length <= 3);
assert.equal(payload.sunset, "7:05 PM");
assert.equal(payload.elevationM, 2679);
assert.doesNotMatch(JSON.stringify(payload), /latitude|longitude|40\.6/);
assert.equal(
  briefing.buildPayload(input({ location: "Café <b>Trail</b>\n" })).location,
  "Café b Trail /b",
);
assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 4096);

const cold = briefing.templateBriefing({
  ...payload,
  feelsLikeF: { min: 34, max: 47 },
  penalties: [
    { ...payload.penalties[0], rain: 0, wind: 0, temperature: 6, total: 6 },
  ],
});
assert.match(cold, /cold start at 34°F/);
assert.match(cold, /Sunset is at 7:05 PM\./);
assert.match(cold, /UV peaks at 6/);
const sentences = cold.match(/[^.]+\.(?=\s|$)/g);
assert.ok(sentences.length >= 2 && sentences.length <= 4, cold);
const windy = briefing.templateBriefing({
  ...payload,
  windMph: { sustained: 18, gust: 31 },
  penalties: [
    { ...payload.penalties[0], rain: 1, wind: 20, temperature: 0, total: 21 },
  ],
});
assert.match(windy, /gusts to 31 mph .* exposed terrain/);
const hot = briefing.templateBriefing({
  ...payload,
  feelsLikeF: { min: 70, max: 88 },
  penalties: [
    { ...payload.penalties[0], rain: 0, wind: 0, temperature: 19, total: 19 },
  ],
});
assert.match(hot, /heat, with feels-like reaching 88°F/);
assert.doesNotMatch(cold + windy + hot, /\bsafe\b|undefined|NaN/i);
console.log(
  "Briefing payload holds only derived data; templates name the tradeoff.",
);

(async () => {
  const noUrl = await briefing.getBriefing("k-none", payload, { url: "" });
  assert.equal(noUrl.source, "template");
  assert.equal(briefing.cached("k-none"), noUrl);

  let calls = 0;
  const ok = async (url, init) => {
    calls++;
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "omit");
    assert.deepEqual(JSON.parse(init.body), payload);
    return { ok: true, json: async () => ({ briefing: " AI words. " }) };
  };
  const [first, second] = await Promise.all([
    briefing.getBriefing("k-ai", payload, { url: "https://w", fetch: ok }),
    briefing.getBriefing("k-ai", payload, { url: "https://w", fetch: ok }),
  ]);
  const third = await briefing.getBriefing("k-ai", payload, {
    url: "https://w",
    fetch: ok,
  });
  assert.deepEqual(first, { text: "AI words.", source: "ai" });
  assert.equal(second, first);
  assert.equal(third, first);
  assert.equal(calls, 1);

  const failed = await briefing.getBriefing("k-500", payload, {
    url: "https://w",
    fetch: async () => ({ ok: false, json: async () => ({}) }),
  });
  assert.equal(failed.source, "template");
  const rejected = await briefing.getBriefing("k-net", payload, {
    url: "https://w",
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  assert.equal(rejected.source, "template");
  const empty = await briefing.getBriefing("k-empty", payload, {
    url: "https://w",
    fetch: async () => ({ ok: true, json: async () => ({ briefing: "" }) }),
  });
  assert.equal(empty.source, "template");

  const started = Date.now();
  const timedOut = await briefing.getBriefing("k-slow", payload, {
    url: "https://w",
    timeoutMs: 50,
    fetch: (url, init) =>
      new Promise((resolve, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  });
  assert.equal(timedOut.source, "template");
  assert.ok(Date.now() - started < 1000);
  assert.equal(briefing.TIMEOUT_MS, 8000);
  console.log(
    "Briefing requests cache per key and fall back on failure or timeout.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
