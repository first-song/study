import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { REACTOR_SITES, BIOFILM_SITES, INTERACTION_RULES, interactionPosition, interactionTarget, reactorPhase, exposureAt } from '../src/ecosystem.js';
import { depthFor, zoneFor, PLAYER_MAX_Y } from '../src/biology.js';
import { createLegacyWorld } from '../src/world.js';

const game = seed => { const engine = new GameEngine({ seed: seed || 195 }); engine.start(); engine.drainEvents(); return engine; };
const facilities = engine => { engine.state.entities = engine.state.entities.filter(e => ['reactor', 'biofilm', 'diver', 'islandNode', 'echo'].includes(e.type)); };
function tick(engine, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 10); i++) { if (engine.state.mode === 'playing') engine.spawnTimer = 3; engine.update(0.1, input); }
}
function at(engine, entity) {
  const p = engine.state.player, point = interactionPosition(entity);
  Object.assign(p, point, { y: Math.max(3, Math.min(PLAYER_MAX_Y, point.y)), vx: 0, vy: 0, vz: 0 });
  p.depth = depthFor(p.y); p.zone = zoneFor(p.y).id; p.lightBonus = p.branches.symbiosis >= 2 && p.y > 40;
}
function away(engine) { at(engine, { x: 99, y: 48, z: 0, radius: 0 }); }
function digest(engine, id = 'nursery') {
  const film = engine.state.entities.find(e => e.type === 'biofilm' && e.siteId === id);
  at(engine, film); tick(engine, 0.1, { interact: true }); tick(engine, INTERACTION_RULES.biofilmSeconds + 0.1);
  assert.equal(film.depleted, true); return film;
}
function unlockEcho(engine, reactor) {
  const echo=engine.state.entities.find(entity=>entity.type==='echo'&&entity.reactorSiteId===reactor.siteId);
  if(echo&&!echo.pacified) {
    Object.assign(echo,{pacified:true,phase:'pacified',phaseRemaining:0,hp:1,link:0,vx:0,vy:0,vz:0});
    if(!engine.state.expedition.echoesPacified.includes(echo.reactorSiteId))engine.state.expedition.echoesPacified.push(echo.reactorSiteId);
    if(!engine.state.expedition.milestones.includes(`echo:${echo.reactorSiteId}`))engine.state.expedition.milestones.push(`echo:${echo.reactorSiteId}`);
  }
}
function coolWindow(engine, reactor) {
  unlockEcho(engine,reactor);
  away(engine);
  for (let i = 0; i < 230 && (reactor.phase !== 'cooldown' || reactor.phaseRemaining < 9.2); i++) tick(engine, 0.1);
  assert.equal(reactor.phase, 'cooldown'); assert.ok(reactor.phaseRemaining >= 9.2);
  at(engine, reactor);
}

test('the ocean starts with normal and malformed fish, three grounded reactors and distinct nutrient substrates', () => {
  const engine = game();
  assert.equal(engine.state.entities.filter(e => e.type === 'food').length, 45);
  assert.equal(engine.state.entities.filter(e => e.type === 'reactor').length, 3);
  assert.equal(engine.state.entities.filter(e => e.type === 'biofilm').length, 3);
  assert.equal(engine.state.entities.filter(e => e.type === 'vent').length, 0);
  assert.equal(engine.state.entities.filter(e => e.type === 'fish' && e.variant !== 'normal').length, 9);
  assert.ok(engine.state.entities.some(e => e.type === 'shark' && e.variant !== 'normal'));
  assert.ok(engine.state.entities.some(e => e.type === 'fish' && e.variant === 'normal'));
  assert.equal(engine.restore(engine.serialize()), true);
});

test('food and hunts sustain nutrition without producing body growth', () => {
  const engine = game(); facilities(engine); const p = engine.state.player;
  p.nutrition = 20;
  for (let i = 0; i < 100; i++) engine._eat({ type: 'food', x: 0, y: 44, z: 0 });
  const prey = engine._entity('predator', 0, 44, 0, 1, 1, { speed: 1, damage: 1, attackTime: 0 });
  engine._hurtEnemy(prey, 99);
  assert.equal(p.level, 1); assert.equal(p.xp, 0); assert.equal(p.nutrition, 100);
});

