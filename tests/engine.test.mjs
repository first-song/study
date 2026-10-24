import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, BRANCHES, STAGES, ANIMAL_COUNTS } from '../src/engine.js';
import { depthFor, zoneFor, lifeStageFor, SPECIES, seabedHeight, CRAB_GROUND_CLEARANCE, SEDIMENT_GROUND_CLEARANCE, PLAYER_MAX_Y } from '../src/biology.js';
import { MUTATIONS, MUTATION_RULES, initialMutations, innateParasitismForSeed } from '../src/mutations.js';
import { createLegacyWorld } from '../src/world.js';

const game = (seed = 42) => { const engine = new GameEngine({ seed }); engine.start(); engine.drainEvents(); return engine; };
function empty(engine) { engine.state.entities = engine.state.entities.filter(e => ['reactor','biofilm','diver','islandNode','echo'].includes(e.type)); engine.spawnTimer = 2; }
// Combat-only fixtures begin after the ecological reactor objectives.
function unsealCore(engine) {
  const echoes=engine.state.entities.filter(e=>e.type==='echo');
  const reactors=engine.state.entities.filter(e=>e.type==='reactor');
  engine.state.expedition.echoesPacified=echoes.map(e=>e.reactorSiteId);
  engine.state.expedition.milestones=engine.state.expedition.milestones.filter(id=>!id.startsWith('echo:'));
  for(const echo of echoes){Object.assign(echo,{pacified:true,phase:'pacified',phaseRemaining:0,hp:1,link:0});engine.state.expedition.milestones.push(`echo:${echo.reactorSiteId}`);}
  engine.state.expedition.shutdowns=reactors.map(e=>e.siteId);
  engine.state.expedition.milestones=engine.state.expedition.milestones.filter(id=>!id.startsWith('reactor:'));
  for(const reactor of reactors) {
    Object.assign(reactor,{status:'shutdown',phase:'shutdown',phaseRemaining:0,progress:1,pollution:0});
    engine.state.expedition.milestones.push(`reactor:${reactor.siteId}`);
  }
}
function place(engine, type, extras = {}) {
  const p = engine.state.player;
  return engine._entity(type, p.x, p.y, p.z, 0.5, 1, { attackTime: 0, speed: 1, damage: 1, ...extras });
}
function earnLevel(engine) {
  const level = engine.state.player.level;
  // An explicit body-stage fixture for combat/physiology tests. Actual ecological
  // progression is exercised through interactions in ecosystem.test.mjs.
  engine.state.player.xp = engine.state.player.xpNext;
  engine._checkLevel();
  assert.equal(engine.state.mode, 'playing');
  assert.equal(engine.state.player.level, Math.min(13, level + 1));
}
const next = seed => (Math.imul(seed, 1664525) + 1013904223) >>> 0;
// Deterministic fixtures exercise each random outcome without adding a selectable API.
function outcomeSeed(index = null, eligible = MUTATIONS.length) {
  for (let seed = 0; seed < 100000; seed++) {
    const first = next(seed);
    if (index === null ? first / 4294967296 >= 0.7 : first / 4294967296 < 0.7 && Math.floor(next(first) / 4294967296 * eligible) === index) return seed;
  }
  throw new Error('missing random fixture');
}
function comparisonMutation(id) {
  const baseline = game(), mutated = game(); empty(baseline); empty(mutated);
  mutated.rngState = outcomeSeed(MUTATIONS.findIndex(m => m.id === id));
  mutated._gainMutationEnergy(32);
  assert.equal(mutated.state.player.mutations[id], 1);
  mutated.drainEvents(); return [baseline, mutated];
}
function legacySave(engine, version) {
  const save = engine.serialize(); save.version = version;
  delete save.state.expedition; delete save.state.player.attachment;
  save.state.entities=save.state.entities.filter(e=>!['reactor','biofilm'].includes(e.type));
  for(const e of save.state.entities) {delete e.variant;delete e.exposure;}
  if(version<4) {delete save.rngState;delete save.state.player.mutationEvents;delete save.state.player.mutationHistory;}
  if (version < 3) for (const key of ['mutationEnergy','mutations','radiationTolerance','senseRadius']) delete save.state.player[key];
  if (version === 1) {
    for (const key of ['nutrition','lifeStage','depth','zone','lightBonus']) delete save.state.player[key];
    delete save.state.ecology;
    save.state.entities = save.state.entities.filter(e => !Object.hasOwn(ANIMAL_COUNTS, e.type) && e.type !== 'marineSnow');
  }
  return save;
}

