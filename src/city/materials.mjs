import {surfaceTile,weatheredPaintTile,timberTile,railingBarsTile} from '../concrete-materials.mjs';
import {signAtlas,signsOfKind} from '../neon-signs.mjs';
import {placeholderBillboards,billboardCells} from '../billboards.mjs';
import {propsAtlas,vendingAtlas} from '../street-props.mjs';
import {posterAtlas} from '../window-posters.mjs';
import {facadeAtlas,facadeTints} from '../facade-atlas.mjs';

// Every material and texture atlas the concrete city uses, registered on the scene once.
// Building geometry is sorted into 18 "bins" per building; palette(seed) maps each bin to
// its material so neighbouring buildings vary their wall and base finish. The last five hold
// the ground-floor kit (roller shutters, service doors, vents, meter cabinets).
export const BIN={wall:0,recess:1,glass:2,metal:3,joint:4,roof:5,base:6,unlitGlass:7,warmGlass:8,door:9,fasciaTeal:10,fasciaCream:11,displayGlass:12,shutter:13,zinc:14,enamel:15,serviceDoor:16,indicator:17};
export const BIN_COUNT=18;
// Kit bins carry the weathered paint tile, which covers 4 m.
export const KIT_BINS=[BIN.shutter,BIN.zinc,BIN.enamel,BIN.serviceDoor];

