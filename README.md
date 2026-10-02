# Trail Window

[Live app](https://sanjeldarshan65-afk.github.io/trail-window/)

An outdoor planning workspace that helps hikers, riders, and runners compare five days of weather and find a forecast window for their outing.

## Features

- Location search with matching city choices.
- Activity and duration controls that update the recommended window.
- Consecutive daylight windows that exclude past hours and thunderstorms.
- Interactive hourly temperature and rain charts, with a numeric table alternative.
- Sunrise, sunset, wind gusts, UV, and condition-based packing suggestions.
- Saved plan and checklist stored locally in the browser.
- Keyboard navigation, visible focus, mobile layouts, and reduced motion support.

## Run

Open `index.html`, or run `python3 -m http.server 8000` and visit `http://localhost:8000`. Forecasts require an internet connection. Run `node planner.test.js` to check the recommendation rules.

## Architecture

Static HTML, CSS, and JavaScript with no backend or API keys. Weather and city search use [Open-Meteo](https://open-meteo.com/en/docs). Chart.js handles charts; Lucide provides icons. Vendored dependencies keep these libraries available without a runtime CDN. Google Fonts and Unsplash supply typography and the mountain inspiration photograph. The photograph does not represent the selected location.

`planner.js` contains the inspectable scoring rule. `app.js` handles API calls, local storage, and the interface. Forecasts are city-level estimates, not local trail reports or safety assessments.

## AI-assisted development

AI helped with design exploration, implementation, and edge-case analysis. UI/UX Pro Max guided the dashboard overhaul. Browser verification covered 375, 768, 1024, and 1440px layouts, location selection, errors, activity and duration controls, saved plans, and checklist persistence. Focused logic tests cover daylight limits, elapsed time, duration, thunderstorms, and missing data. Recommendations use explicit rules, not generative AI predictions.
