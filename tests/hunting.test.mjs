import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_NOTES, HUNT_WINDOWS, huntWindowAt, noteById, noteForSpecies, outsideVision, windowDamage } from '../src/hunting.js';

test('每一种可猎杀的野生动物都有窗口定义', () => {
  for (const type of ['fish', 'lanternfish', 'crab', 'jelly', 'angler', 'ray', 'turtle', 'cuttlefish', 'oarfish', 'squid', 'shark']) {
    assert.ok(HUNT_WINDOWS[type], `${type} 缺少猎杀窗口`);
    assert.ok(HUNT_WINDOWS[type].multiplier > 1);
  }
  // 鲸与人类不参与战斗，窗口必须是空定义。
  assert.equal(HUNT_WINDOWS.whale.kind, 'none');
  assert.equal(HUNT_WINDOWS.diver.kind, 'none');
});

test('鱼群盲区：身后成立，正前方不成立', () => {
  const fish = { type: 'fish', x: 0, y: 0, z: 0, vx: 0, vz: -1 }; // 朝 -Z 游
  const behind = { x: 0, y: 0, z: 4 };
  const front = { x: 0, y: 0, z: -4 };
  assert.equal(outsideVision(fish, behind, 120), true);
  assert.equal(outsideVision(fish, front, 120), false);
  assert.equal(huntWindowAt(fish, 0, behind).open, true);
  assert.equal(huntWindowAt(fish, 0, front).open, false);
  assert.equal(huntWindowAt(fish, 0, behind).label, '鱼群盲区');
});

test('没有朝向信息时按 heading 计算，而不是默认背对', () => {
  const still = { type: 'fish', x: 0, y: 0, z: 0, heading: 0 };
  // heading=0 时朝向 (-sin0, -cos0) = (0,-1)，正前方仍是 -Z。
  assert.equal(outsideVision(still, { x: 0, y: 0, z: -5 }, 120), false);
  assert.equal(outsideVision(still, { x: 0, y: 0, z: 5 }, 120), true);
});

test('周期窗口按各自的周期开合，且同一时刻不同个体错开', () => {
  const crabA = { type: 'crab', seed: 0 };
  const crabB = { type: 'crab', seed: Math.PI };
  const period = HUNT_WINDOWS.crab.period;
  assert.equal(huntWindowAt(crabA, 0).open, true);
  assert.equal(huntWindowAt(crabA, HUNT_WINDOWS.crab.open + 1).open, false);
  assert.equal(huntWindowAt(crabA, period).open, true);
  // 相位偏移让同一片海里的蟹不会同时蜕壳。
  assert.equal(huntWindowAt(crabB, 0).open, false);
});

test('扑空窗口只看 recoveryUntil，到期立刻关闭', () => {
  const shark = { type: 'shark', recoveryUntil: 10 };
  assert.equal(huntWindowAt(shark, 9.9).open, true);
  assert.equal(huntWindowAt(shark, 10).open, false);
  assert.equal(huntWindowAt({ type: 'shark' }, 0).open, false);
});

test('窗口伤害叠加已解锁的笔记加成', () => {
  const window = { open: true, label: '蜕壳', multiplier: 3 };
  assert.equal(windowDamage(window, []), 3);
  assert.equal(windowDamage(window, ['crabMolt']), 3);
  assert.equal(windowDamage({ open: false, multiplier: 1 }, ['crabMolt']), 1);
  // 伤害类笔记只给对应物种加成，但函数本身按窗口倍率叠加。
  assert.equal(windowDamage(window, ['fishBlind']), 3.5);
});

test('笔记与物种一一对应，且存在未知 id 时安全返回 null', () => {
  for (const note of FIELD_NOTES) {
    for (const type of note.species) assert.equal(noteForSpecies(type)?.id, note.id);
    assert.ok(note.title && note.text);
  }
  assert.equal(noteById('nope'), null);
  assert.equal(noteForSpecies('whale'), null);
});
