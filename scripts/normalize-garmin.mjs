import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeGarmin, liveDefaultGoals } from '../integration/normalize.mjs';

// All account payloads stay in the ignored, nonpublic .local directory.
const privateDir = new URL('../.local/', import.meta.url);
const readJson = async url => JSON.parse((await readFile(url, 'utf8')).replace(/^\uFEFF/, ''));
const raw = await readJson(new URL('garmin-raw.json', privateDir));
let goals;
try { goals = await readJson(new URL('goals.json', privateDir)); }
catch (error) { if (error.code !== 'ENOENT') throw error; goals = structuredClone(liveDefaultGoals); }
const snapshot = normalizeGarmin(raw, goals);
await mkdir(privateDir, { recursive: true });
const temporary = new URL('snapshot.json.tmp', privateDir);
await writeFile(temporary, JSON.stringify(snapshot, null, 2), { encoding: 'utf8', mode: 0o600 });
await rename(temporary, new URL('snapshot.json', privateDir));
console.log(JSON.stringify({ saved: fileURLToPath(new URL('snapshot.json', privateDir)), mode: snapshot.mode, days: snapshot.history.length, activities: snapshot.activities.length, availableMetrics: Object.values(snapshot.metrics).filter(metric => metric.status === 'available').length, aiConnected: false }));
