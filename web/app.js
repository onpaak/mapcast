import {normalizeLongitude,normalizeBounds,boundsFromCorners,validateSelection,normalizeArea,validateAreaSelection} from './bounds.js';
import {t,getLanguage,setLanguage,applyStatic,locale} from './i18n.js';

const $=id=>document.getElementById(id);
const SIDES=['west','south','east','north'],home=[13.401,52.527,13.407,52.531];
const LOCKED=[...SIDES,'provider','offline','select','select-area','area-points','example','locate','search','recent','delete-result'];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const storage={get:key=>{try{return localStorage.getItem(key);}catch{return null;}},set:(key,value)=>{try{localStorage.setItem(key,value);}catch{}}};
const canvas=document.querySelector('.canvas');

// Messages are kept as [key, params] so a language switch can redraw them.
const messages={status:['statusIdle'],help:['helpIdle']};
function say(target,key,params={}){messages[target]=[key,params];drawMessages();}
function drawMessages(){
  $('status').textContent=job?t('elapsed',{stage:t('stage_'+job.stage),seconds:Math.round((Date.now()-job.started)/1000)}):t(...messages.status);
  $('map-help').textContent=t(...messages.help);
}

let drawing=null,first=null,draftPoints=[],shape='box',areaPoints=null,sourceLayer=null,result=null,recent=[],job=null;
let viewer=null,viewerFailed=false,loadedModel=null,look=storage.get('mapcast-look')??'day';

// ---- Map and selection ----
// The selection is a box (the west/south/east/north fields) or a four-point area whose
// corners can be dragged; downloads always use the box around it.
const map=L.map('map',{zoomAnimation:!reduced,fadeAnimation:!reduced,zoomSnap:.25,zoomDelta:.5}).setView([52.529,13.404],16);
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>');
L.control.scale({imperial:false}).addTo(map);
const outline={color:'#c2571f',weight:2,fillOpacity:.07,interactive:false};
const selection=L.rectangle([[home[1],home[0]],[home[3],home[2]]],outline).addTo(map);
const areaLayer=L.polygon([],outline),draft=L.polyline([],{...outline,dashArray:'5 5'});
let handles=[];
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,updateWhenIdle:true});
tiles.on('tileerror',()=>say('help','tileError'));
function showTiles(on){$('tiles').checked=on;on?tiles.addTo(map):map.removeLayer(tiles);storage.set('mapcast-tiles',on?'1':'0');}
$('tiles').onchange=()=>showTiles($('tiles').checked);

