# CIRQA training dashboard

A responsive Garmin training dashboard with animated charts, editable personal goals and profile, same-sport comparisons, sleep analysis, and recovery trends.

## Run locally

Requires Node.js 22+. Run `npm ci`, then `npm run dev`. Open http://127.0.0.1:4173. Run `node server.mjs --demo` for fictional fixtures. Real account data belongs only in the ignored `.local` directory and `.env.local`.

## Private deployment

The Vercel backend uses private Blob storage, server-only Garmin credentials, Vercel Authentication on **all deployments**, and same-origin session/CSRF checks. Production credentials must never be assigned to preview deployments. Keep deployment protection enabled before configuring live access.

Required production variables: `GARMIN_PERSONAL_API_KEY`, `APP_SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN`, `DASHBOARD_ORIGIN`, `PRIVATE_DASHBOARD_ENABLED`, `INITIAL_PROFILE`, and `INITIAL_GOALS`. Secrets and personal profile values must be encrypted. The initial profile and goals are used only when initializing an empty private store.

The browser shows saved insights first and requests a quiet check on opening and every 30 minutes while visible. Manual refresh requests the latest available Garmin data. Failed or unchanged reads preserve saved information. No background scheduler is enabled.

Calculated feedback works without an AI provider. Optional AI-written feedback uses the Vercel AI SDK and requires `AI_FEEDBACK_ENABLED=true`, `AI_GATEWAY_API_KEY`, and a supported `AI_FEEDBACK_MODEL`; it is disabled by default. A Garmin key does not authorize AI inference.

## Data coverage

The importer retains activity history, paginates available workouts, backfills 90 days of daily/HRV/sleep summaries, and preserves previous records. Sleep history requests respect Garmin's 31-day limit. Body Battery and heart-rate curves contain source samples only. Missing features remain unavailable; no WHOOP-style scores are invented.

## Documentation

- [Connection workflow](docs/CONNECTION_WORKFLOW.md)
- [Optional Grok prompt](docs/GROK_BOT_PROMPT.md)
- [API contract](docs/API_CONTRACT.md)
- [Calculation methods](docs/ANALYTICS.md)
- [Garmin endpoint reference](docs/garmin-endpoints.json)

## Validation

Run `npm run check` and `npm test`. Tests use synthetic data and never contact Garmin or an AI provider. Environment files, real account records and private caches are excluded from Git and deployment.
