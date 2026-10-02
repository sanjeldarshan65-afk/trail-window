const assert = require("node:assert/strict");
const { encode, decode } = require("./share");

const plan = {
  place: {
    name: "Brighton forecast point",
    latitude: 40.6,
    longitude: -111.58333,
    elevation: 2679,
    admin1: "Utah",
    country: "United States",
  },
  date: "2026-10-03",
  activity: "biking",
  duration: 3,
  limits: { rain: 40, gust: 25 },
};
const query = encode(plan);
assert.match(query, /lat=40\.60000&lon=-111\.58333/);
assert.deepEqual(decode("?" + query), plan);
assert.deepEqual(decode(query), plan);

const noElevation = decode(
  encode({ ...plan, place: { ...plan.place, elevation: null, admin1: "" } }),
);
assert.equal(noElevation.place.elevation, null);
assert.equal(noElevation.place.admin1, "");

assert.equal(decode(""), null);
assert.equal(decode("?lat=91&lon=0"), null);
assert.equal(decode("?lat=40&lon=abc"), null);
assert.equal(decode("?lat=&lon=10"), null);

const messy = decode(
  "?lat=40&lon=-111&place=%3Cscript%3EPeak%0A&date=tomorrow&activity=ski&hours=9&rain=500&gust=2&elev=99999",
);
assert.equal(messy.place.name, "scriptPeak");
assert.equal(messy.date, null);
assert.equal(messy.activity, "hiking");
assert.equal(messy.duration, 2);
assert.deepEqual(messy.limits, { rain: 50, gust: 30 });
assert.equal(messy.place.elevation, null);
assert.equal(decode("?lat=40&lon=-111").place.name, "Shared trail point");
assert.equal(
  decode("?lat=40&lon=-111&place=" + "a".repeat(300)).place.name.length,
  100,
);
console.log("Share links round-trip plans and reject or default bad values.");
