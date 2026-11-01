import test from 'node:test';
import assert from 'node:assert/strict';
import {activityStats,compareActivities,analyzeSport,healthBaselines,sleepAnalysis,analyzeDay} from '../dist/analytics.js';

const workout=(id,date,minutes=60,extra={})=>({id,name:'Practice',type:'Soccer',sportKey:'soccer',date,durationSec:minutes*60,avgHr:140,zones:[10,15,15,10,0],aerobicTrainingEffect:3,anaerobicTrainingEffect:2,activityTrainingLoad:90,effort:null,distanceKm:null,...extra});
const base=()=>({mode:'live',timezone:'America/Panama',dataThrough:'2026-10-20T22:00:00Z',metrics:{},history:[],activities:[]});
const goals={primary:'Soccer consistency',sleepHours:8,weeklyIntensityMinutes:150,workoutsPerWeek:3,weeklyDistanceKm:20};

test('activity shares use complete session duration, with explicit unclassified time',()=>{
  const s=activityStats(workout('a','2026-10-20T12:00:00Z'));
  assert.equal(s.highSharePct,16.7);
  assert.equal(s.highPer60,10);
  assert.equal(s.coveredMinutes,50);
  assert.equal(s.unclassifiedMinutes,10);
  assert.equal(s.zoneQuality,'partial');
  assert.equal(s.zoneCoveragePct,83.3);
  assert.equal(s.loadPer60,90);
});

test('inconsistent or unavailable zones never produce invented normalized intensities',()=>{
  const bad=activityStats(workout('a','2026-10-20T12:00:00Z',30,{zones:[10,10,10,10,10]}));
  assert.equal(bad.zoneQuality,'inconsistent');assert.equal(bad.highSharePct,null);assert.equal(bad.highPer60,null);assert.deepEqual(bad.zoneShares,[]);
  const absent=activityStats(workout('a','2026-10-20T12:00:00Z',60,{zones:[]}));
  assert.equal(absent.highMinutes,null);assert.equal(absent.highSharePct,null);
});

test('comparison separates more time from more intensity, never divides by zero',()=>{
  const s=base();s.activities=[workout('now','2026-10-20T12:00:00Z',120,{zones:[20,30,30,20,0],activityTrainingLoad:180}),workout('before','2026-10-18T12:00:00Z')];
  const c=compareActivities(s,'now');
  assert.equal(c.previous.id,'before');assert.equal(c.deltas.durationPct,100);assert.equal(c.deltas.trainingLoadPct,100);assert.equal(c.deltas.loadPer60Pct,0);assert.equal(c.deltas.highSharePp,0);assert.equal(c.comparableDuration,false);
  s.activities[1].zones=[20,20,20,0,0];const z=compareActivities(s,'now');assert.equal(z.deltas.highPer60Pct,null);assert.equal(z.deltas.highSharePp,16.7);
  assert.ok(z.interpretation.includes('do not measure'));
});

test('comparison cohort uses only earlier same-sport workouts within twenty percent',()=>{
  const s=base();s.activities=[workout('now','2026-10-20T12:00:00Z'),workout('eligible','2026-10-18T12:00:00Z',50),workout('too-short','2026-10-17T12:00:00Z',30),workout('future','2026-10-21T12:00:00Z'),workout('other-sport','2026-10-19T12:00:00Z',60,{sportKey:'basketball',type:'Basketball'})];
  const c=compareActivities(s,'now');assert.deepEqual(c.matched.ids,['eligible']);assert.equal(c.matched.count,1);assert.equal(c.matched.limited,true);
  assert.equal(compareActivities(s,'now','future').previous,null);assert.equal(compareActivities(s,'now','other-sport').previous,null);assert.equal(compareActivities(s,'now','now').previous,null);
});

test('health baseline excludes the selected date and all future observations',()=>{
  const s=base();s.history=Array.from({length:10},(_,i)=>({date:`2026-10-${String(i+10).padStart(2,'0')}`,hrv:60,restingHr:55}));s.history.push({date:'2026-10-20',hrv:90,restingHr:50},{date:'2026-10-21',hrv:200});
  const b=healthBaselines(s,'2026-10-20');assert.equal(b.metrics.hrv.count,10);assert.equal(b.metrics.hrv.baseline,60);assert.equal(b.metrics.hrv.pct,50);assert.equal(b.metrics.hrv.position,'above-typical');assert.equal(b.metrics.hrv.sufficient,true);
  assert.equal(healthBaselines(s,'2026-10-12').metrics.hrv.sufficient,false);
});

