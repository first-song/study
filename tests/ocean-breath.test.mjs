import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import {
  OCEAN_OUTCOME, OCEAN_RULES, classifyOutcome, detectionModifier, fearRadiusModifier,
  huntedOutSpecies, livingSpeciesRatio, oceanBalance, oceanDecay, outcomeFor, symbiosisCount,
} from '../src/ocean-breath.js';

const game = (seed = 42) => { const engine = new GameEngine({ seed }); engine.start(); engine.drainEvents(); return engine; };

function stateWith({ kills = 0, biofilms = 0, hosts = 0, nodes = 0, living = 12, killsBySpecies = {} } = {}) {
  return {
    stats: { preyKills: kills },
    ecology: { killsBySpecies },
    expedition: { biofilms: Array.from({ length: biofilms }, (_, i) => `b${i}`), hostAdaptations: Array.from({ length: hosts }, (_, i) => `h${i}`), parasiteNodes: Array.from({ length: nodes }, (_, i) => `n${i}`) },
    entities: Array.from({ length: living }, (_, i) => ({ type: ['fish', 'jelly', 'shark', 'squid', 'whale', 'ray', 'turtle', 'angler', 'crab', 'lanternfish', 'cuttlefish', 'oarfish'][i], dead: false })),
  };
}

test('海洋之息把猎杀和共生记在同一本账上，零账目是中立的', () => {
  const neutral = oceanBalance(stateWith());
  assert.equal(neutral, 0, '什么都不做的账目应该是 0');
  assert.equal(oceanDecay(stateWith()), 0, '中立时海不该被判定为崩坏');
  assert.equal(detectionModifier(stateWith()), 1, '中立时捕食者的发现距离不该被改动');
  assert.equal(fearRadiusModifier(stateWith()), 1, '中立时鱼群的回避半径不该被改动');

  const hunted = oceanBalance(stateWith({ kills: 10 }));
  assert.ok(hunted < 0, '猎杀必须让账目变负');
  assert.ok(detectionModifier(stateWith({ kills: 10 })) > 1, '海越差，捕食者越容易发现你');
  assert.ok(fearRadiusModifier(stateWith({ kills: 10 })) > 1, '海越差，鱼群越不愿意靠近你');

  const shared = oceanBalance(stateWith({ biofilms: 2, hosts: 2, nodes: 1 }));
  assert.ok(shared > 0, '共生必须让账目变正');
  assert.ok(detectionModifier(stateWith({ biofilms: 2, hosts: 2, nodes: 1 })) < 1, '海越好，你越难被锁定');
});

test('共生计数与存活物种比例是账目的两个来源', () => {
  assert.equal(symbiosisCount({ biofilms: ['a'], hostAdaptations: ['b', 'c'], parasiteNodes: [] }), 3);
  assert.equal(livingSpeciesRatio([
    { type: 'fish', dead: false }, { type: 'jelly', dead: false }, { type: 'fish', dead: true },
  ]), 2 / 12);
  // 把一个物种打到几乎绝迹，比杀五条鱼更致命。
  assert.equal(huntedOutSpecies({ fish: 47 }), 1);
  assert.equal(huntedOutSpecies({ fish: 3 }), 0);
  const decimated = oceanBalance(stateWith({ killsBySpecies: { fish: 47 } }));
  const hunting = oceanBalance(stateWith({ kills: 5 }));
  assert.ok(decimated < hunting, '物种灭绝的代价必须高于单纯猎杀');
});

test('三种收束由账目决定，且互不重叠', () => {
  assert.equal(classifyOutcome(OCEAN_RULES.thresholds.restored), OCEAN_OUTCOME.RESTORED);
  assert.equal(classifyOutcome(OCEAN_RULES.thresholds.restored + 1), OCEAN_OUTCOME.RESTORED);
  assert.equal(classifyOutcome(OCEAN_RULES.thresholds.ruined), OCEAN_OUTCOME.RUINED);
  assert.equal(classifyOutcome(OCEAN_RULES.thresholds.ruined - 1), OCEAN_OUTCOME.RUINED);
  assert.equal(classifyOutcome(0), OCEAN_OUTCOME.ASH);
  assert.equal(outcomeFor(stateWith({ biofilms: 3, hosts: 2, nodes: 1 })).id, 'restored');
  assert.equal(outcomeFor(stateWith({ kills: 40 })).id, 'ruined');
});

test('猎杀只统计真正的猎物，设施和回声体不算账', () => {
  const engine = game();
  const p = engine.state.player;
  p.level = 12;
  engine.state.stats.preyKills = 0;
  // 杀掉一只鱼：账目扣分。
  const fish = engine.state.entities.find(entity => entity.type === 'fish');
  engine._hurtEnemy(fish, 10000);
  assert.equal(engine.state.stats.preyKills, 1);
  assert.equal(engine.state.stats.kills, 1);
  // 杀掉一个设施类目标：不算猎杀。
  const before = engine.state.stats.preyKills;
  engine._hurtEnemy(engine.state.entities.find(entity => entity.type === 'islandNode'), 10000);
  assert.equal(engine.state.stats.preyKills, before);
  assert.ok(p);
});

test('胜利时账目被结算成结局，并且能随存档往返', () => {
  const engine = game(7);
  const p = engine.state.player;
  while (p.level < 11) { p.xp = p.xpNext; engine._checkLevel(); }
  // 造一个"共生流"的账目：三次菌膜 + 四种宿主。
  engine.state.expedition.biofilms = ['nursery', 'shelf', 'deep'];
  engine.state.expedition.hostAdaptations = ['fish', 'whale', 'turtle'];
  // 存档是自洽的：已消化的菌膜在实体上也要标成消化完成。
  for (const film of engine.state.entities.filter(entity => entity.type === 'biofilm')) {
    if (engine.state.expedition.biofilms.includes(film.siteId)) Object.assign(film, { depleted: true, progress: 1 });
  }
  for (const id of engine.state.expedition.biofilms) engine.state.expedition.milestones.push(`biofilm:${id}`);
  for (const id of engine.state.expedition.hostAdaptations) engine.state.expedition.milestones.push(`host:${id}`);
  engine.state.oceanBalance = oceanBalance(engine.state);
  assert.ok(engine.state.oceanBalance >= OCEAN_RULES.thresholds.restored);
  const save = engine.serialize();
  assert.equal(save.state.oceanOutcome, null, '还没通关就不该有结局');
  const restored = new GameEngine({ seed: 7 });
  assert.equal(restored.restore(save), true);
  assert.equal(restored.state.oceanBalance, engine.state.oceanBalance);
});

test('玩家不能指定账目：没有可以调整它的接口', () => {
  const engine = game();
  assert.equal(typeof engine.chooseOceanOutcome, 'undefined');
  assert.equal(typeof engine.setOceanBalance, 'undefined');
  assert.equal(engine.chooseEvolution('devour'), false, '演化仍然是不接受玩家选择的');
  assert.equal(engine.chooseMutation(), false, '异变仍然是不接受玩家选择的');
});