test('starts as one cell in a bounded ocean with nine animal groups and resets completely', () => {
  const engine = game(), p = engine.state.player;
  assert.equal(p.level, 1); assert.equal(p.lifeStage, 0); assert.equal(p.y, 44);
  assert.ok(p.size<SPECIES.fish.radius,'the starting cell must be smaller than a small fish');
  assert.deepEqual(p.mutations, initialMutations()); assert.equal(p.mutationEvents, 0);
  assert.equal(BRANCHES.length, 3); assert.equal(STAGES.length, 4);
  for (const [type,count] of Object.entries(ANIMAL_COUNTS)) assert.equal(engine.state.entities.filter(e => e.type === type).length, count);
  assert.equal(engine.state.entities.filter(e => e.type === 'diver').length, 1);
  assert.equal(engine.state.entities.filter(e => e.type === 'islandNode').length, 3);
  assert.equal(engine.state.entities.filter(e => e.type === 'food').length, 45);
  assert.ok(engine.state.entities.length < 512);
  assert.ok(engine.state.entities.every(e => Number.isFinite(e.x) && e.y >= (e.type === 'crab' ? -3 : 3) && e.y <= 52));
  p.hp=1; engine.start(); assert.equal(engine.state.player.hp, 100);
  assert.deepEqual(engine.state.player.mutationHistory, []);
});

test('movement normalizes diagonals, respects boundaries and freezes only on explicit pause', () => {
  const engine=game(); empty(engine);
  for(let i=0;i<40;i++) engine.update(0.1,{x:1,y:1,z:1});
  const p=engine.state.player;
  assert.ok(Math.hypot(p.vx,p.vy,p.vz)<=p.speed+0.001);
  engine.togglePause(); const before=engine.serialize(); engine.update(0.1,{pulse:true,x:1});
  assert.deepEqual(engine.serialize(),before);
  engine.togglePause(); p.x=109.9; p.z=0; p.y=51.9;
  for(let i=0;i<20;i++) engine.update(0.1,{x:1,y:1});
  assert.ok(Math.hypot(p.x,p.z)<=engine.state.world.radius+0.00001); assert.ok(p.y<=PLAYER_MAX_Y);
  engine.update(Infinity,{x:NaN}); assert.ok(Number.isFinite(p.x));
});

test('feeding and abilities retain costs and cooldowns; isotope energy cannot grow the body', () => {
  const engine=game(); empty(engine); const p=engine.state.player;
  const food=place(engine,'food',{x:p.x+10}); engine.update(0.1,{feed:true,dash:true,pulse:true});
  assert.ok(food.x<10); assert.equal(engine.drainEvents().filter(e=>['feed','dash','pulse'].includes(e.type)).length,3);
  for(let i=0;i<5;i++) engine.update(0.1,{feed:true,dash:true,pulse:true});
  assert.equal(engine.drainEvents().filter(e=>['feed','dash','pulse'].includes(e.type)).length,0);
  assert.equal(p.xp,0); const biomass=p.biomass;
  for(let i=0;i<2;i++){place(engine,'isotope');engine.update(0.1,{});}
  assert.equal(p.mutationEnergy,28); assert.equal(p.xp,0); assert.equal(p.biomass,biomass);
  assert.ok(p.radiation>13); assert.equal(p.level,1);
});

test('growth automatically chooses a random available branch without pausing or player choices', () => {
  const engine=game(); empty(engine); const p=engine.state.player;
  for(let level=2;level<=13;level++) {
    earnLevel(engine); assert.equal(p.level,level);
    assert.equal(Object.values(p.branches).reduce((a,b)=>a+b,0),level-1);
    assert.equal(p.lifeStage,lifeStageFor(level));
    assert.equal(engine.state.stage,Math.min(3,Math.floor((level-1)/2)));
    assert.equal(game().restore(engine.serialize()),true);
    const before=engine.serialize();
    assert.equal(engine.chooseEvolution('devour'),false); assert.equal(engine.chooseMutation('spines'),false);
    assert.deepEqual(engine.serialize(),before);
  }
  assert.deepEqual(p.branches,{devour:4,radiation:4,symbiosis:4});
  assert.equal(engine.state.entities.filter(e=>e.type==='boss').length,1);
  assert.deepEqual(engine.drainEvents().filter(e=>e.type==='stage').map(e=>e.stage),[1,2,3]);
  assert.equal(engine.state.stats.evolutions,12);
  p.xp=p.xpNext*2; engine._checkLevel(); assert.equal(p.level,13); assert.equal(engine.state.mode,'playing');
});

