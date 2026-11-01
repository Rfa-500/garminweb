# CIRQA dashboard integration contract — v1

Status: the static build remains demo-only. The built loopback server implements private local `GET /snapshot`, `GET /goals`, `PUT /goals`, and synchronous `POST /refresh` under `/api/v1`. Local refresh fetches Garmin data and normalizes it; it does not call Grok. Queued jobs, bot snapshot publication, internet-facing owner authentication, and scheduled routines remain future work. See [the README](../README.md) for startup and the private-data boundary.

## Existing frontend boundary

`dist/config.js` exports `mode: "demo"`, `apiBase: "/api/v1"`, `requestTimeoutMs: 12000`, and null live-session bootstrap values `accountScope` and `csrfToken`. `dist/api.js` owns persistence and requests; `dist/data.js` contains the complete fictional example `demoSnapshot`, goals, and validators. Treat that example's shape as a reference, never as a fallback for live health data. A future authenticated server bootstrap supplies an opaque owner-specific `accountScope` and per-session `csrfToken`; neither value is a Garmin or Grok credential.

The adapter renders the saved snapshot synchronously, then calls the live read endpoints only in live mode. Demo refresh waits briefly, regenerates local rule-based recommendations from goals, and advances analysis metadata. It does not create new wearable measurements, change `dataThrough`, change `device.lastSyncAt`, or contact Grok.

## Goals

```json
{
  "version": 1,
  "primary": "Run a faster 5K",
  "targetMinutes": 25,
  "targetKind": "5k-time",
  "workoutsPerWeek": 4,
  "sleepHours": 8,
  "weeklyDistanceKm": 25,
  "weeklyIntensityMinutes": 150
}
```

`version` is an integer of at least 1. `primary` is nonblank, at most 80 characters. Accepted numeric ranges are target minutes 10–120, weekly workouts 1–14 (integer), sleep hours 4–12, and weekly distance 1–200 km. Optional `targetKind` is `5k-time` or `session-duration`; optional `weeklyIntensityMinutes` is an integer 1–3000. Local defaults use session duration and consistent fitness rather than assuming a running goal. The UI increments `version` on edit. The local server accepts the next revision of current goals and returns `409` for a stale competing edit. The future production server must preserve that behavior transactionally.

## Snapshot envelope

| Field | Type and meaning |
| --- | --- |
| `schemaVersion` | Literal `1`. |
| `mode` | `demo` or `live`; must match the configured data provider. |
| `id` | Nonempty unique snapshot revision ID; never reuse for different content. |
| `generatedAt` | ISO timestamp of the successfully committed analysis. |
| `dataThrough` | ISO source-data watermark, unchanged by reanalysis without new input. |
| `timezone` | Valid IANA timezone; example value `America/Panama`. |
| `goalsVersion` | Positive integer identifying the goal revision used for analysis. |
| `device` | `{ model: string, lastSyncAt: ISO timestamp or null }`; never infer a fresh sync from a completed request. |
| `metrics` | Object keyed by the metric names below. Unavailable fields may be absent, or explicitly null with an availability status. |
| `sleep` | Null/absent, or `{ start, end, stages: { deep, rem, light, awake } }`; times are ISO, stage totals are minutes. |
| `history` | Chronological array of daily summaries, described below. |
| `activities` | Array of normalized workouts, described below. |
| `recommendations` | Array of insight objects, described below. |
| `capabilities` | Object retaining nonmeasurement feature availability; see demo example. |
| `heartRateSeries` | Optional array of actual `{ timestamp, bpm }` samples, sorted by ISO time. Empty when no verified samples are imported. |
| `coverage` | Source-window dates and sample counts; no inferred completeness. |

`generatedAt` must not precede `dataThrough`. Available metric observation times must not be later than the source watermark. Timestamps describe actual events; a scheduled no-op must not refresh them. The backend stores source revision/fingerprint, received times, evidence provenance, model ID, prompt version, and input-goal revision in an audit record linked to `id`.

### Metric object

```json
{
  "value": null,
  "unit": "ms",
  "status": "unavailable",
  "source": "garmin",
  "observedAt": null
}
```

Status is one of `available`, `unavailable`, `not-authorized`, or `unsupported`. Available values are finite numbers or source-provided text and require a nonempty source plus valid observation time. Other statuses have null values. In live mode, reject demo provenance everywhere, including activities and recommendations. Never substitute zero for missing data. Restrict each source metric's units, types, and ranges on the server.

