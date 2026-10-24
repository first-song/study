import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { interactionPosition, interactionTarget, REACTOR_SITES } from '../src/ecosystem.js';

// This controller knows where objectives are, but uses only normal swimming,
// interaction, detach and pulse inputs. The complete seeded ecosystem remains
// active: no teleportation, health changes, level grants or facility fixtures.
// It verifies physical reachability and progression, not human discoverability.
// Pulse is a cone, so the controller also has to aim — it passes an explicit
// direction, exactly like the real input layer does.
function journey(seed) {
  const engine = new GameEngine({ seed });
  engine.start();
  let chosen = null;
  const evolutionEvents = [];

  for (let frame = 0; frame < 9000 && engine.state.mode === 'playing'; frame++) {
    const state = engine.state;
    const player = state.player;
    const input = {};
    const distance = target => Math.hypot(target.x - player.x, target.y - player.y, target.z - player.z);

    if (!state.expedition.biofilms.length) {
      chosen = state.entities.find(entity => entity.type === 'biofilm' && entity.siteId === 'nursery');
    } else if (!state.expedition.hostAdaptations.length) {
      if (!chosen || chosen.type !== 'fish' || !state.entities.includes(chosen)) {
        chosen = state.entities.filter(entity => entity.type === 'fish').sort((a, b) => distance(a) - distance(b))[0];
      }
    } else if (state.expedition.shutdowns.length < REACTOR_SITES.length) {
      const echoes = state.entities.filter(entity =>
        entity.type === 'echo' && !entity.pacified && !state.expedition.shutdowns.includes(entity.reactorSiteId)
      );
      chosen = (echoes.length ? echoes : state.entities.filter(entity => entity.type === 'reactor' && entity.status !== 'shutdown'))
        .sort((a, b) => distance(a) - distance(b))[0];
    } else {
      chosen = state.entities.find(entity => entity.type === 'boss');
    }

    // 有东西在追你的时候，附着就是活靶子 —— 先脱身。
    const nearestThreat = state.entities
      .filter(entity => entity.type === 'predator' || entity.type === 'drone')
      .sort((a, b) => distance(a) - distance(b))[0];
    const threatened = Boolean(nearestThreat) && distance(nearestThreat) < 14;
    if (player.attachment) {
      if (player.attachment.kind === 'host' && state.expedition.hostAdaptations.length) input.detach = true;
      if (player.attachment.kind === 'reactor' && chosen.phase !== 'cooldown') input.detach = true;
      if (threatened && player.attachment.kind !== 'host') input.detach = true;
    } else if (chosen) {
      // 排放母体的每个阶段都有一个明确目标：先切触须，再打散云团，最后趁窗口打核心。
      let aim = chosen;
      if (chosen.type === 'boss') {
        const tendrils = state.entities.filter(entity => entity.type === 'tendril');
        if (chosen.motherPhase === 'armor' && tendrils.length) {
          aim = tendrils.sort((a, b) => distance(a) - distance(b))[0];
        } else if (chosen.motherPhase === 'spout') {
          const clouds = (chosen.clouds || []).filter(cloud => cloud.active);
          if (clouds.length) aim = { x: clouds[0].x, y: clouds[0].y, z: clouds[0].z };
        }
      }
      const point = chosen.type === 'boss' ? aim : interactionPosition(chosen);
      const remaining = distance(point);
      if (remaining > 1.8) {
        input.x = (point.x - player.x) / remaining;
        input.y = (point.y - player.y) / remaining;
        input.z = (point.z - player.z) / remaining;
      }
      // 近身的原生捕食者优先处理：脉冲是扇形，瞄错方向就白放。
      const immediate = nearestThreat;
      const aimPoint = immediate && distance(immediate) < 16 ? immediate : aim;
      const aimLength = Math.hypot(aimPoint.x - player.x, aimPoint.y - player.y, aimPoint.z - player.z) || 1;
      input.dir = {
        x: (aimPoint.x - player.x) / aimLength,
        y: (aimPoint.y - player.y) / aimLength,
        z: (aimPoint.z - player.z) / aimLength,
      };
      const target = interactionTarget(state);
      if (target?.entityId === chosen.id && target.canAttach && !threatened &&
          (chosen.type !== 'reactor' || chosen.phaseRemaining > 9.3)) {
        input.interact = true;
      }
      if (chosen.type === 'echo' && distance(chosen) < 18) {
        input.pulse = true;
        // 近战回声体脉冲打不动，蓄力与开壳时用冲刺撞它。
        if (chosen.phase === 'charge' && distance(chosen) < 24) input.dash = true;
        if (chosen.phase === 'exposed' && distance(chosen) < 12) input.dash = true;
        if (chosen.hp <= chosen.maxHp * .32 && distance(chosen) < chosen.radius + player.size + 4) input.feed = true;
      }
      if (chosen.type === 'boss' && chosen.weakened && player.apex &&
          distance(chosen) < chosen.radius + player.size + 6) {
        input.feed = true;
      }
      input.pulse = Boolean(aimPoint) && distance(aimPoint) < 16;
    }

    engine.update(0.1, input);
    for (const event of engine.drainEvents()) {
      if (event.type === 'evolution' || event.type === 'level') evolutionEvents.push(event);
    }
    assert.notEqual(engine.state.mode, 'evolving', 'body development must never wait for a route selection');
  }
  return { engine, evolutionEvents };
}

for (const seed of [11, 195, 702, 913, 2026]) {
  test(`full living ocean is traversable from cell birth to victory using normal inputs (seed ${seed})`, () => {
    const { engine, evolutionEvents } = journey(seed);
    const state = engine.state;
    assert.equal(state.mode, 'won', `journey ended at ${state.time.toFixed(1)} s, level ${state.player.level}`);
    assert.ok(state.player.hp > 0);
    assert.equal(state.player.level, 13);
    assert.deepEqual(state.expedition.biofilms, ['nursery']);
    assert.deepEqual(state.expedition.hostAdaptations, ['fish']);
    assert.deepEqual([...state.expedition.shutdowns].sort(), REACTOR_SITES.map(site => site.id).sort());
    assert.deepEqual([...state.expedition.echoesPacified].sort(), REACTOR_SITES.map(site => site.id).sort());
    assert.equal(state.entities.filter(entity => entity.type === 'reactor' && entity.status === 'shutdown').length, 3);
    assert.equal(state.expedition.milestones.length, 8);
    assert.ok(state.stats.distance > 200, 'the player must actually cross the ocean');
    assert.ok(state.ecology.predations > 0, 'the ordinary food web must remain active during the journey');
    assert.equal(evolutionEvents.filter(event => event.type === 'evolution').length, 12);
    assert.equal(evolutionEvents.every(event => event.automatic === true), true);
    assert.equal(new GameEngine({ seed }).restore(engine.serialize()), true, 'the organically earned victory must be restorable');
  });
}
