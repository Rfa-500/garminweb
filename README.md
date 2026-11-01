# CIRQA training dashboard

A mobile-first training dashboard with a dark interface, interactive charts, editable goals, and sport-specific comparisons. The hosted application uses clearly labeled fictional demo data.

## Features

- Sleep, recovery, and effort views with explicit measurement names and units.
- Soccer, running, and strength examples, including duration-adjusted workload comparisons.
- Personal-baseline charts, sleep consistency, and weekly goal progress.
- Saved insights, a manual refresh state, and date navigation.
- A documented integration contract and separate Grok setup prompt.

The interface does not estimate proprietary WHOOP scores. Missing measurements remain unavailable. Demo examples are not personal health records.

## Run the demo

Requires Node.js 22 or newer. No dependencies need to be installed.

```sh
node server.mjs --demo
```

Open http://127.0.0.1:4173.

## Deploy on Vercel

Import this repository into Vercel. The included `vercel.json` selects `dist` as the output directory and runs syntax checks and synthetic tests before deployment.

The deployment is a static demo. The optional local adapter is development code and is not deployed as a public API. A live cloud integration requires authentication, durable storage, and the validation described in the integration contract. No scheduled jobs or AI service are enabled by this repository.

## Integration documentation

- [Connection workflow](docs/CONNECTION_WORKFLOW.md)
- [Grok bot prompt template](docs/GROK_BOT_PROMPT.md)
- [API contract](docs/API_CONTRACT.md)
- [Calculation methods](docs/ANALYTICS.md)
- [Garmin endpoint reference](docs/garmin-endpoints.json)

Environment files, account records, local caches, and credentials are excluded from source control and deployment. Do not add account data to demo fixtures or source files.

## Checks

```sh
npm run check
npm test
```

Tests use synthetic inputs and cover validation, demo/live separation, persistence, stale-data retention, goals, authorization boundaries, analytics, normalization, and bounded collection. They do not contact Garmin or Grok.
