import {readFile,mkdir,writeFile} from 'node:fs/promises';
const BASE='https://personal.connectapi.garmin.com';
let accessToken,expiresAt=0;
async function token(){if(accessToken&&Date.now()<expiresAt)return accessToken;const env=await readFile(new URL('../.env.local',import.meta.url),'utf8');const key=env.match(/^GARMIN_PERSONAL_API_KEY=(.+)$/m)?.[1]?.trim();if(!key)throw Error('Garmin secret is missing');const response=await fetch(BASE+'/personalapitoken-service/personal-api/personal-api-key/token',{method:'POST',headers:{Authorization:'ApiKey '+key},signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok)throw Error('Garmin authentication HTTP '+response.status);accessToken=(await response.text()).trim();expiresAt=Date.now()+3600000;return accessToken;}
export async function garminGet(path){if(!path.startsWith('/')||path.startsWith('//'))throw Error('Invalid Garmin path');const response=await fetch(BASE+path,{headers:{Authorization:'Bearer '+await token()},signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok){if(response.status===401){accessToken=null;expiresAt=0;}throw Error('Garmin data HTTP '+response.status);}return response.status===204?null:response.json();}

const calendarDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
function sourceTime(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=1e11?value:null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value))return null;
  let iso=value.replace(' ','T');if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso))iso+='Z';
  const timestamp=Date.parse(iso);return Number.isFinite(timestamp)?timestamp:null;
}
function dateInZone(timestamp,timezone){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp)).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function windowStart(endDate){
  if(!calendarDate(endDate))throw Error('Invalid collection end date');
  return new Date(Date.parse(endDate)-27*86400000).toISOString().slice(0,10);
}

// Choose bounded reads from the actual sport mix, rather than assuming running
// or permanently hard-coding soccer. The current day is always requested.
export function selectHeartRateDates(activities,endDate,timezone='America/Panama'){
  const startDate=windowStart(endDate),sports=new Map(),seen=new Set();
  for(const activity of Array.isArray(activities)?activities:[]){
    const sport=activity?.activityType?.typeKey;
    const timestamp=sourceTime(activity?.startTimeGMT)??sourceTime(activity?.beginTimestamp);
    if(typeof sport!=='string'||!sport||timestamp==null)continue;
    const date=dateInZone(timestamp,timezone);
    if(date<startDate||date>endDate)continue;
    const identity=activity.activityId!=null?String(activity.activityId):`${sport}:${timestamp}`;
    if(seen.has(identity))continue;seen.add(identity);
    const entry=sports.get(sport)||{sport,count:0,latest:-Infinity,dates:new Set()};
    entry.count++;entry.latest=Math.max(entry.latest,timestamp);entry.dates.add(date);sports.set(sport,entry);
  }
  const dominant=[...sports.values()].sort((a,b)=>b.count-a.count||b.latest-a.latest||a.sport.localeCompare(b.sport))[0];
  const priorDates=dominant?[...dominant.dates].filter(date=>date!==endDate).sort().reverse().slice(0,2):[];
  return [endDate,...priorDates];
}

function hasRecordedHeartRate(payload){
  const descriptors=Array.isArray(payload?.heartRateValueDescriptors)?payload.heartRateValueDescriptors:[];
  const timeIndex=descriptors.find(item=>item?.key==='timestamp')?.index;
  const valueIndex=descriptors.find(item=>item?.key==='heartrate')?.index;
  if(!Number.isInteger(timeIndex)||!Number.isInteger(valueIndex)||timeIndex<0||valueIndex<0)return false;
  return Array.isArray(payload?.heartRateValues)&&payload.heartRateValues.some(row=>Array.isArray(row)&&sourceTime(row[timeIndex])!=null&&Number.isFinite(row[valueIndex])&&row[valueIndex]>=1&&row[valueIndex]<=300);
}

// Injectable request keeps preservation/selection tests independent of account
// credentials, filesystem caches, and network access.
export async function collectHeartRateDays({activities,endDate,previous=[],request=garminGet,timezone='America/Panama'}){
  const startDate=windowStart(endDate),retained=new Map(),errors={};
  for(const payload of Array.isArray(previous)?previous:[]){
    if(calendarDate(payload?.calendarDate)&&payload.calendarDate>=startDate&&payload.calendarDate<=endDate&&hasRecordedHeartRate(payload))retained.set(payload.calendarDate,payload);
  }
  const requestedDates=selectHeartRateDates(activities,endDate,timezone);
  for(const date of requestedDates){
    try{
      const next=await request('/wellness-service/wellness/dailyHeartRate?date='+date);
      if(next==null||!hasRecordedHeartRate(next))continue;
      if(next.calendarDate!==date)throw Error('Heart-rate response date mismatch');
      retained.set(date,next);
    }catch(error){errors['heartRate:'+date]=error instanceof Error?error.message:'Heart-rate request failed';}
  }
  return {days:[...retained.values()].sort((a,b)=>a.calendarDate.localeCompare(b.calendarDate)),errors,requestedDates};
}

export async function collectGarmin(endDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama'}).format(new Date())){
  const from=new Date(endDate+'T12:00:00Z');from.setUTCDate(from.getUTCDate()-27);const startDate=from.toISOString().slice(0,10);
  const endpoints={daily:`/usersummary-service/v2/dailysummaries?startDate=${startDate}&endDate=${endDate}`,sleep:`/sleep-service/sleep/dailySleep?date=${endDate}`,sleepHistory:`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${startDate}&endDate=${endDate}`,hrv:`/hrv-service/hrv/${endDate}`,hrvHistory:`/hrv-service/hrv/daily/${startDate}/${endDate}`,activities:`/activitylist-service/activities/search/activities?start=0&limit=100&startDate=${startDate}&endDate=${endDate}`,zones:'/biometric-service/heartRateZones/v2',autoActivities:`/wellnessactivity-service/activity/summary/range/${startDate}/${endDate}`};
  let previous={};try{previous=JSON.parse(await readFile(new URL('../.local/garmin-raw.json',import.meta.url),'utf8'));}catch{}
  const result={fetchedAt:new Date().toISOString(),startDate,endDate,errors:{}};
  for(const[name,path]of Object.entries(endpoints)){
    try{
      let next=await garminGet(path);
      if(name==='activities'&&Array.isArray(next)&&next.length===100){let offset=100;while(offset<=1000){const page=await garminGet(path.replace('start=0','start='+offset));if(!Array.isArray(page))throw Error('Invalid activities page');next.push(...page);if(page.length<100)break;offset+=100;}if(offset>1000)throw Error('Activity pagination limit reached');}
      const empty=next==null||(Array.isArray(next)&&next.length===0)||(name==='daily'&&!next.data?.length)||(name==='hrv'&&!next.hrvSummary);
      result[name]=empty&&previous[name]!=null?previous[name]:next;
    }catch(e){result.errors[name]=e.message;if(previous[name]!=null)result[name]=previous[name];}
  }
  if(!result.daily?.data?.length)throw Error('Daily data not available; saved snapshot retained');
  const heartRate=await collectHeartRateDays({activities:result.activities,endDate,previous:previous.heartRateDays});
  result.heartRateDays=heartRate.days;Object.assign(result.errors,heartRate.errors);
  await mkdir(new URL('../.local/',import.meta.url),{recursive:true});await writeFile(new URL('../.local/garmin-raw.json',import.meta.url),JSON.stringify(result,null,2),{mode:0o600});return result;
}
