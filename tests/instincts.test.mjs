import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { INSTINCTS, SYMBIOSIS_INSTINCTS, initialInstincts, instinctAvailable, instinctDefinition, instinctRank, instinctTier } from '../src/instincts.js';
import { ASSIMILATIONS } from '../src/assimilation.js';
import { MUTATIONS as MUTATION_LIST } from '../src/mutations.js';

const game = (seed = 42) => { const engine = new GameEngine({ seed }); engine.start(); engine.drainEvents(); return engine; };

test('本能的目录是完整的，并且每一项都有可用的参数', () => {
  assert.deepEqual(INSTINCTS.map(instinct => instinct.id), ['bite', 'jet', 'pulse', 'mimic', 'sense']);
  for (const instinct of INSTINCTS) {
    assert.ok(instinct.name, `${instinct.id} 缺少名字`);
    assert.ok(instinct.summary, `${instinct.id} 缺少说明`);
    assert.ok(instinct.source, `${instinct.id} 缺少来源描述`);
    assert.equal(instinct.tiers.length, 3, `${instinct.id} 应当有两阶`);
    assert.ok(instinct.tiers[1] && instinct.tiers[2], `${instinct.id} 的两阶参数缺失`);
    if (!instinct.base) assert.equal(instinct.tiers[0], null, `${instinct.id} 未获得时不该有参数`);
  }
  // 脉冲是唯一从开局就存在的保底技能。
  assert.equal(INSTINCTS.filter(instinct => instinct.base).length, 1);
  assert.equal(instinctDefinition('pulse').base, true);
});

test('没有获得的本能拿不到参数，脉冲则一直可用', () => {
  const player = { instincts: initialInstincts() };
  assert.equal(instinctTier(player, 'bite'), null);
  assert.equal(instinctAvailable(player, 'bite'), false);
  assert.ok(instinctTier(player, 'pulse'), '脉冲应当一直可用');
  assert.equal(instinctAvailable(player, 'pulse'), true);
  player.instincts.bite = 1;
  assert.equal(instinctRank(player, 'bite'), 1);
  assert.ok(instinctTier(player, 'bite').windup > 0);
});

test('器官与随机异变各自绑定一个主动本能', () => {
  const bound = new Set();
  for (const trait of ASSIMILATIONS) {
    if (!trait.instinct) continue;
    assert.ok(INSTINCTS.some(instinct => instinct.id === trait.instinct), `${trait.id} 绑定了不存在的本能`);
    bound.add(trait.instinct);
  }
  for (const mutation of MUTATION_LIST) {
    if (!mutation.instinct) continue;
    assert.ok(INSTINCTS.some(instinct => instinct.id === mutation.instinct), `${mutation.id} 绑定了不存在的本能`);
    bound.add(mutation.instinct);
  }
  // 四个非保底技能都至少有一个来源，玩家不会因为运气完全拿不到操作。
  for (const instinct of INSTINCTS.filter(entry => !entry.base)) {
    assert.ok(bound.has(instinct.id), `${instinct.id} 没有任何随机来源`);
  }
  // 耐压组织保持纯被动：它本来就只降低深潜负担。
  assert.equal(ASSIMILATIONS.find(trait => trait.id === 'pressure').instinct, null);
});

test('本能只能由随机事件抵达，玩家没有任何指定接口', () => {
  const engine = game();
  const player = engine.state.player;
  assert.equal(typeof engine.chooseInstinct, 'undefined');
  assert.equal(typeof engine.selectInstinct, 'undefined');
  assert.equal(typeof engine.buyInstinct, 'undefined');
  assert.equal(player.instincts.bite, 0);
  // 引擎内部有一个随机授予的方法，但它只接受"来源"而不接受玩家选择。
  const before = player.instincts.mimic;
  engine._grantRandomInstinct(SYMBIOSIS_INSTINCTS, '测试');
  assert.ok(player.instincts.mimic >= before);
  assert.ok(player.instinctLog.length >= 1, '每一次授予都要留下只读记录');
});

test('菌膜共生只教共生型的本能，猎杀才给捕食型的', () => {
  assert.deepEqual([...SYMBIOSIS_INSTINCTS], ['mimic', 'sense']);
  const carapace = ASSIMILATIONS.find(trait => trait.id === 'carapace');
  const jet = ASSIMILATIONS.find(trait => trait.id === 'jet');
  assert.equal(carapace.instinct, 'bite', '甲壳应当整合出撕咬');
  assert.equal(jet.instinct, 'jet', '喷射腔应当整合出突进');
});

test('授予的本能会写进只读记录，并且两阶封顶', () => {
  const engine = game();
  const player = engine.state.player;
  assert.equal(engine._unlockInstinct('bite', '测试'), true);
  assert.equal(player.instincts.bite, 1);
  assert.equal(engine._unlockInstinct('bite', '测试'), true);
  assert.equal(player.instincts.bite, 2);
  assert.equal(engine._unlockInstinct('bite', '测试'), false, '本能最多两阶');
  assert.equal(player.instinctLog.length, 2);
});

test('捕食型与共生型本能各保底一个：主线永远有解',()=>{
  const engine = game();
  const player = engine.state.player;
  // 猎杀给的是捕食型，菌膜给的是共生型，两边各保底一次。
  engine._grantRandomInstinct(['bite', 'jet'], '猎杀', 0.0);
  engine._grantRandomInstinct(['mimic', 'sense'], '菌膜', 0.0);
  const kinds = player.instinctLog.map(entry => entry.id);
  assert.ok(kinds.some(id => id === 'bite' || id === 'jet'), '应当保底一个捕食型本能');
  assert.ok(kinds.some(id => id === 'mimic' || id === 'sense'), '应当保底一个共生型本能');
  // 同一类的第二次就不保底了。
  const before = player.instinctLog.length;
  engine._grantRandomInstinct(['bite', 'jet'], '猎杀', 0.0);
  assert.equal(player.instinctLog.length, before, '同一类别的第二次不该再保底');
});
