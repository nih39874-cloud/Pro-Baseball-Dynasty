import {BACKEND} from '../config.js';
const SESSION_KEY='pbd_supabase_auth_v1';
let cached=null;
const emailOf=username=>`${username.toLowerCase()}@accounts.diamond-dynasty.invalid`;
function check(){if(!BACKEND.url||!BACKEND.publishableKey)throw Error('Supabase 尚未配置');}
function readSession(){if(cached)return cached;try{cached=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{}return cached;}
function storeSession(s){cached=s;try{if(s)sessionStorage.setItem(SESSION_KEY,JSON.stringify(s));else sessionStorage.removeItem(SESSION_KEY);}catch{}}
export function isSignedIn(){return !!readSession()?.access_token;}
export async function refreshSession(){check();const s=readSession();if(!s?.refresh_token)return null;
 if((s.expires_at||0)>Math.floor(Date.now()/1000)+60)return s;
 const r=await fetch(`${BACKEND.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:BACKEND.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
 if(!r.ok){storeSession(null);throw Error('登入已過期，請重新登入');}
 const next=await r.json();storeSession(next);return next;
}
export async function signIn(username,password){check();if(!/^(GM|brothers|dragons|unilions|guardians|rakuten|TSG)$/i.test(username))throw Error('請輸入六隊或 GM 的帳號');
 const r=await fetch(`${BACKEND.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:BACKEND.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:emailOf(username),password})});
 if(!r.ok)throw Error('帳號或密碼錯誤，或帳號尚未建立');
 const s=await r.json();storeSession(s);
 try{const x=await apiCall('status');return {session:s,status:x};}catch(e){storeSession(null);throw e;}
}
export async function signOut(){const s=readSession();if(s?.access_token){try{await fetch(`${BACKEND.url}/auth/v1/logout`,{method:'POST',headers:{apikey:BACKEND.publishableKey,Authorization:`Bearer ${s.access_token}`}});}catch{}}storeSession(null);}
export async function apiCall(action='status',data={}){check();let s=await refreshSession();if(!s?.access_token)throw Error('請先登入');
 const r=await fetch(`${BACKEND.url}/functions/v1/game-api`,{method:'POST',headers:{apikey:BACKEND.publishableKey,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
 let result={};try{result=await r.json();}catch{}
 if(r.status===401){storeSession(null);throw Error('登入失效，請重新登入');}
 if(!r.ok||!result.ok)throw Error(result.error||`伺服器錯誤 ${r.status}`);
 return result;
}
export function getSessionMetadata(){const s=readSession();return s?{expires_at:s.expires_at,user_id:s.user?.id}:null;}
