(function(){
let map=L.map('map').setView([35.68,139.76],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(map);

async function fetchCampaigns(){
  const r=await fetch('campaigns.json?v=2');
  return r.json();
}
async function fetchCards(){
  const r=await fetch('cards.json');
  return r.json();
}

function matchCampaign(store,campaigns){
  let hits=[];
  for(const c of campaigns){
    let nameHit=false;
    if(c.match){
      for(const m of c.match){
        if(store.name.includes(m)) nameHit=true;
      }
    }
    if(nameHit || (c.category && store.category===c.category)){
      hits.push(c);
    }
  }
  return hits;
}

async function showStore(lat,lng,name,cat){
  const campaigns=await fetchCampaigns();
  const cards=await fetchCards();
  let store={name:name,category:cat};
  let hits=matchCampaign(store,campaigns);
  let res=[];
  for(const card of cards){
    let base=card.base||1.0;
    let bonus=0;
    for(const h of hits){
      for(const b of h.bonuses){
        if(b.card===card.name) bonus+=b.bonus;
      }
    }
    res.push({card:card.name,rate:base+bonus});
  }
  let html='<b>'+store.name+'</b><br>'+store.category+'<hr>';
  res.forEach(r=>{html+=r.card+': '+r.rate.toFixed(2)+'%<br>'});
  L.popup().setLatLng([lat,lng]).setContent(html).openOn(map);
}

document.getElementById('search').onclick=async ()=>{
  let q=document.getElementById('q').value;
  if(!q)return;
  let url='https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q);
  let r=await fetch(url);let js=await r.json();
  if(js.length>0){
    let p=js[0];
    map.setView([p.lat,p.lon],17);
    showStore(p.lat,p.lon,q,"other");
  }
};
})();