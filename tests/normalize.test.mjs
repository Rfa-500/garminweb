import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGarmin, liveDefaultGoals, garminGmtTimestamp } from '../integration/normalize.mjs';
import { validateSnapshot } from '../dist/data.js';

// Synthetic records only. Never load the user's .local data in a test.
function fixture() {
  return {
    startDate: '2026-10-29', endDate: '2026-10-31', fetchedAt: '2026-11-01T01:00:00Z',
    daily: { data: [{ calendarDate: '2026-10-31', wellnessChronology: { endTimestampGmt: '2026-10-31T20:00:00.0' }, movement: { steps: { value: 4321 } }, calories: { burnedTotal: 1800 }, heartRate: { restingValue: 55, maxValue: 160 }, intensityMinutes: { moderate: 20, vigorous: 10 }, stress: { avgLevel: 20 }, bodyBattery: { latestValue: 45, maxValue: 90 }, respiration: { avgValue: 14 }, pulseOx: {} }] },
    sleep: { calendarDate: '2026-10-31', sleepStartTimestampGMT: Date.parse('2026-10-31T03:00:00Z'), sleepEndTimestampGMT: Date.parse('2026-10-31T11:00:00Z'), sleepTimeSeconds: 28200, deepSleepSeconds: 6000, remSleepSeconds: 6000, lightSleepSeconds: 16200, awakeSleepSeconds: 600, napTimeSeconds: 0, sleepScores: { overall: { value: 80 } }, sleepNeed: { actual: 500 } },
    hrv: { hrvSummary: { calendarDate: '2026-10-31', lastNightAvg: 60, status: 'BALANCED', createTimeStamp: '2026-10-31T11:30:00.0' } },
    activities: [{ activityId: 12345, activityName: 'Synthetic walk', activityType: { typeKey: 'walking' }, startTimeGMT: '2026-10-31 12:00:00', endTimeGMT: '2026-10-31 12:30:00', distance: 2400, duration: 1800, averageHR: 101.6, maxHR: 130, calories: 180, differenceBodyBattery: -4, trainingEffectLabel: 'RECOVERY', hrTimeInZone_1: 600, hrTimeInZone_2: 900, hrTimeInZone_3: 300, hrTimeInZone_4: 0, hrTimeInZone_5: 0, ownerFullName: 'Private fixture name', startLatitude: 9.99999, startLongitude: -79.99999 }]
  };
}
const options = { now: '2026-11-01T01:00:00Z' };

test('normalization maps source units, preserves unavailable fields and separates retrieval time', () => {
  const snapshot = normalizeGarmin(fixture(), liveDefaultGoals, options);
  assert.equal(snapshot.mode, 'live');
  assert.equal(snapshot.generatedAt, '2026-11-01T01:00:00.000Z');
  assert.equal(snapshot.dataThrough, '2026-10-31T20:00:00.000Z');
  assert.equal(snapshot.device.lastSyncAt, null);
  assert.equal(snapshot.metrics.bodyBattery.value, 45, 'latest value, not maximum');
  assert.equal(snapshot.metrics.sleepMinutes.value, 470);
  assert.equal(snapshot.metrics.intensityMinutes.value, 40);
  assert.equal(snapshot.metrics.hrv.value, 60);
  assert.equal(snapshot.metrics.pulseOx.value, null);
  assert.equal(snapshot.metrics.readiness.value, null);
  assert.equal(snapshot.metrics.sleepNeedMinutes.value, null, 'undocumented units are not guessed');
  assert.equal(snapshot.metrics.heartRate.value, null, 'daily max is not current HR');
  assert.equal(snapshot.sleep.stages.awake, 10);
  assert.equal(snapshot.recommendations[0].source, 'local-summary');
});

test('all activity types and distances normalize without profile or coordinate leakage', () => {
  const raw = fixture();
  raw.zones = [{ sport: 'DEFAULT', trainingMethod: 'HR_MAX', zone1Floor: 90, zone2Floor: 110, zone3Floor: 130, zone4Floor: 150, zone5Floor: 170, maxHeartRateUsed: 190 }];
  raw.activities.push({ ...raw.activities[0], activityId: 67890, activityType: { typeKey: 'strength_training' }, distance: undefined, averageHR: undefined });
  const snapshot = normalizeGarmin(raw, { ...liveDefaultGoals, version: 3 }, options);
  assert.deepEqual(snapshot.activities.map(activity => activity.type), ['Walking', 'Strength']);
  assert.equal(snapshot.activities[0].distanceKm, 2.4);
  assert.equal(snapshot.activities[0].avgHr, 102);
  assert.deepEqual(snapshot.activities[0].zones, [10, 15, 5, 0, 0]);
  assert.equal(snapshot.activities[1].distanceKm, null);
  assert.equal(snapshot.activities[1].avgHr, null);
  assert.equal(snapshot.activities[0].effort, null);
  assert.equal(snapshot.goalsVersion, 3);
  assert.deepEqual(snapshot.zoneBoundaries, [90, 110, 130, 150, 170]);
  assert.ok(!JSON.stringify(snapshot).includes('Private fixture name'));
  assert.ok(!JSON.stringify(snapshot).includes('9.99999'));
});

