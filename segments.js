(function (root) {
  // Naismith-style moving-time rule: flat speed plus time per metre climbed.
  // Hiking is Naismith's 5 km/h + 1 h per 600 m; riding and running use
  // faster rates. These are planning estimates, not personal paces.
  const PACE = {
    hiking: { kmh: 5, climbPerHour: 600 },
    running: { kmh: 9, climbPerHour: 800 },
    biking: { kmh: 16, climbPerHour: 1000 },
  };

  // Elapsed minutes, distance and ascent at every point. Gaps between GPX
  // track segments add nothing, matching route.js.
  function timeline(points, distance, activity) {
    const pace = PACE[activity] || PACE.hiking;
    let meters = 0,
      gain = 0;
    return points.map((point, i) => {
      const previous = points[i - 1];
      if (previous && previous.segment === point.segment) {
        meters += distance(previous, point);
        if (point.elevation !== null && previous.elevation !== null)
          gain += Math.max(0, point.elevation - previous.elevation);
      }
      const hours = meters / 1000 / pace.kmh + gain / pace.climbPerHour;
      return { point, meters, gain, minutes: hours * 60 };
    });
  }

  // Start, finish and the high point always appear (the high point only when
  // it differs from both ends). Quarter marks of the estimated time fill in
  // unless they fall within 8% of the total time of a checkpoint already kept.
  function checkpoints(points, distance, activity) {
    const line = timeline(points, distance, activity);
    const total = line.at(-1).minutes;
    const withElevation = line.filter(
      (entry) => entry.point.elevation !== null,
    );
    const high = withElevation.length
      ? withElevation.reduce((a, b) =>
          b.point.elevation > a.point.elevation ? b : a,
        )
      : null;
    const chosen = [
      { ...line[0], label: "Start" },
      { ...line.at(-1), label: "Finish" },
    ];
    if (high && high !== line[0] && high !== line.at(-1))
      chosen.push({ ...high, label: "High point" });
    for (const fraction of [0.25, 0.5, 0.75]) {
      const entry = line.find((e) => e.minutes >= total * fraction);
      const tooClose = chosen.some(
        (other) =>
          Math.abs(other.minutes - entry.minutes) < Math.max(1, total * 0.08),
      );
      if (!tooClose) chosen.push({ ...entry, label: null });
    }
    return {
      totalMinutes: Math.round(total),
      checkpoints: chosen
        .sort((a, b) => a.minutes - b.minutes)
        .map((entry) => ({
          label: entry.label || `${(entry.meters / 1000).toFixed(1)} km`,
          latitude: entry.point.latitude,
          longitude: entry.point.longitude,
          elevation: entry.point.elevation,
          km: entry.meters / 1000,
          minutes: Math.round(entry.minutes),
        })),
    };
  }

  // Local "YYYY-MM-DDTHH:MM" plus minutes, as the containing hour stamp.
  function hourAfter(start, minutes) {
    const base = Date.parse(start + ":00Z");
    const stamp = new Date(base + minutes * 60000).toISOString();
    return stamp.slice(0, 13) + ":00";
  }
  function clockAfter(start, minutes) {
    const base = Date.parse(start + ":00Z");
    const rounded = Math.round(minutes / 5) * 5;
    return new Date(base + rounded * 60000).toISOString().slice(0, 16);
  }

  // Conditions at each checkpoint for the hour it is reached.
  function conditionsAlong(plan, forecasts, start) {
    return plan.checkpoints.map((checkpoint, i) => {
      const hourly = forecasts[i]?.hourly;
      const index = hourly
        ? hourly.time.indexOf(hourAfter(start, checkpoint.minutes))
        : -1;
      const value = (key) => (index >= 0 ? hourly[key][index] : null);
      return {
        ...checkpoint,
        arrival: clockAfter(start, checkpoint.minutes),
        elevation: checkpoint.elevation ?? forecasts[i]?.elevation ?? null,
        feels: value("apparent_temperature"),
        rain: value("precipitation_probability"),
        wind: value("wind_speed_10m"),
        gust: value("wind_gusts_10m"),
        code: value("weather_code"),
      };
    });
  }

  const where = (label) =>
    /km$/.test(label)
      ? `km ${label.replace(" km", "")}`
      : `the ${label.toLowerCase()}`;
  // The largest difference from the start worth calling out, or null.
  function biggestChange(rows) {
    const [start, ...rest] = rows;
    if (!start || !Number.isFinite(start.feels)) return null;
    let best = null;
    for (const row of rest) {
      const changes = [
        Number.isFinite(row.feels) && {
          size: Math.abs(row.feels - start.feels) / 5,
          text: `Feels ${Math.round(Math.abs(row.feels - start.feels))}°F ${row.feels < start.feels ? "colder" : "warmer"} at ${where(row.label)} than at the start.`,
        },
        Number.isFinite(row.gust) &&
          Number.isFinite(start.gust) && {
            size: (row.gust - start.gust) / 5,
            text: `Gusts build to ${Math.round(row.gust)} mph at ${where(row.label)}.`,
          },
        Number.isFinite(row.rain) &&
          Number.isFinite(start.rain) && {
            size: (row.rain - start.rain) / 15,
            text: `Rain chance rises to ${Math.round(row.rain)}% by ${where(row.label)}.`,
          },
      ].filter(Boolean);
      for (const change of changes)
        if (change.size >= 1 && (!best || change.size > best.size))
          best = change;
    }
    return best?.text ?? null;
  }

  root.TrailSegments = {
    PACE,
    timeline,
    checkpoints,
    hourAfter,
    conditionsAlong,
    biggestChange,
  };
  if (typeof module !== "undefined") module.exports = root.TrailSegments;
})(typeof window !== "undefined" ? window : globalThis);
