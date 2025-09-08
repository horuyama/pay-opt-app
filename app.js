
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
  function inferCategory(osmTags){
    osmTags = osmTags||{};
    const shop = osmTags.shop, amenity = osmTags.amenity, brand = osmTags.brand, name = osmTags.name;
    const s = (shop||amenity||'') + ' ' + (brand||'') + ' ' + (name||'');
    const t = normalize(s);
    if(t.includes('convenience') || t.includes('newdays') || t.includes('デイリーヤマザキ')) return 'convenience_store';
    if(t.includes('drug') || t.includes('welcia') || t.includes('ウエルシア')) return 'drugstore';
    if(t.includes('supermarket')) return 'supermarket';
    if(t.includes('cafe') || t.includes('coffee') || t.includes('starbucks')) return 'cafe';
    if(t.includes('railway') || t.includes('station') || t.includes('suica') || t.includes('jre')) return 'train_travel';
    if(t.includes('amazon')) return 'amazon';
    return 'other';
  }

  function computeScore(merchant, config){
    const cards = (config.cards||[]), wallets=(config.wallets||[]), merchantHints=(config.merchantHints||{}), campaigns=(config.campaigns||[]), prefs=(config.prefs||{});
    const cat = merchant.category || inferCategory(merchant.osmTags||{});
    const now = new Date();
    const scopeKey = (prefs.prefecture)||'';
    function activeCampaignsFor(targetBrand){
      return campaigns.filter(c=>{
        const begin = c.start ? new Date(c.start) : null;
        const end   = c.end ? new Date(c.end) : null;
        const within = (!begin || begin<=now) && (!end || now<=end);
        const catOk = !c.category || c.category===cat || (Array.isArray(c.category)&&c.category.includes(cat));
        const storeOk = !c.store || (merchant.name||'').toLowerCase().includes((c.store||'').toLowerCase());
        const brandOk = !c.brand || c.brand===targetBrand || (Array.isArray(c.brand)&&c.brand.includes(targetBrand));
        const areaOk = !c.area || c.area===scopeKey;
        return within && catOk && storeOk && brandOk && areaOk;
      });
    }
    function applyCampaign(base, ac){
      let bonus = 0, notes=[]; let b = base;
      ac.forEach(c=>{
        const type = c.type||'add';
        if(type==='add'){ bonus += (c.bonus||0); notes.push(`+${(c.bonus||0).toFixed(2)}% ${c.name||'キャンペーン'}`); }
        if(type==='multi'){ b = b*(c.multiplier||1); notes.push(`${(c.multiplier||1)}倍 ${c.name||'キャンペーン'}`); }
        if(c.cap){ notes.push(`上限あり: ${c.cap}`); }
      });
      return {rate: b+bonus, notes};
    }
    const candidates = [];
    cards.forEach(card=>{
      let base = card.base_rate||0;
      if(card.category_bonus && card.category_bonus[cat]) base += card.category_bonus[cat];
      const out = applyCampaign(base, activeCampaignsFor(card.brand));
      let hint = (merchantHints[cat]?.cards||[]).includes(card.brand) ? 0.05 : 0;
      candidates.push({ type:'カード', brand:card.brand, rate: out.rate + hint, details:{ base, category:cat, notes: out.notes, hintBonus: hint } });
    });
    wallets.forEach(w=>{
      let base = w.base_rate||0;
      if(w.category_bonus && w.category_bonus[cat]) base += w.category_bonus[cat];
      const out = applyCampaign(base, activeCampaignsFor(w.brand));
      let hint = (merchantHints[cat]?.wallets||[]).includes(w.brand) ? 0.05 : 0;
      candidates.push({ type:'QR', brand:w.brand, rate: out.rate + hint, details:{ base, category:cat, notes: out.notes, hintBonus: hint } });
    });
    candidates.sort((a,b)=>b.rate-a.rate);
    return {category: cat, candidates};
  }

  const state = { map:null, layer:null, data:{}, prefs:{prefecture:''} };

  async function loadJSON(path){ const r = await fetch(path); if(!r.ok) throw new Error('読み込み失敗: '+path); return r.json(); }
  async function loadAll(){
    const [cards, wallets, hints, campaigns] = await Promise.all([
      loadJSON('./data/cards.json'),
      loadJSON('./data/wallets.json'),
      loadJSON('./data/merchant_rules.json'),
      loadJSON('./data/campaigns.json').catch(()=>[])
    ]);
    state.data = { cards, wallets, merchantHints:hints, campaigns };
    const pref = localStorage.getItem('prefecture')||'';
    state.prefs.prefecture = pref;
    const raw = localStorage.getItem('campaigns_override');
    if(raw){ try{ state.data.campaigns = JSON.parse(raw); }catch(e){ showErr('キャンペーン復元に失敗'); } }
  }

  function showPanel(el){ el.classList.remove('hidden'); }
  function hidePanel(el){ el.classList.add('hidden'); }

  function merchantFromOSM(item){
    const tags = item.extratags||item.namedetails||{};
    const name = item.display_name?.split(',')[0] || '名称不明';
    const m = {
      id: item.osm_id || item.place_id,
      name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      address: item.display_name || '',
      category: 'other',
      osmTags: tags
    };
    m.category = inferCategory(tags);
    return m;
  }

  function renderRecommendations(merchant){
    const recDiv = document.getElementById('recommendations');
    const expDiv = document.getElementById('explanations');
    recDiv.innerHTML=''; expDiv.innerHTML='';
    const out = computeScore(merchant, {...state.data, prefs: state.prefs});
    out.candidates.slice(0,5).forEach(c=>{
      const div = document.createElement('div');
      div.className='card';
      div.innerHTML = `<div class="badge">${c.type}</div><div class="kicker">${c.brand}</div><div class="rate">${(c.rate).toFixed(2)}%</div>`;
      recDiv.appendChild(div);
    });
    const ul = document.createElement('ul');
    out.candidates.forEach(c=>{
      const li = document.createElement('li');
      const notes = (c.details.notes||[]).concat(c.details.hintBonus?[`カテゴリ優先ヒント +${(c.details.hintBonus*1).toFixed(2)}%`]:[]);
      li.innerHTML = `<strong>${c.type} ${c.brand}</strong> ${(c.rate).toFixed(2)}%<br><span class="muted small">内訳: ベース ${(c.details.base||0).toFixed(2)}% / ${notes.join('、 ')||'—'}</span>`;
      ul.appendChild(li);
    });
    expDiv.appendChild(ul);
  }

  function openResult(merchant){
    document.getElementById('poiName').textContent = merchant.name;
    document.getElementById('poiMeta').textContent = `${merchant.category}  |  ${merchant.address||''}`;
    renderRecommendations(merchant);
    showPanel(document.getElementById('resultPanel'));
  }

  async function searchPOI(query){
    if(!query) return;
    const center = state.map.getCenter();
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '10',
      viewbox: [center.lng-0.05, center.lat+0.05, center.lng+0.05, center.lat-0.05].join(','),
      bounded: '1',
      addressdetails: '1',
      extratags: '1',
      namedetails: '1'
    });
    const url = 'https://nominatim.openstreetmap.org/search?' + params.toString();
    const r = await fetch(url, {headers:{'Accept-Language':'ja'}});
    if(!r.ok){ showErr('検索に失敗しました'); return; }
    const list = await r.json();
    if(state.layer) state.map.removeLayer(state.layer);
    const markers = list.map(item=>{
      const m = merchantFromOSM(item);
      const mk = L.marker([m.lat, m.lon]).bindPopup(`<b>${m.name}</b><br>${m.category}`);
      mk.on('click', ()=>openResult(m));
      return mk;
    });
    state.layer = L.layerGroup(markers).addTo(state.map);
    if(list[0]) state.map.setView([parseFloat(list[0].lat), parseFloat(list[0].lon)], 16);
    if(!list.length) showErr('ヒットなし');
  }

  async function initMap(){
    try{
      state.map = L.map('map', {zoomControl:true});
      state.map.setView([35.681236,139.767125], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap'}).addTo(state.map);
      state.map.on('click', (e)=>{
        const {lat, lng} = e.latlng;
        openResult({id:'tap', name:`ここ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lon:lng, category:'other', address:'', osmTags:{}});
      });
    }catch(e){
      showErr('地図初期化エラー: '+e.message);
    }
  }

  function bindUI(){
    document.getElementById('searchBtn').addEventListener('click', ()=>{
      const q = document.getElementById('searchInput').value.trim(); searchPOI(q).catch(err=>showErr(err.message));
    });
    document.getElementById('locateBtn').addEventListener('click', ()=>{
      if(!navigator.geolocation){ showErr('位置情報が無効です'); return; }
      navigator.geolocation.getCurrentPosition((pos)=>{
        const {latitude, longitude} = pos.coords; state.map.setView([latitude, longitude], 16);
      }, ()=>showErr('現在地が取得できません'));
    });
    document.getElementById('closePanel').addEventListener('click', ()=>document.getElementById('resultPanel').classList.add('hidden'));
    document.getElementById('btnSettings').addEventListener('click', ()=>document.getElementById('settingsPanel').classList.remove('hidden'));
    document.getElementById('closeSettings').addEventListener('click', ()=>document.getElementById('settingsPanel').classList.add('hidden'));
    document.getElementById('resetDataBtn').addEventListener('click', ()=>{ localStorage.removeItem('campaigns_override'); location.reload(); });
    document.getElementById('prefSelect').addEventListener('change', (e)=>{ localStorage.setItem('prefecture', e.target.value); state.prefs.prefecture = e.target.value; });
    document.getElementById('importBtn').addEventListener('click', async ()=>{
      const file = document.getElementById('importFile').files[0];
      if(!file) return showErr('ファイルを選択してください');
      const text = await file.text();
      let data=[];
      try{
        if(file.name.endsWith('.json')){
          data = JSON.parse(text);
        }else{
          const rows = text.split(/\r?\n/).filter(Boolean).map(l=>l.split(','));
          const head = rows.shift();
          data = rows.map(r=>Object.fromEntries(head.map((h,i)=>[h.trim(), r[i] ? r[i].trim() : ''])))
            .map(x=>({ ...x, bonus: parseFloat(x.bonus||0), multiplier: parseFloat(x.multiplier||1) }));
        }
        localStorage.setItem('campaigns_override', JSON.stringify(data));
        state.data.campaigns = data;
        alert('キャンペーンを取り込みました');
      }catch(e){ showErr('取り込み失敗: '+e.message); }
    });
    document.getElementById('exportBtn').addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(state.data.campaigns||[], null, 2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='campaigns.export.json'; a.click();
    });
  }

  async function main(){
    try{
      await loadAll();
      await initMap();
      bindUI();
      const pref = localStorage.getItem('prefecture')||'';
      if(pref){ document.getElementById('prefSelect').value = pref; }
      if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js'); }
    }catch(e){
      showErr(e.message||e.toString());
    }
  }
  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', main); } else { main(); }
})();
