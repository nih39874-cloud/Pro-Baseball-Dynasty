import {createState} from './core/state.js';
import {GameEngine} from './core/engine.js';
import {StadiumScene} from './graphics/scene.js';
import {GameUI} from './ui/view.js';
import {setupJoystick} from './controls/joystick.js';
import {setupPwa} from './platform/pwa.js';
const state=createState();const engine=new GameEngine(state);let scene;
try{scene=new StadiumScene(document.getElementById('field'));}catch(e){document.getElementById('field').insertAdjacentHTML('afterend',`<div style="position:absolute;inset:20%;padding:20px;background:#102637;color:white">3D 顯示失敗：${e.message}。請使用支援 WebGL2 的瀏覽器。</div>`);scene={render:()=>{},cameraYaw:0};}
const ui=new GameUI(engine);setupJoystick(engine,scene);setupPwa();ui.render();
let prev=performance.now(),u=0;
function step(now){const dt=Math.min(.05,(now-prev)/1000);prev=now;if(!document.hidden&&ui.modal===''){engine.update(dt);scene.render(state,now);u+=dt;if(u>.1){ui.render();u=0;}}else{scene.render(state,now);}requestAnimationFrame(step)}
requestAnimationFrame(step);
document.addEventListener('visibilitychange',()=>{prev=performance.now();if(document.hidden&&state.mode!=='auto'){state.mode='auto';state.pendingMode=null;}});
window.addEventListener('pagehide',()=>{state.mode='auto';state.pendingMode=null;});
