import {analyzeDay} from './analytics.js';

export const emptyProfile={version:1,displayName:'',age:null,heightCm:null,weightKg:null,preferredSport:'',sleepTargetHours:null};
export function validateProfile(p){
  if(!p||!Number.isInteger(p.version)||p.version<1)throw Error('Invalid profile');
  for(const [key,min,max] of [['age',13,100],['heightCm',100,240],['weightKg',25,250],['sleepTargetHours',6,12]])if(p[key]!=null&&(!Number.isFinite(p[key])||p[key]<min||p[key]>max))throw Error('Invalid '+key);
  if(typeof p.displayName!=='string'||p.displayName.length>40||typeof p.preferredSport!=='string'||p.preferredSport.length>40)throw Error('Invalid profile text');
  return Object.fromEntries(Object.keys(emptyProfile).map(k=>[k,p[k]??emptyProfile[k]]));
}
export function personalFeedback(snapshot,goals,profile=emptyProfile,date){
  if(!snapshot)return [];
  const day=analyzeDay(snapshot,goals,date),rows=[];
  const add=(id,title,body,action,evidence=[])=>rows.push({id:'personal-'+id,title,body,action,evidence,source:'calculated-feedback',confidence:'descriptive'});
  if(profile.age!=null&&profile.age<18){
    const hours=day.sleep.durationMinutes==null?null:day.sleep.durationMinutes/60;
    add('sleep','Make recovery part of your training',`At ${profile.age}, the general sleep recommendation is 8–10 hours per night.${hours==null?'':` Your selected night recorded ${hours.toFixed(1)} hours.`} Your plan targets ${goals.sleepHours} hours.`,hours!=null&&hours<8?'Protect an earlier bedtime and discuss a lighter session with your coach if you feel tired.':'Keep a consistent sleep schedule and plan hard sessions with your coach.',['sleepMinutes']);
  }
  const c=day.featuredComparison;
  if(c?.previous){
    const d=c.deltas,a=c.currentStats,b=c.previousStats;
    const rate=n=>n==null?'not recorded':n.toFixed(1);
    add('workout',`${c.current.type}: understand the change`,`${rate(a.durationMinutes)} vs ${rate(b.durationMinutes)} minutes; average heart rate ${rate(a.avgHr)} vs ${rate(b.avgHr)} bpm.${d.loadPer60Pct==null?'':` Workload per hour changed ${d.loadPer60Pct>0?'+':''}${d.loadPer60Pct.toFixed(1)}%.`} More workload describes effort, not better match performance.`,c.matched.count?'Use your similar-length sessions to compare progress, and record how hard each one felt.':'Repeat a similar session duration and purpose before judging fitness changes.');
  }
  const baseline=day.health.metrics.hrv;
  if(baseline?.sufficient&&baseline.value!=null)add('baseline','Your recovery trend, in context',`HRV is ${baseline.value} ms versus your earlier median of ${baseline.baseline} ms across ${baseline.count} nights. A single reading cannot decide whether you are ready for intense exercise.`, 'Read this alongside sleep, soreness, illness, and how you feel.',['hrv']);
  return rows;
}
