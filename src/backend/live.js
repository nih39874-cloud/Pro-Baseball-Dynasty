// Dedicated live-match transport. All mutations are verified by Supabase live-api.
// Postgres Changes pushes event-triggered updates; a timed refresh remains as fallback.
import {BACKEND} from '../config.js';
import {refreshSession} from './auth.js';
const GAME_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function liveApi(action,data={}) {
 if(!BACKEND.url||!BACKEND.publishableKey)throw Error('尚未設定遊戲伺服器');
 const s=await refreshSession();if(!s?.access_token)throw Error('請先登入才能管理即時比賽');
 const r=await fetch(`${BACKEND.url}/functions/v1/live-api`,{
  method:'POST',headers:{apikey:BACKEND.publishableKey,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},
  body:JSON.stringify({action,...data})
 });
 const result=await r.json().catch(()=>({}));
 if(!r.ok||!result.ok)throw Error(result.error||`伺服器狀態 ${r.status}`);
 return result;
}

/** Subscribe only to league-authorized rows; every event is followed by authenticated fetch. */
export async function subscribeLiveGame(gameId,onUpdate) {
 if(!GAME_ID.test(gameId))throw Error('無效的場次代碼');
 const s=await refreshSession();if(!s?.access_token)throw Error('尚未登入');
 let client,channel;
 try{
  // Dynamic load keeps the local offline practice game functional when network is unavailable.
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.58.0');
  client=createClient(BACKEND.url,BACKEND.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  client.realtime.setAuth(s.access_token);
  channel=client.channel(`diamond-match-${gameId}`)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'match_sessions',filter:`game_id=eq.${gameId}`},onUpdate)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'games',filter:`id=eq.${gameId}`},onUpdate)
   .subscribe();
 }catch{
  // Polling in GameUI remains the official fallback; never pretend WebSocket succeeded.
  return ()=>{};
 }
 return ()=>{if(client&&channel)void client.removeChannel(channel);};
}
