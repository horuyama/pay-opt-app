(function(){
if(typeof L==='undefined'){ console.error('Leaflet not loaded'); return; }

function toast(msg){var t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2500);}

const map = L.map('map').setView([35.681236,139.767125], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap'}).addTo(map);

let campaigns=[], cards=[], layer=null, timer=null;
function clearLayer(){ if(layer){ map.removeLayer(layer); layer=null; } }

function norm(s){return (s||'').toLowerCase();}
function canon(s){return norm(s).replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\-・\s]/g,'').replace(/ﾌｧﾐﾘｰﾏｰﾄ/g,'ファミリーマート').replace(/ｾﾌﾞﾝｲﾚﾌﾞﾝ/g,'セブンイレブン').replace(/ﾛｰｿﾝ/g,'ローソン');}
function like(a,b){return canon(a).includes(canon(b));}

function inferCategory(tags){
  const hay=(tags.shop||'')+' '+(tags.amenity||'')+' '+(tags.brand||'')+' '+(tags.name||'');
  const t=hay.toLowerCase();
  if(t.includes('convenience')||hay.includes('セブン')||hay.includes('ファミリーマート')||hay.includes('ローソン')||t.includes('7-eleven')||t.includes('familymart')||t.includes('lawson')) return 'convenience_store';
  if(t.includes('supermarket')||hay.includes('イオン')||hay.includes('西友')||hay.includes('ライフ')) return 'supermarket';
  if(t.includes('drug')||hay.includes('ドラッグ')||hay.includes('ウエルシア')||hay.includes('マツモトキヨシ')) return 'drugstore';
  if(t.includes('cafe')||t.includes('coffee')||hay.includes('スターバックス')||hay.includes('ドトール')) return 'cafe';
  if(t.includes('restaurant')||hay.includes('松屋')||hay.includes('吉野家')||hay.includes('すき家')) return 'restaurant';
  return 'other';
}

async function loadData(){
  campaigns = await fetch('campaigns.json?v=cdn2').then(r=>r.json());
  cards = await fetch('cards.json?v=cdn2').then(r=>r.json());
}

function matchCampaigns(name, category){
  const now=new Date();
  return campaigns.filter(c=>{
    const b=c.start?new Date(c.start):null, e=c.end?new Date(c.end):null;
    const okTime = (!b||b<=now)&&(!e||now<=e);
    const storeOk = (c.match||[]).some(m=>like(name,m)) || (!!c.store && like(name,c.store));
    const catOk = !c.category || c.category===category || storeOk; // 店名一致ならカテゴリ緩和
    return okTime && (storeOk || (!c.match && !c.store)) && catOk;
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

let endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://z.overpass-api.de/api/interpreter'];

async function scan(){
  const b = map.getBounds();
  const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const q = `[out:json][timeout:15];
  ( node["name"]["shop"](${bbox}); node["name"]["amenity"](${bbox}); way["name"]["shop"](${bbox}); way["name"]["amenity"](${bbox}); ); out center 120;`;
  let data=null;
  for(let i=0;i<endpoints.length;i++){
    try{
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), 14000);
      const r=await fetch(endpoints[i],{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:q,signal:ctrl.signal});
      clearTimeout(t);
      if(r.ok){ data=await r.json(); break; }
      await new Promise(res=>setTimeout(res, 600*(i+1)));
    }catch(e){ await new Promise(res=>setTimeout(res, 600*(i+1))); }
  }
  if(!data){ toast('周辺検索に失敗しました（混雑中）'); return; }

  const markers=[];
  (data.elements||[]).forEach(el=>{
    const lat=el.lat||(el.center&&el.center.lat);
    const lon=el.lon||(el.center&&el.center.lon);
    if(lat==null||lon==null) return;
    const tags=el.tags||{};
    const name=tags.name||'(名称不明)';
    const cat=inferCategory(tags);
    const {list}=summarizeRate(name, cat);
    const hasBoost=list.some(x=>x.why.length>0);
    const icon=L.divIcon({className:'',html:`<div style="transform:translate(-50%,-100%);">
      <svg width="24" height="32" viewBox="0 0 24 32">
        <path d="M12 0C6 0 1.5 4.5 1.5 10.5c0 7.5 10.5 21 10.5 21s10.5-13.5 10.5-21C22.5 4.5 18 0 12 0z" fill="${hasBoost?'#e74c3c':'#bdc3c7'}" stroke="#ffffff" stroke-width="1"/>
        <circle cx="12" cy="11" r="5" fill="#fff"/>
      </svg></div>`});
    const m=L.marker([lat,lon],{icon});
    m.on('click',()=>showPopup([lat,lon], name, cat, list));
    markers.push(m);
  });
  clearLayer();
  layer=L.layerGroup(markers).addTo(map);
  toast('周辺を更新しました');
}

function showPopup(latlng, name, cat, list){
  let html = `<div class="poi-popup"><h4>${name}</h4><div class="note">${cat}</div><hr>`;
  list.slice(0,5).forEach(x=>{
    html += `<div><span class="rate">${x.rate.toFixed(2)}%</span> — ${x.card}`;
    if(x.why.length) html += `<div class="note">${x.why.join('、 ')}</div>`;
    html += `</div>`;
  });
  html += `</div>`;
  L.popup().setLatLng(latlng).setContent(html).openOn(map);
}

document.getElementById('scan').addEventListener('click', ()=> scan().catch(console.error));
document.getElementById('loc').addEventListener('click', ()=>{
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos=>{
    map.setView([pos.coords.latitude, pos.coords.longitude], 16);
    scan();
  });
});

map.on('moveend', ()=>{
  clearTimeout(timer);
  timer=setTimeout(()=>scan().catch(console.error), 300);
});

(async function(){ await loadData(); scan(); })();
})();