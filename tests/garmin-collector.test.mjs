import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHeartRateDates, collectHeartRateDays } from '../integration/garmin.mjs';

// These tests call only injected synthetic requests. They never read .env.local
// or .local, request a token, or contact a Garmin endpoint.
const activity=(id,sport,time)=>({activityId:id,activityType:{typeKey:sport},startTimeGMT:time});
const samples=(date,bpm=70)=>({calendarDate:date,heartRateValueDescriptors:[{index:0,key:'timestamp'},{index:1,key:'heartrate'}],heartRateValues:[[Date.parse(date+'T12:00:00Z'),bpm]]});
const activities=[activity(1,'soccer','2026-10-30 23:00:00'),activity(2,'soccer','2026-10-27 23:00:00'),activity(3,'soccer','2026-10-27 20:00:00'),activity(4,'walking','2026-10-31 12:00:00')];

test('heart-rate requests follow the most frequent sport and distinct local dates',()=>{
  assert.deepEqual(selectHeartRateDates(activities,'2026-10-31'),['2026-10-31','2026-10-30','2026-10-27']);
  const mixed=[...activities,activity(5,'walking','2026-10-29 12:00:00'),activity(6,'walking','2026-10-28 12:00:00'),activity(7,'walking','2026-10-26 12:00:00')];
  assert.deepEqual(selectHeartRateDates(mixed,'2026-10-31'),['2026-10-31','2026-10-29','2026-10-28']);
  assert.deepEqual(selectHeartRateDates([],'2026-10-31'),['2026-10-31']);
});

test('date selection respects timezone, deduplicates activities and excludes future records',()=>{
  const rows=[activity(1,'soccer','2026-10-31 02:00:00'),activity(1,'soccer','2026-10-31 02:00:00'),activity(2,'walking','2026-10-29 12:00:00'),activity(3,'walking','2026-10-28 12:00:00'),activity(4,'soccer','2026-11-02 02:00:00')];
  assert.deepEqual(selectHeartRateDates(rows,'2026-10-31'),['2026-10-31','2026-10-29','2026-10-28']);
  assert.deepEqual(selectHeartRateDates([rows[0]],'2026-10-31'),['2026-10-31','2026-10-30']);
  assert.throws(()=>selectHeartRateDates([],'2026-02-31'),/Invalid collection end date/);
});

test('failed or empty reads retain exact previous samples and do not erase other cached days',async()=>{
  const prior=[samples('2026-10-31',65),samples('2026-10-30',66),samples('2026-10-27',67),samples('2026-10-26',68),samples('2026-09-01',69)];
  const calls=[];
  const result=await collectHeartRateDays({activities,endDate:'2026-10-31',previous:prior,request:async path=>{
    calls.push(path);
    if(path.endsWith('2026-10-31'))throw Error('offline');
    if(path.endsWith('2026-10-30'))return {...samples('2026-10-30'),heartRateValues:[]};
    return samples('2026-10-27',72);
  }});
  assert.equal(calls.length,3);
  assert.equal(result.days.find(day=>day.calendarDate==='2026-10-31'),prior[0]);
  assert.equal(result.days.find(day=>day.calendarDate==='2026-10-30'),prior[1]);
  assert.equal(result.days.find(day=>day.calendarDate==='2026-10-26'),prior[3]);
  assert.equal(result.days.find(day=>day.calendarDate==='2026-10-27').heartRateValues[0][1],72);
  assert.ok(!result.days.some(day=>day.calendarDate==='2026-09-01'));
  assert.equal(result.errors['heartRate:2026-10-31'],'offline');
});

test('null or malformed responses never replace valid cached physiology',async()=>{
  const prior=samples('2026-10-31',68);
  for(const reply of [null,{...samples('2026-10-31'),heartRateValues:[[Date.parse('2026-10-31T12:00:00Z'),null]]},samples('2026-10-30'),{...samples('2026-10-31'),heartRateValueDescriptors:[]}]){
    const result=await collectHeartRateDays({activities:[],endDate:'2026-10-31',previous:[prior],request:async()=>reply});
    assert.deepEqual(result.days,[prior]);
  }
});
