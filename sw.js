// Service worker：讓行程網站在沒有網路時也能開啟。
// 修改網站內容後不需要動這個檔案；只有在更換下方清單裡的資源時，才把 CACHE 的版本號加一。
const CACHE = 'milutrip-v1';

// 網站本身的檔案
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 圖示字型的樣式表（裡面引用的字型檔會在安裝時一併抓下來）
const ICON_CSS = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css';

// 文字字型的樣式表。字型檔本身數量很多，改成用到時才存；離線時沒存到的會退回系統字型
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&family=Outfit:wght@400;500;600;700&display=swap';

// 各地區的橫幅照片
const PHOTOS = [
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=60&v=2',
  'https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=800&q=60',
  'https://images.unsplash.com/photo-1481437156560-3205f6a55735?auto=format&fit=crop&w=800&q=60',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=60',
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=60'
];

// 這些網域的資源採「有快取就用快取」
const CACHE_FIRST_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'images.unsplash.com'
];

const NETWORK_TIMEOUT_MS = 3000;

// 跨網域資源抓不到時不要讓整個安裝失敗，所以每一個都各自 try
async function cacheQuietly(cache, url, options) {
  try {
    const res = await fetch(url, options);
    if (res.ok || res.type === 'opaque') await cache.put(url, res.clone());
    return res;
  } catch (err) {
    return null;
  }
}

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(LOCAL_ASSETS);

  const iconCss = await cacheQuietly(cache, ICON_CSS);
  if (iconCss && iconCss.ok) {
    const text = await iconCss.text();
    const fontUrls = [...text.matchAll(/url\(["']?([^"')]+\.woff2[^"')]*)["']?\)/g)]
      .map(m => new URL(m[1], ICON_CSS).href);
    await Promise.all(fontUrls.map(url => cacheQuietly(cache, url)));
  }

  await cacheQuietly(cache, FONT_CSS);
  await Promise.all(PHOTOS.map(url => cacheQuietly(cache, url, { mode: 'no-cors' })));
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 網站本身：先試網路（才能拿到最新行程），3 秒內沒回應或離線就用快取
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
    ]);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
    }
    throw err;
  }
}

// 字型、圖示、照片：內容不會變，有快取就直接用
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
