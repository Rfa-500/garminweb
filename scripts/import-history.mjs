// Run locally. Only the prepared training payload is uploaded; the original archive stays local.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {unzipSync} from 'fflate';
import {Decoder,Stream,Utils} from '@garmin/fitsdk';
import {garminGmtTimestamp} from '../integration/normalize.mjs';
import {validateArchive} from '../integration/archive.mjs';
const input=process.argv[2];if(!input)throw Error('Usage: node scripts/import-history.mjs path/to/Garmin.zip');
const zipped=unzipSync(await readFile(input));
const json=fragment=>{const key=Object.keys(zipped).find(k=>k.includes(fragment)&&k.endsWith('.json'));return key?JSON.parse(new TextDecoder().decode(zipped[key])):[];};
const iso=garminGmtTimestamp;
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama'});const dayOf=time=>dayFormatter.format(new Date(time));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const days=new Map();const day=d=>{if(!days.has(d))days.set(d,{date:d});return days.get(d);};
const sleeps=json('sleepData').filter(s=>s.calendarDate&&iso(s.sleepStartTimestampGMT)&&iso(s.sleepEndTimestampGMT));
for(const s of sleeps){const d=day(s.calendarDate);Object.assign(d,{sleepStart:iso(s.sleepStartTimestampGMT),sleepEnd:iso(s.sleepEndTimestampGMT),sleepStages:Object.fromEntries(['deep','rem','light','awake'].map(k=>[k,s[k+'SleepSeconds']/60])),sleepMinutes:(s.deepSleepSeconds+s.remSleepSeconds+s.lightSleepSeconds)/60,sleepScore:s.sleepScores?.overallScore,sleepRespiration:s.averageRespiration,sleepStress:s.avgSleepStress,sleepAwakenings:s.awakeCount,restlessMoments:s.restlessMomentCount,sleepScores:Object.fromEntries(['quality','duration','recovery','deep','rem','light','restfulness','interruptions'].map(k=>[k,s.sleepScores?.[k+'Score']]))});}
for(const r of json('TrainingReadinessDTO').sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp))))if(finite(r.score)&&r.score>=0&&r.score<=100){const d=day(r.calendarDate);Object.assign(d,{readiness:r.score,readinessObservedAt:iso(r.timestamp),acuteLoad:r.acuteLoad,readinessFactors:{sleep:r.sleepScoreFactorPercent,recovery:r.recoveryTimeFactorPercent,load:r.acwrFactorPercent,stress:r.stressHistoryFactorPercent,hrv:r.hrvFactorPercent,sleepHistory:r.sleepHistoryFactorPercent}});}
for(const r of json('TrainingHistory_').sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp))))if(r.trainingStatus&&r.trainingStatus!=='NO_STATUS')Object.assign(day(r.calendarDate),{trainingStatus:r.trainingStatus,readinessObservedAt:iso(r.timestamp)});
for(const r of json('MetricsAcuteTrainingLoad').sort((a,b)=>a.timestamp-b.timestamp)){const d=day(new Date(r.calendarDate).toISOString().slice(0,10));Object.assign(d,{acuteLoad:r.dailyTrainingLoadAcute,chronicLoad:r.dailyTrainingLoadChronic,loadRatio:r.dailyAcuteChronicWorkloadRatio,loadStatus:r.acwrStatus,readinessObservedAt:iso(r.timestamp)});}
for(const r of json('UDSFile'))if(r.calendarDate){const d=day(r.calendarDate),stress=r.allDayStress?.aggregatorList?.find(x=>x.type==='TOTAL');Object.assign(d,{steps:r.totalSteps,restingHr:r.restingHeartRate,stress:stress?.averageStressLevel,intensityMinutes:r.moderateIntensityMinutes+2*r.vigorousIntensityMinutes,bodyBattery:r.bodyBattery?.bodyBatteryStatList?.find(x=>x.bodyBatteryStatType==='MOSTRECENT')?.statsValue});}
let base;try{base=JSON.parse(await readFile(new URL('../.local/snapshot.json',import.meta.url),'utf8'));}catch{base={activities:[]};}
const summaries=json('summarizedActivities').flatMap(r=>r.summarizedActivitiesExport||[]),activities=summaries.map(r=>{const a=base.activities.find(a=>a.id==='garmin-'+r.activityId);return a?{...a,heartRateSamples:[],recordSamples:[]}:{id:'garmin-'+r.activityId,date:iso(r.startTimeGmt),durationSec:r.duration/1000,name:r.name,type:r.activityType==='running'?'Run':r.activityType.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),sportKey:r.activityType};});
const fits=unzipSync(zipped[Object.keys(zipped).find(k=>k.includes('UploadedFiles_0'))]);
let count=0;const hr=[],hrv=[],breathing=[],stress=[],levels=[];
function thin(points,key,bucket=300000){const buckets=new Map();for(const p of points)if(p.timestamp&&finite(p[key])){const k=Math.floor(Date.parse(p.timestamp)/bucket),group=buckets.get(k)||[];group.push(p);buckets.set(k,group);}const kept=[];for(const ps of buckets.values()){ps.sort((a,b)=>a[key]-b[key]);kept.push(ps[0],ps.at(-1));}return [...new Map(kept.map(p=>[p.timestamp,p])).values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));}
for(const bytes of Object.values(fits)){
 const {messages:m,errors}=new Decoder(Stream.fromByteArray(bytes)).read();if(errors.length)throw Error('A FIT file failed validation');count++;
 let tick;
 for(const r of m.monitoringMesgs||[]){if(r.timestamp)tick=(r.timestamp.getTime()-Utils.FIT_EPOCH_MS)/1000;else if(finite(r.timestamp16)&&finite(tick)){let next=Math.floor(tick/65536)*65536+r.timestamp16;if(next<tick)next+=65536;tick=next;}else continue;if(finite(r.heartRate)&&r.heartRate>0&&r.heartRate<300)hr.push({timestamp:new Date(tick*1000+Utils.FIT_EPOCH_MS).toISOString(),bpm:r.heartRate});}
 for(const r of m.hrvValueMesgs||[])if(r.timestamp&&r.value>0&&r.value<1000)hrv.push({timestamp:r.timestamp.toISOString(),value:r.value});
 for(const r of m.respirationRateMesgs||[])if(r.timestamp&&r.respirationRate>0&&r.respirationRate<100)breathing.push({timestamp:r.timestamp.toISOString(),value:r.respirationRate});
 for(const r of m.stressLevelMesgs||[])if(r.stressLevelTime&&r.stressLevelValue>=0&&r.stressLevelValue<=100)stress.push({timestamp:r.stressLevelTime.toISOString(),value:r.stressLevelValue});
 for(const r of m.sleepLevelMesgs||[])if(r.timestamp)levels.push({timestamp:r.timestamp.toISOString(),stage:r.sleepLevel});
 for(const r of m.skinTempOvernightMesgs||[])if(r.timestamp)Object.assign(day(dayOf(r.timestamp)),{skinTemperatureAbsolute:r.nightlyValue,skinTemperature:r.averageDeviation,skinObservedAt:r.timestamp.toISOString()});
 for(const r of m.hrvStatusSummaryMesgs||[])if(r.timestamp&&r.lastNightAverage>0)day(dayOf(r.timestamp)).hrv=r.lastNightAverage;
 for(const session of m.sessionMesgs||[]){const start=session.startTime?.toISOString(),a=activities.find(a=>a.date===start);if(!a)continue;const end=Date.parse(start)+session.totalElapsedTime*1000,records=(m.recordMesgs||[]).filter(r=>r.timestamp&&r.timestamp.getTime()>=Date.parse(start)&&r.timestamp.getTime()<=end);a.heartRateSamples=thin(records.filter(r=>r.heartRate>0&&r.heartRate<300).map(r=>({timestamp:r.timestamp.toISOString(),bpm:r.heartRate})),'bpm',60000);const byMinute=new Map();for(const r of records){const p={timestamp:r.timestamp.toISOString()};for(const [to,from]of [['speedMps','enhancedSpeed'],['cadence','cadence'],['distanceM','distance'],['power','power']])if(finite(r[from])&&r[from]>=0)p[to]=r[from];if(Object.keys(p).length>1)byMinute.set(Math.floor(r.timestamp.getTime()/60000),p);}a.recordSamples=[...byMinute.values()];if(!finite(a.distanceKm)&&finite(session.totalDistance))a.distanceKm=session.totalDistance/1000;if(!finite(a.calories))a.calories=session.totalCalories;}
}
const sortedLevels=[...new Map(levels.map(p=>[p.timestamp,p])).values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
const stressDays=new Map();for(const p of stress){const d=dayOf(p.timestamp);if(!stressDays.has(d))stressDays.set(d,[]);stressDays.get(d).push(p);}
for(const d of days.values()){
 if(d.sleepStart&&d.sleepEnd){const inside=p=>p.timestamp>=d.sleepStart&&p.timestamp<=d.sleepEnd;d.sleepHeartRate=thin(hr.filter(inside),'bpm');d.sleepHrv=thin(hrv.filter(inside),'value');d.sleepBreathing=thin(breathing.filter(inside),'value');const stages=sortedLevels.filter(inside);d.sleepTimeline=stages.map((p,i)=>({start:p.timestamp,end:stages[i+1]?.timestamp||d.sleepEnd,stage:p.stage})).filter(p=>p.start<p.end);}
 d.stressSeries=thin(stressDays.get(d.date)||[],'value',600000);
}
const payload=validateArchive({schemaVersion:1,source:'garmin-export',importedAt:new Date().toISOString(),fitFiles:count,days:[...days.values()].filter(d=>d.date<=dayOf(new Date())),activities});
await mkdir(new URL('../.local/',import.meta.url),{recursive:true});const data=JSON.stringify(payload);await writeFile(new URL('../.local/historical-import.json',import.meta.url),data,{mode:0o600});
console.log(JSON.stringify({fitFiles:count,days:payload.days.length,workouts:payload.activities.length,sleepTimelineNights:payload.days.filter(d=>d.sleepTimeline.length).length,workoutTraces:payload.activities.filter(a=>a.heartRateSamples.length).length,bytes:Buffer.byteLength(data)}));
