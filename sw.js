/* Myntland – service worker for elevappene (1–4 og 5–7).
 *
 * Mål: rask gjenåpning. Aller første besøk laster som før; hver kaldstart
 * etterpå serveres app-koden og bibliotekene fra enheten, så knappene
 * virker med en gang.
 *
 * Trygghetsregler:
 *  - Rører ALDRI navigasjoner/HTML-sider  -> ingen fare for å sitte fast på
 *    en gammel versjon, og klasseportalens sider er urørt.
 *  - Rører ALDRI Firebase-datatrafikk     -> saldo/innlogging går alltid live.
 *  - Tar bare hånd om: elevapp-JS/CSS + de versjonerte bibliotekene.
 *
 * Oppdaterer du sw.js senere: øk versjonsnummeret i CACHE under,
 * så ryddes den gamle cachen bort automatisk.
 */
const CACHE = 'myntland-elevapp-v1';

/* Versjonerte bibliotek (uforanderlige URL-er) -> cache-first */
const LIB_HOSTS = ['www.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

/* Egne, navngitte elevapp-filer -> stale-while-revalidate
   (serveres raskt fra cache, og oppdateres i bakgrunnen til neste gang) */
const OWN_FILES = ['elevapp14.js', 'elevapp57.js', 'elevapp14.css', 'elevapp57.css'];

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; })
                          .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function isLib(url) {
  if (LIB_HOSTS.indexOf(url.hostname) === -1) return false;
  // gstatic: bare Firebase-SDK-en, ikke noe annet på gstatic
  if (url.hostname === 'www.gstatic.com') return url.pathname.indexOf('/firebasejs/') === 0;
  return true;
}

function isOwn(url) {
  if (url.origin !== self.location.origin) return false;
  return OWN_FILES.indexOf(url.pathname.split('/').pop()) !== -1;
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const net = fetch(req).then(function (res) {
    if (res && res.ok) c.put(req, res.clone());
    return res;
  }).catch(function () { return null; });
  return hit || (await net) || fetch(req);
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (isLib(url)) { e.respondWith(cacheFirst(req)); return; }
  if (isOwn(url)) { e.respondWith(staleWhileRevalidate(req)); return; }
  /* alt annet (HTML-sider, klasseportal, Firebase-data) -> nettverk som vanlig */
});
