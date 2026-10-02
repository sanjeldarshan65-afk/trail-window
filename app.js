const $ = selector => document.querySelector(selector);
let forecast, place, chart, controller, bestWindow;
let selectedDay = 0, activity = 'hiking', duration = 2;
const checked = new Set((() => { try { return JSON.parse(localStorage.getItem('trail-window-packing')) || []; } catch { return []; } })());
const icons = () => window.lucide?.createIcons();
const clockTime = time => {
  const hour = Number(time.slice(11, 13));
  const minute = time.slice(14, 16);
  return `${hour % 12 || 12}${minute === '00' ? '' : ':' + minute} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const weather = code => {
  if (code === 0) return ['Clear sky', 'sun'];
  if (code <= 3) return ['Partly cloudy', 'cloud-sun'];
  if (code === 45 || code === 48) return ['Fog', 'cloud-fog'];
  if (code >= 95) return ['Thunderstorms', 'cloud-lightning'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snow', 'cloud-snow'];
  return ['Rain showers', 'cloud-rain'];
};
const readSaved = () => { try { return JSON.parse(localStorage.getItem('trail-window-plan')); } catch { return null; } };
function updateSaved() {
  const saved = readSaved();
  if (saved) {
    $('#saved-summary').textContent = `${saved.place.name} · ${saved.date} · ${saved.duration}h ${saved.activity}`;
    $('#restore-plan').hidden = false;
  }
}
function getHours(day) {
  return forecast.hourly.time.map((time, i) => ({ time, feels: forecast.hourly.apparent_temperature[i], rain: forecast.hourly.precipitation_probability[i], wind: forecast.hourly.wind_speed_10m[i], code: forecast.hourly.weather_code[i] })).filter(hour => hour.time.startsWith(forecast.daily.time[day]));
}
function getWindow(day) {
  return TrailPlanner.findWindow(getHours(day), duration, activity, forecast.daily.sunrise[day], forecast.daily.sunset[day], forecast.current.time);
}
function packingProgress() {
  const inputs = [...$('#packing').querySelectorAll('input')];
  $('#packing-progress').textContent = `${inputs.filter(input => input.checked).length} of ${inputs.length} packed`;
}
function renderPacking() {
  const d = forecast.daily;
  const items = ['Water bottle', 'Charged phone', 'Offline map'];
  if (d.precipitation_probability_max[selectedDay] >= 25) items.push('Rain shell');
  if (d.temperature_2m_min[selectedDay] < 55) items.push('Warm layer');
  if (d.uv_index_max[selectedDay] >= 3) items.push('Sun protection');
  if (d.temperature_2m_max[selectedDay] >= 80) items.push('Extra water');
  if (d.wind_gusts_10m_max[selectedDay] >= 20) items.push('Windproof layer');
  if (activity === 'biking') items.push('Helmet & repair kit');
  if (activity === 'hiking') items.push('Trail snacks');
  $('#packing').replaceChildren(...items.map(item => {
    const label = document.createElement('label'); label.className = 'pack-item';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked.has(item);
    input.addEventListener('change', () => {
      input.checked ? checked.add(item) : checked.delete(item); packingProgress();
      try { localStorage.setItem('trail-window-packing', JSON.stringify([...checked])); } catch { /* Checklist still works without storage. */ }
    });
    const span = document.createElement('span'); span.textContent = item;
    label.append(input, span); return label;
  }));
  packingProgress();
}
function renderChart(hours) {
  const visible = hours.filter(h => Number(h.time.slice(11, 13)) >= 6 && Number(h.time.slice(11, 13)) <= 20);
  $('#hourly-table').replaceChildren(...visible.map(h => {
    const row = document.createElement('tr');
    [clockTime(h.time), `${Math.round(h.feels)}°F`, `${h.rain}%`, `${Math.round(h.wind)} mph`].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    return row;
  }));
  if (!window.Chart) return;
  chart?.destroy();
  chart = new Chart($('#hourly-chart'), {
    type: 'line', data: { labels: visible.map(h => clockTime(h.time)), datasets: [
      { label: 'Feels like (°F)', data: visible.map(h => h.feels), borderColor: '#b45309', backgroundColor: '#b4530910', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .35, fill: true, yAxisID: 'temperature' },
      { label: 'Rain chance (%)', data: visible.map(h => h.rain), borderColor: '#167a9a', borderDash: [4, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .2, yAxisID: 'rain' }
    ] }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { padding: 12 } }, scales: { x: { grid: { display: false }, ticks: { color: '#59666c', maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }, border: { display: false } }, temperature: { grid: { color: '#edf0f1' }, border: { display: false }, ticks: { color: '#59666c', callback: value => value + '°', maxTicksLimit: 5, font: { size: 10 } } }, rain: { position: 'right', min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { color: '#167a9a', callback: value => value + '%', stepSize: 50, font: { size: 10 } } } } }
  });
}
function renderDay() {
  const d = forecast.daily;
  [...$('#days').children].forEach((button, i) => { button.classList.toggle('active', i === selectedDay); button.setAttribute('aria-pressed', String(i === selectedDay)); });
  bestWindow = getWindow(selectedDay);
  const recommendation = $('.recommendation');
  recommendation.classList.toggle('warning', !bestWindow || bestWindow.score > 35);
  $('#save-plan').disabled = !bestWindow;
  $('#save-plan span').textContent = 'Save plan';
  if (bestWindow) {
    const maxRain = Math.max(...bestWindow.hours.map(h => h.rain));
    const maxWind = Math.max(...bestWindow.hours.map(h => h.wind));
    $('#window-rating').textContent = bestWindow.score > 35 ? 'Mixed conditions · plan carefully' : 'Your best forecast window';
    $('#window-title').textContent = `${clockTime(bestWindow.start)} – ${clockTime(bestWindow.end)}`;
    $('#window-reason').textContent = `${duration} ${duration === 1 ? 'hour' : 'hours'} for your ${activity === 'hiking' ? 'hike' : activity === 'biking' ? 'ride' : 'run'}, with rain chance up to ${maxRain}% and winds up to ${Math.round(maxWind)} mph. All times are local to ${place.name}.`;
  } else {
    $('#window-rating').textContent = 'Try another day or a shorter outing';
    $('#window-title').textContent = 'No suitable window';
    $('#window-reason').textContent = 'There is not enough remaining daylight for this duration, or the forecast includes thunderstorms throughout the available hours.';
  }
  $('#metrics').innerHTML = [ ['thermometer','Temperature',`${Math.round(d.temperature_2m_max[selectedDay])}° / ${Math.round(d.temperature_2m_min[selectedDay])}°`], ['droplets','Rain chance',`${d.precipitation_probability_max[selectedDay]}%`], ['wind','Wind gusts',`${Math.round(d.wind_gusts_10m_max[selectedDay])} mph`], ['sun','UV index',`${d.uv_index_max[selectedDay]}`] ].map(([icon,label,value]) => `<div class="metric"><i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span><strong class="metric-value">${value}</strong></div>`).join('');
  $('#sunrise').textContent = clockTime(d.sunrise[selectedDay]); $('#sunset').textContent = clockTime(d.sunset[selectedDay]);
  renderChart(getHours(selectedDay)); renderPacking(); icons();
}
function renderForecast() {
  $('#place-heading').textContent = place.name;
  $('#destination-region').textContent = [place.admin1, place.country].filter(Boolean).join(', ');
  $('#coordinates').textContent = `${Math.abs(place.latitude).toFixed(2)}° ${place.latitude >= 0 ? 'N' : 'S'} / ${Math.abs(place.longitude).toFixed(2)}° ${place.longitude >= 0 ? 'E' : 'W'}`;
  $('#updated').textContent = `${forecast.timezone.replaceAll('_',' ')} · °F / mph`;
  $('#days').replaceChildren(...forecast.daily.time.map((date, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'day';
    const local = new Date(date + 'T12:00:00'); const [label, icon] = weather(forecast.daily.weather_code[i]);
    button.innerHTML = `<span class="day-top"><span class="weekday">${local.toLocaleDateString('en-US',{weekday:'short'})}<span class="date">${local.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></span><i data-lucide="${icon}" aria-hidden="true"></i></span><span class="temp">${Math.round(forecast.daily.temperature_2m_max[i])}° <small>/ ${Math.round(forecast.daily.temperature_2m_min[i])}°</small></span><span class="condition">${label}</span><span class="rain"><i data-lucide="droplets" aria-hidden="true"></i>${forecast.daily.precipitation_probability_max[i]}% rain</span>`;
    button.setAttribute('aria-label', `${date}, ${label}, high ${Math.round(forecast.daily.temperature_2m_max[i])} degrees, ${forecast.daily.precipitation_probability_max[i]} percent rain chance`);
    button.addEventListener('click', () => { selectedDay = i; renderDay(); }); return button;
  }));
  if (!getWindow(selectedDay) && selectedDay === 0) selectedDay = 1;
  $('#results').hidden = false; $('#status').textContent = ''; renderDay();
}
async function loadForecast(nextPlace, restoreDate) {
  controller?.abort(); controller = new AbortController();
  $('#status').textContent = 'Getting the latest forecast…'; $('#results').hidden = true; $('#locations').hidden = true;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: nextPlace.latitude, longitude: nextPlace.longitude, timezone: 'auto', forecast_days: '5', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', current: 'temperature_2m', hourly: 'apparent_temperature,precipitation_probability,wind_speed_10m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_gusts_10m_max' });
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Forecast unavailable. Please try again shortly.');
    forecast = await response.json(); place = nextPlace;
    selectedDay = Math.max(0, forecast.daily.time.indexOf(restoreDate)); renderForecast();
  } catch (error) { if (error.name !== 'AbortError') $('#status').textContent = error.message; }
}
async function search(query) {
  controller?.abort(); controller = new AbortController();
  $('#status').textContent = 'Finding your destination…'; $('#locations').hidden = true;
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search'); url.search = new URLSearchParams({ name: query, count: '5', language: 'en' });
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Location search unavailable. Please try again.');
    const matches = (await response.json()).results;
    if (!matches?.length) throw new Error('No city found. Try a nearby town or add a state.');
    if (matches.length === 1) return loadForecast(matches[0]);
    $('#locations').replaceChildren(...matches.map(match => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = match.name;
      const small = document.createElement('small'); small.textContent = [match.admin1, match.country].filter(Boolean).join(', '); button.append(small);
      button.addEventListener('click', () => loadForecast(match)); return button;
    }));
    $('#locations').hidden = false; $('#status').textContent = 'Choose the matching destination in the location list.';
  } catch (error) { if (error.name !== 'AbortError') $('#status').textContent = error.message; }
}
$('#search-form').addEventListener('submit', event => { event.preventDefault(); search($('#location').value.trim()); });
document.querySelectorAll('[data-place]').forEach(button => button.addEventListener('click', () => { $('#location').value = button.dataset.place; search(button.dataset.place); }));
function setActivity(value) {
  activity = value;
  document.querySelectorAll('[data-activity]').forEach(button => { const active = button.dataset.activity === activity; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); });
}
document.querySelectorAll('[data-activity]').forEach(button => button.addEventListener('click', () => { setActivity(button.dataset.activity); if (forecast) renderDay(); }));
$('#duration').setAttribute('aria-label', 'Time outside');
$('#duration').addEventListener('input', () => { duration = Number($('#duration').value); $('#duration-value').textContent = `${duration} ${duration === 1 ? 'hour' : 'hours'}`; $('#duration').setAttribute('aria-valuetext', $('#duration-value').textContent); if (forecast) renderDay(); });
$('#save-plan').addEventListener('click', () => {
  if (!bestWindow) return;
  try { localStorage.setItem('trail-window-plan', JSON.stringify({ place, date: forecast.daily.time[selectedDay], duration, activity })); updateSaved(); $('#save-plan span').textContent = 'Plan saved'; }
  catch { $('#status').textContent = 'Your browser could not save the plan. Try enabling local storage.'; }
});
$('#restore-plan').addEventListener('click', () => {
  const saved = readSaved(); if (!saved) return;
  setActivity(saved.activity); duration = saved.duration; $('#duration').value = duration; $('#duration-value').textContent = `${duration} ${duration === 1 ? 'hour' : 'hours'}`; $('#location').value = saved.place.name; loadForecast(saved.place, saved.date);
});
icons(); updateSaved(); loadForecast({ name: 'Salt Lake City', admin1: 'Utah', country: 'United States', latitude: 40.7608, longitude: -111.891 });
