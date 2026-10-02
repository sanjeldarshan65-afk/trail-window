(function (root) {
  const breakdown = (hour, activity) => {
    const gust = hour.gust === undefined ? hour.wind : hour.gust;
    return {
      rain: hour.rain * 0.7,
      wind:
        Math.max(0, hour.wind - 10) * 1.4 +
        Math.max(0, gust - 20) +
        (activity === "biking" ? Math.max(0, hour.wind - 12) * 1.2 : 0),
      temperature:
        Math.max(0, 42 - hour.feels) * 1.2 +
        Math.max(0, hour.feels - 82) * 1.5 +
        (activity === "running" ? Math.max(0, hour.feels - 75) * 1.3 : 0),
    };
  };
  const minuteStamp = (time) => Date.parse(time + "Z");
  function rankWindows(
    hours,
    duration,
    activity,
    sunrise,
    sunset,
    now,
    limits = {},
  ) {
    if (!Number.isInteger(duration) || duration < 1 || duration > 12) return [];
    if (
      ![sunrise, sunset, now].every((time) =>
        Number.isFinite(minuteStamp(time)),
      )
    )
      return [];
    const candidates = [];
    for (let i = 0; i <= hours.length - duration; i++) {
      const slice = hours.slice(i, i + duration);
      const start = slice[0].time;
      const end = `${start.slice(0, 10)}T${String(Number(start.slice(11, 13)) + duration).padStart(2, "0")}:00`;
      if (
        start < now ||
        start < sunrise ||
        minuteStamp(end) > minuteStamp(sunset) - 30 * 60000
      )
        continue;
      if (Number(start.slice(11, 13)) < 6 || Number(end.slice(11, 13)) > 20)
        continue;
      if (
        slice.some(
          (h, offset) =>
            minuteStamp(h.time) !== minuteStamp(start) + offset * 3600000,
        )
      )
        continue;
      if (
        slice.some(
          (h) =>
            h.code >= 95 ||
            [
              h.rain,
              h.wind,
              h.feels,
              h.code,
              h.gust === undefined ? h.wind : h.gust,
            ].some((v) => !Number.isFinite(v)),
        )
      )
        continue;
      if (
        slice.some(
          (h) =>
            h.rain > (limits.rain ?? 100) ||
            (h.gust ?? h.wind) > (limits.gust ?? 100),
        )
      )
        continue;
      const components = { rain: 0, wind: 0, temperature: 0 };
      slice.forEach((hour) => {
        const costs = breakdown(hour, activity);
        Object.keys(components).forEach((key) => {
          components[key] += costs[key] / duration;
        });
      });
      candidates.push({
        start,
        end,
        hours: slice,
        components,
        score: Object.values(components).reduce((a, b) => a + b, 0),
        daylightBuffer: Math.floor(
          (minuteStamp(sunset) - minuteStamp(end)) / 60000,
        ),
      });
    }
    return candidates.sort(
      (a, b) => a.score - b.score || a.start.localeCompare(b.start),
    );
  }
  const findWindow = (...args) => rankWindows(...args)[0] || null;
  root.TrailPlanner = { findWindow, rankWindows };
  if (typeof module !== "undefined") module.exports = root.TrailPlanner;
})(typeof window !== "undefined" ? window : globalThis);
