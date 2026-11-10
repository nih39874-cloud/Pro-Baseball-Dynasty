const CACHE='diamond-dynasty-clubhouse-v19';
const FILES=['./index.html','./manifest.webmanifest','./assets/icon.svg','./src/ui/dynasty-app.js','./src/ui/dynasty.css','./src/ui/readable-mobile.css','./src/ui/viewport-guard.js','./src/backend/auth.js','./src/config.js','./version.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const request=e.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==location.origin)return;
 const networkFirst=request.mode==='navigate'||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('.webmanifest')||url.pathname.endsWith('/version.json');
 e.respondWith(networkFirst
  ?fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(c=>c.put(request,response.clone()));return response}).catch(()=>caches.match(request).then(c=>c||caches.match('./index.html')))
  :caches.match(request).then(hit=>hit||fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(c=>c.put(request,response.clone()));return response}))
 );
});