const assert = require("node:assert/strict");
const {
  aqiCategory,
  maxAqi,
  daytimeHours,
  avalancheLink,
} = require("./conditions");

assert.equal(aqiCategory(0), "Good");
assert.equal(aqiCategory(50), "Good");
assert.equal(aqiCategory(50.4), "Good");
assert.equal(aqiCategory(51), "Moderate");
assert.equal(aqiCategory(101), "Unhealthy for sensitive groups");
assert.equal(aqiCategory(151), "Unhealthy");
assert.equal(aqiCategory(201), "Very unhealthy");
assert.equal(aqiCategory(420), "Hazardous");

const air = {
  time: [
    "2026-10-02T05:00",
    "2026-10-02T06:00",
    "2026-10-02T12:00",
    "2026-10-02T21:00",
    "2026-10-03T12:00",
  ],
  aqi: [180, 40, 88.6, 170, 120],
};
const day = daytimeHours("2026-10-02");
assert.equal(day.length, 15);
assert.equal(day[0], "2026-10-02T06:00");
assert.equal(day.at(-1), "2026-10-02T20:00");
assert.equal(maxAqi(air, day), 89);
assert.equal(maxAqi(air, ["2026-10-02T06:00"]), 40);
assert.equal(maxAqi(air, ["2026-10-04T12:00"]), null);
assert.equal(maxAqi({ time: ["t"], aqi: [null] }, ["t"]), null);
assert.equal(maxAqi(null, day), null);

const brighton = [40.6, -111.58333, 2679];
assert.ok(avalancheLink(...brighton, "2026-12-15"));
assert.ok(avalancheLink(...brighton, "2027-05-01"));
assert.equal(avalancheLink(...brighton, "2026-10-02"), null);
assert.equal(avalancheLink(40.76, -111.89, 1288, "2026-12-15"), null);
assert.equal(avalancheLink(39.74, -105.0, 3000, "2026-12-15"), null);
console.log(
  "Conditions: AQI categories, daytime peaks and avalanche season links.",
);
