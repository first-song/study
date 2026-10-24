import test from 'node:test';
import assert from 'node:assert/strict';
import { huntPresentation } from '../src/hunt-ui.js';

test('echo hunt presentation exposes phase, two resources and finisher state',()=>{
  const echo={id:3,name:'压力蠕冠',role:'深层掘进型巨体',hp:28,maxHp:100,link:.28,phase:'exposed',pacified:false,precisionHits:3,forceHits:1};
  const view=huntPresentation(echo);
  assert.equal(view.phaseLabel,'共振暴露');
  assert.equal(view.exposed,true);
  assert.equal(view.finisher,true);
  assert.equal(view.resolve,.28);
  assert.equal(view.potentialGrade,2);
  assert.match(view.hint,/Q/);
});

test('missing echo safely disables hunt presentation',()=>{
  assert.equal(huntPresentation(null),null);
});
