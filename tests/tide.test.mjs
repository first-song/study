import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDE_PERIOD, TIDE_PHASES, nightGlow, tideAt, tideLabel } from '../src/tide.js';

test('潮汐日把时间切成四个时段，并且首尾相接', () => {
  assert.equal(TIDE_PHASES.length, 4);
  assert.equal(tideAt(0).id, 'dawn');
  assert.equal(tideAt(75).id, 'noon');
  assert.equal(tideAt(150).id, 'dusk');
  assert.equal(tideAt(225).id, 'night');
  // 一个完整周期回到起点，而不是落在空档里。
  assert.equal(tideAt(TIDE_PERIOD).id, 'dawn');
  assert.equal(tideAt(TIDE_PERIOD + 75).id, 'noon');
});

test('负时间与跨周期时间都收敛到合法时段', () => {
  assert.equal(tideAt(-1).id, 'night');
  assert.equal(tideAt(-TIDE_PERIOD).id, 'dawn');
  const tide = tideAt(-10);
  assert.ok(tide.progress >= 0 && tide.progress <= 1);
  assert.equal(tideAt(Number.NaN).id, 'dawn');
});

test('每个时段的进度与剩余时间互补', () => {
  for (const seconds of [0, 30, 74.9, 75, 149, 224.5, 299.9]) {
    const tide = tideAt(seconds);
    assert.ok(tide.progress >= 0 && tide.progress <= 1);
    assert.ok(tide.remaining > 0 && tide.remaining <= 75);
  }
});

test('夜晚最暗、最凶，正午最亮、最温和', () => {
  const dawn = tideAt(0), noon = tideAt(75), dusk = tideAt(150), night = tideAt(225);
  assert.ok(noon.light > dawn.light && dawn.light > night.light);
  assert.ok(night.aggression > dusk.aggression && dusk.aggression > noon.aggression);
  assert.ok(night.mutationGain > noon.mutationGain);
  // 夜里猎物上浮得最多，正午反而下沉。
  assert.ok(night.preyRise > noon.preyRise);
  assert.ok(noon.preyRise < 0);
});

test('生物发光在夜里最强、正午最弱', () => {
  assert.ok(nightGlow(225) > nightGlow(150));
  assert.ok(nightGlow(150) > nightGlow(0));
  assert.ok(nightGlow(0) > nightGlow(75));
  assert.ok(nightGlow(225) <= 1);
});

test('HUD 文案是时段名加剩余秒数', () => {
  assert.match(tideLabel(0), /拂晓 · 75s/);
  assert.match(tideLabel(225), /深夜 · 75s/);
});
