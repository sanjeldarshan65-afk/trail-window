(function (root) {
  // Deployed Cloudflare Worker URL (see worker/README.md). Leave empty to use
  // the local template briefing only.
  const BRIEFING_URL = "";
  const TIMEOUT_MS = 8000;
  const pending = new Map();
  const resolved = new Map();

  const round = (value) => Math.round(value);
  const nouns = { hiking: "hike", biking: "ride", running: "run" };
  const clean = (name) =>
    String(name)
      .replace(/[^\p{L}\p{N} .,'()/·–-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "Selected point";

  // Only derived numbers leave the browser: no coordinates, GPX or free text.
  function buildPayload({
    location,
    activity,
    duration,
    window,
    compared,
    sunset,
    elevation,
    uvIndexMax,
    clockTime,
  }) {
    const hours = window.hours;
    const feels = hours.map((h) => h.feels);
    const row = (candidate) => ({
      start: clockTime(candidate.start),
      end: clockTime(candidate.end),
      rain: +candidate.components.rain.toFixed(1),
      wind: +candidate.components.wind.toFixed(1),
      temperature: +candidate.components.temperature.toFixed(1),
      total: +candidate.score.toFixed(1),
    });
    return {
      location: clean(location),
      activity,
      durationHours: duration,
      window: { start: clockTime(window.start), end: clockTime(window.end) },
      feelsLikeF: {
        min: round(Math.min(...feels)),
        max: round(Math.max(...feels)),
      },
      maxRainPct: round(Math.max(...hours.map((h) => h.rain))),
      windMph: {
        sustained: round(Math.max(...hours.map((h) => h.wind))),
        gust: round(Math.max(...hours.map((h) => h.gust ?? h.wind))),
      },
      uvIndexMax: +uvIndexMax.toFixed(1),
      sunset: clockTime(sunset),
      elevationM: round(elevation),
      penalties: [window, ...compared.filter((c) => c.start !== window.start)]
        .slice(0, 3)
        .map(row),
    };
  }

  function templateBriefing(p) {
    const [chosen] = p.penalties;
    const { min, max } = p.feelsLikeF;
    const feels = min === max ? `${min}°F` : `${min}–${max}°F`;
    const rain =
      p.maxRainPct === 0
        ? "no rain chance"
        : `rain chance up to ${p.maxRainPct}%`;
    const opening = `Your ${p.durationHours}-hour ${nouns[p.activity]} from ${p.window.start} to ${p.window.end} at ${p.location} should feel like ${feels}, with ${rain} and wind up to ${p.windMph.sustained} mph (gusts ${p.windMph.gust} mph).`;
    const main = ["temperature", "wind", "rain"].reduce((a, b) =>
      chosen[b] > chosen[a] ? b : a,
    );
    let tradeoff;
    if (chosen.total < 1)
      tradeoff =
        "No single factor stands out in the comfort penalties, so this window is about as even as the forecast gets.";
    else if (main === "temperature" && min < 42)
      tradeoff = `The main tradeoff is a cold start at ${min}°F feels-like, so start in a warm layer you can shed as it reaches ${max}°F.`;
    else if (main === "temperature")
      tradeoff = `The main tradeoff is heat, with feels-like reaching ${max}°F, so carry extra water and set an easier pace.`;
    else if (main === "wind")
      tradeoff = `The main tradeoff is wind, with gusts to ${p.windMph.gust} mph that you will notice most on exposed terrain, so bring a windproof layer.`;
    else
      tradeoff = `The main tradeoff is a ${p.maxRainPct}% rain chance, so keep a shell within reach.`;
    const uv =
      p.uvIndexMax >= 6
        ? ` UV peaks at ${round(p.uvIndexMax)} today, so pack sun protection.`
        : "";
    return `${opening} ${tradeoff} Sunset is at ${p.sunset}.${uv}`;
  }

  const cacheKey = (parts) => JSON.stringify(parts);
  // Synchronous lookup so cached briefings render without a skeleton flash.
  const cached = (key) => resolved.get(key);

  async function requestBriefing(payload, url, fetchImpl, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: "omit",
      });
      if (!response.ok) throw new Error("Briefing request failed");
      const data = await response.json();
      const text =
        typeof data?.briefing === "string" ? data.briefing.trim() : "";
      if (!text) throw new Error("Empty briefing");
      return { text: text.slice(0, 800), source: "ai" };
    } finally {
      clearTimeout(timer);
    }
  }

  // Resolves to { text, source: "ai" | "template" } and never rejects. One
  // request per key per page load; a failed request caches the template.
  function getBriefing(key, payload, options = {}) {
    if (resolved.has(key)) return Promise.resolve(resolved.get(key));
    if (pending.has(key)) return pending.get(key);
    const url = options.url ?? BRIEFING_URL;
    const fetchImpl = options.fetch ?? root.fetch?.bind(root);
    const fallback = () => ({
      text: templateBriefing(payload),
      source: "template",
    });
    const request = (
      url && fetchImpl
        ? requestBriefing(
            payload,
            url,
            fetchImpl,
            options.timeoutMs ?? TIMEOUT_MS,
          ).catch(fallback)
        : Promise.resolve(fallback())
    ).then((result) => {
      resolved.set(key, result);
      pending.delete(key);
      return result;
    });
    pending.set(key, request);
    return request;
  }

  root.TrailBriefing = {
    BRIEFING_URL,
    TIMEOUT_MS,
    buildPayload,
    templateBriefing,
    cacheKey,
    cached,
    getBriefing,
  };
  if (typeof module !== "undefined") module.exports = root.TrailBriefing;
})(typeof window !== "undefined" ? window : globalThis);