const bounds=()=>SIDES.map(id=>$(id).value.trim()===''?NaN:Number($(id).value));
const limit=()=>$('provider').value==='map-api'?1000:3000;
const latLngs=points=>points.map(([lon,lat])=>[lat,lon]);
const selectionKey=()=>shape==='area'?'area:'+JSON.stringify(areaPoints):'box:'+JSON.stringify(bounds());
const resultKey=summary=>summary.area?'area:'+JSON.stringify(normalizeArea(summary.area.slice(0,-1))):'box:'+JSON.stringify(summary.bounds);
function validate(){
  const km=v=>(v/1000).toFixed(2);
  const check=shape==='area'?validateAreaSelection(areaPoints,limit()):validateSelection(bounds(),limit());
  $('size').textContent=Number.isFinite(check.distance)?t('size',{distance:km(check.distance),limit:limit()/1000}):t('sizeMissing');
  $('validation').textContent=check.error?t('err_'+check.error,{distance:km(check.distance),limit:limit()/1000}):'';
  for(const id of SIDES)$(id).setAttribute('aria-invalid',String(shape==='box'&&(check.invalid??[]).includes(id)));
  $('area-points').setAttribute('aria-invalid',String(shape==='area'&&!check.valid));
  $('generate').disabled=!check.valid||!!job||!!drawing;
  // A result for another area stays viewable, but the 3D view says so.
  const stale=!!result&&selectionKey()!==resultKey(result.report.summary);
  $('stale-note').hidden=!stale;
  if(!job&&stale)say('status','statusChanged');
  syncExample();
  return check.valid;
}
// The examples menu names an example while the selection is exactly that box.
function syncExample(){
  const key=shape==='box'?bounds().join(','):'';
  $('example').value=[...$('example').options].find(o=>o.value&&o.value.split(',').map(Number).join(',')===key)?.value??'';
}
// Puts the current shape on the map and shows its fields under Advanced.
function showShape(){
  const area=shape==='area';
  if(area){map.removeLayer(selection);areaLayer.setLatLngs(latLngs(areaPoints)).addTo(map);}
  else{map.removeLayer(areaLayer);selection.addTo(map);}
  for(const handle of handles)map.removeLayer(handle);
  handles=area?areaPoints.map((point,i)=>{
    const handle=L.marker([point[1],point[0]],{draggable:true,keyboard:false,icon:L.divIcon({className:'vertex',html:'<span></span>',iconSize:[14,14]})}).addTo(map);
    // The corner follows the pointer 1:1 and the area is re-checked as it moves.
    handle.on('drag',e=>{const {lat,lng}=e.target.getLatLng();areaPoints[i]=[Number(normalizeLongitude(lng).toFixed(6)),Number(lat.toFixed(6))];areaLayer.setLatLngs(latLngs(areaPoints));validate();});
    handle.on('dragend',()=>setArea(areaPoints));
    return handle;
  }):[];
  $('box-fields').hidden=area;$('area-field').hidden=!area;
}
function fitSelection(){map.invalidateSize();map.fitBounds((shape==='area'?areaLayer:selection).getBounds(),{padding:[60,60],animate:false});}
function setBounds(input,fit=false){
  const b=normalizeBounds(input);SIDES.forEach((id,i)=>$(id).value=b[i]);
  shape='box';showShape();
  if(!validate())return;
  selection.setBounds([[b[1],b[0]],[b[3],b[2]]]);
  if(fit)fitSelection();
}
function setArea(points,fit=false){
  areaPoints=normalizeArea(points);shape='area';
  $('area-points').value=areaPoints.map(p=>p.join(', ')).join('\n');
  showShape();validate();
  if(fit)fitSelection();
}

function startDraw(kind){
  view('map');stopDraw();drawing=kind;
  const button=$(kind==='box'?'select':'select-area');button.setAttribute('aria-pressed','true');button.textContent=t('cancelDraw');
  $('map').classList.add('crosshair');
  if(kind==='area')draft.setLatLngs([]).addTo(map);
  say('help',kind==='area'?'helpAreaFirst':'helpFirst');validate();
}
function stopDraw(){
  drawing=null;first=null;draftPoints=[];map.removeLayer(draft);
  for(const id of ['select','select-area'])$(id).setAttribute('aria-pressed','false');
  $('select').textContent=t('drawBox');$('select-area').textContent=t('drawArea');
  $('map').classList.remove('crosshair');validate();
}
function cancelDraw(){stopDraw();if(shape==='box')setBounds(bounds());else showShape();say('help','helpCancelled');}
$('select').onclick=()=>drawing==='box'?cancelDraw():startDraw('box');
$('select-area').onclick=()=>drawing==='area'?cancelDraw():startDraw('area');
map.on('click',e=>{
  if(drawing==='box'){
    if(!first){first=e.latlng;selection.addTo(map);say('help','helpSecond');return;}
    const b=boundsFromCorners(first,e.latlng);stopDraw();setBounds(b);say('help','helpDone');
  }else if(drawing==='area'){
    draftPoints.push([e.latlng.lng,e.latlng.lat]);
    if(draftPoints.length<4){say('help','helpAreaNext',{count:4-draftPoints.length});return;}
    const points=draftPoints;stopDraw();
    if(validateAreaSelection(normalizeArea(points),limit()).error==='notConvex'){if(areaPoints&&shape==='area')showShape();say('help','helpAreaInvalid');return;}
    setArea(points);say('help','helpDone');
  }
});
map.on('mousemove',e=>{
  if(drawing==='box'&&first)selection.setBounds(L.latLngBounds(first,e.latlng));
  if(drawing==='area'&&draftPoints.length)draft.setLatLngs([...latLngs(draftPoints),e.latlng]);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawing)cancelDraw();});
