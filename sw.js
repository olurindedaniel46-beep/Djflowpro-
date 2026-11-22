/* sw.js - lets DJ Flow Pro open without internet */
const CACHE='djflow-v1';
const FILES=[
 './','./djflow.html','./flowai.js','./decks.js','./beat.js',
 './onlinechat.js','./vinyl.js','./theme.css','./manifest.json',
 './icon-192.png','./icon-512.png','./icon-maskable-512.png'
];

self.addEventListener('install',e=>{
 e.waitUntil(
  caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(f).catch(()=>{}))))
 );
 self.skipWaiting();
});

self.addEventListener('activate',e=>{
 e.waitUntil(
  caches.keys()
   .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
   .then(()=>self.clients.claim())
 );
});

self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET')return;
 if(new URL(req.url).origin!==location.origin)return;
 e.respondWith(
  fetch(req)
   .then(res=>{
    const copy=res.clone();
    caches.open(CACHE).then(c=>c.put(req,copy));
    return res;
   })
   .catch(()=>caches.match(req).then(r=>r||caches.match('./djflow.html')))
 );
});