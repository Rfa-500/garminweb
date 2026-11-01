import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const sign=(value,secret)=>createHmac('sha256',secret).update(value).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function sessionCookie(secret,now=Date.now()){
  const value=`${now}.${randomBytes(24).toString('hex')}`;
  return `${value}.${sign(value,secret)}`;
}
export function validSession(value,secret,now=Date.now()){
  if(typeof value!=='string'||!/^\d+\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(value))return false;
  const [time,id,signature]=value.split('.');
  return Number(time)<=now&&now-Number(time)<90*86400000&&equal(signature,sign(`${time}.${id}`,secret));
}
export const csrfFor=(session,secret)=>sign('csrf:'+session,secret);
export function validMutation({origin,expectedOrigin,fetchSite,csrf,session,secret}){
  return origin===expectedOrigin&&fetchSite!=='cross-site'&&validSession(session,secret)&&equal(csrf,csrfFor(session,secret));
}
