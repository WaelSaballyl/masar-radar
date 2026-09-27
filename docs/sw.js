// Masar's service worker: lets the site install as an app and open without a
// connection. Pages and data go to the network first (they change daily) and
// fall back to the last copy; versioned assets (?v=N) and brand images never
// change under the same URL, so they come from the cache first.
const CACHE = "masar-v1";
const SHELL = ["./", "jobs.html", "swipe.html", "cv.html", "applications.html", "assets/brand/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // only this site's own GETs; the worker API and other hosts go straight through
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const fixed = url.searchParams.has("v") || url.pathname.includes("/assets/brand/");
  if (fixed) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: url.pathname.endsWith(".html") || url.pathname.endsWith("/") })));
});
