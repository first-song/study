import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, ANIMAL_COUNTS } from '../src/engine.js';
import { ASSIMILATIONS, diveAdaptation, initialAssimilations } from '../src/assimilation.js';
import { createWorld, createLegacyWorld } from '../src/world.js';
import { islandFinalCorePoint } from '../src/island.js';

function game(seed = 123) { const engine = new GameEngine({ seed }); engine.start(); engine.drainEvents(); return engine; }
function mature(engine, level = 7) {
  while (engine.state.player.level < level) { engine.state.player.xp = engine.state.player.xpNext; engine._checkLevel(); }
  engine.drainEvents();
}
function tissue(engine, type = 'lanternfish') {
  mature(engine);
  const prey = engine.state.entities.find(e => e.type === type);
  assert.ok(prey, type);
  Object.assign(prey, { x: 0, y: type === 'squid' ? 12 : 24, z: 0 });
  engine._hurtEnemy(prey, 10000);
  engine.state.entities = engine.state.entities.filter(e => !e.dead);
  return engine.state.entities.filter(e => e.sourceId === prey.id);
}
function consume(engine, pellet) { engine._eat(pellet); engine.state.entities = engine.state.entities.filter(e => !e.dead); }

test('32-bit run seeds independently reproduce a substantially larger inhabited world', () => {
  const a = game(0), b = game(0), c = game(4294967295);
  assert.deepEqual(a.serialize(), b.serialize());
  assert.equal(a.state.world.seed, 0);
  assert.equal(c.state.world.seed, 4294967295);
  assert.notDeepEqual(a.state.world.reactorSites, c.state.world.reactorSites);
  assert.equal(a.state.world.radius, 320);
  assert.ok(a.state.entities.some(e => Math.hypot(e.x, e.z) > 200));
  assert.equal(Object.values(ANIMAL_COUNTS).reduce((sum, n) => sum + n, 0), 174);
  for (const type of ['lanternfish', 'cuttlefish', 'oarfish']) assert.equal(a.state.entities.filter(e => e.type === type).length, ANIMAL_COUNTS[type]);
  const rng = a.rngState; createWorld(123456789); assert.equal(a.rngState, rng);
  a.start(83); assert.equal(a.state.world.seed, 83); assert.deepEqual(a.state.world, createWorld(83));
  assert.equal(a.restore(a.serialize()), true);
});

test('killing compatible prey does not grant an organ; actually digesting its tissue rolls once per donor', () => {
  const engine = game(98);
  const fragments = tissue(engine);
  assert.ok(fragments.length > 1);
  assert.equal(engine.state.player.assimilationHistory.length, 0);
  assert.ok(fragments.every(e => e.sourceId === fragments[0].sourceId && e.sourceType === 'lanternfish'));
  consume(engine, fragments[0]);
  const afterFirst = engine.rngState;
  assert.equal(engine.state.player.assimilationHistory.length, 1);
  for (const fragment of fragments.slice(1)) consume(engine, fragment);
  assert.equal(engine.state.player.assimilationHistory.length, 1);
  assert.equal(engine.rngState, afterFirst, 'extra portions cannot reroll a failed donor');
  assert.equal(engine.state.player.assimilationHistory[0].trait, 'lureLamp');
  assert.equal(engine.restore(engine.serialize()), true);
});

test('normal game ingestion triggers assimilation and preserves both successful and failed random outcomes', () => {
  const results = new Set();
  for (let seed = 0; seed < 20; seed++) {
    const engine = game(seed), fragments = tissue(engine);
    const p = engine.state.player;
    Object.assign(p, { x: fragments[0].x, y: fragments[0].y, z: fragments[0].z });
    engine.state.entities = engine.state.entities.filter(e => ['reactor', 'biofilm', 'boss', 'diver', 'islandNode', 'echo'].includes(e.type) || e.sourceId === fragments[0].sourceId);
    engine.spawnTimer = 3; engine.update(0.1);
    assert.equal(p.assimilationHistory.length, 1);
    results.add(p.assimilationHistory[0].success);
    assert.equal(p.assimilations.lureLamp, p.assimilationHistory[0].success ? 1 : 0);
    assert.equal(engine.restore(engine.serialize()), true);
  }
  assert.deepEqual(results, new Set([true, false]));
});

