import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { WATER_SURFACE_Y } from '../src/biology.js';
import { createMicrofauna, animateMicrofauna, setMicrofaunaQuality } from '../src/microfauna.js';

test('microfauna adds drifting single cells, protists and multicellular colonies',()=>{
  const group=createMicrofauna(createWorld(613));
  const names=Object.keys(group.userData.meshes);
  assert.deepEqual(names.sort(),['bacteria','ciliate','colony','copepod','diatom','larva','radiolaria','rotifer','salp','worm']);
  assert.equal(group.userData.specimens.length,422);
  assert.ok(group.userData.meshes.bacteria.count>=120);
  assert.ok(group.userData.meshes.colony.count>=24);
  assert.ok(group.userData.meshes.radiolaria.count>=28);
  assert.ok(group.userData.meshes.worm.count>=12);
  assert.ok(group.userData.meshes.rotifer.count>=18);
  assert.ok(group.userData.meshes.copepod.count>=26);
  assert.ok(group.userData.meshes.salp.count>=10);
  const before=Array.from(group.userData.meshes.colony.instanceMatrix.array.slice(0,16));
  animateMicrofauna(group,1.25,.1,{x:7,y:35,z:-4});
  const after=Array.from(group.userData.meshes.colony.instanceMatrix.array.slice(0,16));
  assert.notDeepEqual(after,before);
  assert.deepEqual(group.position.toArray(),[0,0,0]);
  const bacteria=group.userData.specimens.filter(specimen=>specimen.layer==='bacteria').slice(0,40);
  assert.ok(bacteria.some(specimen=>specimen.vx>0));
  assert.ok(bacteria.some(specimen=>specimen.vx<0));
  assert.ok(bacteria.some(specimen=>specimen.vz>0));
  assert.ok(bacteria.some(specimen=>specimen.vz<0));
  setMicrofaunaQuality(group,'low');
  for(const mesh of Object.values(group.userData.meshes))assert.ok(mesh.count<mesh.instanceMatrix.count);
  setMicrofaunaQuality(group,'medium',1);
  const multicellularCounts=Object.values(group.userData.meshes).map(mesh=>mesh.count);
  setMicrofaunaQuality(group,'medium',2);
  assert.equal(Object.values(group.userData.meshes).every(mesh=>mesh.count===0),true);
  assert.ok(multicellularCounts.every(count=>count>=0));
});

test('plankton stays in world space and recycles individuals instead of the whole cloud following',()=>{
  const group=createMicrofauna(createWorld(991));
  const player={x:0,y:38,z:0,vx:0,vy:0,vz:0};
  animateMicrofauna(group,0,.016,player);
  const before=group.userData.specimens.map(specimen=>({x:specimen.x,z:specimen.z}));
  for(let frame=0;frame<90;frame++){
    Object.assign(player,{x:frame/90*18,y:37,z:-frame/90*10,vx:3,vy:0,vz:-1.7});
    animateMicrofauna(group,frame/60,1/60,player);
  }
  const survivors=group.userData.specimens.filter((specimen,index)=>Math.hypot(specimen.x-before[index].x,specimen.z-before[index].z)<5);
  assert.ok(survivors.length>0,'some world-space specimens should remain independent of the player');
  assert.ok(group.userData.specimens.every(specimen=>Number.isFinite(specimen.x)&&specimen.y<=WATER_SURFACE_Y-1.15));
});
