// Offline: aplikacja działa bez internetu po pierwszym otwarciu.
// Własne pliki: najpierw sieć (żeby aktualizacje docierały od razu), w razie braku — pamięć podręczna.
const CACHE = 'prompter-v11';
const SHELL = ['./', 'index.html', 'app.js', 'parsers.js', 'voice.js', 'sync.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png', 'fonts/Montserrat-Variable.ttf'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // no-cache: zawsze pytamy serwer o nowszą wersję (inaczej przeglądarka potrafi wziąć nowy index.html ze starym app.js)
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  } else if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    })));
  }
});
