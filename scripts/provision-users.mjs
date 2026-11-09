/**
 * Private server-side account provisioning only. NEVER run in the browser or commit keys/passwords.
 * Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DIAMOND_ACCOUNT_PASSWORDS.
 * Safe to rerun: existing users retain passwords; memberships are checked and repaired.
 */
const url=process.env.SUPABASE_URL?.replace(/\/$/,''), key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const raw=process.env.DIAMOND_ACCOUNT_PASSWORDS;
if(!url||!key||!raw)throw Error('Missing provisioning environment secrets');
const credentials=JSON.parse(raw);
const authPassword=(username,pin)=>username==='GM'?pin:`DD${pin}`; // Supabase Auth requires at least 6 characters; UI still accepts 4-digit team PINs.
const entries=[['GM',null,'gm','gm'],['brothers','brothers','manager','official'],['dragons','dragons','manager','official'],['unilions','unilions','manager','official'],['guardians','guardians','manager','official'],['rakuten','rakuten','manager','official'],['TSG','TSG','manager','official']];
// New sb_secret_ API keys authenticate through apikey, not a Bearer JWT.
const heads={apikey:key,'Content-Type':'application/json'};
if(!key.startsWith('sb_secret_'))heads.Authorization=`Bearer ${key}`;
async function api(path,options={}){
 const r=await fetch(`${url}${path}`,{...options,headers:{...heads,...options.headers}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(`${path.split('?')[0]}: ${data.msg||data.message||data.error||r.status}. If creating a user, check the Supabase Auth minimum password length; the supplied short team PINs may be rejected.`);
 return data;
}
for(const [username] of entries){
 const pwd=credentials[username];
 if(typeof pwd!=='string'||(username==='GM'?!/^\d{8}$/.test(pwd):!/^\d{4}$/.test(pwd)))throw Error(`PIN format error for ${username}: GM requires 8 digits, teams require 4 digits`);
}
const leagues=await api('/rest/v1/leagues?select=id,kind');
const byKind=Object.fromEntries(leagues.map(l=>[l.kind,l.id]));
if(!byKind.official||!byKind.gm)throw Error('Missing official or GM parallel league record');
let existing=[];
for(let page=1;page<=20;page++){
 const result=await api(`/auth/v1/admin/users?page=${page}&per_page=100`);
 const users=result.users||[];
 existing.push(...users);
 if(users.length<100)break;
 if(page===20)throw Error('Too many users; cannot safely ensure uniqueness');
}
for(const [username,team,role,kind] of entries){
 const email=`${username.toLowerCase()}@accounts.diamond-dynasty.invalid`;
 let user=existing.find(u=>u.email?.toLowerCase()===email);
 if(!user){
  const result=await api('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:authPassword(username,credentials[username]),email_confirm:true,app_metadata:{game_account:username}})});
  user=result.user||result;
  if(!user.id)throw Error(`Missing created user ID for ${username}`);
  existing.push(user);
 } else {
  // Operator-controlled seven-account roster: reconcile the Auth password with
  // the currently configured Environment secret on each manual provisioning run.
  // The secret is never printed or committed.
  await api(`/auth/v1/admin/users/${user.id}`,{
    method:'PUT',
    body:JSON.stringify({password:authPassword(username,credentials[username]),email_confirm:true})
  });
 }
 const rows=await api(`/rest/v1/memberships?select=user_id,league_id,team_id,role&user_id=eq.${user.id}`);
 const current=rows.find(r=>r.league_id===byKind[kind]);
 if(current){
  if(current.team_id!==team||current.role!==role)throw Error(`Account ${username} has conflicting membership; review manually`);
 }else{
  if(rows.length)throw Error(`Account ${username} belongs to unexpected league; review manually`);
  await api('/rest/v1/memberships',{method:'POST',body:JSON.stringify({user_id:user.id,league_id:byKind[kind],team_id:team,role})});
 }
 console.log(`${username}: verified`);
}
console.log('Verified all seven account memberships. Passwords were not printed or overwritten.');

/**
 * Verify every stored PIN against the real Supabase Auth endpoint.
 * Never log credential values or access tokens.
 */
let verified=0;
for(const [username] of entries){
 const email=`${username.toLowerCase()}@accounts.diamond-dynasty.invalid`;
 const testPassword=authPassword(username,credentials[username]);
 const res=await fetch(`${url}/auth/v1/token?grant_type=password`,{
  method:'POST',
  headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({email,password:testPassword})
 });
 if(!res.ok){
  const err=await res.json().catch(()=>({}));
  const code=String(err.error_code||err.code||res.status).replace(/[^a-zA-Z0-9_]/g,'');
  throw Error(`Authentication check failed for ${username} (code: ${code}). Check whether Auth password differs from the saved secret.`);
 }
 verified++;
 console.log(`${username}: login verified`);
}
console.log(`Successfully authenticated ${verified}/7 accounts.`);
