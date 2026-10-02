const $ = (selector) => document.querySelector(selector);
let forecast, place, chart, controller, bestWindow, fetchedAt, briefingKey;
let route = null,
  routeLayer = null,
  mapMarker = null;
let limits = { rain: 50, gust: 30 };
const map = L.map("trail-map", { scrollWheelZoom: false }).setView(
  [40.7608, -111.891],
  11,
);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
let selectedDay = 0,
  activity = "hiking",
  duration = 2;
const checked = new Set(
  (() => {
    try {
      return JSON.parse(localStorage.getItem("trail-window-packing")) || [];
    } catch {
      return [];
    }
  })(),
);
const icons = () => window.lucide?.createIcons();
const formatted = (value, suffix = "") =>
  Number.isFinite(value) ? Math.round(value) + suffix : "Unavailable";
const clockTime = (time) => {
  const hour = Number(time.slice(11, 13));
  const minute = time.slice(14, 16);
  return `${hour % 12 || 12}${minute === "00" ? "" : ":" + minute} ${hour >= 12 ? "PM" : "AM"}`;
};
const weather = (code, rain = 100) => {
  if (!Number.isFinite(code)) return ["Unavailable", "circle-help"];
  if (code === 0) return ["Clear sky", "sun"];
  if (code <= 3) return ["Partly cloudy", "cloud-sun"];
  if (code === 45 || code === 48) return ["Fog", "cloud-fog"];
  if (code >= 95) return ["Thunderstorms", "cloud-lightning"];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ["Snow", "cloud-snow"];
  return rain > 20
    ? ["Rain showers", "cloud-rain"]
    : ["Low rain chance", "cloud"];
};
const durationText = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return (
    [hours ? `${hours} hr` : "", remainder ? `${remainder} min` : ""]
      .filter(Boolean)
      .join(" ") || "0 min"
  );
};
const uvText = (value) => {
  const rounded = Math.round(value);
  const category =
    rounded < 3
      ? "Low"
      : rounded < 6
        ? "Moderate"
        : rounded < 8
          ? "High"
          : rounded < 11
            ? "Very high"
            : "Extreme";
  return `${rounded} · ${category}`;
};
const readSaved = () => {
  try {
    return JSON.parse(localStorage.getItem("trail-window-plan"));
  } catch {
    return null;
  }
};
function updateSaved() {
  const saved = readSaved();
  if (saved) {
    $("#saved-summary").textContent =
      `${saved.place.name} · ${saved.date} · ${saved.duration}h ${saved.activity}`;
    $("#restore-plan").hidden = false;
  }
}
function getHours(day) {
  return forecast.hourly.time
    .map((time, i) => ({
      time,
      feels: forecast.hourly.apparent_temperature[i],
      rain: forecast.hourly.precipitation_probability[i],
      wind: forecast.hourly.wind_speed_10m[i],
      gust: forecast.hourly.wind_gusts_10m[i],
      code: forecast.hourly.weather_code[i],
    }))
    .filter((hour) => hour.time.startsWith(forecast.daily.time[day]));
}
function getWindow(day) {
  return TrailPlanner.findWindow(
    getHours(day),
    duration,
    activity,
    forecast.daily.sunrise[day],
    forecast.daily.sunset[day],
    localNow(),
    limits,
  );
}
function localNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: forecast.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function renderEvidence() {
  const windows = TrailPlanner.rankWindows(
    getHours(selectedDay),
    duration,
    activity,
    forecast.daily.sunrise[selectedDay],
    forecast.daily.sunset[selectedDay],
    localNow(),
    limits,
  );
  $("#download-plan").disabled = !bestWindow;
  $("#window-evidence").replaceChildren();
  $("#alternatives").replaceChildren();
  const distinct = [];
  if (bestWindow) {
    const feels = bestWindow.hours.map((h) => h.feels);
    const metrics = [
      [
        "Rain chance",
        `${Math.max(...bestWindow.hours.map((h) => h.rain))}% max`,
      ],
      [
        "Gusts (window)",
        `${Math.round(Math.max(...bestWindow.hours.map((h) => h.gust)))} mph max`,
      ],
      [
        "Feels like",
        `${Math.round(Math.min(...feels))}°–${Math.round(Math.max(...feels))}°F`,
      ],
      ["Before sunset", durationText(bestWindow.daylightBuffer)],
    ];
    metrics.forEach(([label, value]) => {
      const item = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = value;
      const span = document.createElement("span");
      span.textContent = label;
      item.append(strong, span);
      $("#window-evidence").append(item);
    });
    for (const candidate of windows) {
      if (
        distinct.every(
          (other) =>
            Math.abs(Date.parse(other.start) - Date.parse(candidate.start)) >=
            duration * 3600000,
        )
      )
        distinct.push(candidate);
      if (distinct.length === 3) break;
    }
    const table = document.createElement("table");
    table.innerHTML =
      "<caption>Compared windows · lower penalty is better</caption><thead><tr><th>Time</th><th>Rain</th><th>Wind</th><th>Temperature</th><th>Total</th></tr></thead>";
    const body = document.createElement("tbody");
    distinct.forEach((candidate) => {
      const row = document.createElement("tr");
      [
        clockTime(candidate.start) + " – " + clockTime(candidate.end),
        ...["rain", "wind", "temperature"].map((key) =>
          candidate.components[key].toFixed(1),
        ),
        candidate.score.toFixed(1),
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        row.append(td);
      });
      body.append(row);
    });
    table.append(body);
    $("#alternatives").append(table);
    const tie = TrailPlanner.tieNote(windows);
    if (tie) {
      const note = document.createElement("p");
      note.className = "micro-note tie-note";
      note.textContent = tie;
      $("#alternatives").append(note);
    }
  }
  const fetched = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: forecast.timezone,
  }).format(fetchedAt);
  $("#forecast-context").textContent =
    `Fetched ${fetched} local time. Elevation: ${Math.round(forecast.elevation)} m. Model grid: ${forecast.latitude.toFixed(3)}, ${forecast.longitude.toFixed(3)}. Weather models may miss ridge exposure or rapidly changing conditions. Penalties are relative comfort preferences, not probabilities of safety.`;
  return distinct;
}
function showBriefing({ text, source }) {
  $("#briefing").setAttribute("aria-busy", "false");
  $(".briefing-skeleton").hidden = true;
  $("#briefing-loading").hidden = true;
  $("#briefing-text").textContent = text;
  $("#briefing-text").hidden = false;
  $("#briefing-source").hidden = source !== "template";
}
function renderBriefing(compared) {
  if (!bestWindow) {
    briefingKey = null;
    showBriefing({
      text: "No complete daylight window fits your limits on this day, so there is no window to brief. Try another day, a shorter outing, or different limits.",
      source: "template",
    });
    return;
  }
  const d = forecast.daily;
  const key = TrailBriefing.cacheKey([
    place.name,
    place.latitude,
    place.longitude,
    place.elevation ?? null,
    d.time[selectedDay],
    activity,
    duration,
    bestWindow.start,
    bestWindow.end,
  ]);
  briefingKey = key;
  const ready = TrailBriefing.cached(key);
  if (ready) return showBriefing(ready);
  $("#briefing").setAttribute("aria-busy", "true");
  $(".briefing-skeleton").hidden = false;
  $("#briefing-loading").hidden = false;
  $("#briefing-text").hidden = true;
  $("#briefing-source").hidden = true;
  TrailBriefing.getBriefing(
    key,
    TrailBriefing.buildPayload({
      location: place.name,
      activity,
      duration,
      window: bestWindow,
      compared,
      sunset: d.sunset[selectedDay],
      elevation: forecast.elevation,
      uvIndexMax: d.uv_index_max[selectedDay],
      clockTime,
    }),
  ).then((result) => {
    if (briefingKey === key) showBriefing(result);
  });
}
function packingProgress() {
  const inputs = [...$("#packing").querySelectorAll("input")];
  $("#packing-progress").textContent =
    `${inputs.filter((input) => input.checked).length} of ${inputs.length} packed`;
}
function renderPacking() {
  const d = forecast.daily;
  // A reason is shown only when it comes from forecast data.
  const items = [["Water bottle"], ["Charged phone"], ["Offline map"]];
  if (d.precipitation_probability_max[selectedDay] >= 25)
    items.push([
      "Rain shell",
      `${Math.round(d.precipitation_probability_max[selectedDay])}% rain chance all day`,
    ]);
  const minFeels = bestWindow
    ? Math.min(...bestWindow.hours.map((h) => h.feels))
    : Math.min(...getHours(selectedDay).map((h) => h.feels));
  if (minFeels < 55)
    items.push([
      "Warm layer",
      `${Math.round(minFeels)}° feels like ${bestWindow ? "in window" : "during day"}`,
    ]);
  if (d.uv_index_max[selectedDay] >= 3)
    items.push(["Sun protection", `UV ${uvText(d.uv_index_max[selectedDay])}`]);
  if (d.temperature_2m_max[selectedDay] >= 80)
    items.push([
      "Extra water",
      `${Math.round(d.temperature_2m_max[selectedDay])}° daily high`,
    ]);
  if (d.wind_gusts_10m_max[selectedDay] >= 20)
    items.push([
      "Windproof layer",
      `${Math.round(d.wind_gusts_10m_max[selectedDay])} mph daily gusts`,
    ]);
  if (activity === "biking") items.push(["Helmet & repair kit"]);
  if (activity === "hiking")
    items.push(["Trail snacks", `${duration} hours outside`]);
  $("#packing").replaceChildren(
    ...items.map(([item, reason]) => {
      const label = document.createElement("label");
      label.className = "pack-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked.has(item);
      input.addEventListener("change", () => {
        input.checked ? checked.add(item) : checked.delete(item);
        packingProgress();
        try {
          localStorage.setItem(
            "trail-window-packing",
            JSON.stringify([...checked]),
          );
        } catch {
          /* Checklist still works without storage. */
        }
      });
      const span = document.createElement("span");
      span.textContent = reason ? `${item} (${reason})` : item;
      label.append(input, span);
      return label;
    }),
  );
  packingProgress();
}
function renderChart(hours) {
  const visible = hours.filter(
    (h) =>
      Number(h.time.slice(11, 13)) >= 6 && Number(h.time.slice(11, 13)) <= 20,
  );
  $("#hourly-table").replaceChildren(
    ...visible.map((h) => {
      const row = document.createElement("tr");
      [
        clockTime(h.time),
        formatted(h.feels, "°F"),
        formatted(h.rain, "%"),
        formatted(h.wind, " mph"),
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      return row;
    }),
  );
  if (!window.Chart) return;
  chart?.destroy();
  chart = new Chart($("#hourly-chart"), {
    type: "line",
    data: {
      labels: visible.map((h) => clockTime(h.time)),
      datasets: [
        {
          label: "Feels like (°F)",
          data: visible.map((h) => h.feels),
          borderColor: "#b45309",
          backgroundColor: "#b4530910",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.35,
          fill: true,
          yAxisID: "temperature",
        },
        {
          label: "Rain chance (%)",
          data: visible.map((h) => h.rain),
          borderColor: "#167a9a",
          borderDash: [4, 4],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
          yAxisID: "rain",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { padding: 12 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#59666c",
            maxTicksLimit: 6,
            maxRotation: 0,
            font: { size: 11 },
          },
          border: { display: false },
        },
        temperature: {
          grid: { color: "#edf0f1" },
          border: { display: false },
          ticks: {
            color: "#59666c",
            callback: (value) => value + "°",
            maxTicksLimit: 5,
            font: { size: 11 },
          },
        },
        rain: {
          position: "right",
          min: 0,
          max: 100,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#167a9a",
            callback: (value) => value + "%",
            stepSize: 50,
            font: { size: 11 },
          },
        },
      },
    },
  });
}
function renderDay() {
  const d = forecast.daily;
  [...$("#days").children].forEach((button, i) => {
    button.classList.toggle("active", i === selectedDay);
    button.setAttribute("aria-pressed", String(i === selectedDay));
  });
  bestWindow = getWindow(selectedDay);
  const recommendation = $(".recommendation");
  recommendation.classList.toggle(
    "warning",
    !bestWindow || bestWindow.score > 35,
  );
  $("#save-plan").disabled = !bestWindow;
  $("#save-plan span").textContent = "Save plan";
  if (bestWindow) {
    const maxRain = Math.max(...bestWindow.hours.map((h) => h.rain));
    const maxWind = Math.max(...bestWindow.hours.map((h) => h.wind));
    $("#window-rating").textContent =
      bestWindow.score > 35
        ? "Mixed conditions · plan carefully"
        : "Your best forecast window";
    $("#window-title").textContent =
      `${clockTime(bestWindow.start)} – ${clockTime(bestWindow.end)}`;
    $("#window-reason").textContent =
      `${duration} ${duration === 1 ? "hour" : "hours"} for your ${activity === "hiking" ? "hike" : activity === "biking" ? "ride" : "run"}. ${maxRain === 0 ? "No rain expected." : `Rain chance up to ${maxRain}% in this window.`} Sustained wind (window): up to ${Math.round(maxWind)} mph. Times use ${forecast.timezone.replaceAll("_", " ")}.`;
  } else {
    $("#window-rating").textContent = "Try another day or a shorter outing";
    $("#window-title").textContent = "No suitable window";
    $("#window-reason").textContent =
      "No complete daylight window meets your rain and gust limits. Past hours, thunderstorms, incomplete data, and the last 30 minutes before sunset are excluded. Try another day, shorten the outing, or review your limits.";
  }
  $("#metrics").innerHTML = [
    [
      "thermometer",
      "Temperature",
      `${Math.round(d.temperature_2m_max[selectedDay])}° / ${Math.round(d.temperature_2m_min[selectedDay])}°`,
    ],
    [
      "droplets",
      "Rain chance",
      `${d.precipitation_probability_max[selectedDay]}%`,
    ],
    [
      "wind",
      "Gusts (all day)",
      `${Math.round(d.wind_gusts_10m_max[selectedDay])} mph`,
    ],
    ["sun", "UV index", uvText(d.uv_index_max[selectedDay])],
  ]
    .map(
      ([icon, label, value]) =>
        `<div class="metric"><i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span><strong class="metric-value">${value}</strong></div>`,
    )
    .join("");
  $("#sunrise").textContent = clockTime(d.sunrise[selectedDay]);
  $("#glance-heading").textContent =
    `${new Date(d.time[selectedDay] + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })} at a glance`;
  $("#sunset").textContent = clockTime(d.sunset[selectedDay]);
  renderChart(getHours(selectedDay));
  renderPacking();
  renderBriefing(renderEvidence());
  icons();
}
function renderForecast() {
  $("#place-heading").textContent = place.name;
  $("#destination-region").textContent = [place.admin1, place.country]
    .filter(Boolean)
    .join(", ");
  $("#latitude").value = place.latitude;
  $("#longitude").value = place.longitude;
  $("#elevation").value = place.elevation ?? "";
  mapMarker?.remove();
  mapMarker = L.marker([place.latitude, place.longitude], {
    title: place.name,
    alt: "Forecast point: " + place.name,
  })
    .addTo(map)
    .bindPopup(document.createTextNode(place.name));
  $("#route-points")
    .querySelectorAll("button")
    .forEach((button) => {
      const active =
        Number(button.dataset.latitude) === place.latitude &&
        Number(button.dataset.longitude) === place.longitude;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("selected", active);
    });
  map.invalidateSize();
  if (!route) map.setView([place.latitude, place.longitude], 12);
  $("#coordinates").textContent =
    `${Math.abs(place.latitude).toFixed(5)}° ${place.latitude >= 0 ? "N" : "S"} / ${Math.abs(place.longitude).toFixed(5)}° ${place.longitude >= 0 ? "E" : "W"}`;
  $("#updated").textContent =
    `${forecast.timezone.replaceAll("_", " ")} · °F / mph`;
  $("#days").replaceChildren(
    ...forecast.daily.time.map((date, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day";
      const local = new Date(date + "T12:00:00");
      const [label, icon] = weather(
        forecast.daily.weather_code[i],
        forecast.daily.precipitation_probability_max[i],
      );
      button.innerHTML = `<span class="day-top"><span class="weekday">${local.toLocaleDateString("en-US", { weekday: "short" })}<span class="date">${local.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span><i data-lucide="${icon}" aria-hidden="true"></i></span><span class="temp">${Math.round(forecast.daily.temperature_2m_max[i])}° <small>/ ${Math.round(forecast.daily.temperature_2m_min[i])}°</small></span><span class="condition">${label}</span><span class="rain"><i data-lucide="droplets" aria-hidden="true"></i>${forecast.daily.precipitation_probability_max[i]}% rain</span>`;
      button.setAttribute(
        "aria-label",
        `${date}, ${label}, high ${Math.round(forecast.daily.temperature_2m_max[i])} degrees, ${forecast.daily.precipitation_probability_max[i]} percent rain chance`,
      );
      button.addEventListener("click", () => {
        selectedDay = i;
        renderDay();
      });
      return button;
    }),
  );
  if (!getWindow(selectedDay) && selectedDay === 0) selectedDay = 1;
  $("#results").hidden = false;
  $("#status").textContent = "";
  renderDay();
}
async function loadForecast(nextPlace, restoreDate) {
  controller?.abort();
  controller = new AbortController();
  $("#status").textContent = "Getting the latest forecast…";
  $("#results").hidden = true;
  $("#locations").hidden = true;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: nextPlace.latitude,
      longitude: nextPlace.longitude,
      timezone: "auto",
      forecast_days: "5",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      current: "temperature_2m",
      hourly:
        "apparent_temperature,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_gusts_10m_max",
    });
    if (Number.isFinite(nextPlace.elevation))
      url.searchParams.set("elevation", nextPlace.elevation);
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      throw new Error("Forecast unavailable. Please try again shortly.");
    const data = await response.json();
    const requiredDaily = [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "uv_index_max",
      "wind_gusts_10m_max",
    ];
    const requiredHourly = [
      "apparent_temperature",
      "precipitation_probability",
      "wind_speed_10m",
      "wind_gusts_10m",
      "weather_code",
    ];
    if (
      !data.hourly?.time?.length ||
      !data.daily?.time?.length ||
      requiredDaily.some(
        (key) =>
          data.daily[key]?.length !== data.daily.time.length ||
          data.daily[key].some((v) => !Number.isFinite(v)),
      ) ||
      requiredHourly.some(
        (key) => data.hourly[key]?.length !== data.hourly.time.length,
      )
    )
      throw new Error("Forecast data is incomplete. Please retry.");
    forecast = data;
    place = nextPlace;
    fetchedAt = new Date();
    if (!place.routePoint) clearRoute();
    selectedDay = Math.max(0, forecast.daily.time.indexOf(restoreDate));
    renderForecast();
  } catch (error) {
    if (error.name !== "AbortError") $("#status").textContent = error.message;
  }
}
async function search(query) {
  controller?.abort();
  controller = new AbortController();
  $("#status").textContent = "Finding your destination…";
  $("#locations").hidden = true;
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({
      name: query,
      count: "5",
      language: "en",
    });
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      throw new Error("Location search unavailable. Please try again.");
    const matches = (await response.json()).results;
    if (!matches?.length)
      throw new Error("No city found. Try a nearby town or add a state.");
    if (matches.length === 1) return loadForecast(matches[0]);
    $("#locations").replaceChildren(
      ...matches.map((match) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = match.name;
        const small = document.createElement("small");
        small.textContent = [match.admin1, match.country]
          .filter(Boolean)
          .join(", ");
        button.append(small);
        button.addEventListener("click", () => loadForecast(match));
        return button;
      }),
    );
    $("#locations").hidden = false;
    $("#status").textContent =
      "Choose the matching destination in the location list.";
  } catch (error) {
    if (error.name !== "AbortError") $("#status").textContent = error.message;
  }
}
$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  search($("#location").value.trim());
});
document.querySelectorAll("[data-place]").forEach((button) =>
  button.addEventListener("click", () => {
    $("#location").value = button.dataset.place;
    if (button.dataset.latitude) {
      loadForecast({
        name: button.dataset.place,
        latitude: Number(button.dataset.latitude),
        longitude: Number(button.dataset.longitude),
        elevation: Number(button.dataset.elevation),
        admin1: "Utah",
        country: "United States",
      });
    } else search(button.dataset.place);
  }),
);
function setActivity(value) {
  activity = value;
  document.querySelectorAll("[data-activity]").forEach((button) => {
    const active = button.dataset.activity === activity;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
document.querySelectorAll("[data-activity]").forEach((button) =>
  button.addEventListener("click", () => {
    setActivity(button.dataset.activity);
    if (forecast) renderDay();
  }),
);
$("#duration").setAttribute("aria-label", "Time outside");
$("#duration").addEventListener("input", () => {
  duration = Number($("#duration").value);
  $("#duration-value").textContent =
    `${duration} ${duration === 1 ? "hour" : "hours"}`;
  $("#duration").setAttribute(
    "aria-valuetext",
    $("#duration-value").textContent,
  );
  if (forecast) renderDay();
});
$("#save-plan").addEventListener("click", () => {
  if (!bestWindow) return;
  try {
    localStorage.setItem(
      "trail-window-plan",
      JSON.stringify({
        place,
        date: forecast.daily.time[selectedDay],
        duration,
        activity,
        limits,
      }),
    );
    updateSaved();
    $("#save-plan span").textContent = "Plan saved";
  } catch {
    $("#status").textContent =
      "Your browser could not save the plan. Try enabling local storage.";
  }
});
$("#restore-plan").addEventListener("click", () => {
  const saved = readSaved();
  if (!saved) return;
  setActivity(saved.activity);
  duration = saved.duration;
  $("#duration").value = duration;
  $("#duration-value").textContent =
    `${duration} ${duration === 1 ? "hour" : "hours"}`;
  $("#location").value = saved.place.name;
  if (saved.limits) {
    limits = saved.limits;
    $("#rain-limit").value = limits.rain;
    $("#rain-limit-value").textContent = limits.rain + "%";
    $("#gust-limit").value = limits.gust;
  }
  clearRoute();
  loadForecast({ ...saved.place, routePoint: false }, saved.date);
});
function clearRoute() {
  route = null;
  routeLayer?.remove();
  routeLayer = null;
  $("#route-summary").hidden = true;
  $("#route-points").replaceChildren();
}
function importRoute(text) {
  const parsed = TrailRoute.parseGPX(text, DOMParser, (a, b) =>
    L.latLng(a.latitude, a.longitude).distanceTo(
      L.latLng(b.latitude, b.longitude),
    ),
  );
  routeLayer?.remove();
  route = parsed;
  const segments = [];
  for (const point of parsed.points) {
    const last = segments.at(-1);
    if (!last || last.segment !== point.segment)
      segments.push({ segment: point.segment, coords: [] });
    segments.at(-1).coords.push([point.latitude, point.longitude]);
  }
  routeLayer = L.polyline(
    segments.map((s) => s.coords),
    { color: "#16664d", weight: 4 },
  ).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
  $("#route-summary").textContent =
    `${parsed.name} · ${(parsed.distanceMeters / 1000).toFixed(1)} km · ${parsed.hasElevation ? Math.round(parsed.gain) + " m ascent" : "partial or missing elevation"} · ${parsed.points.length} points`;
  $("#route-summary").hidden = false;
  const picks = [
    ["Start", parsed.points[0]],
    [
      parsed.highest.elevation !== null ? "High point" : "Midpoint",
      parsed.highest,
    ],
    ["Finish", parsed.points.at(-1)],
  ];
  $("#route-points").replaceChildren(
    ...picks.map(([label, point]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.latitude = point.latitude;
      button.dataset.longitude = point.longitude;
      button.addEventListener("click", () =>
        loadForecast({
          name: label,
          admin1: parsed.name,
          latitude: point.latitude,
          longitude: point.longitude,
          elevation: point.elevation,
          routePoint: true,
        }),
      );
      return button;
    }),
  );
  return loadForecast({
    name:
      parsed.highest.elevation !== null ? "Route high point" : "Route midpoint",
    admin1: parsed.name,
    latitude: parsed.highest.latitude,
    longitude: parsed.highest.longitude,
    elevation: parsed.highest.elevation,
    routePoint: true,
  });
}
$("#gpx-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Choose a GPX file smaller than 5 MB.");
    await importRoute(await file.text());
  } catch (error) {
    $("#status").textContent = error.message;
  }
  event.target.value = "";
});
$("#demo-route").addEventListener("click", async () => {
  try {
    const response = await fetch("sample-route.gpx");
    if (!response.ok)
      throw new Error("Sample route unavailable. Try importing a GPX.");
    await importRoute(await response.text());
  } catch (error) {
    $("#status").textContent = error.message;
  }
});
$("#point-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const elevation = $("#elevation").value.trim();
  loadForecast({
    name: "Custom trail point",
    admin1: "Coordinates you selected",
    latitude: Number($("#latitude").value),
    longitude: Number($("#longitude").value),
    elevation: elevation === "" ? null : Number(elevation),
  });
});
map.on("click", (event) =>
  loadForecast({
    name: "Selected trail point",
    admin1: route?.name || "Map selection",
    latitude: event.latlng.lat,
    longitude: event.latlng.lng,
    routePoint: !!route,
  }),
);
new ResizeObserver(() => map.invalidateSize()).observe($("#trail-map"));
function updateLimits() {
  const gust = Number($("#gust-limit").value);
  if (!Number.isFinite(gust) || gust < 5 || gust > 100) {
    $("#gust-limit").setAttribute("aria-invalid", "true");
    return;
  }
  $("#gust-limit").removeAttribute("aria-invalid");
  limits = { rain: Number($("#rain-limit").value), gust };
  $("#rain-limit-value").textContent = limits.rain + "%";
  if (forecast) renderDay();
}
$("#rain-limit").addEventListener("input", updateLimits);
$("#gust-limit").addEventListener("input", updateLimits);
$("#gust-limit").addEventListener("change", updateLimits);
$("#download-plan").addEventListener("click", () => {
  if (!bestWindow) return;
  const content = [
    `Trail Window outing plan`,
    `${place.name} (${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)})`,
    `Forecast elevation: ${Math.round(forecast.elevation)} m`,
    `${forecast.daily.time[selectedDay]} · ${clockTime(bestWindow.start)}–${clockTime(bestWindow.end)} · ${forecast.timezone}`,
    `${duration}h ${activity}`,
    `Rain limit ${limits.rain}%, gust limit ${limits.gust} mph`,
    `Fetched ${fetchedAt.toISOString()}`,
    "",
    ...[...$("#packing").querySelectorAll("label")].map(
      (label) =>
        `${label.querySelector("input").checked ? "[x]" : "[ ]"} ${label.textContent}`,
    ),
    "",
    "Point forecast only. Check route conditions and local alerts.",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "trail-window-plan.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$(".trail-controls").open = matchMedia("(min-width: 761px)").matches;
$("#refresh-forecast").addEventListener("click", () => {
  if (place) loadForecast(place, forecast.daily.time[selectedDay]);
});
setInterval(() => {
  if (forecast && !$("#results").hidden) renderDay();
}, 60000);
icons();
updateSaved();
loadForecast({
  name: "Salt Lake City",
  admin1: "Utah",
  country: "United States",
  latitude: 40.7608,
  longitude: -111.891,
});