test('G attachment digests one substrate, random growth resolves once, and pausing freezes it', () => {
  const engine = game(); facilities(engine);
  const film = engine.state.entities.find(e => e.type === 'biofilm');
  at(engine, film); tick(engine, 0.1, { interact: true }); tick(engine, 2);
  assert.equal(engine.state.player.attachment.kind, 'biofilm');
  engine.togglePause(); const frozen = engine.serialize(); tick(engine, 2);
  assert.deepEqual(engine.serialize(), frozen);
  engine.togglePause(); tick(engine, 10.1);
  assert.equal(engine.state.player.level, 3); assert.equal(engine.state.player.attachment, null);
  assert.deepEqual(engine.state.expedition.biofilms, [film.siteId]);
  assert.equal(engine.chooseEvolution('devour'), false);
  at(engine, film); tick(engine, 0.1, { interact: true }); tick(engine, 13);
  assert.equal(engine.state.player.level, 3); assert.equal(engine.state.expedition.milestones.length, 1);
  const energyBeforeDetach = engine.state.player.energy;
  tick(engine, 0.1, { dash: true }); assert.equal(engine.state.player.attachment, null);
  assert.equal(engine.state.player.dashTime, 0, 'Space and the touch dash button release without a second ability');
  assert.equal(engine.state.player.cooldowns.dash, 0);
  assert.ok(engine.state.player.energy >= energyBeforeDetach);
  tick(engine, 0.1, { dash: true });
  assert.ok(engine.state.player.dashTime > 0, 'a subsequent press while swimming still initiates a dash');
});

test('host adaptation requires time and actual movement; a lost host immediately releases the player', () => {
  const engine = game(); facilities(engine);
  const whale = engine._spawnWildlife('whale');
  Object.assign(whale, { x: 0, y: 44, z: 0, hunger: 0, breathTime: 100, speed: 0 });
  at(engine, whale); tick(engine, 0.1, { interact: true }); tick(engine, 13);
  assert.equal(engine.state.player.level, 1); assert.equal(engine.state.player.attachment.progress, 0);
  whale.speed = 6.2; tick(engine, 3);
  assert.ok(engine.state.player.attachment.travelled >= 12); assert.equal(engine.state.player.level, 3);
  assert.deepEqual(engine.state.expedition.hostAdaptations, ['whale']);
  tick(engine, 15); assert.equal(engine.state.player.level, 3);
  assert.equal(engine.restore(engine.serialize()), true);
  engine.state.entities.find(e => e.id === whale.id).dead = true;
  tick(engine, 0.1); assert.equal(engine.state.player.attachment, null);
  assert.ok(engine.drainEvents().some(e => e.type === 'detach'));
});

test('reactor entry uses its port, requires a developed cell group and respects pressure windows', () => {
  const engine = game(); facilities(engine); const reactor = engine.state.entities.find(e => e.type === 'reactor');
  at(engine, reactor); tick(engine, 0.1, { interact: true });
  assert.equal(engine.state.player.attachment, null); assert.equal(reactor.progress, 0);
  digest(engine);
  away(engine); while (reactor.phase !== 'warning') tick(engine, 0.1);
  at(engine, reactor); assert.equal(interactionTarget(engine.state).canAttach, false);
  tick(engine, 0.1, { interact: true }); assert.equal(engine.state.player.attachment, null);
  coolWindow(engine, reactor); tick(engine, 0.1, { interact: true }); tick(engine, 2);
  const progress = reactor.progress;
  tick(engine, 0.1, { detach: true }); away(engine); tick(engine, 1);
  assert.equal(reactor.progress, progress); assert.equal(engine.state.player.attachment, null);
  // Being merely near a pipe cannot advance its infiltration.
  at(engine, reactor); tick(engine, 1); assert.equal(reactor.progress, progress);
});

test('holding a reactor through discharge hurts and reverses infiltration; shutdown removes regional exposure', () => {
  const engine = game(); facilities(engine); digest(engine);
  const reactor = engine.state.entities.find(e => e.type === 'reactor');
  unlockEcho(engine,reactor);
  away(engine);
  while (reactor.phase !== 'cooldown' || reactor.phaseRemaining > 1.1) tick(engine, 0.1);
  at(engine, reactor); tick(engine, 0.1, { interact: true });
  while (reactor.phase !== 'discharge') tick(engine, 0.1);
  const hp = engine.state.player.hp, progress = reactor.progress;
  tick(engine, 0.8);
  assert.ok(engine.state.player.hp < hp - 6); assert.ok(reactor.progress < progress);
  tick(engine, 0.1, { detach: true });
  coolWindow(engine, reactor);
  const before = exposureAt([reactor], reactor); assert.ok(before > 0);
  tick(engine, 0.1, { interact: true }); tick(engine, 9.1);
  assert.equal(reactor.status, 'shutdown'); assert.equal(reactor.pollution, 0);
  assert.equal(exposureAt([reactor], reactor), 0);
  const level = engine.state.player.level;
  at(engine, reactor); tick(engine, 0.1, { interact: true }); tick(engine, 10);
  assert.equal(engine.state.player.level, level);
  assert.equal(engine.state.expedition.shutdowns.length, 1);
});

