import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, occupiedByWorld, wildlifeBodyClearance, wildlifeSpaceBlocked } from '../src/engine.js';
import { islandCenter,islandShorePoint,islandSurfaceAt } from '../src/island.js';
import { outfallLayout } from '../src/outfall-layout.js';

test('wildlife spawns in open water and cannot enter the island footprint',()=>{
  for(const seed of [1,11,47,603,2026]){
    const engine=new GameEngine({seed});
    engine.start();
    const wildlife=engine.state.entities.filter(entity=>[
      'fish','lanternfish','shark','squid','whale','ray','turtle','angler','crab','cuttlefish','oarfish',
    ].includes(entity.type));
    assert.ok(wildlife.length>100);
    assert.equal(
      wildlife.filter(entity=>islandSurfaceAt(engine.state.world,entity.x,entity.z)!==null).length,
      0,
      `seed ${seed} must not spawn wildlife inside the island`,
    );
    const sample=wildlife[0],center=islandCenter(engine.state.world);
    assert.equal(wildlifeSpaceBlocked(engine.state,sample,center.x,34,center.z),true);
    const shore=islandShorePoint(engine.state.world,Math.PI/2,.8);
    assert.equal(wildlifeSpaceBlocked(engine.state,sample,shore.x,34,shore.z),true,'the cliff skirt needs collision clearance');
    const pierX=islandShorePoint(engine.state.world,Math.PI/2).x+2.2;
    const pierZ=islandShorePoint(engine.state.world,Math.PI/2).z+2.5;
    assert.equal(wildlifeSpaceBlocked(engine.state,sample,pierX,50,pierZ),true,'fish must not pass through submerged harbor piles');
    const bodyClearance=wildlifeBodyClearance(sample);
    const nearShore=islandShorePoint(engine.state.world,0,bodyClearance*.45);
    assert.equal(
      wildlifeSpaceBlocked(engine.state,sample,nearShore.x,34,nearShore.z),
      true,
      'the fish body envelope, not only its centre, must stay clear of the island',
    );
    const mouth=outfallLayout(engine.state.world).mouths[1];
    assert.equal(
      wildlifeSpaceBlocked(engine.state,sample,mouth.x,mouth.y,mouth.z),
      true,
      'fish must not swim through the industrial diffuser',
    );
    assert.equal(
      occupiedByWorld(engine.state,engine.state.player,mouth.x,mouth.y,mouth.z),
      true,
      'the player and wildlife must share the outfall collider',
    );
    for(let step=0;step<180;step++){
      engine.update(1/60,{});
      assert.equal(
        engine.state.entities.some(entity=>[
          'fish','lanternfish','shark','squid','whale','ray','turtle','angler','crab','cuttlefish','oarfish',
        ].includes(entity.type)&&islandSurfaceAt(engine.state.world,entity.x,entity.z)!==null),
        false,
        `seed ${seed} wildlife entered the island at step ${step}`,
      );
    }
  }
});
