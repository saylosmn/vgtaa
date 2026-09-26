/* Үг Таа — service worker
 * Сүлжээ эхэлж (network-first): шинэ хувилбар шууд хүрнэ, интернэтгүй үед
 * сүүлд ачаалсан хуудсаа харуулна. API хүсэлтийг хэзээ ч кэшлэхгүй. */
const CACHE = 'ugtaa-v7.6.0';
const SHELL = ['./', 'index.html', 'index.css?v=7.6.0', 'index.js?v=7.6.0', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* InfinityFree эхний удаа бот шалгах HTML буцаадаг — тэрийг кэшлэхгүй */
async function remember(req, res) {
  if (!res.ok || res.type !== 'basic') return;
  const isHtml = (res.headers.get('content-type') || '').includes('text/html');
  const isPage = req.mode === 'navigate';
  if (isHtml !== isPage) return;
  if (isHtml && !(await res.clone().text()).includes('id="app"')) return;
  const cache = await caches.open(CACHE);
  await cache.put(req, res);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.endsWith('.php')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        e.waitUntil(remember(req, res.clone()).catch(() => {}));
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
