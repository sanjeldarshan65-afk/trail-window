const assert = require("node:assert/strict");
const {
  timeline,
  checkpoints,
  hourAfter,
  conditionsAlong,
  biggestChange,
} = require("./segments");

// Points 1 km apart on one segment; distance() reads the given km marks.
const seg = {};
const pts = [
  [0, 1900],
  [1, 2100],
  [2, 2400],
  [3, 2700],
  [4, 2600],
  [5, 2500],
].map(([km, elevation]) => ({
  latitude: 40 + km / 100,
  longitude: -111,
  elevation,
  segment: seg,
  km,
}));
const distance = (a, b) => (b.km - a.km) * 1000;

const line = timeline(pts, distance, "hiking");
assert.equal(line[0].minutes, 0);
// 5 km at 5 km/h = 60 min, plus 800 m climbed at 600 m/h = 80 min.
assert.equal(Math.round(line.at(-1).minutes), 140);
assert.equal(line.at(-1).gain, 800);
assert.ok(
  timeline(pts, distance, "biking").at(-1).minutes <
    timeline(pts, distance, "running").at(-1).minutes,
);

// A new GPX segment adds no distance or gain across the gap.
const split = pts.map((p, i) => ({ ...p, segment: i < 3 ? seg : {} }));
assert.ok(timeline(split, distance, "hiking").at(-1).minutes < 140);

const plan = checkpoints(pts, distance, "hiking");
assert.equal(plan.totalMinutes, 140);
const labels = plan.checkpoints.map((c) => c.label);
assert.equal(labels[0], "Start");
assert.equal(labels.at(-1), "Finish");
assert.ok(labels.includes("High point"));
assert.ok(plan.checkpoints.length >= 3 && plan.checkpoints.length <= 6);
assert.deepEqual(
  plan.checkpoints.map((c) => c.minutes),
  [...plan.checkpoints.map((c) => c.minutes)].sort((a, b) => a - b),
);
assert.equal(
  plan.checkpoints.find((c) => c.label === "High point").elevation,
  2700,
);

// A high point just before the finish keeps both rows.
const nearEnd = checkpoints(
  pts.map((p, i) => ({ ...p, elevation: i === 4 ? 3000 : p.elevation })),
  distance,
  "hiking",
).checkpoints.map((c) => c.label);
assert.equal(nearEnd.at(-1), "Finish");
assert.equal(nearEnd.at(-2), "High point");

assert.equal(hourAfter("2026-10-02T08:00", 0), "2026-10-02T08:00");
assert.equal(hourAfter("2026-10-02T08:00", 59), "2026-10-02T08:00");
assert.equal(hourAfter("2026-10-02T08:00", 140), "2026-10-02T10:00");
assert.equal(hourAfter("2026-10-02T23:00", 90), "2026-10-03T00:00");

const hourly = (feels, gust) => ({
  hourly: {
    time: ["2026-10-02T08:00", "2026-10-02T09:00", "2026-10-02T10:00"],
    apparent_temperature: [feels, feels + 2, feels + 4],
    precipitation_probability: [0, 10, 20],
    wind_speed_10m: [5, 6, 7],
    wind_gusts_10m: [gust, gust, gust],
    weather_code: [0, 1, 2],
  },
});
const rows = conditionsAlong(
  plan,
  plan.checkpoints.map((c) =>
    hourly(
      c.label === "High point" ? 38 : 50,
      c.label === "High point" ? 30 : 12,
    ),
  ),
  "2026-10-02T08:00",
);
assert.equal(rows[0].arrival, "2026-10-02T08:00");
assert.equal(rows[0].feels, 50);
assert.equal(rows.at(-1).arrival, "2026-10-02T10:20");
assert.equal(rows.at(-1).feels, 54);
const high = rows.find((r) => r.label === "High point");
assert.ok(Number.isFinite(high.feels));
assert.match(
  biggestChange(rows),
  /colder at the high point|Gusts build to 30 mph at the high point/,
);

const beyond = conditionsAlong(
  plan,
  plan.checkpoints.map(() => hourly(50, 10)),
  "2026-10-02T09:00",
);
assert.equal(beyond.at(-1).feels, null);
assert.equal(biggestChange([rows[0], { ...rows[0], label: "Finish" }]), null);
console.log(
  "Route segments: Naismith timing, checkpoints and conditions along the way.",
);
