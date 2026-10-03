import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceTile,weatheredPaintTile} from '../src/concrete-materials.mjs';

// A tile repeats every few metres on long walls; its opposite edges must meet as smoothly as
// any two neighbouring rows inside it, or every repeat shows as a line.
test('wall tiles repeat without a visible seam',()=>{
  for(const tile of [...['concrete','plaster','metal'].map(surfaceTile),weatheredPaintTile()]){
    const {width:w,height:h,rgba}=tile,px=(x,y)=>rgba[(y*w+x)*4];
    const mean=pairs=>pairs.reduce((s,[a,b])=>s+Math.abs(a-b),0)/pairs.length;
    const wrapRows=mean(Array.from({length:w},(_,x)=>[px(x,0),px(x,h-1)])),innerRows=mean(Array.from({length:w},(_,x)=>[px(x,h/2-1),px(x,h/2)]));
    const wrapCols=mean(Array.from({length:h},(_,y)=>[px(0,y),px(w-1,y)])),innerCols=mean(Array.from({length:h},(_,y)=>[px(w/2-1,y),px(w/2,y)]));
    assert.ok(wrapRows<=innerRows*1.6+1,`${tile.name} top/bottom ${wrapRows.toFixed(1)} vs ${innerRows.toFixed(1)}`);
    assert.ok(wrapCols<=innerCols*1.6+1,`${tile.name} left/right ${wrapCols.toFixed(1)} vs ${innerCols.toFixed(1)}`);
  }
});
