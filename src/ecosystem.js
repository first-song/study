// Fictional radiation phenotypes and ecological interactions. The simulation is
// deliberately independent of rendering; these are game rules, not dosimetry.
import { PLAYER_MAX_Y, WATER_SURFACE_Y } from './biology.js';
import { islandCenter } from './island.js';
import { instinctRank } from './instincts.js';
import { ECHO_RESIST, ECHO_STRATEGY } from './echo-system.js';

export const VARIANTS = Object.freeze({
  normal: Object.freeze({ name: '正常个体', speed: 1, resistance: 1, damage: 1 }),
  crooked: Object.freeze({ name: '脊柱畸变', speed: 0.68, resistance: 1.25, damage: 0.8 }),
  armored: Object.freeze({ name: '增生骨甲', speed: 0.78, resistance: 2.1, damage: 1.15 }),
  lure: Object.freeze({ name: '异位感光器', speed: 0.9, resistance: 1.45, damage: 1.35 }),
});
export const REACTOR_SITES = Object.freeze([
  Object.freeze({ id: 'wreck', name: '沉船反应堆', x: -25, y: 7, z: -22, offset: 0 }),
  Object.freeze({ id: 'trench', name: '断层反应堆', x: 42, y: 7, z: 30, offset: 7 }),
  Object.freeze({ id: 'outfall', name: '排放站反应堆', x: 7, y: 7, z: -62, offset: 14 }),
]);
export const BIOFILM_SITES = Object.freeze([
  Object.freeze({ id: 'nursery', name: '漂木菌膜', x: 7, y: 43, z: -8 }),
  Object.freeze({ id: 'shelf', name: '礁壁菌膜', x: -18, y: 21, z: -18 }),
  Object.freeze({ id: 'deep', name: '沉积菌膜', x: 36, y: 8, z: 22 }),
]);
export const HOST_TYPES = Object.freeze(['fish', 'whale', 'turtle', 'diver']);
export const PARASITE_SITE_DEFS = Object.freeze([
  Object.freeze({ id: 'harbor', name: '港口泵站', dx: -18, dz: 16, surfaceOffset: 3.2 }),
  Object.freeze({ id: 'laboratory', name: '海面实验舱', dx: 4, dz: 5, surfaceOffset: 5 }),
  Object.freeze({ id: 'relay', name: '通信继电器', dx: 20, dz: -13, surfaceOffset: 7.2 }),
]);
// 遭遇不再是一根读条：每个目标都有自己的三段结构。
//   菌膜   摄取 → 菌落扩张 → 稳定（稳定期会招来捕食者）
//   反应堆 注入 → 压制 → 过载（压制期会引来维护无人机）
//   寄生   接入 → 电网反击（进度会被切断，必须重新维持）
export const INTERACTION_RULES = Object.freeze({
  biofilmSeconds: 12,
  biofilmGatherAt: 0.62,
  hostSeconds: 12, hostDistance: 12,
  reactorSeconds: 9,
  reactorCounterAt: 0.34,
  infectionSeconds: 8,
  infectionSurgeAt: 0.46,
  pollutionRadius: 32, exposureThreshold: 12,
});

export function reactorPhase(time, offset = 0) {
  const elapsed = ((time + offset) % 21 + 21) % 21;
  if (elapsed < 12) return { phase: 'cooldown', remaining: 12 - elapsed };
  if (elapsed < 16) return { phase: 'warning', remaining: 16 - elapsed };
  return { phase: 'discharge', remaining: 21 - elapsed };
}

export function initialExpedition() {
  return {
    milestones: [], biofilms: [], hostAdaptations: [], shutdowns: [], parasiteNodes: [],
    echoesPacified: [], echoEncounters: [], humansDevoured: 0, legacyLevels: 0,
  };
}

export function parasiteSites(world) {
  const center=islandCenter(world);
  return PARASITE_SITE_DEFS.map(site => ({
    id: site.id,
    name: site.name,
    x: center.x + site.dx,
    y: WATER_SURFACE_Y - site.surfaceOffset,
    z: center.z + site.dz,
  }));
}

export function interactionPosition(entity) {
  if (entity.type === 'reactor') {
    const angle=Number.isFinite(entity.approachAngle)?entity.approachAngle:-Math.PI/2;
    return {
      x:entity.x+Math.cos(angle)*entity.radius*.65,
      y:Math.max(3,entity.y),
      z:entity.z+Math.sin(angle)*entity.radius*.65,
    };
  }
  if (HOST_TYPES.includes(entity.type)) {
    // Attach beside the shoulder surface, rather than to the enclosing collision
    // sphere. A flank contact also stays submerged when a whale surfaces.
    const shoulderWidth={fish:.17,whale:.33,turtle:.36,diver:.18}[entity.type];
    const speed=Math.hypot(entity.vx||0,entity.vy||0,entity.vz||0);
    const yaw=speed>.03?Math.atan2(-(entity.vx||0),-(entity.vz||0)):(entity.heading||0);
    const pitch=speed>.03?Math.asin(Math.max(-.7,Math.min(.7,(entity.vy||0)/speed))):0;
    const x=entity.radius*shoulderWidth+.4,localY=entity.radius*.025,localZ=-entity.radius*.15;
    const y=localY*Math.cos(pitch)-localZ*Math.sin(pitch);
    const z=localY*Math.sin(pitch)+localZ*Math.cos(pitch);
    return {x:entity.x+x*Math.cos(yaw)+z*Math.sin(yaw),y:Math.max(3,Math.min(PLAYER_MAX_Y,entity.y+y)),z:entity.z-x*Math.sin(yaw)+z*Math.cos(yaw)};
  }
  if (entity.type === 'islandNode') return { x: entity.x, y: entity.y + entity.radius * 0.25, z: entity.z };
  return { x: entity.x, y: entity.y + entity.radius * 0.7, z: entity.z };
}

