import test from 'node:test';
import assert from 'node:assert/strict';
import { ART_PALETTE, createSurfaceMaps } from '../src/visual-materials.js';

test('procedural marine surfaces stay deterministic while carrying mineral and roughness variation',()=>{
  const first=createSurfaceMaps('rock',{size:32,repeat:2,seed:715,normalStrength:1.2});
  const second=createSurfaceMaps('rock',{size:32,repeat:2,seed:715,normalStrength:1.2});
  assert.deepEqual(first.map.image.data,second.map.image.data);
  assert.deepEqual(first.normalMap.image.data,second.normalMap.image.data);
  assert.equal(new Set(first.map.image.data.filter((_,index)=>index%4!==3)).size>24,true);
  assert.equal(new Set(first.roughnessMap.image.data.filter((_,index)=>index%4===0)).size>8,true);
  assert.ok(ART_PALETTE.oceanDeep<ART_PALETTE.oceanShallow);
});
