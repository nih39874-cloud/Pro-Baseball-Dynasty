import {TEAMS,START_FUNDS,START_YEAR} from '../config.js';
const STORE='pbd_local_practice_v1';
function freshLeague(){return {year:START_YEAR,funds:Object.fromEntries(TEAMS.map(t=>[t.id,START_FUNDS])),champions:[],timeline:[{year:START_YEAR,note:'初始球季'}],selectedTeam:'brothers'};}
export function createState(){
  let practice=freshLeague();try {const raw=JSON.parse(localStorage.getItem(STORE)||'null');if(raw&&raw.year>=START_YEAR&&raw.funds)practice={...practice,...raw};}catch{}
  return {league:'gm',practice,official:freshLeague(),team:'brothers',visitor:'brothers',home:'dragons',mode:'auto',pendingMode:null,inning:1,half:'top',outs:0,balls:0,strikes:0,bases:[false,false,false],score:[0,0],pitchNumber:0,atBat:1,gameNumber:1,phase:'ready',phaseTime:0,ball:null,aim:{x:0,y:0},swing:null,powerMeter:null,pitchType:'四縫線',stamina:100,challenge:{abs:2,replay:2},call:null,review:null,fieldChoice:null,selectedFielder:null,fieldMove:{x:0,y:0},coachPos:{x:-24,z:8},batterIndex:[0,0],events:['歡迎進入鑽石王朝。這是一場本機練習賽。'],autoElapsed:0,finished:false,local:true};
}
export function persist(state){try{localStorage.setItem(STORE,JSON.stringify(state.practice));}catch{}}
export function saveSnapshot(state){const p=state.practice;p.timeline.push({year:p.year,at:Date.now(),funds:{...p.funds},note:`${p.year} 季存檔`});if(p.timeline.length>180)p.timeline.shift();persist(state);}
export function updateFunds(state,team,amount){state.practice.funds[team]=Math.max(0,Math.round(amount));persist(state);}
export function returnToYear(state,year){const record=[...state.practice.timeline].reverse().find(v=>v.year===year&&v.funds);if(!record)return false;state.practice.year=record.year;state.practice.funds={...record.funds};persist(state);return true;}