test('fixed radiation probabilities produce success, adaptation and saturation without pausing', () => {
  assert.deepEqual(MUTATION_RULES,{energyThreshold:32,successChance:0.7,maxHistory:12});
  assert.equal(Object.isFrozen(MUTATION_RULES),true);
  const engine=game(); empty(engine); const p=engine.state.player;
  engine.rngState=outcomeSeed(0); engine._gainMutationEnergy(31);
  assert.equal(p.mutationEvents,0); engine._gainMutationEnergy(1);
  assert.equal(p.mutations.membrane,1); assert.equal(p.mutationEnergy,0);
  assert.equal(p.mutationHistory[0].outcome,'mutation'); assert.equal(engine.state.mode,'playing');
  const ranks=structuredClone(p.mutations);
  engine.rngState=outcomeSeed(); engine._gainMutationEnergy(32);
  assert.deepEqual(p.mutations,ranks); assert.equal(p.mutationHistory.at(-1).outcome,'adaptation');
  assert.equal(p.level,1); assert.equal(p.xp,0); assert.equal(p.biomass,0);
  for(let i=0;i<30;i++) engine._gainMutationEnergy(300);
  assert.ok(Object.values(p.mutations).every(rank=>rank===2));
  assert.equal(p.mutationHistory.length,12);
  assert.equal(p.mutationHistory.at(-1).outcome,'saturated');
  assert.ok(p.mutationEnergy>=0&&p.mutationEnergy<32);
  assert.equal(game().restore(engine.serialize()),true);
});

test('the fixed random process samples both outcomes and all seven structures across seeds', () => {
  let success=0; const structures=new Set(); const engine=game(); empty(engine);
  for(let seed=0;seed<1000;seed++) {
    Object.assign(engine.state.player,{mutations:initialMutations(),mutationEnergy:0,mutationEvents:0,mutationHistory:[]});
    engine.rngState=Math.imul(seed,2654435761)>>>0; engine._gainMutationEnergy(32);
    const last=engine.state.player.mutationHistory[0];
    if(last.outcome==='mutation'){success++;structures.add(last.mutation);}
  }
  assert.ok(success>650&&success<750,`successes ${success}/1000`);
  assert.equal(structures.size,MUTATIONS.length);
});

test('innate parasitism is rare, deterministic and can also awaken through a later random mutation', () => {
  const expressed=Array.from({length:1000},(_,seed)=>innateParasitismForSeed(seed));
  const count=expressed.filter(Boolean).length;
  assert.ok(count>250&&count<350,`innate aptitude ${count}/1000`);
  const sameA=game(77),sameB=game(77);
  assert.equal(sameA.state.player.parasiteCapability,sameB.state.player.parasiteCapability);

  const latent=game(5);
  assert.equal(latent.state.player.parasiteCapability,false);
  latent.rngState=outcomeSeed(MUTATIONS.findIndex(mutation=>mutation.id==='parasitism'));
  latent._gainMutationEnergy(32);
  assert.equal(latent.state.player.mutations.parasitism,1);
  assert.equal(latent.state.player.parasiteCapability,true);
  assert.ok(latent.drainEvents().some(event=>event.type==='parasiteAwakened'));
  assert.equal(game().restore(latent.serialize()),true);
});

test('saved PRNG state reproduces future growth and mutation outcomes and opening controls cannot reroll', () => {
  const a=game(71); empty(a); a._gainMutationEnergy(28);
  const save=a.serialize(); const b=game(900); assert.equal(b.restore(save),true);
  a.drainEvents(); b.drainEvents();
  for(let i=0;i<6;i++) {
    for(const engine of [a,b]) { engine._gainMutationEnergy(38); earnLevel(engine); engine.drainEvents(); }
    assert.deepEqual(b.serialize(),a.serialize());
  }
  const snapshot=b.serialize();
  for(let i=0;i<20;i++){ b.togglePause(); b.togglePause(); assert.equal(b.chooseMutation('repair'),false); }
  assert.deepEqual(b.serialize(),snapshot);
  const reloaded=game();assert.equal(reloaded.restore(save),true);
  a.restore(save);for(const engine of [a,reloaded])engine._gainMutationEnergy(4);
  assert.deepEqual(reloaded.serialize(),a.serialize());
});

test('pollution sources and the core add automatic event progress while radiation still harms', () => {
  const engine=game();empty(engine);const p=engine.state.player;
  place(engine,'vent');p.radiation=95;p.hp=80;
  const initial=p.mutationEnergy;engine.update(0.1,{});
  assert.ok(p.mutationEnergy>initial);assert.ok(p.hp<80);assert.equal(p.xp,0);
  const stored=p.mutationEnergy;empty(engine);
  for(let i=0;i<5;i++)engine.update(0.1,{});
  assert.equal(p.mutationEnergy,stored);
  while(p.level<7)earnLevel(engine);
  const boss=engine.state.entities.find(e=>e.type==='boss');
  Object.assign(p,{x:boss.x,y:boss.y,z:boss.z+12,radiation:0,hp:p.maxHp});boss.attackTime=0;
  const events=p.mutationEvents,progress=p.mutationEnergy;
  engine.update(0.1,{});
  assert.ok(p.radiation>0);assert.ok(p.mutationEvents>events||p.mutationEnergy>progress);
});

