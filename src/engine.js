/** The simulation is independent of WebGL so runs and save files can be tested. */
import { SPECIES, lifeStageFor, lifeStageName, depthFor, zoneFor, seabedHeight, CRAB_GROUND_CLEARANCE, SEDIMENT_GROUND_CLEARANCE, PLAYER_MAX_Y, WATER_SURFACE_Y } from './biology.js';
import { MUTATIONS, MUTATION_RULES, initialMutations, innateParasitismForSeed } from './mutations.js';
import { VARIANTS, REACTOR_SITES, BIOFILM_SITES, HOST_TYPES, PARASITE_SITE_DEFS, INTERACTION_RULES, reactorPhase, initialExpedition, interactionTarget, interactionPosition, exposureAt, parasiteSites } from './ecosystem.js';
import { createWorld, createLegacyWorld } from './world.js';
import { ASSIMILATIONS, MAX_ASSIMILATION_RECORDS, initialAssimilations, assimilationCandidates, diveAdaptation } from './assimilation.js';
import { humanBoatStates, crossedSonarPhase, HUMAN_SONAR_WARNING, HUMAN_SONAR_PULSE } from './human-navigation.js';
import { islandMetric, islandSurfaceAt, islandObstacleAt, islandHumanStructureAt, islandCenter, islandShorePoint, islandDeepPassageAt, islandFinalCorePoint, islandReactorAccessPoint } from './island.js';
import { outfallBlocks, outfallLayout } from './outfall-layout.js';
import { bloomNutrient, bloomPhase } from './plankton-bloom.js';
import { spawnPlanktonBloom, updatePlanktonBloom } from './bloom-system.js';
import { ABERRANT_ECHO_DEFS, ECHO_PHASE_LABELS, ECHO_RESIST, ECHO_STRATEGY, ECHO_TIMING, echoPhaseAt, echoVulnerability } from './echo-system.js';
import { INSTINCTS, SYMBIOSIS_INSTINCTS, initialInstincts, instinctAvailable, instinctDefinition, instinctRank, instinctTier } from './instincts.js';
import { MOTHER_PHASE, MOTHER_RULES, createTendrils, damageMother, isMother, updateMother } from './emissions-mother.js';
import { OCEAN_OUTCOME, classifyOutcome, detectionModifier, fearRadiusModifier, oceanBalance } from './ocean-breath.js';

export const BRANCHES = [
  {
    id: 'devour', name: '深渊吞噬', tag: '肉体 · 捕猎', color: '#ff9975',
    description: '从细胞膜包裹食物开始，随身体阶段发展更复杂的摄食结构。',
    upgrades: [
      { name: '摄食膜褶', description: '膜褶提高包裹食物的效率；单细胞仍通过胞吞摄食。' },
      { name: '协同纤毛', description: '群体纤毛产生摄食水流，扩大牵引范围。' },
      { name: '消化分工', description: '群体分工提高消化效率；进入多细胞阶段后形成消化腔。' },
      { name: '捕食结构', description: '多细胞阶段形成摄食口与肌性膜褶，解锁更大的猎物。' },
    ],
  },
  {
    id: 'radiation', name: '辐射共鸣', tag: '能量 · 爆发', color: '#baf773',
    description: '让同位素在体内共振，将致命辐射转化为异化能量。',
    upgrades: [
      { name: '同位素囊', description: '提高辐射耐受，脉冲伤害与作用范围提升。' },
      { name: '共振核心', description: '吸收同位素恢复能量，缩短脉冲冷却。' },
      { name: '放射冠冕', description: '辐射不再只是负担：高辐射增强脉冲。' },
      { name: '临界生命', description: '辐射终型：毁灭性脉冲与极高污染耐受。' },
    ],
  },
  {
    id: 'symbiosis', name: '共生菌群', tag: '恢复 · 机动', color: '#70d9f7',
    description: '与微小生命共生，获得持续修复、净化与敏捷游动。',
    upgrades: [
      { name: '共生修复', description: '共生微生物协助修复；鞭毛推动细胞游动。' },
      { name: '光合共生', description: '仅在日光层获得光合补给；群体纤毛改善游动。' },
      { name: '净化群落', description: '加快体内辐射消退，提升护甲与恢复。' },
      { name: '协同运动', description: '成熟多细胞个体以肌性膜褶游动，保留共生修复能力。' },
    ],
  },
];

export const STAGES = [
  { name: '微光初生', subtitle: '01 / 原始海域', objective: '附着菌膜并消化，建立细胞协作', color: '#73e0c4', depth: '浅海 · 细胞初生' },
  { name: '异化潮汐', subtitle: '02 / 污染边界', objective: '附着大型宿主，随它迁移并适应', color: '#baf773', depth: '污染带 · 适应辐射' },
  { name: '深海觉醒', subtitle: '03 / 禁区边缘', objective: '追猎反应堆的异变回声体，再趁冷却窗口侵入', color: '#b7a4ff', depth: '禁区 · 污染源出没' },
  { name: '终止排放', subtitle: '04 / 岛屿核心', objective: '停机三座反应堆后，击败盘踞排放口的母体', color: '#ff9975', depth: '灰屿 · 排放母体' },
];

const MAX_LEVEL = 13;
const WILDLIFE = new Set(['fish', 'jelly', 'shark', 'squid', 'whale', 'ray', 'turtle', 'angler', 'crab', 'lanternfish', 'cuttlefish', 'oarfish']);
const TYPES = new Set(['food', 'isotope', 'predator', 'drone', 'boss', 'vent', 'marineSnow', 'reactor', 'biofilm', 'bloom', 'diver', 'islandNode', 'echo', 'tendril', ...WILDLIFE]);
export const ANIMAL_COUNTS = Object.freeze({ fish: 78, jelly: 14, shark: 6, squid: 6, whale: 3, ray: 7, turtle: 5, angler: 8, crab: 12, lanternfish: 24, cuttlefish: 7, oarfish: 4 });
const MAX_ENTITIES = 512;
const BEHAVIORS = new Set(['school', 'flee', 'drift', 'hunt', 'patrol', 'surface', 'feed', 'glide', 'graze', 'ambush', 'scavenge']);
const MODES = new Set(['menu', 'playing', 'paused', 'dead', 'won']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
// Math.hypot 为了防溢出要走慢路径，而距离计算是这个模拟里最频繁的调用。
// 直接平方求和更快，坐标量级远没到溢出范围。
const distance = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};
const xpForLevel = level => 80 + level * 38 + level * level * 9;
const stageForLevel = level => Math.min(3, Math.floor((level - 1) / 2));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const smoothStep = value => value * value * (3 - 2 * value);

// Cone test with a cylindrical cap: a target counts as inside when its centre
// is within the arc and its body radius is allowed to spill over the edge.
export function coneContains(direction, origin, target, arcDegrees, targetRadius = 0) {
  const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
  const along = dx * direction.x + dy * direction.y + dz * direction.z;
  if (along < -targetRadius) return false;
  const perp = Math.hypot(
    dx - direction.x * along,
    dy - direction.y * along,
    dz - direction.z * along,
  );
  const halfAngle = (arcDegrees * Math.PI) / 360;
  const allowed = Math.tan(halfAngle) * Math.max(0, along) + targetRadius;
  return perp <= allowed;
}

function landmarkFloorAt(world, x, z) {
  const base = seabedHeight(x, z);
  let floor = base;
  for (const landmark of world.landmarks || []) {
    if (landmark.kind !== 'shelf' && landmark.kind !== 'reef') continue;
    const dx = x - landmark.x, dz = z - landmark.z;
    // 包围盒排除：礁台只抬高它自己脚下那一块，别处不必算轮廓。
    if (dx > landmark.radius * 1.18 + 3 || dx < -landmark.radius * 1.18 - 3) continue;
    if (dz > landmark.radius * 1.18 + 3 || dz < -landmark.radius * 1.18 - 3) continue;
    const angle = Math.atan2(dz, dx);
    const contour = landmark.radius * (1 + Math.sin(angle * 5 + .7) * .075 + Math.cos(angle * 3) * .08);
    const radial = Math.hypot(dx, dz) / contour;
    if (radial >= 1) continue;
    const falloff = 1 - smoothStep(clamp((radial - .58) / .42, 0, 1));
    floor = Math.max(floor, base + (landmark.y - base) * falloff + Math.sin(x * .31 + z * .22) * .3 * falloff);
  }
  return floor;
}

function openWaterSpawnPoint(world,x,z,random) {
  const limit=world.radius-5;
  const valid=(candidateX,candidateZ)=>
    Math.hypot(candidateX,candidateZ)<=limit&&islandSurfaceAt(world,candidateX,candidateZ)===null;
  if(valid(x,z))return {x,z};
  const center=islandCenter(world),baseAngle=Math.atan2(z-center.z,x-center.x);
  for(const offset of [0,.24,-.24,.5,-.5,.82,-.82,1.14,-1.14,1.57,-1.57,2.1,-2.1,Math.PI]){
    const point=islandShorePoint(world,baseAngle+offset,10+random()*18);
    if(valid(point.x,point.z))return {x:point.x,z:point.z};
  }
  for(let attempt=0;attempt<18;attempt++){
    const angle=random()*Math.PI*2,radius=40+random()*(limit-40);
    const candidateX=Math.cos(angle)*radius,candidateZ=Math.sin(angle)*radius;
    if(valid(candidateX,candidateZ))return {x:candidateX,z:candidateZ};
  }
  return {x:0,z:0};
}

// 碰撞体要和看得见的身体一致。
// 观察放大阶段身体在世界里极小（本来就该在鱼群之间穿行）；
// 成为巨兽后身体才真正占据世界尺度，那时碰撞必须跟着变大，
// 否则就是"看得见撞上去却穿过去"。
export function playerBodyRadius(player) {
  if (!player) return .3;
  return player.apex ? Math.max(.6, player.size * .75) : Math.max(.3, player.size * .28);
}

export function wildlifeBodyClearance(entity) {
  const radius=Math.max(.1,entity.radius||.5);
  const multiplier={
    fish:.78,lanternfish:.74,shark:.86,squid:.82,whale:.92,
    ray:.82,turtle:.7,angler:.68,crab:.5,cuttlefish:.78,oarfish:.86,jelly:.58,
  }[entity.type]??.65;
  return Math.max(.22,radius*multiplier);
}

function islandTouchesBody(world,x,z,clearance,metric=islandMetric(world,x,z)) {
  if(metric.inside)return true;
  // One centre read keeps the common case cheap. The surrounding samples only
  // run near the coast, where nose/tail clipping would otherwise be visible.
  if(metric.radial>1.32)return false;
  for(const angle of [0,Math.PI*.5,Math.PI,Math.PI*1.5]){
    if(islandSurfaceAt(world,x+Math.cos(angle)*clearance,z+Math.sin(angle)*clearance)!==null)return true;
  }
  return false;
}

function bestWildlifeDirection(state,entity,preferred,lookAhead,lower,upper) {
  const length=Math.hypot(preferred.x,preferred.y,preferred.z)||1;
  const base={x:preferred.x/length,y:preferred.y/length,z:preferred.z/length};
  let best=null,bestScore=-Infinity;
  const yawOffsets=[0,.45,-.45,.95,-.95,1.6,-1.6,Math.PI];
  const pitchOffsets=[0,-.3];
  for(const yaw of yawOffsets)for(const pitch of pitchOffsets){
    const horizontal=Math.hypot(base.x,base.z)||1;
    const cosYaw=Math.cos(yaw),sinYaw=Math.sin(yaw);
    const x=(base.x*cosYaw-base.z*sinYaw)*Math.cos(pitch);
    const z=(base.x*sinYaw+base.z*cosYaw)*Math.cos(pitch);
    const y=clamp(base.y+pitch,-1,1);
    const candidateLength=Math.hypot(x,y,z)||1;
    const candidate={x:x/candidateLength,y:y/candidateLength,z:z/candidateLength};
    const probeY=clamp(entity.y+candidate.y*lookAhead,lower,upper);
    if(wildlifeSpaceBlocked(
      state,entity,
      entity.x+candidate.x*lookAhead,
      probeY,
      entity.z+candidate.z*lookAhead,
    ))continue;
    // Keep momentum coherent: a fish chooses the closest genuinely clear arc
    // instead of reversing one axis and visibly trembling at a wall.
    const currentSpeed=Math.hypot(entity.vx||0,entity.vy||0,entity.vz||0);
    const momentum=currentSpeed>.05
      ? (candidate.x*(entity.vx||0)+candidate.y*(entity.vy||0)+candidate.z*(entity.vz||0))/currentSpeed
      : 0;
    const score=base.x*candidate.x+base.y*candidate.y+base.z*candidate.z-Math.abs(yaw)*.12-Math.abs(pitch)*.08+momentum*.08;
    if(score>bestScore){bestScore=score;best=candidate;}
  }
  return best;
}

function movingBodyBlocks(state, player, x, y, z) {
  if (player.attachment) return false;
  for (const entity of state.entities) {
    if (entity.dead || !WILDLIFE.has(entity.type)) continue;
    const innerRadius = ['whale', 'squid', 'shark', 'oarfish', 'ray', 'cuttlefish'].includes(entity.type)
      ? entity.radius * .9
      : entity.type === 'turtle' ? entity.radius * .85 : 0;
    if (innerRadius <= 0) continue;
    if (distance({ x, y, z }, entity) < innerRadius + playerBodyRadius(player)) return true;
  }
  for (const entity of state.entities) {
    if (entity.dead || entity.type !== 'reactor' || entity.status === 'shutdown') continue;
    // The pressure hull is solid, but its recessed front collar is an actual
    // opening. Keeping that approach corridor clear makes attachment physical
    // instead of asking the player to swim through a spherical blocker.
    const angle=Number.isFinite(entity.approachAngle)?entity.approachAngle:-Math.PI/2;
    const along=(x-entity.x)*Math.cos(angle)+(z-entity.z)*Math.sin(angle);
    if (along < entity.radius*.52 &&
        Math.hypot(x - entity.x, y - entity.y, z - entity.z) < 3.25 + player.size * .15) return true;
  }
  if (y > WATER_SURFACE_Y - 4.5) {
    const boats = humanBoatStates(state.world, state.time);
    for (let index = 0; index < boats.length; index++) {
      const boat = boats[index], dx = x - boat.x, dz = z - boat.z;
      const cosine = Math.cos(boat.heading), sine = Math.sin(boat.heading);
      const localX = dx * cosine - dz * sine;
      const localZ = dx * sine + dz * cosine;
      const halfWidth = index === 0 ? 4.8 : 4.1;
      const halfLength = index === 0 ? 14.4 : 12.2;
      if (Math.abs(localX) < halfWidth + player.size * .22 &&
          Math.abs(localZ) < halfLength + player.size * .18) return true;
    }
  }
  // The research wreck was enlarged into a 30 m vessel in the human-surface
  // pass, so its collision proxy must follow the rotated hull rather than the
  // old 9 m sphere. The bridge rises well above the seabed and is included.
  const wreckX = -25, wreckZ = -18, wreckHeading = 1.05;
  const wreckDx = x - wreckX, wreckDz = z - wreckZ;
  const wreckCos = Math.cos(wreckHeading), wreckSin = Math.sin(wreckHeading);
  const wreckLocalX = wreckDx * wreckCos - wreckDz * wreckSin;
  const wreckLocalZ = wreckDx * wreckSin + wreckDz * wreckCos;
  const wreckBase = seabedHeight(wreckX, wreckZ);
  if (Math.abs(wreckLocalX) < 5.2 + player.size * .18 &&
      Math.abs(wreckLocalZ) < 16.4 + player.size * .18 &&
      y > wreckBase + .25 && y < wreckBase + 13.8) return true;
  return false;
}

export function occupiedByWorld(state, player, x, y, z) {
  const world = state.world;
  const ground = islandSurfaceAt(world, x, z);
  const clearance = Math.max(.38, playerBodyRadius(player));
  if(y>=seabedHeight(x,z)+clearance&&farFromLand(world,x,z,clearance,['shelf','reef','bridge','ridge','vent']))return false;
  if(islandHumanStructureAt(world,x,y,z,clearance))return true;
  if (ground !== null) {
    const deepPassage = y < ground - 4 && islandDeepPassageAt(world, x, z);
    if (!deepPassage) {
      if (y < WATER_SURFACE_Y - 1.4) return true;
      if (islandObstacleAt(world, x, z)) return true;
    }
  }
  for (const landmark of world.landmarks || []) {
    if (landmark.kind === 'vent') {
      const base = seabedHeight(landmark.x, landmark.z);
      if (Math.hypot(x - landmark.x, z - landmark.z) < landmark.radius * .7 + player.size * .18 &&
          y > base - .5 && y < base + 7 + landmark.radius) return true;
    }
    if (landmark.kind === 'bridge') {
      const dx = x - landmark.x, dz = z - landmark.z;
      const angle = landmark.angle || 0;
      const horizontal = dx * Math.cos(angle) + dz * Math.sin(angle);
      const thickness = -dx * Math.sin(angle) + dz * Math.cos(angle);
      const base = seabedHeight(landmark.x, landmark.z);
      const archRadius = Math.hypot(horizontal / landmark.radius, (y - base) / (landmark.radius * .76));
      if (Math.abs(thickness) < landmark.radius * .23 && archRadius > .72 && archRadius < 1.32) return true;
    }
    if (landmark.kind === 'ridge') {
      const distance = Math.hypot(x - landmark.x, z - landmark.z);
      const base = seabedHeight(landmark.x, landmark.z);
      const reactorAccess = state.entities.some(entity =>
        entity.type === 'reactor' &&
        Math.hypot(entity.x - landmark.x, entity.z - landmark.z) < landmark.radius * .5);
      if (!reactorAccess && distance < landmark.radius * .32 + player.size * .2 && y < base + 7) return true;
    }
  }
  if(outfallBlocks(world,x,y,z,Math.max(.04,player.size*.22)))return true;
  return movingBodyBlocks(state, player, x, y, z);
}

// 开阔水域的快速判定。
// 碰撞检查每帧要跑上千次，而绝大多数动物都远离岛屿、礁台、排放口与沉船。
// 先用便宜的包围盒把它们排除掉，再走昂贵的精确地理查询。
const ISLAND_RADIUS_X=76, ISLAND_RADIUS_Z=116;
function farFromLand(world, x, z, margin, kinds) {
  const center=world.core?{x:world.core.x,z:world.core.z+34}:{x:0,z:0};
  const dx=x-center.x, dz=z-center.z;
  if(Math.hypot(dx/ISLAND_RADIUS_X, dz/ISLAND_RADIUS_Z) < 1.45+margin) return false;
  for(const landmark of world.landmarks||[]) {
    if(!kinds.includes(landmark.kind)) continue;
    const reach=landmark.radius*1.18+margin+3;
    const lx=x-landmark.x, lz=z-landmark.z;
    if(lx>reach||lx<-reach||lz>reach||lz<-reach) continue;
    return false;
  }
  const layout=outfallLayout(world);
  for(const segment of layout.segments) {
    if(Math.abs(x-segment.a.x)>80||Math.abs(z-segment.a.z)>80) continue;
    if(Math.abs(x-segment.b.x)>80||Math.abs(z-segment.b.z)>80) continue;
    return false;
  }
  // 近岸沉船
  if(Math.abs(x+25)<22+margin&&Math.abs(z+18)<22+margin) return false;
  return true;
}

export function wildlifeSpaceBlocked(state, entity, x, y, z) {
  const world=state.world;
  const clearance=wildlifeBodyClearance(entity);
  if(y>=seabedHeight(x,z)+clearance&&farFromLand(world,x,z,clearance,['shelf','reef']))return false;
  if(islandHumanStructureAt(world,x,y,z,clearance))return true;
  const metric=islandMetric(world,x,z);
  // Test the body envelope near the coast, not only the centre point. A fish
  // can no longer keep its centre in open water while its head crosses a wall.
  if(islandTouchesBody(world,x,z,clearance,metric))return true;
  // Include the exposed cliff skirt and breakwater rock margin. Without this
  // buffer fish could remain in open water by collision centre and still draw
  // their body through the cliff mesh.
  if(y<WATER_SURFACE_Y-.2&&metric.radial<1.085+clearance/120)return true;
  // The south harbor pier is outside the island footprint. Block its submerged
  // pilings so fish cannot visibly swim through the human-built dock.
  if(y>WATER_SURFACE_Y-8){
    const harborShore=islandShorePoint(world,Math.PI/2);
    for(let row=0;row<5;row++)for(const side of [-1,1]){
      const postX=harborShore.x+side*2.2,postZ=harborShore.z-1.5+4+row*4;
      if(Math.hypot(x-postX,z-postZ)<.34+clearance)return true;
    }
  }
  if(y>WATER_SURFACE_Y-10){
    const boats=humanBoatStates(world,state.time);
    for(let index=0;index<boats.length;index++){
      const boat=boats[index],cos=Math.cos(boat.heading),sin=Math.sin(boat.heading);
      const dx=x-boat.x,dz=z-boat.z;
      const localX=dx*cos-dz*sin,localZ=dx*sin+dz*cos;
      const halfWidth=(index===0?4.8:4.1)+clearance;
      const halfLength=(index===0?14.4:12.2)+clearance;
      if(Math.abs(localX)<halfWidth&&Math.abs(localZ)<halfLength)return true;
    }
  }
  const floor=landmarkFloorAt(world,x,z)+clearance;
  if(y<floor){
    const currentFloor=landmarkFloorAt(world,entity.x,entity.z)+clearance;
    if(currentFloor<=entity.y||floor>currentFloor+1e-5)return true;
  }
  const reactors=state.ecologyIndex?.get('reactor')||state.entities.filter(other=>other.type==='reactor');
  for(const other of reactors){
    if(other.dead||other.id===entity.id)continue;
    const localZ=z-other.z;
    if(localZ>-2.15){
      // 手写平方距离：热路径上每帧跑上千次，不能在这里分配临时对象。
      const rx=x-other.x,ry=y-other.y,rz=z-other.z;
      const reach=3.15+clearance;
      if(rx*rx+ry*ry+rz*rz<reach*reach)return true;
    }
  }
  if(outfallBlocks(world,x,y,z,clearance))return true;
  const wreckX=-25,wreckZ=-18,wreckHeading=1.05;
  const dx=x-wreckX,dz=z-wreckZ,cos=Math.cos(wreckHeading),sin=Math.sin(wreckHeading);
  const localX=dx*cos-dz*sin,localZ=dx*sin+dz*cos;
  const wreckBase=seabedHeight(wreckX,wreckZ);
  if(Math.abs(localX)<4.8+clearance&&
      Math.abs(localZ)<16+clearance&&
      y>wreckBase+.2&&y<wreckBase+13.8)return true;
  return false;
}