test('a saved half-eaten donor and its PRNG continue identically without duplicate organ rewards', () => {
  const a = game(81), fragments = tissue(a, 'squid');
  consume(a, fragments[0]);
  const b = game(2); assert.equal(b.restore(a.serialize()), true);
  const donor = fragments[0].sourceId;
  for (const engine of [a, b]) for (const part of [...engine.state.entities].filter(e => e.sourceId === donor)) consume(engine, part);
  assert.deepEqual(a.serialize(), b.serialize());
  assert.equal(a.state.player.ingestedPreyIds.length, 1);
});

test('all organ sources have a functional depth or mobility effect; dark diving has several alternatives', () => {
  const engine = game(), p = engine.state.player;
  p.y = 3;
  const base = diveAdaptation(p);
  p.assimilations.lureLamp = 1;
  assert.ok(diveAdaptation(p).senseRadius > base.senseRadius * 2);
  p.assimilations = initialAssimilations(); p.assimilations.electroreception = 1;
  assert.ok(diveAdaptation(p).senseRadius > base.senseRadius * 2);
  p.assimilations = initialAssimilations(); p.assimilations.pressure = 1;
  assert.ok(diveAdaptation(p).depthStress < base.depthStress);
  p.assimilations = initialAssimilations(); p.assimilations.carapace = 1;
  assert.ok(diveAdaptation(p).depthStress < base.depthStress);
  p.assimilations = initialAssimilations(); p.mutations.membrane = 2;
  assert.ok(diveAdaptation(p).depthStress < base.depthStress);
  assert.ok(diveAdaptation(p, 'whale').depthStress < base.depthStress * 0.2);
  assert.equal(diveAdaptation(p, 'whale').diveSupport, '宿主引导');
  p.mutations.membrane = 0; p.y = 44;
  engine.spawnTimer = 3; engine.update(0.1, { dash: true });
  const normalCooldown = p.cooldowns.dash;
  p.cooldowns.dash = 0; p.assimilations.jet = 2; p.energy = p.maxEnergy;
  engine.update(0.1, { dash: true });
  assert.ok(p.cooldowns.dash < normalCooldown);
  assert.equal(ASSIMILATIONS.length, 5);
});

test('unadapted early cells can make short reactor dives, while adaptation lowers the sustained metabolic cost', () => {
  const bare = game(88), adapted = game(88);
  for (const engine of [bare, adapted]) {
    engine.state.entities = []; engine.state.player.y = 3;
    engine.spawnTimer = 3;
  }
  adapted.state.player.assimilations.pressure = 2;
  for (let i = 0; i < 150; i++) for (const engine of [bare, adapted]) { engine.spawnTimer = 3; engine.update(0.1); }
  assert.equal(bare.state.mode, 'playing'); assert.ok(bare.state.player.hp > 90);
  assert.ok(adapted.state.player.nutrition > bare.state.player.nutrition + 2);
  assert.ok(adapted.state.player.depthStress < bare.state.player.depthStress);
});

test('movement stops promptly, stays inside the expanded boundary, and remote wildlife continues to swim', () => {
  const engine = game(), p = engine.state.player;
  for (let i = 0; i < 30; i++) engine.update(1 / 60, { x: 1 });
  assert.ok(p.vx > p.speed * 0.9);
  for (let i = 0; i < 12; i++) engine.update(1 / 60);
  assert.ok(p.vx < p.speed * 0.04);
  p.x = 319.9; p.z = 0;
  const distant = engine.state.entities.find(e => e.type === 'oarfish' && Math.hypot(e.x - p.x, e.z - p.z) > 150);
  const before = { x: distant.x, z: distant.z };
  for (let i = 0; i < 60; i++) engine.update(1 / 60, { x: 1 });
  assert.ok(Math.hypot(p.x, p.z) <= 320);
  assert.ok(Math.hypot(distant.x - before.x, distant.z - before.z) > 0.1);
});

