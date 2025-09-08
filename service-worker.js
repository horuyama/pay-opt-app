self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open('paymap-poi-v1').then(c=>c.addAll([
    './','./index.html','./style.css','./app.js',
    './cards.json','./wallets.json','./merchant_rules.json','./campaigns.json'
  ])));
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(caches.match(e.request).then(res=>res||fetch(e.request)));
});
