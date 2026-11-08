export function setupPwa(){
 if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
 // Keep system affordances and text editing usable; suppress gestures only on game surfaces.
 for(const el of document.querySelectorAll('#field,#joystick,#aimOverlay,#actionArea')){el.addEventListener('contextmenu',e=>e.preventDefault());}
 document.addEventListener('gesturestart',e=>{if(e.target.closest?.('#field,#joystick,#aimOverlay,#actionArea'))e.preventDefault()},{passive:false});
 document.addEventListener('touchmove',e=>{if(e.target.closest?.('#field,#joystick,#aimOverlay,#actionArea'))e.preventDefault()},{passive:false});
}
