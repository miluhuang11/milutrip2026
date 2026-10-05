// Service worker：讓行程網站在沒有網路時也能開啟。
// 修改網站內容後不需要動這個檔案；只有在更換下方清單裡的資源時，才把 CACHE 的版本號加一。
const CACHE = 'milutrip-v4';

// 網站本身的檔案
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/abu.jpg',
  './images/abu2.jpg',
  './images/nl.jpg',
  './images/ice.jpg',
  './images/paris.jpg',
  './images/flight.jpg',
  './images/journey.jpg'
];

// 圖示字型的樣式表（裡面引用的字型檔會在安裝時一併抓下來）
const ICON_CSS = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css';

// 中文襯線字型的樣式表（Apple 裝置有內建宋體，不會用到）。字型檔數量很多，用到時才存；離線時沒存到的會退回系統字型
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&display=swap';

// 這些網域的資源採「有快取就用快取」
const CACHE_FIRST_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
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

// 字型、圖示：內容不會變，有快取就直接用
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
