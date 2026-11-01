import http from 'node:http';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {validateGoals} from './dist/data.js';
import {validateProfile,emptyProfile} from './dist/personalization.js';
import {buildState,refreshState} from './integration/state.mjs';
const root=path.resolve('dist'),privateRoot=path.resolve('.local'),origin='http://127.0.0.1:4173';
const csrf=randomBytes(32).toString('hex');
const demoOnly=process.argv.includes('--demo');
const defaults={version:1,primary:'Build consistent fitness',targetMinutes:30,targetKind:'session-duration',workoutsPerWeek:4,sleepHours:8,weeklyDistanceKm:25,weeklyIntensityMinutes:150};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.md':'text/markdown; charset=utf-8'};
let refreshJob;
async function privateJson(name,fallback=null){try{return JSON.parse(await readFile(path.join(privateRoot,name),'utf8'));}catch{return fallback;}}
async function atomic(name,value){await mkdir(privateRoot,{recursive:true});const tmp=path.join(privateRoot,name+'.tmp');await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await rename(tmp,path.join(privateRoot,name));}
async function payload(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>16000)throw Error('Request too large');}return JSON.parse(text);}
function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(body));}
http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(req.headers.host!=='127.0.0.1:4173'||(req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site'){send(res,403,{error:'Origin denied'});return;}
  try{
    const url=new URL(req.url,origin),pathname=decodeURIComponent(url.pathname);
    const local=demoOnly?null:await privateJson('snapshot.json');
    if(pathname==='/config.js'&&local){const accountScope=createHash('sha256').update(privateRoot).digest('hex').slice(0,16);res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'}).end('export const config=Object.freeze('+JSON.stringify({mode:'live',apiBase:'/api/v1',requestTimeoutMs:60000,accountScope,csrfToken:csrf,localConnection:true})+');');return;}
    if(pathname.startsWith('/api/')){
      if(!local){send(res,404,{error:'Local Garmin connection is not initialized'});return;}
      if(req.method!=='GET'&&req.headers['x-csrf-token']!==csrf){send(res,403,{error:'Session token required'});return;}
      if(pathname==='/api/v1/snapshot'&&req.method==='GET'){send(res,200,local);return;}
      if(pathname==='/api/v1/profile'&&req.method==='GET'){send(res,200,await privateJson('profile.json',emptyProfile));return;}
      if(pathname==='/api/v1/profile'&&req.method==='PUT'){const current=await privateJson('profile.json',emptyProfile);const next=validateProfile(await payload(req));if(next.version!==current.version+1){send(res,409,{error:'Reload current profile'});return;}await atomic('profile.json',next);send(res,200,next);return;}
      if(pathname==='/api/v1/goals'&&req.method==='GET'){send(res,200,await privateJson('goals.json',defaults));return;}
      if(pathname==='/api/v1/goals'&&req.method==='PUT'){const current=await privateJson('goals.json',defaults);const next=validateGoals(await payload(req));if(next.version!==current.version+1){send(res,409,{error:'Reload the current goals before saving'});return;}await atomic('goals.json',next);send(res,200,next);return;}
      if(pathname==='/api/v1/refresh'&&req.method==='POST'){
        const body=await payload(req);
        if(!refreshJob)refreshJob=(async()=>{
          const raw=await privateJson('garmin-raw.json');
          const goals=await privateJson('goals.json',defaults),profile=await privateJson('profile.json',emptyProfile);
          const previous={raw,goals,profile,snapshot:local,lastCheckedAt:(await privateJson('sync.json'))?.lastCheckedAt};
          const next=await refreshState(previous,{reason:body.reason==='check'?'check':'manual'});
          await atomic('garmin-raw.json',next.raw);await atomic('snapshot.json',next.snapshot);await atomic('sync.json',{lastCheckedAt:next.lastCheckedAt});return next.snapshot;
        })().finally(()=>{refreshJob=null;});
        send(res,200,{snapshot:await refreshJob});return;
      }
      send(res,404,{error:'Endpoint reserved for the future Grok backend'});return;
    }
    if(!['GET','HEAD'].includes(req.method)){send(res,405,{error:'Method not allowed'});return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){send(res,403,{error:'Path denied'});return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}).end(req.method==='HEAD'?undefined:data);
  }catch(error){send(res,error.code==='ENOENT'?404:503,{error:'Request not completed; the latest saved data is retained'});}
}).listen(4173,'127.0.0.1',()=>console.log('Local: '+origin+' · '+(demoOnly?'demo mode':'private Garmin cache when available')+' · no scheduled syncing'));
