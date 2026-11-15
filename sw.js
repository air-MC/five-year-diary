// 앱 셸 캐시. 파일을 바꾸면 VERSION을 올려 주세요.
const VERSION = 'fyd-v1';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/dates.js', 'js/backup.js', 'js/store.js', 'js/ink.js', 'js/flip.js',
  'fonts/Pretendard-Light.woff2', 'fonts/Pretendard-Regular.woff2', 'fonts/Pretendard-Medium.woff2', 'fonts/Pretendard-SemiBold.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
