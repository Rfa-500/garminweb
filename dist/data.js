export const defaultGoals = { version: 1, targetKind: 'session-duration', weeklyIntensityMinutes: 150, primary: 'Improve soccer endurance', targetMinutes: 75, workoutsPerWeek: 4, sleepHours: 8, weeklyDistanceKm: 15 };
const observedAt = '2026-10-31T13:40:00Z';
const m = (value, unit) => ({ value, unit, status: 'available', source: 'demo', observedAt });

// Entirely fictional fixtures. These values never come from a connected account.
const demoDays = {
  readiness: [58,62,71,65,76,71,67,72,69,81,76,64,68,74,79,73,68,72,80,77,69,64,72,68,84,73,78,82],
  sleepScore: [74,78,70,76,82,75,81,77,80,84,79,72,78,80,85,83,77,82,87,80,76,78,82,77,88,81,84,86],
  sleepMinutes: [416,438,402,429,456,421,448,432,451,469,442,411,437,453,472,461,430,455,480,444,426,439,458,428,477,449,465,462],
  awakeMinutes: [25,22,31,24,18,27,20,26,22,17,23,30,24,20,19,21,28,22,16,25,28,24,20,26,17,23,21,18],
  wakeMinutes: [397,405,385,401,396,409,391,399,403,394,400,412,398,392,406,395,411,399,390,403,408,397,401,410,395,404,400,398],
  hrv: [49,52,54,51,58,55,53,57,55,60,58,50,54,57,61,58,53,56,62,59,54,52,58,55,65,59,62,64],
  restingHr: [58,57,57,58,55,56,57,55,56,54,55,59,57,55,54,55,57,56,53,54,56,58,55,56,52,54,53,52],
  respiration: [14.7,14.5,14.6,14.8,14.3,14.5,14.6,14.4,14.5,14.2,14.4,14.9,14.6,14.4,14.3,14.4,14.7,14.5,14.2,14.3,14.6,14.8,14.4,14.6,14.1,14.3,14.2,14.2],
  stress: [35,31,36,32,26,33,29,30,28,23,27,38,31,27,22,25,33,28,21,27,34,36,28,32,20,26,25,24],
  bodyBattery: [57,62,60,64,73,65,68,71,69,78,72,55,63,70,80,74,64,72,83,73,62,59,74,66,86,75,77,78],
  intensityMinutes: [12,20,80,15,22,10,18,24,86,12,34,18,26,15,88,10,30,22,18,14,84,18,32,30,20,28,88,42],
  distanceKm: [3.5,5,0,0,7,0,4,5,0,4,6,0,0,5,4,0,0,6,4,0,5.1,5,0,6.5,0,3.5,0,5.2]
};
const demoHistory = Array.from({ length: 28 }, (_, i) => {
  const date = `2026-10-${String(i + 4).padStart(2, '0')}`;
  const wake = demoDays.wakeMinutes[i];
  const sleepEnd = `${date}T${String(Math.floor(wake / 60)).padStart(2, '0')}:${String(wake % 60).padStart(2, '0')}:00-05:00`;
  const sleepMinutes = demoDays.sleepMinutes[i], awake = demoDays.awakeMinutes[i];
  const deep = i === 27 ? 96 : Math.round(sleepMinutes * (0.18 + (i % 4) * 0.01));
  const rem = i === 27 ? 112 : Math.round(sleepMinutes * (0.21 + (i % 3) * 0.01));
  return {
    date, source: 'demo', observedAt: `${date}T08:40:00-05:00`,
    ...Object.fromEntries(Object.entries(demoDays).filter(([key]) => !['awakeMinutes', 'wakeMinutes'].includes(key)).map(([key, values]) => [key, values[i]])),
    hrvBaselineLow: 48, hrvBaselineHigh: 67, hrvStatus: 'Balanced', hrvObservedAt: sleepEnd,
    sleepStart: new Date(Date.parse(sleepEnd) - (sleepMinutes + awake) * 60000).toISOString(),
    sleepEnd, sleepObservedAt: sleepEnd, sleepStages: { deep, rem, light: sleepMinutes - deep - rem, awake },
    steps: i === 27 ? 8432 : 6100 + (i * 739) % 6500,
    calories: i === 27 ? 2240 : 1950 + (i * 91) % 700
  };
});
const demoSoccer = [
  { day: 30, name: 'Small-sided soccer', minutes: 72, avgHr: 150, maxHr: 183, zones: [5,17,24,22,4], aerobic: 3.8, anaerobic: 2.6, load: 162, calories: 648, effort: 7 },
  { day: 24, name: 'Soccer conditioning', minutes: 68, avgHr: 146, maxHr: 179, zones: [7,21,23,15,2], aerobic: 3.4, anaerobic: 2.1, load: 133, calories: 594, effort: 6 },
  { day: 18, name: 'Evening soccer', minutes: 70, avgHr: 147, maxHr: 181, zones: [8,20,25,15,2], aerobic: 3.5, anaerobic: 2.0, load: 139, calories: 612, effort: 6 },
  { day: 12, name: 'Small-sided soccer', minutes: 65, avgHr: 143, maxHr: 176, zones: [8,20,25,11,1], aerobic: 3.1, anaerobic: 1.7, load: 116, calories: 552, effort: 6 },
  { day: 6, name: 'Soccer practice', minutes: 64, avgHr: 145, maxHr: 178, zones: [7,20,24,12,1], aerobic: 3.2, anaerobic: 1.8, load: 121, calories: 563, effort: 6 }
].map(({ day, name, minutes, aerobic, anaerobic, load, ...stats }) => {
  const date = `2026-10-${String(day).padStart(2, '0')}T17:30:00-05:00`;
  return {
    id: `demo-soccer-10${String(day).padStart(2, '0')}`, name, type: 'Soccer', sportKey: 'soccer', date,
    endAt: new Date(Date.parse(date) + minutes * 60000).toISOString(), durationSec: minutes * 60,
    ...stats, aerobicTrainingEffect: aerobic, anaerobicTrainingEffect: anaerobic, activityTrainingLoad: load,
    distanceKm: null, elevationM: null, benefit: 'Aerobic conditioning', splits: [], source: 'demo'
  };
});
export const demoSnapshot = {
  schemaVersion: 1, mode: 'demo', id: 'demo-2026-10-31', generatedAt: '2026-10-31T13:42:00Z', dataThrough: observedAt,
  timezone: 'America/Panama', goalsVersion: 1, device: { model: 'Garmin CIRQA', lastSyncAt: observedAt },
  metrics: {
    readiness: m(82, '/100'), sleepMinutes: m(462, 'min'), sleepScore: m(86, '/100'), intensityMinutes: m(42, 'min'),
    hrv: m(64, 'ms'), restingHr: m(52, 'bpm'), bodyBattery: m(78, '/100'), stress: m(24, '/100'),
    respiration: m(14.2, 'brpm'), pulseOx: m(98, '%'), skinTemperature: m(0.2, '°C from baseline'),
    steps: m(8432, 'steps'), calories: m(2240, 'kcal'), vo2max: m(48, 'ml/kg/min'), recoveryHours: m(18, 'h'),
    hrvStatus: m('Balanced', ''), trainingStatus: m('Productive', ''), napMinutes: m(0, 'min'),
    sleepNeedMinutes: m(480, 'min'), workoutBenefit: m('Base', ''), heartRate: m(68, 'bpm'),
    weeklyIntensityMinutes: m(demoHistory.slice(-6).reduce((sum, day) => sum + day.intensityMinutes, 0), 'min')
  },
  sleep: { start: '2026-10-30T22:38:00-05:00', end: '2026-10-31T06:38:00-05:00', stages: { deep: 96, rem: 112, light: 254, awake: 18 } },
  history: demoHistory,
  activities: [
    ...demoSoccer,
    { id: 'run-1031', name: 'Morning run', type: 'Run', date: '2026-10-31T07:05:00-05:00', distanceKm: 5.2, durationSec: 1747, avgHr: 142, elevationM: 18, effort: 4, benefit: 'Base', splits: [340,339,333,331,337], zones: [3,19,6,1.1,0], source: 'demo' },
    { id: 'run-1029', name: 'Easy miles', type: 'Run', date: '2026-10-29T06:52:00-05:00', distanceKm: 3.5, durationSec: 1204, avgHr: 140, elevationM: 12, effort: 3, benefit: 'Recovery', splits: [348,342,342], zones: [4,13,3,0,0], source: 'demo' },
    { id: 'run-1027', name: 'Steady morning run', type: 'Run', date: '2026-10-27T07:10:00-05:00', distanceKm: 6.5, durationSec: 2256, avgHr: 145, elevationM: 24, effort: 5, benefit: 'Base', splits: [350,347,350,345,342,348], zones: [3,22,10,2.6,0], source: 'demo' },
    { id: 'run-1024', name: 'Morning run', type: 'Run', date: '2026-10-24T07:08:00-05:00', distanceKm: 5.1, durationSec: 1770, avgHr: 148, elevationM: 21, effort: 5, benefit: 'Base', splits: [353,349,346,345,342], zones: [2,15,10,2.5,0], source: 'demo' },
    { id: 'strength-1028', name: 'Full body strength', type: 'Strength', date: '2026-10-28T17:00:00-05:00', distanceKm: null, durationSec: 2520, avgHr: 118, elevationM: null, effort: 6, benefit: 'Strength', splits: [], zones: [15,18,7,2,0], source: 'demo' }
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
  recommendations: [],
  capabilities: { cycleTracking: 'opt-in', pregnancyTracking: 'opt-in', naturalCycles: 'companion-app', liveTrack: 'companion-app', connectedGps: 'phone-required' }
};
export function demoRecommendations(goals) {
  return [
    { id: 'demo-coach', title: 'Make the next session count.', body: `In this fictional example, the latest soccer session spent 36.1% of its time in zones 4–5, compared with 25% previously. Use a similar session length and purpose to track your “${goals.primary}” goal.`, action: 'Compare like-for-like sessions', evidence: ['readiness', 'hrv', 'sleepMinutes'], source: 'demo-rule', confidence: 'illustrative' },
    { id: 'demo-sleep', title: 'Protect your sleep window.', body: `Demo sleep was 7h 42m against your ${goals.sleepHours}h target. Plan a consistent sleep window alongside your goal of ${goals.workoutsPerWeek} sessions a week.`, action: 'Keep bedtime consistent', evidence: ['sleepMinutes'], source: 'demo-rule', confidence: 'illustrative' }
  ];
}
demoSnapshot.recommendations = demoRecommendations(defaultGoals);
export function validateGoals(g){if(!g||typeof g.primary!=='string'||!g.primary.trim()||g.primary.length>80||!Number.isInteger(g.version)||g.version<1)throw Error('Invalid goal');for(const[k,min,max]of[['targetMinutes',10,120],['workoutsPerWeek',1,14],['sleepHours',4,12],['weeklyDistanceKm',1,200]])if(!Number.isFinite(g[k])||g[k]<min||g[k]>max)throw Error('Invalid '+k);if(!Number.isInteger(g.workoutsPerWeek))throw Error('Workout target must be a whole number');if(g.targetKind!=null&&!['5k-time','session-duration'].includes(g.targetKind))throw Error('Invalid time target kind');if(g.weeklyIntensityMinutes!=null&&(!Number.isInteger(g.weeklyIntensityMinutes)||g.weeklyIntensityMinutes<1||g.weeklyIntensityMinutes>3000))throw Error('Invalid intensity target');return g;}
export function validateSnapshot(s){
  const fail=message=>{throw Error(message);};
  const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!s||s.schemaVersion!==1||!['demo','live'].includes(s.mode)||typeof s.id!=='string'||!s.id||!date(s.generatedAt)||!date(s.dataThrough)||Date.parse(s.dataThrough)>Date.parse(s.generatedAt)||!Number.isInteger(s.goalsVersion)||s.goalsVersion<1||!s.metrics||Array.isArray(s.metrics)||!Array.isArray(s.history)||!Array.isArray(s.activities)||!Array.isArray(s.recommendations))fail('Invalid snapshot');
  if(typeof s.timezone!=='string')fail('Invalid time zone');
  try{new Intl.DateTimeFormat('en',{timeZone:s.timezone}).format();}catch{fail('Invalid time zone');}
  if(!s.device||typeof s.device.model!=='string'||(s.device.lastSyncAt!=null&&(!date(s.device.lastSyncAt)||Date.parse(s.device.lastSyncAt)>Date.parse(s.dataThrough))))fail('Invalid device');
  const ranges={readiness:[0,100],sleepScore:[0,100],bodyBattery:[0,100],stress:[0,100],pulseOx:[0,100],sleepMinutes:[0,1440],sleepNeedMinutes:[0,1440],napMinutes:[0,1440],hrv:[0,1000],restingHr:[1,300],heartRate:[1,300],respiration:[0,100],skinTemperature:[-15,15],skinTemperatureAbsolute:[20,45],steps:[0,200000],calories:[0,30000],vo2max:[0,150],recoveryHours:[0,336],intensityMinutes:[0,2880],weeklyIntensityMinutes:[0,20160]};
  for(const [key,v] of Object.entries(s.metrics)){
    if(!v||!['available','unavailable','not-authorized','unsupported'].includes(v.status)||typeof v.unit!=='string')fail('Invalid metric');
    if(v.status!=='available'){if(v.value!=null)fail('Unavailable metric must have null value');continue;}
    if(v.value==null||!['number','string'].includes(typeof v.value)||(typeof v.value==='number'&&!Number.isFinite(v.value))||!date(v.observedAt)||Date.parse(v.observedAt)>Date.parse(s.dataThrough)||typeof v.source!=='string'||!v.source||(s.mode==='live'&&v.source.startsWith('demo')))fail('Invalid metric value');
    if(ranges[key]&&!number(v.value,...ranges[key]))fail('Metric out of range');
  }
  const ids=new Set();
  const samples=(points,start=null,end=s.dataThrough)=>{if(!Array.isArray(points))fail('Invalid heart-rate samples');let previous=-Infinity;for(const point of points){const time=Date.parse(point?.timestamp);if(!date(point?.timestamp)||!number(point?.bpm,1,300)||time<=previous||time>Date.parse(end)||(start!=null&&time<Date.parse(start)))fail('Invalid heart-rate sample');previous=time;}};
  for(const a of s.activities){
    if(typeof a.id!=='string'||!a.id||ids.has(a.id)||!date(a.date)||Date.parse(a.date)>Date.parse(s.dataThrough)||typeof a.name!=='string'||typeof a.type!=='string'||typeof a.benefit!=='string'||!number(a.durationSec,1,604800)||!Array.isArray(a.splits)||!Array.isArray(a.zones)||typeof a.source!=='string'||(s.mode==='live'&&a.source.startsWith('demo')))fail('Invalid activity');
    ids.add(a.id);
    for(const [k,min,max]of[['distanceKm',0,10000],['avgHr',1,300],['maxHr',1,300],['calories',0,30000],['bodyBatteryImpact',-100,100],['aerobicTrainingEffect',0,5],['anaerobicTrainingEffect',0,5],['activityTrainingLoad',0,10000],['vo2max',1,150],['elevationM',0,50000],['effort',0,10]])if(a[k]!=null&&!number(a[k],min,max))fail('Invalid activity measurement');
    if(a.endAt!=null&&(!date(a.endAt)||Date.parse(a.endAt)<Date.parse(a.date)||Date.parse(a.endAt)>Date.parse(s.dataThrough)))fail('Invalid activity end');
    if(a.heartRateSamples!=null)samples(a.heartRateSamples,a.date,a.endAt||s.dataThrough);
    if(a.splits.some(v=>!number(v,1,36000))||a.zones.length>5||a.zones.some(v=>!number(v,0,a.durationSec/60+1)))fail('Invalid activity detail');
  }
  const historyRanges={readiness:[0,100],bodyBattery:[0,100],bodyBatteryHigh:[0,100],bodyBatteryLow:[0,100],bodyBatteryCharged:[0,1000],bodyBatteryDrained:[0,1000],sleepScore:[0,100],intensityMinutes:[0,2880],moderateIntensityMinutes:[0,1440],vigorousIntensityMinutes:[0,1440],distanceKm:[0,10000],restingHr:[1,300],hrv:[0,1000],hrvBaselineLow:[0,1000],hrvBaselineHigh:[0,1000],sleepMinutes:[0,1440],stress:[0,100],respiration:[0,100],steps:[0,200000],calories:[0,30000]};
  for(const h of s.history){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(h.date)||!date(h.date)||Date.parse(h.date)>Date.parse(s.dataThrough)||Object.entries(historyRanges).some(([k,limits])=>h[k]!=null&&!number(h[k],...limits)))fail('Invalid history');
    for(const key of ['observedAt','sleepObservedAt','hrvObservedAt','sleepStart','sleepEnd'])if(h[key]!=null&&(!date(h[key])||Date.parse(h[key])>Date.parse(s.dataThrough)))fail('Invalid history timestamp');
    if(h.sleepStart!=null&&h.sleepEnd!=null&&Date.parse(h.sleepStart)>=Date.parse(h.sleepEnd))fail('Invalid history sleep window');
    if(h.hrvStatus!=null&&typeof h.hrvStatus!=='string')fail('Invalid historical HRV status');
    if(h.sleepStages!=null){if(!h.sleepStart||!h.sleepEnd||['deep','rem','light','awake'].some(k=>!number(h.sleepStages[k],0,1440)))fail('Invalid historical sleep stages');const total=['deep','rem','light','awake'].reduce((sum,k)=>sum+h.sleepStages[k],0);if(Math.abs(total-(Date.parse(h.sleepEnd)-Date.parse(h.sleepStart))/60000)>2)fail('Historical sleep stages do not match duration');}
  }
  if(s.heartRateSeries!=null)samples(s.heartRateSeries);
  if(s.sleep!=null){const sl=s.sleep;if(!date(sl.start)||!date(sl.end)||Date.parse(sl.start)>=Date.parse(sl.end)||Date.parse(sl.end)>Date.parse(s.dataThrough)||!sl.stages||['deep','rem','light','awake'].some(k=>!number(sl.stages[k],0,1440)))fail('Invalid sleep');const total=Object.values(sl.stages).reduce((a,b)=>a+b,0);if(Math.abs(total-(Date.parse(sl.end)-Date.parse(sl.start))/60000)>2)fail('Sleep stages do not match duration');}
  for(const r of s.recommendations)if(typeof r.id!=='string'||typeof r.title!=='string'||typeof r.body!=='string'||typeof r.action!=='string'||!Array.isArray(r.evidence)||r.evidence.some(k=>typeof k!=='string'||!s.metrics[k])||typeof r.source!=='string'||(s.mode==='live'&&r.source.startsWith('demo')))fail('Invalid recommendation');
  return s;
}
