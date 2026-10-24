import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { interactionPosition, interactionTarget } from '../src/ecosystem.js';

function game(seed=2){
  const engine=new GameEngine({seed});engine.start();engine.drainEvents();return engine;
}
function at(engine,entity){
  const point=interactionPosition(entity);
  Object.assign(engine.state.player,point,{vx:0,vy:0,vz:0});
}
function tick(engine,seconds,input={}){
  for(let i=0;i<Math.ceil(seconds*10);i++){
    engine.spawnTimer=3;
    if(engine.state.mode==='playing')engine.update(.1,input);
  }
}

test('human diver unlocks an alternate parasitic island ending without reactor shutdowns',()=>{
  const engine=game();
  const diver=engine.state.entities.find(entity=>entity.type==='diver');
  assert.ok(diver);
  at(engine,diver);
  assert.equal(interactionTarget(engine.state).kind,'host');
  tick(engine,.1,{interact:true});
  assert.equal(engine.state.player.attachment.kind,'host');
  tick(engine,13);
  assert.equal(engine.state.player.level,3);
  assert.ok(engine.state.expedition.hostAdaptations.includes('diver'));
  assert.equal(engine.state.expedition.parasiteNodes.length,0);

  const nodes=engine.state.entities.filter(entity=>entity.type==='islandNode');
  assert.equal(nodes.length,3);
  for(const node of nodes){
    at(engine,node);
    const target=interactionTarget(engine.state);
    assert.equal(target.kind,'infection');
    tick(engine,.1,{interact:true});
    // 接入中段会被灰屿的电网反击一次，进度被截断，所以要多撑一会儿。
    tick(engine,9.2);
    assert.equal(node.disabled,true);
  }
  assert.equal(engine.state.expedition.parasiteNodes.length,3);
  assert.equal(engine.state.ending,'parasite');
  assert.equal(engine.state.mode,'won');
  assert.equal(engine.state.expedition.shutdowns.length,0);
  assert.ok(engine.drainEvents().some(event=>event.type==='parasiteNetwork'));
  const save=engine.serialize();
  assert.equal(save.version,10);
  assert.equal(new GameEngine({seed:1}).restore(save),true);
});

test('parasite nodes stay unavailable until the human-host adaptation is complete',()=>{
  const engine=game(812);
  const node=engine.state.entities.find(entity=>entity.type==='islandNode');
  at(engine,node);
  assert.notEqual(interactionTarget(engine.state)?.kind,'infection');
  tick(engine,.1,{interact:true});
  assert.equal(engine.state.player.attachment,null);
});

test('a latent cell cannot infect the diver but can still ride ordinary wildlife',()=>{
  const engine=game(5);
  assert.equal(engine.state.player.parasiteCapability,false);
  const diver=engine.state.entities.find(entity=>entity.type==='diver');
  at(engine,diver);
  const target=interactionTarget(engine.state);
  assert.equal(target.kind,'host');
  assert.equal(target.canAttach,false);
  assert.match(target.hint,/休眠/);
  tick(engine,.1,{interact:true});
  assert.equal(engine.state.player.attachment,null);

  const fish=engine.state.entities.find(entity=>entity.type==='fish');
  at(engine,fish);
  assert.equal(interactionTarget(engine.state).canAttach,true);
  tick(engine,.1,{interact:true});
  assert.equal(engine.state.player.attachment.kind,'host');
});