test('reactor exposure changes ordinary fish, persists phenotypes, and clears after a shutdown', () => {
  const engine = game(); facilities(engine);
  const reactor = engine.state.entities.find(e => e.type === 'reactor');
  const fish = engine._spawnWildlife('fish');
  Object.assign(fish, { x: reactor.x, y: 22, z: reactor.z, speed: 0, hunger: 0 });
  away(engine); tick(engine, 60);
  assert.notEqual(fish.variant, 'normal'); assert.ok(fish.exposure >= 12);
  const exposure = fish.exposure, variant = fish.variant;
  assert.equal(engine.restore(engine.serialize()), true);
  const restoredFish = engine.state.entities.find(e => e.id === fish.id);
  assert.equal(restoredFish.variant, variant); assert.equal(restoredFish.exposure, exposure);
  const restoredReactor = engine.state.entities.find(e => e.id === reactor.id);
  digest(engine); coolWindow(engine, restoredReactor); tick(engine, 0.1, { interact: true }); tick(engine, 9.1);
  const preClear = restoredFish.exposure; away(engine); tick(engine, 6);
  assert.ok(restoredFish.exposure < preClear); assert.equal(restoredFish.variant, variant);
});

test('deformed phenotypes change swimming, radiation tolerance and predation rather than only color', () => {
  const examples = {};
  for (const variant of ['normal', 'crooked', 'armored', 'lure']) {
    const engine = game(); facilities(engine); away(engine);
    const fish = engine._spawnWildlife('fish');
    Object.assign(fish, { x: 0, y: 44, z: 0, variant, hunger: 0, exposure: 0, seed: 1 });
    tick(engine, 3);
    examples[variant] = { engine, fish, speed: Math.hypot(fish.vx, fish.vy, fish.vz) };
  }
  assert.ok(examples.crooked.speed < examples.normal.speed * 0.8);
  assert.ok(examples.armored.speed < examples.normal.speed * 0.85);
  for (const { engine, fish } of Object.values(examples)) {
    const reactor = engine.state.entities.find(e => e.type === 'reactor');
    Object.assign(fish, { x: reactor.x, y: 22, z: reactor.z, vx: 0, vy: 0, vz: 0, speed: 0, exposure: 0 });
    tick(engine, 1);
  }
  assert.ok(examples.armored.fish.exposure < examples.normal.fish.exposure);
  const normalPrey = { hp: 44, type: 'fish', variant: 'normal' }, armoredPrey = { hp: 44, type: 'fish', variant: 'armored' };
  examples.normal.engine._predation({ type: 'shark' }, normalPrey);
  examples.normal.engine._predation({ type: 'shark' }, armoredPrey);
  assert.ok(armoredPrey.hp > normalPrey.hp);
  const foodA = { hp: 44, type: 'fish' }, foodB = { hp: 44, type: 'fish' };
  examples.normal.engine._predation(examples.normal.fish, foodA);
  examples.lure.engine._predation(examples.lure.fish, foodB);
  assert.ok(foodB.hp < foodA.hp);
});

test('a full expedition grows through real attachment actions, unseals the core, and can win', () => {
  const engine = game(702); facilities(engine); digest(engine);
  const whale = engine._spawnWildlife('whale');
  Object.assign(whale, { x: 0, y: 43, z: 0, hunger: 0, breathTime: 100 });
  at(engine, whale); tick(engine, 0.1, { interact: true }); tick(engine, 12.2);
  assert.equal(engine.state.player.level, 5); tick(engine, 0.1, { detach: true });
  engine.state.entities = engine.state.entities.filter(e => e.type !== 'whale');
  for (const reactor of engine.state.entities.filter(e => e.type === 'reactor')) {
    coolWindow(engine, reactor); tick(engine, 0.1, { interact: true }); tick(engine, 9.1);
    assert.equal(reactor.status, 'shutdown');
    const boss = engine.state.entities.find(e => e.type === 'boss');
    assert.equal(engine._canHarm(boss), engine.state.expedition.shutdowns.length === 3);
    assert.equal(game().restore(engine.serialize()), true);
  }
  assert.equal(engine.state.player.level, 11);
  assert.equal(engine.state.expedition.milestones.length, 8);
  const boss = engine.state.entities.find(e => e.type === 'boss'); at(engine, { ...boss, radius: 0 });
  // 母体的核心只有在自己张开的那几秒里才能被打到。
  boss.motherPhase = 'core'; boss.coreWindowOpen = true;
  engine._hurtEnemy(boss, 100000);
  assert.equal(boss.weakened, true);
  engine.state.player.cooldowns.feed = 0;
  engine.state.player.energy = engine.state.player.maxEnergy;
  tick(engine, 0.1, { feed: true });
  assert.equal(engine.state.mode, 'won'); assert.equal(game().restore(engine.serialize()), true);
});