$('example').onchange=()=>{const value=$('example').value;if(!value)return;stopDraw();view('map');setBounds(value.split(',').map(Number),true);};
$('locate').onclick=()=>{stopDraw();view('map');if(shape==='box')setBounds(bounds(),true);else fitSelection();};
for(const id of SIDES)$(id).addEventListener('input',()=>{if(validate()){const b=bounds();selection.setBounds([[b[1],b[0]],[b[3],b[2]]]);}});
$('provider').addEventListener('input',validate);
for(const id of ['west','east'])$(id).addEventListener('change',()=>{const value=Number($(id).value);if(Number.isFinite(value))$(id).value=normalizeLongitude(value);validate();});
// Four "lon, lat" lines; the area follows as soon as all four parse.
$('area-points').addEventListener('input',()=>{
  const points=$('area-points').value.trim().split(/\n+/).map(line=>line.split(/[,\s]+/).filter(Boolean).map(Number));
  if(points.length===4&&points.every(p=>p.length===2&&p.every(Number.isFinite))){areaPoints=normalizeArea(points);showShape();}
  else areaPoints=null;
  validate();
});
$('area-points').addEventListener('change',()=>{if(areaPoints)setArea(areaPoints);});

// ---- Place search (Nominatim through the local server; one search per submit) ----
function showSearchNote(text){const li=document.createElement('li');li.className='note';li.textContent=text;$('search-results').replaceChildren(li);$('search-results').hidden=false;}
$('search-form').onsubmit=async e=>{
  e.preventDefault();const query=$('search').value.trim();if(!query)return;
  showSearchNote(t('searching'));
  try{
    const places=await api('/api/search?'+new URLSearchParams({q:query,lang:getLanguage()}));
    if(!places.length){showSearchNote(t('searchNone'));return;}
    $('search-results').replaceChildren(...places.map(place=>{
      const li=document.createElement('li'),button=document.createElement('button');
      button.type='button';button.textContent=place.name;button.onclick=()=>placeArea(place);
      li.append(button);return li;
    }));
  }catch(error){showSearchNote(t('searchError',{error:error.message}));}
};
// A 400 m square around the chosen place; the user can redraw it.
function placeArea({lat,lon}){
  const dLat=200/111195,dLon=200/(111195*Math.cos(lat*Math.PI/180));
  $('search-results').hidden=true;stopDraw();view('map');
  setBounds([lon-dLon,lat-dLat,lon+dLon,lat+dLat].map(v=>Number(v.toFixed(6))),true);say('help','helpPlaced');
}

// OSM outlines of the current result, clickable back to their source objects.
function showSource(data){
  if(sourceLayer)map.removeLayer(sourceLayer);
  const isEnvironment=p=>p?.natural||p?.landuse||['park','garden','nature_reserve'].includes(p?.leisure);
  sourceLayer=L.geoJSON(data,{
    style:f=>({color:f.properties?.building?'#3b5c4d':isEnvironment(f.properties)?'#4d7657':'#a77c36',weight:f.properties?.building?1:2,fillColor:isEnvironment(f.properties)?'#739174':'#829581',fillOpacity:.4}),
    pointToLayer:(f,latlng)=>L.circleMarker(latlng,{radius:3,color:'#315a3b',fillOpacity:.8}),
    onEachFeature:(f,layer)=>{
      const content=document.createElement('div'),label=document.createElement('strong');
      label.textContent=f.properties?.name??f.id;content.append(label);
      const id=String(f.id).match(/^(way|relation|node)\/\d+/)?.[0];
      if(id){const a=document.createElement('a');a.href='https://www.openstreetmap.org/'+id;a.textContent=' '+t('osmLink');a.target='_blank';a.rel='noopener';content.append(a);}
      layer.bindPopup(content);
    }
  }).addTo(map);
  (shape==='area'?areaLayer:selection).bringToFront();
}

// ---- Views: map and 3D preview ----
function view(name){
  const preview=name==='preview';
  canvas.dataset.view=name;$('map-pane').hidden=preview;$('preview-pane').hidden=!preview;
  $('map-tab').setAttribute('aria-pressed',String(!preview));$('preview-tab').setAttribute('aria-pressed',String(preview));
  if(preview)showModel();else map.invalidateSize();
  viewer?.setActive(preview);
}
$('map-tab').onclick=()=>view('map');
$('preview-tab').onclick=()=>{if(result)view('preview');else say('status','statusNeedResult');};

