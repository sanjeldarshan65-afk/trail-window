# Trail briefing Worker

A Cloudflare Worker that turns derived forecast numbers into a 2–3 sentence
trail briefing using the Anthropic Messages API. It exists so the API key
stays on the server. The static site never sees it.

## What it accepts

`POST /` with `Content-Type: application/json`, at most 4 KB, matching this
shape exactly. Unknown or missing fields are rejected with `400`.

```json
{
  "location": "Brighton forecast point",
  "activity": "hiking",
  "durationHours": 2,
  "window": { "start": "8 AM", "end": "10 AM" },
  "feelsLikeF": { "min": 38, "max": 51 },
  "maxRainPct": 10,
  "windMph": { "sustained": 9, "gust": 18 },
  "uvIndexMax": 5,
  "sunset": "7:05 PM",
  "elevationM": 2679,
  "penalties": [
    {
      "start": "8 AM",
      "end": "10 AM",
      "rain": 4,
      "wind": 0,
      "temperature": 2.4,
      "total": 6.4
    }
  ]
}
```

It responds with `{ "briefing": "…" }`. Any failure returns
`{ "error": "Briefing unavailable." }` with an HTTP status code and no
upstream details. The site then falls back to its local template.

| Control    | Behavior                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------- |
| CORS       | `https://sanjeldarshan65-afk.github.io`, plus `http://localhost:*` and `http://127.0.0.1:*`  |
| Body size  | 4 KB, enforced while streaming the body (`413`)                                              |
| Schema     | Strict allowlist with types, ranges and 12-hour time formats (`400`)                         |
| Rate limit | 10 requests per minute per `CF-Connecting-IP`, in isolate memory (`429` with `Retry-After`)  |
| Model      | `MODEL` var, default `claude-haiku-4-5`, `max_tokens: 250`, no retries, 7 s upstream timeout |
| Errors     | Generic JSON; only the upstream status code is logged                                        |

CORS only stops other websites from calling the Worker from a browser. Scripts
can still call it directly, so the rate limit and the schema are the real
cost controls. The in-memory limit applies per isolate, which makes it
best-effort. For a hard limit, add Cloudflare's
[Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
and set a monthly spend limit in the Anthropic Console.

## Deploy

```sh
npm i -g wrangler
cd worker
npm install                          # installs @anthropic-ai/sdk for bundling
wrangler login
wrangler secret put ANTHROPIC_API_KEY  # paste the key at the prompt; it is never written to disk
wrangler deploy
```

`wrangler deploy` prints a URL such as
`https://trail-window-briefing.<your-subdomain>.workers.dev`. Paste it into
the single config constant in [`../briefing.js`](../briefing.js):

```js
const BRIEFING_URL =
  "https://trail-window-briefing.<your-subdomain>.workers.dev";
```

Commit and push that change. GitHub Pages then serves the AI briefing. If the
constant is empty or the Worker fails or takes longer than 8 seconds, the card
shows the local template briefing with a "template" badge.

To use a different model, change `MODEL` in `wrangler.toml` and redeploy.

## Local development

```sh
cd worker
echo 'ANTHROPIC_API_KEY=sk-…' > .dev.vars   # gitignored
wrangler dev                                 # http://localhost:8787
```

Then temporarily set `BRIEFING_URL` to `http://localhost:8787` and serve the
site from `http://localhost:8000`. Don't commit that change.

## Tests

```sh
cd worker && npm install && npm test
```

The tests cover validation, the size limit, CORS, rate limiting, generic
errors, refusals, and a contract check that every payload the frontend builds
passes the Worker's validator. The Anthropic API is stubbed through the SDK's
`fetch` option, so the tests need no key.
