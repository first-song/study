import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { outfallBlocks, outfallLayout } from '../src/outfall-layout.js';
import { createSubseaOutfall } from '../src/outfall-model.js';

test('the outfall is a shared large collision hazard and authored industrial landmark',()=>{
  const world=createWorld(913);
  const layout=outfallLayout(world);
  assert.equal(layout.segments.length,2);
  assert.equal(layout.mouths.length,3);
  assert.ok(layout.mouths.every(mouth=>mouth.radius>2));
  const mouth=layout.mouths[1];
  assert.equal(outfallBlocks(world,mouth.x,mouth.y,mouth.z),true);
  assert.equal(outfallBlocks(world,mouth.x,mouth.y+30,mouth.z+2),false);

  const model=createSubseaOutfall(world);
  assert.ok(model.getObjectByName('gray-island-industrial-outfall'));
  assert.ok(model.getObjectByName('outfall-pollution-plume')?.material?.isShaderMaterial);
  assert.ok(model.getObjectByName('outfall-diffuser-bubbles')?.material?.isShaderMaterial);
  assert.ok(model.getObjectByName('outfall-warning-beacon')?.isMesh);
  assert.equal(model.getObjectByName('outfall-guide-lights')?.count,12);
});
