// v5 cache bump
const CACHE_NAME = "pay-opt-v5";
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        "./index.html","./manifest.json","./pay_opt_rules.csv","./pay_opt_campaigns.csv",
        "./icon-192.png","./icon-512.png"
      ])
    )
  );
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
