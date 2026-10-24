import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { PLANKTON_BLOOM_RULES } from '../src/plankton-bloom.js';
import { spawnPlanktonBloom, updatePlanktonBloom } from '../src/bloom-system.js';

function fakeEngine() {
  const events = [];
  let nextId = 1;
  const engine = {
    bloomSerial: 0,
    bloomRespawnAt: 0,
    events,
    state: {
      mode: 'playing',
      time: 0,
      world: createWorld(770),
      player: {
        x: 0, y: 41, z: 0, feedTime: 0, nutrition: 30, biomass: 0, radiation: 0,
      },
      entities: [],
    },
    _entity(type, x, y, z, radius, hp, extra = {}) {
      const entity = { id: nextId++, type, x, y, z, radius, hp, maxHp: hp, ...extra };
      this.state.entities.push(entity);
      return entity;
    },
    _emit(type, text, extra = {}) {
      events.push({ type, text, ...extra });
    },
    _gainMutationEnergy(amount) {
      this.state.player.mutationEnergy = (this.state.player.mutationEnergy || 0) + amount;
    },
    _damage(amount) {
      this.state.player.hp = (this.state.player.hp ?? 100) - amount;
    },
  };
  return engine;
}

test('bloom filter feeding produces nutrition and mutation risk continuously', () => {
  const engine = fakeEngine();
  const bloom = spawnPlanktonBloom(engine);
  Object.assign(engine.state.player, { x: bloom.x, y: bloom.y, z: bloom.z, feedTime: 1 });
  updatePlanktonBloom(engine, bloom, 0.5);
  assert.ok(engine.state.player.nutrition > 30);
  assert.ok(engine.state.player.biomass > 0);
  assert.ok(engine.state.player.mutationEnergy > 0);
  assert.ok(engine.state.player.radiation > 0);
  assert.ok(engine.events.some(event => event.type === 'bloomFeed'));
  assert.equal(bloom.feeding, true);
});

test('a depleted bloom bursts once, damages a nearby cell and schedules replacement', () => {
  const engine = fakeEngine();
  const bloom = spawnPlanktonBloom(engine);
  engine.state.time = 90;
  bloom.age = PLANKTON_BLOOM_RULES.lifetime - 0.05;
  Object.assign(engine.state.player, { x: bloom.x, y: bloom.y, z: bloom.z, feedTime: 0 });
  updatePlanktonBloom(engine, bloom, 0.1);
  assert.equal(bloom.phase, 'burst');
  assert.equal(bloom.dead, true);
  assert.ok(engine.state.player.hp < 100);
  assert.equal(engine.state.entities.filter(entity => entity.type === 'marineSnow').length, 10);
  assert.equal(engine.bloomRespawnAt, 90 + PLANKTON_BLOOM_RULES.respawnDelay);
  updatePlanktonBloom(engine, bloom, 0.1);
  assert.equal(engine.state.entities.filter(entity => entity.type === 'marineSnow').length, 10);
  assert.equal(engine.events.filter(event => event.type === 'bloomBurst').length, 1);
});

test('the unstable transition is telegraphed once before the burst', () => {
  const engine = fakeEngine();
  const bloom = spawnPlanktonBloom(engine);
  bloom.age = PLANKTON_BLOOM_RULES.lifetime * PLANKTON_BLOOM_RULES.unstableAt - 0.04;
  bloom.phase = 'calm';
  updatePlanktonBloom(engine, bloom, 0.1);
  assert.equal(bloom.phase, 'unstable');
  assert.equal(engine.events.filter(event => event.type === 'bloomWarning').length, 1);
  updatePlanktonBloom(engine, bloom, 0.1);
  assert.equal(engine.events.filter(event => event.type === 'bloomWarning').length, 1);
});
