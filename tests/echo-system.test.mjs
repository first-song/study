import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { interactionPosition, interactionTarget } from '../src/ecosystem.js';
import {
  ABERRANT_ECHO_DEFS, ECHO_TIMING, echoPhaseAt, echoVulnerability,
} from '../src/echo-system.js';

function at(engine,entity) {
  Object.assign(engine.state.player,interactionPosition(entity),{vx:0,vy:0,vz:0});
}

test('aberrant echoes use a readable telegraphed vulnerability cycle',()=>{
  const phases=[0,ECHO_TIMING.chargeStart,ECHO_TIMING.exposedStart,ECHO_TIMING.recoveryStart]
    .map(time=>echoPhaseAt(time,0).phase);
  assert.deepEqual(phases,['stalk','charge','exposed','recovery']);
  assert.ok(echoVulnerability('exposed')>echoVulnerability('recovery'));
  assert.ok(echoVulnerability('recovery')>echoVulnerability('stalk'));
});

test('each reactor receives a distinct echo guardian and cannot be entered while linked',()=>{
  const engine=new GameEngine({seed:73});
  engine.start();
  const echoes=engine.state.entities.filter(entity=>entity.type==='echo');
  assert.equal(echoes.length,ABERRANT_ECHO_DEFS.length);
  assert.equal(new Set(echoes.map(entity=>entity.echoKind)).size,ABERRANT_ECHO_DEFS.length);
  engine.state.player.level=3;
  const echo=echoes[0];
  const reactor=engine.state.entities.find(entity=>entity.type==='reactor'&&entity.siteId===echo.reactorSiteId);
  at(engine,reactor);
  reactor.phase='cooldown';
  const locked=interactionTarget(engine.state);
  assert.equal(locked.kind,'reactor');
  assert.equal(locked.canAttach,false);
  assert.match(locked.hint,new RegExp(echo.name));
  engine._pacifyEcho(echo,'test disruption');
  assert.equal(echo.pacified,true);
  assert.ok(engine.state.expedition.echoesPacified.includes(reactor.siteId));
  const unlocked=interactionTarget(engine.state);
  assert.equal(unlocked.kind,'reactor');
  assert.equal(unlocked.canAttach,true);
});

test('echo hunts reward growth, remain in save data, and restore validation',()=>{
  const engine=new GameEngine({seed:221});
  engine.start();
  const echo=engine.state.entities.find(entity=>entity.type==='echo');
  const before=engine.state.player.level;
  at(engine,echo);
  const target=interactionTarget(engine.state);
  assert.equal(target.kind,'echo');
  assert.equal(target.canAttach,false);
  assert.equal(engine._disruptEcho(echo),true);
  assert.ok(echo.hp<echo.maxHp);
  echo.phase='exposed';
  // 折脊回声体的钥匙是近战：脉冲几乎打不动它。
  for(let index=0;index<4&&!echo.pacified;index++)engine._damageEcho(echo,20,'test','melee');
  assert.equal(echo.pacified,true);
  assert.equal(engine.drainEvents().find(event=>event.type==='echoPacified').rating,3);
  assert.equal(engine.state.player.level,before+1);
  assert.ok(engine.state.expedition.milestones.includes(`echo:${echo.reactorSiteId}`));
  const save=engine.serialize();
  assert.equal(new GameEngine({seed:1}).restore(save),true);
});

test('每只回声体都有一把钥匙：用错工具伤害大打折扣',()=>{
  const engine=new GameEngine({seed:221});
  engine.start();
  const echo=engine.state.entities.find(entity=>entity.type==='echo');
  echo.phase='exposed';
  const hp0=echo.hp;
  engine._damageEcho(echo,40,'辐射脉冲','pulse');
  const pulseDamage=hp0-echo.hp;
  echo.hp=hp0;
  engine._damageEcho(echo,40,'撕咬','melee');
  const meleeDamage=hp0-echo.hp;
  assert.ok(meleeDamage>pulseDamage*2,`对的工具应该明显更有效：脉冲 ${pulseDamage.toFixed(1)} vs 近战 ${meleeDamage.toFixed(1)}`);
  // 感知或拟态让回声体暴露真身之后，抗性就不再成立。
  echo.hp=hp0;
  echo.revealedUntil=engine.state.time+5;
  engine._damageEcho(echo,40,'撕咬','melee');
  assert.ok(hp0-echo.hp>meleeDamage*.8,'暴露真身之后不该再被抗性挡住');
});

test('按住扫描或拟态会让范围内的回声体暴露真身',()=>{
  const engine=new GameEngine({seed:221});
  engine.start();
  const p=engine.state.player;
  const echo=engine.state.entities.find(entity=>entity.type==='echo');
  p.instincts.sense=1;
  echo.x=p.x+4;echo.y=p.y;echo.z=p.z;
  engine.update(0.1,{scan:true});
  assert.equal(p.scanActive,true);
  assert.ok(echo.revealedUntil>engine.state.time,'扫描应当让回声体暴露真身');
  p.instincts.mimic=1;
  p.scanActive=false;
  echo.revealedUntil=0;
  engine.update(0.1,{mimic:true});
  assert.ok(echo.revealedUntil>engine.state.time,'拟态也应当让回声体暴露真身');
});
