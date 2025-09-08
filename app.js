
(function(){
  function showErr(msg){
    console.error(msg);
    var el = document.getElementById('err');
    if(!el) return;
    el.style.display='block';
    el.textContent = 'エラー: ' + msg;
    setTimeout(()=>{ el.style.display='none'; }, 6000);
  }

  function normalize(text){ return (text||'').toLowerCase(); }
  function inferCategory(tags){
    tags = tags||{};
    const t = normalize((tags.shop||'')+' '+(tags.amenity||'')+' '+(tags.brand||'')+' '+(tags.name||''));
    if(t.includes('convenience')||t.includes('newdays')) return 'convenience_store';
    if(t.includes('drug')||t.includes('welcia')||t.includes('ウエルシア')) return 'drugstore';
    if(t.includes('supermarket')) return 'supermarket';
    if(t.includes('cafe')||t.includes('coffee')||t.includes('starbucks')) return 'cafe';
    if(t.includes('railway')||t.includes('station')||t.includes('suica')||t.includes('jre')) return 'train_travel';
    if(t.includes('amazon')) return 'amazon';
    return 'other';
  }

  function computeScore(merchant, cfg){
    const cards = cfg.cards||[], wallets=cfg.wallets||[], hints=cfg.merchantHints||{}, camps=cfg.campaigns||[], prefs=cfg.prefs||{};
    const cat = merchant.category || inferCategory(merchant.osmTags||{});
    const now = new Date(), area = prefs.prefecture||'';
    function active(target){
      return camps.filter(c=>{
        const b=c.start?new Date(c.start):null, e=c.end?new Date(c.end):null;
        const okTime = (!b||b<=now)&&(!e||now<=e);
        const okCat = !c.category||c.category===cat||(Array.isArray(c.category)&&c.category.includes(cat));
        const okBrand = !c.brand||c.brand===target||(Array.isArray(c.brand)&&c.brand.includes(target));
        const okStore = !c.store||normalize(merchant.name||'').includes(normalize(c.store));
        const okArea = !c.area||c.area===area;
        return okTime&&okCat&&okBrand&&okStore&&okArea;
      });
    }
    function apply(base, arr){
      let bonus=0, notes=[], b=base;
      arr.forEach(c=>{ if((c.type||'add')==='add'){ bonus+=(+c.bonus||0); notes.push(`+${(+c.bonus||0).toFixed(2)}% ${c.name||''}`); } else { b=b*(+c.multiplier||1); notes.push(`${(+c.multiplier||1)}倍 ${c.name||''}`);} if(c.cap) notes.push(`上限:${c.cap}`);});
      return {rate:b+bonus, notes};
    }
    const cand=[];
    cards.forEach(card=>{
      let base=+card.base_rate||0; if(card.category_bonus&&card.category_bonus[cat]) base+=+card.category_bonus[cat];
      const out=apply(base, active(card.brand)); const hint=(hints[cat]?.cards||[]).includes(card.brand)?0.05:0;
      cand.push({type:'カード',brand:card.brand,rate:out.rate+hint,details:{base,notes:out.notes,hintBonus:hint}});
    });
    wallets.forEach(w=>{
      let base=+w.base_rate||0; if(w.category_bonus&&w.category_bonus[cat]) base+=+w.category_bonus[cat];
      const out=apply(base, active(w.brand)); const hint=(hints[cat]?.wallets||[]).includes(w.brand)?0.05:0;
      cand.push({type:'QR',brand:w.brand,rate:out.rate+hint,details:{base,notes:out.notes,hintBonus:hint}});
    });
    cand.sort((a,b)=>b.rate-a.rate);
    return {category:cat,candidates:cand};
  }

  const state={map:null,layer:null,data:{},prefs:{prefecture:''}};

  async function loadJSON(p){const r=await fetch(p); if(!r.ok) throw new Error('読み込み失敗:'+p); return r.json();}
  async function loadAll(){
    const [cards,wallets,hints,campaigns]=await Promise.all([
      loadJSON('./cards.json'),loadJSON('./wallets.json'),loadJSON('./merchant_rules.json'),loadJSON('./campaigns.json').catch(()=>[])
    ]);
    state.data={cards,wallets,merchantHints:hints,campaigns};
    state.prefs.prefecture=localStorage.getItem('prefecture')||'';
    const raw=localStorage.getItem('campaigns_override'); if(raw){ try{state.data.campaigns=JSON.parse(raw);}catch{} }
  }

  function merchantFromOSM(item){
    const tags=item.extratags||item.namedetails||{};
    const name=(item.display_name||'').split(',')[0]||'名称不明';
    const m={id:item.osm_id||item.place_id,name,lat:+item.lat,lon:+item.lon,address:item.display_name||'',category:'other',osmTags:tags};
    m.category=inferCategory(tags); return m;
  }

  function renderRecommendations(m){
    const rec=document.getElementById('recommendations'), ex=document.getElementById('explanations'); rec.innerHTML=''; ex.innerHTML='';
    const out=computeScore(m,{...state.data,prefs:state.prefs});
    out.candidates.slice(0,5).forEach(c=>{
      const d=document.createElement('div'); d.className='card';
      d.innerHTML=`<div class="badge">${c.type}</div><div class="kicker">${c.brand}</div><div class="rate">${c.rate.toFixed(2)}%</div>`; rec.appendChild(d);
    });
    const ul=document.createElement('ul');
    out.candidates.forEach(c=>{
      const li=document.createElement('li'); const notes=(c.details.notes||[]).concat(c.details.hintBonus?[`カテゴリ優先ヒント +${c.details.hintBonus.toFixed(2)}%`]:[]);
      li.innerHTML=`<strong>${c.type} ${c.brand}</strong> ${c.rate.toFixed(2)}%<br><span class="muted small">内訳: ベース ${c.details.base.toFixed(2)}% / ${notes.join('、 ')||'—'}</span>`; ul.appendChild(li);
    });
    ex.appendChild(ul);
  }

  function openResult(m){
    document.getElementById('poiName').textContent=m.name;
    document.getElementById('poiMeta').textContent=`${m.category} | ${m.address||''}`;
    renderRecommendations(m);
    document.getElementById('resultPanel').classList.remove('hidden');
  }

  async function searchPOI(q){
    if(!q) return;
    const center=state.map.getCenter();
    const params=new URLSearchParams({q,format:'jsonv2',limit:'10',
      viewbox:[center.lng-0.05,center.lat+0.05,center.lng+0.05,center.lat-0.05].join(','),bounded:'1',addressdetails:'1',extratags:'1',namedetails:'1'});
    const r=await fetch('https://nominatim.openstreetmap.org/search?'+params.toString(),{headers:{'Accept-Language':'ja'}});
    if(!r.ok){ showErr('検索に失敗'); return; }
    const list=await r.json();
    if(state.layer) state.map.removeLayer(state.layer);
    const markers=list.map(it=>{const m=merchantFromOSM(it); const mk=L.marker([m.lat,m.lon]).bindPopup(`<b>${m.name}</b><br>${m.category}`); mk.on('click',()=>openResult(m)); return mk;});
    state.layer=L.layerGroup(markers).addTo(state.map);
    if(list[0]) state.map.setView([+list[0].lat,+list[0].lon],16);
    if(!list.length) showErr('ヒットなし');
  }

  async function initMap(){
    try{
      state.map=L.map('map',{zoomControl:true}); state.map.setView([35.681236,139.767125],14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(state.map);
      state.map.on('click',(e)=>{const {lat,lng}=e.latlng; openResult({id:'tap',name:`ここ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,lat,lon:lng,category:'other',address:'',osmTags:{}});});
    }catch(e){ showErr('地図初期化エラー:'+e.message); }
  }

  function bindUI(){
    document.getElementById('searchBtn').addEventListener('click',()=>{const q=document.getElementById('searchInput').value.trim(); searchPOI(q).catch(err=>showErr(err.message));});
    document.getElementById('locateBtn').addEventListener('click',()=>{ if(!navigator.geolocation){showErr('位置情報が無効');return;} navigator.geolocation.getCurrentPosition(p=>{state.map.setView([p.coords.latitude,p.coords.longitude],16);},()=>showErr('現在地取得不可'));});
    document.getElementById('closePanel').addEventListener('click',()=>document.getElementById('resultPanel').classList.add('hidden'));
    document.getElementById('btnSettings').addEventListener('click',()=>document.getElementById('settingsPanel').classList.remove('hidden'));
    document.getElementById('closeSettings').addEventListener('click',()=>document.getElementById('settingsPanel').classList.add('hidden'));
    document.getElementById('resetDataBtn').addEventListener('click',()=>{localStorage.removeItem('campaigns_override'); location.reload();});
    document.getElementById('prefSelect').addEventListener('change',(e)=>{localStorage.setItem('prefecture',e.target.value); state.prefs.prefecture=e.target.value;});
    document.getElementById('importBtn').addEventListener('click',async()=>{
      const file=document.getElementById('importFile').files[0]; if(!file) return showErr('ファイルを選択');
      const text=await file.text(); let data=[];
      try{ if(file.name.endsWith('.json')){data=JSON.parse(text);} else {const rows=text.split(/\r?\n/).filter(Boolean).map(l=>l.split(',')); const head=rows.shift(); data=rows.map(r=>Object.fromEntries(head.map((h,i)=>[h.trim(),r[i]?r[i].trim():'']))).map(x=>({...x,bonus:parseFloat(x.bonus||0),multiplier:parseFloat(x.multiplier||1)}));}
        localStorage.setItem('campaigns_override',JSON.stringify(data)); state.data.campaigns=data; alert('キャンペーンを取り込みました');
      }catch(e){ showErr('取り込み失敗:'+e.message);}
    });
    document.getElementById('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state.data.campaigns||[],null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='campaigns.export.json'; a.click();});
  }

  async function main(){
    try{
      await loadAll(); await initMap(); bindUI();
      const pref=localStorage.getItem('prefecture')||''; if(pref){ document.getElementById('prefSelect').value=pref; }
      if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js'); }
    }catch(e){ showErr(e.message||e.toString()); }
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',main);} else { main(); }
})();
