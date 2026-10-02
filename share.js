(function (root) {
  const ACTIVITIES = ["hiking", "biking", "running"];
  const text = (value) =>
    typeof value === "string"
      ? value
          .replace(/[\u0000-\u001f\u007f<>]/g, "")
          .trim()
          .slice(0, 100)
      : "";
  const inRange = (value, min, max) =>
    value !== null &&
    value !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= min &&
    Number(value) <= max;

  // Plan → query string. Coordinates are rounded to about a metre.
  function encode(plan) {
    const params = new URLSearchParams({
      place: plan.place.name,
      lat: Number(plan.place.latitude).toFixed(5),
      lon: Number(plan.place.longitude).toFixed(5),
    });
    if (Number.isFinite(plan.place.elevation))
      params.set("elev", Math.round(plan.place.elevation));
    if (plan.place.admin1) params.set("region", plan.place.admin1);
    if (plan.place.country) params.set("country", plan.place.country);
    params.set("date", plan.date);
    params.set("activity", plan.activity);
    params.set("hours", plan.duration);
    params.set("rain", plan.limits.rain);
    params.set("gust", plan.limits.gust);
    return params.toString();
  }

  // Query string → plan, or null when the link has no usable place.
  // Optional fields that fail validation fall back to defaults.
  function decode(search) {
    const params = new URLSearchParams(search);
    const lat = params.get("lat"),
      lon = params.get("lon");
    if (!inRange(lat, -90, 90) || !inRange(lon, -180, 180)) return null;
    const elev = params.get("elev");
    const hours = Number(params.get("hours"));
    const rain = params.get("rain"),
      gust = params.get("gust");
    const date = params.get("date") || "";
    return {
      place: {
        name: text(params.get("place")) || "Shared trail point",
        latitude: Number(lat),
        longitude: Number(lon),
        elevation: inRange(elev, -500, 9000) ? Number(elev) : null,
        admin1: text(params.get("region")),
        country: text(params.get("country")),
      },
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      activity: ACTIVITIES.includes(params.get("activity"))
        ? params.get("activity")
        : "hiking",
      duration: Number.isInteger(hours) && hours >= 1 && hours <= 5 ? hours : 2,
      limits: {
        rain: inRange(rain, 0, 100) ? Math.round(Number(rain)) : 50,
        gust: inRange(gust, 5, 100) ? Math.round(Number(gust)) : 30,
      },
    };
  }

  root.TrailShare = { encode, decode };
  if (typeof module !== "undefined") module.exports = root.TrailShare;
})(typeof window !== "undefined" ? window : globalThis);