test('membrane, propulsion and spines have distinct effects and measurable tradeoffs', () => {
  const [fragile,shielded]=comparisonMutation('membrane');
  for(const engine of [fragile,shielded]){engine.state.player.radiation=70;engine.update(0.1,{});}
  assert.ok(fragile.state.player.hp<shielded.state.player.hp);assert.equal(shielded.state.player.radiationTolerance,70);
  assert.ok(shielded.state.player.speed<fragile.state.player.speed);
  const [normal,propelled]=comparisonMutation('flagella');
  for(const engine of [normal,propelled])for(let i=0;i<10;i++)engine.update(0.1,{x:1});
  assert.ok(propelled.state.player.x>normal.state.player.x);assert.ok(propelled.state.player.nutrition<normal.state.player.nutrition);
  const [soft,spiny]=comparisonMutation('spines');
  const prey=[soft,spiny].map(engine=>place(engine,'predator',{hp:100,maxHp:100,attackTime:5}));
  for(const engine of [soft,spiny])engine.update(0.1,{});
  assert.ok(prey[1].hp<prey[0].hp);assert.ok(spiny.state.player.armor>soft.state.player.armor);
  assert.ok(spiny.state.player.speed<soft.state.player.speed);assert.equal(spiny.state.player.damage,soft.state.player.damage);
});

test('photophores extend discovery and feeding but reveal cells to distant predators', () => {
  const [dark,lit]=comparisonMutation('photophore');
  for(const engine of [dark,lit])Object.assign(engine._spawnWildlife('fish'),{x:40,y:44,z:0,hunger:0});
  const enemies=[dark,lit].map(engine=>place(engine,'predator',{x:33,hp:100,maxHp:100}));
  const foods=[dark,lit].map(engine=>place(engine,'food',{x:5}));
  for(const engine of [dark,lit])engine.update(0.1,{});
  assert.equal(dark.state.ecology.encounters.includes('fish'),false);assert.equal(lit.state.ecology.encounters.includes('fish'),true);
  const darkDistance=Math.hypot(enemies[0].x,dark.state.player.y-enemies[0].y,enemies[0].z);
  const litDistance=Math.hypot(enemies[1].x,lit.state.player.y-enemies[1].y,enemies[1].z);
  assert.ok(foods[1].x<foods[0].x);
  assert.ok(litDistance<33,'the photophore must let a distant predator find the cell');
  assert.ok(darkDistance>litDistance,'an unlit cell must remain less visible at the same distance');
});

test('radiation conversion cannot replace nutrition and regeneration spends organic reserves', () => {
  const [ordinary,converter]=comparisonMutation('radiotrophy');
  for(const engine of [ordinary,converter]){Object.assign(engine.state.player,{energy:0,radiation:20,nutrition:40});engine.update(0.1,{});}
  assert.ok(converter.state.player.energy>ordinary.state.player.energy);assert.ok(converter.state.player.radiation<ordinary.state.player.radiation);
  assert.ok(converter.state.player.nutrition<ordinary.state.player.nutrition);assert.equal(converter.state.player.mutationEnergy,0);
  const [slow,repair]=comparisonMutation('repair');
  for(const engine of [slow,repair]){Object.assign(engine.state.player,{hp:50,nutrition:40,hurtTime:0});engine.update(0.1,{});}
  assert.ok(repair.state.player.hp>slow.state.player.hp);assert.ok(repair.state.player.nutrition<slow.state.player.nutrition);
});

test('hunger slows actual motion; food and deep marine snow restore organic reserves', () => {
  const full=game(),hungry=game();for(const engine of [full,hungry])empty(engine);
  hungry.state.player.nutrition=0;
  for(const engine of [full,hungry])for(let i=0;i<10;i++)engine.update(0.1,{x:1});
  assert.ok(hungry.state.player.x<full.state.player.x*0.5);
  const p=hungry.state.player;hungry.state.time=30;p.hp=50;hungry.update(0.1,{});assert.ok(p.hp<50);
  p.vx=0;place(hungry,'food');hungry.update(0.1,{});assert.ok(p.nutrition>8);
  p.y=10;place(hungry,'marineSnow');hungry.update(0.1,{});assert.ok(p.nutrition>14);
});