function derived(player, attachedHostType = null) {
  const { devour: d, radiation: r, symbiosis: s } = player.branches;
  const m = player.mutations;
  const a = player.assimilations;
  const growth = player.level - 1;
  player.maxHp = 100 + growth * 12 + d * 20 + s * 10;
  player.maxEnergy = 100 + s * 18 + r * 10;
  player.speed = 9.6 + growth * 0.35 + s * 0.8 - d * 0.15 + m.flagella * 1.4 - m.membrane * 0.35 - m.spines * 0.45;
  player.apex = player.level >= 11;
  // The camera magnifies the microscopic stage, but world-space collision and
  // interaction radius must still keep the initial cell smaller than fish and
  // industrial pipes.
  player.size = 0.46 + growth * 0.075 + d * 0.095 + (player.apex ? 4.15 + (player.level - 11) * 0.76 : 0);
  player.damage = 12 + growth * 2 + d * 7 + r * 2;
  player.armor = Math.min(0.65, d * 0.035 + s * 0.045 + m.spines * 0.04 + a.carapace * 0.07);
  player.regen = 0.65 + s * 0.45 + m.repair * 0.7;
  player.radiationTolerance = Math.min(98, 62 + r * 7 + m.membrane * 8);
  player.parasiteCapability = Boolean(player.innateParasitism || m.parasitism > 0);
  Object.assign(player, diveAdaptation(player, attachedHostType));
  player.lifeStage = lifeStageFor(player.level);
  player.depth = depthFor(player.y);
  player.zone = zoneFor(player.y).id;
  player.lightBonus = s >= 2 && player.y > 40;
}

export class GameEngine {
  constructor({ random = Math.random, seed } = {}) {
    this.seedSource = random;
    this.initialSeed = Number.isInteger(seed) ? seed >>> 0 : null;
    this.random = () => {
      this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
      return this.rngState / 4294967296;
    };
    this.events = [];
    this.dietWarnings = new Set();
    this.wakeContacts = new Set();
    this.schoolCovered = false;
    this.playerOnLand = false;
    this.timeWarp = null;
    this.reset();
  }

  reset(seed) {
    const runSeed = Number.isInteger(seed) ? seed >>> 0 : this.initialSeed ?? Math.floor(this.seedSource() * 4294967296) >>> 0;
    this.rngState = runSeed;
    this.nextId = 1;
    this.events = [];
    this.dietWarnings = new Set();
    this.wakeContacts = new Set();
    this.schoolCovered = false;
    this.playerOnLand = false;
    this.spawnTimer = 0;
    this.bloomSerial = 0;
    this.bloomRespawnAt = 0;
    this.state = {
      mode: 'menu', ending: null, time: 0, stage: 0, world: createWorld(runSeed),
      player: {
        x: 0, y: 44, z: 0, vx: 0, vy: 0, vz: 0,
        hp: 100, maxHp: 100, energy: 100, maxEnergy: 100,
        radiation: 0, mutationEnergy: 0, mutations: initialMutations(), mutationEvents: 0, mutationHistory: [], radiationTolerance: 62, senseRadius: 32,
        innateParasitism: innateParasitismForSeed(runSeed), parasiteCapability: innateParasitismForSeed(runSeed),
        biomass: 0, nutrition: 85, level: 1, xp: 0, xpNext: xpForLevel(1),
        lifeStage: 0, depth: depthFor(44), zone: zoneFor(44).id, lightBonus: false,
        speed: 9.6, size: 0.46, damage: 12, armor: 0, regen: 0.65,
        branches: { devour: 0, radiation: 0, symbiosis: 0 },
        cooldowns: { dash: 0, pulse: 0, feed: 0, bite: 0, jet: 0 },
        dashTime: 0, feedTime: 0, hurtTime: 0,
        attachment: null, onLand: false,
        instincts: initialInstincts(), instinctLog: [],
        facing: { x: 0, y: 0, z: -1 },
        biteWindup: 0, biteDirection: null, mimicActive: false, scanActive: false,
        panic: 0, dashHits: [], jetTime: 0, jetDir: { x: 0, y: 0, z: -1 }, jetSpeed: 0,
        overload: 0, overloadBurst: 0,
        assimilations: initialAssimilations(), assimilationHistory: [], ingestedPreyIds: [], apex: false, depthStress: 0, diveSupport: '基础耐受',
      },
      entities: [],
      ecology: { encounters: [], predations: 0, killsBySpecies: {} },
      oceanBalance: 0, oceanOutcome: null,
      expedition: initialExpedition(),
      stats: { eaten: 0, isotopes: 0, kills: 0, preyKills: 0, evolutions: 0, damageTaken: 0, distance: 0 },
    };
    // Small clusters give the first seconds an obvious direction and purpose.
    for (let i = 0; i < 45; i++) this._spawnPickup('food', i < 10);
    for (let i = 0; i < 8; i++) this._spawnPickup('isotope', i < 2);
    for (let i = 0; i < 6; i++) this._spawnEnemy('predator');
    this._seedEcology();
    this._seedExpedition(true);
    this._seedEchoes();
    this._seedParasiteNetwork();
    spawnPlanktonBloom(this);
    return this.state;
  }

  start(seed) {
    this.reset(seed);
    this.state.mode = 'playing';
    const parasite = this.state.player.parasiteCapability
      ? '本个体天然带有寄生原基，可尝试接管人类潜水员。'
      : '本个体暂未表达寄生原基；普通宿主仍可搭乘，寄生能力只能等待后期随机异变。';
    this._emit('start', `意识苏醒。寻找漂木菌膜，按 G 附着：营养维持生存，生态经历推动发育。${parasite}`);
    return this.state;
  }

  togglePause() {
    if (this.state.mode === 'playing') this.state.mode = 'paused';
    else if (this.state.mode === 'paused') this.state.mode = 'playing';
    return this.state.mode;
  }

  update(dt, input = {}) {
    if (this.state.mode !== 'playing' || !finite(dt) || dt <= 0) return;
    // Tab suspension cannot produce an enormous physics or damage step.
    dt = Math.min(dt, 0.1);
    // 顿帧：重击命中的那一瞬间时间几乎停住，给玩家"打实了"的手感。
    if (this.timeWarp) {
      this.timeWarp.remaining = Math.max(0, this.timeWarp.remaining - dt);
      dt *= this.timeWarp.factor;
      if (this.timeWarp.remaining <= 0) this.timeWarp = null;
    }
    const state = this.state;
    const p = state.player;
    this._refreshAdaptations();
    const { radiation: r, symbiosis: s, devour: d } = p.branches;
    const m = p.mutations;
    state.time += dt;
    this._updateHumanPatrol(dt);
    if (state.mode !== 'playing') return;
    this._updateReactors(dt);
    if (state.mode !== 'playing') return;
    const emergencyDetach = Boolean(p.attachment && (input.detach || input.dash));
    if (input.detach || input.dash && p.attachment) this._detach('紧急脱离');
    else if (input.interact) this._interact();
    for (const key of ['dash', 'pulse', 'feed', 'bite', 'jet']) p.cooldowns[key] = Math.max(0, p.cooldowns[key] - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.feedTime = Math.max(0, p.feedTime - dt);
    p.hurtTime = Math.max(0, p.hurtTime - dt);
    p.panic = Math.max(0, p.panic - dt);
    p.jetTime = Math.max(0, p.jetTime - dt);
    if (p.dashTime <= 0 && p.dashHits.length) p.dashHits.length = 0;
    this._updateFacing(input);
    this._updateInstinctStates(dt, input);
    p.lifeStage = lifeStageFor(p.level);
    p.depth = depthFor(p.y);
    p.zone = zoneFor(p.y).id;
    p.lightBonus = s >= 2 && p.y > 40;

    if (input.dash && !emergencyDetach && !p.attachment && p.cooldowns.dash <= 0 && p.energy >= 22) {
      p.energy -= 22;
      p.cooldowns.dash = Math.max(1.15, 3.6 - s * 0.3 - p.assimilations.jet * 0.55);
      p.dashTime = 0.6 + s * 0.05;
      this._emit('dash', '喷射冲刺', { x: p.x, y: p.y, z: p.z });
    }
    if (input.feed && !p.attachment && p.cooldowns.feed <= 0 && p.energy >= 12) {
      const weakenedEcho = state.entities.find(entity =>
        entity.type === 'echo' &&
        !entity.pacified &&
        entity.hp <= entity.maxHp * 0.32 &&
        distance(p, entity) < entity.radius + p.size + 5
      );
      const core = state.entities.find(entity => entity.type === 'boss' && entity.weakened && distance(p, entity) < entity.radius + p.size + 6);
      if(weakenedEcho) {
        p.energy -= 12;
        p.cooldowns.feed = 2.4;
        p.feedTime = 1.5;
        this._pacifyEcho(weakenedEcho,'吞噬共振核心');
      } else if (core && p.apex && this._canHarm(core)) {
        core.dead = true;
        // 母体的触须随它一起消失。
        for (const entity of state.entities) if (entity.type === 'tendril' && entity.bossId === core.id) entity.dead = true;
        state.entities = state.entities.filter(entity => !entity.dead);
        state.stats.kills++;
        state.ending = 'apex';
        state.oceanOutcome = classifyOutcome(oceanBalance(state));
        state.mode = 'won';
        p.radiation = 0;
        this._emit('islandDevoured', '巨兽张开吞噬器官，将灰屿排放核心连同岸基卷入深海。', { x: core.x, y: core.y, z: core.z, radius: core.radius, seed: state.world.seed });
        this._emit('win', '灰屿沉入深海，最后的污染源消失。');
        return;
      } else {
        p.energy -= 12;
        p.cooldowns.feed = 3.8;
        p.feedTime = 1.5;
        if(this.playerOnLand) {
          this._devourIslandHuman();
        } else {
          this._emit('feed', '吞噬牵引', { x: p.x, y: p.y, z: p.z, radius: 14 + d * 2 + m.photophore * 2 });
        }
      }
    }
    if (input.pulse && !p.attachment && p.cooldowns.pulse <= 0 && p.energy >= 28) {
      const tier = instinctTier(p, 'pulse');
      const radius = tier.radius;
      const arc = tier.arc;
      p.energy -= tier.cost;
      p.cooldowns.pulse = tier.cooldown;
      const damage = p.damage * tier.damageFactor * (1 + r * p.radiation * 0.0018) * ((p.overloadBurst || 0) > 0 ? 1.35 : 1);
      const direction = { ...p.facing };
      this._emit('pulse', '辐射脉冲', { x: p.x, y: p.y, z: p.z, radius, arc, dir: direction });
      for (const entity of state.entities) {
        if (entity.dead) continue;
        if (distance(p, entity) > radius + entity.radius) continue;
        if (!coneContains(direction, p, entity, arc, entity.radius)) continue;
        if (WILDLIFE.has(entity.type) && !this._canHarm(entity) && !this.dietWarnings.has(p.lifeStage)) {
          this.dietWarnings.add(p.lifeStage);
          const minLevel = entity.type === 'whale' ? null : SPECIES[entity.type].minPlayerLevel;
          this._emit('dietBlocked', entity.type === 'whale' ? '潜游齿鲸不属于可捕食对象；观察它的潜游与捕猎。' : `当前身体还无法摄食${SPECIES[entity.type].name}，需要先发育为${lifeStageName(minLevel === null ? 1 : minLevel)}。`, { kind: entity.type, minLevel, lifeStage: p.lifeStage });
        }
        if (this._isCombatTarget(entity)) {
          this._hurtEnemy(entity, damage, { x: p.x, y: p.y, z: p.z }, 'pulse');
          this._knockback(entity, tier.knockback, direction);
          if (tier.stun) this._stunEntity(entity, tier.stun);
          if (state.mode !== 'playing') break;
        }
        if (entity.type === 'echo' && !entity.pacified) {
          const charging = entity.phase === 'charge';
          this._damageEcho(entity, (28 + r * 4) * (charging ? 1.5 : 1), '辐射脉冲', 'pulse');
          if (charging) {
            this._stunEcho(entity, 1.6);
            this._knockback(entity, tier.knockback, direction);
          }
        }
      }
      state.entities = state.entities.filter(entity => !entity.dead);
      if (state.mode !== 'playing') return;
    }
    if (input.bite && !p.attachment && p.biteWindup <= 0 && p.cooldowns.bite <= 0) {
      const tier = instinctTier(p, 'bite');
      if (tier && p.energy >= tier.cost) {
        p.energy -= tier.cost;
        p.cooldowns.bite = tier.cooldown;
        p.biteWindup = tier.windup;
        p.biteDirection = { ...p.facing };
        this._emit('biteWindup', '撕咬准备', { x: p.x, y: p.y, z: p.z, dir: p.biteDirection });
      }
    }
    if (p.biteWindup > 0) {
      p.biteWindup = Math.max(0, p.biteWindup - dt);
      if (p.biteWindup <= 0) this._resolveBite();
    }
    if (input.jet && !p.attachment && p.cooldowns.jet <= 0) {
      const tier = instinctTier(p, 'jet');
      if (tier && p.energy >= tier.cost) {
        p.energy -= tier.cost;
        p.cooldowns.jet = tier.cooldown;
        p.jetTime = 0.35;
        p.jetDir = { ...p.facing };
        p.jetSpeed = tier.distance / 0.35;
        this._emit('jet', '喷射突进', { x: p.x, y: p.y, z: p.z, distance: tier.distance });
      }
    }

    let ix = !p.attachment && finite(input.x) ? input.x : 0;
    let iy = !p.attachment && finite(input.y) ? input.y : 0;
    let iz = !p.attachment && finite(input.z) ? input.z : 0;
    const magnitude = Math.hypot(ix, iy, iz);
    if (magnitude > 1) { ix /= magnitude; iy /= magnitude; iz /= magnitude; }
    p.energy = Math.max(0, p.energy - Math.min(1, magnitude) * (0.6 + p.lifeStage * 0.45) * dt);
    const mobility = p.nutrition < 20 ? 0.45 + p.nutrition * 0.0275 : 1;
    const mimicTier = p.mimicActive ? instinctTier(p, 'mimic') : null;
    const speed = p.speed * mobility
      * (p.dashTime > 0 ? 2.85 + p.assimilations.jet * 0.25 : 1)
      * (mimicTier ? mimicTier.speedFactor : 1)
      * (p.panic > 0 ? 0.85 : 1);
    const smoothing = 1 - Math.exp(-dt * (p.dashTime > 0 ? 20 : magnitude < 0.01 ? 17 : 12));
    // 喷射突进接管目标速度：位移来自水压，而不是玩家继续按方向键。
    const targetVx = p.jetTime > 0 ? p.jetDir.x * p.jetSpeed : ix * speed;
    const targetVy = p.jetTime > 0 ? p.jetDir.y * p.jetSpeed : iy * speed;
    const targetVz = p.jetTime > 0 ? p.jetDir.z * p.jetSpeed : iz * speed;
    p.vx += (targetVx - p.vx) * smoothing;
    p.vy += (targetVy - p.vy) * smoothing;
    p.vz += (targetVz - p.vz) * smoothing;
    const before = { x: p.x, y: p.y, z: p.z };
    const proposedX=p.x+p.vx*dt,proposedZ=p.z+p.vz*dt;
    const proposedY=clamp(p.y+p.vy*dt,3,PLAYER_MAX_Y);
    let destinationX=p.x,destinationZ=p.z;
    if(!p.attachment){
      // Try the requested step first, then axis and shallow-angle projections.
      // The extra deflections keep large wildlife, warships and the diagonal
      // wreck hull from becoming sticky walls when the player holds forward.
      const stepX=proposedX-p.x,stepZ=proposedZ-p.z,stepLength=Math.hypot(stepX,stepZ);
      const candidates=[[stepX,stepZ],[stepX,0],[0,stepZ]];
      if(stepLength>.0001){
        for(const angle of [.55,-.55,1.05,-1.05,1.57,-1.57,2.05,-2.05]){
          const cosine=Math.cos(angle),sine=Math.sin(angle);
          candidates.push([
            (stepX*cosine-stepZ*sine)*.82,
            (stepX*sine+stepZ*cosine)*.82,
          ]);
        }
      }
      let moved=false;
      for(const [deltaX,deltaZ] of candidates){
        if(!deltaX&&!deltaZ)continue;
        const nextX=p.x+deltaX,nextZ=p.z+deltaZ;
        if(occupiedByWorld(state,p,nextX,proposedY,nextZ))continue;
        destinationX=nextX;destinationZ=nextZ;
        if(deltaX!==stepX||deltaZ!==stepZ){
          p.vx=deltaX/dt*.78;
          p.vz=deltaZ/dt*.78;
        }
        moved=true;break;
      }
      if(!moved){p.vx*=.18;p.vz*=.18;}
    }
    const ground=islandSurfaceAt(state.world,destinationX,destinationZ);
    const canEnterLand=p.y>=WATER_SURFACE_Y-1.4;
    if(ground!==null&&canEnterLand){
      p.x=destinationX;p.z=destinationZ;this.playerOnLand=true;
      p.y=ground+Math.max(.18,p.size*.16);p.vy=0;
    } else {
      if(this.playerOnLand)p.y=Math.min(p.y,WATER_SURFACE_Y-.15);
      this.playerOnLand=false;
      p.x=destinationX;p.z=destinationZ;
      const floor=landmarkFloorAt(state.world,p.x,p.z)+Math.max(.38,p.size*.32);
      const passageCeiling=ground!==null&&islandDeepPassageAt(state.world,p.x,p.z)
        ? ground-4
        : ground!==null&&p.y<36 ? 35.95 : PLAYER_MAX_Y;
      p.y=clamp(proposedY,Math.max(3,floor),Math.min(PLAYER_MAX_Y,passageCeiling));
    }
    // This invariant catches old or externally restored positions as well as
    // any path that skipped the horizontal branch: a cell in open water can
    // never render in the air above the sea surface.
    if(islandSurfaceAt(state.world,p.x,p.z)===null)p.y=Math.min(p.y,PLAYER_MAX_Y);
    p.onLand=this.playerOnLand;
    const planar = Math.hypot(p.x, p.z);
    if (planar > state.world.radius) {
      p.x *= state.world.radius / planar;
      p.z *= state.world.radius / planar;
    }
    state.stats.distance += distance(before, p);
    p.depth = depthFor(p.y);
    p.zone = zoneFor(p.y).id;
    p.lightBonus = s >= 2 && p.y > 40;
    this._refreshAdaptations();

    // Resource changes use the destination water layer, so crossing into darkness
    // immediately stops photosynthesis. Low organic reserves also slow swimming.
    const metabolism = [0.12, 0.17, 0.24, 0.31][p.lifeStage] + m.radiotrophy * 0.025 + Math.min(1, magnitude) * m.flagella * 0.05 + p.depthStress * 0.28;
    p.nutrition = clamp(p.nutrition - metabolism * dt + (p.lightBonus ? 0.75 * dt : 0), 0, 100);
    const reserve = p.nutrition < 20 ? 0.3 + p.nutrition * 0.035 : 1;
    p.energy = Math.min(p.maxEnergy, p.energy + ((12 + s * 3) * reserve + (p.lightBonus ? 3 : 0) - p.depthStress * 4) * dt);
    p.radiation = Math.max(0, p.radiation - (0.48 + s * 0.3) * dt);
    // 辐射过载：剂量堆到临界会进入暴走 —— 伤害更高，但生命在流失。
    // 这把"痛"变成一个选择：主动去污染区刷异变能，还是及时撤出。
    if (p.radiation >= 85) {
      p.overload = Math.min(3, (p.overload || 0) + dt);
      if (p.overload >= 2 && (p.overloadBurst || 0) <= 0) {
        p.overloadBurst = 8;
        this._emit('overload', '辐射暴走：结构正在被改写，伤害提升，但生命在流失', { duration: 8 });
      }
    } else {
      p.overload = Math.max(0, (p.overload || 0) - dt);
    }
    if ((p.overloadBurst || 0) > 0) {
      p.overloadBurst = Math.max(0, p.overloadBurst - dt);
      this._damage(4 * dt, '辐射暴走', false);
      if (p.overloadBurst <= 0) {
        p.radiation = Math.min(p.radiation, 45);
        this._gainMutationEnergy(26);
        this._emit('overloadEnd', '暴走平息：辐射随组织重构释放，你获得了额外的异变能', {});
      }
    }
    const converted = Math.min(p.radiation, m.radiotrophy * dt, (p.maxEnergy - p.energy) / 4);
    p.radiation -= converted;
    p.energy += converted * 4;
    if (p.hurtTime <= 0 && p.nutrition > 5 && p.hp < p.maxHp) {
      const healed = Math.min(p.maxHp - p.hp, p.regen * reserve * dt);
      p.hp += healed;
      p.nutrition = Math.max(0, p.nutrition - m.repair * 0.07 * dt * healed / (p.regen * reserve * dt));
    }
    if (p.nutrition <= 0 && state.time > 25) {
      this._damage((0.65 + p.lifeStage * 0.2) * dt, '代谢储备耗尽', false);
      if (state.mode !== 'playing') return;
    }

    this._buildEcologyIndex();
    this._updateSchoolCover();
    for (const entity of state.entities) {
      if (entity.dead) continue;
      let dist = distance(p, entity);
      // 冲刺撞击与喷射突进：位移不只是位移，它们是招式。
      if ((p.dashTime > 0 || p.jetTime > 0) && WILDLIFE.has(entity.type) && !p.dashHits.includes(entity.id)) {
        const jetTier = p.jetTime > 0 ? instinctTier(p, 'jet') : null;
        const reach = p.dashTime > 0 ? entity.radius + p.size + 0.9 : entity.radius + p.size + 1.7;
        const direction = p.dashTime > 0 ? { x: p.vx, y: p.vy, z: p.vz } : p.jetDir;
        const inArc = p.dashTime > 0 || (jetTier && coneContains(p.jetDir, p, entity, jetTier.arc, entity.radius));
        if (dist <= reach && inArc) {
          p.dashHits.push(entity.id);
          if (p.dashTime > 0) {
            this._hurtEnemy(entity, (p.damage + p.mutations.spines * 5) * 1.6, { x: p.x, y: p.y, z: p.z }, 'melee');
            this._stunEntity(entity, 0.8);
            this._knockback(entity, 2.4, direction);
            this._emit('dashImpact', '冲刺撞击', { x: entity.x, y: entity.y, z: entity.z, kind: entity.type });
          } else {
            this._hurtEnemy(entity, p.damage * jetTier.damageFactor, { x: p.x, y: p.y, z: p.z }, 'melee');
            this._stunEntity(entity, 0.5);
            this._knockback(entity, jetTier.push, direction);
            this._emit('jetImpact', '水压撞开', { x: entity.x, y: entity.y, z: entity.z, kind: entity.type });
          }
          if (state.mode !== 'playing') break;
        }
      }
      if (entity.type === 'food' || entity.type === 'isotope' || entity.type === 'marineSnow') {
        if (entity.type === 'marineSnow') entity.y = Math.max(seabedHeight(entity.x, entity.z) + SEDIMENT_GROUND_CLEARANCE, entity.y - dt * 0.12);
        const attract = (p.feedTime > 0 ? 14 + d * 2 : 2.5 + p.size + d * 0.3) + m.photophore * 2.5;
        if (dist < attract) {
          const pull = Math.min(dist, dt * (p.feedTime > 0 ? 24 : 7));
          if (dist > 0.001) {
            entity.x += (p.x - entity.x) / dist * pull;
            entity.y += (p.y - entity.y) / dist * pull;
            entity.z += (p.z - entity.z) / dist * pull;
            if (entity.type === 'marineSnow') entity.y = Math.max(entity.y, seabedHeight(entity.x, entity.z) + SEDIMENT_GROUND_CLEARANCE);
          }
          dist = distance(p, entity);
        }
        if (dist < p.size + entity.radius + 0.7) {
          this._eat(entity);
          if (state.mode !== 'playing') break;
        }
      } else if (WILDLIFE.has(entity.type)) {
        this._updateWildlife(entity, dt, dist);
      } else if (entity.type === 'diver') {
        this._updateDiver(entity, dt);
      } else if (entity.type === 'echo') {
        this._updateEcho(entity,dt,dist);
      } else if (entity.type === 'islandNode') {
        // Nodes are driven by the infection attachment, not autonomous spawning.
      } else if (entity.type === 'reactor' || entity.type === 'biofilm') {
        // Their timers and attachment progress are updated once per step.
      } else if (entity.type === 'bloom') {
        updatePlanktonBloom(this, entity, dt);
      } else if (entity.type === 'vent') {
        if (dist < 10) {
          const exposure = dt * (1 - dist / 10);
          p.radiation = Math.min(100, p.radiation + exposure * 5 / (1 + r * 0.25));
          this._gainMutationEnergy(exposure * 2.5);
        }
      } else if (entity.type === 'boss') {
        if (isMother(entity)) {
          updateMother(this, entity, dt);
          // 触须是母体的弱点，也会被直接打伤。
          if (dist < entity.radius + p.size + 2) this._hurtEnemy(entity, (p.damage + m.spines * 5) * dt, { x: p.x, y: p.y, z: p.z });
        } else {
          entity.phase = entity.hp < entity.maxHp * 0.5 ? 2 : 1;
          entity.attackTime = Math.max(0, entity.attackTime - dt);
          if (!entity.weakened && dist < 27 && entity.attackTime <= 0) {
            entity.attackTime = entity.phase === 2 ? 2.5 : 3.6;
            this._damage(entity.phase === 2 ? 15 : 11, '排放核心震荡');
            p.radiation = Math.min(100, p.radiation + 4 / (1 + r * 0.3));
            this._gainMutationEnergy(6);
            this._emit('bossPulse', '核心释放污染冲击', { x: entity.x, y: entity.y, z: entity.z, radius: 27 });
          }
          if (state.mode === 'playing' && dist < entity.radius + p.size + 2) this._hurtEnemy(entity, (p.damage + m.spines * 5) * dt);
        }
      } else if (entity.type === 'tendril') {
        // 触须由母体统一驱动（位置与挥击），不走通用敌人逻辑。
      } else {
        this._updateEnemy(entity, dt, dist);
      }
      if (state.mode !== 'playing') break;
    }
    state.entities = state.entities.filter(entity => !entity.dead);
    if (state.mode !== 'playing') return;
    if (!state.entities.some(entity => entity.type === 'bloom') && state.time >= this.bloomRespawnAt) {
      spawnPlanktonBloom(this);
    }
    this._updateAttachment(dt);
    this._refreshAdaptations();
    // 海洋之息：每一帧都在结算。玩家看到的是水的颜色和鱼群的远近，
    // 不是一条说教式的分数。
    this.state.oceanBalance = oceanBalance(this.state);

    const toxicity = Math.max(0, p.radiation - p.radiationTolerance);
    if (toxicity > 0) this._damage(toxicity * 0.075 * dt, '辐射过载', false);
    if (state.mode !== 'playing') return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3;
      this._replenish();
    }
  }

