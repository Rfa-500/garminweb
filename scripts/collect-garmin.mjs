import {collectGarmin} from '../integration/garmin.mjs';
try{const data=await collectGarmin('2026-10-31');console.log(JSON.stringify(Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Array.isArray(v)?{count:v.length,fields:Object.keys(v[0]||{})}:v&&typeof v==='object'?{fields:Object.keys(v)}:v])),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