async function ensureViewer(){
  if(viewer||viewerFailed)return viewer;
  try{const {createViewer}=await import('./viewer.js');viewer=createViewer($('viewer'));viewer.setLook(look);}
  catch{viewerFailed=true;}
  return viewer;
}
// Loads the current result into the viewer, or falls back to the still overview image.
async function showModel(){
  if(!result||loadedModel===result.base)return;
  loadedModel=result.base;
  const v=await ensureViewer();
  $('preview').src=result.base+'preview-overview.png';$('preview').hidden=!!v;$('viewer').hidden=!v;
  if(!v){$('viewer-status').textContent=t('noWebgl');return;}
  const base=result.base;
  try{
    await v.load(base+'city.glb',bytes=>{if(base===result.base)$('viewer-status').textContent=t('viewerLoading',{mb:(bytes/1e6).toFixed(1)});});
    if(base===result.base)$('viewer-status').textContent=t('viewerHint');
    v.setActive(!$('preview-pane').hidden);
  }catch(error){loadedModel=null;$('viewer-status').textContent=t('viewerError',{error:error.message});}
}
function setLook(next){
  look=next;storage.set('mapcast-look',next);viewer?.setLook(next);
  $('look-day').setAttribute('aria-pressed',String(next==='day'));$('look-night').setAttribute('aria-pressed',String(next==='night'));
  $('sample').src=`/samples/${next}.jpg`;
}
$('look-day').onclick=()=>setLook('day');$('look-night').onclick=()=>setLook('night');

