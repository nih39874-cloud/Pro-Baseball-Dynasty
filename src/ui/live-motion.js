// Client-only intent geometry; server validates control, team, bounds and timing.
export const clampUnit = value => Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
export function motionFromPointer(clientX,clientY,rect){
 if(!rect||!(rect.width>0)||!(rect.height>0))return {dx:0,dz:0};
 const nx=(clientX-rect.left-rect.width/2)/(rect.width*.37);
 const nz=(clientY-rect.top-rect.height/2)/(rect.height*.37);
 const distance=Math.hypot(nx,nz);
 const scale=distance>1?1/distance:1;
 return {dx:Math.round(clampUnit(nx*scale)*1000)/1000,dz:Math.round(clampUnit(nz*scale)*1000)/1000};
}
export function motionRoleFromGame(data,teamId){
 const game=data?.game,side=data?.session?.state?.half;
 if(!game||game.phase!=='live'||!['top','bottom'].includes(side))return null;
 if(teamId!==game.home_team_id&&teamId!==game.away_team_id)return null;
 if(!(data.controls||[]).some(c=>c.team_id===teamId&&c.active_mode==='player'))return null;
 const offense=side==='top'?game.away_team_id:game.home_team_id;
 return teamId===offense?'runner':'fielder';
}
