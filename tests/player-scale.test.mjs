import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { SPECIES } from '../src/biology.js';
import { playerFollowDistance, playerVisualScale } from '../src/scene.js';

test('the starting microscopic cell remains smaller than nearby fish and discharge pipes',()=>{
  const engine=new GameEngine({seed:603});
  engine.start();
  const player=engine.state.player;
  assert.ok(player.size<SPECIES.fish.radius*.65);
  const visualScale=playerVisualScale(player);
  assert.ok(1.5*visualScale<SPECIES.fish.radius*.1,'cell membrane radius must read as microscopic beside fish');
  assert.ok(2.05*visualScale<.15,'cilia silhouette must stay smaller than an industrial pipe');
  assert.ok(visualScale<=.04);
  assert.ok(playerFollowDistance(player)<=3.1,'the follow camera must close in without enlarging the cell');
});
