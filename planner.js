(function (root) {
  const score = (hour, activity) => {
    let cost = hour.rain * 0.7 + Math.max(0, hour.wind - 10) * 1.4;
    cost += Math.max(0, 42 - hour.feels) * 1.2 + Math.max(0, hour.feels - 82) * 1.5;
    if (activity === 'biking') cost += Math.max(0, hour.wind - 12) * 1.2;
    if (activity === 'running') cost += Math.max(0, hour.feels - 75) * 1.3;
    return cost;
  };
  function findWindow(hours, duration, activity, sunrise, sunset, now) {
    const candidates = [];
    for (let i = 0; i <= hours.length - duration; i++) {
      const slice = hours.slice(i, i + duration);
      const start = slice[0].time;
      const end = `${start.slice(0, 10)}T${String(Number(start.slice(11, 13)) + duration).padStart(2, '0')}:00`;
      if (start < now || start < sunrise || end > sunset) continue;
      if (Number(start.slice(11, 13)) < 6 || Number(end.slice(11, 13)) > 20) continue;
      if (slice.some(h => h.code >= 95 || [h.rain, h.wind, h.feels].some(v => !Number.isFinite(v)))) continue;
      candidates.push({ start, end, hours: slice, score: slice.reduce((sum, h) => sum + score(h, activity), 0) / duration });
    }
    return candidates.sort((a, b) => a.score - b.score)[0] || null;
  }
  root.TrailPlanner = { findWindow };
  if (typeof module !== 'undefined') module.exports = root.TrailPlanner;
})(typeof window !== 'undefined' ? window : globalThis);
