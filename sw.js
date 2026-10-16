// Kalkulator – pamięć podręczna, dzięki której działa bez internetu.
// Strona i motyw: najpierw z sieci (zawsze świeże, bez ręcznych ?v=), bez sieci – ostatnia zapisana wersja.
// KaTeX z CDN ma stały numer wersji, więc bierzemy go od razu z pamięci.
const CACHE = 'calc-v11';
const CORE = ['./', 'index.html', 'calc.css', 'calc-app.js', 'calc-engine.js',
  '../darkpdf/theme.css', '../darkpdf/fonts/google-sans-flex-latin.woff2',
  '../darkpdf/fonts/google-sans-flex-latin-ext.woff2'];   // wspólna paleta i font

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('calc-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const cachedClients = new Set();   // karty, których strona przyszła z cache (wolna sieć albo offline)

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
    const hit = await cache.match(req, { ignoreSearch: true });
    // Strona podana z cache bierze z cache także swoje pliki – nowe moduły nie mieszają się ze starymi
    if (hit && cachedClients.has(e.clientId)) return hit;
    const navigate = req.mode === 'navigate';
    try {
      // no-cache: przeglądarka pyta serwer, czy plik się zmienił (GitHub Pages trzyma pliki 10 min),
      // więc po wdrożeniu od razu widać nową wersję wszystkich plików naraz.
      // Limit 2 s tylko dla samej strony: przy wolnej sieci cała aplikacja startuje z cache.
      const res = await fetch(req, { cache: 'no-cache', signal: hit && navigate ? AbortSignal.timeout(2000) : undefined });
      // bez ?expr=…: każde działanie z adresu nie dokłada osobnej kopii strony (odczyt i tak ignoreSearch)
      if (res.ok) await cache.put(url.origin + url.pathname, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      if (!hit) throw err;
      if (navigate && e.resultingClientId) cachedClients.add(e.resultingClientId);
      return hit;
    }
  })());
});
