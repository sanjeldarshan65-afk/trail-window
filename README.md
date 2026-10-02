# Trail Window

Trail Window is a small outdoor outing planner. Search for a city, choose hiking, biking, or running, and compare five days of weather. It ranks daylight hours by precipitation chance, wind, apparent temperature, and activity-specific comfort, then suggests a packing list.

The site uses the [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) and [Weather Forecast API](https://open-meteo.com/en/docs). It is a static site with no account, backend, or API key. Forecasts are for the searched location and are not a substitute for local trail reports or safety advisories.

## Run locally

Open `index.html` in a browser. An internet connection is needed for forecast data.

## Development

I used AI as a coding collaborator to explore interface ideas and edge cases, then checked the forecast flow and interactions in a browser. The recommendation itself is a transparent scoring rule in `app.js`, not an AI prediction.
