/**
 * Run only in the project owner's private terminal after acquiring the service role key.
 * SUPABASE_URL='https://...' SUPABASE_SERVICE_ROLE_KEY='...' \
 * DIAMOND_ACCOUNT_PASSWORDS='{"GM":"...","brothers":"...",...}' node scripts/provision-users.mjs
 * No password or service key is ever committed to GitHub.
 */
const url=process.env.SUPABASE_URL?.replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const raw=process.env.DIAMOND_ACCOUNT_PASSWORDS;
if(!url||!key||!raw)throw Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or DIAMOND_ACCOUNT_PASSWORDS');
const credentials=JSON.parse(raw);
const entries=[['GM',null,'gm','gm'],['brothers','brothers','manager','official'],['dragons','dragons','manager','official'],['unilions','unilions','manager','official'],['guardians','guardians','manager','official'],['rakuten','rakuten','manager','official'],['TSG','TSG','manager','official']];
const heads={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function api(path,options={}){
 const r=await fetch(`${url}${path}`,{...options,headers:heads});const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(`${path}: ${data.msg||data.message||data.error||r.status}`);
 return data;
}
const leagues=await api('/rest/v1/leagues?select=id,kind');
const byKind=Object.fromEntries(leagues.map(l=>[l.kind,l.id]));
if(!byKind.gm||!byKind.official)throw Error('Both league records are required');
for(const [username,team,role,kind] of entries){
 const password=credentials[username];
 if(typeof password!=='string'||password.length<4)throw Error(`Missing valid password for ${username}`);
 if(password.length<10)console.warn(`${username}: initial password is weak; change it after first sign-in.`);
 const email=`${username.toLowerCase()}@accounts.diamond-dynasty.invalid`;
 let user;
 try {const d=await api('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password,email_confirm:true,app_metadata:{game_account:username}})});user=d.user??d;}
 catch(e){console.warn(`Account ${username} NOT created: ${e.message}`);continue;}
 await api('/rest/v1/memberships',{method:'POST',body:JSON.stringify({user_id:user.id,league_id:byKind[kind],team_id:team,role})});
 console.log(`${username}: account and role created`);
}
console.log('Done. Re-run only after checking existing users; this script does not overwrite them.');
