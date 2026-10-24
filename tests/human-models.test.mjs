import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHumanSettlement, animateHumanSettlement,
  createDiverEntityModel, animateDiverEntityModel,
  createParasiteNodeModel, animateParasiteNodeModel,
  createSurfaceFleet, animateSurfaceFleet, createResearchWreck, animateResearchWreck,
  createIslandPopulation,
  nearestHumanDistance, consumeNearestHuman,
} from '../src/human-models.js';
import { createWorld } from '../src/world.js';
import { humanBoatStates } from '../src/human-navigation.js';

function meshes(root){const result=[];root.traverse(node=>{if(node.isMesh)result.push(node);});return result;}

test('human settlement contains articulated people, boat, lamps and moving searchlight',()=>{
  const settlement=createHumanSettlement();
  const kinds=new Set(settlement.userData.animatables.humans.map(human=>human.userData.kind));
  assert.deepEqual(kinds,new Set(['worker','scientist','diver']));
  assert.equal(settlement.userData.animatables.boats.length,1);
  assert.ok(settlement.userData.animatables.lights.length>=4);
  assert.ok(meshes(settlement).length>45);
  const worker=settlement.userData.animatables.humans.find(human=>!human.crowd),leg=worker.userData.joints.leftLeg;
  const before=leg.rotation.x;animateHumanSettlement(settlement,1.7,.7);const after=leg.rotation.x;
  assert.notEqual(after,before);
  assert.ok(settlement.userData.animatables.searchlight.rotation.y!==0);
});

test('research diver has mask, tank, articulated limbs and animated swimming',()=>{
  const diver=createDiverEntityModel({seed:.4});
  assert.equal(diver.userData.humanDiver,true);
  assert.ok(meshes(diver).length>10);
  assert.ok(Math.abs(diver.userData.diver.rotation.x+Math.PI*.5)<.01);
  const leg=diver.userData.diver.userData.joints.rightLeg,before=leg.rotation.x;
  animateDiverEntityModel(diver,2.2,3.1);
  assert.notEqual(leg.rotation.x,before);
  assert.ok(Math.abs(diver.userData.diver.rotation.x+Math.PI*.5)<.12);
  assert.ok(diver.userData.halo.material.emissiveIntensity>0);
});

test('three parasite node silhouettes are distinct and disabled state is readable',()=>{
  const nodes=['harbor','laboratory','relay'].map(siteId=>createParasiteNodeModel({siteId,disabled:false}));
  assert.deepEqual(nodes.map(node=>node.name),['parasite-node-harbor','parasite-node-laboratory','parasite-node-relay']);
  assert.notEqual(meshes(nodes[0]).length,meshes(nodes[2]).length);
  const active=createParasiteNodeModel({siteId:'relay',disabled:false});
  const disabled=createParasiteNodeModel({siteId:'relay',disabled:true});
  const activeEmissive=meshes(active).find(mesh=>mesh.material?.emissive?.getHex()>0).material.emissiveIntensity;
  const disabledEmissive=meshes(disabled).find(mesh=>mesh.material?.emissive?.getHex()>0).material.emissiveIntensity;
  assert.ok(activeEmissive>disabledEmissive);
  animateParasiteNodeModel(active,3,{seed:.2});assert.ok(active.rotation.y!==0);
});

test('surface patrol fleet has three authored boats with wake and moving searchlights',()=>{
  const fleet=createSurfaceFleet();
  assert.equal(fleet.userData.boats.length,3);
  const states=humanBoatStates(createWorld(47),12.4);
  animateSurfaceFleet(fleet,12.4,states,{x:0,y:50,z:0});
  const boat=fleet.userData.boats[0];
  assert.ok(boat.position.x!==0&&boat.position.z!==0);
  assert.equal(boat.userData.searchlight.visible,true);
  assert.ok(boat.userData.beam.material.opacity>0);
  assert.ok(boat.userData.wake.children.length>=2);
  assert.ok(meshes(boat).length>=18);
  assert.ok(boat.userData.length>=24);
  assert.equal(boat.userData.crews.length,3);
  assert.ok(boat.userData.crews.every(person=>person.position.y>=1.1));
});

test('sunken research boat provides a near-spawn human-made landmark',()=>{
  const wreck=createResearchWreck({x:-20,y:1,z:-8});
  const before=wreck.userData.bubbles.geometry.attributes.position.getY(0);
  animateResearchWreck(wreck,2.4);
  const after=wreck.userData.bubbles.geometry.attributes.position.getY(0);
  assert.notEqual(after,before);
  assert.ok(meshes(wreck).length>=17);
  assert.ok(wreck.userData.beacon?.isMesh);
  assert.ok(wreck.userData.bubbles?.isPoints);
});

test('street residents are instanced while retaining routes and gait phases',()=>{
  const population=createIslandPopulation((x,z)=>44+Math.sin(x*.1+z*.2));
  assert.ok(population.userData.animatables.humans.length>=20);
  let instanced=0;
  population.traverse(node=>{if(node.isInstancedMesh)instanced++;});
  // 躯干、头、帽、背心、包、双臂、双腿 —— 身份靠外形区分。
  assert.equal(instanced,9);
  const before=Array.from(population.userData.animatables.crowd.body.instanceMatrix.array.slice(0,16));
  animateHumanSettlement(population,3.2,.2);
  const after=Array.from(population.userData.animatables.crowd.body.instanceMatrix.array.slice(0,16));
  assert.notDeepEqual(after,before);
  const target=population.userData.animatables.humans[0].path[2];
  assert.ok(Number.isFinite(nearestHumanDistance(population,target)));
  assert.equal(consumeNearestHuman(population,target),true);
  assert.equal(population.userData.animatables.humans[0].devoured,true);
});
