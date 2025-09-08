self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("pay-opt-v1").then(cache =>
      cache.addAll([
        "./index.html",
        "./manifest.json",
        "./pay_opt_rules.csv",
        "./pay_opt_campaigns.csv",
        "./icon-192.png",
        "./icon-512.png"
      ])
    )
  );
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