test('depth metadata and sunlight symbiosis immediately follow vertical movement', () => {
  assert.equal(depthFor(52),0);assert.equal(depthFor(40),200);assert.equal(depthFor(20),1000);assert.equal(depthFor(3),2200);
  assert.equal(zoneFor(10).id,'midnight');assert.deepEqual([1,2,3,4,5,6,7].map(lifeStageFor),[0,0,1,1,2,2,3]);
  const engine=game();empty(engine);const p=engine.state.player;
  while(p.branches.symbiosis<2)earnLevel(engine);
  engine.state.entities=[];Object.assign(p,{nutrition:40,y:44});engine.update(0.1,{});assert.ok(p.nutrition>40);
  Object.assign(p,{y:40.01,vy:-3,nutrition:40});engine.update(0.1,{y:-1});
  assert.ok(p.y<40);assert.equal(p.lightBonus,false);assert.ok(p.nutrition<40);assert.equal(p.depth,depthFor(p.y));
});

test('microscopic cells cannot hurt large wildlife, while mature prey leave collectable remains', () => {
  const engine=game();const fish=engine.state.entities.find(e=>e.type==='fish'),whale=engine.state.entities.find(e=>e.type==='whale');
  engine.state.entities=[fish,whale];engine.spawnTimer=2;const p=engine.state.player;
  for(const e of [fish,whale])Object.assign(e,{x:p.x+8,y:p.y,z:p.z,hunger:0});
  engine.update(0.1,{pulse:true,feed:true,dir:{x:1,y:0,z:0}});assert.equal(fish.hp,fish.maxHp);assert.equal(whale.hp,whale.maxHp);
  empty(engine);while(p.level<5)earnLevel(engine);
  p.y=30; // Avoid passive sunlight nutrition while measuring carcass collection.
  Object.assign(fish,{x:p.x+8,y:p.y,z:p.z,hp:1,dead:false});engine.state.entities=[fish];
  p.cooldowns.pulse=0;p.energy=p.maxEnergy;p.nutrition=20;engine.update(0.1,{pulse:true,dir:{x:1,y:0,z:0}});
  assert.ok(p.nutrition<20);const remains=engine.state.entities.filter(e=>e.type==='marineSnow'&&e.sourceType==='fish');
  assert.equal(remains.length,3);assert.ok(Math.abs(remains.reduce((sum,e)=>sum+e.nutrition,0)-SPECIES.fish.nutrition)<0.001);
  Object.assign(p,{x:fish.x,y:fish.y,z:fish.z});engine.update(0.1,{feed:true});assert.ok(p.nutrition>40);
});

test('fish flee hunting sharks; squid flee whales; whales and turtles surface to breathe', () => {
  const engine=game();const p=engine.state.player;
  const find=type=>engine.state.entities.find(e=>e.type===type);
  const fish=find('fish'),shark=find('shark'),squid=find('squid'),whale=find('whale'),turtle=find('turtle');
  engine.state.entities=[fish,shark];engine.spawnTimer=2;Object.assign(p,{x:-50,y:40,z:0});
  Object.assign(fish,{x:10,y:35,z:0,vx:0,vy:0,vz:0});Object.assign(shark,{x:0,y:35,z:0,vx:0,vy:0,vz:0,hunger:0.9});
  engine.update(0.1,{});assert.equal(fish.behavior,'flee');assert.equal(shark.targetId,fish.id);assert.ok(fish.vx>0);
  Object.assign(fish,{x:2,y:35,z:0,hp:1});shark.attackTime=0;engine.update(0.1,{});
  assert.equal(engine.state.entities.includes(fish),false);assert.equal(engine.state.ecology.predations,1);
  engine.state.entities=[squid,whale];Object.assign(squid,{x:10,y:20,z:0});Object.assign(whale,{x:0,y:20,z:0,hunger:0.9,breathTime:30});
  engine.update(0.1,{});assert.equal(squid.behavior,'flee');assert.equal(whale.targetId,squid.id);
  for(const animal of [whale,turtle]){
    engine.state.entities=[animal];animal.breathTime=0;animal.y=40;animal.vy=0;engine.update(0.1,{});
    assert.equal(animal.behavior,'surface');assert.ok(animal.vy>0);animal.y=53.2;engine.update(0.1,{});assert.ok(animal.breathTime>90);
  }
});

