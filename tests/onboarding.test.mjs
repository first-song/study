import test from 'node:test';
import assert from 'node:assert/strict';
import {onboardingSteps,nextStepIndex} from '../src/onboarding.js';

test('onboarding contains seven accurate and complete survival lessons',()=>{
  assert.equal(onboardingSteps.length,7);
  assert.deepEqual(onboardingSteps.map(step=>step.id),['feeding','instincts','radiation','evolution','echoes','mother','endings']);
  const text=onboardingSteps.map(step=>`${step.title} ${step.detail}`).join(' ');
  for(const required of ['E','海洋雪','32','随机','异变回声体','Q','G','Lv.11','潜水员','港口泵站','海面实验舱','通信继电器'])assert.ok(text.includes(required),required);
  // 新系统必须在教学里出现：技能怎么来、暴走、母体、以及行为决定结局。
  for(const required of ['撕咬','拟态','感电扫描','暴走','排放母体','海洋之息'])assert.ok(text.includes(required),required);
  assert.ok(onboardingSteps.every(step=>step.title.length>5&&step.detail.length>40));
});

test('onboarding step navigation clamps at first and last step',()=>{
  assert.equal(nextStepIndex(0,-1),0);
  assert.equal(nextStepIndex(0,1),1);
  assert.equal(nextStepIndex(3,0),3);
  assert.equal(nextStepIndex(3,1),4);
  assert.equal(nextStepIndex(6,1),6);
  assert.equal(nextStepIndex(99,0),6);
});