| Key | Unit / value |
| --- | --- |
| `readiness`, `sleepScore`, `bodyBattery`, `stress` | `/100`, source value 0–100 |
| `sleepMinutes`, `intensityMinutes`, `napMinutes`, `sleepNeedMinutes`, `weeklyIntensityMinutes` | `min`, nonnegative |
| `hrv` | `ms`, nonnegative |
| `restingHr`, `heartRate` | `bpm`, nonnegative |
| `respiration` | `brpm`, nonnegative |
| `pulseOx` | `%`, 0–100 |
| `skinTemperature` | `°C from baseline`, signed deviation |
| `steps` | `steps`, nonnegative count |
| `calories` | `kcal`, nonnegative |
| `vo2max` | `ml/kg/min`, nonnegative |
| `recoveryHours` | `h`, nonnegative |
| `hrvStatus`, `trainingStatus`, `workoutBenefit` | Empty unit, source-provided text |

These are application-normalized keys, not asserted Garmin API field names. Verify the upstream mapping against the authenticated personal API. The interface does not calculate WHOOP scores. Garmin intensity minutes, if supplied, are separate from ordinary elapsed workout time.

### Daily history

Each row is `{ date: "YYYY-MM-DD", readiness, bodyBattery, sleepScore, intensityMinutes, distanceKm }`. Use local calendar dates in `timezone`; numbers are nullable. Score values are 0–100. Duration/distance are nonnegative. Missing daily observations remain null, not zeros or interpolated measurements. The live normalizer uses the latest recorded daily Body Battery and total valid recorded activity distance across sports. It does not reinterpret other sports as running. Demo history may omit `bodyBattery` and use its fictional readiness series.

The enriched live history additionally provides these nullable fields:

| Field | Meaning |
| --- | --- |
| `source`, `observedAt` | Source label and end timestamp of the daily summary. |
| `restingHr` | Daily recorded resting heart rate, bpm. |
| `hrv`, `hrvStatus` | Nightly average HRV in ms and its source status for that calendar date. |
| `hrvBaselineLow`, `hrvBaselineHigh` | Garmin's supplied balanced-range bounds; never a dashboard-generated range. |
| `hrvObservedAt` | Source HRV summary creation timestamp. |
| `sleepMinutes`, `sleepScore` | Recorded sleep duration in minutes and source score. |
| `sleepStart`, `sleepEnd`, `sleepObservedAt` | UTC sleep interval and source observation time, associated with Garmin's sleep calendar date. |
| `sleepStages` | `{ deep, rem, light, awake }` in minutes, or null if stage totals do not agree with the recorded interval. These are totals, not an ordered stage timeline. |
| `stress`, `respiration` | Daily mean stress score and respiration rate in breaths/minute. |
| `steps`, `calories` | Daily steps and total burned kcal when recorded. |
| `moderateIntensityMinutes`, `vigorousIntensityMinutes` | Separate source minute totals; `intensityMinutes` remains moderate + 2 × vigorous. |
| `bodyBatteryHigh`, `bodyBatteryLow` | Source daily maximum and minimum. |
| `bodyBatteryCharged`, `bodyBatteryDrained` | Source recharge/drain totals, separate from the latest level. |

No missing day is forward-filled. Historical HRV and sleep are joined by source calendar date, not by whichever sample arrived most recently. Coverage reports `restingHrDays`, `hrvDays`, `sleepDays`, and `sleepStageDays`, so analytics can state the number of valid observations.

### Activities

Each workout uses `{ id, name, type, date, distanceKm, durationSec, avgHr, elevationM, effort, benefit, splits, zones, source }`.

- `id` is stable upstream identity; `date` is the actual ISO start timestamp.
- `name`, `type`, `benefit`, `source` are strings. Preserve the source's sport classification in ingestion; the app compares earlier workouts in the same source sport and offers filters for every imported sport. `sportKey` is the preferred grouping key when supplied, with normalized `type` as a fallback.
- `durationSec` is positive. `distanceKm`, `avgHr`, and `elevationM` are finite nonnegative values or null when unavailable.
- `effort` is a user-entered rating on 0–10 or null. Never infer it from heart rate or claim it came from a Garmin sensor.
- `splits` contains recorded full-kilometre durations in seconds; partial kilometres are excluded from this display. Unknown splits use an empty array.
- `zones` contains up to five recorded HR-zone durations in minutes, ordered Z1–Z5, or an empty array. Use actual Garmin profile boundaries in ingestion and audit metadata. No fabricated zones.