test('the weakened island core survives pulses and requires a mature nearby devouring action', () => {
  const engine = game(); mature(engine, 11);
  for (const echo of engine.state.entities.filter(e => e.type === 'echo')) {
    Object.assign(echo, { pacified: true, phase: 'pacified', phaseRemaining: 0, hp: 1, link: 0 });
    engine.state.expedition.echoesPacified.push(echo.reactorSiteId);
    engine.state.expedition.milestones.push(`echo:${echo.reactorSiteId}`);
  }
  for (const reactor of engine.state.entities.filter(e => e.type === 'reactor')) {
    Object.assign(reactor, { status: 'shutdown', phase: 'shutdown', phaseRemaining: 0, pollution: 0, progress: 1 });
    engine.state.expedition.shutdowns.push(reactor.siteId);
    engine.state.expedition.milestones.push(`reactor:${reactor.siteId}`);
  }
  const core = engine.state.entities.find(e => e.type === 'boss');
  assert.deepEqual({ x: core.x, y: core.y, z: core.z }, islandFinalCorePoint(engine.state.world));
  // 母体的核心只有在自己张开的那几秒里才能被打到。
  core.motherPhase = 'core'; core.coreWindowOpen = true;
  engine._hurtEnemy(core, 100000);
  assert.equal(core.weakened, true); assert.equal(core.hp, 1); assert.equal(engine.state.mode, 'playing');
  engine._hurtEnemy(core, 100000); assert.equal(core.hp, 1);
  engine.state.player.energy = engine.state.player.maxEnergy;
  engine.update(0.1, { feed: true }); assert.equal(engine.state.mode, 'playing', 'distant feeding cannot consume the island');
  Object.assign(engine.state.player, { x: core.x, y: core.y, z: core.z });
  engine.state.player.cooldowns.feed = 0;
  engine.update(0.1, { feed: true });
  assert.equal(engine.state.mode, 'won'); assert.ok(engine.drainEvents().some(e => e.type === 'islandDevoured'));
  assert.equal(engine.state.entities.some(e => e.type === 'boss'), false);
  assert.equal(engine.restore(engine.serialize()), true);
});

test('v9 validation rejects forged donors, duplicate digestion, trait ranks and world geometry atomically', () => {
  const engine = game(53), parts = tissue(engine);
  consume(engine, parts[0]);
  const good = engine.serialize();
  const corruptions = [
    save => save.state.player.ingestedPreyIds.push(save.state.player.ingestedPreyIds[0]),
    save => save.state.player.assimilationHistory[0].sourceType = 'fish',
    save => save.state.player.assimilations.lureLamp = 3,
    save => save.state.entities.find(e => e.sourceId).sourceId = save.state.entities.find(e => e.type === 'reactor').id,
    save => save.state.entities.find(e => e.sourceId).sourceY = 999,
    save => save.state.world.radius = 99999,
    save => save.state.world.reactorSites[0].x += 10,
    save => save.state.player.depthStress = 0.9,
  ];
  for (const corrupt of corruptions) {
    const save = structuredClone(good); corrupt(save);
    assert.equal(engine.restore(save), false); assert.deepEqual(engine.serialize(), good);
  }
});

test('authentic v5 geometry migrates without relocating facilities, granting donor rolls or changing RNG', () => {
  const engine = game(991);
  engine.state.world = createLegacyWorld(991);
  engine.state.entities = [];
  engine._seedEcology(); engine._seedExpedition();
  const save = engine.serialize(); save.version = 5;
  delete save.state.world;
  for (const key of ['assimilations', 'assimilationHistory', 'ingestedPreyIds', 'apex', 'depthStress', 'diveSupport']) delete save.state.player[key];
  const oldReactor = save.state.entities.find(e => e.type === 'reactor');
  const restored = game(); assert.equal(restored.restore(save), true);
  assert.equal(restored.rngState, save.rngState);
  assert.equal(restored.state.world.legacy, true); assert.equal(restored.state.world.radius, 110);
  assert.deepEqual(restored.state.entities.find(e => e.type === 'reactor'), oldReactor);
  assert.deepEqual(restored.state.player.assimilations, initialAssimilations());
  assert.equal(restored.serialize().version, 10); assert.equal(restored.restore(restored.serialize()), true);
});
