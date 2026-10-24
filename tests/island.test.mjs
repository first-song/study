import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { WATER_SURFACE_Y } from '../src/biology.js';
import { islandCenter,islandSurfaceAt,islandShorePoint,islandObstacleAt,islandTreeLayout,islandVisualSurfaceAt } from '../src/island.js';
import { humanBoatStates } from '../src/human-navigation.js';
import { createIsland } from '../src/ocean-rendering.js';

test('island geography is deterministic, rises above the surface and has a walkable shore',()=>{
  const world=createWorld(613),center=islandCenter(world),shore=islandShorePoint(world,Math.PI/2);
  assert.deepEqual(center,islandCenter(world));
  assert.ok(islandSurfaceAt(world,center.x,center.z)>WATER_SURFACE_Y+5);
  assert.equal(islandSurfaceAt(world,center.x,shore.z+80),null);
  const justInside=islandShorePoint(world,Math.PI/2,-.5);
  assert.ok(islandSurfaceAt(world,justInside.x,justInside.z)>=WATER_SURFACE_Y);
  assert.equal(islandObstacleAt(world,center.x-4,center.z-8),true);
});

test('patrol ships orbit outside the expanded island coast',()=>{
  const world=createWorld(47);
  for(const boat of humanBoatStates(world,12.4))assert.equal(islandSurfaceAt(world,boat.x,boat.z),null);
});

test('the coast uses clustered pine, cedar and broadleaf vegetation with grounded instancing',()=>{
  const world=createWorld(613),trees=islandTreeLayout(world);
  assert.deepEqual(trees,islandTreeLayout(world));
  assert.ok(trees.length>220);
  for(const species of ['pine','cedar','broadleaf'])assert.ok(trees.filter(tree=>tree.species===species).length>30);
  assert.ok(trees.every(tree=>tree.y===islandVisualSurfaceAt(world,tree.x,tree.z)));
  const island=createIsland(world);
  const cedar=island.getObjectByName('japanese-cedar-crowns');
  const pine=island.getObjectByName('coastal-black-pine-crowns');
  const broadleaf=island.getObjectByName('broadleaf-tree-crowns');
  assert.ok(cedar?.isInstancedMesh&&pine?.isInstancedMesh&&broadleaf?.isInstancedMesh);
  assert.ok(Boolean(island.getObjectByName('tree-root-flares')));
  assert.ok(Boolean(island.getObjectByName('tree-contact-shadows')));
  const alpha=cedar.material.map.image.data;
  let transparent=0,solid=0;
  for(let index=3;index<alpha.length;index+=4)alpha[index]<32?transparent++:solid++;
  assert.ok(transparent>1000&&solid>1000,'foliage cards need real cutout silhouettes');
});
