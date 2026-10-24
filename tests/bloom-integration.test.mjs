import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { PLANKTON_BLOOM_RULES } from '../src/plankton-bloom.js';

function game(seed = 220) {
  const engine = new GameEngine({ seed });
  engine.start();
  engine.drainEvents();
  return engine;
}

test('a fresh ocean contains one moving bloom and its exact state round trips', () => {
  const engine = game();
  const blooms = engine.state.entities.filter(entity => entity.type === 'bloom');
  assert.equal(blooms.length, 1);
  assert.equal(blooms[0].phase, 'calm');
  assert.ok(blooms[0].radius > engine.state.player.size * 10);
  const save = engine.serialize();
  assert.equal(save.version, 10);
  assert.equal(game().restore(save), true);
});

test('actual feed input filters a moving bloom and raises mutation risk rather than spawning pellets', () => {
  const engine = game();
  const bloom = engine.state.entities.find(entity => entity.type === 'bloom');
  engine.state.entities = [bloom];
  engine.spawnTimer = 2;
  Object.assign(engine.state.player, {
    x: bloom.x, y: bloom.y, z: bloom.z, nutrition: 40, radiation: 0, mutationEnergy: 0,
    energy: engine.state.player.maxEnergy,
  });
  engine.update(0.1, { feed: true });
  assert.equal(bloom.feeding, true);
  assert.ok(engine.state.player.nutrition > 40);
  assert.ok(engine.state.player.biomass > 0);
  assert.ok(engine.state.player.mutationEnergy > 0);
  assert.ok(engine.state.player.radiation > 0);
  assert.equal(engine.state.entities.filter(entity => entity.type === 'food').length, 0);
});

test('nearby fish gather toward a living bloom instead of following isolated pellets', () => {
  const engine = game();
  const bloom = engine.state.entities.find(entity => entity.type === 'bloom');
  const fish = engine.state.entities.find(entity => entity.type === 'fish');
  engine.state.entities = [bloom, fish];
  engine.spawnTimer = 2;
  Object.assign(engine.state.player, { x: -100, y: 20, z: -100 });
  Object.assign(fish, { x: bloom.x + 12, y: bloom.y, z: bloom.z, hunger: 0.8, vx: 0, vy: 0, vz: 0 });
  engine.update(0.1, {});
  assert.equal(fish.behavior, 'feed');
  assert.ok(fish.vx < 0, 'fish should turn back toward the bloom');
});

test('a bloom burst damages nearby life, disperses debris and replaces itself after cooldown', () => {
  const engine = game();
  const bloom = engine.state.entities.find(entity => entity.type === 'bloom');
  engine.state.entities = [{ ...bloom, age: PLANKTON_BLOOM_RULES.lifetime - 0.05 }];
  const liveBloom = engine.state.entities[0];
  engine.spawnTimer = 2;
  Object.assign(engine.state.player, { x: liveBloom.x + 8, y: liveBloom.y, z: liveBloom.z, hp: 100 });
  engine.update(0.1, {});
  assert.equal(engine.state.entities.some(entity => entity.type === 'bloom'), false);
  assert.ok(engine.state.player.hp < 100);
  assert.equal(engine.state.entities.filter(entity => entity.type === 'marineSnow').length, 10);
  assert.ok(engine.bloomRespawnAt > engine.state.time);
  engine.state.time = engine.bloomRespawnAt + 0.1;
  engine.update(0.1, {});
  assert.equal(engine.state.entities.filter(entity => entity.type === 'bloom').length, 1);
});

test('bloom coordinates and nutrient state are validated atomically', () => {
  const engine = game();
  const good = engine.serialize();
  for (const corrupt of [
    save => { save.state.entities.find(entity => entity.type === 'bloom').nutrient = 0.4; },
    save => { save.state.entities.find(entity => entity.type === 'bloom').x += 20; },
    save => { save.bloomSerial = -1; },
    save => { save.bloomRespawnAt = Infinity; },
  ]) {
    const invalid = structuredClone(good);
    corrupt(invalid);
    assert.equal(engine.restore(invalid), false);
    assert.deepEqual(engine.serialize(), good);
  }
});