export function reactorEntranceYaw(entity) {
  const angle=Number.isFinite(entity.approachAngle)?entity.approachAngle:-Math.PI/2;
  return -angle-Math.PI/2;
}

export function expeditionObjective(state) {
  const log = state.expedition;
  const bloom = state.entities.find(entity => entity.type === 'bloom' && !entity.dead);
  if (bloom && bloom.phase === 'unstable' && Math.hypot(state.player.x - bloom.x, state.player.y - bloom.y, state.player.z - bloom.z) < 20) {
    return '活性羽流正在失稳：停止滤食并撤离橙色核心，准备避开爆裂伤害';
  }
  if (bloom && !log.biofilms.length && state.time < 25) {
    // 开局三十秒必须是一个决定，而不是一句"按 E"。
    return '开局两条路：蓝色羽流按 E 滤食，稳但慢；橙色核心把异变能推得更快，代价是辐射与捕食压力一起上来。选一条，再去漂木菌膜按 G';
  }
  if (log.hostAdaptations.includes('diver') && log.parasiteNodes.length < PARASITE_SITE_DEFS.length) {
    return `寄生路线已开启：感染灰屿三处神经中继 ${log.parasiteNodes.length} / ${PARASITE_SITE_DEFS.length}`;
  }
  if (state.player.y >= WATER_SURFACE_Y - 2 && !log.hostAdaptations.includes('diver')) {
    return state.player.parasiteCapability
      ? '已抵达海平面：寄生原基已表达，可寻找灰屿取样潜水员开启神经接管路线'
      : '已抵达海平面：寄生原基仍在休眠；可以搭乘普通宿主继续发育，等待后期随机异变';
  }
  if (!log.biofilms.length) return '靠近漂木菌膜，按 G 附着并消化：菌落可能教会你第一个本能';
  // 还没有任何主动技能时，提示玩家去猎 —— 猎什么决定能整合出什么。
  const learned = ['bite', 'jet', 'mimic', 'sense'].some(id => instinctRank(state.player, id) > 0);
  if (!learned) return '猎杀小型生物并吞下它的组织：有机会整合出新的本能（撕咬、突进、拟态、扫描）';
  if (!log.hostAdaptations.length) return '靠近鱼、鲸、海龟或人类潜水员，按 G 搭乘宿主，随它迁移适应';
  if (log.shutdowns.length < REACTOR_SITES.length) {
    const echo=state.entities.find(entity=>
      entity.type==='echo'&&!entity.pacified&&!log.shutdowns.includes(entity.reactorSiteId)
    );
    if(echo) {
      const phase=echo.phase==='exposed'?'外壳已张开，现在切断连接':echo.phase==='charge'?'正在蓄力，拉开距离后等待外壳张开':'它把污染共振送入反应堆；贴近观察开壳窗口';
      const strategy=ECHO_STRATEGY[ECHO_RESIST[echo.echoKind]?.needs];
      return `追猎异变回声体 ${log.echoesPacified?.length||0} / ${REACTOR_SITES.length}：${echo.name} · ${phase}${strategy?` · ${strategy.hint}`:''}`;
    }
    return `侵入海底反应堆 ${log.shutdowns.length} / ${REACTOR_SITES.length}：在冷却窗口附着，预警时撤离`;
  }
  const boss=state.entities.find(entity=>!entity.dead&&entity.type==='boss');
  if(!boss)return '三座反应堆已停机：继续完成生态经历，发育到 Lv.7 后排放母体的实体外壳会显现';
  const coreDistance=Math.ceil(Math.hypot(state.player.x-boss.x,state.player.y-boss.y,state.player.z-boss.z));
  if(!boss.weakened){
    if(boss.motherPhase==='armor')return `排放母体 ${coreDistance} m：外甲覆着三条触须，用撕咬把它们一条条切下来`;
    if(boss.motherPhase==='spout')return `排放母体 ${coreDistance} m：它正在喷发污染云，用脉冲打散云团，别被灼到`;
    if(boss.coreWindowOpen)return `排放母体 ${coreDistance} m：核心张开了，现在撕咬它，或用冲刺撞击`;
    return `排放母体 ${coreDistance} m：核心闭合着，等它下一次张开`;
  }
  if(!state.player.apex)return '核心外壳已经崩解：继续随机发育到 Lv.11 深渊巨兽，才具有吞没灰屿的体型';
  return '终局准备完成：贴近已削弱的核心并按 E，巨兽会吞没整座灰屿与排放设施';
}