test('history keeps every source-window day with null missing values', () => {
  const snapshot = normalizeGarmin(fixture(), liveDefaultGoals, options);
  assert.equal(snapshot.history.length, 3);
  assert.equal(snapshot.history[0].date, '2026-10-29');
  for(const key of ['readiness','bodyBattery','sleepScore','intensityMinutes','distanceKm','restingHr','hrv','sleepMinutes','sleepStages','sleepStart','sleepEnd','stress','respiration','steps','calories','moderateIntensityMinutes','vigorousIntensityMinutes']) assert.equal(snapshot.history[0][key], null, `${key} stays unavailable`);
  assert.equal(snapshot.history[2].distanceKm, 2.4);
  assert.equal(snapshot.history[2].bodyBattery, 45);
  assert.equal(snapshot.history[2].readiness, null);
  assert.equal(snapshot.history[2].restingHr, 55);
  assert.equal(snapshot.history[2].hrv, 60);
  assert.equal(snapshot.history[2].sleepMinutes, 470);
  assert.deepEqual(snapshot.history[2].sleepStages, { deep: 100, rem: 100, light: 270, awake: 10 });
  assert.equal(snapshot.history[2].stress, 20);
  assert.equal(snapshot.history[2].respiration, 14);
  assert.equal(snapshot.history[2].steps, 4321);
  assert.equal(snapshot.history[2].moderateIntensityMinutes, 20);
  assert.equal(snapshot.history[2].vigorousIntensityMinutes, 10);
  assert.equal(snapshot.history[2].hrvObservedAt, '2026-10-31T11:30:00.000Z');
  assert.equal(snapshot.coverage.sleepStageDays, 1);
});

test('historical HRV aligns to its source calendar date, without filling missing days', () => {
  const raw = fixture();
  raw.hrvHistory = { hrvSummaries: [{ calendarDate: '2026-10-29', lastNightAvg: 48, status: 'LOW', baseline: { balancedLow: 50, balancedUpper: 70 }, createTimeStamp: '2026-10-29T11:30:00.0' }] };
  const snapshot = normalizeGarmin(raw, liveDefaultGoals, options);
  assert.equal(snapshot.history[0].hrv, 48);
  assert.equal(snapshot.history[0].hrvBaselineLow, 50);
  assert.equal(snapshot.history[1].hrv, null);
  assert.equal(snapshot.history[2].hrv, 60);
  assert.equal(snapshot.activities[0].maxHr, 130);
  assert.equal(snapshot.activities[0].calories, 180);
  assert.equal(snapshot.activities[0].bodyBatteryImpact, -4);
});

test('heart-rate charts use only actual descriptor-matched samples and source times', () => {
  const raw = fixture();
  const at = iso => Date.parse(iso);
  raw.heartRateDays = [{ calendarDate: '2026-10-31', heartRateValueDescriptors: [{ index: 1, key: 'timestamp' }, { index: 0, key: 'heartrate' }], heartRateValues: [[110, at('2026-10-31T12:15:00Z')], [null, at('2026-10-31T12:16:00Z')], [125, at('2026-10-31T12:25:00Z')], [0, at('2026-10-31T12:26:00Z')], [70, at('2026-10-31T21:00:00Z')]] }];
  const snapshot = normalizeGarmin(raw, liveDefaultGoals, options);
  assert.equal(snapshot.heartRateSeries.length, 3, 'missing and invalid readings are not interpolated');
  assert.deepEqual(snapshot.activities[0].heartRateSamples.map(point => point.bpm), [110, 125]);
  assert.equal(snapshot.metrics.heartRate.value, 70);
  assert.equal(snapshot.metrics.heartRate.observedAt, '2026-10-31T21:00:00.000Z');
  assert.equal(snapshot.dataThrough, '2026-10-31T21:00:00.000Z');
  assert.deepEqual(normalizeGarmin(fixture(), liveDefaultGoals, options).heartRateSeries, []);
});

test('extended history and activity samples are checked before caching', () => {
  const snapshot = normalizeGarmin(fixture(), liveDefaultGoals, options);
  snapshot.history[2].restingHr = -1;
  assert.throws(() => validateSnapshot(snapshot), /Invalid history/);
  snapshot.history[2].restingHr = 55;
  snapshot.activities[0].heartRateSamples = [{ timestamp: '2026-10-31T13:00:00.000Z', bpm: 100 }];
  assert.throws(() => validateSnapshot(snapshot), /Invalid heart-rate sample/);
  snapshot.activities[0].heartRateSamples = [];
  snapshot.heartRateSeries = [{ timestamp: '2026-10-31T12:00:00.000Z', bpm: 400 }];
  assert.throws(() => validateSnapshot(snapshot), /Invalid heart-rate sample/);
});

test('invalid source data never manufactures timestamps or sleep stages', () => {
  assert.throws(() => normalizeGarmin({ startDate: '2026-10-29', endDate: '2026-10-31', fetchedAt: options.now }, liveDefaultGoals, options), /No valid source/);
  const raw = fixture(); raw.sleep.deepSleepSeconds += 3600;
  assert.equal(normalizeGarmin(raw, liveDefaultGoals, options).sleep, null);
  raw.daily.data[0].wellnessChronology.endTimestampGmt = '2027-01-01T00:00:00';
  assert.throws(() => normalizeGarmin(raw, liveDefaultGoals, options), /future/);
});

test('GMT timestamp normalization accepts source formats without using host timezone', () => {
  assert.equal(garminGmtTimestamp('2026-10-31 20:00:00'), '2026-10-31T20:00:00.000Z');
  assert.equal(garminGmtTimestamp(Date.parse('2026-10-31T20:00:00Z')), '2026-10-31T20:00:00.000Z');
  assert.equal(garminGmtTimestamp('2026-10-31'), null);
});
