import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { WATER_SURFACE_Y } from '../src/biology.js';
import { humanBoatStates, HUMAN_SONAR_PULSE } from '../src/human-navigation.js';

function game(){
  const engine=new GameEngine({seed:1803});engine.start();engine.drainEvents();return engine;
}

test('surface patrol sonar telegraphs and knocks an exposed cell downward',()=>{
  const engine=game(),p=engine.state.player;
  const pulseTime=HUMAN_SONAR_PULSE+.04;
  const boat=humanBoatStates(engine.state.world,pulseTime)[0];
  Object.assign(p,{x:boat.x,y:WATER_SURFACE_Y-.4,z:boat.z,vx:0,vy:0,vz:0,energy:p.maxEnergy});
  engine.state.time=HUMAN_SONAR_PULSE-.06;
  engine.update(.1,{});
  assert.ok(p.y<WATER_SURFACE_Y-1);
  assert.ok(p.energy<p.maxEnergy);
  assert.ok(engine.drainEvents().some(event=>event.type==='sonarPulse'));
});

test('diving below the sonar layer avoids the patrol pulse',()=>{
  const engine=game(),p=engine.state.player;
  const boat=humanBoatStates(engine.state.world,12.04)[0];
  Object.assign(p,{x:boat.x,y:40,z:boat.z,vx:0,vy:0,vz:0});
  engine.state.time=11.94;
  const hp=p.hp;
  engine.update(.1,{});
  assert.equal(p.hp,hp);
  assert.equal(engine.drainEvents().some(event=>event.type==='sonarPulse'),false);
});

test('the wake behind a patrol boat creates a rideable current',()=>{
  const engine=game(),p=engine.state.player;
  const boat=humanBoatStates(engine.state.world,5.05)[0];
  const wakeX=Math.sin(boat.heading),wakeZ=Math.cos(boat.heading);
  Object.assign(p,{x:boat.x+wakeX*20,y:WATER_SURFACE_Y-.8,z:boat.z+wakeZ*20,vx:0,vy:0,vz:0});
  engine.state.time=4.95;
  engine.update(.1,{});
  assert.ok(Math.hypot(p.vx,p.vz)>1.5);
  assert.ok(engine.drainEvents().some(event=>event.type==='wakeCatch'));
});

