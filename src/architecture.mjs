import {png} from './png.mjs';
export function stableSeed(value){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const palettes=[[174,159,136],[145,151,139],[164,138,118],[123,138,146],[183,176,158],[141,116,104]];
const materialTemplate=value=>['brick','metal','concrete'].includes(String(value).toLowerCase())?String(value).toLowerCase():'plaster';
const values=(...items)=>items.filter(Boolean).map(v=>String(v).toLowerCase());
function classification(tags){
  const building=String(tags['building:use']??tags.building??'').toLowerCase(),amenity=String(tags.amenity??'').toLowerCase();
  const all=values(building,amenity,tags.tourism,tags.railway,tags.public_transport,tags.healthcare);
  const has=list=>all.some(v=>list.includes(v));
  if(amenity==='place_of_worship'||has(['church','cathedral','chapel','mosque','synagogue','temple','shrine']))return ['religious',amenity==='place_of_worship'?'osm:amenity':'osm:building'];
  if(has(['hospital','clinic','doctors']))return ['hospital',tags.healthcare?'osm:healthcare':amenity?'osm:amenity':'osm:building'];
  if(has(['school','university','college','kindergarten']))return ['education',amenity?'osm:amenity':'osm:building'];
  if(has(['train_station','transportation','station']))return ['station',tags.railway?'osm:railway':tags.public_transport?'osm:public_transport':'osm:building'];
  if(has(['hotel','motel','hostel','guest_house']))return ['hotel',tags.tourism?'osm:tourism':'osm:building'];
  if(has(['parking','parking_garage','garages','garage']))return ['parking',amenity==='parking'?'osm:amenity':'osm:building'];
  if(has(['sports_hall','stadium','sports_centre']))return ['sports',tags.leisure?'osm:leisure':'osm:building'];
  if(has(['civic','government','public','townhall','courthouse','police','fire_station','prison','library','community_centre','social_facility']))return ['civic',amenity?'osm:amenity':'osm:building'];
  if(['industrial','warehouse','hangar','shed'].includes(building))return ['industrial','osm:building'];
  if(['office','commercial'].includes(building)||(tags.office&&String(tags.office).toLowerCase()!=='no'))return ['office',tags.office?'osm:office':'osm:building'];
  if(['retail','supermarket','kiosk'].includes(building)||(tags.shop&&String(tags.shop).toLowerCase()!=='no'))return ['retail',tags.shop?'osm:shop':'osm:building'];
  if(['house','detached','semidetached_house','terrace','bungalow'].includes(building))return ['house','osm:building'];
  if(['apartments','residential','dormitory'].includes(building))return ['residential','osm:building'];
  return ['generic','unknown-use'];
}
function typeColor(type,variant){
  const fixed={hospital:[188,199,193],education:[158,132,111],religious:[161,153,139],station:[128,145,151],parking:[132,136,134],sports:[146,151,139],civic:[156,148,132],hotel:[176,158,139]};
  const base=fixed[type]??palettes[variant],shift=(variant%3-1)*5;return base.map(v=>Math.max(0,Math.min(255,v+shift)));
}
export function buildingProfile(building){
  const tags=building.extras.osmTags??{},seed=stableSeed(building.extras.sourceId),height=building.extras.height;
  const ring=building.extras.footprint??[];
  const area=Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
  const [type,classificationSource]=classification(tags);
  const variant=seed%6;
  const tallFloor=['industrial','sports','station'].includes(type)?4.5:3;
  const floors=Number(tags['building:levels'])>0?Math.max(1,Math.round(Number(tags['building:levels']))):Math.max(1,Math.round(height/tallFloor));
  const grounds={retail:'shop',industrial:'loading',office:'lobby',parking:'parking',station:'station',hospital:'emergency',education:'school',hotel:'hotel',religious:'worship',civic:'civic',sports:'sports'};
  const ground=grounds[type]??'entrance';
  const named={white:[200,199,184],red:[152,88,72],brown:[133,105,85],grey:[143,146,143],gray:[143,146,143],beige:[183,170,146],yellow:[190,175,124]};
  const color=tags['building:colour']?.toLowerCase();
  const taggedColor=named[color]??(/^#[0-9a-f]{6}$/i.test(color??'')?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):null);
  const defaultMaterials={education:'brick',religious:'brick',station:'metal',parking:'concrete',industrial:'metal',hospital:'plaster'};
  const material=tags['building:material']??defaultMaterials[type]??(variant===2||variant===5?'brick':'plaster'),templateColor=typeColor(type,variant);
  const widths={industrial:5,parking:5.5,station:4.5,office:2.8,hospital:3.2,education:3.4,religious:4,hotel:2.4,sports:4.5,civic:3.2};
  const roof={house:'low-coping',religious:String(tags['roof:shape']??'').toLowerCase()==='flat'?'coping':'spire',office:'equipment',industrial:'equipment',hospital:'equipment',station:'equipment',civic:'equipment',sports:'low-coping'};
  return {type,classificationSource,seed,variant,floors,ground,footprintArea:area,bayWidth:widths[type]??2.2+(seed%4)*.3,floorHeight:height/floors,templateColor,color:taggedColor??templateColor,colorSource:taggedColor?'osm-tag':'procedural-palette',material,materialTemplate:materialTemplate(material),uvOffset:((seed>>>8)%2)*.5,roofDetail:roof[type]??'coping',appearanceSource:'procedural-interpretation',version:3};
}
export function architectureTextureKey(profile,ground=false){return `${ground?'Ground':'Facade'}_${profile.type}_${profile.variant}_${profile.materialTemplate??materialTemplate(profile.material)}`;}
export function architectureTexture(profile,ground=false){
  const width=128,height=128,rgba=new Uint8Array(width*height*4),p=profile;
  const templateSeed=stableSeed(architectureTextureKey(p,ground)),baseColor=p.templateColor??typeColor(p.type,p.variant);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const noise=((Math.imul(x+17,73856093)^Math.imul(y+11,19349663)^templateSeed)>>>0)%11-5;
    let c=baseColor.map(v=>v+noise);
    if((p.materialTemplate??materialTemplate(p.material))==='brick'&&(y%8===0||(x+((Math.floor(y/8)%2)*8))%16===0))c=c.map(v=>v*.75);
    if(!ground){
      const xx=x%64,yy=y%64;
      const window={office:[5,12,59,52],industrial:[12,10,52,28],parking:[3,18,61,29],station:[3,7,61,55],hospital:[8,14,56,45],education:[10,13,54,47],religious:[21,8,43,55],hotel:[17,12,47,51],sports:[9,21,55,43],civic:[11,12,53,49]};
      const [left,top,right,bottom]=window[p.type]??[17-(p.variant%3)*2,12,47+(p.variant%3)*2,p.type==='house'?46:52];
      if(xx>left&&xx<right&&yy>top&&yy<bottom){
        const lit=stableSeed(`${templateSeed}/${Math.floor(x/64)}/${Math.floor(y/64)}`)%5===0;
        c=lit?[183+noise,159+noise,106+noise]:[38+noise,53+noise,63+noise];
        if(xx===32||yy===(p.type==='office'||p.type==='station'?32:30))c=p.variant%2?[157,154,138]:[71,76,75];
        if(xx===left+1||xx===right-1||yy===top+1||yy===bottom-1)c=baseColor.map(v=>v*.6);
      }
      if(p.type==='industrial'&&x%8===0)c=c.map(v=>v*.86);
      if(p.type==='parking'&&yy>27&&yy<35)c=[62+noise,67+noise,68+noise];
      if(p.type==='religious'&&yy<16&&Math.abs(xx-32)>((yy-6)*1.1))c=baseColor.map(v=>v+noise);
      if(p.type==='hospital'&&((xx>27&&xx<37&&yy>21&&yy<37)||(xx>22&&xx<42&&yy>26&&yy<32)))c=[151,61,58];
      if(p.type!=='industrial'&&yy>=59)c=baseColor.map(v=>v*.7);
      if(p.type==='residential'&&p.variant%3===1&&yy===55&&xx>10&&xx<54)c=[198,193,176];
    }else{
      if(y>111)c=baseColor.map(v=>v*.48);
      if(['shop','lobby','station','hotel','school','emergency','civic'].includes(p.ground)){
        if(y<22)c=p.ground==='shop'?[[51,84,80],[119,59,45],[61,77,106]][p.variant%3]:baseColor.map(v=>v*.6);
        if(y>28&&y<113&&x>5&&x<123){c=[31+noise,48+noise,56+noise];if(x%32<3||y===76)c=[134,137,124];if(x>91&&x<95&&y>78&&y<88)c=[187,163,107];}
        if(p.ground==='emergency'&&y<22)c=[151,61,58];
        if(p.ground==='hotel'&&y>19&&y<30&&x>18&&x<110)c=[105,55,50];
      }else if(p.ground==='loading'||p.ground==='parking'){
        if(x>13&&x<115&&y>25&&y<113)c=y%7===0?[65,71,73]:[103+noise,109+noise,109+noise];
      }else if(p.ground==='worship'){
        if(x>31&&x<97&&y>23&&y<117){c=[67+noise,55+noise,45+noise];if(x===64)c=[132,119,97];}
      }else if(p.ground==='sports'){
        if(x>11&&x<117&&y>43&&y<112)c=[75+noise,83+noise,82+noise];
      }else{
        // One doorway and one low window per ground-floor module.
        if(x>17&&x<49&&y>27&&y<117){c=[64+noise,56+noise,46+noise];if(y<61)c=[39,54,61];if(x===42&&y>82&&y<90)c=[180,158,98];}
        if(x>77&&x<113&&y>35&&y<85){c=[35+noise,50+noise,60+noise];if(x===94||y===59)c=[133,128,113];}
      }
    }
    rgba.set([...c.map(v=>Math.max(0,Math.min(255,Math.round(v)))),255],(y*width+x)*4);
  }
  return {name:architectureTextureKey(p,ground),width,height,rgba,png:png(width,height,rgba)};
}
export function facadeUV(mesh,profile,anchor=[0,0]){
  const texcoords=[];
  for(let i=0;i<mesh.positions.length;i+=3){const [x,y,z]=mesh.positions.slice(i,i+3),nx=mesh.normals[i],nz=mesh.normals[i+2];texcoords.push(((x-anchor[0])*nz-(z-anchor[1])*nx)/(profile.bayWidth*2)+(profile.uvOffset??0),-y/(profile.floorHeight*2));}
  return {...mesh,texcoords};
}
