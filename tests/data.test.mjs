import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGoals, demoSnapshot, validateGoals, validateSnapshot } from '../dist/data.js';

const copy = () => structuredClone(demoSnapshot);
const live = () => {
  const snapshot = copy();
  snapshot.mode = 'live';
  snapshot.id = 'live-test-only';
  Object.values(snapshot.metrics).forEach(metric => { metric.source = 'garmin'; });
  snapshot.activities.forEach(activity => { activity.source = 'garmin'; });
  snapshot.recommendations.forEach(rec => { rec.source = 'grok'; });
  return snapshot;
};

test('demo fixture and editable goals satisfy the contract', () => {
  assert.equal(validateSnapshot(demoSnapshot), demoSnapshot);
  assert.equal(validateGoals(defaultGoals), defaultGoals);
  assert.doesNotThrow(() => validateGoals({ ...defaultGoals, version: 2, primary: 'Build consistency', sleepHours: 8.5 }));
});

test('goal validation rejects invalid targets and versions', () => {
  for (const invalid of [
    { primary: '  ' }, { version: 0 }, { sleepHours: NaN },
    { targetMinutes: 9 }, { workoutsPerWeek: 2.5 }, { weeklyDistanceKm: 0 }
  ]) assert.throws(() => validateGoals({ ...defaultGoals, ...invalid }));
});

test('missing measurements remain explicitly unavailable, never populated', () => {
  const snapshot = copy();
  snapshot.metrics.pulseOx = { value: null, unit: '%', status: 'not-authorized', source: 'garmin', observedAt: null };
  assert.doesNotThrow(() => validateSnapshot(snapshot));
  snapshot.metrics.pulseOx.value = 98;
  assert.throws(() => validateSnapshot(snapshot));
});

test('live snapshots reject demo provenance in metrics, workouts and insights', () => {
  assert.doesNotThrow(() => validateSnapshot(live()));
  for (const poison of [
    snapshot => { snapshot.metrics.hrv.source = 'demo'; },
    snapshot => { snapshot.activities[0].source = 'demo'; },
    snapshot => { snapshot.recommendations[0].source = 'demo-rule'; }
  ]) {
    const snapshot = live(); poison(snapshot);
    assert.throws(() => validateSnapshot(snapshot));
  }
});

test('snapshot rejects invalid scores, source chronology and goal version', () => {
  for (const mutate of [
    s => { s.metrics.readiness.value = 101; },
    s => { s.history[0].sleepScore = 101; },
    s => { s.metrics.hrv.value = Infinity; },
    s => { s.goalsVersion = 0; },
    s => { s.generatedAt = '2026-10-30T00:00:00Z'; },
    s => { s.metrics.hrv.observedAt = '2026-11-02T00:00:00Z'; },
    s => { s.timezone = 'Invalid/Nowhere'; }
  ]) { const snapshot = copy(); mutate(snapshot); assert.throws(() => validateSnapshot(snapshot)); }
});

test('invalid workout identity, measurements and sleep totals are rejected', () => {
  for (const mutate of [
    s => { s.activities[1].id = s.activities[0].id; },
    s => { s.activities[0].distanceKm = -1; },
    s => { s.activities[0].effort = 11; },
    s => { s.activities[0].zones = [-1]; },
    s => { s.sleep.stages.deep += 30; },
    s => { s.recommendations[0].evidence = ['invented-field']; }
  ]) { const snapshot = copy(); mutate(snapshot); assert.throws(() => validateSnapshot(snapshot)); }
});
