import {BACKEND} from '../config.js';
/** Server must create accounts through Supabase Auth admin API and assign public.memberships.
 * Client NEVER stores passwords; on production replace BACKEND with public URL & publishable key.
 * No user-supplied credentials are embedded in GitHub Pages. */
export async function signIn(username,password){
 if(!BACKEND.url||!BACKEND.publishableKey)throw Error('尚未配置 Supabase 專案');
 if(!/^[a-zA-Z0-9_-]+$/.test(username))throw Error('帳號格式錯誤');
 const body={email:`${username.toLowerCase()}@accounts.diamond-dynasty.invalid`,password};
 const r=await fetch(`${BACKEND.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json',apikey:BACKEND.publishableKey},body:JSON.stringify(body)});
 if(!r.ok)throw Error('登入驗證失敗');
 const session=await r.json();
 const m=await fetch(`${BACKEND.url}/rest/v1/memberships?select=team_id,league_id,role&user_id=eq.${session.user.id}`,{headers:{apikey:BACKEND.publishableKey,Authorization:`Bearer ${session.access_token}`}});
 if(!m.ok)throw Error('無法讀取授權資料');const membership=await m.json();if(!membership.length)throw Error('帳號尚未被授權使用任何球隊');
 return {session,membership};
}