export function createCityMaterials(scene,{billboardSlots}={}){
  const pushMaterial=m=>{scene.materials.push(m);return scene.materials.length-1;};
  const pushTexture=t=>{scene.textures.push(t);return scene.textures.length-1;};

  const start=scene.materials.length;
  for(const [name,color] of [['Panel concrete',[.72,.71,.67,1]],['Recess shadow',[.16,.18,.18,1]],['Window glass',[.20,.25,.27,1]],['Window frame',[.49,.50,.48,1]],['Panel joint',[.19,.19,.18,1]]])
    pushMaterial({name,pbrMetallicRoughness:{baseColorFactor:color,metallicFactor:0,roughnessFactor:.85}});
  const tiles={};
  for(const kind of ['concrete','plaster','brick','metal','glass','roof'])tiles[kind]=pushTexture(surfaceTile(kind));
  const tiled=(name,kind,tint=[1,1,1,1])=>pushMaterial({name,pbrMetallicRoughness:{baseColorFactor:tint,baseColorTexture:{index:tiles[kind]},metallicFactor:kind==='metal'?.2:0,roughnessFactor:kind==='glass'?.4:.95}});

  const walls=[tiled('Weathered concrete','concrete'),tiled('Warm plaster','plaster'),tiled('Cool concrete','concrete',[.83,.92,1,1])];
  const glass=tiled('Dusty glass','glass'),metal=tiled('Painted steel','metal'),roof=tiled('Roof membrane','roof'),brick=tiled('Brick base','brick');
  const unlitGlass=tiled('Unlit glass','glass',[.48,.55,.60,1]),warmGlass=tiled('Warm interior glass','glass',[1,.97,.92,1]);
  const darkBase=tiled('Dark concrete base','concrete',[.50,.54,.53,1]),door=tiled('Oxide painted entrance','metal',[.88,.56,.36,1]);
  scene.materials[warmGlass].emissiveFactor=[.27,.26,.23];
  // Shop windows glow faintly from inside at night; renderers dim this by day.
  const displayGlass=tiled('Shop display glass','glass',[.95,.94,.9,1]);scene.materials[displayGlass].emissiveFactor=[.025,.018,.01];
  const fasciaTeal=tiled('Faded teal shop fascia','metal',[.47,.84,.81,1]),fasciaCream=tiled('Cream shop fascia','plaster',[1,.98,.90,1]);

  // Ground-floor kit finishes: one shared weathered paint tile, tinted so the painted
  // areas land on the reviewed sRGB colours (the tile's paint is 235 grey).
  const paint=pushTexture(weatheredPaintTile()),linear=c=>(c/=255)<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  const finish=(name,rgb,metallic=.25,roughness=.88)=>pushMaterial({name,pbrMetallicRoughness:{baseColorFactor:[...rgb.map(c=>Math.min(1,linear(c)/linear(235))),1],baseColorTexture:{index:paint},metallicFactor:metallic,roughnessFactor:roughness}});
  const sage=finish('Faded sage shutter',[101,111,98]),blueSteel=finish('Faded blue steel',[65,84,87]),zinc=finish('Weathered zinc grey',[105,111,108]),enamel=finish('Aged enamel casing',[139,135,119]);
  const shutters=[sage,blueSteel,zinc],serviceDoors=[blueSteel,sage];
  const indicator=pushMaterial({name:'Cabinet indicator',pbrMetallicRoughness:{baseColorFactor:[.08,.32,.32,1],metallicFactor:0,roughnessFactor:.5},emissiveFactor:[.08,.55,.49],extensions:{KHR_materials_emissive_strength:{emissiveStrength:1.5}}});

  // Mapped street furniture: cast concrete from the wall tiles, painted steel from the kit's
  // paint tile, worn timber slats and alpha-cut railing bars.
  const furniture={
    concrete:walls[0],damp:darkBase,recess:start+1,zinc,indicator,
    steel:finish('Oxidized charcoal steel',[56,62,59]),teal:finish('Faded industrial teal',[70,92,84]),
    rust:finish('Rust at welds',[96,58,34],.1,.95),
    wood:pushMaterial({name:'Worn timber slats',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:pushTexture(timberTile())},metallicFactor:0,roughnessFactor:.9}}),
    bars:pushMaterial({name:'Railing bars',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:pushTexture(railingBarsTile())},metallicFactor:.2,roughnessFactor:.85},alphaMode:'MASK',alphaCutoff:.5,doubleSided:true})
  };

  // Signs glow above the 0–1 emissive range via KHR_materials_emissive_strength so engines bloom them.
  const signs=signAtlas(),signTexture=pushTexture(signs.color);pushTexture(signs.emissive);
  const signMaterial=(name,strength,extra={})=>pushMaterial({name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:signTexture},metallicFactor:0,roughnessFactor:.6},emissiveTexture:{index:signTexture+1},emissiveFactor:[1,1,1],extensions:{KHR_materials_emissive_strength:{emissiveStrength:strength}},...extra});
  // Lightbox panels are large bright areas; bare tubes need more strength to read at distance.
  const signMaterials={lightbox:signMaterial('Neon sign lightbox',2.2),neon:signMaterial('Neon sign tube',5),cutout:signMaterial('Neon sign cutout',5,{alphaMode:'MASK',alphaCutoff:.5})};

  // Floodlit rooftop billboards: the artwork doubles as a dim emissive map; renderers turn it off by day.
  const billboardTexture=pushTexture(placeholderBillboards());
  const billboardMaterial=pushMaterial({name:'Billboards',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:billboardTexture},metallicFactor:0,roughnessFactor:.7},emissiveTexture:{index:billboardTexture},emissiveFactor:[.3,.3,.3]});
  const billboardSlotCount=Math.max(1,Math.min(billboardCells.length,billboardSlots??billboardCells.length));

  const posterTexture=pushTexture(posterAtlas());
  const posterMaterial=pushMaterial({name:'Shared fictional window posters',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:posterTexture},metallicFactor:0,roughnessFactor:1}});

  const atlas=facadeAtlas(),atlasColor=pushTexture(atlas.color),atlasGlow=pushTexture(atlas.emissive);
  const facadeMaterials=facadeTints.map((tint,i)=>pushMaterial({name:`Facade atlas ${['concrete','plaster','cool concrete'][i]}`,pbrMetallicRoughness:{baseColorFactor:tint,baseColorTexture:{index:atlasColor},metallicFactor:0,roughnessFactor:.9},emissiveTexture:{index:atlasGlow},emissiveFactor:[.6,.6,.6]}));
  // Glass curtain walls: the same atlas (its curtain cells), glossy so engines reflect the sky.
  const curtainMaterial=pushMaterial({name:'Facade atlas curtain glass',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:atlasColor},metallicFactor:.5,roughnessFactor:.14},emissiveTexture:{index:atlasGlow},emissiveFactor:[.6,.6,.6]});

  const propsTexture=pushTexture(propsAtlas());
  const propsMaterial=pushMaterial({name:'Street props',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:propsTexture},metallicFactor:0,roughnessFactor:.7}});
  const vending=vendingAtlas(),vendingTexture=pushTexture(vending.color);pushTexture(vending.emissive);
  const vendingMaterial=pushMaterial({name:'Vending machines',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:vendingTexture},metallicFactor:0,roughnessFactor:.6},emissiveTexture:{index:vendingTexture+1},emissiveFactor:[1,1,1],extensions:{KHR_materials_emissive_strength:{emissiveStrength:1.6}}});

  const frontSigns=signsOfKind(signs,'front'),verticalSigns=signsOfKind(signs,'vertical'),squareSigns=signsOfKind(signs,'square');
  return {
    signMaterials,billboardMaterial,billboardSlotCount,posterMaterial,propsMaterial,vendingMaterial,furniture,
    // Wall finish per building: one of three tints, shared by modelled walls and atlas faces.
    wallVariant:seed=>seed%walls.length,
    facadeMaterial:seed=>facadeMaterials[seed%walls.length],
    curtainMaterial,
    // Material for each geometry bin (see BIN), varied by the building seed.
    // Kit colours use higher seed digits than the wall finish, so they vary independently.
    palette:seed=>[walls[seed%walls.length],start+1,glass,metal,start+4,roof,seed%3===1?brick:darkBase,unlitGlass,warmGlass,door,fasciaTeal,fasciaCream,displayGlass,
      shutters[Math.floor(seed/7)%shutters.length],zinc,enamel,serviceDoors[Math.floor(seed/11)%serviceDoors.length],indicator],
    signs:{
      front:frontSigns,vertical:verticalSigns,square:squareSigns,
      tower:signsOfKind(signs,'tower'),rooftop:signsOfKind(signs,'rooftop'),
      // Small projecting blades take short front texts or square pictograms.
      blade:[...frontSigns.filter(e=>e.aspect<=3.2),...squareSigns],
      // Free-standing pavement lightboxes need roughly square or short upright art.
      standing:[...squareSigns,...verticalSigns.filter(e=>e.aspect>=.45)]
    }
  };
}
