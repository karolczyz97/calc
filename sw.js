// Kalkulator – pamięć podręczna, dzięki której działa bez internetu.
// Strona i motyw: najpierw z sieci, bez sieci – ostatnia zapisana wersja.
// KaTeX z CDN ma stały numer wersji, więc bierzemy go od razu z pamięci.
const CACHE = 'calc-v8';
const CORE = ['./', 'index.html', 'calc.css', 'calc-app.js', 'calc-engine.js',
  'https://karolczyz97.github.io/darkpdf/theme.css?v=1'];   // ten sam adres co w index.html (to samo źródło na GitHub Pages)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const katex = url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/katex@');
  if (url.origin !== location.origin && !katex) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (katex) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