test('rays hunt crabs, crabs scavenge and flee, anglerfish ambush, and turtles graze jellyfish', () => {
  const engine=game();const find=type=>engine.state.entities.find(e=>e.type===type);
  const ray=find('ray'),crab=find('crab'),angler=find('angler'),turtle=find('turtle'),jelly=find('jelly');
  const p=engine.state.player;Object.assign(p,{x:-60,y:44,z:0});engine.spawnTimer=2;
  engine.state.entities=[ray,crab];Object.assign(ray,{x:0,y:6,z:0,hunger:0.9});Object.assign(crab,{x:8,y:4,z:0});
  engine.update(0.1,{});assert.equal(ray.targetId,crab.id);assert.equal(crab.behavior,'flee');
  engine.state.entities=[crab];Object.assign(crab,{x:0,y:4,z:0,hunger:0.9});place(engine,'marineSnow',{x:3,y:4,z:0});
  engine.update(0.1,{});assert.equal(crab.behavior,'scavenge');assert.ok(crab.targetId>0);
  engine.state.entities=[angler];Object.assign(angler,{x:0,y:10,z:0,hunger:0.9});engine.update(0.1,{});assert.equal(angler.behavior,'ambush');
  Object.assign(crab,{x:4,y:6,z:0,dead:false,hp:crab.maxHp});engine.state.entities.push(crab);engine.update(0.1,{});assert.equal(angler.targetId,crab.id);
  engine.state.entities=[turtle,jelly];Object.assign(turtle,{x:0,y:40,z:0,breathTime:50,hunger:0.9});Object.assign(jelly,{x:8,y:40,z:0});
  engine.update(0.1,{});assert.equal(turtle.behavior,'graze');assert.equal(turtle.targetId,jelly.id);
});

test('animal replenishment obeys each species cap and the global 512 entity limit', () => {
  const engine=game();for(let i=0;i<100;i++)engine._replenish();
  for(const [type,count] of Object.entries(ANIMAL_COUNTS)){
    assert.equal(engine.state.entities.filter(e=>e.type===type).length,count);
    assert.equal(engine._spawnWildlife(type),null);
  }
  for(let i=0;i<600;i++)place(engine,'food');assert.equal(engine.state.entities.length,512);
  engine._replenish();assert.ok(engine.state.entities.length<=512);
  assert.equal(game().restore(engine.serialize()),true);
});

test('crabs physically follow the shared seabed and old swimming-band saves remain compatible', () => {
  const engine = game();
  const crabs = engine.state.entities.filter(e => e.type === 'crab');
  for (const crab of crabs) assert.equal(crab.y, seabedHeight(crab.x, crab.z) + CRAB_GROUND_CLEARANCE);
  engine.state.entities = [...engine.state.entities.filter(e=>['reactor','biofilm','diver','islandNode','echo'].includes(e.type)),...crabs];
  engine.spawnTimer = 2;
  for (let step = 0; step < 10; step++) {
    engine.update(0.1, {});
    for (const crab of crabs) {
      assert.equal(crab.y, seabedHeight(crab.x, crab.z) + CRAB_GROUND_CLEARANCE);
      assert.equal(crab.vy, 0);
    }
  }
  const save = engine.serialize(), restored = game();
  assert.equal(restored.restore(save), true);
  assert.deepEqual(restored.serialize(), save);
  const old = structuredClone(save);
  for (const crab of old.state.entities.filter(e=>e.type==='crab')) { crab.y = 5; crab.vy = 0.4; }
  assert.equal(restored.restore(old), true);
  assert.equal(restored.rngState, save.rngState);
  for (const crab of restored.state.entities.filter(e=>e.type==='crab')) {
    assert.equal(crab.y, seabedHeight(crab.x, crab.z) + CRAB_GROUND_CLEARANCE);
    assert.equal(crab.vy, 0);
  }
  const invalid = restored.serialize(); invalid.state.entities.find(e=>e.type==='crab').y = -4;
  assert.equal(restored.restore(invalid), false);
});

test('marine snow settles onto negative-height seabed and crabs actually consume it', () => {
  const engine = game(); empty(engine);
  const x = -22, z = 0, floor = seabedHeight(x, z) + SEDIMENT_GROUND_CLEARANCE;
  assert.ok(floor < 0);
  const snow = place(engine, 'marineSnow', { x, y: floor + 0.05, z });
  for (let step = 0; step < 10; step++) engine.update(0.1, {});
  assert.equal(snow.y, floor);
  const save = engine.serialize(), restored = game();
  assert.equal(restored.restore(save), true); assert.deepEqual(restored.serialize(), save);
  const crab = engine._spawnWildlife('crab');
  Object.assign(crab, { x: x - 1.2, y: seabedHeight(x - 1.2, z) + CRAB_GROUND_CLEARANCE, z, hunger: 0.9 });
  engine.update(0.1, {});
  assert.equal(engine.state.entities.includes(snow), false);
  assert.ok(crab.hunger < 0.4);
  assert.ok(engine.drainEvents().some(event => event.type === 'predation' && event.predatorType === 'crab' && event.preyType === 'marineSnow'));
  const invalid = restored.serialize(); invalid.state.entities.find(e=>e.type==='marineSnow').y = -4;
  assert.equal(restored.restore(invalid), false);
});

