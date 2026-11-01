# Garmin connection and optional AI workflow

## 1. Protect the website

Enable Vercel Authentication for **all deployments**, including the production domain. Existing Vercel browser sessions are reused; login may be required after expiry or clearing cookies. The application's signed cookie lasts up to 90 days, but does not override Vercel's authentication policy. Never disable deployment protection to troubleshoot an API call.

## 2. Store credentials privately

Use production-only encrypted environment variables for the Garmin Personal API key and application session secret. Connect a private Vercel Blob store and keep its token server-only. Never put keys, profile values, raw records, exports, or screenshots into the public repository or `dist` files.

The API exchanges the Garmin key for a bearer token server-side, then calls the documented Personal API. [Garmin authentication](https://developer.garmin.com/gc-developer-program/personal/personal-api/) and [official endpoint schema](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/) describe the source.

## 3. Initialize and save real data

The protected backend initializes an empty private store from Garmin using encrypted initial profile and goal settings. Later requests read saved state immediately. Existing state is never overwritten by initialization. Updates use conditional writes to avoid losing edits from another tab.

The collector reads daily summaries, sleep stages and sleep scores, overnight HRV, all paginated activities, heart-rate zones, selected daily heart-rate samples, daily Body Battery samples, Pulse Ox when available, and automatic-activity summaries. A first backfill requests 90 days of daily/HRV/sleep summaries; sleep requests never exceed 31 days. Future refreshes retain older observations and activity IDs. Fields include energy, hydration logs, stress/rest durations, sleep breathing and heart rate, naps, intensity minutes, activity duration, load and aerobic/anaerobic effects.

A device feature is not necessarily exposed by the API. Training Readiness, Training Status, Recovery Time and skin temperature do not have corresponding endpoints in the inspected Personal API schema. They stay unavailable. Sleep-need units are not documented clearly enough to convert safely. LiveTrack, connected GPS, cycle/pregnancy tracking, and companion services remain Garmin Connect features; sensitive optional categories are not silently imported. [CIRQA capabilities](https://www.garmin.com/en-US/newsroom/press-release/wearables-health/meet-cirqa-smart-band-the-screen-free-health-and-fitness-tracker-from-garmin/)

## 4. What happens after a workout

Save the activity and let CIRQA sync to Garmin Connect through your phone. The dashboard cannot read an out-of-range band directly. Once Garmin's API returns the new activity, it appears after the next dashboard check or manual refresh. It is matched to previous sessions of the same sport. Higher training load is described as more effort, not proof of improved sport performance.

The browser requests a check on opening and every 30 minutes while visible. The server enforces the interval. No new data, an unavailable phone, or a source failure leaves the last saved information in place without repeated warnings. With the dashboard closed, there is currently no scheduled check.

## 5. Manual refresh

`POST /api/v1/refresh` uses the authenticated session and CSRF token. Manual requests check the newest available Garmin records; the button shows its loading state. Data observations retain their source timestamps. The analysis timestamp changes only when the source changes, rather than making unchanged records appear new. A failed refresh returns the previous snapshot.

## 6. Profile and feedback

Profile and goal edits persist in private storage. Calculated feedback uses recorded activity comparisons, sleep, HRV baselines and your stated goals. For a teen profile it uses general 8–10-hour sleep guidance and emphasizes recovery and coach involvement. It does not calculate BMI-based targets, prescribe weight loss or invent age-based HR zones. [CDC sleep guidance](https://www.cdc.gov/healthy-schools/sleep/index.html)

No separate Grok bot is required for these calculations. AI-written interpretation is an optional server-side integration in `integration/ai-feedback.mjs`. To enable it later, choose a current supported model, authorize sending a minimal summary to that AI provider, then set `AI_FEEDBACK_MODEL`, `AI_GATEWAY_API_KEY`, and `AI_FEEDBACK_ENABLED=true` in private production settings. Never reuse the Garmin key as an AI key. Validate structured output, evidence, source timestamps and age-appropriate recommendations before replacing feedback. Model failures leave calculated feedback intact.

## 7. Optional background checks — not activated

When requested later, add a scheduler calling a server-only authenticated job every 30 minutes. Reuse the collector and state-update functions, coalesce concurrent jobs and skip analysis when the source fingerprint is unchanged. Configure rate limits and the hosting plan's schedule limits. Do not send routine notifications for missing syncs. No background automation is enabled by this release.

## 8. Historical Garmin export

Keep the requested export private when Garmin delivers it. Its contents and formats need to be inspected before importing. Match activities by Garmin ID, preserve original timestamps and units, and merge rather than replace records. The export may extend wellness history beyond the API backfill. An export does not provide continuous syncing. Do not upload it to GitHub or a public static folder.
