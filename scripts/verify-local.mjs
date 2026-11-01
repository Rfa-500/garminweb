import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const base='http://127.0.0.1:4173';
const snapshot=await fetch(base+'/api/v1/snapshot');assert.equal(snapshot.status,200);const s=await snapshot.json();assert.equal(s.mode,'live');
assert.equal((await fetch(base+'/.env.local')).status,404);
assert.equal((await fetch(base+'/.local/garmin-raw.json')).status,404);
assert.equal((await fetch(base+'/api/v1/snapshot',{headers:{Origin:'https://example.com'}})).status,403);
assert.equal((await fetch(base+'/api/v1/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
const key=(await readFile('.env.local','utf8')).match(/^GARMIN_PERSONAL_API_KEY=(.+)$/m)[1].trim();
const cfg=await(await fetch(base+'/config.js')).text();assert.ok(!cfg.includes(key));
const raw=JSON.parse(await readFile('.local/garmin-raw.json','utf8'));const accountId=String(raw.hrv?.userProfilePk??'__no_account_id__');
const names=await readdir('dist',{recursive:true,withFileTypes:true});
for(const entry of names)if(entry.isFile()){const text=await readFile(entry.parentPath+'/'+entry.name,'utf8');assert.ok(!text.includes(key),'Private credential in public file');assert.ok(!text.includes(accountId),'Private account ID in public file');}
console.log('Verified: local snapshot, blocked cross-origin/missing-CSRF requests, private files inaccessible, static bundle contains no credential or account ID.');
