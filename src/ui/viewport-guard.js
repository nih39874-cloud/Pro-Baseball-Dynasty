/*
 * Diamond Dynasty smartphone viewport correction.
 * Some Android in-app/desktop-mode browsers expose a ~980px CSS layout
 * viewport while the physical phone is only ~360–430 CSS pixels wide.
 * That causes every 16px text label to be visibly downscaled.
 *
 * Scale the actual game root (not its contents individually) to a phone-
 * sized layout, while keeping the transformed box exactly full screen.
 * No adjustment on a normal mobile viewport or desktop computer.
 */
(function(){
  'use strict';
  const enabledByDevice=/Android|iPhone|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&matchMedia('(pointer:coarse)').matches);
  if(!enabledByDevice)return;
  const root=document.getElementById('app');
  if(!root)return;
  let lastRatio=1;
  function correct(){
    const width=Math.max(document.documentElement.clientWidth,window.innerWidth);
    const height=window.innerHeight;
    const shortEdge=Math.min(screen.width||0,screen.height||0);
    const target=(shortEdge>=280&&shortEdge<=600)?shortEdge:390;
    const portrait=height>width*1.12||(screen.height>screen.width);
    const needsCorrection=portrait&&width>Math.max(650,target*1.5);
    if(!needsCorrection){
      if(lastRatio!==1){
        for(const key of ['width','max-width','height','min-height','transform','transform-origin','margin']){
          root.style.removeProperty(key);
        }
        root.classList.remove('mobile-viewport-corrected');
        delete root.dataset.mobileViewportRatio;
        lastRatio=1;
      }
      return;
    }
    const ratio=Math.max(1,Math.min(3.5,width/target));
    if(Math.abs(lastRatio-ratio)<0.02)return;
    lastRatio=ratio;
    root.classList.add('mobile-viewport-corrected');
    root.dataset.mobileViewportRatio=ratio.toFixed(2);
    root.style.setProperty('width',(100/ratio)+'vw','important');
    root.style.setProperty('max-width',(100/ratio)+'vw','important');
    root.style.setProperty('height','calc(100dvh / '+ratio+')','important');
    root.style.setProperty('min-height','0','important');
    root.style.setProperty('margin','0','important');
    root.style.setProperty('transform','scale('+ratio+')','important');
    root.style.setProperty('transform-origin','top left','important');
  }
  correct();
  window.addEventListener('resize',correct,{passive:true});
  window.addEventListener('orientationchange',correct,{passive:true});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',correct,{passive:true});
})();
