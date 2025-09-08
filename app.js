(function(){
function showErr(m){var e=document.getElementById('err'); e.textContent='エラー: '+m; e.style.display='block';}
function init(){
  if(typeof L==='undefined'){ showErr('Leafletの読み込みに失敗'); return; }
  try{
    var map=L.map('map').setView([35.681236,139.767125],15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
    // 確認用のクリックイベント
    map.on('click', function(e){ L.popup().setLatLng(e.latlng).setContent('OK: '+e.latlng.lat.toFixed(5)+', '+e.latlng.lng.toFixed(5)).openOn(map); });
  }catch(err){ showErr(err.message||String(err)); }
}
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();