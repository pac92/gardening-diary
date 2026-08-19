/* Diario de jardinería — service worker genérico.
   Network-first con fallback a caché. No menciona ningún nombre de fichero:
   se escribe una vez y no se vuelve a tocar. Sin VERSION, sin skipWaiting. */

const CACHE = 'jardin-runtime';
const TIMEOUT_MS = 3000;

self.addEventListener('install', () => {
  // Nada que precachear: el runtime caching se encarga.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(redPrimero(req));
});

function demora(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), demora(TIMEOUT_MS)]);
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (_) {
    const guardada = await cache.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    if (req.mode === 'navigate') {
      const raiz = await cache.match(new URL('./', self.location).href, { ignoreSearch: true });
      if (raiz) return raiz;
    }
    return new Response('Sin conexión y sin copia en caché.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
