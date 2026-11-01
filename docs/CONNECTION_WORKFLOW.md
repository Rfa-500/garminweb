# Connect Garmin CIRQA and Grok later

This guide describes an optional future connection for the demo dashboard. The source includes a local development adapter and a proposed cloud integration contract. Production authentication, durable storage, Grok analysis, and scheduling must be configured and verified before enabling live mode.

The current interface has date-based Home and Health views, a sport-filtered Training view with prior-workout comparisons, and an Insights panel. The methods in [ANALYTICS.md](ANALYTICS.md) define personal baselines, recorded zone coverage, training load per hour, sleep calculations, and duration-matched comparison cohorts. Grok can later explain these deterministic results, but must not replace them with invented WHOOP scores or label a higher workload as better soccer performance.

## 1. Confirm the source and consent

Pair CIRQA with Garmin Connect and let a real activity and sleep period sync. Sign in to [Garmin's personal API settings](https://connect.garmin.com/app/settings/personalApiToken). Garmin's current program offers personal access to your own activity, health, and women's health data, with pull delivery; activity data can include JSON and FIT. [Garmin program overview](https://developer.garmin.com/gc-developer-program/overview/)

The verified server-side authentication flow is:

1. Obtain the personal key through Garmin Connect and store it in the private backend's secret store.
2. Send `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with `Authorization: ApiKey <secret>`.
3. Read the successful response as raw JWT text, not a JSON object with an `access_token` field. The official client derives its expiry from the JWT `exp` claim.
4. Send subsequent data requests to `https://personal.connectapi.garmin.com` with `Authorization: Bearer <token>` and `Accept: application/json`. Keep the token server-side. [Garmin authentication guide](https://developer.garmin.com/gc-developer-program/personal/personal-api/), [official authenticator implementation](https://github.com/garmin/connect-personal-api-python/blob/main/src/garmin_personal_api/auth.py)

The verified [endpoint inventory](garmin-endpoints.json) contains all 26 paths in the inspected [official Swagger reference](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/), including exact parameters and selected response fields. For a first read, use daily summaries, daily sleep, HRV, paginated activities, and profile HR zones. Handle `204` and absent fields as unavailable data. Exact account permissions, rates, and payload availability still need to be checked for the connected account.

The built local collector also reads `/wellness-service/wellness/dailyHeartRate?date=YYYY-MM-DD` for at most three dates per collection: today plus the two most recent distinct earlier dates for the most frequent recorded sport in the 28-day window. Ties use the most recent session. The normalizer follows the response's timestamp/heart-rate descriptors and retains only actual samples. Failed, empty, malformed, or mismatched-date replies cannot erase a valid cached day. Other cached heart-rate days within that window remain available; there is no claim of complete 28-day sample coverage. This happens only during an authorized manual collection, not an enabled scheduler.

If personal API access is unavailable for your account, use an official export as a manual import until access is resolved. An export does not provide automatic syncing. Do not treat old unofficial login libraries as the default production connection.

Garmin Connect is the upstream source. The cloud bot cannot read unsynced measurements from an out-of-range band or manufacture a GPS trace that the phone never recorded.

## 2. Map the complete device feature set

The following capability inventory is based on Garmin's CIRQA announcement. Device support does not guarantee that your API token exposes every field. Verify this map against a real response before showing any live metric. [Official CIRQA announcement](https://www.garmin.com/en-US/newsroom/press-release/wearables-health/meet-cirqa-smart-band-the-screen-free-health-and-fitness-tracker-from-garmin/)

| CIRQA capability | Dashboard/integration treatment |
| --- | --- |
| Wrist heart rate, Body Battery, stress | Daily recovery context and trends; retain Garmin labels. |
| Pulse Ox, skin temperature, respiration | Individual measurements with units and timestamps; respect regional availability. |
| Sleep stages, score, duration guidance, naps | Sleep detail, consistency, and goal comparisons. |
| HRV and HRV status | Recovery history with sufficient baseline coverage. |
| Training readiness, training status, VO2 max | Show source-provided values only. |
| Workout benefit and recovery time | Workout detail and goal-based recommendations. |
| Steps and calories | Daily activity context, independent of training scores. |
| Automatic activity detection and 80+ manual activity types | Preserve Garmin classifications and later corrections; do not reduce ingestion to running. |
| Connected GPS | Route/distance/pace only when recorded; identify phone-derived GPS. |
| LiveTrack | Garmin-native sharing; no invented API switch or inferred location. |
| Menstrual cycle, pregnancy, temperature-based predictions | Optional, explicit consent; missing until authorized and exposed. |
| Natural Cycles integration | Separate native service/subscription; no fertility calculations here. |
| Screen-free use, wrist/arm wear, battery life | Device context; live battery percentage only if an actual source supplies it. |

For each capability, store device support separately from API exposure and current data availability. Maintain a record such as `{ supported: true, apiExposure: "unverified", availability: "not_recorded" }` until verified. This prevents a missing field from masquerading as a zero or a normal reading.

## 3. Add the private integration backend

For the future hosted bot connection, use a durable database for raw normalized records, goals, jobs, capability metadata, and immutable snapshot revisions. Keep the last successful snapshot as the current pointer. All records belong to the authenticated owner. Protect both the hosted site's access gate and the application API; a bot service token must not require making the whole dashboard public. Keep any local-only adapter's private cache outside `dist/` and outside source publication.

The local server already implements the two reads, goal writes, and synchronous refresh in the table below. Implement the remaining job and bot-write functions in a properly authenticated production backend when connecting Grok:

| Endpoint | Responsibility |
| --- | --- |
| `GET /api/v1/snapshot` | Return the latest committed snapshot immediately, with its revision/ETag. Never trigger analysis on page load. |
| `GET /api/v1/goals` | Read the owner's current goals and revision. |
| `PUT /api/v1/goals` | Validate and save goals with optimistic concurrency; the bot reads the new revision next run. |
| `POST /api/v1/refresh` | Accept an authenticated manual request, deduplicate it, enqueue work, and return `202` with a job ID. |
| `GET /api/v1/jobs/:id` | Return the owner's job state and committed snapshot revision when complete. |
| `PUT /api/v1/snapshot` | Restricted bot/service write; validate and atomically commit a new snapshot. Never expose its credential in frontend code. |

The [integration contract](API_CONTRACT.md) is authoritative for field names and exact responses consumed by `dist/api.js`. The local server checks Host/Origin and CSRF, binds to loopback, and stores private files outside the public directory. The browser adapter sends same-origin credentials and supports scoped caching. Internet-facing session establishment, owner authorization, and sign-out/account-switch lifecycle still need implementation for hosted live mode. The bot will use a separate scoped service identity, limited to the specific owner's job/data/snapshot functions. Do not use a browser-stored API key. Include rate limits, payload bounds, idempotency keys, and optimistic revision checks. Render model prose as text rather than raw HTML.

## 4. Provide credentials securely

For local development, configure `GARMIN_PERSONAL_API_KEY` in an untracked environment file read only by the server. Never include credentials or account records in a repository or static deployment. For future hosted operation, use the host's secret store for Garmin, the dashboard service token, and webhook secrets. For Grok Bot, use its secure secret card; website login belongs in Vault or its secure sign-in flow. Never put keys in the prompt, source repository, localStorage, URLs, screenshots, or ordinary chat. [Grok secret handling](https://docs.x.ai/grok-bot/vault)

Use a personal, private Bot for health data. Review which account and runtime can access it. Send only fields needed for the selected insight; keep precise routes and reproductive health out of model input unless explicitly opted in and relevant.

## 5. Connect the analysis runner

Create a Grok Bot and give it [GROK_BOT_PROMPT.md](GROK_BOT_PROMPT.md), the verified capability map, the dashboard contract, and the private backend origin. Grok Bot has a persistent cloud environment and supports skills/routines; its own subscription/runtime is distinct from directly using the Grok API. [Grok Bot overview](https://docs.x.ai/grok-bot/overview)

If you choose a conventional server worker instead, obtain an API key from the xAI console and call the Responses API at `https://api.x.ai/v1/responses` from that server. Keep the model ID configurable and select a currently available model during setup. [Official API quickstart](https://docs.x.ai/developers/quickstart)

Use a structured output schema for recommendations and evidence references. Model recommendation objects must use exactly `source: "grok"` and the snapshot must carry the actual analyzed `goalsVersion`; the interface shows this advice only for the latest source day with the current goal revision. Validate it independently even when schema-constrained generation is enabled. Compute chart values and comparison arithmetic deterministically in the backend; the model writes explanations, not authoritative sensor values. [Structured output documentation](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)

## 6. Implement quiet scheduled checks

The future runner executes this sequence:

1. Acquire a per-owner lock and load the latest goals, source cursor, and analyzed fingerprint.
2. Pull a bounded recent window plus newly available records, following Garmin pagination and limits. Revisit a lookback window to capture late syncs and corrections.
3. Upsert by source record ID/version. Normalize units and timezone boundaries; deduplicate manual and auto-detected records when source relationships identify duplicates.
4. Calculate a fingerprint over relevant normalized records. If nothing changed, release the lock and stop silently. Do not alter measurement or analysis timestamps.
5. If new or corrected data exists, build deterministic summaries and request goal-aware analysis.
6. Validate the entire candidate snapshot. Commit it atomically only if input and goal revisions are still current; retain the old one on any failure.

After the one-time flow passes testing and you authorize activation, create one Grok routine for every 30 minutes in the owner’s configured IANA timezone. Verify its saved schedule and keep the no-new-data/no-notification rule in its instruction. Grok supports schedules and webhook routines; scheduled runs happen in the cloud. [Routine documentation](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Do not create an app-side `setInterval` as the automation: browser timers stop when the page is closed. No sync or unavailable phone means unchanged saved information, with no repeated banners or notifications. Authentication failures belong in a quiet connection-status view and private operational logs, not a warning on every scheduled check.

## 7. Wire manual refresh

The button calls `POST /api/v1/refresh` with an `Idempotency-Key` header and `{ reason: "manual", goalsVersion, dataThrough }`. Keep existing cards visible; show a spinner and disable repeat submission while that job is active. The backend dispatches to the runner. It returns `{ jobId }`, or `{ snapshot }` only if an analysis is already committed. A completed job must return `{ status: "completed", snapshot }` for the current adapter.

With Grok Bot, later add a webhook-triggered routine for manual jobs. Keep the webhook URL/key server-side; the backend sends the authorized job ID. A webhook's `200` confirms acceptance, not finished analysis. The bot must commit a snapshot and complete the job before the UI reports success. [Grok webhook behavior](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Manual jobs attempt a bounded Garmin pull, then reanalyze the latest valid stored data even if the wearable has not synced. The prepared adapter polls up to 20 times with a two-second delay and a 12-second timeout per request. A returned completed snapshot replaces the cache. Job persistence/recovery after reload and backoff are backend-connection work, not implemented demo features. If a job fails or the polling window ends, retain saved cards and give one subtle inline result for that explicit click; the worker may still finish independently.

The v1 envelope uses `generatedAt` for successful analysis and `dataThrough` for its source-data watermark. Individual metrics use `observedAt`; `device.lastSyncAt` is the actual sync timestamp when supplied. Keep ingestion/received timestamps separately in backend records. The visible “last updated” label is based on `generatedAt`; it must never imply a new wearable sync. A no-op scheduled check advances none of these timestamps.

## 8. Switch from demo after acceptance checks

Run these cases against a private test account before enabling live mode or scheduling:

- Opening the dashboard renders the saved snapshot immediately, then quietly checks its revision.
- New Garmin data produces one new analysis and one atomic snapshot.
- Unchanged data, no phone connection, and delayed sync produce no repeated user messages.
- Manual refresh reanalyzes the latest valid data, shows loading, and finishes without a fake sync timestamp.
- A late correction updates the relevant workout once; simultaneous manual/scheduled jobs cannot overwrite a newer snapshot.
- Goal changes persist and appear in the next analysis; stale goal revisions cannot publish.
- Null, unauthorized, or unexposed metrics display unavailable states and never fabricated values.
- Network errors, invalid model output, and expired tokens preserve the last successful snapshot.
- Demo and live storage are isolated; no live failure falls back to demo measurements.
- Reload during a job, sign-out, a second device, and a narrow mobile screen behave correctly.

Once verified, switch the frontend's data provider to the live adapter and perform one real manual refresh. Keep the site owner-private. Only then, when you request it, activate the scheduled and manual-trigger routines. No automation has been activated as part of this build.