  // Kept as inert compatibility methods; neither path accepts a player-selected trait.
  chooseEvolution() { return false; }
  chooseMutation() { return false; }

  _refreshAdaptations() {
    const p = this.state.player;
    const host = p.attachment?.kind === 'host' ? this.state.entities.find(e => e.id === p.attachment.entityId) : null;
    derived(p, host?.type);
  }

  // ------------------------------------------------------------------ 本能

  // 引擎没有 WebGL，拿不到相机朝向。main.js 用同一套 yaw/pitch 公式把相机
  // 前向塞进 input.dir；没有时退回速度方向，静止则保持上一次朝向。
  _updateFacing(input) {
    const p = this.state.player;
    const dir = input?.dir;
    if (dir && finite(dir.x) && finite(dir.y) && finite(dir.z)) {
      const length = Math.hypot(dir.x, dir.y, dir.z);
      if (length > 0.001) {
        p.facing = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
        return;
      }
    }
    const speed = Math.hypot(p.vx || 0, p.vy || 0, p.vz || 0);
    if (speed > 0.35) p.facing = { x: p.vx / speed, y: p.vy / speed, z: p.vz / speed };
  }

  // 拟态与扫描是按住型技能：状态由"是否按住"决定，而不是一次性触发。
  _updateInstinctStates(dt, input) {
    const p = this.state.player;
    const mimicTier = instinctAvailable(p, 'mimic') ? instinctTier(p, 'mimic') : null;
    const wantsMimic = Boolean(input.mimic) && !p.attachment && Boolean(mimicTier);
    if (wantsMimic !== p.mimicActive) {
      p.mimicActive = wantsMimic;
      this._emit(wantsMimic ? 'mimicStart' : 'mimicEnd', wantsMimic ? '收敛发光与轮廓，捕食者难以锁定你' : '拟态解除', {});
    }
    const senseTier = instinctAvailable(p, 'sense') ? instinctTier(p, 'sense') : null;
    const wantsScan = Boolean(input.scan) && !p.attachment && Boolean(senseTier);
    // 拟态会让躲着你的回声体放松警惕、靠过来 —— 这是感知之外的第二条解法。
    if (wantsMimic) this._revealEchoes(p, 12, 6);
    if (wantsScan && senseTier) {
      const drain = senseTier.costPerSecond * dt;
      if (p.energy >= drain) {
        p.energy -= drain;
        if (!p.scanActive) {
          p.scanActive = true;
          this._emit('scanStart', '感电扫描开启：周围生命的轮廓浮现', { radius: senseTier.radius });
        }
        this._revealEchoes(p, senseTier.radius, 9);
      } else if (p.scanActive) {
        p.scanActive = false;
        this._emit('scanEnd', '感电扫描中断：体能不足', {});
      }
    } else if (p.scanActive) {
      p.scanActive = false;
      this._emit('scanEnd', '感电扫描关闭', {});
    }
  }

  // 让范围内的回声体暴露真身：被扫描到，或者被拟态引来。
  _revealEchoes(player, radius, seconds) {
    for (const entity of this.state.entities) {
      if (entity.type !== 'echo' || entity.pacified) continue;
      if (Math.hypot(entity.x - player.x, entity.y - player.y, entity.z - player.z) > radius) continue;
      entity.revealedUntil = this.state.time + seconds;
    }
  }

  _mimicFactor() {
    const p = this.state.player;
    if (!p.mimicActive) return 1;
    const tier = instinctTier(p, 'mimic');
    return tier ? tier.stealth : 1;
  }

  // 拟态骗得过眼睛，骗不过共振：回声体只会减半被锁定。
  _echoMimicFactor() {
    const p = this.state.player;
    if (!p.mimicActive) return 1;
    const tier = instinctTier(p, 'mimic');
    return tier ? tier.echoStealth : 1;
  }

  _hitstop(duration = 0.1, factor = 0.18) {
    this.timeWarp = { remaining: duration, factor };
  }

  _stunEntity(entity, duration) {
    if (!entity || entity.type === 'boss' || entity.type === 'echo') return;
    entity.stunnedUntil = Math.max(entity.stunnedUntil || 0, this.state.time + duration);
  }

  _stunEcho(entity, duration) {
    if (!entity || entity.type !== 'echo') return;
    entity.phaseLock = Math.max(entity.phaseLock || 0, this.state.time + duration);
  }

  _knockback(entity, distance, direction) {
    if (!entity || !distance) return;
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const step = distance * 0.25;
    entity.vx = (entity.vx || 0) + (direction.x / length) * step;
    entity.vy = (entity.vy || 0) + (direction.y / length) * step * 0.4;
    entity.vz = (entity.vz || 0) + (direction.z / length) * step;
  }

  _resolveBite() {
    const p = this.state.player;
    const tier = instinctTier(p, 'bite');
    if (!tier) return;
    const direction = p.biteDirection || p.facing;
    let hits = 0;
    for (const entity of this.state.entities) {
      if (entity.dead) continue;
      // 回声体走自己的通道：切断的是共振，不是血条。
      if (entity.type === 'echo') {
        if (entity.pacified) continue;
        const reach = tier.range + entity.radius + p.size;
        if (distance(p, entity) > reach) continue;
        if (!coneContains(direction, p, entity, tier.arc, entity.radius)) continue;
        hits++;
        const charging = entity.phase === 'charge';
        this._damageEcho(entity, (18 + p.damage * 0.9) * (charging ? 2 : 1), '撕咬', 'melee');
        if (charging) {
          this._stunEcho(entity, 2.4);
          this._hitstop(0.12, 0.14);
        }
        this._knockback(entity, 2, direction);
        if (tier.refund) p.energy = Math.min(p.maxEnergy, p.energy + tier.refund);
        continue;
      }
      if (!this._isCombatTarget(entity)) continue;
      const reach = tier.range + entity.radius + p.size;
      if (distance(p, entity) > reach) continue;
      if (!coneContains(direction, p, entity, tier.arc, entity.radius)) continue;
      hits++;
      this._hurtEnemy(entity, p.damage * tier.damageFactor + p.mutations.spines * 4, { x: p.x, y: p.y, z: p.z }, 'melee');
      this._stunEntity(entity, 0.6);
      this._knockback(entity, 1.6, direction);
      if (tier.refund) p.energy = Math.min(p.maxEnergy, p.energy + tier.refund);
      if (this.state.mode !== 'playing') return;
    }
    this._emit('bite', hits ? '撕咬命中' : '撕咬落空', { x: p.x, y: p.y, z: p.z, hits, dir: direction, radius: tier.range + p.size });
  }

  // 本能只能由随机事件抵达。玩家永远不能指定是哪一条。
  _unlockInstinct(id, source) {
    const p = this.state.player;
    const definition = instinctDefinition(id);
    if (!definition) return false;
    const rank = instinctRank(p, id);
    if (rank >= 2) return false;
    p.instincts[id] = rank + 1;
    p.instinctLog.push({ id, rank: rank + 1, source, time: this.state.time });
    if (p.instinctLog.length > 24) p.instinctLog.shift();
    this._emit('instinctUnlocked', `整合了新的本能：${definition.name}`, {
      id, rank: rank + 1, source, name: definition.name, color: definition.color,
    });
    return true;
  }

  // 从随机候选中抽取一个本能并尝试整合。候选由调用方给出，玩家无从选择。
  _grantRandomInstinct(candidates, source, chance = 0.6) {
    if (!candidates.length) return false;
    const pool = candidates.filter(id => instinctRank(this.state.player, id) < 2);
    if (!pool.length) return false;
    const selected = pool[Math.floor(this.random() * pool.length)];
    // 每一种来源的第一个本能必定到手：
    // 捕食型（撕咬／突进）与共生型（拟态／扫描）各保底一个，
    // 主线上的三只回声体才永远有解 —— 而解法各不相同。
    const archetype = instinctDefinition(selected)?.archetype;
    const owned = this.state.player.instinctLog.some(entry => instinctDefinition(entry.id)?.archetype === archetype);
    const effectiveChance = owned ? chance : 1;
    if (this.random() >= effectiveChance) {
      this._emit('instinctFailed', `本次整合失败：${instinctDefinition(selected)?.name || selected} 没有留下结构`, {
        id: selected, source, success: false,
      });
      return false;
    }
    return this._unlockInstinct(selected, source);
  }

  _seedExpedition(seedVariants = false) {
    for (const site of this.state.world.reactorSites) if (!this.state.entities.some(e => e.type === 'reactor' && e.siteId === site.id)) {
      const shutdown = this.state.expedition.shutdowns.includes(site.id);
      const cycle = reactorPhase(this.state.time, site.offset);
      const access = this.state.world.legacy ? site : islandReactorAccessPoint(this.state.world, site);
      const approachAngle=Math.atan2(-access.z,-access.x);
      this._entity('reactor', access.x, Math.max(3, seabedHeight(access.x, access.z) + 2.3), access.z, 6, 1, {
        siteId: site.id, name: site.name, status: shutdown ? 'shutdown' : 'active', approachAngle,
        phase: shutdown ? 'shutdown' : cycle.phase, phaseRemaining: shutdown ? 0 : cycle.remaining,
        progress: shutdown ? 1 : 0, pollution: shutdown ? 0 : cycle.phase === 'discharge' ? 1 : cycle.phase === 'warning' ? 0.55 : 0.2,
        countered: false,
      });
    }
    for (const site of this.state.world.biofilmSites) if (!this.state.entities.some(e => e.type === 'biofilm' && e.siteId === site.id)) {
      const depleted = this.state.expedition.biofilms.includes(site.id);
      this._entity('biofilm', site.x, site.y, site.z, 2.5, 1, { siteId: site.id, name: site.name, progress: depleted ? 1 : 0, depleted, gathered: false });
    }
    // Existing pollution has already selected conspicuous abnormal fish and a
    // shark. Later births are normal and acquire exposure through simulation.
    for (const type of ['fish', 'shark']) {
      const animals = this.state.entities.filter(e => e.type === type);
      for (const [index, entity] of animals.entries()) {
        if (!seedVariants && entity.variant !== undefined) continue;
        entity.variant = index < (type === 'fish' ? 9 : 1) ? ['crooked', 'armored', 'lure'][index % 3] : 'normal';
        entity.exposure = entity.variant === 'normal' ? 0 : INTERACTION_RULES.exposureThreshold;
        if (entity.variant !== 'normal') {
          if(type==='fish'&&index<3||type==='shark'&&index===0) {
            // The player's first visible neighbours include both ordinary and
            // polluted life. Moving every abnormal animal to a reactor made the
            // nursery look as if the player were the only mutant in the sea.
            const angle=type==='shark'?.92:-.72+index*.78;
            const radius=type==='shark'?19:10+index*4.2;
            const safe=openWaterSpawnPoint(this.state.world,Math.cos(angle)*radius,Math.sin(angle)*radius,this.random);
            entity.x=safe.x;entity.z=safe.z;
            entity.y=type==='shark'?34:29+index*2.2;
          } else {
            const sourceSite = this.state.world.reactorSites[index % REACTOR_SITES.length];
            const site = this.state.world.legacy ? sourceSite : islandReactorAccessPoint(this.state.world, sourceSite);
            entity.x = site.x + Math.sin(index * 2.4) * 6;
            entity.z = site.z + Math.cos(index * 2.4) * 6;
            entity.y = type === 'fish' ? 17 + index % 3 : 19;
          }
        }
      }
    }
  }

  _seedEchoes() {
    const log=this.state.expedition;
    log.echoesPacified=Array.isArray(log.echoesPacified)?log.echoesPacified:[];
    log.echoEncounters=Array.isArray(log.echoEncounters)?log.echoEncounters:[];
    let placementState=(this.state.world.seed^0x8da91c3d)>>>0;
    const placementRandom=()=>{
      placementState=(Math.imul(placementState,1664525)+1013904223)>>>0;
      return placementState/4294967296;
    };
    for(const [index,definition] of ABERRANT_ECHO_DEFS.entries()) {
      const reactor=this.state.entities.find(entity=>entity.type==='reactor'&&entity.siteId===definition.reactorId);
      const site=this.state.world.reactorSites.find(candidate=>candidate.id===definition.reactorId);
      if(!reactor||!site||this.state.entities.some(entity=>entity.type==='echo'&&entity.reactorSiteId===definition.reactorId))continue;
      const angle=(index*2.09+(this.state.world.seed%997)/997*Math.PI*2)%(Math.PI*2);
      const radius=18+index*2;
      const safe=openWaterSpawnPoint(
        this.state.world,
        reactor.x+Math.cos(angle)*radius,
        reactor.z+Math.sin(angle)*radius,
        placementRandom,
      );
      const pacified=log.echoesPacified.includes(definition.reactorId);
      const seed=(this.state.world.seed*.013+index*1.917)%(Math.PI*2);
      const phase=pacified?'pacified':echoPhaseAt(0,seed).phase;
      this._entity('echo',safe.x,clamp(reactor.y+5+index*2,7,30),safe.z,3.1,pacified?1:140,{
        name:definition.name,
        role:definition.role,
        hint:definition.hint,
        echoKind:definition.echoKind,
        reactorSiteId:definition.reactorId,
        phase,
        phaseRemaining:0,
        pacified,
        link: pacified?0:1,
        phaseLock:0,
        lastPhase:phase,
        engagedAt:0,
        precisionHits:0,forceHits:0,
        attackTime:0,
        lastDisruptAt:-99,
        heading:angle,
        vx:0,vy:0,vz:0,
        speed:definition.echoKind==='pressureWorm'?4.7:definition.echoKind==='shardHunter'?4.3:3.4,
        damage:definition.echoKind==='shardHunter'?16:definition.echoKind==='lureColony'?11:14,
        homeX:safe.x,homeY:clamp(reactor.y+5+index*2,7,30),homeZ:safe.z,
        wanderPhase:seed,
      });
    }
  }

  _seedParasiteNetwork() {
    const center=islandCenter(this.state.world),shore=islandShorePoint(this.state.world,Math.PI/2,4);
    if(!this.state.entities.some(entity=>entity.type==='diver'&&!entity.dead)) {
      this._entity('diver',shore.x+8,WATER_SURFACE_Y-2.2,shore.z+4,2.1,420,{
        name:'取样潜水员',vx:0,vy:0,vz:0,heading:Math.PI,attackTime:0,
        homeX:shore.x+8,homeZ:shore.z+4,seed:(center.x*.17+center.z*.11+1.7)%(Math.PI*2),
      });
    }
    for(const [index,site] of parasiteSites(this.state.world).entries()) {
      if(this.state.entities.some(entity=>entity.type==='islandNode'&&entity.siteId===site.id))continue;
      const disabled=this.state.expedition.parasiteNodes.includes(site.id);
      this._entity('islandNode',site.x,site.y,site.z,1.65,1,{
        siteId:site.id,name:site.name,progress:disabled?1:0,disabled,seed:index*1.913+site.x*.07+site.z*.03,
      });
    }
  }

