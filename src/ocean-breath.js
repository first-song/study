// 海洋之息：玩家这一局的行为累积出来的生态账。
//
// 猎杀让海洋变窄，共生让海洋变宽。结局由它决定，而且**过程中的影响是即时的** ——
// 你每杀一条鱼，鱼群就离你远一点；每完成一次共生，海洋就更愿意靠近你。
// 说教感因此为零：玩家不会读到"请保护海洋"，只会看到"我变强了，海却空了"。

const WILDLIFE_TYPES = Object.freeze([
  'fish', 'jelly', 'shark', 'squid', 'whale', 'ray', 'turtle', 'angler', 'crab', 'lanternfish', 'cuttlefish', 'oarfish',
]);

// 初始种群。用来判断"你把某种生物打得几乎绝迹了"。
const INITIAL_POPULATION = Object.freeze({
  fish: 78, jelly: 14, shark: 6, squid: 6, whale: 3, ray: 7,
  turtle: 5, angler: 8, crab: 12, lanternfish: 24, cuttlefish: 7, oarfish: 4,
});

export const OCEAN_RULES = Object.freeze({
  symbiosisWeight: 10,
  killWeight: 2,
  speciesBonus: 25,
  thresholds: Object.freeze({ restored: 20, ruined: -20 }),
});

export const OCEAN_OUTCOME = Object.freeze({
  RESTORED: 'restored',
  ASH: 'ash',
  RUINED: 'ruined',
});

export const OCEAN_OUTCOMES = Object.freeze({
  restored: Object.freeze({
    id: 'restored', name: '共潮', tag: '你让它活了下来',
    line: '灰屿的灯火一盏盏熄灭，海水重新变回蓝色。',
    detail: '你带走了污染，也带走了它的一部分。你和这片海达成了某种谁也没说出口的默契。',
  }),
  ash: Object.freeze({
    id: 'ash', name: '灰烬', tag: '你赢了，但什么都没有改变',
    line: '岛沉进了深海，海水还是那个颜色。',
    detail: '你成了这片海最后的异变。留下的不是新生，是一片没人记得曾经干净过的灰烬。',
  }),
  ruined: Object.freeze({
    id: 'ruined', name: '深渊之宴', tag: '你吞下了整片海',
    line: '海水开始变黑。那是你。',
    detail: '你确实毁灭了排放源 —— 连同它周围所有的生命。胜利是真的，只是没有留下任何东西。',
  }),
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// 共生里程碑：菌膜、宿主、寄生中继都算"你选择和别的生命待在一起"。
export function symbiosisCount(expedition) {
  return (expedition?.biofilms?.length || 0)
    + (expedition?.hostAdaptations?.length || 0)
    + (expedition?.parasiteNodes?.length || 0);
}

// 还活着的物种比例。只作展示，不进账目 —— 种群会被别的捕食者改变，
// 账目只该记玩家自己做过的事。
export function livingSpeciesRatio(entities) {
  const living = new Set();
  for (const entity of entities || []) {
    if (entity.dead) continue;
    if (WILDLIFE_TYPES.includes(entity.type)) living.add(entity.type);
  }
  return living.size / WILDLIFE_TYPES.length;
}

// 被你打到几乎绝迹的物种数量。这比杀多少条鱼更致命。
export function huntedOutSpecies(killsBySpecies) {
  let count = 0;
  for (const [type, killed] of Object.entries(killsBySpecies || {})) {
    const initial = INITIAL_POPULATION[type];
    if (initial && killed >= initial * 0.6) count++;
  }
  return count;
}

export function oceanBalance(state) {
  const stats = state.stats || {};
  const expedition = state.expedition || {};
  const symbiosis = symbiosisCount(expedition);
  const preyKills = stats.preyKills || 0;
  const huntedOut = huntedOutSpecies(state.ecology?.killsBySpecies);
  const balance = symbiosis * OCEAN_RULES.symbiosisWeight
    - preyKills * OCEAN_RULES.killWeight
    - huntedOut * OCEAN_RULES.speciesBonus;
  return clamp(Math.round(balance), -100, 100);
}

// 归一化到 0..1：0 是死海，1 是还活着的海。渲染与 AI 都读这个值。
export function oceanHealth(state) {
  return (oceanBalance(state) + 100) / 200;
}

export function classifyOutcome(balance) {
  if (balance >= OCEAN_RULES.thresholds.restored) return OCEAN_OUTCOME.RESTORED;
  if (balance <= OCEAN_RULES.thresholds.ruined) return OCEAN_OUTCOME.RUINED;
  return OCEAN_OUTCOME.ASH;
}

export function outcomeFor(state) {
  return OCEAN_OUTCOMES[classifyOutcome(oceanBalance(state))];
}

// 生态崩坏度：0 是中立的海，1 是彻底死掉的海。
// 注意以"账目为零"为中立，而不是以"海很健康"为中立 —— 玩家开局不该被罚。
export function oceanDecay(state) {
  return clamp(-oceanBalance(state) / 100, 0, 1);
}

// 环境反馈系数。海洋越糟，捕食者越容易发现你，鱼群越不愿意靠近你。
// 账目为正时反过来：海越健康，它们越懒得理你。
export function detectionModifier(state) {
  return 1 + (-oceanBalance(state) / 100) * 0.6;
}

export function fearRadiusModifier(state) {
  return 1 + (-oceanBalance(state) / 100) * 0.8;
}

// 账目不只是结局分数，它是两种活法。
//   猎杀路线（负）：撕咬更狠，但伤口几乎不愈合 —— 你只能靠不断进食撑住。
//   共生路线（正）：伤害略低，但愈合极快，猎物也愿意让你靠近。
// 这样"你要成为什么"由行为自然长出来，而不是由菜单选择。
export function damageModifier(state) {
  const balance = oceanBalance(state);
  return balance <= 0 ? 1 + (-balance / 100) * 0.35 : 1 - (balance / 100) * 0.12;
}

export function regenModifier(state) {
  const balance = oceanBalance(state);
  return balance >= 0 ? 1 + (balance / 100) * 0.9 : 1 - (-balance / 100) * 0.45;
}
