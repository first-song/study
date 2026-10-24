import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { humanBoatStates,crossedSonarPhase,HUMAN_SONAR_PULSE,HUMAN_SONAR_WARNING } from '../src/human-navigation.js';

test('human patrol boats are deterministic and cycle through warning and active sonar',()=>{
  const world=createWorld(916);
  assert.deepEqual(humanBoatStates(world,11.2),humanBoatStates(world,11.2));
  const states=humanBoatStates(world,11.2);
  assert.equal(states.length,3);
  assert.ok(states.some(state=>state.warning));
  assert.ok(states.every(state=>Number.isFinite(state.x)&&Number.isFinite(state.z)&&state.radius>30));
  assert.equal(crossedSonarPhase(10.4,10.6,0,HUMAN_SONAR_WARNING),true);
  assert.equal(crossedSonarPhase(11.9,12.1,0,HUMAN_SONAR_PULSE),true);
  assert.equal(crossedSonarPhase(5,5.1,0,HUMAN_SONAR_PULSE),false);
});
