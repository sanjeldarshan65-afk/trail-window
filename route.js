(function (root) {
  function parseGPX(text, Parser, distance) {
    if (text.length > 5 * 1024 * 1024)
      throw new Error("Choose a GPX file smaller than 5 MB.");
    const xml = new Parser().parseFromString(text, "application/xml");
    if (
      xml.getElementsByTagName("parsererror").length ||
      xml.documentElement.localName !== "gpx"
    )
      throw new Error("This file is not valid GPX.");
    let nodes = Array.from(xml.getElementsByTagNameNS("*", "trkpt"));
    if (!nodes.length)
      nodes = Array.from(xml.getElementsByTagNameNS("*", "rtept"));
    if (nodes.length < 2 || nodes.length > 20000)
      throw new Error("The route needs 2–20,000 track or route points.");
    const points = nodes.map((node) => {
      const lat = node.getAttribute("lat"),
        lon = node.getAttribute("lon");
      const latitude = Number(lat),
        longitude = Number(lon);
      const elevationText = node
        .getElementsByTagNameNS("*", "ele")[0]
        ?.textContent?.trim();
      const elevation = elevationText ? Number(elevationText) : null;
      if (
        !lat?.trim() ||
        !lon?.trim() ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        throw new Error("The GPX contains invalid coordinates.");
      if (
        elevation !== null &&
        (!Number.isFinite(elevation) || elevation < -500 || elevation > 9000)
      )
        throw new Error("The GPX contains invalid elevation data.");
      return { latitude, longitude, elevation, segment: node.parentNode };
    });
    let distanceMeters = 0,
      gain = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].segment !== points[i - 1].segment) continue;
      distanceMeters += distance(points[i - 1], points[i]);
      if (points[i].elevation !== null && points[i - 1].elevation !== null)
        gain += Math.max(0, points[i].elevation - points[i - 1].elevation);
    }
    if (distanceMeters > 200000)
      throw new Error(
        "Choose a route shorter than 200 km for a single outing.",
      );
    const elevations = points.filter((point) => point.elevation !== null);
    const highest = elevations.length
      ? elevations.reduce((a, b) => (a.elevation > b.elevation ? a : b))
      : points[Math.floor(points.length / 2)];
    const name =
      xml
        .getElementsByTagNameNS("*", "name")[0]
        ?.textContent?.trim()
        .slice(0, 100) || "Imported route";
    return {
      name,
      points,
      highest,
      distanceMeters,
      gain,
      hasElevation: elevations.length === points.length,
    };
  }
  root.TrailRoute = { parseGPX };
  if (typeof module !== "undefined") module.exports = root.TrailRoute;
})(typeof window !== "undefined" ? window : globalThis);
