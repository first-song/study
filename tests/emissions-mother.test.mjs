import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { MOTHER_PHASE, MOTHER_RULES, createTendrils, isMother, updateMother } from '../src/emissions-mother.js';

const game = (seed = 42) => { const engine = new GameEngine({ seed }); engine.start(); engine.drainEvents(); return engine; };

function spawnMother(engine, x = 0, y = 30, z = 0) {
  const boss = engine._entity('boss', x, y, z, 6.5, MOTHER_RULES.coreHp, {
    attackTime: 3, phase: 1, weakened: false,
    motherPhase: MOTHER_PHASE.ARMOR, clouds: [], coreWindowOpen: false,
    coreTimer: 0, rageTimer: MOTHER_RULES.rageInterval, spoutTimer: 1.5,
  });
  createTendrils(engine, boss);
  return boss;
}

test('母体带着三条触须，并且每个阶段都有各自的字段', () => {
  const engine = game();
  const boss = spawnMother(engine);
  assert.ok(isMother(boss));
  assert.equal(boss.motherPhase, MOTHER_PHASE.ARMOR);
  assert.equal(engine.state.entities.filter(entity => entity.type === 'tendril').length, MOTHER_RULES.tendrilCount);
  assert.equal(boss.clouds.length, 0);
  assert.equal(boss.coreWindowOpen, false);
});

test('外甲期间核心免疫，但冲击会撕到离得最近的触须', () => {
  const engine = game();
  const boss = spawnMother(engine);
  const tendrils = engine.state.entities.filter(entity => entity.type === 'tendril');
  const target = tendrils[0];
  const before = target.hp;
  engine._hurtEnemy(boss, 100, { x: target.x, y: target.y, z: target.z });
  assert.ok(target.hp < before, '外甲上的冲击应该撕到触须');
  assert.equal(boss.weakened, false);
  // 离得太远就打不到任何触须。
  const far = tendrils[1].hp;
  engine._hurtEnemy(boss, 100, { x: boss.x + 60, y: boss.y, z: boss.z + 60 });
  assert.equal(tendrils[1].hp, far);
});

test('三条触须全部切断后，母体进入喷发阶段并开始吐出污染云', () => {
  const engine = game();
  const boss = spawnMother(engine);
  for (const tendril of engine.state.entities.filter(entity => entity.type === 'tendril')) {
    engine._hurtEnemy(tendril, 10000);
  }
  engine.update(0.1, {});
  assert.equal(engine.state.entities.filter(entity => entity.type === 'tendril').length, 0);
  assert.equal(boss.motherPhase, MOTHER_PHASE.SPOUT);
  // 云团会自己冒出来。
  for (let tick = 0; tick < 40; tick++) engine.update(0.1, {});
  assert.ok(boss.clouds.length > 0, '喷发阶段应该出现污染云');
  assert.ok(boss.clouds.some(cloud => cloud.active));
});

test('核心只在窗口张开时能被伤到，母体因此才会崩解', () => {
  const engine = game();
  const boss = spawnMother(engine);
  boss.motherPhase = MOTHER_PHASE.CORE;
  boss.coreWindowOpen = false;
  engine._hurtEnemy(boss, 500, { x: boss.x, y: boss.y, z: boss.z });
  assert.equal(boss.hp, boss.maxHp, '核心闭合时不该掉血');
  boss.coreWindowOpen = true;
  engine._hurtEnemy(boss, 500, { x: boss.x, y: boss.y, z: boss.z });
  assert.ok(boss.hp < boss.maxHp, '核心张开时必须能被打伤');
  engine._hurtEnemy(boss, 100000, { x: boss.x, y: boss.y, z: boss.z });
  assert.equal(boss.weakened, true);
  assert.equal(boss.hp, 1);
  assert.equal(boss.motherPhase, MOTHER_PHASE.DEAD);
});

test('污染云里会持续灼烧玩家，拟态把它削弱', () => {
  const engine = game();
  const boss = spawnMother(engine);
  const player = engine.state.player;
  boss.clouds = [{ x: player.x, y: player.y, z: player.z, radius: 10, life: 0, active: true, seed: 1 }];
  boss.motherPhase = MOTHER_PHASE.SPOUT;
  const plain = player.hp;
  for (let tick = 0; tick < 10; tick++) engine.update(0.1, {});
  const hurt = plain - player.hp;
  assert.ok(hurt > 0, '站在污染云里应该掉血');

  const guarded = game();
  const guardedBoss = spawnMother(guarded);
  const guardedPlayer = guarded.state.player;
  guardedBoss.clouds = [{ x: guardedPlayer.x, y: guardedPlayer.y, z: guardedPlayer.z, radius: 10, life: 0, active: true, seed: 1 }];
  guardedBoss.motherPhase = MOTHER_PHASE.SPOUT;
  guardedPlayer.instincts.mimic = 1;
  guardedPlayer.mimicActive = true;
  const guardedBefore = guardedPlayer.hp;
  for (let tick = 0; tick < 10; tick++) guarded.update(0.1, { mimic: true });
  assert.ok(guardedBefore - guardedPlayer.hp < hurt, '拟态必须削弱污染云的灼烧');
});

test('触须不是普通敌人：它们不会被通用 AI 拖着跑成 NaN', () => {
  const engine = game();
  const boss = spawnMother(engine);
  for (let tick = 0; tick < 60; tick++) engine.update(0.1, {});
  for (const tendril of engine.state.entities.filter(entity => entity.type === 'tendril')) {
    assert.ok(Number.isFinite(tendril.x) && Number.isFinite(tendril.y) && Number.isFinite(tendril.z));
  }
  assert.ok(Number.isFinite(boss.x));
});

test('母体死亡时触须和污染云一起清除', () => {
  const engine = game();
  const boss = spawnMother(engine);
  boss.motherPhase = MOTHER_PHASE.CORE;
  boss.coreWindowOpen = true;
  boss.clouds = [{ x: boss.x, y: boss.y, z: boss.z, radius: 4, life: 1, active: true, seed: 1 }];
  engine._hurtEnemy(boss, 100000, { x: boss.x, y: boss.y, z: boss.z });
  assert.equal(engine.state.entities.filter(entity => entity.type === 'tendril').length, 0);
  assert.equal(boss.clouds.filter(cloud => cloud.active).length, 0);
});

test('外甲挡得住辐射脉冲：触须只能用近身撕开',()=>{
  const engine = game();
  const boss = spawnMother(engine);
  const tendril = engine.state.entities.find(entity => entity.type === 'tendril');
  const hp0 = tendril.hp;
  engine._hurtEnemy(tendril, 100, null, 'pulse');
  const pulseDamage = hp0 - tendril.hp;
  tendril.hp = hp0;
  engine._hurtEnemy(tendril, 100, null, 'melee');
  const meleeDamage = hp0 - tendril.hp;
  assert.ok(meleeDamage > pulseDamage * 3, `近身应该明显更有效：脉冲 ${pulseDamage} vs 近身 ${meleeDamage}`);
  assert.ok(pulseDamage > 0, '脉冲也应当有点效果，只是慢得多');
});
