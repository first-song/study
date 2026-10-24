import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { PLAYER_MAX_Y, WATER_SURFACE_Y } from '../src/biology.js';
import { createBackgroundSchools, animateBackgroundSchools } from '../src/marine-models.js';
import { islandCenter,islandShorePoint,islandSurfaceAt } from '../src/island.js';

const game=()=>{const engine=new GameEngine({seed:603});engine.start();engine.drainEvents();return engine;};

test('the player can reach the sea surface without entering the air volume',()=>{
  const engine=game(),p=engine.state.player;
  p.y=51.5;p.vy=0;engine.spawnTimer=3;
  for(let i=0;i<90;i++)engine.update(1/60,{y:1});
  assert.ok(p.y>=WATER_SURFACE_Y-.7);
  assert.ok(p.y<=PLAYER_MAX_Y);
  assert.ok(p.y<WATER_SURFACE_Y);
  assert.equal(p.depth,0);
  const save=engine.serialize();
  assert.equal(new GameEngine({seed:1}).restore(save),true);
});

test('a legacy save above open water is recovered beneath the surface',()=>{
  const engine=game(),save=engine.serialize();
  Object.assign(save.state.player,{x:0,y:56,z:0,vx:0,vy:0,vz:0});
  const restored=new GameEngine({seed:1});
  assert.equal(restored.restore(save),true);
  assert.ok(restored.state.player.y<=PLAYER_MAX_Y);
  assert.ok(restored.state.player.y<WATER_SURFACE_Y);
});

test('the coast supports surface landing while the submerged reactor trench stays beneath the island',()=>{
  const engine=game(),p=engine.state.player;
  const shore=islandShorePoint(engine.state.world,Math.PI/2);
  Object.assign(p,{x:shore.x,y:PLAYER_MAX_Y,z:shore.z+2,vx:0,vy:0,vz:0});
  for(let i=0;i<45;i++)engine.update(1/60,{z:-1});
  assert.ok(p.y>WATER_SURFACE_Y,'surface cell must stand on coastal terrain');
  assert.ok(islandSurfaceAt(engine.state.world,p.x,p.z)!==null);
  assert.equal(new GameEngine({seed:1}).restore(engine.serialize()),true);
  const deepApproach=islandShorePoint(engine.state.world,Math.PI/2,2);
  Object.assign(p,{x:deepApproach.x,y:18,z:deepApproach.z,vx:0,vy:0,vz:0});
  for(let i=0;i<160;i++)engine.update(1/60,{z:-1});
  assert.notEqual(islandSurfaceAt(engine.state.world,p.x,p.z),null,'the deep reactor trench must remain traversable');
  assert.ok(p.y<WATER_SURFACE_Y,'the tunnel must not lift a submerged cell onto land');
  const tunnelY=p.y;
  for(let i=0;i<240;i++)engine.update(1/60,{y:1});
  assert.ok(p.y<WATER_SURFACE_Y,'a subterranean cell cannot rise through the island shell');
  assert.ok(p.y>tunnelY,'the cell can still rise inside the tunnel');
});

test('the non-entrance side of the island base remains solid underwater',()=>{
  const engine=game(),p=engine.state.player;
  const westShore=islandShorePoint(engine.state.world,0,2);
  Object.assign(p,{x:westShore.x,y:18,z:westShore.z,vx:0,vy:0,vz:0});
  for(let i=0;i<180;i++)engine.update(1/60,{x:-1});
  assert.equal(islandSurfaceAt(engine.state.world,p.x,p.z),null);
  assert.ok(p.x>westShore.x-4,'the submerged hull of the island must stop the player');
});

test('the enlarged seabed wreck uses a rotated hull collider',()=>{
  const engine=game(),p=engine.state.player;
  const wreckX=-25,wreckZ=-18,heading=1.05;
  const sx=Math.sin(heading),sz=Math.cos(heading);
  Object.assign(p,{
    x:wreckX+sx*20,y:5,z:wreckZ+sz*20,
    vx:0,vy:0,vz:0,
  });
  for(let i=0;i<100;i++)engine.update(1/60,{x:-sx,z:-sz});
  const dx=p.x-wreckX,dz=p.z-wreckZ;
  const localX=dx*Math.cos(heading)-dz*Math.sin(heading);
  const localZ=dx*Math.sin(heading)+dz*Math.cos(heading);
  assert.ok(Math.abs(localX)>=5.1||Math.abs(localZ)>=16.1,'the player must not enter the wreck hull');
});

test('schooling fish steer continuously instead of stepping to a new direction',()=>{
  const engine=game();
  const fish=engine.state.entities.find(entity=>entity.type==='fish');
  const mates=engine.state.entities.filter(entity=>entity.type==='fish'&&entity.schoolId===fish.schoolId);
  assert.ok(mates.length>=2);
  Object.assign(engine.state.player,{x:-90,y:20,z:90});
  Object.assign(fish,{x:8,y:31,z:-5,vx:0,vy:0,vz:0,hunger:.8});
  let last={x:fish.x,z:fish.z,heading:fish.heading};
  let maxStep=0,maxTurn=0;
  for(let i=0;i<90;i++){
    engine.spawnTimer=3;engine.update(1/60,{});
    maxStep=Math.max(maxStep,Math.hypot(fish.x-last.x,fish.z-last.z));
    const turn=Math.atan2(Math.sin(fish.heading-last.heading),Math.cos(fish.heading-last.heading));
    maxTurn=Math.max(maxTurn,Math.abs(turn));
    last={x:fish.x,z:fish.z,heading:fish.heading};
  }
  assert.ok(maxStep<.25,`fish movement remains continuous at 60 Hz (${maxStep.toFixed(3)})`);
  assert.ok(maxTurn<.2,`fish heading changes continuously (${maxTurn.toFixed(3)})`);
  assert.ok(Math.hypot(fish.vx,fish.vz)>0);
});

test('background schools rebuild transforms on every normal display frame',()=>{
  const schools=createBackgroundSchools();
  animateBackgroundSchools(schools,1,false);
  const matrixBefore=Array.from(schools.instanceMatrix.array.slice(0,16));
  animateBackgroundSchools(schools,1.001,false);
  const matrixAfter=Array.from(schools.instanceMatrix.array.slice(0,16));
  assert.notDeepEqual(matrixAfter,matrixBefore);
});

test('background fish also advance smoothly when the low-quality tier is active',()=>{
  const schools=createBackgroundSchools();
  animateBackgroundSchools(schools,1,true);
  const matrixBefore=Array.from(schools.instanceMatrix.array.slice(0,16));
  animateBackgroundSchools(schools,1.001,true);
  const matrixAfter=Array.from(schools.instanceMatrix.array.slice(0,16));
  assert.notDeepEqual(matrixAfter,matrixBefore);
});

test('staying inside a calm school grants camouflage from predators',()=>{
  const engine=game(),p=engine.state.player;
  const fish=engine.state.entities.filter(entity=>entity.type==='fish').slice(0,3);
  for(const member of fish)Object.assign(member,{x:p.x+1.2,y:p.y,z:p.z+.4,vx:1,vy:0,vz:0});
  p.vx=1;p.vz=0;p.mutations.photophore=0;p.dashTime=0;
  engine._buildEcologyIndex();engine._updateSchoolCover();
  assert.equal(engine.schoolCovered,true);
  assert.ok(engine.drainEvents().some(event=>event.type==='schoolCover'));
  p.mutations.photophore=1;engine._updateSchoolCover();
  assert.equal(engine.schoolCovered,false);
});