export function interactionTarget(state) {
  const p = state.player;
  const attached = p.attachment;
  if (attached) {
    const entity = state.entities.find(candidate => candidate.id === attached.entityId && !candidate.dead);
    if (!entity) return null;
    const hostName = entity.type === 'fish' ? '鱼群宿主' : entity.type === 'whale' ? '潜游齿鲸' : entity.type === 'turtle' ? '巡游海龟' : entity.type === 'diver' ? '取样潜水员' : entity.name;
    return { entityId: entity.id, kind: attached.kind, name: entity.name || hostName, distance: 0, canAttach: true, attached: true, progress: attached.progress, hint: attached.kind === 'reactor' && entity.phase !== 'cooldown' ? '即将排放，按空格立即脱离' : attached.kind === 'infection' ? '神经中继接入中 · 按空格中止' : '已附着 · G / 空格脱离' };
  }
  const parasitesEnabled = p.parasiteCapability && state.expedition.hostAdaptations.includes('diver');
  const candidates = state.entities.filter(entity => !entity.dead && (
    entity.type === 'echo' && !entity.pacified ||
    entity.type === 'biofilm' ||
    entity.type === 'reactor' && entity.status !== 'shutdown' ||
    HOST_TYPES.includes(entity.type) ||
    parasitesEnabled && entity.type === 'islandNode' && !entity.disabled
  )).sort((a,b)=>(a.type==='islandNode'?0:1)-(b.type==='islandNode'?0:1));
  let best = null;
  for (const entity of candidates) {
    const point = entity.type === 'reactor' ? interactionPosition(entity) : entity;
    const dist = Math.max(0, Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z) - (entity.type === 'reactor' ? 0 : entity.radius) - p.size);
    const kind = entity.type === 'echo' ? 'echo' : entity.type === 'biofilm' ? 'biofilm' : entity.type === 'reactor' ? 'reactor' : entity.type === 'islandNode' ? 'infection' : 'host';
    const priority = kind === 'echo' ? 0 : kind === 'infection' ? 0 : kind === 'reactor' ? 1 : kind === 'biofilm' ? 2 : 3;
    if(best?.kind==='infection'&&kind!=='infection')continue;
    if (dist > 6 || best && (dist > best.distance + 1e-6 || Math.abs(dist - best.distance) <= 1e-6 && priority >= best.priority)) continue;
    const reactorEcho=kind==='reactor'?state.entities.find(candidate=>
      candidate.type==='echo'&&candidate.reactorSiteId===entity.siteId&&!candidate.pacified
    ):null;
    const canAttach = kind === 'echo'
      ? p.level >= 3
      : kind === 'reactor'
      ? p.level >= 3 && entity.phase === 'cooldown' && !reactorEcho
      : kind === 'infection'
        ? p.level >= 3 && p.parasiteCapability
        : entity.type === 'diver'
          ? p.parasiteCapability
          : true;
    const hostName = entity.type === 'fish' ? '鱼群宿主' : entity.type === 'whale' ? '潜游齿鲸' : entity.type === 'turtle' ? '巡游海龟' : entity.type === 'diver' ? '取样潜水员' : undefined;
    const name = entity.name || hostName;
    const hint = kind === 'echo'
      ? entity.phase==='exposed'?'G 切断反应堆共振 · 此刻伤害最高':'攻击或等待共振暴露，再按 G 切断连接'
      : kind === 'biofilm'
      ? entity.depleted ? 'G 附着补充营养 · 已完成适应' : 'G 附着消化菌膜'
      : kind === 'host'
        ? entity.type === 'diver'
          ? p.parasiteCapability ? 'G 附着潜水员 · 完成神经拟态适应' : '寄生原基休眠：无法接管人类；等待后期随机异变，普通宿主仍可搭乘'
          : 'G 附着宿主 · 随行适应'
        : kind === 'infection'
          ? p.parasiteCapability ? 'G 接入神经中继 · 接管灰屿设施' : '缺少寄生原基，无法接入神经中继'
          : reactorEcho ? `先让${reactorEcho.name||'异变回声体'}脱离反应堆` : p.level < 3 ? '需要先形成细胞群：完成一处菌膜附着' : entity.phase !== 'cooldown' ? '等待冷却窗口，远离排放范围' : 'G 侵入冷却管道 · 留意排放预警';
    best = { entityId: entity.id, kind, priority, name, distance: dist, canAttach, attached: false, progress: entity.progress || 0, hint };
  }
  return best;
}

export function exposureAt(entities, point) {
  let exposure = 0;
  for (const reactor of entities) {
    if (reactor.type !== 'reactor' || reactor.status === 'shutdown' || reactor.dead) continue;
    const distance = Math.hypot(point.x - reactor.x, point.y - reactor.y, point.z - reactor.z);
    const influence = Math.max(0, 1 - distance / INTERACTION_RULES.pollutionRadius);
    exposure += influence * (reactor.phase === 'discharge' ? 4 : reactor.phase === 'warning' ? 1.3 : 0.32);
  }
  return exposure;
}
