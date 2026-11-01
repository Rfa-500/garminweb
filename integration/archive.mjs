const list=v=>Array.isArray(v)?v:[];
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const metricKeys=['readiness','skinTemperatureAbsolute','skinTemperature','acuteLoad','chronicLoad','loadRatio','sleepScore','sleepMinutes','sleepRespiration','sleepStress','sleepAwakenings','restlessMoments','hrv','restingHr','steps','stress','intensityMinutes','bodyBattery','trainingStatus','loadStatus'];
const numericRecord=(r,keys)=>Object.fromEntries(keys.filter(k=>numeric(r?.[k])).map(k=>[k,r[k]]));
export function validateArchive(input){
 if(input?.schemaVersion!==1||input?.source!=='garmin-export')throw Error('This is not a prepared Garmin history import');
 if(list(input.days).length>3660||list(input.activities).length>10000)throw Error('History import is too large');
 const points=(rows,key,min,max)=>list(rows).filter(p=>validTime(p.timestamp)&&numeric(p[key])&&p[key]>=min&&p[key]<=max).map(p=>({timestamp:new Date(p.timestamp).toISOString(),[key]:p[key]})).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
 const days=list(input.days).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)).map(d=>{
  const row={date:d.date,...numericRecord(d,metricKeys)};
  for(const key of ['trainingStatus','loadStatus'])if(typeof d[key]==='string'&&/^[A-Z_]{1,50}$/.test(d[key]))row[key]=d[key];
  for(const key of ['sleepStart','sleepEnd','readinessObservedAt','skinObservedAt'])if(validTime(d[key]))row[key]=new Date(d[key]).toISOString();
  if(d.sleepStages&&['deep','light','rem','awake'].every(k=>numeric(d.sleepStages[k])&&d.sleepStages[k]>=0&&d.sleepStages[k]<1440))row.sleepStages=numericRecord(d.sleepStages,['deep','light','rem','awake']);
  row.sleepTimeline=list(d.sleepTimeline).filter(p=>validTime(p.start)&&validTime(p.end)&&p.start<p.end&&['light','deep','rem','awake','unmeasurable'].includes(p.stage)).map(p=>({start:p.start,end:p.end,stage:p.stage}));
  row.sleepScores=numericRecord(d.sleepScores,['quality','duration','recovery','deep','rem','light','restfulness','interruptions']);
  row.readinessFactors=numericRecord(d.readinessFactors,['sleep','recovery','load','stress','hrv','sleepHistory']);
  row.sleepHeartRate=points(d.sleepHeartRate,'bpm',1,300);
  row.sleepHrv=points(d.sleepHrv,'value',1,1000);
  row.sleepBreathing=points(d.sleepBreathing,'value',1,100);
  row.stressSeries=points(d.stressSeries,'value',0,100);
  return row;
 });
 const activities=list(input.activities).filter(a=>typeof a.id==='string'&&validTime(a.date)).map(a=>({id:a.id.slice(0,100),date:new Date(a.date).toISOString(),heartRateSamples:points(a.heartRateSamples,'bpm',1,300),recordSamples:list(a.recordSamples).filter(p=>validTime(p.timestamp)).map(p=>({timestamp:p.timestamp,...numericRecord(p,['speedMps','cadence','distanceM','power'])})),...numericRecord(a,['durationSec','avgHr','maxHr','distanceKm','calories','aerobicTrainingEffect','anaerobicTrainingEffect','activityTrainingLoad']),name:String(a.name||'Activity').slice(0,160),type:String(a.type||'Activity').slice(0,40),sportKey:String(a.sportKey||'').slice(0,40)}));
 return {schemaVersion:1,source:'garmin-export',importedAt:validTime(input.importedAt)?input.importedAt:new Date().toISOString(),fitFiles:Math.max(0,Math.min(100000,Number(input.fitFiles)||0)),days,activities};
}
export function mergeArchive(snapshot,input){
 if(!input)return snapshot;
 const archive=validateArchive(input),rows=new Map(snapshot.history.map(r=>[r.date,r]));
 const observed=archive.days.flatMap(d=>[d.sleepEnd,d.readinessObservedAt,d.skinObservedAt]).filter(t=>validTime(t)&&t<=snapshot.generatedAt).sort().at(-1);if(observed&&observed>snapshot.dataThrough)snapshot.dataThrough=observed;
 for(const day of archive.days){const live=rows.get(day.date)||{date:day.date};const merged={...day,...Object.fromEntries(Object.entries(live).filter(([,v])=>v!==null&&v!==undefined))};for(const k of ['sleepTimeline','sleepScores','readinessFactors','sleepHeartRate','sleepHrv','sleepBreathing','stressSeries'])merged[k]=day[k];rows.set(day.date,merged);}
 snapshot.history=[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
 for(const imported of archive.activities){let a=snapshot.activities.find(a=>a.id===imported.id||a.date===imported.date);if(!a){a={...imported,source:'garmin-export',zones:[],splits:[],benefit:'Not provided',endAt:imported.durationSec?new Date(Date.parse(imported.date)+imported.durationSec*1000).toISOString():null};snapshot.activities.push(a);}if(imported.heartRateSamples.length){a.heartRateSamples=imported.heartRateSamples;a.heartRateSource='garmin-fit-export';}a.recordSamples=imported.recordSamples;}
 snapshot.activities.sort((a,b)=>b.date.localeCompare(a.date));
 const spec={readiness:['score','readinessObservedAt'],trainingStatus:['status','readinessObservedAt'],skinTemperatureAbsolute:['°C','skinObservedAt'],skinTemperature:['°C','skinObservedAt'],acuteLoad:['load','readinessObservedAt'],chronicLoad:['load','readinessObservedAt'],loadRatio:['ratio','readinessObservedAt']};
 for(const [key,[unit,timeKey]]of Object.entries(spec)){const d=archive.days.filter(d=>d[key]!=null&&validTime(d[timeKey])&&d[timeKey]<=snapshot.generatedAt).sort((a,b)=>a[timeKey].localeCompare(b[timeKey])).at(-1);if(d&&snapshot.metrics[key]?.status!=='available')snapshot.metrics[key]={value:d[key],unit,status:'available',source:'garmin-export',observedAt:d[timeKey]};}
 snapshot.coverage={...snapshot.coverage,archiveImportedAt:archive.importedAt,archiveFitFiles:archive.fitFiles,archiveDays:archive.days.length,archiveWorkouts:archive.activities.length,activityCount:snapshot.activities.length,sleepTimelineNights:archive.days.filter(d=>d.sleepTimeline.length).length,workoutTraceCount:snapshot.activities.filter(a=>a.heartRateSamples?.length).length,documentedUnavailable:(snapshot.coverage.documentedUnavailable||[]).filter(k=>snapshot.metrics[k]?.status!=='available')};
 return snapshot;
}
export function combineArchives(previous,incoming){
 const next=validateArchive(incoming);if(!previous)return next;
 const old=validateArchive(previous),merge=(a,b,key)=>[...new Map([...a,...b].map(r=>[r[key],r])).values()];
 return {...next,days:merge(old.days,next.days,'date'),activities:merge(old.activities,next.activities,'id'),fitFiles:Math.max(old.fitFiles,next.fitFiles)};
}
