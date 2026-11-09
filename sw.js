const CACHE='diamond-dynasty-portrait-v2';
const FILES=['./index.html','./manifest.webmanifest','./assets/icon.svg','./src/ui/dynasty-app.js','./src/ui/dynasty.css','./src/backend/auth.js','./src/config.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==location.origin)return;
 const isNavigation=req.mode==='navigate';
 event.respondWith(isNavigation?fetch(req).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(req,res.clone()));return res}).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))):
 caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(req,res.clone()));return res})));
});