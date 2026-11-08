export const TEAMS = [
  {id:'brothers',name:'中信兄弟',short:'兄弟',color:'#e2b544',secondary:'#242d37'},
  {id:'dragons',name:'味全龍',short:'味全',color:'#bf3e39',secondary:'#ffffff'},
  {id:'unilions',name:'統一7-ELEVEn獅',short:'統一',color:'#e78a31',secondary:'#2b2b2b'},
  {id:'guardians',name:'富邦悍將',short:'富邦',color:'#4288be',secondary:'#ffffff'},
  {id:'rakuten',name:'樂天桃猿',short:'樂天',color:'#8f2f42',secondary:'#fff'},
  {id:'TSG',name:'台鋼雄鷹',short:'台鋼',color:'#7e9981',secondary:'#1e2734'}
];
export const START_FUNDS = 500_000_000;
export const START_YEAR = 2024;
export const INITIAL_SEASON = {days:7,regularDays:4,playoffHours:12,offseasonHours:36,trainingHours:24,firstDay:'Tuesday',startTime:'08:00',timeZone:'Asia/Taipei'};
export const FIELDERS = [
  {key:'P', label:'投手',pos:[0,-18]}, {key:'C',label:'捕手',pos:[0,2]},
  {key:'1B',label:'一壘手',pos:[20,-18]}, {key:'2B',label:'二壘手',pos:[9,-30]},
  {key:'3B',label:'三壘手',pos:[-20,-18]}, {key:'SS',label:'游擊手',pos:[-9,-30]},
  {key:'LF',label:'左外野手',pos:[-36,-66]}, {key:'CF',label:'中外野手',pos:[0,-79]}, {key:'RF',label:'右外野手',pos:[36,-66]}
];
// Public frontend configuration only: no passwords, service keys or auth secrets.
export const BACKEND = {url:'', publishableKey:''};
