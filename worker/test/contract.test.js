import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { validate } from "../src/index.js";

const require = createRequire(import.meta.url);
const { rankWindows } = require("../../planner.js");
const { buildPayload } = require("../../briefing.js");

const day = "2026-10-02";
const clockTime = (time) => {
  const hour = Number(time.slice(11, 13));
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
};
const hours = Array.from({ length: 24 }, (_, hour) => ({
  time: `${day}T${String(hour).padStart(2, "0")}:00`,
  feels: 28 + hour * 2.5,
  rain: hour * 3,
  wind: 4 + hour,
  gust: 10 + hour * 1.5,
  code: 1,
}));

test("every payload the frontend builds passes Worker validation", () => {
  for (const activity of ["hiking", "biking", "running"])
    for (const duration of [1, 3, 5]) {
      const ranked = rankWindows(
        hours,
        duration,
        activity,
        `${day}T07:10`,
        `${day}T19:05`,
        `${day}T00:00`,
      );
      const payload = buildPayload({
        location: "Trial Lake forecast point",
        activity,
        duration,
        window: ranked[0],
        compared: ranked,
        sunset: `${day}T19:05`,
        elevation: 3039,
        uvIndexMax: 7.35,
        clockTime,
      });
      assert.ok(validate(payload), JSON.stringify(payload));
      assert.ok(
        new TextEncoder().encode(JSON.stringify(payload)).length < 4096,
      );
    }
});
