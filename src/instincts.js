// 技能（本能）定义。技能只能由随机事件抵达 —— 玩家不能指定任何一条。
// 等级 0 表示尚未获得；脉冲是唯一从开局就存在的保底技能，保证玩家第一秒就能战斗。
//
// tiers[0] 为 null 表示"未拥有"，tiers[1]/tiers[2] 是两个阶的实际参数。
// 脉冲例外：tiers[0] 是保底的弱版本。

export const INSTINCTS = Object.freeze([
  Object.freeze({
    id: 'bite',
    name: '撕咬',
    key: 'bite',
    keyLabel: '鼠标左键',
    touchLabel: '撕咬',
    color: '#ff9d7a',
    hold: false,
    archetype: 'predation',
    source: '吞噬蟹与海龟的甲壳，或辐射出异化膜棘后整合出的咬合结构',
    summary: '朝向前方撕咬，单体重创。命中正在蓄力的异变回声体可打断它。',
    tiers: Object.freeze([
      null,
      Object.freeze({ windup: 0.32, arc: 70, range: 5, damageFactor: 2.4, cooldown: 1.1, cost: 6, refund: 0, interrupt: 1 }),
      Object.freeze({ windup: 0.22, arc: 78, range: 6.4, damageFactor: 3, cooldown: 0.9, cost: 5, refund: 10, interrupt: 1 }),
    ]),
  }),
  Object.freeze({
    id: 'jet',
    name: '喷射突进',
    key: 'jet',
    keyLabel: 'Z',
    touchLabel: '突进',
    color: '#7fe0c0',
    hold: false,
    archetype: 'predation',
    source: '吞噬鱿鱼与墨鱼的喷射腔，或辐射出增生推进器后形成的定向水压',
    summary: '向前方喷水推进，撞开沿途的生物。',
    tiers: Object.freeze([
      null,
      Object.freeze({ distance: 9, arc: 60, push: 3, damageFactor: 0.4, cooldown: 3.2, cost: 18 }),
      Object.freeze({ distance: 13, arc: 66, push: 4.2, damageFactor: 0.6, cooldown: 2.4, cost: 16 }),
    ]),
  }),
  Object.freeze({
    id: 'pulse',
    name: '辐射脉冲',
    key: 'pulse',
    keyLabel: 'Q',
    touchLabel: '脉冲',
    color: '#d5f779',
    hold: false,
    base: true,
    archetype: 'radiation',
    source: '体内辐射转化的色素结构；开局即有一圈弱辐射，任何细胞都能勉强放出',
    summary: '朝向前方释放定向辐射扇形，击退并致晕。',
    tiers: Object.freeze([
      Object.freeze({ radius: 10, arc: 130, damageFactor: 2.6, knockback: 0, stun: 0, cooldown: 5.2, cost: 28 }),
      Object.freeze({ radius: 16, arc: 130, damageFactor: 3.3, knockback: 2.5, stun: 1.1, cooldown: 4.6, cost: 28 }),
      Object.freeze({ radius: 20, arc: 180, damageFactor: 3.9, knockback: 3.2, stun: 1.4, cooldown: 3.8, cost: 26 }),
    ]),
  }),
  Object.freeze({
    id: 'mimic',
    name: '拟态',
    key: 'mimic',
    keyLabel: '按住 C',
    touchLabel: '拟态',
    color: '#8ad7ff',
    hold: true,
    archetype: 'symbiosis',
    source: '吞噬灯笼鱼与鮟鱇的感光器，或辐射出发光感知后学会收敛自身 luminescence',
    summary: '收敛移动与自身发光，让捕食者难以锁定你。骗得过眼睛，骗不过共振。',
    tiers: Object.freeze([
      null,
      Object.freeze({ stealth: 0.12, echoStealth: 0.5, speedFactor: 0.15 }),
      Object.freeze({ stealth: 0.06, echoStealth: 0.35, speedFactor: 0.15 }),
    ]),
  }),
  Object.freeze({
    id: 'sense',
    name: '感电扫描',
    key: 'sense',
    keyLabel: '按住 X',
    touchLabel: '扫描',
    color: '#c6f584',
    hold: true,
    archetype: 'symbiosis',
    source: '吞噬鳐鱼的感电器官',
    summary: '无需光线也能感知周围生物的轮廓、方位与可攻击目标。',
    tiers: Object.freeze([
      null,
      Object.freeze({ radius: 60, costPerSecond: 3 }),
      Object.freeze({ radius: 85, costPerSecond: 2.4 }),
    ]),
  }),
]);

export const INSTINCT_IDS = Object.freeze(INSTINCTS.map(instinct => instinct.id));

// 菌膜共生只会教给你共生型的能力；猎杀教给你捕食型的能力。
// 于是玩家这一局的构筑倾向会自然偏向对应的结局。
export const SYMBIOSIS_INSTINCTS = Object.freeze(['mimic', 'sense']);
export const PREDATION_INSTINCTS = Object.freeze(['bite', 'jet']);

export function instinctDefinition(id) {
  return INSTINCTS.find(instinct => instinct.id === id) || null;
}

export function initialInstincts() {
  return Object.fromEntries(INSTINCTS.map(instinct => [instinct.id, 0]));
}

export function instinctRank(player, id) {
  const rank = player?.instincts?.[id];
  return Number.isInteger(rank) ? rank : 0;
}

// 返回该技能在当前阶的实际参数；未获得时返回 null。
export function instinctTier(player, id) {
  const definition = instinctDefinition(id);
  if (!definition) return null;
  const tier = definition.tiers[instinctRank(player, id)];
  return tier || null;
}

// 脉冲从开局就可用（弱版本），其余技能必须靠随机抵达。
export function instinctAvailable(player, id) {
  const definition = instinctDefinition(id);
  if (!definition) return false;
  if (definition.base) return true;
  return instinctRank(player, id) > 0;
}

export function instinctCooldown(player, id) {
  const tier = instinctTier(player, id);
  return tier?.cooldown || 0;
}

export function instinctCost(player, id) {
  const tier = instinctTier(player, id);
  return tier?.cost || 0;
}

// 把一个阶数映射为可读名称，用于 HUD 与只读记录。
export function instinctRankLabel(player, id) {
  const rank = instinctRank(player, id);
  if (rank <= 0) return '未整合';
  return rank === 1 ? 'I' : 'II';
}
