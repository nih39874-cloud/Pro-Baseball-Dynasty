import {apiCall,getSessionMetadata} from './backend/auth.js';
import {createState} from './core/state.js';
import {GameEngine} from './core/engine.js';
import {StadiumScene} from './graphics/scene.js';
import {GameUI} from './ui/view.js';
import {setupJoystick} from './controls/joystick.js';
import {setupPwa} from './platform/pwa.js';
const state=createState();const engine=new GameEngine(state);let scene;
try{scene=new StadiumScene(document.getElementById('field'));}catch(e){document.getElementById('field').insertAdjacentHTML('afterend',`<div style="position:absolute;inset:20%;padding:20px;background:#102637;color:white">3D 顯示失敗：${e.message}。請使用支援 WebGL2 的瀏覽器。</div>`);scene={render:()=>{},cameraYaw:0};}
const ui=new GameUI(engine,scene);
if(getSessionMetadata()){
  apiCall('status').then(r=>{ui.remote=r;ui.state.team=r.team_id||ui.state.team;ui.showModal('dashboard');})
    .catch(()=>{/* Offline practice remains accessible without exposing credentials. */});
}
setupJoystick(engine,scene);setupPwa();ui.render();
let prev=performance.now(),u=0;
function step(now){const dt=Math.min(.05,(now-prev)/1000);prev=now;if(!document.hidden&&ui.modal===''){engine.update(dt);scene.render(state,now);u+=dt;if(u>.1){ui.render();u=0;}}
 else if(ui.modal==='live'&&ui.liveReplayActive&&ui.liveData?.game&&scene.renderRemote){scene.renderRemote(ui.liveData,ui.viewTeam(),now);}
 else{scene.render(state,now);}requestAnimationFrame(step)}
requestAnimationFrame(step);
document.addEventListener('visibilitychange',()=>{prev=performance.now();if(document.hidden&&state.mode!=='auto'){state.mode='auto';state.pendingMode=null;}});
window.addEventListener('pagehide',()=>{state.mode='auto';state.pendingMode=null;});
