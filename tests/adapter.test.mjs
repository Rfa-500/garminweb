import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { demoSnapshot, defaultGoals } from '../dist/data.js';

// Isolate module state and inject only environment configuration. Every request
// uses a stub; these tests never access Garmin, Grok, or any live backend.
let moduleVersion = 0;
const stored = new Map();
globalThis.localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: key => stored.delete(key),
  clear: () => stored.clear(),
  key: index => [...stored.keys()][index] ?? null,
  get length() { return stored.size; }
};
const apiSource = await readFile(new URL('../dist/api.js', import.meta.url), 'utf8');
const dataUrl = new URL('../dist/data.js', import.meta.url).href;
async function adapter(overrides = {}) {
  const config = { mode: 'demo', apiBase: '/api/v1', requestTimeoutMs: 12000, accountScope: null, csrfToken: null, ...overrides };
  const source = apiSource
    .replace("import {config} from './config.js';", `const config = ${JSON.stringify(config)};`)
    .replace("from './data.js'", `from '${dataUrl}'`);
  return import('data:text/javascript;base64,' + Buffer.from(source + `\n// instance ${moduleVersion++}`).toString('base64'));
}
function liveSnapshot(generatedAt = demoSnapshot.generatedAt) {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.mode = 'live'; snapshot.id = `test-${generatedAt}`; snapshot.generatedAt = generatedAt;
  Object.values(snapshot.metrics).forEach(metric => { metric.source = 'garmin'; });
  snapshot.activities.forEach(activity => { activity.source = 'garmin'; });
  snapshot.recommendations.forEach(rec => { rec.source = 'grok'; });
  return snapshot;
}
const response = body => ({ ok: true, status: 200, json: async () => structuredClone(body) });
test.beforeEach(() => { stored.clear(); globalThis.fetch = async () => { throw Error('Unexpected network access'); }; });

test('demo refresh preserves observations while applying edited goals', async () => {
  const api = await adapter();
  const before = structuredClone(api.getSavedSnapshot());
  const goals = { ...defaultGoals, version: 2, primary: 'Build aerobic consistency', sleepHours: 8.5 };
  await api.persistGoals(goals);
  const first = api.refreshInsights(goals);
  assert.equal(api.refreshInsights(goals), first, 'duplicate refresh shares one in-flight job');
  const after = await first;
  assert.equal(after.dataThrough, before.dataThrough);
  assert.equal(after.device.lastSyncAt, before.device.lastSyncAt);
  assert.deepEqual(after.metrics, before.metrics);
  assert.deepEqual(after.activities, before.activities);
  assert.equal(after.goalsVersion, 2);
  assert.ok(after.recommendations[0].body.includes(goals.primary));
  assert.ok(Date.parse(after.generatedAt) >= Date.parse(before.generatedAt));
  assert.equal(api.getSavedGoals().version, 2);
  assert.equal((await adapter()).getSavedSnapshot().id, after.id, 'snapshot survives a fresh page module');
});

test('bad caches and cross-mode snapshots cannot contaminate demo or live data', async () => {
  const demo = await adapter();
  demo.save('snapshot', { invalid: true });
  assert.equal(demo.getSavedSnapshot().id, demoSnapshot.id);
  demo.save('snapshot', liveSnapshot());
  assert.equal(demo.getSavedSnapshot().mode, 'demo');
  const live = await adapter({ mode: 'live', accountScope: 'test-owner' });
  assert.equal(live.getSavedSnapshot(), null, 'live mode never falls back to demo');
  live.save('snapshot', structuredClone(demoSnapshot));
  assert.equal(live.getSavedSnapshot(), null);
});

test('a stale or failed server read keeps the last valid live snapshot', async () => {
  const api = await adapter({ mode: 'live', accountScope: 'test-owner' });
  const newer = liveSnapshot('2026-10-31T14:42:00Z');
  globalThis.fetch = async () => response(newer);
  assert.equal((await api.loadLatest()).id, newer.id);
  globalThis.fetch = async () => response(liveSnapshot());
  await assert.rejects(api.loadLatest(), /Older snapshot/);
  assert.equal(api.getSavedSnapshot().id, newer.id);
  globalThis.fetch = async () => { throw Error('offline'); };
  await assert.rejects(api.loadLatest(), /offline/);
  assert.equal(api.getSavedSnapshot().id, newer.id);
});

test('unscoped live state stays out of persistent browser storage', async () => {
  const api = await adapter({ mode: 'live' });
  api.save('snapshot', liveSnapshot());
  assert.equal(stored.size, 0);
  assert.equal(api.getSavedSnapshot().mode, 'live', 'memory may serve the current authenticated session');
});

test('live refresh sends the current goals, source watermark and CSRF token', async () => {
  const api = await adapter({ mode: 'live', accountScope: 'test-owner', csrfToken: 'test-csrf' });
  const saved = liveSnapshot(); api.save('snapshot', saved);
  let request;
  globalThis.fetch = async (url, options) => { request = { url, options }; return response({ snapshot: liveSnapshot('2026-10-31T14:42:00Z') }); };
  await api.refreshInsights(defaultGoals);
  assert.equal(request.url, '/api/v1/refresh');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.method, 'POST');
  assert.ok(request.options.headers['Idempotency-Key']);
  assert.equal(request.options.headers['X-CSRF-Token'], 'test-csrf');
  assert.deepEqual(JSON.parse(request.options.body), { reason: 'manual', goalsVersion: 1, dataThrough: saved.dataThrough });
});

test('live mutations reject a missing CSRF bootstrap before making a request', async () => {
  const api = await adapter({ mode: 'live', accountScope: 'test-owner' });
  let called = false;
  globalThis.fetch = async () => { called = true; return response(defaultGoals); };
  await assert.rejects(api.persistGoals({ ...defaultGoals, version: 2 }));
  assert.equal(called, false);
});

test('live caches are isolated by account and can be cleared on sign-out', async () => {
  const ownerA = await adapter({ mode: 'live', accountScope: 'owner-a' });
  const snapshot = liveSnapshot(); ownerA.save('snapshot', snapshot);
  const ownerB = await adapter({ mode: 'live', accountScope: 'owner-b' });
  assert.equal(ownerB.getSavedSnapshot(), null);
  assert.equal((await adapter({ mode: 'live', accountScope: 'owner-a' })).getSavedSnapshot().id, snapshot.id);
  ownerA.clearPrivateCache();
  assert.equal(ownerA.getSavedSnapshot(), null);
  assert.equal((await adapter({ mode: 'live', accountScope: 'owner-a' })).getSavedSnapshot(), null);
});
