import {requestBody} from '../integration/request-body.mjs';
import {combineArchives} from '../integration/archive.mjs';
import {loadCloudState,readCloudState,writeCloudState} from '../integration/cloud-store.mjs';
import {refreshState,buildState} from '../integration/state.mjs';
import {validateGoals} from '../dist/data.js';
import {validateProfile} from '../dist/personalization.js';
import {sessionCookie,validSession,csrfFor,validMutation} from '../integration/web-security.mjs';
export const config={maxDuration:120};

// Every production route is protected by Vercel Authentication (all deployments).
// Preview environments have no Garmin credential and fail closed here.
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,body)=>res.status(status).json(body);
  const secret=process.env.APP_SESSION_SECRET,expectedOrigin=process.env.DASHBOARD_ORIGIN;
  if(process.env.PRIVATE_DASHBOARD_ENABLED!=='true'||!secret||!expectedOrigin)return send(503,{error:'Private dashboard is not configured'});
  const url=new URL(req.url,expectedOrigin),route=req.query?.route||url.searchParams.get('route')||url.pathname.split('/').at(-1).replace(/\.js$/,'');
  let session=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('cirqa_session='))?.slice(14);
  if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==expectedOrigin))return send(403,{error:'Origin denied'});
  if(route==='config'&&req.method==='GET'){
    if(!validSession(session,secret)){session=sessionCookie(secret);res.setHeader('Set-Cookie',`cirqa_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7776000`);}
    const config={mode:'live',apiBase:'/api/v1',requestTimeoutMs:120000,accountScope:'private-garmin',csrfToken:csrfFor(session,secret),cloudConnection:true};
    return res.status(200).setHeader('Content-Type','application/javascript').end('export const config=Object.freeze('+JSON.stringify(config)+');');
  }
  if(!validSession(session,secret))return send(401,{error:'Reload to restore your session'});
  if(req.method!=='GET'&&!validMutation({origin:req.headers.origin,expectedOrigin,fetchSite:req.headers['sec-fetch-site'],csrf:req.headers['x-csrf-token'],session,secret}))return send(403,{error:'Session token required'});
  try{
    const body=req.method==='GET'?null:await requestBody(req);
    const {state,etag}=await loadCloudState();
    if(req.method==='GET'&&['snapshot','goals','profile'].includes(route))return send(200,state[route]);
    if(req.method==='POST'&&route==='import'){
      const raw={...state.raw,archive:combineArchives(state.raw.archive,body)};
      const next=buildState(raw,state.goals,state.profile);
      try{await writeCloudState(next,etag);}catch(error){console.error('History persistence failed',error.constructor.name);return send(409,{error:'Data changed while importing. Please try again.'});}
      return send(200,{snapshot:next.snapshot});
    }
    if(req.method==='POST'&&route==='refresh'){
      const next=await refreshState(state,{reason:body?.reason==='check'?'check':'manual'});
      if(next!==state)try{await writeCloudState(next,etag);}catch{return send(200,{snapshot:(await readCloudState()).state.snapshot});}
      return send(200,{snapshot:next.snapshot});
    }
    if(req.method==='PUT'&&['goals','profile'].includes(route)){
      if(JSON.stringify(body).length>16000)return send(413,{error:'Request too large'});
      const value=route==='goals'?validateGoals(body):validateProfile(body);
      if(value.version!==state[route].version+1)return send(409,{error:'Reload the current settings'});
      const next=buildState(state.raw,route==='goals'?value:state.goals,route==='profile'?value:state.profile);
      try{await writeCloudState(next,etag);}catch(error){console.error('Settings persistence failed',error.constructor.name);return send(409,{error:'Settings changed. Reload before saving.'});}
      return send(200,value);
    }
    return send(404,{error:'Not found'});
  }catch(error){console.error('Private dashboard request failed',error.constructor.name);return send(503,{error:'Showing the latest saved information'});}
}