// ---- Result card ----
const list=(entries,prefix)=>Object.entries(entries??{}).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${t(prefix+k)} ${n}`).join(' · ');
const element=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
function recentLabel(entry){
  if(!entry.name.startsWith('web-'))return `${entry.name} · ${entry.buildings}`;
  const time=new Intl.DateTimeFormat(locale(),{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(entry.time);
  return t('recentWeb',{time,buildings:entry.buildings});
}
function drawRecent(){
  $('recent').hidden=!recent.length;
  $('recent').replaceChildren(...recent.map(entry=>{const option=element('option',recentLabel(entry));option.value=entry.name;return option;}));
  if(result)$('recent').value=result.name;
}
function drawResult(){
  $('result-empty').hidden=!!result;$('result-view').hidden=!result;
  if(!result)return;
  const s=result.report.summary,d=s.buildingDiagnostics,m=s.model;
  $('m-buildings').textContent=s.buildings.toLocaleString(locale());
  $('m-triangles').textContent=m?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(m.triangles):'-';
  $('m-size').textContent=m?`${(m.bytes/1e6).toFixed(1)} MB`:'-';
  $('m-options').textContent=m?t('options',{detail:t('detail_'+m.detail)}):'';
  $('empty-help').hidden=s.buildings>0;$('empty-help').textContent=d?.skippedBuildings>0?t('emptySkipped'):t('emptyNone');
  $('download').href=result.base+'city.glb';

  $('more-files').replaceChildren(...[['fileReport','source-index.json'],['fileMap','source-map.svg'],['fileMetadata','metadata.json'],['fileAttribution','ATTRIBUTION.txt']].map(([key,path])=>{
    const li=document.createElement('li'),a=element('a',t(key));a.href=result.base+path;
    if(path.endsWith('.svg')){a.target='_blank';a.rel='noopener';}else a.download=path;
    li.append(a);return li;
  }));
  const counts={};for(const w of result.report.warnings)counts[w.reason]=(counts[w.reason]??0)+1;
  const skipped=document.createElement('ul');
  skipped.replaceChildren(...(Object.keys(counts).length?Object.entries(counts).map(([reason,count])=>t('warningCount',{count,reason:t(reason)})):[t('noWarnings')]).map(text=>element('li',text)));
  $('details').replaceChildren(
    ...(s.architectureTypes?[element('p',t('detailsTypes',{list:list(s.architectureTypes,'type_')}))]:[]),
    element('p',t('detailsRoads',{roads:s.roads,courtyards:s.courtyardBuildings})),
    ...(s.environment&&Object.keys(s.environment).length?[element('p',t('detailsEnvironment',{list:list(s.environment,'env_')}))]:[]),
    element('p',d?t('diagnostics',{received:d.receivedBuildings??d.parsedBuildings,outside:d.outsideBuildings??0,generated:d.generatedBuildings,skipped:d.skippedBuildings,boundary:d.boundaryBuildings??0}):t('diagnosticsMissing')),
    element('p',t('skipped')),skipped
  );
}
async function openResult(entry){
  const report=await api(entry.base+'source-index.json');
  result={...entry,report};drawResult();drawRecent();
  if(report.summary.area)setArea(report.summary.area.slice(0,-1),true);else setBounds(report.summary.bounds,true);
  if(!$('preview-pane').hidden)showModel();
  try{showSource(await api(entry.base+'area.geojson'));}catch{/* Outlines are optional. */}
}
async function loadRecent(){recent=await api('/api/results');drawRecent();return recent;}
$('recent').onchange=()=>{const entry=recent.find(r=>r.name===$('recent').value);if(entry)openResult(entry).catch(error=>say('status','statusFailed',{error:error.message}));};
// Deleting removes the result folder on this computer, then shows the next newest result.
$('delete-result').onclick=async()=>{
  if(!result||job||!confirm(t('confirmDelete',{name:recentLabel(result)})))return;
  try{
    await api('/api/results/'+encodeURIComponent(result.name),{method:'DELETE'});
    result=null;loadedModel=null;
    if(sourceLayer){map.removeLayer(sourceLayer);sourceLayer=null;}
    const [next]=await loadRecent();
    if(next)await openResult(next);else{drawResult();view('map');validate();}
    say('status','statusDeleted');
  }catch(error){say('status','deleteFailed',{error:error.message});}
};
$('card-toggle').onclick=()=>{
  const collapsed=$('result-card').classList.toggle('collapsed');
  $('card-toggle').setAttribute('aria-expanded',String(!collapsed));$('card-toggle').textContent=collapsed?'+':'−';
};

// ---- Generation ----
async function api(path,options){const r=await fetch(path,options),data=await r.json();if(!r.ok)throw new Error(data?.error??r.statusText);return data;}
function lock(on){
  for(const id of LOCKED)$(id).disabled=on;for(const radio of document.querySelectorAll('[name=detail]'))radio.disabled=on;
  $('generate').firstElementChild.textContent=t(on?'generating':'generate');$('progress').hidden=!on;validate();
}
$('generate').onclick=async()=>{
  if(!validate()||job)return;
  job={stage:'loading',started:Date.now()};lock(true);drawMessages();
  const ticker=setInterval(drawMessages,1000);
  let outcome;
  try{
    const body={...(shape==='area'?{area:areaPoints}:{bounds:bounds()}),provider:$('provider').value,offline:$('offline').checked,lite:document.querySelector('[name=detail]:checked').value==='lite'};
    const {id}=await api('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let state;
    do{await new Promise(r=>setTimeout(r,1000));state=await api('/api/jobs/'+id);job.stage=state.stage;drawMessages();}while(state.state==='running');
    if(state.state==='error')throw new Error(state.message);
    const seconds=Math.round((Date.now()-job.started)/1000);
    job=null;await loadRecent();
    await openResult(recent.find(r=>r.name===state.name)??{name:state.name,base:state.base,time:Date.now(),buildings:state.report.summary.buildings});
    outcome=[state.report.summary.buildings?'stage_done':'statusNoBuildings',{seconds}];
  }catch(error){outcome=['statusFailed',{error:error.message}];}
  // Unlock first: re-validating the selection must not overwrite the outcome message.
  clearInterval(ticker);job=null;lock(false);say('status',...outcome);
  if(outcome[0]!=='statusFailed'){
    // The card materializes from its corner so a new result is noticed.
    const card=$('result-card');card.classList.remove('collapsed','arrive');void card.offsetWidth;card.classList.add('arrive');view('preview');
  }
};

// ---- Help and language ----
$('help-open').onclick=()=>$('help-dialog').showModal();
$('help-close').onclick=()=>$('help-dialog').close();
$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog'))$('help-dialog').close();});
function redraw(){
  applyStatic();
  $('select').textContent=t(drawing==='box'?'cancelDraw':'drawBox');$('select-area').textContent=t(drawing==='area'?'cancelDraw':'drawArea');$('generate').firstElementChild.textContent=t(job?'generating':'generate');
  drawMessages();validate();drawRecent();drawResult();
}
$('language').onclick=()=>{setLanguage(getLanguage()==='zh'?'en':'zh');redraw();};

// ---- Start ----
view('map');redraw();setLook(look);showTiles(storage.get('mapcast-tiles')!=='0');setBounds(home,true);
try{const [latest]=await loadRecent();if(latest)await openResult(latest);}
catch{/* No earlier result: start on the example area. */}
