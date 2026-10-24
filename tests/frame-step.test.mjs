import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameStepper,seedFromText } from '../src/frame-step.js';
test('fixed simulation covers equal time at 30, 60 and 144 Hz and consumes taps once',()=>{
  for(const fps of [30,60,144]) {
    let pulse=true,calls=0,pulses=0;
    const engine={state:{mode:'playing',player:{x:0,y:0,z:0}},update(dt,input){calls++;this.state.player.x+=dt*12;if(input.pulse)pulses++;}};
    const clock=new FrameStepper();
    for(let i=0;i<fps*3;i++)clock.advance(1/fps,engine,()=>{const result={pulse};pulse=false;return result;});
    assert.equal(calls,180);assert.equal(pulses,1);assert.ok(Math.abs(engine.state.player.x-36)<1e-8);
  }
});
test('paused clocks discard catchup and seed text is stable across runs',()=>{
  const clock=new FrameStepper(),engine={state:{mode:'paused',player:{x:0,y:0,z:0}},update(){throw Error('paused update');}};
  clock.advance(30,engine,()=>({}));assert.equal(clock.accumulator,0);
  assert.equal(seedFromText(' 42 '),42);assert.equal(seedFromText('4294967296'),0);
  assert.equal(seedFromText('灰屿'),seedFromText('灰屿'));assert.notEqual(seedFromText('灰屿'),seedFromText('深海'));assert.equal(seedFromText(''),undefined);
});

test('wildlife positions and headings are interpolated between fixed simulation steps',()=>{
  const engine={
    state:{mode:'playing',player:{x:0,y:0,z:0},entities:[{id:1,x:0,y:0,z:0,heading:0,vx:1,type:'fish'}]},
    update(dt){
      const fish=this.state.entities[0];fish.x+=dt*6;fish.heading+=dt*3;
      fish.vx+=dt*60;
    },
  };
  const clock=new FrameStepper();
  const first=clock.advance(1/60,engine,()=>({}));
  const halfway=clock.advance(1/120,engine,()=>({}));
  assert.equal(first.entities[0].x,0);
  assert.ok(halfway.entities[0].x>0&&halfway.entities[0].x<.1);
  assert.ok(halfway.entities[0].heading>0&&halfway.entities[0].heading<.05);
  assert.ok(halfway.entities[0].vx>1&&halfway.entities[0].vx<2);
  const settled=clock.advance(1/120,engine,()=>({}));
  assert.ok(Math.abs(settled.entities[0].x-.1)<1e-8);
});

test('variable display timing keeps swimming motion monotonic without visible teleports',()=>{
  const engine={
    state:{mode:'playing',player:{x:0,y:0,z:0},entities:[{id:1,x:0,y:0,z:0,heading:0,vx:6,type:'fish'}]},
    update(dt){
      const fish=this.state.entities[0];
      fish.x+=dt*6;fish.z+=Math.sin(fish.x*.7)*dt*.8;fish.heading+=dt*.35;
    },
  };
  const clock=new FrameStepper();
  const displayDeltas=[1/144,1/47,1/120,1/31,1/90,1/60];
  let previousX=0,maxStep=0;
  for(let index=0;index<180;index++){
    const dt=displayDeltas[index%displayDeltas.length];
    const frame=clock.advance(dt,engine,()=>({}));
    const x=frame.entities[0].x;
    assert.ok(x+1e-8>=previousX,'interpolated fish must not jump backwards');
    maxStep=Math.max(maxStep,x-previousX);
    previousX=x;
  }
  assert.ok(maxStep<.22,`display frame movement should remain bounded (${maxStep.toFixed(3)})`);
});