test('historical dates never borrow present-day metrics or activities',()=>{
  const s=base();s.history=[{date:'2026-10-18',sleepScore:70,intensityMinutes:null},{date:'2026-10-20',sleepScore:90,intensityMinutes:20}];s.metrics.hrv={status:'available',value:99,observedAt:'2026-10-20T11:00:00Z'};s.activities=[workout('future','2026-10-20T12:00:00Z'),workout('past','2026-10-18T12:00:00Z')];
  const d=analyzeDay(s,goals,'2026-10-18');assert.equal(d.metrics.hrv,null);assert.equal(d.metrics.sleepScore,70);assert.equal(d.metrics.intensityMinutes,null);assert.equal(d.latestActivity.id,'past');assert.equal(d.activities.length,1);assert.equal(d.week.intensityMinutes,null);
});

test('sleep timing handles midnight without a false twelve-hour variability',()=>{
  const s=base();s.history=[
    {date:'2026-10-18',sleepMinutes:450,sleepStart:'2026-10-18T04:50:00Z',sleepEnd:'2026-10-18T12:50:00Z'},
    {date:'2026-10-19',sleepMinutes:470,sleepStart:'2026-10-19T05:10:00Z',sleepEnd:'2026-10-19T13:10:00Z'},
    {date:'2026-10-20',sleepMinutes:460,sleepStart:'2026-10-20T05:00:00Z',sleepEnd:'2026-10-20T13:00:00Z',sleepStages:{deep:90,rem:100,light:270,awake:20}}
  ];const sleep=sleepAnalysis(s,goals,'2026-10-20');assert.equal(sleep.bedtimeVariabilityMinutes,8.2);assert.equal(sleep.goalGapMinutes,-20);assert.equal(sleep.efficiencyPct,95.8);assert.equal(sleep.restorativeMinutes,190);assert.equal(sleep.nightsAtGoal,0);assert.equal(sleep.recordedNights,3);
});

test('sport trends honor the date window, retain gaps, and do not average invalid zone percentages',()=>{
  const s=base();s.activities=[workout('old','2026-09-01T12:00:00Z'),workout('last-week','2026-10-14T12:00:00Z'),workout('latest','2026-10-20T12:00:00Z'),workout('future','2026-10-21T12:00:00Z')];
  const result=analyzeSport(s,'Soccer',7);assert.equal(result.activities.length,2);assert.equal(result.summary.sessions,2);assert.equal(result.summary.durationMinutes,120);assert.equal(result.latest.id,'latest');assert.equal(result.weekly.length,2);assert.equal(result.periodDays,7);
});

test('similar-duration insights require three usable zone records, not merely three activities',()=>{
  const s=base();s.activities=[workout('now','2026-10-20T12:00:00Z'),workout('usable','2026-10-19T12:00:00Z'),workout('missing','2026-10-18T12:00:00Z',60,{zones:[]}),workout('inconsistent','2026-10-17T12:00:00Z',60,{zones:[20,20,20,20,20]})];
  const c=compareActivities(s,'now');assert.equal(c.matched.count,3);assert.equal(c.matched.sampleCounts.highSharePct,1);assert.ok(!c.insights.some(i=>i.id==='matched-baseline'));
});

test('duration-only workouts still compare available evidence without claiming no previous session',()=>{
  const missing={zones:[],aerobicTrainingEffect:null,anaerobicTrainingEffect:null,activityTrainingLoad:null};
  const s=base();s.activities=[workout('now','2026-10-20T12:00:00Z',60,missing),workout('before','2026-10-19T12:00:00Z',40,missing)];
  const c=compareActivities(s,'now');assert.equal(c.primaryInsight.id,'duration-change');assert.equal(c.deltas.durationPct,50);assert.equal(c.currentStats.trainingLoad,null);
});