test('v5 rejects duplicate rewards, missing facilities, forged cycles and dangling attachments atomically', () => {
  const engine = game(); digest(engine); const good = engine.serialize();
  const corruptions = [
    save => save.state.expedition.milestones.push(save.state.expedition.milestones[0]),
    save => save.state.entities.splice(save.state.entities.findIndex(e => e.type === 'reactor'), 1),
    save => { save.state.entities.find(e => e.type === 'reactor').phase = 'shutdown'; },
    save => { save.state.entities.find(e => e.type === 'fish').variant = 'god'; },
    save => { save.state.player.attachment = { entityId: 99999, kind: 'host', progress: 0, elapsed: 0, travelled: 0, startZone: 'sunlit', lastX: 0, lastY: 44, lastZ: 0 }; },
    save => { save.state.entities.find(e => e.type === 'biofilm').depleted = false; },
  ];
  for (const corrupt of corruptions) {
    const save = structuredClone(good); corrupt(save);
    assert.equal(engine.restore(save), false); assert.deepEqual(engine.serialize(), good);
  }
});

test('v4 migration preserves prior body progression and adds unclaimed ecological facilities', () => {
  const engine = game(); digest(engine);
  engine.state.world = createLegacyWorld(engine.state.world.seed);
  engine.state.entities = [];
  engine._seedEcology();
  engine._seedExpedition();
  engine._entity('vent', -25, 7, -22, 3.2, 1);
  const save = engine.serialize(); save.version = 4;
  delete save.state.expedition; delete save.state.player.attachment; delete save.state.world;
  for (const key of ['assimilations', 'assimilationHistory', 'ingestedPreyIds', 'apex', 'depthStress', 'diveSupport']) delete save.state.player[key];
  save.state.entities = save.state.entities.filter(e => e.type !== 'reactor' && e.type !== 'biofilm');
  for (const entity of save.state.entities) { delete entity.variant; delete entity.exposure; }
  const restored = game(); assert.equal(restored.restore(save), true);
  assert.equal(restored.state.player.level, 3); assert.equal(restored.state.expedition.legacyLevels, 2);
  assert.equal(restored.rngState, save.rngState); assert.deepEqual(restored.state.player.mutationHistory, save.state.player.mutationHistory);
  assert.deepEqual(restored.state.expedition.milestones, []);
  assert.equal(restored.state.entities.filter(e => e.type === 'reactor').length, REACTOR_SITES.length);
  assert.equal(restored.state.entities.filter(e => e.type === 'biofilm').length, BIOFILM_SITES.length);
  assert.equal(restored.state.entities.filter(e => e.type === 'vent').length, 0);
  assert.equal(restored.serialize().version, 10); assert.equal(game().restore(restored.serialize()), true);
});

test('stopping all reactors in a new ocean ends actual player exposure at every pipe entrance', () => {
  const engine = game(); digest(engine);
  assert.equal(engine.state.entities.some(e => e.type === 'vent'), false);
  for (const reactor of engine.state.entities.filter(e => e.type === 'reactor')) {
    coolWindow(engine, reactor); tick(engine, 0.1, { interact: true }); tick(engine, 9.1);
    assert.equal(reactor.status, 'shutdown');
  }
  for (const reactor of engine.state.entities.filter(e => e.type === 'reactor')) {
    at(engine, reactor); tick(engine, 2);
    const radiation = engine.state.player.radiation, energy = engine.state.player.mutationEnergy, events = engine.state.player.mutationEvents;
    tick(engine, 3);
    assert.ok(engine.state.player.radiation <= radiation);
    assert.equal(engine.state.player.mutationEnergy, energy);
    assert.equal(engine.state.player.mutationEvents, events);
  }
  assert.equal(engine.state.mode, 'playing');
});

test('reactor cycle boundaries are deterministic', () => {
  assert.deepEqual(reactorPhase(0), { phase: 'cooldown', remaining: 12 });
  assert.deepEqual(reactorPhase(12), { phase: 'warning', remaining: 4 });
  assert.deepEqual(reactorPhase(16), { phase: 'discharge', remaining: 5 });
  assert.deepEqual(reactorPhase(21), { phase: 'cooldown', remaining: 12 });
});
