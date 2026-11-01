import {createHash} from 'node:crypto';
import {collectGarmin} from './garmin.mjs';
import {normalizeGarmin,liveDefaultGoals} from './normalize.mjs';
import {personalFeedback,emptyProfile,validateProfile} from '../dist/personalization.js';
import {generateCoachFeedback} from './ai-feedback.mjs';

export function buildState(raw,goals=liveDefaultGoals,profile=emptyProfile){
  profile=validateProfile(profile);
  const snapshot=normalizeGarmin(raw,goals);
  snapshot.profile=profile;
  snapshot.recommendations=personalFeedback(snapshot,goals,profile);
  snapshot.coverage.aiConnected=false;
  return {schemaVersion:1,raw,goals,profile,snapshot,lastCheckedAt:new Date().toISOString()};
}
export function sourceFingerprint(raw){
  const {fetchedAt,errors,...records}=raw||{};
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
export async function refreshState(previous,{reason='manual',request=collectGarmin,now=Date.now()}={}){
  if(!previous?.snapshot)throw Error('Initialize private saved state first');
  if(reason==='check'&&now-Date.parse(previous.lastCheckedAt||0)<30*60000)return previous;
  try{
    const raw=await request(undefined,{previous:previous.raw,persist:false});
    if(sourceFingerprint(raw)===sourceFingerprint(previous.raw))return {...previous,lastCheckedAt:new Date(now).toISOString()};
    const next=buildState(raw,previous.goals,previous.profile);
    if(Date.parse(next.snapshot.dataThrough)<Date.parse(previous.snapshot.dataThrough))throw Error('Source regressed');
    try{const ai=await generateCoachFeedback(next);if(ai){next.snapshot.recommendations.unshift(ai);next.snapshot.coverage.aiConnected=true;}}catch{/* Calculated feedback remains available. */}
    return next;
  }catch{return {...previous,lastCheckedAt:new Date(now).toISOString()};}
}