test('crab kills leave organic remains above their local seabed and negative-height remains survive save/load', () => {
  const engine = game(); empty(engine);
  while (engine.state.player.level < 5) earnLevel(engine);
  empty(engine);
  const x = -22, z = 0, crab = engine._spawnWildlife('crab');
  Object.assign(crab, { x, y: seabedHeight(x, z) + CRAB_GROUND_CLEARANCE, z, hp: 1, hunger: 0 });
  Object.assign(engine.state.player, { x, y: 3, z, energy: 100, nutrition: 20 });
  engine.update(0.1, { pulse: true, dir: { x: 0, y: -1, z: 0 } });
  const remains = engine.state.entities.filter(entity => entity.sourceType === 'crab');
  assert.equal(remains.length, 2);
  assert.ok(remains.every(entity => entity.y < 0 && entity.y >= seabedHeight(entity.x, entity.z) + SEDIMENT_GROUND_CLEARANCE));
  assert.equal(remains.reduce((sum, entity) => sum + entity.nutrition, 0), SPECIES.crab.nutrition);
  const save = engine.serialize(), restored = game();
  assert.equal(restored.restore(save), true); assert.deepEqual(restored.serialize(), save);
});

test('version 10 round trips and rejects corrupt RNG, genes, progression, history and ecology atomically', () => {
  const engine=game();engine._gainMutationEnergy(96);const save=engine.serialize();const restored=game();
  assert.equal(save.version,10);assert.equal(restored.restore(save),true);assert.deepEqual(restored.serialize(),save);
  for(const corrupt of [
    s=>s.rngState=-1,s=>s.rngState=4294967296,s=>delete s.rngState,s=>s.state.mode='evolving',
    s=>s.state.player.mutationEnergy=32,s=>s.state.player.mutations.repair=3,s=>s.state.player.mutations.extra=0,
    s=>s.state.player.mutationEvents=-1,s=>s.state.player.mutationHistory[0].sequence=99,
    s=>s.state.player.mutationHistory[0].outcome='custom',s=>s.state.player.mutationHistory[0].time=Infinity,
    s=>delete s.state.player.innateParasitism,s=>s.state.player.parasiteCapability=!s.state.player.parasiteCapability,
    s=>s.state.player.speed+=1,s=>s.state.player.hp=NaN,s=>s.state.player.branches.devour=4,
    s=>s.state.entities[1].id=s.state.entities[0].id,s=>s.state.entities[0].type='unknown',
    s=>s.state.entities.find(e=>e.type==='angler').behavior='hack',
  ]){
    const invalid=structuredClone(save);corrupt(invalid);assert.equal(restored.restore(invalid),false);assert.deepEqual(restored.serialize(),save);
  }
});

test('v1–v4 saves migrate deterministically, including old pending choices and accumulated energy', () => {
  const engine=game();empty(engine);
  for(const version of [1,2,3,4]){
    const legacy=legacySave(engine,version);const a=game(1),b=game(2);
    assert.equal(a.restore(legacy),true);assert.equal(b.restore(legacy),true);assert.deepEqual(a.serialize(),b.serialize());
    assert.equal(a.serialize().version,10);
    assert.equal(a.state.entities.filter(e=>e.type==='fish').length,version<4?ANIMAL_COUNTS.fish:0);
    assert.equal(a.state.entities.filter(e=>e.type==='reactor').length,3);
    assert.equal(a.state.entities.filter(e=>e.type==='biofilm').length,3);
    if(version===4) {assert.equal(a.rngState,legacy.rngState);assert.deepEqual(a.state.player.mutationHistory,legacy.state.player.mutationHistory);}
    const bad=structuredClone(legacy);bad.state.player.speed+=1;assert.equal(a.restore(bad),false);
  }
  const pending=legacySave(engine,3);Object.assign(pending.state.player,{level:2,xpNext:192,maxHp:112,hp:112,speed:9.95,size:0.965,damage:14,mutationEnergy:96});
  pending.state.mode='evolving';
  const a=game(1),b=game(2);assert.equal(a.restore(pending),true);assert.equal(b.restore(pending),true);
  assert.equal(a.state.mode,'playing');assert.equal(a.state.stats.evolutions,1);assert.equal(a.state.player.mutationEvents,3);
  assert.deepEqual(a.serialize(),b.serialize());const settled=a.serialize();assert.equal(a.restore(settled),true);assert.deepEqual(a.serialize(),settled);
  const maxLegacy=game();empty(maxLegacy);
  while(maxLegacy.state.player.level<13)earnLevel(maxLegacy);
  maxLegacy.state.world=createLegacyWorld(maxLegacy.state.world.seed);
  maxLegacy.state.entities=[];
  for(let i=0;i<45;i++)maxLegacy._spawnPickup('food',i<10);
  for(let i=0;i<8;i++)maxLegacy._spawnPickup('isotope',i<2);
  maxLegacy._seedEcology();maxLegacy._seedExpedition();
  const core=maxLegacy.state.world.core;
  maxLegacy._entity('boss',core.x,core.y,core.z,6.5,1100,{attackTime:3,phase:1,weakened:false});
  for(const version of [1,2,3,4])assert.equal(game().restore(legacySave(maxLegacy,version)),true,`max level v${version} save must migrate`);
});