Pace can be calculated as `durationSec / distanceKm` where appropriate for the sport and both inputs exist with positive distance. The current sport analytics compare duration, source training load per hour, and recorded heart-rate zones without imposing running pace on soccer or strength workouts. Retain route/conditions metadata server-side so the analysis can qualify comparability. See [ANALYTICS.md](ANALYTICS.md) for comparison calculations and their limits.

Optional live activity extensions are `sportKey`, `endAt`, `maxHr` (bpm), `calories` (kcal), `bodyBatteryImpact` (Garmin's signed `differenceBodyBattery`, unchanged), `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `activityTrainingLoad`, and `vo2max`. Unknown values remain null. These source fields support same-sport comparisons, including soccer, without inventing running pace or a proprietary effort score.

`heartRateSamples` contains the actual samples from `heartRateSeries` falling between the activity's recorded start and end. It is empty if timestamps or source samples are missing. All-day samples may be coarser than workout recordings; label their actual source and sampling coverage. Do not derive peak bursts, continuous exertion, or unrecorded readings between samples. Zone-duration totals may differ from elapsed time; report inconsistent coverage rather than scaling source values into agreement.

### Recorded heart-rate samples

The collector's optional `heartRateDays` array contains official `DailyHeartRateDTO` responses. Each collection fetches at most three dates: today and two recent distinct earlier activity dates from the most frequent sport. Failed/empty replies retain the existing payload for that source calendar date; other cached days in the rolling 28-day window are retained. Missing dates are not asserted to be complete. The normalizer reads each payload's `heartRateValueDescriptors` to locate its `timestamp` and `heartrate` columns; it never assumes column order. It normalizes known epoch-millisecond timestamps, excludes missing or invalid BPM values, deduplicates timestamps, and preserves every remaining sample's time. The chart should break across long gaps rather than interpolate. With no readings, `heartRateSeries` is empty and the heart-rate metric stays unavailable. When readings exist, `metrics.heartRate` is the latest recorded sample with its exact `observedAt`, not a live streaming claim.

### Recommendations

Use `{ id, title, body, action, evidence, source, confidence }`. Text fields are plain text. `evidence` is an array of metric keys, such as `["readiness", "hrv", "sleepMinutes"]`; retain detailed dated evidence server-side. Demo source is exactly `demo-rule` and confidence is `illustrative`. Future model recommendations use exactly `source: "grok"`. Live recommendations identify the actual analysis source and evidence limitations. Do not treat confidence as a measured physiological score.

The interface displays a saved Grok recommendation only on the latest source day and when `snapshot.goalsVersion` matches the current goals' `version`. Older or mismatched-goal model advice is not current advice. Demo recommendations remain visibly labeled. The bot must publish a validated snapshot before any model result appears; a successful webhook trigger alone cannot populate these fields.

The current interface additionally derives date- and goal-aware `local-analysis` insights through `dist/analytics.js`. Its evidence includes values, dates, and usable sample counts. These browser calculations are separate from a future model's persisted `recommendations`; they require no Grok connection and cannot change source measurements. Any later model integration must preserve this distinction in the visible attribution. Today's local manual refresh rebuilds source data and local summary fields; it does not retain or generate connected Grok analysis. The future backend job must join collection and model publication before marking an AI refresh complete.

### Capability flags

The demo uses `{ cycleTracking: "opt-in", pregnancyTracking: "opt-in", naturalCycles: "companion-app", liveTrack: "companion-app", connectedGps: "phone-required" }`. These flags are descriptive, not controls. Keep detailed device support, API exposure, regional support, and consent metadata server-side. Do not automatically enable optional personal health ingestion.

## HTTP endpoints

All responses use JSON, except a genuine `204` when specified. The current adapter expects the exact bodies below; do not wrap successful snapshots/goals in an extra `data` object.

| Method/path | Request | Response |
| --- | --- | --- |
| `GET /api/v1/snapshot` | Authenticated owner session | `200` full snapshot; `404` if none exists. |
| `GET /api/v1/goals` | Authenticated owner session | `200` goals object. |
| `PUT /api/v1/goals` | Goals object | `200` canonical goals; `409` for version conflict. |
| `POST /api/v1/refresh` | `{ "reason": "manual", "goalsVersion": 1, "dataThrough": "…" }`, `Idempotency-Key` header | `202 { "jobId": "…" }`; alternatively `200 { "snapshot": {…} }` after commit. |
| `GET /api/v1/jobs/:id` | Owner-scoped job ID | `{ "status": "queued" }`, `{ "status": "running" }`, `{ "status": "completed", "snapshot": {…} }`, `{ "status": "failed" }`, or `{ "status": "cancelled" }`. |
| `PUT /api/v1/snapshot` | Full candidate snapshot, bot service identity, expected revision and idempotency metadata | `200` committed snapshot; `409` if input/goal/current-snapshot revision conflicts. Not called from the browser. |

The browser uses `credentials: "same-origin"` and JSON content type. Live mutations require the configured CSRF token and send `X-CSRF-Token`; the backend independently verifies it. The static configuration uses a 12-second timeout; local server bootstrap uses 60 seconds and `localConnection: true`. Refresh coalesces repeat clicks within the current page session. Local refresh returns `{ snapshot }` synchronously. For future queued jobs the adapter polls up to 20 times at two-second intervals; a timeout preserves the last saved view. A completed job includes its snapshot directly. A future backend may still finish after client polling stops; later reads retrieve that committed revision.

The local server's trust boundary is the loopback interface and Host/Origin/CSRF checks, not a logged-in web account. It derives a cache scope for this local project. Do not expose this server outside the machine or mistake that local scope for production authentication. The future hosted backend requirements below still apply.

The backend must bind an idempotency key to owner, request body, and result. An identical retry reuses the job; a reused key with different input is a conflict. Use one active analysis lock per owner and prevent older input/goal revisions from replacing newer results.

## Security and persistence required before live mode

The shareable static build is a demo. Before deploying a private live connection:

1. Establish authenticated owner sessions with secure, HttpOnly, SameSite cookies. Require authorization on every object; never trust owner IDs from JSON.
2. Enforce CSRF protection for browser writes, with strict Origin validation and a synchronizer token delivered through an authenticated bootstrap. Verify the adapter's `X-CSRF-Token` header. Cross-origin credentials are not enabled by this app.
3. Implement a separate narrow bot service identity for snapshot updates. Keep Garmin and Grok credentials and routine webhook keys in secret storage, never browser configuration or localStorage.
4. Supply `accountScope` only after authenticating the owner. The adapter scopes live disk caches by account and keeps unscoped live state in memory only. Call its `clearPrivateCache()` export on sign-out/account change and reinitialize the page with the new authenticated bootstrap. The demo remains locally persistent without a login. Until the actual session lifecycle is implemented, retain demo mode.
5. Return private cache headers. Protect static hosting's private access gate as well as the API. Do not put health payloads in public CDN caches or source files.
6. Validate schema, finite numbers, timestamps, ranges, source provenance, evidence references, payload limits, and goal/input revisions on the server. Browser validation is defense in depth, not a trust boundary.
7. Commit a complete snapshot and its current pointer in one transaction. Keep old revisions for rollback; on failure, retain the last valid snapshot and timestamps.
8. Add durable job recovery, bounded provider retries/backoff, and operational logs with secret/health redaction. Check data changes every 30 minutes only after later activation.

See [CONNECTION_WORKFLOW.md](CONNECTION_WORKFLOW.md) for the setup sequence and [GROK_BOT_PROMPT.md](GROK_BOT_PROMPT.md) for the future runner instructions.


## Implemented private backend
Vercel Authentication protects all production routes. `/config.js` is rewritten to a private bootstrap that sets the signed application session and supplies a CSRF token. GET `/api/v1/snapshot`, `/goals`, and `/profile` read private state. PUT `/goals` and `/profile` validate increasing versions. POST `/refresh` accepts `reason: manual|check` and returns `{snapshot}`; no job polling is needed for this synchronous backend. Quiet checks are limited to once per 30 minutes; manual refreshes are explicit. Blob writes use ETags and conflicting setting edits return 409. AI is optional and disabled by default.
