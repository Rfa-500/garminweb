// Deterministic, source-based analysis. No proprietary WHOOP score is estimated.
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const round = (value, digits = 1) => finite(value) == null ? null : Number(value.toFixed(digits));
const values = items => items.filter(value => finite(value) != null);
const mean = items => { const list = values(items); return list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : null; };
const total = items => { const list = values(items); return list.length ? list.reduce((sum, n) => sum + n, 0) : null; };
const delta = (a, b) => finite(a) != null && finite(b) != null ? round(a - b) : null;
const pct = (a, b) => finite(a) != null && finite(b) != null && b !== 0 ? round((a - b) / Math.abs(b) * 100) : null;
const signed = n => n == null ? '—' : `${n > 0 ? '+' : ''}${round(n)}`;
const list = value => Array.isArray(value) ? value : [];
const shift = (day, offset) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function quantile(items, q) {
  const sorted = values(items).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q, low = Math.floor(at), part = at - low;
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * part;
}
export function localDate(iso, timezone = 'America/Panama') {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function selectedDay(snapshot, date) {
  const day = date || localDate(snapshot?.dataThrough, snapshot?.timezone);
  if (!validDay(day)) throw Error('A valid calendar day is required');
  return day;
}
function metricOn(snapshot, key, date) {
  const row = list(snapshot?.history).find(row => row.date === date);
  if (finite(row?.[key]) != null) return row[key];
  const metric = snapshot?.metrics?.[key];
  return metric?.status === 'available' && localDate(metric.observedAt, snapshot.timezone) === date ? finite(metric.value) : null;
}
function insight(id, title, body, action, tone = 'neutral', evidence = {}) {
  return { id, title, body, action, tone, evidence, source: 'local-analysis' };
}
function activityOrder(a, b) { return Date.parse(a.date) - Date.parse(b.date); }
function sameSport(a, b) { return a && b && (a.sportKey && b.sportKey ? a.sportKey === b.sportKey : a.type === b.type); }

export function activityStats(activity) {
  if (!activity) return null;
  const durationMinutes = finite(activity.durationSec) != null && activity.durationSec > 0 ? activity.durationSec / 60 : null;
  const zones = list(activity.zones);
  const hasZones = zones.length === 5 && zones.every(n => finite(n) != null && n >= 0);
  const covered = hasZones ? total(zones) : null;
  const reportedCoverage = covered != null && durationMinutes > 0 ? covered / durationMinutes * 100 : null;
  // Rounding can contribute at most 0.25 minutes across five 0.1-minute zones.
  const inconsistent = covered != null && durationMinutes != null && covered > durationMinutes + 0.3;
  const zoneQuality = !hasZones ? 'unavailable' : inconsistent ? 'inconsistent' : reportedCoverage < 95 ? 'partial' : 'complete';
  const normalized = hasZones && durationMinutes > 0 && !inconsistent;
  const highMinutes = hasZones ? zones[3] + zones[4] : null;
  const moderateMinutes = hasZones ? zones[2] : null;
  const trainingLoad = finite(activity.activityTrainingLoad);
  return {
    durationMinutes: round(durationMinutes), avgHr: finite(activity.avgHr), maxHr: finite(activity.maxHr),
    distanceKm: finite(activity.distanceKm), calories: finite(activity.calories),
    zones: hasZones ? [...zones] : [], zoneQuality, coveredMinutes: round(covered),
    reportedZoneCoveragePct: round(reportedCoverage), zoneCoveragePct: normalized ? round(Math.min(100, reportedCoverage)) : null,
    unclassifiedMinutes: normalized ? round(Math.max(0, durationMinutes - covered)) : null,
    zoneShares: normalized ? zones.map(minutes => round(minutes / durationMinutes * 100)) : [],
    highMinutes: round(highMinutes), moderateMinutes: round(moderateMinutes),
    highSharePct: normalized ? round(highMinutes / durationMinutes * 100) : null,
    highPer60: normalized ? round(highMinutes / durationMinutes * 60) : null,
    aerobicEffect: finite(activity.aerobicTrainingEffect), anaerobicEffect: finite(activity.anaerobicTrainingEffect),
    trainingLoad: round(trainingLoad), loadPer60: trainingLoad != null && durationMinutes > 0 ? round(trainingLoad / durationMinutes * 60) : null,
    effort: finite(activity.effort),
    paceSecondsPerKm: finite(activity.distanceKm) != null && activity.distanceKm > 0 && durationMinutes > 0 ? round(activity.durationSec / activity.distanceKm) : null
  };
}
function differences(current, previous) {
  if (!current || !previous) return {};
  return {
    durationMinutes: delta(current.durationMinutes, previous.durationMinutes), durationPct: pct(current.durationMinutes, previous.durationMinutes),
    avgHr: delta(current.avgHr, previous.avgHr), maxHr: delta(current.maxHr, previous.maxHr),
    distanceKm: delta(current.distanceKm, previous.distanceKm), distancePct: pct(current.distanceKm, previous.distanceKm),
    highMinutes: delta(current.highMinutes, previous.highMinutes), highSharePp: delta(current.highSharePct, previous.highSharePct),
    highPer60: delta(current.highPer60, previous.highPer60), highPer60Pct: pct(current.highPer60, previous.highPer60),
    aerobicEffect: delta(current.aerobicEffect, previous.aerobicEffect), anaerobicEffect: delta(current.anaerobicEffect, previous.anaerobicEffect),
    trainingLoad: delta(current.trainingLoad, previous.trainingLoad), trainingLoadPct: pct(current.trainingLoad, previous.trainingLoad),
    loadPer60: delta(current.loadPer60, previous.loadPer60), loadPer60Pct: pct(current.loadPer60, previous.loadPer60),
    paceSecondsPerKm: delta(current.paceSecondsPerKm, previous.paceSecondsPerKm), effort: delta(current.effort, previous.effort)
  };
}
export function compareActivities(snapshot, currentId, previousId) {
  const all = list(snapshot?.activities).filter(a => Number.isFinite(Date.parse(a.date)));
  const current = all.find(a => a.id === currentId) || null;
  if (!current) return { current: null, previous: null, currentStats: null, previousStats: null, deltas: {}, matched: { count: 0, tolerancePct: 20, ids: [], averages: {}, deltas: {} }, insights: [], primaryInsight: null, limits: ['Select a recorded workout.'] };
  const older = all.filter(a => a.id !== current.id && sameSport(a, current) && Date.parse(a.date) < Date.parse(current.date)).sort((a, b) => activityOrder(b, a));
  const requested = previousId == null ? older[0] : older.find(a => a.id === previousId);
  const previous = requested || null;
  const currentStats = activityStats(current), previousStats = activityStats(previous);
  const deltas = differences(currentStats, previousStats);
  const candidates = older.filter(a => a.durationSec >= current.durationSec * 0.8 && a.durationSec <= current.durationSec * 1.2);
  const candidateStats = candidates.map(activityStats);
  const averages = Object.fromEntries(['durationMinutes', 'avgHr', 'highMinutes', 'highSharePct', 'highPer60', 'aerobicEffect', 'anaerobicEffect', 'trainingLoad', 'loadPer60'].map(key => [key, round(mean(candidateStats.map(a => a[key])))]));
  const matched = { count: candidates.length, tolerancePct: 20, ids: candidates.map(a => a.id), averages, deltas: differences(currentStats, averages), sampleCounts: Object.fromEntries(Object.keys(averages).map(key => [key, candidateStats.filter(s => finite(s[key]) != null).length])), durationRangeMinutes: [round(current.durationSec / 60 * 0.8), round(current.durationSec / 60 * 1.2)], limited: candidates.length < 3 };
  const limits = [], insights = [];
  const comparableDuration = previous ? Math.abs(previous.durationSec / current.durationSec - 1) <= 0.2 : false;
  if (previousId != null && !previous) limits.push('The comparison must be an earlier workout in the same sport.');
  if (!previous) limits.push('No earlier session of this sport is available.');
  if (previous && !comparableDuration) limits.push('Session durations differ by more than 20%; compare intensity per hour, not just total workload.');
  if (currentStats.zoneQuality === 'inconsistent' || previousStats?.zoneQuality === 'inconsistent') limits.push('Reported zone minutes exceed a session duration. Zone percentages are withheld; raw zone times remain available.');
  if (currentStats.zoneQuality === 'partial' || previousStats?.zoneQuality === 'partial') limits.push('Some session time is outside the supplied zones or unclassified. Zone shares use full session duration.');
  if (!matched.count) limits.push('No earlier session falls within ±20% of this duration.');
  else if (matched.limited) limits.push(`Only ${matched.count} duration-matched ${matched.count === 1 ? 'session is' : 'sessions are'} available; treat this as context, not a trend.`);
  if (previous && deltas.highSharePp != null) {
    insights.push(insight('high-intensity-change', `${signed(deltas.highSharePp)}pp high-intensity share`, `${currentStats.highMinutes} min in zones 4–5: ${currentStats.highSharePct}% of this session versus ${previousStats.highSharePct}% previously. ${comparableDuration ? 'The session lengths are within 20%.' : `This session was ${Math.abs(deltas.durationPct)}% ${deltas.durationPct >= 0 ? 'longer' : 'shorter'}.`}`, 'Match session length and purpose next time, then compare zone share and how hard it felt.', 'blue', { current: currentStats.highSharePct, previous: previousStats.highSharePct, deltaPp: deltas.highSharePp, coverageCurrent: currentStats.zoneCoveragePct, coveragePrevious: previousStats.zoneCoveragePct }));
  }
  if (previous && deltas.loadPer60Pct != null) {
    insights.push(insight('load-density-change', `${signed(deltas.loadPer60Pct)}% training load per hour`, `Garmin load was ${currentStats.trainingLoad} versus ${previousStats.trainingLoad}. Adjusting for duration gives ${currentStats.loadPer60} versus ${previousStats.loadPer60} load/hour. This describes a ${deltas.loadPer60 >= 0 ? 'denser' : 'lighter'} training stimulus, not a percentage improvement in skill or fitness.`, 'Use duration-adjusted load to distinguish a longer session from a harder one.', 'blue', { current: currentStats.loadPer60, previous: previousStats.loadPer60, changePct: deltas.loadPer60Pct }));
  }
  if (previous && deltas.anaerobicEffect != null) {
    insights.push(insight('training-effect-change', `${signed(deltas.anaerobicEffect)} anaerobic training effect`, `Garmin reported ${round(currentStats.anaerobicEffect)} versus ${round(previousStats.anaerobicEffect)} on its 0–5 scale. Aerobic effect was ${round(currentStats.aerobicEffect) ?? 'unavailable'} versus ${round(previousStats.aerobicEffect) ?? 'unavailable'}.`, 'Compare these effects with your intended session: easy recovery, steady conditioning, or repeated hard efforts.', 'neutral', { current: currentStats.anaerobicEffect, previous: previousStats.anaerobicEffect }));
  }
  if (matched.sampleCounts.highSharePct >= 3 && matched.deltas.highSharePp != null) insights.push(insight('matched-baseline', `${signed(matched.deltas.highSharePp)}pp vs similar-length sessions`, `Your previous ${matched.sampleCounts.highSharePct} usable zone records within ±20% duration averaged ${matched.averages.highSharePct}% in zones 4–5. This session recorded ${currentStats.highSharePct}%. Duration matching still does not control weather, position, pauses, or session purpose.`, 'Keep the same sport and similar duration when tracking your next change.', 'neutral', { count: matched.sampleCounts.highSharePct, rangeMinutes: matched.durationRangeMinutes }));
  if (!insights.length && previous && deltas.durationPct != null) insights.push(insight('duration-change', `${signed(deltas.durationPct)}% session duration`, `${currentStats.durationMinutes} minutes versus ${previousStats.durationMinutes} previously.${deltas.avgHr != null ? ` Average heart rate changed by ${signed(deltas.avgHr)} bpm.` : ''}`, 'Keep session purpose and conditions similar when comparing duration and heart rate; neither change alone establishes better performance.', 'neutral', { durationMinutes: currentStats.durationMinutes, previousDurationMinutes: previousStats.durationMinutes, durationPct: deltas.durationPct, avgHrDelta: deltas.avgHr }));
  if (!insights.length) insights.push(insight('first-session', 'Build your comparison baseline', `${currentStats.durationMinutes ?? 'Unrecorded'} minutes of ${current.type.toLowerCase()}${currentStats.avgHr != null ? ` at ${currentStats.avgHr} bpm average` : ''}. A second earlier session is needed for a change comparison.`, 'Record the next session in this sport and add your perceived effort.', 'neutral', { activityId: current.id }));
  return { current, previous, currentStats, previousStats, deltas, matched, comparableDuration, insights, primaryInsight: insights[0], limits, interpretation: 'Changes in workload and physiological response do not measure soccer skill, match performance, or fitness improvement.' };
}

export function analyzeSport(snapshot, sport, periodDays = 28, endDate) {
  const end = selectedDay(snapshot, endDate), days = Math.max(1, Math.min(366, Math.trunc(periodDays) || 28)), start = shift(end, 1 - days);
  const activities = list(snapshot?.activities).filter(a => (a.type === sport || a.sportKey === sport) && localDate(a.date, snapshot.timezone) >= start && localDate(a.date, snapshot.timezone) <= end).sort(activityOrder);
  const trend = activities.map(a => ({ id: a.id, date: localDate(a.date, snapshot.timezone), startedAt: a.date, name: a.name, ...activityStats(a) }));
  const latest = activities.at(-1) || null;
  const weeklyMap = new Map();
  for (const a of trend) { const weekday = new Date(`${a.date}T12:00:00Z`).getUTCDay(), key = shift(a.date, -((weekday + 6) % 7)); if (!weeklyMap.has(key)) weeklyMap.set(key, []); weeklyMap.get(key).push(a); }
  const weekly = [...weeklyMap].map(([date, sessions]) => ({ date, endDate: shift(date, 6), sessions: sessions.length, durationMinutes: round(total(sessions.map(s => s.durationMinutes))), highMinutes: round(total(sessions.filter(s => s.zoneQuality !== 'inconsistent').map(s => s.highMinutes))), trainingLoad: round(total(sessions.map(s => s.trainingLoad))), partialWindow: date < start || shift(date, 6) > end }));
  const comparison = latest ? compareActivities(snapshot, latest.id) : null;
  const summary = { sessions: activities.length, durationMinutes: round(total(trend.map(s => s.durationMinutes))), highMinutes: round(total(trend.filter(s => s.zoneQuality !== 'inconsistent').map(s => s.highMinutes))), trainingLoad: round(total(trend.map(s => s.trainingLoad))), averageHr: round(mean(trend.map(s => s.avgHr))), averageLoadPer60: round(mean(trend.map(s => s.loadPer60))), zoneRecords: trend.filter(s => ['complete', 'partial'].includes(s.zoneQuality)).length };
  return { sport, periodDays: days, startDate: start, endDate: end, activities, latest, trend, weekly, summary, comparison, insights: comparison?.insights || [], primaryInsight: comparison?.primaryInsight || null };
}

export function healthBaselines(snapshot, date) {
  const day = selectedDay(snapshot, date), start = shift(day, -28);
  const history = list(snapshot?.history).filter(row => row.date >= start && row.date < day);
  const keys = ['hrv', 'restingHr', 'respiration', 'stress', 'bodyBattery', 'sleepMinutes', 'sleepScore'];
  const metrics = Object.fromEntries(keys.map(key => {
    const observations = history.filter(row => finite(row[key]) != null).map(row => row[key]);
    const baseline = quantile(observations, 0.5), value = metricOn(snapshot, key, day), enough = observations.length >= 7;
    const low = enough ? quantile(observations, 0.2) : null, high = enough ? quantile(observations, 0.8) : null;
    return [key, { key, value, baseline: round(baseline), delta: delta(value, baseline), pct: pct(value, baseline), count: observations.length, sufficient: enough, rangeLow: round(low), rangeHigh: round(high), position: !enough || value == null ? 'insufficient' : value < low ? 'below-typical' : value > high ? 'above-typical' : 'within-typical', rangeBasis: 'Central 60% of your previous 28 days of recorded observations; not a medical reference range', history: list(snapshot.history).filter(row => row.date >= shift(day, -27) && row.date <= day).map(row => ({ date: row.date, value: finite(row[key]) })) }];
  }));
  const insights = [], hrv = metrics.hrv, rhr = metrics.restingHr;
  if (hrv.sufficient && hrv.value != null) insights.push(insight('hrv-baseline', `${signed(hrv.pct)}% HRV vs your baseline`, `${hrv.value} ms overnight versus a ${hrv.baseline} ms median across ${hrv.count} earlier nights.${rhr.sufficient && rhr.value != null ? ` Resting heart rate is ${signed(rhr.delta)} bpm versus its baseline.` : ''}`, 'Use this pattern alongside how recovered you feel; one night is not a fitness trend.', hrv.value < hrv.rangeLow ? 'amber' : 'neutral', { hrv: hrv.value, baseline: hrv.baseline, sample: hrv.count }));
  else if (rhr.sufficient && rhr.value != null) insights.push(insight('resting-hr-baseline', `${signed(rhr.delta)} bpm resting heart rate`, `${rhr.value} bpm versus a ${rhr.baseline} bpm median across ${rhr.count} earlier days.`, 'Follow the multi-day pattern alongside sleep and your perceived energy.', 'neutral', { value: rhr.value, baseline: rhr.baseline, sample: rhr.count }));
  return { date: day, startDate: start, metrics, insights, primaryInsight: insights[0] || null, available: keys.filter(k => metrics[k].value != null).length, baselineReady: keys.filter(k => metrics[k].value != null && metrics[k].sufficient).length };
}
function clockMinute(timestamp, timezone) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp)).map(p => [p.type, p.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}
function timeSpread(minutes) {
  const valid = values(minutes); if (valid.length < 3) return null;
  // Compare overnight bedtimes across midnight on a continuous noon-to-noon axis.
  const normalized = valid.map(n => n < 720 ? n + 1440 : n), center = mean(normalized);
  return { spread: round(Math.sqrt(mean(normalized.map(n => (n - center) ** 2)))), center: round(center % 1440), count: valid.length };
}
export function sleepAnalysis(snapshot, goals, date) {
  const day = selectedDay(snapshot, date), row = list(snapshot?.history).find(r => r.date === day) || {};
  const latestSleepMatches = localDate(snapshot?.sleep?.end, snapshot?.timezone) === day;
  const start = row.sleepStart || (latestSleepMatches ? snapshot.sleep.start : null), end = row.sleepEnd || (latestSleepMatches ? snapshot.sleep.end : null);
  const stages = row.sleepStages || (latestSleepMatches ? snapshot.sleep.stages : null);
  const durationMinutes = metricOn(snapshot, 'sleepMinutes', day), score = metricOn(snapshot, 'sleepScore', day), targetMinutes = finite(goals?.sleepHours) != null ? goals.sleepHours * 60 : null;
  const inBed = start && end && Date.parse(end) > Date.parse(start) ? (Date.parse(end) - Date.parse(start)) / 60000 : null;
  const efficiency = durationMinutes != null && inBed > 0 && durationMinutes <= inBed + 1 ? durationMinutes / inBed * 100 : null;
  const baseline = healthBaselines(snapshot, day).metrics.sleepMinutes;
  const history = list(snapshot.history).filter(r => r.date >= shift(day, -6) && r.date <= day);
  const timing = timeSpread(history.map(r => clockMinute(r.sleepStart, snapshot.timezone)));
  const gap = durationMinutes != null && targetMinutes != null ? round(durationMinutes - targetMinutes) : null;
  const recordedNights = history.filter(r => finite(r.sleepMinutes) != null), nightsAtGoal = targetMinutes != null ? recordedNights.filter(r => r.sleepMinutes >= targetMinutes).length : null;
  const insights = [];
  if (gap != null) insights.push(insight('sleep-target', `${Math.abs(Math.round(gap))} min ${gap >= 0 ? 'above' : 'below'} your sleep goal`, `${Math.round(durationMinutes)} min recorded versus your ${Math.round(targetMinutes)} min target.${baseline.sufficient ? ` Your prior-night median is ${baseline.baseline} min (${baseline.count} nights).` : ''}`, gap < 0 ? `Plan ${Math.abs(Math.round(gap))} more minutes of sleep opportunity to close this personal-goal gap.` : 'Keep your sleep and wake times consistent; extra duration alone does not establish better recovery.', gap < 0 ? 'amber' : 'neutral', { durationMinutes, targetMinutes, gapMinutes: gap }));
  if (timing) insights.push(insight('sleep-timing', `${timing.spread} min bedtime variability`, `Your bedtime varied by a standard deviation of ${timing.spread} minutes over ${timing.count} recorded nights.${nightsAtGoal != null ? ` ${nightsAtGoal} of ${recordedNights.length} nights met your duration goal.` : ''}`, timing.spread > 45 ? 'Choose a regular bedtime window and compare this pattern again after a week.' : 'Keep the same bedtime window and watch how your overnight HRV responds.', timing.spread > 45 ? 'amber' : 'neutral', { standardDeviationMinutes: timing.spread, nights: timing.count }));
  return { date: day, durationMinutes, score, targetMinutes, goalGapMinutes: gap, goalPct: durationMinutes != null && targetMinutes > 0 ? round(durationMinutes / targetMinutes * 100) : null, start, end, stages, inBedMinutes: round(inBed), efficiencyPct: round(efficiency), restorativeMinutes: stages && finite(stages.deep) != null && finite(stages.rem) != null ? round(stages.deep + stages.rem) : null, baseline, bedtimeVariabilityMinutes: timing?.spread ?? null, typicalBedtimeMinutes: timing?.center ?? null, timingNights: timing?.count || 0, nightsAtGoal, recordedNights: recordedNights.length, history: history.map(r => ({ date: r.date, durationMinutes: finite(r.sleepMinutes), score: finite(r.sleepScore), start: r.sleepStart || null, end: r.sleepEnd || null })), insights, primaryInsight: insights[0] || null };
}

export function analyzeDay(snapshot, goals, date) {
  const day = selectedDay(snapshot, date), history = list(snapshot?.history), sourceDay = localDate(snapshot?.dataThrough, snapshot?.timezone);
  const row = history.find(r => r.date === day) || null;
  const activities = list(snapshot?.activities).filter(a => localDate(a.date, snapshot.timezone) === day).sort((a, b) => activityOrder(b, a));
  const earlier = list(snapshot?.activities).filter(a => localDate(a.date, snapshot.timezone) <= day).sort((a, b) => activityOrder(b, a));
  const sportCounts = earlier.reduce((map, a) => map.set(a.type, (map.get(a.type) || 0) + 1), new Map());
  const featuredSport = [...sportCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const featuredActivity = earlier.find(a => a.type === featuredSport) || null;
  const featuredComparison = featuredActivity ? compareActivities(snapshot, featuredActivity.id) : null;
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(), weekStart = shift(day, -((weekday + 6) % 7));
  const weekRows = history.filter(r => r.date >= weekStart && r.date <= day), weekActivities = earlier.filter(a => localDate(a.date, snapshot.timezone) >= weekStart);
  const week = { startDate: weekStart, endDate: day, sessions: weekActivities.length, sessionTarget: finite(goals?.workoutsPerWeek), intensityMinutes: round(total(weekRows.map(r => r.intensityMinutes))), intensityTarget: finite(goals?.weeklyIntensityMinutes) ?? 150, distanceKm: round(total(weekActivities.map(a => a.distanceKm))), distanceTarget: finite(goals?.weeklyDistanceKm), observedDays: weekRows.filter(r => finite(r.intensityMinutes) != null).length, calendarDays: ((Date.parse(day) - Date.parse(weekStart)) / 86400000) + 1, latestDayPartial: day === sourceDay, sessionProgressPct: finite(goals?.workoutsPerWeek) > 0 ? round(weekActivities.length / goals.workoutsPerWeek * 100) : null };
  const health = healthBaselines(snapshot, day), sleep = sleepAnalysis(snapshot, goals, day);
  const insights = [...(featuredComparison?.insights || []).slice(0, 2), ...health.insights.slice(0, 1), ...sleep.insights.slice(0, 1)];
  return { date: day, day: row, activities, latestActivity: earlier[0] || null, featuredSport, featuredActivity, featuredComparison, health, sleep, week, insights, primaryInsight: insights[0] || null, metrics: Object.fromEntries(['readiness','bodyBattery','sleepMinutes','sleepScore','intensityMinutes','steps','calories','hrv','restingHr','respiration','stress'].map(key => [key, metricOn(snapshot, key, day)])), sourceDay, isLatestDay: day === sourceDay, availableDates: history.map(r => r.date).filter(validDay).sort() };
}
