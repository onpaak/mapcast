import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';
import {signAtlas,signCatalog,sameTrade} from '../src/neon-signs.mjs';
import {brushGlyphs,BRUSH_GLYPH_SIZE} from '../src/brush-glyphs.mjs';

test('every sign names its trade and brush-script entries have baked glyphs',()=>{
  assert.ok(signCatalog.every(e=>[e.business??[]].flat().length>0),'business on every entry');
  const brush=signCatalog.filter(e=>e.brush);
  assert.ok(brush.length>0&&brush.every(e=>e.kind!=='rooftop'),'rooftop letters keep the original designs');
  for(const text of brush.flatMap(e=>e.sections??[e.text]))for(const ch of text.match(/\p{Script=Han}/gu)??[])assert.ok(brushGlyphs[ch],`glyph for ${ch}`);
  for(const hex of Object.values(brushGlyphs))assert.match(hex,new RegExp(`^[0-9a-f]{${BRUSH_GLYPH_SIZE*6}}$`));
  // Brush fascias are long enough for the short band above a shop window (a face under 0.5 m is left out).
  const atlas=signAtlas();
  assert.ok(brush.filter(e=>e.kind==='front').every(e=>atlas.entries[e.id].aspect>=2.4));
});

test('a shop blade and pavement lightbox advertise the same trade as the shop fascia',()=>{
  const street={id:'way/970',properties:{highway:'residential',width:'6'},geometry:{type:'LineString',coordinates:[[-.0002,-.00008],[.0035,-.00008]]}};
  const shops=Array.from({length:8},(_,i)=>({id:`way/97${i+1}`,properties:{building:'retail','building:levels':'3',shop:'convenience'},geometry:{type:'Polygon',coordinates:[[[i*.0004,0],[i*.0004+.0003,0],[i*.0004+.0003,.00012],[i*.0004,.00012],[i*.0004,0]]]}}));
  const {metadata}=concreteCity(generate({type:'FeatureCollection',selectionBounds:[-.0002,-.0002,.0035,.0003],features:[...shops,street]}));
  const byId=new Map(signCatalog.map(e=>[e.id,e])),fascia=new Map(metadata.shopSigns.map(s=>[`${s.sourceId}:${s.edge}:${s.bay}`,byId.get(s.signId)]));
  const partners=[...metadata.shopBlades,...metadata.streetProps.standingSigns].filter(p=>fascia.has(`${p.sourceId}:${p.edge}:${p.bay}`));
  assert.ok(partners.length>0,'some shops have a blade or lightbox');
  for(const p of partners)assert.ok(sameTrade(byId.get(p.signId),fascia.get(`${p.sourceId}:${p.edge}:${p.bay}`)),`${p.signId} matches its shop`);
});
