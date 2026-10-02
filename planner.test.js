const assert = require("node:assert/strict");
const { findWindow, rankWindows } = require("./planner");
const day = "2026-10-02";
const hours = Array.from({ length: 24 }, (_, hour) => ({
  time: `${day}T${String(hour).padStart(2, "0")}:00`,
  feels: 65,
  rain: 0,
  wind: 5,
  code: 0,
}));
const rise = `${day}T07:25`,
  set = `${day}T19:07`;
const best = findWindow(hours, 3, "hiking", rise, set, `${day}T09:15`);
assert.equal(best.start, `${day}T10:00`);
assert.equal(best.end, `${day}T13:00`);
assert.equal(findWindow(hours, 3, "hiking", rise, set, `${day}T17:00`), null);
assert.equal(
  findWindow(
    hours.map((h) => ({ ...h, code: 95 })),
    1,
    "hiking",
    rise,
    set,
    `${day}T00:00`,
  ),
  null,
);
const missing = hours.map((h) => ({ ...h, rain: null }));
assert.equal(findWindow(missing, 2, "hiking", rise, set, `${day}T00:00`), null);
assert.equal(
  findWindow(hours, 5, "hiking", rise, set, `${day}T00:00`).start,
  `${day}T08:00`,
);
console.log(
  "Window logic: daylight, elapsed time, duration, thunderstorms and missing data passed.",
);
assert.equal(
  findWindow(
    hours.map((h) => ({ ...h, gust: 45 })),
    2,
    "hiking",
    rise,
    set,
    `${day}T00:00`,
    { gust: 30 },
  ),
  null,
);
assert.equal(
  findWindow(
    hours.map((h) => ({ ...h, rain: 60 })),
    2,
    "hiking",
    rise,
    set,
    `${day}T00:00`,
    { rain: 50 },
  ),
  null,
);
assert.equal(
  findWindow(
    hours.filter((h) => h.time !== `${day}T10:00`),
    3,
    "hiking",
    rise,
    set,
    `${day}T08:00`,
  ).start,
  `${day}T11:00`,
);
assert.equal(
  findWindow(hours, 1, "hiking", rise, `${day}T19:07`, `${day}T18:00`),
  null,
);
assert.equal(findWindow(hours, 1, "hiking", rise, set, `${day}T19:00`), null);
const ranked = rankWindows(
  hours.map((h) => ({ ...h, rain: 10, gust: 12 })),
  2,
  "hiking",
  rise,
  set,
  `${day}T08:00`,
);
assert.equal(ranked[0].components.rain, 7);
assert.equal(
  ranked[0].score,
  Object.values(ranked[0].components).reduce((a, b) => a + b, 0),
);
assert.equal(findWindow(hours, 0, "hiking", rise, set, `${day}T00:00`), null);
console.log(
  "Weather limits, missing hours, daylight buffer and score explanations passed.",
);
const hotDay = hours.map((hour, index) => ({
  ...hour,
  feels: index >= 12 ? 80 : 65,
}));
const hotRanked = rankWindows(hotDay, 2, "hiking", rise, set, `${day}T00:00`);
assert.equal(hotRanked[0].start, `${day}T08:00`);
assert.equal(
  hotRanked.find((window) => window.start === `${day}T12:00`).components
    .temperature,
  7.5,
);
assert.ok(
  hotRanked.find((window) => window.start === `${day}T12:00`).score >
    hotRanked[0].score,
);
assert.equal(
  rankWindows(hours, 2, "hiking", rise, set, `${day}T00:00`)[0].start,
  `${day}T08:00`,
);
console.log(
  "Warm noon windows rank below comfortable mornings; exact ties favor earlier starts.",
);
