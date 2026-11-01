import {readFile,writeFile} from 'node:fs/promises';
import {buildState} from '../integration/state.mjs';
import {writeCloudState} from '../integration/cloud-store.mjs';
const read=name=>readFile(new URL('../.local/'+name,import.meta.url),'utf8').then(JSON.parse);
const state=buildState(await read('garmin-raw.json'),await read('goals.json'),await read('profile.json'));
await writeFile(new URL('../.local/snapshot.json',import.meta.url),JSON.stringify(state.snapshot,null,2),{mode:0o600});
if(process.argv.includes('--cloud')){
 // Initialization refuses to overwrite any existing private cloud state.
 await writeCloudState(state);
 console.log('Private cloud initialized; source records and credentials are not public.');
}
console.log(JSON.stringify({activities:state.snapshot.activities.length,availableMetrics:Object.values(state.snapshot.metrics).filter(m=>m.status==='available').length,profileSaved:true}));
