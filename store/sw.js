// Caches the static app shell only for offline use; API calls to Google are never cached.
// Always network first and bypassing the browser HTTP cache (GitHub Pages sends max-age=600), so a new version shows on the next open.
const C='im-store-v16',F=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(F.map(u=>new Request(u,{cache:'reload'})))))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
const nav=e.request.mode==='navigate'||/\/(index\.html)?$/.test(u.pathname);
e.respondWith(fetch(nav?new Request(e.request.url,{cache:'no-store',credentials:'same-origin'}):new Request(e.request,{cache:'no-cache'})).then(r=>{if(r.ok){const c=r.clone();caches.open(C).then(x=>x.put(nav?'index.html':e.request,c));}return r;})
.catch(()=>caches.match(nav?'index.html':e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))))});
