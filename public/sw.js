const CACHE_NAME = 'dailybooks-erp-v7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // SPA navigation fallback (network-first)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedShell = await caches.match('/index.html');
          if (cachedShell) return cachedShell;
          return new Response(
            `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>No Internet Connection</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}.card{max-width:420px;width:100%;background:#1e293b;border:1px solid #334155;border-radius:20px;padding:32px 28px;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5)}.icon{width:56px;height:56px;margin:0 auto 16px;border-radius:16px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;color:#f87171}h2{margin:0 0 8px;font-size:20px;font-weight:700;color:#f8fafc}p{margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.5}.btn{width:100%;padding:12px 20px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;border:none;border-radius:12px;cursor:pointer;transition:background 0.2s}.btn:hover{background:#1d4ed8}</style></head><body><div class="card"><div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg></div><h2>No Internet Connection</h2><p>Please check your network connection and try again.</p><button class="btn" onclick="location.reload()">Retry Connection</button></div></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isStaticAsset = url.pathname.startsWith('/assets/')
    || /\.(?:js|css|map|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/i.test(url.pathname);

  if (isStaticAsset) {
    // Never fall back to index.html for JS/CSS files.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        });
    })
  );
});
