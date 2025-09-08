(function(){
function toast(msg){var t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2500);}

function norm(s){return (s||'').toLowerCase();}
function canon(s){return norm(s).replace(/[\u2010-\u2015\u2212\-・\s]/g,'').replace(/ﾌｧﾐﾘｰﾏｰﾄ/g,'ファミリーマート').replace(/ｾﾌﾞﾝｲﾚﾌﾞﾝ/g,'セブンイレブン').replace(/ﾛｰｿﾝ/g,'ローソン');}
function like(a,b){return canon(a).includes(canon(b));}

// Category inference
function inferCategory(tags){
  const hay=(tags.shop||'')+' '+(tags.amenity||'')+' '+(tags.brand||'')+' '+(tags.name||'');
  const t=hay.toLowerCase();
  if(t.includes('convenience')||hay.includes('セブン')||hay.includes('ファミリーマート')||hay.includes('ローソン')||t.includes('7-eleven')||t.includes('familymart')||t.includes('lawson')) return 'convenience_store';
  if(t.includes('supermarket')||hay.includes('イオン')||hay.includes('西友')||hay.includes('ライフ')||hay.includes('イトーヨーカドー')) return 'supermarket';
  if(t.includes('drug')||hay.includes('ドラッグ')||hay.includes('ウエルシア')||hay.includes('マツモトキヨシ')||hay.includes('ツルハ')||hay.includes('スギ薬局')) return 'drugstore';
  if(t.includes('cafe')||t.includes('coffee')||hay.includes('スターバックス')||hay.includes('ドトール')) return 'cafe';
  if(t.includes('restaurant')||hay.includes('松屋')||hay.includes('吉野家')||hay.includes('すき家')) return 'restaurant';
  return 'other';
}

// Genre icons (emoji via SVG, color by category)
function iconFor(category, hasBoost){
  const emoji = {
    'convenience_store':'🍙','supermarket':'🛒','drugstore':'💊','cafe':'☕','restaurant':'🍚','other':'⚪'
  }[category] || '⚪';
  const color = hasBoost ? '#ff5a5f' : ({
    'convenience_store':'#2ecc71','supermarket':'#3498db','drugstore':'#e74c3c','cafe':'#8e6e53','restaurant':'#f39c12','other':'#95a5a6'
  }[category] || '#95a5a6');
  return L.divIcon({className:'', html:`<div style="transform:translate(-50%,-100%);">
    <svg width="30" height="38" viewBox="0 0 24 32">
      <path d="M12 0C6 0 1.5 4.5 1.5 10.5c0 7.5 10.5 21 10.5 21s10.5-13.5 10.5-21C22.5 4.5 18 0 12 0z" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>
      <text x="12" y="15" text-anchor="middle" font-size="10" dy="3">`+emoji+`</text>
    </svg>
  </div>`});
}

// Event / campaign rule helpers
function isTodayInMonthlyDays(days){
  const d=new Date(); const day=d.getDate();
  return (days||[]).includes(day);
}
function isTodayInWeekdays(weekdays){
  const d=new Date(); const wd=d.getDay(); // 0 Sun...6 Sat
  return (weekdays||[]).includes(wd);
}
function isWithinDateRange(start,end){
  const now=new Date();
  const s=start?new Date(start):null, e=end?new Date(end):null;
  return (!s||s<=now)&&(!e||now<=e);
}

// Data
let campaigns=[], cards=[], layer=null, timer=null, lastData=null;
let remoteCfg = localStorage.getItem('payopt.remote')||'';
const remoteUrlInput = document.getElementById('remoteUrl');
if(remoteUrlInput){ remoteUrlInput.value = remoteCfg; }
document.getElementById('saveRemote').addEventListener('click',()=>{
  const v = (remoteUrlInput.value||'').trim();
  localStorage.setItem('payopt.remote', v);
  toast('Remote URL を保存しました');
});

async function loadLocalData(){
  campaigns = await fetch('campaigns.json?v=evt1').then(r=>r.json());
  cards = await fetch('cards.json?v=evt1').then(r=>r.json());
}

// Optional: fetch remote JSON or ICS
async function loadRemoteData(){
  if(!remoteCfg) return [];
  if(remoteCfg.toLowerCase().endsWith('.ics')){
    // very simple ICS: read DTSTART/DTEND/SUMMARY and map to store match
    try{
      const txt=await fetch(remoteCfg+((remoteCfg.includes('?')?'&':'?')+'v='+(Date.now()))).then(r=>r.text());
      const lines=txt.split(/\r?\n/);
      const evts=[]; let cur=null;
      for(const ln of lines){
        if(ln.startsWith('BEGIN:VEVENT')) cur={};
        else if(ln.startsWith('SUMMARY:')) cur.summary = ln.slice(8).trim();
        else if(ln.startsWith('DTSTART')) cur.dtstart = ln.split(':').pop().trim();
        else if(ln.startsWith('DTEND')) cur.dtend = ln.split(':').pop().trim();
        else if(ln.startsWith('END:VEVENT')){ if(cur) evts.push(cur); cur=null; }
      }
      // map to simple rule: if summary contains a store keyword known in campaigns, add temp bonus (example)
      const extras=[];
      evts.forEach(e=>{
        const s=e.summary||'';
        campaigns.forEach(c=>{
          // if campaign name or store keyword appears in SUMMARY, create a clone for that period
          const keyMatch = (c.match||[]).some(m=>s.includes(m));
          if(keyMatch){
            const clone = JSON.parse(JSON.stringify(c));
            clone.name = (c.name||'')+'（ICS）';
            clone.start = e.dtstart;
            clone.end = e.dtend;
            extras.push(clone);
          }
        });
      });
      return extras;
    }catch(e){ console.warn('ICS load failed', e); return []; }
  }else{
    try{
      const j=await fetch(remoteCfg+((remoteCfg.includes('?')?'&':'?')+'v='+(Date.now()))).then(r=>r.json());
      return Array.isArray(j)? j : (j.campaigns||[]);
    }catch(e){ console.warn('remote json load failed', e); return []; }
  }
}

function matchCampaigns(name, category){
  const now=new Date();
  return campaigns.filter(c=>{
    // Date window
    const b=c.start?new Date(c.start):null, e=c.end?new Date(c.end):null;
    const okTime = (!b||b<=now)&&(!e||now<=e);
    // Monthly days & weekdays rules
    const mdays = c.dateRule && Array.isArray(c.dateRule.monthDays) ? isTodayInMonthlyDays(c.dateRule.monthDays) : true;
    const wdays = c.weekdayRule && Array.isArray(c.weekdayRule.weekdays) ? isTodayInWeekdays(c.weekdayRule.weekdays) : true;
    // Store/category
    const storeOk = (c.match||[]).some(m=>like(name,m)) || (!!c.store && like(name,c.store));
    const catOk = !c.category || c.category===category || storeOk;
    return okTime && mdays && wdays && (storeOk || (!c.match && !c.store)) && catOk;
  });
}

function summarizeRate(name, category){
  const hits = matchCampaigns(name, category);
  const list = cards.map(card=>{
    const base = card.base||1.0;
    let bonus = 0, why=[];
    hits.forEach(h=>{
      (h.bonuses||[]).forEach(b=>{
        if(b.card===card.name){ bonus += (b.bonus||0); why.push(`${h.name}+${b.bonus}%`); }
      });
    });
    return {card:card.name, rate:base+bonus, why};
  }).sort((a,b)=>b.rate-a.rate);
  return {hits, list};
}

// Overpass scan with retry
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://z.overpass-api.de/api/interpreter'];
async function scan(){
  const b=map.getBounds();
  const bbox=`${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const q=`[out:json][timeout:15];
  ( node["name"]["shop"](${bbox}); node["name"]["amenity"](${bbox}); way["name"]["shop"](${bbox}); way["name"]["amenity"](${bbox}); ); out center 120;`;
  let data=null;
  for(let i=0;i<endpoints.length;i++){
    try{
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),14000);
      const r=await fetch(endpoints[i],{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:q,signal:ctrl.signal});
      clearTimeout(t);
      if(r.ok){ data=await r.json(); break; }
      await new Promise(res=>setTimeout(res, 600*(i+1)));
    }catch(e){ await new Promise(res=>setTimeout(res, 600*(i+1))); }
  }
  if(!data){ toast('周辺検索に失敗しました（混雑中）'); return; }

  const catsEnabled = new Set(Array.from(document.querySelectorAll('.cat:checked')).map(i=>i.value));
  const markers=[];
  (data.elements||[]).forEach(el=>{
    const lat=el.lat||(el.center&&el.center.lat);
    const lon=el.lon||(el.center&&el.center.lon);
    if(lat==null||lon==null) return;
    const tags=el.tags||{};
    const name=tags.name||'(名称不明)';
    const cat=inferCategory(tags);
    if(!catsEnabled.has(cat)) return;
    const {list}=summarizeRate(name, cat);
    const hasBoost=list.some(x=>x.why.length>0);
    const icon=iconFor(cat, hasBoost);
    const m=L.marker([lat,lon],{icon});
    m.on('click',()=>showPopup([lat,lon], name, cat, list));
    markers.push(m);
  });
  if(layer){ map.removeLayer(layer); }
  layer=L.layerGroup(markers).addTo(map);
  toast('周辺を更新しました');
}

function showPopup(latlng, name, cat, list){
  let html=`<div class="poi-popup"><h4>${name}</h4><div class="note">${cat}</div><hr>`;
  list.slice(0,5).forEach(x=>{
    html += `<div><span class="rate">${x.rate.toFixed(2)}%</span> — ${x.card}`;
    if(x.why.length) html += `<div class="note">${x.why.join('、 ')}</div>`;
    html += `</div>`;
  });
  html += `</div>`;
  L.popup().setLatLng(latlng).setContent(html).openOn(map);
}

// Init map
const map=L.map('map').setView([35.681236,139.767125],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);

// Wire UI
document.getElementById('scan').addEventListener('click', ()=>scan().catch(console.error));
document.getElementById('loc').addEventListener('click', ()=>{
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos=>{ map.setView([pos.coords.latitude,pos.coords.longitude],16); scan(); });
});
document.querySelectorAll('.cat').forEach(cb=>cb.addEventListener('change', ()=>scan().catch(console.error)));

// Load data and optional remote data
(async function init(){
  await loadLocalData();
  // Merge remote
  remoteCfg = localStorage.getItem('payopt.remote')||'';
  const extra = await loadRemoteData();
  if(extra.length){ campaigns = campaigns.concat(extra); toast('Remoteキャンペーンを適用しました'); }
  scan();
})();
})();