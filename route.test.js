const assert = require("node:assert/strict");
const { DOMParser } = require("@xmldom/xmldom");
const { parseGPX } = require("./route");
const parse = (text) => parseGPX(text, DOMParser, () => 100);
const wrap = (points) =>
  `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Test route</name><trkseg>${points}</trkseg></trk></gpx>`;
const point = (lat, lon, ele) =>
  `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? "" : `<ele>${ele}</ele>`}</trkpt>`;
const route = parse(
  wrap(
    point(40, -111, 1000) + point(40.01, -111, 1200) + point(40.02, -111, 1100),
  ),
);
assert.equal(route.highest.elevation, 1200);
assert.equal(route.gain, 200);
assert.equal(route.distanceMeters, 200);
assert.equal(route.hasElevation, true);
assert.equal(
  parse(wrap(point(40, -111) + point(40.01, -111))).highest.elevation,
  null,
);
assert.throws(
  () => parse(wrap(point(91, -111, 1000) + point(40, -111, 1200))),
  /invalid coordinates/,
);
assert.throws(
  () => parse(wrap(point("", -111, 1000) + point(40, -111, 1200))),
  /invalid coordinates/,
);
assert.throws(
  () => parse(wrap(point(40, -111, "NaN") + point(40, -111, 1200))),
  /invalid elevation/,
);
assert.throws(() => parse(wrap(point(40, -111, 1000))), /2–20,000/);
assert.throws(() => parse("<html/>"), /not valid GPX/);
const segments = `<gpx><trk><trkseg>${point(40, -111, 1000)}${point(40.01, -111, 1100)}</trkseg><trkseg>${point(41, -111, 2000)}${point(41.01, -111, 2100)}</trkseg></trk></gpx>`;
assert.equal(parse(segments).distanceMeters, 200);
assert.equal(parse(segments).gain, 200);
assert.equal(
  parse(
    "<gpx><rte>" +
      point(40, -111, 1000).replaceAll("trkpt", "rtept") +
      point(40.01, -111, 1200).replaceAll("trkpt", "rtept") +
      "</rte></gpx>",
  ).points.length,
  2,
);
console.log(
  "GPX parsing: namespaces, route points, elevations, invalid input and disconnected segments passed.",
);
