# Dashboard analytics

`dist/analytics.js` performs deterministic analysis of the saved snapshot in the browser. It makes no network calls and sends no health data to an AI service. These insights are local calculations, not official Garmin or WHOOP scores and not Grok output.

## Activity comparison

- Compare the selected workout with an **earlier workout in the same source sport**. Later sessions are excluded from historical comparisons.
- High intensity means **Garmin zones 4–5**. Shares divide the reported zone minutes by the entire recorded session duration; unknown/below-zone time is not redistributed into a zone.
- `highPer60` is reported zones 4–5 minutes per 60 minutes of session duration. `loadPer60` is Garmin activity training load divided by recorded hours. This separates a longer session from denser recorded workload; it does not normalize weather, position, pauses, or session purpose.
- Zone percentages are withheld when zone totals exceed duration by more than the tolerance for five zone values rounded to 0.1 minutes. Raw values remain available with an inconsistency flag. Partial zone coverage remains visible.
- A comparison cohort contains only earlier same-sport sessions between 80% and 120% of selected duration. Every aggregate records the usable sample count. Fewer than three matching sessions is flagged as limited context.
- Relative changes are null when the earlier value is zero or unavailable. Percentage-point changes can still describe a change from zero zone share.
- Higher workload, more high-intensity minutes, lower average heart rate, or a larger training-effect value is **not** a percent improvement in soccer ability or fitness. The dataset contains no direct match-performance measurement. Insights describe the measured change and suggest how to make the next comparison more useful.

## Health and sleep

Personal baselines use the median of available observations in the preceding 28 calendar days, excluding the selected day and future observations. The central 60% observed band requires at least seven values. This is a descriptive personal band, not a medical reference range. Each metric uses its own valid sample count.

Sleep duration is compared with the user's editable target. Sleep efficiency is recorded sleep duration divided by the actual source sleep interval. It is displayed as a calculated ratio, never as WHOOP Sleep Performance. Bedtime variability is the standard deviation of recorded local bedtimes on a noon-to-noon axis so 23:50 and 00:10 remain twenty minutes apart. It requires at least three nights.

Historical screens use the selected day's history row. A current snapshot metric can fill a missing history field only when its source observation occurred on that same local day. Unknown values remain null, never zero.

## Exports

`activityStats(activity)` returns normalized source measurements and coverage metadata.

`compareActivities(snapshot, currentId, previousId?)` returns raw selected activities, their statistics, deltas, duration-matched cohort, local insights and interpretation limits.

`analyzeSport(snapshot, sport, periodDays=28, endDate?)` returns the activity series, weekly aggregates, summary and latest comparison in the selected calendar window.

`healthBaselines(snapshot, date?)`, `sleepAnalysis(snapshot, goals, date?)`, and `analyzeDay(snapshot, goals, date?)` return source-aware daily context, progress against goals, and compact local insights. Omitted dates use the snapshot's data-through date in its configured timezone.

Each insight contains `{id, title, body, action, tone, evidence, source: "local-analysis"}`. Evidence values and sample sizes should remain inspectable in the UI. The future Grok connection can augment these calculations but must not change their source meanings or invent unavailable measurements.