  _updateDiver(entity,dt) {
    const core=this.state.world.core,phase=this.state.time*.16+entity.seed;
    const targetX=entity.homeX+Math.cos(phase)*15;
    const targetZ=entity.homeZ+Math.sin(phase*.83+1.2)*17;
    const targetY=WATER_SURFACE_Y-2.1+Math.sin(phase*1.7)*1.15;
    let dx=targetX-entity.x,dy=targetY-entity.y,dz=targetZ-entity.z;
    const length=Math.hypot(dx,dy,dz)||1;
    const speed=3.4;
    const ease=1-Math.exp(-dt*2.2);
    entity.vx+=(dx/length*speed-entity.vx)*ease;
    entity.vy+=(dy/length*speed*.65-entity.vy)*ease;
    entity.vz+=(dz/length*speed-entity.vz)*ease;
    entity.x+=entity.vx*dt;
    entity.y=clamp(entity.y+entity.vy*dt,WATER_SURFACE_Y-5,PLAYER_MAX_Y-.4);
    entity.z+=entity.vz*dt;
    if(Math.hypot(entity.vx,entity.vz)>.01){
      const desired=Math.atan2(-entity.vx,-entity.vz);
      const delta=Math.atan2(Math.sin(desired-entity.heading),Math.cos(desired-entity.heading));
      entity.heading+=clamp(delta,-dt*2,dt*2);
    }
  }

  _updateEcho(entity,dt,playerDistance) {
    const p=this.state.player,log=this.state.expedition;
    if(entity.pacified) {
      entity.phase='pacified';
      entity.hp=1;
      entity.link=0;
      return;
    }
    if(playerDistance<p.senseRadius&&!log.echoEncounters.includes(entity.reactorSiteId)) {
      log.echoEncounters.push(entity.reactorSiteId);
      this._emit('echoDiscovery',`感知到${entity.name}：它正把污染共振输送给附近反应堆。`,{
        entityId:entity.id,reactorSiteId:entity.reactorSiteId,echoKind:entity.echoKind,name:entity.name,
      });
    }

    const timing=echoPhaseAt(this.state.time,entity.seed);
    const previousPhase=entity.phase;
    entity.phase=timing.phase;
    entity.phaseRemaining=timing.remaining;
    // 撕咬或脉冲打断了蓄力：回声体被强行压回恢复期，短时间内无法再次蓄力。
    if((entity.phaseLock||0)>this.state.time){
      entity.phase='recovery';
      entity.phaseRemaining=entity.phaseLock-this.state.time;
    }
    if(previousPhase!==entity.phase) {
      if(entity.phase==='charge') {
        this._emit('echoCharge',`${entity.name}正在蓄积污染脉冲：拉开距离或准备冲刺。`,{
          entityId:entity.id,phase:entity.phase,remaining:timing.remaining,
        });
      } else if(entity.phase==='exposed') {
        const dodge=p.dashTime>0?.22:1;
        if(playerDistance<34) {
          this._damage(entity.damage*dodge,`${entity.name}释放污染脉冲`);
          p.radiation=Math.min(100,p.radiation+5*dodge/(1+p.branches.radiation*.25));
        }
        this._emit('echoExposed',`${entity.name}的外壳张开，反应堆共振暴露：现在攻击或按 G 切断连接。`,{
          entityId:entity.id,phase:entity.phase,remaining:timing.remaining,radius:34,
        });
      }
    }

    const engaged=playerDistance<62*this._echoMimicFactor();
    if(engaged&&!entity.engagedAt)entity.engagedAt=this.state.time;
    const orbit=this.state.time*(entity.echoKind==='shardHunter'?.33:.22)+entity.wanderPhase;
    let targetX=entity.homeX+Math.cos(orbit)*(entity.echoKind==='pressureWorm'?11:8);
    let targetZ=entity.homeZ+Math.sin(orbit*.83)*(entity.echoKind==='lureColony'?13:9);
    let targetY=entity.homeY+Math.sin(this.state.time*.41+entity.seed)*(entity.echoKind==='pressureWorm'?7:2.2);
    if(engaged) {
      const towardX=p.x,towardZ=p.z,towardY=p.y;
      if(entity.echoKind==='shardHunter'&&entity.phase==='charge') {
        targetX=towardX;targetZ=towardZ;targetY=towardY;
        entity.speed=6.2;
      } else if(entity.echoKind==='lureColony') {
        const lure=orbit*1.3;
        targetX=p.x+Math.cos(lure)*11;
        targetZ=p.z+Math.sin(lure)*11;
        targetY=p.y+Math.sin(lure*.7)*4;
        entity.speed=3.8;
      } else if(entity.echoKind==='pressureWorm') {
        targetX=p.x+Math.cos(orbit*1.4)*6;
        targetZ=p.z+Math.sin(orbit*1.4)*6;
        targetY=clamp(p.y+Math.sin(this.state.time*.85)*10,6,49);
        entity.speed=4.9;
      } else {
        entity.speed=4.2;
      }
    } else {
      entity.speed=Math.hypot(entity.vx||0,entity.vy||0,entity.vz||0)>.3?.6:.28;
    }
    if(entity.phase==='exposed')entity.speed*=.62;
    if(entity.phase==='recovery')entity.speed*=.78;
    let dx=targetX-entity.x,dy=targetY-entity.y,dz=targetZ-entity.z;
    const length=Math.hypot(dx,dy,dz)||1;
    const ease=1-Math.exp(-dt*(engaged?2.2:1.2));
    entity.vx+=((dx/length)*entity.speed-entity.vx)*ease;
    entity.vy+=((dy/length)*entity.speed-entity.vy)*ease;
    entity.vz+=((dz/length)*entity.speed-entity.vz)*ease;
    const nextX=entity.x+entity.vx*dt,nextY=clamp(entity.y+entity.vy*dt,5,PLAYER_MAX_Y-.4),nextZ=entity.z+entity.vz*dt;
    if(!wildlifeSpaceBlocked(this.state,entity,nextX,nextY,nextZ)) {
      entity.x=nextX;entity.y=nextY;entity.z=nextZ;
    } else {
      const homeLength=Math.hypot(entity.homeX-entity.x,entity.homeZ-entity.z)||1;
      entity.vx=(entity.homeX-entity.x)/homeLength*entity.speed;
      entity.vz=(entity.homeZ-entity.z)/homeLength*entity.speed;
      entity.vy*=.35;
    }
    if(Math.hypot(entity.vx,entity.vz)>.02) {
      const desired=Math.atan2(-entity.vx,-entity.vz);
      const delta=Math.atan2(Math.sin(desired-entity.heading),Math.cos(desired-entity.heading));
      entity.heading+=clamp(delta,-dt*2.4,dt*2.4);
    }
    entity.attackTime=Math.max(0,entity.attackTime-dt);
    if(playerDistance<entity.radius+p.size+.9&&entity.attackTime<=0) {
      entity.attackTime=2.4;
      const phaseDamage=entity.phase==='exposed'?1.15:.75;
      this._damage(entity.damage*phaseDamage*(p.dashTime>0?.25:1),`${entity.name}近身冲击`);
      if(playerDistance>.001) {
        p.vx+=(p.x-entity.x)/playerDistance*3.5;
        p.vy+=(p.y-entity.y)/playerDistance*1.2;
        p.vz+=(p.z-entity.z)/playerDistance*3.5;
      }
    }
    if(!engaged&&entity.phase!=='exposed') {
      entity.hp=Math.min(entity.maxHp,entity.hp+entity.maxHp*.012*dt);
      entity.link=entity.hp/entity.maxHp;
    }
  }

  _damageEcho(entity,amount,source='攻击',kind='pulse') {
    if(!entity||entity.type!=='echo'||entity.pacified)return false;
    const vulnerability=echoVulnerability(entity.phase);
    // 每只回声体有一把钥匙：用对工具伤害才作数，用错工具几乎打不动。
    const resist=ECHO_RESIST[entity.echoKind]||null;
    const revealed=Boolean(entity.revealedUntil&&entity.revealedUntil>this.state.time);
    let multiplier=1;
    if(resist){
      const base=kind==='melee'?resist.melee:resist.pulse;
      multiplier=revealed?Math.max(base,1):base;
    }
    // 用对工具命中算"精准"，评级才会给到 1–3 级。
    if(multiplier>=.9&&entity.phase==='exposed')entity.precisionHits=(entity.precisionHits||0)+1;
    else entity.forceHits=(entity.forceHits||0)+1;
    // 打不动的时候要说清楚为什么 —— 否则玩家只会以为游戏在骗他。
    if(multiplier<.5&&!entity.resistHinted){
      entity.resistHinted=true;
      const strategy=ECHO_STRATEGY[ECHO_RESIST[entity.echoKind]?.needs];
      this._emit('echoResist', strategy?`${entity.name}挡下了这一击 —— ${strategy.hint}`:`${entity.name}挡下了这一击`, {
        entityId:entity.id,kind:entity.echoKind,
      });
    }
    const dealt=Math.max(1,amount*multiplier*(.32+vulnerability*1.9));
    entity.hp=Math.max(0,entity.hp-dealt);
    entity.link=entity.hp/entity.maxHp;
    this._emit('echoDamaged',`${ECHO_PHASE_LABELS[entity.phase]||'追踪'} · ${source}切断了 ${Math.ceil(entity.link*100)}% 剩余共振`,{
      entityId:entity.id,phase:entity.phase,link:entity.link,
    });
    if(entity.hp<=0)this._pacifyEcho(entity,source);
    return true;
  }

  _disruptEcho(entity) {
    const p=this.state.player;
    if(!entity||entity.type!=='echo'||entity.pacified)return false;
    if(this.state.time-(entity.lastDisruptAt??-99)<1.6) {
      this._emit('interaction','共振纤维尚未重新暴露，等待外壳开合。');
      return false;
    }
    entity.lastDisruptAt=this.state.time;
    const trait=p.assimilations?.electroreception||0;
    this._damageEcho(entity,22+trait*14,'撕裂神经链接','melee');
    entity.attackTime=Math.max(entity.attackTime,.8);
    this._emit('echoDisrupt',`你撕开共振纤维；${entity.name}短暂失去反应堆定位。`,{
      entityId:entity.id,phase:entity.phase,link:entity.link,
    });
    return true;
  }

  _pacifyEcho(entity,source='切断共振') {
    if(!entity||entity.pacified)return false;
    entity.pacified=true;
    entity.phase='pacified';
    entity.phaseRemaining=0;
    entity.hp=1;
    entity.link=0;
    entity.vx=entity.vy=entity.vz=0;
    const log=this.state.expedition;
    const hits=(entity.precisionHits||0)+(entity.forceHits||0);
    const precision=hits?entity.precisionHits/hits:0;
    const huntTime=Math.max(0,this.state.time-(entity.engagedAt||this.state.time));
    const rating=1+(precision>=.6?1:0)+(huntTime<=45&&this.state.player.hp>=this.state.player.maxHp*.55?1:0);
    if(!log.echoesPacified.includes(entity.reactorSiteId))log.echoesPacified.push(entity.reactorSiteId);
    this.state.stats.kills++;
    const p=this.state.player;
    p.biomass+=24+rating*6;
    p.nutrition=Math.min(100,p.nutrition+22+rating*4);
    this._gainMutationEnergy(10+rating*4);
    this._awardMilestone(`echo:${entity.reactorSiteId}`,1);
    this._emit('echoPacified',`${entity.name}已脱离反应堆：${source}完成 · 追猎评级 ${rating} / 3 · 反应堆入口重新暴露。`,{
      entityId:entity.id,reactorSiteId:entity.reactorSiteId,echoKind:entity.echoKind,x:entity.x,y:entity.y,z:entity.z,rating,precision,huntTime,
    });
    return true;
  }

  _updateHumanPatrol(dt) {
    const p=this.state.player,previousTime=this.state.time-dt,currentTime=this.state.time;
    if(p.y<WATER_SURFACE_Y-9||p.attachment||this.playerOnLand)return;
    for(const boat of humanBoatStates(this.state.world,currentTime)) {
      const distanceToBoat=Math.hypot(p.x-boat.x,p.y-boat.y,p.z-boat.z);
      let sonarHit=false;
      if(crossedSonarPhase(previousTime,currentTime,boat.offset,HUMAN_SONAR_WARNING)&&distanceToBoat<(boat.index===0?74:62)) {
        this._emit('sonarWarning','灰屿巡逻船正在扫描海面：下潜、躲到岩体后，或附着宿主隐藏',{
          x:boat.x,y:boat.y,z:boat.z,index:boat.index,
        });
      }
      if(crossedSonarPhase(previousTime,currentTime,boat.offset,HUMAN_SONAR_PULSE)&&distanceToBoat<(boat.index===0?43:35)) {
        sonarHit=true;
        p.energy=Math.max(0,p.energy-10);
        p.y=Math.max(3,p.y-2.4);p.vy=Math.min(p.vy||0,-4);
        this._damage(5+boat.index*1.5,'灰屿巡逻船声呐冲击');
        this._emit('sonarPulse','声呐冲击将你压向深处；离开船体下方或潜入无光层',{
          x:boat.x,y:boat.y,z:boat.z,index:boat.index,
        });
      }
      const wakeX=Math.sin(boat.heading),wakeZ=Math.cos(boat.heading);
      const relX=p.x-boat.x,relZ=p.z-boat.z;
      const along=relX*wakeX+relZ*wakeZ,lateral=Math.abs(relX*wakeZ-relZ*wakeX);
      const wakeStart=boat.index===0?12:7;
      const wakeEnd=boat.index===0?53:39;
      const wakeWidth=boat.index===0?5.2:4;
      const inWake=!sonarHit&&along>wakeStart&&along<wakeEnd&&lateral<wakeWidth&&p.y>WATER_SURFACE_Y-2.2;
      if(inWake) {
        p.vx+=wakeX*120*dt;p.vz+=wakeZ*120*dt;
        if(!this.wakeContacts.has(boat.index)) {
          this.wakeContacts.add(boat.index);
          this._emit('wakeCatch','抓住巡逻船尾流：保持在海面可快速移动，但留意下一次声呐预警',{index:boat.index,x:boat.x,y:boat.y,z:boat.z});
        }
      } else this.wakeContacts.delete(boat.index);
    }
  }

  _interact() {
    const p = this.state.player;
    if (p.attachment) { this._detach('主动脱离'); return; }
    const target = interactionTarget(this.state);
    if (!target || !target.canAttach) {
      this._emit('interaction', target?.hint || '靠近菌膜、宿主或反应堆前方入口，再按 G 附着');
      return;
    }
    const entity = this.state.entities.find(e => e.id === target.entityId);
    if(target.kind==='echo') {
      this._disruptEcho(entity);
      return;
    }
    // 宿主的适应进度记在它自己身上：被甩下来再追回去，进度还在。
    p.attachment = {
      entityId: entity.id, kind: target.kind, progress: target.progress,
      elapsed: target.kind === 'host' ? (entity.adaptElapsed || 0) : 0,
      travelled: target.kind === 'host' ? (entity.adaptTravelled || 0) : 0,
      startZone: zoneFor(p.y).id, lastX: entity.x, lastY: entity.y, lastZ: entity.z,
    };
    p.vx = 0; p.vy = 0; p.vz = 0;
    this._emit('attach', `附着${target.name} · 按空格可随时脱离`, { kind: target.kind, entityId: entity.id });
  }

  _detach(reason) {
    const p = this.state.player;
    if (!p.attachment) return false;
    const attachment = p.attachment;
    p.attachment = null;
    p.vx = 0; p.vy = 0; p.vz = 0;
    this._emit('detach', reason, { kind: attachment.kind, entityId: attachment.entityId });
    return true;
  }

  _awardMilestone(id, levels) {
    const log = this.state.expedition;
    if (log.milestones.includes(id)) return false;
    log.milestones.push(id);
    const p = this.state.player;
    for (let index = 0; index < levels && p.level < MAX_LEVEL; index++) { p.xp += p.xpNext; this._checkLevel(); }
    this._emit('milestone', '新的生态经历促成身体发育；形态仍由随机演化决定', { milestone: id, level: p.level });
    return true;
  }

  _updateReactors(dt) {
    const p = this.state.player;
    for (const entity of this.state.entities) if (entity.type === 'reactor') {
      if (entity.status === 'shutdown') { entity.pollution = 0; continue; }
      const site = REACTOR_SITES.find(candidate => candidate.id === entity.siteId);
      const cycle = reactorPhase(this.state.time, site.offset);
      const changed = entity.phase !== cycle.phase;
      entity.phase = cycle.phase; entity.phaseRemaining = cycle.remaining;
      entity.pollution = cycle.phase === 'discharge' ? 1 : cycle.phase === 'warning' ? 0.55 : 0.2;
      if (changed && cycle.phase === 'warning' && distance(p, entity) < 36) this._emit('reactorWarning', `${entity.name}正在蓄压：立刻脱离并离开排放区`, { entityId: entity.id });
    }
    const dose = exposureAt(this.state.entities, p) * dt;
    if (dose > 0) {
      p.radiation = clamp(p.radiation + dose * 1.5 / (1 + p.branches.radiation * 0.25), 0, 100);
      this._gainMutationEnergy(dose * 0.8);
    }
  }

  _updateAttachment(dt) {
    const p = this.state.player, a = p.attachment;
    if (!a) return;
    const entity = this.state.entities.find(e => e.id === a.entityId && !e.dead && e.hp > 0);
    if (!entity) { this._detach('附着对象已消失，重新进入海流'); return; }
    // A moving host can still be pushed by schooling, pursuit or a coarse
    // collision proxy. Detach before the camera and body alternate between
    // valid and blocked frames, which produced the visible attachment flicker.
    if(a.kind==='host'&&entity.type!=='diver'&&wildlifeSpaceBlocked(this.state,entity,entity.x,entity.y,entity.z)) {
      this._detach(`${entity.name||SPECIES[entity.type]?.name||'宿主'}擦过复杂结构，附着被迫解除`);
      return;
    }
    const previous = { x: p.x, y: p.y, z: p.z };
    const point = interactionPosition(entity);
    p.x = point.x; p.y = clamp(point.y, 3, PLAYER_MAX_Y); p.z = point.z;
    const planar = Math.hypot(p.x, p.z);
    if (planar > this.state.world.radius) { p.x *= this.state.world.radius / planar; p.z *= this.state.world.radius / planar; }
    p.vx = 0; p.vy = 0; p.vz = 0;
    this.state.stats.distance += distance(previous, p);
    p.depth = depthFor(p.y); p.zone = zoneFor(p.y).id; p.lightBonus = p.branches.symbiosis >= 2 && p.y > 40;
    a.elapsed += dt;
    if (a.kind === 'biofilm') {
      p.nutrition = Math.min(100, p.nutrition + dt * (entity.depleted ? 1.1 : 5));
      if (!entity.depleted) {
        entity.progress = Math.min(1, entity.progress + dt / INTERACTION_RULES.biofilmSeconds);
        a.progress = entity.progress;
        // 稳定期：菌落的甜味会招来捕食者。玩家必须选择硬撑还是脱离。
        // 只来一只，而且从远处赶来 —— 这是警告，不是死刑。
        if (entity.progress >= INTERACTION_RULES.biofilmGatherAt && !entity.gathered) {
          entity.gathered = true;
          const angle = this.random() * Math.PI * 2;
          this._entity('predator', entity.x + Math.cos(angle) * 20, entity.y + 1.5, entity.z + Math.sin(angle) * 20,
            1.25, 38, { speed: 4.3, damage: 7, attackTime: 0, striking: false, attackWindup: 0 });
          this._emit('biofilmGather', '菌落的甜味招来了捕食者：硬撑到消化完成，或者现在脱离', {
            entityId: entity.id, x: entity.x, y: entity.y, z: entity.z,
          });
        }
        if (entity.progress >= 1 - 1e-8) {
          entity.progress = 1; entity.depleted = true;
          this.state.expedition.biofilms.push(entity.siteId);
          this._awardMilestone(`biofilm:${entity.siteId}`, 2);
          this._emit('biofilmComplete', `${entity.name}消化完成：营养交换形成新的协作结构`, { entityId: entity.id });
          // 菌膜教你的是共生型的本能。与猎杀路线不同，这是另一条能力来源。
          this._grantRandomInstinct(SYMBIOSIS_INSTINCTS, '菌膜共生', 0.6);
          this._detach('菌膜适应完成，寻找可搭乘的宿主');
        }
      }
    } else if (a.kind === 'host') {
      a.travelled += Math.hypot(entity.x - a.lastX, entity.y - a.lastY, entity.z - a.lastZ);
      a.lastX = entity.x; a.lastY = entity.y; a.lastZ = entity.z;
      entity.adaptElapsed = a.elapsed;
      entity.adaptTravelled = a.travelled;
      a.progress = Math.min(1, a.elapsed / INTERACTION_RULES.hostSeconds, a.travelled / INTERACTION_RULES.hostDistance);
      p.nutrition = Math.min(100, p.nutrition + dt * 0.25);
      // 宿主受惊会狂奔，可能把你甩下来。搭便车不是零风险的。
      // 但只有"确实在狂奔"的宿主才会甩下你 —— 平稳巡游的鲸不会。
      const nearbyThreat = this.state.entities.find(other =>
        (other.type === 'predator' || other.type === 'drone') &&
        !other.dead &&
        Math.hypot(other.x - entity.x, other.y - entity.y, other.z - entity.z) < 8);
      // 只有会慌的宿主才会甩下你。鲸与潜水员不会因为旁边有猎手就狂奔逃命。
      const panickingHosts = entity.type === 'fish' || entity.type === 'turtle';
      const thrashing = Boolean(nearbyThreat) && panickingHosts;
      if (thrashing) {
        a.shakeRisk = (a.shakeRisk || 0) + dt;
        if (a.shakeRisk >= 3) {
          a.shakeRisk = 0;
          this._detach('宿主受惊狂奔，你被甩了下来');
          this._emit('hostShaken', '宿主受惊狂奔把你甩了下来：进度保留，但要重新追上它', { entityId: entity.id });
          return;
        }
      } else {
        a.shakeRisk = Math.max(0, (a.shakeRisk || 0) - dt * .5);
      }
      if (a.progress >= 1 && !this.state.expedition.hostAdaptations.includes(entity.type)) {
        const first = !this.state.expedition.hostAdaptations.length;
        this.state.expedition.hostAdaptations.push(entity.type);
        this._awardMilestone(`host:${entity.type}`, first ? 2 : 1);
        this._emit('hostAdaptation', entity.type==='diver' ? '潜水服的神经接口已被接管：寄生路线开启，灰屿中继已显现' : `随${SPECIES[entity.type].name}迁移，完成新的共生适应`, { entityId: entity.id, kind: entity.type, parasiteUnlocked: entity.type==='diver' });
        if(entity.type==='diver')this._detach('神经链路建立，寻找灰屿中继');
      }
    } else if (a.kind === 'infection') {
      if (entity.disabled) { this._detach('神经中继已被接管'); return; }
      p.energy = Math.max(0, p.energy - dt * 1.4);
      entity.progress = Math.min(1, entity.progress + dt / INTERACTION_RULES.infectionSeconds);
      a.progress = entity.progress;
      // 灰屿的电网会反击：进度被切断，但不必从头再来。
      if (entity.progress >= INTERACTION_RULES.infectionSurgeAt && !entity.surged) {
        entity.surged = true;
        entity.progress = 0.4;
        a.progress = 0.4;
        this._damage(9, '灰屿的电网切断了你的接入', false);
        this._emit('infectionSurge', '灰屿的电网切断了接入：重新维持连接，它还会再反击一次', {
          entityId: entity.id, siteId: entity.siteId, x: entity.x, y: entity.y, z: entity.z,
        });
      }
      if (entity.progress >= 1 - 1e-8) {
        entity.progress = 1; entity.disabled = true;
        if (!this.state.expedition.parasiteNodes.includes(entity.siteId)) this.state.expedition.parasiteNodes.push(entity.siteId);
        this._awardMilestone(`parasite:${entity.siteId}`, 1);
        this._emit('parasiteNode', `${entity.name}神经中继接管完成`, { entityId: entity.id, siteId: entity.siteId, count: this.state.expedition.parasiteNodes.length });
        this._detach('神经信号转移至下一处中继');
        if (this.state.expedition.parasiteNodes.length === PARASITE_SITE_DEFS.length) this._completeParasiteEnding();
      }
    } else if (a.kind === 'reactor') {
      if (entity.status === 'shutdown') { this._detach('反应堆已停机'); return; }
      p.nutrition = Math.max(0, p.nutrition - dt * 0.7);
      if (entity.phase === 'cooldown') {
        entity.progress = Math.min(1, entity.progress + dt / INTERACTION_RULES.reactorSeconds);
        a.progress = entity.progress;
        // 压制期：维护无人机会来打断入侵。玩家得先把它处理掉。
        if (entity.progress >= INTERACTION_RULES.reactorCounterAt && !entity.countered) {
          entity.countered = true;
          const angle = this.random() * Math.PI * 2;
          this._entity('drone', entity.x + Math.cos(angle) * 11, entity.y + 3, entity.z + Math.sin(angle) * 11,
            1.5, 75, { speed: 6.2, damage: 12, attackTime: 0, striking: false, attackWindup: 0 });
          this._emit('reactorCounter', '维护无人机遇上了你的管线：先把它撕开', {
            entityId: entity.id, x: entity.x, y: entity.y, z: entity.z,
          });
        }
        if (entity.progress >= 1 - 1e-8) {
          entity.progress = 1; entity.status = 'shutdown'; entity.phase = 'shutdown'; entity.phaseRemaining = 0; entity.pollution = 0;
          this.state.expedition.shutdowns.push(entity.siteId);
          this._awardMilestone(`reactor:${entity.siteId}`, 2);
          this._emit('reactorShutdown', `${entity.name}停机，附近不再产生新的辐射暴露`, { entityId: entity.id, siteId: entity.siteId });
          this._detach('侵入完成，离开反应堆');
          if (this.state.expedition.shutdowns.length === REACTOR_SITES.length) this._emit('coreUnsealed', '三座反应堆停止供能，北方排放核心的屏障已消失');
        }
      } else if (entity.phase === 'discharge') {
        entity.progress = Math.max(0, entity.progress - dt * 0.035); a.progress = entity.progress;
        this._damage(16 * dt, '附着在正在排放的反应堆上', false);
      }
    }
  }

