import {mergeArchive} from './archive.mjs';
import { randomUUID } from 'node:crypto';
import { validateGoals, validateSnapshot } from '../dist/data.js';

export const liveDefaultGoals = Object.freeze({
  version: 1, primary: 'Build consistent fitness', targetMinutes: 30,
  targetKind: 'session-duration', workoutsPerWeek: 4, sleepHours: 8,
  weeklyDistanceKm: 25, weeklyIntensityMinutes: 150
});

const SOURCE = 'garmin-personal-api';
const array = value => Array.isArray(value) ? value : [];
const finite = (value, min = 0, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const round = (value, digits = 1) => value == null ? null : Number(value.toFixed(digits));
const text = value => typeof value === 'string' ? value : '';
const calendar = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// Only call this for explicitly GMT/UTC fields or known epoch-millisecond fields.
// A local wall-clock timestamp must never be silently interpreted as UTC.
export function garminGmtTimestamp(value) {
  if (value == null) return null;
  let candidate = value;
  if (typeof value === 'string') {
    candidate = value.trim().replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(candidate)) return null;
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(candidate)) candidate += 'Z';
  } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 1e11) return null;
  const date = new Date(candidate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function localDay(iso, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function daysBetween(start, end) {
  if (!calendar(start) || !calendar(end) || start > end) throw Error('Invalid source date range');
  const count = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (count > 366) throw Error('Source window is too large');
  return Array.from({ length: count }, (_, index) => new Date(Date.parse(start) + index * 86400000).toISOString().slice(0, 10));
}
const dailyTime = row => garminGmtTimestamp(row?.wellnessChronology?.endTimestampGmt);
const sleepTime = row => garminGmtTimestamp(row?.sleepEndTimestampGMT);
const intensity = row => {
  const moderate = finite(row?.intensityMinutes?.moderate);
  const vigorous = finite(row?.intensityMinutes?.vigorous);
  return moderate == null || vigorous == null ? null : moderate + 2 * vigorous;
};

function normalizedSleepRecord(row) {
  const start = garminGmtTimestamp(row?.sleepStartTimestampGMT);
  const end = sleepTime(row);
  if (!start || !end || start >= end) return null;
  const values = ['deep', 'rem', 'light', 'awake'].map(stage => finite(row?.[`${stage}SleepSeconds`], 0, 86400));
  let stages = null;
  if (values.every(value => value != null)) {
    const candidate = Object.fromEntries(['deep', 'rem', 'light', 'awake'].map((stage, index) => [stage, round(values[index] / 60, 3)]));
    const elapsed = (Date.parse(end) - Date.parse(start)) / 60000;
    if (Math.abs(Object.values(candidate).reduce((a, b) => a + b, 0) - elapsed) <= 2) stages = candidate;
  }
  return { start, end, stages };
}

function normalizeHeartRateSeries(input) {
  const descriptors = array(input?.heartRateValueDescriptors);
  const timestampIndex = descriptors.find(descriptor => descriptor?.key === 'timestamp')?.index;
  const heartRateIndex = descriptors.find(descriptor => descriptor?.key === 'heartrate')?.index;
  if (!Number.isInteger(timestampIndex) || !Number.isInteger(heartRateIndex) || timestampIndex < 0 || heartRateIndex < 0) return [];
  const samples = new Map();
  for (const row of array(input?.heartRateValues)) {
    if (!Array.isArray(row)) continue;
    const timestamp = garminGmtTimestamp(row[timestampIndex]);
    const bpm = finite(row[heartRateIndex], 1, 300);
    if (!timestamp || bpm == null) continue;
    // Missing samples are omitted. Consumers must preserve the actual time axis
    // and break lines over long gaps rather than interpolate missing readings.
    samples.set(timestamp, { timestamp, bpm });
  }
  return [...samples.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
function typeName(key) {
  if (['running', 'trail_running', 'treadmill_running', 'track_running', 'indoor_running'].includes(key)) return 'Run';
  if (key === 'strength_training') return 'Strength';
  return key ? key.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Activity';
}

function normalizeActivities(input) {
  const unique = new Map();
  for (const activity of array(input)) {
    const id = activity?.activityId;
    const date = garminGmtTimestamp(activity?.startTimeGMT) || garminGmtTimestamp(activity?.beginTimestamp);
    const duration = finite(activity?.duration, 1, 604800);
    if ((typeof id !== 'string' && typeof id !== 'number') || !String(id) || !date || duration == null) continue;
    const sourceEnd = garminGmtTimestamp(activity.endTimeGMT);
    const zones = Array.from({ length: 5 }, (_, index) => finite(activity[`hrTimeInZone_${index + 1}`], 0, duration + 60));
    const sportKey = text(activity.activityType?.typeKey);
    unique.set(String(id), {
      id: `garmin-${id}`, name: text(activity.activityName).slice(0, 160) || typeName(sportKey),
      type: typeName(sportKey), sportKey, date,
      endAt: sourceEnd && sourceEnd >= date ? sourceEnd : null,
      distanceKm: finite(activity.distance) == null ? null : round(activity.distance / 1000, 3),
      durationSec: round(duration, 3), avgHr: finite(activity.averageHR, 1, 300) == null ? null : Math.round(activity.averageHR),
      maxHr: finite(activity.maxHR, 1, 300) == null ? null : Math.round(activity.maxHR),
      calories: round(finite(activity.calories, 0, 30000)),
      bodyBatteryImpact: finite(activity.differenceBodyBattery, -100, 100),
      elevationM: round(finite(activity.elevationGain, 0, 50000)),
      effort: null, benefit: text(activity.trainingEffectLabel) || 'Not provided',
      // Activity summaries do not provide verified per-kilometre lap splits.
      splits: [], zones: zones.every(value => value != null) ? zones.map(value => round(value / 60)) : [],
      source: SOURCE,
      aerobicTrainingEffect: finite(activity.aerobicTrainingEffect, 0, 5),
      anaerobicTrainingEffect: finite(activity.anaerobicTrainingEffect, 0, 5),
      activityTrainingLoad: finite(activity.activityTrainingLoad),
      vo2max: finite(activity.vO2MaxValue, 1, 150)
      ,movingDurationSec: finite(activity.movingDuration,0,604800),elapsedDurationSec:finite(activity.elapsedDuration,0,604800),
      moderateMinutes:finite(activity.moderateIntensityMinutes,0,10080),vigorousMinutes:finite(activity.vigorousIntensityMinutes,0,10080),
      averageSpeedMps:finite(activity.averageSpeed,0,100),maxSpeedMps:finite(activity.maxSpeed,0,100),
      avgCadence:finite(activity.averageRunningCadenceInStepsPerMinute,0,400),
      lapCount:finite(activity.lapCount,0,10000),personalRecord:activity.isPR===true,
      automaticallyDetected:activity.isManualActivity===false&&activity.activityType?.typeKey==='auto_activity'
    });
  }
  return [...unique.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function normalizeGarmin(raw, goals = liveDefaultGoals, options = {}) {
  validateGoals(goals);
  if (!raw || typeof raw !== 'object') throw Error('Missing Garmin source payload');
  const timezone = options.timezone || 'America/Panama';
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  const generatedAt = new Date(options.now || Date.now()).toISOString();
  const days = daysBetween(raw.startDate, raw.endDate);
  const daily = array(raw.daily?.data).filter(row => calendar(row?.calendarDate)).sort((a, b) => a.calendarDate.localeCompare(b.calendarDate));
  const sleepRows = [...array(raw.sleepHistory), ...(raw.sleep ? [raw.sleep] : [])].filter(row => calendar(row?.calendarDate));
  const sleepByDate = new Map(sleepRows.map(row => [row.calendarDate, row]));
  const sleep = [...sleepByDate.values()].filter(row => sleepTime(row)).sort((a, b) => sleepTime(a).localeCompare(sleepTime(b))).at(-1);
  const hrvRows = [...array(raw.hrvHistory?.hrvSummaries), ...(raw.hrv?.hrvSummary ? [raw.hrv.hrvSummary] : [])];
  const hrv = hrvRows.filter(row => garminGmtTimestamp(row?.createTimeStamp)).sort((a, b) => a.calendarDate.localeCompare(b.calendarDate)).at(-1);
  const hrvByDate = new Map(hrvRows.filter(row => calendar(row?.calendarDate)).map(row => [row.calendarDate, row]));
  const activities = normalizeActivities(raw.activities);
  const heartRateDays = [...array(raw.heartRateDays), ...(raw.dailyHeartRate ? [raw.dailyHeartRate] : [])];
  const heartRateSeries = [...new Map(heartRateDays.flatMap(normalizeHeartRateSeries).map(point => [point.timestamp, point])).values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const activity of activities) activity.heartRateSamples = activity.endAt ? heartRateSeries.filter(point => point.timestamp >= activity.date && point.timestamp <= activity.endAt) : [];
  const sourceTimes = [
    ...daily.map(dailyTime), ...sleepRows.map(sleepTime),
    ...hrvRows.map(row => garminGmtTimestamp(row?.createTimeStamp)),
    garminGmtTimestamp(raw.hrv?.endTimestampGMT),
    ...activities.flatMap(activity => [activity.date, activity.endAt]),
    ...heartRateSeries.map(point => point.timestamp)
  ].filter(Boolean);
  if (!sourceTimes.length) throw Error('No valid source observation timestamp; keep the prior snapshot');
  const dataThrough = sourceTimes.sort().at(-1);
  if (dataThrough > generatedAt) throw Error('Source observation is in the future; keep the prior snapshot');
  const latest = daily.filter(dailyTime).at(-1);
  const observedDaily = dailyTime(latest);
  const observedSleep = sleepTime(sleep);
  const observedHrv = garminGmtTimestamp(hrv?.createTimeStamp);
  const unavailable = (unit, reason) => ({ value: null, unit, status: 'unavailable', source: SOURCE, observedAt: null, reason });
  const metric = (value, unit, observedAt, sourceField, limits = [0, Infinity]) => {
    const valid = typeof value === 'string' ? (value.trim() || null) : finite(value, ...limits);
    return valid != null && observedAt ? { value: valid, unit, status: 'available', source: SOURCE, observedAt, sourceField } : unavailable(unit, `No valid recorded ${sourceField} value in this import.`);
  };
  const weekEnd = localDay(dataThrough, timezone);
  const weekday = new Date(`${weekEnd}T12:00:00Z`).getUTCDay();
  const weekStart = new Date(Date.parse(weekEnd) - ((weekday + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const weekRows = daily.filter(row => row.calendarDate >= weekStart && row.calendarDate <= weekEnd && intensity(row) != null);
  const weekIntensity = weekRows.length ? weekRows.reduce((total, row) => total + intensity(row), 0) : null;
  const latestVo2 = activities.find(activity => activity.vo2max != null);
  const latestBenefit = activities.find(activity => activity.benefit !== 'Not provided');
  const metrics = {
    readiness: unavailable('/100', 'No verified training-readiness field is exposed by the imported Personal API endpoints.'),
    sleepMinutes: metric(finite(sleep?.sleepTimeSeconds) == null ? null : round(sleep.sleepTimeSeconds / 60), 'min', observedSleep, 'DailySleepDTO.sleepTimeSeconds'),
    sleepScore: metric(sleep?.sleepScores?.overall?.value, '/100', observedSleep, 'DailySleepDTO.sleepScores.overall.value', [0, 100]),
    intensityMinutes: metric(intensity(latest), 'min', observedDaily, 'intensityMinutes.moderate + 2 × vigorous', [0, 2880]),
    hrv: metric(hrv?.lastNightAvg, 'ms', observedHrv, 'HrvSummaryDTO.lastNightAvg', [0, 1000]),
    restingHr: metric(latest?.heartRate?.restingValue, 'bpm', observedDaily, 'heartRate.restingValue', [1, 300]),
    bodyBattery: metric(latest?.bodyBattery?.latestValue, '/100', observedDaily, 'bodyBattery.latestValue', [0, 100]),
    stress: metric(latest?.stress?.avgLevel, '/100', observedDaily, 'stress.avgLevel', [0, 100]),
    respiration: metric(latest?.respiration?.avgValue, 'brpm', observedDaily, 'respiration.avgValue', [0, 100]),
    pulseOx: finite(raw.pulseOxDay?.averageSpO2,1,100)!=null?metric(raw.pulseOxDay.averageSpO2,'%',garminGmtTimestamp(raw.pulseOxDay.endTimestampGMT),'DailySpO2AndAcclimationDTO.averageSpO2',[1,100]):metric(latest?.pulseOx?.avgValue, '%', observedDaily, 'pulseOx.avgValue', [1, 100]),
    skinTemperature: unavailable('°C from baseline', 'No verified skin-temperature field is available in this import.'),
    steps: metric(latest?.movement?.steps?.value, 'steps', observedDaily, 'movement.steps.value', [0, 200000]),
    calories: metric(latest?.calories?.burnedTotal, 'kcal', observedDaily, 'calories.burnedTotal', [0, 30000]),
    vo2max: metric(latestVo2?.vo2max, 'ml/kg/min', latestVo2?.endAt || latestVo2?.date, 'SummarizedActivityDTO.vO2MaxValue', [1, 150]),
    recoveryHours: unavailable('h', 'No verified recovery-time field is available in this import.'),
    hrvStatus: metric(hrv?.status, '', observedHrv, 'HrvSummaryDTO.status'),
    trainingStatus: unavailable('', 'No verified training-status field is available in this import.'),
    napMinutes: metric(finite(sleep?.napTimeSeconds) == null ? null : round(sleep.napTimeSeconds / 60), 'min', observedSleep, 'DailySleepDTO.napTimeSeconds', [0, 1440]),
    sleepNeedMinutes: unavailable('min', 'sleepNeed.actual is present only when supplied, but its unit is not verified in the inspected Swagger; the raw field stays private.'),
    workoutBenefit: metric(latestBenefit?.benefit, '', latestBenefit?.endAt || latestBenefit?.date, 'SummarizedActivityDTO.trainingEffectLabel'),
    heartRate: heartRateSeries.length ? metric(heartRateSeries.at(-1).bpm, 'bpm', heartRateSeries.at(-1).timestamp, 'DailyHeartRateDTO.heartRateValues (latest recorded sample)', [1, 300]) : unavailable('bpm', 'No timestamped heart-rate samples imported; daily min/max/resting values are not a current reading.'),
    weeklyIntensityMinutes: { ...metric(weekIntensity, 'min', observedDaily, 'sum of daily moderate + 2 × vigorous in current local week', [0, 20160]), calculation: 'Sum of reported moderate minutes plus twice reported vigorous minutes', sampleDays: weekRows.length }
  };
  // Explicit source fields only. No age-predicted HR zones or estimated scores.
  for(const [key,value,unit,field,limits] of [
    ['activeCalories',latest?.calories?.burnedActive,'kcal','calories.burnedActive',[0,30000]],
    ['restingCalories',latest?.calories?.burnedResting,'kcal','calories.burnedResting',[0,30000]],
    ['hydrationMl',latest?.hydration?.consumedInMl,'ml','hydration.consumedInMl',[0,30000]],
    ['hydrationGoalMl',latest?.hydration?.goalInMl,'ml','hydration.goalInMl',[0,30000]],
    ['minHr',latest?.heartRate?.minValue,'bpm','heartRate.minValue',[1,300]],
    ['maxHr',latest?.heartRate?.maxValue,'bpm','heartRate.maxValue',[1,300]],
    ['bodyBatteryCharged',latest?.bodyBattery?.chargedValue,'points','bodyBattery.chargedValue',[0,1000]],
    ['bodyBatteryDrained',latest?.bodyBattery?.drainedValue,'points','bodyBattery.drainedValue',[0,1000]],
    ['stepsGoal',latest?.movement?.steps?.goal,'steps','movement.steps.goal',[0,200000]],
    ['stressRestMinutes',finite(latest?.stress?.restDurationInMillis)==null?null:latest.stress.restDurationInMillis/60000,'min','stress.restDurationInMillis / 60000',[0,1440]],
    ['stressHighMinutes',finite(latest?.stress?.highStressDurationInMillis)==null?null:latest.stress.highStressDurationInMillis/60000,'min','stress.highStressDurationInMillis / 60000',[0,1440]]
  ])metrics[key]=metric(value,unit,observedDaily,field,limits);
  for(const [key,value,unit,field,limits] of [
    ['sleepAvgHr',sleep?.avgHeartRate,'bpm','DailySleepDTO.avgHeartRate',[1,300]],
    ['sleepRespiration',sleep?.averageRespirationValue,'brpm','DailySleepDTO.averageRespirationValue',[1,100]],
    ['sleepPulseOx',sleep?.averageSpO2Value,'%','DailySleepDTO.averageSpO2Value',[1,100]],
    ['sleepStress',sleep?.avgSleepStress,'/100','DailySleepDTO.avgSleepStress',[0,100]],
    ['awakeCount',sleep?.awakeCount,'times','DailySleepDTO.awakeCount',[0,1000]]
  ])metrics[key]=metric(value,unit,observedSleep,field,limits);
  const dailyByDate = new Map(daily.map(row => [row.calendarDate, row]));
  const history = days.map(date => {
    const day = dailyByDate.get(date);
    const night = sleepByDate.get(date);
    const sleepRecord = normalizedSleepRecord(night);
    const nightHrv = hrvByDate.get(date);
    const distances = activities.filter(activity => localDay(activity.date, timezone) === date && activity.distanceKm != null).map(activity => activity.distanceKm);
    const observedAt = dailyTime(day);
    const sleepObservedAt = sleepTime(night);
    const hrvObservedAt = garminGmtTimestamp(nightHrv?.createTimeStamp);
    return {
      date, readiness: null, source: SOURCE, observedAt, sleepObservedAt, hrvObservedAt,
      bodyBattery: observedAt ? finite(day?.bodyBattery?.latestValue, 0, 100) : null,
      bodyBatteryHigh: observedAt ? finite(day?.bodyBattery?.maxValue, 0, 100) : null,
      bodyBatteryLow: observedAt ? finite(day?.bodyBattery?.minValue, 0, 100) : null,
      bodyBatteryCharged: observedAt ? finite(day?.bodyBattery?.chargedValue, 0, 200) : null,
      bodyBatteryDrained: observedAt ? finite(day?.bodyBattery?.drainedValue, 0, 200) : null,
      restingHr: observedAt ? finite(day?.heartRate?.restingValue, 1, 300) : null,
      hrv: hrvObservedAt ? finite(nightHrv?.lastNightAvg, 0, 1000) : null,
      hrvStatus: hrvObservedAt ? text(nightHrv?.status) || null : null,
      hrvBaselineLow: hrvObservedAt ? finite(nightHrv?.baseline?.balancedLow, 0, 1000) : null,
      hrvBaselineHigh: hrvObservedAt ? finite(nightHrv?.baseline?.balancedUpper, 0, 1000) : null,
      sleepMinutes: sleepObservedAt && finite(night?.sleepTimeSeconds, 0, 86400) != null ? round(night.sleepTimeSeconds / 60, 3) : null,
      sleepScore: sleepObservedAt ? finite(night?.sleepScores?.overall?.value, 0, 100) : null,
      sleepStart: sleepRecord?.start || null, sleepEnd: sleepRecord?.end || null,
      sleepStages: sleepRecord?.stages || null,
      stress: observedAt ? finite(day?.stress?.avgLevel, 0, 100) : null,
      respiration: observedAt ? finite(day?.respiration?.avgValue, 0, 100) : null,
      steps: observedAt ? finite(day?.movement?.steps?.value, 0, 200000) : null,
      calories: observedAt ? finite(day?.calories?.burnedTotal, 0, 30000) : null,
      moderateIntensityMinutes: observedAt ? finite(day?.intensityMinutes?.moderate, 0, 1440) : null,
      vigorousIntensityMinutes: observedAt ? finite(day?.intensityMinutes?.vigorous, 0, 1440) : null,
      intensityMinutes: observedAt ? intensity(day) : null,
      distanceKm: distances.length ? round(distances.reduce((a, b) => a + b, 0), 3) : null,
      activeCalories:observedAt?finite(day?.calories?.burnedActive):null,
      hydrationMl:observedAt?finite(day?.hydration?.consumedInMl):null,
      stressRestMinutes:observedAt&&finite(day?.stress?.restDurationInMillis)!=null?round(day.stress.restDurationInMillis/60000):null,
      stressHighMinutes:observedAt&&finite(day?.stress?.highStressDurationInMillis)!=null?round(day.stress.highStressDurationInMillis/60000):null,
      sleepAvgHr:sleepObservedAt?finite(night?.avgHeartRate,1,300):null,
      sleepRespiration:sleepObservedAt?finite(night?.averageRespirationValue,1,100):null,
      sleepPulseOx:sleepObservedAt?finite(night?.averageSpO2Value,1,100):null,
      sleepStress:sleepObservedAt?finite(night?.avgSleepStress,0,100):null,
      napMinutes:sleepObservedAt&&finite(night?.napTimeSeconds)!=null?round(night.napTimeSeconds/60):null
    };
  });
  const sleepRecord = normalizedSleepRecord(sleep);
  const normalizedSleep = sleepRecord?.stages ? sleepRecord : null;
  const snapshot = {
    schemaVersion: 1, mode: 'live', id: `garmin-${randomUUID()}`, generatedAt, dataThrough, timezone, goalsVersion: goals.version,
    device: { model: 'Garmin CIRQA', modelSource: 'user-provided', lastSyncAt: null },
    metrics, sleep: normalizedSleep, history, activities, heartRateSeries,
    recommendations: [{ id: 'local-import-summary', title: 'Your Garmin data, in view.', body: `${daily.length} daily summaries and ${activities.length} saved activities are available in this private import. Grok is not connected. These are source measurements and a local data summary, not AI training advice.`, action: 'Review your training history and personal goals', evidence: ['bodyBattery', 'sleepMinutes', 'hrv'].filter(key => metrics[key].status === 'available'), source: 'local-summary', confidence: 'descriptive' }],
    capabilities: { cycleTracking: 'opt-in', pregnancyTracking: 'opt-in', naturalCycles: 'companion-app', liveTrack: 'companion-app', connectedGps: 'phone-required' },
    coverage: {
      startDate: raw.startDate, endDate: raw.endDate, dailySummaries: daily.length,
      sleepSummaries: sleepByDate.size, activityCount: activities.length,
      restingHrDays: history.filter(row => row.restingHr != null).length,
      hrvDays: history.filter(row => row.hrv != null).length,
      sleepDays: history.filter(row => row.sleepMinutes != null).length,
      sleepStageDays: history.filter(row => row.sleepStages != null).length,
      bodyBatteryHistoryField: 'latestValue', distanceHistoryIncludes: 'all recorded activity types',
      heartRateSamples: heartRateSeries.length, heartRateSampleDays: new Set(heartRateSeries.map(point => localDay(point.timestamp, timezone))).size,
      aiConnected: false
    }
  };
  const zoneProfiles = array(raw.zones).map(profile => ({
    sport: text(profile?.sport), trainingMethod: text(profile?.trainingMethod),
    floors: Array.from({ length: 5 }, (_, index) => finite(profile?.[`zone${index + 1}Floor`], 1, 300)),
    maxHeartRate: finite(profile?.maxHeartRateUsed, 1, 300)
  })).filter(profile => profile.floors.every((floor, index) => floor != null && (index === 0 || floor > profile.floors[index - 1])));
  snapshot.zoneProfiles = zoneProfiles;
  // A single imported profile can be presented directly. Multiple sport-specific
  // profiles must be selected by sport, not collapsed to an invented average.
  snapshot.zoneBoundaries = zoneProfiles.length === 1 ? zoneProfiles[0].floors : [];
  snapshot.bodyBatterySeries=array(raw.bodyBatteryDays).flatMap(report=>{
    const descriptors=array(report.bodyBatteryValueDescriptorDTOList);
    const ti=descriptors.find(d=>d.bodyBatteryValueDescriptorKey==='timestamp')?.bodyBatteryValueDescriptorIndex;
    const vi=descriptors.find(d=>d.bodyBatteryValueDescriptorKey==='bodyBatteryLevel')?.bodyBatteryValueDescriptorIndex;
    if(!Number.isInteger(ti)||!Number.isInteger(vi))return [];
    return array(report.bodyBatteryValuesArray).map(r=>({timestamp:garminGmtTimestamp(r[ti]),value:finite(r[vi],0,100)})).filter(p=>p.timestamp&&p.timestamp<=dataThrough&&p.value!=null);
  }).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  snapshot.coverage.earliestWorkout=activities.at(-1)?.date||null;
  snapshot.coverage.activityHistory='All activities returned by the Personal API, retained across refreshes';
  snapshot.coverage.documentedUnavailable=['readiness','trainingStatus','recoveryHours','skinTemperature'];
  return validateSnapshot(mergeArchive(snapshot,raw.archive));
}
