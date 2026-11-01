import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionCookie,validSession,csrfFor,validMutation} from '../integration/web-security.mjs';
import {refreshState,sourceFingerprint,buildState} from '../integration/state.mjs';
import {collectGarmin} from '../integration/garmin.mjs';
import {personalFeedback,validateProfile,emptyProfile} from '../dist/personalization.js';
import {demoSnapshot,defaultGoals} from '../dist/data.js';

test('session cookies are signed, persistent, and bounded; mutations reject cross-site requests',()=>{
 const now=Date.now(),secret='synthetic-test-secret',session=sessionCookie(secret,now);
 assert.equal(validSession(session,secret,now+7*86400000),true);
 assert.equal(validSession(session,secret,now+91*86400000),false);
 assert.equal(validSession(session,'wrong-secret'),false);
 assert.equal(validSession(session+'x',secret),false);
 const request={origin:'https://example.test',expectedOrigin:'https://example.test',fetchSite:'same-origin',session,secret,csrf:csrfFor(session,secret)};
 assert.equal(validMutation(request),true);
 assert.equal(validMutation({...request,origin:'https://evil.test'}),false);
 assert.equal(validMutation({...request,csrf:'invalid'}),false);
 assert.equal(validMutation({...request,fetchSite:'cross-site'}),false);
});
test('offline checks retain saved observations and a quiet check respects the thirty-minute interval',async()=>{
 const previous={raw:{fetchedAt:'earlier',daily:{data:[]}},snapshot:structuredClone(demoSnapshot),lastCheckedAt:new Date().toISOString()};
 let calls=0;const request=async()=>{calls++;throw Error('Offline');};
 assert.equal(await refreshState(previous,{reason:'check',request}),previous);
 assert.equal(calls,0);
 const result=await refreshState(previous,{reason:'manual',request});
 assert.deepEqual(result.snapshot,previous.snapshot);assert.equal(calls,1);
 assert.equal(sourceFingerprint({...previous.raw,fetchedAt:'later',errors:{sleep:'timeout'}}),sourceFingerprint(previous.raw));
});
test('same-data refresh preserves the last analysis timestamp',async()=>{
 const previous={raw:{daily:{data:[{value:3}]}},snapshot:structuredClone(demoSnapshot)};
 const result=await refreshState(previous,{request:async()=>({...previous.raw,fetchedAt:new Date().toISOString()})});
 assert.equal(result.snapshot.generatedAt,previous.snapshot.generatedAt);
});
test('all-history collection retains old sessions, deduplicates revisions and preserves missing sensor data',async()=>{
 const previous={daily:{data:[{calendarDate:'2026-10-01'}]},activities:[{activityId:1,activityType:{typeKey:'soccer'},startTimeGMT:'2026-09-01 12:00:00',duration:100}],sleepHistory:[]};
 const result=await collectGarmin('2026-10-31',{previous,persist:false,request:async path=>{
  if(path.startsWith('/usersummary-service'))return {data:[{calendarDate:'2026-10-31'}]};
  if(path.startsWith('/activitylist-service')){assert.equal(path.includes('startDate'),false);return [{...previous.activities[0],duration:200},{activityId:2}];}
  return null;
 }});
 assert.equal(result.activities.length,2);assert.equal(result.activities[0].duration,200);
 assert.equal(result.daily.data.length,2);assert.equal(result.startDate,'2026-10-01');
});
test('teen feedback uses sleep guidance without generating body-size or age-derived fitness scores',()=>{
 const profile=validateProfile({...emptyProfile,age:15,heightCm:180,weightKg:65,preferredSport:'Soccer'});
 const feedback=personalFeedback(demoSnapshot,defaultGoals,profile);
 assert.match(feedback[0].body,/8–10 hours/);
 assert.equal(feedback.every(r=>r.source==='calculated-feedback'),true);
 assert.doesNotMatch(JSON.stringify(feedback),/BMI|calorie deficit|220\s*-/);
 assert.throws(()=>validateProfile({...profile,age:2}));
 assert.throws(()=>validateProfile({...profile,weightKg:-3}));
});
