# Trail Window

[Live app](https://sanjeldarshan65-afk.github.io/trail-window/)

An outdoor planning workspace that helps hikers, riders, and runners compare five days of weather and find a forecast window for their outing.

## Features

- Location search with matching city choices.
- Interactive OpenStreetMap map with coordinate entry and elevation overrides.
- Local GPX import, route distance, elevation-derived ascent, and selectable start/high/finish forecasts.
- Activity and duration controls that update the recommended window.
- Consecutive daylight windows that exclude past hours and thunderstorms.
- Personal rain and gust limits, a sunset buffer, and an explanation of each window's ranking.
- Interactive hourly temperature and rain charts, with a numeric table alternative.
- Sunrise, sunset, wind gusts, UV, and condition-based packing suggestions.
- Saved plan and checklist stored locally in the browser.
- Downloadable outing plan with forecast point, timestamp, limits, and checklist.
- Keyboard navigation, visible focus, mobile layouts, and reduced motion support.

## Run

Run `python3 -m http.server 8000` and visit `http://localhost:8000`. Weather and map tiles require an internet connection. For tests, run `npm ci` followed by `npm test`.

## Architecture

Static HTML, CSS, and JavaScript with no backend or API keys. Weather and city search use [Open-Meteo](https://open-meteo.com/en/docs). Supplied GPX elevations are sent as the API's elevation parameter for statistical downscaling. Chart.js handles charts; Lucide provides icons; Leaflet handles mapping and distance calculations. These libraries are vendored. OpenStreetMap serves map tiles and Google Fonts supplies typography.

`planner.js` contains the scoring rule, `route.js` validates GPX, and `app.js` handles API calls, local storage, and the interface. GPX files are parsed locally; only the selected point coordinates and elevation are sent to the weather provider. Map tile requests also reveal the viewed map area to OpenStreetMap. The app never requests the user's device location.

## Recommendation decisions

Candidates are complete, consecutive hourly windows during daylight, from 6 AM to 8 PM, finishing at least 30 minutes before sunset. They exclude past times, thunderstorms, missing values, and hours exceeding the user's rain or gust limits. The destination's timezone is used even when the browser is elsewhere.

The average hourly penalty is rain probability × 0.7, sustained wind above 10 mph × 1.4, gusts above 20 mph × 1, apparent temperatures below 42°F × 1.2, and apparent temperatures above 75°F × 1.5. Biking adds wind above 12 mph × 1.2; running adds temperature above 75°F × 1.3. Lower penalties rank first, with earlier starts winning ties. The interface shows these components alongside alternative windows and explicitly identifies equal-score ties. These are comfort preferences, not medically validated thresholds.

Wasatch (Brighton) and Uintas (Trial Lake) shortcuts use approximate forecast points and elevations from the USDA [Brighton](https://wcc.sc.egov.usda.gov/nwcc/site?sitenum=366&state=ut) and [Trial Lake](https://wcc.sc.egov.usda.gov/nwcc/site?sitenum=828) station metadata, rounded to the published minute coordinates. They request modeled weather, not station observations, and do not represent whole mountain ranges or verified trailheads. Import your own GPX for a trail-specific forecast. Daily rain icons are suppressed at precipitation probabilities of 20% or below, except snow and thunderstorms, which remain visible. UV values are rounded and categorized using the [EPA scale](https://www.epa.gov/sunsafety/uv-index-scale-0) (6–7 is High). Packing reasons distinguish selected-window conditions from daily highs.

These are transparent comfort heuristics, not calibrated risk probabilities. Terrain, lightning outside the forecast grid, avalanche hazards, trail closures, and route exposure are not modeled. A selected route point is not a forecast for every point along the route. GPX ascent is an estimate derived from raw elevation differences and can include GPS noise. The bundled sample is illustrative and is not a navigation route.

## AI-assisted development

AI helped with design exploration, implementation, and edge-case analysis. UI/UX Pro Max guided the dashboard overhaul. Browser checks cover responsive layouts, location search, GPX import, custom elevation, weather limits, plan export, saved plans, and checklist persistence. Automated tests cover window boundaries, missing hours and values, weather limits, scoring components, invalid GPX coordinates and elevations, namespaces, and disconnected track segments. Recommendations use explicit rules, not generative AI predictions.
