const form = document.querySelector('#search-form');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const daysEl = document.querySelector('#days');
let activity = 'hiking';
let forecast = null;
let selectedDay = 0;

const weatherLabel = code => {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67 || code >= 80 && code <= 82) return 'Rain likely';
  if (code <= 77 || code >= 85 && code <= 86) return 'Snow possible';
  if (code >= 95) return 'Thunderstorms';
  return 'Variable conditions';
};

const scoreHour = (rain, wind, feels, code) => {
  let score = rain * 0.7 + Math.max(0, wind - 10) * 1.4;
  score += Math.max(0, 42 - feels) * 1.2 + Math.max(0, feels - 82) * 1.5;
  if (code >= 95) score += 80;
  if (activity === 'biking') score += Math.max(0, wind - 12) * 1.2;
  if (activity === 'running') score += Math.max(0, feels - 75) * 1.3;
  return score;
};

function renderDay() {
  const d = forecast.daily;
  const date = d.time[selectedDay];
  [...daysEl.children].forEach((button, i) => {
    button.classList.toggle('active', i === selectedDay);
    button.setAttribute('aria-pressed', i === selectedDay);
  });
  const hours = forecast.hourly.time.map((time, i) => ({
    time, rain: forecast.hourly.precipitation_probability[i],
    wind: forecast.hourly.wind_speed_10m[i], feels: forecast.hourly.apparent_temperature[i],
    code: forecast.hourly.weather_code[i]
  })).filter(hour => hour.time.startsWith(date) && Number(hour.time.slice(11, 13)) >= 8 && Number(hour.time.slice(11, 13)) <= 18);
  const valid = hours.filter(hour => hour.code < 95);
  const best = (valid.length ? valid : hours).sort((a, b) => scoreHour(a.rain, a.wind, a.feels, a.code) - scoreHour(b.rain, b.wind, b.feels, b.code))[0];
  const time = new Date(`${best.time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: undefined });
  document.querySelector('#window-title').textContent = `${time} is your best bet`;
  document.querySelector('#window-reason').textContent = `${weatherLabel(best.code)} around this hour, with ${best.rain}% chance of precipitation and wind near ${Math.round(best.wind)} mph.`;
  document.querySelector('#metrics').innerHTML = `<div class="metric"><strong>${Math.round(best.feels)}°</strong><span>Feels like</span></div><div class="metric"><strong>${best.rain}%</strong><span>Rain chance</span></div><div class="metric"><strong>${Math.round(best.wind)} mph</strong><span>Wind</span></div>`;
  const packing = ['Water and a charged phone', 'Map or downloaded route'];
  if (best.rain >= 25 || d.precipitation_probability_max[selectedDay] >= 40) packing.push('Rain shell');
  if (d.temperature_2m_min[selectedDay] < 50) packing.push('Warm layer');
  if (d.temperature_2m_max[selectedDay] > 75) packing.push('Sun protection and extra water');
  if (best.wind >= 20) packing.push('Windproof layer');
  document.querySelector('#packing').replaceChildren(...packing.map(item => { const li = document.createElement('li'); li.textContent = item; return li; }));
}

function renderForecast(place) {
  document.querySelector('#place-heading').textContent = `${place.name}, ${place.admin1 || place.country}`;
  document.querySelector('#updated').textContent = `Local time · ${forecast.timezone_abbreviation || forecast.timezone}`;
  daysEl.replaceChildren(...forecast.daily.time.map((date, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'day';
    const weekday = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
    button.innerHTML = `<span class="weekday">${weekday}</span><span class="condition">${weatherLabel(forecast.daily.weather_code[i])}</span><span class="temp">${Math.round(forecast.daily.temperature_2m_max[i])}° <small>/ ${Math.round(forecast.daily.temperature_2m_min[i])}°</small></span><span class="rain">${forecast.daily.precipitation_probability_max[i]}% rain chance</span>`;
    button.addEventListener('click', () => { selectedDay = i; renderDay(); });
    return button;
  }));
  selectedDay = 0; renderDay(); results.hidden = false; status.textContent = '';
}

async function loadForecast(query) {
  status.textContent = 'Loading forecast…'; results.hidden = true;
  try {
    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geoUrl.search = new URLSearchParams({ name: query, count: '1', language: 'en' });
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error('Location search is unavailable. Try again.');
    const place = (await geoResponse.json()).results?.[0];
    if (!place) throw new Error('No location found. Try a nearby city or town.');
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: place.latitude, longitude: place.longitude, timezone: 'auto', forecast_days: '5', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', hourly: 'apparent_temperature,precipitation_probability,wind_speed_10m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' });
    const response = await fetch(url);
    if (!response.ok) throw new Error('The forecast is unavailable. Try again shortly.');
    forecast = await response.json();
    renderForecast(place);
  } catch (error) { status.textContent = error.message || 'Something went wrong. Try again.'; }
}

form.addEventListener('submit', event => { event.preventDefault(); loadForecast(document.querySelector('#location').value.trim()); });
document.querySelectorAll('[data-activity]').forEach(button => button.addEventListener('click', () => {
  activity = button.dataset.activity;
  document.querySelectorAll('[data-activity]').forEach(item => { const active = item === button; item.classList.toggle('selected', active); item.setAttribute('aria-pressed', active); });
  if (forecast) renderDay();
}));
loadForecast(document.querySelector('#location').value);
