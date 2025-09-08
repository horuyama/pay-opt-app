// rules.js: scoring engine
export function normalize(text){ return (text||'').toLowerCase(); }

export function inferCategory(osmTags={}){
  const shop = osmTags.shop, amenity = osmTags.amenity, brand = osmTags.brand, name = osmTags.name;
  const s = (shop||amenity||'') + ' ' + (brand||'') + ' ' + (name||'');
  const t = normalize(s);
  if(t.includes('convenience') || t.includes('新デイズ') || t.includes('newdays')) return 'convenience_store';
  if(t.includes('drug') || t.includes('welcia') || t.includes('ウエルシア')) return 'drugstore';
  if(t.includes('supermarket')) return 'supermarket';
  if(t.includes('cafe') || t.includes('coffee') || t.includes('starbucks')) return 'cafe';
  if(t.includes('railway') || t.includes('station') || t.includes('suica') || t.includes('jre')) return 'train_travel';
  if(t.includes('amazon')) return 'amazon';
  return 'other';
}

export function computeScore(merchant, config){
  const {cards, wallets, merchantHints, campaigns, prefs} = config;
  const cat = merchant.category || inferCategory(merchant.osmTags||{});
  const now = new Date();
  const scopeKey = (prefs?.prefecture)||'';

  function activeCampaignsFor(targetBrand){
    return campaigns.filter(c=>{
      const begin = c.start ? new Date(c.start) : null;
      const end   = c.end ? new Date(c.end) : null;
      const within = (!begin || begin<=now) && (!end || now<=end);
      const catOk = !c.category || c.category===cat || (Array.isArray(c.category)&&c.category.includes(cat));
      const storeOk = !c.store || normalize(merchant.name||'').includes(normalize(c.store));
      const brandOk = !c.brand || c.brand===targetBrand || (Array.isArray(c.brand)&&c.brand.includes(targetBrand));
      const areaOk = !c.area || c.area===scopeKey;
      return within && catOk && storeOk && brandOk && areaOk;
    });
  }

  function applyCampaign(base, ac){
    let bonus = 0, notes=[];
    ac.forEach(c=>{
      const type = c.type||'add'; // add: +%, multi: x倍, cap: 上限付き
      if(type==='add'){ bonus += (c.bonus||0); notes.push(`+${(c.bonus||0).toFixed(2)}% ${c.name||'キャンペーン'}`); }
      if(type==='multi'){ base = base*(c.multiplier||1); notes.push(`${(c.multiplier||1)}倍 ${c.name||'キャンペーン'}`); }
      if(c.cap){ notes.push(`上限あり: ${c.cap}`); }
    });
    return {rate: base+bonus, notes};
  }

  const candidates = [];

  // Cards
  (cards||[]).forEach(card=>{
    let base = card.base_rate||0;
    if(card.category_bonus && card.category_bonus[cat]) base += card.category_bonus[cat];
    const ac = activeCampaignsFor(card.brand);
    const out = applyCampaign(base, ac);
    let hint = (merchantHints[cat]?.cards||[]).includes(card.brand) ? 0.05 : 0;
    candidates.push({
      type:'カード', brand:card.brand, rate: out.rate + hint,
      details: { base, category: cat, campaigns: ac, notes: out.notes, hintBonus: hint }
    });
  });

  // QR wallets
  (wallets||[]).forEach(w=>{
    let base = w.base_rate||0;
    if(w.category_bonus && w.category_bonus[cat]) base += w.category_bonus[cat];
    const ac = activeCampaignsFor(w.brand);
    const out = applyCampaign(base, ac);
    let hint = (merchantHints[cat]?.wallets||[]).includes(w.brand) ? 0.05 : 0;
    candidates.push({
      type:'QR', brand:w.brand, rate: out.rate + hint,
      details: { base, category: cat, campaigns: ac, notes: out.notes, hintBonus: hint }
    });
  });

  candidates.sort((a,b)=>b.rate-a.rate);
  return {category: cat, candidates};
}
