self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open('paymap-v1').then(c=>c.addAll([
    './','./index.html','./css/style.css','./js/app.js','./js/rules.js',
    './data/cards.json','./data/wallets.json','./data/merchant_rules.json','./data/campaigns.json'
  ])));
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(caches.match(e.request).then(res=>res||fetch(e.request)));
});
