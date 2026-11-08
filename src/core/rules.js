// Pure game decisions, shared by manual input and AI. Never trust client results in a live league.
export const STRIKE_ZONE={left:-.83,right:.83,bottom:.52,top:1.22};
export function trueStrike(x,y,r=.036){return x+r>=STRIKE_ZONE.left&&x-r<=STRIKE_ZONE.right&&y+r>=STRIKE_ZONE.bottom&&y-r<=STRIKE_ZONE.top;}
export function umpireCall(x,y,random=Math.random()){
  const actual=trueStrike(x,y);
  const margin=Math.min(Math.abs(x-STRIKE_ZONE.left),Math.abs(x-STRIKE_ZONE.right),Math.abs(y-STRIKE_ZONE.bottom),Math.abs(y-STRIKE_ZONE.top));
  const within=Math.abs(x)<.66&&y>.63&&y<1.11;
  const error=within?.007:Math.max(.015,Math.min(.20,.13-Math.abs(margin)*.14));
  return random<error?!actual:actual;
}
export function advanceRunners(bases,hits=1){const next=[false,false,false];let runs=0;for(let b=2;b>=0;b--){if(!bases[b])continue;const n=b+hits;if(n>2)runs++;else next[n]=true;}if(hits>=4)runs++;else next[hits-1]=true;return {bases:next,runs};}
export function walkRunners(bases){const [b1,b2,b3]=bases;return {bases:[true,b1||b2,b2&&b1||b3],runs:b1&&b2&&b3?1:0};}
export function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
export function accuracyWindow(x,y,stamina=100){const dx=Math.abs(x)/.84,dy=Math.max(0,Math.abs(y-.87)/.36);const edge=clamp(Math.max(dx,dy),0,1.3);return clamp(.30-edge*.17-(1-stamina/100)*.10,.065,.33);}
export function runBases(state,hit){const v=advanceRunners(state.bases,hit);state.bases=v.bases;state.score[state.half==='top'?0:1]+=v.runs;return v.runs;}
export function nextHalf(state){state.outs=0;state.balls=0;state.strikes=0;state.bases=[false,false,false];if(state.half==='top'){state.half='bottom';}else{state.half='top';state.inning++;}state.atBat++;state.stamina=Math.min(100,state.stamina+4);if(state.inning>9&&state.score[0]!==state.score[1]&&state.half==='top'){state.finished=true;state.phase='finished';}}
export function addOut(state){state.outs++;state.balls=0;state.strikes=0;state.atBat++;if(state.outs>=3)nextHalf(state);}
export function addPitchCall(state,strike){state.pitchNumber++;if(strike){state.strikes++;if(state.strikes>=3){addOut(state);return '三振出局';}return '好球';}state.balls++;if(state.balls>=4){const p=walkRunners(state.bases);state.bases=p.bases;state.score[state.half==='top'?0:1]+=p.runs;state.balls=0;state.strikes=0;state.atBat++;return '四壞保送';}return '壞球';}
export function isOffense(state){return (state.half==='top'?state.visitor:state.home)===state.team;}
export function currentRole(state){if(state.mode==='auto')return 'auto';if(state.mode==='coach')return 'coach';return isOffense(state)?'batter':'pitcher';}