test('death and victory freeze the ocean and survive save/load', () => {
  const dead=game();empty(dead);dead.state.player.hp=0.1;place(dead,'predator',{hp:100,maxHp:100,damage:50});
  // 捕食者扑击有前摇，所以致命一击不会在第一帧就落下。
  for(let step=0;step<8&&dead.state.mode==='playing';step++)dead.update(0.1,{});
  assert.equal(dead.state.mode,'dead');assert.equal(dead.drainEvents().filter(e=>e.type==='death').length,1);assert.equal(game().restore(dead.serialize()),true);
  const won=game();empty(won);while(won.state.player.level<11)earnLevel(won);
  unsealCore(won);
  const p=won.state.player,boss=won.state.entities.find(e=>e.type==='boss');Object.assign(p,{x:boss.x,y:boss.y,z:boss.z+12,energy:p.maxEnergy,cooldowns:{...p.cooldowns,feed:0}});boss.hp=1;boss.weakened=true;
  won.update(0.1,{feed:true});assert.equal(won.state.mode,'won');assert.equal(won.state.entities.some(e=>e.type==='boss'),false);
  const before=won.serialize();won.update(0.1,{x:1});assert.deepEqual(won.serialize(),before);assert.equal(game().restore(before),true);
});

test('a developed body can defeat the unsealed core using movement and abilities', () => {
  const engine=game(143);
  while(engine.state.player.level<11)earnLevel(engine);
  unsealCore(engine);
  const startingLevel=engine.state.player.level;
  for(let tick=0;tick<9000;tick++){
    const p=engine.state.player;if(engine.state.mode!=='playing')break;
    const dist=e=>Math.hypot(e.x-p.x,e.y-p.y,e.z-p.z);
    const pickups=engine.state.entities.filter(e=>e.type==='food'||e.type==='marineSnow'||(e.type==='isotope'&&p.radiation<60));
    pickups.sort((a,b)=>dist(a)/(a.type==='isotope'?0.6:1)-dist(b)/(b.type==='isotope'?0.6:1));assert.ok(pickups.length);
    let target=pickups[0];const input={};
    const boss=engine.state.entities.find(e=>e.type==='boss');
    const tendrils=engine.state.entities.filter(e=>e.type==='tendril');
    if(boss){
      // 母体的每个阶段都有一个明确目标：先切触须，再打散云团，最后趁窗口打核心。
      let aim=boss;
      if(boss.motherPhase==='armor'&&tendrils.length) aim=tendrils.sort((a,b)=>dist(a)-dist(b))[0];
      else if(boss.motherPhase==='spout'){
        const clouds=(boss.clouds||[]).filter(c=>c.active);
        if(clouds.length) aim={x:clouds[0].x,y:clouds[0].y,z:clouds[0].z};
      }
      target=aim;
      const dx=aim.x-p.x,dy=aim.y-p.y,dz=aim.z-p.z,len=Math.hypot(dx,dy,dz)||1;
      const approach=dist(aim)>9?1:-0.35;
      input.x=dx/len*approach;input.y=dy/len*approach;input.z=dz/len*approach;
      // 脉冲是扇形的：必须真的朝着目标，所以方向要单独给。
      input.dir={x:dx/len,y:dy/len,z:dz/len};
      input.pulse=dist(boss)<30;
      input.feed=Boolean(boss.weakened&&p.apex&&dist(boss)<boss.radius+p.size+6);
      input.dash=dist(aim)>18&&p.energy>65;
    } else {
      const dx=target.x-p.x,dy=target.y-p.y,dz=target.z-p.z,len=Math.hypot(dx,dy,dz)||1;
      input.x=dx/len;input.y=dy/len;input.z=dz/len;
      input.dir={x:dx/len,y:dy/len,z:dz/len};
      input.feed=pickups.filter(e=>dist(e)<14).length>2;
    }
    engine.update(0.1,input);
    engine.drainEvents();if(tick%500===0)assert.equal(game().restore(engine.serialize()),true);
  }
  assert.equal(engine.state.mode,'won');assert.equal(engine.state.player.level,startingLevel);
  assert.ok(engine.state.stats.kills>=1);assert.ok(engine.state.time<900);
});
