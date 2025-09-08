import { computeScore, inferCategory } from './rules.js';

const state = {
  map:null,
  layer:null,
  data:{ cards:[], wallets:[], merchantHints:{}, campaigns:[] },
  prefs:{ prefecture:'' }
};

async function loadJSON(path){ const r = await fetch(path); return r.json(); }

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
}

function saveCampaigns(camps){
  state.data.campaigns = camps;
  localStorage.setItem('campaigns_override', JSON.stringify(camps));
}

function restoreCampaignsOverride(){
  const raw = localStorage.getItem('campaigns_override');
  if(raw){
    try{ state.data.campaigns = JSON.parse(raw); }catch{}
  }
}

function showPanel(el){ el.classList.remove('hidden'); }
function hidePanel(el){ el.classList.add('hidden'); }

function merchantFromOSM(osm){
  const tags = osm.tags||{};
  const name = tags.name || '名称不明';
  const category = inferCategory(tags);
  return {
    id: osm.id,
    name,
    lat: osm.lat, lon: osm.lon,
    category,
    address: [tags['addr:prefecture']||'', tags['addr:city']||'', tags['addr:full']||''].filter(Boolean).join(' '),
    osmTags: tags
  };
}

function renderRecommendations(merchant){
  const recDiv = document.getElementById('recommendations');
  const expDiv = document.getElementById('explanations');
  recDiv.innerHTML=''; expDiv.innerHTML='';

  const { category, candidates } = computeScore(merchant, {...state.data, prefs: state.prefs});

  candidates.slice(0,5).forEach(c=>{
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="badge">${c.type}</div>
      <div class="kicker">${c.brand}</div>
      <div class="rate">${(c.rate).toFixed(2)}%</div>
    `;
    recDiv.appendChild(div);
  });

  const ul = document.createElement('ul');
  candidates.forEach(c=>{
    const li = document.createElement('li');
    const notes = (c.details.notes||[]).concat(c.details.hintBonus?[`カテゴリ優先ヒント +${(c.details.hintBonus*1).toFixed(2)}%`]:[]);
    li.innerHTML = `<strong>${c.type} ${c.brand}</strong> ${(c.rate).toFixed(2)}%` +
      `<br><span class="muted small">内訳: ベース ${(c.details.base||0).toFixed(2)}% / カテゴリ ${c.details.category} / ${notes.join('、 ')||'—'}</span>`;
    ul.appendChild(li);
  });
  expDiv.appendChild(ul);
}

async function initMap(){
  state.map = L.map('map');
  state.map.setView([35.681236,139.767125], 14); // Tokyo Station

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(state.map);

  state.map.on('click', async (e)=>{
    const {lat, lng} = e.latlng;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&namedetails=1`;
    const r = await fetch(url, {headers:{'Accept-Language':'ja'}});
    const j = await r.json();
    const display = j.name || j.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const merchant = {
      id: `tap-${Date.now()}`,
      name: display,
      lat, lon: lng,
      address: j.display_name || '',
      category: 'other',
      osmTags: {}
    };
    openResult(merchant);
  });
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
    viewbox: [center.lng-0.05, center.lat+0.05, center.lng+0.05, center.lat-0.05].join(','),
    bounded: 1,
    limit: 10,
    addressdetails: 1,
    extratags: 1,
    namedetails: 1
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const r = await fetch(url, {headers:{'Accept-Language':'ja'}});
  const list = await r.json();
  if(state.layer) state.map.removeLayer(state.layer);
  const markers = list.map(item=>{
    const m = merchantFromOSM(item);
    const marker = L.marker([m.lat, m.lon]).bindPopup(`<b>${m.name}</b><br>${m.category}`);
    marker.on('click', ()=>openResult(m));
    return marker;
  });
  state.layer = L.layerGroup(markers).addTo(state.map);
  if(list[0]) state.map.setView([list[0].lat, list[0].lon], 16);
}

function bindUI(){
  document.getElementById('searchBtn').addEventListener('click', ()=>{
    const q = document.getElementById('searchInput').value.trim();
    searchPOI(q);
  });
  document.getElementById('locateBtn').addEventListener('click', ()=>{
    navigator.geolocation.getCurrentPosition((pos)=>{
      const {latitude, longitude} = pos.coords;
      state.map.setView([latitude, longitude], 16);
    });
  });
  document.getElementById('closePanel').addEventListener('click', ()=>hidePanel(document.getElementById('resultPanel')));
  document.getElementById('btnSettings').addEventListener('click', ()=>showPanel(document.getElementById('settingsPanel')));
  document.getElementById('closeSettings').addEventListener('click', ()=>hidePanel(document.getElementById('settingsPanel')));
  document.getElementById('resetDataBtn').addEventListener('click', ()=>{
    localStorage.removeItem('campaigns_override');
    alert('キャンペーンを初期化しました（/data/campaigns.json に戻ります）');
    location.reload();
  });
  document.getElementById('prefSelect').addEventListener('change', (e)=>{
    const v = e.target.value; localStorage.setItem('prefecture', v); state.prefs.prefecture = v;
  });
  document.getElementById('importBtn').addEventListener('click', async ()=>{
    const file = document.getElementById('importFile').files[0];
    if(!file) return alert('ファイルを選択してください');
    const text = await file.text();
    let data=[];
    if(file.name.endsWith('.json')){
      data = JSON.parse(text);
    }else{
      // naive CSV: header: name,brand,type,bonus,multiplier,category,store,area,start,end,cap
      const rows = text.split(/\r?\n/).filter(Boolean).map(l=>l.split(','));
      const head = rows.shift();
      data = rows.map(r=>Object.fromEntries(head.map((h,i)=>[h.trim(), r[i] ? r[i].trim() : ''])))
        .map(x=>({ ...x, bonus: parseFloat(x.bonus||0), multiplier: parseFloat(x.multiplier||1) }));
    }
    saveCampaigns(data);
    alert('キャンペーンを取り込みました');
  });
  document.getElementById('exportBtn').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(state.data.campaigns,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'campaigns.export.json';
    a.click();
  });
}

async function main(){
  await loadAll();
  restoreCampaignsOverride();
  await initMap();
  bindUI();

  // Pref init
  const pref = localStorage.getItem('prefecture')||'';
  const el = document.getElementById('prefSelect');
  if(pref) el.value = pref;

  // Register SW
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./service-worker.js');
  }
}

main();