  _completeParasiteEnding() {
    if (this.state.mode !== 'playing') return;
    this.state.ending = 'parasite';
    this.state.oceanOutcome = classifyOutcome(oceanBalance(this));
    this.state.mode = 'won';
    this.state.player.radiation = 0;
    this._emit('parasiteNetwork', '灰屿三处神经中继同时苏醒，人类设施停止了向海洋排放', { ending: 'parasite' });
    this._emit('win', '岛屿没有被撕碎：它开始以新的神经节奏呼吸。');
  }

  _applyRandomEvolution() {
    const p = this.state.player;
    const available = BRANCHES.filter(branch => p.branches[branch.id] < 4);
    if (!available.length) return;
    const branch = available[Math.floor(this.random() * available.length)];
    const oldHp = p.maxHp;
    p.branches[branch.id]++;
    derived(p);
    p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldHp) + p.maxHp * 0.24);
    p.energy = p.maxEnergy;
    this.state.stats.evolutions++;
    this._emit('evolution', `自然演化：${branch.upgrades[p.branches[branch.id] - 1].name}`, { branch: branch.id, rank: p.branches[branch.id], automatic: true });
  }

  _gainMutationEnergy(amount) {
    if (!finite(amount) || amount <= 0) return 0;
    const p = this.state.player;
    const gain = Math.min(amount, 300);
    p.mutationEnergy += gain;
    this._resolveMutations();
    return gain;
  }

  _resolveMutations() {
    const p = this.state.player;
    while (p.mutationEnergy >= MUTATION_RULES.energyThreshold) {
      p.mutationEnergy -= MUTATION_RULES.energyThreshold;
      const available = MUTATIONS.filter(mutation => p.mutations[mutation.id] < 2);
      const succeeds = this.random() < MUTATION_RULES.successChance;
      let outcome = available.length ? 'adaptation' : 'saturated';
      let mutation = null;
      let rank = 0;
      if (available.length && succeeds) {
        const selected = available[Math.floor(this.random() * available.length)];
        mutation = selected.id;
        rank = ++p.mutations[mutation];
        derived(p);
        outcome = 'mutation';
        this._emit('mutation', `随机异变：${selected.upgrades[rank - 1].name}`, { mutation, rank, automatic: true });
        if (selected.instinct) this._unlockInstinct(selected.instinct, '辐射响应');
        if (mutation === 'parasitism' && rank === 1) {
          this._emit('parasiteAwakened', '神经拟态原基已随机表达：现在可以尝试附着人类潜水员并接管岛屿神经中继。', { mutation, rank });
        }
      }
      const entry = { sequence: ++p.mutationEvents, time: this.state.time, outcome, mutation, rank };
      p.mutationHistory.push(entry);
      if (p.mutationHistory.length > MUTATION_RULES.maxHistory) p.mutationHistory.shift();
      this._emit('mutationOutcome', outcome === 'mutation' ? '辐射触发新的随机结构' : outcome === 'saturated' ? '结构已饱和，辐射暴露未产生新器官' : '本次辐射适应未产生新器官', { ...entry, chance: MUTATION_RULES.successChance });
    }
  }

  serialize() {
    return JSON.parse(JSON.stringify({ version: 10, state: this.state, nextId: this.nextId, spawnTimer: this.spawnTimer, rngState: this.rngState, bloomSerial: this.bloomSerial, bloomRespawnAt: this.bloomRespawnAt }));
  }

  restore(save) {
    // Reject malformed values before touching the current run, including infinities,
    // duplicate IDs, impossible progression and an unbounded entity allocation.
    try {
      if (!save || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(save.version) || !save.state || typeof save.state !== 'object') return false;
      const migrate = save.version === 1;
      const legacyMutations = save.version < 3;
      const legacyRandom = save.version < 4;
      const legacyExpedition = save.version < 5;
      const legacyWorld = save.version < 6;
      const legacyParasite = save.version < 7;
      const legacyGenes = save.version < 8;
      const legacyBloom = save.version < 9;
      const legacyInstincts = save.version < 10;
      const legacyEchoes = !Array.isArray(save.state?.expedition?.echoesPacified) ||
        !Array.isArray(save.state?.entities) ||
        !save.state.entities.some(entity=>entity.type==='echo');
      if (legacyExpedition) {
        save = JSON.parse(JSON.stringify(save));
        if (!save.state.player || !Array.isArray(save.state.entities)) return false;
        save.state.player.attachment = null;
        save.state.expedition = initialExpedition();
        save.state.expedition.legacyLevels = Math.max(0, save.state.player.level - 1);
        // Do not import guessed facility records from pre-expedition saves.
        save.state.entities = save.state.entities.filter(entity => !['reactor', 'biofilm', 'vent', 'echo'].includes(entity.type));
        for (const entity of save.state.entities) if (entity.type === 'fish' || entity.type === 'shark') { entity.variant = 'normal'; entity.exposure = 0; }
        if (save.state.mode === 'won') {
          save.state.expedition.shutdowns = REACTOR_SITES.map(site => site.id);
          save.state.expedition.echoesPacified = REACTOR_SITES.map(site => site.id);
          save.state.expedition.milestones = REACTOR_SITES.map(site => `reactor:${site.id}`);
        }
      }
      if (legacyRandom) {
        save = JSON.parse(JSON.stringify(save));
        // Legacy saves get the same PRNG seed on every import, so a pending
        // random outcome cannot be rerolled by repeatedly reopening that save.
        let hash = 2166136261;
        for (const character of JSON.stringify(save.state)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
        save.rngState = hash;
        if (!save.state.player) return false;
        save.state.player.mutationEvents = 0;
        save.state.player.mutationHistory = [];
      }
      if (legacyMutations) {
        save = JSON.parse(JSON.stringify(save));
        const oldPlayer = save.state.player;
        if (!oldPlayer || !oldPlayer.branches) return false;
        oldPlayer.mutationEnergy = 0;
        oldPlayer.mutations = initialMutations();
        oldPlayer.radiationTolerance = Math.min(98, 62 + oldPlayer.branches.radiation * 7);
        oldPlayer.senseRadius = 32;
      }
      if (migrate) {
        const oldPlayer = save.state.player;
        if (!oldPlayer || !finite(oldPlayer.y) || !oldPlayer.branches) return false;
        oldPlayer.nutrition = 85;
        oldPlayer.lifeStage = lifeStageFor(oldPlayer.level);
        oldPlayer.depth = depthFor(oldPlayer.y);
        oldPlayer.zone = zoneFor(oldPlayer.y).id;
        oldPlayer.lightBonus = oldPlayer.branches.symbiosis >= 2 && oldPlayer.y > 40;
        save.state.ecology = { encounters: [], predations: 0 };
      }
      if (legacyWorld) {
        save = JSON.parse(JSON.stringify(save));
        if (!save.state.player || !Array.isArray(save.state.entities)) return false;
        save.state.world = createLegacyWorld(save.rngState);
        save.state.entities = save.state.entities.filter(entity => !['diver', 'islandNode'].includes(entity.type));
        Object.assign(save.state.player, { assimilations: initialAssimilations(), assimilationHistory: [], ingestedPreyIds: [] });
        // Existing food remains nutritious but has no verifiable donor identity.
        for (const entity of save.state.entities) {
          delete entity.sourceType; delete entity.sourceId; delete entity.sourceY;
          if (entity.type === 'boss') entity.weakened = false;
        }
        const oldPlayer = save.state.player;
        const normalizedLegacy = { ...oldPlayer };
        const host = save.state.entities.find(e => e.id === oldPlayer.attachment?.entityId);
        derived(normalizedLegacy, host?.type);
        for (const key of ['size', 'armor', 'senseRadius', 'depthStress', 'diveSupport', 'apex']) oldPlayer[key] = normalizedLegacy[key];
      }
      if (legacyGenes) {
        save = JSON.parse(JSON.stringify(save));
        const oldPlayer = save.state.player;
        if (!oldPlayer || !oldPlayer.mutations || Array.isArray(oldPlayer.mutations) || !save.state.world) return false;
        oldPlayer.mutations.parasitism ??= 0;
        const adaptedToDiver = save.state.expedition?.hostAdaptations?.includes('diver');
        const attachedToDiver = save.state.entities?.find(entity => entity.id === oldPlayer.attachment?.entityId)?.type === 'diver';
        oldPlayer.innateParasitism = Boolean(adaptedToDiver || attachedToDiver || innateParasitismForSeed(save.state.world.seed));
        oldPlayer.parasiteCapability = Boolean(oldPlayer.innateParasitism || oldPlayer.mutations.parasitism > 0);
      }
      if (legacyBloom) {
        save = JSON.parse(JSON.stringify(save));
        save.bloomSerial = 0;
        save.bloomRespawnAt = 0;
      }
      if (legacyInstincts) {
        save = JSON.parse(JSON.stringify(save));
        const oldPlayer = save.state?.player;
        if (!oldPlayer || !oldPlayer.cooldowns) return false;
        oldPlayer.instincts = initialInstincts();
        oldPlayer.instinctLog = [];
        oldPlayer.facing = { x: 0, y: 0, z: -1 };
        oldPlayer.biteWindup = 0;
        oldPlayer.biteDirection = null;
        oldPlayer.mimicActive = false;
        oldPlayer.scanActive = false;
        oldPlayer.panic = 0;
        oldPlayer.dashHits = [];
        oldPlayer.jetTime = 0;
        oldPlayer.jetDir = { x: 0, y: 0, z: -1 };
        oldPlayer.jetSpeed = 0;
        oldPlayer.overload = 0;
        oldPlayer.overloadBurst = 0;
        if (save.state.stats && save.state.stats.preyKills === undefined) save.state.stats.preyKills = 0;
        if (!save.state.ecology || !save.state.ecology.killsBySpecies) save.state.ecology.killsBySpecies = {};
        save.state.oceanBalance = oceanBalance(save.state);
        save.state.oceanOutcome = save.state.ending ? classifyOutcome(oceanBalance(save.state)) : null;
        oldPlayer.cooldowns.bite = 0;
        oldPlayer.cooldowns.jet = 0;
        for (const entity of save.state.entities || []) {
          if (entity && entity.type === 'echo' && !Number.isFinite(entity.phaseLock)) entity.phaseLock = 0;
        }
      }
      if (legacyParasite) {
        save = JSON.parse(JSON.stringify(save));
        if (!save.state.expedition || !Array.isArray(save.state.expedition.parasiteNodes)) {
          if (!save.state.expedition) return false;
          save.state.expedition.parasiteNodes = [];
        }
        if (save.state.ending === undefined) save.state.ending = save.state.mode === 'won' ? 'apex' : null;
      }
      if (!Array.isArray(save.state.expedition?.echoesPacified)||!Array.isArray(save.state.expedition?.echoEncounters)) {
        save = JSON.parse(JSON.stringify(save));
        if (!save.state.expedition) return false;
        save.state.expedition.echoesPacified=Array.isArray(save.state.expedition.echoesPacified)
          ?save.state.expedition.echoesPacified
          :[...(save.state.expedition.shutdowns||[])];
        save.state.expedition.echoEncounters=Array.isArray(save.state.expedition.echoEncounters)
          ?save.state.expedition.echoEncounters
          :[];
        for(const reactorId of save.state.expedition.echoesPacified) {
          const milestone=`echo:${reactorId}`;
          if(!save.state.expedition.milestones.includes(milestone))save.state.expedition.milestones.push(milestone);
        }
      }
      if(Array.isArray(save.state.entities)&&save.state.entities.some(entity=>entity.type==='echo'&&(!Number.isInteger(entity.precisionHits)||!Number.isInteger(entity.forceHits)))) {
        save=JSON.parse(JSON.stringify(save));
        for(const echo of save.state.entities)if(echo.type==='echo') {
          echo.engagedAt=Number.isFinite(echo.engagedAt)?echo.engagedAt:0;
          echo.precisionHits=Number.isInteger(echo.precisionHits)?echo.precisionHits:0;
          echo.forceHits=Number.isInteger(echo.forceHits)?echo.forceHits:0;
        }
      }
      const source = save.state;
      const p = source.player;
      const world = source.world;
      if (!world || !Number.isInteger(world.seed) || world.seed < 0 || world.seed > 4294967295 || world.legacy !== undefined && world.legacy !== true) return false;
      const expectedWorld = world.legacy ? createLegacyWorld(world.seed) : createWorld(world.seed);
      if (JSON.stringify(world) !== JSON.stringify(expectedWorld)) return false;
      const pendingEvolution = legacyRandom && source.mode === 'evolving';
      if ((!MODES.has(source.mode) && !pendingEvolution) || !finite(source.time) || source.time < 0 || !p) return false;
      if (![null, 'apex', 'parasite'].includes(source.ending) || (source.mode === 'won') !== (source.ending !== null)) return false;
      if (source.oceanOutcome !== undefined && source.oceanOutcome !== null && !Object.values(OCEAN_OUTCOME).includes(source.oceanOutcome)) return false;
      if (source.oceanOutcome !== undefined && source.oceanOutcome !== null && source.ending === null) return false;
      if (!finite(source.oceanBalance) || source.oceanBalance < -100 || source.oceanBalance > 100) return false;
      const restoredGround = finite(p.x) && finite(p.z) ? islandSurfaceAt(world, p.x, p.z) : null;
      const restoredSurfaceLimit = Math.max(PLAYER_MAX_Y, (restoredGround ?? -Infinity) + .65);
      if (finite(p.y) && p.y > restoredSurfaceLimit) {
        // Early surface builds could save a cell a few units above open water.
        // Recover that state by placing it just below the water plane.
        const recoverable = restoredGround === null ? p.y <= WATER_SURFACE_Y + 3 : p.y <= restoredGround + 3;
        if (!recoverable) return false;
        p.y = restoredGround === null ? PLAYER_MAX_Y : restoredGround + .18;
        p.vy = Math.min(0, p.vy || 0);
        p.depth = depthFor(p.y);
        p.zone = zoneFor(p.y).id;
        p.lightBonus = p.branches?.symbiosis >= 2 && p.y > 40;
      }
      if (!Number.isInteger(p.level) || p.level < 1 || p.level > MAX_LEVEL || source.stage !== stageForLevel(p.level)) return false;
      if (source.ending === 'apex' && source.stage !== 3) return false;
      if (!p.branches || !p.cooldowns || !Array.isArray(source.entities) || source.entities.length > MAX_ENTITIES) return false;
      for (const key of ['devour', 'radiation', 'symbiosis']) {
        if (!Number.isInteger(p.branches[key]) || p.branches[key] < 0 || p.branches[key] > 4) return false;
      }
      if (typeof p.innateParasitism !== 'boolean' || typeof p.parasiteCapability !== 'boolean') return false;
      if (!finite(p.mutationEnergy) || p.mutationEnergy < 0 || (legacyRandom ? p.mutationEnergy > 300 : p.mutationEnergy >= MUTATION_RULES.energyThreshold) || !p.mutations || Array.isArray(p.mutations) || Object.keys(p.mutations).length !== MUTATIONS.length) return false;
      for (const mutation of MUTATIONS) {
        const rank = p.mutations[mutation.id];
        if (!Object.hasOwn(p.mutations, mutation.id) || !Number.isInteger(rank) || rank < 0 || rank > 2) return false;
      }
      if (!p.assimilations || Array.isArray(p.assimilations) || Object.keys(p.assimilations).length !== ASSIMILATIONS.length) return false;
      if (!Array.isArray(p.assimilationHistory) || !Array.isArray(p.ingestedPreyIds) || p.assimilationHistory.length > MAX_ASSIMILATION_RECORDS || p.ingestedPreyIds.length !== p.assimilationHistory.length || new Set(p.ingestedPreyIds).size !== p.ingestedPreyIds.length) return false;
      const assimilationRanks = initialAssimilations();
      let assimilationTime = -1;
      for (const [index, record] of p.assimilationHistory.entries()) {
        if (!record || !Number.isInteger(record.sourceId) || record.sourceId <= 0 || record.sourceId >= save.nextId || record.sourceId !== p.ingestedPreyIds[index] || !WILDLIFE.has(record.sourceType) || !finite(record.sourceY) || record.sourceY < -3 || record.sourceY > PLAYER_MAX_Y || typeof record.success !== 'boolean' || !finite(record.time) || record.time < assimilationTime || record.time > source.time) return false;
        const candidates = assimilationCandidates(record.sourceType, assimilationRanks, record.sourceY);
        if (record.trait === null ? candidates.length !== 0 || record.success : !candidates.some(trait => trait.id === record.trait)) return false;
        if (record.success) assimilationRanks[record.trait]++;
        assimilationTime = record.time;
      }
      for (const trait of ASSIMILATIONS) if (!Number.isInteger(p.assimilations[trait.id]) || p.assimilations[trait.id] !== assimilationRanks[trait.id]) return false;
      const rankTotal = p.branches.devour + p.branches.radiation + p.branches.symbiosis;
      if (rankTotal !== p.level - (pendingEvolution ? 2 : 1)) return false;
      if (!Number.isSafeInteger(p.mutationEvents) || p.mutationEvents < 0 || !Array.isArray(p.mutationHistory) || p.mutationHistory.length !== Math.min(p.mutationEvents, MUTATION_RULES.maxHistory)) return false;
      let previousTime = -1;
      for (const [index, entry] of p.mutationHistory.entries()) {
        if (!entry || entry.sequence !== p.mutationEvents - p.mutationHistory.length + index + 1 || !finite(entry.time) || entry.time < previousTime || entry.time > source.time || !['mutation', 'adaptation', 'saturated'].includes(entry.outcome)) return false;
        if (entry.outcome === 'mutation' ? !MUTATIONS.some(mutation => mutation.id === entry.mutation) || !Number.isInteger(entry.rank) || entry.rank < 1 || entry.rank > p.mutations[entry.mutation] : entry.mutation !== null || entry.rank !== 0) return false;
        previousTime = entry.time;
      }
      for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'hp', 'maxHp', 'energy', 'maxEnergy', 'radiation', 'biomass', 'xp', 'xpNext', 'speed', 'size', 'damage', 'armor', 'regen', 'dashTime', 'feedTime', 'hurtTime']) {
        if (!finite(p[key])) return false;
      }
      const savedIslandGround=islandSurfaceAt(world,p.x,p.z);
      const savedMaxY=Math.max(PLAYER_MAX_Y,(savedIslandGround??-Infinity)+.65);
      if (Math.hypot(p.x, p.z) > world.radius + 0.01 || p.y < 3 || p.y > savedMaxY || Math.hypot(p.vx, p.vy, p.vz) > 100) return false;
      if (p.hp < 0 || p.hp > p.maxHp || p.energy < 0 || p.energy > p.maxEnergy || p.radiation < 0 || p.radiation > 100 || p.xp < 0 || p.biomass < 0 || p.xpNext !== xpForLevel(p.level)) return false;
      if (!finite(p.nutrition) || p.nutrition < 0 || p.nutrition > 100 || p.lifeStage !== lifeStageFor(p.level) || p.depth !== depthFor(p.y) || p.zone !== zoneFor(p.y).id || p.lightBonus !== (p.branches.symbiosis >= 2 && p.y > 40)) return false;
      if (source.mode === 'dead' ? p.hp !== 0 : p.hp <= 0) return false;
      for (const key of ['dash', 'pulse', 'feed', 'bite', 'jet']) if (!finite(p.cooldowns[key]) || p.cooldowns[key] < 0 || p.cooldowns[key] > 10) return false;
      if (!p.instincts || Array.isArray(p.instincts) || Object.keys(p.instincts).length !== INSTINCTS.length) return false;
      for (const instinct of INSTINCTS) {
        const rank = p.instincts[instinct.id];
        if (!Number.isInteger(rank) || rank < 0 || rank > 2) return false;
      }
      if (!Array.isArray(p.instinctLog) || p.instinctLog.length > 24) return false;
      if (!p.facing || !finite(p.facing.x) || !finite(p.facing.y) || !finite(p.facing.z)) return false;
      if (!finite(p.biteWindup) || p.biteWindup < 0 || p.biteWindup > 1) return false;
      if (typeof p.mimicActive !== 'boolean' || typeof p.scanActive !== 'boolean') return false;
      if (!finite(p.panic) || p.panic < 0 || p.panic > 2) return false;
      if (!Array.isArray(p.dashHits) || p.dashHits.length > 16) return false;
      if (!finite(p.jetTime) || p.jetTime < 0 || p.jetTime > 1) return false;
      if (!finite(p.overload) || p.overload < 0 || p.overload > 3) return false;
      if (!finite(p.overloadBurst) || p.overloadBurst < 0 || p.overloadBurst > 8.01) return false;
      if (p.dashTime < 0 || p.dashTime > 1 || p.feedTime < 0 || p.feedTime > 2 || p.hurtTime < 0 || p.hurtTime > 10) return false;
      const normalized = { ...p, branches: { devour: p.branches.devour, radiation: p.branches.radiation, symbiosis: p.branches.symbiosis } };
      derived(normalized, source.entities.find(e => e.id === p.attachment?.entityId)?.type);
      for (const key of ['maxHp', 'maxEnergy', 'speed', 'size', 'damage', 'armor', 'regen', 'radiationTolerance', 'senseRadius', 'depthStress']) if (!finite(p[key]) || Math.abs(normalized[key] - p[key]) > 0.00001) return false;
      if (p.apex !== normalized.apex || p.diveSupport !== normalized.diveSupport || p.parasiteCapability !== normalized.parasiteCapability) return false;
      if (!source.stats || Object.values(source.stats).some(value => !finite(value) || value < 0)) return false;
      for (const key of ['eaten', 'isotopes', 'kills', 'preyKills', 'evolutions', 'damageTaken', 'distance']) if (!finite(source.stats[key])) return false;
      if (source.stats.evolutions !== rankTotal) return false;
      if (!source.ecology || !Number.isInteger(source.ecology.predations) || source.ecology.predations < 0 || !Array.isArray(source.ecology.encounters) || source.ecology.encounters.some(type => !WILDLIFE.has(type)) || new Set(source.ecology.encounters).size !== source.ecology.encounters.length) return false;
      if (!source.ecology.killsBySpecies || typeof source.ecology.killsBySpecies !== 'object' || Array.isArray(source.ecology.killsBySpecies)) return false;
      for (const [type, killed] of Object.entries(source.ecology.killsBySpecies)) {
        if (!WILDLIFE.has(type) || !Number.isInteger(killed) || killed < 0 || killed > 10000) return false;
      }
      const expedition = source.expedition;
      if (!expedition || !Number.isInteger(expedition.legacyLevels) || expedition.legacyLevels < 0 || expedition.legacyLevels > 12) return false;
      if(expedition.humansDevoured===undefined)expedition.humansDevoured=0;
      if(!Number.isInteger(expedition.humansDevoured)||expedition.humansDevoured<0||expedition.humansDevoured>30)return false;
      const uniqueAllowed = (items, allowed) => Array.isArray(items) && items.length <= allowed.length && new Set(items).size === items.length && items.every(item => allowed.includes(item));
      if (!uniqueAllowed(expedition.biofilms, BIOFILM_SITES.map(site => site.id)) || !uniqueAllowed(expedition.shutdowns, REACTOR_SITES.map(site => site.id)) || !uniqueAllowed(expedition.hostAdaptations, HOST_TYPES) || !uniqueAllowed(expedition.parasiteNodes, PARASITE_SITE_DEFS.map(site => site.id))) return false;
      const reactorIds=REACTOR_SITES.map(site=>site.id);
      if(!uniqueAllowed(expedition.echoesPacified,reactorIds)||!uniqueAllowed(expedition.echoEncounters,reactorIds))return false;
      if(expedition.shutdowns.some(id=>!expedition.echoesPacified.includes(id)))return false;
      if (expedition.hostAdaptations.includes('diver') && !p.parasiteCapability) return false;
      if (expedition.parasiteNodes.length && (!p.parasiteCapability || !expedition.hostAdaptations.includes('diver'))) return false;
      const expectedMilestones = [
        ...expedition.biofilms.map(id => `biofilm:${id}`),
        ...expedition.hostAdaptations.map(id => `host:${id}`),
        ...expedition.echoesPacified.map(id => `echo:${id}`),
        ...expedition.shutdowns.map(id => `reactor:${id}`),
        ...expedition.parasiteNodes.map(id => `parasite:${id}`),
      ];
      if (!uniqueAllowed(expedition.milestones, expectedMilestones) || expedition.milestones.length !== expectedMilestones.length) return false;
      if (source.ending === 'apex' && expedition.shutdowns.length !== REACTOR_SITES.length) return false;
      if (source.ending === 'parasite' && (expedition.parasiteNodes.length !== PARASITE_SITE_DEFS.length || !expedition.hostAdaptations.includes('diver'))) return false;
      const ids = new Set();
      const wildlifeCounts = {};
      const seenReactorIds = new Set(), filmIds = new Set(), parasiteIds = new Set(), echoIds = new Set();
      let diverCount = 0;
      let bloomCount = 0;
      let bossCount = 0;
      let tendrilCount = 0;
      for (const e of source.entities) {
        if (!e || !TYPES.has(e.type) || !Number.isInteger(e.id) || e.id <= 0 || ids.has(e.id)) return false;
        ids.add(e.id);
        for (const key of ['x', 'y', 'z', 'radius', 'hp', 'maxHp', 'seed']) if (!finite(e[key])) return false;
        if (Math.hypot(e.x, e.z) > world.radius + 15 || e.y < (e.type === 'crab' || e.type === 'marineSnow' ? -3 : 0) || e.y > (e.type === 'crab' ? 7 : 60) || e.radius <= 0 || e.radius > 12 || e.maxHp <= 0 || e.maxHp > 10000 || e.hp < 0 || e.hp > e.maxHp || e.dead) return false;
        if (e.type === 'bloom') {
          bloomCount++;
          if (bloomCount > 1 || !finite(e.age) || e.age < 0 || e.age > 60 || !finite(e.nutrient) || e.nutrient < 0 || e.nutrient > 1 || !['calm', 'unstable', 'burst'].includes(e.phase) || typeof e.feeding !== 'boolean' || typeof e.contactAnnounced !== 'boolean') return false;
          for (const key of ['originX', 'originY', 'originZ']) if (!finite(e[key])) return false;
          if (e.phase !== bloomPhase(e.age) || Math.abs(e.nutrient - bloomNutrient(e.age)) > 0.00001) return false;
          const phase = e.seed + e.age * 0.12;
          if (Math.abs(e.x - (e.originX + Math.sin(phase) * 3.6)) > 0.00001 ||
              Math.abs(e.y - (e.originY + Math.sin(phase * 1.37) * 0.8)) > 0.00001 ||
              Math.abs(e.z - (e.originZ + Math.cos(phase * 0.83) * 3.1)) > 0.00001) return false;
        }
        if (['predator', 'drone', 'boss'].includes(e.type) && (!finite(e.attackTime) || e.attackTime < 0 || e.attackTime > 10)) return false;
        if (['predator', 'drone'].includes(e.type) && (!finite(e.speed) || e.speed < 0 || e.speed > 20 || !finite(e.damage) || e.damage < 0 || e.damage > 100)) return false;
        if (e.striking !== undefined && typeof e.striking !== 'boolean') return false;
        if (e.attackWindup !== undefined && (!finite(e.attackWindup) || e.attackWindup < 0 || e.attackWindup > 5)) return false;
        if (e.type === 'diver') {
          diverCount++;
          for (const key of ['heading','vx','vy','vz','homeX','homeZ']) if (!finite(e[key])) return false;
        }
        if (e.type === 'islandNode') {
          if (!PARASITE_SITE_DEFS.some(site => site.id === e.siteId) || parasiteIds.has(e.siteId) || !finite(e.progress) || e.progress < 0 || e.progress > 1 || typeof e.disabled !== 'boolean') return false;
          parasiteIds.add(e.siteId);
          if (e.disabled !== expedition.parasiteNodes.includes(e.siteId) || (e.progress === 1) !== e.disabled) return false;
        }
        if (e.type === 'echo') {
          const definition=ABERRANT_ECHO_DEFS.find(candidate=>candidate.reactorId===e.reactorSiteId);
          if(!definition||echoIds.has(e.reactorSiteId))return false;
          echoIds.add(e.reactorSiteId);
          for(const key of ['homeX','homeY','homeZ','heading','vx','vy','vz','phaseRemaining','lastDisruptAt','engagedAt','speed','damage'])if(!finite(e[key]))return false;
          if(e.phaseLock!==undefined&&!finite(e.phaseLock))return false;
          if(!Number.isInteger(e.precisionHits)||e.precisionHits<0||!Number.isInteger(e.forceHits)||e.forceHits<0)return false;
          if(e.echoKind!==definition.echoKind||typeof e.pacified!=='boolean'||!['stalk','charge','exposed','recovery','pacified'].includes(e.phase)||e.pacified!==expedition.echoesPacified.includes(e.reactorSiteId))return false;
          if(e.pacified?(e.phase!=='pacified'||e.hp!==1):e.phase==='pacified')return false;
          if(e.phaseRemaining<0||e.phaseRemaining>ECHO_TIMING.cycle||e.speed<0||e.speed>10||e.damage<0||e.damage>50)return false;
        }
        if (e.type === 'boss') { bossCount++; if (![1, 2].includes(e.phase) || typeof e.weakened !== 'boolean' || e.weakened && e.hp !== 1 || e.hp <= 0) return false;
          if (e.motherPhase !== undefined) {
            if (!Object.values(MOTHER_PHASE).includes(e.motherPhase)) return false;
            if (!Array.isArray(e.clouds) || e.clouds.length > MOTHER_RULES.spoutClouds) return false;
            for (const cloud of e.clouds) {
              if (!cloud || !finite(cloud.x) || !finite(cloud.y) || !finite(cloud.z)) return false;
              if (!finite(cloud.radius) || cloud.radius < 0 || cloud.radius > MOTHER_RULES.cloudRadius + 1) return false;
              if (!finite(cloud.life) || cloud.life < 0 || cloud.life > 900) return false;
              if (typeof cloud.active !== 'boolean') return false;
            }
            if (typeof e.coreWindowOpen !== 'boolean') return false;
            for (const key of ['coreTimer', 'rageTimer', 'spoutTimer']) if (!finite(e[key])) return false;
          }
        }
        if (e.type === 'tendril') {
          tendrilCount++;
          if (!Number.isInteger(e.bossId) || !Number.isInteger(e.index) || e.index < 0 || e.index >= MOTHER_RULES.tendrilCount) return false;
          if (!finite(e.angle) || !finite(e.swingTime) || e.swingTime < 0 || e.swingTime > 30) return false;
          if (!['idle', 'windup', 'swing'].includes(e.state)) return false;
        }
        if (e.nutrition !== undefined && (!finite(e.nutrition) || e.nutrition <= 0 || e.nutrition > 30 || e.type !== 'marineSnow')) return false;
        if (e.sourceType !== undefined || e.sourceId !== undefined || e.sourceY !== undefined) {
          if (!WILDLIFE.has(e.sourceType) || e.type !== 'marineSnow' || !Number.isInteger(e.sourceId) || e.sourceId <= 0 || e.sourceId >= e.id || !finite(e.sourceY) || e.sourceY < -3 || e.sourceY > PLAYER_MAX_Y || source.entities.some(other => other.id === e.sourceId)) return false;
          const relatives = source.entities.filter(other => other.sourceId === e.sourceId);
          if (relatives.some(other => other.sourceType !== e.sourceType || other.sourceY !== e.sourceY)) return false;
          const record = p.assimilationHistory.find(entry => entry.sourceId === e.sourceId);
          if (record && (record.sourceType !== e.sourceType || record.sourceY !== e.sourceY)) return false;
        }
        if (e.gathered !== undefined && typeof e.gathered !== 'boolean') return false;
        if (e.adaptElapsed !== undefined && (!finite(e.adaptElapsed) || e.adaptElapsed < 0 || e.adaptElapsed > 600)) return false;
        if (e.adaptTravelled !== undefined && (!finite(e.adaptTravelled) || e.adaptTravelled < 0 || e.adaptTravelled > 10000000)) return false;
        if (e.countered !== undefined && typeof e.countered !== 'boolean') return false;
        if (e.surged !== undefined && typeof e.surged !== 'boolean') return false;
        if (e.type === 'reactor' || e.type === 'biofilm') {
          if (!finite(e.progress) || e.progress < 0 || e.progress > 1) return false;
          const sites = e.type === 'reactor' ? REACTOR_SITES : BIOFILM_SITES;
          const seen = e.type === 'reactor' ? seenReactorIds : filmIds;
          if (!sites.some(site => site.id === e.siteId) || seen.has(e.siteId)) return false;
          seen.add(e.siteId);
          if (e.type === 'reactor') {
            if (!['active', 'shutdown'].includes(e.status) || !['cooldown', 'warning', 'discharge', 'shutdown'].includes(e.phase) || !finite(e.phaseRemaining) || e.phaseRemaining < 0 || e.phaseRemaining > 12 || !finite(e.pollution) || e.pollution < 0 || e.pollution > 1) return false;
            const shutdown = expedition.shutdowns.includes(e.siteId);
            if ((e.status === 'shutdown') !== shutdown || (e.phase === 'shutdown') !== shutdown || (e.progress === 1) !== shutdown || shutdown && (e.pollution !== 0 || e.phaseRemaining !== 0)) return false;
            if (!shutdown) {
              const cycle = reactorPhase(source.time, REACTOR_SITES.find(site => site.id === e.siteId).offset);
              if (e.phase !== cycle.phase || Math.abs(e.phaseRemaining - cycle.remaining) > 0.00001 || e.pollution !== (cycle.phase === 'discharge' ? 1 : cycle.phase === 'warning' ? 0.55 : 0.2)) return false;
            }
          } else if (typeof e.depleted !== 'boolean' || e.depleted !== expedition.biofilms.includes(e.siteId) || (e.progress === 1) !== e.depleted) return false;
        }
        if (WILDLIFE.has(e.type)) {
          wildlifeCounts[e.type] = (wildlifeCounts[e.type] || 0) + 1;
          if (wildlifeCounts[e.type] > ANIMAL_COUNTS[e.type]) return false;
          for (const key of ['heading', 'vx', 'vy', 'vz', 'hunger', 'breathTime', 'attackTime', 'speed', 'damage']) if (!finite(e[key])) return false;
          if (e.hunger < 0 || e.hunger > 1 || e.breathTime < 0 || e.breathTime > 130 || e.attackTime < 0 || e.attackTime > 10 || e.speed < 0 || e.speed > 20 || e.damage < 0 || e.damage > 100 || !BEHAVIORS.has(e.behavior) || !(e.targetId === null || (Number.isInteger(e.targetId) && e.targetId >= 0))) return false;
          if (['fish', 'shark'].includes(e.type) && (!Object.hasOwn(VARIANTS, e.variant) || !finite(e.exposure) || e.exposure < 0 || e.exposure > 100)) return false;
        }
      }
      if (!legacyExpedition && (seenReactorIds.size !== REACTOR_SITES.length || filmIds.size !== BIOFILM_SITES.length)) return false;
      if (!legacyParasite && (diverCount !== 1 || parasiteIds.size !== PARASITE_SITE_DEFS.length)) return false;
      if (!legacyEchoes && echoIds.size !== REACTOR_SITES.length) return false;
      if (p.attachment !== null) {
        const attachment = p.attachment;
        if (!attachment || !Number.isInteger(attachment.entityId) || !['host', 'biofilm', 'reactor', 'infection'].includes(attachment.kind) || !finite(attachment.progress) || attachment.progress < 0 || attachment.progress > 1 || !['sunlit', 'twilight', 'midnight'].includes(attachment.startZone)) return false;
        for (const key of ['elapsed', 'travelled', 'lastX', 'lastY', 'lastZ']) if (!finite(attachment[key])) return false;
        if (attachment.elapsed < 0 || attachment.elapsed > source.time + 0.1 || attachment.travelled < 0 || attachment.travelled > 10000000 || Math.hypot(attachment.lastX, attachment.lastZ) > world.radius + 15 || attachment.lastY < -3 || attachment.lastY > 60) return false;
        const entity = source.entities.find(candidate => candidate.id === attachment.entityId);
        if (!entity || (attachment.kind === 'host' ? !HOST_TYPES.includes(entity.type) : attachment.kind === 'infection' ? entity.type !== 'islandNode' || entity.disabled : entity.type !== attachment.kind) || attachment.kind === 'reactor' && entity.status === 'shutdown') return false;
        if (attachment.kind !== 'host' && Math.abs(attachment.progress - entity.progress) > 0.00001) return false;
      }
      if (bossCount > 1 || (source.stage < 3 && bossCount !== 0) || (source.stage === 3 && !['won', 'menu'].includes(source.mode) && bossCount !== 1) || (source.ending === 'apex' && bossCount !== 0)) return false;
      if (source.ending === 'apex' && tendrilCount !== 0) return false;
      if (source.ending === 'apex' && !world.legacy && !p.apex) return false;
      if (!Number.isInteger(save.nextId) || save.nextId <= Math.max(0, ...ids) || !finite(save.spawnTimer) || save.spawnTimer < -1 || save.spawnTimer > 3) return false;
      if (!Number.isInteger(save.rngState) || save.rngState < 0 || save.rngState > 4294967295) return false;
      if (!Number.isInteger(save.bloomSerial) || save.bloomSerial < 0 || !finite(save.bloomRespawnAt) || save.bloomRespawnAt < 0) return false;
      const cloned = JSON.parse(JSON.stringify(source));
      // Earlier saves placed crabs in a swimming band. Restore them to the
      // shared terrain without consuming randomness or changing other species.
      for (const entity of cloned.entities) if (entity.type === 'crab') {
        entity.y = seabedHeight(entity.x, entity.z) + CRAB_GROUND_CLEARANCE;
        entity.vy = 0;
      }
      this.state = cloned;
      this.nextId = save.nextId;
      this.spawnTimer = save.spawnTimer;
      this.rngState = save.rngState;
      this.bloomSerial = save.bloomSerial;
      this.bloomRespawnAt = save.bloomRespawnAt;
      this.events = [];
      this.dietWarnings = new Set();
      this.wakeContacts = new Set();
      this.schoolCovered = false;
      this.playerOnLand = islandSurfaceAt(this.state.world,p.x,p.z)!==null&&p.y>WATER_SURFACE_Y-.5;
      p.onLand=this.playerOnLand;
      if (pendingEvolution) { this.state.mode = 'playing'; this._applyRandomEvolution(); }
      if (legacyRandom) this._resolveMutations();
      if (legacyRandom) this._seedEcology();
      if (legacyExpedition) {
        const preservedRng = this.rngState;
        this._seedExpedition();
        this.rngState = preservedRng;
      }
      const echoRng=this.rngState;
      this._seedEchoes();
      this.rngState=echoRng;
      const parasiteRng=this.rngState;
      this._seedParasiteNetwork();
      this.rngState=parasiteRng;
      this._emit('restore', '记忆重连，异化继续。');
      return true;
    } catch {
      return false;
    }
  }

  drainEvents() {
    const result = this.events;
    this.events = [];
    return result;
  }

  _emit(type, text, extra = {}) {
    this.events.push({ type, text, ...extra });
    // Consumers may leave the menu open without draining events.
    if (this.events.length > 120) this.events.splice(0, this.events.length - 120);
  }

  _entity(type, x, y, z, radius, hp, extra = {}) {
    // The core is progression-critical. Remove one disposable pickup if the
    // bounded world is full rather than allowing an unbounded allocation.
    if (this.state.entities.length >= MAX_ENTITIES) {
      const disposable = this.state.entities.findIndex(entity => entity.dead || ['food', 'marineSnow', 'isotope'].includes(entity.type));
      if (disposable >= 0) this.state.entities.splice(disposable, 1);
      else return null;
    }
    const explicitSeed=extra.seed;
    const e = { id: this.nextId++, type, x, y, z, radius, hp, maxHp: hp, seed: explicitSeed??this.random() * Math.PI * 2, ...extra };
    this.state.entities.push(e);
    return e;
  }

  _position(near = false, minDistance = 0) {
    const p = this.state.player;
    const worldRadius = this.state.world.radius;
    const angle = this.random() * Math.PI * 2;
    const radius = near ? minDistance + this.random() * (26 - minDistance) : 10 + Math.sqrt(this.random()) * (worldRadius - 22);
    let x = Math.cos(angle) * radius + (near ? p.x : 0);
    let z = Math.sin(angle) * radius + (near ? p.z : 0);
    const safe=openWaterSpawnPoint(this.state.world,x,z,this.random);
    x=safe.x;z=safe.z;
    const y = near ? clamp(p.y + (this.random() - 0.5) * 15, 4, 49) : 7 + this.random() * 38;
    return { x, y, z };
  }

  _spawnPickup(type, near = false) {
    const pos = this._position(near, near ? 5 : 0);
    if (type === 'marineSnow') pos.y = 4 + this.random() * 18;
    return this._entity(type, pos.x, pos.y, pos.z, type === 'food' ? 0.48 : type === 'marineSnow' ? 0.4 : 0.68, 1);
  }

  _seedEcology() {
    for (const [type, count] of Object.entries(ANIMAL_COUNTS)) {
      const existing = this.state.entities.filter(e => e.type === type).length;
      for (let index = existing; index < count && this.state.entities.length < MAX_ENTITIES - 12; index++) this._spawnWildlife(type, index);
    }
    const snow = this.state.entities.filter(e => e.type === 'marineSnow').length;
    for (let i = snow; i < 18 && this.state.entities.length < MAX_ENTITIES - 12; i++) this._spawnPickup('marineSnow', i < 8);
  }

  _spawnWildlife(type, index = 0) {
    if (this.state.entities.filter(entity => !entity.dead && entity.type === type).length >= ANIMAL_COUNTS[type]) return null;
    const spec = SPECIES[type];
    const pos = this._position(false);
    pos.y = spec.minY + this.random() * (spec.maxY - spec.minY);
    if (type === 'fish') {
      const school = Math.floor(index / 6);
      const angle = school / 13 * Math.PI * 2 + this.state.world.seed % 628 / 100;
      const radius = school < 4 ? 22 : (0.24 + (school - 4) / 12) * this.state.world.radius;
      pos.x = Math.cos(angle) * radius + (this.random() - 0.5) * 9;
      pos.z = Math.sin(angle) * radius + (this.random() - 0.5) * 9;
      pos.y = 24 + school % 4 * 6 + this.random() * 3;
    }
    if (index === 0) {
      if (type === 'jelly') Object.assign(pos, { x: 12, y: 28, z: -9 });
      if (type === 'shark') Object.assign(pos, { x: -24, y: 36, z: -25 });
      if (type === 'squid') Object.assign(pos, { x: -28, y: 12, z: -31 });
      if (type === 'whale') Object.assign(pos, { x: 18, y: 41, z: -25 });
      if (type === 'ray') Object.assign(pos, { x: 20, y: 12, z: -15 });
      if (type === 'turtle') Object.assign(pos, { x: -16, y: 46, z: -12 });
      if (type === 'angler') Object.assign(pos, { x: 9, y: 13, z: -22 });
      if (type === 'crab') Object.assign(pos, { x: 6, z: -14 });
      if (type === 'lanternfish') Object.assign(pos, { x: 16, y: 25, z: -28 });
      if (type === 'cuttlefish') Object.assign(pos, { x: -29, y: 24, z: 12 });
      if (type === 'oarfish') Object.assign(pos, { x: 38, y: 13, z: -39 });
    }
    // Keep several members of each depth-compatible species around the nursery
    // while the remaining population fills the wider, seeded expedition map.
    if (index > 0 && index < Math.ceil(ANIMAL_COUNTS[type] * 0.28) && type !== 'fish') {
      const nearby = this._position(true, 14);
      pos.x = nearby.x; pos.z = nearby.z;
    }
    if (type === 'lanternfish' && index > 6) {
      const reef = this.state.world.biofilmSites[index % 3];
      pos.x = reef.x + (this.random() - 0.5) * 38;
      pos.z = reef.z + (this.random() - 0.5) * 38;
    }
    const safe=openWaterSpawnPoint(this.state.world,pos.x,pos.z,this.random);
    pos.x=safe.x;pos.z=safe.z;
    for(let attempt=0;attempt<5&&outfallBlocks(this.state.world,pos.x,pos.y,pos.z,spec.radius);attempt++){
      const retry=this._position(false);
      pos.x=retry.x;pos.z=retry.z;
      pos.y=clamp(pos.y+(this.random()-.5)*16,spec.minY,spec.maxY);
    }
    if (type === 'crab') pos.y = seabedHeight(pos.x, pos.z) + CRAB_GROUND_CLEARANCE;
    const hp = { fish: 44, jelly: 75, shark: 220, squid: 260, whale: 1400, ray: 160, turtle: 150, angler: 68, crab: 48, lanternfish: 38, cuttlefish: 135, oarfish: 200 }[type];
    const speed = { fish: 4.5, jelly: 0.7, shark: 5.5, squid: 4.8, whale: 6.2, ray: 3.8, turtle: 2.8, angler: 2.2, crab: 1.2, lanternfish: 3.9, cuttlefish: 4.2, oarfish: 3.1 }[type];
    return this._entity(type, pos.x, pos.y, pos.z, spec.radius, hp, {
      heading: this.random() * Math.PI * 2, vx: 0, vy: 0, vz: 0,
      schoolId: ['fish', 'lanternfish'].includes(type) ? Math.floor(index / 6) : null,
      formationPhase: index * 2.399,
      wanderPhase: index * .731 + this.state.world.seed % 997 / 37,
      behavior: ({ fish: 'school', lanternfish: 'school', jelly: 'drift', ray: 'glide', turtle: 'graze', angler: 'ambush', crab: 'scavenge', oarfish: 'glide' })[type] || 'patrol',
      targetId: null, hunger: 0.6 + this.random() * 0.3,
      breathTime: ['whale', 'turtle'].includes(type) ? 22 + this.random() * 15 : 0,
      attackTime: 0, speed, damage: { fish: 0, jelly: 7, shark: 14, squid: 12, whale: 0, ray: 8, turtle: 0, angler: 9, crab: 3, lanternfish: 0, cuttlefish: 7, oarfish: 0 }[type],
      ...(['fish', 'shark'].includes(type) ? { variant: 'normal', exposure: 0 } : {}),
    });
  }

  _canHarm(entity) {
    if (['reactor', 'biofilm', 'diver', 'islandNode'].includes(entity.type)) return false;
    if (entity.type === 'boss' && this.state.expedition.shutdowns.length < REACTOR_SITES.length) return false;
    if (this.state.player.attachment?.entityId === entity.id) return false;
    if (entity.type === 'whale') return false;
    return !WILDLIFE.has(entity.type) || this.state.player.level >= SPECIES[entity.type].minPlayerLevel;
  }

  // 主动攻击只对"能打的东西"生效。碎屑、海洋雪和设施不是战斗目标 ——
  // 早期版本的脉冲会把玩家身边的食物直接打没，那等于在惩罚玩家进食。
  // 回声体也不在其中：它有独立的伤害通道（切断共振），不走普通血量。
  _isCombatTarget(entity) {
    if (!entity || entity.dead) return false;
    if (entity.type === 'echo') return false;
    if (entity.type === 'tendril') return this.state.expedition.shutdowns.length >= REACTOR_SITES.length;
    if (entity.type === 'boss') return this._canHarm(entity);
    if (['predator', 'drone'].includes(entity.type)) return true;
    if (WILDLIFE.has(entity.type)) return this._canHarm(entity);
    return false;
  }

  _buildEcologyIndex() {
    // One type index per simulation step avoids repeatedly scanning all debris
    // and scenery for each animal. Neighbor work is bounded by species caps.
    this.ecologyIndex = new Map();
    for (const entity of this.state.entities) {
      if (entity.dead) continue;
      if (!this.ecologyIndex.has(entity.type)) this.ecologyIndex.set(entity.type, []);
      this.ecologyIndex.get(entity.type).push(entity);
    }
    // 让模块级的碰撞检查也能用这份索引，不必遍历全部实体。
    this.state.ecologyIndex = this.ecologyIndex;
    // 小型鱼群需要提防的东西只有这几种，摊平成一个数组省掉逐个查表。
    const threats = [];
    for (const type of ['shark', 'squid', 'jelly', 'angler']) {
      const group = this.ecologyIndex.get(type);
      if (group) for (const entity of group) threats.push(entity);
    }
    this.state.threatList = threats;
  }

  _updateSchoolCover() {
    const p=this.state.player;
    let nearby=0;
    const moving=Math.hypot(p.vx||0,p.vz||0);
    for(const type of ['fish','lanternfish']) for(const fish of this.ecologyIndex.get(type)||[]) {
      if(distance(p,fish)>7.5)continue;
      if(moving>.4&&fish.vx*p.vx+fish.vz*p.vz<0)continue;
      nearby++;
      if(nearby>=3)break;
    }
    const covered=nearby>=3&&p.mutations.photophore===0&&p.dashTime<=0;
    if(covered&&!this.schoolCovered)this._emit('schoolCover','融入鱼群：保持贴身游动且不发光，大型捕食者更难锁定你',{count:nearby});
    this.schoolCovered=covered;
  }

  _updateWildlife(e, dt, playerDistance) {
    const p = this.state.player;
    const spec = SPECIES[e.type];
    if (playerDistance < p.senseRadius && !this.state.ecology.encounters.includes(e.type)) {
      this.state.ecology.encounters.push(e.type);
      this._emit('encounter', `观察到${spec.name}`, { kind: e.type });
    }
    e.attackTime = Math.max(0, e.attackTime - dt);
    e.hunger = Math.min(1, e.hunger + dt * 0.009);
    e.breathTime = Math.max(0, e.breathTime - dt);
    let target = null;
    let threat = null;
    if (e.type === 'fish' || e.type === 'shark') {
      const dose = exposureAt(this.state.entities, e);
      e.exposure = clamp((e.exposure || 0) + (dose > 0 ? dose / VARIANTS[e.variant || 'normal'].resistance : -0.35) * dt, 0, 100);
      if ((!e.variant || e.variant === 'normal') && e.exposure >= INTERACTION_RULES.exposureThreshold) {
        e.variant = ['crooked', 'armored', 'lure'][Math.floor(this.random() * 3)];
        this._emit('wildlifeMutation', `${SPECIES[e.type].name}出现${VARIANTS[e.variant].name}`, { entityId: e.id, kind: e.type, variant: e.variant });
      }
    }
    const phenotype = VARIANTS[e.variant || 'normal'];
    const stunned = (e.stunnedUntil || 0) > this.state.time;
    let speed = e.speed * phenotype.speed * (stunned ? 0.15 : 1);
    const wanderPhase=(e.wanderPhase??e.seed)+(e.formationPhase??0);
    let dx = Math.sin(this.state.time*.18+e.seed)*.72+Math.cos(this.state.time*.071+wanderPhase)*.34;
    let dy = Math.sin(this.state.time*.27+e.seed*.7)*.09+Math.cos(this.state.time*.13+wanderPhase)*.045;
    let dz = Math.cos(this.state.time*.16+wanderPhase)*.72+Math.sin(this.state.time*.083+e.seed)*.34;
    e.behavior = ({ fish: 'school', lanternfish: 'school', jelly: 'drift', ray: 'glide', turtle: 'graze', angler: 'ambush', crab: 'scavenge', oarfish: 'glide' })[e.type] || 'patrol';
    e.targetId = null;
    const nearest = (types, range) => {
      // 小鱼要躲的那一组威胁是固定的四类，用预先摊平的数组，少一次查表。
      const list = (types.length === 4 && types.includes('shark') && types.includes('angler'))
        ? this.state.threatList
        : null;
      if (list) {
        let best = null;
        let bestDistance = range;
        for (const candidate of list) {
          if (candidate.dead || candidate.id === e.id) continue;
          const dist = distance(e, candidate);
          if (dist < bestDistance) { best = candidate; bestDistance = dist; }
        }
        return best;
      }
      let best = null;
      let bestDistance = range;
      for (const type of types) for (const candidate of this.ecologyIndex.get(type) || []) {
        if (candidate.dead || candidate.id === e.id) continue;
        const dist = distance(e, candidate);
        if (dist < bestDistance) { best = candidate; bestDistance = dist; }
      }
      return best;
    };
    if (e.type === 'fish' || e.type === 'lanternfish') {
      threat = nearest(['shark', 'squid', 'jelly', 'angler'], 23);
      if (p.attachment?.entityId !== e.id && p.level >= 5 && playerDistance < 10 * this._mimicFactor() && (!threat || playerDistance < distance(e, threat))) threat = p;
      const fearRadius = 7 * fearRadiusModifier(this.state);
      if (!threat && p.attachment?.entityId !== e.id && playerDistance < fearRadius && playerDistance > .001) {
        const avoid=(fearRadius-playerDistance)/fearRadius;
        dx+=(e.x-p.x)/playerDistance*avoid*1.8;
        dy+=(e.y-p.y)/playerDistance*avoid*.5;
        dz+=(e.z-p.z)/playerDistance*avoid*1.8;
      }
      if (!threat) {
        const bloom = this.state.entities.find(entity => entity.type === 'bloom' && distance(e, entity) < 34);
        const feedingBloom = Boolean(bloom && e.hunger > 0.28);
        if (feedingBloom) {
          e.behavior = 'feed';
          dx += (bloom.x - e.x) * 0.16;
          dy += (bloom.y - e.y) * 0.08;
          dz += (bloom.z - e.z) * 0.16;
        } else if (e.hunger > 0.35) target = nearest(e.variant === 'lure' ? ['fish', 'food'] : ['food'], e.variant === 'lure' ? 10 : 13);
        if (!target && !feedingBloom) {
          let count=0,centerX=0,centerY=0,centerZ=0,alignX=0,alignY=0,alignZ=0,separateX=0,separateY=0,separateZ=0;
          const schoolId=e.schoolId??Math.floor(e.id/6);
          for(const other of this.ecologyIndex.get(e.type)||[]) {
            if(other.id===e.id||other.dead||(other.schoolId??Math.floor(other.id/6))!==schoolId)continue;
            const d=distance(e,other);
            if(d>=19)continue;
            count++;centerX+=other.x;centerY+=other.y;centerZ+=other.z;
            alignX+=other.vx||0;alignY+=other.vy||0;alignZ+=other.vz||0;
            const separation=1-Math.min(1,d/3.2);
            if(separation>0&&d>.001){
              separateX+=(e.x-other.x)/d*separation;
              separateY+=(e.y-other.y)/d*separation*.45;
              separateZ+=(e.z-other.z)/d*separation;
            }
            if(count>=10)break;
          }
          if(count) {
            dx+=(centerX/count-e.x)*.17+(alignX/count)*.075+separateX*1.35;
            dy+=(centerY/count-e.y)*.12+(alignY/count)*.055+separateY*.8;
            dz+=(centerZ/count-e.z)*.17+(alignZ/count)*.075+separateZ*1.35;
            const lane=Math.sin(this.state.time*.58+e.formationPhase+e.seed)*.19;
            dx+=Math.cos(e.heading||0)*lane*.4;
            dz-=Math.sin(e.heading||0)*lane*.4;
          }
        }
      }
    } else if (e.type === 'jelly') {
      // A jelly drifts with the current; only prey already touching its tentacles is caught.
      target = nearest(['food', 'fish'], e.radius + 1.8);
      dy = Math.sin(this.state.time * 0.55 + e.seed) * 0.5;
    } else if (e.type === 'whale' || e.type === 'turtle') {
      if (e.breathTime <= 0) {
        e.behavior = 'surface';
        dx *= 0.3; dz *= 0.3; dy = 1.7;
        if (e.y >= WATER_SURFACE_Y - 1.4) { e.breathTime = 105; e.behavior = 'patrol'; }
      } else if (e.hunger > 0.3) target = nearest(spec.prey, e.type === 'whale' ? 74 : 24);
    } else if (e.type === 'oarfish') {
      threat = nearest(['shark'], 28);
      if (!threat && e.hunger > 0.3) target = nearest(['food', 'marineSnow'], 24);
      dy += Math.sin(this.state.time * 0.2 + e.seed) * 0.4;
    } else if (e.type === 'ray') {
      threat = nearest(['shark'], 22);
      if (!threat && e.hunger > 0.3) target = nearest(['crab'], 27);
      dy *= 0.3;
    } else if (e.type === 'angler') {
      // Drift almost in place around the lure, then make a short ambush.
      target = e.hunger > 0.3 ? nearest(spec.prey, 9) : null;
      if (!target) speed *= 0.08;
      if (p.level >= 5 && playerDistance < 5 && !target) { target = p; speed = e.speed; }
    } else if (e.type === 'crab') {
      threat = nearest(['ray', 'angler'], 12);
      if (!threat && e.hunger > 0.3) target = nearest(['marineSnow'], 15);
      dy = 0;
    } else {
      if (e.type === 'squid' || e.type === 'cuttlefish') threat = nearest(e.type === 'squid' ? ['whale'] : ['shark', 'squid'], 34);
      if (!threat && e.hunger > 0.3) {
        target = nearest(['fish', 'lanternfish'], e.type === 'shark' ? 38 : 30);
        // Large predators favor their normal prey. A tiny cell is below their feeding scale.
        if (!p.attachment && p.level >= 5 && playerDistance < (15 + p.mutations.photophore * 8 + (p.feedTime > 0 ? 8 : 0)) * this._mimicFactor() && (!target || playerDistance < distance(e, target) * 0.65)) target = p;
      }
    }
    if (e.variant === 'crooked') { dx += Math.cos(this.state.time * 2.4 + e.seed) * 0.65; dz += Math.sin(this.state.time * 2.4 + e.seed) * 0.65; }
    if (e.variant === 'lure' && target) speed *= 1.3;
    if (threat) {
      e.behavior = 'flee';
      e.targetId = threat === p ? 0 : threat.id;
      dx = e.x - threat.x; dy = e.y - threat.y; dz = e.z - threat.z;
      speed *= 1.65;
      target = null;
    } else if (target && e.type !== 'jelly') {
      e.behavior = target.type === 'food' ? 'feed' : e.type === 'crab' ? 'scavenge' : e.type === 'turtle' ? 'graze' : 'hunt';
      e.targetId = target === p ? 0 : target.id;
      dx = target.x - e.x; dy = target.y - e.y; dz = target.z - e.z;
      speed *= e.type === 'fish' ? 1 : 1.18;
    }
    // Keep animals within their habitat, with a soft turn at the edge of the map.
    if (Math.hypot(e.x, e.z) > this.state.world.radius - 20) { dx -= e.x * 0.2; dz -= e.z * 0.2; }
    const lower = e.variant && e.variant !== 'normal' ? Math.min(spec.minY, 12) : spec.minY;
    const upper = ['whale', 'turtle'].includes(e.type) ? PLAYER_MAX_Y : spec.maxY;
    if (e.y < lower + 1) dy = Math.max(0.6, dy);
    if (e.y > upper - 1) dy = Math.min(-0.6, dy);
    if (e.type === 'crab') dy = 0;
    if(e.type==='fish'||e.type==='lanternfish')speed*=.92+.075*Math.sin(this.state.time*.38+e.seed+wanderPhase*.27);
    const length = Math.hypot(dx, dy, dz) || 1;
    const bodyClearance=wildlifeBodyClearance(e);
    const forwardProbe=Math.max(.55,bodyClearance*1.2+speed*.24);
    const aheadX=e.x+dx/length*forwardProbe;
    const aheadY=clamp(e.y+dy/length*forwardProbe,lower,upper);
    const aheadZ=e.z+dz/length*forwardProbe;
    if(wildlifeSpaceBlocked(this.state,e,aheadX,aheadY,aheadZ)){
      const avoided=bestWildlifeDirection(this.state,e,{x:dx,y:dy,z:dz},forwardProbe,lower,upper);
      if(avoided){dx=avoided.x*length;dy=avoided.y*length;dz=avoided.z*length;}
    }
    const ease = 1 - Math.exp(-dt * (e.type === 'whale' ? 1.5 : 3.5));
    e.vx += (dx / length * speed - e.vx) * ease;
    e.vy += (dy / length * speed - e.vy) * ease;
    e.vz += (dz / length * speed - e.vz) * ease;
    // Break a long frame into short probes so a fast tail cannot tunnel through
    // a thin piling. Obstacles redirect momentum along a clear tangent; velocity
    // is never mirrored axis by axis, which was the source of visible vibration.
    const travel=Math.hypot(e.vx,e.vy,e.vz)*dt;
    const steps=Math.max(1,Math.min(6,Math.ceil(travel/.22)));
    for(let step=0;step<steps;step++){
      const stepScale=dt/steps;
      let nextX=e.x+e.vx*stepScale;
      let nextY=clamp(e.y+e.vy*stepScale,lower,upper);
      let nextZ=e.z+e.vz*stepScale;
      if(wildlifeSpaceBlocked(this.state,e,nextX,nextY,nextZ)){
        const velocityLength=Math.hypot(e.vx,e.vy,e.vz)||1;
        const avoided=bestWildlifeDirection(
          this.state,e,
          {x:e.vx/velocityLength,y:e.vy/velocityLength,z:e.vz/velocityLength},
          Math.max(.28,travel/steps*2.4),
          lower,
          upper,
        );
        if(!avoided){
          e.vx*=.18;e.vy*=.18;e.vz*=.18;
          break;
        }
        const redirected=Math.min(1,1-Math.exp(-dt*8));
        e.vx+=(avoided.x*speed-e.vx)*redirected;
        e.vy+=(avoided.y*speed-e.vy)*redirected;
        e.vz+=(avoided.z*speed-e.vz)*redirected;
        nextX=e.x+e.vx*stepScale;
        nextY=clamp(e.y+e.vy*stepScale,lower,upper);
        nextZ=e.z+e.vz*stepScale;
        if(wildlifeSpaceBlocked(this.state,e,nextX,nextY,nextZ)){
          e.vx*=.45;e.vz*=.45;
          break;
        }
      }
      e.x=nextX;e.y=nextY;e.z=nextZ;
    }
    const planar = Math.hypot(e.x, e.z);
    if (planar > this.state.world.radius - e.radius) { e.x *= (this.state.world.radius - e.radius) / planar; e.z *= (this.state.world.radius - e.radius) / planar; }
    if (e.type === 'crab') {
      e.y = seabedHeight(e.x, e.z) + CRAB_GROUND_CLEARANCE;
      e.vy = 0;
    }
    if (Math.hypot(e.vx, e.vz) > 0.01) {
      const desiredHeading=Math.atan2(-e.vx,-e.vz);
      const headingDelta=Math.atan2(Math.sin(desiredHeading-(e.heading??desiredHeading)),Math.cos(desiredHeading-(e.heading??desiredHeading)));
      const turnSpeed={fish:4.2,lanternfish:4.5,shark:1.7,squid:1.8,cuttlefish:2.2,whale:.75,turtle:1.2,ray:1.9,angler:2.6,crab:5,oarfish:1.35,jelly:1}[e.type]||2;
      e.heading=(e.heading??desiredHeading)+clamp(headingDelta,-dt*turnSpeed,dt*turnSpeed);
    }
    if (!stunned && target && !target.dead && distance(e, target) < e.radius + (target === p ? p.size : target.radius) + 0.7 && e.attackTime <= 0) {
      e.attackTime = e.type === 'whale' ? 1.2 : 1.5;
      if (target === p) this._damage(e.damage * phenotype.damage, `${spec.name}捕食`);
      else this._predation(e, target);
    }
    const touch = distance(e, p) < e.radius + p.size + (e.type === 'jelly' ? 0.7 : 0.1);
    if (e.type === 'jelly' && touch && !stunned && e.attackTime <= 0) {
      e.attackTime = 1.6;
      this._damage(7, '水母刺细胞接触');
    }
    if (touch && this._canHarm(e) && this.state.mode === 'playing') this._hurtEnemy(e, (p.damage + p.mutations.spines * 5) * dt);
  }

  _predation(hunter, prey) {
    const damage = { predator: 8, fish: 2, jelly: 18, shark: 38, squid: 32, whale: 95, ray: 20, turtle: 24, angler: 25, crab: 3, lanternfish: 2, cuttlefish: 19, oarfish: 6 }[hunter.type];
    prey.hp = Math.max(0, prey.hp - damage * VARIANTS[hunter.variant || 'normal'].damage * (prey.variant === 'armored' ? 0.6 : 1));
    if (prey.hp > 0 || prey.dead) return;
    prey.dead = true;
    hunter.hunger = Math.max(0, hunter.hunger - 0.65);
    this.state.ecology.predations++;
    this._emit('predation', `${SPECIES[hunter.type].name}捕食了${SPECIES[prey.type]?.name || '浮游生物'}`, {
      predatorType: hunter.type, preyType: prey.type, x: prey.x, y: prey.y, z: prey.z,
    });
  }

  _spawnEnemy(type) {
    let pos = this._position(false);
    // No surprise contact damage immediately after starting a run.
    if (distance(pos, this.state.player) < 24) pos = { x: 35, y: 22, z: -30 };
    const stage = this.state.stage;
    const drone = type === 'drone';
    return this._entity(type, pos.x, pos.y, pos.z, drone ? 1.5 : 1.25 + stage * 0.13,
      (drone ? 75 : 38) + stage * 18,
      { speed: (drone ? 6.2 : 4.3) + stage * 0.55, damage: (drone ? 12 : 7) + stage * 2, attackTime: 0, striking: false, attackWindup: 0 });
  }

  _replenish() {
    const entities = this.state.entities;
    const p = this.state.player;
    let foods = entities.filter(e => e.type === 'food').length;
    const nearbyFood = entities.filter(e => e.type === 'food' && distance(e, p) < 30).length;
    // Retire remote debris to keep the simulation bounded during long runs.
    if (nearbyFood < 7 && foods >= 54) {
      const remote = entities.filter(e => e.type === 'food').sort((a, b) => distance(b, p) - distance(a, p));
      for (const e of remote.slice(0, Math.min(2, 7 - nearbyFood))) { e.dead = true; foods--; }
    }
    for (let i = 0; i < Math.min(2, Math.max(45 - foods, 7 - nearbyFood)); i++) this._spawnPickup('food', true);
    const isotopes = entities.filter(e => e.type === 'isotope').length;
    const nearbyIsotopes = entities.filter(e => e.type === 'isotope' && distance(e, p) < 30).length;
    if (isotopes < 10 && nearbyIsotopes < 2) this._spawnPickup('isotope', true);
    const enemies = entities.filter(e => e.type === 'predator' || e.type === 'drone').length;
    const target = 6 + this.state.stage * 2;
    if (enemies < target) this._spawnEnemy(this.state.stage >= 2 && this.random() > 0.55 ? 'drone' : 'predator');
    for (const [type, count] of Object.entries(ANIMAL_COUNTS)) {
      if (this.state.entities.length < MAX_ENTITIES - 12 && entities.filter(e => !e.dead && e.type === type).length < count) this._spawnWildlife(type, Math.floor(this.random() * count));
    }
    // Rehome one unseen distant animal into the player's water layer. Never
    // teleport a visible animal, an attached host, or a fish into open view.
    const nearbyAnimals = entities.filter(e => WILDLIFE.has(e.type) && distance(e, p) < 70).length;
    if (nearbyAnimals < 9) {
      const candidate = entities.find(e => WILDLIFE.has(e.type) && e.id !== p.attachment?.entityId && distance(e, p) > 140 && p.y >= SPECIES[e.type].minY && p.y <= SPECIES[e.type].maxY);
      if (candidate) {
        const angle = this.random() * Math.PI * 2;
        const x = p.x + Math.cos(angle) * 76, z = p.z + Math.sin(angle) * 76;
        if (Math.hypot(x, z) < this.state.world.radius - 15) Object.assign(candidate, { x, z, y: p.y, vx: 0, vy: 0, vz: 0 });
      }
    }
    if (entities.filter(e => !e.dead && e.type === 'marineSnow').length < 18 && this.state.entities.length < MAX_ENTITIES - 12) this._spawnPickup('marineSnow', true);
    this.state.entities = entities.filter(e => !e.dead);
  }

  _eat(entity) {
    entity.dead = true;
    const p = this.state.player;
    const isotope = entity.type === 'isotope';
    let mutationGain = 0;
    p.biomass += isotope ? 0 : 5;
    p.hp = Math.min(p.maxHp, p.hp + (isotope ? 0 : 1.5 + p.branches.devour * 0.8));
    p.energy = Math.min(p.maxEnergy, p.energy + (isotope ? 6 + p.branches.radiation * 3 : 2));
    if (!isotope) p.nutrition = Math.min(100, p.nutrition + (entity.nutrition || SPECIES[entity.type]?.nutrition || 7));
    if (!isotope && entity.sourceId) this._assimilate(entity);
    if (isotope) {
      this.state.stats.isotopes++;
      p.radiation = Math.min(100, p.radiation + 7 / (1 + p.branches.radiation * 0.22));
      mutationGain = this._gainMutationEnergy(14);
    } else this.state.stats.eaten++;
    this._emit('eat', isotope ? `同位素 +${Math.round(mutationGain)} 异变能` : `${entity.type === 'marineSnow' ? '海洋雪' : '生物质'}补充营养`, { x: entity.x, y: entity.y, z: entity.z, kind: entity.type, xp: 0, mutationEnergy: mutationGain });
  }

  _devourIslandHuman() {
    const p=this.state.player,log=this.state.expedition;
    if(p.level<7) {
      if(!this.dietWarnings.has('humanOnLand')) {
        this.dietWarnings.add('humanOnLand');
        this._emit('dietBlocked','当前身体仍无法掠食人类；发育为分化异化体（Lv.7）后才具备足够体型。',{kind:'human'});
      }
      return false;
    }
    const devoured=Number.isInteger(log.humansDevoured)?log.humansDevoured:0;
    if(devoured>=30) {
      this._emit('interaction','灰屿沿岸的人类已经逃离，海岸只剩警报和空衣。');
      return false;
    }
    log.humansDevoured=devoured+1;
    this.state.stats.kills++;
    p.biomass+=24;
    p.nutrition=Math.min(100,p.nutrition+38);
    p.hp=Math.min(p.maxHp,p.hp+8);
    this._emit('humanDevoured','异兽掠食岸上人类：这不会提升随机发育，但会引发灰屿恐慌。',{
      x:p.x,y:p.y,z:p.z,count:log.humansDevoured,total:30,
    });
    return true;
  }

  _assimilate(entity) {
    const p = this.state.player;
    if (!WILDLIFE.has(entity.sourceType) || !Number.isInteger(entity.sourceId) || entity.sourceId <= 0 || p.ingestedPreyIds.includes(entity.sourceId) || p.ingestedPreyIds.length >= MAX_ASSIMILATION_RECORDS) return;
    if (!ASSIMILATIONS.some(trait => trait.sources.includes(entity.sourceType))) return;
    const candidates = assimilationCandidates(entity.sourceType, p.assimilations, entity.sourceY);
    const selected = candidates.length ? candidates[Math.floor(this.random() * candidates.length)] : null;
    // 器官判定保持随机 —— 随机结果必须可复现，测试也依赖这一点。
    // "第一个本能必定到手"的保证由菌膜那条必经路径兑现。
    const success = selected !== null && this.random() < selected.chance;
    const record = { sourceId: entity.sourceId, sourceType: entity.sourceType, sourceY: entity.sourceY, trait: selected?.id || null, success, time: this.state.time };
    p.ingestedPreyIds.push(entity.sourceId);
    p.assimilationHistory.push(record);
    if (success) {
      p.assimilations[selected.id]++;
      this._refreshAdaptations();
      // 供体的组织不仅长成器官，还可能整合出对应的主动本能 —— 吞噬的意义
      // 是"解锁一个新操作"，而不是多几滴数值。
      if (selected.instinct) this._unlockInstinct(selected.instinct, `吞噬${SPECIES[entity.sourceType]?.name || entity.sourceType}`);
    }
    this._emit('assimilation', success ? `消化${SPECIES[entity.sourceType].name}后，随机形成${selected.name}` : selected ? '消化完成，本次未保留新的器官结构' : '消化完成：可兼容的器官结构已饱和', { ...record, rank: selected ? p.assimilations[selected.id] : 0, chance: selected?.chance || 0, automatic: true });
  }

  _checkLevel() {
    const p = this.state.player;
    while (this.state.mode === 'playing' && p.xp >= p.xpNext && p.level < MAX_LEVEL) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpForLevel(p.level);
      const oldHp = p.maxHp;
      derived(p);
      p.hp += p.maxHp - oldHp;
      this._applyRandomEvolution();
      this._emit('level', `生命等级 ${p.level}：身体自动出现新的结构`, { level: p.level, automatic: true });
      const stage = stageForLevel(p.level);
      if (stage !== this.state.stage) {
        this.state.stage = stage;
        this._emit('stage', STAGES[stage].name, { stage });
        if (stage === 3) {
          const core = islandFinalCorePoint(this.state.world);
          const boss = this._entity('boss', core.x, core.y, core.z, 6.5, MOTHER_RULES.coreHp, {
            attackTime: 3, phase: 1, weakened: false,
            motherPhase: MOTHER_PHASE.ARMOR,
            clouds: [], coreWindowOpen: false, coreTimer: 0,
            rageTimer: MOTHER_RULES.rageInterval, spoutTimer: 1.5,
          });
          if (boss) createTendrils(this, boss);
          this._emit('boss', '灰屿排放母体已显现：外甲覆着三条触须。先侵入三座海底反应堆，解除它的供能屏障。');
        }
      }
    }
  }

  _updateEnemy(e, dt, dist) {
    const p = this.state.player;
    e.attackTime = Math.max(0, e.attackTime - dt);
    e.attackWindup = Math.max(0, (e.attackWindup || 0) - dt);
    const mimic = this._mimicFactor();
    // 显形会招来猎手：发光与冲刺都会扩大被发现的半径，拟态则相反。
    const conspicuous = (p.mutations.photophore > 0 ? 1.3 : 1) * (p.dashTime > 0 ? 1.35 : 1);
    const stealth = (this.schoolCovered ? .58 : 1) * mimic;
    const baseDetect = (e.type === 'drone' ? 35 + p.mutations.photophore * 8 : 27 + p.mutations.photophore * 8)
      * detectionModifier(this.state);
    // 发育到 Lv5 之后普通捕食者会避开你；但只要你显形，它们照样会来。
    const detection = p.level >= 5
      ? (conspicuous > 1 ? 20 * conspicuous * stealth : 0)
      : baseDetect * stealth * conspicuous;
    const flee = e.type === 'predator' && p.level >= 5 && dist < 13 * mimic;
    const chase = !flee && dist < detection;
    if (flee && dist > 0.001) {
      e.x += (e.x - p.x) / dist * e.speed * dt;
      e.y = clamp(e.y + (e.y - p.y) / dist * e.speed * dt, 4, 50);
      e.z += (e.z - p.z) / dist * e.speed * dt;
    }
    if (chase && dist > 0.001) {
      const step = Math.min(e.speed * dt, Math.max(0, dist - e.radius - p.size + 0.4));
      e.x += (p.x - e.x) / dist * step;
      e.y += (p.y - e.y) / dist * step;
      e.z += (p.z - e.z) / dist * step;
    } else if (!flee) {
      const angle = this.state.time * 0.2 + e.seed;
      e.x += Math.cos(angle) * dt * 0.6;
      e.z += Math.sin(angle) * dt * 0.6;
      const planar = Math.hypot(e.x, e.z);
      if (planar > this.state.world.radius - 2) { e.x *= (this.state.world.radius - 2) / planar; e.z *= (this.state.world.radius - 2) / planar; }
    }
    if (e.type === 'predator' && !chase && !flee) {
      const food = this.state.entities.find(other => !other.dead && other.type === 'food' && distance(e, other) < e.radius + 0.8);
      if (food) this._predation(e, food);
    }
    dist = distance(p, e);
    if (dist < e.radius + p.size + 1.1) this._hurtEnemy(e, (p.damage + p.mutations.spines * 5) * dt * (p.dashTime > 0 ? 2 : 1));
    // 扑击有前摇：猎物会先停下来蓄势，玩家有机会用冲刺躲开或反手撕咬。
    if (!flee && !e.striking && e.attackTime <= 0 && dist < e.radius + p.size + 3.4) {
      e.striking = true;
      e.attackWindup = 0.5;
      this._emit('enemyTelegraph', `${e.type === 'drone' ? '巡逻机械' : '异化捕食者'}蓄势扑击：拉开距离或用冲刺甩开`, {
        x: e.x, y: e.y, z: e.z, kind: e.type,
      });
    }
    if (e.striking && e.attackWindup <= 0) {
      e.striking = false;
      e.attackTime = 1.7;
      if (!e.dead && dist < e.radius + p.size + 1.3) {
        this._damage(e.damage, e.type === 'drone' ? '巡逻机械攻击' : '异变捕食者攻击');
        // 被咬中会被推开：连着几下就能把玩家逼进死角。
        if (dist > 0.001) {
          p.vx += (p.x - e.x) / dist * 5;
          p.vy += (p.y - e.y) / dist * 2;
          p.vz += (p.z - e.z) / dist * 5;
        }
      }
    }
  }

  _hurtEnemy(entity, damage, point = null, kind = 'melee') {
    if (!entity || entity.dead) return;
    // 母体的伤害分流：触须、污染云、核心各有各的规则。
    if (entity.type === 'tendril') {
      // 外甲挡得住辐射脉冲，只能靠近身把它撕开。
      const resist = kind === 'pulse' ? .25 : 1;
      if (kind === 'pulse' && !entity.resistHinted) {
        entity.resistHinted = true;
        this._emit('echoResist', '外甲把辐射脉冲弹开了 —— 贴近用撕咬或冲刺撞击', { entityId: entity.id });
      }
      entity.hp = Math.max(0, entity.hp - damage * resist);
      this._emit('tendrilDamage', `触须被撕开（剩余 ${Math.ceil((entity.hp / entity.maxHp) * 100)}%）`, {
        entityId: entity.id, x: entity.x, y: entity.y, z: entity.z, hp: entity.hp,
      });
      if (entity.hp <= 0) {
        entity.dead = true;
        this._emit('tendrilSevered', '一条触须被切断', { entityId: entity.id, x: entity.x, y: entity.y, z: entity.z });
      }
      return;
    }
    if (entity.type === 'echo') {
      // 冲刺撞击是近战，也是切断共振的一条路。
      this._damageEcho(entity, damage, '冲刺撞击', 'melee');
      return;
    }
    if (entity.type === 'boss' && isMother(entity)) {
      damageMother(this, entity, damage, '攻击', point);
      return;
    }
    if (entity.hp <= 0 || !this._canHarm(entity)) return;
    if (entity.type === 'boss' && entity.weakened) return;
    entity.hp = Math.max(0, entity.hp - damage * (entity.variant === 'armored' ? 0.6 : 1));
    if (entity.hp > 0) return;
    if (entity.type === 'boss') {
      entity.hp = 1;
      entity.weakened = true;
      this._emit('coreWeakened', this.state.player.apex ? '核心外壳崩解：靠近后按 E，以巨兽之口吞没灰屿' : '核心外壳崩解：继续完成生态适应，发育为巨兽后才能吞没灰屿', { x: entity.x, y: entity.y, z: entity.z });
      return;
    }
    entity.dead = true;
    this.state.stats.kills++;
    // 猎杀计数只算真正的猎物 —— 设施和回声体不算"你杀了多少生命"。
    if (WILDLIFE.has(entity.type)) {
      if (entity.radius >= 3) this._hitstop(0.16, 0.22);
      this.state.stats.preyKills++;
      const perSpecies = this.state.ecology.killsBySpecies;
      perSpecies[entity.type] = (perSpecies[entity.type] || 0) + 1;
    }
    this._emit('kill', entity.type === 'boss' ? '排放核心已摧毁' : '猎食成功', { x: entity.x, y: entity.y, z: entity.z, kind: entity.type });
    this.state.player.biomass += entity.type === 'drone' ? 8 : 12;
    this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 4);
    if (WILDLIFE.has(entity.type)) {
      const nutrition = SPECIES[entity.type].nutrition;
      const portions = Math.max(2, Math.ceil(nutrition / 10));
      for (let i = 0; i < portions && this.state.entities.length < MAX_ENTITIES - 1; i++) {
        const angle = i / portions * Math.PI * 2;
        const x = entity.x + Math.cos(angle) * 0.8, z = entity.z + Math.sin(angle) * 0.8;
        const y = clamp(entity.y + (this.random() - 0.5) * 0.8, seabedHeight(x, z) + SEDIMENT_GROUND_CLEARANCE, 51);
        this._entity('marineSnow', x, y, z, 0.4, 1,
          { nutrition: nutrition / portions, sourceType: entity.type, sourceId: entity.id, sourceY: clamp(entity.y, -3, 52) });
      }
    }
  }

  _damage(amount, reason, emit = true) {
    if (this.state.mode !== 'playing') return;
    const p = this.state.player;
    const dealt = amount * (1 - p.armor) * (p.dashTime > 0 ? 0.3 : 1) * ((p.overloadBurst || 0) > 0 ? 1.5 : 1);
    p.hp = Math.max(0, p.hp - dealt);
    p.hurtTime = 2.2;
    // 被咬中会短暂慌乱：手抖，视野晃，游不动。这让"被猎杀"有代价。
    if (dealt >= 5) p.panic = Math.min(2, p.panic + 1.2);
    this.state.stats.damageTaken += dealt;
    if (emit) this._emit('damage', reason, { amount: dealt, x: p.x, y: p.y, z: p.z });
    if (p.hp <= 0) {
      this.state.mode = 'dead';
      this._emit('death', '意识消散在海流中。下一次异化，仍将从微光开始。', { reason });
    }
  }
}
