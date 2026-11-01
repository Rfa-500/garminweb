import {get,put} from '@vercel/blob';
const pathname='dashboard/state.json';
let initializing;
export async function loadCloudState(){
 const existing=await get(pathname,{access:'private',useCache:false});
 if(existing?.statusCode===200)return {state:await new Response(existing.stream).json(),etag:existing.blob.etag};
 if(!initializing)initializing=(async()=>{
  const {collectGarmin}=await import('./garmin.mjs');const {buildState}=await import('./state.mjs');
  const profile=JSON.parse(process.env.INITIAL_PROFILE||'null'),goals=JSON.parse(process.env.INITIAL_GOALS||'null');
  if(!profile||!goals)throw Error('Private initialization settings are missing');
  const raw=await collectGarmin(undefined,{previous:{},persist:false});
  const state=buildState(raw,goals,profile);
  try{await writeCloudState(state);}catch{/* A simultaneous initialization may have won. */}
  return readCloudState();
 })().finally(()=>{initializing=null;});
 return initializing;
}
export async function readCloudState(){
  const result=await get(pathname,{access:'private',useCache:false});
  if(!result||result.statusCode!==200)throw Error('Private state not initialized');
  return {state:await new Response(result.stream).json(),etag:result.blob.etag};
}
export async function writeCloudState(state,etag){
  return put(pathname,JSON.stringify(state),{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});
}
