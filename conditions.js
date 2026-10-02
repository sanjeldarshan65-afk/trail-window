(function (root) {
  // EPA US AQI categories: https://www.airnow.gov/aqi/aqi-basics/
  const AQI_CATEGORIES = [
    [50, "Good"],
    [100, "Moderate"],
    [150, "Unhealthy for sensitive groups"],
    [200, "Unhealthy"],
    [300, "Very unhealthy"],
    [Infinity, "Hazardous"],
  ];
  const aqiCategory = (value) =>
    AQI_CATEGORIES.find(([max]) => Math.round(value) <= max)[1];
  // Fits the narrow "at a glance" column.
  const aqiShort = (value) =>
    aqiCategory(value).replace(
      "Unhealthy for sensitive groups",
      "Sensitive groups",
    );

  // Highest AQI among the given local hour stamps ("YYYY-MM-DDTHH:00"),
  // ignoring missing values. Returns null when no hour has data.
  function maxAqi(air, times) {
    if (!air) return null;
    const wanted = new Set(times);
    const values = air.time
      .map((time, i) => (wanted.has(time) ? air.aqi[i] : null))
      .filter((value) => Number.isFinite(value));
    return values.length ? Math.round(Math.max(...values)) : null;
  }

  // Daylight planning hours (6 AM–8 PM) for one local date.
  const daytimeHours = (date) =>
    Array.from(
      { length: 15 },
      (_, i) => `${date}T${String(i + 6).padStart(2, "0")}:00`,
    );

  // The Utah Avalanche Center publishes daily forecasts in winter. Offer the
  // link for Utah points above 2,000 m from November through May.
  const UAC_URL = "https://utahavalanchecenter.org/forecasts";
  function avalancheLink(latitude, longitude, elevation, date) {
    const month = Number(date.slice(5, 7));
    const inUtah =
      latitude >= 37 &&
      latitude <= 42 &&
      longitude >= -114.05 &&
      longitude <= -109.04;
    const inSeason = month >= 11 || month <= 5;
    return inUtah && elevation >= 2000 && inSeason ? UAC_URL : null;
  }

  root.TrailConditions = {
    aqiCategory,
    aqiShort,
    maxAqi,
    daytimeHours,
    avalancheLink,
  };
  if (typeof module !== "undefined") module.exports = root.TrailConditions;
})(typeof window !== "undefined" ? window : globalThis);
