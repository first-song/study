import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, wildlifeSpaceBlocked } from '../src/engine.js';
import { islandHumanStructureAt, islandShorePoint } from '../src/island.js';
import { navigationTarget } from '../src/abyss-ui.js';

test('harbor buildings block animals and the player instead of allowing visible clipping',()=>{
  const engine=new GameEngine({seed:41});
  const shore=islandShorePoint(engine.state.world,Math.PI/2);
  const insideX=shore.x-5,insideZ=shore.z-1.5+1.5,insideY=53+3;
  assert.equal(islandHumanStructureAt(engine.state.world,insideX,insideY,insideZ,.2),true);
  assert.equal(islandHumanStructureAt(engine.state.world,insideX+20,insideY,insideZ,.2),false);
  const fish=engine.state.entities.find(entity=>entity.type==='fish');
  assert.equal(wildlifeSpaceBlocked(engine.state,fish,insideX,insideY,insideZ),true);
});

test('a mature land predator can devour humans and the result survives validation',()=>{
  const engine=new GameEngine({seed:82});
  engine.start();
  engine.state.player.level=7;
  engine.state.player.xpNext=787;
  engine.state.player.branches={devour:4,radiation:1,symbiosis:1};
  engine.state.stage=3;
  engine.state.stats.evolutions=6;
  engine.state.player.energy=100;
  engine.playerOnLand=true;
  const before=engine.state.expedition.humansDevoured??0;
  engine.update(.1,{feed:true});
  assert.equal(engine.state.expedition.humansDevoured,before+1);
  assert.ok(engine.drainEvents().some(event=>event.type==='humanDevoured'));
  engine.state.mode='menu';
  assert.equal(new GameEngine({seed:1}).restore(engine.serialize()),true);
});

test('the ocean chart follows the active staged objective with a route target',()=>{
  const engine=new GameEngine({seed:13});
  engine.start();
  assert.equal(navigationTarget(engine.state)?.type,'biofilm');
  engine.state.expedition.biofilms.push('nursery');
  assert.ok(['fish','whale','turtle','diver'].includes(navigationTarget(engine.state)?.type));
  engine.state.expedition.hostAdaptations.push('fish');
  assert.equal(navigationTarget(engine.state)?.type,'echo');
});
