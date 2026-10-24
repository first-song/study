import test from 'node:test';
import assert from 'node:assert/strict';
import { createAberrantEchoModel, animateAberrantEchoModel } from '../src/echo-models.js';

function meshes(root){let count=0;root.traverse(node=>{if(node.isMesh)count++;});return count;}

test('three echo roles have authored and distinct silhouettes',()=>{
  const models=['shardHunter','lureColony','pressureWorm'].map(echoKind=>
    createAberrantEchoModel({echoKind,radius:3.2,seed:1.2})
  );
  assert.deepEqual(models.map(model=>model.userData.echoKind),['shardHunter','lureColony','pressureWorm']);
  assert.ok(models.every(model=>meshes(model)>=12));
  assert.ok(new Set(models.map(model=>meshes(model))).size>=2);
});

test('echo animation exposes a readable charge state and remains deterministic',()=>{
  const model=createAberrantEchoModel({echoKind:'lureColony',radius:3.2,seed:.4});
  animateAberrantEchoModel(model,3.2,4,{phase:'charge'});
  assert.equal(model.userData.phase,'charge');
  assert.ok(model.userData.aura.material.opacity>.2);
  const x=model.userData.lures[0].position.x;
  animateAberrantEchoModel(model,3.2,4,{phase:'charge'});
  assert.equal(model.userData.lures[0].position.x,x);
});
