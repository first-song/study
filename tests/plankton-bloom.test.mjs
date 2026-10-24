import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import { createWorld } from '../src/world.js';
import {
  PLANKTON_BLOOM_RULES,
  bloomNutrient,
  bloomPhase,
  bloomSpawnPosition,
} from '../src/plankton-bloom.js';
import { animatePlanktonBloom, createPlanktonBloom } from '../src/bloom-model.js';

test('moving bloom has a readable calm, unstable and burst lifecycle', () => {
  assert.equal(bloomPhase(0), 'calm');
  assert.equal(bloomPhase(PLANKTON_BLOOM_RULES.lifetime * 0.73), 'unstable');
  assert.equal(bloomPhase(PLANKTON_BLOOM_RULES.lifetime), 'burst');
  assert.equal(bloomNutrient(0), 1);
  assert.equal(bloomNutrient(PLANKTON_BLOOM_RULES.lifetime), 0);
});

test('bloom placement is deterministic, near the player and separate from mutation RNG', () => {
  const world = createWorld(481);
  const player = { x: 12, y: 39, z: -8 };
  const first = bloomSpawnPosition(world, player, 3);
  assert.deepEqual(bloomSpawnPosition(world, player, 3), first);
  assert.notDeepEqual(bloomSpawnPosition(world, player, 4), first);
  assert.ok(Math.hypot(first.x - player.x, first.z - player.z) >= 20);
  assert.ok(first.y >= 5 && first.y <= 49);
});

test('bloom renderer is instanced, animated and communicates nutrient loss', () => {
  const group = createPlanktonBloom({ id: 7, seed: 0.4, radius: 5.8, nutrient: 1 });
  assert.ok(group.getObjectByName('bloom-luminous-plankton'));
  assert.ok(group.getObjectByName('bloom-water-displacement-halo'));
  assert.ok(group.getObjectByName('bloom-warm-core'));
  assert.ok(group.getObjectByName('bloom-organic-lobes') instanceof THREE.InstancedMesh);
  assert.ok(group.getObjectByName('bloom-suspended-tendrils') instanceof THREE.InstancedMesh);
  const before = group.rotation.y;
  animatePlanktonBloom(group, { seed: 0.4, nutrient: 0.2, phase: 'unstable' }, 4.2);
  assert.notEqual(group.rotation.y, before);
  assert.ok(group.scale.x > 0);
  assert.equal(group.userData.cloud.material.uniforms.nutrient.value, 0.2);
  assert.ok(group.userData.lobes.material.emissiveIntensity > 0);
});
