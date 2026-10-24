export const ABERRANT_ECHO_DEFS = Object.freeze([
  Object.freeze({
    id:'shardHunter',
    reactorId:'wreck',
    name:'折脊回声体',
    role:'冲撞型污染猎手',
    echoKind:'shardHunter',
    hint:'蓄力时向玩家直线冲锋；避开冲锋，再在骨甲张开时攻击连接。',
  }),
  Object.freeze({
    id:'lureColony',
    reactorId:'trench',
    name:'诱光群落回声',
    role:'群体型伏击生命',
    echoKind:'lureColony',
    hint:'诱饵灯会制造假目标；停在外壳边缘会不断累积辐射。',
  }),
  Object.freeze({
    id:'pressureWorm',
    reactorId:'outfall',
    name:'压力蠕冠',
    role:'深层掘进型巨体',
    echoKind:'pressureWorm',
    hint:'它会在上下水层潜行；等它破壳换气时靠近，切断反应堆共振。',
  }),
]);

// 三只回声体各有一把钥匙 —— 这让技能成为主线的必需品，而不是装饰。
//   折脊回声体：冲锋时会闪开辐射脉冲，只能贴近用撕咬／突进打断它。
//   诱光群落回声：假光会骗过撕咬，必须用脉冲把诱饵打散。
//   压力蠕冠：藏在暗处，脉冲和撕咬都够不着；要么按住 X 扫描看见真身，
//              要么按住 C 拟态让它失去兴趣、自己靠过来。
// 玩家永远不能指定技能，但菌膜必定先给一个共生本能、第一次猎杀必定给一个
// 捕食本能，因此三条路线永远都走得通 —— 只是难易完全不同。
export const ECHO_RESIST = Object.freeze({
  shardHunter: Object.freeze({ pulse: .3, melee: 1, needs: 'melee' }),
  lureColony: Object.freeze({ pulse: 1, melee: .35, needs: 'pulse' }),
  pressureWorm: Object.freeze({ pulse: .35, melee: .35, needs: 'reveal' }),
});

export const ECHO_STRATEGY = Object.freeze({
  melee: Object.freeze({ label: '近战', hint: '它会闪开辐射脉冲 —— 贴近用撕咬或喷射突进' }),
  pulse: Object.freeze({ label: '脉冲', hint: '假光会骗过撕咬 —— 用辐射脉冲把诱饵打散' }),
  reveal: Object.freeze({ label: '感知', hint: '它藏在暗处 —— 按住 X 扫描出真身，或按住 C 拟态引它过来' }),
});

export const ECHO_PHASE_LABELS = Object.freeze({
  stalk: '追踪猎物',
  charge: '蓄力预警',
  exposed: '共振暴露',
  recovery: '回填共振',
  pacified: '连接已切断',
});

export const ECHO_TIMING = Object.freeze({
  cycle: 12,
  chargeStart: 5,
  exposedStart: 7,
  recoveryStart: 9.4,
});

export function echoPhaseAt(time, seed = 0) {
  const cycle=((Number(time)||0)+(Number(seed)||0))%ECHO_TIMING.cycle;
  const normalized=cycle<0?cycle+ECHO_TIMING.cycle:cycle;
  if(normalized<ECHO_TIMING.chargeStart) {
    return { phase:'stalk', remaining:ECHO_TIMING.chargeStart-normalized };
  }
  if(normalized<ECHO_TIMING.exposedStart) {
    return { phase:'charge', remaining:ECHO_TIMING.exposedStart-normalized };
  }
  if(normalized<ECHO_TIMING.recoveryStart) {
    return { phase:'exposed', remaining:ECHO_TIMING.recoveryStart-normalized };
  }
  return { phase:'recovery', remaining:ECHO_TIMING.cycle-normalized };
}

export function echoVulnerability(phase) {
  if(phase==='exposed')return 1;
  if(phase==='recovery')return .38;
  if(phase==='stalk')return .16;
  return .06;
}

export function echoDiscoveryTotal(state) {
  return Math.max(0,Math.min(
    ABERRANT_ECHO_DEFS.length,
    state?.expedition?.echoEncounters?.length||0,
  ));
}
